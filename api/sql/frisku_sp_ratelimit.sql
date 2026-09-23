-- =============================================================================
-- frisku_sp_ratelimit.sql — Rate limiter distribuido EXCLUSIVO de Frisku SharePoint (S4.2)
-- Estado : NO APLICAR sin autorización. DDL puro; no toca datos de producción.
-- Ejecutar: SQL Editor (rol postgres/owner). Idempotente. Rollback al final (comentado).
-- =============================================================================
--
-- QUÉ ES: contador atómico de intentos por clave OPACA (HMAC), en dos capas
--   independientes (tipo 'ip' y tipo 'identidad'). Lo consume SOLO el backend Frisku
--   (api/_friskuSpRateLimiter.js) con SUPABASE_SERVICE_ROLE_KEY. Nunca accesible desde
--   navegador/anon/authenticated.
--
-- PRIVACIDAD: la tabla NUNCA recibe email, PIN, hash ni IP en claro. La clave `bucket`
--   es un HMAC-SHA256 calculado en el backend con un secreto exclusivo
--   (FRISKU_SP_RATELIMIT_SECRET). Aquí solo se guardan: bucket (HMAC), tipo, contador,
--   inicio de ventana, bloqueo_hasta y un timestamp técnico. Sin PII de ningún tipo.
--
-- QUÉ ESCRIBE CADA INTENTO (frisku_sp_rl_consumir): upsert de UNA fila por bucket con
--   contador incrementado (o reiniciado si expiró la ventana) y, si supera el máximo,
--   bloqueo_hasta = now()+bloqueo. No escribe nada más. No hay PII. No hay logs.
--
-- SECURITY DEFINER — POR QUÉ: la tabla tiene RLS habilitado SIN políticas, de modo que
--   anon/authenticated no pueden leer ni escribir. La RPC corre como owner (que sí puede)
--   para que la ÚNICA ruta de escritura sea este código auditado, invocado solo por
--   service_role. SET search_path fijo previene search_path injection.
-- =============================================================================

-- ── Tabla dedicada (nombre exclusivo frisku_sp_*) ──
CREATE TABLE IF NOT EXISTS public.frisku_sp_ratelimit (
  bucket          text PRIMARY KEY,                       -- HMAC opaco (tipo+valor); sin PII
  tipo            text NOT NULL CHECK (tipo IN ('ip','identidad')),
  contador        integer NOT NULL DEFAULT 0,
  ventana_inicio  timestamptz NOT NULL DEFAULT now(),
  bloqueo_hasta   timestamptz,                            -- NULL = sin bloqueo
  actualizado     timestamptz NOT NULL DEFAULT now()
);

-- Índice mínimo para la limpieza por antigüedad (además del PK).
CREATE INDEX IF NOT EXISTS ix_frisku_sp_ratelimit_actualizado
  ON public.frisku_sp_ratelimit (actualizado);

-- RLS habilitado SIN políticas → anon/authenticated no obtienen filas; service_role bypassa RLS.
ALTER TABLE public.frisku_sp_ratelimit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frisku_sp_ratelimit FORCE ROW LEVEL SECURITY;

-- Revocar acceso directo a la tabla (Supabase concede por default a anon/authenticated).
REVOKE ALL ON TABLE public.frisku_sp_ratelimit FROM PUBLIC;
REVOKE ALL ON TABLE public.frisku_sp_ratelimit FROM anon;
REVOKE ALL ON TABLE public.frisku_sp_ratelimit FROM authenticated;

-- ── RPC atómica: consumir un intento ──
-- Devuelve JSONB { permitido:boolean, retry_after_seg:integer }.
-- Atomicidad: INSERT ON CONFLICT DO NOTHING + SELECT ... FOR UPDATE serializa concurrentes
-- sobre el MISMO bucket; toda la función corre en una transacción implícita.
CREATE OR REPLACE FUNCTION public.frisku_sp_rl_consumir(
  p_bucket       text,
  p_tipo         text,
  p_ventana_seg  integer,
  p_max          integer,
  p_bloqueo_seg  integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now     timestamptz := now();
  v_row     public.frisku_sp_ratelimit%ROWTYPE;
  v_count   integer;
  v_inicio  timestamptz;
  v_block   timestamptz;
BEGIN
  IF p_bucket IS NULL OR length(p_bucket) = 0 OR p_tipo NOT IN ('ip','identidad')
     OR p_ventana_seg IS NULL OR p_ventana_seg <= 0 OR p_max IS NULL OR p_max <= 0
     OR p_bloqueo_seg IS NULL OR p_bloqueo_seg < 0 THEN
    RAISE EXCEPTION 'frisku_sp_rl_consumir: parametros invalidos' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.frisku_sp_ratelimit (bucket, tipo, contador, ventana_inicio, actualizado)
    VALUES (p_bucket, p_tipo, 0, v_now, v_now)
    ON CONFLICT (bucket) DO NOTHING;
  SELECT * INTO v_row FROM public.frisku_sp_ratelimit WHERE bucket = p_bucket FOR UPDATE;

  -- Ya bloqueado y vigente → denegar sin incrementar (no extiende el castigo).
  IF v_row.bloqueo_hasta IS NOT NULL AND v_row.bloqueo_hasta > v_now THEN
    RETURN jsonb_build_object('permitido', false,
      'retry_after_seg', ceil(extract(epoch FROM (v_row.bloqueo_hasta - v_now)))::int);
  END IF;

  -- Ventana expirada → reinicia; si no, incrementa.
  IF v_row.ventana_inicio < v_now - make_interval(secs => p_ventana_seg) THEN
    v_count := 1; v_inicio := v_now; v_block := NULL;
  ELSE
    v_count := v_row.contador + 1; v_inicio := v_row.ventana_inicio; v_block := v_row.bloqueo_hasta;
  END IF;

  IF v_count > p_max THEN
    v_block := v_now + make_interval(secs => p_bloqueo_seg);
  END IF;

  UPDATE public.frisku_sp_ratelimit
     SET contador = v_count, ventana_inicio = v_inicio, bloqueo_hasta = v_block,
         tipo = p_tipo, actualizado = v_now
   WHERE bucket = p_bucket;

  IF v_block IS NOT NULL AND v_block > v_now THEN
    RETURN jsonb_build_object('permitido', false,
      'retry_after_seg', ceil(extract(epoch FROM (v_block - v_now)))::int);
  END IF;
  RETURN jsonb_build_object('permitido', true, 'retry_after_seg', 0);
END;
$$;

-- ── RPC de limpieza (retención acotada) ── borra filas inactivas más antiguas que el retén.
CREATE OR REPLACE FUNCTION public.frisku_sp_rl_limpiar(p_retener_seg integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  IF p_retener_seg IS NULL OR p_retener_seg <= 0 THEN
    RAISE EXCEPTION 'frisku_sp_rl_limpiar: retencion invalida' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.frisku_sp_ratelimit
   WHERE actualizado < now() - make_interval(secs => p_retener_seg)
     AND (bloqueo_hasta IS NULL OR bloqueo_hasta < now());
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- ── Permisos de las funciones: solo service_role ──
-- (Supabase auto-concede EXECUTE a anon/authenticated en funciones nuevas vía
--  ALTER DEFAULT PRIVILEGES → hay que revocarlo explícitamente, no basta FROM PUBLIC.)
REVOKE ALL ON FUNCTION public.frisku_sp_rl_consumir(text,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.frisku_sp_rl_limpiar(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.frisku_sp_rl_consumir(text,text,integer,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.frisku_sp_rl_limpiar(integer) TO service_role;

-- ── Verificación POST (read-only; aborta si anon/authenticated conservan EXECUTE) ──
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('frisku_sp_rl_consumir','frisku_sp_rl_limpiar')
    AND grantee IN ('anon','authenticated','PUBLIC')
    AND privilege_type = 'EXECUTE';
  IF n <> 0 THEN
    RAISE EXCEPTION 'frisku_sp_ratelimit: anon/authenticated/PUBLIC aún tienen EXECUTE en % rutina(s).', n;
  END IF;
  RAISE NOTICE 'frisku_sp_ratelimit OK: RPC solo service_role; tabla con RLS sin políticas.';
END $$;

-- =============================================================================
-- ROLLBACK (ejecutar manualmente si se decide revertir):
--   DROP FUNCTION IF EXISTS public.frisku_sp_rl_consumir(text,text,integer,integer,integer);
--   DROP FUNCTION IF EXISTS public.frisku_sp_rl_limpiar(integer);
--   DROP TABLE    IF EXISTS public.frisku_sp_ratelimit;
-- (No hay datos de negocio en la tabla: solo contadores efímeros de rate limit.)
-- =============================================================================

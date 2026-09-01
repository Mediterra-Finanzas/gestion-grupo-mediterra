-- ============================================================================
-- 10_ms_g1_correlativo_temporada_enforce.sql
-- GAP-1 (C, blocker) — el correlativo deja de aceptar temporada "libre".
--
-- QUÉ HACE (aditivo, reversible):
--   Reemplaza proc_fn_siguiente_correlativo para que RECHACE:
--     · p_temporada NULL / vacía / solo-espacios
--     · el sentinela 's-t' (case-insensitive) y variantes vacías del short-code
--     · cualquier código que NO exista como proc_temporada del MISMO empresa en
--       estado 'activa' o 'planificada' y no borrada (deleted_at IS NULL)
--   Antes de reservar el número valida contra el catálogo (autoridad = proc_temporada).
--   El folio y el contador siguen siendo por (empresa, temporada, tipo): sin cambios de forma.
--
-- POR QUÉ: hoy `proc_fn_siguiente_correlativo(emp,'s-t','ORD')` emite `ORD--000001`,
--   folio SIN temporada y contador COMPARTIDO entre temporadas → pierde trazabilidad.
--   El frontend (6 paths) pasa `temporada || 's-t'`. El fix del backend cierra la puerta
--   aunque el frontend todavía mande 's-t' (defensa en profundidad); el fix del frontend
--   va aparte (ver docs/temporadas-v2-frontend-plan.md, lo aplica el integrador).
--
-- NO altera: proc_correlativo (tabla), ledger, genealogía, ninguna otra función.
-- Idempotente: CREATE OR REPLACE. Reejecutable.
--
-- ⚠ NO EJECUTAR EN ESTA SESIÓN. Draft para revisión del integrador.
-- ============================================================================

BEGIN;

-- ── PREFLIGHT (fingerprint STAGING, fail-closed; ver 00_preflight_guard.sql) ──
DO $guard$
DECLARE
  v_als_id CONSTANT uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_baseline_ok boolean; v_calendario_ok boolean; v_als_ok boolean;
BEGIN
  v_baseline_ok := to_regclass('public.proc_temporada') IS NOT NULL
    AND to_regclass('public.proc_correlativo') IS NOT NULL
    AND to_regclass('public.proc_movimiento') IS NOT NULL;
  IF NOT v_baseline_ok THEN RAISE EXCEPTION 'GUARD ABORT: baseline proc_* incompleto.'; END IF;
  v_calendario_ok := (to_regclass('public.calendario_data') IS NOT NULL);
  IF v_calendario_ok THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.calendario_data WHERE id=''main'')' INTO v_calendario_ok; END IF;
  IF NOT v_calendario_ok THEN RAISE EXCEPTION 'GUARD ABORT: falta calendario_data.main.'; END IF;
  IF to_regclass('public.contab_empresas') IS NULL THEN RAISE EXCEPTION 'GUARD ABORT: sin contab_empresas.'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.contab_empresas WHERE id=%L AND codigo=%L)', v_als_id, 'ALS') INTO v_als_ok;
  IF NOT v_als_ok THEN RAISE EXCEPTION 'GUARD ABORT: tenant ALS % ausente (posible PRODUCCIÓN).', v_als_id; END IF;
  RAISE NOTICE 'GUARD OK (MS-G1): destino STAGING compatible.';
END $guard$;

-- ── MIGRACIÓN ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_siguiente_correlativo(
  p_empresa uuid, p_temporada text, p_tipo text, p_prefijo text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE v_n int; v_pref text; v_short text; v_temp text;
BEGIN
  IF p_empresa IS NULL OR p_tipo IS NULL THEN
    RAISE EXCEPTION 'correlativo exige empresa y tipo';
  END IF;

  -- Normaliza y rechaza temporada no-autoritativa (GAP-1).
  v_temp := btrim(COALESCE(p_temporada, ''));
  IF v_temp = '' OR lower(v_temp) = 's-t' THEN
    RAISE EXCEPTION 'correlativo: temporada obligatoria y no puede ser vacía ni ''s-t'' (empresa=%, tipo=%). Derivá la temporada del catálogo antes de emitir el folio.', p_empresa, p_tipo;
  END IF;

  -- Autoridad = catálogo proc_temporada del MISMO empresa, en estado que admite operar.
  IF NOT EXISTS (
    SELECT 1 FROM proc_temporada
    WHERE empresa_id = p_empresa
      AND codigo = v_temp
      AND estado IN ('activa','planificada')
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'correlativo: temporada % no existe como proc_temporada activa/planificada del empresa % (o está cerrada/anulada/borrada). No se emite folio.', v_temp, p_empresa;
  END IF;

  INSERT INTO proc_correlativo(empresa_id, temporada_codigo, tipo_documento, prefijo, ultimo)
    VALUES (p_empresa, v_temp, p_tipo, COALESCE(NULLIF(p_prefijo,''), p_tipo), 1)
  ON CONFLICT (empresa_id, temporada_codigo, tipo_documento)
    DO UPDATE SET ultimo = proc_correlativo.ultimo + 1, updated_at = now()
  RETURNING ultimo, prefijo INTO v_n, v_pref;

  -- temporada compacta: "2026/2027" -> "2627"; "2526" -> "2526"
  v_short := regexp_replace(v_temp, '[^0-9]', '', 'g');
  IF length(v_short) = 8 THEN v_short := substr(v_short,3,2) || substr(v_short,7,2); END IF;
  -- Con la validación previa v_short nunca es vacío para una temporada real; guarda extra:
  IF v_short = '' THEN
    RAISE EXCEPTION 'correlativo: temporada % sin componente numérico para el short-code.', v_temp;
  END IF;
  RETURN v_pref || '-' || v_short || '-' || lpad(v_n::text, 6, '0');
END $fn$;

-- ── POST-CHECK (dentro de la misma tx; aborta si algo no cuadra) ─────────────
DO $post$
DECLARE v_emp uuid; v_ok boolean; v_msg text;
BEGIN
  -- La función existe con la firma esperada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE p.proname='proc_fn_siguiente_correlativo' AND n.nspname='public'
  ) THEN RAISE EXCEPTION 'POST-CHECK FAIL: función ausente tras reemplazo.'; END IF;

  -- 's-t' debe fallar ahora (probamos contra el tenant ALS de STAGING).
  v_emp := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  BEGIN
    PERFORM proc_fn_siguiente_correlativo(v_emp, 's-t', 'ORD');
    RAISE EXCEPTION 'POST-CHECK FAIL: ''s-t'' fue aceptada; la validación no está activa.';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'POST-CHECK FAIL%' THEN RAISE; END IF;
    -- cualquier otra excepción = rechazo esperado. OK.
  END;

  -- vacío/NULL también debe fallar.
  BEGIN
    PERFORM proc_fn_siguiente_correlativo(v_emp, '', 'ORD');
    RAISE EXCEPTION 'POST-CHECK FAIL: temporada vacía fue aceptada.';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg LIKE 'POST-CHECK FAIL%' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'POST-CHECK OK (MS-G1): correlativo rechaza s-t/vacío. (No se consumió ningún número de temporada real.)';
END $post$;

COMMIT;

-- ============================================================================
-- ROLLBACK EXACTO (restaura la función previa — v7 f7_1, verbatim):
--   Ejecutar el bloque siguiente dentro de una transacción para revertir.
-- ----------------------------------------------------------------------------
-- BEGIN;
-- CREATE OR REPLACE FUNCTION proc_fn_siguiente_correlativo(
--   p_empresa uuid, p_temporada text, p_tipo text, p_prefijo text DEFAULT NULL
-- ) RETURNS text LANGUAGE plpgsql AS $$
-- DECLARE v_n int; v_pref text; v_short text;
-- BEGIN
--   IF p_empresa IS NULL OR p_temporada IS NULL OR p_tipo IS NULL THEN
--     RAISE EXCEPTION 'correlativo exige empresa, temporada y tipo';
--   END IF;
--   INSERT INTO proc_correlativo(empresa_id, temporada_codigo, tipo_documento, prefijo, ultimo)
--     VALUES (p_empresa, p_temporada, p_tipo, COALESCE(NULLIF(p_prefijo,''), p_tipo), 1)
--   ON CONFLICT (empresa_id, temporada_codigo, tipo_documento)
--     DO UPDATE SET ultimo = proc_correlativo.ultimo + 1, updated_at = now()
--   RETURNING ultimo, prefijo INTO v_n, v_pref;
--   v_short := regexp_replace(p_temporada, '[^0-9]', '', 'g');
--   IF length(v_short) = 8 THEN v_short := substr(v_short,3,2) || substr(v_short,7,2); END IF;
--   RETURN v_pref || '-' || v_short || '-' || lpad(v_n::text, 6, '0');
-- END $$;
-- COMMIT;
-- ============================================================================
-- NOTA DE REHEARSAL (Docker local, NO staging/prod):
--   1) docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:15
--   2) Cargar el baseline: schema_core_identity_v1 + schema_proc_v1..v7_f7_1.
--      Sembrar el tenant ALS con el UUID 5aa10886-... y codigo 'ALS' + una fila
--      calendario_data(id='main') para que el guard pase; insertar una proc_temporada
--      activa (ej. codigo '2526', estado 'activa') para ese empresa.
--   3) Ejecutar este script. Esperado: GUARD OK + POST-CHECK OK, COMMIT.
--   4) Verificar manualmente:
--        SELECT proc_fn_siguiente_correlativo('5aa10886-...','2526','ORD');  -- → 'ORD-2526-000001'
--        SELECT proc_fn_siguiente_correlativo('5aa10886-...','s-t','ORD');   -- → EXCEPTION
--        SELECT proc_fn_siguiente_correlativo('5aa10886-...','9999','ORD');  -- → EXCEPTION (no catálogo)
--   5) Revertir con el bloque ROLLBACK y confirmar que 's-t' vuelve a emitir 'ORD--000001'.
-- ============================================================================

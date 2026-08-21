-- ============================================================================
-- proc_auth_throttle.sql — Rate-limit / lockout atómico para /api/proc-token (Option C).
-- Serverless-safe: el estado vive en Postgres (autoritativo), no en memoria de la instancia Vercel.
-- DISEÑO/LOCAL — NO aplicar en remoto sin autorización. deny-browser (solo service_role escribe).
-- ============================================================================
CREATE TABLE IF NOT EXISTS proc_auth_throttle (
  bucket_key   text PRIMARY KEY,           -- p.ej. lower(email)|ip  (nunca el PIN)
  intentos     int  NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
ALTER TABLE proc_auth_throttle ENABLE ROW LEVEL SECURITY;
ALTER TABLE proc_auth_throttle FORCE ROW LEVEL SECURITY;
REVOKE ALL ON proc_auth_throttle FROM anon, authenticated;

-- Registra un intento y devuelve TRUE si se permite continuar, FALSE si está bloqueado.
-- Atómico (una fila, UPSERT + lógica en una llamada). Ventana e intentos configurables.
CREATE OR REPLACE FUNCTION proc_fn_auth_attempt(
  p_key text, p_max int DEFAULT 5, p_window_secs int DEFAULT 300, p_lock_secs int DEFAULT 900
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r proc_auth_throttle%ROWTYPE; v_now timestamptz := clock_timestamp();
BEGIN
  INSERT INTO proc_auth_throttle(bucket_key, intentos, window_start)
    VALUES (p_key, 0, v_now)
    ON CONFLICT (bucket_key) DO NOTHING;
  SELECT * INTO r FROM proc_auth_throttle WHERE bucket_key = p_key FOR UPDATE;

  IF r.locked_until IS NOT NULL AND r.locked_until > v_now THEN
    RETURN false;                                   -- en lockout
  END IF;
  IF v_now - r.window_start > make_interval(secs => p_window_secs) THEN
    UPDATE proc_auth_throttle SET intentos = 1, window_start = v_now, locked_until = NULL
      WHERE bucket_key = p_key;                      -- ventana nueva
    RETURN true;
  END IF;
  IF r.intentos + 1 >= p_max THEN
    UPDATE proc_auth_throttle SET intentos = r.intentos + 1,
           locked_until = v_now + make_interval(secs => p_lock_secs)
      WHERE bucket_key = p_key;                      -- alcanza el máximo → lock
    RETURN false;
  END IF;
  UPDATE proc_auth_throttle SET intentos = r.intentos + 1 WHERE bucket_key = p_key;
  RETURN true;
END $$;

-- Éxito de login → resetear el bucket (no penalizar sesiones válidas).
CREATE OR REPLACE FUNCTION proc_fn_auth_reset(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM proc_auth_throttle WHERE bucket_key = p_key
$$;

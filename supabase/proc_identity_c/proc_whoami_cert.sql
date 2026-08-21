-- proc_whoami_cert.sql — capability READ-ONLY, STAGING-ONLY, eliminable. Certificación R3 (evidencia
-- positiva de que la request opera como authenticated con identidad/tenant IAM). Borrar tras certificar.
CREATE OR REPLACE FUNCTION proc_whoami() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'req_role',   current_setting('role', true),                                   -- authenticated
    'sub',        current_setting('request.jwt.claims', true)::jsonb->>'sub',       -- auth.users.id
    'hdr_empresa',(current_setting('request.headers', true)::jsonb)->>'x-proc-empresa',
    'iam_user',   proc_current_iam_user(),                                          -- actor IAM
    'empresa',    proc_current_empresa()                                            -- tenant autorizado
  )
$$;
GRANT EXECUTE ON FUNCTION proc_whoami() TO anon, authenticated;

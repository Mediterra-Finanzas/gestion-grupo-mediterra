-- ============================================================================
-- R5-CLEANUP_drop_whoami.sql — Elimina la capability de certificación proc_whoami().
-- proc_whoami() (proc_whoami_cert.sql) se desplegó READ-ONLY, STAGING-ONLY, SOLO para
-- certificar el Identity Bridge de Kong (evidencia positiva de req_role=authenticated +
-- sub + hdr_empresa + iam_user + empresa). Cumplido R3-S5 su razón de ser terminó → DROP.
--
-- Es SECURITY DEFINER con GRANT EXECUTE a anon+authenticated. Aunque solo devuelve contexto
-- (no datos de tenant), toda superficie SECURITY DEFINER innecesaria debe retirarse antes de
-- prod. NO deja dependencias (no la referencia ningún RPC/vista/policy).
--
-- TARGET: staging nlvfjpwiecgrosjnwwik. Producción HANDS-OFF (allí nunca se desplegó).
-- Correr al cierre de R5 (después de certificar R4). Idempotente.
-- NOTA: sin `\set ON_ERROR_STOP` (meta-comando psql NO soportado por el SQL Editor de Supabase).
-- La atomicidad la da BEGIN..COMMIT + el DO con RAISE: si algo falla no llega al COMMIT y revierte.
-- ============================================================================
BEGIN;
DO $c$
DECLARE v_pre int; v_post int; v_deps int;
BEGIN
  v_pre := (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='proc_whoami');
  IF v_pre=0 THEN RAISE NOTICE 'R5-CLEANUP: proc_whoami() ya no existe (no-op).'; RETURN; END IF;

  -- Seguridad: confirmar que nada depende de proc_whoami (no debería, es solo de certificación).
  SELECT count(*) INTO v_deps FROM pg_depend d
    JOIN pg_proc p ON p.oid=d.refobjid
    JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='proc_whoami' AND d.deptype='n';
  IF v_deps>0 THEN RAISE EXCEPTION 'R5-CLEANUP ABORT: proc_whoami tiene % dependencias — revisar antes de DROP.', v_deps; END IF;

  DROP FUNCTION IF EXISTS public.proc_whoami();

  v_post := (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='proc_whoami');
  IF v_post<>0 THEN RAISE EXCEPTION 'R5-CLEANUP POST: proc_whoami() sigue existiendo.'; END IF;
  RAISE NOTICE 'R5-CLEANUP OK: proc_whoami() eliminada (capability de certificación retirada).';
END $c$;
COMMIT;

-- ============================================================================
-- R3-S5-P3B_repair_binding.sql — IAM-R3 micro-gate S5-P3B: reparar binding de Angelo.
-- Problema (evidencia real staging): iam_usuario(ahuerta@grupomediterra.cl).auth_user_id
-- = 207b6125-34ac-4396-a330-e8ecfdb0038c, que en auth.users pertenece al usuario SINTÉTICO
-- Osiris a3-otro-tenant@osiris-sintetico.invalid → el endpoint devuelve binding_conflicto
-- (correcto). Existe exactamente 1 auth.users con email ahuerta (UUID distinto). Este gate
-- reapunta EXCLUSIVAMENTE ese auth_user_id al auth.users real de ahuerta, resuelto POR EMAIL
-- server-side (sin hardcodear el UUID destino). TARGET: gestion-mediterra-staging. Producción
-- bywovqayuzodbzwsriet = HANDS-OFF.
--
-- ALCANCE: UN UPDATE sobre UNA fila de public.iam_usuario (la de Angelo). NADA MÁS.
-- NO toca auth.users. NO toca al usuario sintético Osiris. NO DELETE. NO CASCADE. NO DDL.
-- NO RLS/grants. NO memberships. NO proc_*/calendario_data.
--
-- BLINDAJE: UNA transacción + UN bloque DO atómico (snapshot en variables locales + preflight
-- fail-closed + UPDATE con affected_rows=1 exigido + POST-check). Se hace TODO en un solo DO para
-- ser inmune a la mecánica del SQL Editor (sin TEMP TABLE). Cualquier condición → RAISE → la
-- transacción aborta → ROLLBACK → HARD STOP. Idempotente: si el binding ya no es el viejo, ABORTA.
--
-- ROLLBACK EXACTO (restaura SOLO a Angelo al binding viejo, con guard inverso):
--   BEGIN;
--   DO $r$ DECLARE n int; v_new uuid; BEGIN
--     SELECT id INTO v_new FROM auth.users WHERE lower(btrim(email))='ahuerta@grupomediterra.cl';
--     UPDATE iam_usuario SET auth_user_id='207b6125-34ac-4396-a330-e8ecfdb0038c'
--      WHERE lower(btrim(email))='ahuerta@grupomediterra.cl' AND auth_user_id=v_new AND activo=true;
--     GET DIAGNOSTICS n = ROW_COUNT;
--     IF n<>1 THEN RAISE EXCEPTION 'rollback afectó % (esperado 1)', n; END IF;
--   END $r$;
--   COMMIT;
-- ============================================================================
BEGIN;

DO $g$
DECLARE
  c_als    constant uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  c_old    constant uuid := '207b6125-34ac-4396-a330-e8ecfdb0038c';
  c_osiris constant text := 'a3-otro-tenant@osiris-sintetico.invalid';
  c_ang    constant text := 'ahuerta@grupomediterra.cl';
  -- snapshot (para probar 0 filas creadas/borradas + ningún otro binding/auth cambió)
  s_cd int; s_au int; s_iu int; s_iue int; s_others text; s_auth text;
  -- preflight
  v_proc int; v_bgrant int; v_thr boolean; v_iam boolean; v_als int;
  v_ang_cnt int; v_ang_id uuid; v_ang_bind uuid; v_ang_activo boolean;
  v_old_cnt int; v_old_email text; v_new_cnt int; v_new_id uuid; v_dest_used int;
  v_mem int; v_carol int; v_ang_mem int; n int;
  -- postcheck
  v_bind uuid; v_join_email text; v_uses_old int; v_uses_new int;
  v_rls_iu boolean; v_force_iu boolean; v_rls_iue boolean; v_force_iue boolean; v_browser int;
BEGIN
  -- ── SNAPSHOT ────────────────────────────────────────────────────────────
  SELECT count(*) INTO s_cd  FROM calendario_data;
  SELECT count(*) INTO s_au  FROM auth.users;
  SELECT count(*) INTO s_iu  FROM iam_usuario;
  SELECT count(*) INTO s_iue FROM iam_usuario_empresa;
  SELECT md5(coalesce(string_agg(id::text||':'||coalesce(auth_user_id::text,'null'), ',' ORDER BY id),''))
    INTO s_others FROM iam_usuario WHERE lower(btrim(email))<>c_ang;
  SELECT md5(coalesce(string_agg(id::text||'='||email, ',' ORDER BY id),'')) INTO s_auth FROM auth.users;

  -- ── PREFLIGHT (fail-closed): staging post-S3 + estado exacto de Angelo ────
  v_proc   := (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%');
  v_bgrant := (SELECT count(*) FROM information_schema.role_table_grants
                 WHERE table_schema='public' AND table_name LIKE 'proc_%' AND grantee='anon');
  v_thr    := to_regclass('public.proc_auth_throttle') IS NOT NULL;
  v_iam    := to_regclass('public.iam_usuario') IS NOT NULL AND to_regclass('public.iam_usuario_empresa') IS NOT NULL;
  v_als    := (SELECT count(*) FROM contab_empresas WHERE id=c_als AND codigo='ALS');
  IF v_proc<30 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): proc_*=% (<30). Target NO es staging. HARD STOP.', v_proc; END IF;
  IF v_bgrant<1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): bridge DEV_ONLY ausente. HARD STOP.'; END IF;
  IF NOT v_thr THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): throttle S3 ausente. Correr S3 primero. HARD STOP.'; END IF;
  IF NOT v_iam THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): iam_* ausente. HARD STOP.'; END IF;
  IF v_als<>1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): ALS no exacto (%). HARD STOP.', v_als; END IF;
  IF to_regclass('auth.users') IS NULL THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): auth.users ausente. HARD STOP.'; END IF;

  SELECT count(*) INTO v_ang_cnt FROM iam_usuario WHERE lower(btrim(email))=c_ang;
  IF v_ang_cnt<>1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): iam Angelo cnt=% (esperado 1). HARD STOP.', v_ang_cnt; END IF;
  SELECT id, auth_user_id, activo INTO v_ang_id, v_ang_bind, v_ang_activo
    FROM iam_usuario WHERE lower(btrim(email))=c_ang;
  IF NOT v_ang_activo THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): iam Angelo activo=false. HARD STOP.'; END IF;
  IF v_ang_bind IS DISTINCT FROM c_old THEN
     RAISE EXCEPTION 'P3B ABORT (ROLLBACK): binding actual=% (esperado %). Estado NO es el diagnosticado. HARD STOP.', v_ang_bind, c_old; END IF;

  SELECT count(*), max(email) INTO v_old_cnt, v_old_email FROM auth.users WHERE id=c_old;
  IF v_old_cnt<>1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): OLD en auth.users cnt=% (esperado 1). HARD STOP.', v_old_cnt; END IF;
  IF lower(btrim(v_old_email))<>c_osiris THEN
     RAISE EXCEPTION 'P3B ABORT (ROLLBACK): OLD email=% (esperado sintético %). HARD STOP.', v_old_email, c_osiris; END IF;

  SELECT count(*) INTO v_new_cnt FROM auth.users WHERE lower(btrim(email))=c_ang;
  IF v_new_cnt<>1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): auth.users email ahuerta cnt=% (esperado 1). HARD STOP.', v_new_cnt; END IF;
  SELECT id INTO v_new_id FROM auth.users WHERE lower(btrim(email))=c_ang;    -- destino resuelto POR EMAIL
  IF v_new_id = c_old THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): destino == OLD. HARD STOP.'; END IF;

  SELECT count(*) INTO v_dest_used FROM iam_usuario WHERE auth_user_id=v_new_id;
  IF v_dest_used<>0 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): destino ya usado por % iam_usuario. HARD STOP.', v_dest_used; END IF;

  v_mem     := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=c_als);
  v_carol   := (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
                  WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  v_ang_mem := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=c_als AND usuario_id=v_ang_id);
  IF v_mem<>6 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): memberships ALS=% (esperado 6). HARD STOP.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): Carol=% (esperado 0). HARD STOP.', v_carol; END IF;
  IF v_ang_mem<1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): Angelo sin membership ALS. HARD STOP.'; END IF;

  RAISE NOTICE 'P3B preflight OK: Angelo % binding %=Osiris → reapuntar a auth.users(ahuerta)=%.', v_ang_id, c_old, v_new_id;

  -- ── UPDATE ACOTADO (doble guard: email exacto + binding viejo exacto; affected_rows=1) ──
  UPDATE iam_usuario
     SET auth_user_id = v_new_id
   WHERE lower(btrim(email)) = c_ang
     AND auth_user_id = c_old
     AND activo = true;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'P3B ABORT (ROLLBACK): UPDATE afectó % filas (esperado 1). HARD STOP.', n; END IF;
  RAISE NOTICE 'P3B UPDATE OK: 1 fila (Angelo) rebindeada a %.', v_new_id;

  -- ── POST-CHECK (fail-closed) ─────────────────────────────────────────────
  SELECT auth_user_id INTO v_bind FROM iam_usuario WHERE lower(btrim(email))=c_ang;
  SELECT u.email INTO v_join_email FROM iam_usuario i JOIN auth.users u ON u.id=i.auth_user_id
    WHERE lower(btrim(i.email))=c_ang;
  IF v_bind IS DISTINCT FROM v_new_id THEN RAISE EXCEPTION 'P3B POST FAIL: binding=% != ahuerta auth id %. ABORT.', v_bind, v_new_id; END IF;
  IF lower(btrim(v_join_email))<>c_ang THEN RAISE EXCEPTION 'P3B POST FAIL: JOIN iam↔auth da email % (esperado ahuerta). ABORT.', v_join_email; END IF;
  IF v_bind = c_old THEN RAISE EXCEPTION 'P3B POST FAIL: binding sigue en OLD. ABORT.'; END IF;

  SELECT count(*), max(email) INTO v_old_cnt, v_old_email FROM auth.users WHERE id=c_old;
  IF v_old_cnt<>1 OR lower(btrim(v_old_email))<>c_osiris THEN
     RAISE EXCEPTION 'P3B POST FAIL: usuario sintético Osiris alterado (cnt=%, email=%). ABORT.', v_old_cnt, v_old_email; END IF;

  SELECT count(*) INTO v_uses_old FROM iam_usuario WHERE auth_user_id=c_old;
  SELECT count(*) INTO v_uses_new FROM iam_usuario WHERE auth_user_id=v_new_id;
  IF v_uses_old<>0 THEN RAISE EXCEPTION 'P3B POST FAIL: % iam aún usan OLD (esperado 0). ABORT.', v_uses_old; END IF;
  IF v_uses_new<>1 THEN RAISE EXCEPTION 'P3B POST FAIL: % iam usan destino (esperado 1). ABORT.', v_uses_new; END IF;

  v_mem   := (SELECT count(*) FROM iam_usuario_empresa WHERE activo AND empresa_id=c_als);
  v_carol := (SELECT count(*) FROM iam_usuario_empresa m JOIN iam_usuario u ON u.id=m.usuario_id
                WHERE lower(btrim(u.email))='cmachuca@grupomediterra.cl' AND m.activo);
  IF v_mem<>6 THEN RAISE EXCEPTION 'P3B POST FAIL: memberships ALS=% (esperado 6). ABORT.', v_mem; END IF;
  IF v_carol<>0 THEN RAISE EXCEPTION 'P3B POST FAIL: Carol=% (esperado 0). ABORT.', v_carol; END IF;

  -- 0 filas creadas/borradas; ningún otro binding cambió; auth.users sin cambios
  IF (SELECT count(*) FROM calendario_data)<>s_cd THEN RAISE EXCEPTION 'P3B POST FAIL: calendario_data filas cambiaron. ABORT.'; END IF;
  IF (SELECT count(*) FROM auth.users)<>s_au THEN RAISE EXCEPTION 'P3B POST FAIL: auth.users filas cambiaron. ABORT.'; END IF;
  IF (SELECT count(*) FROM iam_usuario)<>s_iu THEN RAISE EXCEPTION 'P3B POST FAIL: iam_usuario filas cambiaron. ABORT.'; END IF;
  IF (SELECT count(*) FROM iam_usuario_empresa)<>s_iue THEN RAISE EXCEPTION 'P3B POST FAIL: iam_usuario_empresa filas cambiaron. ABORT.'; END IF;
  IF (SELECT md5(coalesce(string_agg(id::text||'='||email, ',' ORDER BY id),'')) FROM auth.users)<>s_auth THEN
     RAISE EXCEPTION 'P3B POST FAIL: auth.users mutó (hash). ABORT.'; END IF;
  IF (SELECT md5(coalesce(string_agg(id::text||':'||coalesce(auth_user_id::text,'null'), ',' ORDER BY id),''))
        FROM iam_usuario WHERE lower(btrim(email))<>c_ang)<>s_others THEN
     RAISE EXCEPTION 'P3B POST FAIL: otro iam_usuario binding cambió. ABORT.'; END IF;

  -- RLS/FORCE + deny-browser de iam_* intactos
  v_rls_iu   := (SELECT relrowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass);
  v_force_iu := (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario'::regclass);
  v_rls_iue  := (SELECT relrowsecurity FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass);
  v_force_iue:= (SELECT relforcerowsecurity FROM pg_class WHERE oid='public.iam_usuario_empresa'::regclass);
  v_browser  := (SELECT count(*) FROM information_schema.role_table_grants
                   WHERE table_schema='public' AND table_name IN ('iam_usuario','iam_usuario_empresa')
                     AND grantee IN ('anon','authenticated'));
  IF NOT (v_rls_iu AND v_force_iu AND v_rls_iue AND v_force_iue) THEN RAISE EXCEPTION 'P3B POST FAIL: RLS/FORCE iam_* alterado. ABORT.'; END IF;
  IF v_browser<>0 THEN RAISE EXCEPTION 'P3B POST FAIL: deny-browser roto (grants=%). ABORT.', v_browser; END IF;

  RAISE NOTICE 'P3B OK: Angelo rebindeado a auth.users(ahuerta)=%; Osiris intacto; 0 filas creadas/borradas; ningún otro binding cambió; memberships 6/Carol 0; RLS+deny-browser intactos. Commit.', v_new_id;
END
$g$;

COMMIT;

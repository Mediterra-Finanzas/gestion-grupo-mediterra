-- ============================================================================
-- R4-A_drop_dev_uat.sql — RLS-HARDEN-PROC R4-A. Retira el BRIDGE ANON: DROP de las
-- ~61 policies pol_<t>_DEV_UAT (AS PERMISSIVE FOR ALL TO anon USING(true) WITH CHECK(true))
-- creadas por schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql. Preserva la policy estricta
-- de cada tabla (pol_<t>_empresa tenant · pol_proc_tipo_movimiento_cat global).
--
-- CONTEXTO: H2-A ya retiró las 48 pol_<t>_DEV_ONLY ({public} bypass authenticated).
-- R4-A cierra la segunda mitad del bridge: el acceso anon. Tras R4-A + R4-B (REVOKE),
-- la app DEBE correr 100% como authenticated (Identity Bridge Option C, flag
-- REACT_APP_PROC_AUTH=true + token). Sin eso → app-muerta (anon ya no lee/escribe proc_*).
--
-- NOTA DE NOMBRES: en staging los nombres se guardaron en MINÚSCULAS (creados sin comillas
-- → Postgres los pliega): pol_<t>_dev_uat. Los checks usan lower(policyname); el DROP usa
-- el nombre en minúsculas.
--
-- 8 lotes, cada uno TRANSACCIÓN propia. Preflight FAIL-CLOSED por tabla: confirma que la
-- tabla conserva ≥1 policy ESTRICTA (no _dev_uat, no _dev_only, no permisiva-a-anon) ANTES
-- de dropear su _dev_uat → nunca deja una tabla sin enforcement tenant. POST-check por lote.
-- ALLOWLIST EXPLÍCITA (no wildcard). Conteo DINÁMICO (report lo realmente dropeado): el bridge
-- es dinámico y H1 midió 61 _dev_uat sobre 62 tablas base (1 tabla materializada después del
-- último run del bridge — DROP IF EXISTS se autoajusta, no aborta).
--
-- TARGET: staging nlvfjpwiecgrosjnwwik. Producción HANDS-OFF. ROLLBACK: R4-A_rollback.sql.
-- REVOKE anon → NO aquí: va en R4-B_revoke_anon.sql (los grants no se atribuyen a su origen;
-- separar DROP-policy de REVOKE-grant permite verificar cada mitad por separado).
-- ============================================================================
\set ON_ERROR_STOP on

-- ── Helper conceptual del preflight (inline en cada lote) ────────────────────
-- Para cada tabla t del lote:
--   estrictas := policies de t cuyo lower(policyname) NO LIKE '%_dev_uat' NI '%_dev_only'
--   IF estrictas = 0 THEN ABORT  (jamás dropear el _dev_uat si es lo único que queda)
-- Esto cubre uniformemente pol_<t>_empresa (tenant) y pol_proc_tipo_movimiento_cat (global).

-- ── LOTE 1 · v1 (13) ─────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_audit_log','proc_empresa_config','proc_catalogo_activacion','proc_temporada',
                       'proc_vinculo','proc_planta','proc_predios','proc_calibre','proc_color',
                       'proc_recepcion','proc_lote','proc_movimiento','proc_hold'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  -- Guard destino R4: proc_* materializado (NO el clean-staging guard). Bridge anon debe existir.
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc\_%' ESCAPE '\')<30
     THEN RAISE EXCEPTION 'R4 ABORT lote1: proc_*<30 (no staging).'; END IF;
  IF to_regclass('public.proc_recepcion') IS NULL THEN RAISE EXCEPTION 'R4 ABORT lote1: proc_* no materializado.'; END IF;
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  -- PREFLIGHT fail-closed: cada tabla conserva ≥1 policy estricta antes de tocar su _dev_uat.
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote1: % sin policy estricta — dropear su _dev_uat lo dejaría sin enforcement.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote1: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE1 OK: % _dev_uat dropeadas (de % presentes); 0 restantes; estrictas intactas.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 2 · F2 (14) ─────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_ubicaciones','proc_condiciones','proc_lineas_proceso','proc_categorias_calidad',
                       'proc_motivos_descarte','proc_motivos_merma','proc_qc_parametro','proc_qc_recepcion',
                       'proc_programa_proceso','proc_orden_proceso','proc_orden_insumo','proc_resultado',
                       'proc_resultado_descarte','proc_resultado_merma'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote2: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote2: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE2 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 3 · F3 (7) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_formato','proc_producto_terminado','proc_pallet','proc_pallet_linea',
                       'proc_repaletizaje','proc_repaletizaje_origen','proc_repaletizaje_destino'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote3: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote3: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE3 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 4 · F4 (3) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_despacho','proc_despacho_linea','proc_despacho_doc'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote4: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote4: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE4 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 5 · F5 (5) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote5: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote5: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE5 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 6 · F6 (5) ──────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_tipo_servicio','proc_tarifa','proc_servicio_facturable','proc_base_cobro','proc_base_cobro_linea'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote6: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote6: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE6 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 7 · v7.1 (1) ────────────────────────────────────────────────────────
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_correlativo'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    IF v_estrictas < 1 THEN RAISE EXCEPTION 'R4 ABORT lote7: % sin policy estricta.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t); END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote7: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE7 OK: % _dev_uat dropeada (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── LOTE 8 · v8/v9/v10/reporting/temporadas (14) ─────────────────────────────
-- Tablas con _dev_uat del bridge dinámico que NO estaban en las 48 _dev_only de H2.
-- Incluye el catálogo GLOBAL proc_tipo_movimiento (estricta = pol_proc_tipo_movimiento_cat,
-- FOR SELECT TO authenticated USING(true)) — el preflight ≥1-estricta lo cubre sin caso especial.
-- H1 midió 61 _dev_uat/62 base: la 62ª (materializada tras el último run del bridge, candidato
-- proc_temporada_reapertura_permiso) puede no tener _dev_uat → DROP IF EXISTS se autoajusta.
BEGIN;
DO $b$
DECLARE
  tbls text[] := ARRAY['proc_tipo_movimiento','proc_tipo_envase','proc_envase_movimiento',
                       'proc_especie','proc_variedad','proc_cuartel','proc_cliente_productor',
                       'proc_cliente_ficha','proc_tipo_documento_contractual','proc_cliente_contrato',
                       'proc_reporte_config','proc_reporte_destinatario','proc_reporte_ejecucion',
                       'proc_temporada_reapertura_permiso'];
  t text; v_uat_pre int; v_uat_post int; v_dropped int; v_estrictas int;
BEGIN
  v_uat_pre := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;  -- tabla puede no existir en algún corte de staging
    v_estrictas := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_uat' ESCAPE '\'
                    AND lower(policyname) NOT LIKE 'pol\_%\_dev\_only' ESCAPE '\');
    -- Solo exigimos estricta si la tabla realmente tiene un _dev_uat que vamos a quitar.
    IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND lower(policyname)='pol_'||t||'_dev_uat')
       AND v_estrictas < 1
       THEN RAISE EXCEPTION 'R4 ABORT lote8: % sin policy estricta — no dropear su _dev_uat.', t; END IF;
  END LOOP;
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.'||quote_ident(t)) IS NULL THEN CONTINUE; END IF;  -- FIX 2026-08-26: saltar tabla inexistente en el DROP (staging no tiene proc_temporada_reapertura_permiso; DROP POLICY IF EXISTS no cubre tabla faltante -> 42P01)
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'pol_'||t||'_dev_uat', t);
  END LOOP;
  v_uat_post := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=ANY(tbls) AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  v_dropped := v_uat_pre - v_uat_post;
  IF v_uat_post<>0 THEN RAISE EXCEPTION 'R4 POST lote8: quedan % _dev_uat.', v_uat_post; END IF;
  RAISE NOTICE 'R4 LOTE8 OK: % _dev_uat dropeadas (de %); 0 restantes.', v_dropped, v_uat_pre;
END $b$;
COMMIT;

-- ── POST-CHECK GLOBAL ────────────────────────────────────────────────────────
DO $g$
DECLARE v_uat_total int; v_bridge_grants int;
BEGIN
  v_uat_total := (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND lower(policyname) LIKE 'pol\_%\_dev\_uat' ESCAPE '\');
  IF v_uat_total<>0 THEN RAISE EXCEPTION 'R4-A POST GLOBAL: quedan % _dev_uat en el schema (esperado 0).', v_uat_total; END IF;
  -- Recordatorio: los GRANT a anon SIGUEN vigentes (los quita R4-B). Sin policy anon pero con grant,
  -- anon todavía puede SELECT/DML mientras exista el grant. R4-A + R4-B son INSEPARABLES para el cierre.
  v_bridge_grants := (SELECT count(*) FROM information_schema.role_table_grants
                      WHERE grantee='anon' AND table_schema='public' AND table_name LIKE 'proc\_%' ESCAPE '\');
  RAISE NOTICE 'R4-A COMPLETO: 0 _dev_uat en schema. AÚN quedan % grants anon sobre proc_* → correr R4-B_revoke_anon.sql para cerrar.', v_bridge_grants;
END $g$;

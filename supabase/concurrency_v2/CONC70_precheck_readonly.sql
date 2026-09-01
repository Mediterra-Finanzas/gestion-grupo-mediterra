-- ============================================================================
-- CONC70_precheck_readonly.sql — PASO 1 de CONC70 (READ-ONLY, NO muta nada).
-- Target: STAGING gestion-mediterra-staging (nlvfjpwiecgrosjnwwik). Producción = HANDS-OFF.
-- Verifica el terreno para endurecer proc_fn_reversar_movimiento (CONC-B3, CREATE OR REPLACE 4 args).
-- 70 depende de 50 (ux_proc_mov_reversa_unica) y de 60 (registrar_movimiento 16 args).
-- Devuelve UNA grilla; interpretar `estado`. Cualquier HARD STOP → NO ejecutar 70. Solo SELECT.
-- ============================================================================
WITH chk AS (
  SELECT 1 AS ord, 'fingerprint_proc_>=30' AS check_name,
    (SELECT count(*)::text FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%') AS valor,
    CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')>=30 THEN 'PASS' ELSE 'HARD STOP' END AS estado
  UNION ALL
  SELECT 2, 'als_uuid+codigo_exacto=1',
    (SELECT count(*)::text FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS'),
    CASE WHEN (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')=1 THEN 'PASS' ELSE 'HARD STOP' END
  UNION ALL
  SELECT 3, 'calendario_data.main=1',
    (SELECT count(*)::text FROM calendario_data WHERE id='main'),
    CASE WHEN (SELECT count(*) FROM calendario_data WHERE id='main')=1 THEN 'PASS' ELSE 'HARD STOP' END
  UNION ALL
  -- Dep 50: backstop unique de reversa
  SELECT 4, 'CONC50 ux_proc_mov_reversa_unica existe=1 (dep 50)',
    (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica'),
    CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica')=1 THEN 'PASS' ELSE 'HARD STOP (aplicar 50)' END
  UNION ALL
  SELECT 5, 'CONC50 idempotency_key existe=1 (dep 50)',
    (SELECT count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key'),
    CASE WHEN (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key')=1 THEN 'PASS' ELSE 'HARD STOP (aplicar 50)' END
  UNION ALL
  -- Dep 60: registrar_movimiento(16) presente y (15) ausente
  SELECT 6, 'registrar_movimiento(16 args) presente=1 (dep 60)',
    (SELECT count(*)::text FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16),
    CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16)=1 THEN 'PASS' ELSE 'HARD STOP (aplicar 60)' END
  UNION ALL
  SELECT 7, 'registrar_movimiento(15 args) ausente=0 (dep 60)',
    (SELECT count(*)::text FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15),
    CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15)=0 THEN 'PASS' ELSE 'HARD STOP (60 incompleto)' END
  UNION ALL
  -- Grants R4-B en la funcion 16 (dependencia de 60 no debe estar regresionada)
  SELECT 8, 'registrar_movimiento(16): anon/PUBLIC=0',
    (SELECT COALESCE(count(*),0)::text FROM pg_proc p, aclexplode(p.proacl) a
       WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16 AND a.privilege_type='EXECUTE'
         AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))),
    CASE WHEN (SELECT COALESCE(count(*),0) FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16 AND a.privilege_type='EXECUTE'
                   AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon')))=0
         THEN 'PASS (baseline R4-B)' ELSE 'HARD STOP (60 regresionado: anon/PUBLIC)' END
  UNION ALL
  SELECT 9, 'registrar_movimiento(16): authenticated+service_role=2',
    (SELECT count(DISTINCT r.rolname)::text FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
       WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16 AND a.privilege_type='EXECUTE' AND r.rolname IN ('authenticated','service_role')),
    CASE WHEN (SELECT count(DISTINCT r.rolname) FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
                 WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=16 AND a.privilege_type='EXECUTE' AND r.rolname IN ('authenticated','service_role'))=2
         THEN 'PASS' ELSE 'AVISO (grants 60 incompletos)' END
  UNION ALL
  -- Contrato que 70 REEMPLAZA: reversar_movimiento(4 args) existe exactamente 1
  SELECT 10, 'reversar_movimiento(4 args) existe=1 (a reemplazar)',
    (SELECT count(*)::text FROM pg_proc WHERE proname='proc_fn_reversar_movimiento' AND pronargs=4),
    CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_reversar_movimiento' AND pronargs=4)=1 THEN 'PASS' ELSE 'HARD STOP (contrato previo inesperado)' END
  UNION ALL
  SELECT 11, 'firma reversar esperada (4 args)',
    (SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='proc_fn_reversar_movimiento' AND pronargs=4 LIMIT 1),
    'INFO (esperado: uuid, uuid, text, uuid)'
  UNION ALL
  -- Estado fresco de 70: ¿ya está endurecido? (marca 'REV:' solo existe en la version hardened)
  SELECT 12, 'reversar YA endurecido? (aplicacion parcial/previa de 70)',
    (CASE WHEN (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='proc_fn_reversar_movimiento' AND pronargs=4 LIMIT 1) LIKE '%REV:%'
          THEN 'SI' ELSE 'NO' END),
    CASE WHEN (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='proc_fn_reversar_movimiento' AND pronargs=4 LIMIT 1) LIKE '%REV:%'
         THEN 'AVISO: 70 ya aplicado (CREATE OR REPLACE es idempotente; revisar si re-ejecutar)'
         ELSE 'PASS (fresco: reversar original, sin endurecer)' END
  UNION ALL
  -- Grants baseline R4-B en la funcion actual reversar(4): NO anon/PUBLIC
  SELECT 13, 'reversar(4): anon/PUBLIC presentes? (debe ser 0)',
    (SELECT COALESCE(count(*),0)::text FROM pg_proc p, aclexplode(p.proacl) a
       WHERE p.proname='proc_fn_reversar_movimiento' AND p.pronargs=4 AND a.privilege_type='EXECUTE'
         AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))),
    CASE WHEN (SELECT COALESCE(count(*),0) FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.proname='proc_fn_reversar_movimiento' AND p.pronargs=4 AND a.privilege_type='EXECUTE'
                   AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon')))=0
         THEN 'PASS (baseline R4-B: sin anon/PUBLIC)' ELSE 'AVISO: anon/PUBLIC ya presente — reportar' END
  UNION ALL
  SELECT 14, 'reversar(4): grantees actuales (info)',
    (SELECT COALESCE(string_agg(DISTINCT r.rolname,','),'(ninguno)') FROM pg_proc p, aclexplode(p.proacl) a JOIN pg_roles r ON r.oid=a.grantee
       WHERE p.proname='proc_fn_reversar_movimiento' AND p.pronargs=4 AND a.privilege_type='EXECUTE'),
    'INFO (70 dejará: authenticated,service_role [+owner])'
  UNION ALL
  -- Inconsistencia relevante para CONC-B3: dobles reversas YA existentes
  SELECT 15, 'dobles reversas existentes=0',
    (SELECT COALESCE(count(*),0)::text FROM (
       SELECT empresa_id, revierte_movimiento_id FROM proc_movimiento
       WHERE es_reversa=true AND revierte_movimiento_id IS NOT NULL
       GROUP BY empresa_id, revierte_movimiento_id HAVING count(*)>1) d),
    CASE WHEN (SELECT COALESCE(count(*),0) FROM (
                 SELECT empresa_id, revierte_movimiento_id FROM proc_movimiento
                 WHERE es_reversa=true AND revierte_movimiento_id IS NOT NULL
                 GROUP BY empresa_id, revierte_movimiento_id HAVING count(*)>1) d)=0
         THEN 'PASS' ELSE 'HARD STOP (conciliar; sin dedupe auto)' END
  UNION ALL
  -- DATA LOSS baseline: 70 NO toca datos (smoke con ROLLBACK); row_count debe ser igual
  SELECT 16, 'proc_movimiento row_count (baseline; igual post-70)',
    (SELECT count(*)::text FROM proc_movimiento),
    'INFO (guardar; 70 no escribe datos)'
)
SELECT check_name, valor, estado FROM chk ORDER BY ord;

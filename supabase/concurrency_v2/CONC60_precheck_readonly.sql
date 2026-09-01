-- ============================================================================
-- CONC60_precheck_readonly.sql — PASO 1 de CONC60 (READ-ONLY, NO muta nada).
-- Target: STAGING gestion-mediterra-staging (nlvfjpwiecgrosjnwwik). Producción = HANDS-OFF.
-- Verifica que el terreno esté listo para reemplazar proc_fn_registrar_movimiento (15→16 args).
-- Devuelve UNA grilla; interpretar la columna `estado`. Si algo dice HARD STOP → NO ejecutar 60.
-- No usa \set. Solo SELECT (no abre transacción mutante).
-- ============================================================================
WITH chk AS (
  -- (1) Fingerprint STAGING
  SELECT 1 AS ord, 'fingerprint_proc_>=30' AS check_name,
    (SELECT count(*)::text FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%') AS valor,
    CASE WHEN (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'proc_%')>=30
         THEN 'PASS' ELSE 'HARD STOP (no es staging proc_*)' END AS estado
  UNION ALL
  SELECT 2, 'als_uuid+codigo_exacto=1',
    (SELECT count(*)::text FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS'),
    CASE WHEN (SELECT count(*) FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49' AND codigo='ALS')=1
         THEN 'PASS' ELSE 'HARD STOP (fingerprint staging no confirmado)' END
  UNION ALL
  SELECT 3, 'calendario_data.main=1',
    (SELECT count(*)::text FROM calendario_data WHERE id='main'),
    CASE WHEN (SELECT count(*) FROM calendario_data WHERE id='main')=1 THEN 'PASS' ELSE 'HARD STOP (destino sospechoso)' END
  UNION ALL
  -- (2) CONC50 materializado (dependencia dura)
  SELECT 4, 'CONC50 idempotency_key existe=1',
    (SELECT count(*)::text FROM information_schema.columns
       WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key'),
    CASE WHEN (SELECT count(*) FROM information_schema.columns
                WHERE table_schema='public' AND table_name='proc_movimiento' AND column_name='idempotency_key')=1
         THEN 'PASS' ELSE 'HARD STOP (aplicar 50 antes)' END
  UNION ALL
  SELECT 5, 'CONC50 ux_proc_mov_idem existe=1',
    (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_idem'),
    CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_idem')=1
         THEN 'PASS' ELSE 'HARD STOP (50 incompleto)' END
  UNION ALL
  SELECT 6, 'CONC50 ux_proc_mov_reversa_unica existe=1',
    (SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica'),
    CASE WHEN (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname='ux_proc_mov_reversa_unica')=1
         THEN 'PASS' ELSE 'HARD STOP (50 incompleto)' END
  UNION ALL
  -- (3) Contrato previo que 60 REEMPLAZA: existe exactamente 1 firma de 15 args
  SELECT 7, 'registrar_movimiento(15 args) existe=1 (a reemplazar)',
    (SELECT count(*)::text FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15),
    CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15)=1
         THEN 'PASS' ELSE 'HARD STOP (contrato previo inesperado)' END
  UNION ALL
  -- (4) Ausencia de estado PARCIAL de 60: NO debe existir ya la firma de 16 args
  SELECT 8, 'registrar_movimiento(16 args) AUSENTE (sin estado parcial 60)',
    (SELECT count(*)::text FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16),
    CASE WHEN (SELECT count(*) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=16)=0
         THEN 'PASS (fresco)' ELSE 'HARD STOP (60 ya aplicado/parcial — revisar antes)' END
  UNION ALL
  -- (5) Firma EXACTA esperada de la funcion de 15 args (tipos ordenados)
  SELECT 9, 'firma 15-args esperada',
    (SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15 LIMIT 1),
    CASE WHEN (SELECT pg_get_function_arguments(oid) FROM pg_proc WHERE proname='proc_fn_registrar_movimiento' AND pronargs=15 LIMIT 1)
              ILIKE '%p_es_reversa boolean%' THEN 'INFO (verificar contra 60)' ELSE 'REVISAR firma' END
  UNION ALL
  -- (6) Grants baseline R4-B en la funcion actual (15): NO anon/PUBLIC; si authenticated+service_role
  SELECT 10, 'grants 15-args: anon/PUBLIC presentes? (debe ser 0)',
    (SELECT COALESCE(count(*),0)::text FROM pg_proc p, aclexplode(p.proacl) a
       WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=15
         AND a.privilege_type='EXECUTE'
         AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon'))),
    CASE WHEN (SELECT COALESCE(count(*),0) FROM pg_proc p, aclexplode(p.proacl) a
                 WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=15
                   AND a.privilege_type='EXECUTE'
                   AND (a.grantee=0 OR a.grantee=(SELECT oid FROM pg_roles WHERE rolname='anon')))=0
         THEN 'PASS (baseline R4-B: sin anon/PUBLIC)'
         ELSE 'AVISO: anon/PUBLIC ya presente en la funcion actual (R4-B parcial?) — reportar' END
  UNION ALL
  SELECT 11, 'grants 15-args: grantees actuales (info)',
    (SELECT COALESCE(string_agg(DISTINCT r.rolname,','),'(ninguno)') FROM pg_proc p, aclexplode(p.proacl) a
       JOIN pg_roles r ON r.oid=a.grantee
       WHERE p.proname='proc_fn_registrar_movimiento' AND p.pronargs=15 AND a.privilege_type='EXECUTE'),
    'INFO (60 dejará: authenticated,service_role)'
  UNION ALL
  -- (7) DATA LOSS baseline: 60 NO toca datos; el conteo debe ser identico despues
  SELECT 12, 'proc_movimiento row_count (baseline; debe ser igual post-60)',
    (SELECT count(*)::text FROM proc_movimiento),
    'INFO (guardar este número; postcheck lo compara)'
  UNION ALL
  -- (8) Incompatibilidad de datos relevante para 60 (ON CONFLICT idempotency_key): duplicados = 0
  SELECT 13, 'dup idempotency_key existentes=0',
    (SELECT COALESCE(count(*),0)::text FROM (
       SELECT empresa_id, idempotency_key FROM proc_movimiento
       WHERE idempotency_key IS NOT NULL
       GROUP BY empresa_id, idempotency_key HAVING count(*)>1) d),
    CASE WHEN (SELECT COALESCE(count(*),0) FROM (
                 SELECT empresa_id, idempotency_key FROM proc_movimiento
                 WHERE idempotency_key IS NOT NULL
                 GROUP BY empresa_id, idempotency_key HAVING count(*)>1) d)=0
         THEN 'PASS' ELSE 'HARD STOP (conciliar antes; NO deduplicar automático)' END
)
SELECT check_name, valor, estado FROM chk ORDER BY ord;

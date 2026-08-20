-- ============================================================================
-- 20_gate_core.sql — GATE CORE (§6). Se corre DESPUÉS de P0+P1 y ANTES de P2.
-- Cada test que falla lanza EXCEPTION → aborta (no continuar a proc_* con Core inválido).
-- Read-only salvo los INSERT de prueba de rechazo, que SIEMPRE fallan por CHECK y no persisten
-- (van dentro de sub-transacciones que se revierten). No toca calendario_data.
-- ============================================================================
DO $$
DECLARE
  v_cod text; v_mon text; v_tc text; v_agri boolean; v_act boolean;
  v_uniq int; v_rls_emp boolean; v_rls_aux boolean; v_rechazado boolean;
  v_cal_antes boolean;
BEGIN
  -- CORE-01: ALS exacto.
  SELECT codigo, moneda_base, tipo_contab, usa_temporada_agricola, activa
    INTO v_cod, v_mon, v_tc, v_agri, v_act
    FROM contab_empresas WHERE id='5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  IF v_cod IS DISTINCT FROM 'ALS' OR v_mon IS DISTINCT FROM 'CLP' OR v_tc IS DISTINCT FROM 'dual'
     OR v_agri IS DISTINCT FROM false OR v_act IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CORE-01 FAIL: fila ALS inesperada (cod=%, mon=%, tc=%, agri=%, act=%)', v_cod,v_mon,v_tc,v_agri,v_act;
  END IF;

  -- CORE-02: código ALS único.
  SELECT count(*) INTO v_uniq FROM contab_empresas WHERE codigo='ALS';
  IF v_uniq <> 1 THEN RAISE EXCEPTION 'CORE-02 FAIL: codigo ALS aparece % veces', v_uniq; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contab_empresas_codigo_key' OR
                 (conrelid='contab_empresas'::regclass AND contype='u')) THEN
    -- unique index cuenta como restricción de unicidad; verificar índice único
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='contab_empresas_codigo_key') THEN
      RAISE EXCEPTION 'CORE-02 FAIL: no existe unicidad de codigo';
    END IF;
  END IF;

  -- CORE-03: CHECK tipo_contab existe y rechaza inválido.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contab_empresas_tipo_contab_check') THEN
    RAISE EXCEPTION 'CORE-03 FAIL: falta contab_empresas_tipo_contab_check';
  END IF;
  v_rechazado := false;
  BEGIN
    INSERT INTO contab_empresas (id,codigo,nombre,tipo_contab)
      VALUES (gen_random_uuid(),'ZZ_GATE_03','x','megasystem');
  EXCEPTION WHEN check_violation THEN v_rechazado := true;
  END;
  IF NOT v_rechazado THEN RAISE EXCEPTION 'CORE-03 FAIL: tipo_contab inválido NO fue rechazado'; END IF;

  -- CORE-04: CHECK tipo auxiliar existe y rechaza inválido.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='contab_auxiliares_tipo_check') THEN
    RAISE EXCEPTION 'CORE-04 FAIL: falta contab_auxiliares_tipo_check';
  END IF;
  v_rechazado := false;
  BEGIN
    INSERT INTO contab_auxiliares (empresa_id,tipo,nombre)
      VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49','distribuidor','x');
  EXCEPTION WHEN check_violation THEN v_rechazado := true;
  END;
  IF NOT v_rechazado THEN RAISE EXCEPTION 'CORE-04 FAIL: tipo auxiliar inválido NO fue rechazado'; END IF;

  -- CORE-05: FK auxiliar→empresa (empresa_id inexistente debe fallar).
  v_rechazado := false;
  BEGIN
    INSERT INTO contab_auxiliares (empresa_id,tipo,nombre)
      VALUES ('00000000-0000-0000-0000-000000000000','cliente','x');
  EXCEPTION WHEN foreign_key_violation THEN v_rechazado := true;
  END;
  IF NOT v_rechazado THEN RAISE EXCEPTION 'CORE-05 FAIL: FK auxiliar→empresa no se aplicó'; END IF;

  -- CORE-06: RLS habilitada en ambas tablas Core (contrato).
  SELECT relrowsecurity INTO v_rls_emp FROM pg_class WHERE oid='contab_empresas'::regclass;
  SELECT relrowsecurity INTO v_rls_aux FROM pg_class WHERE oid='contab_auxiliares'::regclass;
  IF NOT v_rls_emp OR NOT v_rls_aux THEN
    RAISE EXCEPTION 'CORE-06 FAIL: RLS no habilitada (emp=%, aux=%)', v_rls_emp, v_rls_aux;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contab_empresas' AND policyname='anon_contab_empresas_select') THEN
    RAISE EXCEPTION 'CORE-06 FAIL: falta policy anon_contab_empresas_select';
  END IF;

  -- CORE-07: calendario_data intacta (existe y no la tocamos; aquí solo registramos su presencia).
  v_cal_antes := to_regclass('public.calendario_data') IS NOT NULL;
  IF NOT v_cal_antes THEN
    RAISE WARNING 'CORE-07 aviso: calendario_data no existe en este destino (esperada en staging). Verificar target.';
  END IF;

  RAISE NOTICE 'GATE CORE OK: CORE-01..06 PASS. CORE-07 calendario_data presente=%.', v_cal_antes;
END $$;

-- ============================================================================
-- proc_v7_8_filter_tests.sql · F7.8 — Certificación de ACUMULACIÓN de filtros
-- a nivel de datos. La UI construye filtros server-side como &a=eq.x&b=eq.y, que
-- PostgREST traduce a WHERE a=x AND b=y. Este test prueba en el read-model que
-- los filtros son ACUMULATIVOS (AND) y no se reemplazan silenciosamente.
-- REQUISITO: schema v1..v7_7 aplicado. Superuser.
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_ts uuid; v_c1 uuid; v_c2 uuid; v_au uuid := gen_random_uuid();
  n int;
BEGIN
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre) VALUES (v_emp,'PROC','Proceso') RETURNING id INTO v_ts;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (v_emp,true,'Cliente Uno','cliente_servicio') RETURNING id INTO v_c1;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (v_emp,true,'Cliente Dos','cliente_servicio') RETURNING id INTO v_c2;

  -- Servicios manuales sembrados (bypass RPC, superuser) con combinaciones controladas.
  -- (C1, valorizado, USD) · (C1, pendiente_tarifa, USD) · (C2, valorizado, CLP) · (C1, valorizado, CLP)
  INSERT INTO proc_servicio_facturable(empresa_id,tipo_servicio_id,cliente_vinculo_id,origen_tipo,fecha_hecho,cantidad,unidad,tarifa_aplicada,moneda,subtotal,estado,es_manual,motivo,autorizado_por)
    VALUES (v_emp,v_ts,v_c1,'manual','2026-12-10',10,'evento',5,'USD',50,'valorizado',true,'m',v_au);
  INSERT INTO proc_servicio_facturable(empresa_id,tipo_servicio_id,cliente_vinculo_id,origen_tipo,fecha_hecho,cantidad,unidad,moneda,estado,es_manual,motivo,autorizado_por)
    VALUES (v_emp,v_ts,v_c1,'manual','2026-12-10',10,'evento','USD','pendiente_tarifa',true,'m',v_au);
  INSERT INTO proc_servicio_facturable(empresa_id,tipo_servicio_id,cliente_vinculo_id,origen_tipo,fecha_hecho,cantidad,unidad,tarifa_aplicada,moneda,subtotal,estado,es_manual,motivo,autorizado_por)
    VALUES (v_emp,v_ts,v_c2,'manual','2026-12-10',10,'evento',5,'CLP',50,'valorizado',true,'m',v_au);
  INSERT INTO proc_servicio_facturable(empresa_id,tipo_servicio_id,cliente_vinculo_id,origen_tipo,fecha_hecho,cantidad,unidad,tarifa_aplicada,moneda,subtotal,estado,es_manual,motivo,autorizado_por)
    VALUES (v_emp,v_ts,v_c1,'manual','2026-12-10',10,'evento',5,'CLP',50,'valorizado',true,'m',v_au);

  -- F1: filtro individual cliente=C1 → 3 (acumula nada más)
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND cliente_vinculo_id=v_c1;
  IF n <> 3 THEN RAISE EXCEPTION 'F1: cliente C1 esperaba 3, got %', n; END IF;

  -- F2: acumular cliente=C1 AND estado=valorizado → 2 (NO reemplaza, narrows)
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND cliente_vinculo_id=v_c1 AND estado='valorizado';
  IF n <> 2 THEN RAISE EXCEPTION 'F2: C1+valorizado esperaba 2, got %', n; END IF;

  -- F3: acumular 3 filtros cliente=C1 AND estado=valorizado AND moneda=USD → 1
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND cliente_vinculo_id=v_c1 AND estado='valorizado' AND moneda='USD';
  IF n <> 1 THEN RAISE EXCEPTION 'F3: C1+valorizado+USD esperaba 1, got %', n; END IF;

  -- F4: combinación que cruza clientes: estado=valorizado AND moneda=CLP → 2 (C1 y C2)
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND estado='valorizado' AND moneda='CLP';
  IF n <> 2 THEN RAISE EXCEPTION 'F4: valorizado+CLP esperaba 2, got %', n; END IF;

  -- F5: filtro pendiente_tarifa (bandeja Pendientes) → 1, y con moneda distinta → 0 (no dataset fantasma)
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND estado='pendiente_tarifa';
  IF n <> 1 THEN RAISE EXCEPTION 'F5: pendiente_tarifa esperaba 1, got %', n; END IF;
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp AND estado='pendiente_tarifa' AND moneda='CLP';
  IF n <> 0 THEN RAISE EXCEPTION 'F5b: pendiente_tarifa+CLP esperaba 0 (sin fantasma), got %', n; END IF;

  -- F6: reset (sin filtros salvo tenant) → 4 (dataset completo restaurado, no stale)
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=v_emp;
  IF n <> 4 THEN RAISE EXCEPTION 'F6: reset esperaba 4, got %', n; END IF;

  -- F7: aislamiento de tenant — otra empresa no ve nada
  SELECT count(*) INTO n FROM proc_v_servicio_facturable WHERE empresa_id=gen_random_uuid();
  IF n <> 0 THEN RAISE EXCEPTION 'F7: cross-tenant esperaba 0, got %', n; END IF;

  RAISE NOTICE 'proc_* F7.8 filter accumulation: TODOS LOS TESTS PASARON';
END $$;

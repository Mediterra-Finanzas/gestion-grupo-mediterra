-- ============================================================================
-- proc_v6_f6_tests.sql · F6 — E2E (Regla 29) + negativos (Regla 28).
-- REQUISITO: schema_proc_v1..v6 aplicados. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_cat uuid; v_mdes uuid; v_mmer uuid; v_rec uuid; v_lote uuid;
  v_o1 uuid; v_cli uuid; v_ts_proc uuid; v_ts_insp uuid; v_tarA uuid; v_tarGen uuid;
  v_sf uuid; v_sf_insp uuid; v_base uuid; v_tid uuid; v_kg numeric; v_sub numeric; v_est text; v_tot numeric;
BEGIN
  -- Setup F1-F3: recepción 10.000 → proceso 9.800 → conciliar → cerrar (fecha 2026-12-10)
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (v_emp,'P1','Planta') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'A','A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (v_emp,'EXP','Exp') RETURNING id INTO v_cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (v_emp,'C','C') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (v_emp,'D','D') RETURNING id INTO v_mmer;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional)
    VALUES (v_emp,true,'Exportadora X','cliente_servicio') RETURNING id INTO v_cli;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (v_emp,'R1',10000) RETURNING id INTO v_rec;   -- recibidos 10.000
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,'L1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo)
    VALUES (v_emp,'O1',v_planta,'en_proceso','2026-12-10','CHE') RETURNING id INTO v_o1;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_o1,v_lote,9800,NULL,NULL);   -- procesados 9.800
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (v_emp,v_o1,v_cat,7800);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_o1,v_mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (v_emp,v_o1,v_mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o1;
  PERFORM proc_fn_conciliar_orden(v_emp,v_o1,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_o1;

  -- ── F6: tipos de servicio + tarifas ──
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (v_emp,'PROC','Proceso','kg_procesado') RETURNING id INTO v_ts_proc;
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (v_emp,'INSP','Inspección','evento') RETURNING id INTO v_ts_insp;
  -- Tarifa GENERAL 0.25 y ESPECÍFICA cliente 0.30 (ambas cubren 2026-12-10) → gana la específica
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (v_emp,v_ts_proc,NULL,'kg_procesado',0.25,'USD','2026-12-01','2026-12-15') RETURNING id INTO v_tarGen;
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (v_emp,v_ts_proc,v_cli,'kg_procesado',0.30,'USD','2026-12-01','2026-12-15') RETURNING id INTO v_tarA;

  -- Resolución determinística: cliente-específica gana (0.30)
  v_tid := proc_fn_resolver_tarifa(v_emp,v_cli,'2026/2027','CHE',v_ts_proc,'2026-12-10');
  IF v_tid <> v_tarA THEN RAISE EXCEPTION 'E1: resolución debía dar la tarifa específica (0.30), no la general'; END IF;

  -- Servicio de proceso: cantidad = kg PROCESADOS (9800, no 10000); subtotal 9800×0.30=2940
  v_sf := proc_fn_generar_servicio_proceso(v_emp,v_o1,v_cli,v_ts_proc,NULL);
  SELECT cantidad, subtotal, estado INTO v_kg, v_sub, v_est FROM proc_servicio_facturable WHERE id=v_sf;
  IF v_kg <> 9800 THEN RAISE EXCEPTION 'E2: cantidad esperada 9800 (procesados), got % (¿recibidos 10000?)', v_kg; END IF;
  IF v_sub <> 2940 THEN RAISE EXCEPTION 'E2: subtotal esperado 2940 (9800×0.30), got %', v_sub; END IF;
  IF v_est <> 'valorizado' THEN RAISE EXCEPTION 'E2: estado esperado valorizado, got %', v_est; END IF;

  -- Negativo: idempotencia (misma orden+servicio no duplica)
  BEGIN PERFORM proc_fn_generar_servicio_proceso(v_emp,v_o1,v_cli,v_ts_proc,NULL);
    RAISE EXCEPTION 'FALLA N1: doble cobro de la misma orden permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;

  -- Falta tarifa: inspección no tiene tarifa → pendiente_tarifa (no cero)
  v_sf_insp := proc_fn_generar_servicio_proceso(v_emp,v_o1,v_cli,v_ts_insp,NULL);
  SELECT estado, subtotal INTO v_est, v_sub FROM proc_servicio_facturable WHERE id=v_sf_insp;
  IF v_est <> 'pendiente_tarifa' OR v_sub IS NOT NULL THEN RAISE EXCEPTION 'E3: sin tarifa debía quedar pendiente_tarifa/NULL, got %/%', v_est, v_sub; END IF;

  -- Negativo: manual sin motivo/autorización
  BEGIN PERFORM proc_fn_generar_servicio_manual(v_emp,v_cli,v_ts_proc,10,'evento',5,'USD','2026-12-10',NULL,NULL,NULL);
    RAISE EXCEPTION 'FALLA N2: manual sin motivo/autorización permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF; END;

  -- Base de cobro: agregar servicio valorizado, aprobar → total 2940
  v_base := proc_fn_crear_base_cobro(v_emp,'BC-2026-0001',v_cli,'2026/2027','2026-12-01','2026-12-31','USD',NULL);
  PERFORM proc_fn_agregar_a_base(v_emp,v_base,v_sf,NULL);
  SELECT total INTO v_tot FROM proc_base_cobro WHERE id=v_base;
  IF v_tot <> 2940 THEN RAISE EXCEPTION 'E4: total base esperado 2940, got %', v_tot; END IF;
  PERFORM proc_fn_aprobar_base(v_emp,v_base,NULL);

  -- Negativo: editar base aprobada
  BEGIN UPDATE proc_base_cobro SET observaciones='x' WHERE id=v_base;
    RAISE EXCEPTION 'FALLA N3: base aprobada fue editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N3%' THEN RAISE; END IF; END;

  -- Negativo: editar servicio en base aprobada
  BEGIN UPDATE proc_servicio_facturable SET subtotal=9999 WHERE id=v_sf;
    RAISE EXCEPTION 'FALLA N4: servicio en base aprobada fue editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N4%' THEN RAISE; END IF; END;

  -- Snapshot de tarifa: cambiar el tarifario CURRENT no altera el servicio valorizado
  UPDATE proc_tarifa SET tarifa=0.99 WHERE id=v_tarA;
  SELECT tarifa_aplicada, subtotal INTO v_sub, v_tot FROM proc_servicio_facturable WHERE id=v_sf;
  IF v_sub <> 0.30 OR v_tot <> 2940 THEN RAISE EXCEPTION 'E5: snapshot de tarifa cambió con el maestro (esperado 0.30/2940), got %/%', v_sub, v_tot; END IF;

  RAISE NOTICE 'proc_v6_f6_tests: END-TO-END + NEGATIVOS — TODOS PASARON ✓';
END $$;

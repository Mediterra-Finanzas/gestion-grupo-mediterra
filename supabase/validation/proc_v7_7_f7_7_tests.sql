-- ============================================================================
-- proc_v7_7_f7_7_tests.sql · F7.7 — read-models de tarifario/servicios/base +
-- preview de resolución + revalorizar pendiente + inmutabilidad de snapshot.
-- REQUISITO: schema_proc_v1..v6 + v7_f7_1 + v7_7_f7_7 aplicados. Superuser (RLS bypass).
-- El motor económico F6 se valida en proc_v6_f6_tests.sql (regresión); aquí va la
-- capa de LECTURA/derivación que agrega F7.7. NO reimplementa reglas de F6.
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_cat uuid; v_mdes uuid; v_mmer uuid; v_rec uuid; v_lote uuid;
  v_o1 uuid; v_cli uuid; v_ts_proc uuid; v_ts_insp uuid; v_tarGen uuid; v_tarA uuid;
  v_sf uuid; v_sf_insp uuid; v_base uuid;
  v_txt text; v_num numeric; v_int int; v_bool boolean; v_res text; v_rowid uuid;
BEGIN
  -- ── Setup F1-F3: recepción 10.000 → proceso 9.800 → conciliar → cerrar ──
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (v_emp,'P1','Planta') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'A','A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (v_emp,'EXP','Exp') RETURNING id INTO v_cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (v_emp,'C','C') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (v_emp,'D','D') RETURNING id INTO v_mmer;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional)
    VALUES (v_emp,true,'AGROKASA','cliente_servicio') RETURNING id INTO v_cli;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (v_emp,'REC-2627-000001',10000) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,'L1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo,cliente_servicio_vinculo_id)
    VALUES (v_emp,'ORD-2627-000001',v_planta,'en_proceso','2026-12-10','CHE',v_cli) RETURNING id INTO v_o1;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_o1,v_lote,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (v_emp,v_o1,v_cat,7800);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_o1,v_mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (v_emp,v_o1,v_mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o1;
  PERFORM proc_fn_conciliar_orden(v_emp,v_o1,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_o1;

  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (v_emp,'PROC','Proceso','kg_procesado') RETURNING id INTO v_ts_proc;
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (v_emp,'INSP','Inspección','evento') RETURNING id INTO v_ts_insp;
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (v_emp,v_ts_proc,NULL,'kg_procesado',0.25,'USD','2026-12-01','2026-12-15') RETURNING id INTO v_tarGen;
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (v_emp,v_ts_proc,v_cli,'kg_procesado',0.30,'USD','2026-12-01','2026-12-15') RETURNING id INTO v_tarA;

  -- ── T1: read-model Tarifario — especificidad + es_general + referencia de servicio ──
  SELECT especificidad, es_general INTO v_int, v_bool FROM proc_v_tarifa_listado WHERE id=v_tarGen;
  IF v_int <> 0 OR v_bool IS NOT TRUE THEN RAISE EXCEPTION 'T1: tarifa general debía tener especificidad 0 / es_general true (got %/%)', v_int, v_bool; END IF;
  SELECT especificidad, es_general, cliente INTO v_int, v_bool, v_txt FROM proc_v_tarifa_listado WHERE id=v_tarA;
  IF v_int <> 1 OR v_bool IS NOT FALSE OR v_txt <> 'AGROKASA' THEN RAISE EXCEPTION 'T1: tarifa específica cliente mal resuelta (esp %, gen %, cli %)', v_int, v_bool, v_txt; END IF;

  -- ── T2: preview proc_fn_resolver_tarifa_detalle — gana la específica (0.30) ──
  SELECT tarifa, es_general INTO v_num, v_bool FROM proc_fn_resolver_tarifa_detalle(v_emp,v_cli,'2026/2027','CHE',v_ts_proc,'2026-12-10');
  IF v_num <> 0.30 OR v_bool IS NOT FALSE THEN RAISE EXCEPTION 'T2: preview debía dar 0.30 específica, got %/%', v_num, v_bool; END IF;
  -- Sin cliente → gana la general 0.25
  SELECT tarifa INTO v_num FROM proc_fn_resolver_tarifa_detalle(v_emp,NULL,'2026/2027','CHE',v_ts_proc,'2026-12-10');
  IF v_num <> 0.25 THEN RAISE EXCEPTION 'T2b: sin cliente debía ganar general 0.25, got %', v_num; END IF;

  -- ── Genera servicio de proceso (9800 × 0.30 = 2940) ──
  v_sf := proc_fn_generar_servicio_proceso(v_emp,v_o1,v_cli,v_ts_proc,NULL);

  -- ── T3: read-model Servicio Facturable — referencia HUMANA (folio de orden), monto ──
  SELECT referencia, subtotal INTO v_txt, v_num FROM proc_v_servicio_facturable WHERE id=v_sf;
  IF v_txt <> 'ORD-2627-000001' THEN RAISE EXCEPTION 'T3: referencia debía ser el folio de la orden, got %', v_txt; END IF;
  IF v_num <> 2940 THEN RAISE EXCEPTION 'T3: monto esperado 2940, got %', v_num; END IF;

  -- ── T4: pendiente de tarifa visible como tal (no $0) ──
  v_sf_insp := proc_fn_generar_servicio_proceso(v_emp,v_o1,v_cli,v_ts_insp,NULL);
  SELECT estado, subtotal INTO v_res, v_num FROM proc_v_servicio_facturable WHERE id=v_sf_insp;
  IF v_res <> 'pendiente_tarifa' OR v_num IS NOT NULL THEN RAISE EXCEPTION 'T4: inspección sin tarifa debía ser pendiente_tarifa/NULL, got %/%', v_res, v_num; END IF;

  -- ── T5: revalorizar pendiente tras cargar la tarifa faltante ──
  -- sin tarifa aún → sigue pendiente
  v_res := proc_fn_revalorizar_servicio_pendiente(v_emp,v_sf_insp,NULL);
  IF v_res <> 'pendiente_tarifa' THEN RAISE EXCEPTION 'T5a: sin tarifa debía seguir pendiente, got %', v_res; END IF;
  -- cargo tarifa de inspección y revalorizo. NOTA: generar_servicio_proceso fija
  -- cantidad = kg PROCESADOS (9800) sea cual sea el servicio (contrato F6), así que
  -- el monto = 9800 × tarifa. Tarifa 0.10 → 980 (comprobación limpia de la revalorización).
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde)
    VALUES (v_emp,v_ts_insp,v_cli,'kg_procesado',0.10,'USD','2026-12-01');
  v_res := proc_fn_revalorizar_servicio_pendiente(v_emp,v_sf_insp,NULL);
  IF v_res <> 'valorizado' THEN RAISE EXCEPTION 'T5b: con tarifa debía valorizar, got %', v_res; END IF;
  SELECT estado, subtotal INTO v_res, v_num FROM proc_servicio_facturable WHERE id=v_sf_insp;
  IF v_res <> 'valorizado' OR v_num <> 980 THEN RAISE EXCEPTION 'T5c: inspección esperaba valorizado/980 (9800×0.10), got %/%', v_res, v_num; END IF;
  -- revalorizar uno ya valorizado → error
  BEGIN PERFORM proc_fn_revalorizar_servicio_pendiente(v_emp,v_sf_insp,NULL);
    RAISE EXCEPTION 'FALLA T5d: revalorizar un servicio no-pendiente fue permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T5d%' THEN RAISE; END IF; END;

  -- ── T6: inmutabilidad del SNAPSHOT — cambiar la tarifa CURRENT no altera el hecho ──
  UPDATE proc_tarifa SET tarifa=0.99 WHERE id=v_tarA;   -- cambia CURRENT
  SELECT tarifa_aplicada INTO v_num FROM proc_v_servicio_facturable WHERE id=v_sf;
  IF v_num <> 0.30 THEN RAISE EXCEPTION 'T6: snapshot debía seguir 0.30 pese a CURRENT 0.99, got %', v_num; END IF;
  SELECT subtotal INTO v_num FROM proc_v_servicio_facturable WHERE id=v_sf;
  IF v_num <> 2940 THEN RAISE EXCEPTION 'T6: monto snapshot debía seguir 2940, got %', v_num; END IF;
  UPDATE proc_tarifa SET tarifa=0.30 WHERE id=v_tarA;   -- restaura

  -- ── T7: read-model Base + líneas — total y referencia ──
  v_base := proc_fn_crear_base_cobro(v_emp,'BCO-2627-000001',v_cli,'2026/2027','2026-12-01','2026-12-31','USD',NULL);
  PERFORM proc_fn_agregar_a_base(v_emp,v_base,v_sf,NULL);
  SELECT total, lineas, cliente INTO v_num, v_int, v_txt FROM proc_v_base_cobro_listado WHERE id=v_base;
  IF v_num <> 2940 OR v_int <> 1 OR v_txt <> 'AGROKASA' THEN RAISE EXCEPTION 'T7: base listado mal (total %, lineas %, cli %)', v_num, v_int, v_txt; END IF;
  SELECT referencia, subtotal, moneda INTO v_txt, v_num, v_res FROM proc_v_base_cobro_linea WHERE base_cobro_id=v_base;
  IF v_txt <> 'ORD-2627-000001' OR v_num <> 2940 OR v_res <> 'USD' THEN RAISE EXCEPTION 'T7b: línea base mal (ref %, sub %, mon %)', v_txt, v_num, v_res; END IF;

  -- ── T8: multimoneda — servicio CLP no entra a base USD (regla F6, visible acá) ──
  DECLARE v_sf_clp uuid;
  BEGIN
    v_sf_clp := proc_fn_generar_servicio_manual(v_emp,v_cli,v_ts_proc,100,'evento',1500,'CLP','2026-12-10','manual clp — Autorizó: Angelo Huerta',gen_random_uuid(),NULL);
    BEGIN PERFORM proc_fn_agregar_a_base(v_emp,v_base,v_sf_clp,NULL);
      RAISE EXCEPTION 'FALLA T8: servicio CLP entró a base USD (monedas mezcladas)';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T8%' THEN RAISE; END IF; END;
  END;

  -- ── T9: read-model órdenes facturables — cliente_vinculo_id + kg_procesados + tiene_servicio ──
  SELECT cliente_vinculo_id, kg_procesados, tiene_servicio INTO v_rowid, v_num, v_bool FROM proc_v_orden_facturable WHERE id=v_o1;
  IF v_rowid <> v_cli OR v_num <> 9800 OR v_bool IS NOT TRUE THEN RAISE EXCEPTION 'T9: orden facturable mal (cli %, kg %, tiene %)', v_rowid, v_num, v_bool; END IF;

  -- ── T10: base aprobada → líneas inmutables (guard F6, visible en flujo F7.7) ──
  PERFORM proc_fn_aprobar_base(v_emp,v_base,NULL);
  BEGIN PERFORM proc_fn_agregar_a_base(v_emp,v_base,v_sf_insp,NULL);
    RAISE EXCEPTION 'FALLA T10: se agregó línea a base aprobada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T10%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_* F7.7 read-models/preview/revalorizar: TODOS LOS TESTS PASARON';
END $$;

-- ============================================================================
-- proc_v2_f2_tests.sql · Tests F2 — escenario end-to-end + negativos.
-- REQUISITO: schema_proc_v1.sql + schema_proc_v2_f2.sql aplicados en staging.
-- Ejecutar como superuser (RLS bypass) o con DEV-ONLY. NO ejecutado por el proyecto.
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_uB uuid; v_rec uuid; v_lote uuid; v_orden uuid;
  v_cat uuid; v_mdes uuid; v_mmer uuid; v_oborr uuid; v_o2 uuid;
  v_total numeric; v_a numeric; v_b numeric; v_disp numeric; v_ins int; v_mov_ok boolean;
BEGIN
  -- Setup
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp, 0.50);
  INSERT INTO proc_planta(empresa_id, codigo, nombre) VALUES (v_emp,'P1','Planta 1') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id, planta_id, codigo, nombre, tipo) VALUES (v_emp,v_planta,'CAM-A','Cámara A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_ubicaciones(empresa_id, planta_id, codigo, nombre, tipo) VALUES (v_emp,v_planta,'CAM-B','Cámara B','camara') RETURNING id INTO v_uB;
  INSERT INTO proc_categorias_calidad(empresa_id, codigo, nombre) VALUES (v_emp,'EXP','Exportable') RETURNING id INTO v_cat;
  INSERT INTO proc_motivos_descarte(empresa_id, codigo, nombre) VALUES (v_emp,'CAL','Calibre bajo') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id, codigo, nombre) VALUES (v_emp,'DESH','Deshidratación') RETURNING id INTO v_mmer;
  INSERT INTO proc_recepcion(empresa_id, folio, kg_neto) VALUES (v_emp,'R-1',10000) RETURNING id INTO v_rec;

  -- 1) Ingreso de lote ubicado en Cámara A (10.000 kg)
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp, v_rec, 'L-1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);
  SELECT on_hand INTO v_total FROM proc_v_lote_saldos WHERE lote_id=v_lote;
  IF v_total <> 10000 THEN RAISE EXCEPTION 'E1: total esperado 10000, got %', v_total; END IF;

  -- 2) Traslado 2000 A→B; el TOTAL no cambia, cambia la distribución
  PERFORM proc_fn_trasladar(v_emp, v_lote, v_uA, v_uB, 2000, 'reubicación', NULL);
  SELECT on_hand INTO v_total FROM proc_v_lote_saldos WHERE lote_id=v_lote;
  SELECT saldo INTO v_a FROM proc_v_lote_ubicacion WHERE lote_id=v_lote AND ubicacion_id=v_uA;
  SELECT saldo INTO v_b FROM proc_v_lote_ubicacion WHERE lote_id=v_lote AND ubicacion_id=v_uB;
  IF v_total <> 10000 THEN RAISE EXCEPTION 'E2: traslado alteró el total (%)', v_total; END IF;
  IF v_a <> 8000 OR v_b <> 2000 THEN RAISE EXCEPTION 'E2: distribución A=% B=% (esperado 8000/2000)', v_a, v_b; END IF;

  -- Negativo: traslado que excede el saldo de la ubicación origen
  BEGIN
    PERFORM proc_fn_trasladar(v_emp, v_lote, v_uB, v_uA, 5000, 'x', NULL); -- B solo tiene 2000
    RAISE EXCEPTION 'FALLA N1: traslado excediendo ubicación permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;

  -- 3) Orden: borrador → en_proceso
  INSERT INTO proc_orden_proceso(empresa_id, folio, planta_id) VALUES (v_emp,'O-1',v_planta) RETURNING id INTO v_orden;
  UPDATE proc_orden_proceso SET estado='en_proceso' WHERE id=v_orden;

  -- Negativo: consumo cuando la orden NO está en_proceso (orden en borrador)
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id) VALUES (v_emp,'O-BORR',v_planta) RETURNING id INTO v_oborr;
  BEGIN
    PERFORM proc_fn_consumir_lote_en_orden(v_emp, v_oborr, v_lote, 100, NULL, NULL);
    RAISE EXCEPTION 'FALLA N2: consumo con orden en borrador permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF; END;

  -- Negativo: consumo > disponible
  BEGIN
    PERFORM proc_fn_consumir_lote_en_orden(v_emp, v_orden, v_lote, 12000, NULL, NULL);
    RAISE EXCEPTION 'FALLA N3: consumo > disponible permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N3%' THEN RAISE; END IF; END;

  -- 4) Consumo 9800 → genealogía + ledger (atómico)
  PERFORM proc_fn_consumir_lote_en_orden(v_emp, v_orden, v_lote, 9800, NULL, NULL);
  SELECT disponible INTO v_disp FROM proc_v_lote_saldos WHERE lote_id=v_lote;
  IF v_disp <> 200 THEN RAISE EXCEPTION 'E4: disponible esperado 200, got %', v_disp; END IF;
  SELECT count(*) INTO v_ins FROM proc_orden_insumo WHERE orden_id=v_orden AND lote_id=v_lote;
  IF v_ins <> 1 THEN RAISE EXCEPTION 'E4: lineage esperado 1 fila, got %', v_ins; END IF;
  SELECT (movimiento_id IS NOT NULL) INTO v_mov_ok FROM proc_orden_insumo WHERE orden_id=v_orden LIMIT 1;
  IF NOT v_mov_ok THEN RAISE EXCEPTION 'E4: lineage sin movimiento_id (prohibido)'; END IF;

  -- 5) Resultado: 7800 exportable + 1700 descarte + 300 merma = 9800
  INSERT INTO proc_resultado(empresa_id, orden_id, categoria_id, kg) VALUES (v_emp,v_orden,v_cat,7800);
  INSERT INTO proc_resultado_descarte(empresa_id, orden_id, motivo_descarte_id, kg) VALUES (v_emp,v_orden,v_mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id, orden_id, motivo_merma_id, kg) VALUES (v_emp,v_orden,v_mmer,300);

  -- 6) en_proceso → pendiente_conciliacion → conciliar (diff 0) → conciliado → cerrado
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_orden;
  PERFORM proc_fn_conciliar_orden(v_emp, v_orden, NULL);
  IF (SELECT estado FROM proc_orden_proceso WHERE id=v_orden) <> 'conciliado' THEN
    RAISE EXCEPTION 'E6: orden no quedó conciliada'; END IF;
  UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_orden;

  -- Negativo: editar orden cerrada
  BEGIN
    UPDATE proc_orden_proceso SET observaciones='x' WHERE id=v_orden;
    RAISE EXCEPTION 'FALLA N4: orden cerrada fue editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N4%' THEN RAISE; END IF; END;

  -- Negativo: transición inválida (borrador→cerrado)
  BEGIN
    UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_oborr;
    RAISE EXCEPTION 'FALLA N5: transición borrador→cerrado permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N5%' THEN RAISE; END IF; END;

  -- Negativo: conciliar una orden descuadrada (consume 200, declara solo 50 → diff 150 > tol)
  INSERT INTO proc_orden_proceso(empresa_id, folio, planta_id, estado) VALUES (v_emp,'O-2',v_planta,'en_proceso') RETURNING id INTO v_o2;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp, v_o2, v_lote, 200, NULL, NULL);  -- quedaban 200
  INSERT INTO proc_resultado(empresa_id, orden_id, categoria_id, kg) VALUES (v_emp,v_o2,v_cat,50);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o2;
  BEGIN
    PERFORM proc_fn_conciliar_orden(v_emp, v_o2, NULL);
    RAISE EXCEPTION 'FALLA N6: orden descuadrada conciliada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N6%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_v2_f2_tests: END-TO-END + NEGATIVOS — TODOS PASARON ✓';
END $$;

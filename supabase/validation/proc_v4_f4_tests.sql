-- ============================================================================
-- proc_v4_f4_tests.sql · F4 — escenario end-to-end (Regla 19) + negativos (Regla 18).
-- REQUISITO: schema_proc_v1..v4 aplicados. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_uB uuid; v_rec uuid; v_lote uuid; v_orden uuid;
  v_cat uuid; v_fmt uuid; v_mdes uuid; v_mmer uuid; v_res uuid; v_pt1 uuid; v_pt2 uuid;
  v_p3 uuid; v_p4 uuid; v_p5 uuid; v_cli uuid; v_dest uuid; v_d1 uuid; v_d2 uuid;
  v_disp numeric; v_fis numeric; v_kg numeric; v_conc record; v_geneal int;
BEGIN
  -- Setup (F1-F3)
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (v_emp,'P1','Planta') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'A','Cámara A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'B','Cámara B','camara') RETURNING id INTO v_uB;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (v_emp,'EXP','Exportable') RETURNING id INTO v_cat;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja) VALUES (v_emp,'CHE','C5','Caja 5kg',5) RETURNING id INTO v_fmt;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (v_emp,'CAL','Cal') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (v_emp,'DESH','Desh') RETURNING id INTO v_mmer;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (v_emp,true,'Exportadora X','cliente_servicio') RETURNING id INTO v_cli;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (v_emp,true,'Frigorífico Z','otro') RETURNING id INTO v_dest;

  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (v_emp,'R1',10000) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,'L1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado) VALUES (v_emp,'O1',v_planta,'en_proceso') RETURNING id INTO v_orden;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_orden,v_lote,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (v_emp,v_orden,v_cat,7800) RETURNING id INTO v_res;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_orden,v_mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (v_emp,v_orden,v_mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_orden;
  PERFORM proc_fn_conciliar_orden(v_emp,v_orden,NULL);
  UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_orden;
  v_pt1 := proc_fn_materializar_pt(v_emp,v_res,v_fmt,800,4000,NULL);
  v_pt2 := proc_fn_materializar_pt(v_emp,v_res,v_fmt,760,3800,NULL);
  v_p3 := proc_fn_crear_pallet(v_emp,'PAL-3','2026/2027',v_planta,v_fmt,v_uA,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt2,v_p3,760,3800,NULL);   -- P3 = 3800
  v_p4 := proc_fn_crear_pallet(v_emp,'PAL-4','2026/2027',v_planta,v_fmt,v_uA,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt1,v_p4,600,3000,NULL);   -- P4 = 3000
  v_p5 := proc_fn_crear_pallet(v_emp,'PAL-5','2026/2027',v_planta,v_fmt,v_uA,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt1,v_p5,200,1000,NULL);   -- P5 = 1000

  -- ── F4 ──
  -- Negativo: reservar > disponible
  BEGIN PERFORM proc_fn_reservar_pallet(v_emp,gen_random_uuid(),v_p4,5000,NULL);
    RAISE EXCEPTION 'FALLA N1: reserva > disponible permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;

  -- 7) Reservar P4 (3000): reduce libre, NO físico
  v_d1 := proc_fn_crear_despacho(v_emp,'D1',v_planta,v_cli,v_dest,NULL);
  PERFORM proc_fn_reservar_pallet(v_emp,v_d1,v_p4,3000,NULL);
  SELECT kg_fisico, disponible INTO v_fis, v_disp FROM proc_v_pallet_saldos WHERE pallet_id=v_p4;
  IF v_fis <> 3000 OR v_disp <> 0 THEN RAISE EXCEPTION 'E7: reserva alteró físico(%) o disponible(%) (esperado 3000/0)', v_fis, v_disp; END IF;

  -- Cancelar reserva restaura libre
  PERFORM proc_fn_liberar_reserva(v_emp,v_d1,v_p4,NULL);
  SELECT disponible INTO v_disp FROM proc_v_pallet_saldos WHERE pallet_id=v_p4;
  IF v_disp <> 3000 THEN RAISE EXCEPTION 'E7b: liberar reserva no restauró disponible (%)', v_disp; END IF;
  -- reservar de nuevo para el despacho
  PERFORM proc_fn_reservar_pallet(v_emp,v_d1,v_p4,3000,NULL);

  -- 8) Despacho completo de P4
  UPDATE proc_despacho SET estado='preparando' WHERE id=v_d1;
  UPDATE proc_despacho SET estado='listo' WHERE id=v_d1;
  PERFORM proc_fn_confirmar_despacho(v_emp,v_d1, jsonb_build_array(
    jsonb_build_object('pallet_id',v_p4,'pt_id',v_pt1,'cajas',600,'kg',3000)), NULL);
  SELECT kg_fisico INTO v_fis FROM proc_v_pallet_saldos WHERE pallet_id=v_p4;
  IF v_fis <> 0 THEN RAISE EXCEPTION 'E8: P4 físico esperado 0, got %', v_fis; END IF;
  IF (SELECT estado FROM proc_pallet WHERE id=v_p4) <> 'agotado' THEN RAISE EXCEPTION 'E8: P4 no quedó agotado'; END IF;
  IF (SELECT estado FROM proc_despacho WHERE id=v_d1) <> 'despachado' THEN RAISE EXCEPTION 'E8: D1 no quedó despachado'; END IF;

  -- 9) Despacho PARCIAL de P3 (2000 de 3800 → saldo 1800)
  v_d2 := proc_fn_crear_despacho(v_emp,'D2',v_planta,v_cli,v_dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=v_d2;
  UPDATE proc_despacho SET estado='listo' WHERE id=v_d2;
  PERFORM proc_fn_confirmar_despacho(v_emp,v_d2, jsonb_build_array(
    jsonb_build_object('pallet_id',v_p3,'pt_id',v_pt2,'cajas',400,'kg',2000)), NULL);
  SELECT kg_fisico INTO v_fis FROM proc_v_pallet_saldos WHERE pallet_id=v_p3;
  IF v_fis <> 1800 THEN RAISE EXCEPTION 'E9: P3 saldo esperado 1800, got %', v_fis; END IF;
  IF (SELECT estado FROM proc_pallet WHERE id=v_p3) <> 'parcialmente_consumido' THEN RAISE EXCEPTION 'E9: P3 no quedó parcialmente_consumido'; END IF;

  -- 12) Conciliación del despacho: Σ líneas = Σ movimientos
  SELECT * INTO v_conc FROM proc_v_despacho_conciliacion WHERE despacho_id=v_d2;
  IF v_conc.kg_lineas <> v_conc.kg_movimientos OR v_conc.kg_lineas <> 2000 THEN
    RAISE EXCEPTION 'E12: conciliación despacho líneas=% mov=% (esperado 2000)', v_conc.kg_lineas, v_conc.kg_movimientos; END IF;

  -- 14) Genealogía: línea de despacho → PT → resultado → orden
  SELECT count(*) INTO v_geneal FROM proc_despacho_linea dl
    JOIN proc_producto_terminado pt ON pt.id=dl.pt_id WHERE dl.despacho_id=v_d2 AND pt.resultado_id=v_res;
  IF v_geneal < 1 THEN RAISE EXCEPTION 'E14: despacho sin genealogía al resultado'; END IF;

  -- 15) Reversar D2 → restituye stock físico de P3
  PERFORM proc_fn_reversar_despacho(v_emp,v_d2,'error de carga',NULL);
  SELECT kg_fisico INTO v_fis FROM proc_v_pallet_saldos WHERE pallet_id=v_p3;
  IF v_fis <> 3800 THEN RAISE EXCEPTION 'E15: reversa no restituyó P3 a 3800, got %', v_fis; END IF;
  IF (SELECT estado FROM proc_despacho WHERE id=v_d2) <> 'cancelado' THEN RAISE EXCEPTION 'E15: D2 no quedó cancelado'; END IF;

  -- ── NEGATIVOS restantes ──
  -- N2: despacho > libre (P5=1000, intentar 2000)
  v_d1 := proc_fn_crear_despacho(v_emp,'D3',v_planta,v_cli,v_dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=v_d1;
  UPDATE proc_despacho SET estado='listo' WHERE id=v_d1;
  BEGIN PERFORM proc_fn_confirmar_despacho(v_emp,v_d1, jsonb_build_array(jsonb_build_object('pallet_id',v_p5,'pt_id',v_pt1,'cajas',400,'kg',2000)),NULL);
    RAISE EXCEPTION 'FALLA N2: despacho > disponible permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF; END;

  -- N3: editar despacho despachado (D1... usar D2? D2 cancelado. Usar un despacho despachado nuevo)
  v_d2 := proc_fn_crear_despacho(v_emp,'D4',v_planta,v_cli,v_dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=v_d2;
  UPDATE proc_despacho SET estado='listo' WHERE id=v_d2;
  PERFORM proc_fn_confirmar_despacho(v_emp,v_d2, jsonb_build_array(jsonb_build_object('pallet_id',v_p5,'pt_id',v_pt1,'cajas',200,'kg',1000)),NULL);
  BEGIN UPDATE proc_despacho SET observaciones='x' WHERE id=v_d2;
    RAISE EXCEPTION 'FALLA N3: despacho despachado editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N3%' THEN RAISE; END IF; END;

  -- N4: doble confirmación del mismo despacho
  BEGIN PERFORM proc_fn_confirmar_despacho(v_emp,v_d2, jsonb_build_array(jsonb_build_object('pallet_id',v_p5,'pt_id',v_pt1,'cajas',1,'kg',1)),NULL);
    RAISE EXCEPTION 'FALLA N4: doble confirmación permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N4%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_v4_f4_tests: END-TO-END + NEGATIVOS — TODOS PASARON ✓';
END $$;

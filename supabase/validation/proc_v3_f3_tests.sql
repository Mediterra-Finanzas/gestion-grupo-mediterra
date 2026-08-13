-- ============================================================================
-- proc_v3_f3_tests.sql · F3 — escenario end-to-end (Regla 16) + negativos.
-- REQUISITO: schema_proc_v1 + v2_f2 + v3_f3 aplicados. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_uB uuid; v_rec uuid; v_lote uuid; v_orden uuid;
  v_cat uuid; v_cal uuid; v_col uuid; v_fmt uuid; v_mdes uuid; v_mmer uuid; v_res uuid;
  v_pt1 uuid; v_pt2 uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid;
  v_disp numeric; v_kg numeric; v_kg2 numeric; v_lines numeric; v_total numeric; v_geneal int;
BEGIN
  -- Setup
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (v_emp,'P1','Planta') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'A','Cámara A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'B','Cámara B','camara') RETURNING id INTO v_uB;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (v_emp,'EXP','Exportable') RETURNING id INTO v_cat;
  INSERT INTO proc_calibre(empresa_id,especie_codigo,codigo,nombre) VALUES (v_emp,'CHE','XL','Extra Large') RETURNING id INTO v_cal;
  INSERT INTO proc_color(empresa_id,especie_codigo,codigo,nombre) VALUES (v_emp,'CHE','DARK','Dark') RETURNING id INTO v_col;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja) VALUES (v_emp,'CHE','C5','Caja 5kg',5) RETURNING id INTO v_fmt;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (v_emp,'CAL','Calibre') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (v_emp,'DESH','Deshidratación') RETURNING id INTO v_mmer;

  -- F2 chain: recepción 10000 → orden consume 9800 → resultado 7800/1700/300 → conciliar → cerrar
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (v_emp,'R1',10000) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,'L1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado) VALUES (v_emp,'O1',v_planta,'en_proceso') RETURNING id INTO v_orden;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_orden,v_lote,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (v_emp,v_orden,v_cat,v_cal,v_col,7800) RETURNING id INTO v_res;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_orden,v_mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (v_emp,v_orden,v_mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_orden;
  PERFORM proc_fn_conciliar_orden(v_emp,v_orden,NULL);
  UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_orden;

  -- F3: materializar PT (4000 + 3800 = 7800 ≤ resultado)
  v_pt1 := proc_fn_materializar_pt(v_emp,v_res,v_fmt,800,4000,NULL);
  v_pt2 := proc_fn_materializar_pt(v_emp,v_res,v_fmt,760,3800,NULL);
  SELECT kg_disponible INTO v_disp FROM proc_v_resultado_disponible WHERE resultado_id=v_res;
  IF v_disp <> 0 THEN RAISE EXCEPTION 'E-mat: resultado disponible esperado 0, got %', v_disp; END IF;

  -- Palletizar: P1=2000, P2=2000 (de PT1); P3=3800 (de PT2)
  v_p1 := proc_fn_crear_pallet(v_emp,'PAL-1','2026/2027',v_planta,v_fmt,v_uA,NULL);
  v_p2 := proc_fn_crear_pallet(v_emp,'PAL-2','2026/2027',v_planta,v_fmt,v_uA,NULL);
  v_p3 := proc_fn_crear_pallet(v_emp,'PAL-3','2026/2027',v_planta,v_fmt,v_uA,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt1,v_p1,400,2000,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt1,v_p2,400,2000,NULL);
  PERFORM proc_fn_palletizar(v_emp,v_pt2,v_p3,760,3800,NULL);
  SELECT on_hand INTO v_kg FROM proc_v_pt_saldos WHERE pt_id=v_pt1;
  IF v_kg <> 0 THEN RAISE EXCEPTION 'E-pal: PT1 on_hand esperado 0, got %', v_kg; END IF;
  SELECT kg_fisico INTO v_kg FROM proc_v_pallet_saldos WHERE pallet_id=v_p1;
  SELECT kg_lineas INTO v_lines FROM proc_v_pallet_composicion WHERE pallet_id=v_p1;
  IF v_kg <> 2000 OR v_lines <> 2000 THEN RAISE EXCEPTION 'E-pal: P1 ledger=% lineas=% (esperado 2000/2000)', v_kg, v_lines; END IF;

  -- Repaletizar 2 origen → 2 destino (P1+P2 → P4 3000 + P5 1000), balance 4000=4000
  v_p4 := proc_fn_crear_pallet(v_emp,'PAL-4','2026/2027',v_planta,v_fmt,v_uA,NULL);
  v_p5 := proc_fn_crear_pallet(v_emp,'PAL-5','2026/2027',v_planta,v_fmt,v_uA,NULL);
  PERFORM proc_fn_repaletizar(v_emp,'reordenar','repaletizaje', jsonb_build_array(
    jsonb_build_object('origen_pallet_id',v_p1,'pt_id',v_pt1,'cajas',400,'kg',2000,'destino_pallet_id',v_p4),
    jsonb_build_object('origen_pallet_id',v_p2,'pt_id',v_pt1,'cajas',200,'kg',1000,'destino_pallet_id',v_p4),
    jsonb_build_object('origen_pallet_id',v_p2,'pt_id',v_pt1,'cajas',200,'kg',1000,'destino_pallet_id',v_p5)
  ), NULL);
  SELECT kg_fisico INTO v_kg  FROM proc_v_pallet_saldos WHERE pallet_id=v_p4;
  SELECT kg_fisico INTO v_kg2 FROM proc_v_pallet_saldos WHERE pallet_id=v_p5;
  IF v_kg <> 3000 OR v_kg2 <> 1000 THEN RAISE EXCEPTION 'E-rep: P4=% P5=% (esperado 3000/1000)', v_kg, v_kg2; END IF;
  SELECT kg_fisico INTO v_kg FROM proc_v_pallet_saldos WHERE pallet_id=v_p1;
  IF v_kg <> 0 THEN RAISE EXCEPTION 'E-rep: P1 origen esperado 0, got %', v_kg; END IF;
  IF (SELECT estado FROM proc_pallet WHERE id=v_p1) <> 'agotado' THEN RAISE EXCEPTION 'E-rep: P1 no quedó agotado'; END IF;

  -- Total físico terminado = PT (0) + pallets (P3 3800 + P4 3000 + P5 1000 + P1 0 + P2 0) = 7800
  SELECT COALESCE(SUM(kg_fisico),0) INTO v_total FROM proc_v_pallet_saldos WHERE empresa_id=v_emp;
  IF v_total <> 7800 THEN RAISE EXCEPTION 'E-tot: stock pallets esperado 7800, got %', v_total; END IF;

  -- Genealogía backward: P4 → líneas → PT1 → resultado v_res → orden v_orden
  SELECT count(*) INTO v_geneal FROM proc_pallet_linea l
    JOIN proc_producto_terminado pt ON pt.id=l.pt_id
    WHERE l.pallet_id=v_p4 AND l.estado='activa' AND pt.resultado_id=v_res;
  IF v_geneal < 1 THEN RAISE EXCEPTION 'E-gen: P4 sin genealogía al resultado origen'; END IF;

  -- Traslado P3 a Cámara B: no cambia kg total
  PERFORM proc_fn_trasladar_pallet(v_emp,v_p3,v_uB,NULL);
  SELECT kg_fisico INTO v_kg FROM proc_v_pallet_saldos WHERE pallet_id=v_p3;
  IF v_kg <> 3800 THEN RAISE EXCEPTION 'E-tras: traslado alteró kg de P3 (%)', v_kg; END IF;
  IF (SELECT ubicacion_id FROM proc_pallet WHERE id=v_p3) <> v_uB THEN RAISE EXCEPTION 'E-tras: ubicación no cambió'; END IF;

  -- ── NEGATIVOS ──
  -- N1: materializar > resultado disponible (ya en 0)
  BEGIN PERFORM proc_fn_materializar_pt(v_emp,v_res,v_fmt,10,100,NULL);
    RAISE EXCEPTION 'FALLA N1: materialización sobre resultado agotado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;
  -- N2: palletizar > PT disponible (PT1 en 0)
  BEGIN PERFORM proc_fn_palletizar(v_emp,v_pt1,v_p4,10,100,NULL);
    RAISE EXCEPTION 'FALLA N2: palletización sobre PT agotado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF; END;
  -- N4: repaletizar excediendo línea origen (P3 tiene 3800)
  BEGIN PERFORM proc_fn_repaletizar(v_emp,'x','split', jsonb_build_array(
      jsonb_build_object('origen_pallet_id',v_p3,'pt_id',v_pt2,'cajas',0,'kg',5000,'destino_pallet_id',v_p4)),NULL);
    RAISE EXCEPTION 'FALLA N4: repaletizaje excediendo origen';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N4%' THEN RAISE; END IF; END;
  -- N5: código de pallet duplicado (empresa+temporada)
  BEGIN PERFORM proc_fn_crear_pallet(v_emp,'PAL-1','2026/2027',v_planta,v_fmt,v_uA,NULL);
    RAISE EXCEPTION 'FALLA N5: código de pallet duplicado aceptado';
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N5%' THEN RAISE; END IF;
  END;
  -- N7: kg negativo/cero
  BEGIN PERFORM proc_fn_materializar_pt(v_emp,v_res,v_fmt,1,-5,NULL);
    RAISE EXCEPTION 'FALLA N7: kg negativo aceptado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N7%' THEN RAISE; END IF; END;
  -- N3: línea manual que rompe el balance (invariante diferida → SET CONSTRAINTS IMMEDIATE)
  BEGIN
    INSERT INTO proc_pallet_linea(empresa_id,pallet_id,pt_id,cajas,kg) VALUES (v_emp,v_p3,v_pt2,10,500);
    SET CONSTRAINTS ALL IMMEDIATE;   -- fuerza el chequeo del invariante ahora
    RAISE EXCEPTION 'FALLA N3: línea manual descuadrada aceptada';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N3%' THEN RAISE; END IF; END;
  SET CONSTRAINTS ALL DEFERRED;

  RAISE NOTICE 'proc_v3_f3_tests: END-TO-END + NEGATIVOS — TODOS PASARON ✓';
END $$;

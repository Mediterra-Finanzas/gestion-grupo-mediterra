-- ============================================================================
-- proc_v7_4_f7_4_tests.sql · F7.4 — PT + pallets + bodega + repaletizaje.
-- E2E: materializar PT (sin sobreasignación) · palletizar (invariante) · hold ·
--      traslado · repaletizaje N:M/parcial/multi-línea (UAT-D-01) · genealogía ·
--      read-models. REQUISITO: schema_proc_v1..v7_4. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  e uuid:=gen_random_uuid(); pl uuid; u1 uuid; u2 uuid; tmp text:='2026/2027';
  cli uuid; prod uuid; cat uuid; mdes uuid; mmer uuid; fmt uuid;
  rec uuid; lote uuid; orden uuid; resu uuid; ptA uuid; ptB uuid;
  A uuid; B uuid; Cc uuid; D uuid; E5 uuid; F uuid; G uuid;
  s numeric; s2 numeric; disp numeric; nlin int; hid uuid; gen jsonb; kgd numeric; nrm int;
BEGIN
  -- fixture: catálogo especie/variedad requerido por el FK de cutover T5b (no relaja el FK)
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','Santina','Santina');
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct,pallet_compat_keys) VALUES (e,0.50,'["especie_codigo"]'::jsonb);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'t','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO u1;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM2','Cámara 2','camara') RETURNING id INTO u2;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'El Parrón') RETURNING id INTO prod;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','Exportable') RETURNING id INTO cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'BL','Blanda') RETURNING id INTO mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DH','Deshid') RETURNING id INTO mmer;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja) VALUES (e,'CHE','CHE-5','Caja 5kg',5) RETURNING id INTO fmt;

  -- Orden cerrada con resultado comercial 7800 (9800 = 7800+1700+300)
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-1',pl,cli,prod,'CHE',9800,'recibida') RETURNING id INTO rec;
  lote := proc_fn_ingresar_lote_ubicado(e,rec,'LOT-1','CHE','Santina',9800,pl,tmp,u1,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-1',pl,'en_proceso','CHE','Santina',cli) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,orden,cat,7800) RETURNING id INTO resu;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,orden,mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;

  -- ═══ E2E1 — PT DESDE RESULTADO (7800 = 4000 + 3800; +100 rechazado) ═══
  ptA := proc_fn_materializar_pt(e,resu,fmt,800,4000,NULL);
  ptB := proc_fn_materializar_pt(e,resu,fmt,760,3800,NULL);
  SELECT kg_disponible INTO kgd FROM proc_v_resultado_disponible WHERE resultado_id=resu;
  IF kgd<>0 THEN RAISE EXCEPTION 'E1: kg_disponible tras materializar=% (esp 0)', kgd; END IF;
  BEGIN PERFORM proc_fn_materializar_pt(e,resu,fmt,20,100,NULL);
    RAISE EXCEPTION 'FALLA E1: sobreasignación de PT permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E1%' THEN RAISE; END IF; END;

  -- ═══ E2E2 — PALLETIZACIÓN + INVARIANTE ═══
  A := proc_fn_crear_pallet(e,'PAL-A',tmp,pl,fmt,u1,NULL);
  B := proc_fn_crear_pallet(e,'PAL-B',tmp,pl,fmt,u1,NULL);
  PERFORM proc_fn_palletizar(e,ptA,A,400,2000,NULL);
  PERFORM proc_fn_palletizar(e,ptA,B,400,2000,NULL);  -- ptA on_hand 4000 -> 0
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=A;
  SELECT kg_lineas INTO s2 FROM proc_v_pallet_composicion WHERE pallet_id=A;
  IF s<>2000 OR s2<>2000 THEN RAISE EXCEPTION 'E2: invariante A físico=%/composición=% (esp 2000/2000)', s, s2; END IF;

  -- ═══ E2E3 — PALLET MIXTO (2 líneas mismo especie compatible) ═══
  Cc := proc_fn_crear_pallet(e,'PAL-MIX',tmp,pl,fmt,u1,NULL);
  PERFORM proc_fn_palletizar(e,ptB,Cc,100,500,NULL);
  PERFORM proc_fn_palletizar(e,ptB,Cc,100,500,NULL);  -- 2 líneas del mismo PT
  SELECT count(*) INTO nlin FROM proc_pallet_linea WHERE pallet_id=Cc AND estado='activa';
  IF nlin<2 THEN RAISE EXCEPTION 'E3: pallet mixto líneas=% (esp >=2)', nlin; END IF;

  -- ═══ E2E4 — TRASLADO (stock físico idéntico) ═══
  PERFORM proc_fn_trasladar_pallet(e,A,u2,NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=A;
  PERFORM 1 FROM proc_pallet WHERE id=A AND ubicacion_id=u2;
  IF NOT FOUND OR s<>2000 THEN RAISE EXCEPTION 'E4: traslado alteró stock (%) o ubicación', s; END IF;

  -- ═══ E2E5 — HOLD (reserva 200; físico 2000/reservado 200/libre 1800; liberar) ═══
  hid := proc_fn_hold_pallet(e,A,'reserva',200,'test',NULL);
  SELECT kg_fisico, reservado, disponible INTO s, s2, disp FROM proc_v_pallet_saldos WHERE pallet_id=A;
  IF s<>2000 OR s2<>200 OR disp<>1800 THEN RAISE EXCEPTION 'E5: hold físico=%/reserv=%/libre=% (esp 2000/200/1800)', s, s2, disp; END IF;
  PERFORM proc_fn_liberar_hold(e,hid,NULL);
  SELECT disponible INTO disp FROM proc_v_pallet_saldos WHERE pallet_id=A;
  IF disp<>2000 THEN RAISE EXCEPTION 'E5: tras liberar libre=% (esp 2000)', disp; END IF;
  -- hold que excede disponible -> rechazo
  BEGIN PERFORM proc_fn_hold_pallet(e,A,'bloqueo',9999,'x',NULL);
    RAISE EXCEPTION 'FALLA E5: hold > disponible permitido';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E5%' THEN RAISE; END IF; END;

  -- ═══ E2E6/7/8 — REPALETIZAJE N:M + PARCIAL + MULTI-LÍNEA (UAT-D-01) ═══
  -- A(2000)+B(2000) -> C(2500)+D(1500)  (parcial de B: 500 a C, 1500 a D)
  D := proc_fn_crear_pallet(e,'PAL-D',tmp,pl,fmt,u1,NULL);
  E5 := proc_fn_crear_pallet(e,'PAL-C2',tmp,pl,fmt,u1,NULL);
  PERFORM proc_fn_repaletizar(e,'merge','merge', jsonb_build_array(
    jsonb_build_object('origen_pallet_id',A,'pt_id',ptA,'cajas',400,'kg',2000,'destino_pallet_id',E5),
    jsonb_build_object('origen_pallet_id',B,'pt_id',ptA,'cajas',100,'kg',500,'destino_pallet_id',E5),
    jsonb_build_object('origen_pallet_id',B,'pt_id',ptA,'cajas',300,'kg',1500,'destino_pallet_id',D)
  ),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=E5;   -- C2 = 2500
  SELECT kg_fisico INTO s2 FROM proc_v_pallet_saldos WHERE pallet_id=D;   -- D = 1500
  IF s<>2500 OR s2<>1500 THEN RAISE EXCEPTION 'E6: repaletizaje C2=%/D=% (esp 2500/1500)', s, s2; END IF;
  SELECT kg_fisico INTO disp FROM proc_v_pallet_saldos WHERE pallet_id=A;  -- A consumido total = 0
  IF disp<>0 THEN RAISE EXCEPTION 'E6: A tras repaletizaje=% (esp 0)', disp; END IF;
  -- multi-línea UAT-D-01: C2 tiene 2 líneas del mismo PT (2000+500); mover 2200 (> línea mayor 2000)
  F := proc_fn_crear_pallet(e,'PAL-F',tmp,pl,fmt,u1,NULL);
  PERFORM proc_fn_repaletizar(e,'split','split', jsonb_build_array(
    jsonb_build_object('origen_pallet_id',E5,'pt_id',ptA,'cajas',440,'kg',2200,'destino_pallet_id',F)
  ),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=F;    -- F = 2200
  SELECT kg_fisico INTO s2 FROM proc_v_pallet_saldos WHERE pallet_id=E5;  -- C2 = 300
  IF s<>2200 OR s2<>300 THEN RAISE EXCEPTION 'E8/UAT-D-01: multi-línea F=%/C2=% (esp 2200/300)', s, s2; END IF;

  -- ═══ GENEALOGÍA ═══
  gen := proc_fn_pallet_genealogia(e,F);
  IF jsonb_array_length(gen->'lotes_origen')=0 THEN RAISE EXCEPTION 'GEN: F sin lotes de origen'; END IF;
  gen := proc_fn_pallet_genealogia(e,A);
  IF jsonb_array_length(gen->'forwards')=0 THEN RAISE EXCEPTION 'GEN: A sin descendientes (forwards)'; END IF;

  -- ═══ READ-MODELS ═══
  PERFORM 1 FROM proc_v_pt_operacional WHERE pt_id=ptA AND orden_folio='ORD-1' AND on_hand=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_pt_operacional ptA incorrecto'; END IF;
  PERFORM 1 FROM proc_v_pallet_bodega WHERE pallet_id=F AND kg_fisico=2200 AND especie_codigo='CHE';
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_pallet_bodega F incorrecto'; END IF;

  RAISE NOTICE 'proc_v7_4_f7_4_tests: PT/palletizar/invariante/hold/traslado/repaletizaje N:M+parcial+multilínea/genealogía/RM — TODOS PASARON ✓';
END $$;

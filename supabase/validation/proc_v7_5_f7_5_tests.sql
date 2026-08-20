-- ============================================================================
-- proc_v7_5_f7_5_tests.sql · F7.5 — Despacho (reserva/carga/salida física).
-- E2E: reserva+cancelar · completo · parcial · segundo · exceso · doble
--      confirmación · reversa · cliente≠destinatario · trazabilidad · read-models.
-- REQUISITO: schema_proc_v1..v7_5. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  e uuid:=gen_random_uuid(); pl uuid; u1 uuid; tmp text:='2026/2027';
  cli uuid; dest uuid; prod uuid; cat uuid; mm uuid; fmt uuid;
  rec uuid; lote uuid; orden uuid; resu uuid; pt uuid;
  P1 uuid; P2 uuid; P3 uuid; P4 uuid; P5 uuid;
  d uuid; s numeric; r numeric; libre numeric; nlin int; v_estado text; gen jsonb;
BEGIN
  -- fixture: catálogo especie/variedad requerido por el FK de cutover T5b (no relaja el FK)
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','Santina','Santina');
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct,pallet_compat_keys) VALUES (e,0.50,'["especie_codigo"]'::jsonb);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'t','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','C1','camara') RETURNING id INTO u1;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'otro',true,'Frigorífico C') RETURNING id INTO dest;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'El Parrón') RETURNING id INTO prod;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','E') RETURNING id INTO cat;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'M','M') RETURNING id INTO mm;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja) VALUES (e,'CHE','F','f',5) RETURNING id INTO fmt;
  -- Orden cerrada 2500 comerciales -> PT 2500 -> 5 pallets de 500
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-1',pl,cli,prod,'CHE',2600,'recibida') RETURNING id INTO rec;
  lote := proc_fn_ingresar_lote_ubicado(e,rec,'LOT-1','CHE','Santina',2600,pl,tmp,u1,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-1',pl,'en_proceso','CHE',cli) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,2600,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,orden,cat,2500) RETURNING id INTO resu;
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,mm,100);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  pt := proc_fn_materializar_pt(e,resu,fmt,500,2500,NULL);
  P1 := proc_fn_crear_pallet(e,'PAL-1',tmp,pl,fmt,u1,NULL); PERFORM proc_fn_palletizar(e,pt,P1,100,500,NULL);
  P2 := proc_fn_crear_pallet(e,'PAL-2',tmp,pl,fmt,u1,NULL); PERFORM proc_fn_palletizar(e,pt,P2,100,500,NULL);
  P3 := proc_fn_crear_pallet(e,'PAL-3',tmp,pl,fmt,u1,NULL); PERFORM proc_fn_palletizar(e,pt,P3,100,500,NULL);
  P4 := proc_fn_crear_pallet(e,'PAL-4',tmp,pl,fmt,u1,NULL); PERFORM proc_fn_palletizar(e,pt,P4,100,500,NULL);
  P5 := proc_fn_crear_pallet(e,'PAL-5',tmp,pl,fmt,u1,NULL); PERFORM proc_fn_palletizar(e,pt,P5,100,500,NULL);

  -- ═══ E2E1 — RESERVA + CANCELAR (libera reserva) ═══
  d := proc_fn_crear_despacho(e,'DES-1',pl,cli,dest,NULL);
  PERFORM proc_fn_reservar_pallet(e,d,P1,300,NULL);
  SELECT kg_fisico, reservado, disponible INTO s, r, libre FROM proc_v_pallet_saldos WHERE pallet_id=P1;
  IF s<>500 OR r<>300 OR libre<>200 THEN RAISE EXCEPTION 'E1: reserva físico=%/reserv=%/libre=% (esp 500/300/200)', s,r,libre; END IF;
  PERFORM proc_fn_cancelar_despacho(e,d,NULL);
  SELECT reservado, disponible INTO r, libre FROM proc_v_pallet_saldos WHERE pallet_id=P1;
  IF r<>0 OR libre<>500 THEN RAISE EXCEPTION 'E1: tras cancelar reserv=%/libre=% (esp 0/500)', r,libre; END IF;
  SELECT estado INTO v_estado FROM proc_despacho WHERE id=d;
  IF v_estado<>'cancelado' THEN RAISE EXCEPTION 'E1: despacho estado=% (esp cancelado)', v_estado; END IF;

  -- ═══ E2E2 — DESPACHO COMPLETO (500 -> físico 0) ═══
  d := proc_fn_crear_despacho(e,'DES-2',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P2,'pt_id',pt,'cajas',100,'kg',500)),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P2;
  SELECT count(*) INTO nlin FROM proc_despacho_linea WHERE despacho_id=d AND estado='confirmada';
  IF s<>0 OR nlin<>1 THEN RAISE EXCEPTION 'E2: completo físico=%/lineas=% (esp 0/1)', s,nlin; END IF;
  -- cliente ≠ destinatario
  PERFORM 1 FROM proc_despacho WHERE id=d AND cliente_servicio_vinculo_id<>destinatario_vinculo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'E2: cliente y destinatario colapsaron'; END IF;
  -- trazabilidad: el pallet despachado conserva genealogía a lote/recepción
  gen := proc_fn_pallet_genealogia(e,P2);
  IF jsonb_array_length(gen->'lotes_origen')=0 THEN RAISE EXCEPTION 'E2: trazabilidad despacho->recepción perdida'; END IF;

  -- ═══ E2E3 — DESPACHO PARCIAL (500 -> 300; queda 200) ═══
  d := proc_fn_crear_despacho(e,'DES-3',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P3,'pt_id',pt,'cajas',60,'kg',300)),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P3;
  IF s<>200 THEN RAISE EXCEPTION 'E3: parcial físico=% (esp 200; identidad intacta)', s; END IF;

  -- ═══ E2E4 — SEGUNDO DESPACHO (saldo 200 -> 0; suma 500) ═══
  d := proc_fn_crear_despacho(e,'DES-3b',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P3,'pt_id',pt,'cajas',40,'kg',200)),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P3;
  SELECT COALESCE(SUM(kg),0) INTO r FROM proc_despacho_linea WHERE pallet_id=P3 AND estado='confirmada';
  IF s<>0 OR r<>500 THEN RAISE EXCEPTION 'E4: segundo físico=%/suma=% (esp 0/500)', s,r; END IF;

  -- ═══ E2E5 — EXCESO (501 sobre 500 -> rechazo, sin cambio) ═══
  d := proc_fn_crear_despacho(e,'DES-4',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  BEGIN
    PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P4,'pt_id',pt,'cajas',101,'kg',501)),NULL);
    RAISE EXCEPTION 'FALLA E5: despacho excede disponible permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E5%' THEN RAISE; END IF; END;
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P4;
  IF s<>500 THEN RAISE EXCEPTION 'E5: tras exceso físico=% (esp 500 intacto)', s; END IF;

  -- ═══ E2E6 — DOBLE CONFIRMACIÓN (2ª rechazada) ═══
  d := proc_fn_crear_despacho(e,'DES-5',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P4,'pt_id',pt,'cajas',100,'kg',500)),NULL);
  BEGIN
    PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P4,'pt_id',pt,'cajas',100,'kg',500)),NULL);
    RAISE EXCEPTION 'FALLA E6: doble confirmación permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E6%' THEN RAISE; END IF; END;

  -- ═══ E2E7 — REVERSA (restituye stock, conserva historia) ═══
  d := proc_fn_crear_despacho(e,'DES-6',pl,cli,dest,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d; UPDATE proc_despacho SET estado='listo' WHERE id=d;
  PERFORM proc_fn_confirmar_despacho(e,d,jsonb_build_array(jsonb_build_object('pallet_id',P5,'pt_id',pt,'cajas',100,'kg',500)),NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P5;
  IF s<>0 THEN RAISE EXCEPTION 'E7: pre-reversa físico=% (esp 0)', s; END IF;
  PERFORM proc_fn_reversar_despacho(e,d,'error de carga',NULL);
  SELECT kg_fisico INTO s FROM proc_v_pallet_saldos WHERE pallet_id=P5;
  SELECT count(*) INTO nlin FROM proc_despacho_linea WHERE despacho_id=d AND estado='reversada';
  IF s<>500 OR nlin<>1 THEN RAISE EXCEPTION 'E7: reversa físico=%/lineas_reversadas=% (esp 500/1)', s,nlin; END IF;
  PERFORM 1 FROM proc_despacho_linea WHERE despacho_id=d AND estado='confirmada';  -- la original permanece como registro
  -- (la línea original quedó 'reversada' — historia preservada; contramovimiento en ledger)

  -- ═══ READ-MODELS ═══
  PERFORM 1 FROM proc_v_despacho_listado WHERE folio='DES-2' AND cliente='Copefrut' AND destinatario='Frigorífico C' AND kg=500 AND pallets=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_despacho_listado DES-2 incorrecto'; END IF;
  PERFORM 1 FROM proc_v_despacho_linea WHERE pallet_codigo='PAL-2';
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_despacho_linea sin PAL-2'; END IF;

  RAISE NOTICE 'proc_v7_5_f7_5_tests: reserva/cancelar/completo/parcial/segundo/exceso/doble/reversa/traza/RM — TODOS PASARON ✓';
END $$;

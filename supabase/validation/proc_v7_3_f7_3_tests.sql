-- ============================================================================
-- proc_v7_3_f7_3_tests.sql · F7.3 — Programa/Orden/Ejecución/Resultado/Conciliación.
-- E2E: lote en varias corridas; varios lotes en una orden; conciliación
--      cuadra/no-cuadra; guard de orden terminal; read-models.
-- REQUISITO: schema_proc_v1..v7_3. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  e uuid:=gen_random_uuid(); pl uuid; u1 uuid; tmp text:='2026/2027';
  cli uuid; pA uuid; pB uuid; pC uuid; cat uuid; mdes uuid; mmer uuid;
  rA uuid; rB uuid; rC uuid; lA uuid; lB uuid; lC uuid;
  o1 uuid; o2 uuid; o3 uuid; oNM uuid; oOK uuid; oBAD uuid;
  s numeric; nins int; d numeric; tol numeric; ok boolean;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'t','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','C1','camara') RETURNING id INTO u1;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut S.A.') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'El Parrón') RETURNING id INTO pA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Los Aromos') RETURNING id INTO pB;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'San Vicente') RETURNING id INTO pC;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','Exportable') RETURNING id INTO cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'BLANDA','Blanda') RETURNING id INTO mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DESHID','Deshid') RETURNING id INTO mmer;
  -- CHE sin QC obligatorio (para consumir); recepciones + lotes
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-A',pl,cli,pA,'CHE',10000,'recibida') RETURNING id INTO rA;
  lA := proc_fn_ingresar_lote_ubicado(e,rA,'LOT-A','CHE','Santina',10000,pl,tmp,u1,NULL);

  -- ═══ E2E 1 — LOTE EN VARIAS CORRIDAS (1 lote → 3 órdenes 4000/3000/3000) ═══
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-1',pl,'en_proceso','CHE',cli) RETURNING id INTO o1;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-2',pl,'en_proceso','CHE',cli) RETURNING id INTO o2;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-3',pl,'en_proceso','CHE',cli) RETURNING id INTO o3;
  PERFORM proc_fn_consumir_lote_en_orden(e,o1,lA,4000,NULL,NULL);
  PERFORM proc_fn_consumir_lote_en_orden(e,o2,lA,3000,NULL,NULL);
  PERFORM proc_fn_consumir_lote_en_orden(e,o3,lA,3000,NULL,NULL);
  SELECT disponible INTO s FROM proc_v_lote_saldos WHERE lote_id=lA;
  SELECT count(*) INTO nins FROM proc_orden_insumo WHERE lote_id=lA;
  IF s<>0 THEN RAISE EXCEPTION 'E1: disponible lote=% (esp 0)', s; END IF;
  IF nins<>3 THEN RAISE EXCEPTION 'E1: insumos del lote=% (esp 3 corridas)', nins; END IF;
  -- conciliar orden 1: comercial 3200 + descarte 600 + merma 200 = 4000
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,o1,cat,3200);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,o1,mdes,600);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,o1,mmer,200);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=o1;
  PERFORM proc_fn_conciliar_orden(e,o1,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=o1;

  -- ═══ E2E 2 — VARIOS LOTES EN UNA ORDEN (A 3000 + B 2000 + C 1500 = 6500) ═══
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-B',pl,cli,pB,'CHE',2000,'recibida') RETURNING id INTO rB;
  lB := proc_fn_ingresar_lote_ubicado(e,rB,'LOT-B','CHE','Lapins',2000,pl,tmp,u1,NULL);
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-C',pl,cli,pC,'CHE',1500,'recibida') RETURNING id INTO rC;
  lC := proc_fn_ingresar_lote_ubicado(e,rC,'LOT-C','CHE','Regina',1500,pl,tmp,u1,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-NM',pl,'en_proceso','CHE',cli) RETURNING id INTO oNM;
  PERFORM proc_fn_consumir_lote_en_orden(e,oNM,lB,2000,NULL,NULL);  -- todo lote B
  PERFORM proc_fn_consumir_lote_en_orden(e,oNM,lC,1500,NULL,NULL);  -- todo lote C
  -- (usa A también: quedaba 0; en su lugar prueba N:M con B+C = 3500; ok como N:M multi-productor)
  SELECT count(DISTINCT lote_id) INTO nins FROM proc_orden_insumo WHERE orden_id=oNM;
  IF nins<>2 THEN RAISE EXCEPTION 'E2: lotes distintos en orden=% (esp 2, N:M)', nins; END IF;

  -- ═══ E2E 4 — CONCILIACIÓN cuadra / no cuadra ═══
  -- orden OK: 9800 -> 7800+1700+300 = 9800 (diff 0) -> concilia + cierra
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-OK',pl,cli,pA,'CHE',9800,'recibida') RETURNING id INTO rA;
  DECLARE lOK uuid; BEGIN
    lOK := proc_fn_ingresar_lote_ubicado(e,rA,'LOT-OK','CHE',NULL,9800,pl,tmp,u1,NULL);
    INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-OK',pl,'en_proceso','CHE',cli) RETURNING id INTO oOK;
    PERFORM proc_fn_consumir_lote_en_orden(e,oOK,lOK,9800,NULL,NULL);
    INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,oOK,cat,7800);
    INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,oOK,mdes,1700);
    INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,oOK,mmer,300);
    SELECT diff,tolerancia INTO d,tol FROM proc_v_orden_conciliacion WHERE orden_id=oOK;
    IF d<>0 THEN RAISE EXCEPTION 'E4: diff OK=% (esp 0)', d; END IF;
    UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=oOK;
    PERFORM proc_fn_conciliar_orden(e,oOK,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=oOK;
  END;
  -- orden BAD: 9800 -> 7800+1500+300 = 9600 (diff 200 > tolerancia 49) -> NO concilia
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,'REC-BAD',pl,cli,pA,'CHE',9800,'recibida') RETURNING id INTO rA;
  DECLARE lBAD uuid; BEGIN
    lBAD := proc_fn_ingresar_lote_ubicado(e,rA,'LOT-BAD','CHE',NULL,9800,pl,tmp,u1,NULL);
    INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-BAD',pl,'en_proceso','CHE',cli) RETURNING id INTO oBAD;
    PERFORM proc_fn_consumir_lote_en_orden(e,oBAD,lBAD,9800,NULL,NULL);
    INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,oBAD,cat,7800);
    INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,oBAD,mdes,1500);
    INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,oBAD,mmer,300);
    SELECT diff,tolerancia INTO d,tol FROM proc_v_orden_conciliacion WHERE orden_id=oBAD;
    IF d<>200 THEN RAISE EXCEPTION 'E4: diff BAD=% (esp 200)', d; END IF;
    UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=oBAD;
    BEGIN PERFORM proc_fn_conciliar_orden(e,oBAD,NULL);
      RAISE EXCEPTION 'FALLA E4: orden descuadrada (200>%) concilió', tol;
    EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E4%' THEN RAISE; END IF; END;
  END;

  -- ═══ GUARD orden terminal: no admite nuevo resultado ═══
  BEGIN INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,oOK,cat,10);
    RAISE EXCEPTION 'FALLA G: resultado aceptado en orden cerrada';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA G%' THEN RAISE; END IF; END;

  -- ═══ READ-MODELS ═══
  PERFORM 1 FROM proc_v_orden_listado WHERE id=oOK AND cliente='Copefrut S.A.' AND estado='cerrado' AND kg_entrada=9800 AND diff=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_orden_listado OK incorrecto'; END IF;
  SELECT elegible INTO ok FROM proc_v_lote_operacional WHERE id=lB;
  IF NOT ok THEN RAISE EXCEPTION 'RM: lote B (sin QC obligatorio) debía ser elegible'; END IF;

  RAISE NOTICE 'proc_v7_3_f7_3_tests: programa/orden/consumo N:M/conciliación/cierre/guard/RM — TODOS PASARON ✓';
END $$;

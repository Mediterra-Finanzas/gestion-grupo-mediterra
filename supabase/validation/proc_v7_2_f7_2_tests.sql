-- ============================================================================
-- proc_v7_2_f7_2_tests.sql · F7.2 — Recepción + QC + Lotes + gate QC→proceso.
-- E2E: QC ok→consumible; QC rechazado→existencia intacta pero NO consumible;
--      QC obligatorio no ejecutado→no consumible; sin QC obligatorio→consumible.
-- REQUISITO: schema_proc_v1..v7_f7_1 + v7_2_f7_2. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  e uuid := gen_random_uuid(); pl uuid; u1 uuid; tmp text := '2026/2027';
  cli uuid; prod uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; l1 uuid; l2 uuid; l3 uuid; l4 uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid; fol text; s numeric; eleg jsonb; nins int; nlist int;
BEGIN
  -- fixture: catálogo especie/variedad requerido por el FK de cutover T5b (no relaja el FK)
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','Santina','Santina');
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'2026/2027','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO u1;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut S.A.') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Agrícola El Parrón') RETURNING id INTO prod;
  -- CHE: QC firmeza OBLIGATORIO BLOQUEANTE 60-90 ; PLU: sin QC obligatorio
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,rango_max,severidad,obligatorio)
    VALUES (e,'CHE','firmeza','Firmeza','numero',60,90,'bloqueante',true);

  -- ── Correlativo desde backend (no React) ──
  fol := proc_fn_siguiente_correlativo(e,tmp,'REC');
  IF fol <> 'REC-2627-000001' THEN RAISE EXCEPTION 'F72-COR: folio=% (esp REC-2627-000001)', fol; END IF;

  -- ═══ ESCENARIO A — QC OK → CONSUMIBLE ═══
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,dueno_fruta_vinculo_id,especie_codigo,variedad_codigo,kg_bruto,tara,kg_neto,estado)
    VALUES (e,fol,pl,cli,prod,prod,'CHE','Santina',10200,200,10000,'recibida') RETURNING id INTO r1;
  PERFORM proc_fn_registrar_qc(e,r1,'{"firmeza":"72"}'::jsonb,NULL);  -- aprobado
  l1 := proc_fn_ingresar_lote_ubicado(e,r1,proc_fn_siguiente_correlativo(e,tmp,'LOT'),'CHE','Santina',10000,pl,tmp,u1,NULL);
  -- ledger entrada / saldo físico
  SELECT on_hand INTO s FROM proc_v_lote_saldos WHERE lote_id=l1;
  IF s <> 10000 THEN RAISE EXCEPTION 'A: saldo físico=% (esp 10000)', s; END IF;
  eleg := proc_fn_lote_elegible(e,l1);
  IF NOT (eleg->>'elegible')::boolean THEN RAISE EXCEPTION 'A: lote debía ser elegible, motivo=%', eleg->>'motivo'; END IF;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'ORD-A',pl,'en_proceso','CHE') RETURNING id INTO o1;
  PERFORM proc_fn_consumir_lote_en_orden(e,o1,l1,5000,NULL,NULL);  -- DEBE pasar
  SELECT count(*) INTO nins FROM proc_orden_insumo WHERE orden_id=o1;
  IF nins <> 1 THEN RAISE EXCEPTION 'A: consumo no registrado (insumos=%)', nins; END IF;

  -- ═══ ESCENARIO B — QC RECHAZADO → EXISTE FÍSICAMENTE PERO NO CONSUMIBLE ═══
  r2 := gen_random_uuid();
  INSERT INTO proc_recepcion(empresa_id,id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,r2,proc_fn_siguiente_correlativo(e,tmp,'REC'),pl,cli,prod,'CHE',8000,'recibida');
  PERFORM proc_fn_registrar_qc(e,r2,'{"firmeza":"40"}'::jsonb,NULL);  -- bloqueante fuera -> rechazado
  l2 := proc_fn_ingresar_lote_ubicado(e,r2,proc_fn_siguiente_correlativo(e,tmp,'LOT'),'CHE',NULL,8000,pl,tmp,u1,NULL);
  SELECT on_hand INTO s FROM proc_v_lote_saldos WHERE lote_id=l2;
  IF s <> 8000 THEN RAISE EXCEPTION 'B: la fruta debe existir físicamente (saldo=% esp 8000)', s; END IF;  -- existencia intacta
  eleg := proc_fn_lote_elegible(e,l2);
  IF (eleg->>'elegible')::boolean OR eleg->>'motivo' <> 'QC rechazado' THEN RAISE EXCEPTION 'B: elegibilidad incorrecta: %', eleg; END IF;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'ORD-B',pl,'en_proceso','CHE') RETURNING id INTO o2;
  BEGIN
    PERFORM proc_fn_consumir_lote_en_orden(e,o2,l2,1000,NULL,NULL);
    RAISE EXCEPTION 'FALLA B: se consumió un lote con QC rechazado';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA B%' THEN RAISE; END IF; END;
  -- tras el bloqueo, la existencia sigue intacta y sin consumo
  SELECT on_hand INTO s FROM proc_v_lote_saldos WHERE lote_id=l2;
  SELECT count(*) INTO nins FROM proc_orden_insumo WHERE orden_id=o2;
  IF s <> 8000 OR nins <> 0 THEN RAISE EXCEPTION 'B: post-bloqueo saldo=%/insumos=% (esp 8000/0)', s, nins; END IF;

  -- ═══ ESCENARIO C — QC OBLIGATORIO NO EJECUTADO → NO CONSUMIBLE ═══
  r3 := gen_random_uuid();
  INSERT INTO proc_recepcion(empresa_id,id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,r3,proc_fn_siguiente_correlativo(e,tmp,'REC'),pl,cli,prod,'CHE',5000,'recibida');  -- CHE sin registrar QC
  l3 := proc_fn_ingresar_lote_ubicado(e,r3,proc_fn_siguiente_correlativo(e,tmp,'LOT'),'CHE',NULL,5000,pl,tmp,u1,NULL);
  eleg := proc_fn_lote_elegible(e,l3);
  IF (eleg->>'elegible')::boolean OR eleg->>'motivo' <> 'QC obligatorio no ejecutado' THEN RAISE EXCEPTION 'C: elegibilidad incorrecta: %', eleg; END IF;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'ORD-C',pl,'en_proceso','CHE') RETURNING id INTO o3;
  BEGIN
    PERFORM proc_fn_consumir_lote_en_orden(e,o3,l3,500,NULL,NULL);
    RAISE EXCEPTION 'FALLA C: se consumió con QC obligatorio no ejecutado';
  EXCEPTION WHEN check_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA C%' THEN RAISE; END IF; END;

  -- ═══ ESCENARIO D — SIN QC OBLIGATORIO CONFIGURADO → CONSUMIBLE SIN QC ═══
  r4 := gen_random_uuid();
  INSERT INTO proc_recepcion(empresa_id,id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (e,r4,proc_fn_siguiente_correlativo(e,tmp,'REC'),pl,cli,prod,'PLU',3000,'recibida');  -- PLU sin QC obligatorio
  l4 := proc_fn_ingresar_lote_ubicado(e,r4,proc_fn_siguiente_correlativo(e,tmp,'LOT'),'PLU',NULL,3000,pl,tmp,u1,NULL);
  eleg := proc_fn_lote_elegible(e,l4);
  IF NOT (eleg->>'elegible')::boolean THEN RAISE EXCEPTION 'D: PLU sin QC obligatorio debía ser elegible: %', eleg; END IF;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'ORD-D',pl,'en_proceso','PLU') RETURNING id INTO o4;
  PERFORM proc_fn_consumir_lote_en_orden(e,o4,l4,1000,NULL,NULL);  -- DEBE pasar
  SELECT count(*) INTO nins FROM proc_orden_insumo WHERE orden_id=o4;
  IF nins <> 1 THEN RAISE EXCEPTION 'D: consumo sin QC obligatorio no registrado'; END IF;

  -- ═══ NEGATIVOS: kg inválido + ubicación inválida ═══
  BEGIN PERFORM proc_fn_ingresar_lote_ubicado(e,r1,'LOT-X','CHE',NULL,0,pl,tmp,u1,NULL);
    RAISE EXCEPTION 'FALLA N1: kg<=0 aceptado';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;
  BEGIN PERFORM proc_fn_ingresar_lote_ubicado(e,r1,'LOT-Y','CHE',NULL,10,pl,tmp,gen_random_uuid(),NULL);
    RAISE EXCEPTION 'FALLA N2: ubicación inexistente aceptada';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF; END;

  -- ═══ READ-MODELS DE LISTADO ═══
  SELECT count(*) INTO nlist FROM proc_v_recepcion_listado WHERE empresa_id=e;
  IF nlist <> 4 THEN RAISE EXCEPTION 'RM: recepciones listadas=% (esp 4)', nlist; END IF;
  PERFORM 1 FROM proc_v_recepcion_listado WHERE id=r1 AND cliente='Copefrut S.A.' AND productor='Agrícola El Parrón' AND qc_resultado='aprobado' AND lotes=1;
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: recepción R1 sin nombres/QC/lotes correctos'; END IF;
  PERFORM 1 FROM proc_v_lote_listado WHERE id=l2 AND on_hand=8000 AND qc_resultado='rechazado';
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: lote L2 sin saldo/QC correctos'; END IF;

  RAISE NOTICE 'proc_v7_2_f7_2_tests: recepción+QC+lote+gate QC+read-models — TODOS PASARON ✓';
END $$;

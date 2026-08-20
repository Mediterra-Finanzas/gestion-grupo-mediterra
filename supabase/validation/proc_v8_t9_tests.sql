-- proc_v8_t9_tests.sql · T9 genealogía + read-models de origen. Superuser. REQ: v1..v7_7 + v8_t1..t9.
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; uA uuid; cli uuid; vProd uuid; pred uuid; cu uuid;
  rec uuid; lote uuid; o1 uuid; res uuid; pt uuid; pallet uuid; gen jsonb; row jsonb; txt text; n int;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.5);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO uA;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','Exp');
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina');
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Exportadora Los Andes SpA','cliente_servicio') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,csg_sag) VALUES (e,true,'Agrícola Las Nieves SpA','productor','12345') RETURNING id INTO vProd;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,codigo,nombre,csg_sag) VALUES (e,vProd,'P1','Fundo Santa Elena','P-987') RETURNING id INTO pred;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,pred,'C-01','CHE','SANTINA') RETURNING id INTO cu;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,cliente_servicio_vinculo_id) VALUES (e,'REC-1',1000,cli) RETURNING id INTO rec;

  -- ingreso de lote CON origen (productor/predio/cuartel)
  lote := proc_fn_ingresar_lote_ubicado(e,rec,'L-1','CHE','SANTINA',1000,pl,'2025/2026',uA,NULL,vProd,pred,cu);
  -- orden → consume → resultado → conciliar → cerrar → PT → pallet
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo) VALUES (e,'O-1',pl,'en_proceso','2025-12-10','CHE') RETURNING id INTO o1;
  PERFORM proc_fn_consumir_lote_en_orden(e,o1,lote,1000,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,o1,(SELECT id FROM proc_categorias_calidad WHERE empresa_id=e AND codigo='EXP'),1000) RETURNING id INTO res;
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=o1;
  PERFORM proc_fn_conciliar_orden(e,o1,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=o1;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja,activo) VALUES (e,'CHE','F','F',5,true);
  pt := proc_fn_materializar_pt(e,res,(SELECT id FROM proc_formato WHERE empresa_id=e AND codigo='F'),200,1000,NULL);
  pallet := proc_fn_crear_pallet(e,'PAL-1','2025/2026',pl,(SELECT id FROM proc_formato WHERE empresa_id=e AND codigo='F'),uA,NULL);
  PERFORM proc_fn_palletizar(e,pt,pallet,200,1000,NULL);

  -- T9a: genealogía llega hasta el origen agrícola (desde el snapshot del lote)
  gen := proc_fn_pallet_genealogia(e,pallet);
  row := gen->'lotes_origen'->0;
  IF row->>'productor' <> 'Agrícola Las Nieves SpA' THEN RAISE EXCEPTION 'T9a productor: %', row; END IF;
  IF row->>'cuartel' <> 'C-01' THEN RAISE EXCEPTION 'T9a cuartel: %', row; END IF;
  IF row->>'variedad' <> 'Santina' THEN RAISE EXCEPTION 'T9a variedad: %', row; END IF;
  IF row->>'productor_csg' <> '12345' THEN RAISE EXCEPTION 'T9a csg: %', row; END IF;
  IF row->>'cliente' <> 'Exportadora Los Andes SpA' THEN RAISE EXCEPTION 'T9a cliente (dim comercial paralela): %', row; END IF;

  -- T9b: snapshot congela — cambiar el nombre del productor NO cambia la genealogía histórica
  UPDATE proc_vinculo SET nombre_provisional='CAMBIADO' WHERE id=vProd;
  gen := proc_fn_pallet_genealogia(e,pallet);
  IF gen->'lotes_origen'->0->>'productor' <> 'Agrícola Las Nieves SpA' THEN RAISE EXCEPTION 'T9b: genealogía debía usar el snapshot congelado'; END IF;

  -- T9c: read-model proc_v_lote_origen
  SELECT cuartel INTO txt FROM proc_v_lote_origen WHERE id=lote; IF txt <> 'C-01' THEN RAISE EXCEPTION 'T9c lote_origen cuartel: %', txt; END IF;
  SELECT productor INTO txt FROM proc_v_lote_origen WHERE id=lote; IF txt <> 'Agrícola Las Nieves SpA' THEN RAISE EXCEPTION 'T9c lote_origen productor (snapshot): %', txt; END IF;

  -- T9d: read-model contractual
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cli,'advertencia');
  SELECT (estado_contractual->>'nivel') INTO txt FROM proc_v_cliente_contractual WHERE cliente_vinculo_id=cli;
  IF txt <> 'advertencia' THEN RAISE EXCEPTION 'T9d contractual nivel (sin contrato, política advertencia): %', txt; END IF;

  RAISE NOTICE 'proc_* T9 genealogía+read-models: TODOS LOS TESTS PASARON';
END $$;

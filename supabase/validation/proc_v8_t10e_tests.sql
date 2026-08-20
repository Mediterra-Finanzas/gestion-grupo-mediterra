-- proc_v8_t10e_tests.sql · T10e read-models de listado (QC por lote, sin multiplicación).
-- REQ: v1..v7_7 + v8_t1..t9 + v8_t10c_qc + v8_t10c_masa + v8_t10d + v8_t10e. Superuser.
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; u uuid; cli uuid; p1 uuid; pred uuid; cuar uuid;
  rec uuid; lCHE uuid; lPLU uuid; n int; res text; prodn text; predn text; cvid uuid; niv text;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct,tolerancia_recepcion_pct) VALUES (e,0.5,0.5);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,csg_sag) VALUES (e,'productor',true,'El Parrón','12.345') RETURNING id INTO p1;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,nombre) VALUES (e,p1,'Fundo Los Aromos') RETURNING id INTO pred;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina'),(e,'PLU','DAGEN','DAgen');
  INSERT INTO proc_cuartel(empresa_id,predio_id,especie_codigo,variedad_codigo,codigo) VALUES (e,pred,'CHE','SANTINA','Q1') RETURNING id INTO cuar;
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,severidad,obligatorio,activo) VALUES
    (e,'CHE','BRIX','Brix','numero',16,'bloqueante',true,true),(e,'PLU','BRIX','Brix','numero',14,'bloqueante',true,true);

  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,productor_vinculo_id)
    VALUES (e,'REC-1',5000,'CHE',cli,p1) RETURNING id INTO rec;
  lCHE := proc_fn_ingresar_lote_ubicado(e,rec,'L-CHE','CHE','SANTINA',3000,pl,'2025/2026',u,NULL,p1,pred,cuar);
  lPLU := proc_fn_ingresar_lote_ubicado(e,rec,'L-PLU','PLU','DAGEN',2000,pl,'2025/2026',u,NULL,p1,pred,NULL);
  -- QC: header aprobado + CHE aprobado + PLU rechazado (mezcla)
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18"}'::jsonb,NULL,NULL);
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18"}'::jsonb,NULL,lCHE);
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"10"}'::jsonb,NULL,lPLU);

  -- E-BE-1: proc_v_lote_listado NO multiplica (exactamente 2 filas para la recepción)
  SELECT count(*) INTO n FROM proc_v_lote_listado WHERE recepcion_id=rec;
  IF n <> 2 THEN RAISE EXCEPTION 'T10e-1: lote_listado debía tener 2 filas (sin multiplicar), got %',n; END IF;

  -- E-BE-2: QC por lote resuelto correctamente (propio, no header)
  SELECT qc_resultado INTO res FROM proc_v_lote_listado WHERE id=lCHE;
  IF res <> 'aprobado' THEN RAISE EXCEPTION 'T10e-2: L-CHE QC propio debía ser aprobado, got %',res; END IF;
  SELECT qc_resultado INTO res FROM proc_v_lote_listado WHERE id=lPLU;
  IF res <> 'rechazado' THEN RAISE EXCEPTION 'T10e-2: L-PLU QC propio debía ser rechazado, got %',res; END IF;

  -- E-BE-3: productor a nivel LOTE (snapshot) + ids de filtrado presentes
  SELECT productor, predio, productor_vinculo_id, cliente_vinculo_id INTO prodn, predn, cvid, cvid
    FROM proc_v_lote_listado WHERE id=lCHE;
  IF prodn IS NULL OR prodn = '' THEN RAISE EXCEPTION 'T10e-3: productor del lote no resuelto'; END IF;
  SELECT predio_id INTO cvid FROM proc_v_lote_listado WHERE id=lCHE;
  IF cvid <> pred THEN RAISE EXCEPTION 'T10e-3: predio_id filtrable debía ser el del lote'; END IF;
  SELECT cliente_vinculo_id INTO cvid FROM proc_v_lote_listado WHERE id=lCHE;
  IF cvid <> cli THEN RAISE EXCEPTION 'T10e-3: cliente_vinculo_id filtrable incorrecto'; END IF;

  -- E-BE-4: proc_v_recepcion_listado NO multiplica (1 fila) + resumen QC por lote
  SELECT count(*) INTO n FROM proc_v_recepcion_listado WHERE id=rec;
  IF n <> 1 THEN RAISE EXCEPTION 'T10e-4: recepcion_listado debía tener 1 fila (sin multiplicar), got %',n; END IF;
  SELECT qc_rechazados INTO n FROM proc_v_recepcion_listado WHERE id=rec;
  IF n <> 1 THEN RAISE EXCEPTION 'T10e-4: qc_rechazados esperado 1, got %',n; END IF;
  SELECT qc_aprobados INTO n FROM proc_v_recepcion_listado WHERE id=rec;
  IF n <> 1 THEN RAISE EXCEPTION 'T10e-4: qc_aprobados esperado 1, got %',n; END IF;
  IF NOT (SELECT qc_mixto FROM proc_v_recepcion_listado WHERE id=rec) THEN RAISE EXCEPTION 'T10e-4: qc_mixto debía ser true (aprobado+rechazado)'; END IF;
  IF (SELECT lotes FROM proc_v_recepcion_listado WHERE id=rec) <> 2 THEN RAISE EXCEPTION 'T10e-4: lotes esperado 2'; END IF;

  -- E-BE-5: qc_resultado de la recepción = header (no multiplica, no inventa veredicto)
  SELECT qc_resultado INTO res FROM proc_v_recepcion_listado WHERE id=rec;
  IF res <> 'aprobado' THEN RAISE EXCEPTION 'T10e-5: qc header de la recepción esperado aprobado, got %',res; END IF;

  -- E-BE-6: nivel_contractual filtrable (sin ficha → info) + masa flag presente
  SELECT nivel_contractual INTO niv FROM proc_v_recepcion_listado WHERE id=rec;
  IF niv <> 'info' THEN RAISE EXCEPTION 'T10e-6: sin ficha nivel esperado info, got %',niv; END IF;

  RAISE NOTICE 'proc_* T10e read-models (QC por lote, sin multiplicación): TODOS LOS TESTS PASARON';
END $$;

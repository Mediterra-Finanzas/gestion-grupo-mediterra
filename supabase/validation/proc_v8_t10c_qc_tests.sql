-- proc_v8_t10c_qc_tests.sql · T10c-QC por lote. Superuser. REQ: v1..v7_7 + v8_t1..t9 + v8_t10c_qc.
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; uA uuid; rec uuid; rec2 uuid;
  lCheA uuid; lCheB uuid; lPlu uuid; lCheC uuid; lOtra uuid; o1 uuid; n int; el jsonb; res text;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.5);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO uA;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina'),(e,'PLU','DAGEN','DAgen');
  -- QC params bloqueantes+obligatorios por especie
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,severidad,obligatorio,activo) VALUES
    (e,'CHE','BRIX','Brix','numero',16,'bloqueante',true,true),
    (e,'PLU','BRIX','Brix','numero',14,'bloqueante',true,true);
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'REC-1',11000,'CHE') RETURNING id INTO rec;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'REC-2',1000,'CHE') RETURNING id INTO rec2;
  lCheA := proc_fn_ingresar_lote_ubicado(e,rec,'L-CHE-A','CHE','SANTINA',4000,pl,'2025/2026',uA,NULL);
  lCheB := proc_fn_ingresar_lote_ubicado(e,rec,'L-CHE-B','CHE','SANTINA',3000,pl,'2025/2026',uA,NULL);
  lPlu  := proc_fn_ingresar_lote_ubicado(e,rec,'L-PLU','PLU','DAGEN',   2000,pl,'2025/2026',uA,NULL);
  lCheC := proc_fn_ingresar_lote_ubicado(e,rec,'L-CHE-C','CHE','SANTINA',2000,pl,'2025/2026',uA,NULL);
  lOtra := proc_fn_ingresar_lote_ubicado(e,rec2,'L-OTRA','CHE','SANTINA',1000,pl,'2025/2026',uA,NULL);

  -- QC por lote: CheA aprobado (Brix 18), CheB rechazado (Brix 12), Plu rechazado (Brix 10). CheC sin QC.
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18"}'::jsonb,NULL,lCheA);
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"12"}'::jsonb,NULL,lCheB);
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"10"}'::jsonb,NULL,lPlu);

  -- QC-1: Cereza aprobada consumible; Ciruela rechazada no consumible
  el := proc_fn_lote_elegible(e,lCheA); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'QC-1: CheA debía ser elegible: %',el; END IF;
  el := proc_fn_lote_elegible(e,lPlu);  IF (el->>'elegible')::bool IS NOT FALSE THEN RAISE EXCEPTION 'QC-1: Plu rechazado debía NO ser elegible'; END IF;

  -- QC-2: dos lotes misma especie, independientes
  el := proc_fn_lote_elegible(e,lCheB); IF (el->>'elegible')::bool IS NOT FALSE THEN RAISE EXCEPTION 'QC-2: CheB rechazado debía NO ser elegible'; END IF;
  -- (CheA elegible ya verificado) → independencia OK

  -- GATE de consumo usa el QC por lote: consumir CheA OK, CheB bloqueado
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo) VALUES (e,'O1',pl,'en_proceso','2025-12-10','CHE') RETURNING id INTO o1;
  PERFORM proc_fn_consumir_lote_en_orden(e,o1,lCheA,1000,NULL,NULL);   -- aprobado → OK
  BEGIN PERFORM proc_fn_consumir_lote_en_orden(e,o1,lCheB,1000,NULL,NULL);   -- rechazado → gate bloquea
    RAISE EXCEPTION 'FALLA QC-gate: se consumió un lote con QC rechazado';
  EXCEPTION WHEN check_violation THEN NULL;  -- gate bloqueó (ERRCODE check_violation) = OK
           WHEN raise_exception THEN RAISE;  -- la sentinela FALLA propaga = test falla
  END;

  -- QC-3: QC rechazado NO elimina saldo físico
  SELECT disponible INTO n FROM proc_v_lote_saldos WHERE lote_id=lCheB AND empresa_id=e;
  IF n <> 3000 THEN RAISE EXCEPTION 'QC-3: CheB rechazado debía conservar 3000 kg físicos, got %',n; END IF;

  -- QC-4: modificar parámetro posteriormente NO cambia el resultado histórico
  UPDATE proc_qc_parametro SET rango_min=5 WHERE empresa_id=e AND especie_codigo='CHE' AND codigo='BRIX';
  el := proc_fn_lote_elegible(e,lCheB); IF (el->>'elegible')::bool IS NOT FALSE THEN RAISE EXCEPTION 'QC-4: resultado histórico rechazado no debía cambiar por editar el parámetro'; END IF;
  SELECT resultado INTO res FROM proc_qc_recepcion WHERE recepcion_id=rec AND lote_id=lCheB; IF res <> 'rechazado' THEN RAISE EXCEPTION 'QC-4: resultado guardado debía seguir rechazado, got %',res; END IF;
  UPDATE proc_qc_parametro SET rango_min=16 WHERE empresa_id=e AND especie_codigo='CHE' AND codigo='BRIX';

  -- QC-5: lote con obligatorio no ejecutado (sin QC) → no elegible
  el := proc_fn_lote_elegible(e,lCheC); IF (el->>'elegible')::bool IS NOT FALSE OR el->>'motivo' <> 'QC obligatorio no ejecutado' THEN RAISE EXCEPTION 'QC-5: CheC sin QC obligatorio debía NO ser elegible: %',el; END IF;

  -- NEG-1: registrar QC de un lote que NO pertenece a la recepción
  BEGIN PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18"}'::jsonb,NULL,lOtra);
    RAISE EXCEPTION 'FALLA NEG-1: QC de lote de otra recepción permitido';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA NEG-1%' THEN RAISE; END IF; END;

  -- NEG-2: duplicado activo (INSERT directo de 2do QC de lote) → unique parcial
  BEGIN INSERT INTO proc_qc_recepcion(empresa_id,recepcion_id,lote_id,valores,resultado) VALUES (e,rec,lCheA,'{}'::jsonb,'aprobado');
    RAISE EXCEPTION 'FALLA NEG-2: QC duplicado por lote permitido';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA NEG-2%' THEN RAISE; END IF; END;

  -- upsert: re-registrar QC del mismo lote actualiza (no duplica)
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"20"}'::jsonb,NULL,lCheA);
  SELECT count(*) INTO n FROM proc_qc_recepcion WHERE recepcion_id=rec AND lote_id=lCheA AND deleted_at IS NULL;
  IF n <> 1 THEN RAISE EXCEPTION 'upsert: debía haber 1 QC por lote, got %',n; END IF;

  -- resumen QC por recepción (read-model)
  SELECT lotes_aprobados INTO n FROM proc_v_qc_recepcion_resumen WHERE recepcion_id=rec;
  IF n < 1 THEN RAISE EXCEPTION 'resumen QC: debía contar aprobados'; END IF;

  -- fallback header: QC header aplica a un lote sin QC propio
  DECLARE rec3 uuid; lH uuid;
  BEGIN
    INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'REC-3',1000,'CHE') RETURNING id INTO rec3;
    lH := proc_fn_ingresar_lote_ubicado(e,rec3,'L-H','CHE','SANTINA',1000,pl,'2025/2026',uA,NULL);
    PERFORM proc_fn_registrar_qc(e,rec3,'{"BRIX":"18"}'::jsonb,NULL,NULL);   -- QC header aprobado
    el := proc_fn_lote_elegible(e,lH); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'fallback header: lote sin QC propio debía usar header aprobado'; END IF;
  END;

  RAISE NOTICE 'proc_* T10c-QC por lote: TODOS LOS TESTS PASARON';
END $$;

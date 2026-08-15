-- proc_v8_t4_tests.sql · T4 origen por lote + snapshot. Superuser. REQ: v1..v7_7 + v8_t1..t4.
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; uA uuid; rec uuid;
  vN uuid; vM uuid; predN uuid; predM uuid; cC1 uuid; cC2 uuid; cN4 uuid;
  lA uuid; lB uuid; lC uuid; lLeg uuid; snap jsonb; txt text; n int;
BEGIN
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO uA;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina'),(e,'CHE','REGINA','Regina'),(e,'CHE','LAPINS','Lapins');
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,csg_sag) VALUES (e,true,'Agrícola Las Nieves SpA','productor','12345') RETURNING id INTO vN;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,csg_sag) VALUES (e,true,'Agrícola El Molino SpA','productor','67890') RETURNING id INTO vM;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,codigo,nombre,csg_sag) VALUES (e,vN,'PN','Fundo Santa Elena','P-987') RETURNING id INTO predN;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,codigo,nombre,csg_sag) VALUES (e,vM,'PM','Fundo El Molino','P-654') RETURNING id INTO predM;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predN,'C-01','CHE','SANTINA') RETURNING id INTO cC1;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predN,'C-02','CHE','REGINA') RETURNING id INTO cC2;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predM,'N-04','CHE','LAPINS') RETURNING id INTO cN4;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (e,'REC-001',9000) RETURNING id INTO rec;

  -- §12 CARGA MIXTA: 1 recepción → 3 lotes de distinto origen
  lA := proc_fn_ingresar_lote_ubicado(e,rec,'L-A','CHE','SANTINA',4000,pl,'2025/2026',uA,NULL,vN,predN,cC1);
  lB := proc_fn_ingresar_lote_ubicado(e,rec,'L-B','CHE','REGINA', 3000,pl,'2025/2026',uA,NULL,vN,predN,cC2);
  lC := proc_fn_ingresar_lote_ubicado(e,rec,'L-C','CHE','LAPINS', 2000,pl,'2025/2026',uA,NULL,vM,predM,cN4);
  SELECT count(*) INTO n FROM proc_lote WHERE recepcion_id=rec; IF n<>3 THEN RAISE EXCEPTION 'T4 mixta: esperaba 3 lotes, got %',n; END IF;
  SELECT count(DISTINCT productor_vinculo_id) INTO n FROM proc_lote WHERE recepcion_id=rec; IF n<>2 THEN RAISE EXCEPTION 'T4 mixta: 2 productores distintos, got %',n; END IF;

  -- snapshot correcto por lote
  SELECT origen_snapshot INTO snap FROM proc_lote WHERE id=lA;
  IF snap->'productor'->>'nombre' <> 'Agrícola Las Nieves SpA' OR snap->'productor'->>'csg_sag' <> '12345'
     OR snap->'cuartel'->>'codigo' <> 'C-01' OR snap->'variedad'->>'codigo' <> 'SANTINA'
     OR snap->'predio'->>'csg_sag' <> 'P-987' THEN RAISE EXCEPTION 'T4: snapshot lote A incorrecto: %', snap; END IF;

  -- §10 INMUTABILIDAD: editar origen_snapshot → error
  BEGIN UPDATE proc_lote SET origen_snapshot = '{"hack":true}'::jsonb WHERE id=lA;
    RAISE EXCEPTION 'FALLA T4 inmut: se pudo editar origen_snapshot';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T4 inmut%' THEN RAISE; END IF; END;

  -- SNAPSHOT congela: cambiar nombre del productor NO altera el snapshot histórico (D3/TEST12)
  UPDATE proc_vinculo SET nombre_provisional='Nombre Cambiado' WHERE id=vN;
  SELECT origen_snapshot->'productor'->>'nombre' INTO txt FROM proc_lote WHERE id=lA;
  IF txt <> 'Agrícola Las Nieves SpA' THEN RAISE EXCEPTION 'T4 congelado: snapshot cambió a %', txt; END IF;
  -- la FK CURRENT sí refleja el cambio (navegación)
  SELECT v.nombre_provisional INTO txt FROM proc_lote l JOIN proc_vinculo v ON v.id=l.productor_vinculo_id WHERE l.id=lA;
  IF txt <> 'Nombre Cambiado' THEN RAISE EXCEPTION 'T4: FK CURRENT debía reflejar el nombre nuevo'; END IF;

  -- COMPAT: llamada legacy de 10 args (sin productor/predio/cuartel) sigue funcionando.
  -- Snapshot parcial: incluye especie/variedad (del catálogo) pero NO productor/predio/cuartel.
  lLeg := proc_fn_ingresar_lote_ubicado(e,rec,'L-LEG','CHE','SANTINA',500,pl,'2025/2026',uA,NULL);
  SELECT origen_snapshot INTO snap FROM proc_lote WHERE id=lLeg;
  IF snap->'especie'->>'codigo' <> 'CHE' OR (snap ? 'productor') THEN RAISE EXCEPTION 'T4 compat: snapshot legacy debía tener especie sin productor: %', snap; END IF;
  IF (SELECT productor_vinculo_id FROM proc_lote WHERE id=lLeg) IS NOT NULL THEN RAISE EXCEPTION 'T4 compat: lote legacy no debe tener productor FK'; END IF;

  RAISE NOTICE 'proc_* T4 origen por lote + snapshot: TODOS LOS TESTS PASARON';
END $$;

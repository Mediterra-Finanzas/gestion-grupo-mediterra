-- proc_v8_t5_tests.sql · T5 backfill conservador + reporte. Superuser. REQ: v1..v7_7 + v8_t1..t5.
DO $$
DECLARE e uuid := gen_random_uuid(); vProd uuid; pred uuid; rec uuid; lLeg uuid; snap jsonb; rep jsonb; n int;
BEGIN
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina');
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,csg_sag) VALUES (e,true,'Agrícola Las Nieves SpA','productor','12345') RETURNING id INTO vProd;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,codigo,nombre,csg_sag) VALUES (e,vProd,'P1','Fundo Santa Elena','P-987') RETURNING id INTO pred;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,productor_vinculo_id,predio_id,variedad_codigo,especie_codigo)
    VALUES (e,'REC-LEG',1000,vProd,pred,'SANTINA','CHE') RETURNING id INTO rec;

  -- lote "legacy": origen en cabecera, sin snapshot en el lote
  INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,rec,'L-LEG','CHE','SANTINA') RETURNING id INTO lLeg;
  SELECT origen_snapshot INTO snap FROM proc_lote WHERE id=lLeg; IF snap IS NOT NULL THEN RAISE EXCEPTION 'T5 precond: lote legacy debía tener snapshot null'; END IF;

  -- T5a: backfill conservador reconstruye snapshot desde la cabecera; cuartel = no informado
  rep := proc_fn_backfill_lote_origen(e, NULL);
  SELECT origen_snapshot INTO snap FROM proc_lote WHERE id=lLeg;
  IF snap->'productor'->>'nombre' <> 'Agrícola Las Nieves SpA' THEN RAISE EXCEPTION 'T5a: backfill no copió productor: %', snap; END IF;
  IF snap->>'cuartel' <> 'no informado' THEN RAISE EXCEPTION 'T5a: cuartel debía ser "no informado", got %', snap->>'cuartel'; END IF;
  IF (snap->>'origen_reconstruido')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'T5a: falta marca origen_reconstruido'; END IF;
  IF (SELECT origen_reconstruido FROM proc_lote WHERE id=lLeg) IS NOT TRUE THEN RAISE EXCEPTION 'T5a: flag columna'; END IF;
  IF (SELECT productor_vinculo_id FROM proc_lote WHERE id=lLeg) <> vProd THEN RAISE EXCEPTION 'T5a: FK productor no seteada'; END IF;

  -- T5b: idempotencia — re-correr no re-toca los ya reconstruidos
  rep := proc_fn_backfill_lote_origen(e, NULL);
  IF (rep->>'reconstruidos')::int <> 0 THEN RAISE EXCEPTION 'T5b: backfill no idempotente (%)', rep->>'reconstruidos'; END IF;

  -- T5c: reporte de migración
  SELECT reconstruidos INTO n FROM proc_v_lote_origen_migracion WHERE empresa_id=e;
  IF n < 1 THEN RAISE EXCEPTION 'T5c: reporte debía contar reconstruidos'; END IF;

  RAISE NOTICE 'proc_* T5 backfill+reporte: TODOS LOS TESTS PASARON';
END $$;

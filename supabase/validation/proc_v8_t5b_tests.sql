-- proc_v8_t5b_tests.sql · T5b CUTOVER integridad Especie→Variedad en Lote.
-- REQ: v1..v7_7 + v8_t1..t5 + v8_t5b. Superuser. Presupone catálogo sembrado.
DO $$
DECLARE e uuid := gen_random_uuid(); rec uuid;
BEGIN
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina');
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (e,'R',100) RETURNING id INTO rec;

  -- T5b-1: lote con especie/variedad catalogadas → OK
  INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,rec,'L-OK','CHE','SANTINA');

  -- T5b-2: variedad NO catalogada → FK rechaza (integridad D7 activa)
  BEGIN INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,rec,'L-BAD','CHE','NOEXISTE');
    RAISE EXCEPTION 'FALLA T5b-2: variedad no catalogada permitida';
  EXCEPTION WHEN foreign_key_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T5b-2%' THEN RAISE; END IF; END;

  -- T5b-3: variedad NULL (sólo especie) permitida (MATCH SIMPLE)
  INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,rec,'L-SOLOESP','CHE',NULL);

  RAISE NOTICE 'proc_* T5b integridad cutover: TODOS LOS TESTS PASARON';
END $$;

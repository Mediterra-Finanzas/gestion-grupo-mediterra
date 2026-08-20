-- proc_v8_t6_tests.sql · T6 Ficha Cliente Service. Superuser. REQ: v1..v7_7 + v8_t1..t6.
DO $$
DECLARE e uuid := gen_random_uuid(); cli uuid; n int;
BEGIN
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Exportadora Los Andes SpA','cliente_servicio') RETURNING id INTO cli;

  -- T6a: ficha 1:1 con política contractual
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,responsable_comercial,email,politica_contrato)
    VALUES (e,cli,'Angelo Huerta','ventas@losandes.cl','bloqueante');
  SELECT count(*) INTO n FROM proc_cliente_ficha WHERE empresa_id=e AND cliente_vinculo_id=cli; IF n<>1 THEN RAISE EXCEPTION 'T6a got %',n; END IF;

  -- T6b: 1:1 — segunda ficha para el mismo cliente → unique
  BEGIN INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id) VALUES (e,cli);
    RAISE EXCEPTION 'FALLA T6b: ficha duplicada permitida';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T6b%' THEN RAISE; END IF; END;

  -- T6c: política inválida → CHECK
  BEGIN INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cli2','cliente_servicio');
    INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato)
      SELECT e,id,'inventada' FROM proc_vinculo WHERE empresa_id=e AND nombre_provisional='Cli2';
    RAISE EXCEPTION 'FALLA T6c: política inválida permitida';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T6c%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_* T6 ficha cliente: TODOS LOS TESTS PASARON';
END $$;

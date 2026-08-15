-- proc_v8_t3_tests.sql · T3 Cliente↔Productor N:M. Superuser. REQ: v1..v7_7 + v8_t1..t3.
DO $$
DECLARE e uuid := gen_random_uuid(); cA uuid; cB uuid; p1 uuid; p2 uuid; p3 uuid; p4 uuid; n int;
BEGIN
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES
    (e,true,'Cliente A','cliente_servicio') RETURNING id INTO cA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cliente B','cliente_servicio') RETURNING id INTO cB;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Prod 1','productor') RETURNING id INTO p1;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Prod 2','productor') RETURNING id INTO p2;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Prod 3','productor') RETURNING id INTO p3;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Prod 4','productor') RETURNING id INTO p4;

  -- TEST 1: Cliente A → Prod 1,2,3
  INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id) VALUES (e,cA,p1),(e,cA,p2),(e,cA,p3);
  -- TEST 2: Cliente B → Prod 2,4 (Prod 2 es la MISMA entidad, reutilizada)
  INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id) VALUES (e,cB,p2),(e,cB,p4);

  SELECT count(*) INTO n FROM proc_cliente_productor WHERE empresa_id=e AND cliente_vinculo_id=cA; IF n<>3 THEN RAISE EXCEPTION 'T3: A esperaba 3, got %',n; END IF;
  SELECT count(*) INTO n FROM proc_cliente_productor WHERE empresa_id=e AND productor_vinculo_id=p2; IF n<>2 THEN RAISE EXCEPTION 'T3: Prod2 en 2 clientes, got %',n; END IF;

  -- T3c: par duplicado → unique
  BEGIN INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id) VALUES (e,cA,p1);
    RAISE EXCEPTION 'FALLA T3c: par duplicado permitido';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T3c%' THEN RAISE; END IF; END;

  -- T3d: cliente=productor → CHECK
  BEGIN INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id) VALUES (e,cA,cA);
    RAISE EXCEPTION 'FALLA T3d: cliente=productor permitido';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T3d%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_* T3 cliente↔productor: TODOS LOS TESTS PASARON';
END $$;

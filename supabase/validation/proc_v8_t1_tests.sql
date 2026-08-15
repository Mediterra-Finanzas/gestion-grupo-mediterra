-- proc_v8_t1_tests.sql · T1 catálogos Especie/Variedad. Superuser. REQ: v1..v7_7 + v8_t1.
DO $$
DECLARE e uuid := gen_random_uuid(); n int;
BEGIN
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'ARA','Arándano');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES
    (e,'CHE','SANTINA','Santina'),(e,'CHE','REGINA','Regina'),(e,'ARA','SEKOYA','Sekoya Pop');

  -- T1a: variedad válida cuelga de su especie
  SELECT count(*) INTO n FROM proc_variedad WHERE empresa_id=e AND especie_codigo='CHE';
  IF n<>2 THEN RAISE EXCEPTION 'T1a: esperaba 2 variedades de CHE, got %', n; END IF;

  -- T1b: variedad con especie inexistente → FK error
  BEGIN INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'XXX','V','V');
    RAISE EXCEPTION 'FALLA T1b: variedad con especie inexistente permitida';
  EXCEPTION WHEN foreign_key_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T1b%' THEN RAISE; END IF; END;

  -- T1c: variedad duplicada (misma especie+codigo) → unique error
  BEGIN INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','dup');
    RAISE EXCEPTION 'FALLA T1c: variedad duplicada permitida';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T1c%' THEN RAISE; END IF; END;

  -- T1d: mismo codigo de variedad en OTRA especie es válido (Santina no colisiona entre especies)
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'PLU','SANTINA','Santina Ciruela');
  SELECT count(*) INTO n FROM proc_variedad WHERE empresa_id=e AND codigo='SANTINA';
  IF n<>2 THEN RAISE EXCEPTION 'T1d: SANTINA debe existir en CHE y PLU (2), got %', n; END IF;

  -- T1e: especie duplicada → unique error
  BEGIN INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','dup');
    RAISE EXCEPTION 'FALLA T1e: especie duplicada permitida';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T1e%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_* T1 especie/variedad: TODOS LOS TESTS PASARON';
END $$;

-- proc_v8_t2_tests.sql · T2 Productor/Predio/Cuartel. Superuser. REQ: v1..v7_7 + v8_t1 + v8_t2.
DO $$
DECLARE e uuid := gen_random_uuid(); vProd uuid; pred uuid; n int;
BEGIN
  -- catálogo T1
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'ARA','Arándano');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES
    (e,'CHE','SANTINA','Santina'),(e,'ARA','SEKOYA','Sekoya');

  -- productor con rut/csg
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,rut,csg_sag)
    VALUES (e,true,'Agrícola Las Nieves SpA','productor','76.123.456-7','12345') RETURNING id INTO vProd;
  -- predio del productor con csg/comuna/superficie
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,codigo,nombre,csg_sag,comuna,region,superficie_ha)
    VALUES (e,vProd,'P1','Fundo Santa Elena','P-987','Rengo','O''Higgins',45.5) RETURNING id INTO pred;

  -- T2a: cuartel válido (variedad pertenece a la especie)
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,nombre,superficie_ha,especie_codigo,variedad_codigo)
    VALUES (e,pred,'C-01','Cuartel 1',10.0,'CHE','SANTINA');
  SELECT count(*) INTO n FROM proc_cuartel WHERE empresa_id=e AND predio_id=pred; IF n<>1 THEN RAISE EXCEPTION 'T2a got %',n; END IF;

  -- T2b: cuartel con variedad que NO pertenece a la especie → FK error (integridad especie→variedad)
  BEGIN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,pred,'C-X','CHE','SEKOYA');
    RAISE EXCEPTION 'FALLA T2b: cuartel CHE/SEKOYA (SEKOYA es de ARA) permitido';
  EXCEPTION WHEN foreign_key_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T2b%' THEN RAISE; END IF; END;

  -- T2c: cuartel con predio inexistente → FK error
  BEGIN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,gen_random_uuid(),'C-Y','CHE','SANTINA');
    RAISE EXCEPTION 'FALLA T2c: cuartel con predio inexistente permitido';
  EXCEPTION WHEN foreign_key_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T2c%' THEN RAISE; END IF; END;

  -- T2d: cuartel duplicado en el mismo predio → unique
  BEGIN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,pred,'C-01','CHE','SANTINA');
    RAISE EXCEPTION 'FALLA T2d: cuartel duplicado permitido';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T2d%' THEN RAISE; END IF; END;

  -- T2e: extensiones de identidad presentes
  SELECT count(*) INTO n FROM proc_vinculo WHERE id=vProd AND rut IS NOT NULL AND csg_sag='12345'; IF n<>1 THEN RAISE EXCEPTION 'T2e productor rut/csg'; END IF;
  SELECT count(*) INTO n FROM proc_predios WHERE id=pred AND csg_sag='P-987' AND comuna='Rengo' AND superficie_ha=45.5 AND activo=true; IF n<>1 THEN RAISE EXCEPTION 'T2e predio ext'; END IF;

  RAISE NOTICE 'proc_* T2 productor/predio/cuartel: TODOS LOS TESTS PASARON';
END $$;

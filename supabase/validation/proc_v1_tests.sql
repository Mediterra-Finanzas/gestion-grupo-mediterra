-- ============================================================================
-- proc_v1_tests.sql · Tests NEGATIVOS de invariantes proc_* (F1)
-- ----------------------------------------------------------------------------
-- Verifican que operaciones inválidas SEAN RECHAZADAS. Cada bloque espera un
-- error; si la operación inválida tiene éxito, el test FALLA (RAISE EXCEPTION).
--
-- REQUISITO: schema_proc_v1.sql aplicado en una DB de staging (+ DEV-ONLY RLS
-- para poder insertar como anon). NO ejecutado por este proyecto (SQL es draft).
-- Ejecutar en staging: psql "$STAGING_URL" -f supabase/validation/proc_v1_tests.sql
-- ============================================================================
DO $$
DECLARE v_emp uuid := gen_random_uuid(); v_rec uuid; v_lote uuid; v_mov uuid; v_ok boolean;
BEGIN
  -- 1. Vínculo XOR: grupo + auxiliar simultáneos → RECHAZA
  BEGIN
    INSERT INTO proc_vinculo(empresa_id, grupo_empresa_id, auxiliar_id, rol_operacional)
    VALUES (v_emp, gen_random_uuid(), gen_random_uuid(), 'cliente_servicio');
    RAISE EXCEPTION 'FALLA T1: vínculo con doble identidad fue aceptado';
  EXCEPTION WHEN check_violation OR foreign_key_violation THEN NULL; END;

  -- 2. Vínculo pendiente sin nombre_provisional → RECHAZA
  BEGIN
    INSERT INTO proc_vinculo(empresa_id, pendiente_alta_corporativa, rol_operacional)
    VALUES (v_emp, true, 'productor');
    RAISE EXCEPTION 'FALLA T2: vínculo pendiente sin nombre fue aceptado';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 3. Recepción kg_neto <= 0 → RECHAZA
  BEGIN
    INSERT INTO proc_recepcion(empresa_id, folio, kg_neto) VALUES (v_emp, 'R-T3', 0);
    RAISE EXCEPTION 'FALLA T3: recepción con kg_neto 0 fue aceptada';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 4. Recepción kg_neto > kg_bruto → RECHAZA
  BEGIN
    INSERT INTO proc_recepcion(empresa_id, folio, kg_bruto, kg_neto) VALUES (v_emp, 'R-T4', 100, 200);
    RAISE EXCEPTION 'FALLA T4: recepción neto>bruto fue aceptada';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- 5. Movimiento cantidad <= 0 → RECHAZA
  BEGIN
    INSERT INTO proc_movimiento(empresa_id, tipo_movimiento, naturaleza, objeto_tipo, objeto_id, cantidad)
    VALUES (v_emp, 'recepcion', 'entrada', 'lote', gen_random_uuid(), 0);
    RAISE EXCEPTION 'FALLA T5: movimiento con cantidad 0 fue aceptado';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Preparar un lote con ingreso para tests 6-8
  INSERT INTO proc_recepcion(empresa_id, folio, kg_neto) VALUES (v_emp, 'R-OK', 10000) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote(v_emp, v_rec, 'L-OK', 'CHE', NULL, 10000, NULL, NULL, NULL);
  SELECT id INTO v_mov FROM proc_movimiento WHERE objeto_id = v_lote AND naturaleza='entrada' LIMIT 1;

  -- 6. Ledger append-only: UPDATE → RECHAZA
  BEGIN
    UPDATE proc_movimiento SET cantidad = 9800 WHERE id = v_mov;
    RAISE EXCEPTION 'FALLA T6: UPDATE del ledger fue permitido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLA T6%' THEN RAISE; END IF;  -- re-lanza sólo si es la falla, no el bloqueo esperado
  END;

  -- 7. Ledger append-only: DELETE → RECHAZA
  BEGIN
    DELETE FROM proc_movimiento WHERE id = v_mov;
    RAISE EXCEPTION 'FALLA T7: DELETE del ledger fue permitido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLA T7%' THEN RAISE; END IF;
  END;

  -- 8. Consumo > disponible → RECHAZA
  BEGIN
    PERFORM proc_fn_registrar_consumo(v_emp, v_lote, 12000, NULL, NULL, NULL);
    RAISE EXCEPTION 'FALLA T8: consumo de 12000 sobre 10000 fue permitido';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'FALLA T8%' THEN RAISE; END IF;
  END;

  -- 9. Consumo válido reduce disponible; reconstrucción del ledger == vista
  PERFORM proc_fn_registrar_consumo(v_emp, v_lote, 3000, NULL, NULL, NULL);
  SELECT (disponible = 7000) INTO v_ok FROM proc_v_lote_saldos WHERE lote_id = v_lote;
  IF NOT v_ok THEN RAISE EXCEPTION 'FALLA T9: disponible esperado 7000 tras consumo de 3000'; END IF;

  RAISE NOTICE 'proc_v1_tests: TODOS LOS TESTS NEGATIVOS PASARON ✓';
END $$;

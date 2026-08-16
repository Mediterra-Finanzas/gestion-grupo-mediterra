-- proc_v8_t10c_masa_tests.sql · T10c-MASA conciliación de masa. Superuser.
-- REQ: v1..v7_7 + v8_t1..t9 + v8_t10c_qc + v8_t10c_masa.
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; u uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r8 uuid; r9 uuid; res jsonb; est text; v jsonb;
  fn_borrador text := 'borrador';
BEGIN
  INSERT INTO proc_empresa_config(empresa_id) VALUES (e);   -- tolerancia_recepcion_pct=0.50 default
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO u;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina');

  -- helper: crear recepción en borrador
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R1',9000,'CHE',fn_borrador) RETURNING id INTO r1;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R2',9000,'CHE',fn_borrador) RETURNING id INTO r2;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R3',9000,'CHE',fn_borrador) RETURNING id INTO r3;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R4',9000,'CHE',fn_borrador) RETURNING id INTO r4;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R5',9000,'CHE',fn_borrador) RETURNING id INTO r5;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,estado) VALUES (e,'R9',9000,'CHE',fn_borrador) RETURNING id INTO r9;

  -- ── MASS-1: neto 9000 / lotes 9000 → cierre PASS ──────────────────────────
  PERFORM proc_fn_ingresar_lote_ubicado(e,r1,'L1','CHE','SANTINA',9000,pl,'2025/2026',u,NULL);
  res := proc_fn_cerrar_recepcion(e,r1,NULL);
  SELECT estado INTO est FROM proc_recepcion WHERE id=r1;
  IF est <> 'recibida' THEN RAISE EXCEPTION 'MASS-1: recepción exacta debía cerrar a recibida, got %',est; END IF;
  IF (res->>'kg_lotes')::numeric <> 9000 THEN RAISE EXCEPTION 'MASS-1: kg_lotes esperado 9000, got %',res->>'kg_lotes'; END IF;

  -- ── MASS-2: neto 9000 / lotes 8500 en borrador → permitido (no se bloquea) ─
  PERFORM proc_fn_ingresar_lote_ubicado(e,r2,'L2','CHE','SANTINA',8500,pl,'2025/2026',u,NULL);
  SELECT estado INTO est FROM proc_recepcion WHERE id=r2;
  IF est <> 'borrador' THEN RAISE EXCEPTION 'MASS-2: captura incompleta debía quedar en borrador, got %',est; END IF;
  SELECT to_jsonb(x) INTO v FROM proc_v_recepcion_conciliacion x WHERE recepcion_id=r2;
  IF (v->>'diferencia')::numeric <> 500 OR (v->>'dentro_tolerancia')::bool IS NOT FALSE THEN
    RAISE EXCEPTION 'MASS-2: read-model debía mostrar 500 pendientes fuera de tolerancia: %',v; END IF;

  -- ── MASS-3: neto 9000 / lotes 8500 → cerrar RECHAZA (500 > 45) ────────────
  PERFORM proc_fn_ingresar_lote_ubicado(e,r3,'L3','CHE','SANTINA',8500,pl,'2025/2026',u,NULL);
  BEGIN res := proc_fn_cerrar_recepcion(e,r3,NULL);
    RAISE EXCEPTION 'MASS-3: cierre con faltante fuera de tolerancia debió rechazarse';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;
  SELECT estado INTO est FROM proc_recepcion WHERE id=r3;
  IF est <> 'borrador' THEN RAISE EXCEPTION 'MASS-3: recepción rechazada debía quedar en borrador, got %',est; END IF;

  -- ── MASS-4: neto 9000 / lotes 9500 (exceso) → cerrar RECHAZA ──────────────
  PERFORM proc_fn_ingresar_lote_ubicado(e,r4,'L4a','CHE','SANTINA',5000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_ingresar_lote_ubicado(e,r4,'L4b','CHE','SANTINA',4500,pl,'2025/2026',u,NULL);
  BEGIN res := proc_fn_cerrar_recepcion(e,r4,NULL);
    RAISE EXCEPTION 'MASS-4: cierre con exceso fuera de tolerancia debió rechazarse';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;
  SELECT estado INTO est FROM proc_recepcion WHERE id=r4;
  IF est <> 'borrador' THEN RAISE EXCEPTION 'MASS-4: recepción con exceso debía quedar en borrador, got %',est; END IF;

  -- ── MASS-5: diferencia dentro de tolerancia (30 ≤ 45) → cierre PASS ───────
  PERFORM proc_fn_ingresar_lote_ubicado(e,r5,'L5','CHE','SANTINA',8970,pl,'2025/2026',u,NULL);
  res := proc_fn_cerrar_recepcion(e,r5,NULL);
  SELECT estado INTO est FROM proc_recepcion WHERE id=r5;
  IF est <> 'recibida' THEN RAISE EXCEPTION 'MASS-5: diferencia dentro de tolerancia debía cerrar, got %',est; END IF;

  -- ── MASS-6: cross-tenant → empresa equivocada NO encuentra la recepción ───
  BEGIN res := proc_fn_cerrar_recepcion(gen_random_uuid(), r9, NULL);
    RAISE EXCEPTION 'MASS-6: cerrar con empresa ajena debió fallar (no encontrada)';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'MASS-6:%' THEN RAISE; END IF; END;

  -- ── MASS-7: doble cierre secuencial → 2do cierre RECHAZA (ya finalizada) ──
  BEGIN res := proc_fn_cerrar_recepcion(e,r1,NULL);   -- r1 ya está recibida (MASS-1)
    RAISE EXCEPTION 'MASS-7: re-cerrar una recepción ya finalizada debió rechazarse';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;

  -- ── MASS-8: legacy 'recibida' (creada directo) NO se re-concilia ─────────
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'R8',9000,'CHE') RETURNING id INTO r8; -- default recibida
  PERFORM proc_fn_ingresar_lote_ubicado(e,r8,'L8','CHE','SANTINA',1,pl,'2025/2026',u,NULL); -- 1 kg: descuadre brutal
  BEGIN res := proc_fn_cerrar_recepcion(e,r8,NULL);
    RAISE EXCEPTION 'MASS-8: no debe poder cerrar una recepción legacy ya recibida';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;
  SELECT estado INTO est FROM proc_recepcion WHERE id=r8;
  IF est <> 'recibida' THEN RAISE EXCEPTION 'MASS-8: legacy recibida debía permanecer intacta, got %',est; END IF;

  -- ── MASS-9: sin lotes → cerrar RECHAZA (sin kilos que conciliar) ─────────
  BEGIN res := proc_fn_cerrar_recepcion(e,r9,NULL);
    RAISE EXCEPTION 'MASS-9: cerrar recepción sin lotes debió rechazarse';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;
  SELECT estado INTO est FROM proc_recepcion WHERE id=r9;
  IF est <> 'borrador' THEN RAISE EXCEPTION 'MASS-9: recepción sin lotes debía quedar en borrador, got %',est; END IF;

  RAISE NOTICE 'proc_* T10c-MASA conciliación: TODOS LOS TESTS PASARON';
END $$;

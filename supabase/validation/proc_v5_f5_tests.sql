-- ============================================================================
-- proc_v5_f5_tests.sql · F5 — E2E (Regla 17) + negativos (Regla 16).
-- REQUISITO: schema_proc_v1..v5 aplicados. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  v_emp uuid := gen_random_uuid();
  v_planta uuid; v_uA uuid; v_cat uuid; v_mdes uuid; v_mmer uuid; v_rec uuid; v_lote uuid;
  v_o1 uuid; v_o2 uuid; v_cli uuid; v_inf uuid; v_v1 uuid; v_v2 uuid; v_dest uuid;
  v_pack numeric; v_kgp numeric; v_kgc numeric; v_nf int; v_snap1 jsonb; v_email1 text;
BEGIN
  -- Setup F1-F3
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (v_emp,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (v_emp,'P1','Planta') RETURNING id INTO v_planta;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (v_emp,v_planta,'A','Cámara A','camara') RETURNING id INTO v_uA;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (v_emp,'EXP','Exportable') RETURNING id INTO v_cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (v_emp,'CAL','Cal') RETURNING id INTO v_mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (v_emp,'DESH','Desh') RETURNING id INTO v_mmer;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,contacto_operacional)
    VALUES (v_emp,true,'Exportadora X','cliente_servicio','{"email":"x@export.cl"}'::jsonb) RETURNING id INTO v_cli;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (v_emp,'R1',10000) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,'L1','CHE',NULL,10000,v_planta,'2026/2027',v_uA,NULL);

  -- Orden O1: consume 1000 → 900 comercial + 100 descarte (packout 90%)
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado) VALUES (v_emp,'O1',v_planta,'en_proceso') RETURNING id INTO v_o1;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_o1,v_lote,1000,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (v_emp,v_o1,v_cat,900);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_o1,v_mdes,100);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o1;
  PERFORM proc_fn_conciliar_orden(v_emp,v_o1,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_o1;

  -- Orden O2: consume 9000 → 6300 comercial + 2700 descarte (packout 70%)
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado) VALUES (v_emp,'O2',v_planta,'en_proceso') RETURNING id INTO v_o2;
  PERFORM proc_fn_consumir_lote_en_orden(v_emp,v_o2,v_lote,9000,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (v_emp,v_o2,v_cat,6300);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (v_emp,v_o2,v_mdes,2700);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o2;
  PERFORM proc_fn_conciliar_orden(v_emp,v_o2,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_o2;

  -- ── F5 ──
  v_inf := proc_fn_crear_informe(v_emp,'RP-2026-000001','2026/2027',v_planta,v_cli,NULL);

  -- Negativo: generar versión con orden no cerrada (crear O3 en borrador)
  DECLARE v_o3 uuid;
  BEGIN
    INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado) VALUES (v_emp,'O3',v_planta,'borrador') RETURNING id INTO v_o3;
    BEGIN PERFORM proc_fn_generar_version(v_emp,v_inf,ARRAY[v_o3],NULL,'v',NULL);
      RAISE EXCEPTION 'FALLA N1: versión con orden no cerrada permitida';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N1%' THEN RAISE; END IF; END;
  END;

  -- Negativo: fuente duplicada (misma orden dos veces)
  BEGIN PERFORM proc_fn_generar_version(v_emp,v_inf,ARRAY[v_o1,v_o1],NULL,'dup',NULL);
    RAISE EXCEPTION 'FALLA N2: fuente duplicada permitida';
  EXCEPTION
    WHEN unique_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N2%' THEN RAISE; END IF;
  END;

  -- Generar versión 1 con O1+O2 → consolidación PONDERADA (72%, no 80%)
  v_v1 := proc_fn_generar_version(v_emp,v_inf,ARRAY[v_o1,v_o2],'Buen proceso','emisión inicial',NULL);
  SELECT kg_procesados, kg_comerciales, packout INTO v_kgp, v_kgc, v_pack FROM proc_informe_version WHERE id=v_v1;
  IF v_kgp<>10000 OR v_kgc<>7200 THEN RAISE EXCEPTION 'E1: kg proc=% com=% (esperado 10000/7200)', v_kgp, v_kgc; END IF;
  IF v_pack<>0.72 THEN RAISE EXCEPTION 'E1: packout esperado 0.72 (ponderado), got % (¿promedio 0.80?)', v_pack; END IF;
  SELECT count(*) INTO v_nf FROM proc_informe_fuente WHERE version_id=v_v1;
  IF v_nf<>2 THEN RAISE EXCEPTION 'E1: fuentes esperadas 2, got %', v_nf; END IF;

  -- Destinatario (snapshot de contacto) + emitir
  v_dest := proc_fn_agregar_destinatario(v_emp,v_v1,v_cli,NULL);
  SELECT email_snapshot INTO v_email1 FROM proc_informe_destinatario WHERE id=v_dest;
  IF v_email1<>'x@export.cl' THEN RAISE EXCEPTION 'E2: snapshot email esperado x@export.cl, got %', v_email1; END IF;
  PERFORM proc_fn_emitir_version(v_emp,v_v1,'informes/RP-2026-000001-v1.pdf',NULL);
  IF (SELECT estado FROM proc_informe_version WHERE id=v_v1)<>'emitida' THEN RAISE EXCEPTION 'E2: v1 no quedó emitida'; END IF;
  SELECT snapshot INTO v_snap1 FROM proc_informe_version WHERE id=v_v1;

  -- Registrar envío (queda 'pendiente' — email real gated)
  PERFORM proc_fn_registrar_envio(v_emp,v_v1,v_dest,'email','x@export.cl',NULL);
  IF (SELECT estado FROM proc_informe_envio WHERE version_id=v_v1 LIMIT 1)<>'pendiente' THEN RAISE EXCEPTION 'E3: envío no quedó pendiente'; END IF;

  -- Negativo: editar snapshot de versión emitida (inmutable)
  BEGIN UPDATE proc_informe_version SET kg_comerciales=9999 WHERE id=v_v1;
    RAISE EXCEPTION 'FALLA N3: versión emitida fue editable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA N3%' THEN RAISE; END IF; END;

  -- Modificar dato maestro CURRENT (email del vínculo) → snapshot v1 NO cambia
  UPDATE proc_vinculo SET contacto_operacional='{"email":"NUEVO@export.cl"}'::jsonb WHERE id=v_cli;
  IF (SELECT email_snapshot FROM proc_informe_destinatario WHERE id=v_dest)<>'x@export.cl' THEN
    RAISE EXCEPTION 'E4: snapshot de destinatario cambió con el maestro (debía congelarse)'; END IF;

  -- Nueva versión 2 (v1 permanece intacta y consultable)
  v_v2 := proc_fn_generar_version(v_emp,v_inf,ARRAY[v_o1,v_o2],NULL,'corrección observaciones',NULL);
  PERFORM proc_fn_emitir_version(v_emp,v_v2,'informes/RP-2026-000001-v2.pdf',NULL);
  IF (SELECT estado FROM proc_informe_version WHERE id=v_v1)<>'reemplazada' THEN RAISE EXCEPTION 'E5: v1 no quedó reemplazada'; END IF;
  IF (SELECT estado FROM proc_informe_version WHERE id=v_v2)<>'emitida' THEN RAISE EXCEPTION 'E5: v2 no quedó emitida'; END IF;
  IF (SELECT snapshot FROM proc_informe_version WHERE id=v_v1) IS DISTINCT FROM v_snap1 THEN RAISE EXCEPTION 'E5: snapshot de v1 cambió'; END IF;
  IF (SELECT count(*) FROM proc_informe_version WHERE informe_id=v_inf)<>2 THEN RAISE EXCEPTION 'E5: no hay 2 versiones trazables'; END IF;

  RAISE NOTICE 'proc_v5_f5_tests: END-TO-END + NEGATIVOS — TODOS PASARON ✓';
END $$;

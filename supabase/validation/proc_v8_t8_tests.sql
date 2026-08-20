-- proc_v8_t8_tests.sql · T8 gates contractuales. Superuser. REQ: v1..v7_7 + v8_t1..t8.
DO $$
DECLARE e uuid := gen_random_uuid(); td uuid; cA uuid; cB uuid; cC uuid; cD uuid; ct uuid; g jsonb; hoy date := '2026-01-15';
BEGIN
  INSERT INTO proc_tipo_documento_contractual(empresa_id,codigo,nombre,satisface_requisito_contractual) VALUES (e,'CONTRATO','Contrato',true) RETURNING id INTO td;
  -- Clientes + fichas con distinta política
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cli A','cliente_servicio') RETURNING id INTO cA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cli B','cliente_servicio') RETURNING id INTO cB;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cli C','cliente_servicio') RETURNING id INTO cC;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cli D','cliente_servicio') RETURNING id INTO cD;
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES
    (e,cA,'bloqueante'),(e,cB,'informativo'),(e,cC,'bloqueante'),(e,cD,'bloqueante');

  -- A: contrato vigente firmado que cubre hoy
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,estado,fecha_inicio,fecha_termino,fecha_firma)
    VALUES (e,cA,'CT-A',td,'borrador','2025-07-01','2026-06-30','2025-07-02') RETURNING id INTO ct;
  UPDATE proc_cliente_contrato SET estado='pendiente_firma' WHERE id=ct; UPDATE proc_cliente_contrato SET estado='vigente' WHERE id=ct;
  -- D: contrato VENCIDO (fecha_termino pasada)
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,estado,fecha_inicio,fecha_termino,fecha_firma)
    VALUES (e,cD,'CT-D',td,'borrador','2024-07-01','2024-12-31','2024-07-02') RETURNING id INTO ct;
  UPDATE proc_cliente_contrato SET estado='pendiente_firma' WHERE id=ct; UPDATE proc_cliente_contrato SET estado='vigente' WHERE id=ct;

  -- TEST 16: A vigente → habilitado, nivel ok
  g := proc_fn_cliente_habilitado_para_operar(e,cA,hoy,'proceso');
  IF (g->>'habilitado')::boolean IS NOT TRUE OR g->>'nivel' <> 'ok' THEN RAISE EXCEPTION 'TEST16 A: %', g; END IF;

  -- TEST 17: B informativo sin contrato → habilitado en proceso, nivel informativo
  g := proc_fn_cliente_habilitado_para_operar(e,cB,hoy,'proceso');
  IF (g->>'habilitado')::boolean IS NOT TRUE OR g->>'nivel' <> 'informativo' THEN RAISE EXCEPTION 'TEST17 B: %', g; END IF;

  -- TEST 18: C bloqueante sin contrato → proceso NO habilitado
  g := proc_fn_cliente_habilitado_para_operar(e,cC,hoy,'proceso');
  IF (g->>'habilitado')::boolean IS NOT FALSE OR g->>'nivel' <> 'bloqueante' THEN RAISE EXCEPTION 'TEST18 C proceso: %', g; END IF;
  -- TEST 21: pero la RECEPCIÓN física SIEMPRE se registra (D12)
  g := proc_fn_cliente_habilitado_para_operar(e,cC,hoy,'recepcion');
  IF (g->>'habilitado')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'TEST21 C recepcion debe ser SIEMPRE habilitada: %', g; END IF;

  -- TEST 19: D contrato vencido → sin vigente → alerta bloqueante, proceso no habilitado
  g := proc_fn_cliente_habilitado_para_operar(e,cD,hoy,'proceso');
  IF (g->>'habilitado')::boolean IS NOT FALSE OR g->>'estado_display' NOT LIKE '%Sin contrato%' THEN RAISE EXCEPTION 'TEST19 D vencido: %', g; END IF;

  RAISE NOTICE 'proc_* T8 gates contractuales: TODOS LOS TESTS PASARON';
END $$;

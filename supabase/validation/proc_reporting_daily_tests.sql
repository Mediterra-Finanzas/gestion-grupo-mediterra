-- proc_reporting_daily_tests.sql · PROC-REPORTING-DAILY-001 · tests A–R (funcional).
-- S (cross-tenant) y T (anon) van en el gate RLS. REQ: cadena completa + reporting_daily.
-- Superuser (RLS bypass). Kg SIEMPRE desde el ledger; agrupación por CLIENTE.

CREATE OR REPLACE FUNCTION rep_seed(p_e uuid, OUT pl uuid, OUT u uuid) LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (p_e,'P','Planta') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (p_e,pl,'A','Cámara','camara') RETURNING id INTO u;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (p_e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (p_e,'CHE','SANTINA','Santina');
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (p_e,'2025/2026','t','activa');
END $$;

DO $$
DECLARE hoy date := (now() AT TIME ZONE 'America/Santiago')::date;
  e uuid; pl uuid; u uuid; cliA uuid; cliB uuid; pA1 uuid; pA2 uuid;
  recA uuid; recB uuid; lA uuid; lA2 uuid; lB uuid; oA uuid; oB uuid;
  krec numeric; kpro numeric; nrec int; nord int; el jsonb;
  cfg uuid; ej proc_reporte_ejecucion; ej2 proc_reporte_ejecucion; snap jsonb; n int;
  movR uuid; movC uuid; foods uuid; grp uuid; d1 date; d2 date;
BEGIN
  -- ══ A: Cliente A 10.000 recibidos / 8.000 procesados ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RA',10000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  lA := proc_fn_ingresar_lote_ubicado(e,recA,'LA','CHE','SANTINA',10000,pl,'2025/2026',u,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'OA',pl,'en_proceso','CHE',cliA) RETURNING id INTO oA;
  PERFORM proc_fn_consumir_lote_en_orden(e,oA,lA,8000,NULL,NULL);
  SELECT kg_recibido,kg_procesado,cantidad_recepciones,cantidad_ordenes INTO krec,kpro,nrec,nord
    FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  IF krec<>10000 OR kpro<>8000 THEN RAISE EXCEPTION 'A: esperado 10000/8000, got %/%',krec,kpro; END IF;
  IF nrec<1 OR nord<1 THEN RAISE EXCEPTION 'A: recepciones/órdenes mal contadas'; END IF;

  -- ══ B: Cliente A con DOS productores → consolida por CLIENTE, no por productor ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Prod 1') RETURNING id INTO pA1;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Prod 2') RETURNING id INTO pA2;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,productor_vinculo_id,planta_id,estado) VALUES (e,'RB1',4000,'CHE',cliA,pA1,pl,'recibida') RETURNING id INTO recA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,productor_vinculo_id,planta_id,estado) VALUES (e,'RB2',3000,'CHE',cliA,pA2,pl,'recibida') RETURNING id INTO recB;
  PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LB1','CHE','SANTINA',4000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_ingresar_lote_ubicado(e,recB,'LB2','CHE','SANTINA',3000,pl,'2025/2026',u,NULL);
  SELECT count(*) INTO n FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago');
  IF n<>1 THEN RAISE EXCEPTION 'B: debía consolidar en 1 fila (cliente), got % filas',n; END IF;
  SELECT kg_recibido INTO krec FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  IF krec<>7000 THEN RAISE EXCEPTION 'B: dos productores → 7000 kg por cliente, got %',krec; END IF;

  -- ══ C: Dos clientes → no mezcla ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente B') RETURNING id INTO cliB;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RCA',5000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RCB',2000,'CHE',cliB,pl,'recibida') RETURNING id INTO recB;
  PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LCA','CHE','SANTINA',5000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_ingresar_lote_ubicado(e,recB,'LCB','CHE','SANTINA',2000,pl,'2025/2026',u,NULL);
  SELECT kg_recibido INTO krec FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  SELECT kg_recibido INTO kpro FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliB;
  IF krec<>5000 OR kpro<>2000 THEN RAISE EXCEPTION 'C: no debía mezclar (A=5000,B=2000), got A=% B=%',krec,kpro; END IF;

  -- ══ D: Lote parcialmente procesado → procesados = consumo REAL ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RD',10000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  lA := proc_fn_ingresar_lote_ubicado(e,recA,'LD','CHE','SANTINA',10000,pl,'2025/2026',u,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'OD',pl,'en_proceso','CHE',cliA) RETURNING id INTO oA;
  PERFORM proc_fn_consumir_lote_en_orden(e,oA,lA,6000,NULL,NULL);   -- consume 6000 de 10000
  SELECT kg_procesado INTO kpro FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  IF kpro<>6000 THEN RAISE EXCEPTION 'D: procesado = consumo real 6000 (no 10000), got %',kpro; END IF;

  -- ══ E: Recepción un día / proceso otro día → cada hecho en su fecha operacional ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u; d1 := DATE '2026-05-10'; d2 := DATE '2026-05-11';
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RE',9000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,recA,'LE','CHE','SANTINA') RETURNING id INTO lA;
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,ref_tipo,ref_id,fecha) VALUES (e,'recepcion','entrada','lote',lA,9000,'recepcion',recA,'2026-05-10 15:00:00+00');
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'OE',pl,'en_proceso','CHE',cliA) RETURNING id INTO oA;
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,ref_tipo,ref_id,fecha) VALUES (e,'consumo_proceso','salida','lote',lA,5000,'consumo_proceso',oA,'2026-05-11 15:00:00+00') RETURNING id INTO movC;
  INSERT INTO proc_orden_insumo(empresa_id,orden_id,lote_id,kg,movimiento_id) VALUES (e,oA,lA,5000,movC);
  SELECT kg_recibido,kg_procesado INTO krec,kpro FROM proc_fn_informe_diario_operacion(e,d1,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  IF COALESCE(krec,0)<>9000 OR COALESCE(kpro,0)<>0 THEN RAISE EXCEPTION 'E: día1 recibido 9000/proc 0, got %/%',krec,kpro; END IF;
  SELECT kg_recibido,kg_procesado INTO krec,kpro FROM proc_fn_informe_diario_operacion(e,d2,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=cliA;
  IF COALESCE(krec,0)<>0 OR COALESCE(kpro,0)<>5000 THEN RAISE EXCEPTION 'E: día2 recibido 0/proc 5000, got %/%',krec,kpro; END IF;

  -- ══ N: Timezone → corte diario determinístico (no depende del navegador) ══
  -- 02:00Z = 22:00 del día previo en America/Santiago (UTC-4 en junio) → cambia de fecha.
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RN',1000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  INSERT INTO proc_lote(empresa_id,recepcion_id,codigo,especie_codigo,variedad_codigo) VALUES (e,recA,'LN','CHE','SANTINA') RETURNING id INTO lA;
  INSERT INTO proc_movimiento(empresa_id,tipo_movimiento,naturaleza,objeto_tipo,objeto_id,cantidad,ref_tipo,ref_id,fecha) VALUES (e,'recepcion','entrada','lote',lA,1000,'recepcion',recA,'2026-06-15 02:00:00+00');
  SELECT COALESCE(SUM(kg_recibido),0) INTO krec FROM proc_fn_informe_diario_operacion(e,DATE '2026-06-14',NULL,NULL,'America/Santiago');
  IF krec<>1000 THEN RAISE EXCEPTION 'N: en Santiago 02:00Z cae el 06-14, esperado 1000, got %',krec; END IF;
  SELECT COALESCE(SUM(kg_recibido),0) INTO krec FROM proc_fn_informe_diario_operacion(e,DATE '2026-06-15',NULL,NULL,'UTC');
  IF krec<>1000 THEN RAISE EXCEPTION 'N: en UTC 02:00Z cae el 06-15, esperado 1000, got %',krec; END IF;
  SELECT COALESCE(SUM(kg_recibido),0) INTO krec FROM proc_fn_informe_diario_operacion(e,DATE '2026-06-15',NULL,NULL,'America/Santiago');
  IF krec<>0 THEN RAISE EXCEPTION 'N: en Santiago NO debe caer el 06-15, got %',krec; END IF;

  -- ══ M: Dos plantas → no mezcla ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  DECLARE pl2 uuid; u2 uuid; BEGIN
    INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P2','Planta 2') RETURNING id INTO pl2;
    INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl2,'B','C2','camara') RETURNING id INTO u2;
    INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
    INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RM1',5000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
    INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RM2',3000,'CHE',cliA,pl2,'recibida') RETURNING id INTO recB;
    PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LM1','CHE','SANTINA',5000,pl,'2025/2026',u,NULL);
    PERFORM proc_fn_ingresar_lote_ubicado(e,recB,'LM2','CHE','SANTINA',3000,pl2,'2025/2026',u2,NULL);
    SELECT COALESCE(SUM(kg_recibido),0) INTO krec FROM proc_fn_informe_diario_operacion(e,hoy,pl,NULL,'America/Santiago');
    IF krec<>5000 THEN RAISE EXCEPTION 'M: planta 1 = 5000, got %',krec; END IF;
    SELECT COALESCE(SUM(kg_recibido),0) INTO krec FROM proc_fn_informe_diario_operacion(e,hoy,pl2,NULL,'America/Santiago');
    IF krec<>3000 THEN RAISE EXCEPTION 'M: planta 2 = 3000, got %',krec; END IF;
  END;

  -- ══ J: Foods como Cliente Service (grupo Core) vía proc_vinculo, sin exp_* ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO contab_empresas(id) VALUES (gen_random_uuid()) RETURNING id INTO grp;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,grupo_empresa_id) VALUES (e,'cliente_servicio',false,'Allegria Foods SpA',grp) RETURNING id INTO foods;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RJ',4000,'CHE',foods,pl,'recibida') RETURNING id INTO recA;
  PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LJ','CHE','SANTINA',4000,pl,'2025/2026',u,NULL);
  SELECT kg_recibido INTO krec FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago') WHERE cliente_vinculo_id=foods;
  IF krec<>4000 THEN RAISE EXCEPTION 'J: Foods como cliente Service debía reportar 4000, got %',krec; END IF;

  -- ══ F / L / Q / R / I / H / O / G / P: motor de ejecución ══
  e := gen_random_uuid(); SELECT * FROM rep_seed(e) INTO pl,u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A') RETURNING id INTO cliA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente B') RETURNING id INTO cliB;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RF-A',6000,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RF-B',2000,'CHE',cliB,pl,'recibida') RETURNING id INTO recB;
  PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LF-A','CHE','SANTINA',6000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_ingresar_lote_ubicado(e,recB,'LF-B','CHE','SANTINA',2000,pl,'2025/2026',u,NULL);

  -- config general con dos destinatarios (uno inactivo)
  INSERT INTO proc_reporte_config(empresa_id,nombre,timezone,alcance,enviar_sin_movimiento) VALUES (e,'Diario general','America/Santiago','general',false) RETURNING id INTO cfg;
  INSERT INTO proc_reporte_destinatario(empresa_id,config_id,nombre,email,tipo,activo) VALUES
    (e,cfg,'Interno','ops@allegria.cl','interno',true),
    (e,cfg,'Inactivo','viejo@allegria.cl','interno',false);   -- O: no debe aparecer

  -- R/Q: el motor produce el mismo dataset que el preview (informe)
  ej := proc_fn_reporte_generar_ejecucion(e,cfg,hoy,NULL);
  IF ej.total_kg_recibido<>8000 THEN RAISE EXCEPTION 'R: motor total recibido 8000, got %',ej.total_kg_recibido; END IF;
  IF ej.estado<>'pendiente' THEN RAISE EXCEPTION 'F: con movimiento debía quedar pendiente, got %',ej.estado; END IF;
  -- Q: snapshot.clientes coincide con el preview (mismo motor)
  SELECT count(*) INTO n FROM proc_fn_informe_diario_operacion(e,hoy,NULL,NULL,'America/Santiago');
  IF jsonb_array_length(ej.snapshot->'clientes')<>n THEN RAISE EXCEPTION 'Q: preview y envío deben coincidir en # clientes'; END IF;
  -- O: destinatarios_snapshot excluye el inactivo (1, no 2)
  IF jsonb_array_length(ej.destinatarios_snapshot)<>1 THEN RAISE EXCEPTION 'O: destinatario inactivo no debe incluirse, got %',jsonb_array_length(ej.destinatarios_snapshot); END IF;

  -- L: idempotencia — segunda generación devuelve la MISMA ejecución (no duplica)
  ej2 := proc_fn_reporte_generar_ejecucion(e,cfg,hoy,NULL);
  IF ej2.id<>ej.id THEN RAISE EXCEPTION 'L: doble ejecución no debe crear otra (idempotencia)'; END IF;
  SELECT count(*) INTO n FROM proc_reporte_ejecucion WHERE config_id=cfg AND fecha_operacional=hoy;
  IF n<>1 THEN RAISE EXCEPTION 'L: debía existir 1 ejecución, got %',n; END IF;

  -- H: snapshot inmutable — cambios CURRENT posteriores no alteran el informe histórico
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'RF-EXTRA',9999,'CHE',cliA,pl,'recibida') RETURNING id INTO recA;
  PERFORM proc_fn_ingresar_lote_ubicado(e,recA,'LF-EXTRA','CHE','SANTINA',9999,pl,'2025/2026',u,NULL);
  ej2 := proc_fn_reporte_generar_ejecucion(e,cfg,hoy,NULL);   -- idempotente: NO recalcula
  IF ej2.total_kg_recibido<>8000 THEN RAISE EXCEPTION 'H: snapshot histórico no debe recalcularse (sigue 8000), got %',ej2.total_kg_recibido; END IF;
  BEGIN
    UPDATE proc_reporte_ejecucion SET snapshot='{}'::jsonb WHERE id=ej.id;
    RAISE EXCEPTION 'H: el guard debió impedir mutar el snapshot';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'H:%' THEN RAISE; END IF; END;

  -- G: error de email queda registrado y reintentable
  ej2 := proc_fn_reporte_marcar_error(e,ej.id,'SMTP timeout',NULL);
  IF ej2.estado<>'error' OR ej2.error IS NULL THEN RAISE EXCEPTION 'G: debía quedar en error con mensaje'; END IF;
  IF ej2.intentos<>1 THEN RAISE EXCEPTION 'G: intentos debía incrementar a 1'; END IF;

  -- P: reintento mantiene trazabilidad e intentos, reusa snapshot
  ej2 := proc_fn_reporte_reintentar(e,ej.id,NULL);
  IF ej2.estado<>'pendiente' THEN RAISE EXCEPTION 'P: reintento debía volver a pendiente'; END IF;
  ej2 := proc_fn_reporte_marcar_enviado(e,ej.id,'smtp','msg-123',NULL);
  IF ej2.estado<>'enviado' OR ej2.message_id<>'msg-123' THEN RAISE EXCEPTION 'P: enviado con message_id real'; END IF;
  IF ej2.intentos<>2 THEN RAISE EXCEPTION 'P: intentos acumulados debía ser 2, got %',ej2.intentos; END IF;

  -- I: alcance cliente A → cero datos de B
  DECLARE cfgI uuid; ejI proc_reporte_ejecucion; BEGIN
    INSERT INTO proc_reporte_config(empresa_id,nombre,alcance,alcance_cliente_vinculo_id) VALUES (e,'Solo A','cliente',cliA) RETURNING id INTO cfgI;
    ejI := proc_fn_reporte_generar_ejecucion(e,cfgI,hoy,NULL);
    IF jsonb_array_length(ejI.snapshot->'clientes')<>1 THEN RAISE EXCEPTION 'I: alcance cliente A debía traer 1 cliente'; END IF;
    IF (ejI.snapshot->'clientes'->0->>'cliente_vinculo_id')<>cliA::text THEN RAISE EXCEPTION 'I: sólo Cliente A, nada de B'; END IF;
  END;

  -- F (política sin movimiento): otra empresa sin movimiento → 'omitido' (default) ; con flag → 'pendiente'
  DECLARE eF uuid; plF uuid; uF uuid; cfgF uuid; ejF proc_reporte_ejecucion; BEGIN
    eF := gen_random_uuid(); SELECT * FROM rep_seed(eF) INTO plF,uF;
    INSERT INTO proc_reporte_config(empresa_id,nombre,enviar_sin_movimiento) VALUES (eF,'Sin mov (omite)',false) RETURNING id INTO cfgF;
    ejF := proc_fn_reporte_generar_ejecucion(eF,cfgF,hoy,NULL);
    IF ejF.estado<>'omitido' THEN RAISE EXCEPTION 'F: sin movimiento + política NO enviar → omitido, got %',ejF.estado; END IF;
    INSERT INTO proc_reporte_config(empresa_id,nombre,enviar_sin_movimiento) VALUES (eF,'Sin mov (envía)',true) RETURNING id INTO cfgF;
    ejF := proc_fn_reporte_generar_ejecucion(eF,cfgF,hoy,NULL);
    IF ejF.estado<>'pendiente' THEN RAISE EXCEPTION 'F: sin movimiento + política enviar igual → pendiente, got %',ejF.estado; END IF;
  END;

  RAISE NOTICE 'PROC-REPORTING-DAILY-001 tests A-R (funcional): TODOS PASARON';
END $$;

DROP FUNCTION rep_seed(uuid);

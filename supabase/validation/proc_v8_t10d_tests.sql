-- proc_v8_t10d_tests.sql · T10d Ficha Cliente + Contrato + gate + QC por lote.
-- REQ: v1..v7_7 + v8_t1..t9 + v8_t10c_qc + v8_t10d. Superuser (RLS bypass).
DO $$
DECLARE e uuid := gen_random_uuid(); cli uuid; prod uuid; foods uuid; grp uuid;
  cli2 uuid; cli3 uuid; fichaId uuid; c1 uuid; c2 uuid;
  ec jsonb; hab jsonb; tf boolean; nivel text; n int;
  pl uuid; u uuid; rec uuid; recH uuid; lCHE uuid; lPLU uuid; lH uuid; el jsonb;
BEGIN
  -- Identidad (Core vía proc_vinculo). Cliente = quien contrata; productor = origen.
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut S.A.') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'El Parrón') RETURNING id INTO prod;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente Informativo') RETURNING id INTO cli2;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente Advertencia') RETURNING id INTO cli3;
  INSERT INTO contab_empresas(id) VALUES (gen_random_uuid()) RETURNING id INTO grp;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,grupo_empresa_id) VALUES (e,'cliente_servicio',false,'Allegria Foods SpA',grp) RETURNING id INTO foods;

  -- ── C1: cliente SIN ficha → read-model tiene_ficha=false, nivel info (no_requerido) ──
  SELECT tiene_ficha, nivel_contractual INTO tf, nivel FROM proc_v_cliente_servicio WHERE empresa_id=e AND cliente_vinculo_id=cli;
  IF tf IS NOT FALSE THEN RAISE EXCEPTION 'C1: sin ficha debía ser tiene_ficha=false'; END IF;
  IF nivel <> 'info' THEN RAISE EXCEPTION 'C1: sin ficha (no_requerido) nivel esperado info, got %', nivel; END IF;

  -- ── C2: ficha creada → tiene_ficha=true ──
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato,responsable_comercial) VALUES (e,cli,'no_requerido','Ana Torres') RETURNING id INTO fichaId;
  SELECT tiene_ficha INTO tf FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=cli AND empresa_id=e;
  IF tf IS NOT TRUE THEN RAISE EXCEPTION 'C2: ficha creada debía dar tiene_ficha=true'; END IF;

  -- ── C3: política bloqueante SIN contrato → nivel bloqueante ──
  UPDATE proc_cliente_ficha SET politica_contrato='bloqueante' WHERE id=fichaId;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF ec->>'nivel' <> 'bloqueante' THEN RAISE EXCEPTION 'C3: bloqueante sin contrato → nivel bloqueante, got %', ec->>'nivel'; END IF;
  IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C3: sin contrato no debía tener vigente'; END IF;

  -- ── C4: contrato en borrador → NO cuenta como vigente ──
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,estado,fecha_inicio,fecha_termino,requiere_firma)
    VALUES (e,cli,'CT-1','borrador',current_date-1,current_date+30,true) RETURNING id INTO c1;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C4: contrato borrador no cuenta como vigente'; END IF;

  -- ── C5: pendiente_firma → NO vigente ──
  UPDATE proc_cliente_contrato SET estado='pendiente_firma' WHERE id=c1;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C5: pendiente_firma no cuenta como vigente'; END IF;

  -- ── C9: documento cargado ≠ firmado → sigue NO vigente ──
  UPDATE proc_cliente_contrato SET documento_path='contratos/x/CT-1-v1.pdf' WHERE id=c1;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C9: cargar documento no implica firmado/vigente'; END IF;

  -- ── C12/C13/C14: gate por etapa con política bloqueante y SIN vigencia ──
  hab := proc_fn_cliente_habilitado_para_operar(e,cli,current_date,'proceso');
  IF (hab->>'habilitado')::bool IS NOT FALSE THEN RAISE EXCEPTION 'C12/C14: proceso bloqueante debía inhabilitar'; END IF;      -- C12/C14
  IF hab->>'motivo' IS NULL THEN RAISE EXCEPTION 'C14: debía explicar el motivo del bloqueo'; END IF;                          -- C14
  hab := proc_fn_cliente_habilitado_para_operar(e,cli,current_date,'recepcion');
  IF (hab->>'habilitado')::bool IS NOT TRUE THEN RAISE EXCEPTION 'C13: recepción física SIEMPRE habilitada, aun bloqueante'; END IF;  -- C13

  -- ── C6: firmar → vigente (pendiente_firma → vigente + fecha_firma) ──
  UPDATE proc_cliente_contrato SET estado='vigente', fecha_firma=current_date WHERE id=c1;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF (ec->>'tiene_contrato_vigente')::bool IS NOT TRUE THEN RAISE EXCEPTION 'C6: contrato firmado vigente debía contar'; END IF;
  IF ec->>'nivel' <> 'ok' THEN RAISE EXCEPTION 'C6: con vigencia el nivel debía ser ok, got %', ec->>'nivel'; END IF;
  SELECT contrato_vigente_codigo INTO nivel FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=cli;
  IF nivel <> 'CT-1' THEN RAISE EXCEPTION 'C6: read-model debía exponer contrato vigente CT-1, got %', nivel; END IF;
  -- con vigencia, el avance a proceso queda habilitado
  hab := proc_fn_cliente_habilitado_para_operar(e,cli,current_date,'proceso');
  IF (hab->>'habilitado')::bool IS NOT TRUE THEN RAISE EXCEPTION 'C6: con contrato vigente el proceso debía habilitarse'; END IF;

  -- ── C7: vencido → deja de contar como vigente (+ read-model n_vencidos) ──
  UPDATE proc_cliente_contrato SET estado='vencido' WHERE id=c1;
  ec := proc_fn_estado_contractual_cliente(e,cli);
  IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C7: contrato vencido no cuenta como vigente'; END IF;
  SELECT n_vencidos INTO n FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=cli;
  IF n < 1 THEN RAISE EXCEPTION 'C7: read-model debía contar 1 vencido, got %', n; END IF;

  -- ── C8: reemplazo conserva la versión anterior ──
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,estado,version,reemplaza_contrato_id,fecha_inicio,fecha_termino,fecha_firma,requiere_firma)
    VALUES (e,cli,'CT-1','vigente',2,c1,current_date-1,current_date+60,current_date,true) RETURNING id INTO c2;
  UPDATE proc_cliente_contrato SET estado='reemplazado' WHERE id=c1;   -- vencido → reemplazado (permitido)
  SELECT count(*) INTO n FROM proc_cliente_contrato WHERE cliente_vinculo_id=cli AND deleted_at IS NULL;
  IF n < 2 THEN RAISE EXCEPTION 'C8: ambas versiones deben conservarse, got %', n; END IF;
  SELECT estado INTO nivel FROM proc_cliente_contrato WHERE id=c1;
  IF nivel <> 'reemplazado' THEN RAISE EXCEPTION 'C8: la versión anterior debía quedar reemplazada, got %', nivel; END IF;
  SELECT contrato_vigente_version INTO n FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=cli;
  IF n <> 2 THEN RAISE EXCEPTION 'C8: el vigente debía ser la versión 2, got %', n; END IF;

  -- ── C10: política informativa sin vigencia → nivel informativo ──
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cli2,'informativo');
  ec := proc_fn_estado_contractual_cliente(e,cli2);
  IF ec->>'nivel' <> 'informativo' THEN RAISE EXCEPTION 'C10: política informativa → nivel informativo, got %', ec->>'nivel'; END IF;

  -- ── C11: política advertencia sin vigencia → nivel advertencia ──
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cli3,'advertencia');
  ec := proc_fn_estado_contractual_cliente(e,cli3);
  IF ec->>'nivel' <> 'advertencia' THEN RAISE EXCEPTION 'C11: política advertencia → nivel advertencia, got %', ec->>'nivel'; END IF;

  -- ── C15: cliente ≠ productor (el contrato es del cliente; el productor es otra dimensión) ──
  SELECT count(*) INTO n FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=prod AND empresa_id=e;
  IF n <> 0 THEN RAISE EXCEPTION 'C15: el productor NO debe aparecer como cliente del servicio'; END IF;
  ec := proc_fn_estado_contractual_cliente(e,prod);
  IF ec->>'nivel' <> 'info' OR (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'C15: el productor no tiene contrato del cliente'; END IF;

  -- ── C16: Foods como cliente Service (grupo Core) SIN exp_* ──
  SELECT count(*) INTO n FROM proc_v_cliente_servicio WHERE cliente_vinculo_id=foods AND empresa_id=e;
  IF n <> 1 THEN RAISE EXCEPTION 'C16: Allegria Foods debía figurar como cliente Service'; END IF;

  -- ── C19/C20: QC por lote independiente + fallback header ──
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.5);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'P','P') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'A','A','camara') RETURNING id INTO u;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','SANTINA','Santina'),(e,'PLU','DAGEN','DAgen');
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,severidad,obligatorio,activo) VALUES
    (e,'CHE','BRIX','Brix','numero',16,'bloqueante',true,true),
    (e,'PLU','BRIX','Brix','numero',14,'bloqueante',true,true);
  -- C19: recepción multi-especie, QC por lote independiente
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'REC-QC',5000,'CHE') RETURNING id INTO rec;
  lCHE := proc_fn_ingresar_lote_ubicado(e,rec,'L-CHE','CHE','SANTINA',3000,pl,'2025/2026',u,NULL);
  lPLU := proc_fn_ingresar_lote_ubicado(e,rec,'L-PLU','PLU','DAGEN',2000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18"}'::jsonb,NULL,lCHE);   -- Cereza aprobada
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"10"}'::jsonb,NULL,lPLU);   -- Ciruela rechazada
  el := proc_fn_lote_elegible(e,lCHE); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'C19: Cereza aprobada debía ser elegible'; END IF;
  el := proc_fn_lote_elegible(e,lPLU); IF (el->>'elegible')::bool IS NOT FALSE THEN RAISE EXCEPTION 'C19: Ciruela rechazada NO debía ser elegible'; END IF;
  -- C20: fallback header — lote sin QC propio hereda el QC de la recepción (aprobado)
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo) VALUES (e,'REC-H',1000,'CHE') RETURNING id INTO recH;
  lH := proc_fn_ingresar_lote_ubicado(e,recH,'L-H','CHE','SANTINA',1000,pl,'2025/2026',u,NULL);
  PERFORM proc_fn_registrar_qc(e,recH,'{"BRIX":"18"}'::jsonb,NULL,NULL);  -- QC header aprobado (lote_id NULL)
  el := proc_fn_lote_elegible(e,lH); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'C20: lote sin QC propio debía usar el header (fallback) aprobado'; END IF;

  RAISE NOTICE 'proc_* T10d Ficha/Contrato/gate/QC-lote: TODOS LOS TESTS PASARON (C1-C16, C19, C20)';
END $$;

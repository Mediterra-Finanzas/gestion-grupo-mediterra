-- UAT escenarios G-K (misma sesión psql que proc_uat_f1_f6.sql)
-- ═══════════ ESCENARIO G — FRISKU ≠ SERVICE (universo de partes = proc_vinculo) ═
DO $$
DECLARE e uuid:=uid('emp'); expoC uuid; n int; rec uuid; fantasma uuid:=gen_random_uuid();
BEGIN
  -- Exportadora que opera SOLO en Service (no existe en Frisku): se crea su proc_vinculo
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional)
    VALUES (e,'exportadora',true,'Del Monte Service-only') RETURNING id INTO expoC; INSERT INTO uat VALUES ('expo_c',expoC);
  -- (1) El universo de exportadoras de Service = proc_vinculo (Copefrut, Gesex, Del Monte) = 3
  SELECT count(*) INTO n FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='exportadora' AND deleted_at IS NULL;
  IF n<>3 THEN RAISE EXCEPTION 'G: exportadoras en Service=% (esp 3)',n; END IF;
  -- (2) Una exportadora Frisku-only (sin proc_vinculo) NO aparece en Service
  PERFORM 1 FROM proc_vinculo WHERE empresa_id=e AND nombre_provisional='Frutera Frisku SpA';
  IF FOUND THEN RAISE EXCEPTION 'G: apareció una exportadora Frisku-only sin vínculo Service'; END IF;
  -- (3) La exportadora Service-only opera normalmente (recepción usa su vínculo)
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,exportadora_vinculo_id,especie_codigo,kg_neto)
    VALUES (e,'G-R001',uid('planta'),uid('cli_copefrut'),expoC,'CHE',1000) RETURNING id INTO rec;
  IF rec IS NULL THEN RAISE EXCEPTION 'G: la exportadora Service-only no pudo operar'; END IF;
  -- (4) Una "identidad Frisku" sin proc_vinculo NO es utilizable en Service (FK lo impide)
  BEGIN
    INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,exportadora_vinculo_id,especie_codigo,kg_neto)
      VALUES (e,'G-R999',uid('planta'),uid('cli_copefrut'),fantasma,'CHE',1);
    RAISE EXCEPTION 'FALLA G4: se aceptó una parte sin proc_vinculo (identidad Frisku suelta)';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
    WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA G4%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'G OK Frisku≠Service: partes de Service = proc_vinculo; Service-only opera; identidad sin vínculo rechazada (FK)';
END $$;

-- ═══════════════════ ESCENARIO H — ALLEGRIA FOODS COMO CLIENTE ═══════════════
DO $$
DECLARE e uuid:=uid('emp'); lote uuid; orden uuid; res uuid; inf uuid; ver uuid; sf uuid; base uuid;
  grp uuid; nexp int; v_est text; kgp numeric;
BEGIN
  -- Foods contrata proceso a Service, exactamente como un tercero
  lote := uat_recibir('H_lote','H-R001',uid('cli_foods'),uid('prod_sanvic'),uid('cli_foods'),uid('expo_gesex'),'CHE','Regina',4000,uid('u_cam1'));
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'H-O001',uid('planta'),'en_proceso','2026-12-05','CHE','Regina',uid('cli_foods')) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,4000,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_J'),uid('col_MAH'),3600);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,orden,uid('des_blanda'),300);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),100);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  -- Resultado de Proceso emitido a Foods
  inf := proc_fn_crear_informe(e,'H-INF01','2026/2027',uid('planta'),uid('cli_foods'),NULL);
  ver := proc_fn_generar_version(e,inf,ARRAY[orden],'Proceso para Allegria Foods (intercompany)',NULL,NULL);
  PERFORM proc_fn_agregar_destinatario(e,ver,uid('cli_foods'),NULL);
  PERFORM proc_fn_emitir_version(e,ver,'/pdf/H-INF01-v1.pdf',NULL);
  -- Base de cobro intercompany (NO factura ni asiento todavía)
  sf := proc_fn_generar_servicio_proceso(e,orden,uid('cli_foods'),uid('ts_proc'),NULL);
  base := proc_fn_crear_base_cobro(e,'H-BC01',uid('cli_foods'),'2026/2027','2026-12-01','2026-12-31','USD',NULL);
  PERFORM proc_fn_agregar_a_base(e,base,sf,NULL);
  -- (a) Foods es cliente vía proc_vinculo con identidad de grupo (intercompany)
  SELECT grupo_empresa_id INTO grp FROM proc_vinculo WHERE id=uid('cli_foods');
  IF grp IS NULL THEN RAISE EXCEPTION 'H: Foods no está ligado a identidad de grupo (intercompany)'; END IF;
  -- (b) proceso corrió idéntico (4000 kg cobrables = 4000×0.25 general = 1000; Foods no tiene tarifa específica)
  SELECT cantidad,estado INTO kgp,v_est FROM proc_servicio_facturable WHERE id=sf;
  IF kgp<>4000 THEN RAISE EXCEPTION 'H: kg procesados Foods=% (esp 4000)',kgp; END IF;
  -- (c) NINGÚN FK de proc_* apunta a exp_* (sin dependencia estructural del exportador)
  SELECT count(*) INTO nexp FROM pg_constraint con
    JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_class ref ON ref.oid=con.confrelid
    WHERE con.contype='f' AND rel.relname LIKE 'proc\_%' AND ref.relname LIKE 'exp\_%';
  IF nexp<>0 THEN RAISE EXCEPTION 'H: existen % FK de proc_* a exp_* (dependencia estructural)',nexp; END IF;
  -- (d) base intercompany queda en borrador (revenue, no factura/asiento)
  SELECT estado INTO v_est FROM proc_base_cobro WHERE id=base;
  IF v_est<>'borrador' THEN RAISE EXCEPTION 'H: base intercompany en % (esp borrador, sin factura)',v_est; END IF;
  RAISE NOTICE 'H OK Foods intercompany: cliente vía proc_vinculo (grupo), proceso idéntico, 0 FK a exp_*, base en borrador (sin factura)';
END $$;

-- ═══════════ ESCENARIO I — RESULTADO DE PROCESO REALISTA + VERSIONAMIENTO ═════
DO $$
DECLARE e uuid:=uid('emp'); lote uuid; orden uuid; inf uuid; v1 uuid; v2 uuid;
  snap1 jsonb; snap1b jsonb; kgp numeric; kgc numeric; pack numeric; ver1 int; ver2 int; det jsonb;
BEGIN
  lote := uat_recibir('I_lote','I-R001',uid('cli_copefrut'),uid('prod_parron'),uid('prod_parron'),uid('expo_copefrut'),'CHE','Santina',12000,uid('u_cam1'));
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'I-O001',uid('planta'),'en_proceso','CHE','Santina',uid('cli_copefrut')) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,11800,NULL,NULL);
  -- comercial por calibre/color/categoría
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_J'),uid('col_MAH'),6000);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_2'),uid('cal_XL'),uid('col_DARK'),3000);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,orden,uid('des_partida'),2000);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),800);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  inf := proc_fn_crear_informe(e,'I-INF01','2026/2027',uid('planta'),uid('expo_copefrut'),NULL);
  -- v1 y emisión
  v1 := proc_fn_generar_version(e,inf,ARRAY[orden],'Informe inicial',NULL,NULL);
  PERFORM proc_fn_agregar_destinatario(e,v1,uid('expo_copefrut'),NULL);
  PERFORM proc_fn_emitir_version(e,v1,'/pdf/I-INF01-v1.pdf',NULL);
  SELECT snapshot,version INTO snap1,ver1 FROM proc_informe_version WHERE id=v1;
  -- "modificar CURRENT" → nueva versión v2 (v1 inmutable)
  v2 := proc_fn_generar_version(e,inf,ARRAY[orden],'Corrección de observaciones',NULL,NULL);
  SELECT version INTO ver2 FROM proc_informe_version WHERE id=v2;
  -- v1 intacta
  SELECT snapshot INTO snap1b FROM proc_informe_version WHERE id=v1;
  kgp := (snap1#>>'{resumen,kg_procesados}')::numeric;
  kgc := (snap1#>>'{resumen,kg_comerciales}')::numeric;
  pack:= (snap1#>>'{resumen,packout}')::numeric;
  det := snap1#>'{detalle}';
  IF kgp<>11800 THEN RAISE EXCEPTION 'I: kg_procesados=% (esp 11800)',kgp; END IF;
  IF kgc<>9000 THEN RAISE EXCEPTION 'I: kg_comerciales=% (esp 9000)',kgc; END IF;
  IF round(pack,4)<>0.7627 THEN RAISE EXCEPTION 'I: packout=% (esp 0.7627)',pack; END IF;
  IF jsonb_array_length(det)<>2 THEN RAISE EXCEPTION 'I: detalle=% líneas (esp 2 calibre/color)',jsonb_array_length(det); END IF;
  IF ver1<>1 OR ver2<>2 THEN RAISE EXCEPTION 'I: versiones=%/% (esp 1/2)',ver1,ver2; END IF;
  IF snap1b<>snap1 THEN RAISE EXCEPTION 'I: v1 mutó tras generar v2 (no inmutable)'; END IF;
  RAISE NOTICE 'I OK Resultado realista: 12000 rec / 11800 proc / 9000 comercial / packout 0.7627; v1 inmutable, v2 emitida';
END $$;

-- ═══════════════════ ESCENARIO J — TARIFARIO (snapshot histórico) ════════════
DO $$
DECLARE e uuid:=uid('emp'); lote uuid; orden uuid; sf uuid; sub numeric; tarpost numeric;
BEGIN
  lote := uat_recibir('J_lote','J-R001',uid('cli_copefrut'),uid('prod_aromos'),uid('prod_aromos'),uid('expo_copefrut'),'CHE','Lapins',9800,uid('u_cam1'));
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'J-O001',uid('planta'),'en_proceso','2026-12-10','CHE','Lapins',uid('cli_copefrut')) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,orden,uid('cat_exp'),9800);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  sf := proc_fn_generar_servicio_proceso(e,orden,uid('cli_copefrut'),uid('ts_proc'),NULL);
  SELECT subtotal INTO sub FROM proc_servicio_facturable WHERE id=sf;
  IF sub<>2940 THEN RAISE EXCEPTION 'J: subtotal=% (esp 2940 = 9800×0.30)',sub; END IF;
  -- Cambiar tarifa CURRENT a 0.35; el histórico ya valorizado NO cambia
  UPDATE proc_tarifa SET tarifa=0.35 WHERE empresa_id=e AND tipo_servicio_id=uid('ts_proc') AND cliente_vinculo_id=uid('cli_copefrut');
  SELECT subtotal INTO tarpost FROM proc_servicio_facturable WHERE id=sf;
  IF tarpost<>2940 THEN RAISE EXCEPTION 'J: histórico cambió a % tras subir tarifa (esp 2940)',tarpost; END IF;
  RAISE NOTICE 'J OK tarifario: 9800×0.30=2940; subir tarifa CURRENT a 0.35 NO altera la base histórica (2940)';
END $$;

-- ═══════════════════ ESCENARIO K — TARIFA FALTANTE ═══════════════════════════
DO $$
DECLARE e uuid:=uid('emp'); orden uuid; sf uuid; v_est text; sub numeric;
BEGIN
  -- Reutiliza la orden J (cerrada) para un servicio SIN tarifa (Inspección SAG no tiene tarifa)
  SELECT id INTO orden FROM proc_orden_proceso WHERE empresa_id=e AND folio='J-O001';
  sf := proc_fn_generar_servicio_proceso(e,orden,uid('cli_copefrut'),uid('ts_insp'),NULL);
  SELECT estado,subtotal INTO v_est,sub FROM proc_servicio_facturable WHERE id=sf;
  IF v_est<>'pendiente_tarifa' THEN RAISE EXCEPTION 'K: estado=% (esp pendiente_tarifa)',v_est; END IF;
  IF sub IS NOT NULL THEN RAISE EXCEPTION 'K: subtotal=% (esp NULL, sin cero ni tarifa arbitraria)',sub; END IF;
  RAISE NOTICE 'K OK tarifa faltante: servicio queda pendiente_tarifa, subtotal NULL (ni cero ni tarifa anterior)';
END $$;

-- UAT escenarios A-C (requiere proc_uat_f1_f6.sql en la MISMA sesión psql)
-- ═══════════════════ ESCENARIO A — PROCESO SIMPLE (end-to-end) ═══════════════
DO $$
DECLARE e uuid:=uid('emp'); lote uuid; orden uuid; res uuid; pt uuid; pal uuid;
  desp uuid; inf uuid; ver uuid; sf uuid; base uuid; kgp numeric; sub numeric; tot numeric; saldo numeric;
BEGIN
  lote := uat_recibir('A_lote','A-R001',uid('cli_copefrut'),uid('prod_parron'),uid('prod_parron'),uid('expo_copefrut'),'CHE','Santina',5000,uid('u_cam1'));
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,fecha,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'A-O001',uid('planta'),'en_proceso','2026-12-05','CHE','Santina',uid('cli_copefrut')) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lote,5000,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_J'),uid('col_MAH'),4000) RETURNING id INTO res;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,orden,uid('des_blanda'),800);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),200);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  pt := proc_fn_materializar_pt(e,res,uid('fmt_che5'),800,4000,NULL);
  pal := proc_fn_crear_pallet(e,'A-PAL01','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_palletizar(e,pt,pal,800,4000,NULL);
  desp := proc_fn_crear_despacho(e,'A-D001',uid('planta'),uid('cli_copefrut'),uid('expo_copefrut'),NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=desp; UPDATE proc_despacho SET estado='listo' WHERE id=desp;
  PERFORM proc_fn_confirmar_despacho(e,desp,jsonb_build_array(jsonb_build_object('pallet_id',pal,'pt_id',pt,'cajas',800,'kg',4000)),NULL);
  inf := proc_fn_crear_informe(e,'A-INF01','2026/2027',uid('planta'),uid('expo_copefrut'),NULL);
  ver := proc_fn_generar_version(e,inf,ARRAY[orden],'Proceso Santina Parron',NULL,NULL);
  PERFORM proc_fn_agregar_destinatario(e,ver,uid('expo_copefrut'),NULL);
  PERFORM proc_fn_emitir_version(e,ver,'/pdf/A-INF01-v1.pdf',NULL);
  sf := proc_fn_generar_servicio_proceso(e,orden,uid('cli_copefrut'),uid('ts_proc'),NULL);
  base := proc_fn_crear_base_cobro(e,'A-BC01',uid('cli_copefrut'),'2026/2027','2026-12-01','2026-12-31','USD',NULL);
  PERFORM proc_fn_agregar_a_base(e,base,sf,NULL);
  SELECT cantidad,subtotal INTO kgp,sub FROM proc_servicio_facturable WHERE id=sf;
  SELECT total INTO tot FROM proc_base_cobro WHERE id=base;
  SELECT disponible INTO saldo FROM proc_v_pallet_saldos WHERE pallet_id=pal;
  IF kgp<>5000 THEN RAISE EXCEPTION 'A: kg procesados=% (esp 5000)',kgp; END IF;
  IF sub<>1500 THEN RAISE EXCEPTION 'A: subtotal=% (esp 1500)',sub; END IF;
  IF tot<>1500 THEN RAISE EXCEPTION 'A: total base=% (esp 1500)',tot; END IF;
  IF saldo<>0 THEN RAISE EXCEPTION 'A: saldo pallet=% (esp 0)',saldo; END IF;
  RAISE NOTICE 'A OK proceso simple: 5000 -> comercial 4000 + descarte 800 + merma 200; cobro USD 1500; pallet despachado saldo 0';
END $$;

-- ═══════════════════ ESCENARIO B — LOTE EN VARIAS CORRIDAS ═══════════════════
DO $$
DECLARE e uuid:=uid('emp'); lote uuid; o uuid; inf uuid; ver uuid;
  saldo numeric; ins int; kgp numeric; kgc numeric; pack numeric; snap jsonb; i int;
BEGIN
  lote := uat_recibir('B_lote','B-R001',uid('cli_rioblanco'),uid('prod_aromos'),uid('prod_aromos'),uid('expo_gesex'),'CHE','Lapins',9000,uid('u_cam2'));
  FOR i IN 1..3 LOOP
    INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
      VALUES (e,'B-O00'||i,uid('planta'),'en_proceso','CHE','Lapins',uid('cli_rioblanco')) RETURNING id INTO o;
    PERFORM proc_fn_consumir_lote_en_orden(e,o,lote,3000,NULL,NULL);
    INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,o,uid('cat_exp'),uid('cal_XL'),uid('col_DARK'),2400);
    INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,o,uid('des_partida'),400);
    INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,o,uid('mer_deshid'),200);
    UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=o;
    PERFORM proc_fn_conciliar_orden(e,o,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=o;
    INSERT INTO uat VALUES ('B_o'||i,o) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v;
  END LOOP;
  SELECT COALESCE(disponible,0) INTO saldo FROM proc_v_lote_saldos WHERE lote_id=lote;
  SELECT count(*) INTO ins FROM proc_orden_insumo WHERE lote_id=lote;
  IF saldo<>0 THEN RAISE EXCEPTION 'B: disponible lote=% (esp 0)',saldo; END IF;
  IF ins<>3 THEN RAISE EXCEPTION 'B: genealogia=% (esp 3)',ins; END IF;
  inf := proc_fn_crear_informe(e,'B-INF01','2026/2027',uid('planta'),uid('expo_gesex'),NULL);
  ver := proc_fn_generar_version(e,inf,ARRAY[uid('B_o1'),uid('B_o2'),uid('B_o3')],'Consolidado 3 corridas',NULL,NULL);
  SELECT snapshot INTO snap FROM proc_informe_version WHERE id=ver;
  kgp := (snap#>>'{resumen,kg_procesados}')::numeric;
  kgc := (snap#>>'{resumen,kg_comerciales}')::numeric;
  pack:= (snap#>>'{resumen,packout}')::numeric;
  IF kgp<>9000 THEN RAISE EXCEPTION 'B: kg_procesados=% (esp 9000)',kgp; END IF;
  IF kgc<>7200 THEN RAISE EXCEPTION 'B: kg_comerciales=% (esp 7200)',kgc; END IF;
  IF pack<>0.8 THEN RAISE EXCEPTION 'B: packout=% (esp 0.8)',pack; END IF;
  RAISE NOTICE 'B OK lote 9000 en 3 corridas: saldo 0, 3 insumos, consolidado 9000/7200 packout 0.80';
END $$;

-- ═══════════════════ ESCENARIO C — VARIOS LOTES EN UNA ORDEN (N:M) ═══════════
DO $$
DECLARE e uuid:=uid('emp'); la uuid; lb uuid; lc uuid; orden uuid; ins int; kins numeric;
BEGIN
  la := uat_recibir('C_la','C-RA',uid('cli_copefrut'),uid('prod_parron'),uid('prod_parron'),uid('expo_copefrut'),'CHE','Regina',2000,uid('u_cam1'));
  lb := uat_recibir('C_lb','C-RB',uid('cli_copefrut'),uid('prod_aromos'),uid('prod_aromos'),uid('expo_copefrut'),'CHE','Regina',3000,uid('u_cam1'));
  lc := uat_recibir('C_lc','C-RC',uid('cli_copefrut'),uid('prod_sanvic'),uid('prod_sanvic'),uid('expo_copefrut'),'CHE','Regina',1500,uid('u_cam1'));
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'C-O001',uid('planta'),'en_proceso','CHE','Regina',uid('cli_copefrut')) RETURNING id INTO orden;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,la,2000,NULL,NULL);
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lb,3000,NULL,NULL);
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,lc,1500,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_J'),uid('col_MAH'),5000);
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,orden,uid('des_blanda'),1000);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),500);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  SELECT count(*) INTO ins FROM proc_orden_insumo WHERE orden_id=orden;
  SELECT COALESCE(SUM(kg),0) INTO kins FROM proc_orden_insumo WHERE orden_id=orden;
  IF ins<>3 THEN RAISE EXCEPTION 'C: insumos=% (esp 3)',ins; END IF;
  IF kins<>6500 THEN RAISE EXCEPTION 'C: kg consumidos=% (esp 6500)',kins; END IF;
  SELECT count(DISTINCT lote_id) INTO ins FROM proc_orden_insumo WHERE orden_id=orden;
  IF ins<>3 THEN RAISE EXCEPTION 'C: backwards=% lotes (esp 3)',ins; END IF;
  RAISE NOTICE 'C OK N:M — 1 orden consume 3 lotes (2000+3000+1500=6500), genealogia a 3 productores';
END $$;

-- UAT escenarios D-F (misma sesión psql que proc_uat_f1_f6.sql)
-- ═══════════ ESCENARIO D — REPALETIZAJE COMPLEJO (3 generaciones) ════════════
-- Gen1: PAL_A, PAL_B. Gen2: A+B → C+D. Gen3: C+parte de E → F.
DO $$
DECLARE e uuid:=uid('emp'); orden uuid; res uuid; pt uuid;
  A uuid; B uuid; Cc uuid; D uuid; E5 uuid; F uuid;
  anc uuid[]; des uuid[]; sF numeric; sD numeric; sE numeric;
BEGIN
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'D-O001',uid('planta'),'en_proceso','CHE','Santina',uid('cli_copefrut')) RETURNING id INTO orden;
  INSERT INTO uat VALUES ('D_recep', uat_recibir(NULL,'D-R001',uid('cli_copefrut'),uid('prod_parron'),uid('prod_parron'),uid('expo_copefrut'),'CHE','Santina',2100,uid('u_cam1'))) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,uid('D_recep'),2100,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_J'),uid('col_MAH'),2000) RETURNING id INTO res;
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),100);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  pt := proc_fn_materializar_pt(e,res,uid('fmt_che5'),400,2000,NULL);
  -- Gen1: PAL_A y PAL_B con 500 kg c/u del mismo PT
  A := proc_fn_crear_pallet(e,'D-PAL-A','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  B := proc_fn_crear_pallet(e,'D-PAL-B','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_palletizar(e,pt,A,100,500,NULL);
  PERFORM proc_fn_palletizar(e,pt,B,100,500,NULL);
  -- Gen2: A(500)+B(500) → C(800) + D(200)
  Cc := proc_fn_crear_pallet(e,'D-PAL-C','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  D  := proc_fn_crear_pallet(e,'D-PAL-D','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_repaletizar(e,'consolidación calibre','merge', jsonb_build_array(
    jsonb_build_object('origen_pallet_id',A,'pt_id',pt,'cajas',100,'kg',500,'destino_pallet_id',Cc),
    jsonb_build_object('origen_pallet_id',B,'pt_id',pt,'cajas',60,'kg',300,'destino_pallet_id',Cc),
    jsonb_build_object('origen_pallet_id',B,'pt_id',pt,'cajas',40,'kg',200,'destino_pallet_id',D)
  ),NULL);
  -- Gen3: PAL_E (500 nuevo) ; C(800)+E(200) → F(1000)
  E5 := proc_fn_crear_pallet(e,'D-PAL-E','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_palletizar(e,pt,E5,100,500,NULL);
  F := proc_fn_crear_pallet(e,'D-PAL-F','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_repaletizar(e,'armado pallet mixto exportación','merge', jsonb_build_array(
    jsonb_build_object('origen_pallet_id',Cc,'pt_id',pt,'cajas',160,'kg',800,'destino_pallet_id',F),
    jsonb_build_object('origen_pallet_id',E5,'pt_id',pt,'cajas',40,'kg',200,'destino_pallet_id',F)
  ),NULL);
  -- Genealogía: ancestros de F (debe incluir A y B → 3 generaciones)
  WITH RECURSIVE anc AS (
    SELECT o.pallet_id p FROM proc_repaletizaje_destino d JOIN proc_repaletizaje_origen o ON o.repaletizaje_id=d.repaletizaje_id WHERE d.pallet_id=F
    UNION SELECT o.pallet_id FROM anc JOIN proc_repaletizaje_destino d ON d.pallet_id=anc.p JOIN proc_repaletizaje_origen o ON o.repaletizaje_id=d.repaletizaje_id
  ) SELECT array_agg(DISTINCT p) INTO anc FROM anc;
  -- Descendientes de A (debe terminar en F)
  WITH RECURSIVE des AS (
    SELECT d.pallet_id p FROM proc_repaletizaje_origen o JOIN proc_repaletizaje_destino d ON d.repaletizaje_id=o.repaletizaje_id WHERE o.pallet_id=A
    UNION SELECT d.pallet_id FROM des JOIN proc_repaletizaje_origen o ON o.pallet_id=des.p JOIN proc_repaletizaje_destino d ON d.repaletizaje_id=o.repaletizaje_id
  ) SELECT array_agg(DISTINCT p) INTO des FROM des;
  SELECT kg_fisico INTO sF FROM proc_v_pallet_saldos WHERE pallet_id=F;
  SELECT kg_fisico INTO sD FROM proc_v_pallet_saldos WHERE pallet_id=D;
  SELECT kg_fisico INTO sE FROM proc_v_pallet_saldos WHERE pallet_id=E5;
  IF NOT (anc @> ARRAY[A,B,Cc]) THEN RAISE EXCEPTION 'D: ancestros de F=% no incluyen A,B,C (genealogía <3 gen)',anc; END IF;
  IF NOT (des @> ARRAY[Cc,F]) THEN RAISE EXCEPTION 'D: A no termina en F (descendientes=%)',des; END IF;
  IF sF<>1000 OR sD<>200 OR sE<>300 THEN RAISE EXCEPTION 'D: saldos F/D/E=%/%/% (esp 1000/200/300)',sF,sD,sE; END IF;
  RAISE NOTICE 'D OK repaletizaje 3 generaciones: F<-{C,E}; C<-{A,B}. A termina en F. Saldos F=1000 D=200 E=300';
END $$;

-- ═══════════════════ ESCENARIO E — DESPACHO PARCIAL ══════════════════════════
DO $$
DECLARE e uuid:=uid('emp'); orden uuid; res uuid; pt uuid; pal uuid; d1 uuid; d2 uuid;
  saldo numeric; cajas int;
BEGIN
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,variedad_codigo,cliente_servicio_vinculo_id)
    VALUES (e,'E-O001',uid('planta'),'en_proceso','CHE','Lapins',uid('cli_rioblanco')) RETURNING id INTO orden;
  INSERT INTO uat VALUES ('E_recep', uat_recibir(NULL,'E-R001',uid('cli_rioblanco'),uid('prod_aromos'),uid('prod_aromos'),uid('expo_gesex'),'CHE','Lapins',520,uid('u_cam1'))) ON CONFLICT(k) DO UPDATE SET v=EXCLUDED.v;
  PERFORM proc_fn_consumir_lote_en_orden(e,orden,uid('E_recep'),520,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,orden,uid('cat_exp'),uid('cal_XL'),uid('col_DARK'),500) RETURNING id INTO res;
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,orden,uid('mer_deshid'),20);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=orden;
  PERFORM proc_fn_conciliar_orden(e,orden,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=orden;
  pt := proc_fn_materializar_pt(e,res,uid('fmt_che5'),100,500,NULL);
  pal := proc_fn_crear_pallet(e,'E-PAL01','2026/2027',uid('planta'),uid('fmt_che5'),uid('u_cam1'),NULL);
  PERFORM proc_fn_palletizar(e,pt,pal,100,500,NULL);
  -- Despacho 1: 60 cajas / 300 kg
  d1 := proc_fn_crear_despacho(e,'E-D001',uid('planta'),uid('cli_rioblanco'),uid('expo_gesex'),NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d1; UPDATE proc_despacho SET estado='listo' WHERE id=d1;
  PERFORM proc_fn_confirmar_despacho(e,d1,jsonb_build_array(jsonb_build_object('pallet_id',pal,'pt_id',pt,'cajas',60,'kg',300)),NULL);
  SELECT disponible INTO saldo FROM proc_v_pallet_saldos WHERE pallet_id=pal;
  IF saldo<>200 THEN RAISE EXCEPTION 'E: saldo tras despacho parcial=% (esp 200)',saldo; END IF;
  -- Traslado del pallet (con saldo) a otra cámara; identidad DEBE sobrevivir
  PERFORM proc_fn_trasladar_pallet(e,pal,uid('u_cam2'),NULL);
  PERFORM 1 FROM proc_pallet WHERE id=pal AND ubicacion_id=uid('u_cam2');
  IF NOT FOUND THEN RAISE EXCEPTION 'E: el pallet perdió identidad/ubicación tras traslado'; END IF;
  -- Despacho 2: 40 cajas / 200 kg → saldo 0
  d2 := proc_fn_crear_despacho(e,'E-D002',uid('planta'),uid('cli_rioblanco'),uid('expo_gesex'),NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=d2; UPDATE proc_despacho SET estado='listo' WHERE id=d2;
  PERFORM proc_fn_confirmar_despacho(e,d2,jsonb_build_array(jsonb_build_object('pallet_id',pal,'pt_id',pt,'cajas',40,'kg',200)),NULL);
  SELECT disponible INTO saldo FROM proc_v_pallet_saldos WHERE pallet_id=pal;
  IF saldo<>0 THEN RAISE EXCEPTION 'E: saldo final=% (esp 0)',saldo; END IF;
  RAISE NOTICE 'E OK despacho parcial: 100 cajas -> 60 (saldo 40/200) -> traslado -> 40 (saldo 0); identidad de pallet intacta';
END $$;

-- ═══════════ ESCENARIO F — CLIENTE ≠ EXPORTADORA ≠ PRODUCTOR ≠ DUEÑO ≠ DEST ══
DO $$
DECLARE e uuid:=uid('emp'); rec uuid; desp uuid;
  cli uuid; prod uuid; dueno uuid; expo uuid; dest uuid; n int;
BEGIN
  cli:=uid('cli_rioblanco'); prod:=uid('prod_parron'); dueno:=uid('dueno_tercero'); expo:=uid('expo_copefrut'); dest:=uid('expo_gesex');
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,dueno_fruta_vinculo_id,exportadora_vinculo_id,especie_codigo,kg_neto)
    VALUES (e,'F-R001',uid('planta'),cli,prod,dueno,expo,'CHE',1000) RETURNING id INTO rec;
  desp := proc_fn_crear_despacho(e,'F-D001',uid('planta'),cli,dest,NULL);
  -- Verificar: 5 roles, 5 ids distintos, ninguno colapsa
  SELECT count(DISTINCT v) INTO n FROM (VALUES (cli),(prod),(dueno),(expo),(dest)) AS t(v);
  IF n<>5 THEN RAISE EXCEPTION 'F: roles colapsados, solo % ids distintos',n; END IF;
  PERFORM 1 FROM proc_recepcion WHERE id=rec AND cliente_servicio_vinculo_id=cli AND productor_vinculo_id=prod
     AND dueno_fruta_vinculo_id=dueno AND exportadora_vinculo_id=expo;
  IF NOT FOUND THEN RAISE EXCEPTION 'F: recepción no preservó los 4 roles distintos'; END IF;
  PERFORM 1 FROM proc_despacho WHERE id=desp AND cliente_servicio_vinculo_id=cli AND destinatario_vinculo_id=dest AND cli<>dest;
  IF NOT FOUND THEN RAISE EXCEPTION 'F: despacho colapsó cliente y destinatario'; END IF;
  RAISE NOTICE 'F OK 5 roles distintos preservados: cliente≠productor≠dueño≠exportadora≠destinatario';
END $$;

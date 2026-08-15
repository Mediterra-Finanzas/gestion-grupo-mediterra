-- ============================================================================
--  seed_proc_DEV_UAT.sql
--  ⚠️  DEV / LOCAL UAT ONLY — NEVER APPLY TO PRODUCTION — DATOS FICTICIOS
--  Dataset representativo de Allegria Service para revisión visual (F7.8.1-D).
--  NO son "maestros reales de Rancagua". Empresa DEV fija (§5) SOLO en este seed.
--  Requiere: schema v1..v7_7 + schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql aplicados.
-- ============================================================================
DO $$
DECLARE
  e uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';  -- Allegria Service (DEV)
  pl uuid; tmp text := '2025/2026';
  uRec uuid; uC1 uuid; uC2 uuid; uPre uuid; uDes uuid;
  vCliA uuid; vProdA uuid; vProdB uuid; vExpA uuid; vExpC uuid; vTrans uuid; vFoods uuid; vMessy uuid;
  cat uuid; catCom uuid; mdes uuid; mmer uuid; fmt uuid; lin uuid;
  r1 uuid; r2 uuid; r3 uuid; lote1 uuid; lote2 uuid; lote3 uuid;
  o1 uuid; o2 uuid; res1 uuid; pt1 uuid; pal1 uuid; pal2 uuid;
  desp uuid; inf uuid; ver uuid; tsProc uuid; tsInsp uuid; sf uuid; sfPend uuid; base uuid;
BEGIN
  -- limpieza idempotente del tenant DEV (por si se re-siembra)
  DELETE FROM proc_empresa_config WHERE empresa_id=e;

  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (e, 0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'PL-DEV','Planta Rancagua (DEV)') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,fecha_inicio,fecha_fin,estado) VALUES (e,tmp,'Temporada 2025/2026','2025-07-01','2026-06-30','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES
    (e,pl,'REC','Recepción','zona') RETURNING id INTO uRec;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO uC1;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM2','Cámara 2','camara') RETURNING id INTO uC2;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'PRE','Pre-Proceso','zona') RETURNING id INTO uPre;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'DES','Despacho','patio') RETURNING id INTO uDes;

  -- Vínculos (contrapartes; NO Frisku). Nombre "messy" a propósito para ver normalización en UI.
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cliente A','cliente_servicio') RETURNING id INTO vCliA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'agrícola las nieves spa','productor') RETURNING id INTO vProdA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Productor B','productor') RETURNING id INTO vProdB;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Exportadora A','exportadora') RETURNING id INTO vExpA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'ANTON DÜRBECK GMBH','exportadora') RETURNING id INTO vExpC;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Transportista A','transportista') RETURNING id INTO vTrans;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Allegria Foods','cliente_servicio') RETURNING id INTO vFoods;

  -- Catálogos
  INSERT INTO proc_calibre(empresa_id,especie_codigo,codigo,nombre,orden) VALUES (e,'CHE','J','Jumbo',1),(e,'CHE','XL','Extra Large',2),(e,'PLU','A','Calibre A',1);
  INSERT INTO proc_color(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','DR','Dark Red'),(e,'CHE','MH','Mahogany');
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre,es_comercial) VALUES (e,'EXP','Exportable',true) RETURNING id INTO cat;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre,es_comercial) VALUES (e,'COM','Comercial',true) RETURNING id INTO catCom;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'DAN','Daño') RETURNING id INTO mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DES','Deshidratación') RETURNING id INTO mmer;
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja,activo) VALUES (e,'CHE','CHE-5KG','Caja 5kg cereza',5,true) RETURNING id INTO fmt;
  INSERT INTO proc_lineas_proceso(empresa_id,planta_id,codigo,nombre,activa) VALUES (e,pl,'L1','Línea 1',true) RETURNING id INTO lin;
  -- QC params CHE: 3 severidades
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,unidad,rango_min,rango_max,severidad,obligatorio,orden,activo) VALUES
    (e,'CHE','BRIX','Sólidos solubles','numero','°Bx',16,NULL,'bloqueante',true,1,true),
    (e,'CHE','FIRM','Firmeza','numero','g/mm',NULL,NULL,'advertencia',false,2,true),
    (e,'CHE','TEMP','Temperatura pulpa','numero','°C',NULL,8,'informativo',false,3,true);

  -- ── Recepción 1: lote CHE 10.000, QC APROBADO ──
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,especie_codigo,kg_bruto,tara,kg_neto,estado,cliente_servicio_vinculo_id,productor_vinculo_id,exportadora_vinculo_id)
    VALUES (e,'REC-2526-000001',pl,'CHE',10200,200,10000,'recibida',vCliA,vProdA,vExpA) RETURNING id INTO r1;
  PERFORM proc_fn_registrar_qc(e,r1,'{"BRIX":"18","FIRM":"320","TEMP":"6"}'::jsonb,NULL);
  lote1 := proc_fn_ingresar_lote_ubicado(e,r1,'LOT-2526-000001','CHE','Santina',10000,pl,tmp,uC1,NULL);

  -- ── Recepción 2: lote CHE 5.000, QC RECHAZADO (BRIX bajo, bloqueante) ──
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,especie_codigo,kg_bruto,tara,kg_neto,estado,cliente_servicio_vinculo_id,productor_vinculo_id,exportadora_vinculo_id)
    VALUES (e,'REC-2526-000002',pl,'CHE',5100,100,5000,'recibida',vCliA,vProdB,vExpC) RETURNING id INTO r2;
  PERFORM proc_fn_registrar_qc(e,r2,'{"BRIX":"12","FIRM":"250","TEMP":"7"}'::jsonb,NULL);
  lote2 := proc_fn_ingresar_lote_ubicado(e,r2,'LOT-2526-000002','CHE','Lapins',5000,pl,tmp,uC2,NULL);

  -- ── Recepción 3: lote PLU 3.000, QC APROBADO (para variedad/segunda especie) ──
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,especie_codigo,kg_bruto,tara,kg_neto,estado,cliente_servicio_vinculo_id,productor_vinculo_id)
    VALUES (e,'REC-2526-000003',pl,'PLU',3050,50,3000,'recibida',vFoods,vProdA) RETURNING id INTO r3;
  lote3 := proc_fn_ingresar_lote_ubicado(e,r3,'LOT-2526-000003','PLU','D''Agen',3000,pl,tmp,uC2,NULL);

  -- ── Programa ──
  INSERT INTO proc_programa_proceso(empresa_id,folio,planta_id,fecha,especie_codigo,variedad_codigo,kg_estimado,prioridad,estado,cliente_servicio_vinculo_id)
    VALUES (e,'PRG-2526-000001',pl,current_date,'CHE','Santina',10000,1,'publicado',vCliA),
           (e,'PRG-2526-000002',pl,current_date+1,'PLU','D''Agen',3000,2,'borrador',vFoods);

  -- ── Orden 1: cadena COMPLETA (consume→resultado→conciliar→cerrar→PT→pallets→hold→repaletizaje) ──
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,linea_id,estado,fecha,especie_codigo,variedad_codigo,turno,cliente_servicio_vinculo_id)
    VALUES (e,'ORD-2526-000001',pl,lin,'en_proceso','2025-12-10','CHE','Santina','Día',vCliA) RETURNING id INTO o1;
  PERFORM proc_fn_consumir_lote_en_orden(e,o1,lote1,9800,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,calibre_id,color_id,kg) VALUES (e,o1,cat,
    (SELECT id FROM proc_calibre WHERE empresa_id=e AND especie_codigo='CHE' AND codigo='J'),
    (SELECT id FROM proc_color   WHERE empresa_id=e AND especie_codigo='CHE' AND codigo='DR'),7800) RETURNING id INTO res1;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,o1,mdes,1700);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,o1,mmer,300);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=o1;
  PERFORM proc_fn_conciliar_orden(e,o1,NULL);
  UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=o1;
  -- PT + pallets
  pt1 := proc_fn_materializar_pt(e,res1,fmt,1560,7800,NULL);          -- 7800kg / 5kg = 1560 cajas
  pal1 := proc_fn_crear_pallet(e,'PAL-2526-000001',tmp,pl,fmt,uC1,NULL);
  PERFORM proc_fn_palletizar(e,pt1,pal1,900,4500,NULL);
  pal2 := proc_fn_crear_pallet(e,'PAL-2526-000002',tmp,pl,fmt,uC1,NULL);
  PERFORM proc_fn_palletizar(e,pt1,pal2,660,3300,NULL);
  -- hold: pallet 2 con bloqueo QC (para ver "bloqueado")
  PERFORM proc_fn_hold_pallet(e,pal2,'bloqueo',3300,'Retención QC destino (DEV)',NULL);
  -- repaletizaje: mover 1000kg de pal1 a un pallet nuevo (destino debe existir)
  DECLARE pal3 uuid;
  BEGIN
    pal3 := proc_fn_crear_pallet(e,'PAL-2526-000003',tmp,pl,fmt,uC2,NULL);
    PERFORM proc_fn_repaletizar(e,'Reacomodo cámara (DEV)','repaletizaje',
      json_build_array(json_build_object(
        'origen_pallet_id',pal1,'pt_id',pt1,'cajas',200,'kg',1000,'destino_pallet_id',pal3))::jsonb, NULL);
  END;

  -- ── Orden 2: PENDIENTE de conciliación (consume, sin cerrar) ──
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,linea_id,estado,fecha,especie_codigo,variedad_codigo,turno,cliente_servicio_vinculo_id)
    VALUES (e,'ORD-2526-000002',pl,lin,'en_proceso','2025-12-12','PLU','D''Agen','Noche',vFoods) RETURNING id INTO o2;
  PERFORM proc_fn_consumir_lote_en_orden(e,o2,lote3,2500,NULL,NULL);
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,o2,catCom,2000);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=o2;

  -- ── Despacho: preparado + reserva sobre pallet 1 (estado listo) ──
  desp := proc_fn_crear_despacho(e,'DES-2526-000001',pl,vCliA,vExpA,NULL);
  UPDATE proc_despacho SET fecha_prevista=current_date+2, transportista_vinculo_id=vTrans WHERE id=desp;
  UPDATE proc_despacho SET estado='preparando' WHERE id=desp;
  PERFORM proc_fn_reservar_pallet(e,desp,pal1,2000,NULL);
  UPDATE proc_despacho SET estado='listo' WHERE id=desp;

  -- ── Informe de Resultado (crear → versión → emitir) ──
  inf := proc_fn_crear_informe(e,'INF-2526-000001',tmp,pl,vCliA,NULL);
  ver := proc_fn_generar_version(e,inf,ARRAY[o1],'Resultado corrida Santina (DEV)',NULL,NULL);
  PERFORM proc_fn_emitir_version(e,ver,'dev/uat/informe-1.pdf',NULL);

  -- ── Comercial: tarifas + servicios + base ──
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'PROC','Proceso','kg_procesado') RETURNING id INTO tsProc;
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'INSP','Inspección','evento') RETURNING id INTO tsInsp;
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta,prioridad) VALUES
    (e,tsProc,NULL,'kg_procesado',0.25,'USD','2025-07-01','2026-06-30',0);
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,especie_codigo,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta,prioridad) VALUES
    (e,tsProc,vCliA,'CHE','kg_procesado',0.30,'USD','2025-07-01','2026-06-30',1);
  -- servicio valorizado (orden 1, PROC) + pendiente de tarifa (orden 1, INSP sin tarifa)
  sf := proc_fn_generar_servicio_proceso(e,o1,vCliA,tsProc,NULL);
  sfPend := proc_fn_generar_servicio_proceso(e,o1,vCliA,tsInsp,NULL);
  -- base de cobro en BORRADOR (por aprobar) con el servicio valorizado
  base := proc_fn_crear_base_cobro(e,'BCO-2526-000001',vCliA,tmp,'2025-12-01','2025-12-31','USD',NULL);
  PERFORM proc_fn_agregar_a_base(e,base,sf,NULL);

  RAISE NOTICE 'seed_proc_DEV_UAT: dataset DEV cargado para empresa %', e;
END $$;

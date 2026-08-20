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
  -- 2026/2027: temporada vigente para la fecha operacional "hoy" (derivación por fecha, FOP-9). DEV_ONLY.
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,fecha_inicio,fecha_fin,estado) VALUES (e,'2026/2027','Temporada 2026/2027','2026-07-01','2027-06-30','activa') ON CONFLICT DO NOTHING;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES
    (e,pl,'REC','Recepción','zona') RETURNING id INTO uRec;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO uC1;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM2','Cámara 2','camara') RETURNING id INTO uC2;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'PRE','Pre-Proceso','zona') RETURNING id INTO uPre;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'DES','Despacho','patio') RETURNING id INTO uDes;

  -- Vínculos (contrapartes; NO Frisku). Nombre "messy" a propósito para ver normalización en UI.
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Cliente Andes','cliente_servicio') RETURNING id INTO vCliA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'agrícola las nieves spa','productor') RETURNING id INTO vProdA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Productor B','productor') RETURNING id INTO vProdB;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Exportadora A','exportadora') RETURNING id INTO vExpA;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'ANTON DÜRBECK GMBH','exportadora') RETURNING id INTO vExpC;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Transportista A','transportista') RETURNING id INTO vTrans;
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Allegria Foods','cliente_servicio') RETURNING id INTO vFoods;
  -- Identidad self de Allegria Service (owner/holder explícito de envases; PROC-ENVASES-001).
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Allegria Service','propietario_planta');

  -- Catálogo especie/variedad (requerido por el FK del cutover T5b; DEV/UAT, no relaja el FK)
  -- Tipos de envase retornable (PROC-ENVASES-001 E1) — DEV_ONLY, configurables.
  INSERT INTO proc_tipo_envase(empresa_id,codigo,nombre,categoria,unidad,retornable,activo) VALUES
    (e,'BIN','Bin','cosecha','unidad',true,true),
    (e,'TOTE','Tote','cosecha','unidad',true,true),
    (e,'REJILLA','Rejilla','proceso','unidad',true,true)
    ON CONFLICT (empresa_id,codigo) DO NOTHING;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES
    (e,'CHE','Santina','Santina'),(e,'CHE','Lapins','Lapins'),(e,'PLU','D''Agen','D''Agen');

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

-- ============================================================================
-- Bloque contractual (UAT-SEED-CONTRACT-01) — DEV/UAT, IDEMPOTENTE.
-- Cubre cobertura visual de: Ficha Cliente, contrato vigente / pendiente de firma
-- / vencido / reemplazado (historial), política bloqueante, alerta contractual del
-- Centro y navegación a la Ficha. Sin tocar schema/reglas/identidad. Documento = solo
-- metadata DEV (documento_path), Storage NO aprovisionado. Guards ON CONFLICT/NOT EXISTS
-- → re-aplicar no duplica. Usa el backend T6-T9 CURRENT (fichas/contratos/cliente-productor).
-- ============================================================================
DO $$
DECLARE e uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  vCliA uuid; vProdA uuid; vProdB uuid; vB uuid; tdoc uuid;
  pl uuid; uC1 uuid; uC2 uuid; predN uuid; predS uuid; cC01 uuid; cC02 uuid; cN04 uuid; recM uuid;
  tmp text := '2025/2026';
BEGIN
  -- Fixture de nombre (T11-VIS-NORM-01): "Cliente A" → "Cliente Andes" (idempotente).
  UPDATE proc_vinculo SET nombre_provisional='Cliente Andes'
    WHERE empresa_id=e AND rol_operacional='cliente_servicio' AND nombre_provisional='Cliente A';
  SELECT id INTO vCliA FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='cliente_servicio' AND nombre_provisional='Cliente Andes' LIMIT 1;
  SELECT id INTO vProdA FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='productor' AND nombre_provisional='agrícola las nieves spa' LIMIT 1;
  SELECT id INTO vProdB FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='productor' AND nombre_provisional='Productor B' LIMIT 1;

  -- Tipo de documento contractual (satisface el requisito)
  INSERT INTO proc_tipo_documento_contractual(empresa_id,codigo,nombre,satisface_requisito_contractual,activo)
    VALUES (e,'CONTRATO','Contrato de servicio',true,true)
    ON CONFLICT (empresa_id,codigo) DO NOTHING;
  SELECT id INTO tdoc FROM proc_tipo_documento_contractual WHERE empresa_id=e AND codigo='CONTRATO';

  -- Relación Cliente A ↔ Productor A (existente, N:M)
  IF vCliA IS NOT NULL AND vProdA IS NOT NULL THEN
    INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id)
      VALUES (e,vCliA,vProdA) ON CONFLICT (empresa_id,cliente_vinculo_id,productor_vinculo_id) DO NOTHING;
  END IF;

  -- Cliente A: ficha (política advertencia) + contrato VIGENTE firmado + historial (v1 reemplazado → v2 vigente)
  IF vCliA IS NOT NULL THEN
    INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,contacto_principal,email,telefono,responsable_comercial,politica_contrato)
      VALUES (e,vCliA,'Juan Pérez','contacto@clientea.dev','+56 9 1111 1111','Carla Soto','advertencia')
      ON CONFLICT (empresa_id,cliente_vinculo_id) DO NOTHING;
    INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,tipo_vigencia,fecha_inicio,fecha_termino,estado,requiere_firma,fecha_firma,version,documento_path,observaciones)
      VALUES (e,vCliA,'CT-A',tdoc,'por_temporada',current_date-400,current_date-30,'reemplazado',true,current_date-395,1,'contratos/dev/CT-A-v1.pdf','Versión inicial (DEV, sólo metadata)')
      ON CONFLICT (empresa_id,cliente_vinculo_id,codigo,version) DO NOTHING;
    INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,tipo_vigencia,fecha_inicio,fecha_termino,estado,requiere_firma,fecha_firma,version,reemplaza_contrato_id,documento_path,observaciones)
      VALUES (e,vCliA,'CT-A',tdoc,'por_temporada',current_date-20,current_date+300,'vigente',true,current_date-20,2,
              (SELECT id FROM proc_cliente_contrato WHERE empresa_id=e AND cliente_vinculo_id=vCliA AND codigo='CT-A' AND version=1),
              'contratos/dev/CT-A-v2.pdf','Renovación vigente y firmada (DEV, sólo metadata)')
      ON CONFLICT (empresa_id,cliente_vinculo_id,codigo,version) DO NOTHING;
  END IF;

  -- Cliente B: vínculo nuevo + ficha política BLOQUEANTE + contrato VENCIDO (v1) + PENDIENTE DE FIRMA (v2) → nivel bloqueante
  SELECT id INTO vB FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='cliente_servicio' AND nombre_provisional='Cliente B' LIMIT 1;
  IF vB IS NULL THEN
    INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional,rut)
      VALUES (e,true,'Cliente B','cliente_servicio','76.543.210-9') RETURNING id INTO vB;
  END IF;
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,contacto_principal,email,telefono,responsable_comercial,politica_contrato)
    VALUES (e,vB,'María López','contacto@clienteb.dev','+56 9 2222 2222','Carla Soto','bloqueante')
    ON CONFLICT (empresa_id,cliente_vinculo_id) DO NOTHING;
  -- Contratos de Cliente B (fixture bloqueado): v1 vencido + v2 pendiente_firma → NINGÚN contrato
  -- vigente firmado → gate bloqueado. DELETE+INSERT = determinista e idempotente; auto-sana estados
  -- previos (una iteración anterior activó v2 a 'vigente'/firmado y el guard prohíbe revertir por
  -- UPDATE). Sólo el cliente DEV vB; no toca ledger, movimientos ni datos legacy.
  -- ⚠ DEV_ONLY — ADVERTENCIA: este DELETE+INSERT reconstruye contratos a un estado fijo y es
  --   EXCLUSIVO de fixtures de prueba. NUNCA usar como patrón para contratos productivos ni para
  --   corregir historia real: en producción los contratos son inmutables por versión, sólo
  --   transicionan de estado vía el guard, y su historial de firmas/versiones es evidencia legal
  --   que jamás se borra. Este bloque vive sólo en seed_proc_DEV_UAT.sql y no debe migrar a prod.
  DELETE FROM proc_cliente_contrato WHERE empresa_id=e AND cliente_vinculo_id=vB AND codigo='CT-B';
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,tipo_vigencia,fecha_inicio,fecha_termino,estado,requiere_firma,fecha_firma,version,documento_path,observaciones)
    VALUES (e,vB,'CT-B',tdoc,'por_temporada',current_date-400,current_date-30,'vencido',true,current_date-395,1,'contratos/dev/CT-B-v1.pdf','Contrato vencido (DEV, sólo metadata)');
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,tipo_vigencia,fecha_inicio,fecha_termino,estado,requiere_firma,version,documento_path,observaciones)
    VALUES (e,vB,'CT-B',tdoc,'por_temporada',current_date,current_date+300,'pendiente_firma',true,2,'contratos/dev/CT-B-v2.pdf','Renovación pendiente de firma (DEV, sólo metadata)');

  -- ── Recepción DEV multi-origen (T11-VIS-ORIGIN-01): 3 lotes con Productor/Predio/Cuartel/
  --    Especie/Variedad → snapshot de origen generado por backend. Idempotente por folio.
  --    NO modifica los lotes legacy existentes. Solo DEV/UAT.
  SELECT id INTO pl  FROM proc_planta      WHERE empresa_id=e AND codigo='PL-DEV' LIMIT 1;
  SELECT id INTO uC1 FROM proc_ubicaciones WHERE empresa_id=e AND codigo='CAM1' LIMIT 1;
  SELECT id INTO uC2 FROM proc_ubicaciones WHERE empresa_id=e AND codigo='CAM2' LIMIT 1;
  IF pl IS NOT NULL AND vCliA IS NOT NULL AND NOT EXISTS (SELECT 1 FROM proc_recepcion WHERE empresa_id=e AND folio='REC-2526-000010') THEN
    -- Predios (idempotentes por nombre)
    SELECT id INTO predN FROM proc_predios WHERE empresa_id=e AND nombre='Predio Norte (DEV)' LIMIT 1;
    IF predN IS NULL THEN INSERT INTO proc_predios(empresa_id,productor_vinculo_id,nombre,csg_sag,comuna) VALUES (e,vProdA,'Predio Norte (DEV)','CSG-PN-DEV','Rancagua') RETURNING id INTO predN; END IF;
    SELECT id INTO predS FROM proc_predios WHERE empresa_id=e AND nombre='Predio Sur (DEV)' LIMIT 1;
    IF predS IS NULL THEN INSERT INTO proc_predios(empresa_id,productor_vinculo_id,nombre,csg_sag,comuna) VALUES (e,vProdB,'Predio Sur (DEV)','CSG-PS-DEV','Rengo') RETURNING id INTO predS; END IF;
    -- Cuarteles (idempotentes por predio+codigo)
    SELECT id INTO cC01 FROM proc_cuartel WHERE empresa_id=e AND predio_id=predN AND codigo='C-01' LIMIT 1;
    IF cC01 IS NULL THEN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predN,'C-01','CHE','Santina') RETURNING id INTO cC01; END IF;
    SELECT id INTO cC02 FROM proc_cuartel WHERE empresa_id=e AND predio_id=predN AND codigo='C-02' LIMIT 1;
    IF cC02 IS NULL THEN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predN,'C-02','CHE','Lapins') RETURNING id INTO cC02; END IF;
    SELECT id INTO cN04 FROM proc_cuartel WHERE empresa_id=e AND predio_id=predS AND codigo='N-04' LIMIT 1;
    IF cN04 IS NULL THEN INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,predS,'N-04','PLU','D''Agen') RETURNING id INTO cN04; END IF;
    -- Recepción multi-origen: Σ lotes 4000+3000+2000 = 9000 = kg_neto (concilia)
    INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,especie_codigo,kg_bruto,tara,kg_neto,estado)
      VALUES (e,'REC-2526-000010',pl,vCliA,'CHE',9200,200,9000,'recibida') RETURNING id INTO recM;
    PERFORM proc_fn_ingresar_lote_ubicado(e,recM,'LOT-2526-000010','CHE','Santina',4000,pl,tmp,uC1,NULL,vProdA,predN,cC01);
    PERFORM proc_fn_ingresar_lote_ubicado(e,recM,'LOT-2526-000011','CHE','Lapins', 3000,pl,tmp,uC1,NULL,vProdA,predN,cC02);
    PERFORM proc_fn_ingresar_lote_ubicado(e,recM,'LOT-2526-000012','PLU','D''Agen',2000,pl,tmp,uC2,NULL,vProdB,predS,cN04);
  END IF;

  RAISE NOTICE 'seed_proc_DEV_UAT (contractual+multiorigen): Cliente Andes vigente / Cliente B bloqueante / recepción multi-origen REC-...010 (3 orígenes)';
END $$;

-- ============================================================================
-- EXTENSIÓN §11/§12 (DEV/UAT): movimientos de envase + Reporting Daily config/destinatario.
-- Resuelve entidades por clave natural (rol_operacional/codigo) para no depender de UUIDs literales.
-- Idempotente por guardas NOT EXISTS. Datos sintéticos; email de destinatario NO real.
-- ============================================================================
DO $$
DECLARE
  e uuid; svc uuid; ter uuid; binv uuid; totev uuid; rec uuid; cam1 uuid; pl uuid; cfg uuid;
BEGIN
  SELECT id INTO e FROM contab_empresas WHERE codigo='ALS';
  SELECT id INTO svc  FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='propietario_planta' ORDER BY created_at LIMIT 1;
  SELECT id INTO ter  FROM proc_vinculo WHERE empresa_id=e AND rol_operacional='cliente_servicio'  ORDER BY created_at LIMIT 1;
  SELECT id INTO binv FROM proc_tipo_envase WHERE empresa_id=e AND codigo='BIN'  LIMIT 1;
  SELECT id INTO totev FROM proc_tipo_envase WHERE empresa_id=e AND codigo='TOTE' LIMIT 1;
  SELECT id INTO rec  FROM proc_ubicaciones WHERE empresa_id=e AND codigo='REC'  LIMIT 1;
  SELECT id INTO cam1 FROM proc_ubicaciones WHERE empresa_id=e AND codigo='CAM1' LIMIT 1;
  SELECT id INTO pl   FROM proc_planta      WHERE empresa_id=e ORDER BY created_at LIMIT 1;

  -- Movimientos de envase (solo si aún no hay ninguno)
  IF svc IS NOT NULL AND binv IS NOT NULL AND rec IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM proc_envase_movimiento WHERE empresa_id=e) THEN
    PERFORM proc_fn_envase_registrar_movimiento(e, binv, 100, 'apertura', svc, NULL, svc, NULL, rec);                        -- 100 BIN en Service/REC
    PERFORM proc_fn_envase_registrar_movimiento(e, binv, 30,  'salida',   svc, svc, ter, rec, NULL);                        -- 30 BIN a terceros (Cliente)
    PERFORM proc_fn_envase_registrar_movimiento(e, binv, 5,   'dano',     svc, svc, svc, rec, rec, 'normal','danado', NULL, NULL, 'rotura en manejo'); -- 5 BIN dañados
    IF totev IS NOT NULL AND cam1 IS NOT NULL THEN
      PERFORM proc_fn_envase_registrar_movimiento(e, totev, 40, 'apertura', svc, NULL, svc, NULL, cam1);                    -- 40 TOTE en Service/CAM1
    END IF;
    RAISE NOTICE 'seed envases: BIN 65 Service / 5 dañado / 30 terceros; TOTE 40 Service';
  END IF;

  -- Reporting Daily: config (con alertas) + destinatario DEV (email NO real)
  IF NOT EXISTS (SELECT 1 FROM proc_reporte_config WHERE empresa_id=e) THEN
    INSERT INTO proc_reporte_config (empresa_id, tipo_reporte, nombre, activo, planta_id, timezone, hora_envio, enviar_sin_movimiento, incluir_alertas, alcance, asunto_prefijo)
    VALUES (e, 'diario_operacion', 'Informe Diario Operación (DEV)', true, pl, 'America/Santiago', '18:00', false, true, 'general', '[DEV] ')
    RETURNING id INTO cfg;
    INSERT INTO proc_reporte_destinatario (empresa_id, config_id, nombre, email, tipo, activo)
    VALUES (e, cfg, 'Destinatario DEV', 'dev.uat@example.invalid', 'interno', true);
    RAISE NOTICE 'seed reporting: config diario_operacion (incluir_alertas) + 1 destinatario DEV sintético';
  END IF;
END $$;

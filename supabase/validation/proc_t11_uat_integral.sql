-- ============================================================================
-- proc_t11_uat_integral.sql · T11 UAT INTEGRAL de Allegria Service.
-- Certifica CONTINUIDAD punta a punta sobre UN dataset DEV/UAT: trazabilidad
-- agrícola+comercial, recepción multi-lote obligatoria, QC por lote mixto,
-- conciliación de masa, gate contractual, genealogía bidireccional, reporting.
-- Datos marcados DEV/UAT. Superuser (RLS bypass; el aislamiento va en el gate RLS).
-- REQ: cadena completa F1..reporting_daily. NO producción.
-- ============================================================================
DO $$
DECLARE
  e uuid := gen_random_uuid();  -- empresa UAT (DEV/UAT)
  tz text := 'America/Santiago'; hoy date := (now() AT TIME ZONE 'America/Santiago')::date; tmp text := '2025/2026';
  pl uuid; u1 uuid; u2 uuid; fmt uuid; cat uuid; mdes uuid; mmer uuid;
  cliA uuid; cliB uuid; cliC uuid; foods uuid; grp uuid;
  pA uuid; pB uuid; prA uuid; prB uuid; cC01 uuid; cC02 uuid; cN04 uuid;
  cA_contr uuid; cB_contr uuid;
  rec uuid; l1 uuid; l2 uuid; l3 uuid; ec jsonb; hab jsonb; resu numeric; el jsonb;
  oA uuid; res_id uuid; pt uuid; palletA uuid; desp uuid; gen jsonb;
  cfg uuid; ej proc_reporte_ejecucion; n int; s numeric; km numeric; tsProc uuid;
BEGIN
  -- ══════════ DATASET DEV/UAT ══════════
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct,tolerancia_recepcion_pct) VALUES (e,0.5,0.5);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'UAT','Planta UAT Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'Temporada UAT','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO u1;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM2','Cámara 2','camara') RETURNING id INTO u2;
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza'),(e,'PLU','Ciruela');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES
    (e,'CHE','SANTINA','Santina'),(e,'CHE','REGINA','Regina'),(e,'PLU','DAGEN','D''Agen');
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja) VALUES (e,'CHE','C5','Caja 5kg',5) RETURNING id INTO fmt;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','Exportable') RETURNING id INTO cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'BL','Blanda') RETURNING id INTO mdes;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DH','Deshidratación') RETURNING id INTO mmer;
  -- QC params: bloqueante + condicional(advertencia) + informativo (CHE); bloqueante (PLU)
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,rango_max,severidad,obligatorio,activo) VALUES
    (e,'CHE','BRIX','Brix','numero',16,NULL,'bloqueante',true,true),
    (e,'CHE','DEF','Defectos','numero',NULL,5,'advertencia',false,true),
    (e,'CHE','TEMP','Temperatura','numero',NULL,8,'informativo',false,true),
    (e,'PLU','BRIX','Brix','numero',14,NULL,'bloqueante',true,true);
  -- Clientes Service + Productores + Predios + Cuarteles
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente A UAT') RETURNING id INTO cliA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente B UAT') RETURNING id INTO cliB;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente C UAT') RETURNING id INTO cliC;
  INSERT INTO contab_empresas(id) VALUES (gen_random_uuid()) RETURNING id INTO grp;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,grupo_empresa_id) VALUES (e,'cliente_servicio',false,'Allegria Foods SpA',grp) RETURNING id INTO foods;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,rut,csg_sag) VALUES (e,'productor',true,'Productor A UAT','11.111.111-1','CSG-A') RETURNING id INTO pA;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,rut,csg_sag) VALUES (e,'productor',true,'Productor B UAT','22.222.222-2','CSG-B') RETURNING id INTO pB;
  -- Productor A compartido por Cliente A y Cliente B (N:M sin ownership)
  INSERT INTO proc_cliente_productor(empresa_id,cliente_vinculo_id,productor_vinculo_id) VALUES (e,cliA,pA),(e,cliB,pA);
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,nombre,csg_sag,comuna) VALUES (e,pA,'Predio A','CSG-PA','Rancagua') RETURNING id INTO prA;
  INSERT INTO proc_predios(empresa_id,productor_vinculo_id,nombre,csg_sag,comuna) VALUES (e,pB,'Predio B','CSG-PB','Rengo') RETURNING id INTO prB;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,prA,'C-01','CHE','SANTINA') RETURNING id INTO cC01;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,prA,'C-02','CHE','REGINA') RETURNING id INTO cC02;
  INSERT INTO proc_cuartel(empresa_id,predio_id,codigo,especie_codigo,variedad_codigo) VALUES (e,prB,'N-04','PLU','DAGEN') RETURNING id INTO cN04;
  -- Fichas + Contratos (A vigente, B vencido, C bloqueante)
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cliA,'bloqueante');
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cliB,'advertencia');
  INSERT INTO proc_cliente_ficha(empresa_id,cliente_vinculo_id,politica_contrato) VALUES (e,cliC,'bloqueante');
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,estado,fecha_inicio,fecha_termino,requiere_firma,fecha_firma) VALUES (e,cliA,'CT-A','vigente',hoy-10,hoy+300,true,hoy-10) RETURNING id INTO cA_contr;
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,estado,fecha_inicio,fecha_termino,requiere_firma,fecha_firma) VALUES (e,cliB,'CT-B','vencido',hoy-400,hoy-30,true,hoy-400) RETURNING id INTO cB_contr;
  -- Tipo de servicio + Tarifa vigente general (Cliente C queda sin tarifa específica)
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'PROC','Proceso','kg_procesado') RETURNING id INTO tsProc;
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (e,tsProc,NULL,'kg_procesado',0.25,'USD',hoy-30,hoy+300);

  -- ══════════ GATE CONTRACTUAL (T8) ══════════
  ec := proc_fn_estado_contractual_cliente(e,cliA); IF ec->>'nivel'<>'ok' THEN RAISE EXCEPTION 'UAT gate: A debía ser ok, got %',ec->>'nivel'; END IF;
  ec := proc_fn_estado_contractual_cliente(e,cliB); IF (ec->>'tiene_contrato_vigente')::bool THEN RAISE EXCEPTION 'UAT gate: B vencido no vigente'; END IF;
  ec := proc_fn_estado_contractual_cliente(e,cliC); IF ec->>'nivel'<>'bloqueante' THEN RAISE EXCEPTION 'UAT gate: C bloqueante'; END IF;
  hab := proc_fn_cliente_habilitado_para_operar(e,cliC,hoy,'recepcion'); IF (hab->>'habilitado')::bool IS NOT TRUE THEN RAISE EXCEPTION 'UAT gate: recepción física SIEMPRE permitida (C)'; END IF;
  hab := proc_fn_cliente_habilitado_para_operar(e,cliC,hoy,'proceso'); IF (hab->>'habilitado')::bool IS NOT FALSE OR hab->>'motivo' IS NULL THEN RAISE EXCEPTION 'UAT gate: C proceso bloqueado con motivo'; END IF;
  hab := proc_fn_cliente_habilitado_para_operar(e,cliA,hoy,'proceso'); IF (hab->>'habilitado')::bool IS NOT TRUE THEN RAISE EXCEPTION 'UAT gate: A vigente proceso habilitado'; END IF;

  -- ══════════ RECEPCIÓN MULTI-LOTE OBLIGATORIA (Cliente A, 9000 neto) ══════════
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto,especie_codigo,cliente_servicio_vinculo_id,planta_id,estado) VALUES (e,'REC-UAT-1',9000,'CHE',cliA,pl,'borrador') RETURNING id INTO rec;
  l1 := proc_fn_ingresar_lote_ubicado(e,rec,'L1','CHE','SANTINA',4000,pl,tmp,u1,NULL,pA,prA,cC01);
  l2 := proc_fn_ingresar_lote_ubicado(e,rec,'L2','CHE','REGINA', 3000,pl,tmp,u1,NULL,pA,prA,cC02);
  l3 := proc_fn_ingresar_lote_ubicado(e,rec,'L3','PLU','DAGEN',  2000,pl,tmp,u1,NULL,pB,prB,cN04);
  SELECT count(*) INTO n FROM proc_lote WHERE recepcion_id=rec AND deleted_at IS NULL;
  IF n<>3 THEN RAISE EXCEPTION 'UAT multi-lote: 3 lotes, got %',n; END IF;
  -- tres snapshots de origen INDEPENDIENTES (mismo cliente comercial, orígenes distintos)
  SELECT count(DISTINCT (origen_snapshot->'cuartel'->>'codigo')) INTO n FROM proc_lote WHERE recepcion_id=rec;
  IF n<3 THEN RAISE EXCEPTION 'UAT multi-lote: 3 orígenes de cuartel distintos, got %',n; END IF;
  -- conciliación de masa: Σ=9000=neto → cerrar PASS
  ej := NULL;
  PERFORM 1; -- conciliar
  DECLARE r jsonb; BEGIN
    SELECT to_jsonb(x) INTO r FROM proc_v_recepcion_conciliacion x WHERE recepcion_id=rec;
    IF (r->>'dentro_tolerancia')::bool IS NOT TRUE THEN RAISE EXCEPTION 'UAT masa: 9000 vs 9000 debía cuadrar: %',r; END IF;
  END;
  PERFORM proc_fn_cerrar_recepcion(e,rec,NULL);
  SELECT estado INTO tmp FROM proc_recepcion WHERE id=rec; -- reuse tmp
  IF tmp<>'recibida' THEN RAISE EXCEPTION 'UAT masa: recepción exacta debía finalizar (recibida), got %',tmp; END IF;
  tmp := '2025/2026';

  -- ══════════ QC POR LOTE MIXTO (aprobado / condicional / rechazado) ══════════
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"18","DEF":"2","TEMP":"4"}'::jsonb,NULL,l1);   -- aprobado
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"17","DEF":"9"}'::jsonb,NULL,l2);              -- condicional (DEF>5 advertencia)
  PERFORM proc_fn_registrar_qc(e,rec,'{"BRIX":"10"}'::jsonb,NULL,l3);                        -- rechazado (PLU BRIX<14)
  IF (SELECT resultado FROM proc_qc_recepcion WHERE recepcion_id=rec AND lote_id=l1)<>'aprobado' THEN RAISE EXCEPTION 'UAT QC: L1 aprobado'; END IF;
  IF (SELECT resultado FROM proc_qc_recepcion WHERE recepcion_id=rec AND lote_id=l2)<>'condicional' THEN RAISE EXCEPTION 'UAT QC: L2 condicional'; END IF;
  IF (SELECT resultado FROM proc_qc_recepcion WHERE recepcion_id=rec AND lote_id=l3)<>'rechazado' THEN RAISE EXCEPTION 'UAT QC: L3 rechazado (especie del LOTE = PLU)'; END IF;
  -- elegibilidad: L1 sí, L2 (condicional) sí, L3 no
  el := proc_fn_lote_elegible(e,l1); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'UAT QC: L1 elegible'; END IF;
  el := proc_fn_lote_elegible(e,l2); IF (el->>'elegible')::bool IS NOT TRUE THEN RAISE EXCEPTION 'UAT QC: L2 condicional elegible'; END IF;
  el := proc_fn_lote_elegible(e,l3); IF (el->>'elegible')::bool IS NOT FALSE THEN RAISE EXCEPTION 'UAT QC: L3 rechazado NO elegible'; END IF;
  -- resumen QC mixto
  SELECT lotes_aprobados+lotes_condicional+lotes_rechazados INTO n FROM proc_v_qc_recepcion_resumen WHERE recepcion_id=rec;
  IF n<3 THEN RAISE EXCEPTION 'UAT QC: resumen mixto debía contar 3 lotes con QC'; END IF;
  -- existencia física del rechazado permanece
  SELECT disponible INTO s FROM proc_v_lote_saldos WHERE lote_id=l3 AND empresa_id=e;
  IF s<>2000 THEN RAISE EXCEPTION 'UAT QC: L3 rechazado conserva 2000 kg físicos, got %',s; END IF;

  -- ══════════ GENEALOGÍA CONTINUA (L1 aprobado → orden → PT → pallet → despacho) ══════════
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id) VALUES (e,'ORD-UAT-1',pl,'en_proceso','CHE',cliA) RETURNING id INTO oA;
  PERFORM proc_fn_consumir_lote_en_orden(e,oA,l1,4000,NULL,NULL);
  -- consumir L3 rechazado debe fallar (gate QC)
  BEGIN PERFORM proc_fn_consumir_lote_en_orden(e,oA,l3,1000,NULL,NULL);
    RAISE EXCEPTION 'UAT gate QC: no debió consumir L3 rechazado';
  EXCEPTION WHEN check_violation THEN NULL; WHEN raise_exception THEN RAISE; END;
  INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (e,oA,cat,3600) RETURNING id INTO res_id;
  INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (e,oA,mdes,300);
  INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (e,oA,mmer,100);
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=oA;
  PERFORM proc_fn_conciliar_orden(e,oA,NULL);
  UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=oA;
  pt := proc_fn_materializar_pt(e,res_id,fmt,720,3600,NULL);
  palletA := proc_fn_crear_pallet(e,'PAL-UAT-1',tmp,pl,fmt,u1,NULL);
  PERFORM proc_fn_palletizar(e,pt,palletA,720,3600,NULL);
  desp := proc_fn_crear_despacho(e,'DES-UAT-1',pl,cliA,pA,NULL);
  UPDATE proc_despacho SET estado='preparando' WHERE id=desp; UPDATE proc_despacho SET estado='listo' WHERE id=desp;
  PERFORM proc_fn_confirmar_despacho(e,desp,jsonb_build_array(jsonb_build_object('pallet_id',palletA,'pt_id',pt,'cajas',720,'kg',3600)),NULL);

  -- Backward: pallet → ... → lote/recepción/origen
  gen := proc_fn_pallet_genealogia(e,palletA);
  IF gen IS NULL OR gen::text NOT LIKE '%L1%' THEN RAISE EXCEPTION 'UAT genealogía backward: el pallet debe reconstruir el lote L1: %',gen; END IF;
  -- Forward: origen del lote (snapshot) reconstruye productor/predio/cuartel
  DECLARE org jsonb; BEGIN
    SELECT to_jsonb(x) INTO org FROM proc_v_lote_origen x WHERE id=l1;
    IF org->>'cuartel' IS DISTINCT FROM 'C-01' THEN RAISE EXCEPTION 'UAT genealogía forward: L1 debe venir de C-01: %',org; END IF;
  END;
  -- Snapshot de origen INMUTABLE ante cambios CURRENT
  UPDATE proc_cuartel SET codigo='C-01-RENOMBRADO' WHERE id=cC01;
  IF (SELECT origen_snapshot->'cuartel'->>'codigo' FROM proc_lote WHERE id=l1)<>'C-01' THEN RAISE EXCEPTION 'UAT: snapshot de origen debe permanecer C-01 (inmutable)'; END IF;
  UPDATE proc_cuartel SET codigo='C-01' WHERE id=cC01;

  -- ══════════ COMERCIAL: servicio facturable + base + inmutabilidad ══════════
  DECLARE sf uuid; base uuid; BEGIN
    sf := proc_fn_generar_servicio_proceso(e,oA,cliA,tsProc,NULL);
    base := proc_fn_crear_base_cobro(e,'BCO-UAT-1',cliA,tmp,hoy-1,hoy,'USD',NULL);
    PERFORM proc_fn_agregar_a_base(e,base,sf,NULL);
    PERFORM proc_fn_aprobar_base(e,base,NULL);
    -- base aprobada inmutable: agregar otra línea debe fallar
    BEGIN PERFORM proc_fn_agregar_a_base(e,base,sf,NULL);
      RAISE EXCEPTION 'UAT comercial: base aprobada no debe admitir líneas';
    EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'UAT comercial:%' THEN RAISE; END IF; WHEN others THEN NULL; END;
  END;

  -- ══════════ REPORTING DAILY sobre el dataset UAT ══════════
  INSERT INTO proc_reporte_config(empresa_id,nombre,timezone,alcance) VALUES (e,'Diario UAT','America/Santiago','general') RETURNING id INTO cfg;
  INSERT INTO proc_reporte_destinatario(empresa_id,config_id,nombre,email) VALUES (e,cfg,'Ops UAT','ops@uat.cl');
  ej := proc_fn_reporte_generar_ejecucion(e,cfg,hoy,NULL);
  -- Cliente A: recibió 9000 (multi-lote) y procesó 4000 (consumo real de L1)
  SELECT (c->>'kg_recibido')::numeric, (c->>'kg_procesado')::numeric INTO resu, km
    FROM jsonb_array_elements(ej.snapshot->'clientes') c WHERE c->>'cliente_vinculo_id'=cliA::text;
  IF resu<>9000 THEN RAISE EXCEPTION 'UAT reporting: A recibido 9000, got %',resu; END IF;
  IF km<>4000 THEN RAISE EXCEPTION 'UAT reporting: A procesado 4000 (consumo real), got %',km; END IF;
  IF ej.estado<>'pendiente' THEN RAISE EXCEPTION 'UAT reporting: con movimiento → pendiente'; END IF;
  -- idempotencia
  IF (proc_fn_reporte_generar_ejecucion(e,cfg,hoy,NULL)).id<>ej.id THEN RAISE EXCEPTION 'UAT reporting: idempotente'; END IF;

  RAISE NOTICE 'T11 UAT INTEGRAL: TODOS LOS PASOS PASARON (gate, multi-lote, QC mixto, masa, genealogía, comercial, reporting)';
END $$;

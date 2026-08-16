-- ============================================================================
-- proc_v7_6_f7_6_tests.sql · F7.6 — Resultado de Proceso (informe/versión/PDF).
-- E2E: una orden · consolidado ponderado 72% · fuente duplicada · snapshot
--      inmutable · nueva versión · destinatario snapshot · Foods intercompany ·
--      sin despacho · read-models. REQUISITO: schema_proc_v1..v7_6. Superuser.
-- ============================================================================

-- helper: crea orden cerrada e informa kg comercial/descarte/merma. Devuelve orden id.
CREATE OR REPLACE FUNCTION uat6_orden(p_e uuid, p_pl uuid, p_u uuid, p_cli uuid, p_cat uuid, p_md uuid, p_mm uuid,
  p_tmp text, p_folio text, p_kg numeric, p_com numeric, p_des numeric, p_mer numeric) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_rec uuid; v_lote uuid; v_o uuid; BEGIN
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,especie_codigo,kg_neto,estado)
    VALUES (p_e,p_folio||'-R',p_pl,p_cli,'CHE',p_kg,'recibida') RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(p_e,v_rec,p_folio||'-L','CHE','Santina',p_kg,p_pl,p_tmp,p_u,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo,cliente_servicio_vinculo_id)
    VALUES (p_e,p_folio,p_pl,'en_proceso','CHE',p_cli) RETURNING id INTO v_o;
  PERFORM proc_fn_consumir_lote_en_orden(p_e,v_o,v_lote,p_kg,NULL,NULL);
  IF p_com>0 THEN INSERT INTO proc_resultado(empresa_id,orden_id,categoria_id,kg) VALUES (p_e,v_o,p_cat,p_com); END IF;
  IF p_des>0 THEN INSERT INTO proc_resultado_descarte(empresa_id,orden_id,motivo_descarte_id,kg) VALUES (p_e,v_o,p_md,p_des); END IF;
  IF p_mer>0 THEN INSERT INTO proc_resultado_merma(empresa_id,orden_id,motivo_merma_id,kg) VALUES (p_e,v_o,p_mm,p_mer); END IF;
  UPDATE proc_orden_proceso SET estado='pendiente_conciliacion' WHERE id=v_o;
  PERFORM proc_fn_conciliar_orden(p_e,v_o,NULL); UPDATE proc_orden_proceso SET estado='cerrado' WHERE id=v_o;
  RETURN v_o;
END $f$;

DO $$
DECLARE
  e uuid:=gen_random_uuid(); pl uuid; u uuid; tmp text:='2026/2027';
  cli uuid; foods uuid; prod uuid; cat uuid; md uuid; mm uuid; coregrp uuid;
  o1 uuid; oA uuid; oB uuid; inf uuid; v1 uuid; v2 uuid; infC uuid; vC uuid;
  snap1 jsonb; snap1b jsonb; pk numeric; est text; n int; did uuid; nomsnap text;
BEGIN
  -- fixture: catálogo especie/variedad requerido por el FK de cutover T5b (no relaja el FK)
  INSERT INTO proc_especie(empresa_id,codigo,nombre) VALUES (e,'CHE','Cereza');
  INSERT INTO proc_variedad(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','Santina','Santina');
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'t','activa');
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','C1','camara') RETURNING id INTO u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Copefrut') RETURNING id INTO cli;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'El Parrón') RETURNING id INTO prod;
  INSERT INTO contab_empresas(id) VALUES (gen_random_uuid()) RETURNING id INTO coregrp;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,grupo_empresa_id) VALUES (e,'cliente_servicio',false,'Allegria Foods SpA',coregrp) RETURNING id INTO foods;
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre) VALUES (e,'EXP','Exportable') RETURNING id INTO cat;
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'BL','Blanda') RETURNING id INTO md;
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DH','Deshid') RETURNING id INTO mm;

  -- ═══ E2E1 — UNA ORDEN (9800 -> 7800/1700/300) ═══
  o1 := uat6_orden(e,pl,u,cli,cat,md,mm,tmp,'ORD-1',9800,7800,1700,300);
  inf := proc_fn_crear_informe(e,'RP-1',tmp,pl,cli,NULL);
  v1 := proc_fn_generar_version(e,inf,ARRAY[o1],'informe inicial',NULL,NULL);
  SELECT snapshot, packout INTO snap1, pk FROM proc_informe_version WHERE id=v1;
  IF (snap1#>>'{resumen,kg_procesados}')::numeric<>9800 THEN RAISE EXCEPTION 'E1: kg_procesados=% (esp 9800)', snap1#>>'{resumen,kg_procesados}'; END IF;
  IF round(pk,4)<>0.7959 THEN RAISE EXCEPTION 'E1: packout=% (esp 0.7959)', pk; END IF;
  SELECT count(*) INTO n FROM proc_informe_fuente WHERE version_id=v1;
  IF n<>1 THEN RAISE EXCEPTION 'E1: fuentes=% (esp 1)', n; END IF;

  -- ═══ E2E2 — CONSOLIDADO PONDERADO (90% y 70% -> 72%, no 80%) ═══
  oA := uat6_orden(e,pl,u,cli,cat,md,mm,tmp,'ORD-A',1000,900,0,100);   -- 90%
  oB := uat6_orden(e,pl,u,cli,cat,md,mm,tmp,'ORD-B',9000,6300,2700,0);  -- 70%
  DECLARE inf2 uuid; v uuid; BEGIN
    inf2 := proc_fn_crear_informe(e,'RP-2',tmp,pl,cli,NULL);
    v := proc_fn_generar_version(e,inf2,ARRAY[oA,oB],'consolidado',NULL,NULL);
    SELECT packout INTO pk FROM proc_informe_version WHERE id=v;
    IF round(pk,4)<>0.7200 THEN RAISE EXCEPTION 'E2: packout consolidado=% (esp 0.72, NO 0.80)', pk; END IF;
  END;

  -- ═══ E2E3 — FUENTE DUPLICADA (misma orden dos veces -> rechazo) ═══
  DECLARE inf3 uuid; BEGIN
    inf3 := proc_fn_crear_informe(e,'RP-3',tmp,pl,cli,NULL);
    BEGIN PERFORM proc_fn_generar_version(e,inf3,ARRAY[o1,o1],'dup',NULL,NULL);
      RAISE EXCEPTION 'FALLA E3: fuente duplicada permitida';
    EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA E3%' THEN RAISE; END IF; END;
  END;

  -- ═══ E2E4 — SNAPSHOT INMUTABLE tras cambio CURRENT permitido ═══
  PERFORM proc_fn_emitir_version(e,v1,'/pdf/RP-1-v1.pdf',NULL);
  UPDATE proc_categorias_calidad SET nombre='Exportable (renombrada)' WHERE id=cat;  -- cambio CURRENT (etiqueta)
  UPDATE proc_informe SET observaciones='obs current cambiada' WHERE id=inf;          -- cambio CURRENT
  SELECT snapshot INTO snap1b FROM proc_informe_version WHERE id=v1;
  IF (snap1b#>>'{resumen,kg_comerciales}')::numeric<>7800 THEN RAISE EXCEPTION 'E4: snapshot v1 mutó (kg_comerciales=% esp 7800)', snap1b#>>'{resumen,kg_comerciales}'; END IF;
  IF (snap1b#>>'{resumen,packout}')::numeric<>0.7959 THEN RAISE EXCEPTION 'E4: snapshot v1 packout mutó (% esp 0.7959)', snap1b#>>'{resumen,packout}'; END IF;

  -- ═══ E2E5 — NUEVA VERSIÓN (v1 intacta; v1 -> reemplazada al emitir v2) ═══
  v2 := proc_fn_generar_version(e,inf,ARRAY[o1],'corrección',NULL,NULL);
  SELECT version INTO n FROM proc_informe_version WHERE id=v2;
  IF n<>2 THEN RAISE EXCEPTION 'E5: version=% (esp 2)', n; END IF;
  PERFORM proc_fn_emitir_version(e,v2,'/pdf/RP-1-v2.pdf',NULL);
  SELECT estado INTO est FROM proc_informe_version WHERE id=v1;
  IF est<>'reemplazada' THEN RAISE EXCEPTION 'E5: v1 estado=% (esp reemplazada)', est; END IF;
  SELECT estado INTO est FROM proc_informe_version WHERE id=v2;
  IF est<>'emitida' THEN RAISE EXCEPTION 'E5: v2 estado=% (esp emitida)', est; END IF;
  -- v1 sigue consultable con su snapshot
  SELECT (snapshot#>>'{resumen,kg_procesados}')::numeric INTO pk FROM proc_informe_version WHERE id=v1;
  IF pk<>9800 THEN RAISE EXCEPTION 'E5: v1 ya no consultable/íntegra'; END IF;

  -- ═══ E2E6 — DESTINATARIO SNAPSHOT (congela contacto) ═══
  did := proc_fn_agregar_destinatario(e,v2,cli,NULL);
  SELECT nombre_snapshot INTO nomsnap FROM proc_informe_destinatario WHERE id=did;
  UPDATE proc_vinculo SET nombre_provisional='Copefrut RENOMBRADO' WHERE id=cli;  -- cambia maestro
  SELECT nombre_snapshot INTO nomsnap FROM proc_informe_destinatario WHERE id=did;
  IF nomsnap='Copefrut RENOMBRADO' THEN RAISE EXCEPTION 'E6: destinatario snapshot NO congelado (siguió a CURRENT)'; END IF;

  -- ═══ E2E8 — FOODS INTERCOMPANY (cliente Foods vía vínculo; sin exp_*) ═══
  DECLARE oF uuid; infF uuid; vF uuid; nexp int; BEGIN
    oF := uat6_orden(e,pl,u,foods,cat,md,mm,tmp,'ORD-F',4000,3600,300,100);
    infF := proc_fn_crear_informe(e,'RP-F',tmp,pl,foods,NULL);
    vF := proc_fn_generar_version(e,infF,ARRAY[oF],'foods',NULL,NULL);
    IF vF IS NULL THEN RAISE EXCEPTION 'E8: informe Foods falló'; END IF;
    SELECT count(*) INTO nexp FROM pg_constraint con JOIN pg_class rel ON rel.oid=con.conrelid JOIN pg_class ref ON ref.oid=con.confrelid
      WHERE con.contype='f' AND rel.relname LIKE 'proc\_informe%' AND ref.relname LIKE 'exp\_%';
    IF nexp<>0 THEN RAISE EXCEPTION 'E8: FK informe->exp_* (%)', nexp; END IF;
  END;

  -- ═══ E2E9 — SIN DESPACHO (orden cerrada, sin PT/pallets/despacho -> se informa) ═══
  -- o1 nunca generó PT/pallet/despacho; ya se informó en E2E1 => caso cubierto.
  IF NOT EXISTS (SELECT 1 FROM proc_informe_version WHERE id=v1) THEN RAISE EXCEPTION 'E9: no se informó sin despacho'; END IF;

  -- ═══ READ-MODELS ═══
  PERFORM 1 FROM proc_v_orden_informable WHERE orden_id=o1 AND informada=true AND round(packout,4)=0.7959;
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_orden_informable o1 incorrecto'; END IF;
  PERFORM 1 FROM proc_v_orden_informable WHERE orden_id=oA AND informada=true;  -- oA en RP-2
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: oA debía figurar informada'; END IF;
  PERFORM 1 FROM proc_v_informe_listado WHERE id=inf AND version_actual=2 AND estado_version='emitida';
  IF NOT FOUND THEN RAISE EXCEPTION 'RM: proc_v_informe_listado inf incorrecto'; END IF;

  RAISE NOTICE 'proc_v7_6_f7_6_tests: una-orden/consolidado-72/dup/snapshot/versión/destinatario/foods/sin-despacho/RM — TODOS PASARON ✓';
END $$;

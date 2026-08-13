-- ============================================================================
-- proc_uat_f1_f6.sql · UAT INTEGRAL Allegria Service (F1-F6)
-- Operación representativa: maquila de cerezas y ciruelas, Planta Rancagua.
-- Múltiples productores / exportadoras / clientes del servicio + fruta de
-- terceros + Allegria Foods intercompany. Identidad SOLO vía proc_vinculo.
-- REQUISITO: schema_proc_v1..v6 aplicados. Superuser (RLS bypass).
-- Cada escenario RAISE NOTICE al pasar; RAISE EXCEPTION si algo no cuadra.
-- ============================================================================
DROP TABLE IF EXISTS uat;
CREATE TEMP TABLE uat (k text PRIMARY KEY, v uuid);
CREATE OR REPLACE FUNCTION uid(text) RETURNS uuid LANGUAGE sql AS 'SELECT v FROM uat WHERE k=$1';

-- ─────────────────────────────────────────────────────────────────────────────
-- MAESTROS (operación real Allegria Service)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE e uuid := gen_random_uuid(); pl uuid; x uuid;
BEGIN
  INSERT INTO uat VALUES ('emp', e);
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct, pallet_compat_keys)
    VALUES (e, 0.50, '["especie_codigo"]'::jsonb);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Planta Rancagua') RETURNING id INTO pl;
  INSERT INTO uat VALUES ('planta', pl);
  -- Ubicaciones físicas
  -- NOTA UAT (gap datos): tipo ∈ {camara,zona,ubicacion,patio}; no hay tipo dedicado 'recepcion'/'anden'.
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'RECEP','Recepción','zona') RETURNING id INTO x; INSERT INTO uat VALUES ('u_recep',x);
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','Cámara 1','camara') RETURNING id INTO x; INSERT INTO uat VALUES ('u_cam1',x);
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM2','Cámara 2','camara') RETURNING id INTO x; INSERT INTO uat VALUES ('u_cam2',x);
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'ANDEN','Andén despacho','patio') RETURNING id INTO x; INSERT INTO uat VALUES ('u_anden',x);
  -- Catálogos de calidad
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre,es_comercial) VALUES (e,'EXP','Exportable',true) RETURNING id INTO x; INSERT INTO uat VALUES ('cat_exp',x);
  INSERT INTO proc_categorias_calidad(empresa_id,codigo,nombre,es_comercial) VALUES (e,'CAT2','Segunda',true) RETURNING id INTO x; INSERT INTO uat VALUES ('cat_2',x);
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'BLANDA','Fruta blanda') RETURNING id INTO x; INSERT INTO uat VALUES ('des_blanda',x);
  INSERT INTO proc_motivos_descarte(empresa_id,codigo,nombre) VALUES (e,'PARTIDA','Fruta partida') RETURNING id INTO x; INSERT INTO uat VALUES ('des_partida',x);
  INSERT INTO proc_motivos_merma(empresa_id,codigo,nombre) VALUES (e,'DESHID','Deshidratación') RETURNING id INTO x; INSERT INTO uat VALUES ('mer_deshid',x);
  -- Calibres / colores cereza
  INSERT INTO proc_calibre(empresa_id,especie_codigo,codigo,nombre,orden) VALUES (e,'CHE','J','Jumbo (30-32mm)',1) RETURNING id INTO x; INSERT INTO uat VALUES ('cal_J',x);
  INSERT INTO proc_calibre(empresa_id,especie_codigo,codigo,nombre,orden) VALUES (e,'CHE','XL','Extra Large (28-30mm)',2) RETURNING id INTO x; INSERT INTO uat VALUES ('cal_XL',x);
  INSERT INTO proc_color(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','MAH','Mahogany') RETURNING id INTO x; INSERT INTO uat VALUES ('col_MAH',x);
  INSERT INTO proc_color(empresa_id,especie_codigo,codigo,nombre) VALUES (e,'CHE','DARK','Dark Red') RETURNING id INTO x; INSERT INTO uat VALUES ('col_DARK',x);
  -- Formatos
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja,tipo_embalaje) VALUES (e,'CHE','CHE-5KG','Caja cereza 5kg',5,'caja') RETURNING id INTO x; INSERT INTO uat VALUES ('fmt_che5',x);
  INSERT INTO proc_formato(empresa_id,especie_codigo,codigo,descripcion,kg_nominal_caja,tipo_embalaje) VALUES (e,'PLU','PLU-10KG','Caja ciruela 10kg',10,'caja') RETURNING id INTO x; INSERT INTO uat VALUES ('fmt_plu10',x);
  -- Identidad Core (stub): Foods es empresa del grupo; Copefrut/Río Blanco son auxiliares (terceros).
  INSERT INTO contab_empresas(id) VALUES (gen_random_uuid()) RETURNING id INTO x; INSERT INTO uat VALUES ('core_foods',x);
  INSERT INTO contab_auxiliares(id,empresa_id,tipo,nombre) VALUES (gen_random_uuid(),e,'cliente','Copefrut S.A.') RETURNING id INTO x; INSERT INTO uat VALUES ('aux_copefrut',x);
  INSERT INTO contab_auxiliares(id,empresa_id,tipo,nombre) VALUES (gen_random_uuid(),e,'cliente','Río Blanco Exports') RETURNING id INTO x; INSERT INTO uat VALUES ('aux_rioblanco',x);
  -- Vínculos operacionales (cada rol = vínculo propio; identidad Core por grupo_empresa_id/auxiliar_id)
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,auxiliar_id) VALUES (e,'cliente_servicio',false,'Copefrut S.A.',uid('aux_copefrut')) RETURNING id INTO x; INSERT INTO uat VALUES ('cli_copefrut',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,auxiliar_id) VALUES (e,'cliente_servicio',false,'Río Blanco Exports',uid('aux_rioblanco')) RETURNING id INTO x; INSERT INTO uat VALUES ('cli_rioblanco',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional,grupo_empresa_id) VALUES (e,'cliente_servicio',false,'Allegria Foods SpA',uid('core_foods')) RETURNING id INTO x; INSERT INTO uat VALUES ('cli_foods',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Agrícola El Parrón') RETURNING id INTO x; INSERT INTO uat VALUES ('prod_parron',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Fundo Los Aromos') RETURNING id INTO x; INSERT INTO uat VALUES ('prod_aromos',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'productor',true,'Agrícola San Vicente') RETURNING id INTO x; INSERT INTO uat VALUES ('prod_sanvic',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'dueno_fruta',true,'Inversiones Frutícolas Ltda') RETURNING id INTO x; INSERT INTO uat VALUES ('dueno_tercero',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'exportadora',true,'Copefrut Export') RETURNING id INTO x; INSERT INTO uat VALUES ('expo_copefrut',x);
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'exportadora',true,'Gesex Exportadora') RETURNING id INTO x; INSERT INTO uat VALUES ('expo_gesex',x);
  -- Tarifario (F6)
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'PROC','Proceso/maquila','kg_procesado') RETURNING id INTO x; INSERT INTO uat VALUES ('ts_proc',x);
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'ALM','Almacenaje','pallet_dia') RETURNING id INTO x; INSERT INTO uat VALUES ('ts_alm',x);
  INSERT INTO proc_tipo_servicio(empresa_id,codigo,nombre,unidad_default) VALUES (e,'INSP','Inspección SAG','evento') RETURNING id INTO x; INSERT INTO uat VALUES ('ts_insp',x);
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (e,uid('ts_proc'),NULL,'kg_procesado',0.25,'USD','2026-11-01','2027-03-31');
  INSERT INTO proc_tarifa(empresa_id,tipo_servicio_id,cliente_vinculo_id,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta)
    VALUES (e,uid('ts_proc'),uid('cli_copefrut'),'kg_procesado',0.30,'USD','2026-11-01','2027-03-31');
  RAISE NOTICE 'MAESTROS: Allegria Service Rancagua — 3 clientes, 3 productores, 2 exportadoras, tarifario cargado ✓';
END $$;

-- Helper: crea recepción+lote ubicado, devuelve lote. Registra en uat con clave dada.
CREATE OR REPLACE FUNCTION uat_recibir(p_key text, p_folio text, p_cli uuid, p_prod uuid, p_dueno uuid, p_expo uuid,
  p_esp text, p_var text, p_kg numeric, p_ubic uuid) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v_emp uuid := uid('emp'); v_rec uuid; v_lote uuid;
BEGIN
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,cliente_servicio_vinculo_id,productor_vinculo_id,
      dueno_fruta_vinculo_id,exportadora_vinculo_id,especie_codigo,variedad_codigo,kg_neto)
    VALUES (v_emp,p_folio,uid('planta'),p_cli,p_prod,p_dueno,p_expo,p_esp,p_var,p_kg) RETURNING id INTO v_rec;
  v_lote := proc_fn_ingresar_lote_ubicado(v_emp,v_rec,p_folio||'-L',p_esp,p_var,p_kg,uid('planta'),'2026/2027',p_ubic,NULL);
  IF p_key IS NOT NULL THEN INSERT INTO uat VALUES (p_key, v_lote) ON CONFLICT (k) DO UPDATE SET v=EXCLUDED.v; END IF;
  RETURN v_lote;
END $f$;

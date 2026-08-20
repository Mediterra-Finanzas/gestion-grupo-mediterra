-- UAT escenario L (concurrencia) — SETUP en tabla real (persiste entre conexiones)
DROP TABLE IF EXISTS uat_l;
CREATE TABLE uat_l (k text PRIMARY KEY, v uuid);
DO $$
DECLARE e uuid:=gen_random_uuid(); pl uuid; u uuid; rec uuid; lote uuid; o1 uuid; o2 uuid; pa uuid;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id,tolerancia_masa_pct) VALUES (e,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_ubicaciones(empresa_id,planta_id,codigo,nombre,tipo) VALUES (e,pl,'CAM1','C1','camara') RETURNING id INTO u;
  INSERT INTO proc_vinculo(empresa_id,rol_operacional,pendiente_alta_corporativa,nombre_provisional) VALUES (e,'cliente_servicio',true,'Cliente') RETURNING id INTO pa;
  INSERT INTO proc_recepcion(empresa_id,folio,kg_neto) VALUES (e,'L-R',1000) RETURNING id INTO rec;
  lote := proc_fn_ingresar_lote_ubicado(e,rec,'L-LOTE','CHE',NULL,1000,pl,'2026/2027',u,NULL);
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'L-O1',pl,'en_proceso','CHE') RETURNING id INTO o1;
  INSERT INTO proc_orden_proceso(empresa_id,folio,planta_id,estado,especie_codigo) VALUES (e,'L-O2',pl,'en_proceso','CHE') RETURNING id INTO o2;
  INSERT INTO uat_l VALUES ('emp',e),('lote',lote),('o1',o1),('o2',o2);
END $$;
SELECT k||'='||v FROM uat_l ORDER BY k;

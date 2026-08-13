-- ============================================================================
-- proc_v7_f7_1_tests.sql · F7.1 — correlativos + QC severidad + read-models.
-- REQUISITO: schema_proc_v1..v7 aplicados. Superuser (RLS bypass).
-- ============================================================================
DO $$
DECLARE
  e uuid := gen_random_uuid(); pl uuid; tmp text := '2026/2027';
  rec uuid; c1 text; c2 text; c3 text; cl text; res text; centro jsonb; nexc int;
BEGIN
  INSERT INTO proc_empresa_config(empresa_id, tolerancia_masa_pct) VALUES (e,0.50);
  INSERT INTO proc_planta(empresa_id,codigo,nombre) VALUES (e,'RCG','Rancagua') RETURNING id INTO pl;
  INSERT INTO proc_temporada(empresa_id,codigo,nombre,estado) VALUES (e,tmp,'2026/2027','activa');

  -- ── Correlativos: formato TIPO-TEMP-NNNNNN + incremento + por tipo ──
  c1 := proc_fn_siguiente_correlativo(e,tmp,'REC');
  c2 := proc_fn_siguiente_correlativo(e,tmp,'REC');
  c3 := proc_fn_siguiente_correlativo(e,tmp,'REC');
  cl := proc_fn_siguiente_correlativo(e,tmp,'LOT');
  IF c1 <> 'REC-2627-000001' THEN RAISE EXCEPTION 'COR1: c1=% (esp REC-2627-000001)', c1; END IF;
  IF c2 <> 'REC-2627-000002' THEN RAISE EXCEPTION 'COR2: c2=% (esp ...000002)', c2; END IF;
  IF c3 <> 'REC-2627-000003' THEN RAISE EXCEPTION 'COR3: c3=% (esp ...000003)', c3; END IF;
  IF cl <> 'LOT-2627-000001' THEN RAISE EXCEPTION 'COR4: LOT reinicia por tipo, got %', cl; END IF;
  -- prefijo configurable
  IF proc_fn_siguiente_correlativo(e,tmp,'BCO','BC') <> 'BC-2627-000001' THEN RAISE EXCEPTION 'COR5: prefijo configurable falló'; END IF;

  -- ── QC severidad: firmeza(bloqueante 60-90), brix(advertencia 18-24), defectos(informativo 0-5) ──
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,rango_max,severidad,obligatorio)
    VALUES (e,'CHE','firmeza','Firmeza','numero',60,90,'bloqueante',true);
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,rango_max,severidad,obligatorio)
    VALUES (e,'CHE','brix','Brix','numero',18,24,'advertencia',false);
  INSERT INTO proc_qc_parametro(empresa_id,especie_codigo,codigo,nombre,tipo_dato,rango_min,rango_max,severidad,obligatorio)
    VALUES (e,'CHE','defectos','% defectos','numero',0,5,'informativo',false);
  INSERT INTO proc_recepcion(empresa_id,folio,planta_id,especie_codigo,kg_neto,fecha,estado)
    VALUES (e,'REC-2627-000001',pl,'CHE',5000,'2026-12-05','recibida') RETURNING id INTO rec;

  -- todo en rango -> aprobado
  res := proc_fn_registrar_qc(e,rec,'{"firmeza":"70","brix":"20","defectos":"2"}'::jsonb,NULL);
  IF res <> 'aprobado' THEN RAISE EXCEPTION 'QC1: todo en rango -> % (esp aprobado)', res; END IF;
  -- informativo fuera de rango NO afecta el gate
  res := proc_fn_registrar_qc(e,rec,'{"firmeza":"70","brix":"20","defectos":"12"}'::jsonb,NULL);
  IF res <> 'aprobado' THEN RAISE EXCEPTION 'QC2: informativo fuera -> % (esp aprobado)', res; END IF;
  -- advertencia fuera -> condicional
  res := proc_fn_registrar_qc(e,rec,'{"firmeza":"70","brix":"30","defectos":"2"}'::jsonb,NULL);
  IF res <> 'condicional' THEN RAISE EXCEPTION 'QC3: advertencia fuera -> % (esp condicional)', res; END IF;
  -- bloqueante fuera -> rechazado
  res := proc_fn_registrar_qc(e,rec,'{"firmeza":"40","brix":"20","defectos":"2"}'::jsonb,NULL);
  IF res <> 'rechazado' THEN RAISE EXCEPTION 'QC4: bloqueante fuera -> % (esp rechazado)', res; END IF;
  -- faltante obligatorio (bloqueante) -> rechazado
  res := proc_fn_registrar_qc(e,rec,'{"brix":"20"}'::jsonb,NULL);
  IF res <> 'rechazado' THEN RAISE EXCEPTION 'QC5: obligatorio faltante -> % (esp rechazado)', res; END IF;

  -- ── Read-model Centro ──
  centro := proc_fn_centro_operaciones(e,pl,tmp,'2026-12-05');
  IF centro IS NULL THEN RAISE EXCEPTION 'CENTRO: null'; END IF;
  IF (centro#>>'{recepcion,recepciones_dia}')::int <> 1 THEN RAISE EXCEPTION 'CENTRO: recepciones_dia=% (esp 1)', centro#>>'{recepcion,recepciones_dia}'; END IF;
  IF (centro#>>'{recepcion,kg_recibido_dia}')::numeric <> 5000 THEN RAISE EXCEPTION 'CENTRO: kg_recibido=% (esp 5000)', centro#>>'{recepcion,kg_recibido_dia}'; END IF;
  -- QC quedó rechazado (última llamada) -> excepción qc_rechazado
  IF (centro#>>'{excepciones,qc_rechazado}')::int <> 1 THEN RAISE EXCEPTION 'CENTRO: qc_rechazado=% (esp 1)', centro#>>'{excepciones,qc_rechazado}'; END IF;

  -- ── Read-model Excepciones ──
  SELECT count(*) INTO nexc FROM proc_fn_excepciones(e,pl,tmp) WHERE tipo='qc_rechazado';
  IF nexc <> 1 THEN RAISE EXCEPTION 'EXC: qc_rechazado filas=% (esp 1)', nexc; END IF;

  RAISE NOTICE 'proc_v7_f7_1_tests: correlativos + QC severidad + read-models — TODOS PASARON ✓';
END $$;

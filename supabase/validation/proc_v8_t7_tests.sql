-- proc_v8_t7_tests.sql · T7 Contrato versionado. Superuser. REQ: v1..v7_7 + v8_t1..t7.
DO $$
DECLARE e uuid := gen_random_uuid(); cli uuid; td uuid; c1 uuid; c2 uuid; est text; n int;
BEGIN
  INSERT INTO proc_vinculo(empresa_id,pendiente_alta_corporativa,nombre_provisional,rol_operacional) VALUES (e,true,'Exportadora Los Andes SpA','cliente_servicio') RETURNING id INTO cli;
  INSERT INTO proc_tipo_documento_contractual(empresa_id,codigo,nombre,satisface_requisito_contractual) VALUES (e,'CONTRATO','Contrato',true) RETURNING id INTO td;

  -- T7a: contrato v1 borrador → pendiente_firma → vigente (transiciones válidas)
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,tipo_vigencia,fecha_inicio,fecha_termino)
    VALUES (e,cli,'CT-2526',td,'por_temporada','2025-07-01','2026-06-30') RETURNING id INTO c1;
  UPDATE proc_cliente_contrato SET estado='pendiente_firma', documento_path='contratos/CT-2526.pdf' WHERE id=c1;
  -- cargar ≠ firmar: tiene documento pero NO está vigente
  SELECT estado INTO est FROM proc_cliente_contrato WHERE id=c1; IF est<>'pendiente_firma' THEN RAISE EXCEPTION 'T7a: got %',est; END IF;
  UPDATE proc_cliente_contrato SET estado='vigente', fecha_firma='2025-07-05', firmado_por='Gerente' WHERE id=c1;

  -- T7b: transición inválida borrador → vigente directo
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id) VALUES (e,cli,'CT-X',td) RETURNING id INTO c2;
  BEGIN UPDATE proc_cliente_contrato SET estado='vigente' WHERE id=c2;
    RAISE EXCEPTION 'FALLA T7b: transición borrador→vigente permitida';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T7b%' THEN RAISE; END IF; END;

  -- T7c: versionamiento — v2 reemplaza a v1; v1 pasa a reemplazado; ambos consultables (historia)
  INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,version,reemplaza_contrato_id,estado)
    VALUES (e,cli,'CT-2526',td,2,c1,'borrador');
  UPDATE proc_cliente_contrato SET estado='reemplazado' WHERE id=c1;
  SELECT count(*) INTO n FROM proc_cliente_contrato WHERE empresa_id=e AND cliente_vinculo_id=cli AND codigo='CT-2526'; IF n<>2 THEN RAISE EXCEPTION 'T7c: v1+v2 deben coexistir, got %',n; END IF;
  SELECT estado INTO est FROM proc_cliente_contrato WHERE id=c1; IF est<>'reemplazado' THEN RAISE EXCEPTION 'T7c: v1 debía quedar reemplazado'; END IF;

  -- T7d: version duplicada (mismo cliente+codigo+version) → unique
  BEGIN INSERT INTO proc_cliente_contrato(empresa_id,cliente_vinculo_id,codigo,tipo_documento_id,version) VALUES (e,cli,'CT-2526',td,2);
    RAISE EXCEPTION 'FALLA T7d: version duplicada permitida';
  EXCEPTION WHEN unique_violation THEN NULL; WHEN raise_exception THEN IF SQLERRM LIKE 'FALLA T7d%' THEN RAISE; END IF; END;

  RAISE NOTICE 'proc_* T7 contrato: TODOS LOS TESTS PASARON';
END $$;

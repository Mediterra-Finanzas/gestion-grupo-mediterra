-- ═══ PRUEBAS · todo dentro de una transacción que se revierte ═══════════════
begin;
create temp table r_sod (n serial, caso text, esperado text, obtenido text) on commit drop;
do $$
declare
  emp uuid;
  u_reg uuid := gen_random_uuid(); a_reg uuid := gen_random_uuid();
  u_apr uuid := gen_random_uuid(); a_apr uuid := gen_random_uuid();
  u_amb uuid := gen_random_uuid(); a_amb uuid := gen_random_uuid();
  u_sin uuid := gen_random_uuid(); a_sin uuid := gen_random_uuid();
  aj1 uuid; aj2 uuid; aj3 uuid; x text;
  procedure_claims text;
begin
  select id into emp from contab_empresas where id not in (select empresa_id from sec_tenant_prohibido where empresa_id is not null) order by id limit 1;

  insert into iam_usuario(id, nombre, email, activo, auth_user_id) values
    (u_reg, 'Prueba SoD registra', 'sod.registra@ejemplo.invalid', true, a_reg),
    (u_apr, 'Prueba SoD aprueba',  'sod.aprueba@ejemplo.invalid',  true, a_apr),
    (u_amb, 'Prueba SoD ambas',    'sod.ambas@ejemplo.invalid',    true, a_amb),
    (u_sin, 'Prueba SoD sin rol',  'sod.sinrol@ejemplo.invalid',   true, a_sin);
  insert into iam_usuario_empresa(usuario_id, empresa_id, activo, rol_codigo) values
    (u_reg, emp, true, 'TEST_OSI_REGISTRA'), (u_apr, emp, true, 'TEST_OSI_APRUEBA'), (u_amb, emp, true, 'TEST_OSI_AMBAS');
  insert into iam_rol_capability(rol_codigo, capability_codigo, empresa_id, activo, motivo, creado_por, actualizado_por) values
    ('TEST_OSI_REGISTRA', 'osiris.ajuste.registrar', emp, true, 'prueba_sod', u_reg, u_reg),
    ('TEST_OSI_APRUEBA',  'osiris.ajuste.aprobar',   emp, true, 'prueba_sod', u_reg, u_reg),
    ('TEST_OSI_AMBAS',    'osiris.ajuste.registrar', emp, true, 'prueba_sod', u_reg, u_reg),
    ('TEST_OSI_AMBAS',    'osiris.ajuste.aprobar',   emp, true, 'prueba_sod', u_reg, u_reg);

  -- 1 · registrar con capacidad
  perform set_config('request.jwt.claims', json_build_object('sub', a_reg)::text, true);
  aj1 := osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'nota_credito', 'NC-000123',
                              'osiris/ct_prueba_sod/NC-000123.pdf', repeat('a', 64), 'USD', 1500, date '2026-09-10', 'descuento por merma acordada');
  insert into r_sod(caso, esperado, obtenido) values ('1 · registra quien tiene la capacidad', 'ok', case when aj1 is not null then 'ok' end);

  -- 2 · quien registra no aprueba
  begin perform osi_ajuste_resolver(aj1, 'aprobado', 'visto bueno'); insert into r_sod(caso, esperado, obtenido) values ('2 · quien registra intenta aprobar', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('2 · quien registra intenta aprobar', 'sin_capacidad_aprobar', sqlerrm); end;

  -- 3 · sin rol no registra
  perform set_config('request.jwt.claims', json_build_object('sub', a_sin)::text, true);
  begin perform osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'anulacion', 'AN-1', null, null, 'USD', 30000, date '2026-09-10', 'anulacion de prueba');
    insert into r_sod(caso, esperado, obtenido) values ('3 · sin capacidad intenta registrar', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('3 · sin capacidad intenta registrar', 'sin_capacidad_registrar', sqlerrm); end;

  -- 4 · con las dos capacidades tampoco se autoaprueba
  perform set_config('request.jwt.claims', json_build_object('sub', a_amb)::text, true);
  aj2 := osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'anulacion', 'AN-2', null, null, 'USD', 30000, date '2026-09-10', 'factura emitida por error');
  begin perform osi_ajuste_resolver(aj2, 'aprobado', 'ok'); insert into r_sod(caso, esperado, obtenido) values ('4 · rol con ambas capacidades aprueba lo propio', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('4 · rol con ambas capacidades aprueba lo propio', 'autoaprobacion_prohibida', sqlerrm); end;

  -- 5 · otro aprobador aprueba
  perform set_config('request.jwt.claims', json_build_object('sub', a_apr)::text, true);
  x := osi_ajuste_resolver(aj1, 'aprobado', 'cotejado con documento');
  insert into r_sod(caso, esperado, obtenido) values ('5 · aprobador distinto aprueba', 'aprobado', x);

  -- 6 · no se resuelve dos veces
  begin perform osi_ajuste_resolver(aj1, 'rechazado', 'cambio de opinion'); insert into r_sod(caso, esperado, obtenido) values ('6 · segunda resolucion', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('6 · segunda resolucion', 'ajuste_ya_resuelto', sqlerrm); end;

  -- 7 · rechazo exige motivo
  begin perform osi_ajuste_resolver(aj2, 'rechazado', ''); insert into r_sod(caso, esperado, obtenido) values ('7 · rechazo sin motivo', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('7 · rechazo sin motivo', 'motivo_obligatorio', sqlerrm); end;

  -- 8 · nota de credito sin respaldo documental
  perform set_config('request.jwt.claims', json_build_object('sub', a_reg)::text, true);
  begin perform osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'nota_credito', 'NC-9', null, null, 'USD', 10, date '2026-09-10', 'sin respaldo');
    insert into r_sod(caso, esperado, obtenido) values ('8 · nota de credito sin respaldo', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('8 · nota de credito sin respaldo', 'osi_ajuste_nc_con_respaldo', sqlerrm); end;

  -- 9 · anulacion sin motivo suficiente
  begin perform osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'anulacion', 'AN-3', null, null, 'USD', 30000, date '2026-09-10', 'x');
    insert into r_sod(caso, esperado, obtenido) values ('9 · anulacion sin motivo', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('9 · anulacion sin motivo', 'osi_ajuste_motivo_check', sqlerrm); end;

  -- 10 · correccion por compensacion, no por edicion
  aj3 := osi_ajuste_registrar(emp, 'ct_prueba_sod', 'contract_fee', '43', 'nota_credito', 'NC-000124',
                              'osiris/ct_prueba_sod/NC-000124.pdf', repeat('b', 64), 'USD', 1500, date '2026-09-11', 'revierte NC-000123 registrada con monto errado', aj1);
  insert into r_sod(caso, esperado, obtenido) values ('10 · correccion por ajuste que revierte', 'vinculado',
    case when (select revierte_a from osi_ajuste where id = aj3) = aj1 then 'vinculado' end);

  -- 11 · el ajuste no se edita
  begin update osi_ajuste set monto = 1 where id = aj1; insert into r_sod(caso, esperado, obtenido) values ('11 · editar un ajuste', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('11 · editar un ajuste', 'append_only', sqlerrm); end;

  -- 12 · el historial no se borra
  begin delete from osi_ajuste_evento where ajuste_id = aj1; insert into r_sod(caso, esperado, obtenido) values ('12 · borrar historial', 'rechazado', 'PERMITIDO');
  exception when others then insert into r_sod(caso, esperado, obtenido) values ('12 · borrar historial', 'append_only', sqlerrm); end;

  -- 13 · acceso directo a la tabla como authenticated (el resultado se anota ya de vuelta en el rol propio)
  execute 'set local role authenticated';
  begin
    insert into osi_ajuste(empresa_id, contrato_id, concepto, factura_ref, tipo, documento, moneda, monto, fecha_documento, motivo, registrado_por)
    values (emp, 'x', 'contract_fee', '1', 'anulacion', 'd', 'USD', 1, current_date, 'directo', u_reg);
    x := 'PERMITIDO';
  exception when others then x := sqlerrm; end;
  execute 'reset role';
  insert into r_sod(caso, esperado, obtenido) values ('13 · insert directo como authenticated', 'permission denied for table osi_ajuste', x);

  -- 14 · la anulacion registrada y rechazada sigue visible
  insert into r_sod(caso, esperado, obtenido) values ('14 · ajustes visibles con estado', '3 ajustes',
    (select count(*) || ' ajustes · ' || string_agg(tipo || ':' || estado, ', ' order by registrado_at) from osi_ajuste_estado where contrato_id = 'ct_prueba_sod'));
end $$;
select (case when obtenido ilike '%' || esperado || '%' or (esperado = 'ok' and obtenido = 'ok') or (esperado = 'aprobado' and obtenido = 'aprobado') or (esperado = 'vinculado' and obtenido = 'vinculado') or (esperado = '3 ajustes' and obtenido like '3 ajustes%') then 'PASS ' else 'FALLA' end)
       || ' ' || rpad(caso, 50) || ' -> ' || coalesce(obtenido, 'NULL') from r_sod order by n;
rollback;

select 'residuos tras revertir · usuarios de prueba=' || (select count(*) from public.iam_usuario where email like 'sod.%@ejemplo.invalid')
     || ' · grants TEST_OSI_*=' || (select count(*) from public.iam_rol_capability where rol_codigo like 'TEST_OSI_%')
     || ' · grants osiris.ajuste.* a cualquier rol=' || (select count(*) from public.iam_rol_capability where capability_codigo like 'osiris.ajuste.%')
     || ' · ajustes=' || (select count(*) from public.osi_ajuste);

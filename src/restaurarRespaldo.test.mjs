// node src/restaurarRespaldo.test.mjs — restauración con respuestas comprobadas.
import { restaurarFilas, mensajeRestauracion, motivoFallo, validarRespaldo, prepararRestauracion, resumenPrevioRestauracion } from './restaurarRespaldo.js';

let fallos = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'OK ' : 'FALLA'} ${n}${x ? ' — ' + x : ''}`); if (!c) fallos++; };
const resp = (status, texto = '') => ({ ok: status >= 200 && status < 300, status, text: async () => texto });
const backup = { fecha: '2026-09-30T21:00:00Z', version: 'Mediterra Hub Backup v1', tablas: {
  finanzas: { data: { a: 1 } }, nominas_osiris: { data: '{"nominas":[]}' }, maestro_tc: { data: {} }, osiris: { data: {} } } };

// 1. Todo bien
let r = await restaurarFilas(backup, async () => resp(201));
ok('1. todas las filas responden bien → 4 de 4, sin fallas', r.total === 4 && r.restauradas.length === 4 && r.fallidas.length === 0);
let m = mensajeRestauracion(r, backup.fecha);
ok('1b. mensaje de éxito completo solo cuando no hay fallas', /✅ Respaldo restaurado: 4 de 4/.test(m) && !/PARCIAL/.test(m));

// 2. Parcial: nómina rechazada por la protección, 500 y sin red
const escritas = [];
r = await restaurarFilas(backup, async (id, value) => {
  escritas.push(id);
  if (id === 'nominas_osiris') return resp(400, '{"code":"P0001","message":"MEDITERRA_NOMINAS_SIN_VERSION: \\"nominas_osiris\\" solo se guarda…"}');
  if (id === 'maestro_tc') return resp(500, '{"message":"error"}');
  if (id === 'osiris') throw new TypeError('Failed to fetch');
  return resp(201);
});
ok('2. se intentan TODAS las filas aunque fallen algunas', escritas.length === 4);
ok('2b. resultado: 1 restaurada, 3 fallidas con su motivo', r.restauradas.join() === 'finanzas' && r.fallidas.length === 3
  && /protección de Nóminas/.test(r.fallidas.find((f) => f.id === 'nominas_osiris').motivo)
  && /HTTP 500/.test(r.fallidas.find((f) => f.id === 'maestro_tc').motivo)
  && /sin conexión/.test(r.fallidas.find((f) => f.id === 'osiris').motivo));
m = mensajeRestauracion(r, backup.fecha);
ok('2c. mensaje: "RESTAURACIÓN PARCIAL", lista restauradas y no restauradas, advierte datos mezclados, NO dice éxito',
  /RESTAURACIÓN PARCIAL: se restauraron 1 de 4/.test(m) && /nominas_osiris: rechazada por la protección/.test(m) && /maestro_tc: error del servidor \(HTTP 500\)/.test(m)
  && /osiris: sin conexión/.test(m) && /• finanzas/.test(m) && /MEZCLADOS/.test(m) && !/✅/.test(m));

// 3. Ninguna
r = await restaurarFilas(backup, async () => resp(500));
m = mensajeRestauracion(r, backup.fecha);
ok('3. si ninguna se restaura: "NO se restauró ninguna fila"', /NO se restauró ninguna fila \(4 de 4 fallaron\)/.test(m) && !/Restauradas:/.test(m));

// 4. Valor: mismo formato que antes (texto tal cual si era texto)
const valores = {};
await restaurarFilas(backup, async (id, value) => { valores[id] = value; return resp(201); });
ok('4. el valor enviado es el mismo que enviaba el botón antes', valores.nominas_osiris === '{"nominas":[]}' && valores.finanzas === '{"a":1}');
ok('5. motivos: sello, legado, permiso', /sello/.test(motivoFallo(400, 'MEDITERRA_SELLO: x')) && /solo lectura/.test(motivoFallo(400, 'MEDITERRA_NOMINAS_LEGADO')) && /sin permiso/.test(motivoFallo(401, '')));

// ── oct-2026: formatos aceptados, codificación de cada fila y credenciales vigentes ──
{
  ok('6. versión desconocida se rechaza', !validarRespaldo({ version: 'otra', tablas: { a: { data: {} } } }).ok);
  ok('6b. sin tablas / tablas vacías se rechaza', !validarRespaldo({ version: 'Mediterra Hub Backup v1' }).ok && !validarRespaldo({ version: 'Mediterra Hub Backup v1', tablas: {} }).ok);
  ok('6c. id inválido o fila backup_ se rechaza', !validarRespaldo({ version: 'Mediterra Hub Backup v1', tablas: { 'a b': { data: {} } } }).ok
    && !validarRespaldo({ version: 'Mediterra Hub Backup v1', tablas: { backup_x: { data: {} } } }).ok);
  ok('6d. fila sin data se rechaza', !validarRespaldo({ version: 'Mediterra Hub Backup v1', tablas: { main: {} } }).ok);
  const bk = { version: 'Mediterra Hub Backup v1', tablas: {
    main: { data: { estados: { m3: { estadoResp: 'verde' } } } },
    finanzas: { data: { a: 1 } },
    nueva: { data: { b: 2 } },
    pins: { data: { 'Angelo Huerta_h': 'cred-vieja', 'Carol Machuca_h': 'cred-carol-respaldo' } } } };
  const actuales = { main: { value: { estados: {} } }, finanzas: { value: '{"a":0}' },
    pins: { value: { 'Angelo Huerta_h': 'cred-NUEVA' } } };
  const plan = prepararRestauracion(bk, actuales);
  const f = (id) => plan.filas.find((x) => x.id === id);
  ok('7. main (objeto hoy) se escribe como OBJETO', typeof f('main').value === 'object' && f('main').value.estados.m3.estadoResp === 'verde');
  ok('7b. finanzas (texto hoy) se escribe como TEXTO', typeof f('finanzas').value === 'string' && JSON.parse(f('finanzas').value).a === 1);
  ok('7c. una fila que hoy no existe se crea como objeto', typeof f('nueva').value === 'object');
  ok('8. pins: la credencial vigente NO se revierte (la fila no se escribe)', !f('pins'));
  ok('8b. pins NO se escribe desde el respaldo: tampoco se recupera la credencial que hoy falta', !f('pins'));
  ok('8c. y la diferencia se informa por nombre, sin la credencial', JSON.stringify(plan.accesos).includes('Carol Machuca') && !JSON.stringify(plan.accesos).includes('cred-carol-respaldo') && !JSON.stringify(plan.accesos).includes('cred-NUEVA'));
  const r2 = await restaurarFilas({ version: 'x', tablas: {} }, async () => { throw new Error('no debía escribir'); }, { actuales: {} });
  ok('9. archivo no aceptado: no escribe nada y el mensaje lo dice', r2.invalido && /NO aceptado/.test(mensajeRestauracion(r2, '')));
}

// ── oct-2026: un respaldo no reactiva personas ni recupera permisos, aprobadores o credenciales ──
{
  const U_RESP = [
    { nombre: 'Ex Usuaria', email: 'ex@ejemplo.test', rol: 'admin', modulos: ['finanzas', 'osiris'] },          // hoy desactivada
    { nombre: 'Carol Machuca', email: 'cmachuca@ejemplo.test', rol: 'admin', modulos: ['finanzas', 'tareas'], tabPermisos: { finanzas: { flujo: 'editar' } } },
    { nombre: 'Borrada', email: 'borrada@ejemplo.test', rol: 'editor', modulos: ['tareas'] } ];
  const U_HOY = [
    { nombre: 'Ex Usuaria', email: 'ex@ejemplo.test', rol: 'consulta', modulos: [], desactivado: true },
    { nombre: 'Carol Machuca', email: 'cmachuca@ejemplo.test', rol: 'editor', modulos: ['tareas'], tabPermisos: { finanzas: { flujo: 'ver' } } },
    { nombre: 'Nueva', email: 'nueva@ejemplo.test', rol: 'editor', modulos: ['tareas'] } ];
  const bk = { version: 'Mediterra Hub Backup v1', tablas: {
    usuarios: { data: U_RESP },
    pins: { data: { 'Ex Usuaria_h': 'cred-ex-RESPALDO', 'Carol Machuca_h': 'cred-carol-vieja', 'Borrada_h': 'cred-borrada' } },
    permisos_facultades: { data: { rendPagar: ['ex@ejemplo.test'] } },
    rendiciones_config: { data: { valorKm: 300, aprobadores: { 'Carol Machuca': 'ex@ejemplo.test' } } },
    main: { data: { estados: { m3: { estadoResp: 'verde' } }, usuarios: U_RESP } },
    finanzas: { data: { a: 1 } } } };
  const act = {
    usuarios: { value: U_HOY }, pins: { value: { 'Carol Machuca_h': 'cred-carol-HOY' } },
    permisos_facultades: { value: { rendPagar: ['angelo@ejemplo.test'] } },
    rendiciones_config: { value: { valorKm: 250, aprobadores: { 'Carol Machuca': 'angelo@ejemplo.test' } } },
    main: { value: { estados: {}, usuarios: U_HOY } }, finanzas: { value: { a: 0 } } };
  const plan = prepararRestauracion(bk, act);
  const f = (id) => plan.filas.find((x) => x.id === id);
  ok('10. usuarios, pins y facultades NO se escriben', !f('usuarios') && !f('pins') && !f('permisos_facultades'));
  ok('10b. los datos de negocio sí: finanzas y Tareas', f('finanzas').value.a === 1 && f('main').value.estados.m3.estadoResp === 'verde');
  ok('10c. main.usuarios (espejo que siembra la fila usuarios) queda con los accesos de HOY', JSON.stringify(f('main').value.usuarios) === JSON.stringify(U_HOY));
  ok('10d. Rendiciones: se restaura su configuración (valor km) pero los aprobadores quedan los de hoy', f('rendiciones_config').value.valorKm === 300 && f('rendiciones_config').value.aprobadores['Carol Machuca'] === 'angelo@ejemplo.test');
  const txt = plan.accesos.flatMap((a) => a.diferencias).join('\n');
  ok('11. se informa que la persona desactivada sigue desactivada', /Ex Usuaria: hoy desactivada; el respaldo la tiene activa \(sigue desactivada\)/.test(txt));
  ok('11b. se informan perfil, módulos y permisos por pestaña distintos (no aplicados)', /Carol Machuca: .*perfil hoy «editor», en el respaldo «admin».*módulos: el respaldo agregaría finanzas.*permisos por pestaña distintos/.test(txt));
  ok('11c. quien está en el respaldo y hoy no existe no se recrea; quien existe hoy se conserva', /Borrada: está en el respaldo y hoy no existe \(no se recrea\)/.test(txt) && /Nueva: existe hoy y no está en el respaldo \(se conserva\)/.test(txt));
  ok('11d. credenciales: solo nombres, ningún valor', /credencial que solo existe en el respaldo \(no se recupera\): Borrada, Ex Usuaria/.test(txt) && /distinta.*: Carol Machuca/.test(txt) && !/cred-/.test(JSON.stringify(plan.accesos)));
  ok('11e. aprobadores distintos informados', /1 asignación\(es\) de aprobador distintas: Carol Machuca/.test(txt));
  const r = await restaurarFilas(bk, async () => resp(201), { actuales: act });
  const msg = mensajeRestauracion(r, '2026-09-30');
  ok('12. el aviso final lista los accesos no aplicados y no muestra credenciales', /Diferencias de acceso NO aplicadas/.test(msg) && /Ex Usuaria/.test(msg) && !/cred-/.test(msg), msg.split('\n').length + ' líneas');
  const vacio = prepararRestauracion({ version: 'Mediterra Hub Backup v1', tablas: { usuarios: { data: U_RESP }, pins: { data: { 'X_h': 'c' } } } }, {});
  ok('13. si hoy la fila de accesos no existe, tampoco se restaura sola: queda para revisión', !vacio.filas.length && vacio.accesos.every((a) => /hoy no existe/.test(a.diferencias[0])));
  const escritas = [];
  await restaurarFilas(bk, async (id) => { escritas.push(id); return resp(201); });
  ok('14. sin estado actual (ruta antigua) tampoco se escriben accesos', !escritas.includes('usuarios') && !escritas.includes('pins') && !escritas.includes('permisos_facultades'));
}

// ── Asignaciones de Tareas: se conservan las de hoy y se muestran antes de escribir ──
{
  const MAIN_RESP = { estados: { m3: { estadoResp: 'verde' } },
    supervisores: { m3: 'Angelo Huerta', m14: 'Angelo Huerta' },
    tareasOverrides: { m3: { diaLimite: 5, responsable: 'Pablo Duran' } },
    tareasConfig: { m3: { diaLimite: 5, responsable: 'Pablo Duran' } },
    tareasExtra: [{ id: 'x1', nombre: 'Extra uno', responsable: 'Carol Machuca', supervisor: 'Angelo Huerta' },
                  { id: 'x2', nombre: 'Extra borrada', responsable: 'Pablo Duran', supervisor: 'Carol Machuca' }] };
  const MAIN_HOY = { estados: {},
    supervisores: { m3: 'Carol Machuca', m14: 'Angelo Huerta' },
    tareasOverrides: { m3: { diaLimite: 7, responsable: 'Michelle Garcia' }, m15: { supervisor: 'Carol Machuca' } },
    tareasConfig: { m3: { diaLimite: 7, responsable: 'Michelle Garcia' } },
    tareasExtra: [{ id: 'x1', nombre: 'Extra uno', responsable: 'Michelle Garcia', supervisor: 'Angelo Huerta' },
                  { id: 'x3', nombre: 'Extra nueva', responsable: 'Carol Machuca', supervisor: 'Angelo Huerta' }] };
  const bk = { version: 'Mediterra Hub Backup v1', tablas: { main: { data: MAIN_RESP } } };
  const plan = prepararRestauracion(bk, { main: { value: MAIN_HOY } });
  const m = plan.filas.find((f) => f.id === 'main').value;
  ok('15. se restauran los datos de Tareas (estados, plazo del override)', m.estados.m3.estadoResp === 'verde' && m.tareasOverrides.m3.diaLimite === 5);
  ok('15b. supervisores: se conservan los de hoy', m.supervisores.m3 === 'Carol Machuca');
  ok('15c. responsable en overrides y config: el de hoy', m.tareasOverrides.m3.responsable === 'Michelle Garcia' && m.tareasConfig.m3.responsable === 'Michelle Garcia');
  ok('15d. una asignación de hoy que el respaldo no trae se conserva', m.tareasOverrides.m15 && m.tareasOverrides.m15.supervisor === 'Carol Machuca');
  ok('15e. tarea extra existente: responsable de hoy', m.tareasExtra.find((t) => t.id === 'x1').responsable === 'Michelle Garcia');
  const txt = plan.asignaciones.join('\n');
  ok('16. diferencias listadas: supervisor, responsable, tarea que vuelve y tarea que se quita', /Tarea m3: supervisor hoy «Carol Machuca», en el respaldo «Angelo Huerta»/.test(txt)
    && /Tarea m3: responsable hoy «Michelle Garcia», en el respaldo «Pablo Duran»/.test(txt)
    && /Tarea extra x2 .*hoy no existe; vuelve con responsable «Pablo Duran»/.test(txt) && /Tarea extra x3 .*la restauración la quita/.test(txt));
  const previo = resumenPrevioRestauracion(plan);
  ok('16b. el resumen previo (lo que se muestra ANTES de escribir) lo dice', /Asignaciones de Tareas que NO se cambiarán/.test(previo) && /se revisa y aplica por separado/.test(previo));
  ok('16c. sin diferencias no hay resumen previo', resumenPrevioRestauracion(prepararRestauracion(bk, { main: { value: MAIN_RESP } })) === '');
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);

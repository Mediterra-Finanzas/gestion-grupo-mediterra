// node src/restaurarRespaldo.test.mjs — restauración con respuestas comprobadas.
import { restaurarFilas, mensajeRestauracion, motivoFallo, validarRespaldo, prepararRestauracion } from './restaurarRespaldo.js';

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
  ok('8. pins: la credencial vigente NO se revierte', f('pins').value['Angelo Huerta_h'] === 'cred-NUEVA');
  ok('8b. pins: se agrega la credencial que hoy falta', f('pins').value['Carol Machuca_h'] === 'cred-carol-respaldo');
  const r2 = await restaurarFilas({ version: 'x', tablas: {} }, async () => { throw new Error('no debía escribir'); }, { actuales: {} });
  ok('9. archivo no aceptado: no escribe nada y el mensaje lo dice', r2.invalido && /NO aceptado/.test(mensajeRestauracion(r2, '')));
}

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTodo OK');
process.exit(fallos ? 1 : 0);

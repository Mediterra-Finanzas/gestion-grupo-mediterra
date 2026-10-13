// node api/send-email.test.mjs — correo con autorización comprobada en el servidor.
// Correo SIMULADO: el transporte solo registra lo que se habría enviado. Ningún mensaje real.
import { createRequire } from 'module';
import crypto from 'crypto';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { crearCorreo, firmar, CAP, COOKIE } = require('./_correo.js');

let fallos = 0, n = 0;
const ok = (nombre, c, x = '') => { n++; console.log(`${c ? 'OK ' : 'FALLA'} ${nombre}${x ? ' — ' + x : ''}`); if (!c) fallos++; };
const cred = (pin, extra = {}) => { const salt = crypto.randomBytes(16).toString('hex');
  return JSON.stringify({ v: 1, iter: 1000, salt, hash: crypto.pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 1000, 32, 'sha256').toString('hex'), pol: '6dig', ...extra }); };
const AHORA = Date.UTC(2026, 9, 13, 15, 0, 0);
const SECRET = 'secreto-de-prueba-solo-servidor';
const ORIGEN = 'https://gestion-grupo-mediterra.vercel.app';

const usuarios = [
  { nombre: 'Angelo Huerta', email: 'ahuerta@grupomediterra.cl', rol: 'admin', modulos: ['tareas', 'osiris', 'finanzas'] },
  { nombre: 'Carol Machuca', email: 'cmachuca@grupomediterra.cl', rol: 'editor', modulos: ['tareas', 'osiris', 'finanzas'] },
  { nombre: 'Operador Planta', email: 'operador@ejemplo.test', rol: 'editor', modulos: ['allegria_service'] },
  { nombre: 'Michelle Garcia', email: 'mgarcia@grupomediterra.cl', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
  { nombre: 'Ex Usuario', email: 'ex@ejemplo.test', rol: 'editor', modulos: ['tareas'], desactivado: true },
  { nombre: 'Legado Cuatro', email: 'legado@ejemplo.test', rol: 'editor', modulos: ['tareas'] },
];
const pins = {
  'Angelo Huerta_h': cred('482913'), 'Carol Machuca_h': cred('111222'), 'Operador Planta_h': cred('333444'),
  'Michelle Garcia_h': cred('555666'), 'Ex Usuario_h': cred('777888'),
  'Legado Cuatro_h': JSON.parse(JSON.stringify(cred('1234'))).replace('"pol":"6dig"', '"pol":"4dig"'),
  'Carol Machuca_temp': cred('654321', { exp: AHORA + 30 * 60e3 }),
  'Angelo Huerta_temp': cred('999000', { exp: AHORA - 60e3 }),          // vencido
};
const EJ = { id: 'ej1', empresa_id: 'emp1', estado: 'pendiente', asunto: 'Informe diario (ficticio)',
  snapshot: { clientes: [{ cliente_nombre: 'Cliente ficticio', kg_recibido: 10, kg_procesado: 8 }], total_kg_recibido: 10, total_kg_procesado: 8 },
  destinatarios_snapshot: [{ email: 'cliente@ejemplo.test' }] };

function entorno({ secret = SECRET, limiteRoto = false, smtpFalla = false } = {}) {
  const enviados = [], cuentas = new Map();
  const handler = crearCorreo({
    leerFilas: async () => ({ usuarios, pins }),
    transporte: { async enviar(m) { if (smtpFalla) throw new Error('535 5.7.3 Authentication unsuccessful [detalle interno del SMTP]'); enviados.push(m); return { messageId: `<sim-${enviados.length}>` }; } },
    limitador: { async golpe(clave, regla) { if (limiteRoto) throw new Error('rpc caída'); const c = (cuentas.get(clave) || 0) + 1; cuentas.set(clave, c); return { permitido: c <= regla.max }; } },
    leerEjecucion: async ({ empresaId, ejecucionId }) => (empresaId === 'emp1' && ejecucionId === 'ej1' ? EJ : ejecucionId === 'ej-enviado' ? { ...EJ, estado: 'enviado' } : null),
    armarReporte: require('./_reporteDiarioEmail.js').emailDesdeSnapshot,
    cfg: { secret, origenes: [ORIGEN] }, ahora: () => AHORA,
  });
  return { handler, enviados };
}
async function pedir(env, body, { origin = ORIGEN, cookie = '', method = 'POST', ip = '10.0.0.1' } = {}) {
  const res = { statusCode: 0, headers: {}, cuerpo: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; },
    json(b) { this.cuerpo = b; return this; }, end() { return this; } };
  await env.handler({ method, headers: { origin, cookie, 'x-forwarded-for': ip }, body }, res);
  return res;
}
const cookieDe = (res) => String(res.headers['set-cookie'] || '').split(';')[0];
async function sesion(env, email, pin) { const r = await pedir(env, { accion: 'sesion', email, pin }); return { r, cookie: cookieDe(r) }; }

// ── Petición antigua (la del relé abierto) y bordes del protocolo ──
{
  const e = entorno();
  let r = await pedir(e, { to: 'victima@externo.test', subject: 'Código provisorio - Mediterra', html: '<a href=x>entra</a>', modulo: 'mediterra' });
  ok('1. la petición del relé antiguo (to/subject/html, sin sesión) se rechaza y no envía nada', r.statusCode === 401 && e.enviados.length === 0, `HTTP ${r.statusCode}`);
  r = await pedir(e, { accion: 'notificacion' }, { origin: 'https://atacante.test' });
  ok('2. origen no permitido → 403, sin envío; nunca «Access-Control-Allow-Origin: *»', r.statusCode === 403 && r.headers['access-control-allow-origin'] !== '*' && e.enviados.length === 0);
  r = await pedir(e, { accion: 'notificacion' }, { origin: '' });
  ok('2b. sin encabezado Origin → 403', r.statusCode === 403);
  r = await pedir(e, {}, { method: 'GET' });
  ok('3. GET → 405', r.statusCode === 405);
  r = await pedir(entorno({ secret: '' }), { accion: 'sesion', email: 'ahuerta@grupomediterra.cl', pin: '482913' });
  ok('4. sin secreto de sesión configurado → 503 (falla cerrado)', r.statusCode === 503);
}
// ── Sesión: correo + PIN comprobados en el servidor ──
{
  const e = entorno();
  let { r } = await sesion(e, 'ahuerta@grupomediterra.cl', '000000');
  ok('5. PIN incorrecto → 401', r.statusCode === 401 && !r.headers['set-cookie']);
  ({ r } = await sesion(e, 'nadie@ejemplo.test', '482913'));
  ok('5b. correo inexistente → 401 (misma respuesta que PIN incorrecto)', r.statusCode === 401 && r.cuerpo.error === 'credenciales');
  ({ r } = await sesion(e, 'ex@ejemplo.test', '777888'));
  ok('5c. usuario desactivado → 401', r.statusCode === 401);
  ({ r } = await sesion(e, 'legado@ejemplo.test', '1234'));
  ok('5d. credencial antigua (no de 6 dígitos) → 401', r.statusCode === 401);
  ({ r } = await sesion(e, 'AHuerta@GrupoMediterra.cl ', '482913'));
  const sc = String(r.headers['set-cookie'] || '');
  ok('6. correo + PIN correctos → 200 y cookie HttpOnly, Secure, SameSite=Strict, Path=/api/send-email', r.statusCode === 200 && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && /Path=\/api\/send-email/.test(sc));
  ok('6b. abrir sesión no envía correo', e.enviados.length === 0);
}
// ── Acciones con sesión ──
{
  const e = entorno();
  const { cookie: cA } = await sesion(e, 'ahuerta@grupomediterra.cl', '482913');
  const { cookie: cC } = await sesion(e, 'cmachuca@grupomediterra.cl', '111222', { ip: '10.0.0.2' });
  let r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'Tarea', mensaje: 'texto' });
  ok('7. notificación sin cookie → 401', r.statusCode === 401 && e.enviados.length === 0);
  const forjada = `${COOKIE}=${firmar({ cap: CAP, email: 'ahuerta@grupomediterra.cl', nombre: 'Angelo Huerta', exp: AHORA + 1e6 }, 'otro-secreto')}`;
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'x', mensaje: 'y' }, { cookie: forjada });
  ok('7b. cookie firmada con otro secreto (forjada en el navegador) → 401', r.statusCode === 401);
  const vencida = `${COOKIE}=${firmar({ cap: CAP, email: 'ahuerta@grupomediterra.cl', nombre: 'Angelo Huerta', exp: AHORA - 1 }, SECRET)}`;
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'x', mensaje: 'y' }, { cookie: vencida });
  ok('7c. sesión vencida → 401', r.statusCode === 401);
  const desact = `${COOKIE}=${firmar({ cap: CAP, email: 'ex@ejemplo.test', nombre: 'Ex Usuario', exp: AHORA + 1e6 }, SECRET)}`;
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'x', mensaje: 'y' }, { cookie: desact });
  ok('7d. sesión válida de un usuario desactivado después → 401', r.statusCode === 401);
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl', 'mgarcia@grupomediterra.cl'], asunto: 'Tarea vencida\r\nBcc: espia@externo.test', mensaje: 'Revisar F29' }, { cookie: cA });
  const m = e.enviados[e.enviados.length - 1];
  ok('8. notificación a usuarios internos → 200, un envío desde la cuenta Mediterra', r.statusCode === 200 && e.enviados.length === 1 && m.cuenta === 'mediterra' && m.para.length === 2);
  ok('8b. el asunto no admite saltos de línea (sin inyección de cabeceras)', !/[\r\n]/.test(m.asunto));
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl', 'victima@externo.test'], asunto: 'x', mensaje: 'y' }, { cookie: cA });
  ok('9. notificación con un destinatario externo → 403, sin envío', r.statusCode === 403 && e.enviados.length === 1);
  r = await pedir(e, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'x', html: '<b>x</b>' }, { cookie: cA });
  ok('9b. HTML desde el navegador → 400', r.statusCode === 400 && e.enviados.length === 1);
  r = await pedir(e, { accion: 'bienvenida', email: 'nuevo@grupomediterra.cl', nombre: 'Nuevo', pin: '123456', rol: 'editor' }, { cookie: cC });
  ok('10. bienvenida pedida por quien no es admin → 403', r.statusCode === 403 && e.enviados.length === 1);
  r = await pedir(e, { accion: 'bienvenida', email: 'nuevo@grupomediterra.cl', nombre: 'Nuevo', pin: '123456', rol: 'editor' }, { cookie: cA });
  ok('10b. bienvenida pedida por el admin → 200, texto de la plantilla del servidor', r.statusCode === 200 && /Bienvenido a Mediterra Hub/.test(e.enviados[1].asunto) && e.enviados[1].para[0] === 'nuevo@grupomediterra.cl');
  r = await pedir(e, { accion: 'accion_inventada', para: ['x@y.test'] }, { cookie: cA });
  ok('11. acción desconocida con sesión → 400', r.statusCode === 400 && e.enviados.length === 2);
}
// ── Informe de Osiris y reporte diario: según el módulo ──
{
  const e = entorno();
  const { cookie: cM } = await sesion(e, 'mgarcia@grupomediterra.cl', '555666');
  const { cookie: cO } = await sesion(e, 'operador@ejemplo.test', '333444', { ip: '10.0.0.3' });
  const { cookie: cA } = await sesion(e, 'ahuerta@grupomediterra.cl', '482913', { ip: '10.0.0.4' });
  let r = await pedir(e, { accion: 'informe_osiris', para: 'cliente@ejemplo.test', asunto: 'Informe técnico', mensaje: 'cuerpo' }, { cookie: cM });
  ok('12. informe de Osiris sin el módulo Osiris → 403', r.statusCode === 403 && e.enviados.length === 0);
  r = await pedir(e, { accion: 'informe_osiris', para: 'cliente@ejemplo.test', asunto: 'Informe técnico', mensaje: 'cuerpo' }, { cookie: cA });
  ok('12b. informe de Osiris con el módulo → 200 desde la cuenta Osiris (externo permitido)', r.statusCode === 200 && e.enviados[0].cuenta === 'osiris');
  r = await pedir(e, { accion: 'informe_osiris', para: Array.from({ length: 11 }, (_, i) => `c${i}@ejemplo.test`), asunto: 'x', mensaje: 'y' }, { cookie: cA });
  ok('12c. informe con más de 10 destinatarios → 400', r.statusCode === 400 && e.enviados.length === 1);
  r = await pedir(e, { accion: 'reporte_diario', empresaId: 'emp1', ejecucionId: 'ej1' }, { cookie: cM });
  ok('13. reporte diario sin el módulo Allegria Service → 403', r.statusCode === 403 && e.enviados.length === 1);
  r = await pedir(e, { accion: 'reporte_diario', empresaId: 'emp1', ejecucionId: 'ej1', html: '<script>x</script>', para: 'victima@externo.test' }, { cookie: cO });
  const mr = e.enviados[e.enviados.length - 1];
  ok('13b. reporte diario: destinatarios del snapshot y HTML del servidor (ignora html/para del navegador)', r.statusCode === 200 && mr.para.join() === 'cliente@ejemplo.test' && /Informe Diario de Operación/.test(mr.html) && !/script/.test(mr.html));
  r = await pedir(e, { accion: 'reporte_diario', empresaId: 'emp1', ejecucionId: 'ej-enviado' }, { cookie: cO });
  ok('13c. ejecución ya enviada → 409, no se reenvía', r.statusCode === 409);
  r = await pedir(e, { accion: 'reporte_diario', empresaId: 'otra', ejecucionId: 'ej1' }, { cookie: cO });
  ok('13d. ejecución de otra empresa → 404', r.statusCode === 404);
}
// ── Código provisorio: sin sesión, comprobado contra el código guardado ──
{
  const e = entorno();
  let r = await pedir(e, { accion: 'codigo_provisorio', email: 'cmachuca@grupomediterra.cl', codigo: '654321', para: 'atacante@externo.test' });
  ok('14. código vigente → 202 y envío SOLO a la casilla registrada', r.statusCode === 202 && e.enviados.length === 1 && e.enviados[0].para.join() === 'cmachuca@grupomediterra.cl' && /654321/.test(e.enviados[0].texto));
  const r1 = await pedir(e, { accion: 'codigo_provisorio', email: 'cmachuca@grupomediterra.cl', codigo: '000000' });
  const r2 = await pedir(e, { accion: 'codigo_provisorio', email: 'ahuerta@grupomediterra.cl', codigo: '999000' });
  const r3 = await pedir(e, { accion: 'codigo_provisorio', email: 'nadie@ejemplo.test', codigo: '123456' });
  ok('14b. código incorrecto, vencido o correo inexistente → no envía nada', e.enviados.length === 1);
  ok('14c. y la respuesta es idéntica en los cuatro casos (no revela qué correos existen)', [r, r1, r2, r3].every(x => x.statusCode === 202 && JSON.stringify(x.cuerpo) === '{"aceptado":true}'));
}
// ── Límite de intentos, fallas y errores ──
{
  const e = entorno();
  let ult;
  for (let i = 0; i < 6; i++) ult = await pedir(e, { accion: 'sesion', email: 'ahuerta@grupomediterra.cl', pin: '000000' });
  ok('15. el sexto intento de PIN en 15 minutos → 429', ult.statusCode === 429);
  const r = await pedir(entorno({ limiteRoto: true }), { accion: 'sesion', email: 'ahuerta@grupomediterra.cl', pin: '482913' });
  ok('15b. limitador caído → 503 antes de comprobar el PIN (falla cerrado)', r.statusCode === 503);
  const eS = entorno({ smtpFalla: true });
  const { cookie } = await sesion(eS, 'ahuerta@grupomediterra.cl', '482913');
  const rs = await pedir(eS, { accion: 'notificacion', para: ['cmachuca@grupomediterra.cl'], asunto: 'x', mensaje: 'y' }, { cookie });
  ok('16. falla del SMTP → 502 genérico, sin detalles internos', rs.statusCode === 502 && !/535|Authentication|detalle/.test(JSON.stringify(rs.cuerpo)));
}
// ── Configuración del transporte ──
{
  const fuente = fs.readFileSync(new URL('./send-email.js', import.meta.url), 'utf8');
  ok('17. TLS validado: no queda rejectUnauthorized:false ni SSLv3', !/rejectUnauthorized\s*:\s*false/.test(fuente) && !/SSLv3/.test(fuente));
  ok('17b. ya no hay «Access-Control-Allow-Origin: *» en el endpoint', !/Allow-Origin["']\s*,\s*["']\*/.test(fuente));
}
console.log(fallos ? `\n${fallos} de ${n} FALLA(S)` : `\nTodo OK (${n}) · correo simulado, ningún mensaje real`);
process.exit(fallos ? 1 : 0);

/* ─────────────────────────────────────────────────────────────────────────
   D4 — Límite de intentos combinado (cuenta + origen, demoras progresivas, umbral
   por cuenta con verificación por correo, equipo reconocido). Datos de prueba.
   Orígenes distintos = direcciones de loopback distintas (127.0.0.x) contra DOS
   instancias independientes del servidor (procesos propios) que comparten la base.
   Tiempos acortados con AUTH_INTENTOS_FACTOR (solo fuera de producción).
   Uso: POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-main-pins/prueba-intentos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import http from 'http';
import net from 'net';
import path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import { levantarEntorno, RAIZ } from './entorno.mjs';

const require = createRequire(import.meta.url);
const R = require(path.join(RAIZ, 'api/_reglasLogin.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`}`);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const hoy = new Date().toISOString().slice(0, 10);
const cred = (pin) => { const c = R.hashPin(pin); c.pol = '6dig'; c.fecha = hoy; return JSON.stringify(c); };
const em = (n) => `${n.toLowerCase()}@prueba.test`;
const U = (nombre) => ({ nombre, email: em(nombre), cargo: 'Prueba', rol: 'editor', modulos: ['tareas'], tab_permisos: {} });
const NOMBRES = ['Ana', 'Beto', 'Carla', 'Dora', 'Eloy', 'Fabi', 'Gael', 'Hilda'];
const PIN = { Ana: '482916', Beto: '579135', Carla: '613724', Dora: '724835', Eloy: '835946', Fabi: '946157', Gael: '157268', Hilda: '268379' };
const pins = {}; for (const n of NOMBRES) pins[`${n}_h`] = cred(PIN[n]);
const FACTOR = 0.02;   // K1: base 1 s, tope 72 s · K3/KD/KCA: ~14 h · KC: 54 s
const E = await levantarEntorno({ sembrar: { usuarios: NOMBRES.map(U), pins, main: { estados: {} }, admins: ['beto@prueba.test'] },
  env: { AUTH_INTENTOS_FACTOR: String(FACTOR), AUTH_RL_IP_MAX: '100000', AUTH_RL_ID_MAX: '100000' } });
const hijos = [];
const puertoLibre = () => new Promise((r) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
async function instancia() {
  const puerto = await puertoLibre();
  // Guardia de destinos activa: Supabase local permitido; ningún correo sale de estas instancias.
  const env = { ...process.env, PUERTO: String(puerto), DESTINOS_PERMITIDOS: '127.0.0.1' };
  delete env.CORREO_DESTINOS_PERMITIDOS;
  const p = spawn(process.execPath, [path.join(RAIZ, 'scripts/seguridad-main-pins/instancia.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
  hijos.push(p);
  await new Promise((r, m) => { p.stdout.on('data', (d) => { if (/LISTA/.test(d)) r(); }); p.on('exit', (c) => m(new Error('instancia salió ' + c))); });
  return puerto;
}
// Petición desde un origen (IP de loopback) elegido.
function pedir(puerto, desde, metodo, ruta, { body, cookies = [] } = {}) {
  return new Promise((resolve, reject) => {
    const datos = body !== undefined ? JSON.stringify(body) : undefined;
    const h = {}; if (datos) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(datos); }
    if (cookies.length) h.Cookie = cookies.filter(Boolean).join('; ');
    const q = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: h, localAddress: desde }, (r) => {
      let t = ''; r.on('data', (c) => { t += c; }); r.on('end', () => {
        let j = null; try { j = JSON.parse(t); } catch (e) {}
        const sc = [].concat(r.headers['set-cookie'] || []);
        const ck = (n) => { const x = sc.find((c) => c.startsWith(n + '=')); return x ? x.split(';')[0] : null; };
        resolve({ status: r.statusCode, j, sesion: ck('mediterra_sess'), disp: ck('mediterra_disp'), retry: Number(r.headers['retry-after'] || 0), setCookie: sc });
      });
    });
    q.on('error', reject); if (datos) q.write(datos); q.end();
  });
}
const ipN = (n) => `127.0.0.${n}`;
const login = (p, desde, n, pin, cookies) => pedir(p, desde, 'POST', '/api/auth/login', { body: { email: em(n), pin }, cookies });
const codigoDe = (para) => { const c = [...E.correos].reverse().find((m) => m.to === para); const m = c && /código provisorio es: (\d{6})/.exec(c.message); return m ? m[1] : null; };
const RLmod = require(path.join(RAIZ, 'api/_friskuSpRateLimiter.js'));
const bucket = (tipo, clave) => RLmod.bucketHmac(process.env.AUTH_RATELIMIT_SECRET, `seg:${tipo}:${clave}`);
const fila = (tipo, clave) => E.psql(`select coalesce(fallos,0)||'|'||coalesce(escalon,0)||'|'||coalesce(extract(epoch from (bloqueado_hasta-now()))::int,0) from seg_intentos where bucket='${bucket(tipo, clave)}'`);
// Recuperar por la instancia en proceso (correos capturados), desde cualquier origen.
const recuperar = async (n) => { const r = await fetch(E.url + '/api/auth/recuperar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: em(n) }) }); return r.status; };

try {
  const I2 = await instancia(), I3 = await instancia();
  console.log('K1 cuenta+origen: 5 fallos libres y demoras progresivas con tope:');
  const resp = [];
  for (let i = 0; i < 5; i++) resp.push((await login(I2, ipN(2), 'Ana', '000000')).status);
  eq(resp, [401, 401, 401, 401, 401], '5 fallos desde un origen → se evalúan');
  let b = await login(I2, ipN(2), 'Ana', PIN.Ana);
  ok(b.status === 429 && b.retry >= 1 && b.retry <= 2, `6º intento inmediato (aunque sea el PIN correcto) → 429, espera ${b.retry} s`);
  await espera(1300);
  eq((await login(I3, ipN(2), 'Ana', '000000')).status, 401, 'pasada la demora, otro intento se evalúa (en la OTRA instancia: contador compartido)');
  b = await login(I2, ipN(2), 'Ana', '000000');
  ok(b.status === 429 && b.retry >= 2 && b.retry <= 3, `la demora siguiente se duplica: ${b.retry} s`);
  const [, esc, seg] = fila('K1', `app:${ipN(2)}|${em('Ana')}`).split('|').map(Number);
  ok(esc === 2 && seg <= Math.round(3600 * FACTOR), `escalón 2 y bloqueo dentro del tope (${seg} s ≤ ${Math.round(3600 * FACTOR)} s)`);
  const otro = await login(I3, ipN(3), 'Ana', PIN.Ana);
  ok(otro.status === 200 && otro.disp, 'otro origen con el PIN correcto entra (el bloqueo es solo de ese origen) y recibe cookie de equipo reconocido');
  const dispAna = otro.disp;

  console.log('K3 umbral por cuenta (orígenes no reconocidos) → verificación adicional:');
  const r10 = [];
  for (let i = 0; i < 10; i++) r10.push((await login(i % 2 ? I2 : I3, ipN(10 + i), 'Ana', '000000')).status);
  eq(r10, Array(10).fill(401), '10 fallos desde 10 orígenes distintos, repartidos en dos instancias → se evalúan');
  const nuevoBien = await login(I2, ipN(30), 'Ana', PIN.Ana);
  const nuevoMal = await login(I3, ipN(31), 'Ana', '000000');
  eq([nuevoBien.status, nuevoBien.j && nuevoBien.j.error, nuevoMal.status, nuevoMal.j && nuevoMal.j.error],
    [403, 'verificacion_requerida', 403, 'verificacion_requerida'], 'origen NUEVO, con el PIN correcto o incorrecto → 403 verificacion_requerida (el PIN no se evalúa: no hay oráculo)');
  const [k3f, , k3s] = fila('K3', em('Ana')).split('|').map(Number);
  ok(k3f === 10 && k3s > 0, `K3: 10 fallos y verificación exigida por ${k3s} s (tope ${Math.round(30 * 86400 * FACTOR)} s, nunca indefinido)`);
  const desdeEquipo = await login(I2, ipN(40), 'Ana', PIN.Ana, [dispAna]);
  ok(desdeEquipo.status === 200, 'equipo reconocido (cookie) desde OTRA IP → entra con su PIN: los fallos de terceros no la bloquean');
  {
    const r = await fetch(E.url + '/api/auth/verificar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mediterra-secreto': E.secretoVerificar }, body: JSON.stringify({ email: em('Ana'), pin: PIN.Ana }) });
    const j = await r.json();
    eq([r.status, j.error], [401, 'verificacion_requerida'], 'osiris-auth (verificar) bajo el umbral → 401 verificacion_requerida');
  }

  console.log('Falsificación del reconocimiento de equipo:');
  const dispBeto = (await login(I2, ipN(41), 'Beto', PIN.Beto)).disp;
  eq((await login(I2, ipN(42), 'Ana', PIN.Ana, [dispBeto])).status, 403, 'cookie de equipo de OTRA persona (Beto) → no reconoce a Ana');
  const [cuerpo, firma] = decodeURIComponent(dispAna.split('=')[1]).split('.');
  const pay = JSON.parse(Buffer.from(cuerpo.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  const cuerpo2 = Buffer.from(JSON.stringify({ ...pay, exp: pay.exp + 1e9 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  eq((await login(I2, ipN(43), 'Ana', PIN.Ana, [`mediterra_disp=${encodeURIComponent(cuerpo2 + '.' + firma)}`])).status, 403, 'contenido alterado con la firma original → no reconocido');
  eq((await login(I2, ipN(44), 'Ana', PIN.Ana, [`mediterra_disp=${encodeURIComponent(cuerpo + '.' + 'A'.repeat(43))}`])).status, 403, 'firma inventada → no reconocido');
  const sesionBeto = (await login(I2, ipN(41), 'Beto', PIN.Beto, [dispBeto])).sesion;
  eq((await login(I2, ipN(45), 'Ana', PIN.Ana, [sesionBeto.replace('mediterra_sess', 'mediterra_disp')])).status, 403, 'una cookie de SESIÓN usada como cookie de equipo → no reconocida (llave y tipo distintos)');

  console.log('Verificación por correo (código propio: el PIN vigente sigue valiendo):');
  eq(await recuperar('Ana'), 200, 'Ana pide un código');
  const cod = codigoDe(em('Ana'));
  ok(/^\d{6}$/.test(cod || ''), 'llega el código (correo capturado en local)');
  eq((await login(I2, ipN(46), 'Ana', PIN.Ana, [dispAna])).status, 200, 'pedir el código NO invalida el PIN vigente (desde su equipo entra con el PIN)');
  const conCodigo = await login(I3, ipN(47), 'Ana', cod);
  eq([conCodigo.status, conCodigo.j && conCodigo.j.debeCambiarPin], [200, true], 'origen nuevo con el CÓDIGO del correo → entra a crear PIN (verificación adicional)');
  const cambio = await pedir(I3, ipN(47), 'POST', '/api/auth/cambiar-pin', { body: { pinNuevo: '357146' }, cookies: [conCodigo.sesion] });
  eq([cambio.status, !!cambio.disp], [200, true], 'crea el PIN nuevo y ese equipo queda reconocido');
  PIN.Ana = '357146';
  eq(fila('K3', em('Ana')), '', 'la verificación por correo libera el umbral de la cuenta');
  eq((await login(I2, ipN(48), 'Ana', PIN.Ana)).status, 200, 'después, un origen nuevo vuelve a poder probar el PIN');
  eq((await login(I2, ipN(49), 'Ana', PIN.Ana, [dispAna])).status, 200, 'la cookie de equipo VIEJA (época anterior al cambio de PIN) ya no cuenta como reconocida, pero sin umbral activo entra con el PIN');
  for (let i = 0; i < 10; i++) await login(I2, ipN(60 + i), 'Ana', '000000');
  eq((await login(I2, ipN(70), 'Ana', PIN.Ana, [dispAna])).status, 403, 'con el umbral otra vez activo, la cookie de época vieja → 403 (no reconocida)');
  eq((await login(I2, ipN(71), 'Ana', PIN.Ana, [cambio.disp])).status, 200, 'la cookie emitida tras el cambio de PIN → reconocida, entra');

  console.log('Límite del código por correo:');
  await recuperar('Ana');
  const cod2 = codigoDe(em('Ana'));
  const malos = [];
  for (let i = 0; i < 5; i++) malos.push((await login(I3, ipN(80 + i), 'Ana', String((Number(cod2) + 1 + i) % 1000000).padStart(6, '0'))).status);
  eq(malos, [403, 403, 403, 403, 403], '5 códigos incorrectos desde orígenes nuevos → rechazados');
  const agotado = await login(I3, ipN(90), 'Ana', cod2);
  eq([agotado.status, agotado.j && agotado.j.error], [403, 'codigo_agotado'], 'después, ni el código correcto sirve: código agotado (hay que pedir otro)');

  console.log('Reseteo del administrador: hereda la inhabilitación y desbloquea de forma controlada:');
  const admin = (await login(I2, ipN(91), 'Beto', PIN.Beto, [dispBeto])).sesion;
  const rs = await fetch(E.url + '/api/auth/admin-reset-pin', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: admin }, body: JSON.stringify({ nombre: 'Ana' }) });
  const rsj = await rs.json();
  eq([rs.status, rsj.desbloqueado], [200, true], 'Beto (seg_administradores) resetea a Ana y desbloquea su cuenta');
  eq([fila('K3', em('Ana')), fila('KCA', em('Ana'))], ['', ''], 'K3 y el acumulado de códigos de Ana quedan liberados');
  await recuperar('Ana');
  eq((await login(I2, ipN(92), 'Ana', PIN.Ana, [cambio.disp])).status, 401, 'un pedido propio DESPUÉS del reseteo no reactiva el PIN anterior (hereda "admin"), ni desde su equipo (época de equipos subida)');

  console.log('Concurrencia (atómico entre instancias):');
  const par1 = await Promise.all(Array.from({ length: 20 }, (_, i) => login(i % 2 ? I2 : I3, ipN(100), 'Carla', '000000')));
  const ev1 = par1.filter((x) => x.status === 401).length;
  ok(ev1 <= 5, `20 intentos simultáneos desde un origen, en dos instancias → se evalúan ${ev1} (≤ 5), el resto 429`);
  const par2 = await Promise.all(Array.from({ length: 30 }, (_, i) => login(i % 2 ? I2 : I3, ipN(110 + i), 'Dora', '000000')));
  const ev2 = par2.filter((x) => x.status === 401).length;
  eq([ev2, par2.filter((x) => x.status === 403).length], [10, 20], '30 intentos simultáneos desde 30 orígenes → exactamente 10 evaluados, 20 exigen verificación');

  console.log('K2 por origen (todas las cuentas):');
  // Un intento por cuenta (31 correos distintos, existan o no): K1 no actúa; solo K2.
  const rociado = [];
  for (let i = 0; i < 31; i++) {
    const r = await pedir(i % 2 ? I2 : I3, ipN(200), 'POST', '/api/auth/login', { body: { email: `rociado${i}@prueba.test`, pin: '000000' } });
    rociado.push(r.status);
  }
  eq([rociado.slice(0, 30).every((x) => x === 401), rociado[30]], [true, 429], 'rociar 1 PIN sobre 31 cuentas desde un origen: 30 evaluados y el 31º → 429 (K2, entre instancias)');
  eq((await login(I2, ipN(200), 'Eloy', PIN.Eloy)).status, 429, 'ese origen queda demorado también para una cuenta válida');
  eq((await login(I3, ipN(201), 'Eloy', PIN.Eloy)).status, 200, 'la persona, desde otro origen, entra normal');
  console.log('K2 con una IP compartida (oficina detrás de NAT):');
  const oficina = [];
  for (let i = 0; i < 40; i++) { const n = ['Fabi', 'Gael', 'Hilda'][i % 3]; oficina.push((await login(i % 2 ? I2 : I3, ipN(210), n, PIN[n])).status); }
  ok(oficina.every((x) => x === 200), `40 ingresos correctos desde una misma IP en minutos → ninguno bloqueado (${oficina.filter((x) => x === 200).length}/40)`);
  const mezcla = [];
  for (let i = 0; i < 29; i++) mezcla.push((await pedir(I2, ipN(220), 'POST', '/api/auth/login', { body: { email: `mezcla${i}@prueba.test`, pin: '000000' } })).status);
  const exito = (await login(I3, ipN(220), 'Fabi', PIN.Fabi)).status;
  const f30 = (await pedir(I2, ipN(220), 'POST', '/api/auth/login', { body: { email: 'mezcla29@prueba.test', pin: '000000' } })).status;
  const f31 = (await pedir(I3, ipN(220), 'POST', '/api/auth/login', { body: { email: 'mezcla30@prueba.test', pin: '000000' } })).status;
  eq([mezcla.every((x) => x === 401), exito, f30, f31], [true, 200, 401, 429], 'un ingreso correcto en medio NO borra los 29 fallos previos: el 30º fallo activa la demora y el siguiente → 429');

} catch (e) {
  fail++; console.log('  ✗ excepción: ' + (e && e.stack || e));
} finally {
  for (const h of hijos) { try { h.kill(); } catch (e) {} }
  await E.cerrar();
}
console.log(`\nprueba-intentos: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

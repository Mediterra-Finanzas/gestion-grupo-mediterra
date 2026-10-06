/* ─────────────────────────────────────────────────────────────────────────
   DETECTOR DE SALIDAS — la interfaz en modo servidor, sin tocar producción.
   SOLO DATOS SINTÉTICOS. Nada sale de esta máquina.

   Build de prueba (lo arma solo si falta o cambió la configuración):
     REACT_APP_AUTH_SERVER=true
     REACT_APP_SUPA_URL=http://127.0.0.1:<AISL_SUPA_PUERTO, def. 54329>
     REACT_APP_SUPA_KEY=clave-anon-local-de-prueba   (marcador fijo; ver abajo)
     REACT_APP_URL_VERSION=.                         (detector de versión = mismo origen)

   Por qué un puerto fijo: la llave anon del entorno local cambia en cada corrida
   (secreto JWT aleatorio de entorno.mjs). El build lleva una URL y una llave FIJAS;
   un proxy local en 127.0.0.1:<puerto> cambia la llave marcador por la llave anon
   real del entorno y reenvía a su proxy /rest/v1 → PostgREST. Así el build se
   compila una sola vez y el navegador abre conexiones TCP reales a un host local.

   Qué registra (y hace fallar):
     · TODA petición HTTP del navegador: context.route(todas las URL) (bloquea lo no
       autorizado ANTES de salir) + context.on('request') (registro independiente).
     · TODO WebSocket: context.routeWebSocket (bloquea) + page.on('websocket').
     · service workers: context.on('serviceworker') + registros al final.
     · salidas del servidor (handlers reales en este proceso): globalThis.fetch envuelto.
     · correos: transporte SMTP simulado de api/send-email.js; los códigos del
       servidor pasan por el envío real (con la lista de api/_destinos.js).
   Autorizados: el origen de la app y el proxy Supabase local. Google Fonts
   (public/index.html) se responde VACÍO aquí, sin salir, y se informa como
   "tercero declarado"; con AISL_ESTRICTO=1 cuenta como falla.

   Recorrido por la interfaz: login fallido · login de un editor · Salir ·
   "¿Olvidaste tu PIN?" con el código del correo + cambio de PIN obligatorio ·
   Salir · login de un ADMIN (respaldo diario + alertas del LUNES, con la fecha
   del navegador fijada en un lunes) · Permisos → Resetear PIN de otra persona ·
   Salir. Al final, CONTROL POSITIVO: peticiones, WebSocket, beacon y correo a
   destinos prohibidos (hosts .invalid, que nunca resuelven) deben ser detectados.

     POSTGREST_BIN=/ruta/postgrest OUT_DIR=/tmp/ai node scripts/e2e/aislamiento-interfaz.mjs
     (AISL_BUILD=<dir> para elegir dónde queda el build; AISL_ESTRICTO=1)
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { levantarEntorno } from '../seguridad-main-pins/entorno.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const OUT = process.env.OUT_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'aisl-'));
fs.mkdirSync(OUT, { recursive: true });
const PUERTO = Number(process.env.AISL_SUPA_PUERTO || 54329);
const CLAVE_MARCADOR = 'clave-anon-local-de-prueba';
const BUILD = path.resolve(process.env.AISL_BUILD || path.join(os.tmpdir(), `build-aislamiento-${PUERTO}`));
const ESTRICTO = process.env.AISL_ESTRICTO === '1';
const DOMINIO_OK = '@prueba.mediterra.test';
const TERCEROS_DECLARADOS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. Build de prueba ───────────────────────────────────────────────────
const ENV_BUILD = { REACT_APP_AUTH_SERVER: 'true', REACT_APP_SUPA_URL: `http://127.0.0.1:${PUERTO}`,
  REACT_APP_SUPA_KEY: CLAVE_MARCADOR, REACT_APP_URL_VERSION: '.' };
function asegurarBuild() {
  const head = spawnSync('git', ['-C', RAIZ, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const difs = spawnSync('git', ['-C', RAIZ, 'diff', 'HEAD', '--', 'src', 'public'], { encoding: 'utf8' }).stdout;
  const sello = JSON.stringify({ ...ENV_BUILD, head, difs: crypto.createHash('sha256').update(difs).digest('hex') });
  const fSello = path.join(BUILD, '.aislamiento-sello.json');
  if (fs.existsSync(path.join(BUILD, 'index.html')) && fs.existsSync(fSello) && fs.readFileSync(fSello, 'utf8') === sello) {
    console.log(`build reutilizado: ${BUILD}`); return;
  }
  console.log(`armando build de prueba en ${BUILD} (CI=true) …`);
  const r = spawnSync('npm', ['run', 'build'], { cwd: RAIZ, encoding: 'utf8',
    env: { ...process.env, ...ENV_BUILD, CI: 'true', BUILD_PATH: BUILD, REACT_APP_AUTH_DUAL: '', REACT_APP_USE_GUARD: '' } });
  if (r.status !== 0) { console.error(String(r.stdout).slice(-3000), String(r.stderr).slice(-3000)); throw new Error('build falló'); }
  fs.writeFileSync(fSello, sello);
}
asegurarBuild();

// ── 2. Datos sintéticos ──────────────────────────────────────────────────
function cred(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
  return JSON.stringify({ v: 1, iter: 100000, salt: salt.toString('hex'), hash, pol: '6dig', fecha: new Date().toISOString().slice(0, 10) });
}
const U = {
  admin:    { nombre: 'Admin Prueba',    email: `admin${DOMINIO_OK}`,    pin: '482913', rol: 'admin' },
  editor:   { nombre: 'Editor Prueba',   email: `editor${DOMINIO_OK}`,   pin: '739154', rol: 'editor' },
  recupera: { nombre: 'Recupera Prueba', email: `recupera${DOMINIO_OK}`, pin: '615283', rol: 'editor' },
  reseteo:  { nombre: 'Reseteo Prueba',  email: `reseteo${DOMINIO_OK}`,  pin: '927461', rol: 'editor' },
  // Responsable de la tarea puntual p1 (TAREAS_BASE). El padrón lo completa con WORKERS_BASE (correo REAL): la alerta del lunes debe ser rechazada.
  pablo:    { nombre: 'Pablo Duran',     email: `pablo.duran${DOMINIO_OK}`, pin: '583920', rol: 'editor' },
};
const usuarios = Object.values(U).map((u) => ({ nombre: u.nombre, cargo: 'Prueba', email: u.email, rol: u.rol, modulos: ['tareas'], esCFO: false }));

// "Hoy" del navegador = el lunes de esta semana (misma hora). La tarea p1 vence 3 días después.
const ahora = new Date();
const diasDesdeLunes = (ahora.getDay() + 6) % 7;
const OFFSET_LUNES = -diasDesdeLunes * 86400000;
const lunes = new Date(ahora.getTime() + OFFSET_LUNES);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const vencP1 = iso(new Date(lunes.getTime() + 3 * 86400000));
const sembrar = {
  usuarios,
  pins: Object.fromEntries(Object.values(U).map((u) => [`${u.nombre}_h`, cred(u.pin)])),
  main: { estados: {}, comentarios: {}, recsDone: {}, recsComentarios: {}, usuarios, mes: lunes.getMonth(), anio: lunes.getFullYear(),
    tareasConfig: { p1: { supervisor: '', diaLimiteSem: 0, diaLimite: 0, frecuencia: 'Puntual', bloqueada: false, dependeDe: null, fechaPuntual: vencP1 } } },
  admins: [U.admin.email],
};

// ── 3. Entorno local + correo simulado + salidas del servidor ────────────
const E = await levantarEntorno({ build: BUILD, sembrar, env: {
  CORREO_DESTINOS_PERMITIDOS: DOMINIO_OK, DESTINOS_PERMITIDOS: 'pendiente',
  SMTP_MEDITERRA_USER: `remitente${DOMINIO_OK}`, SMTP_MEDITERRA_PASS: 'no-se-usa' } });
const APP = new URL(E.url).origin;
const SUPA_LOCAL = `http://127.0.0.1:${PUERTO}`;
const HOST_SUPA_ENTORNO = new URL(E.supabase).host, HOST_PGRST = new URL(E.pgrst).host;
// La lista del servidor (api/_destinos.js) se lee en cada llamada: aquí ya se conoce el puerto.
process.env.DESTINOS_PERMITIDOS = [HOST_SUPA_ENTORNO, 'smtp.office365.com'].join(',');

const SE = require(path.join(RAIZ, 'api/send-email.js'));
const S = require(path.join(RAIZ, 'api/_segServidor.js')); // misma instancia que usa entorno.mjs
let fase = 'preparacion';
const correosEnviados = [], avisosDestino = [], correosHttp = [];
SE.__pruebas.setTransporte((config) => ({ sendMail: async (m) => {
  correosEnviados.push({ fase, host: config.host, to: String(m.to), subject: String(m.subject || ''), text: String(m.text || '') });
  return { messageId: `simulado-${correosEnviados.length}` };
} }));
// Los códigos del servidor pasan por el envío REAL (lista de destinatarios incluida), no por la captura de entorno.mjs.
S.__pruebas.setEnviarCorreo((m) => SE.enviarCorreo({ ...m, modulo: 'mediterra' }));
const warnReal = console.warn;
console.warn = (...a) => { const t = a.join(' '); if (t.includes('[destino-no-autorizado]')) avisosDestino.push({ fase, t }); warnReal(...a); };

const salidasServidor = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (u, ...r) => {
  let host = '?'; try { host = new URL(typeof u === 'string' ? u : u.url || String(u)).host; } catch (e) {}
  const ok = [HOST_SUPA_ENTORNO, HOST_PGRST].includes(host);
  salidasServidor.push({ fase, host, ok });
  if (!ok) return Promise.reject(new Error(`[detector] salida del servidor bloqueada: ${host}`));
  return fetchReal(u, ...r);
};

// Proxy Supabase local: llave marcador → llave anon real del entorno.
const pedidasSupa = [];
const proxy = http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': req.headers.origin || '*', 'access-control-allow-credentials': 'true',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'access-control-expose-headers': 'content-range,content-profile' };
  pedidasSupa.push({ fase, metodo: req.method, ruta: req.url });
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const h = { ...req.headers, host: HOST_SUPA_ENTORNO };
  if (h.apikey === CLAVE_MARCADOR) h.apikey = E.anon;
  if (h.authorization === `Bearer ${CLAVE_MARCADOR}`) h.authorization = `Bearer ${E.anon}`;
  const dest = new URL(E.supabase);
  const p = http.request({ host: dest.hostname, port: dest.port, path: req.url, method: req.method, headers: h }, (r) => {
    const hs = { ...r.headers }; for (const k of Object.keys(hs)) if (k.startsWith('access-control-')) delete hs[k];
    res.writeHead(r.statusCode, { ...hs, ...cors }); r.pipe(res);
  });
  p.on('error', (e) => { res.writeHead(502, cors); res.end(String(e)); });
  req.pipe(p);
});
await new Promise((ok, mal) => { proxy.once('error', mal); proxy.listen(PUERTO, '127.0.0.1', ok); })
  .catch((e) => { console.error(`El puerto ${PUERTO} está ocupado (AISL_SUPA_PUERTO lo cambia y rearma el build): ${e.message}`); process.exit(2); });
console.log(`entorno: app ${APP} · supabase local ${SUPA_LOCAL} → ${E.supabase} · build ${BUILD}`);
console.log(`lunes simulado en el navegador: ${iso(lunes)} · p1 vence ${vencP1}`);

// ── 4. Navegador con registro de salidas ─────────────────────────────────
function clasificar(url) {
  let u; try { u = new URL(url); } catch (e) { return 'prohibido'; }
  if (['data:', 'blob:', 'about:'].includes(u.protocol)) return 'local-inline';
  if (u.origin === APP) return 'app';
  if (u.origin === SUPA_LOCAL) return 'supabase-local';
  if (TERCEROS_DECLARADOS.includes(u.hostname)) return ESTRICTO ? 'prohibido' : 'tercero-declarado';
  return 'prohibido';
}
const registro = []; // {fase, via, tipo, metodo, url, clase}
const anotar = (x) => registro.push({ fase, ...x, clase: clasificar(x.url) });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const contextos = [];

// Respuesta de /api/send-email con el handler REAL (entorno.mjs no lo sirve).
function llamarSendEmail(body) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); return this; }, end() { resolve({ status: this.statusCode, body: {} }); } };
    Promise.resolve(SE({ method: 'POST', body }, res)).catch((e) => resolve({ status: 500, body: { error: String(e) } }));
  });
}

async function nuevaPestana(nombre) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, serviceWorkers: 'allow' });
  await ctx.addInitScript((off) => {
    const R = Date;
    class D extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } }
    window.Date = D;
  }, OFFSET_LUNES);
  ctx.on('request', (req) => anotar({ via: 'evento', tipo: req.resourceType(), metodo: req.method(), url: req.url() }));
  ctx.on('serviceworker', (sw) => anotar({ via: 'serviceworker', tipo: 'serviceworker', metodo: '-', url: sw.url() }));
  await ctx.routeWebSocket(() => true, (ws) => {
    anotar({ via: 'route-ws', tipo: 'websocket', metodo: 'WS', url: ws.url() });
    if (clasificar(ws.url()) === 'prohibido') ws.close({ code: 1008, reason: 'bloqueado por el detector' }); else ws.connectToServer();
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url(), clase = clasificar(url);
    anotar({ via: 'route', tipo: req.resourceType(), metodo: req.method(), url });
    if (clase === 'prohibido') return route.abort('blockedbyclient');
    if (clase === 'tercero-declarado') return route.fulfill({ status: 200, contentType: url.includes('css') ? 'text/css' : 'font/woff2', body: '' });
    const u = new URL(url);
    if (clase === 'app' && u.pathname === '/api/send-email') {
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, body: '' });
      const r = await llamarSendEmail(body || {});
      correosHttp.push({ fase, to: body && body.to, status: r.status, motivo: r.body && r.body.motivo });
      return route.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.body) });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('websocket', (ws) => anotar({ via: 'evento-ws', tipo: 'websocket', metodo: 'WS', url: ws.url() }));
  const dialogos = [], errores = [], api = [];
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => { dialogos.push(d.message()); d.accept().catch(() => {}); });
  page.on('response', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push({ fase, metodo: r.request().method(), ruta: u.pathname, status: r.status() }); });
  const p = { ctx, page, dialogos, errores, api, nombre };
  contextos.push(p);
  return p;
}

const formLogin = (p) => p.page.locator('#login-pin-input');
const enHub = (p) => p.page.getByRole('button', { name: 'Salir' }).first();
async function cerrarAvisos(p) {
  for (const t of ['Entendido', 'Aceptar', 'Cerrar']) {
    const b = p.page.getByRole('button', { name: t });
    if (await b.count()) { await b.first().click().catch(() => {}); await p.page.waitForTimeout(200); }
  }
}
async function ingresar(p, email, pin) {
  if (!(await formLogin(p).count())) await p.page.goto(APP, { waitUntil: 'domcontentloaded' });
  await formLogin(p).waitFor({ timeout: 20000 });
  await p.page.locator('input[type=email]').first().fill(email);
  await formLogin(p).fill(pin);
  await p.page.getByRole('button', { name: 'Ingresar' }).click();
}
async function esperarHub(p, ms = 15000) {
  try { await enHub(p).waitFor({ timeout: ms }); await p.page.waitForTimeout(800); await cerrarAvisos(p); return true; } catch (e) { return false; }
}
async function salir(p) {
  await p.page.evaluate(() => sessionStorage.removeItem('mediterra_modulo'));
  const recarga = p.page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
  await cerrarAvisos(p);
  await enHub(p).click();
  await recarga;
  await formLogin(p).waitFor({ timeout: 15000 }).catch(() => {});
  return (await formLogin(p).count()) > 0 && p.api.some((x) => x.ruta === '/api/auth/logout');
}
async function cambiarPinForzado(p, actual, nuevoPin) {
  await p.page.getByText('Actualizar acceso').waitFor({ timeout: 15000 });
  const campos = p.page.locator('input[autocomplete="new-password"]');
  await campos.nth(0).fill(actual); await campos.nth(1).fill(nuevoPin); await campos.nth(2).fill(nuevoPin);
  await p.page.getByRole('button', { name: 'Guardar' }).click();
}
const codigoPara = (email) => {
  const c = [...correosEnviados].reverse().find((m) => m.to.toLowerCase() === email.toLowerCase());
  const m = c && /([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/.exec(c.text); return m ? m[1] : null;
};
const filaDb = (id) => { try { return JSON.parse(E.psql(`select value::text from calendario_data where id='${id}'`)); } catch (e) { return null; } };
const correoAutorizado = (dir) => String(dir).split(/[,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
  .every((d) => d.endsWith(DOMINIO_OK) && /^[^@\s]+@[^@\s]+$/.test(d));
const prohibidos = (desde) => registro.filter((r) => r.clase === 'prohibido' && desde(r.fase));

try {
  // ── A. login fallido + login de editor + Salir ──
  fase = 'editor';
  const a = await nuevaPestana('editor');
  await a.page.goto(APP, { waitUntil: 'domcontentloaded' });
  await ingresar(a, U.editor.email, '000000');
  await a.page.waitForTimeout(2500);
  check('A1. login fallido: sigue en el formulario (401 del servidor)', (await formLogin(a).count()) > 0 && a.api.some((x) => x.ruta === '/api/auth/login' && x.status === 401));
  await a.page.waitForTimeout(6000); // auditoría: se graba a los 5 s
  // auditLog("login_fallido") sin usuario autenticado se descarta (App.jsx): no hay escritura que esperar.
  check('A2. login fallido: ninguna salida fuera de los destinos autorizados', !registro.some((r) => r.fase === 'editor' && r.clase === 'prohibido'));
  await ingresar(a, U.editor.email, U.editor.pin);
  check('A3. login de un editor entra al hub', await esperarHub(a));
  await a.page.waitForTimeout(7000); // detector de versión (5 s) + auditoría
  check('A4a. auditoría del login: GET + POST de audit_log al proxy LOCAL',
    pedidasSupa.some((x) => x.fase === 'editor' && x.metodo === 'GET' && /id=eq\.audit_log/.test(x.ruta)) && pedidasSupa.some((x) => x.fase === 'editor' && x.metodo === 'POST'));
  check('A4. detector de versión consulta el MISMO origen', registro.some((r) => r.fase === 'editor' && r.via === 'route' && r.tipo === 'fetch' && r.url === `${APP}/`));
  check('A5. Salir vuelve al login (POST /api/auth/logout)', await salir(a));

  // ── B. ¿Olvidaste tu PIN? → código del correo → cambio obligatorio → Salir ──
  fase = 'recuperacion';
  await a.page.getByRole('button', { name: '¿Olvidaste tu PIN?' }).click();
  await a.page.locator('input[placeholder="tu.nombre@grupomediterra.cl"]').last().fill(U.recupera.email);
  await a.page.getByRole('button', { name: /Enviar PIN temporal/ }).click();
  for (let i = 0; i < 40 && !codigoPara(U.recupera.email); i++) await a.page.waitForTimeout(500);
  const codigo = codigoPara(U.recupera.email);
  check('B1. recuperar: el código llegó al correo permitido (envío real + lista)', !!codigo);
  await a.page.goto(APP, { waitUntil: 'domcontentloaded' });
  await ingresar(a, U.recupera.email, codigo || '000000');
  await cambiarPinForzado(a, codigo || '000000', '730518');
  check('B2. código + cambio de PIN obligatorio → hub', await esperarHub(a));
  await a.page.waitForTimeout(6000);
  check('B3. Salir', await salir(a));
  await a.page.waitForTimeout(1500);

  // ── C. ADMIN (respaldo diario + alertas del lunes) → Permisos → Resetear PIN → Salir ──
  fase = 'admin';
  const b = await nuevaPestana('admin');
  await ingresar(b, U.admin.email, U.admin.pin);
  check('C1. login del ADMIN entra al hub', await esperarHub(b));
  check('C2. el navegador cree que hoy es lunes', (await b.page.evaluate(() => new Date().getDay())) === 1);
  await b.page.waitForTimeout(8000); // respaldo diario (+5 s) y alertas
  await cerrarAvisos(b);
  check('C3. respaldo diario: lectura masiva fue al proxy LOCAL', pedidasSupa.some((x) => x.fase === 'admin' && x.metodo === 'GET' && /select=id,value,updated_at/.test(x.ruta)));
  const correosAdmin = correosHttp.filter((x) => x.fase === 'admin');
  // El padrón se completa con WORKERS_BASE por nombre: "Pablo Duran" recibe su correo REAL. El servidor debe rechazarlo.
  check('C4. alertas del lunes: llegaron al servidor y la dirección real del responsable fue rechazada (403)',
    correosAdmin.some((x) => /pduran@grupomediterra\.cl/i.test(String(x.to)) && x.status === 403), correosAdmin.map((x) => `${x.status}:${x.motivo || 'ok'}`).join(' '));
  check('C5. correos a direcciones reales (resumen semanal y respaldo) → 403 del servidor, nada enviado',
    correosAdmin.filter((x) => /grupomediterra\.cl/i.test(String(x.to))).length >= 2 &&
    correosAdmin.filter((x) => /grupomediterra\.cl/i.test(String(x.to))).every((x) => x.status === 403) &&
    !correosEnviados.some((m) => /grupomediterra\.cl/i.test(m.to)));
  await b.page.getByRole('button', { name: /Permisos/ }).first().click();
  await b.page.waitForTimeout(1200);
  const nDlg = b.dialogos.length;
  const fila = b.page.locator('div').filter({ hasText: U.reseteo.nombre }).filter({ has: b.page.getByRole('button', { name: /Resetear PIN/ }) }).last();
  await fila.getByRole('button', { name: /Resetear PIN/ }).first().click();
  await b.page.waitForTimeout(3000);
  const alerta = b.dialogos.slice(nDlg).find((d) => /Código provisorio para/.test(d)) || '';
  const codAdmin = (/([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/.exec(alerta) || [])[1];
  check('C6. Permisos → Resetear PIN: código en pantalla y por correo permitido', !!codAdmin && codigoPara(U.reseteo.email) === codAdmin);
  await b.page.waitForTimeout(5500);
  check('C7. Salir del admin', await salir(b));
  await b.page.waitForTimeout(6000);

  // ── D. Verificaciones del recorrido (antes del control positivo) ──
  fase = 'verificacion';
  const malos = prohibidos((f) => f !== 'control');
  check('D1. CERO peticiones HTTP/WebSocket a destinos no autorizados en todo el recorrido', malos.length === 0,
    [...new Set(malos.map((r) => `${r.fase} ${r.tipo} ${r.url.slice(0, 100)}`))].slice(0, 8).join(' | '));
  const ws = registro.filter((r) => r.tipo === 'websocket' && r.fase !== 'control');
  check('D2. sin WebSocket en modo servidor', ws.length === 0, ws.map((r) => r.url).join(' '));
  const regs = [];
  for (const p of contextos) regs.push(...await p.page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope) : [])).catch(() => []));
  check('D3. sin service workers', regs.length === 0 && !registro.some((r) => r.tipo === 'serviceworker'), regs.join(' '));
  const malEnviados = correosEnviados.filter((m) => !correoAutorizado(m.to));
  check('D4. todo correo enviado fue a una dirección autorizada', correosEnviados.length >= 2 && malEnviados.length === 0,
    `enviados=${correosEnviados.length} fuera=${malEnviados.map((m) => m.to).join(',')}`);
  const srvMal = salidasServidor.filter((x) => !x.ok);
  check('D5. el servidor solo salió al Supabase local', salidasServidor.length > 0 && srvMal.length === 0, srvMal.map((x) => x.host).join(' '));
  check('D6. el navegador NO pidió nada a api.emailjs.com ni a producción',
    !registro.some((r) => /emailjs\.com|bywovqayuzodbzwsriet|gestion-grupo-mediterra\.vercel\.app/.test(r.url)));
  const terceros = [...new Set(registro.filter((r) => r.clase === 'tercero-declarado').map((r) => new URL(r.url).hostname))];
  console.log(`   (informativo) terceros declarados respondidos localmente sin salir: ${terceros.join(', ') || 'ninguno'}`);
  const errs = contextos.flatMap((x) => x.errores.map((e) => `${x.nombre}: ${e}`));
  check('D7. sin errores de JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));
  const audit = filaDb('audit_log');
  const nAudit = audit && (audit.eventos || (typeof audit === 'string' ? (JSON.parse(audit).eventos || []) : [])).length;
  check('D8. audit_log vive en la base local (eventos del recorrido)', nAudit > 0, `eventos=${nAudit}`);

  // ── E. CONTROL POSITIVO: el detector debe ver lo prohibido ──
  fase = 'control';
  const c = await nuevaPestana('control');
  await c.page.goto(APP, { waitUntil: 'domcontentloaded' });
  await formLogin(c).waitFor({ timeout: 20000 });
  const resCtl = await c.page.evaluate(async () => {
    const out = {};
    try { await fetch('https://control-prohibido.invalid/rest/v1/calendario_data?id=eq.audit_log'); out.fetch = 'salió'; } catch (e) { out.fetch = 'bloqueado'; }
    try { navigator.sendBeacon('https://beacon-prohibido.invalid/b', 'x'); } catch (e) {}
    const img = new Image(); img.src = 'https://img-prohibido.invalid/p.png';
    out.ws = await new Promise((ok) => { try { const w = new WebSocket('wss://ws-prohibido.invalid/realtime'); w.onclose = () => ok('cerrado'); w.onerror = () => ok('error'); setTimeout(() => ok('timeout'), 4000); } catch (e) { ok('excepcion'); } });
    const r = await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: 'alguien@no-autorizado.invalid', subject: 'control', message: 'control' }) });
    out.correo = r.status;
    return out;
  });
  await c.page.waitForTimeout(1500);
  const ctl = registro.filter((r) => r.fase === 'control' && r.clase === 'prohibido');
  check('E1. control: fetch prohibido detectado y bloqueado', resCtl.fetch === 'bloqueado' && ctl.some((r) => r.url.includes('control-prohibido.invalid')));
  check('E2. control: beacon e imagen prohibidos detectados', ctl.some((r) => r.url.includes('beacon-prohibido.invalid')) && ctl.some((r) => r.url.includes('img-prohibido.invalid')));
  check('E3. control: WebSocket prohibido detectado y cerrado', ctl.some((r) => r.tipo === 'websocket' && r.url.includes('ws-prohibido.invalid')), `ws=${resCtl.ws}`);
  check('E4. control: correo a dirección no permitida → 403, nada enviado, log [destino-no-autorizado]',
    resCtl.correo === 403 && !correosEnviados.some((m) => m.fase === 'control') && avisosDestino.some((x) => x.fase === 'control'));
  check('E5. control: el verificador de correos marca una dirección no permitida', !correoAutorizado('ahuerta@grupomediterra.cl') && correoAutorizado(U.admin.email));
  await globalThis.fetch('http://srv-prohibido.invalid/').catch(() => {});
  check('E6. control: salida del servidor a un host no local detectada y bloqueada', salidasServidor.some((x) => x.fase === 'control' && !x.ok && x.host === 'srv-prohibido.invalid'));

  fs.writeFileSync(path.join(OUT, 'aislamiento-registro.json'), JSON.stringify({ registro, pedidasSupa, correosHttp,
    correosEnviados: correosEnviados.map(({ text, ...m }) => m), avisosDestino, salidasServidor }, null, 1));
  const porClase = registro.reduce((o, r) => { o[r.clase] = (o[r.clase] || 0) + 1; return o; }, {});
  console.log(`   registro: ${registro.length} eventos ${JSON.stringify(porClase)} · proxy local ${pedidasSupa.length} · correos enviados ${correosEnviados.length} · rechazados ${correosHttp.filter((x) => x.status === 403).length + avisosDestino.length}`);
} catch (e) {
  check('excepción inesperada', false, String(e && e.stack || e).slice(0, 500));
} finally {
  console.warn = warnReal;
  await browser.close().catch(() => {});
  await new Promise((r) => { proxy.closeAllConnections && proxy.closeAllConnections(); proxy.close(() => r()); });
  globalThis.fetch = fetchReal;
  await E.cerrar();
}
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);

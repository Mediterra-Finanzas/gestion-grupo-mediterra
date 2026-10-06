/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — modo "autenticación en el servidor" (REACT_APP_AUTH_SERVER)
   SOLO DATOS DE PRUEBA. Producción no se lee ni se escribe.

   Usa el entorno local del agente servidor (scripts/seguridad-main-pins/entorno.mjs):
   sirve el build estático + /api/* con los handlers reales, PostgREST local y
   captura de correos. Las llamadas del navegador a *.supabase.co se enrutan al
   PostgREST local con la llave anon local. Producción (vercel.app), EmailJS y el
   WebSocket de Supabase quedan bloqueados.

   Casos (build con el interruptor PRENDIDO):
     1  login OK (cookie HttpOnly) y la sesión sobrevive a una recarga
     2  sessionStorage.mediterra_usuario falsificado SIN cookie → no entra
     3  cambio de PIN obligatorio (hash antiguo sin sello pol) → solo entra al terminar
     4  "¿Olvidaste tu PIN?" → mensaje neutro, código del correo capturado, entra
     5  admin resetea el PIN de otra persona (código en pantalla y por correo)
     6  un no-admin no llega a las operaciones de admin (UI ni API)
     7  cambiar un estado de Tareas guarda por PATCH /api/datos/main (sin usuarios)
     8  registro de red: el navegador NUNCA pidió calendario_data pins/usuarios/main
     9  logout borra la sesión (recarga → login; /api/auth/sesion → 401)
   Regresión (build con el interruptor APAGADO): el login de hoy sigue funcionando.

     # builds
     CI=true npm run build                                            # → build/ (apagado)
     REACT_APP_AUTH_SERVER=true CI=true BUILD_PATH=/tmp/build-auth npm run build
     # prueba
     BUILD_AUTH=/tmp/build-auth BUILD_OFF=build OUT_DIR=/tmp/sas node scripts/e2e/seguridad-auth-servidor.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { levantarEntorno } from '../seguridad-main-pins/entorno.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD_AUTH = path.resolve(process.env.BUILD_AUTH || '/tmp/build-auth');
const BUILD_OFF = path.resolve(process.env.BUILD_OFF || path.join(RAIZ, 'build'));
const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── credenciales de prueba (mismo formato PBKDF2 que src/pinHash.js) ─────
function cred(pin, extra = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
  return JSON.stringify({ v: 1, iter: 100000, salt: salt.toString('hex'), hash, ...extra });
}
const HOY = new Date().toISOString().slice(0, 10);
const nuevo = (pin) => cred(pin, { pol: '6dig', fecha: HOY });

const U = {
  angelo:   { nombre: 'Angelo Huerta',   email: 'ahuerta@grupomediterra.cl',  pin: '482913' },
  carol:    { nombre: 'Carol Machuca',   email: 'cmachuca@grupomediterra.cl', pin: '739154' },
  pablo:    { nombre: 'Pablo Duran',     email: 'pduran@grupomediterra.cl',   pin: '4821' },   // hash viejo sin pol
  michelle: { nombre: 'Michelle Garcia', email: 'mgarcia@grupomediterra.cl',  pin: '615283' },
  milagros: { nombre: 'Milagros Becerra', email: 'Mbecerra@grupomediterra.cl', pin: '927461' },
};
const usuarios = [
  { nombre: 'Milagros Becerra', cargo: 'Sec. Administrativa', email: 'Mbecerra@grupomediterra.cl', rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Carol Machuca', cargo: 'Analista Finanzas', email: 'cmachuca@grupomediterra.cl', rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Michelle Garcia', cargo: 'Contadora General', email: 'mgarcia@grupomediterra.cl', rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Pablo Duran', cargo: 'Asistente Contable', email: 'pduran@grupomediterra.cl', rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Angelo Huerta', cargo: 'Gerencia Adm. y Finanzas', email: 'ahuerta@grupomediterra.cl', rol: 'admin', modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'], esCFO: true },
  { nombre: 'Nicolás Fuenzalida', cargo: 'Gerente Técnico', email: 'nfuenzalida@osirisplant.com', rol: 'gerente_tecnico', modulos: ['osiris'], esCFO: false },
];
function sembrado() {
  return {
    usuarios,
    pins: {
      'Angelo Huerta_h': nuevo(U.angelo.pin),
      'Carol Machuca_h': nuevo(U.carol.pin),
      'Pablo Duran_h': cred(U.pablo.pin),           // SIN sello pol → cambio obligatorio
      'Michelle Garcia_h': nuevo(U.michelle.pin),
      'Milagros Becerra_h': nuevo(U.milagros.pin),
    },
    main: { estados: {}, comentarios: {}, recsDone: {}, recsComentarios: {}, usuarios, mes: new Date().getMonth(), anio: new Date().getFullYear(),
      pinsPersonalizados: { 'Legacy_h': 'no-debe-salir' } },
    admins: [U.angelo.email],
  };
}

// ── navegador con registro de red ────────────────────────────────────────
const SUPA = 'bywovqayuzodbzwsriet.supabase.co';
const FILAS_PROTEGIDAS = ['pins', 'usuarios', 'main'];
function idsPedidos(u, body, metodo) {
  const ids = [];
  for (const m of u.search.matchAll(/id=eq\.([^&]+)/g)) ids.push(decodeURIComponent(m[1]));
  for (const m of u.search.matchAll(/id=in\.\(([^)]*)\)/g)) ids.push(...decodeURIComponent(m[1]).split(','));
  const filas = Array.isArray(body) ? body : body ? [body] : [];
  for (const f of filas) if (f && f.id) ids.push(String(f.id));
  // Lectura masiva sin excluir las filas protegidas = también las pide.
  if (metodo === 'GET' && u.pathname === '/rest/v1/calendario_data' && !/id=eq\./.test(u.search) && !/id=not\.in\.\([^)]*pins[^)]*usuarios[^)]*main/.test(decodeURIComponent(u.search))) ids.push('(lectura masiva sin excluir pins/usuarios/main)');
  return ids;
}

async function abrir(env, nombre, { registro, initScript } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route(`**${SUPA}/**`, async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const r = { pestaña: nombre, metodo: m, ruta: u.pathname, search: u.search, ids: idsPedidos(u, body, m) };
    registro && registro.push(r);
    if (!u.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' });
    const headers = { ...req.headers(), apikey: env.anon, authorization: `Bearer ${env.anon}` };
    try {
      const resp = await route.fetch({ url: env.pgrst + u.pathname.replace(/^\/rest\/v1/, '') + u.search, headers });
      r.status = resp.status();
      return route.fulfill({ status: resp.status(), headers: { ...resp.headers(), ...cors }, body: await resp.body() });
    } catch (e) { r.status = 'error'; return route.abort('failed'); }
  });
  await ctx.route('**gestion-grupo-mediterra.vercel.app/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.route('**api.emailjs.com/**', (r) => { env._emailjs = (env._emailjs || 0) + 1; return r.fulfill({ status: 200, body: 'OK' }); });
  await ctx.addInitScript(() => {
    const WSReal = window.WebSocket;
    window.WebSocket = function (url, prot) {
      if (String(url).includes('supabase.co')) { window.__wsSupabase = (window.__wsSupabase || 0) + 1; return { readyState: 0, url: String(url), send() {}, close() { this.readyState = 3; }, addEventListener() {}, removeEventListener() {} }; }
      return prot !== undefined ? new WSReal(url, prot) : new WSReal(url);
    };
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { window.WebSocket[k] = i; });
  });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const dialogos = [], errores = [], api = [];
  page.on('pageerror', (e) => errores.push(String(e).slice(0, 200)));
  page.on('dialog', (d) => { dialogos.push(d.message()); (d.type() === 'prompt' ? d.accept('RESTAURAR') : d.accept()).catch(() => {}); });
  const pedidas = [];
  page.on('request', (req) => { const u = new URL(req.url()); if (u.pathname.startsWith('/api/')) pedidas.push({ metodo: req.method(), ruta: u.pathname }); });
  page.on('response', async (resp) => {
    const u = new URL(resp.url());
    if (u.pathname.startsWith('/api/')) {
      const req = resp.request();
      api.push({ metodo: req.method(), ruta: u.pathname, status: resp.status(), body: req.postData() || '' });
    }
  });
  return { browser, ctx, page, dialogos, errores, api, pedidas, nombre };
}

const formLogin = (p) => p.page.locator('#login-pin-input');
const enHub = (p) => p.page.getByRole('button', { name: 'Salir' }).first();
async function cerrarAvisos(p) {
  for (const t of ['Entendido', 'Aceptar', 'Cerrar']) {
    const b = p.page.getByRole('button', { name: t });
    if (await b.count()) { await b.first().click().catch(() => {}); await p.page.waitForTimeout(200); }
  }
}
async function ingresar(p, env, email, pin) {
  await p.page.goto(env.url, { waitUntil: 'domcontentloaded' });
  await formLogin(p).waitFor({ timeout: 20000 });
  await p.page.locator('input[type=email]').first().fill(email);
  await formLogin(p).fill(pin);
  await p.page.getByRole('button', { name: 'Ingresar' }).click();
}
async function esperarHub(p, ms = 15000) {
  try { await enHub(p).waitFor({ timeout: ms }); await p.page.waitForTimeout(800); await cerrarAvisos(p); return true; } catch (e) { return false; }
}
async function cambiarPinForzado(p, actual, nuevoPin) {
  await p.page.getByText('Actualizar acceso').waitFor({ timeout: 15000 });
  const campos = p.page.locator('input[autocomplete="new-password"]');
  await campos.nth(0).fill(actual);
  await campos.nth(1).fill(nuevoPin);
  await campos.nth(2).fill(nuevoPin);
  await p.page.getByRole('button', { name: 'Guardar' }).click();
}
const fetchEn = (p, ruta, init = {}) => p.page.evaluate(async ([ruta, init]) => {
  const r = await fetch(ruta, { credentials: 'same-origin', ...init });
  let j = null; try { j = await r.json(); } catch (e) {}
  return { status: r.status, body: j };
}, [ruta, init]);
const filaDb = (env, id) => {
  const s = env.psql(`select case when jsonb_typeof(value)='string' then value #>> '{}' else value::text end from calendario_data where id='${id}'`);
  try { return JSON.parse(s.trim()); } catch (e) { return null; }
};
const ultimoCodigo = (env, email) => {
  const c = [...env.correos].reverse().find((m) => String(m.to || '').toLowerCase() === email.toLowerCase());
  const m = c && /([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/.exec(String(c.message || c.text || c.body || ''));
  return m ? m[1] : null;
};

// ══════════════════════════ MODO SERVIDOR ══════════════════════════════
const registro = [];
const abiertos = [];
const env = await levantarEntorno({ build: BUILD_AUTH, sembrar: sembrado() });
console.log(`entorno: ${env.url} · PostgREST ${env.pgrst} · build ${BUILD_AUTH}`);
try {
  // 1 — login OK + recarga
  const a = await abrir(env, 'angelo', { registro }); abiertos.push(a);
  await ingresar(a, env, U.angelo.email, U.angelo.pin);
  check('1a. login de Angelo (admin) entra al hub', await esperarHub(a));
  const cookies = await a.ctx.cookies();
  const ses = cookies.find((c) => c.name === 'mediterra_sess');
  check('1b. cookie de sesión HttpOnly emitida', !!ses && ses.httpOnly, ses ? `httpOnly=${ses.httpOnly} sameSite=${ses.sameSite}` : 'sin cookie');
  check('1c. el login fue por POST /api/auth/login', a.api.some((x) => x.ruta === '/api/auth/login' && x.status === 200));
  await a.page.reload({ waitUntil: 'domcontentloaded' });
  check('1d. recarga: la sesión se mantiene por cookie (GET /api/auth/sesion)', await esperarHub(a) && a.api.some((x) => x.ruta === '/api/auth/sesion' && x.status === 200));
  check('1e. sin WebSocket de Supabase en modo servidor (App)', (await a.page.evaluate(() => window.__wsSupabase || 0)) === 0);

  // 7 — Tareas: cambiar un estado guarda por PATCH /api/datos/main
  const antes = a.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main').length;
  await a.page.getByText('Seguimiento Tareas').first().click();
  await a.page.waitForTimeout(2500); await cerrarAvisos(a);
  const vMainAntes = env.psql(`select updated_at from calendario_data where id='main'`);
  const clic = await a.page.evaluate(() => {
    const bs = [...document.querySelectorAll('button')].filter((b) => b.style.borderRadius === '50%' && b.style.cursor === 'pointer' && !b.textContent.trim());
    if (bs[0]) { bs[0].click(); return bs.length; }
    return 0;
  });
  await a.page.waitForTimeout(4500);
  const patches = a.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main');
  const ult = patches[patches.length - 1];
  let cuerpo = null; try { cuerpo = JSON.parse(ult.body); } catch (e) {}
  check('7a. se hizo clic en un semáforo y se guardó por PATCH /api/datos/main', clic > 0 && patches.length > antes && ult.status === 200, `semáforos=${clic} patches=${patches.length - antes} status=${ult && ult.status}`);
  check('7b. el PATCH lleva versión y solo claves de Tareas (sin usuarios ni pins)', !!cuerpo && typeof cuerpo.version === 'string' && cuerpo.patch &&
    !('usuarios' in cuerpo.patch) && !('pinsPersonalizados' in cuerpo.patch), cuerpo ? Object.keys(cuerpo.patch || {}).join(',') : '');
  const main = filaDb(env, 'main');
  const marcado = main && Object.values(main.estados || {}).some((e) => e && e.estadoResp && e.estadoResp !== 'gris');
  check('7c. la base guardó el estado y conserva el espejo usuarios', !!marcado && Array.isArray(main.usuarios) && main.usuarios.length === usuarios.length);
  check('7d. updated_at de main cambió', env.psql(`select updated_at from calendario_data where id='main'`) !== vMainAntes);
  // Volver al hub: la app restaura el módulo guardado en sessionStorage al recargar.
  await a.page.evaluate(() => sessionStorage.removeItem('mediterra_modulo'));
  await a.page.goto(env.url, { waitUntil: 'domcontentloaded' }); await esperarHub(a);

  // 5 — admin resetea el PIN de Milagros
  await a.page.getByRole('button', { name: /Permisos/ }).first().click();
  await a.page.waitForTimeout(1200);
  const nDialogos = a.dialogos.length;
  const fila = a.page.locator('div').filter({ hasText: U.milagros.nombre }).filter({ has: a.page.getByRole('button', { name: /Resetear PIN/ }) }).last();
  await fila.getByRole('button', { name: /Resetear PIN/ }).first().click();
  await a.page.waitForTimeout(2500);
  const alerta = a.dialogos.slice(nDialogos).find((d) => /Código provisorio para/.test(d)) || '';
  const codigoAdmin = (/([0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})/.exec(alerta) || [])[1];
  check('5a. admin-reset-pin devuelve el código en pantalla', !!codigoAdmin && a.api.some((x) => x.ruta === '/api/auth/admin-reset-pin' && x.status === 200));
  check('5b. el servidor envió el código por correo', ultimoCodigo(env, U.milagros.email) === codigoAdmin);
  const mi = await abrir(env, 'milagros', { registro }); abiertos.push(mi);
  await ingresar(mi, env, U.milagros.email, U.milagros.pin);
  await mi.page.waitForTimeout(2500);
  check('5c. el PIN anterior de Milagros quedó inhabilitado', !(await enHub(mi).count()) && (await formLogin(mi).count()) > 0);
  await ingresar(mi, env, U.milagros.email, codigoAdmin);
  await cambiarPinForzado(mi, codigoAdmin, '846291');
  check('5d. con el código + PIN nuevo entra al hub', await esperarHub(mi));
  await mi.browser.close();

  // 6 — no-admin
  const c = await abrir(env, 'carol', { registro }); abiertos.push(c);
  await ingresar(c, env, U.carol.email, U.carol.pin);
  check('6a. Carol (editor) entra', await esperarHub(c));
  check('6b. Carol no ve el botón Permisos', (await c.page.getByRole('button', { name: /Permisos/ }).count()) === 0);
  const r1 = await fetchEn(c, '/api/auth/admin-reset-pin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: U.angelo.nombre }) });
  const r2 = await fetchEn(c, '/api/datos/usuarios', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valor: usuarios.map((x) => ({ ...x, rol: 'admin' })), version: null }) });
  check('6c. admin-reset-pin desde un no-admin → 403', r1.status === 403, `status ${r1.status}`);
  check('6d. PUT /api/datos/usuarios desde un no-admin → 403', r2.status === 403, `status ${r2.status}`);
  await c.browser.close();

  // 2 — sessionStorage falsificado sin cookie
  const f = await abrir(env, 'falsificado', { registro, initScript: () => { try { sessionStorage.setItem('mediterra_usuario', 'Angelo Huerta'); sessionStorage.setItem('mediterra_modulo', 'finanzas'); } catch (e) {} } });
  abiertos.push(f);
  await f.page.goto(env.url, { waitUntil: 'domcontentloaded' });
  await f.page.waitForTimeout(5000);
  check('2a. sessionStorage falsificado SIN cookie no entra (queda en login)', (await formLogin(f).count()) > 0 && (await enHub(f).count()) === 0);
  check('2b. no se pidió /api/datos/* sin sesión', !f.api.some((x) => x.ruta.startsWith('/api/datos/') && x.status === 200));
  await f.browser.close();

  // 3 — cambio de PIN obligatorio (hash antiguo sin pol)
  const p = await abrir(env, 'pablo', { registro }); abiertos.push(p);
  await ingresar(p, env, U.pablo.email, U.pablo.pin);
  await p.page.getByText('Actualizar acceso').waitFor({ timeout: 15000 }).catch(() => {});
  check('3a. Pablo (hash sin sello) ve el cambio de PIN obligatorio', (await p.page.getByText('Actualizar acceso').count()) > 0 && (await enHub(p).count()) === 0);
  const r3 = await fetchEn(p, '/api/datos/main');
  check('3b. con la sesión de cambio de PIN los datos están vedados (403)', r3.status === 403, `status ${r3.status}`);
  await cambiarPinForzado(p, U.pablo.pin, '583920');
  check('3c. al terminar el cambio entra al hub', await esperarHub(p));
  const pinsDb = filaDb(env, 'pins') || {};
  let credPablo = null; try { credPablo = JSON.parse(pinsDb['Pablo Duran_h']); } catch (e) {}
  check('3d. la base tiene el hash nuevo con sello pol=6dig', !!credPablo && credPablo.pol === '6dig');
  await p.browser.close();

  // 4 — recuperar PIN
  const m = await abrir(env, 'michelle', { registro }); abiertos.push(m);
  await m.page.goto(env.url, { waitUntil: 'domcontentloaded' });
  await formLogin(m).waitFor({ timeout: 20000 });
  await m.page.getByRole('button', { name: '¿Olvidaste tu PIN?' }).click();
  const correosAntes = env.correos.length;
  await m.page.locator('input[placeholder="tu.nombre@grupomediterra.cl"]').last().fill('nadie@grupomediterra.cl');
  await m.page.getByRole('button', { name: /Enviar PIN temporal/ }).click();
  // recuperar responde en ≥ 3 s (piso anti-enumeración): esperar el mensaje, no un tiempo fijo.
  await m.page.getByText(/Si los datos corresponden a una cuenta/).first().waitFor({ timeout: 15000 }).catch(() => {});
  const neutro1 = await m.page.getByText(/Si los datos corresponden a una cuenta/).count();
  check('4a. correo inexistente → mensaje neutro y sin correo', neutro1 > 0 && env.correos.length === correosAntes);
  await m.page.locator('input[placeholder="tu.nombre@grupomediterra.cl"]').last().fill(U.michelle.email);
  await m.page.getByRole('button', { name: /Enviar PIN temporal/ }).click();
  for (let i = 0; i < 30 && !ultimoCodigo(env, U.michelle.email); i++) await m.page.waitForTimeout(500);
  const codigo = ultimoCodigo(env, U.michelle.email);
  check('4b. correo existente → mismo mensaje neutro y código enviado por correo', !!codigo && (await m.page.getByText(/Si los datos corresponden a una cuenta/).count()) > 0);
  await ingresar(m, env, U.michelle.email, codigo || '000000');
  await cambiarPinForzado(m, codigo || '000000', '730518');
  check('4c. con el código del correo + PIN nuevo entra al hub', await esperarHub(m));
  await m.browser.close();

  // 9 — logout (Angelo)
  await a.page.evaluate(() => sessionStorage.removeItem('mediterra_modulo'));
  await a.page.goto(env.url, { waitUntil: 'domcontentloaded' }); await esperarHub(a);
  // Salir borra la cookie y RECARGA la página: esperar la recarga antes de contar el formulario.
  const recarga = a.page.waitForEvent('load', { timeout: 15000 }).catch(() => {});
  await enHub(a).click();
  await recarga;
  await formLogin(a).waitFor({ timeout: 15000 }).catch(() => {});
  check('9a. Salir vuelve al login (POST /api/auth/logout)', (await formLogin(a).count()) > 0 && a.pedidas.some((x) => x.ruta === '/api/auth/logout'));
  await a.page.reload({ waitUntil: 'domcontentloaded' }); await a.page.waitForTimeout(3000);
  check('9b. tras recargar sigue en login', (await formLogin(a).count()) > 0 && (await enHub(a).count()) === 0);
  const r9 = await fetchEn(a, '/api/auth/sesion');
  check('9c. /api/auth/sesion → 401 después del logout', r9.status === 401, `status ${r9.status}`);
  await a.browser.close();

  // 8 — registro de red
  const prohibidas = registro.filter((r) => r.ids.some((id) => FILAS_PROTEGIDAS.includes(id) || id.startsWith('(lectura masiva')));
  check('8. el navegador no pidió calendario_data pins/usuarios/main directo', prohibidas.length === 0,
    prohibidas.slice(0, 5).map((r) => `${r.pestaña} ${r.metodo} ${r.search} [${r.ids.join(',')}]`).join(' | '));
  check('8c. el registro de red no está vacío (la prueba observa al navegador)', registro.length > 0, `${registro.length} peticiones a Supabase`);
  const errs = abiertos.flatMap((x) => x.errores.map((e) => `${x.nombre}: ${e}`));
  check('8b. sin errores de JavaScript en las páginas', errs.length === 0, errs.slice(0, 3).join(' | '));
  fs.writeFileSync(path.join(OUT, 'registro-red-auth.json'), JSON.stringify(registro, null, 1));
} catch (e) {
  check('modo servidor: excepción inesperada', false, String(e && e.stack || e).slice(0, 400));
} finally {
  for (const x of abiertos) await x.browser.close().catch(() => {});
  await env.cerrar();
}

// ══════════════════════ REGRESIÓN: INTERRUPTOR APAGADO ═════════════════════
const envOff = await levantarEntorno({ build: BUILD_OFF, sembrar: sembrado() });
try {
  const regOff = [];
  const o = await abrir(envOff, 'apagado', { registro: regOff });
  await ingresar(o, envOff, U.angelo.email, U.angelo.pin);
  check('R1. interruptor APAGADO: el login de hoy entra al hub', await esperarHub(o));
  check('R2. interruptor APAGADO: no llama a /api/auth/*', !o.api.some((x) => x.ruta.startsWith('/api/auth/')));
  check('R3. interruptor APAGADO: lee pins por la llave pública como antes', regOff.some((r) => r.ids.includes('pins')));
  await o.browser.close();
} catch (e) {
  check('regresión: excepción inesperada', false, String(e && e.stack || e).slice(0, 400));
} finally { await envOff.cerrar(); }

console.log(fallos ? `\n${fallos} FALLA(S)` : '\nTODO OK');
process.exit(fallos ? 1 : 0);

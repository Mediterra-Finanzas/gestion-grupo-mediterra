/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — conflicto de `main` (Tareas) en MODO SERVIDOR
   (REACT_APP_AUTH_SERVER=true). SOLO DATOS SINTÉTICOS. Producción no se toca.

   Usa el entorno local de scripts/seguridad-main-pins/entorno.mjs (Postgres +
   PostgREST locales, handlers reales de /api/*, correos capturados). Las
   llamadas del navegador a *.supabase.co se enrutan al PostgREST local; TODO
   otro host externo se BLOQUEA y se registra (nada sale de la máquina). Los
   WebSocket se interceptan con routeWebSocket: nunca se conectan a un servidor,
   pero se registra su URL y lo que la página envía (p. ej. phx_join).

   Casos:
     a  dos sesiones cambian el MISMO semáforo: la segunda no pisa a la primera,
        conserva su cambio local, aparece el panel y el estado no dice "Guardado"
     b  "Recuperar la versión del servidor" aplica el valor del servidor
     c  "Conservar mi versión" escribe lo local sobre la versión vigente; si la otra
        sesión guarda OTRA VEZ en el medio (entre la relectura y el PATCH), queda
        bloqueada de nuevo; al repetir sin interferencia, se escribe
     d  campos distintos en las dos sesiones: se fusionan sin panel
     e  usuario al que se le retira el permiso tareas/config: al editar la
        configuración recibe aviso y lo que no es configuración SÍ se guarda
     f  en todo el recorrido: cero peticiones con la llave pública a
        calendario_data pins/usuarios/main (incl. filtros in./not.in. y lecturas
        masivas) y ningún WebSocket que reciba esas filas
     R  "📤 Restaurar" con un respaldo SINTÉTICO → "RESTAURACIÓN PARCIAL" con
        pins/usuarios/main como no restauradas; la base no cambia esas filas
     X  auditoría de red: Tareas, Finanzas (Créditos, Nóminas), 💾 Respaldo

     REACT_APP_AUTH_SERVER=true CI=true BUILD_PATH=/tmp/build-auth npm run build
     POSTGREST_BIN=/ruta/postgrest BUILD_AUTH=/tmp/build-auth OUT_DIR=/tmp/scm \
       node scripts/e2e/seguridad-conflicto-main.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { levantarEntorno } from '../seguridad-main-pins/entorno.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(RAIZ, 'node_modules/playwright'));
const BUILD_AUTH = path.resolve(process.env.BUILD_AUTH || '/tmp/build-auth');
const OUT = process.env.OUT_DIR || '.';
const CHROMIUM = process.env.CHROMIUM_BIN || '/opt/pw-browsers/chromium';
fs.mkdirSync(OUT, { recursive: true });

let fallos = 0;
const resultados = [];
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); resultados.push({ n, ok: !!c, x }); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── credenciales de prueba (mismo formato PBKDF2 que src/pinHash.js) ─────
function cred(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 100000, 32, 'sha256').toString('hex');
  return JSON.stringify({ v: 1, iter: 100000, salt: salt.toString('hex'), hash, pol: '6dig', fecha: new Date().toISOString().slice(0, 10) });
}
const U = {
  angelo:   { nombre: 'Angelo Huerta',   email: 'ahuerta@grupomediterra.cl',  pin: '482913' },
  carol:    { nombre: 'Carol Machuca',   email: 'cmachuca@grupomediterra.cl', pin: '739154' },
  michelle: { nombre: 'Michelle Garcia', email: 'mgarcia@grupomediterra.cl',  pin: '615283' },
  pablo:    { nombre: 'Pablo Duran',     email: 'pduran@grupomediterra.cl',   pin: '583920' },
  milagros: { nombre: 'Milagros Becerra', email: 'Mbecerra@grupomediterra.cl', pin: '927461' },
};
const usuarios = [
  { nombre: 'Milagros Becerra', cargo: 'Sec. Administrativa', email: U.milagros.email, rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Carol Machuca', cargo: 'Analista Finanzas', email: U.carol.email, rol: 'editor', modulos: ['tareas'], esCFO: false,
    tab_permisos: { tareas: { config: 'editar' } } },
  { nombre: 'Michelle Garcia', cargo: 'Contadora General', email: U.michelle.email, rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Pablo Duran', cargo: 'Asistente Contable', email: U.pablo.email, rol: 'editor', modulos: ['tareas'], esCFO: false },
  { nombre: 'Angelo Huerta', cargo: 'Gerencia Adm. y Finanzas', email: U.angelo.email, rol: 'admin', modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'], esCFO: true },
  { nombre: 'Nicolás Fuenzalida', cargo: 'Gerente Técnico', email: 'nfuenzalida@osirisplant.com', rol: 'gerente_tecnico', modulos: ['osiris'], esCFO: false },
];
const sembrar = {
  usuarios,
  pins: Object.fromEntries(Object.values(U).map((u) => [`${u.nombre}_h`, cred(u.pin)])),
  main: { estados: {}, comentarios: {}, recsDone: {}, recsComentarios: {}, usuarios, mes: new Date().getMonth(), anio: new Date().getFullYear(),
    pinsPersonalizados: { 'Legacy_h': 'no-debe-salir' } },
  admins: [U.angelo.email],
};

// ── registro de red ──────────────────────────────────────────────────────
const SUPA = 'bywovqayuzodbzwsriet.supabase.co';
const FILAS_PROTEGIDAS = ['pins', 'usuarios', 'main'];
const registro = [];      // peticiones a Supabase (llave pública)
const externas = [];      // cualquier otro host no local (bloqueado)
const sockets = [];       // WebSocket abiertos por la página
const fase = { actual: 'inicio' };

// ¿Qué filas toca una petición a /rest/v1/calendario_data?
function idsPedidos(u, body, metodo) {
  const ids = [];
  const q = decodeURIComponent(u.search);
  for (const m of q.matchAll(/id=eq\.([^&]+)/g)) ids.push(m[1]);
  for (const m of q.matchAll(/id=in\.\(([^)]*)\)/g)) ids.push(...m[1].split(',').map((x) => x.replace(/"/g, '').trim()));
  for (const m of q.matchAll(/id=(?:like|ilike)\.([^&]+)/g)) {
    const re = new RegExp('^' + m[1].replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
    for (const f of FILAS_PROTEGIDAS) if (re.test(f)) ids.push(f);
  }
  const filas = Array.isArray(body) ? body : body ? [body] : [];
  for (const f of filas) if (f && f.id) ids.push(String(f.id));
  if (u.pathname === '/rest/v1/calendario_data' && !/id=(eq|in|like|ilike)\./.test(q)) {
    // Lectura/escritura/borrado masivo: incluye las protegidas salvo que un not.in las excluya TODAS.
    const ex = [...q.matchAll(/id=not\.in\.\(([^)]*)\)/g)].flatMap((m) => m[1].split(',').map((x) => x.replace(/"/g, '').trim()));
    const noExcluidas = FILAS_PROTEGIDAS.filter((f) => !ex.includes(f));
    if (noExcluidas.length && ['GET', 'PATCH', 'DELETE', 'HEAD'].includes(metodo)) ids.push(`(masiva: incluye ${noExcluidas.join('/')})`);
  }
  return ids;
}

async function abrir(env, nombre, { initScript } = {}) {
  const browser = await chromium.launch({ executablePath: CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const APP = new URL(env.url).host;
  const p = { browser, ctx, nombre, dialogos: [], errores: [], api: [], antesPatchMain: null };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (u.host === APP) {
      if (u.pathname === '/api/datos/main' && m === 'PATCH' && p.antesPatchMain) {
        const fn = p.antesPatchMain; p.antesPatchMain = null;
        try { await fn(); } catch (e) { console.log('   (gancho PATCH falló)', String(e).slice(0, 200)); }
      }
      return route.continue();
    }
    if (u.host === SUPA) {
      if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
      const r = { fase: fase.actual, pestaña: nombre, metodo: m, ruta: u.pathname, search: decodeURIComponent(u.search), ids: idsPedidos(u, body, m) };
      registro.push(r);
      if (!u.pathname.startsWith('/rest/v1/')) { r.status = 'bloqueada (no rest)'; return route.fulfill({ status: 404, headers: cors, body: '' }); }
      const headers = { ...req.headers(), apikey: env.anon, authorization: `Bearer ${env.anon}` };
      try {
        const resp = await route.fetch({ url: env.pgrst + u.pathname.replace(/^\/rest\/v1/, '') + u.search, headers });
        r.status = resp.status();
        return route.fulfill({ status: resp.status(), headers: { ...resp.headers(), ...cors }, body: await resp.body() });
      } catch (e) { r.status = 'error'; return route.abort('failed'); }
    }
    externas.push({ fase: fase.actual, pestaña: nombre, metodo: m, url: req.url().slice(0, 200) });
    return route.abort('blockedbyclient');
  });
  await ctx.routeWebSocket(/.*/, (ws) => {
    const s = { fase: fase.actual, pestaña: nombre, url: String(ws.url()).replace(/apikey=[^&]+/, 'apikey=…'), enviados: [] };
    sockets.push(s);
    ws.onMessage((msg) => { if (s.enviados.length < 20) s.enviados.push(String(msg).slice(0, 300)); });
    // Nunca se conecta al servidor real: el socket queda simulado y mudo.
  });
  await ctx.addInitScript(() => {
    window.__estadosGuardado = [];
    const RX = /^(💾 Guardando\.\.\.|✅ Guardado|❌ Error|⚠️ No se guardó.*)$/;
    setInterval(() => {
      try {
        const vistos = [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).filter((t) => RX.test(t));
        const t = vistos[0] || '(sin indicador)';
        const a = window.__estadosGuardado;
        if (!a.length || a[a.length - 1].t !== t) a.push({ t, ts: Date.now() });
      } catch (e) {}
    }, 100);
  });
  if (initScript) await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  p.page = page;
  page.on('pageerror', (e) => p.errores.push(String(e).slice(0, 200)));
  page.on('requestfailed', (req) => { const u = new URL(req.url()); if (u.pathname.startsWith('/api/')) p.api.push({ metodo: req.method(), ruta: u.pathname, status: 'falló:' + ((req.failure() || {}).errorText || ''), body: req.postData() || '', ts: Date.now() }); });
  page.on('dialog', (d) => { p.dialogos.push(d.message()); (d.type() === 'prompt' ? d.accept('RESTAURAR') : d.accept()).catch(() => {}); });
  page.on('response', async (resp) => {
    const u = new URL(resp.url());
    if (u.pathname.startsWith('/api/')) {
      const req = resp.request();
      p.api.push({ metodo: req.method(), ruta: u.pathname, status: resp.status(), body: req.postData() || '', ts: Date.now() });
    }
  });
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
async function ingresar(p, env, email, pin) {
  await p.page.goto(env.url, { waitUntil: 'domcontentloaded' });
  await formLogin(p).waitFor({ timeout: 20000 });
  await p.page.locator('input[type=email]').first().fill(email);
  await formLogin(p).fill(pin);
  await p.page.getByRole('button', { name: 'Ingresar' }).click();
}
async function esperarHub(p, ms = 20000) {
  try { await enHub(p).waitFor({ timeout: ms }); await p.page.waitForTimeout(800); await cerrarAvisos(p); return true; } catch (e) { return false; }
}
async function irAlHub(p, env) {
  await p.page.evaluate(() => sessionStorage.removeItem('mediterra_modulo'));
  await p.page.goto(env.url, { waitUntil: 'domcontentloaded' });
  return esperarHub(p);
}
async function abrirTareas(p) {
  await p.page.getByText('Seguimiento Tareas').first().click();
  await p.page.waitForTimeout(2500); await cerrarAvisos(p);
}
const filaDb = (env, id) => {
  const s = env.psql(`select case when jsonb_typeof(value)='string' then value #>> '{}' else value::text end from calendario_data where id='${id}'`);
  try { return JSON.parse(s.trim()); } catch (e) { return null; }
};
const versionDb = (env, id) => env.psql(`select updated_at from calendario_data where id='${id}'`);

// Semáforos del responsable: primer botón circular de cada fila de la tabla.
const SEL_CIRC = 'button[style*="border-radius: 50%"]';
const filasSem = (p) => p.page.evaluate((sel) => {
  const trs = [...document.querySelectorAll('tr')].filter((tr) => tr.querySelector(sel));
  return trs.map((tr, i) => { const b = tr.querySelector(sel); return { i, txt: tr.textContent.trim().slice(0, 50), clic: b.style.cursor === 'pointer', color: getComputedStyle(b).backgroundColor }; });
}, SEL_CIRC);
const clicFila = (p, i) => p.page.evaluate(([sel, i]) => {
  const trs = [...document.querySelectorAll('tr')].filter((tr) => tr.querySelector(sel));
  const b = trs[i] && trs[i].querySelector(sel); if (!b) return false; b.click(); return true;
}, [SEL_CIRC, i]);
const colorFila = async (p, i) => { const f = await filasSem(p); return f[i] ? f[i].color : null; };
// Busca una fila clicable cuyo color cambie al hacer clic (descarta dependencias pendientes).
async function filaQueCambia(p, excluir = []) {
  const fs0 = await filasSem(p);
  for (const f of fs0) {
    if (!f.clic || excluir.includes(f.i)) continue;
    const n = p.dialogos.length;
    await clicFila(p, f.i); await p.page.waitForTimeout(250);
    const c = await colorFila(p, f.i);
    if (c !== f.color && p.dialogos.length === n) return { i: f.i, antes: f.color, despues: c, txt: f.txt };
  }
  return null;
}
const nPatch = (p) => p.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main').length;
async function esperarPatch(p, desde, ms = 15000, status = null) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ps = p.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main').slice(desde);
    const hit = status == null ? ps[0] : ps.find((x) => x.status === status);
    if (hit) return hit;
    await espera(100);
  }
  return null;
}
const panel = (p) => p.page.getByRole('alertdialog', { name: 'Conflicto de guardado sin resolver' });
const estadosVistos = (p, desdeTs) => p.page.evaluate((d) => window.__estadosGuardado.filter((x) => x.ts >= d).map((x) => x.t), desdeTs);
const ahoraPagina = (p) => p.page.evaluate(() => Date.now());
const valorFilaDb = (env, clave) => { const m = filaDb(env, 'main'); return m && m.estados && m.estados[clave] ? m.estados[clave].estadoResp : undefined; };
// clave del estado cambiado en la base respecto de un valor anterior de main.estados
function clavesCambiadas(antes, despues) {
  const a = (antes && antes.estados) || {}, d = (despues && despues.estados) || {};
  return [...new Set([...Object.keys(a), ...Object.keys(d)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(d[k]));
}

const abiertos = [];
const env = await levantarEntorno({ build: BUILD_AUTH, sembrar });
console.log(`entorno: ${env.url} · PostgREST ${env.pgrst} · build ${BUILD_AUTH}`);
try {
  // ── Dos sesiones (el mismo administrador en dos navegadores) ──
  fase.actual = 'login';
  const A = await abrir(env, 'A'); abiertos.push(A);
  const B = await abrir(env, 'B'); abiertos.push(B);
  await ingresar(A, env, U.angelo.email, U.angelo.pin);
  check('0a. sesión A entra al hub', await esperarHub(A));
  await ingresar(B, env, U.angelo.email, U.angelo.pin);
  check('0b. sesión B entra al hub', await esperarHub(B));
  fase.actual = 'tareas';
  await abrirTareas(A); await abrirTareas(B);
  await A.page.waitForTimeout(3000); await B.page.waitForTimeout(3000);  // que se asienten los guardados iniciales
  // 0c — Abrir Tareas en dos sesiones casi a la vez, SIN que nadie edite nada. Las dos escriben las
  // mismas claves por defecto (estados de las semanas, tareasConfig…) con VALORES IGUALES. No debería
  // haber conflicto. (Si lo hay, se sale con "Recuperar" —B no tiene ediciones— para seguir.)
  const panel0 = (await panel(B).count()) + (await panel(A).count());
  check('0c. abrir Tareas en dos sesiones a la vez (sin editar) NO produce conflicto', panel0 === 0,
    panel0 ? `panel en ${(await panel(A).count()) ? 'A' : ''}${(await panel(B).count()) ? 'B' : ''}; PATCH de B: ${B.api.filter((x) => x.metodo === 'PATCH').map((x) => x.status).join(',')}` : '');
  for (const X of [A, B]) if (await panel(X).count()) { await panel(X).getByRole('button', { name: /Recuperar la versión del servidor/ }).click(); await X.page.waitForTimeout(2500); }
  await A.page.waitForTimeout(2500);

  // ══ (a) MISMO campo ══
  fase.actual = 'a-mismo-campo';
  let main0 = filaDb(env, 'main');
  let nA = nPatch(A), nB = nPatch(B);
  const fa = await filaQueCambia(A);                     // A: 1 clic
  check('a0. A cambió un semáforo', !!fa, fa ? `${fa.txt} ${fa.antes}→${fa.despues}` : 'ninguna fila clicable cambió');
  const iC = fa ? fa.i : 0;
  // B: el MISMO semáforo, 2 clics (valor distinto del de A). Su PATCH espera al de A.
  let aGuardo = null;
  B.antesPatchMain = async () => { aGuardo = await esperarPatch(A, nA, 15000, 200); };
  const tB0 = await ahoraPagina(B);
  await clicFila(B, iC); await B.page.waitForTimeout(150); await clicFila(B, iC);
  await B.page.waitForTimeout(300);
  const colorLocalB = await colorFila(B, iC);
  const pA = await esperarPatch(A, nA, 15000, 200);
  const pB = await esperarPatch(B, nB, 20000);
  await B.page.waitForTimeout(2500);
  const main1 = filaDb(env, 'main');
  const claveC = clavesCambiadas(main0, main1).find((k) => main1.estados[k] && main1.estados[k].estadoResp !== 'gris');
  const valorA1 = claveC ? main1.estados[claveC].estadoResp : undefined;
  check('a1. A guardó (PATCH 200) antes que B', !!pA && !!aGuardo, `clave=${claveC} valor=${valorA1}`);
  check('a2. el PATCH de B fue rechazado con 409 (versión vieja)', !!pB && pB.status === 409, (pB ? `status ${pB.status}` : 'sin PATCH de B') +
    ` · API de B desde sus clics: ${B.api.filter((x) => x.ts >= tB0 - 50).map((x) => `${x.metodo} ${x.ruta} ${x.status}`).join(', ')}` +
    ` · API de B antes (últimas 4): ${B.api.filter((x) => x.ts < tB0 - 50).slice(-4).map((x) => `${x.metodo} ${x.ruta} ${x.status}`).join(', ')}`);
  check('a3. la base conserva el valor de A (B no lo pisó)', valorFilaDb(env, claveC) === valorA1 && fa && valorA1 !== undefined);
  check('a4. aparece el panel de conflicto en B', (await panel(B).count()) > 0);
  const vistosB = await estadosVistos(B, tB0);
  check('a5. el estado de B no dice "Guardado" (dice "No se guardó…")', !vistosB.includes('✅ Guardado') && vistosB.some((t) => t.startsWith('⚠️ No se guardó')), vistosB.join(' → '));
  check('a6. B conserva su cambio local en pantalla (distinto del de A)', (await colorFila(B, iC)) === colorLocalB && colorLocalB !== (await colorFila(A, iC)), `B=${colorLocalB} A=${await colorFila(A, iC)}`);
  check('a7. A no ve panel', (await panel(A).count()) === 0);
  // Un auto-guardado posterior de B no resuelve el conflicto.
  const nB2 = nPatch(B);
  await B.page.waitForTimeout(4000);
  check('a8. ningún auto-guardado de B escribe mientras el conflicto está puesto', nPatch(B) === nB2 && valorFilaDb(env, claveC) === valorA1 && (await panel(B).count()) > 0);

  // ══ (b) Recuperar la versión del servidor ══
  fase.actual = 'b-recuperar';
  const tB1 = await ahoraPagina(B);
  const verAntesB = versionDb(env, 'main');
  await panel(B).getByRole('button', { name: /Recuperar la versión del servidor/ }).click();
  await B.page.waitForTimeout(2500);
  check('b1. el panel desaparece', (await panel(B).count()) === 0);
  check('b2. B muestra el valor del servidor (el de A)', (await colorFila(B, iC)) === (await colorFila(A, iC)), `B=${await colorFila(B, iC)} A=${await colorFila(A, iC)}`);
  const nB3 = nPatch(B);
  await B.page.waitForTimeout(3500);
  check('b3. la base no cambió y B no reescribe nada después', versionDb(env, 'main') === verAntesB && valorFilaDb(env, claveC) === valorA1, `PATCH de B después: ${nPatch(B) - nB3}`);
  check('b4. B leyó por GET /api/datos/main (no por la llave pública)', B.api.some((x) => x.metodo === 'GET' && x.ruta === '/api/datos/main' && x.ts >= tB1));

  // ══ (c) Conservar mi versión, con la otra sesión guardando OTRA VEZ en el medio ══
  fase.actual = 'c-conservar';
  nA = nPatch(A); nB = nPatch(B);
  await clicFila(A, iC); await A.page.waitForTimeout(250);                        // A: +1
  B.antesPatchMain = async () => { await esperarPatch(A, nA, 15000, 200); };
  await clicFila(B, iC); await B.page.waitForTimeout(150); await clicFila(B, iC);  // B: +2
  await B.page.waitForTimeout(300);
  const colorLocalB2 = await colorFila(B, iC);
  await esperarPatch(A, nA, 15000, 200);
  const pB2 = await esperarPatch(B, nB, 20000);
  await B.page.waitForTimeout(2500);
  const valorA2 = valorFilaDb(env, claveC);
  check('c0. segundo choque en el mismo campo → panel en B', !!pB2 && pB2.status === 409 && (await panel(B).count()) > 0, `A guardó ${valorA2}`);
  // Al pulsar "Conservar", entre la relectura y el PATCH, A guarda otra vez (2 clics → valor distinto del de B).
  nA = nPatch(A);
  let intercalado = null;
  B.antesPatchMain = async () => {
    await clicFila(A, iC); await A.page.waitForTimeout(150); await clicFila(A, iC);
    intercalado = await esperarPatch(A, nA, 15000, 200);
  };
  nB = nPatch(B);
  const tB2 = await ahoraPagina(B);
  await panel(B).getByRole('button', { name: /Conservar mi versión/ }).click();
  const pB3 = await esperarPatch(B, nB, 25000);
  await B.page.waitForTimeout(2500);
  const valorA3 = valorFilaDb(env, claveC);
  check('c1. la otra sesión guardó en el medio (PATCH 200 de A)', !!intercalado, `valor A=${valorA3}`);
  check('c2. el PATCH de "Conservar" de B dio 409 y NO reemplazó', !!pB3 && pB3.status === 409 && valorA3 !== undefined && valorA3 !== valorA2, pB3 ? `status ${pB3.status}` : 'sin PATCH');
  check('c3. el conflicto vuelve a quedar puesto (panel) y B conserva su valor', (await panel(B).count()) > 0 && (await colorFila(B, iC)) === colorLocalB2);
  const vistosB2 = await estadosVistos(B, tB2);
  check('c4. el estado de B no terminó en "Guardado"', vistosB2[vistosB2.length - 1] !== '✅ Guardado' && !vistosB2.includes('✅ Guardado'), vistosB2.join(' → '));
  // Ahora sin interferencia: Conservar escribe lo local.
  nB = nPatch(B);
  const tB3 = await ahoraPagina(B);
  await panel(B).getByRole('button', { name: /Conservar mi versión/ }).click();
  const pB4 = await esperarPatch(B, nB, 20000);
  await B.page.waitForTimeout(2000);
  const valorFinal = valorFilaDb(env, claveC);
  const vistosB3 = await estadosVistos(B, tB3);
  check('c5. "Conservar mi versión" escribe lo local (PATCH 200) sobre la versión vigente', !!pB4 && pB4.status === 200 && valorFinal !== valorA3, `base=${valorFinal}`);
  check('c6. el panel desaparece y el estado dice "Guardado"', (await panel(B).count()) === 0 && vistosB3.includes('✅ Guardado'), vistosB3.join(' → '));
  let cuerpoB4 = null; try { cuerpoB4 = JSON.parse(pB4 && pB4.body); } catch (e) {}
  check('c7. el PATCH lleva versión y no lleva usuarios ni pinsPersonalizados', !!cuerpoB4 && typeof cuerpoB4.version === 'string' && !('usuarios' in (cuerpoB4.patch || {})) && !('pinsPersonalizados' in (cuerpoB4.patch || {})));

  // ══ (d) Campos DISTINTOS: se fusionan sin panel ══
  fase.actual = 'd-distintos';
  await A.page.reload({ waitUntil: 'domcontentloaded' }); await B.page.reload({ waitUntil: 'domcontentloaded' });
  await A.page.waitForTimeout(4000); await B.page.waitForTimeout(4000); await cerrarAvisos(A); await cerrarAvisos(B);
  const mainD0 = filaDb(env, 'main');
  nA = nPatch(A); nB = nPatch(B);
  const fdA = await filaQueCambia(A, [iC]);
  B.antesPatchMain = async () => { await esperarPatch(A, nA, 15000, 200); };
  const tB4 = await ahoraPagina(B);
  const fdB = await filaQueCambia(B, [iC, fdA ? fdA.i : -1]);
  const pdA = await esperarPatch(A, nA, 15000, 200);
  const pdB = await esperarPatch(B, nB, 20000, 200);
  await B.page.waitForTimeout(2500);
  const mainD1 = filaDb(env, 'main');
  const cambiadas = clavesCambiadas(mainD0, mainD1);
  const pdB409 = B.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main').slice(nB).some((x) => x.status === 409);
  check('d1. A y B cambiaron filas distintas', !!fdA && !!fdB && fdA.i !== fdB.i, `${fdA && fdA.txt} | ${fdB && fdB.txt}`);
  check('d2. B chocó (409) y se fusionó: segundo PATCH 200', pdB409 && !!pdB, `PATCH de B: ${B.api.filter((x) => x.ruta === '/api/datos/main' && x.metodo === 'PATCH').slice(nB).map((x) => x.status).join(',')}`);
  check('d3. la base tiene los DOS cambios', cambiadas.length >= 2, cambiadas.join(', '));
  check('d4. sin panel en A ni en B', (await panel(A).count()) === 0 && (await panel(B).count()) === 0);
  const vistosB4 = await estadosVistos(B, tB4);
  check('d5. B termina en "Guardado"', vistosB4.includes('✅ Guardado') && !vistosB4.some((t) => t.startsWith('⚠️')), vistosB4.join(' → '));
  check('d6. B aplicó el cambio de A en pantalla (fusión)', fdA && (await colorFila(B, fdA.i)) === fdA.despues, `B ve ${fdA && await colorFila(B, fdA.i)} / A puso ${fdA && fdA.despues}`);

  // ══ (e) Permiso de configuración retirado durante la sesión ══
  fase.actual = 'e-config';
  const Cc = await abrir(env, 'carol'); abiertos.push(Cc);
  await ingresar(Cc, env, U.carol.email, U.carol.pin);
  check('e0. Carol (editor con tareas/config=editar) entra', await esperarHub(Cc));
  await abrirTareas(Cc);
  await Cc.page.waitForTimeout(2000);
  check('e1. Carol ve la pestaña ⚙️ Config', (await Cc.page.getByRole('button', { name: '⚙️ Config', exact: true }).count()) > 0);
  // El admin le retira el permiso (en la base); la pantalla de Carol aún no lo sabe.
  env.psql(`update calendario_data set value = (select jsonb_agg(case when e->>'email'='${U.carol.email}' then jsonb_set(e,'{tab_permisos}','{"tareas":{"config":"sin_acceso"}}'::jsonb) else e end) from jsonb_array_elements(value) e), updated_at = now() where id='usuarios'`);
  const mainE0 = filaDb(env, 'main');
  const nC = nPatch(Cc);
  // Cambio NO de configuración (semáforo propio) + cambio de configuración, en la misma ventana de guardado.
  let fe = null;
  for (const tab of [null, '📆 Mensuales', '📅 Semanales', '📋 Diarias', '🗓 Quincenales', '🗃 Anuales', '📌 Puntuales']) {
    if (tab) { const b = Cc.page.getByRole('button', { name: tab }); if (!(await b.count())) continue; await b.first().click(); await Cc.page.waitForTimeout(400); }
    fe = await filaQueCambia(Cc); if (fe) break;
  }
  check('e2. Carol cambió un semáforo propio', !!fe, fe ? fe.txt : 'sin fila clicable');
  await Cc.page.getByRole('button', { name: '⚙️ Config', exact: true }).first().click();
  await Cc.page.waitForTimeout(500);
  await Cc.page.getByRole('button', { name: /Editar/ }).first().click();
  await Cc.page.waitForTimeout(300);
  const NOMBRE_NUEVO = 'Nombre cambiado por la prueba sin permiso';
  await Cc.page.locator('tr input').first().fill(NOMBRE_NUEVO);
  await Cc.page.getByRole('button', { name: /Guardar/ }).first().click();
  const pe200 = await esperarPatch(Cc, nC, 15000, 200);
  await Cc.page.waitForTimeout(2500);
  const pesC = Cc.api.filter((x) => x.metodo === 'PATCH' && x.ruta === '/api/datos/main').slice(nC);
  const mainE1 = filaDb(env, 'main');
  const txtC = await Cc.page.evaluate(() => document.body.innerText);
  check('e3. el servidor rechazó la configuración (403) y se reintentó sin ella (200)', pesC.some((x) => x.status === 403) && !!pe200, pesC.map((x) => x.status).join(','));
  check('e4. Carol recibe el aviso de permiso', /No tienes permiso para cambiar la configuración de Tareas/.test(txtC));
  check('e5. el cambio que NO es configuración se guardó', clavesCambiadas(mainE0, mainE1).length > 0, clavesCambiadas(mainE0, mainE1).join(','));
  check('e6. la configuración NO se guardó', !JSON.stringify(mainE1.tareasConfig || {}).includes(NOMBRE_NUEVO) && !JSON.stringify(mainE1.tareasOverrides || {}).includes(NOMBRE_NUEVO));
  let cuerpoE = null; try { cuerpoE = JSON.parse(pe200 && pe200.body); } catch (e) {}
  check('e7. el PATCH aceptado no lleva claves de configuración', !!cuerpoE && !['tareasConfig', 'supervisores', 'tareasExtra', 'tareasOverrides'].some((k) => k in (cuerpoE.patch || {})), cuerpoE ? Object.keys(cuerpoE.patch || {}).join(',') : '');
  await Cc.browser.close();
  // Michelle (sin permiso de configuración desde el inicio): no ve la pestaña.
  const Mi = await abrir(env, 'michelle'); abiertos.push(Mi);
  await ingresar(Mi, env, U.michelle.email, U.michelle.pin);
  check('e8. Michelle entra', await esperarHub(Mi));
  await abrirTareas(Mi);
  await Mi.page.waitForTimeout(3000); await cerrarAvisos(Mi);
  const tabCfgMi = Mi.page.getByRole('button', { name: '⚙️ Config', exact: true });
  // Modo servidor: config sin definir en el padrón = sin acceso (igual que getTabPerm y que el servidor).
  check('e9. (pantalla) Michelle, sin tareas/config en el padrón, no ve la pestaña ⚙️ Config', (await tabCfgMi.count()) === 0);
  {
    // Sin tocar configuración, Michelle NO debe recibir el aviso de permiso (antes salía en cada
    // guardado por los valores por defecto de TAREAS_BASE que el servidor no tiene).
    const nM = nPatch(Mi);
    let fm = null;
    for (const tab of [null, '📅 Semanales', '📆 Mensuales', '📋 Diarias']) {
      if (tab) { const bb = Mi.page.getByRole('button', { name: tab }); if (!(await bb.count())) continue; await bb.first().click(); await Mi.page.waitForTimeout(400); }
      fm = await filaQueCambia(Mi); if (fm) break;
    }
    const pm = fm ? await esperarPatch(Mi, nM, 15000, 200) : null;
    await Mi.page.waitForTimeout(1500);
    check('e10. Michelle cambia un semáforo y se guarda (PATCH 200)', !!fm && !!pm, fm ? fm.txt : 'sin fila clicable');
    check('e11. Michelle NO recibe el aviso de permiso de configuración (no tocó configuración)',
      !/No tienes permiso para cambiar la configuración de Tareas/.test(await Mi.page.evaluate(() => document.body.innerText)));
  }
  await Mi.browser.close();

  // ══ (X) Auditoría: Finanzas, Créditos, Nóminas, 💾 Respaldo ══
  fase.actual = 'X-finanzas';
  await B.browser.close();
  check('X0. A vuelve al hub', await irAlHub(A, env));
  await A.page.getByText('Finanzas', { exact: true }).first().click();
  await A.page.waitForTimeout(6000); await cerrarAvisos(A);
  const tabCred = A.page.getByRole('button', { name: '💳 Créditos' });
  check('X1. Finanzas abre (pestaña Créditos visible)', (await tabCred.count()) > 0);
  if (await tabCred.count()) { fase.actual = 'X-creditos'; await tabCred.first().click(); await A.page.waitForTimeout(3000); await cerrarAvisos(A); }
  const tabNom = A.page.getByRole('button', { name: '📋 Nóminas' });
  if (await tabNom.count()) { fase.actual = 'X-nominas'; await tabNom.first().click(); await A.page.waitForTimeout(4000); await cerrarAvisos(A); }
  check('X2. se abrieron Créditos y Nóminas', registro.some((r) => r.fase === 'X-nominas') || (await tabNom.count()) > 0);
  fase.actual = 'X-respaldo';
  check('X3. A vuelve al hub', await irAlHub(A, env));
  const descarga = A.page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await A.page.getByRole('button', { name: /Respaldo/ }).first().click();
  const dl = await descarga;
  let respaldo = null;
  if (dl) { const f = path.join(OUT, 'respaldo-descargado.json'); await dl.saveAs(f); try { respaldo = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} }
  await A.page.waitForTimeout(1000);
  const txtResp = respaldo ? JSON.stringify(respaldo) : '';
  check('X4. 💾 Respaldo descarga un archivo', !!respaldo, A.dialogos.slice(-1)[0] || '');
  check('X5. el respaldo no trae pins ni credenciales', !!respaldo && !('pins' in (respaldo.tablas || {})) && !/_h"|pinsPersonalizados|"salt"|"hash"/.test(txtResp));
  check('X6. main y usuarios vienen de /api/datos', !!respaldo && respaldo.tablas.main && respaldo.tablas.main.origen === 'api/datos/main' && respaldo.tablas.usuarios && respaldo.tablas.usuarios.origen === 'api/datos/usuarios');

  // ══ (R) Restaurar con un respaldo SINTÉTICO ══
  fase.actual = 'R-restaurar';
  const sintetico = { fecha: '2026-01-01T00:00:00.000Z', usuario: 'Prueba', version: 'Mediterra Hub Backup v1', tablas: {
    pins: { data: { 'Sintetico Prueba_h': 'credencial-sintetica' } },
    usuarios: { data: [{ nombre: 'Sintético', email: 'sintetico@prueba.test', rol: 'admin' }] },
    main: { data: { estados: { sintetico: { estadoResp: 'verde' } } } },
    prueba_restaurar_sintetica: { data: { ok: 1 } },
  } };
  const fSint = path.join(OUT, 'respaldo-sintetico.json');
  fs.writeFileSync(fSint, JSON.stringify(sintetico));
  const antesR = { pins: versionDb(env, 'pins'), usuarios: versionDb(env, 'usuarios'), main: versionDb(env, 'main'), pinsV: JSON.stringify(filaDb(env, 'pins')) };
  const nDlg = A.dialogos.length;
  const chooser = A.page.waitForEvent('filechooser', { timeout: 10000 });
  await A.page.getByRole('button', { name: /Restaurar/ }).first().click();
  const fc = await chooser.catch(() => null);
  if (fc) await fc.setFiles(fSint);
  await A.page.waitForTimeout(5000);
  const msj = A.dialogos.slice(nDlg).find((d) => /RESTAURACIÓN|restaur/i.test(d) && !/RESTAURAR RESPALDO/.test(d) && !/escribe RESTAURAR/.test(d)) || '';
  fs.writeFileSync(path.join(OUT, 'mensaje-restaurar.txt'), msj);
  check('R1. el informe dice "RESTAURACIÓN PARCIAL"', /RESTAURACIÓN PARCIAL/.test(msj), msj.split('\n')[0]);
  check('R2. lista pins, usuarios y main como NO restauradas', ['pins', 'usuarios', 'main'].every((id) => new RegExp(`•\\s*${id}:`).test(msj.split('Restauradas:')[0])));
  check('R3. la fila sintética sí se restauró', !!filaDb(env, 'prueba_restaurar_sintetica') && /prueba_restaurar_sintetica/.test(msj));
  // El contenido del respaldo sintético NO debe aparecer en esas filas. (Las versiones pueden moverse por
  // guardados legítimos por /api/datos al recargar la página; se informan aparte.)
  const usDb = JSON.stringify(filaDb(env, 'usuarios')), mDb = JSON.stringify(filaDb(env, 'main'));
  check('R4. la base no recibió el contenido sintético en pins/usuarios/main', JSON.stringify(filaDb(env, 'pins')) === antesR.pinsV &&
    !usDb.includes('sintetico@prueba.test') && !/"sintetico"/.test(mDb) && !JSON.stringify(filaDb(env, 'pins')).includes('Sintetico Prueba_h'),
    `versiones cambiadas: ${['pins', 'usuarios', 'main'].filter((id) => versionDb(env, id) !== antesR[id]).join(',') || 'ninguna'}`);
  const escriturasR = registro.filter((r) => r.fase === 'R-restaurar' && r.metodo !== 'GET');
  check('R5. la restauración escribió por la llave pública SOLO la fila sintética', escriturasR.length > 0 && escriturasR.every((r) => r.ids.every((id) => id === 'prueba_restaurar_sintetica')),
    escriturasR.map((r) => `${r.metodo} [${r.ids.join(',')}]`).join(' | '));
  console.log(`   (info) escrituras de A por /api/datos (últimas 4): ${A.api.filter((x) => x.metodo !== 'GET' && /\/api\/datos\//.test(x.ruta)).slice(-4).map((x) => `${x.metodo} ${x.ruta} ${x.status}`).join(', ')}`);
  await A.page.waitForTimeout(3000);

  // ══ (g) Salir con un conflicto pendiente: confirmación, copia local y descarte con motivo ══
  fase.actual = 'g-salir';
  await irAlHub(A, env); await abrirTareas(A);
  const B2 = await abrir(env, 'B2'); abiertos.push(B2);
  await ingresar(B2, env, U.angelo.email, U.angelo.pin);
  check('g0. una sesión nueva (B2) entra', await esperarHub(B2));
  await abrirTareas(B2);
  await A.page.waitForTimeout(2000); await B2.page.waitForTimeout(2000);
  {
    const B = B2;
    const nAg = nPatch(A), nBg = nPatch(B);
    const fg = await filaQueCambia(A);
    B.antesPatchMain = async () => { await esperarPatch(A, nAg, 15000, 200); };
    if (fg) { await clicFila(B, fg.i); await B.page.waitForTimeout(150); await clicFila(B, fg.i); }
    await esperarPatch(B, nBg, 20000);
    await B.page.waitForTimeout(2500);
    check('g1. B queda con conflicto pendiente', !!fg && (await panel(B).count()) > 0);
    const nDlgB = B.dialogos.length;
    await B.page.getByRole('button', { name: 'Salir', exact: true }).first().click();
    // El cierre muestra el login y después recarga la página: esperar a que la recarga termine.
    await B.page.waitForEvent('load', { timeout: 20000 }).catch(() => {});
    await B.page.waitForTimeout(1500);
    await formLogin(B).waitFor({ timeout: 20000 }).catch(() => {});
    const dlg = B.dialogos.slice(nDlgB).join(' || ');
    check('g2. "Salir" pidió confirmación por el conflicto', /en conflicto/.test(dlg), dlg.slice(0, 160));
    const copias = await B.page.evaluate(() => { try { return JSON.parse(localStorage.getItem('mediterra_tareas_sin_guardar') || '[]'); } catch (e) { return null; } });
    check('g3. quedó una copia local con el cambio (sin credenciales)', Array.isArray(copias) && copias.length === 1 && copias[0].conflicto === true
      && Object.keys(copias[0].cambios || {}).includes('estados') && !/pinsPersonalizados|"usuarios"/.test(JSON.stringify(copias)), JSON.stringify(copias).slice(0, 200));
    await ingresar(B, env, U.angelo.email, U.angelo.pin);
    check('g4. B vuelve a entrar', await esperarHub(B));
    const aviso = B.page.locator('[data-aviso-copia-tareas]');
    check('g5. al volver a entrar se muestra el aviso de la copia', (await aviso.count()) > 0);
    // El manejador de diálogos responde los prompt con un texto: sirve de motivo.
    if (await aviso.count()) { await aviso.getByRole('button', { name: /Descartar/ }).first().click(); await B.page.waitForTimeout(800); }
    const resto = await B.page.evaluate(() => localStorage.getItem('mediterra_tareas_sin_guardar'));
    check('g6. "Descartar…" con motivo retira la copia y el aviso', resto === null && (await aviso.count()) === 0);
  }

  // ══ (f) Red: ninguna petición con la llave pública a pins/usuarios/main; WebSocket ══
  fase.actual = 'fin';
  const prohibidas = registro.filter((r) => r.ids.some((id) => FILAS_PROTEGIDAS.includes(id) || id.startsWith('(masiva')));
  check('f1. cero peticiones a calendario_data pins/usuarios/main con la llave pública', prohibidas.length === 0,
    prohibidas.slice(0, 6).map((r) => `${r.fase}/${r.pestaña} ${r.metodo} ${r.search} [${r.ids.join(',')}]`).join(' | '));
  check('f2. el registro observó peticiones a Supabase', registro.length > 0, `${registro.length} peticiones`);
  const wsSupa = sockets.filter((s) => /supabase\.co/.test(s.url));
  const wsTabla = wsSupa.filter((s) => s.enviados.some((m) => /realtime:public:calendario_data/.test(m) && !/filter/.test(m)));
  check('f3. ningún WebSocket de Supabase suscrito a calendario_data (entregaría pins/usuarios/main)', wsTabla.length === 0,
    wsTabla.map((s) => `${s.fase}/${s.pestaña} ${s.url.slice(0, 80)} envió ${s.enviados[0] ? s.enviados[0].slice(0, 120) : ''}`).join(' | '));
  // Conocidos (bloqueados aquí): Google Fonts de public/index.html y el detector de versión (vercel.app).
  const CONOCIDOS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|gestion-grupo-mediterra\.vercel\.app)\//;
  const otras = externas.filter((e) => !CONOCIDOS.test(e.url));
  const hosts = {}; for (const e of externas) { const h = new URL(e.url).host; hosts[h] = (hosts[h] || 0) + 1; }
  console.log(`   (info) salidas externas bloqueadas por host: ${JSON.stringify(hosts)}`);
  check('f4. ninguna salida a hosts externos fuera de los conocidos (fuentes, detector de versión)', otras.length === 0, otras.slice(0, 5).map((e) => `${e.fase}/${e.pestaña} ${e.url.slice(0, 90)}`).join(' | '));
  const errs = abiertos.flatMap((x) => x.errores.map((e) => `${x.nombre}: ${e}`));
  check('f5. sin errores de JavaScript', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  check('excepción inesperada', false, String(e && e.stack || e).slice(0, 600));
} finally {
  fs.writeFileSync(path.join(OUT, 'registro-red-conflicto.json'), JSON.stringify({ registro, externas, sockets }, null, 1));
  fs.writeFileSync(path.join(OUT, 'resultados-conflicto.json'), JSON.stringify(resultados, null, 1));
  fs.writeFileSync(path.join(OUT, 'api-por-sesion.json'), JSON.stringify(abiertos.map((x) => ({ sesion: x.nombre, api: x.api })), null, 1));
  for (const x of abiertos) await x.browser.close().catch(() => {});
  await env.cerrar();
}
const n = resultados.length;
console.log(fallos ? `\n${fallos} FALLA(S) de ${n}` : `\nTODO OK (${n}/${n})`);
process.exit(fallos ? 1 : 0);

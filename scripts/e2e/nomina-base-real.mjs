/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR CONTRA UNA BASE REAL LOCAL — Nóminas con guardado condicionado.
   SOLO DATOS DE PRUEBA. Producción no se lee ni se escribe.

   La app real (build de la rama) corre en Chromium. Todas sus llamadas a
   bywovqayuzodbzwsriet.supabase.co se redirigen a un Postgres 16 + PostgREST 12
   LOCALES (scripts/nominas-cas/pglocal.mjs) con las políticas y los triggers de
   producción, SIN la propuesta supabase/propuesta_nominas_version_obligatoria.sql
   (no existe nominas_guardar ni el trigger, igual que hoy en producción). La app
   guarda con PATCH condicionado a updated_at y POST sin merge-duplicates. La llave de la app se reemplaza por
   una llave local. Tiempo real, correo y la URL de producción quedan bloqueados;
   los correos se CUENTAN.

   Dos pestañas (P1, P2) sobre la misma base:
     1  carga: una empresa falla al leer (bloqueada, las demás operan), reintento
     2  creación de la primera nómina de una empresa; creación simultánea
     3  edición: independientes (se combinan), mismo campo (conflicto → servidor /
        mantener la mía)
     4  aprobación CFO: sin guardado (red, 500) → no cambia y 0 correos; normal →
        2 correos; respuesta perdida verificable → 1 escritura y 2 correos;
        respuesta perdida SIN verificar → no se da por hecha, 0 correos; reintento
        → reconoce lo hecho, no escribe de nuevo, 2 correos en total, historial
        sin duplicar; aprobación contra un cambio de otra persona → conflicto,
        0 correos
     5  una pestaña con el código ANTIGUO (upsert sin condición) NO es rechazada:
        riesgo abierto conocido mientras no exista el trigger (se deja constancia)
     6  la app nunca escribe una fila de nóminas sin condición y nunca llama a la función

     POSTGREST_BIN=/ruta/postgrest OUT_DIR=/tmp/nbr node scripts/e2e/nomina-base-real.mjs
   (requiere el build servido en http://127.0.0.1:4173, ver scripts/e2e/README.md)
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { nuevoStore, filaNominaProtegida } from './fake.mjs';
import { login, entrarFinanzas, subTab } from './lib.mjs';
import { levantarBaseLocal } from '../nominas-cas/pglocal.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// ── base local como producción hoy: SIN la propuesta ────────────────────
const db = await levantarBaseLocal({ pgPort: 54334, pgrstPort: 3915 });
check('0a. La base local NO tiene la función nominas_guardar (igual que producción)', db.psql(`select count(*) from pg_proc where proname = 'nominas_guardar'`) === '0');
check('0b. La base local NO tiene el trigger que exige versión', db.psql(`select count(*) from pg_trigger where tgname = 'trg_nominas_exigir_version'`) === '0');

// ── datos de prueba ─────────────────────────────────────────────────────
const hoy = new Date();
const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
const semana = Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
const anio = t.getUTCFullYear();
const item = (id) => ({ id, seccion: 'proveedores', tipoDoc: 'Factura', proveedor: 'Proveedor ' + id, rut: '', nDoc: '1', fDoc: '', fVenc: '', semVenc: '',
  concepto: 'Servicio', montoCLP: 1000, montoUSD: 0, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: [] });
const nom = (id, empresa, sem, estado = 'borrador') => ({ id, empresa, semana: sem, año: anio, numero: 1, fecha: hoy.toISOString().slice(0, 10), tc: 950, estado,
  preparadoPor: 'x', revisadoPor: 'y', aprobadoPor: '', aprobado1Por: estado === 'aprobada1' ? 'Carol Machuca' : '', fechaAprobacion: '', fechaAprobacion1: '',
  items: [item('it-' + id)], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] });
const ts = (ms) => new Date(Date.now() - ms).toISOString();
const dolar = (s) => `$v$${s}$v$`;
const sembrar = (id, valor, esTexto) => db.psql(`insert into calendario_data (id, value, updated_at) values ('${id}', ${esTexto ? `to_jsonb(${dolar(valor)}::text)` : `${dolar(valor)}::jsonb`}, '${ts(60000)}')`);
for (const [id, f] of Object.entries(nuevoStore())) sembrar(id, typeof f.value === 'string' ? f.value : JSON.stringify(f.value), typeof f.value === 'string');
sembrar('nominas_v2_done', JSON.stringify({ migrado: true }), true);
const filaNom = (empresa, nominas) => JSON.stringify({ empresa, nominas });
sembrar('nominas_osiris', filaNom('Osiris', [nom('nomA', 'Osiris', semana), nom('nomB', 'Osiris', semana - 1)]), true);
sembrar('nominas_mediterra', filaNom('Mediterra', [nom('T1', 'Mediterra', semana, 'aprobada1')]), true);
sembrar('nominas_frisku_foods', filaNom('Frisku Foods', [nom('T2', 'Frisku Foods', semana, 'aprobada1')]), true);
sembrar('nominas_allegria_foods', filaNom('Allegria Foods', [nom('T3', 'Allegria Foods', semana, 'aprobada1')]), true);
sembrar('nominas_allegria_service', filaNom('Allegria Service', [nom('T4', 'Allegria Service', semana, 'aprobada1')]), true);
// Integrity Farms: SIN fila (inexistente confirmada)

const filaDb = (id) => { const r = db.psql(`select coalesce(value #>> '{}', '') || '¦' || updated_at || '¦' || jsonb_typeof(value) from calendario_data where id = '${id}'`); if (!r) return null; const [texto, version, tipo] = r.split('¦'); return { texto, version, tipo }; };
const nominasDb = (id) => { const f = filaDb(id); return f ? JSON.parse(f.texto).nominas : null; };
const delDb = (id, nomId) => (nominasDb(id) || []).find((n) => n.id === nomId);
const versionDb = (id) => (filaDb(id) || {}).version;

// ── red: todo Supabase → base local; producción, tiempo real y correo bloqueados ──
const registro = [];         // cada petición a Supabase que hizo la app
let correos = 0;
const ctl = { escritura: null, etiqueta: null };   // ({tab, rpc, id}) → null | 'red' | 'perdida' | { status, body }
async function abrirPestana(nombre, { sinLectura = null } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 }, acceptDownloads: true });
  const estado = { sinLectura };   // (id) → true = esta pestaña no logra leer esa fila
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const esTabla = u.pathname === '/rest/v1/calendario_data', esRpc = u.pathname === '/rest/v1/rpc/nominas_guardar';
    if (!esTabla && !esRpc) return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'content-range': '0-0/1' }, body: '{}' });
    let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
    const idm = /id=eq\.([^&]+)/.exec(u.search);
    const id = esRpc ? body && body.p_id : idm ? decodeURIComponent(idm[1]) : (body && (Array.isArray(body) ? body[0] && body[0].id : body.id)) || null;
    const reg = { tab: nombre, metodo: m, rpc: esRpc, id, version: esRpc ? body && body.p_version_leida : null, etiqueta: ctl.etiqueta || null,
      cond: esTabla && m === 'PATCH' && /updated_at=eq\./.test(u.search), prefer: req.headers()['prefer'] || '' };
    registro.push(reg);
    if (m === 'GET' && estado.sinLectura && estado.sinLectura(id)) { reg.resultado = 'lectura bloqueada'; return route.abort('failed'); }
    const h = m !== 'GET' && ctl.escritura ? ctl.escritura({ tab: nombre, nom: (esTabla || esRpc) && m !== 'GET', id }) : null;
    if (h === 'red') { reg.resultado = 'sin red (no llegó)'; return route.abort('failed'); }
    if (h && h.status) { reg.resultado = `HTTP ${h.status} simulado`; return route.fulfill({ status: h.status, contentType: 'application/json', headers: cors, body: JSON.stringify(h.body || {}) }); }
    const headers = { ...req.headers(), apikey: db.ANON, authorization: `Bearer ${db.ANON}` };
    const resp = await route.fetch({ url: db.url + u.pathname.replace(/^\/rest\/v1/, '') + u.search, headers });
    const cuerpo = await resp.body();
    reg.status = resp.status(); reg.cuerpo = cuerpo.toString('utf8').slice(0, 300);
    if (h === 'perdida') { reg.resultado = 'aplicado, respuesta PERDIDA'; return route.abort('failed'); }
    return route.fulfill({ status: resp.status(), headers: { ...resp.headers(), ...cors }, body: cuerpo });
  });
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await ctx.route('**/api/send-email', (r) => { correos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
  await ctx.route('**api.emailjs.com/**', (r) => { correos++; return r.fulfill({ status: 200, body: 'OK' }); });
  await ctx.route('**gestion-grupo-mediterra.vercel.app/**', (r) => r.fulfill({ status: 404, body: '' }));
  await ctx.addInitScript(() => {
    const WSReal = window.WebSocket;
    window.WebSocket = function (url, prot) {
      if (String(url).includes('bywovqayuzodbzwsriet.supabase.co')) return { readyState: 0, url: String(url), send() {}, close() { this.readyState = 3; }, addEventListener() {}, removeEventListener() {} };
      return prot !== undefined ? new WSReal(url, prot) : new WSReal(url);
    };
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach((k, i) => { window.WebSocket[k] = i; });
  });
  const page = await ctx.newPage();
  const errores = [], dialogos = [];
  page.on('pageerror', (e) => errores.push(String(e)));
  page.on('dialog', (d) => { dialogos.push(d.message()); (d.type() === 'prompt' ? d.accept('motivo de prueba') : d.accept()).catch(() => {}); });
  await login(page); await entrarFinanzas(page); await subTab(page, /Nóminas/); await page.waitForTimeout(1500);
  return { nombre, browser, page, errores, dialogos, estado };
}
const notas = (p) => p.page.locator('textarea[placeholder="Observaciones..."]').first();
const aviso = (p) => p.page.locator('[data-aviso-nominas]');
const textoAviso = async (p) => ((await aviso(p).count()) ? await aviso(p).first().innerText() : '');
const filaEmpresa = (p, empresa) => p.page.locator('tr').filter({ has: p.page.locator('td', { hasText: new RegExp(`^\\s*${empresa}\\s*$`) }) }).first();
async function volverALista(p) {
  await p.page.getByRole('button', { name: /Volver/ }).first().click().catch(() => {});
  await p.page.locator('tr').filter({ hasText: 'Mediterra' }).first().waitFor({ timeout: 15000 }); await p.page.waitForTimeout(400);
}
async function abrirNomina(p, empresa, semanaAnterior = false) {
  if (semanaAnterior) { await p.page.locator('button', { hasText: '‹' }).first().click(); await p.page.waitForTimeout(800); }
  await filaEmpresa(p, empresa).getByRole('button', { name: /Editar|Ver/ }).click();
  await p.page.getByRole('button', { name: /Volver/ }).first().waitFor({ timeout: 15000 }); await p.page.waitForTimeout(500);
}
async function irASemanaActual(p) { await p.page.locator('button', { hasText: '›' }).first().click(); await p.page.waitForTimeout(1200); }
const escribirNotas = async (p, txt) => { await notas(p).fill(txt); await p.page.waitForTimeout(2500); };
// Escrituras que la base APLICÓ (incluida la que perdió su respuesta: el cuerpo se lee antes de perderla).
const escriturasRpc = (id) => registro.filter((r) => !r.rpc && r.id === id
  && ((r.metodo === 'PATCH' && r.status === 200 && /^\s*\[\s*\{/.test(r.cuerpo || '')) || (r.metodo === 'POST' && r.status === 201))).length;
const aprobaciones = (fila, nomId) => (delDb(fila, nomId)?.historial || []).filter((h) => h.estadoHacia === 'aprobada').length;
const aprobar = async (p) => { await p.page.getByRole('button', { name: /Aprobar \(CFO\)/ }).click(); await p.page.waitForTimeout(2500); };
const botonAprobar = (p) => p.page.getByRole('button', { name: /Aprobar \(CFO\)/ }).count();

// ═══ 1. Carga ═══════════════════════════════════════════════════════════
const P1 = await abrirPestana('pestaña 1', { sinLectura: (id) => id === 'nominas_osiris' });
P1.estado.sinLectura = null;
const P2 = await abrirPestana('pestaña 2');
const banner = P1.page.locator('[data-aviso-carga-nominas]');
check('1a. Lectura fallida de Osiris: aviso que la nombra, Osiris sin nóminas y Mediterra cargada desde la base',
  (await banner.count()) === 1 && /Osiris/.test(await banner.innerText()) && (await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /\+ Crear/ }).count()) === 1
  && (await filaEmpresa(P1, 'Mediterra').getByRole('button', { name: /Editar|Ver/ }).count()) === 1);
const antesCrear = registro.filter((r) => r.metodo !== 'GET' && r.id === 'nominas_osiris').length;
P1.dialogos.length = 0;
await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /\+ Crear/ }).click(); await P1.page.waitForTimeout(1000);
check('1b. Crear en Osiris (no cargada) se bloquea con explicación y no llega ninguna escritura a la base',
  P1.dialogos.some((m) => /No se pudieron cargar las nóminas de Osiris/.test(m)) && registro.filter((r) => r.metodo !== 'GET' && r.id === 'nominas_osiris').length === antesCrear && nominasDb('nominas_osiris').length === 2);
await P1.page.getByRole('button', { name: 'Reintentar carga' }).click(); await P1.page.waitForTimeout(1500);
check('1c. "Reintentar carga": Osiris se carga desde la base y se puede abrir', (await banner.count()) === 0 && (await filaEmpresa(P1, 'Osiris').getByRole('button', { name: /Editar/ }).count()) === 1);

// ═══ 2. Creación ════════════════════════════════════════════════════════
await filaEmpresa(P1, 'Integrity Farms').getByRole('button', { name: /\+ Crear/ }).click(); await P1.page.waitForTimeout(2500);
let f = filaDb('nominas_integrity_farms');
check('2a. Primera nómina de Integrity Farms: la app CREA la fila con POST sin merge-duplicates ("leí que no existía"), en formato texto JSON',
  f && f.tipo === 'string' && JSON.parse(f.texto).nominas.length === 1 && registro.some((r) => r.metodo === 'POST' && r.id === 'nominas_integrity_farms' && r.status === 201 && !/merge-duplicates/.test(r.prefer)) && (await aviso(P1).count()) === 0);
await volverALista(P1);
await filaEmpresa(P2, 'Integrity Farms').getByRole('button', { name: /\+ Crear/ }).click(); await P2.page.waitForTimeout(3000);
check('2b. Creación simultánea (P2 aún cree que no existe): la base responde 409 (ya existe), P2 relee y combina → 2 nóminas, sin aviso',
  nominasDb('nominas_integrity_farms').length === 2 && registro.some((r) => r.metodo === 'POST' && r.tab === 'pestaña 2' && r.id === 'nominas_integrity_farms' && r.status === 409) && (await aviso(P2).count()) === 0);
await volverALista(P2);

// ═══ 3. Edición ═════════════════════════════════════════════════════════
await abrirNomina(P1, 'Osiris');
let v0 = versionDb('nominas_osiris');
await escribirNotas(P1, 'uno');
check('3a. Edición: PATCH condicionado a la versión leída; la versión de la fila avanza; formato texto intacto',
  delDb('nominas_osiris', 'nomA').notas === 'uno' && versionDb('nominas_osiris') !== v0 && filaDb('nominas_osiris').tipo === 'string'
  && registro.some((r) => r.metodo === 'PATCH' && r.cond && r.id === 'nominas_osiris' && r.status === 200));
await abrirNomina(P2, 'Osiris', true);
await escribirNotas(P2, 'dos');
check('3b. Ediciones independientes (P2 en la nómina B con versión vieja): conflicto en la base → relee y combina → ambas guardadas',
  delDb('nominas_osiris', 'nomA').notas === 'uno' && delDb('nominas_osiris', 'nomB').notas === 'dos' && (await aviso(P2).count()) === 0
  && registro.some((r) => r.metodo === 'PATCH' && r.cond && r.tab === 'pestaña 2' && r.id === 'nominas_osiris' && r.status === 200 && /^\s*\[\s*\]\s*$/.test(r.cuerpo || '')));
await volverALista(P2); await irASemanaActual(P2);
await abrirNomina(P2, 'Osiris');
P2.estado.sinLectura = (id) => id === 'nominas_osiris';   // P2 queda desactualizada
await escribirNotas(P1, 'X');
P2.estado.sinLectura = null;
await escribirNotas(P2, 'Y');
let ta = await textoAviso(P2);
check('3c. Mismo campo: conflicto explícito, la base conserva lo de P1, la edición de P2 sigue en pantalla',
  /mismo campo \(notas\)/.test(ta) && delDb('nominas_osiris', 'nomA').notas === 'X' && (await notas(P2).inputValue()) === 'Y', ta.slice(0, 160));
await P2.page.getByRole('button', { name: 'Usar la versión del servidor' }).click(); await P2.page.waitForTimeout(800);
check('3d. "Usar la versión del servidor": la pantalla toma X y no se escribe nada', (await notas(P2).inputValue()) === 'X' && delDb('nominas_osiris', 'nomA').notas === 'X');
P2.estado.sinLectura = (id) => id === 'nominas_osiris';
await escribirNotas(P1, 'X2');
P2.estado.sinLectura = null;
await escribirNotas(P2, 'Y2');
await P2.page.getByRole('button', { name: /Mantener la mía/ }).click(); await P2.page.waitForTimeout(1500);
check('3e. "Mantener la mía" (con confirmación): queda Y2 en la base, con PATCH condicionado', delDb('nominas_osiris', 'nomA').notas === 'Y2' && (await aviso(P2).count()) === 0);
await volverALista(P1); await volverALista(P2);

// ═══ 4. Aprobación CFO ══════════════════════════════════════════════════
// 4a-b. Sin guardado (red / 500): no cambia nada ni se envía correo.
await abrirNomina(P1, 'Mediterra');
let c0 = correos;
for (const [nombre, resp] of [['sin red', 'red'], ['HTTP 500', { status: 500, body: { message: 'error simulado' } }]]) {
  ctl.escritura = ({ nom, id }) => (nom && id === 'nominas_mediterra' ? resp : null);
  await aprobar(P1);
  ta = await textoAviso(P1);
  check(`4a. Aprobar ${nombre}: sigue "V°B°" en pantalla y en la base, 0 correos, aviso "El cambio de estado NO se hizo"`,
    (await botonAprobar(P1)) === 1 && delDb('nominas_mediterra', 'T1').estado === 'aprobada1' && correos === c0 && /cambio de estado NO se hizo/.test(ta), ta.slice(0, 120));
}
ctl.escritura = null;
await aprobar(P1);
check('4b. Aprobar con la base respondiendo: queda "aprobada" en la base y RECIÉN AHÍ 2 correos',
  delDb('nominas_mediterra', 'T1').estado === 'aprobada' && correos - c0 === 2 && aprobaciones('nominas_mediterra', 'T1') === 1 && (await aviso(P1).count()) === 0, `correos ${correos - c0}`);
await volverALista(P1);
// 4c. Respuesta perdida, verificable.
await abrirNomina(P1, 'Frisku Foods');
c0 = correos;
let unaVez = true;
ctl.escritura = ({ nom, id }) => (nom && id === 'nominas_frisku_foods' && unaVez ? (unaVez = false, 'perdida') : null);
await aprobar(P1);
ctl.escritura = null;
check('4c. Respuesta perdida tras guardar (la base SÍ aprobó): relee, verifica, la da por hecha → 1 escritura, 2 correos, historial 1',
  delDb('nominas_frisku_foods', 'T2').estado === 'aprobada' && escriturasRpc('nominas_frisku_foods') === 1 && correos - c0 === 2 && aprobaciones('nominas_frisku_foods', 'T2') === 1
  && (await botonAprobar(P1)) === 0 && (await aviso(P1).count()) === 0, `escrituras ${escriturasRpc('nominas_frisku_foods')}, correos ${correos - c0}`);
await volverALista(P1);
// 4d-e. Respuesta perdida SIN poder verificar, y reintento.
await abrirNomina(P1, 'Allegria Foods');
c0 = correos;
unaVez = true;
ctl.escritura = ({ nom, id }) => (nom && id === 'nominas_allegria_foods' && unaVez ? (unaVez = false, 'perdida') : null);
P1.estado.sinLectura = (id) => id === 'nominas_allegria_foods';
await aprobar(P1);
ctl.escritura = null;
// Un refresco de fondo mientras esa empresa sigue sin poder leerse: el aviso debe seguir vigente.
await P1.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await P1.page.waitForTimeout(1500);
ta = await textoAviso(P1);
check('4d. Respuesta perdida SIN poder verificar: la pantalla NO la da por hecha (sigue "Aprobar"), 0 correos; el aviso sigue vigente aunque haya un refresco que no pudo releer esa empresa; la base sí la tiene',
  (await botonAprobar(P1)) === 1 && correos === c0 && /cambio de estado NO se hizo/.test(ta) && delDb('nominas_allegria_foods', 'T3').estado === 'aprobada', ta.slice(0, 120));
P1.estado.sinLectura = null;
const escAntes = escriturasRpc('nominas_allegria_foods');
await aprobar(P1);
check('4e. Reintento: reconoce que ya estaba aprobada, NO escribe de nuevo, historial sin duplicar, y los 2 correos salen una sola vez',
  escriturasRpc('nominas_allegria_foods') === escAntes && aprobaciones('nominas_allegria_foods', 'T3') === 1 && correos - c0 === 2 && (await botonAprobar(P1)) === 0 && (await aviso(P1).count()) === 0,
  `escrituras nuevas ${escriturasRpc('nominas_allegria_foods') - escAntes}, aprobaciones ${aprobaciones('nominas_allegria_foods', 'T3')}, correos ${correos - c0}`);
await volverALista(P1);
// 4f. Aprobación contra un cambio de otra persona en la misma nómina.
await abrirNomina(P1, 'Allegria Service');
await abrirNomina(P2, 'Allegria Service');
// P1 no ve el guardado de P2 (su refresco no llega) y aprueba con la versión vieja.
P1.estado.sinLectura = (id) => id === 'nominas_allegria_service';
await escribirNotas(P2, 'observación de P2');
P1.estado.sinLectura = null;
c0 = correos;
await aprobar(P1);
ta = await textoAviso(P1);
check('4f. Aprobación de P1 contra el cambio de P2 en la misma nómina: conflicto, NO se aprueba (pantalla ni base), 0 correos',
  /cambio de estado/.test(ta) && delDb('nominas_allegria_service', 'T4').estado === 'aprobada1' && delDb('nominas_allegria_service', 'T4').notas === 'observación de P2'
  && (await botonAprobar(P1)) === 1 && correos === c0, ta.slice(0, 160));
await P1.page.getByRole('button', { name: 'Usar la versión del servidor' }).click(); await P1.page.waitForTimeout(800);
await aprobar(P1);
check('4g. Tras resolver, la aprobación se hace (con la nota de P2 conservada) y salen los 2 correos',
  delDb('nominas_allegria_service', 'T4').estado === 'aprobada' && delDb('nominas_allegria_service', 'T4').notas === 'observación de P2' && correos - c0 === 2);

// ═══ 5. Pestaña con el código ANTIGUO ═══════════════════════════════════
const antes = filaDb('nominas_osiris');
ctl.etiqueta = 'código antiguo (prueba 5)';
const viejo = await P2.page.evaluate(async (valor) => {
  // Petición idéntica a dbSaveNominas de producción (origin/main).
  const r = await fetch('https://bywovqayuzodbzwsriet.supabase.co/rest/v1/calendario_data', { method: 'POST',
    headers: { apikey: 'x', Authorization: 'Bearer x', 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'nominas_osiris', value: valor, updated_at: new Date().toISOString() }) });
  return { status: r.status, texto: await r.text() };
}, filaNom('Osiris', [nom('nomA', 'Osiris', semana)]));
ctl.etiqueta = null;
const despues = filaDb('nominas_osiris');
// Sin el trigger (camino B), la base no puede distinguir una pestaña con código antiguo:
// es el riesgo abierto conocido (docs/nominas-guardado-condicionado.md). Se deja constancia.
check('5. [Riesgo abierto conocido] Upsert sin condición del código antiguo: la base lo ACEPTA (no hay trigger), igual que hoy en producción',
  (viejo.status === 200 || viejo.status === 201) && despues.version !== antes.version, `HTTP ${viejo.status}`);

// ═══ 6. La app nunca escribe nóminas sin condición ══════════════════════
const sinCondicion = registro.filter((r) => !r.rpc && r.metodo !== 'GET' && (filaNominaProtegida(r.id) || r.id === 'nominas') && !r.etiqueta
  && !((r.metodo === 'PATCH' && r.cond) || (r.metodo === 'POST' && !/merge-duplicates/.test(r.prefer))));
const llamadasRpc = registro.filter((r) => r.rpc);
check('6a. Toda escritura de la app a filas de nóminas va condicionada (PATCH con updated_at=eq o POST sin merge-duplicates)', sinCondicion.length === 0, JSON.stringify(sinCondicion.slice(0, 3)));
check('6b. La app NO llama a nominas_guardar (no existe en producción)', llamadasRpc.length === 0, `${llamadasRpc.length} llamadas`);
check('6c. Todas las filas de nóminas siguen en formato texto JSON', db.psql(`select count(*) from calendario_data where id like 'nominas\\_%' and jsonb_typeof(value) <> 'string' and id not in ('nominas_correlativos')`) === '0');
for (const q of [P1, P2]) check(`Sin errores de JavaScript (${q.nombre})`, q.errores.length === 0, q.errores.slice(0, 2).join(' | '));
fs.writeFileSync(path.join(OUT, 'registro-peticiones.json'), JSON.stringify(registro, null, 1));
await P1.browser.close(); await P2.browser.close();
db.cerrar();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nNóminas con guardado condicionado contra base real local (sin la propuesta): todos los casos OK');
process.exit(fallos ? 1 : 0);

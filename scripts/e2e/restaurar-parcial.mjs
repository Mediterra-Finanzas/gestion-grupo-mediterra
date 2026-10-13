/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — "📤 Restaurar" con resultado PARCIAL. SOLO DATOS DE PRUEBA.

   La app real contra Postgres 16 + PostgREST 12 LOCALES con la propuesta
   supabase/propuesta_nominas_version_obligatoria.sql aplicada tal cual
   (función + trigger). Producción, tiempo real y correo bloqueados.

   Respaldo de prueba con 5 filas:
     finanzas, nominas_tipos_doc → se restauran;
     nominas_osiris               → la base la RECHAZA (protección de Nóminas);
     maestro_tc                   → HTTP 500 simulado;
     osiris                       → sin red simulado.
   Comprueba que el aviso dice "RESTAURACIÓN PARCIAL", nombra cada fila con su
   motivo, no dice "exitoso", y que la base quedó exactamente así. Y que con
   todas las filas bien el aviso es de éxito completo.

     POSTGREST_BIN=/ruta/postgrest OUT_DIR=/tmp/rp node scripts/e2e/restaurar-parcial.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { nuevoStore } from './fake.mjs';
import { login } from './lib.mjs';
import { levantarBaseLocal, partesPropuesta } from '../nominas-cas/pglocal.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };

const db = await levantarBaseLocal({ pgPort: 54335, pgrstPort: 3916 });
const { parte1, parte2 } = partesPropuesta();
let p = db.psqlTexto(parte1); await db.recargarEsquema();
const p2 = db.psqlTexto(parte2);
check('0. Propuesta aplicada en la base local (función + trigger)', p.ok && p2.ok);
const dolar = (s) => `$v$${s}$v$`;
const sembrar = (id, valor, esTexto) => db.psql(`insert into calendario_data (id, value, updated_at) values ('${id}', ${esTexto ? `to_jsonb(${dolar(valor)}::text)` : `${dolar(valor)}::jsonb`}, now() - interval '1 hour')`);
for (const [id, f] of Object.entries(nuevoStore())) sembrar(id, typeof f.value === 'string' ? f.value : JSON.stringify(f.value), typeof f.value === 'string');
sembrar('nominas_v2_done', JSON.stringify({ migrado: true }), true);
sembrar('nominas_osiris', JSON.stringify({ empresa: 'Osiris', nominas: [{ id: 'ACTUAL', empresa: 'Osiris' }] }), true);
sembrar('maestro_tc', JSON.stringify({ 'USD-CLP': [{ fecha: '2026-10-01', valor: 950, fuente: 'manual' }] }), false);
sembrar('osiris', JSON.stringify({ actual: true }), false);
sembrar('nominas_tipos_doc', JSON.stringify(['Factura']), true);
const texto = (id) => db.psql(`select value::text from calendario_data where id = '${id}'`);
const antes = { nominas_osiris: texto('nominas_osiris'), maestro_tc: texto('maestro_tc'), osiris: texto('osiris') };

const escenario = { fallar: {} };   // id → 'red' | { status }
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 } });
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', async (route) => {
  const req = route.request(), u = new URL(req.url()), m = req.method();
  if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (!(u.pathname === '/rest/v1/calendario_data' || u.pathname.startsWith('/rest/v1/rpc/'))) return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...cors, 'content-range': '0-0/1' }, body: '{}' });
  let body = null; try { body = JSON.parse(req.postData() || 'null'); } catch (e) {}
  const id = body && !Array.isArray(body) ? body.id : null;
  const f = m === 'POST' && id ? escenario.fallar[id] : null;
  if (f === 'red') return route.abort('failed');
  if (f) return route.fulfill({ status: f.status, contentType: 'application/json', headers: cors, body: '{"message":"error simulado"}' });
  const resp = await route.fetch({ url: db.url + u.pathname.replace(/^\/rest\/v1/, '') + u.search, headers: { ...req.headers(), apikey: db.ANON, authorization: `Bearer ${db.ANON}` } });
  return route.fulfill({ status: resp.status(), headers: { ...resp.headers(), ...cors }, body: await resp.body() });
});
await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await ctx.route('**api.emailjs.com/**', (r) => r.fulfill({ status: 200, body: 'OK' }));
await ctx.route('**gestion-grupo-mediterra.vercel.app/**', (r) => r.fulfill({ status: 404, body: '' }));
await ctx.addInitScript(() => {
  const WSReal = window.WebSocket;
  window.WebSocket = function (url, prot) {
    if (String(url).includes('bywovqayuzodbzwsriet.supabase.co')) return { readyState: 0, url: String(url), send() {}, close() {}, addEventListener() {}, removeEventListener() {} };
    return prot !== undefined ? new WSReal(url, prot) : new WSReal(url);
  };
});
const page = await ctx.newPage();
const errores = [], alertas = [];
page.on('pageerror', (e) => errores.push(String(e)));
page.on('dialog', (d) => {
  if (d.type() === 'alert') alertas.push(d.message());
  (d.type() === 'prompt' ? d.accept('RESTAURAR') : d.accept()).catch(() => {});
});
await login(page);

async function restaurar(respaldo, nombre) {
  const archivo = path.join(OUT, nombre);
  fs.writeFileSync(archivo, JSON.stringify(respaldo));
  alertas.length = 0;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Restaurar/ }).first().click()]);
  await chooser.setFiles(archivo);
  for (let i = 0; i < 40 && !alertas.length; i++) await page.waitForTimeout(250);
  await page.waitForTimeout(2500);   // recarga
  return alertas[0] || '';
}
const respaldo = { fecha: '2026-09-30T21:00:00.000Z', usuario: 'Prueba', version: 'Mediterra Hub Backup v1', tablas: {
  finanzas: { data: { restaurado: 'finanzas del respaldo' } },
  nominas_osiris: { data: JSON.stringify({ empresa: 'Osiris', nominas: [{ id: 'DEL_RESPALDO', empresa: 'Osiris' }] }) },
  maestro_tc: { data: { 'USD-CLP': [] } },
  osiris: { data: { delRespaldo: true } },
  nominas_tipos_doc: { data: JSON.stringify(['Factura', 'Boleta']) },
} };
escenario.fallar = { maestro_tc: { status: 500 }, osiris: 'red' };
const msg = await restaurar(respaldo, 'respaldo-parcial.json');
fs.writeFileSync(path.join(OUT, 'aviso-parcial.txt'), msg);
check('1. Aviso "RESTAURACIÓN PARCIAL: se restauraron 2 de 5" y NO dice éxito', /RESTAURACIÓN PARCIAL: se restauraron 2 de 5/.test(msg) && !/✅|exitosamente/.test(msg), msg.split('\n')[0]);
check('2. Nombra cada fila NO restaurada con su motivo (protección de Nóminas, HTTP 500, sin conexión)',
  /nominas_osiris: rechazada por la protección de Nóminas/.test(msg) && /maestro_tc: error del servidor \(HTTP 500\)/.test(msg) && /osiris: sin conexión/.test(msg));
check('3. Lista las restauradas y advierte que los datos quedaron mezclados', /• finanzas/.test(msg) && /• nominas_tipos_doc/.test(msg) && /MEZCLADOS/.test(msg));
check('4. La base quedó EXACTAMENTE así: finanzas y nominas_tipos_doc restauradas; nominas_osiris, maestro_tc y osiris sin cambio',
  /finanzas del respaldo/.test(texto('finanzas')) && /Boleta/.test(texto('nominas_tipos_doc'))
  && texto('nominas_osiris') === antes.nominas_osiris && texto('maestro_tc') === antes.maestro_tc && texto('osiris') === antes.osiris);
// Todo bien → éxito completo
escenario.fallar = {};
await login(page).catch(() => {});
const msg2 = await restaurar({ ...respaldo, tablas: { finanzas: respaldo.tablas.finanzas, maestro_tc: respaldo.tablas.maestro_tc } }, 'respaldo-completo.json');
check('5. Con todas las filas bien: "✅ Respaldo restaurado: 2 de 2 filas"', /✅ Respaldo restaurado: 2 de 2 filas/.test(msg2) && !/PARCIAL/.test(msg2), msg2.split('\n')[0]);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close(); db.cerrar();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nRestaurar con resultado parcial: todos los casos OK');
process.exit(fallos ? 1 : 0);

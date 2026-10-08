/* ─────────────────────────────────────────────────────────────────────────
   ROLLBACK DE CÓDIGO después de trasladar remuneraciones (navegador, Supabase
   falso, datos FICTICIOS). Una sola base para tres etapas:
     1. RAMA   (APP_RAMA): Angelo aplica la matriz, activa la regla de pago y traslada
                b, c (nómina aprobada → conserva total) y x (nómina en borrador → circuito).
     2. MAIN   (APP_MAIN): la versión publicada sobre esos mismos datos. Qué ve cada
                uno, qué pasa con pagos, totales y documentos, y qué escribe.
     3. RAMA otra vez: ¿quedó todo como estaba?
   Rollback de CÓDIGO ≠ reversión de DATOS: aquí no se revierte ningún dato.
   Uso: APP_RAMA=http://127.0.0.1:4195 APP_MAIN=http://127.0.0.1:4196 node scripts/e2e/rollback-remuneraciones.mjs
   ───────────────────────────────────────────────────────────────────────── */
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { armarStore, SECRETOS } from './store-remuneraciones.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

let ok = 0, fallos = 0;
const hallazgos = [];
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };
const informa = (n, x) => { hallazgos.push(`${n}: ${x}`); console.log(`ℹ  ${n} — ${x}`); };

const st = armarStore();
// Una rendición aprobada para ver quién puede pagar con cada versión.
st.rendiciones = { updated_at: new Date().toISOString(), value: [{ id: 'r1', folio: 1, estado: 'aprobada', titulo: 'Rend 1', trabajador: 'Pedro Pérez',
  trabajadorEmail: 'pedro@x.cl', monedaPago: 'CLP', gastos: [{ id: 'g1', fecha: '2026-10-01', monto: 1000, moneda: 'CLP', categoria: 'otros', adjuntoUrl: 'u' }], historial: [] }] };
st.rendiciones_config = { updated_at: new Date().toISOString(), value: { aprobadores: {} } };
st.maestro_tc = { updated_at: new Date().toISOString(), value: {} };

async function sesion(url, email) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  const escrituras = []; ctx.on('request', r => { if (/calendario_data/.test(r.url()) && r.method() !== 'GET') { const m = /"id":"([^"]+)"/.exec(r.postData() || '') || /id=eq\.([^&]+)/.exec(r.url()); escrituras.push(m ? decodeURIComponent(m[1]) : '?'); } });
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'motivo e2e' : undefined).catch(() => {}));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { browser, page, escrituras };
}
const txt = async (p) => (await p.locator('body').innerText()) + '\n' + (await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].map(e => e.value).join('\n')));
async function finanzas(p) { await p.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await p.waitForTimeout(3500); }
async function nominas(p) { await finanzas(p); await p.getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(2500); }
const abrirNomina = async (p, empresa) => { await p.locator('tr', { hasText: empresa }).getByRole('button', { name: /Editar|Ver/ }).first().click(); await p.waitForTimeout(1800); };
const nomDe = (id) => leerFila(st, 'nominas').nominas.find(n => n.id === id);
const totalCLP = (n) => n.items.filter(i => (i.estadoLinea || 'activa') === 'activa').reduce((s, i) => s + (Number(i.montoCLP) || 0), 0);
const foto = (ids) => JSON.stringify(ids.map(id => leerFila(st, id)));

// ── 1. RAMA ──
let s = await sesion(process.env.APP_RAMA, 'ahuerta@grupomediterra.cl');
await s.page.getByRole('button', { name: /Permisos/ }).first().click(); await s.page.waitForTimeout(800);
await s.page.getByTestId('matriz-previa').click(); await s.page.waitForTimeout(300);
await s.page.getByTestId('matriz-aplicar').click(); await s.page.waitForTimeout(3000);
await s.page.getByTestId('modo-activar').click(); await s.page.waitForTimeout(2000);
await s.page.getByRole('button', { name: /Cerrar ×/ }).first().click();
await nominas(s.page);
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(1200);
await s.page.getByTestId('rem-revision').click(); await s.page.waitForTimeout(300);
for (const [texto, clase] of [['Juan Pérez'], ['María Soto', 'sueldo'], ['Pedro Borrador']]) {
  const fila = s.page.locator('tr[data-testid="rem-candidato"]', { hasText: texto });
  if (clase) await fila.getByTestId('rem-cand-clase').selectOption(clase);
  await fila.getByTestId('rem-cand-trasladar').click(); await s.page.waitForTimeout(2500);
}
await s.page.waitForTimeout(1500);
await s.browser.close();
check('Rama: traslados hechos (nómina aprobada con agregado 1.100.000; borrador sin la línea)', totalCLP(nomDe('nomG')) === 2700000 && nomDe('nomG').items.some(i => i.agregadoRem) && totalCLP(nomDe('nomB')) === 50000);
const antes = foto(['permisos_facultades', 'nominas_remuneraciones', 'nominas']);
const usuAntes = JSON.stringify(leerFila(st, 'usuarios').map(u => [u.nombre, u.tab_permisos?.frisku?.liquidaciones || null]));

// ── 2. MAIN (rollback de código) ──
s = await sesion(process.env.APP_MAIN, 'cmachuca@grupomediterra.cl');
await nominas(s.page);
await abrirNomina(s.page, 'Allegria Foods');
let t = await txt(s.page);
check('Main · Carol: total de la nómina aprobada conservado (2.700.000)', /2\.700\.000/.test(t));
check('Main · Carol: sin nombres ni documentos de las líneas trasladadas', !SECRETOS.test(t) && !/doc1_vale/.test(t));
const agregadoEditable = await s.page.locator('input').evaluateAll(els => els.some(e => e.value === 'Remuneraciones (detalle restringido)' && !e.disabled && !e.readOnly));
informa('Main · Carol', agregadoEditable ? 'la línea agregada aparece como una línea normal de «Anticipos de Sueldo» y main la deja EDITAR o inactivar (no conoce la regla de solo lectura)' : 'la línea agregada no es editable');
await s.page.getByRole('button', { name: '← Volver', exact: true }).first().click(); await s.page.waitForTimeout(1200);
await abrirNomina(s.page, 'Allegria Service');
t = await txt(s.page);
informa('Main · nómina en borrador', /Pedro Borrador|300\.000/.test(t) ? 'la línea trasladada sigue visible (inesperado)' : 'la línea que pasó al circuito de remuneraciones NO aparece: main no muestra la nómina de remuneraciones, así que ese pago queda fuera de la vista hasta volver a la rama');
check('Main · Carol: no escribió la fila de remuneraciones ni la de facultades', !s.escrituras.some(id => /nominas_remuneraciones|permisos_facultades/.test(id)), s.escrituras.join(','));
await s.browser.close();

s = await sesion(process.env.APP_MAIN, 'mgarcia@grupomediterra.cl');
await finanzas(s.page);
await s.page.getByRole('button', { name: /Rendiciones/ }).first().click(); await s.page.waitForTimeout(2000);
const pagos = s.page.getByRole('button', { name: /Pagos/ });
let michellePaga = false;
if (await pagos.count()) { await pagos.first().click(); await s.page.waitForTimeout(800); michellePaga = (await s.page.getByRole('button', { name: 'Marcar pagada' }).count()) > 0; }
informa('Main · pagos de rendiciones', michellePaga ? 'Michelle (ve todas, sin la facultad) puede marcar pagada: main usa su regla y no lee la fila de facultades' : 'Michelle no ve «Marcar pagada»');
await s.browser.close();

s = await sesion(process.env.APP_MAIN, 'ahuerta@grupomediterra.cl');
await nominas(s.page);
informa('Main · Angelo', (await s.page.getByTestId('rem-abrir').count()) ? 've la nómina de remuneraciones (inesperado)' : 'no hay pantalla de remuneraciones: no se pueden preparar ni aprobar nóminas de remuneraciones hasta volver a la rama; los datos siguen en su fila');
await s.browser.close();
check('Main no modificó facultades, remuneraciones ni nóminas', foto(['permisos_facultades', 'nominas_remuneraciones', 'nominas']) === antes);
check('Main conservó las pestañas de Frisku configuradas en la ficha', JSON.stringify(leerFila(st, 'usuarios').map(u => [u.nombre, u.tab_permisos?.frisku?.liquidaciones || null])) === usuAntes);
const fr = leerFila(st, 'nominas_remuneraciones');
check('Documentos: la referencia del respaldo sigue en la fila restringida', fr.nominas.flatMap(n => n.items).some(i => (i.documentos || []).some(d => d.path === 'nominas/allegria_foods/nomG/b/doc1_vale.pdf')));

// ── 3. RAMA otra vez ──
s = await sesion(process.env.APP_RAMA, 'ahuerta@grupomediterra.cl');
check('De vuelta en la rama: la regla de la matriz sigue activa (sin aviso de transición)', (await s.page.getByTestId('aviso-transicion').count()) === 0 && leerFila(st, 'permisos_facultades').modo === 'matriz');
await nominas(s.page);
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(1200);
await s.page.getByTestId('rem-revision').click(); await s.page.waitForTimeout(300);
check('De vuelta en la rama: los 3 traslados siguen ahí', (await s.page.getByTestId('rem-traslado').count()) === 3);
await s.browser.close();

console.log('\nHallazgos (no son fallas de la prueba; van al documento):'); hallazgos.forEach(h => console.log(' · ' + h));
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios`);
process.exit(fallos ? 1 : 0);

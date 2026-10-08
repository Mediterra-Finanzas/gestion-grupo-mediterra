/* ─────────────────────────────────────────────────────────────────────────
   REMUNERACIONES SEPARADAS (navegador, Supabase falso, datos FICTICIOS).

   A. Carol: las líneas de clasificación EXPLÍCITA (Anticipos de Sueldo / tipo
      Remuneraciones) se ven como UN agregado sin nombres; el total no cambia; las
      sugerencias por palabras («anticipo a proveedor») siguen normales; al guardar
      no se pierde nada; nunca pide la fila de remuneraciones.
   B. Fallo de lectura de permisos_facultades: aviso + Reintentar.
   C. Angelo: matriz, regla de pago; revisión; traslado de una nómina APROBADA
      (conserva versión aprobada con huella y total) y de una en BORRADOR (pasa al
      circuito); Dashboard y Flujo idénticos antes y después; reversión de datos.
   D. Lucía aprueba la nómina que vino del borrador · Cristobal aprueba otra.
   Uso: APP_URL=http://127.0.0.1:4195 OUT_DIR=/tmp/rem node scripts/e2e/remuneraciones.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { instalarFake, leerFila, PIN } from './fake.mjs';
import { armarStore, SECRETOS } from './store-remuneraciones.mjs';
import { huella } from '../../src/remuneraciones/modelo.js';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

const st = armarStore();
const nomGOriginal = JSON.parse(st.nominas.value).nominas[0];

async function sesion(email) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  const pedidos = []; ctx.on('request', r => { if (/calendario_data/.test(r.url())) pedidos.push(decodeURIComponent(r.url())); });
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push((String(e) + ' ' + String(e?.stack || '').slice(0, 300)).slice(0, 400)));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'motivo de prueba e2e' : undefined).catch(() => {}));
  await page.goto(process.env.APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { browser, page, errores, pedidos };
}
// Texto visible + valores de campos editables (los nombres de línea se muestran en inputs).
const txt = async (p) => (await p.locator('body').innerText()) + '\n' +
  (await p.evaluate(() => [...document.querySelectorAll('input,select,textarea')].map(e => e.value).join('\n')));
async function finanzas(p) { await p.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await p.waitForTimeout(3500); }
async function nominas(p) { await finanzas(p); await p.getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(2500); }
const filaRem = () => leerFila(st, 'nominas_remuneraciones');
const nomDe = (id) => leerFila(st, 'nominas').nominas.find(n => n.id === id);
const totalCLP = (n) => n.items.filter(i => (i.estadoLinea || 'activa') === 'activa').reduce((s, i) => s + (Number(i.montoCLP) || 0), 0);
const pidioRem = (s) => s.pedidos.some(u => /nominas_remuneraciones/.test(u));
const abrirNomina = async (p, empresa) => { await p.locator('tr', { hasText: empresa }).getByRole('button', { name: /Editar|Ver/ }).first().click(); await p.waitForTimeout(1800); };

// ── A. Carol ──
let s = await sesion('cmachuca@grupomediterra.cl');
await nominas(s.page);
let t = await txt(s.page);
check('Carol: aviso de remuneraciones mostradas como agregado (3 líneas en 2 nóminas)', /3 líneas de remuneraciones en estas nóminas/.test(t), t.match(/\d+ línea[^\n]{0,80}/)?.[0]);
check('Carol: sin nombres de trabajadores', !SECRETOS.test(t));
check('Carol: sin acceso a la nómina de remuneraciones', !(await s.page.getByTestId('rem-abrir').count()));
await abrirNomina(s.page, 'Allegria Foods');
t = await txt(s.page);
check('Carol (aprobada): agregado de solo lectura con 1.100.000, sin el detalle', (await s.page.getByTestId('fila-agregado-rem').count()) === 1 && /1\.100\.000/.test(t) && !SECRETOS.test(t) && !/doc1_vale/.test(t));
check('Carol (aprobada): la sugerencia «Anticipo a proveedor» sigue visible y normal', /Agrícola Norte/.test(t) && /Anticipo a proveedor/.test(t));
check('Carol (aprobada): el total aprobado no cambia (2.700.000)', /2\.700\.000/.test(t));
await s.page.getByRole('button', { name: '← Volver', exact: true }).first().click(); await s.page.waitForTimeout(1200);
await abrirNomina(s.page, 'Allegria Service');
await s.page.getByRole('button', { name: /\+ Agregar fila/ }).first().click(); await s.page.waitForTimeout(3000);
let nb = nomDe('nomB');
check('Carol guarda (borrador): la línea nueva se agrega y la de remuneraciones sigue en la base, sin agregado guardado',
  nb.items.length === 3 && nb.items.some(i => i.id === 'x' && i.montoCLP === 300000) && !nb.items.some(i => i._agregadoVista), nb.items.map(i => i.id).join(','));
check('Carol: nunca pidió la fila de remuneraciones', !pidioRem(s));
check('Carol: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── B. Fallo de lectura de permisos_facultades ──
st.__fallarLecturas = new Set(['permisos_facultades']);
s = await sesion('ahuerta@grupomediterra.cl');
check('Facultades sin leer: aviso visible con Reintentar', (await s.page.getByTestId('aviso-facultades-error').count()) === 1);
st.__fallarLecturas = new Set();
await s.page.getByTestId('facultades-reintentar').click(); await s.page.waitForTimeout(1500);
check('Reintentar con la base disponible: el aviso desaparece y queda el de transición', (await s.page.getByTestId('aviso-facultades-error').count()) === 0 && (await s.page.getByTestId('aviso-transicion').count()) === 1);
// Matriz + regla de pago (panel)
await s.page.getByRole('button', { name: /Permisos/ }).first().click(); await s.page.waitForTimeout(1000);
await s.page.getByTestId('matriz-previa').click(); await s.page.waitForTimeout(300);
await s.page.getByTestId('matriz-aplicar').click(); await s.page.waitForTimeout(3000);
await s.page.getByTestId('modo-activar').click(); await s.page.waitForTimeout(2000);
check('Matriz aplicada y regla de la matriz activa', leerFila(st, 'permisos_facultades')?.modo === 'matriz');
await s.browser.close();

// ── C. Angelo: revisión, traslados, agregados de Finanzas ──
s = await sesion('ahuerta@grupomediterra.cl');
check('Regla activa: ya no aparece el aviso de transición', (await s.page.getByTestId('aviso-transicion').count()) === 0);
await finanzas(s.page);
const dashAntes = await s.page.locator('body').innerText();
await s.page.getByRole('button', { name: /Flujo Empresas/ }).first().click(); await s.page.waitForTimeout(2500);
const flujoAntes = await s.page.locator('body').innerText();
await s.page.getByRole('button', { name: /Nóminas/ }).first().click(); await s.page.waitForTimeout(2500);
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(1500);
await s.page.getByTestId('rem-revision').click(); await s.page.waitForTimeout(400);
check('Revisión: 3 explícitas y 1 sugerencia, nada reclasificado solo', (await s.page.getByTestId('rem-candidato').count()) === 3 && (await s.page.getByTestId('rem-sugerencia').count()) === 1);
const trasladar = async (texto, clase) => {
  const fila = s.page.locator('tr[data-testid="rem-candidato"]', { hasText: texto });
  if (clase) await fila.getByTestId('rem-cand-clase').selectOption(clase);
  await fila.getByTestId('rem-cand-trasladar').click(); await s.page.waitForTimeout(2500);
};
await trasladar('Juan Pérez');            // clase sugerida: anticipo (sección)
await trasladar('María Soto', 'sueldo');
await trasladar('Pedro Borrador');        // nómina en borrador → circuito
await s.page.waitForTimeout(1500);
const g = nomDe('nomG'), fr = filaRem();
check('Aprobada: estado y aprobación intactos, total igual (2.700.000)', g.estado === 'aprobada' && g.aprobadoPor === 'Angelo Huerta' && totalCLP(g) === 2700000, String(totalCLP(g)));
check('Aprobada: un agregado (1.100.000, 2 líneas) en «anticipos», sin nombres ni documentos',
  g.items.filter(i => i.agregadoRem).length === 1 && g.items.find(i => i.agregadoRem).montoCLP === 1100000 && !SECRETOS.test(JSON.stringify(g.items)) && !/doc1_vale/.test(JSON.stringify(g.items)));
const hv = huella(nomGOriginal);
check('Versión aprobada conservada: copia completa + huella en la fila restringida', fr.versionesAprobadas?.[0]?.huella === hv && fr.versionesAprobadas[0].copia.items.length === 4, `${fr.versionesAprobadas?.[0]?.huella} vs ${hv}`);
check('Rectificaciones visibles en la nómina, con la huella y sin montos', g.rectificaciones.length === 2 && g.rectificaciones.every(r => r.huellaVersionAprobada === hv) && !/200000|900000/.test(JSON.stringify(g.rectificaciones)));
const copiaB = fr.nominas.flatMap(n => n.items).find(i => i.origen?.itemId === 'b');
check('Documentos: el respaldo viaja con la línea trasladada', copiaB?.documentos?.[0]?.path === 'nominas/allegria_foods/nomG/b/doc1_vale.pdf');
check('Histórica: no queda como nómina por pagar', fr.nominas.find(n => n.items.some(i => i.origen?.itemId === 'b')).estado === 'historica');
nb = nomDe('nomB');
const circ = fr.nominas.find(n => n.items.some(i => i.origen?.itemId === 'x'));
check('Borrador: la línea sale de la general (rectificación) y entra al circuito; nada se duplica ni se omite',
  totalCLP(nb) === 50000 + 0 && nb.rectificaciones?.[0]?.modo === 'circuito' && circ.estado === 'borrador' && circ.items[0].montoCLP === 300000,
  `general ${totalCLP(nb)} · rem ${circ?.items?.[0]?.montoCLP}`);
// Agregados de Finanzas: Dashboard y Flujo no dependen de las nóminas
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(500);
await s.page.getByRole('button', { name: /Dashboard/ }).first().click(); await s.page.waitForTimeout(2000);
const dashDespues = await s.page.locator('body').innerText();
await s.page.getByRole('button', { name: /Flujo Empresas/ }).first().click(); await s.page.waitForTimeout(2500);
const flujoDespues = await s.page.locator('body').innerText();
const cifras = (x) => (x.match(/-?\d[\d.,]{2,}/g) || []).filter(n => !/^\d{1,2}[.,]\d{2}$/.test(n)).join(' ');
check('Dashboard: mismas cifras antes y después del traslado', cifras(dashAntes) === cifras(dashDespues), `${cifras(dashAntes).length} car.`);
check('Flujo Empresas: mismas cifras antes y después del traslado', cifras(flujoAntes) === cifras(flujoDespues), `${cifras(flujoAntes).length} car.`);
// Circuito: Angelo envía la nómina que vino del borrador
await s.page.getByRole('button', { name: /Nóminas/ }).first().click(); await s.page.waitForTimeout(2000);
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(1200);
await s.page.locator('tr', { has: s.page.getByTestId(`rem-estado-${circ.id}`) }).getByRole('button', { name: 'Abrir' }).click(); await s.page.waitForTimeout(400);
await s.page.getByTestId('rem-enviar').click(); await s.page.waitForTimeout(2000);
check('Angelo envía a aprobación la nómina del circuito', filaRem().nominas.find(n => n.id === circ.id).estado === 'preparada');
check('Angelo no puede aprobar lo que preparó', !(await s.page.getByTestId('rem-aprobar').count()));
// Reversión de datos del traslado de María Soto (histórica)
await s.page.getByTestId('rem-detalle').getByRole('button', { name: '← Volver' }).click(); await s.page.waitForTimeout(300);
await s.page.getByTestId('rem-revision').click(); await s.page.waitForTimeout(300);
await s.page.locator('tr[data-testid="rem-traslado"]', { hasText: 'María Soto' }).getByTestId('rem-revertir').click(); await s.page.waitForTimeout(3000);
const g2 = nomDe('nomG');
check('Reversión: la línea vuelve tal cual, el agregado baja a 200.000, el total sigue en 2.700.000',
  g2.items.find(i => i.id === 'c')?.proveedor === 'María Soto' && g2.items.find(i => i.agregadoRem)?.montoCLP === 200000 && totalCLP(g2) === 2700000 && g2.rectificaciones.at(-1).tipo === 'reversion_traslado');
check('Reversión: la copia restringida queda marcada (no se borra)', !!filaRem().nominas.flatMap(n => n.items).find(i => i.origen?.itemId === 'c')?.revertida);
check('Angelo: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── D. Aprobaciones ──
async function aprobarComo(email, nomId, nombre) {
  const x = await sesion(email);
  await nominas(x.page);
  await x.page.getByTestId('rem-abrir').click(); await x.page.waitForTimeout(1500);
  await x.page.locator('tr', { has: x.page.getByTestId(`rem-estado-${nomId}`) }).getByRole('button', { name: 'Abrir' }).click();
  await x.page.waitForTimeout(400);
  const puede = (await x.page.getByTestId('rem-aprobar').count()) === 1;
  if (puede) { await x.page.getByTestId('rem-aprobar').click(); await x.page.waitForTimeout(2000); }
  const n = filaRem().nominas.find(k => k.id === nomId);
  check(`${nombre} aprueba (basta uno)`, puede && n.estado === 'aprobada' && n.aprobadoPor === nombre, `${n.estado} ${n.aprobadoPor}`);
  check(`${nombre}: sin errores de página`, x.errores.length === 0, x.errores.join(' | '));
  await x.browser.close();
}
await aprobarComo('lucia@ficticio.cl', circ.id, 'Lucía Corbetto');
await aprobarComo('cristobal@ficticio.cl', 'rem_seed', 'Cristobal Ortiz');

// ── E. Carol y Michelle después ──
s = await sesion('cmachuca@grupomediterra.cl');
await nominas(s.page);
await abrirNomina(s.page, 'Allegria Foods');
t = await txt(s.page);
check('Carol después: agregado único 1.100.000 (traslado + línea revertida pendiente), total 2.700.000, sin nombres', /1\.100\.000/.test(t) && /2\.700\.000/.test(t) && !SECRETOS.test(t));
check('Carol después: ve las rectificaciones (sin montos)', (await s.page.getByTestId('rectificaciones-nomina').count()) === 1);
check('Carol después: su navegador no pidió la fila de remuneraciones', !pidioRem(s));
await s.browser.close();
s = await sesion('mgarcia@grupomediterra.cl');
await nominas(s.page);
check('Michelle: sin acceso a remuneraciones', !(await s.page.getByTestId('rem-abrir').count()) && !pidioRem(s));
await s.browser.close();

fs.writeFileSync(path.join(OUT, 'store-final.json'), JSON.stringify(Object.fromEntries(Object.keys(st).filter(k => !k.startsWith('__')).map(k => [k, leerFila(st, k)])), null, 1));
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios`);
process.exit(fallos ? 1 : 0);

/* ─────────────────────────────────────────────────────────────────────────
   Prueba la VISTA PREVIA FUNCIONAL (scripts/vista-previa) tal como la abrirá
   Angelo: sin interceptar nada desde fuera, solo con el Supabase simulado del
   navegador (shim.js). Recorre la pauta de revisión:
     cuotas + pago parcial · bullet · prepago · UF · persistencia y reinicio.
   Además comprueba que NINGUNA llamada sale hacia el Supabase de producción.

     node scripts/vista-previa/armar.mjs --out /tmp/vp && node scripts/vista-previa/servir.mjs /tmp/vp &
     VP_URL=http://127.0.0.1:4180 OUT_DIR=/tmp/vpf node scripts/e2e/vista-previa-funcional.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { cerrarAvisos, entrarFinanzas, subTab, inputTras, ponerNumero } from './lib.mjs';
import { estadoCredito } from '../../src/creditos.js';

const URL0 = process.env.VP_URL || 'http://127.0.0.1:4180';
const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 } });
let aProduccion = 0;
await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', r => { aProduccion++; return r.abort(); });
// En el visor real, window.claude.use('downloads') guarda previa confirmación del usuario.
await ctx.addInitScript(() => {
  window.__guardados = [];
  window.claude = { use: async (n) => n === 'downloads' ? { save: async (r) => { window.__guardados.push(r); return { status: 'saved' }; } } : null };
});
const page = await ctx.newPage();
const errores = []; page.on('pageerror', e => errores.push(String(e)));
let wsProduccion = 0; page.on('websocket', ws => { if (ws.url().includes('bywovqayuzodbzwsriet')) wsProduccion++; });
page.on('dialog', d => (d.type() === 'prompt' ? d.accept('Prueba pauta') : d.accept()).catch(() => {}));
const store = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__VP_STORE)));
const cred = async (uid) => { const s = await store(); const v = typeof s.finanzas.value === 'string' ? JSON.parse(s.finanzas.value) : s.finanzas.value; return v.creditos_data.find(c => c.uid === uid); };
const hoy = new Date(); const HOY = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

async function entrar(ruta) {
  await page.goto(URL0 + ruta, { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[type=email]'), hub = page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ });
  const dentro = page.getByRole('button', { name: /📊 Dashboard/ });   // la app recuerda el último módulo
  try { await email.or(hub).or(dentro).first().waitFor({ timeout: 20000 }); }
  catch (e) { await foto(page, 'fallo-entrar'); throw e; }
  if (await email.count()) {
    await email.fill('ahuerta@grupomediterra.cl');
    await page.locator('input[type=password]').fill('482913');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
  }
  await cerrarAvisos(page);
  if (!(await dentro.count())) await entrarFinanzas(page);
  await subTab(page, /💳 Créditos/); await page.waitForTimeout(800);
}

await entrar('/');
check('Barra "VISTA PREVIA · DATOS SIMULADOS" visible', await page.locator('#vp-barra').isVisible());
const t0 = await page.locator('body').innerText();
check('Créditos de la pauta cargados (Banco Demo, Bullet, Prepago, UF)', ['Banco Demo', 'Banco Bullet Demo', 'Banco Prepago Demo', 'Banco UF Demo'].every(a => t0.includes(a)));
await foto(page, 'f01-creditos');

// ── 1+3. Crédito con cuotas: pago parcial de la cuota 10-10 (interés completo + capital 25.911,11)
const filaA = page.locator('tr', { hasText: 'Banco Demo' }).filter({ hasText: 'Osiris' }).first();
await filaA.getByRole('button', { name: /Pagos/ }).click(); await page.waitForTimeout(600);
const filaQ3 = page.locator('tr', { hasText: '10/10/2026' }).first();
await filaQ3.getByRole('button', { name: /💵 Pagar/ }).click(); await page.waitForTimeout(300);
await inputTras(page, 'Fecha efectiva').fill(HOY);
await ponerNumero(page, 'Capital', '25911,11');
await ponerNumero(page, 'Intereses', '4088,89');
await page.getByRole('button', { name: /💾 Registrar pago/ }).click(); await page.waitForTimeout(1200);
let A = await cred('A');
const q3 = estadoCredito(A, HOY).vencimientos.find(v => v.fecha === '2026-10-10');
// 104.088,89 − (25.911,11 + 4.088,89) = 74.088,89 pendiente, estado parcial
check('Pago parcial guardado: cuota 10-10 pendiente 104.088,89 − 30.000 = 74.088,89 (parcial)', Math.abs(q3.pendienteTotal - 74088.89) < 0.01 && q3.parcial, `${q3.pendienteTotal}`);
await foto(page, 'f02-pago-parcial');
await page.getByRole('button', { name: '×' }).first().click(); await page.waitForTimeout(300);

// ── 2. Bullet: intereses semestrales y capital al vencimiento
const filaG = page.locator('tr', { hasText: 'Banco Bullet Demo' }).first();
await filaG.getByRole('button', { name: /Pagos/ }).click(); await page.waitForTimeout(600);
const tG = await page.locator('table').filter({ hasText: 'Vencimiento' }).first().innerText();
check('Bullet: 15-10-2026 interés 7.520,55 y 15-04-2027 capital 250.000 + interés 7.479,45', tG.includes('7,520.55') && tG.includes('250,000.00') && tG.includes('7,479.45'));
await foto(page, 'f03-bullet');
await page.getByRole('button', { name: '×' }).first().click(); await page.waitForTimeout(300);

// ── 4. Prepago parcial 100.000 el 15-10-2026 (reduce plazo) y aplicar
await subTab(page, /Simular prepago/);
const opt = await page.locator('select').first().locator('option', { hasText: 'Banco Prepago Demo' }).getAttribute('value');
await page.locator('select').first().selectOption(opt);
await inputTras(page, 'Fecha del prepago').fill('2026-10-15');
await page.locator('xpath=//div[normalize-space(text())="Alcance"]/following::select[1]').selectOption('parcial');
await ponerNumero(page, 'Capital a prepagar (USD)', '100000');
await page.waitForTimeout(600);
const tP = await page.locator('body').innerText();
// devengado 100.000 × 7,2 % × 14/360 = 280,00 · comisión 1 % = 1.000,00
check('Prepago parcial: devengado 280.00 y comisión 1,000.00 en pantalla', tP.includes('280.00') && tP.includes('1,000.00'));
await foto(page, 'f04-prepago');
await page.getByRole('button', { name: /Aplicar prepago/ }).click(); await page.waitForTimeout(1500);
const H = await cred('H');
check('Prepago aplicado: pago tipo prepago (100.000 + 280 + 1.000) y evento de capital', (H.pagos || []).some(p => p.tipo === 'prepago' && Math.abs(p.capital - 100000) < 0.01) && (H.prepagos || []).length === 1);

// ── 5. UF: conciliación con 4 decimales y contraste de la UF usada
await subTab(page, /Conciliación/); await page.waitForTimeout(800);
const filaUF = await page.locator('table').filter({ hasText: 'Capital informado' }).first().locator('tr', { hasText: 'Banco UF Demo' }).first().innerText();
check('UF: diferencia exacta 0.0003 UF con tolerancia 0.0001 → "Diferencia de capital"', /0\.0003 UF/.test(filaUF) && /0\.0001/.test(filaUF) && /Diferencia/.test(filaUF), filaUF.replace(/\s+/g, ' '));
const cardUF = page.locator('table').filter({ hasText: 'UF usada' }).first();
const tUF = await cardUF.innerText();
check('Contraste UF: cuota 09/10/2026 usa la UF publicada de esa fecha (40,131.84)', /09\/10\/2026[\s\S]*40,131\.84[\s\S]*valor de esa fecha/.test(tUF), tUF.replace(/\s+/g, ' ').slice(0, 300));
check('Contraste UF: cuota 09/04/2027 sin UF publicada → HIPÓTESIS con la última UF y su fecha', /09\/04\/2027[\s\S]*40,118\.27[\s\S]*HIPÓTESIS/.test(tUF));
check('Contraste UF: aviso "pendiente de prueba en vivo" visible', /pendiente de prueba en vivo/i.test(await page.locator('body').innerText()));
await cardUF.scrollIntoViewIfNeeded(); await foto(page, 'f05-uf');

// ── Nóminas: vincular (borrador) no paga; confirmar pago efectivo (aprobada) sí
await subTab(page, /Nóminas/); await page.waitForTimeout(1500);
const abrirNom = async (re) => {
  const btns = page.getByRole('button', { name: /Editar|Ver/ });
  for (let i = 0; i < await btns.count(); i++) {
    const fila = btns.nth(i).locator('xpath=ancestor::tr[1]');
    if (re.test(await fila.innerText())) { await btns.nth(i).click(); await page.waitForTimeout(1200); return true; }
  }
  return false;
};
const nomStore = async () => JSON.parse((await store()).nominas_osiris.value).nominas;
const pagosA0 = ((await cred('A')).pagos || []).filter(p => !p.anulado).length;
check('Nómina en borrador de la semana en curso se abre', await abrirNom(/Borrador/));
await page.getByRole('button', { name: /🏦 Vincular/ }).first().click(); await page.waitForTimeout(300);
const selV = page.locator('select').filter({ hasText: 'elegir vencimiento pendiente' }).first();
await selV.selectOption(await selV.locator('option', { hasText: '10/01/2027' }).first().getAttribute('value'));
await page.getByRole('button', { name: /^Vincular$/ }).click(); await page.waitForTimeout(2000);
check('Vincular en borrador guarda el vínculo y NO registra pagos', (await nomStore()).find(n => n.id === 'NOMZ').items[0].creditoVinculo?.vencKey === 'A@2027-01-10'
  && ((await cred('A')).pagos || []).filter(p => !p.anulado).length === pagosA0);
await page.getByRole('button', { name: /Volver|←/ }).first().click().catch(() => {}); await page.waitForTimeout(1000);
let confirmado = false;
await page.locator('button', { hasText: '‹' }).first().click(); await page.waitForTimeout(1200);   // semana anterior
if (await abrirNom(/Aprobada/) && await page.getByRole('button', { name: /Confirmar pago efectivo/ }).count()) {
  await page.getByRole('button', { name: /Confirmar pago efectivo/ }).first().click(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Registrar en Créditos/ }).click(); await page.waitForTimeout(2000);
  confirmado = true;
}
const pNomY = ((await cred('A')).pagos || []).find(p => p.origen?.clave === 'nomina:NOMY:IT2' && !p.anulado);
// 30.000 a la cuota 10-10 (ya con 30.000 de abono manual): interés pendiente 0 → todo a capital
check('Confirmar pago efectivo (nómina aprobada de la semana anterior) registra UN pago de 30.000 con origen nómina', confirmado && pNomY && Math.abs(pNomY.capital + pNomY.interes - 30000) < 0.01);
await foto(page, 'f06-nomina');

// ── Persistencia en el navegador y reinicio
await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
check('Tras recargar, los pagos siguen registrados (datos en el navegador)', ((await cred('A')).pagos || []).length === 4);
await page.evaluate(() => window.__VP_REINICIAR()); await page.waitForTimeout(2500);
check('"Reiniciar datos" vuelve a la semilla', ((await cred('A')).pagos || []).length === 2 && !((await cred('H')).prepagos || []).length);

// ── Versión local: descarga nativa del Excel con la hoja "Servicio deuda"
const XLSXns = createRequire('/home/user/gestion-grupo-mediterra/package.json')('xlsx-js-style');
const XLSXm = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);
const hojas = (buf) => XLSXm.read(buf, { type: 'buffer' }).SheetNames;
const irFlujoOsiris = async () => {
  await page.getByRole('button', { name: /Flujo Empresas/ }).first().click(); await page.waitForTimeout(1200);
  const bs = page.getByRole('button'); const n = await bs.count();
  for (let k = 0; k < n; k++) { const t = (await bs.nth(k).innerText().catch(() => '')).replace(/[✦\s]+$/g, '').trim(); if (t.endsWith('Osiris') && t !== 'Osiris') { await bs.nth(k).click(); break; } }
  await page.waitForTimeout(1500);
};
await irFlujoOsiris();
const [dlLocal] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
const rutaLocal = path.join(OUT, 'local-' + dlLocal.suggestedFilename()); await dlLocal.saveAs(rutaLocal);
check('Local: el Excel de Osiris se descarga e incluye la hoja "Servicio deuda"', hojas(fs.readFileSync(rutaLocal)).includes('Servicio deuda'), dlLocal.suggestedFilename());

// ── Modo Artifact: diálogos DENTRO de la página, respondidos por el usuario
await entrar('/artifact.html');
const filaA2 = page.locator('tr', { hasText: 'Banco Demo' }).filter({ hasText: 'Osiris' }).first();
await filaA2.getByRole('button', { name: /Pagos/ }).click(); await page.waitForTimeout(600);
const btnAnular = () => page.locator('tr', { hasText: '10/04/2026' }).filter({ hasText: 'Pago' }).getByRole('button', { name: 'Anular' }).first();
await btnAnular().click(); await page.waitForTimeout(700);
check('Artifact: anular abre un cuadro en la página que pide el motivo (no se responde solo)', await page.locator('#vp-dialogo #vp-respuesta').count() === 1
  && !(await cred('A')).pagos.find(p => p.id === 'pA1').anulado);
await foto(page, 'f07-artifact-dialogo');
await page.locator('#vp-cancelar').click(); await page.waitForTimeout(1200);
check('Artifact: "Cancelar" no anula el pago', !(await cred('A')).pagos.find(p => p.id === 'pA1').anulado);
await btnAnular().click(); await page.waitForTimeout(700);
await page.locator('#vp-respuesta').fill('Pago duplicado según cartola (motivo escrito a mano)');
await page.locator('#vp-aceptar').click(); await page.waitForTimeout(1500);
A = await cred('A');
check('Artifact: "Aceptar" anula el pago con el motivo escrito por el usuario', A.pagos.find(p => p.id === 'pA1').anulado === true && A.pagos.find(p => p.id === 'pA1').motivoAnulacion === 'Pago duplicado según cartola (motivo escrito a mano)');
await page.getByRole('button', { name: '×' }).first().click(); await page.waitForTimeout(300);
// Prepago: confirmar en la página
await subTab(page, /Simular prepago/);
const opt2 = await page.locator('select').first().locator('option', { hasText: 'Banco Prepago Demo' }).getAttribute('value');
await page.locator('select').first().selectOption(opt2);
await inputTras(page, 'Fecha del prepago').fill('2026-10-15'); await page.waitForTimeout(500);
await page.getByRole('button', { name: /Aplicar prepago/ }).click(); await page.waitForTimeout(700);
check('Artifact: "Aplicar prepago" pide confirmación en la página y no aplica nada aún', await page.locator('#vp-dialogo #vp-aceptar').count() === 1 && !((await cred('H')).prepagos || []).length);
await page.locator('#vp-cancelar').click(); await page.waitForTimeout(1200);
check('Artifact: prepago cancelado → sin pago ni evento de prepago', !((await cred('H')).prepagos || []).length && !((await cred('H')).pagos || []).some(p => p.tipo === 'prepago'));
await page.getByRole('button', { name: /Aplicar prepago/ }).click(); await page.waitForTimeout(700);
await page.locator('#vp-aceptar').click(); await page.waitForTimeout(1500);
const H2 = await cred('H');
check('Artifact: prepago aceptado → total 111.566,98 + 312,39 + 1.115,67 = 112.995,04', (H2.prepagos || []).length === 1
  && Math.abs((H2.pagos || []).filter(p => p.tipo === 'prepago').reduce((a, p) => a + p.capital + p.interes + p.cargos, 0) - 112995.04) < 0.02);
// Excel vía la capacidad "downloads" del visor (simulada aquí con window.claude)
while (await page.locator('#vp-dialogo').count()) { console.log('  aviso de la app: ' + (await page.locator('#vp-dialogo').innerText()).replace(/\s+/g, ' ').slice(0, 160)); await page.locator('#vp-aceptar').click(); await page.waitForTimeout(300); }
await irFlujoOsiris();
await page.getByRole('button', { name: /📥 Excel/ }).first().click();
await page.waitForFunction(() => (window.__guardados || []).length > 0, null, { timeout: 120000 }).catch(() => {});
const g = await page.evaluate(async () => { const x = (window.__guardados || [])[0]; if (!x) return null;
  const b = x.data instanceof Blob ? x.data : new Blob([x.data]); const ab = await b.arrayBuffer(); const u = new Uint8Array(ab); let bin = ''; for (let k = 0; k < u.length; k += 8192) bin += String.fromCharCode.apply(null, u.subarray(k, k + 8192));
  return { filename: x.filename, b64: btoa(bin) }; });
const bufA = g ? Buffer.from(g.b64, 'base64') : null;
if (bufA) fs.writeFileSync(path.join(OUT, 'artifact-' + g.filename), bufA);
check('Artifact: el Excel se entrega por la capacidad de descargas (con confirmación del visor) e incluye "Servicio deuda"', !!g && /\.xlsx$/.test(g.filename) && hojas(bufA).includes('Servicio deuda'), g ? g.filename : 'sin archivo');

check('Ninguna llamada HTTP al Supabase de producción', aProduccion === 0, String(aProduccion));
check('Ningún WebSocket de tiempo real hacia producción (el de la app queda inerte)', wsProduccion === 0 && await page.evaluate(() => window.__VP_WS_BLOQUEADOS > 0), `abiertos ${wsProduccion}`);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nVista previa funcional OK');
process.exit(fallos ? 1 : 0);

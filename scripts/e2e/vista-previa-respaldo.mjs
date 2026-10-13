/* ─────────────────────────────────────────────────────────────────────────
   Prueba el MODO RESPALDO REAL de la vista previa local con un respaldo de
   PRUEBA (scripts/vista-previa/respaldo-prueba.mjs), sin interceptar nada
   desde fuera: solo el Supabase simulado del navegador.

   Comprueba:
     · el archivo del respaldo no cambia (SHA-256 antes = después);
     · los PIN reales del respaldo no llegan al navegador;
     · abrir y recorrer la app no genera cambios de Créditos;
     · registrar un pago en un crédito antiguo (sin uid), cargar un saldo
       informado y confirmar una cuota impaga quedan como OPERACIONES con su
       crédito identificado (uid + huella) y su "antes";
     · se exportan el resultado (JSON) y el detalle (CSV);
     · 0 llamadas HTTP / WebSocket a producción, 0 correos;
     · "Salir del modo respaldo" borra la copia del navegador;
     · la versión Artifact NO ofrece cargar respaldos.

     node scripts/vista-previa/armar.mjs --out /tmp/vp && node scripts/vista-previa/servir.mjs /tmp/vp &
     node scripts/vista-previa/respaldo-prueba.mjs /tmp/respaldo_prueba.json
     VP_URL=http://127.0.0.1:4180 RESPALDO=/tmp/respaldo_prueba.json OUT_DIR=/tmp/vpr node scripts/e2e/vista-previa-respaldo.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { cerrarAvisos, entrarFinanzas, subTab, inputTras, ponerNumero } from './lib.mjs';

const URL0 = process.env.VP_URL || 'http://127.0.0.1:4180';
const RESPALDO = process.env.RESPALDO;
const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const shaAntes = sha(RESPALDO);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, acceptDownloads: true });
let aProduccion = 0, correos = 0, apis = 0;
await ctx.route('**bywovqayuzodbzwsriet.supabase.co/**', r => { aProduccion++; return r.abort(); });
await ctx.route('**api.emailjs.com/**', r => { correos++; return r.abort(); });
const page = await ctx.newPage();
const errores = []; page.on('pageerror', e => errores.push(String(e)));
let wsProd = 0; page.on('websocket', ws => { if (ws.url().includes('bywovqayuzodbzwsriet')) wsProd++; });
page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/')) apis++; });
let respuestaPrompt = 'Cartola banco 30-09 confirma cuota impaga';
page.on('dialog', d => (d.type() === 'prompt' ? d.accept(respuestaPrompt) : d.accept()).catch(() => {}));

// Compara en el navegador original vs trabajo con el mismo módulo que usa la exportación.
const comparar = () => page.evaluate(async () => {
  await window.__VP_LISTO;
  const db = await new Promise((ok, mal) => { const r = indexedDB.open('mediterra_vista_previa', 1); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const get = (k) => new Promise(ok => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); });
  const o = await get('original'); const t = await get('trabajo');
  const c = window.VPDiff.comparar(JSON.parse(o.texto), t);
  return { resumen: c.resumen, ops: c.operaciones, alertas: c.alertas, pins: t.pins && t.pins.value, sha: o.sha256, main: t.main && t.main.value };
});
async function login() {
  const email = page.locator('input[type=email]'), dentro = page.getByRole('button', { name: /📊 Dashboard/ });
  await email.or(page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ })).or(dentro).first().waitFor({ timeout: 30000 });
  if (await email.count()) {
    await email.fill('ahuerta@grupomediterra.cl'); await page.locator('input[type=password]').fill('482913');
    await page.keyboard.press('Enter'); await page.waitForTimeout(2500);
  }
  await cerrarAvisos(page);
  if (!(await dentro.count())) await entrarFinanzas(page);
}

// ── 1. Cargar el respaldo de prueba ──────────────────────────────────────
await page.goto(URL0 + '/', { waitUntil: 'domcontentloaded' });
await page.locator('#vp-cargar').waitFor({ timeout: 20000 });
check('Versión local ofrece "Cargar respaldo real…"', await page.locator('#vp-cargar').isVisible());
await page.locator('#vp-archivo').setInputFiles(RESPALDO);
await page.waitForURL(/./, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(3000);
await page.locator('#vp-barra').waitFor({ timeout: 20000 });
const barraTxt = await page.locator('#vp-barra').innerText();
check('Barra en "RESPALDO REAL" con nombre de archivo y SHA-256', /RESPALDO REAL/.test(barraTxt) && barraTxt.includes(path.basename(RESPALDO)) && barraTxt.includes(shaAntes.slice(0, 12)), barraTxt.replace(/\s+/g, ' ').slice(0, 200));
await login();
await subTab(page, /💳 Créditos/); await page.waitForTimeout(1500);
const t1 = await page.locator('body').innerText();
check('La app muestra los créditos del respaldo (Zelun, Banco BICE, Banco Real Prueba)', ['Zelun', 'Banco BICE', 'Banco Real Prueba'].every(x => t1.includes(x)));
await foto(page, 'r01-respaldo-cargado');
for (const tab of [/Conciliación/, /Análisis CFO/, /Saldo por Mes/]) { await subTab(page, tab); await page.waitForTimeout(1000); }
await page.getByRole('button', { name: /💳 Créditos/ }).last().click(); await page.waitForTimeout(1000);   // sub-pestaña (la primera es la del módulo)
await page.waitForTimeout(2500);
let c = await comparar();
check('Respaldo original guardado con el SHA-256 del archivo', c.sha === shaAntes);
check('Los PIN reales del respaldo NO están en el navegador (solo la credencial de prueba)', !JSON.stringify(c.pins).includes('NO-DEBE-LLEGAR') && JSON.stringify(c.pins).includes('Angelo Huerta_h'));
check('Abrir y recorrer la app no genera operaciones de Créditos', c.ops.length === 0, JSON.stringify(c.resumen));
// Incidente 2026-10-07: con un respaldo real, abrir la vista previa borraba las marcas y comentarios
// de Tareas en la copia de trabajo (main quedaba en texto y la app no lo leía).
const mainT = typeof c.main === 'string' ? JSON.parse(c.main) : (c.main || {});
check('Abrir la app conserva Tareas de la copia de trabajo (marca de septiembre, comentario y mes)',
  mainT.estados?.s2_s2_2026_8?.estadoResp === 'verde' && mainT.comentarios?.s9_s4_2026_8 === 'comentario de prueba' && String(mainT.mes) === '8',
  JSON.stringify({ tipo: typeof c.main, mes: mainT.mes, estados: Object.keys(mainT.estados || {}).length, comentarios: Object.keys(mainT.comentarios || {}).length }));

// ── 2. Acciones de conciliación sobre datos del respaldo ────────────────
// 2a. Pago parcial en un crédito ANTIGUO sin uid (Zelun, n 1, cuota 120.000 sin desglose)
await page.locator('input[placeholder*="Buscar"]').first().fill('Zelun'); await page.waitForTimeout(600);
const filaZ = page.locator('tr', { hasText: 'Zelun' }).filter({ has: page.getByRole('button', { name: /Pagos/ }) }).first();
await filaZ.scrollIntoViewIfNeeded();
await filaZ.getByRole('button', { name: /Pagos/ }).click(); await page.waitForTimeout(800);
await page.getByRole('button', { name: /💵 Pagar/ }).first().click(); await page.waitForTimeout(400);
{ // el rótulo "Sin desglose" también está en las tarjetas del detalle: se toma el campo del formulario de pago
  const campo = page.locator('xpath=//div[starts-with(normalize-space(.),"Registrar pago · vencimiento")]/following::div[normalize-space(text())="Sin desglose"][1]/following::input[1]');
  await campo.click(); await page.waitForTimeout(80); await campo.fill('20000'); await campo.press('Tab'); await page.waitForTimeout(150);
}
await inputTras(page, 'Nota (banco, N° operación…)').fill('Abono según cartola');
await page.getByRole('button', { name: /💾 Registrar pago/ }).click(); await page.waitForTimeout(1500);
await page.getByRole('button', { name: '×' }).first().click(); await page.waitForTimeout(400);
// 2b. Saldo informado por el acreedor
await subTab(page, /Conciliación/); await page.waitForTimeout(800);
const tablaAcr = page.locator('table').filter({ hasText: 'Capital informado' }).first();
await tablaAcr.locator('tr', { hasText: 'Banco Real Prueba' }).first().getByRole('button', { name: 'Saldo informado' }).click(); await page.waitForTimeout(400);
await ponerNumero(page, 'Capital insoluto informado (USD)', '150000');
await inputTras(page, 'Respaldo (obligatorio)').fill('Certificado de deuda al 30-09-2026');
await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.waitForTimeout(1500);
// 2c. Confirmar impaga una cuota antigua por conciliar (Banco BICE, vencida 02-06-2026)
const tablaPC = page.locator('table').filter({ hasText: 'Confirmar impaga' }).first();
await tablaPC.locator('tr', { hasText: 'Banco BICE' }).first().getByRole('button', { name: /Confirmar impaga/ }).click(); await page.waitForTimeout(1500);
await foto(page, 'r02-conciliacion');
await page.waitForTimeout(1500);
c = await comparar();
const op = (tipo, f = () => true) => c.ops.find(o => o.op === tipo && f(o));
const pago = op('agregar_pago', o => o.huella && o.huella.acreedor === 'Zelun');
check('Pago en crédito antiguo → operación "agregar_pago" con uid estable (cr-1-0), huella y sin uid en el respaldo',
  !!pago && pago.credito === 'cr-1-0' && pago.uidEnRespaldo === false && pago.registro.sinDesglose === 20000 && pago.huella.n === 1, JSON.stringify(pago && { c: pago.credito, h: pago.huella }));
check('Saldo informado → operación "agregar_saldo_informado" con respaldo', !!op('agregar_saldo_informado', o => o.registro.capital === 150000 && /Certificado/.test(o.registro.respaldo)));
const conc = op('agregar_conciliacion', o => o.huella && o.huella.acreedor === 'Banco BICE');
check('Cuota confirmada impaga → operación "agregar_conciliacion" con el respaldo escrito', !!conc && conc.registro.nota === respuestaPrompt);
check('Sin alertas (nada desaparece de la copia de trabajo)', c.alertas === 0 && !c.ops.some(o => /^QUITADO/.test(o.op)));

// ── 3. Exportar resultado y detalle ─────────────────────────────────────
const [dj] = await Promise.all([page.waitForEvent('download'), page.locator('#vp-exp-json').click()]);
const rutaJ = path.join(OUT, dj.suggestedFilename()); await dj.saveAs(rutaJ);
const res = JSON.parse(fs.readFileSync(rutaJ, 'utf8'));
check('Resultado JSON: formato, SHA-256 del respaldo verificado y operaciones', res.formato === 'mediterra-conciliacion-creditos-v1' && res.respaldo.sha256 === shaAntes
  && res.respaldo.verificacionSha256 === 'coincide' && res.operaciones.length === c.ops.length && res.respaldo.versionesFilas.finanzas, `${res.operaciones.length} operaciones`);
const [dc] = await Promise.all([page.waitForEvent('download'), page.locator('#vp-exp-csv').click()]);
const rutaC = path.join(OUT, dc.suggestedFilename()); await dc.saveAs(rutaC);
const csv = fs.readFileSync(rutaC, 'utf8');
check('Detalle CSV con las operaciones y las diferencias', /agregar_pago/.test(csv) && /agregar_saldo_informado/.test(csv) && /agregar_conciliacion/.test(csv) && csv.split('\r\n').length > 3);

// ── 4. Integridad y aislamiento ─────────────────────────────────────────
check('El archivo del respaldo no cambió (SHA-256 igual antes y después)', sha(RESPALDO) === shaAntes);
check('0 llamadas HTTP y 0 WebSocket a producción; 0 correos; 0 llamadas /api', aProduccion === 0 && wsProd === 0 && correos === 0 && apis === 0, `${aProduccion}/${wsProd}/${correos}/${apis}`);

// ── 5. Salir del modo respaldo ──────────────────────────────────────────
await page.locator('#vp-salir').click(); await page.waitForTimeout(3000);
await page.locator('#vp-barra').waitFor();
const quedan = await page.evaluate(async () => {
  const db = await new Promise(ok => { const r = indexedDB.open('mediterra_vista_previa', 1); r.onsuccess = () => ok(r.result); });
  const get = (k) => new Promise(ok => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => ok(q.result); });
  return { o: !!(await get('original')), t: !!(await get('trabajo')), modo: window.__VP_MODO() };
});
check('"Salir del modo respaldo" borra original y copia de trabajo del navegador y vuelve a datos simulados', !quedan.o && !quedan.t && quedan.modo === 'simulado'
  && /DATOS SIMULADOS/.test(await page.locator('#vp-barra').innerText()));

// ── 6. Artifact: no ofrece cargar respaldos ──────────────────────────────
await page.goto(URL0 + '/artifact.html', { waitUntil: 'domcontentloaded' }); await page.locator('#vp-barra').waitFor();
check('Versión Artifact NO ofrece cargar respaldos reales', await page.locator('#vp-cargar').count() === 0);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nModo respaldo OK');
process.exit(fallos ? 1 : 0);

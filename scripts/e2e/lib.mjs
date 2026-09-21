/* Utilidades compartidas del E2E en navegador real. */
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';
import { instalarFake, PIN, EMAIL } from './fake.mjs';

export const BASE = process.env.APP_URL || 'http://127.0.0.1:4173';

export async function abrirApp(store, { log = () => {} } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1800, height: 1150 }, acceptDownloads: true });
  await instalarFake(ctx, store, log);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  [pageerror]', String(e).slice(0, 200)));
  return { browser, ctx, page };
}

export async function login(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PIN);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  await cerrarAvisos(page);
}

export async function cerrarAvisos(page) {
  for (const t of ['Entendido', 'Aceptar']) {
    const b = page.getByRole('button', { name: t });
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(200); }
  }
}

export async function entrarFinanzas(page) {
  await page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click();
  await page.waitForTimeout(3500);
  await cerrarAvisos(page);
}

export async function irAFlujoEmpresas(page) {
  await page.getByRole('button', { name: /Flujo Empresas/ }).first().click();
  await page.waitForTimeout(1500);
}

export async function elegirEmpresa(page, nombre) {
  // El nombre puede aparecer en varios botones (miga de pan, otra empresa que
  // lo contiene). Se elige el botón de la barra de empresas cuyo texto termina
  // exactamente en el nombre (con o sin el ✦ de "calculado por parámetros").
  const botones = page.getByRole('button');
  const n = await botones.count();
  for (let i = 0; i < n; i++) {
    const b = botones.nth(i);
    const t = (await b.innerText().catch(() => '')).replace(/[✦\s]+$/g, '').trim();
    // el botón de la barra lleva emoji delante ("🏢 Mediterra"); el texto pelado
    // "Mediterra" es la miga de pan, que sale del módulo.
    if (t.endsWith(nombre) && t !== nombre) { await b.click(); await page.waitForTimeout(1500); return; }
  }
  throw new Error(`No encontré el botón de la empresa "${nombre}"`);
}

export async function subTab(page, re) {
  await page.getByRole('button', { name: re }).first().click();
  await page.waitForTimeout(1200);
}

// input numérico que sigue a una etiqueta exacta
export function inputTras(page, etiqueta) {
  return page.locator(`xpath=//div[normalize-space(text())=${xq(etiqueta)}]/following::input[1]`);
}
export function selectTras(page, etiqueta) {
  return page.locator(`xpath=//div[normalize-space(text())=${xq(etiqueta)}]/following::select[1]`);
}
export function xq(s) { return s.includes('"') ? `concat('${s.replace(/'/g, "',\"'\",'")}')` : `"${s}"`; }

export async function ponerNumero(page, etiqueta, valor) {
  const el = inputTras(page, etiqueta);
  await el.waitFor({ timeout: 10000 });
  await el.fill(String(valor));
  await el.dispatchEvent('change');
  await page.waitForTimeout(150);
}

// Panel "📥 Cobros al cliente" / "📤 Pagos al productor"
export function panel(page, titulo) {
  return page.locator(`xpath=//div[normalize-space(text())=${xq(titulo)}]/parent::div`);
}

export const num = (s) => {
  if (s == null) return null;
  const t = String(s).replace(/\s/g, '');
  if (t === '—' || t === '') return 0;
  const neg = /^\(|^-/.test(t);
  const d = t.replace(/[^\d.,]/g, '').replace(/,/g, '');
  if (d === '') return 0;
  const v = parseFloat(d);
  return isNaN(v) ? null : (neg ? -v : v);
};

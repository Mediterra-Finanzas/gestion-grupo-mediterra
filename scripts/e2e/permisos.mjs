/* ─────────────────────────────────────────────────────────────────────────
   PERMISOS EN NAVEGADOR (Supabase falso, datos ficticios).

   Usuarios de prueba (la fila `usuarios` del store; PIN de prueba de fake.mjs):
     · Angelo (admin)                → control: todo editable.
     · Carol (editor) con permisos EXPLÍCITOS: finanzas.params = "ver",
       allegria.clientes = "ver", allegria.cobranza = "sin_acceso".
     · Milagros con rol "consulta" y Finanzas sin pestañas configuradas.
   Antes de la corrección: Carol editaba Parámetros y Clientes, veía Cobranza, y el
   rol consulta podía cargar saldos. Correr contra el build anterior muestra el defecto.
   Uso: APP_URL=http://127.0.0.1:4195 OUT_DIR=/tmp/perm node scripts/e2e/permisos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, instalarFake, PIN } from './fake.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

function store() {
  const s = nuevoStore();
  const cred = s.pins.value['Angelo Huerta_h'];
  s.pins.value['Carol Machuca_h'] = cred;          // misma credencial de PRUEBA (no se usa en producción)
  s.pins.value['Milagros Becerra_h'] = cred;
  s.usuarios = { updated_at: new Date(Date.now() - 44000).toISOString(), value: [
    { nombre: 'Milagros Becerra', rol: 'consulta', modulos: ['tareas', 'finanzas'] },
    { nombre: 'Carol Machuca', rol: 'editor', modulos: ['tareas', 'finanzas', 'allegria'],
      tab_permisos: { finanzas: { params: 'ver' }, allegria: { clientes: 'ver', cobranza: 'sin_acceso' } } },
    { nombre: 'Michelle Garcia', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
    { nombre: 'Pablo Duran', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
    { nombre: 'Angelo Huerta', rol: 'admin', modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad', 'allegria'] },
    { nombre: 'Nicolás Fuenzalida', rol: 'gerente_tecnico', modulos: ['osiris'] },
  ] };
  s.allegria = { updated_at: new Date(Date.now() - 43000).toISOString(), value: { clientes: [{ id: 'c1', nombre: 'Cliente Prueba' }], cobranza: [] } };
  return s;
}

async function sesion(email) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Santiago' });
  const st = store();
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/api\/send-email|emailjs/, r => r.fulfill({ status: 200, body: '{}' }));
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto(process.env.APP_URL, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').waitFor({ timeout: 20000 });
  await page.locator('input[type=email]').fill(email); await page.locator('input[type=password]').fill(PIN); await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  for (const t of ['Entendido', 'Aceptar']) { const b = page.getByRole('button', { name: t }); if (await b.count()) await b.first().click().catch(() => {}); }
  return { browser, page, errores, st };
}
const clic = async (page, re, espera = 1500) => { await page.getByRole('button', { name: re }).first().click(); await page.waitForTimeout(espera); };
const txt = (page) => page.locator('body').innerText();

async function finanzas(page) { await clic(page, /Flujo de Caja Grupo Mediterra/, 3500); }
async function parametrosAllegria(page) {
  await clic(page, /Flujo Empresas/);
  await clic(page, /^.*Allegria Foods.*$/);
  const b = page.getByRole('button', { name: /Parámetros/ });
  if (!(await b.count())) return null;
  await b.first().click(); await page.waitForTimeout(1500);
  return /modo solo lectura/.test(await txt(page));
}
async function allegria(page) { await page.getByRole('button', { name: /Allegria Foods.*Exportación/ }).first().click(); await page.waitForTimeout(2500); }
// Volver al hub: la app recuerda el módulo en sessionStorage; se borra solo esa clave y se recarga.
async function alHub(page) { await page.evaluate(() => sessionStorage.removeItem('mediterra_modulo')); await page.reload(); await page.waitForTimeout(3000); }

// ── Angelo (control) ──
let s = await sesion('ahuerta@grupomediterra.cl');
await finanzas(s.page);
await clic(s.page, /Saldos Bancos/);
check('Admin: Saldos Bancos editable ("Fecha del saldo" + guardar)', /Fecha del saldo/.test(await txt(s.page)));
check('Admin: Parámetros editables', (await parametrosAllegria(s.page)) === false);
check('Admin: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── Carol con permisos explícitos ──
s = await sesion('cmachuca@grupomediterra.cl');
await finanzas(s.page);
await clic(s.page, /Saldos Bancos/);
check('Carol (bancos sin configurar = editar): Saldos Bancos sigue editable', /Fecha del saldo/.test(await txt(s.page)));
check('Carol (params = ver): Parámetros en SOLO LECTURA', (await parametrosAllegria(s.page)) === true);
await alHub(s.page);
await allegria(s.page);
await s.page.getByText('Clientes Importadores').first().click(); await s.page.waitForTimeout(1500);
let t = await txt(s.page);
check('Carol (clientes = ver): ve el cliente', /Cliente Prueba/.test(t));
check('Carol (clientes = ver): SIN "+ Nuevo Cliente"', !/\+ Nuevo Cliente/.test(t));
await alHub(s.page);
await allegria(s.page);
await s.page.getByText('Liquidaciones', { exact: false }).first().click(); await s.page.waitForTimeout(1200);
await clic(s.page, /Cobranza/, 1200);
check('Carol (cobranza = sin_acceso): "no tiene acceso"', /no tiene acceso a esta sección/.test(await txt(s.page)));
check('Carol: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
const escrituras = JSON.stringify(s.st.allegria.value.clientes);
check('Carol: Allegria no escribió clientes', escrituras === JSON.stringify([{ id: 'c1', nombre: 'Cliente Prueba' }]), escrituras.slice(0, 120));
await s.page.screenshot({ path: path.join(OUT, 'carol-cobranza.png') });
await s.browser.close();

// ── Milagros con rol consulta ──
s = await sesion('Mbecerra@grupomediterra.cl');
await finanzas(s.page);
await clic(s.page, /Saldos Bancos/);
t = await txt(s.page);
check('Consulta: Saldos Bancos visible', /Saldos/.test(t));
check('Consulta: Saldos Bancos SIN edición (no aparece "Fecha del saldo")', !/Fecha del saldo/.test(t));
check('Consulta: Parámetros en solo lectura', (await parametrosAllegria(s.page)) === true);
check('Consulta: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);

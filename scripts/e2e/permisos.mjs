/* ─────────────────────────────────────────────────────────────────────────
   PERMISOS EN NAVEGADOR (Supabase falso, datos ficticios).

   Usuarios de prueba (la fila `usuarios` del store; PIN de prueba de fake.mjs):
     · Angelo (admin)                → control: todo editable.
     · Carol (editor) con permisos EXPLÍCITOS: finanzas.params = "ver",
       allegria.clientes = "ver", allegria.cobranza = "sin_acceso".
     · Milagros con rol "consulta" y Finanzas sin pestañas configuradas.
   Matriz confirmada 08-10-2026 (agregado):
     · Lucía (consulta) con Flujo "editar" EXPLÍCITO y Parámetros "sin_acceso".
     · Michelle con la facultad contabEditar (fila permisos_facultades, por correo); Carol sin ella.
     · Angelo aplica la matriz desde el panel: vista previa, aplicación y guardado.
       Raimundo, Carolina, Denise y José Tomás Silva llevan correos FICTICIOS.
   Antes de la corrección: Carol editaba Parámetros y Clientes, veía Cobranza, y el
   rol consulta podía cargar saldos. Correr contra el build anterior muestra el defecto.
   Uso: APP_URL=http://127.0.0.1:4195 OUT_DIR=/tmp/perm node scripts/e2e/permisos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, instalarFake, leerFila, PIN } from './fake.mjs';
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
  s.pins.value['Lucía Corbetto_h'] = cred;
  s.pins.value['Michelle Garcia_h'] = cred;
  s.usuarios = { updated_at: new Date(Date.now() - 44000).toISOString(), value: [
    { nombre: 'Milagros Becerra', rol: 'consulta', modulos: ['tareas', 'finanzas'] },
    { nombre: 'Carol Machuca', rol: 'editor', modulos: ['tareas', 'finanzas', 'allegria', 'contabilidad'],
      tab_permisos: { finanzas: { params: 'ver' }, allegria: { clientes: 'ver', cobranza: 'sin_acceso' } } },
    { nombre: 'Michelle Garcia', rol: 'editor', modulos: ['tareas', 'contabilidad'], contabEditar: true /* en la ficha NO cuenta */ },
    { nombre: 'Pablo Duran', rol: 'editor', modulos: ['tareas', 'contabilidad'] },
    { nombre: 'Angelo Huerta', rol: 'admin', modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad', 'allegria'] },
    { nombre: 'Nicolás Fuenzalida', rol: 'gerente_tecnico', modulos: ['osiris'] },
    { nombre: 'Lucía Corbetto', email: 'lucia@ficticio.cl', rol: 'consulta', modulos: ['tareas', 'finanzas'],
      tab_permisos: { finanzas: { flujo: 'editar', params: 'sin_acceso' } } },
    { nombre: 'Cristobal Ortiz', email: 'cristobal@ficticio.cl', rol: 'consulta', modulos: ['finanzas'] },
    { nombre: 'Raimundo Valenzuela', email: 'raimundo@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'Carolina Lara', email: 'carolina@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'Denise Piaget', email: 'denise@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
    { nombre: 'José Tomás Silva', email: 'jts@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
  ] };
  // Facultades en su fila propia (por correo). La de la ficha de Michelle se ignora a propósito.
  s.permisos_facultades = { updated_at: new Date(Date.now() - 42000).toISOString(), value: JSON.stringify({ v: 1, modo: 'transicion',
    porCorreo: { 'mgarcia@grupomediterra.cl': { contabEditar: true } }, historial: [] }) };
  s.allegria = { updated_at: new Date(Date.now() - 43000).toISOString(), value: { clientes: [{ id: 'c1', nombre: 'Cliente Prueba' }], cobranza: [] } };
  return s;
}

async function sesion(email) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Santiago' });
  const st = store();
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  // Contabilidad lee tablas propias (empresas, auxiliares, …) que el Supabase falso no modela:
  // lectura vacía. Una escritura a esas tablas se aborta (la prueba no debe escribir).
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
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
check('Consulta sin configurar: Flujo Empresas NO editable (sin "Nuevo escenario")', !/Nuevo escenario/.test(await txt(s.page)));
check('Consulta: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── Lucía (consulta) con Flujo "editar" explícito y Parámetros "sin_acceso" ──
s = await sesion('lucia@ficticio.cl');
await finanzas(s.page);
await clic(s.page, /Saldos Bancos/);
check('Lucía: Saldos Bancos sin edición (no configurado → ver)', !/Fecha del saldo/.test(await txt(s.page)));
check('Lucía: Parámetros NO aparece (sin_acceso)', (await parametrosAllegria(s.page)) === null);
t = await txt(s.page);
check('Lucía: Flujo Empresas editable ("Nuevo escenario"), por el editar explícito', /Nuevo escenario/.test(t));
check('Lucía: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── Contabilidad: Michelle con contabEditar, Carol sin la facultad ──
async function auxiliares(page) {
  await page.getByText('Sistema Contable Grupo Mediterra').first().click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(OUT, 'contabilidad.png') });
  await page.getByText('Auxiliares', { exact: true }).first().click(); await page.waitForTimeout(2000);
  return /\+ Agregar auxiliar/.test(await txt(page));
}
s = await sesion('mgarcia@grupomediterra.cl');
check('Michelle (contabEditar): Contabilidad editable ("+ Agregar auxiliar")', (await auxiliares(s.page)) === true);
await s.browser.close();
s = await sesion('cmachuca@grupomediterra.cl');
check('Carol (sin contabEditar): Contabilidad de consulta (sin "+ Agregar auxiliar")', (await auxiliares(s.page)) === false);
await s.browser.close();

// ── Angelo aplica la matriz desde el panel ──
s = await sesion('ahuerta@grupomediterra.cl');
await clic(s.page, /Permisos/, 1500);
await s.page.getByTestId('matriz-previa').click(); await s.page.waitForTimeout(500);
const plan = await s.page.getByTestId('matriz-plan').innerText();
// El número de cambios depende de este store ficticio (con los datos reales son 10: ver matrizPermisos.test.js)
check('Panel: vista previa con cambios y 0 sin identificar', /\b[1-9]\d* cambios/.test(plan) && /\b0\b sin identificar/.test(plan), plan.split('\n')[0]);
check('Panel: la vista previa muestra el correo usado como identidad', /raimundo@ficticio\.cl/.test(plan) && /cmachuca@grupomediterra\.cl/.test(plan));
await s.page.getByTestId('matriz-aplicar').click();
await s.page.waitForTimeout(4000);
const guardados = s.st.usuarios.value;
const fac = leerFila(s.st, 'permisos_facultades');
const facDe = (correo) => fac?.porCorreo?.[correo] || {};
const de = (n) => guardados.find(u => u.nombre === n) || {};
check('Guardado (fila de facultades): rendPagar para Carol, Milagros y Angelo', ['cmachuca@grupomediterra.cl', 'mbecerra@grupomediterra.cl', 'ahuerta@grupomediterra.cl'].every(c => facDe(c).rendPagar === true));
check('Guardado: Michelle NO paga (ve todas, no paga)', facDe('mgarcia@grupomediterra.cl').rendPagar !== true);
check('Guardado: contabEditar para Angelo, Michelle y Pablo; Carol no', ['ahuerta@grupomediterra.cl', 'mgarcia@grupomediterra.cl', 'pduran@grupomediterra.cl'].every(c => facDe(c).contabEditar === true) && facDe('cmachuca@grupomediterra.cl').contabEditar !== true);
check('Guardado: aplicar no activa la regla de pago', fac?.modo === 'transicion');
check('Guardado: Frisku Liquidaciones según la matriz',
  de('Raimundo Valenzuela').tab_permisos?.frisku?.liquidaciones === 'editar' && de('Carolina Lara').tab_permisos?.frisku?.liquidaciones === 'editar'
  && de('Denise Piaget').tab_permisos?.frisku?.liquidaciones === 'sin_acceso' && de('José Tomás Silva').tab_permisos?.frisku?.liquidaciones === 'sin_acceso');
check('Guardado: Lucía conserva Flujo editar y Parámetros sin acceso', de('Lucía Corbetto').tab_permisos?.finanzas?.flujo === 'editar' && de('Lucía Corbetto').tab_permisos?.finanzas?.params === 'sin_acceso');
await s.page.getByTestId('matriz-previa').click(); await s.page.waitForTimeout(500);
check('Panel: segunda vista previa → 0 cambios (idempotente)', /\b0\b cambios/.test(await s.page.getByTestId('matriz-plan').innerText()));
check('Panel: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

console.log(`\n${ok} correctas, ${fallos} fallas`);
process.exit(fallos ? 1 : 0);

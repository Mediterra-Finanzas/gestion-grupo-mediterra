/* ─────────────────────────────────────────────────────────────────────────
   REMUNERACIONES SEPARADAS + TRANSICIÓN DE PERMISOS (navegador, Supabase falso,
   datos FICTICIOS). App real del build; nada toca producción.

   Recorre:
     A. Carol (prepara nóminas generales, sin facultad de remuneraciones): no ve las
        líneas que podrían ser remuneraciones, su navegador no pide la fila
        `nominas_remuneraciones`, y al guardar la nómina general NO se pierden.
     B. Angelo: aplica la matriz (facultades en la fila propia), activa la regla de
        pago, la revierte con motivo y la vuelve a activar; revisa los registros
        existentes y los traslada; prepara una nómina de remuneraciones.
     C. Lucía aprueba la de Angelo · D. Cristobal aprueba otra (basta uno).
     E. Carol después del traslado: la nómina general ya no trae el detalle.
   Uso: APP_URL=http://127.0.0.1:4195 OUT_DIR=/tmp/rem node scripts/e2e/remuneraciones.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, instalarFake, leerFila, PIN } from './fake.mjs';
import { chromium } from '/home/user/gestion-grupo-mediterra/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let ok = 0, fallos = 0;
const check = (n, c, x = '') => { c ? ok++ : fallos++; console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); };

// Semana ISO de hoy en Chile (la lista de nóminas abre en la semana actual).
function semanaHoy() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2])); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return { semana: Math.ceil(((d - y0) / 86400000 + 1) / 7), año: d.getUTCFullYear() };
}
const { semana, año } = semanaHoy();
const SECRETOS = /Juan Pérez|María Soto|Trabajador Semilla|200\.000|900\.000|700\.000/;

// Un solo store compartido por todas las sesiones (como la base real).
const st = nuevoStore();
const cred = st.pins.value['Angelo Huerta_h'];
for (const n of ['Carol Machuca', 'Milagros Becerra', 'Michelle Garcia', 'Lucía Corbetto', 'Cristobal Ortiz']) st.pins.value[`${n}_h`] = cred;
const fin = (extra) => ({ finanzas: { dashboard: 'sin_acceso', flujo: 'sin_acceso', bancos: 'sin_acceso', creditos: 'sin_acceso', reporte: 'sin_acceso', params: 'sin_acceso', auditoria: 'sin_acceso', eeff: 'sin_acceso', rendiciones: 'ver', ...extra } });
st.usuarios = { updated_at: new Date(Date.now() - 44000).toISOString(), value: [
  { nombre: 'Milagros Becerra', rol: 'editor', modulos: ['tareas', 'finanzas'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'editar' }), tareas: { config: 'editar' } } },
  { nombre: 'Carol Machuca', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'editar' }), tareas: { config: 'editar' } } },
  { nombre: 'Michelle Garcia', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad', 'frisku'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'ver' }), tareas: { config: 'editar' }, frisku: { liquidaciones: 'ver' } } },
  { nombre: 'Pablo Duran', rol: 'editor', modulos: ['tareas', 'finanzas', 'contabilidad'], rendVerTodas: true, tab_permisos: { ...fin({ nominas: 'ver' }), tareas: { config: 'editar' } } },
  { nombre: 'Angelo Huerta', rol: 'admin', esCFO: true, modulos: ['tareas', 'osiris', 'finanzas', 'contabilidad'] },
  { nombre: 'Nicolás Fuenzalida', rol: 'gerente_tecnico', modulos: ['osiris'] },
  { nombre: 'Lucía Corbetto', email: 'lucia@ficticio.cl', rol: 'consulta', modulos: ['finanzas', 'frisku'],
    tab_permisos: { finanzas: { flujo: 'editar', params: 'sin_acceso', nominas: 'ver' }, frisku: { liquidaciones: 'ver' } } },
  { nombre: 'Cristobal Ortiz', email: 'cristobal@ficticio.cl', rol: 'consulta', modulos: ['finanzas'], tab_permisos: { finanzas: { nominas: 'ver' } } },
  { nombre: 'Raimundo Valenzuela', email: 'raimundo@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
  { nombre: 'Carolina Lara', email: 'carolina@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
  { nombre: 'Denise Piaget', email: 'denise@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
  { nombre: 'José Tomás Silva', email: 'jts@ficticio.cl', rol: 'editor', modulos: ['frisku'] },
] };
// Nómina general (blob legacy) con una línea normal y dos que podrían ser remuneraciones.
st.nominas = { updated_at: new Date(Date.now() - 40000).toISOString(), value: JSON.stringify({ nominas: [{
  id: 'nomG', empresa: 'Allegria Foods', semana, año, numero: 1, fecha: '2026-10-08', tc: 950, estado: 'borrador',
  preparadoPor: '', revisadoPor: '', aprobadoPor: '', aprobado1Por: '', items: [
    { id: 'a', seccion: 'proveedores', tipoDoc: 'Factura Electrónica', proveedor: 'Ferretería Sur', concepto: 'Materiales', montoCLP: 100000, estadoLinea: 'activa', documentos: [] },
    { id: 'b', seccion: 'anticipos', proveedor: 'Juan Pérez', concepto: 'Anticipo quincena', montoCLP: 200000, estadoLinea: 'activa', documentos: [] },
    { id: 'c', seccion: 'proveedores', tipoDoc: 'Remuneraciones', proveedor: 'María Soto', concepto: 'Sueldo septiembre', montoCLP: 900000, estadoLinea: 'activa', documentos: [] },
  ], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] }] }) };
// Una nómina de remuneraciones ya preparada por Angelo (para el circuito de Cristobal).
st.nominas_remuneraciones = { updated_at: new Date(Date.now() - 39000).toISOString(), value: JSON.stringify({ v: 1, clasificaciones: [], nominas: [{
  id: 'rem_seed', empresa: 'Allegria Service', periodo: '2026-09', numero: 1, estado: 'preparada',
  items: [{ id: 'ri1', clase: 'sueldo', trabajador: 'Trabajador Semilla', montoCLP: 700000, documentos: [] }],
  preparadoPor: 'Angelo Huerta', preparadoPorCorreo: 'ahuerta@grupomediterra.cl', autores: ['ahuerta@grupomediterra.cl'], historial: [] }] }) };

async function sesion(email) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, timezoneId: 'America/Santiago' });
  await instalarFake(ctx, st);
  await ctx.route(/open\.er-api\.com|mindicador\.cl|frankfurter\.app/, r => r.abort());
  await ctx.route(/\/rest\/v1\/(?!calendario_data)[a-z_]+/, r => r.request().method() === 'GET'
    ? r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : r.abort());
  const pedidos = []; ctx.on('request', r => { if (/calendario_data/.test(r.url())) pedidos.push(decodeURIComponent(r.url())); });
  const page = await ctx.newPage();
  const errores = []; page.on('pageerror', e => errores.push(String(e).slice(0, 160)));
  page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'prueba de reversa' : undefined).catch(() => {}));
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
async function nominas(p) {
  await p.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).first().click(); await p.waitForTimeout(3500);
  await p.getByRole('button', { name: /Nóminas/ }).first().click(); await p.waitForTimeout(2500);
}
const filaRem = () => leerFila(st, 'nominas_remuneraciones');
const filaNom = () => leerFila(st, 'nominas').nominas[0];
const pidioRem = (s) => s.pedidos.some(u => /nominas_remuneraciones/.test(u));

// ── A. Carol antes del traslado ──
let s = await sesion('cmachuca@grupomediterra.cl');
await nominas(s.page);
let t = await txt(s.page);
check('Carol: aviso de 2 líneas pendientes de clasificación', /2 líneas en estas nóminas podrían ser remuneraciones/.test(t), t.match(/\d+ línea[^\n]{0,60}/)?.[0]);
check('Carol: no ve nombres ni montos de esas líneas', !SECRETOS.test(t));
check('Carol: no tiene acceso a la nómina de remuneraciones', !(await s.page.getByTestId('rem-abrir').count()));
await s.page.getByRole('button', { name: /✏️ Editar/ }).first().click(); await s.page.waitForTimeout(2000);
t = await txt(s.page);
check('Carol (detalle): ve la línea normal y no las restringidas', /Ferretería Sur/.test(t) && !SECRETOS.test(t));
check('Carol (detalle): el total no incluye las líneas restringidas', !/1\.200\.000/.test(t));
await s.page.getByRole('button', { name: /\+ Agregar fila/ }).first().click(); await s.page.waitForTimeout(3000);
let items = filaNom().items;
check('Carol guarda: la línea nueva se agrega Y las ocultas siguen en la base (no se pierden)',
  items.length === 4 && items.some(i => i.id === 'b' && i.montoCLP === 200000) && items.some(i => i.id === 'c' && i.montoCLP === 900000), items.map(i => i.id).join(','));
check('Carol: la línea nueva queda marcada como creada con la versión que separa remuneraciones', items.some(i => !['a', 'b', 'c'].includes(i.id) && i.creadaV === 2));
check('Carol: su navegador nunca pidió la fila de remuneraciones', !pidioRem(s));
check('Carol: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── B. Angelo: matriz, regla de pago (activar / revertir / activar), revisión y traslado ──
s = await sesion('ahuerta@grupomediterra.cl');
await s.page.getByRole('button', { name: /Permisos/ }).first().click(); await s.page.waitForTimeout(1200);
check('Panel: regla de pago inicial = transición', /transición/.test(await s.page.getByTestId('modo-actual').innerText()));
check('Panel: no se puede activar la matriz sin pagadores', await s.page.getByTestId('modo-activar').isDisabled());
await s.page.getByTestId('matriz-previa').click(); await s.page.waitForTimeout(400);
const plan = await s.page.getByTestId('matriz-plan').innerText();
check('Panel: vista previa 13 cambios / 0 sin identificar', /\b13\b cambios/.test(plan) && /\b0\b sin identificar/.test(plan), plan.split('\n')[0]);
await s.page.getByTestId('matriz-aplicar').click(); await s.page.waitForTimeout(3000);
let ff = leerFila(st, 'permisos_facultades');
check('Fila de facultades guardada por correo (pagan Carol, Milagros, Angelo; aprueban Lucía y Cristobal)',
  ff?.porCorreo?.['cmachuca@grupomediterra.cl']?.rendPagar === true && ff?.porCorreo?.['mbecerra@grupomediterra.cl']?.rendPagar === true
  && ff?.porCorreo?.['ahuerta@grupomediterra.cl']?.remPreparar === true && ff?.porCorreo?.['lucia@ficticio.cl']?.remAprobar === true
  && ff?.porCorreo?.['cristobal@ficticio.cl']?.remAprobar === true && !ff?.porCorreo?.['mgarcia@grupomediterra.cl']?.rendPagar, JSON.stringify(ff?.porCorreo).slice(0, 200));
check('Aplicar NO cambia la regla de pago (sigue en transición)', ff?.modo === 'transicion');
const usu = leerFila(st, 'usuarios');
check('La ficha de usuarios no lleva facultades', usu.every(u => u.rendPagar === undefined && u.remAprobar === undefined));
await s.page.getByTestId('modo-activar').click(); await s.page.waitForTimeout(2000);
check('Activar: regla de la matriz guardada', leerFila(st, 'permisos_facultades').modo === 'matriz');
await s.page.getByTestId('modo-revertir').click(); await s.page.waitForTimeout(2000);
ff = leerFila(st, 'permisos_facultades');
check('Revertir: vuelve a transición con motivo en el historial', ff.modo === 'transicion' && ff.historial.some(h => h.hacia === 'transicion' && h.motivo === 'prueba de reversa'));
await s.page.getByTestId('modo-activar').click(); await s.page.waitForTimeout(2000);
check('Reactivar: queda en matriz', leerFila(st, 'permisos_facultades').modo === 'matriz');
await s.page.getByRole('button', { name: /Cerrar ×/ }).first().click(); await s.page.waitForTimeout(500);
await s.browser.close();

s = await sesion('ahuerta@grupomediterra.cl');
await nominas(s.page);
await s.page.getByTestId('rem-abrir').click(); await s.page.waitForTimeout(1500);
check('Angelo: abre la nómina de remuneraciones (pide la fila propia)', (await s.page.getByTestId('rem-panel').count()) === 1 && pidioRem(s));
await s.page.getByTestId('rem-revision').click(); await s.page.waitForTimeout(500);
check('Revisión: lista las 2 líneas ambiguas, sin reclasificar nada', (await s.page.getByTestId('rem-candidato').count()) === 2);
for (const clase of ['anticipo', 'sueldo']) {
  await s.page.getByTestId('rem-cand-clase').first().selectOption(clase);
  await s.page.getByTestId('rem-cand-trasladar').first().click(); await s.page.waitForTimeout(2500);
}
const fr = filaRem();
const hist = fr.nominas.find(n => n.estado === 'historica');
check('Traslado: copia completa en la fila de remuneraciones, con clase y origen', hist && hist.items.length === 2
  && hist.items.some(i => i.clase === 'anticipo' && i.montoCLP === 200000 && i.origen.itemId === 'b')
  && hist.items.some(i => i.clase === 'sueldo' && i.montoCLP === 900000 && i.origen.itemId === 'c'));
await s.page.waitForTimeout(1500);
const filaNomTxt = JSON.stringify(filaNom());
check('Traslado: la nómina general ya no tiene el detalle (solo el rastro)', !/Juan Pérez|María Soto|200000|900000/.test(filaNomTxt)
  && filaNom().items.filter(i => i.estadoLinea === 'trasladada').length === 2, filaNomTxt.slice(0, 160));
check('Traslado: la auditoría no registra montos ni nombres', !/Juan Pérez|María Soto|200000|900000/.test(JSON.stringify(leerFila(st, 'audit_log') || [])));
// Nueva nómina de remuneraciones
await s.page.getByRole('button', { name: /^Nóminas$/ }).click(); await s.page.waitForTimeout(300);
await s.page.getByTestId('rem-crear').click(); await s.page.waitForTimeout(2000);
await s.page.getByTestId('rem-agregar').click();
await s.page.getByTestId('rem-clase').first().selectOption('sueldo');
await s.page.getByTestId('rem-trabajador').first().fill('Pedro Ficticio');
await s.page.getByTestId('rem-monto').first().fill('850000');
await s.page.getByTestId('rem-guardar').click(); await s.page.waitForTimeout(2000);
await s.page.getByTestId('rem-enviar').click(); await s.page.waitForTimeout(2000);
const nueva = filaRem().nominas.find(n => n.estado === 'preparada' && n.id !== 'rem_seed');
check('Angelo prepara y envía (clase explícita, trabajador, monto)', nueva && nueva.items[0].clase === 'sueldo' && nueva.items[0].montoCLP === 850000);
check('Angelo no puede aprobar lo que preparó', !(await s.page.getByTestId('rem-aprobar').count()));
check('Angelo: sin errores de página', s.errores.length === 0, s.errores.join(' | '));
await s.browser.close();

// ── C. Lucía aprueba la nómina de Angelo ──
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
await aprobarComo('lucia@ficticio.cl', nueva.id, 'Lucía Corbetto');
// ── D. Cristobal aprueba la otra ──
await aprobarComo('cristobal@ficticio.cl', 'rem_seed', 'Cristobal Ortiz');

// ── E. Carol y Michelle después ──
s = await sesion('cmachuca@grupomediterra.cl');
await nominas(s.page);
t = await txt(s.page);
check('Carol después: sin líneas pendientes ni detalle de remuneraciones', !/podría[n]? ser remuneraciones/.test(t) && !SECRETOS.test(t) && !/Pedro Ficticio/.test(t));
check('Carol después: su navegador no pidió la fila de remuneraciones', !pidioRem(s));
await s.browser.close();
s = await sesion('mgarcia@grupomediterra.cl');
await nominas(s.page);
check('Michelle (nóminas en ver, sin facultad): sin acceso a remuneraciones', !(await s.page.getByTestId('rem-abrir').count()) && !pidioRem(s));
await s.browser.close();

fs.writeFileSync(path.join(OUT, 'store-final.json'), JSON.stringify({ permisos_facultades: leerFila(st, 'permisos_facultades'), nominas: filaNom(), nominas_remuneraciones: filaRem() }, null, 1));
console.log(`\n${ok} correctas, ${fallos} fallas · datos ficticios`);
process.exit(fallos ? 1 : 0);

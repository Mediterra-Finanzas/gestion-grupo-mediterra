/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Créditos: modos de falla del guardado de un pago
   (app real, Supabase falso aislado; producción no se lee ni se escribe).

   La verdad del servidor es la fila `finanzas` del store en memoria
   (creditos_data[].pagos[]); la pantalla es el detalle del crédito.

   1. Rechazado (HTTP 500): el pago no queda, se avisa el error, el formulario
      conserva lo escrito; reintentar con el servidor sano deja UN pago.
   2. Respuesta perdida (aplicado, sin respuesta): la pantalla no declara
      éxito; reintentar el mismo formulario termina con UN pago vigente, por
      cada salida del panel de conflicto (2a recuperar · 2b conservar la mía).
   3. Reintento sin cambios: doble clic y reintento tras el éxito no agregan nada.
   4. Salir al Hub con el guardado en vuelo (respuesta retenida 1,5 s):
      4a reabrir después de que el servidor confirmó; 4b reabrir de inmediato.
   5. Reversión no borra ediciones posteriores: el 1er guardado falla (500,
      retenido 6 s) y entretanto se registra un pago en OTRO crédito.

   Uso: OUT_DIR=/tmp/fallas node scripts/e2e/creditos-guardado-fallas.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, subTab, inputTras, ponerNumero } from './lib.mjs';
// Los montos del formulario se muestran con formato es-CL ("40.000", "1.234,5").
const monto = (v) => { if (v == null || v === '') return null; const n = parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };
const SOLO = (process.env.ESCENARIOS || '1,2,4,5').split(',');

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const resultados = [];
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); resultados.push({ n, ok: !!c, x }); if (!c) fallos++; };
const nota = (s) => console.log(`   · ${s}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PROD = 'bywovqayuzodbzwsriet.supabase.co';
const T0 = Date.now();

const credito = (uid, acreedor) => ({ uid, n: uid === 'cr-fA' ? 991 : 992, tipo_credito: 'contrato', empresa: 'Osiris', acreedor, moneda: 'USD',
  monto: 400000, fecha_desembolso: '2026-02-10', primer_venc: '2026-05-10', vencimiento_final: '2027-02-10',
  periodicidad: 3, modalidad: 'lineal', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-02-10',
  pagos: [{ id: `p0-${uid}`, vencKey: `${uid}@2026-05-10`, fecha: '2026-05-10', capital: 100000, interes: 7911.11, cargos: 0, sinDesglose: 0,
    tipo: 'pago', nota: 'seed', usuario: 'seed', ts: '2026-05-10T12:00:00Z' }] });
const A = { uid: 'cr-fA', acreedor: 'Banco Falla A' };
const B = { uid: 'cr-fB', acreedor: 'Banco Falla B' };

// ── Sesión aislada por escenario ─────────────────────────────────────────
async function sesion(nombre) {
  const store = nuevoStore();
  store.finanzas.value.creditos_data = [credito(A.uid, A.acreedor), credito(B.uid, B.acreedor)];
  // Plan de las próximas escrituras de `finanzas`: [{delay, status | perdida}]
  store.__plan = [];
  store.__interceptar = () => (store.__perderUna ? (store.__perderUna = false, 'perdida') : null);
  const { browser, ctx, page } = await abrirApp(store);
  const s = { nombre, store, browser, ctx, page, alertas: [], errores: [], externas: [], prod: [], escrituras: [] };
  s.consola = [];
  page.on('console', m => { const t = m.text(); if (/persist|dbSave|Guard/i.test(t)) s.consola.push(`${((Date.now() - T0) / 1000).toFixed(1)}s ${t.slice(0, 220)}`); });
  page.on('pageerror', e => s.errores.push(String(e)));
  page.on('dialog', d => { s.alertas.push(d.message()); (d.type() === 'prompt' ? d.accept('motivo e2e') : d.accept()).catch(() => {}); });
  // Prioridad sobre el falso (registrado antes): retiene/rechaza escrituras
  // según el plan y bloquea cualquier host que no sea local ni el falso.
  await ctx.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (['127.0.0.1', 'localhost'].includes(u.hostname)) return route.fallback();
    if (u.hostname !== PROD) { s.externas.push(u.hostname); return route.abort('blockedbyclient'); }
    if (req.method() === 'GET') { if (/id=eq\.finanzas(&|$)/.test(u.search)) s.escrituras.push({ t: Date.now(), metodo: 'GET (lectura)' }); return route.fallback(); }
    let id = (/id=eq\.([^&]+)/.exec(u.search) || [])[1];
    if (!id) { try { id = JSON.parse(req.postData() || '{}').id; } catch (_) {} }
    if (id !== 'finanzas') return route.fallback();
    s.escrituras.push({ t: Date.now(), metodo: req.method() });
    const paso = store.__plan.shift();
    if (!paso) return route.fallback();
    if (paso.delay) await sleep(paso.delay);
    if (paso.status) return route.fulfill({ status: paso.status, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' }, body: '{"message":"fallo simulado"}' });
    if (paso.perdida) store.__perderUna = true;
    return route.fallback();
  });
  // Toda petición a producción debe responderla el falso (cabecera propia).
  page.on('requestfinished', async r => {
    if (!r.url().includes(PROD)) return;
    const resp = await r.response().catch(() => null);
    const via = resp ? await resp.headerValue('access-control-allow-origin').catch(() => null) : null;
    if (via !== '*') s.prod.push(`${r.method()} ${r.url().slice(0, 80)}`);
  });
  await login(page);
  await entrarFinanzas(page);
  await subTab(page, /💳 Créditos/);
  return s;
}
async function cerrarSesion(s) {
  await s.page.screenshot({ path: path.join(OUT, `${s.nombre}-final.png`) }).catch(() => {});
  fs.writeFileSync(path.join(OUT, `${s.nombre}-consola.log`), s.consola.join('\n') + '\n--- escrituras finanzas ---\n' + s.escrituras.map(e => `${((e.t - T0) / 1000).toFixed(1)}s ${e.metodo}`).join('\n') + '\n--- alertas ---\n' + s.alertas.join('\n'));
  fs.writeFileSync(path.join(OUT, `${s.nombre}-creditos.json`), JSON.stringify(leerFila(s.store, 'finanzas').creditos_data, null, 2));
  check(`[${s.nombre}] 0 peticiones a producción sin pasar por el falso`, s.prod.length === 0, s.prod.slice(0, 2).join(' | '));
  check(`[${s.nombre}] sin errores de JavaScript en la página`, s.errores.length === 0, s.errores.slice(0, 2).join(' | '));
  if (s.externas.length) nota(`[${s.nombre}] hosts externos bloqueados (no producción): ${[...new Set(s.externas)].join(', ')}`);
  todasExternas.push(...s.externas); todasProd.push(...s.prod);
  await s.browser.close();
}
const todasExternas = [], todasProd = [];

const credServidor = (s, c) => leerFila(s.store, 'finanzas').creditos_data.find(x => x.uid === c.uid);
const pagosServ = (s, c, texto) => (credServidor(s, c).pagos || []).filter(p => !p.anulado && p.nota === texto);
const pagosPant = (s, texto) => s.page.locator('tr', { hasText: texto }).count();
const modalAbierto = (s) => s.page.getByText('Pagos registrados').count();

async function abrirDetalle(s, c) {
  const fila = s.page.locator('tr', { hasText: c.acreedor }).first();
  await fila.getByRole('button', { name: /Pagos/ }).click();
  await s.page.waitForTimeout(600);
}
async function llenarPago(s, texto, capital = 40000, interes = 1000) {
  await s.page.getByRole('button', { name: /💵 Pagar/ }).first().click();
  await s.page.waitForTimeout(300);
  await inputTras(s.page, 'Fecha efectiva').fill('2026-08-10');
  await ponerNumero(s.page, 'Capital', capital);
  await ponerNumero(s.page, 'Intereses', interes);
  await inputTras(s.page, 'Nota (banco, N° operación…)').fill(texto);
}
const registrar = (s) => s.page.getByRole('button', { name: /💾 Registrar pago/ }).click();
const cerrarModal = (s) => s.page.getByRole('button', { name: '×' }).first().click();
async function leerForm(s) {
  return {
    abierto: await s.page.getByRole('button', { name: /💾 Registrar pago/ }).count() === 1,
    capital: monto(await inputTras(s.page, 'Capital').inputValue().catch(() => null)),
    interes: monto(await inputTras(s.page, 'Intereses').inputValue().catch(() => null)),
    nota: await inputTras(s.page, 'Nota (banco, N° operación…)').inputValue().catch(() => null),
  };
}
const panelConflicto = (s) => s.page.getByText('Tu cambio NO se guardó: otra sesión modificó estos datos').count();
const txt = async (s) => (await s.page.locator('body').innerText()).replace(/\s+/g, ' ');

// ═════ 1 + 3. Rechazado (500) y reintento sin cambios ════════════════════
if (SOLO.includes('1')) {
  const s = await sesion('1-rechazo');
  await abrirDetalle(s, A);
  await llenarPago(s, 'OP-RECH');
  s.store.__plan.push({ status: 500 });
  await registrar(s);
  await s.page.waitForTimeout(2000);
  await s.page.screenshot({ path: path.join(OUT, '1-rechazo-error.png') });
  const f = await leerForm(s);
  const t = await txt(s);
  check('1 · 500: el servidor NO tiene el pago', pagosServ(s, A, 'OP-RECH').length === 0);
  check('1 · 500: la pantalla NO lo muestra como registrado', await pagosPant(s, 'OP-RECH') === 0);
  check('1 · 500: se informa el error', s.alertas.some(a => /No se pudo guardar|rechazó el guardado|todavía no confirmó/.test(a)) && /No se guardó/.test(t),
    `alerta="${(s.alertas[0] || '').slice(0, 70)}"`);
  check('1 · 500: el formulario sigue abierto con lo escrito (40.000 / 1.000 / OP-RECH)', f.abierto && f.capital === 40000 && f.interes === 1000 && f.nota === 'OP-RECH',
    JSON.stringify(f));
  await registrar(s);                       // servidor sano
  await s.page.waitForTimeout(2000);
  const p1 = pagosServ(s, A, 'OP-RECH');
  check('1 · reintento con el servidor sano → UN pago en el servidor (40.000 + 1.000)', p1.length === 1 && p1[0].capital === 40000 && p1[0].interes === 1000);
  check('1 · …y UNO en pantalla, formulario cerrado', await pagosPant(s, 'OP-RECH') === 1 && !(await leerForm(s)).abierto);

  // 3. Reintento sin cambios
  const nEsc = () => s.escrituras.filter(e => e.metodo !== 'GET (lectura)').length;
  const escAntes = nEsc();
  await s.page.waitForTimeout(2500);
  check('3 · tras el éxito no hay escrituras adicionales (2,5 s)', nEsc() === escAntes, `${nEsc() - escAntes} extra`);
  await llenarPago(s, 'OP-DOBLE', 5000, 0);
  await s.page.getByRole('button', { name: /💾 Registrar pago/ }).dblclick();
  await s.page.waitForTimeout(2500);
  check('3 · doble clic en "Registrar pago" → UN pago en el servidor', pagosServ(s, A, 'OP-DOBLE').length === 1, `${pagosServ(s, A, 'OP-DOBLE').length}`);
  check('3 · …y UNO en pantalla', await pagosPant(s, 'OP-DOBLE') === 1);
  check('3 · OP-RECH sigue siendo uno solo', pagosServ(s, A, 'OP-RECH').length === 1);
  nota(`escrituras de finanzas en el escenario: ${nEsc()}`);
  await cerrarSesion(s);
}

// ═════ 2. Respuesta perdida y reintento ═════════════════════════════════
// El servidor aplicó el pago pero la respuesta no llegó. La pantalla no declara
// éxito y CONSERVA el cambio (el servidor pudo haberlo aplicado). El reintento con
// el mismo formulario reenvía exactamente lo mismo: el contrato relee, lo encuentra
// igual y lo da por guardado. Sin conflicto y sin duplicar.
if (SOLO.includes('2')) {
  const s = await sesion('2-perdida');
  const tag = 'OP-PERD';
  await abrirDetalle(s, A);
  await llenarPago(s, tag);
  s.store.__plan.push({ perdida: true });
  await registrar(s);
  await s.page.waitForTimeout(2000);
  const t = await txt(s);
  check('2 · respuesta perdida: el servidor SÍ aplicó el pago (1)', pagosServ(s, A, tag).length === 1);
  check('2 · la pantalla no declara éxito (alerta "todavía no confirmó", formulario abierto, sin "✅ Guardado")',
    s.alertas.some(a => /todavía no confirmó/.test(a)) && (await leerForm(s)).abierto && !/✅ Guardado/.test(t));
  check('2 · el cambio se conserva en pantalla (no se revierte)', await pagosPant(s, tag) === 1);
  await registrar(s);                                   // reintento del MISMO formulario
  await s.page.waitForTimeout(2500);
  check('2 · reintento: exactamente UN pago en el servidor', pagosServ(s, A, tag).length === 1, `${pagosServ(s, A, tag).length}`);
  check('2 · reintento: UNO en pantalla, formulario cerrado, sin panel de conflicto',
    await pagosPant(s, tag) === 1 && !(await leerForm(s)).abierto && await panelConflicto(s) === 0);
  await cerrarSesion(s);
}

// ═════ 2c/2d. Conflicto real (otra sesión cambió la fila) y sus dos salidas ═══
const otraSesion = (store) => {
  const f = store.finanzas; const v = typeof f.value === 'string' ? JSON.parse(f.value) : f.value;
  v.finanzas_real = { ...(v.finanzas_real || {}), _otraSesion: { marca: 1 } };
  f.value = typeof f.value === 'string' ? JSON.stringify(v) : v; f.updated_at = new Date().toISOString();
};
for (const salida of SOLO.includes('2') ? ['recuperar', 'conservar'] : []) {
  const k = salida === 'recuperar' ? '2c' : '2d';
  const s = await sesion(`${k}-conflicto-${salida}`);
  const tag = `OP-CONF-${salida.toUpperCase()}`;
  await abrirDetalle(s, A);
  await llenarPago(s, tag);
  otraSesion(s.store);
  await registrar(s);
  await s.page.waitForTimeout(2500);
  check(`${k} · primer conflicto: el panel con las dos salidas aparece de inmediato`, await panelConflicto(s) > 0);
  check(`${k} · el servidor conserva el cambio de la otra sesión y NO tiene el pago`, !!leerFila(s.store, 'finanzas').finanzas_real._otraSesion && pagosServ(s, A, tag).length === 0);
  check(`${k} · el formulario sigue abierto con lo escrito`, (await leerForm(s)).abierto);
  const btn = salida === 'recuperar' ? /Recuperar la versión del servidor/ : /Conservar mi versión/;
  await s.page.getByRole('button', { name: btn }).click();
  await s.page.waitForTimeout(2500);
  if ((await leerForm(s)).abierto) { await registrar(s); await s.page.waitForTimeout(2500); }
  check(`${k} · final (${salida}): exactamente UN pago en el servidor`, pagosServ(s, A, tag).length === 1, `${pagosServ(s, A, tag).length}`);
  check(`${k} · final (${salida}): UNO en pantalla y sin panel de conflicto`, await pagosPant(s, tag) === 1 && await panelConflicto(s) === 0,
    `pantalla=${await pagosPant(s, tag)} panel=${await panelConflicto(s)}`);
  if (salida === 'recuperar') check('2c · "recuperar" conserva el cambio de la otra sesión', !!leerFila(s.store, 'finanzas').finanzas_real._otraSesion);
  else nota('2d · "conservar" reemplaza la versión del servidor por la local (decisión explícita del usuario)');
  await cerrarSesion(s);
}

// ═════ 4. Salir al Hub con el guardado en vuelo ═════════════════════════
for (const variante of SOLO.includes('4') ? ['a', 'b'] : []) {
  const s = await sesion(`4${variante}-salir`);
  const tag = `OP-SALIR-${variante}`;
  await abrirDetalle(s, A);
  await llenarPago(s, tag);
  s.store.__plan.push({ delay: 1500 });
  await registrar(s);
  await cerrarModal(s);
  await s.page.getByRole('button', { name: 'Mediterra', exact: true }).first().click();   // miga de pan → Hub
  await s.page.waitForTimeout(200);
  check(`4${variante} · se volvió al Hub con la escritura en vuelo`, await s.page.getByRole('button', { name: /Flujo de Caja Grupo Mediterra/ }).count() > 0
    && pagosServ(s, A, tag).length === 0);
  if (variante === 'a') await s.page.waitForTimeout(3000);   // el servidor confirma antes de volver
  await entrarFinanzas(s.page);
  await subTab(s.page, /💳 Créditos/);
  await s.page.waitForTimeout(variante === 'b' ? 2500 : 500);
  await abrirDetalle(s, A);
  const serv = pagosServ(s, A, tag).length, pant = await pagosPant(s, tag);
  nota(`4${variante}: línea de tiempo finanzas: ${s.escrituras.map(e => `${((e.t - T0) / 1000).toFixed(1)}s ${e.metodo}`).join(' · ')}`);
  check(`4${variante} · reabrir Finanzas${variante === 'b' ? ' de inmediato' : ''}: servidor 1 y pantalla 1`, serv === 1 && pant === 1, `servidor=${serv} pantalla=${pant}`);
  // Que una edición posterior no se lleve el pago (la sesión reabierta guarda encima).
  await cerrarModal(s);
  await abrirDetalle(s, B);
  await llenarPago(s, `OP-POST-${variante}`, 1000, 0);
  await registrar(s);
  await s.page.waitForTimeout(2500);
  const t = await txt(s);
  nota(`4${variante}: tras la edición posterior, línea de tiempo: ${s.escrituras.map(e => `${((e.t - T0) / 1000).toFixed(1)}s ${e.metodo}`).join(' · ')}`);
  check(`4${variante} · una edición posterior no borra el pago (servidor: ${tag}=1 y OP-POST=1)`,
    pagosServ(s, A, tag).length === 1 && pagosServ(s, B, `OP-POST-${variante}`).length === 1,
    `${tag}=${pagosServ(s, A, tag).length} OP-POST=${pagosServ(s, B, `OP-POST-${variante}`).length} panel=${await panelConflicto(s)} alertas=${s.alertas.length}${/No se guardó/.test(t) ? ' aviso "No se guardó"' : ''}`);
  await cerrarSesion(s);
}

// ═════ 5. Reversión no borra ediciones posteriores ═══════════════════════
if (SOLO.includes('5')) {
  const s = await sesion('5-reversion');
  await abrirDetalle(s, A);
  await llenarPago(s, 'OP-PRIMERO');
  s.store.__plan.push({ delay: 6000, status: 500 });
  const tReg = Date.now();
  await registrar(s);
  await s.page.waitForTimeout(150);
  await cerrarModal(s);
  await abrirDetalle(s, B);
  await llenarPago(s, 'OP-SEGUNDO', 25000, 500);
  await registrar(s);
  const antesRespuesta = Date.now() - tReg < 6000;
  check('5 · el 2º cambio se hizo antes de que llegara la respuesta del 1º', antesRespuesta, `${Date.now() - tReg} ms`);
  await s.page.waitForTimeout(Math.max(0, 6000 - (Date.now() - tReg)) + 3000);
  await s.page.screenshot({ path: path.join(OUT, '5-reversion.png') });
  const servB = pagosServ(s, B, 'OP-SEGUNDO').length;
  const pantB = await pagosPant(s, 'OP-SEGUNDO');
  check('5 · el 2º cambio sobrevive en el servidor', servB === 1, `${servB}`);
  check('5 · el 2º cambio sobrevive en pantalla', pantB === 1, `${pantB}`);
  await cerrarModal(s);
  await abrirDetalle(s, A);
  const servA = pagosServ(s, A, 'OP-PRIMERO').length, pantA = await pagosPant(s, 'OP-PRIMERO');
  nota(`1er pago (el del 500): servidor=${servA} pantalla=${pantA}; alertas=${JSON.stringify(s.alertas.map(a => a.slice(0, 60)))}`);
  check('5 · pantalla y servidor coinciden sobre el 1er pago', servA === pantA, `servidor=${servA} pantalla=${pantA}`);
  await s.page.waitForTimeout(1500);
  check('5 · tras asentarse todo, el 2º cambio sigue en el servidor', pagosServ(s, B, 'OP-SEGUNDO').length === 1);
  await cerrarSesion(s);
}

check('Global · 0 peticiones a producción escapadas', todasProd.length === 0);
const seg = ((Date.now() - T0) / 1000).toFixed(1);
fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify({ seg, resultados }, null, 2));
console.log(fallos ? `\n${fallos} FALLA(S) · ${seg} s` : `\nE2E guardado de pagos con fallas OK · ${seg} s`);
process.exit(fallos ? 1 : 0);

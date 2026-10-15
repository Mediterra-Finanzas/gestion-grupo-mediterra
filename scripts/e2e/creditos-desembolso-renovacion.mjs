/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Créditos: desembolso recibido (total y por tramos) y
   renovaciones con modalidad, intereses y anulación.
   App real, Supabase falso aislado (fake.mjs), reloj fijo 15-oct-2026 y
   cualquier host externo bloqueado en la página.

   1. Contrato bullet USD 1.000.000 al 8% Act/360 (Mediterra), desembolso
      01-nov-26, vencimiento 30-abr-27 (180 días → interés 40.000; total 1.040.000).
      - pendiente: Ingresos Financiamiento Nov-26 = 1.000.000
      - fecha futura: rechazada
      - TOTAL 998.500 → Nov-26 = 0, diferencia −1.500; anular → 1.000.000
      - PARCIAL 600.000 → 400.000; PARCIAL 400.000 → 0; anular el 2º → 400.000
      En todo momento: Pago Préstamos Apr-27 = 1.040.000, saldo capital
      1.000.000, sin pagos, finanzas_real intacto.
   2. Registro simple renovable (Osiris): cuota 1.050.000 al 31-dic-26
      (capital 1.000.000 + interés 50.000), renovación 1.000.000 Dic-26 al 10%
      con cuotas Jun-27 Solo Interés y Dic-27 Capital+Interés.
      Una renovación confirmada guardada es de solo lectura: cada modalidad se
      registra anulando la anterior (con motivo) y agregando otra.
      antigua → extension pagados / pendientes / capitalizados → pago_y_nuevo
      (+ ya recibidos) → parcial 600.000 pagados → extensión base + renovación
      ENCADENADA (origen = última cuota de la base; nace propuesta, luego
      confirmada) → pago en una cuota de la encadenada (no se puede anular; la
      base tampoco, es su origen) → anular el pago y las dos renovaciones. Tras cada guardado:
      flujo en pantalla y Excel de la empresa RECALCULADO con LibreOffice, mes a
      mes, más la hoja "Servicio deuda".

   Uso: CI=true npm run build; (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
        OUT_DIR=/tmp/cr-dr node scripts/e2e/creditos-desembolso-renovacion.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, num, inputTras, ponerNumero } from './lib.mjs';
import { recalcular, leerHojaFlujo } from './xls.mjs';

const OUT = process.env.OUT_DIR || '.';
const DESC = path.join(OUT, 'excel');
fs.mkdirSync(DESC, { recursive: true });
let fallos = 0;
const resultados = [];
const check = (nombre, cond, extra = '') => {
  console.log(`${cond ? '✓' : '✗ FALLA'}  ${nombre}${extra ? '  — ' + extra : ''}`);
  resultados.push({ nombre, ok: !!cond, extra });
  if (!cond) fallos++;
};
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });
const aprox = (a, b) => a != null && Math.abs(a - b) <= 1;

// ── Datos sembrados ──────────────────────────────────────────────────────
const BULLET = {
  uid: 'e2e-bullet', n: 1, tipo_credito: 'contrato', empresa: 'Mediterra', acreedor: 'Banco Bullet E2E', moneda: 'USD',
  monto: 1000000, fecha_desembolso: '2026-11-01', vencimiento_final: '2027-04-30', modalidad: 'bullet_total',
  tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', tipo_cr: 'Bullet', cuota: 0, tasa: '8%',
  f_inicio: '2026-11-01', f_venc: '2027-04-30', pagado: false, renovable: false, renovaciones: [],
  control_desde: '2026-10-01', historial: [{ ts: '2026-10-01T12:00:00.000Z', usuario: 'Angelo Huerta', accion: 'alta', detalle: 'semilla e2e' }],
};
const RENOV = {
  uid: 'e2e-renov', n: 2, empresa: 'Osiris', acreedor: 'Banco Renov E2E', moneda: 'USD', tipo_cr: 'Bullet',
  monto: 1000000, f_inicio: '', f_venc: '2026-12-31', cuota: 1050000, tasa_anual: 10, tasa: '10%', pagado: false,
  desglose: { capital: 1000000, interes: 50000, cargos: 0, respaldo: 'pagaré e2e', usuario: 'Angelo Huerta', ts: '2026-07-01T12:00:00.000Z' },
  control_desde: '2026-06-30', renovable: true,
  renovaciones: [{ monto: 1000000, mes_ingreso: 'Dic', anio_ingreso: 2026, tasa_anual: 10,
    cuotas: [{ tipo: 'Solo Interés', mes: 'Jun', anio: 2027 }, { tipo: 'Capital+Interés', mes: 'Dic', anio: 2027 }] }],
  historial: [{ ts: '2026-06-30T12:00:00.000Z', usuario: 'Angelo Huerta', accion: 'alta', detalle: 'semilla e2e' }],
};
const store = nuevoStore();
store.finanzas.value.creditos_data = [BULLET, RENOV];
store.finanzas.value.finanzas_real = { Mediterra: { _nota: 'real manual e2e' } };
const realAntes = JSON.stringify(leerFila(store, 'finanzas').finanzas_real);
const realIntacto = () => JSON.stringify(leerFila(store, 'finanzas').finanzas_real) === realAntes;

const { browser, ctx, page } = await abrirApp(store, { ctxOpts: { viewport: { width: 1400, height: 900 } } });
// Reloj fijo: "hoy" = 15-oct-2026 (el tiempo avanza desde ahí).
await ctx.clock.install({ time: new Date('2026-10-15T12:00:00Z') });
// Hosts externos bloqueados: solo 127.0.0.1 (app) y el Supabase FALSO (cae en fake.mjs).
const bloqueados = [];
await ctx.route('**/*', (route) => {
  const u = new URL(route.request().url());
  if (['127.0.0.1', 'localhost', 'bywovqayuzodbzwsriet.supabase.co'].includes(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:') return route.fallback();
  bloqueados.push(u.hostname);
  return route.abort('blockedbyclient');
});
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
let respuestaPrompt = 'prueba e2e';
const alertas = [];
page.on('dialog', d => {
  const t = d.type();
  if (t === 'alert') { alertas.push(d.message()); console.log('   [alert]', d.message().slice(0, 160)); }
  return (t === 'prompt' ? d.accept(respuestaPrompt) : d.accept()).catch(() => {});
});

const credStore = (uid) => (leerFila(store, 'finanzas').creditos_data || []).find(c => c.uid === uid);

// ── Flujo en pantalla ────────────────────────────────────────────────────
const LINEAS = ['Ingresos Financiamiento', 'Ingreso Renovación', 'Pago Préstamos - Total', 'Renovaciones'];
async function abrirFlujo(emp) {
  await irAFlujoEmpresas(page);
  await elegirEmpresa(page, emp);
  await page.waitForTimeout(800);
  const tabla = page.locator('table').first();
  // Todas las temporadas expandidas: se lee el horizonte completo.
  for (let k = 0; k < 8; k++) {
    const th = tabla.locator('th,td', { hasText: '▸ Temporada' });
    if (!(await th.count())) break;
    await th.first().click(); await page.waitForTimeout(300);
  }
  for (const [hdr, lbl] of [['INGRESOS NO', 'Ingresos Financiamiento'], ['EGRESOS NO', 'Pago Préstamos - Total']]) {
    if (!(await tabla.locator('tr', { hasText: lbl }).count())) {
      await tabla.locator('tr', { hasText: hdr }).first().locator('td,th').first().click();
      await page.waitForTimeout(500);
    }
  }
}
async function leerFlujo(emp) {
  await abrirFlujo(emp);
  const filas = await page.locator('table').first().locator('tr').all();
  const heads = (await filas[1].locator('th,td').allInnerTexts()).map(t => t.trim());
  const out = {};
  for (const f of filas) {
    const c = await f.locator('th,td').allInnerTexts();
    const lab = (c[0] || '').replace(/\s+/g, ' ').replace(/^[^A-Za-zÁÉÍÓÚáéíóú]+/, '').trim();
    const L = LINEAS.find(x => lab.startsWith(x));
    if (!L || out[L]) continue;
    out[L] = {};
    heads.forEach((h, i) => { if (/^[A-Z][a-z]{2}-\d{2}$/.test(h)) out[L][h] = num((c[i] || '').split('\n')[0]); });
  }
  return out;
}
const v = (fl, linea, mes) => (fl[linea] ? fl[linea][mes] : null);
const totalLinea = (fl, linea) => Object.values(fl[linea] || {}).reduce((s, x) => s + (x || 0), 0);
async function fotoFlujo(nombre, mes) {
  await page.evaluate((m) => {
    const th = [...document.querySelectorAll('table th, table td')].find(e => e.innerText.trim() === m);
    if (th) th.scrollIntoView({ inline: 'center', block: 'nearest' });
    const t = document.querySelector('table');
    if (t) window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 8);
  }, mes);
  await page.waitForTimeout(300);
  await foto(page, nombre);
}

// ── Excel de la empresa, recalculado, contra la pantalla ─────────────────
const comparaciones = [];
async function compararExcel(caso, fl) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
  const arch = path.join(DESC, `${caso}.xlsx`);
  await dl.saveAs(arch);
  const rec = recalcular(arch, DESC);
  const hojaFlujo = rec.wb.SheetNames.find(n => n !== 'Parametros' && n !== 'Servicio deuda');
  const h = leerHojaFlujo(rec.wb.Sheets[hojaFlujo]);
  const difs = [];
  let n = 0, signoOpuesto = 0;
  const ausentes = [];
  LINEAS.forEach(L => {
    const kx = Object.keys(h.filas).find(k => k.replace(/^[^A-Za-zÁÉÍÓÚ]+/, '').trim() === L) || Object.keys(h.filas).find(k => k.includes(L));
    // El Excel omite las líneas sin ningún valor: una fila ausente se compara como 0.
    const fx = kx ? h.filas[kx] : {};
    if (!kx) ausentes.push(L);
    h.meses.forEach(mes => {
      const a = (fl[L] || {})[mes] ?? 0, x = fx[mes] ?? 0;
      n++;
      if (a && x && Math.sign(a) !== Math.sign(x)) signoOpuesto++;
      const d = Math.abs(x) - Math.abs(a);
      comparaciones.push({ caso, concepto: L, mes, pantalla: a, excel: x, dif: Math.round(d * 100) / 100 });
      if (Math.abs(d) > 1) difs.push(`${L} ${mes}: pantalla ${a} · Excel ${x}`);
    });
  });
  // Hoja "Servicio deuda": = Pago Préstamos + Renovaciones del flujo (pantalla), componentes y control 0.
  const sd = rec.wb.Sheets['Servicio deuda'] ? leerHojaFlujo(rec.wb.Sheets['Servicio deuda']) : null;
  const sdDifs = [];
  let sdTot = null, scrTot = 0;
  if (!sd) sdDifs.push('sin hoja "Servicio deuda"');
  else {
    const fflujo = sd.filas['= Pago Préstamos + Renovaciones en el flujo'] || {};
    const fserv = sd.filas['= Servicio de deuda según Créditos'] || {};
    const fctrl = sd.filas['Control vs hoja del flujo (debe ser 0)'] || {};
    const comp = ['Capital', 'Intereses', 'Otros cargos', 'Cuotas sin desglosar'].map(k => sd.filas[k] || {});
    sdTot = 0;
    sd.meses.forEach(mes => {
      const scr = Math.abs((fl['Pago Préstamos - Total'] || {})[mes] || 0) + Math.abs((fl['Renovaciones'] || {})[mes] || 0);
      const x = fflujo[mes] ?? 0, s = fserv[mes] ?? 0, c = fctrl[mes] ?? 0;
      const sumComp = comp.reduce((t, f) => t + (f[mes] ?? 0), 0);
      sdTot += x; scrTot += scr;
      if (Math.abs(Math.abs(x) - scr) > 1) sdDifs.push(`${mes}: flujo SD ${x} · pantalla ${scr}`);
      if (Math.abs(s - sumComp) > 1) sdDifs.push(`${mes}: servicio ${s} ≠ componentes ${sumComp}`);
      if (Math.abs(c) > 0.01) sdDifs.push(`${mes}: control ${c}`);
    });
  }
  check(`Excel ${caso}: ${LINEAS.length} filas × ${h.meses.length} meses = pantalla (${n} celdas, recalculado)`, difs.length === 0, difs.slice(0, 6).join(' | ') + (ausentes.length ? ` · sin fila en el Excel (todo 0): ${ausentes.join(', ')}` : '') + (signoOpuesto ? ` · ${signoOpuesto} celdas con signo opuesto (convención)` : ''));
  check(`Excel ${caso}: "Servicio deuda" = Pago Préstamos + Renovaciones de la pantalla, componentes y control 0 (total ${sdTot != null ? Math.round(sdTot) : '—'} vs pantalla ${Math.round(scrTot)})`, sdDifs.length === 0, sdDifs.slice(0, 6).join(' | '));
  return { h, sd };
}

async function irACreditos() {
  await page.getByRole('button', { name: /💳 Créditos/ }).first().click();
  await page.waitForTimeout(1200);
}
async function abrirDetalle(acreedor) {
  await irACreditos();
  await page.locator('tr', { hasText: acreedor }).first().getByRole('button', { name: /📅/ }).click();
  await page.waitForTimeout(700);
}
async function cerrarModal() {
  await page.getByRole('button', { name: '×' }).first().click();
  await page.waitForTimeout(400);
}
const kpiModal = (label) => page.evaluate((l) => {
  const d = [...document.querySelectorAll('div')].find(e => e.childElementCount === 0 && e.textContent.trim() === l);
  return d && d.nextElementSibling ? d.nextElementSibling.textContent : null;
}, label);

await login(page);
await entrarFinanzas(page);

// ═══ 1. CONTRATO BULLET — DESEMBOLSO ═══════════════════════════════════
console.log('\n── 1. Bullet: desembolso recibido ──');
let fl = await leerFlujo('Mediterra');
check('1a Pendiente: Ingresos Financiamiento Nov-26 = 1.000.000', aprox(v(fl, 'Ingresos Financiamiento', 'Nov-26'), 1000000), `${v(fl, 'Ingresos Financiamiento', 'Nov-26')}`);
check('1b Pago Préstamos Apr-27 = 1.040.000 (1.000.000 + 1.000.000×8%×180/360)', aprox(v(fl, 'Pago Préstamos - Total', 'Apr-27'), 1040000), `${v(fl, 'Pago Préstamos - Total', 'Apr-27')}`);
const pagoAntes = JSON.stringify(fl['Pago Préstamos - Total']);
await fotoFlujo('01-flujo-mediterra-desembolso-pendiente', 'Jan-27');

const caja = page.locator('[data-desembolso-estado]');
const estadoCaja = () => caja.getAttribute('data-desembolso-estado');
async function registrarFondos(tipo, fecha, monto, nota) {
  await page.locator('[data-boton-fondos-recibidos]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-desembolso-tipo]').selectOption(tipo);
  await inputTras(page, 'Fecha en que se recibieron').fill(fecha);
  await ponerNumero(page, 'Monto recibido (USD)', String(monto));
  await inputTras(page, 'Nota / respaldo').fill(nota);
  await page.waitForTimeout(200);
  const nAl = alertas.length;
  await page.locator('[data-guardar-fondos-recibidos]').click();
  await page.waitForTimeout(1800);
  return alertas.slice(nAl);
}
async function anularRegistro(idx, motivo) {
  respuestaPrompt = motivo;
  await page.locator('[data-desembolso-registro]').nth(idx).getByRole('button', { name: /Anular/ }).click();
  await page.waitForTimeout(1800);
  respuestaPrompt = 'prueba e2e';
}

await abrirDetalle('Banco Bullet E2E');
check('1c Detalle: estado "pendiente"', (await estadoCaja()) === 'pendiente');
const capAntes = await kpiModal('Saldo capital');
check('1d Detalle: Saldo capital 1,000,000.00', /1,000,000\.00/.test(capAntes || ''), capAntes);
// Fecha futura: rechazada, nada se guarda
const alFut = await registrarFondos('total', '2026-12-01', 1000000, 'futuro');
check('1e Fecha futura rechazada con aviso y sin escribir', alFut.length > 0 && !(credStore('e2e-bullet').desembolso_registros || []).length, alFut[0]);
await caja.getByRole('button', { name: 'Cancelar' }).click().catch(() => {});
await page.waitForTimeout(300);

// ── TOTAL 998.500
await registrarFondos('total', '2026-10-15', 998500, 'cartola BCI total e2e');
let cb = credStore('e2e-bullet');
let regs = cb.desembolso_registros || [];
check('1f Store: registro total 2026-10-15 / 998.500 / nota / tipo total', regs.length === 1 && regs[0].fecha === '2026-10-15' && regs[0].monto === 998500
  && regs[0].nota === 'cartola BCI total e2e' && regs[0].tipo === 'total' && !regs[0].anulado, JSON.stringify(regs));
check('1g Store: historial "desembolso_recibido"', (cb.historial || []).some(h => h.accion === 'desembolso_recibido' && /998500/.test(h.detalle)));
check('1h Detalle: estado "recibido", diferencia −1.500, fila del registro', (await estadoCaja()) === 'recibido' && /diferencia -\$1,500\.00/.test(await caja.innerText())
  && (await page.locator('[data-desembolso-registro]').count()) === 1, (await caja.innerText()).replace(/\s+/g, ' ').slice(0, 220));
check('1i Saldo capital sin cambio; sin pagos; finanzas_real intacto', (await kpiModal('Saldo capital')) === capAntes && !(cb.pagos || []).length && realIntacto());
await foto(page, '02-detalle-fondos-recibidos-total');
await cerrarModal();
fl = await leerFlujo('Mediterra');
check('1j Total: Ingresos Financiamiento = 0 en todo el horizonte', aprox(totalLinea(fl, 'Ingresos Financiamiento'), 0), `${totalLinea(fl, 'Ingresos Financiamiento')}`);
check('1k Total: Pago Préstamos sin cambio (Apr-27 1.040.000)', JSON.stringify(fl['Pago Préstamos - Total']) === pagoAntes);
await fotoFlujo('03-flujo-mediterra-total-recibido', 'Jan-27');
await compararExcel('mediterra-total-recibido', fl);
await abrirDetalle('Banco Bullet E2E');
await anularRegistro(0, 'era otro crédito (e2e)');
cb = credStore('e2e-bullet');
check('1l Anular total: registro conservado como anulado con motivo; estado "pendiente"', cb.desembolso_registros.length === 1 && cb.desembolso_registros[0].anulado === true
  && cb.desembolso_registros[0].motivoAnulacion === 'era otro crédito (e2e)' && (await estadoCaja()) === 'pendiente');

// ── PARCIAL 600.000 + 400.000
await registrarFondos('parcial', '2026-10-12', 600000, 'tramo 1 e2e');
check('1m Parcial 600.000: estado "parcial", texto pendiente 400.000', (await estadoCaja()) === 'parcial' && /Pendiente \$400,000\.00/.test(await caja.innerText()), (await caja.innerText()).replace(/\s+/g, ' ').slice(0, 200));
await cerrarModal();
fl = await leerFlujo('Mediterra');
check('1n Parcial 600.000: Ingresos Financiamiento Nov-26 = 400.000', aprox(v(fl, 'Ingresos Financiamiento', 'Nov-26'), 400000) && aprox(totalLinea(fl, 'Ingresos Financiamiento'), 400000), `${v(fl, 'Ingresos Financiamiento', 'Nov-26')}`);
await fotoFlujo('04-flujo-mediterra-parcial-600', 'Jan-27');
await compararExcel('mediterra-parcial-600', fl);
await abrirDetalle('Banco Bullet E2E');
const alExc = await registrarFondos('parcial', '2026-10-14', 500000, 'excede e2e');
check('1n2 Tramo parcial de 500.000 (600.000 + 500.000 > capital 1.000.000): rechazado y sin escribir', alExc.length > 0 && (credStore('e2e-bullet').desembolso_registros || []).filter(r => !r.anulado).length === 1, alExc[0]);
await caja.getByRole('button', { name: 'Cancelar' }).click().catch(() => {});
await page.waitForTimeout(300);
await registrarFondos('parcial', '2026-10-14', 400000, 'tramo 2 e2e');
check('1o Parcial 400.000: estado "recibido", 2 registros vigentes listados', (await estadoCaja()) === 'recibido' && (await page.locator('[data-desembolso-registro]').count()) === 2);
await foto(page, '05-detalle-fondos-recibidos-parcial');
cb = credStore('e2e-bullet');
regs = (cb.desembolso_registros || []).filter(r => !r.anulado);
check('1p Store: 2 tramos parciales vigentes (600.000 + 400.000) y el total anulado se conserva', regs.length === 2 && regs.every(r => r.tipo === 'parcial')
  && regs[0].monto + regs[1].monto === 1000000 && cb.desembolso_registros.length === 3);
await cerrarModal();
fl = await leerFlujo('Mediterra');
check('1q Parcial completo: Ingresos Financiamiento = 0', aprox(totalLinea(fl, 'Ingresos Financiamiento'), 0), `${totalLinea(fl, 'Ingresos Financiamiento')}`);
await abrirDetalle('Banco Bullet E2E');
await anularRegistro(1, 'monto equivocado (e2e)');
check('1r Anular el 2º tramo: estado "parcial" otra vez', (await estadoCaja()) === 'parcial');
check('1s Saldo capital sin cambio; sin pagos; finanzas_real intacto', (await kpiModal('Saldo capital')) === capAntes && !(credStore('e2e-bullet').pagos || []).length && realIntacto());
await cerrarModal();
fl = await leerFlujo('Mediterra');
check('1t Anulado el 2º tramo: Ingresos Financiamiento Nov-26 = 400.000', aprox(v(fl, 'Ingresos Financiamiento', 'Nov-26'), 400000), `${v(fl, 'Ingresos Financiamiento', 'Nov-26')}`);
check('1u Pago Préstamos sin cambio en todo el recorrido', JSON.stringify(fl['Pago Préstamos - Total']) === pagoAntes);

// ═══ 2. REGISTRO SIMPLE RENOVABLE (Osiris) ═════════════════════════════
// Una renovación confirmada guardada es de solo lectura: cada modalidad nueva se
// registra anulando la anterior (con motivo) y agregando otra.
console.log('\n── 2. Renovaciones (Osiris) ──');
const leerOsiris = async () => {
  const f = await leerFlujo('Osiris');
  const g = (L, m) => v(f, L, m) ?? 0;
  return { f, pago: g('Pago Préstamos - Total', 'Dec-26'), ing: g('Ingreso Renovación', 'Dec-26'), ingTot: totalLinea(f, 'Ingreso Renovación'),
    jun: g('Renovaciones', 'Jun-27'), dic: g('Renovaciones', 'Dec-27'), jun28: g('Renovaciones', 'Jun-28'), dic28: g('Renovaciones', 'Dec-28'), renTot: totalLinea(f, 'Renovaciones') };
};
const fmt = (o) => `Pago Dec-26 ${o.pago} · Ingreso Ren. Dec-26 ${o.ing} (total ${o.ingTot}) · Renov. Jun-27 ${o.jun} / Dec-27 ${o.dic} / Jun-28 ${o.jun28} / Dec-28 ${o.dic28} (total ${o.renTot})`;
const avisoFlujo = async () => (await page.locator('[data-aviso-creditos-desembolso-renovacion]').count()) ? page.locator('[data-aviso-creditos-desembolso-renovacion]').innerText() : '';
const renN = (i) => credStore('e2e-renov').renovaciones[i];
const ultimoHist = () => { const h = credStore('e2e-renov').historial || []; return h[h.length - 1] || {}; };
const caso = async (nombre, esperado, { excel = true, fotoMes = 'Jun-27' } = {}) => {
  const o = await leerOsiris();
  console.log(`   ${nombre}: ${fmt(o)}`);
  const claves = Object.keys(esperado);
  check(`${nombre}: ${claves.map(k => `${k} ${esperado[k]}`).join(' · ')}`, claves.every(k => aprox(o[k] ?? 0, esperado[k])), fmt(o));
  await fotoFlujo(`flujo-osiris-${nombre}`, fotoMes);
  if (excel) await compararExcel(`osiris-${nombre}`, o.f);
  return o;
};
const saldoCapitalDetalle = async () => { await abrirDetalle('Banco Renov E2E'); return kpiModal('Saldo capital'); };

let o = await caso('antigua', { pago: 1050000, ingTot: 1000000, jun: 50000, dic: 1050000 });
let av = await avisoFlujo();
check('2a Antigua: aviso en la pantalla del flujo "sin modalidad"', /sin modalidad/.test(av) && /Banco Renov E2E/.test(av), av.slice(0, 160));

async function abrirEdicion() {
  await irACreditos();
  await page.locator('tr', { hasText: 'Banco Renov E2E' }).first().locator('button[title="Editar condiciones"]').click();
  await page.waitForTimeout(700);
  await page.locator('[data-renovacion-modalidad="0"]').waitFor({ timeout: 10000 });
}
const boxRen = (ri) => page.locator(`[data-renovacion-modalidad="${ri}"]`);
// tarjeta completa de la renovación: el div más cercano que contiene su encabezado
const cardRen = (ri) => boxRen(ri).locator(`xpath=ancestor::div[./div/div[normalize-space(.)="Renovación ${ri + 1}"]][1]`);
async function guardarForm() {
  const nAl = alertas.length;
  await page.getByRole('button', { name: /💾 Guardar/ }).click();
  await page.waitForTimeout(1800);
  return alertas.slice(nAl);
}
const modalAbierto = async () => (await page.locator('[data-renovacion-modalidad="0"]').count()) > 0;
const cancelarForm = async () => { if (await modalAbierto()) { await page.getByRole('button', { name: /^Cancelar$/ }).last().click().catch(() => {}); await page.waitForTimeout(500); } };
const selIntereses = (ri) => page.locator(`[data-renovacion-intereses="${ri}"]`);
const selOrigen = (ri) => page.locator(`[data-renovacion-origen="${ri}"]`);
const textoOrigen = (ri) => selOrigen(ri).evaluate(s => s.options[s.selectedIndex]?.text || '').catch(() => '');
async function escribirNumero(loc, valor) { await loc.click(); await page.waitForTimeout(60); await loc.fill(String(valor)); await loc.evaluate(e => e.blur()); await page.waitForTimeout(120); }
const idxSel = (ri, fn) => cardRen(ri).evaluate((card, src) => { const f = new Function('s', 'return ' + src); return [...card.querySelectorAll('select')].map((s, i) => f(s) ? i : -1).filter(i => i >= 0); }, fn);
const SEL_TIPO = "[...s.options].some(o => o.text === 'Capital+Interés') && !s.closest('[data-renovacion-modalidad]')";
const SEL_MES = "[...s.options].some(o => o.text === 'Dic')";
async function anularRen(ri, motivo) {
  respuestaPrompt = motivo;
  const nAl = alertas.length;
  await cardRen(ri).getByRole('button', { name: /Anular/ }).first().click();
  await page.waitForTimeout(300);
  respuestaPrompt = 'prueba e2e';
  return alertas.slice(nAl);
}
// Agrega una renovación con el formulario (ya abierto). Devuelve su índice.
async function agregarRen({ modalidad, estado = 'si', intereses, monto = 1000000, ingreso, cuotas }) {
  const ri = await page.locator('[data-renovacion-modalidad]').count();
  await page.getByRole('button', { name: /\+ Agregar renovación/ }).click();
  await page.waitForTimeout(300);
  const b = boxRen(ri), c = cardRen(ri);
  await b.locator('select').nth(0).selectOption(modalidad);
  await b.locator('select').nth(1).selectOption(estado);
  await page.waitForTimeout(150);
  if (intereses) await selIntereses(ri).selectOption(intereses);
  await escribirNumero(c.locator('input[placeholder="Ej: 500000"]'), monto);
  if (ingreso) {
    const im = await idxSel(ri, SEL_MES);
    await c.locator('select').nth(im[0]).selectOption(ingreso[0]);
    await escribirNumero(c.locator('input[placeholder="2026"]').first(), ingreso[1]);
  }
  for (let k = 0; k < cuotas.length; k++) { await c.getByRole('button', { name: /\+ Agregar cuota/ }).click(); await page.waitForTimeout(120); }
  const it = await idxSel(ri, SEL_TIPO), imes = (await idxSel(ri, SEL_MES)).slice(-cuotas.length);
  const anios = c.locator('input[placeholder="2026"]'), nA = await anios.count();
  for (let k = 0; k < cuotas.length; k++) {
    await c.locator('select').nth(it[k]).selectOption(cuotas[k][0]);
    await c.locator('select').nth(imes[k]).selectOption(cuotas[k][1]);
    await escribirNumero(anios.nth(nA - cuotas.length + k), cuotas[k][2]);
  }
  await page.waitForTimeout(250);
  return ri;
}
const CUOTAS_27 = [['Solo Interés', 'Jun', 2027], ['Capital+Interés', 'Dic', 2027]];

// ── R1: la renovación ANTIGUA pasa a extensión + pagados (rechazos primero)
await abrirEdicion();
let b0 = boxRen(0), c0 = cardRen(0);
check('2b Formulario: renovación antigua rotulada "Registro antiguo"', /Registro antiguo/.test(await b0.innerText()));
await b0.locator('select').nth(0).selectOption('extension');
await b0.locator('select').nth(1).selectOption('si');
await page.waitForTimeout(250);
check('2c Extensión: sin Mes/Año de ingreso; nota "el interés corre desde el vencimiento que se renueva (31/12/2026)"', (await page.locator('[data-renovacion-interes-desde="0"]').count()) === 1
  && /31\/12\/2026/.test(await page.locator('[data-renovacion-interes-desde="0"]').innerText()) && (await c0.locator('select').count()) >= 1);
check('2d Origen = SELECT con los vencimientos; por defecto 31/12/2026 · $1,050,000', /31\/12\/2026/.test(await textoOrigen(0)), await textoOrigen(0));
let al = await guardarForm();
check('2e Sin "Intereses y cargos": rechazado con aviso, no escribe', al.some(a => /intereses/i.test(a)) && renN(0).modalidad === undefined && await modalAbierto(), al[0]);
await selIntereses(0).selectOption('pagados');
const it0 = await idxSel(0, SEL_TIPO);
const iCap = (await Promise.all(it0.map(async i => [i, await c0.locator('select').nth(i).inputValue()]))).find(([, x]) => x === 'Capital+Interés')[0];
await c0.locator('select').nth(iCap).selectOption('Solo Interés');
al = await guardarForm();
check('2f Sin cuota "Capital+Interés": rechazado con aviso, no escribe', al.some(a => /Capital\+Inter/.test(a)) && renN(0).modalidad === undefined, al[0]);
await c0.locator('select').nth(iCap).selectOption('Capital+Interés');
await escribirNumero(c0.locator('input[placeholder="Ej: 500000"]'), 1200000);
al = await guardarForm();
check('2g Monto 1.200.000 > capital disponible 1.000.000: rechazado con aviso, no escribe', al.some(a => /supera/i.test(a)) && renN(0).modalidad === undefined, al[0]);
await escribirNumero(c0.locator('input[placeholder="Ej: 500000"]'), 1000000);
const prev0 = await c0.innerText();
check('2h Vista previa (modelo): $50,000 y $1,050,000', /\$50,000/.test(prev0) && /\$1,050,000/.test(prev0));
await b0.scrollIntoViewIfNeeded();
await foto(page, '06-form-renovacion-extension-pagados');
al = await guardarForm();
check('2i R1 extensión + pagados guardada sin avisos', al.length === 0 && !(await modalAbierto()), al.join(' | '));
check('2j Store R1: extension · confirmada · pagados · origen 2026-12-31 (venc_origen_key con el uid)', renN(0).modalidad === 'extension' && renN(0).confirmada === true && renN(0).intereses === 'pagados'
  && renN(0).venc_origen === '2026-12-31' && /^e2e-renov@/.test(renN(0).venc_origen_key || ''), JSON.stringify({ i: renN(0).intereses, vo: renN(0).venc_origen, k: renN(0).venc_origen_key }));
check('2k Historial: "ren.1: extension · confirmada · intereses pagados · 1000000"', /ren\.1: extension · confirmada · intereses pagados · 1000000/.test(ultimoHist().detalle || ''), ultimoHist().detalle);
o = await caso('extension-pagados', { pago: 50000, ingTot: 0, jun: 50000, dic: 1050000 });
await abrirDetalle('Banco Renov E2E');
let det = await page.locator('table').filter({ hasText: '31/12/2026' }).first().innerText().catch(() => '');
check('2l Detalle: 31/12/2026 "1,000,000.00 renovado sin caja"; sin pagos; Saldo capital 1,000,000.00', /1,000,000\.00 renovado sin caja/.test(det) && !(credStore('e2e-renov').pagos || []).length
  && /^\$1,000,000\.00$/.test(await kpiModal('Saldo capital') || ''), await kpiModal('Saldo capital'));
await foto(page, '07-detalle-extension-renovado-sin-caja');
await cerrarModal();

// ── Solo lectura de una confirmada guardada; desmarcar "renovable" bloqueado
await abrirEdicion();
b0 = boxRen(0); c0 = cardRen(0);
const ro = [await b0.locator('select').nth(0).isDisabled(), await b0.locator('select').nth(1).isDisabled(), await selOrigen(0).isDisabled(), await selIntereses(0).isDisabled(),
  await c0.locator('input[placeholder="Ej: 500000"]').isDisabled()];
check('2m Confirmada guardada: modalidad, estado, origen, intereses y monto deshabilitados + aviso data-renovacion-bloqueada', ro.every(Boolean) && (await page.locator('[data-renovacion-bloqueada="0"]').count()) === 1, ro.join(','));
await b0.scrollIntoViewIfNeeded();
await foto(page, '06b-form-renovacion-confirmada-solo-lectura');
const chkRenov = page.locator('label', { hasText: 'Crédito Renovable' }).locator('input[type=checkbox]');
let nAl = alertas.length;
await chkRenov.click();
await page.waitForTimeout(300);
check('2n Desmarcar "Crédito Renovable" con renovaciones guardadas: aviso y sigue marcado', alertas.length > nAl && await chkRenov.isChecked(), alertas.slice(nAl)[0]);
// Edición forzada de un campo bloqueado (por el DOM): guardar() debe rechazarla
await b0.locator('select').nth(0).evaluate(s => { s.disabled = false; });
await b0.locator('select').nth(0).selectOption('pago_y_nuevo').catch(() => {});
await page.waitForTimeout(200);
al = await guardarForm();
check('2n2 Cambiar por fuera la modalidad de una confirmada guardada: guardar() la rechaza y no escribe', al.length > 0 && renN(0).modalidad === 'extension', al[0] || '(sin aviso)');
await cancelarForm();

// ── R2: anular R1 + extensión con intereses PENDIENTES
await abrirEdicion();
al = await anularRen(0, 'pasa a intereses pendientes (e2e)');
let ri = await agregarRen({ modalidad: 'extension', intereses: 'pendientes', cuotas: CUOTAS_27 });
check(`2o R${ri + 1}: origen por defecto 31/12/2026 (R1 anulada no ofrece cuotas)`, /31\/12\/2026/.test(await textoOrigen(ri)), await textoOrigen(ri));
al = await guardarForm();
check(`2p Store: R1 anulada con motivo; R${ri + 1} extension · pendientes confirmada`, renN(0).anulada === true && renN(ri).intereses === 'pendientes' && renN(ri).confirmada === true && al.length === 0, al.join(' | '));
check('2q Historial: registra "ren.1: ANULADA (...)" y la nueva', /ren\.1: ANULADA \(pasa a intereses pendientes/.test(ultimoHist().detalle || '') && /ren\.2: extension · confirmada · intereses pendientes/.test(ultimoHist().detalle || ''), ultimoHist().detalle);
o = await caso('extension-pendientes', { pago: 0, ingTot: 0, jun: 100000, dic: 1050000 });
await abrirDetalle('Banco Renov E2E');
det = await page.locator('table').filter({ hasText: '31/12/2026' }).first().innerText().catch(() => '');
check('2r Detalle: 31/12/2026 "Renovada (sin caja)"; Saldo capital 1,000,000.00', /Renovada \(sin caja\)/.test(det) && /^\$1,000,000\.00$/.test(await kpiModal('Saldo capital') || ''), await kpiModal('Saldo capital'));
await foto(page, '08-detalle-extension-pendientes');
await cerrarModal();

// ── R3: extensión con intereses CAPITALIZADOS
await abrirEdicion();
await anularRen(ri, 'pasa a capitalizados (e2e)');
ri = await agregarRen({ modalidad: 'extension', intereses: 'capitalizados', cuotas: CUOTAS_27 });
const prevCap = await cardRen(ri).innerText();
al = await guardarForm();
check(`2s R${ri + 1} extensión capitalizados guardada; vista previa $52,500 / $1,102,500`, renN(ri).intereses === 'capitalizados' && al.length === 0 && /\$52,500/.test(prevCap) && /\$1,102,500/.test(prevCap), al.join(' | '));
o = await caso('extension-capitalizados', { pago: 0, ingTot: 0, jun: 52500, dic: 1102500 });
await abrirDetalle('Banco Renov E2E');
const kCap = await kpiModal('Saldo capital'), kInt = await kpiModal('Intereses pendientes');
check('2t Capitalizados (hoy, antes del 31/12/2026): Saldo capital 1,000,000.00 (el 50.000 sigue como interés)', /^\$1,000,000\.00$/.test(kCap || ''), `${kCap} · intereses ${kInt}`);
await cerrarModal();

// ── R4: PAGO Y NUEVO (exige mes/año de ingreso)
await abrirEdicion();
await anularRen(ri, 'pasa a pago y nuevo (e2e)');
ri = await agregarRen({ modalidad: 'pago_y_nuevo', cuotas: CUOTAS_27 });
al = await guardarForm();
check(`2u R${ri + 1} pago y nuevo sin mes/año de ingreso: rechazado`, al.length > 0 && !(renN(ri) && renN(ri).modalidad === 'pago_y_nuevo'), al[0]);
const imI = await idxSel(ri, SEL_MES);
await cardRen(ri).locator('select').nth(imI[0]).selectOption('Dic');
await escribirNumero(cardRen(ri).locator('input[placeholder="2026"]').first(), 2026);
check(`2v R${ri + 1} pago y nuevo: sin selector de intereses ni de origen`, (await selIntereses(ri).count()) === 0 && (await selOrigen(ri).count()) === 0);
al = await guardarForm();
check(`2w Store/historial: R${ri + 1} pago_y_nuevo · confirmada`, renN(ri).modalidad === 'pago_y_nuevo' && renN(ri).confirmada === true && al.length === 0 && new RegExp(`ren\\.${ri + 1}: pago_y_nuevo · confirmada`).test(ultimoHist().detalle || ''), `${ultimoHist().detalle} ${al.join(' | ')}`);
o = await caso('pago-y-nuevo', { pago: 1050000, ingTot: 1000000, ing: 1000000, jun: 50000, dic: 1050000 });
await abrirEdicion();
const chkRec = boxRen(ri).locator('input[type=checkbox]');
check('2x "Ya recibidos" habilitado en la pago y nuevo confirmada guardada', !(await chkRec.isDisabled()));
await chkRec.check();
await page.waitForTimeout(200);
await boxRen(ri).locator('input[type=date]').fill('2026-10-15');
await boxRen(ri).scrollIntoViewIfNeeded();
await foto(page, '09-form-renovacion-pago-y-nuevo-recibidos');
al = await guardarForm();
check('2y Store/historial: recibido 2026-10-15', renN(ri).recibido && renN(ri).recibido.fecha === '2026-10-15' && /fondos recibidos 2026-10-15/.test(ultimoHist().detalle || '') && al.length === 0, `${ultimoHist().detalle} ${al.join(' | ')}`);
o = await caso('pago-y-nuevo-recibidos', { pago: 1050000, ingTot: 0, jun: 50000, dic: 1050000 });

// ── R5: PARCIAL 600.000 + pagados
await abrirEdicion();
await anularRen(ri, 'pasa a parcial (e2e)');
ri = await agregarRen({ modalidad: 'parcial', intereses: 'pagados', monto: 600000, cuotas: CUOTAS_27 });
await boxRen(ri).scrollIntoViewIfNeeded();
await foto(page, '10-form-renovacion-parcial-pagados');
al = await guardarForm();
check(`2z Store: R${ri + 1} parcial · confirmada · pagados · 600000`, renN(ri).modalidad === 'parcial' && Number(renN(ri).monto) === 600000 && renN(ri).intereses === 'pagados' && al.length === 0, al.join(' | '));
o = await caso('parcial-600-pagados', { pago: 450000, ingTot: 0, jun: 30000, dic: 630000 });

// ── R6 extensión pagados + R7 ENCADENADA (origen = última cuota de R6), primero propuesta
await abrirEdicion();
await anularRen(ri, 'base para la encadenada (e2e)');
const rBase = await agregarRen({ modalidad: 'extension', intereses: 'pagados', cuotas: CUOTAS_27 });
al = await guardarForm();
check(`2A R${rBase + 1} extensión pagados (base) guardada`, renN(rBase).confirmada === true && al.length === 0, al.join(' | '));
await abrirEdicion();
const rCad = await agregarRen({ modalidad: 'extension', estado: 'no', intereses: 'pagados', cuotas: [['Solo Interés', 'Jun', 2028], ['Capital+Interés', 'Dic', 2028]] });
const oCad = await textoOrigen(rCad);
check(`2B R${rCad + 1}: origen por defecto = última cuota de R${rBase + 1} (12/2027 · $1,050,000 · renovación ${rBase + 1})`, /12\/2027/.test(oCad) && /1,050,000/.test(oCad) && new RegExp(`renovación ${rBase + 1}`).test(oCad), oCad);
const prevCad = await cardRen(rCad).innerText();
check(`2C Vista previa R${rCad + 1}: $50,000 (Jun-28) y $1,050,000 (Dic-28)`, /\$50,000/.test(prevCad) && /\$1,050,000/.test(prevCad));
await boxRen(rCad).scrollIntoViewIfNeeded();
await foto(page, '11-form-renovacion-encadenada-propuesta');
al = await guardarForm();
check(`2D R${rCad + 1} guardada como propuesta`, renN(rCad).confirmada === false && al.length === 0, al.join(' | '));
o = await caso('encadenada-propuesta', { pago: 50000, ingTot: 0, jun: 50000, dic: 1050000, jun28: 0, dic28: 0 }, { excel: false, fotoMes: 'Dec-27' });
av = await avisoFlujo();
check('2E Propuesta: aviso en la pantalla del flujo "propuesta(s) NO se proyectan"', /propuesta\(s\) NO se proyectan/.test(av), av.slice(0, 200));
await fotoFlujo('12-flujo-osiris-propuesta-con-aviso', 'Dec-26');
await abrirEdicion();
await boxRen(rCad).locator('select').nth(1).selectOption('si');
await page.waitForTimeout(200);
al = await guardarForm();
check(`2F R${rCad + 1} confirmada (origen Dic-27 de R${rBase + 1})`, renN(rCad).confirmada === true && /^2027-12/.test(renN(rCad).venc_origen || '') && al.length === 0, `${renN(rCad).venc_origen} ${al.join(' | ')}`);
o = await caso('encadenada', { pago: 50000, ingTot: 0, jun: 50000, dic: 50000, jun28: 50000, dic28: 1050000 }, { fotoMes: 'Jun-28' });
const sCad = await saldoCapitalDetalle();
check('2G Encadenada: Saldo capital 1,000,000.00 (sin duplicar)', /^\$1,000,000\.00$/.test(sCad || ''), sCad);
await foto(page, '13-detalle-encadenada');

// ── Pago en una cuota de la encadenada → no se puede anular; tampoco la base (origen de otra)
await page.locator('tr', { hasText: '/06/2028' }).first().getByRole('button', { name: /💵 Pagar/ }).click();
await page.waitForTimeout(300);
await inputTras(page, 'Fecha efectiva').fill('2026-10-15');
await ponerNumero(page, 'Intereses', '50000');
await page.getByRole('button', { name: /💾 Registrar pago/ }).click();
await page.waitForTimeout(1800);
const pagosR = (credStore('e2e-renov').pagos || []).filter(p => !p.anulado);
check(`2H Pago de 50.000 en la cuota Jun-28 de R${rCad + 1}`, pagosR.length === 1 && new RegExp(`@R${rCad}@`).test(pagosR[0].vencKey || ''), JSON.stringify(pagosR.map(p => p.vencKey)));
await cerrarModal();
const antesAnular = JSON.stringify(credStore('e2e-renov').renovaciones);
await abrirEdicion();
al = await anularRen(rCad, 'intento con pago (e2e)');
check(`2I Anular R${rCad + 1} con un pago en sus cuotas: aviso y no queda anulada`, al.some(a => /pago/i.test(a)) && !/Anulada ·/.test(await cardRen(rCad).innerText()), al[0]);
al = await anularRen(rBase, 'intento con dependiente (e2e)');
check(`2J Anular R${rBase + 1} cuya cuota es origen de R${rCad + 1}: aviso y no queda anulada`, al.some(a => /renueva una cuota de esta/.test(a)) && !/Anulada ·/.test(await cardRen(rBase).innerText()), al[0]);
await cardRen(rCad).scrollIntoViewIfNeeded();
await foto(page, '13b-form-renovacion-con-pago-bloqueada');
await cancelarForm();
check('2K Nada cambió en el servidor', JSON.stringify(credStore('e2e-renov').renovaciones) === antesAnular);

// ── Anular el pago y luego las dos renovaciones vigentes
await abrirDetalle('Banco Renov E2E');
respuestaPrompt = 'pago de prueba (e2e)';
await page.locator('tr', { hasText: '15/10/2026' }).getByRole('button', { name: /Anular/ }).first().click();
await page.waitForTimeout(1800);
respuestaPrompt = 'prueba e2e';
check('2L Pago anulado con motivo', (credStore('e2e-renov').pagos || []).every(p => p.anulado));
await cerrarModal();
await abrirEdicion();
await anularRen(rCad, 'segunda renovación no aprobada (e2e)');
await anularRen(rBase, 'el banco no aprobó la renovación (e2e)');
check('2M Formulario: "Anulada · motivo" en las dos', /Anulada · segunda renovación no aprobada/.test(await cardRen(rCad).innerText()) && /Anulada · el banco no aprobó/.test(await cardRen(rBase).innerText()));
await cardRen(rBase).scrollIntoViewIfNeeded();
await foto(page, '14-form-renovaciones-anuladas');
al = await guardarForm();
const rens = credStore('e2e-renov').renovaciones;
check(`2N Store: las ${rens.length} renovaciones se conservan, todas anuladas con motivo, usuario y fecha`, rens.length === rCad + 1 && rens.every(r => r.anulada === true && r.motivoAnulacion && r.anuladaPor && r.anuladaTs), al.join(' | '));
check('2O Historial: última entrada con las dos ANULADA (motivo)', /ANULADA \(segunda renovación/.test(ultimoHist().detalle || '') && /ANULADA \(el banco no aprobó/.test(ultimoHist().detalle || ''), ultimoHist().detalle);
o = await caso('anuladas', { pago: 1050000, ingTot: 0, renTot: 0 });
const sAn = await saldoCapitalDetalle();
det = await page.locator('table').filter({ hasText: '31/12/2026' }).first().innerText().catch(() => '');
check('2P Anuladas: Saldo capital 1,000,000.00 (sin deuda duplicada) y el 31/12/2026 vence completo', /^\$1,000,000\.00$/.test(sAn || '') && /\$1,050,000\.00\s+Pendiente/.test(det.replace(/\t/g, ' ')),
  `${sAn} · ${det.split('\n').find(l => /31\/12\/2026/.test(l)) || ''}`);
await foto(page, '15-detalle-renovaciones-anuladas');
await cerrarModal();
check('2Q finanzas_real intacto', realIntacto());
check('Sin errores de JavaScript en la página', errores.length === 0, errores.slice(0, 3).join(' | '));
console.log(`   hosts externos bloqueados (no salieron): ${[...new Set(bloqueados)].join(', ') || 'ninguno'}`);
fs.writeFileSync(path.join(OUT, 'creditos-final.json'), JSON.stringify(leerFila(store, 'finanzas').creditos_data, null, 2));
fs.writeFileSync(path.join(OUT, 'comparaciones-excel.json'), JSON.stringify(comparaciones, null, 1));
fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(resultados, null, 2));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nE2E desembolso/renovación OK');
process.exit(fallos ? 1 : 0);

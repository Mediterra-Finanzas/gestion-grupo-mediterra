/* ─────────────────────────────────────────────────────────────────────────
   VISTA PREVIA CON DATOS SIMULADOS — Créditos (app real, Supabase falso).

   Siembra un conjunto de ejemplo y recorre las mejoras pedidas antes del
   merge, con capturas y verificaciones:
     1. Conciliación por acreedor (capital contra capital, moneda original).
     2. Dos escenarios de caja (confirmado vs incluyendo por conciliar), sin
        duplicar un valor manual vigente.
     3. Excel con hoja "Servicio deuda", RECALCULADO con LibreOffice:
        capital + intereses + cargos + sin desglosar = servicio, y control = 0.
     4. Anular una nómina con un pago vigente en Créditos exige resolverlo.
     5. Monedas: TC de Maestros (manual prevalece), fecha y fuente; sin TC →
        importe no convertido y total incompleto.

   NADA de esto concilia datos reales. Uso:
     CI=true npx react-scripts build; (cd build && python3 -m http.server 4173 --bind 127.0.0.1 &)
     OUT_DIR=/tmp/vista-previa node scripts/e2e/vista-previa-creditos.mjs
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, irAFlujoEmpresas, elegirEmpresa, subTab, num } from './lib.mjs';
import { recalcular } from './xls.mjs';
const require = createRequire('/home/user/gestion-grupo-mediterra/package.json');
const XLSXns = require('xlsx-js-style');
const XLSX = XLSXns.utils ? XLSXns : (XLSXns.default || XLSXns);

const OUT = process.env.OUT_DIR || '.';
const DESC = path.join(OUT, 'descargas'); fs.mkdirSync(DESC, { recursive: true });
let fallos = 0; const resultados = [];
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); resultados.push({ n, ok: !!c, x }); if (!c) fallos++; };
const foto = async (page, n, full = false) => { await page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: full }); };

// ── Datos simulados ───────────────────────────────────────────────────────
const hoy = new Date(); const HOY = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const mesHoy = `${MN[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}`;
const idxMes = (l) => { const [m, y] = l.split('-'); return (2000 + Number(y) - 2026) * 12 + MN.indexOf(m) - 3; };
const idxHoy = idxMes(mesHoy);
const creditos = [
  // A) Contrato USD, Q1 pagada; Q2 (10-jul) vencida confirmada (controlado desde el desembolso)
  { uid: 'A', n: 1, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', tipo_cr: 'Capital de trabajo',
    monto: 400000, fecha_desembolso: '2026-01-10', primer_venc: '2026-04-10', vencimiento_final: '2027-01-10', periodicidad: 3, modalidad: 'lineal',
    tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-01-10', prepago_comision_tipo: 'meses_interes', prepago_comision_valor: 1,
    pagos: [{ id: 'pA1', vencKey: 'A@2026-04-10', fecha: '2026-04-10', capital: 100000, interes: 8000, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'demo', ts: '2026-04-10T12:00:00Z' }] },
  // B) Registros antiguos sin desglose (por conciliar los vencidos)
  { uid: 'B1', n: 30, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-07-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B2', n: 31, empresa: 'Osiris', acreedor: 'Banco Security', tipo_inst: 'Banco', monto: 9178, cuota: 9178, f_venc: '2026-12-31', tipo_cr: 'Cuotas Mensuales', pagado: false },
  { uid: 'B3', n: 36, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 550000, cuota: 550000, f_venc: '2027-01-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  { uid: 'B4', n: 35, empresa: 'Mediterra', acreedor: 'Privado Particular', tipo_inst: 'Privado', monto: 34650, cuota: 34650, f_venc: '2026-09-01', tipo_cr: 'Inversión', tasa: '12.6%', pagado: false },
  // C) CLP con TC de Maestros
  { uid: 'C', n: 3, tipo_credito: 'contrato', empresa: 'Allegria Service', acreedor: 'Banco CLP Demo', moneda: 'CLP', tipo_cr: 'Capital de trabajo',
    monto: 95000000, fecha_desembolso: '2026-06-01', vencimiento_final: '2026-12-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 6, base: 'act360', control_desde: '2026-06-01' },
  // D) PEN sin TC en Maestros ni declarado → no convertido
  { uid: 'D', n: 4, tipo_credito: 'contrato', empresa: 'Frisku Foods', acreedor: 'Banco Perú Demo', moneda: 'PEN', tipo_cr: 'Capital de trabajo',
    monto: 300000, fecha_desembolso: '2026-07-01', vencimiento_final: '2027-07-01', modalidad: 'bullet_int', periodicidad: 6, tasa_tipo: 'variable',
    tasa_ref_nombre: 'TAMN', tasa_ref_hipotesis: 9, margen: 2, base: 'act360', control_desde: '2026-07-01' },
];
const tcSerie = { 'USD-CLP': [ { fecha: '2026-09-25', valor: 948, fuente: 'mindicador' }, { fecha: '2026-09-29', valor: 955, fuente: 'manual' } ] };
const VKQ2 = 'A@2026-07-10';
const store = nuevoStore();
store.finanzas.value.creditos_data = creditos;
store.finanzas.value.creditos_saldos_informados = [
  { id: 's1', empresa: 'Osiris', acreedor: 'Banco Demo', moneda: 'USD', fecha: HOY, capital: 300000, respaldo: 'Certificado de deuda simulado', usuario: 'demo', ts: '2026-09-30T10:00:00Z' },
  { id: 's2', empresa: 'Mediterra', acreedor: 'Privado Particular', moneda: 'USD', fecha: HOY, capital: 550000, respaldo: 'Carta del acreedor simulada', usuario: 'demo', ts: '2026-09-30T10:00:00Z' },
];
// Valor manual antiguo vigente en Pago Préstamos de Osiris en el mes en curso y en el siguiente
store.finanzas.value.finanzas_real = { Osiris: { _proyOverrides: { 'egr_nop::Pago Préstamos - Total': { [String(idxHoy)]: 150000, [String(idxHoy + 1)]: 20000 } } } };
store.maestro_tc = { value: tcSerie, updated_at: new Date(Date.now() - 30000).toISOString() };
// Nómina aprobada de Osiris con un pago ya registrado en Créditos (cuota Q2, 50.000)
const semIso = (() => { const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); return Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7); })();
store.finanzas.value.creditos_data[0].pagos.push({ id: 'pNom', vencKey: VKQ2, fecha: '2026-07-10', capital: 43933.33, interes: 6066.67, cargos: 0, sinDesglose: 0, tipo: 'pago',
  origen: { tipo: 'nomina', clave: 'nomina:NOMX:IT1', nominaId: 'NOMX', itemId: 'IT1', nombreNomina: 'Nómina Osiris demo' }, usuario: 'demo', ts: '2026-07-10T15:00:00Z' });
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: new Date(Date.now() - 20000).toISOString() };
store.nominas_osiris = { value: JSON.stringify({ nominas: [{ id: 'NOMX', empresa: 'Osiris', semana: semIso, año: hoy.getFullYear(), numero: 1, fecha: HOY, tc: 950, estado: 'aprobada',
  preparadoPor: 'demo', aprobadoPor: 'Angelo Huerta', items: [{ id: 'IT1', seccion: 'pagos_usd', proveedor: 'Banco Demo', concepto: 'Cuota Q2', montoUSD: 50000, montoCLP: 0, montoPEN: 0,
  estadoLinea: 'activa', historial: [], documentos: [], creditoVinculo: { uid: 'A', vencKey: VKQ2, acreedor: 'Banco Demo', fecha: '2026-07-10' } }],
  bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] }] }), updated_at: new Date(Date.now() - 19000).toISOString() };

const { browser, page } = await abrirApp(store);
const errores = []; page.on('pageerror', e => errores.push(String(e)));
let resp = 'motivo de prueba';
page.on('dialog', d => (d.type() === 'prompt' ? d.accept(resp) : d.accept()).catch(() => {}));
await login(page); await entrarFinanzas(page);

// ── 1. Conciliación por acreedor ─────────────────────────────────────────
await subTab(page, /💳 Créditos/);
await subTab(page, /Conciliación/);
await page.waitForTimeout(800);
const tablaAcr = page.locator('table').filter({ hasText: 'Capital informado' }).first();
await tablaAcr.scrollIntoViewIfNeeded();
await foto(page, '01-conciliacion-acreedores');
const filaA = await tablaAcr.locator('tr', { hasText: 'Banco Demo' }).first().innerText();
// Capital app al corte: Q2 + Q3 + Q4 = 300.000 − 43.933,33 pagado de Q2 = 256.066,67
check('Banco Demo: capital app 256.066,67 (Q2 parcialmente pagada) vs informado 300.000 → diferencia 43.933,33',
  filaA.includes('256,066.67') && filaA.includes('300,000.00') && filaA.includes('43,933.33') && /Diferencia de capital/.test(filaA));
const filaB = await tablaAcr.locator('tr', { hasText: 'Privado Particular' }).first().innerText();
check('Privado Particular: capital identificado 0, sin clasificar 550.000 → "Conciliación incompleta" (no cuadra por sumar sin desglose)',
  /Conciliación incompleta/.test(filaB) && filaB.includes('550,000.00') && /sin desglosar/.test(filaB));

// ── 2. Escenarios de caja ───────────────────────────────────────────────
const txtEsc = await page.locator('div', { hasText: 'Dos escenarios de caja' }).last().innerText().catch(() => '');
check('Tabla de dos escenarios presente', /dos escenarios de caja/i.test(await page.locator('body').innerText()));
const tablaEsc = page.locator('table').filter({ hasText: 'Cuotas sumadas al escenario' }).first();
await tablaEsc.scrollIntoViewIfNeeded(); await foto(page, '02-escenarios');
const filaEscO = await tablaEsc.locator('tr', { hasText: 'Osiris' }).first().innerText();
const filaEscM = await tablaEsc.locator('tr', { hasText: 'Mediterra' }).first().innerText();
check('Osiris: la cuota por conciliar NO se suma (valor manual vigente en el mes en curso podría cubrirla)', /1 · \$9,178/.test(filaEscO), filaEscO.replace(/\s+/g, ' '));
check('Mediterra: 34.650 por conciliar sumados al escenario', filaEscM.includes('34,650'), filaEscM.replace(/\s+/g, ' '));

// ── 5. Monedas ───────────────────────────────────────────────────────────
await subTab(page, /Análisis CFO/);
const tablaMon = page.locator('table').filter({ hasText: 'No convertido' }).first();
await tablaMon.scrollIntoViewIfNeeded(); await foto(page, '05-monedas');
const tMon = await tablaMon.innerText();
check('CLP valorizado con TC manual de Maestros 955 del 29/09/2026, fuente visible', tMon.includes('955') && tMon.includes('29/09/2026') && /manual/.test(tMon));
check('PEN sin TC: importe no convertido identificado (PEN 300,000.00)', /PEN 300,000\.00/.test(tMon));
check('Aviso de total consolidado INCOMPLETO', /INCOMPLETO/.test(await page.locator('body').innerText()));

// ── 2b. Flujo Osiris: fila de escenario y desglose con ajuste ─────────────
await irAFlujoEmpresas(page); await elegirEmpresa(page, 'Mediterra');
await page.locator('tr', { hasText: 'EGRESOS NO' }).first().locator('td,th').first().click().catch(() => {});
await page.waitForTimeout(600);
await foto(page, '02b-flujo-mediterra-escenario');
const bodyM = await page.locator('body').innerText();
check('Flujo Mediterra: fila "SALDO ACUM. incl. por conciliar" (escenario −34.650)', /SALDO ACUM\. incl\. por conciliar/.test(bodyM) && /−\$34,650/.test(bodyM));
await elegirEmpresa(page, 'Osiris');
await page.locator('tr', { hasText: 'EGRESOS NO' }).first().locator('td,th').first().click().catch(() => {});
await page.waitForTimeout(400);
await page.locator('tr', { hasText: 'Pago Préstamos - Total' }).first().getByText('▶').first().click().catch(() => {});
await page.waitForTimeout(600);
await foto(page, '03-flujo-osiris-desglose');
check('Desglose en pantalla con fila "Ajuste: valor manual vigente"', /Ajuste: valor manual vigente/.test(await page.locator('body').innerText()));

// ── 3. Excel individual y consolidado, recalculados ──────────────────────
async function bajar(nombre) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.getByRole('button', { name: /📥 Excel/ }).first().click()]);
  const r = path.join(DESC, nombre); await dl.saveAs(r); return r;
}
function verificarSD(archivo, etiqueta) {
  const rec = recalcular(archivo, DESC);
  const ws = rec.wb.Sheets['Servicio deuda'];
  if (!ws) { check(`${etiqueta}: hoja "Servicio deuda"`, false); return; }
  const filas = {};
  Object.keys(ws).filter(k => /^A\d+$/.test(k)).forEach(k => { (filas[String(ws[k].v)] = filas[String(ws[k].v)] || []).push(Number(k.slice(1))); });
  const cols = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k) && /^[A-Z][a-z]{2}-\d{2}$/.test(ws[k].v)).map(k => k.replace(/\d+$/, ''));
  const val = (c, r) => Number(ws[`${c}${r}`]?.v) || 0;
  let maxCtrl = 0, maxId = 0, n = 0;
  const bloquesCap = filas['Capital'] || [];
  bloquesCap.forEach(rc => {
    const rserv = rc + 4, raj = rc + 5, rfl = rc + 6, rctl = rc + 7;
    cols.forEach(c => {
      const ident = val(c, rc) + val(c, rc + 1) + val(c, rc + 2) + val(c, rc + 3) - val(c, rserv);
      maxId = Math.max(maxId, Math.abs(ident));
      if (String(ws[`A${rctl}`]?.v || '').startsWith('Control')) maxCtrl = Math.max(maxCtrl, Math.abs(val(c, rctl)));
      maxId = Math.max(maxId, Math.abs(val(c, rserv) + val(c, raj) - val(c, rfl)));
      n++;
    });
  });
  check(`${etiqueta}: recalculado por LibreOffice (${rec.formulasBorradas} fórmulas) — capital+intereses+cargos+sin desglosar = servicio y servicio+ajuste = línea (${n} celdas, máx. desvío ${maxId.toFixed(2)})`, maxId < 0.011);
  check(`${etiqueta}: control contra la hoja del flujo = 0 en todos los meses (máx. ${maxCtrl.toFixed(2)})`, maxCtrl < 0.011);
  return { ws, filas, cols, val };
}
await elegirEmpresa(page, 'Osiris');
const xO = await bajar('Osiris.xlsx');
const rO = verificarSD(xO, 'Excel Osiris');
if (rO) {
  const cIdx = rO.cols.find(c => rO.ws[`${c}3`].v === mesHoy);
  const rAj = rO.filas['Ajuste: valor manual vigente (flujo − Créditos)'][0];
  const rServ = rO.filas['= Servicio de deuda según Créditos'][0];
  const rFl = rO.filas['= Pago Préstamos + Renovaciones en el flujo'][0];
  // Mes en curso: manual 150.000; Créditos = vencida Q2 (56.066,67) + Q3 (104.088,89) = 160.155,56 → ajuste −10.155,56
  check(`Excel Osiris ${mesHoy}: servicio Créditos 160.155,56 + ajuste −10.155,56 = línea del flujo 150.000 (manual vigente)`,
    Math.abs(rO.val(cIdx, rServ) - 160155.56) < 0.01 && Math.abs(rO.val(cIdx, rAj) + 10155.56) < 0.01 && Math.abs(rO.val(cIdx, rFl) - 150000) < 0.01,
    `${rO.val(cIdx, rServ)} / ${rO.val(cIdx, rAj)} / ${rO.val(cIdx, rFl)}`);
}
await page.getByRole('button', { name: /🏛 Consolidado/ }).first().click(); await page.waitForTimeout(1500);
const xC = await bajar('Consolidado.xlsx');
verificarSD(xC, 'Excel consolidado');

// ── 4. Anular la nómina con pago vigente ────────────────────────────────
await subTab(page, /Nóminas/); await page.waitForTimeout(1200);
await page.locator('tr', { hasText: 'Osiris' }).filter({ hasText: 'Aprobada' }).first().locator('button', { hasText: '×' }).click().catch(() => {});
await page.waitForTimeout(700);
await foto(page, '04-anular-nomina-con-pago');
check('Anular nómina con pago vigente → muestra el vínculo y exige decidir', /tiene pagos registrados en Créditos/.test(await page.locator('body').innerText()));
await page.getByText('Conservar el pago').click();
await page.locator('xpath=//div[normalize-space(text())="Motivo (obligatorio; queda en el crédito y en la nómina)"]/following::input[1]').fill('Nómina duplicada por error; la transferencia sí se hizo');
await page.getByRole('button', { name: /Resolver y anular la nómina/ }).click();
await page.waitForTimeout(2500);
const credA = leerFila(store, 'finanzas').creditos_data.find(c => c.uid === 'A');
const pNom = credA.pagos.find(p => p.id === 'pNom');
check('Conservar: el pago sigue vigente con anotación y motivo', !pNom.anulado && (pNom.anotaciones || []).some(a => /duplicada/.test(a.texto)));
const nomX = JSON.parse(store.nominas_osiris.value).nominas.find(n => n.id === 'NOMX');
check('La nómina quedó inactiva con la decisión en su historial', nomX.estadoNomina === 'inactiva' && nomX.historial.some(h => h.accion === 'pago_credito_conservado'));

check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
fs.writeFileSync(path.join(OUT, 'resultados.json'), JSON.stringify(resultados, null, 2));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nVista previa OK');
process.exit(fallos ? 1 : 0);

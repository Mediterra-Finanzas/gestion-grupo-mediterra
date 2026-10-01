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
   Ronda 4:
     6. Cobertura explícita de un valor manual: sin definir → superposición y
        escenario PROVISIONAL; al vincular la cuota → se excluye solo esa.
     7. Diferencia exacta + tolerancia por moneda (editable) y panel de
        movimientos del capital de Banco Demo (256.066,67 vs 300.000).
     8. Saldo por Mes: fila "Hoy" = Análisis CFO, mismos avisos (incompleto,
        estimado por TC declarado, UF como hipótesis), CLP con TC de Maestros.

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
  // E) EUR sin par en Maestros, con TC declarado en el crédito (hipótesis) del 01-sep → total ESTIMADO + antigüedad
  { uid: 'E', n: 5, tipo_credito: 'contrato', empresa: 'Allegria Foods', acreedor: 'Banco EUR Demo', moneda: 'EUR', tipo_cr: 'Capital de trabajo',
    monto: 100000, fecha_desembolso: '2026-08-01', vencimiento_final: '2027-02-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 5, base: 'act360',
    control_desde: '2026-08-01', tc_flujo: 0.85, tc_flujo_fecha: '2026-09-01' },
  // F) UF: vencimiento futuro valorizado con la última UF publicada (hipótesis de proyección)
  { uid: 'F', n: 6, tipo_credito: 'contrato', empresa: 'Integrity Farms', acreedor: 'Banco UF Demo', moneda: 'UF', tipo_cr: 'Capital de trabajo',
    monto: 1000, fecha_desembolso: '2026-06-01', vencimiento_final: '2026-12-01', modalidad: 'bullet_total', tasa_tipo: 'fija', tasa_anual: 4, base: 'act360', control_desde: '2026-06-01' },
];
const tcSerie = { 'USD-CLP': [ { fecha: '2026-09-25', valor: 948, fuente: 'mindicador' }, { fecha: '2026-09-29', valor: 955, fuente: 'manual' } ],
  'UF-CLP': [ { fecha: '2026-09-29', valor: 39500, fuente: 'mindicador' } ] };
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
const tablaEsc = page.locator('table').filter({ hasText: 'Cuotas sumadas' }).first();
await tablaEsc.scrollIntoViewIfNeeded(); await foto(page, '02-escenarios');
let filaEscO = await tablaEsc.locator('tr', { hasText: 'Osiris' }).first().innerText();
const filaEscM = await tablaEsc.locator('tr', { hasText: 'Mediterra' }).first().innerText();
check('Osiris sin cobertura definida: la cuota 9.178 SE SUMA, marcada como posible superposición, escenario PROVISIONAL',
  /−\$9,178/.test(filaEscO) && /1 · \$9,178/.test(filaEscO) && /Provisional/.test(filaEscO), filaEscO.replace(/\s+/g, ' '));
check('Mediterra: 34.650 por conciliar sumados al escenario', filaEscM.includes('34,650'), filaEscM.replace(/\s+/g, ' '));
check('Aviso "ESCENARIO PROVISIONAL … No es un saldo definitivo"', /ESCENARIO PROVISIONAL[\s\S]*No es un saldo definitivo/.test(await page.locator('body').innerText()));

// ── 6. Definir cobertura del valor manual de Osiris (mes en curso) ──────
const tablaOv = page.locator('table').filter({ hasText: 'Cobertura de cuotas por conciliar' }).first();
const filaOv = tablaOv.locator('tr', { hasText: 'Osiris' }).filter({ hasText: mesHoy }).first();
check('Valor manual de Osiris: cobertura "Pendiente de conciliación"', /Pendiente de conciliación/.test(await filaOv.innerText()));
await filaOv.getByRole('button', { name: 'Definir' }).click(); await page.waitForTimeout(400);
await page.locator('label', { hasText: 'Banco Security' }).locator('input[type=checkbox]').first().check();
await page.locator('input[placeholder^="Ej: planilla de Pago Préstamos"]').fill('Planilla simulada: el valor manual incluye la cuota Banco Security 31-07');
await foto(page, '06-definir-cobertura');
await page.getByRole('button', { name: 'Guardar cobertura' }).click(); await page.waitForTimeout(1500);
const cobs = leerFila(store, 'finanzas').finanzas_real?.Osiris?._coberturasManual || [];
check('Cobertura guardada con la cuota vinculada, nota y usuario', cobs.length === 1 && cobs[0].vencKeys.includes('B1@2026-07-31') && /Banco Security/.test(cobs[0].nota) && !!cobs[0].usuario,
  JSON.stringify(cobs.map(c => c.vencKeys)));
filaEscO = await page.locator('table').filter({ hasText: 'Cuotas sumadas' }).first().locator('tr', { hasText: 'Osiris' }).first().innerText();
check('Osiris con cobertura: la cuota vinculada se EXCLUYE (1 · $9,178) y el escenario de Osiris queda completo',
  /1 · \$9,178/.test(filaEscO) && /Completo/.test(filaEscO) && !/−\$9,178/.test(filaEscO), filaEscO.replace(/\s+/g, ' '));
await page.locator('table').filter({ hasText: 'Cuotas sumadas' }).first().scrollIntoViewIfNeeded(); await foto(page, '06b-escenarios-con-cobertura');

// ── 7. Diferencia exacta, tolerancia y movimientos de Banco Demo ────────
const tablaAcr2 = page.locator('table').filter({ hasText: 'Capital informado' }).first();
const filaA2 = tablaAcr2.locator('tr', { hasText: 'Banco Demo' }).first();
const tA2 = await filaA2.innerText();
check('Banco Demo: diferencia exacta "43,933.33 USD" y tolerancia 0.01', /43,933\.33 USD/.test(tA2) && /\b0\.01\b/.test(tA2), tA2.replace(/\s+/g, ' '));
await filaA2.getByRole('button', { name: 'Ver movimientos' }).click(); await page.waitForTimeout(500);
const panel = await page.locator('td', { hasText: 'De dónde sale el capital de la app' }).first().innerText();
check('Movimientos: capital inicial 400.000, capital pagado 143.933,33 → 256.066,67',
  /400,000\.00/.test(panel) && /-143,933\.33/.test(panel) && /= Capital app\s*256,066\.67/.test(panel), panel.slice(0, 400).replace(/\s+/g, ' '));
check('Movimientos: control paso a paso = capital app; intereses 14.066,67 NO descontados del capital',
  /es igual al capital app/.test(panel) && /14,066\.67/.test(panel) && /no se descuentan del capital/.test(panel));
check('Movimientos: sin prepagos ni anulaciones (prepagos 0,00; todos los pagos cuentan)', /Prepagos de capital[^\n]*\s*0\.00|-0\.00/.test(panel) && !/ANULADO/.test(panel));
await page.locator('td', { hasText: 'De dónde sale el capital de la app' }).first().scrollIntoViewIfNeeded(); await foto(page, '07-movimientos-banco-demo');
await page.getByRole('button', { name: 'Editar tolerancias' }).click(); await page.waitForTimeout(300);
await page.locator('xpath=//div[starts-with(normalize-space(text()),"USD (inicial")]/following::input[1]').fill('0.5');
await page.getByRole('button', { name: 'Guardar', exact: true }).click(); await page.waitForTimeout(1500);
const cfg = leerFila(store, 'finanzas').creditos_config || {};
check('Tolerancia USD editada a 0,50 y guardada (con usuario)', cfg.tolerancias?.USD === 0.5 && !!cfg.toleranciasPor, JSON.stringify(cfg.tolerancias));
const tB2 = await page.locator('table').filter({ hasText: 'Capital informado' }).first().locator('tr', { hasText: 'Privado Particular' }).first().innerText();
check('Privado Particular sigue "Conciliación incompleta" aunque cambie la tolerancia (faltan desgloses)', /Conciliación incompleta/.test(tB2));
const tA3 = await page.locator('table').filter({ hasText: 'Capital informado' }).first().locator('tr', { hasText: 'Banco Demo' }).first().innerText();
check('Banco Demo sigue "Diferencia" (43.933,33 > 0,50)', /Diferencia/.test(tA3) && !/Cuadra/.test(tA3));

// ── 5. Monedas ───────────────────────────────────────────────────────────
await subTab(page, /Análisis CFO/);
const tablaMon = page.locator('table').filter({ hasText: 'No convertido' }).first();
await tablaMon.scrollIntoViewIfNeeded(); await foto(page, '05-monedas');
const tMon = await tablaMon.innerText();
check('CLP valorizado con TC manual de Maestros 955 del 29/09/2026, fuente visible', tMon.includes('955') && tMon.includes('29/09/2026') && /manual/.test(tMon));
check('PEN sin TC: importe no convertido identificado (PEN 300,000.00)', /PEN 300,000\.00/.test(tMon));
check('Aviso de total consolidado INCOMPLETO', /INCOMPLETO/.test(await page.locator('body').innerText()));
const bodyAn = await page.locator('body').innerText();
check('Análisis: total ESTIMADO por TC declarado (EUR 0,85 del 01/09/2026) con antigüedad > 7 días', /Total ESTIMADO/.test(bodyAn) && /0\.85(00)? EUR por US\$[^|]*01\/09\/2026/.test(bodyAn) && /más de 7 días/.test(bodyAn));
check('Análisis: UF futura como hipótesis de proyección', /hipótesis de proyección/.test(bodyAn));
const kpiCap = num((bodyAn.match(/Saldo capital identificado \(USD\)[^\n]*\n\s*\$([\d,]+)/i) || [])[1] || 'NaN');

// ── 8. Saldo por Mes = Análisis al mismo corte ──────────────────────────
await subTab(page, /Saldo por Mes/); await page.waitForTimeout(800);
await foto(page, '08-saldo-por-mes');
const bodySM = await page.locator('body').innerText();
const filaHoy = await page.locator('tr', { hasText: /^Hoy/ }).first().innerText().catch(() => '');
const celdas = filaHoy.split('\t').map(x => x.trim());
const kTot = num((filaHoy.match(/US\$ ([\d.]+) K/g) || []).slice(-3)[0]?.replace(/[^\d]/g, '') || 'NaN');
check(`Saldo por Mes "Hoy" = Análisis CFO (capital ${kpiCap} → ${Math.round(kpiCap / 1000)} K)`, Number.isFinite(kpiCap) && Math.round(kpiCap / 1000) === kTot, `fila: ${filaHoy.replace(/\s+/g, ' ').slice(0, 300)}`);
check('Saldo por Mes: mismos avisos (INCOMPLETO, ESTIMADO, UF hipótesis)', /Total en US\$ INCOMPLETO/.test(bodySM) && /Total ESTIMADO/.test(bodySM) && /hipótesis de proyección/.test(bodySM));
check('Saldo por Mes: capital y sin clasificar en columnas separadas', /Total capital/i.test(bodySM) && /Total sin clasificar/i.test(bodySM));
await page.getByRole('button', { name: 'CLP', exact: true }).click(); await page.waitForTimeout(400);
check('Saldo por Mes CLP: TC de Maestros 955 del 29/09/2026 (manual), sin TC editable', /TC 955\.00 CLP\/US\$ · 29\/09\/2026 · Maestros · manual/.test(await page.locator('body').innerText()));
await foto(page, '08b-saldo-por-mes-clp');
await page.getByRole('button', { name: 'USD', exact: true }).click();

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

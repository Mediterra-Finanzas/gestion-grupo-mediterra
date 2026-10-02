/* ─────────────────────────────────────────────────────────────────────────
   E2E EN NAVEGADOR — Nómina ↔ vencimiento de crédito (Supabase falso aislado).

   Datos sembrados en el store en memoria (producción no se toca):
     · crédito contrato de Osiris (control desde el desembolso), cuota 10-ago
       de 100.000 capital + 6.066,67 interés (vencida confirmada hoy);
     · nómina de Osiris de la semana en curso, "borrador", línea USD 50.000;
     · nómina de Osiris de la semana en curso N°2, "Aprobada CFO", línea
       USD 50.000 ya vinculada a esa cuota.

   Comprueba:
     1. Vincular en la nómina borrador NO registra ningún pago.
     2. Confirmar el pago efectivo en la aprobada: primer intento con el
        servidor rechazando (no queda nada), segundo intento OK → UN pago con
        origen nómina, pendiente de la cuota = 106.066,67 − 50.000.
     3. Reintentar la confirmación no duplica (idempotente por la línea).
     4. Anular el pago desde la línea: queda anulado con motivo en el crédito.
   ───────────────────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { nuevoStore, leerFila } from './fake.mjs';
import { abrirApp, login, entrarFinanzas, subTab } from './lib.mjs';
import { estadoCredito, pagosVigentes, registrarPagoIdempotente } from '../../src/creditos.js';

const OUT = process.env.OUT_DIR || '.';
fs.mkdirSync(OUT, { recursive: true });
let fallos = 0;
const check = (n, c, x = '') => { console.log(`${c ? '✓' : '✗ FALLA'}  ${n}${x ? '  — ' + x : ''}`); if (!c) fallos++; };
const foto = (page, n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });

// Semana ISO de hoy (igual que la app)
const hoy = new Date();
const t = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
const semana = Math.ceil((((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000) + 1) / 7);
const anio = t.getUTCFullYear();

const cred = { uid: 'cr-e2e-nom', n: 990, tipo_credito: 'contrato', empresa: 'Osiris', acreedor: 'Banco Nómina', moneda: 'USD',
  monto: 400000, fecha_desembolso: '2026-02-10', primer_venc: '2026-05-10', vencimiento_final: '2027-02-10',
  periodicidad: 3, modalidad: 'lineal', tasa_tipo: 'fija', tasa_anual: 8, base: 'act360', control_desde: '2026-02-10',
  pagos: [{ id: 'p0', vencKey: 'cr-e2e-nom@2026-05-10', fecha: '2026-05-10', capital: 100000, interes: 7911.11, cargos: 0, sinDesglose: 0, tipo: 'pago', usuario: 'seed', ts: '2026-05-10T12:00:00Z' }] };
const VK = 'cr-e2e-nom@2026-08-10';
const item = (id, vinculo) => ({ id, seccion: 'pagos_usd', tipoDoc: 'Factura', proveedor: 'Banco Nómina', rut: '', nDoc: '77', fDoc: '', fVenc: '', semVenc: '',
  concepto: 'Cuota crédito', montoCLP: 0, montoUSD: 50000, montoPEN: 0, comentario: '', pagado: false, anticipo: 0, estadoLinea: 'activa', historial: [], documentos: [],
  ...(vinculo ? { creditoVinculo: { uid: cred.uid, vencKey: VK, acreedor: 'Banco Nómina', fecha: '2026-08-10' } } : {}) });
const nom = (id, numero, estado, it, sem = semana) => ({ id, empresa: 'Osiris', semana: sem, año: anio, numero, fecha: hoy.toISOString().slice(0, 10), tc: 950, estado,
  preparadoPor: 'x', revisadoPor: '', aprobadoPor: estado === 'aprobada' ? 'Angelo Huerta' : '', aprobado1Por: '', fechaAprobacion: '', fechaAprobacion1: '',
  items: [it], bancos: {}, notas: '', seccionesExtra: [], estadoNomina: 'activa', historial: [] });

const store = nuevoStore();
store.finanzas.value.creditos_data = [cred];
store.nominas_v2_done = { value: JSON.stringify({ migrado: true }), updated_at: new Date(Date.now() - 40000).toISOString() };
store.nominas_osiris = { value: JSON.stringify({ nominas: [nom('nomB', 1, 'borrador', item('itB', false)), nom('nomA', 1, 'aprobada', item('itA', true), semana - 1)] }),
  updated_at: new Date(Date.now() - 39000).toISOString() };

const { browser, page } = await abrirApp(store);
const errores = [];
page.on('pageerror', e => errores.push(String(e)));
let respuestaPrompt = 'reverso de prueba';
page.on('dialog', d => (d.type() === 'prompt' ? d.accept(respuestaPrompt) : d.accept()).catch(() => {}));

const credGuardado = () => (leerFila(store, 'finanzas').creditos_data || []).find(c => c.uid === cred.uid);
const pendienteCuota = (c) => estadoCredito(c).vencimientos.find(v => v.key === VK).pendienteTotal;

await login(page);
await entrarFinanzas(page);
await subTab(page, /Nóminas/);
await page.waitForTimeout(1500);
await foto(page, 'n01-lista');

// ── 1. Nómina borrador: vincular no paga ─────────────────────────────────
const abrir = async (textoFila) => {
  const btns = page.getByRole('button', { name: /Editar|Ver/ });
  const n = await btns.count();
  for (let i = 0; i < n; i++) { // la fila de la nómina N°textoFila
    const fila = btns.nth(i).locator('xpath=ancestor::tr[1]');
    if ((await fila.innerText()).includes(textoFila)) { await btns.nth(i).click(); await page.waitForTimeout(1200); return true; }
  }
  return false;
};
const abrioB = await abrir('Borrador');
check('Abre la nómina borrador', abrioB);
if (abrioB) {
  await page.getByRole('button', { name: /🏦 Vincular/ }).first().click();
  await page.waitForTimeout(300);
  const sel = page.locator('select').filter({ hasText: 'elegir vencimiento pendiente' }).first();
  const val = await sel.locator('option', { hasText: '10/08/2026' }).getAttribute('value');
  await sel.selectOption(val);
  await page.getByRole('button', { name: /^Vincular$/ }).click();
  await page.waitForTimeout(2500);
  await foto(page, 'n02-vinculada');
  const nomsB = JSON.parse(store.nominas_osiris.value).nominas;
  const lineaB = nomsB.find(n => n.id === 'nomB').items[0];
  check('Borrador: la línea quedó vinculada (guardada en la nómina)', lineaB.creditoVinculo?.vencKey === VK);
  check('Borrador: vincular NO registró pagos en el crédito', pagosVigentes(credGuardado()).length === 1);
  check('Borrador: no ofrece "Confirmar pago efectivo"', await page.getByRole('button', { name: /Confirmar pago efectivo/ }).count() === 0);
  await page.getByRole('button', { name: /Volver|←/ }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
}

// ── 2. Nómina aprobada: confirmar pago efectivo ─────────────────────────
// la aprobada está en la semana anterior
await page.locator('button', { hasText: '‹' }).first().click();
await page.waitForTimeout(1200);
const abrioA = await abrir('Aprobada');
check('Abre la nómina aprobada', abrioA);
await page.getByRole('button', { name: /Confirmar pago efectivo/ }).first().click();
await page.waitForTimeout(400);
await foto(page, 'n03-confirmar');
store.__fallarEscrituras = true;
await page.getByRole('button', { name: /Registrar en Créditos/ }).click();
await page.waitForTimeout(2000);
check('Servidor rechaza → no queda pago nuevo', pagosVigentes(credGuardado()).length === 1);
store.__fallarEscrituras = false;
await page.getByRole('button', { name: /Registrar en Créditos/ }).click();
await page.waitForTimeout(2000);
await foto(page, 'n04-registrado');
let c1 = credGuardado();
const pNom = pagosVigentes(c1).filter(p => p.origen?.tipo === 'nomina');
check('Segundo intento → UN pago con origen nómina', pNom.length === 1 && pNom[0].origen.clave === 'nomina:nomA:itA');
// 50.000 imputado cargos → intereses → capital. Interés de la cuota 10-ago:
// 10-may→10-ago = 92 días: 300.000 × 8% × 92/360 = 6.133,33 ; capital = 50.000 − 6.133,33 = 43.866,67
check('Pago parcial imputado interés 6.133,33 + capital 43.866,67', Math.abs(pNom[0].interes - 6133.33) < 0.02 && Math.abs(pNom[0].capital - 43866.67) < 0.02,
  `interés ${pNom[0].interes} capital ${pNom[0].capital}`);
// Cuota total 106.133,33 − 50.000 = 56.133,33
check('Pendiente de la cuota = 106.133,33 − 50.000 = 56.133,33', Math.abs(pendienteCuota(c1) - 56133.33) < 0.02, `${pendienteCuota(c1)}`);
check('La línea muestra "Pago registrado"', await page.getByText(/Pago registrado/).count() > 0);
// ── 3. Reintento → idempotente (misma clave) ─────────────────────────────
const r = registrarPagoIdempotente(c1, { vencKey: VK, fecha: '2026-09-30', capital: 1, origen: { tipo: 'nomina', clave: 'nomina:nomA:itA' } }, 'x');
check('Reintento con la misma línea no duplica (modelo)', r.duplicado === true);
// ── 4. Anular desde la línea ─────────────────────────────────────────────
await page.getByRole('button', { name: /Anular pago/ }).first().click();
await page.waitForTimeout(2000);
await foto(page, 'n05-anulado');
c1 = credGuardado();
const anulados = (c1.pagos || []).filter(p => p.origen?.tipo === 'nomina' && p.anulado);
check('Anulado con motivo y conservado en el historial', anulados.length === 1 && anulados[0].motivoAnulacion === 'reverso de prueba');
check('La cuota vuelve a estar pendiente completa', Math.abs(pendienteCuota(c1) - estadoCredito(c1).vencimientos.find(v => v.key === VK).total) < 0.02);
check('Sin errores de JavaScript', errores.length === 0, errores.slice(0, 2).join(' | '));
await browser.close();
console.log(fallos ? `\n${fallos} FALLA(S)` : '\nE2E Nómina ↔ Crédito OK');
process.exit(fallos ? 1 : 0);

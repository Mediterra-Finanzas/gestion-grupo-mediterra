/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// SALDO INICIAL ÚNICO: Saldos Bancos = flujo en pantalla = Excel
//
// Caso que lo motivó (Allegria Foods, oct-2026): el saldo inicial del Excel del flujo
// y el total de la pestaña Saldos Bancos diferían en ~US$142. No era redondeo:
// eran DOS criterios de conversión.
//   · Saldos Bancos convertía cada cuenta no-US$ con la paridad EN VIVO de
//     open.er-api (la del momento de abrir la pestaña).
//   · El flujo y el Excel sumaban el `usd` GUARDADO con el saldo (la paridad del
//     momento en que se registró).
// Además el Excel no excluía saldos con fecha futura (el flujo sí) y Saldos
// Bancos sumaba, con paridad en vivo, cuentas sin `usd` guardado que el flujo no.
//
// Acá se fija, con DATOS SINTÉTICOS, que las tres salidas dan el MISMO número
// (igualdad exacta, sin tolerancia) y que la paridad en vivo queda solo como
// referencia, con la diferencia por tipo de cambio explícita.
//   1. modelo puro (src/saldosBancosUSD.js)
//   2. componente Saldos Bancos renderizado, con open.er-api simulado
//   3. Excel exportado: celda del saldo inicial del mes en curso + nota al pie
//   4. integración: el módulo completo montado — pestaña Saldos Bancos, flujo de
//      Allegria Foods y el botón «📥 Excel» de la app
// ═══════════════════════════════════════════════════════════════════════════════

// Captura lo que el exportador escribiría a disco.
const mockCapturas = [];
jest.mock('xlsx-js-style', () => {
  const real = jest.requireActual('xlsx-js-style');
  return { ...real, writeFile: (wb, nombre) => { mockCapturas.push({ wb, nombre }); } };
});

// Paridad "de hoy" que devuelve open.er-api en la prueba (distinta de la guardada).
const TC_GUARDADO = 950.25;   // CLP por US$ al registrar el saldo
const TC_VIVO = 970.40;       // CLP por US$ al abrir la pestaña
let SRV = null;
const respJson = (body, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null },
});
global.fetch = async (url, opts) => {
  if (String(url).includes('open.er-api.com')) {
    return respJson({ result: 'success', rates: { CLP: TC_VIVO, EUR: 0.92, PEN: 3.75 } });
  }
  if (!SRV) throw new TypeError('sin servidor');
  return SRV.fetchImpl(url, opts);
};
class WSFalso { constructor(){ this.readyState = 0; } send(){} close(){ this.readyState = 3; } }
global.WebSocket = WSFalso; WSFalso.OPEN = 1;

const React = require('react');
const { render, act, fireEvent } = require('@testing-library/react');
const { saldoBancoEmpresaUSD, notasSaldoInicial, usdDeSaldo, avisoSaldoIncompleto } = require('../saldosBancosUSD.js');
const { exportarFlujoEmpresa } = require('../flujoExportExcel.js');

// ── Datos sintéticos, con fechas relativas a hoy ─────────────────────────────
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diasDesdeHoy = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MES_HOY = (() => { const d = new Date(); return `${MN[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`; })();

const USD_BICE = 80000.55;
const CLP_BCI = 10000000;
const EMP = 'Allegria Foods';
function saldosSinteticos() {
  const f = diasDesdeHoy(-6);
  return {
    // cuenta en US$
    [`${EMP}||BICE||usd`]: { empresa: EMP, banco: 'BICE', moneda: 'usd', monto: USD_BICE, fecha: f, usd: USD_BICE },
    // cuenta en CLP registrada con la paridad de ese momento (registro antiguo: sin campo tc)
    [`${EMP}||BCI||clp`]: { empresa: EMP, banco: 'BCI', moneda: 'clp', monto: CLP_BCI, fecha: f, usd: CLP_BCI / TC_GUARDADO },
    // cuenta en CLP guardada cuando la paridad no cargó → usd:null (antes: Saldos
    // Bancos la sumaba en vivo y el flujo no)
    [`${EMP}||Security||clp`]: { empresa: EMP, banco: 'Security', moneda: 'clp', monto: 1000000, fecha: f, usd: null },
    // saldo con fecha FUTURA (antes: el Excel lo sumaba y el flujo no)
    [`${EMP}||Santander||usd`]: { empresa: EMP, banco: 'Santander', moneda: 'usd', monto: 50000, fecha: diasDesdeHoy(40), usd: 50000 },
    // otra empresa: no debe mezclarse
    ['Mediterra||BCI||usd']: { empresa: 'Mediterra', banco: 'BCI', moneda: 'usd', monto: 999, fecha: f, usd: 999 },
  };
}
// El número que corresponde, calculado a mano con el criterio único.
const ESPERADO = USD_BICE + CLP_BCI / TC_GUARDADO;
const VIVO = USD_BICE + CLP_BCI / TC_VIVO;
const DIF_TC = CLP_BCI / TC_VIVO - CLP_BCI / TC_GUARDADO;   // negativa: el peso se depreció

// Lee del workbook capturado la celda del saldo inicial del mes en curso.
function saldoInicialExcel(wb) {
  const hoja = wb.Sheets[wb.SheetNames.find(n => n !== 'Parametros')];
  const col = Object.keys(hoja).find(a => /^[A-Z]+3$/.test(a) && hoja[a].v === MES_HOY).replace(/3$/, '');
  const fila = Object.keys(hoja).find(a => /^A\d+$/.test(a) && hoja[a].v === 'Saldo inicial caja').slice(1);
  const celda = hoja[`${col}${fila}`];
  const notas = Object.keys(hoja).filter(a => /^A\d+$/.test(a)).map(a => hoja[a].v).filter(v => typeof v === 'string');
  return { celda, notas };
}

// ── 1. Modelo puro ───────────────────────────────────────────────────────────
describe('criterio único del saldo en US$', () => {
  test('suma US$ + CLP al TC guardado; excluye fecha futura y cuenta sin TC, y lo dice', () => {
    const r = saldoBancoEmpresaUSD(saldosSinteticos(), EMP);
    expect(r.total).toBe(ESPERADO);
    expect(r.cuentas.map(c => c.banco).sort()).toEqual(['BCI', 'BICE', 'Security']);
    expect(r.sinTC.map(c => c.banco)).toEqual(['Security']);
    const bci = r.cuentas.find(c => c.banco === 'BCI');
    expect(bci.tc).toBeCloseTo(TC_GUARDADO, 9);          // TC implícito recuperable
    expect(usdDeSaldo({ monto: 5, usd: 0 }, 'clp').estado).toBe('sin_tc'); // se guardó 0: no es un TC
  });

  test('sin cuentas vigentes devuelve null (el llamador usa el saldo base)', () => {
    expect(saldoBancoEmpresaUSD({}, EMP).total).toBeNull();
  });

  test('cuenta sin TC: visible, monto excluido y aviso de total INCOMPLETO (pantalla y Excel)', () => {
    const r = saldoBancoEmpresaUSD(saldosSinteticos(), EMP);
    const av = avisoSaldoIncompleto(r, EMP);
    expect(av).toContain('INCOMPLETO');
    expect(av).toContain('Security CLP 1.000.000,00');
    expect(r.total).toBe(ESPERADO);                       // el monto sin TC NO entra
    const notas = notasSaldoInicial(saldosSinteticos(), EMP, { mesLabel: MES_HOY });
    expect(notas[0]).toContain('INCOMPLETO');
    expect(notas[1]).toContain('(INCOMPLETO)');
    // sin cuentas sin TC no hay aviso
    const s = saldosSinteticos(); delete s[`${EMP}||Security||clp`];
    expect(avisoSaldoIncompleto(saldoBancoEmpresaUSD(s, EMP))).toBeNull();
  });
});

// ── 1b. Reporte semanal con la misma base ────────────────────────────────────
describe('reporte semanal: mismo saldo que el flujo', () => {
  const FM = require('../FinanzasModule.jsx');
  test('«Saldo actual» = saldo inicial del flujo, con la misma cuenta excluida y su aviso', () => {
    const saldos = saldosSinteticos();
    const empresas = FM.buildEmpresas({}, {});
    const d = FM.reporte_armarDatosEmpresa(EMP, {}, empresas, saldos, 0, '', 950, {}, {});
    expect(d.saldoTotal).toBe(ESPERADO);
    expect(d.saldoTotal).toBe(FM.getSaldoBancoInicial(saldos, EMP, empresas[EMP].saldo_ini));
    expect(d.saldos.incompleto).toContain('INCOMPLETO');
    const sec = d.saldos.lineas.find(l => l.banco === 'Security');
    expect(sec.estado).toBe('sin_tc');
    expect(d.saldos.lineas.some(l => l.banco === 'Santander')).toBe(false); // fecha futura
    // el TC del parámetro del reporte (950) ya no cambia el saldo
    const d2 = FM.reporte_armarDatosEmpresa(EMP, {}, empresas, saldos, 0, '', 700, {}, {});
    expect(d2.saldoTotal).toBe(ESPERADO);
  });
  test('sin saldos bancarios: saldo base de la empresa, igual que el flujo (antes 0)', () => {
    const empresas = FM.buildEmpresas({}, {});
    const d = FM.reporte_armarDatosEmpresa(EMP, {}, empresas, {}, 0, '', 950, {}, {});
    expect(d.saldoTotal).toBe(FM.getSaldoBancoInicial({}, EMP, empresas[EMP].saldo_ini));
    expect(d.saldoTotal).toBe(empresas[EMP].saldo_ini);
  });
});

// ── 2 y 3. Componente Saldos Bancos + Excel ──────────────────────────────────
describe('Saldos Bancos y Excel con el mismo número', () => {
  const { SaldosBancos, getSaldoBancoInicial } = require('../FinanzasModule.jsx');

  test('la pestaña muestra como saldo el mismo número exacto que el Excel; la paridad de hoy va aparte', async () => {
    const saldos = saldosSinteticos();
    let r;
    await act(async () => {
      r = render(React.createElement(SaldosBancos, { saldos, onSave: async () => {}, canEdit: false, empresasPermitidas: [EMP] }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const pantalla = Number(r.container.querySelector(`[data-testid="saldo-empresa"][data-empresa="${EMP}"]`).getAttribute('data-usd'));
    const vivo = Number(r.container.querySelector(`[data-testid="saldo-empresa-vivo"][data-empresa="${EMP}"]`).getAttribute('data-usd'));

    // Excel por el mismo camino que el botón de la app
    const saldoIni = getSaldoBancoInicial(saldos, EMP, 17433);
    const notasSaldo = notasSaldoInicial(saldos, EMP, { mesLabel: MES_HOY, fallback: 17433 });
    mockCapturas.length = 0;
    const { buildEmpresas } = require('../FinanzasModule.jsx');
    const emp = buildEmpresas({}, {})[EMP];
    exportarFlujoEmpresa({ emp, empName: EMP, saldoIni, notasSaldo, fileName: 'x.xlsx' });
    const { celda, notas } = saldoInicialExcel(mockCapturas[0].wb);

    expect(pantalla).toBe(ESPERADO);
    // lo que se LEE en pantalla es ese número, redondeado solo al mostrarlo
    const texto = r.container.querySelector(`[data-testid="saldo-empresa"][data-empresa="${EMP}"]`).textContent;
    expect(texto).toContain(`$${Math.round(ESPERADO).toLocaleString('es-CL')} USD`);
    expect(texto).not.toContain(`$${Math.round(VIVO).toLocaleString('es-CL')} USD`);
    expect(saldoIni).toBe(ESPERADO);
    expect(celda.v).toBe(ESPERADO);
    expect(celda.f).toBeUndefined();                       // constante, no fórmula
    // la paridad en vivo es referencia: solo cuentas que suman, diferencia = efecto TC
    expect(vivo).toBeCloseTo(VIVO, 9);
    expect(vivo - pantalla).toBeCloseTo(DIF_TC, 9);
    // el archivo dice de dónde sale el número
    expect(notas.some(n => n.includes('BCI CLP 10.000.000,00') && n.includes('TC 950,2500 CLP/US$'))).toBe(true);
    expect(notas.some(n => n.includes('Security') && n.includes('SIN TC'))).toBe(true);
    expect(notas.some(n => n.includes('Santander'))).toBe(false); // fecha futura: no entra
  });
});

// ── 4. Integración: módulo completo ──────────────────────────────────────────
function servidorFalso(filasIniciales = {}) {
  const filas = JSON.parse(JSON.stringify(filasIniciales));
  let seq = 1;
  const fetchImpl = async (url, opts = {}) => {
    const metodo = (opts.method || 'GET').toUpperCase();
    const u = new URL(String(url));
    let id = decodeURIComponent((/id=eq\.([^&]+)/.exec(u.search) || [])[1] || '');
    let body = null;
    try { body = JSON.parse(opts.body || 'null'); } catch (_) {}
    if (!id && body && body.id) id = String(body.id);
    if (metodo === 'GET') {
      const f = filas[id];
      return respJson(f ? [{ id, value: f.value, updated_at: f.updated_at }] : []);
    }
    if (metodo === 'PATCH') {
      const ver = decodeURIComponent((/updated_at=eq\.([^&]+)/.exec(u.search) || [])[1] || '');
      if (!filas[id] || filas[id].updated_at !== ver) return respJson([]);
      filas[id] = { value: body.value, updated_at: `v${seq++}` };
      return respJson([{ id, value: filas[id].value, updated_at: filas[id].updated_at }]);
    }
    if (metodo === 'POST') {
      filas[body.id] = { value: body.value, updated_at: `v${seq++}` };
      return respJson([{ id: body.id, value: filas[body.id].value, updated_at: filas[body.id].updated_at }], 201);
    }
    throw new Error('método no soportado ' + metodo);
  };
  return { filas, fetchImpl };
}

describe('módulo completo: pestaña Saldos Bancos = flujo en pantalla = Excel del botón', () => {
  const ADMIN = { nombre: 'Angelo Huerta', rol: 'admin', email: 'a@b.cl' };
  let FinanzasModule, persist;
  beforeAll(() => {
    persist = require('../persistencia/instancia.js').persist;
    FinanzasModule = require('../FinanzasModule.jsx').default;
  });
  beforeEach(() => { jest.useFakeTimers(); persist.reset(); window.auditLog = undefined; });
  afterEach(() => { jest.useRealTimers(); });

  async function correr() {
    for (let i = 0; i < 15; i++) {
      await act(async () => { jest.advanceTimersByTime(200); await Promise.resolve(); });
    }
  }
  const clic = async (re) => {
    const b = [...document.querySelectorAll('button')].find(x => re.test(x.textContent || ''));
    if (!b) throw new Error('no encontré el botón ' + re);
    await act(async () => { fireEvent.click(b); await Promise.resolve(); });
    await correr();
  };

  test('los tres muestran el mismo saldo inicial exacto', async () => {
    SRV = servidorFalso({
      finanzas: { value: { finanzas_real: {}, sub_lines: {}, added_lines: {}, intercompany: [], creditos_data: [] }, updated_at: 'v0' },
      finanzas_bancos: { value: { saldos: saldosSinteticos() }, updated_at: 'v0' },
      finanzas_esc_index: { value: { escenarios: [] }, updated_at: 'v0' },
    });
    await act(async () => {
      render(React.createElement(FinanzasModule, {
        onBack: () => {}, onLogout: () => {}, usuarioActual: ADMIN, tabPermisos: {}, usuarios: [ADMIN],
      }));
    });
    await correr();

    // Dashboard: KPI con la misma fuente y el aviso de incompleto
    expect(document.querySelector('[data-testid="dashboard-saldo-incompleto"]').textContent).toContain('Security CLP 1.000.000,00');

    await clic(/Saldos Bancos/);
    const enSaldos = Number(document.querySelector(`[data-testid="saldo-empresa"][data-empresa="${EMP}"]`).getAttribute('data-usd'));
    expect(document.body.textContent).toContain('Total INCOMPLETO: 1 cuenta(s) sin TC guardado quedan excluidas (Security CLP 1.000.000,00)');

    await clic(/Flujo Empresas/);
    // Consolidado (vista por defecto): aviso de saldo inicial incompleto
    expect(document.querySelector('[data-testid="consolidado-saldo-incompleto"]').textContent).toContain(`(${EMP})`);
    await clic(/Allegria Foods/);
    const enFlujo = Number(document.querySelector('[data-testid="flujo-saldo-banco"]').getAttribute('data-usd'));
    expect(document.querySelector('[data-testid="flujo-saldo-incompleto"]').textContent).toContain('INCOMPLETO');

    mockCapturas.length = 0;
    await clic(/📥 Excel$/);
    expect(mockCapturas.length).toBe(1);
    const { celda, notas } = saldoInicialExcel(mockCapturas[0].wb);

    expect(enSaldos).toBe(ESPERADO);
    expect(enFlujo).toBe(ESPERADO);
    expect(celda.v).toBe(ESPERADO);
    expect(notas.some(n => n.startsWith(`Saldo inicial ${MES_HOY} = US$`) && n.includes('(INCOMPLETO)'))).toBe(true);
    // el aviso también va arriba (subtítulo), no solo al pie
    const hoja = mockCapturas[0].wb.Sheets[mockCapturas[0].wb.SheetNames.find(n => n !== 'Parametros')];
    expect(String(hoja.F1?.v || '')).toContain('Saldo bancario INCOMPLETO');
    // y no se escribió nada por abrir y exportar
    expect(SRV.filas.finanzas.updated_at).toBe('v0');
    expect(SRV.filas.finanzas_bancos.updated_at).toBe('v0');
  });
});

/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// EXCEL RECALCULADO vs FLUJO — los escenarios que la comparación en
// caché NO podía ver.
//
// POR QUÉ EXISTE: el `test.each` de programasFlujo/integracionSaldos
// compara `ws[celda].v` (el valor que el exportador escribió desde el
// árbol de la app) contra ese mismo árbol. Es `ln.proy` contra
// `ln.proy`: la hoja Parametros, donde vive toda la lógica de
// anticipos y liquidación, no influye en el número comparado. Un error
// en cualquier fórmula de Parametros es invisible ahí.
//
// Acá se BORRAN los valores en caché de toda celda con fórmula, se
// recalcula con LibreOffice y se compara la fila del flujo contra
// `calcAllegria`. Si el Excel y la app discrepan, esta prueba falla.
//
//   RECALC=1 CI=true npx react-scripts test --testPathPattern excelRecalcFlujo
//
// Requiere `soffice`. Sin RECALC=1 se omite. DATOS SINTÉTICOS.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildEmpresas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { MESES, mesIdxActual } from '../horizonte.js';
import { MODELO_VERSION, registrarDecisionSinFecha } from '../programas.js';

const OUT = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'excel-recalc-flujo');
const corte = mesIdxActual();
const MES_A = MESES[corte + 1], MES_B = MESES[corte + 2], MES_LIQ = MESES[corte + 5];

const fruta = (over = {}) => ({ "2026-2027": { cerezas: {
  kg: 1000000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], mes_liquidacion: MES_LIQ,
  anticipos_productor: [], mes_saldo_productor: MES_LIQ,
  dist_mat: [], dist_srv: [], programas: [], ...over,
} } });

function recalcular(archivo, dir) {
  const wb = XLSX.readFile(archivo, { cellFormula: true });
  const conFormula = new Set();
  let borradas = 0;
  wb.SheetNames.forEach(nm => {
    const ws = wb.Sheets[nm];
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return;
      if (ws[a] && ws[a].f) { conFormula.add(`${nm}!${a}`); delete ws[a].v; delete ws[a].w; borradas++; }
    });
  });
  const base = path.basename(archivo, '.xlsx');
  const sinCache = path.join(dir, `${base}__sc.xlsx`);
  XLSX.writeFile(wb, sinCache, { bookType: 'xlsx' });
  const outDir = path.join(dir, `${base}__rc`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_erf',
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', outDir, sinCache],
    { stdio: 'pipe', timeout: 300000 });
  const salida = path.join(outDir, path.basename(sinCache));
  if (!fs.existsSync(salida)) throw new Error('LibreOffice no recalculó');
  return { wb: XLSX.readFile(salida, { cellFormula: true }), conFormula, borradas };
}

// Lee una fila del flujo del archivo RECALCULADO, mes a mes.
function serieExcel(rec, etiqueta) {
  const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
  const nombre = rec.wb.SheetNames.find(n => n !== 'Parametros');
  const col = {};
  Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).forEach(k => { col[ws[k].v] = k.replace(/\d+$/, ''); });
  const fila = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === etiqueta)
    .map(k => Number(k.slice(1)))[0];
  if (!fila) throw new Error(`no encontré la fila ${etiqueta}`);
  // La celda comparada TIENE que haber sido una fórmula antes de borrar el
  // caché: si fuera constante, no habría nada recalculado que comprobar.
  const dir0 = `${col[MESES[0]]}${fila}`;
  if (!rec.conFormula.has(`${nombre}!${dir0}`)) {
    throw new Error(`la fila ${etiqueta} no tiene fórmula en ${MESES[0]}: no hay recálculo que verificar`);
  }
  return MESES.map(m => Number(ws[`${col[m]}${fila}`]?.v ?? 0));
}

const correr = process.env.RECALC === '1' ? describe : describe.skip;

correr('Excel recalculado vs flujo', () => {
  const casos = [
    {
      nombre: 'A · realización MOVIDA de una estimación a una cuota',
      // La estimación de origen no reabre su pendiente: el Excel tiene que
      // usar el realizado ORIGINADO, igual que la app.
      params: fruta({
        anticipos_cliente: [{ id: 'e1', mes: MES_A, usd_kg: 0.1, v: MODELO_VERSION, realizaciones: [] }],
        programas: [{ id: 'p1', lado: 'cliente', contraparte: 'WLH', kilos: 1000000,
          cuotas: [{ id: 'c1', estado: 'vigente', modalidad: 'monto', monto: 100000, mes: MES_A,
            v: MODELO_VERSION, sustituye: [{ estimacionId: 'e1', usd: 40000 }],
            realizaciones: [{ id: 'r1', fecha: '2026-08-01', usd: 40000,
                              origen: { tipo: 'estimacion', id: 'e1' } }] }] }],
      }),
    },
    {
      nombre: 'H · realización MOVIDA de una cuota a una estimación',
      // Dirección inversa a la de A. El realizado sigue siendo uno solo: la
      // cuota de origen vuelve a su pendiente y la estimación queda cubierta.
      params: fruta({
        anticipos_cliente: [{ id: 'e1', mes: MES_A, usd_kg: 0.1, v: MODELO_VERSION,
          realizaciones: [{ id: 'r1', fecha: '2026-08-01', usd: 40000,
                            origen: { tipo: 'cuota', id: 'c1' } }] }],
        programas: [{ id: 'p1', lado: 'cliente', contraparte: 'WLH', kilos: 1000000,
          cuotas: [{ id: 'c1', estado: 'vigente', modalidad: 'monto', monto: 100000, mes: MES_A,
            v: MODELO_VERSION, sustituye: [], realizaciones: [] }] }],
      }),
    },
    {
      nombre: 'I · movimiento de la BANDEJA aplicado en parte a una cuota',
      // Lo aplicado descuenta desde la cuota; lo que sigue sin asignar NO
      // descuenta de ninguna liquidación y no puede aparecer en el archivo
      // como si lo hiciera.
      params: fruta({
        anticipos_cliente: [{ id: 'e1', mes: MES_A, usd_kg: 0.1, v: MODELO_VERSION, realizaciones: [] }],
        movimientos_sin_asignar: [{ id: 'mov1', fecha: '2026-08-14', usd: 100000,
          referencia: 'cartola 7731', lado: 'cliente', aplicaciones: [] }],
        programas: [{ id: 'p1', lado: 'cliente', contraparte: 'WLH', kilos: 1000000,
          cuotas: [{ id: 'c1', estado: 'vigente', modalidad: 'monto', monto: 100000, mes: MES_A,
            v: MODELO_VERSION, sustituye: [],
            realizaciones: [{ id: 'r1', fecha: '2026-08-14', usd: 60000,
                              nota: 'bandeja · cartola 7731',
                              origen: { tipo: 'bandeja', id: 'mov1' } }] }] }],
      }),
    },
    {
      nombre: 'B · estimación NUEVA sin fecha (reservada)',
      params: fruta({
        anticipos_cliente: [{ id: 'e2', mes: '', usd_kg: 0.05, v: MODELO_VERSION, realizaciones: [] }],
      }),
    },
    {
      nombre: 'D · estimación ANTIGUA sin fecha, con decisión "sigue acordado sin fecha"',
      params: fruta({
        anticipos_cliente: [{ id: 'e3', mes: '', usd_kg: 0.05, realizaciones: [] }],
        decisiones_sin_fecha: registrarDecisionSinFecha({}, 'e3', 'acordado_sin_fecha',
          { usuario: 'qa', nota: 'revisión de cierre' }),
      }),
    },
    {
      nombre: 'E · cuota VIGENTE sin modalidad (falta dato): no rompe el archivo',
      params: fruta({
        programas: [{ id: 'p4', lado: 'cliente', contraparte: 'X', kilos: 1000000,
          cuotas: [{ id: 'c4', estado: 'vigente', modalidad: 'por_confirmar', mes: MES_A,
                     v: MODELO_VERSION }] }],
      }),
    },
    {
      nombre: 'F · programa ARCHIVADO con dinero ya cobrado',
      params: fruta({
        programas: [{ id: 'p5', lado: 'cliente', contraparte: 'Y', kilos: 1000000,
          archivado: true, motivoArchivo: 'qa',
          cuotas: [{ id: 'c5', estado: 'anulada', estadoPrevio: 'vigente', modalidad: 'monto',
            monto: 300000, mes: MES_A, v: MODELO_VERSION,
            realizaciones: [{ id: 'r5', fecha: '2026-08-01', usd: 200000 }] }] }],
      }),
    },
    {
      nombre: 'G · posición con importe definitivo y sin presupuesto asignado',
      params: fruta({
        programas: [{ id: 'p6', lado: 'cliente', contraparte: 'Z', kilos: 1000000,
          importe_definitivo: 300000, mes_liquidacion: MES_B, cuotas: [] }],
      }),
    },
  ];

  test.each(casos.map(c => [c.nombre, c]))('%s', (_n, caso) => {
    fs.mkdirSync(OUT, { recursive: true });
    const PARAMS = { paramsAllegria: caso.params, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(caso.params, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT, `${_n.slice(0, 1)}.xlsx`);
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 0, fileName: file, params: PARAMS });
    const rec = recalcular(file, OUT);
    const excel = serieExcel(rec, 'Anticipo Cerezas');
    const app = calcAllegria(caso.params).ing.cerezas;
    // Mes a mes, los 63 meses: no solo el total.
    MESES.forEach((m, i) => {
      expect(`${m}=${Math.round(excel[i])}`).toBe(`${m}=${Math.round(app[i])}`);
    });
    // Y ninguna celda con error (#VALUE!, #REF!…).
    const ws = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
    const errores = Object.keys(ws).filter(k => /^[A-Z]+\d+$/.test(k) && ws[k]?.t === 'e');
    expect(errores).toEqual([]);
  });
});

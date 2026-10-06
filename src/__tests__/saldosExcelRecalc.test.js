/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// SALDOS A FAVOR · sección COMPLETA del Excel, RECALCULADA de verdad
// con LibreOffice, en seis escenarios distintos.
//
// Compara, celda por celda, contra el modelo (resumenSaldo /
// movimientosSaldos) y contra el flujo de la app (calcAllegria).
// Los valores en caché del archivo se BORRAN antes de recalcular, así
// que coincidir no puede venir de lo que el exportador guardó.
//
//   RECALC=1 CI=true npx react-scripts test --testPathPattern saldosExcelRecalc
//
// Requiere `soffice` (LibreOffice Calc). Sin RECALC=1 se omite.
// DATOS SINTÉTICOS. No toca producción.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
import * as XLSX from 'xlsx-js-style';
import { calcAllegria, buildEmpresas } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';
import { resumenSaldo, movimientosSaldos } from '../programas.js';
import { MESES, mIdx } from '../horizonte.js';

const OUT = process.env.ANTICIPOS_OUT_DIR || path.join(os.tmpdir(), 'saldos-recalc');
const MES_A = 'Nov-26', MES_B = 'Dec-26', MES_C = 'Jan-27', MES_LIQ = 'Mar-27';

// ── Los seis escenarios ───────────────────────────────────────────
const SALDOS = [
  // 1. reconocido, sin aplicaciones: todo pendiente y disponible
  { id: 's1', lado: 'productor', contraparte: 'Uno', usd: 10000, estado: 'reconocido', aplicaciones: [] },
  // 2. recuperación PROGRAMADA: ocupa disponible y no resuelve
  { id: 's2', lado: 'productor', contraparte: 'Dos', usd: 8000, estado: 'reconocido',
    aplicaciones: [{ id: 'a2', tipo: 'recuperacion', usd: 6000, mes: MES_A, estado: 'programada' }] },
  // 3. recuperación EJECUTADA: resuelve y deja de proyectar
  { id: 's3', lado: 'productor', contraparte: 'Tres', usd: 7000, estado: 'reconocido',
    aplicaciones: [{ id: 'a3', tipo: 'recuperacion', usd: 5000, mes: MES_A, estado: 'ejecutada',
                     fecha: '2026-11-20' }] },
  // 4. compensación RESERVADA: ocupa disponible, sin movimiento
  { id: 's4', lado: 'productor', contraparte: 'Cuatro', usd: 9000, estado: 'reconocido',
    aplicaciones: [{ id: 'a4', tipo: 'compensacion', usd: 4000, estado: 'reservada',
                     destino: { programaId: null, etiqueta: 'Bloque presupuestario', mes: MES_LIQ } }] },
  // 5. compensación APLICADA: resuelve sin caja
  { id: 's5', lado: 'productor', contraparte: 'Cinco', usd: 5000, estado: 'reconocido',
    aplicaciones: [{ id: 'a5', tipo: 'compensacion', usd: 3000, estado: 'aplicada',
                     destino: { programaId: null, etiqueta: 'Bloque presupuestario', mes: MES_LIQ } }] },
  // 6. cliente: devolución programada (aplazada de MES_B a MES_C) + una anulada
  { id: 's6', lado: 'cliente', contraparte: 'Seis', usd: 6000, estado: 'reconocido',
    aplicaciones: [
      { id: 'a6', tipo: 'devolucion', usd: 2000, mes: MES_C, estado: 'programada',
        historial: [{ de: MES_B, a: MES_C, motivo: 'aplazada', ts: '2026-10-01T00:00:00Z' }] },
      { id: 'a6b', tipo: 'devolucion', usd: 1000, mes: MES_B, estado: 'anulada',
        motivo: 'cargada por error' }] },
];

const params = { '2026-2027': { cerezas: {
  kg: 500000, fob_usd_kg: 1, desc_exp_pct: 0, mat_usd_kg: 0, srv_usd_kg: 0,
  anticipos_cliente: [], mes_liquidacion: MES_LIQ,
  anticipos_productor: [], mes_saldo_productor: MES_LIQ,
  dist_mat: [], dist_srv: [], programas: [],
  saldos_favor: SALDOS,
} } };

function recalcular(archivo, dir) {
  const wb = XLSX.readFile(archivo, { cellFormula: true });
  let borradas = 0;
  // Qué celdas de Parametros ERAN fórmula: sin esto, una celda constante
  // pasaría cualquier comprobación de "recalculado".
  const conFormula = new Set();
  wb.SheetNames.forEach(nm => {
    const ws = wb.Sheets[nm];
    Object.keys(ws).forEach(a => {
      if (a[0] === '!') return;
      if (ws[a] && ws[a].f) {
        if (nm === 'Parametros') conFormula.add(a);
        delete ws[a].v; delete ws[a].w; borradas++;
      }
    });
  });
  const base = path.basename(archivo, '.xlsx');
  const sinCache = path.join(dir, `${base}__sincache.xlsx`);
  XLSX.writeFile(wb, sinCache, { bookType: 'xlsx' });
  const outDir = path.join(dir, `${base}__recalc`);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync('soffice', ['--headless', '--norestore', '-env:UserInstallation=file:///tmp/lo_saldos',
    '--convert-to', 'xlsx:Calc MS Excel 2007 XML', '--outdir', outDir, sinCache],
    { stdio: 'pipe', timeout: 300000 });
  const salida = path.join(outDir, path.basename(sinCache));
  if (!fs.existsSync(salida)) throw new Error('LibreOffice no recalculó el archivo');
  return { wb: XLSX.readFile(salida, { cellFormula: true }), borradas, conFormula };
}

const correr = process.env.RECALC === '1' ? describe : describe.skip;

correr('sección de saldos a favor, recalculada en LibreOffice', () => {
  let ws, wsFlujo, borradas, conFormula;
  beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
    const PARAMS = { paramsAllegria: params, allegraComisionArandanos: { cobros: [] } };
    const empresas = buildEmpresas(params, PARAMS.allegraComisionArandanos);
    const file = path.join(OUT, 'saldos-seis.xlsx');
    exportarFlujoEmpresa({ emp: empresas['Allegria Foods'], empName: 'Allegria Foods',
                           saldoIni: 0, fileName: file, params: PARAMS });
    const rec = recalcular(file, OUT);
    ws = rec.wb.Sheets['Parametros'];
    wsFlujo = rec.wb.Sheets[rec.wb.SheetNames.find(n => n !== 'Parametros')];
    borradas = rec.borradas; conFormula = rec.conFormula;
  });

  test('el archivo se recalculó de verdad (sin valores en caché)', () => {
    expect(borradas).toBeGreaterThan(100);
  });

  // Fila del saldo: columna B dice "Productor · X (estado)"
  const filaDe = (contraparte, lado) => {
    const et = `${lado === 'cliente' ? 'Cliente' : 'Productor'} · ${contraparte} (`;
    const k = Object.keys(ws).filter(x => /^B\d+$/.test(x))
      .find(x => typeof ws[x]?.v === 'string' && ws[x].v.startsWith(et));
    return k ? Number(k.slice(1)) : null;
  };
  const val = (col, fila) => {
    const c = ws[`${col}${fila}`];
    // Una fórmula que no recalculó deja la celda sin valor: eso tiene que
    // fallar, no leerse como 0.
    if (!c || c.v === undefined) throw new Error(`celda ${col}${fila} sin valor tras recalcular`);
    return Number(c.v);
  };
  const txt = (col, fila) => String(ws[`${col}${fila}`]?.v ?? '');

  test.each(SALDOS.map(s => [s.contraparte, s]))(
    'escenario %s: reconocido/resuelto/programado/pendiente/disponible cuadran', (_n, s) => {
      const f = filaDe(s.contraparte, s.lado);
      expect(f).not.toBeNull();
      const rs = resumenSaldo(s);
      // D/E/F/G tienen que haber sido fórmulas: es lo que esta prueba dice
      // verificar. C es constante a propósito (el monto reconocido es un dato).
      ['D', 'E', 'F', 'G'].forEach(col => expect(conFormula.has(`${col}${f}`)).toBe(true));
      expect(Math.round(val('C', f))).toBe(Math.round(rs.reconocido));
      expect(Math.round(val('D', f))).toBe(Math.round(rs.resuelto));
      expect(Math.round(val('E', f))).toBe(Math.round(rs.programado));
      expect(Math.round(val('F', f))).toBe(Math.round(rs.pendienteReal));
      expect(Math.round(val('G', f))).toBe(Math.round(rs.disponible));
      // y la identidad del modelo se sostiene en el archivo recalculado
      expect(Math.round(val('F', f))).toBe(Math.round(val('C', f) - val('D', f)));
      expect(Math.round(val('G', f))).toBe(Math.round(val('F', f) - val('E', f)));
    });

  test.each(SALDOS.map(s => [s.contraparte, s]))(
    'escenario %s: cada aplicación aporta a la columna que le toca', (_n, s) => {
      const f = filaDe(s.contraparte, s.lado);
      const rs = resumenSaldo(s);
      // Esperados ESCRITOS A MANO por escenario, no derivados del exportador:
      // [resuelto, programado] de cada aplicación, en orden.
      const ESPERADO = {
        Uno: [],
        Dos: [[0, 6000]],          // recuperación programada: ocupa, no resuelve
        Tres: [[5000, 0]],         // recuperación ejecutada: resuelve
        Cuatro: [[0, 4000]],       // compensación reservada: ocupa, no resuelve
        Cinco: [[3000, 0]],        // compensación aplicada: resuelve sin caja
        Seis: [[0, 2000]],         // devolución programada (la anulada no cuenta)
      }[s.contraparte];
      expect(rs.aplicaciones.length).toBe(ESPERADO.length);
      rs.aplicaciones.forEach((a, k) => {
        const fa = f + 1 + k;
        expect(Math.round(val('D', fa))).toBe(ESPERADO[k][0]);
        expect(Math.round(val('E', fa))).toBe(ESPERADO[k][1]);
        if (a.estado === 'ejecutada') expect(txt('G', fa)).toMatch(/ya es caja/);
        if (a.estado === 'aplicada') expect(txt('G', fa)).toMatch(/sin movimiento/);
        if (a.estado === 'reservada') expect(txt('G', fa)).toMatch(/no proyecta/);
      });
      // una anulada no aparece como aplicación vigente
      expect(rs.aplicaciones.every(a => a.estado !== 'anulada')).toBe(true);
    });

  test('las líneas del flujo recalculadas son las del modelo, mes a mes', () => {
    const c = calcAllegria(params);
    const esperado = {
      'Recuperación de anticipos a productores': c.recup.cerezas,
      'Devolución de anticipos a clientes': c.devol.cerezas,
    };
    const colDe = (mes) => Object.keys(wsFlujo).filter(k => /^[A-Z]+3$/.test(k))
      .find(k => wsFlujo[k].v === mes)?.replace(/\d+$/, '');
    const filaFlujo = (et) => Object.keys(wsFlujo).filter(k => /^A\d+$/.test(k) && wsFlujo[k].v === et)
      .map(k => Number(k.slice(1)))[0];
    Object.entries(esperado).forEach(([etiqueta, serie]) => {
      const fl = filaFlujo(etiqueta);
      expect(fl).toBeTruthy();
      MESES.forEach((m, i) => {
        const v = Number(wsFlujo[`${colDe(m)}${fl}`]?.v ?? 0);
        expect(Math.round(v)).toBe(Math.round(serie[i]));
      });
    });
    // Solo lo PROGRAMADO con mes proyecta: 6.000 de recuperación en Nov-26 y
    // 2.000 de devolución en Jan-27 (la aplazada, en su mes nuevo).
    expect(Math.round(c.recup.cerezas[MESES.indexOf(MES_A)])).toBe(6000);
    expect(Math.round(c.devol.cerezas[MESES.indexOf(MES_C)])).toBe(2000);
    expect(Math.round(c.devol.cerezas[MESES.indexOf(MES_B)])).toBe(0);   // ni la aplazada ni la anulada
    expect(Math.round(c.recup.cerezas.reduce((a, b) => a + b, 0))).toBe(6000);
    expect(Math.round(c.devol.cerezas.reduce((a, b) => a + b, 0))).toBe(2000);
    // y el modelo dice exactamente lo mismo
    const movs = movimientosSaldos(SALDOS, { mIdx });
    expect(movs.length).toBe(2);
  });
});

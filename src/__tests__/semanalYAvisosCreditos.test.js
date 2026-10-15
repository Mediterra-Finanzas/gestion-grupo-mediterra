/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// D1 · Vista semanal del flujo: entrar y salir de una celda no es un cambio,
//      y editar UNA semana no borra lo que el mes ya mostraba.
// D2 · El Excel lleva los mismos avisos de Créditos que la pantalla del flujo.
//
// Defecto D1 (c9c5792): clic en una semana vacía («—») y salir guardaba 0 en
// esa semana; como el mes suma solo las semanas guardadas, el mes completo
// quedaba en 0 aunque tuviera valor calculado o manual. Sin aviso.
// Datos sintéticos.
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import * as XLSX from 'xlsx-js-style';
import { CeldaEditable, posicionSemanaFecha, semillaSemanal, aplicarEdicionSemana, cambioAlCargarSemana, totalMesOverride, saldoSemanal, buildEmpresas, buildEmpresasConOverrides, aplicarCreditosAEmpresas,
  avisosDeEmpresa, avisosCreditosEmpresa, claveLinea } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';

const OUT_DIR = path.join(os.tmpdir(), 'semanal-avisos');

describe('D1 · CeldaEditable no guarda si no se escribió nada', () => {
  const abrirYSalir = (val, texto) => {
    const onSave = jest.fn();
    const { container } = render(<CeldaEditable val={val} onSave={onSave} color="#000" canEdit={true} />);
    fireEvent.click(container.querySelector('span'));
    const input = container.querySelector('input');
    if (texto !== undefined) fireEvent.change(input, { target: { value: texto } });
    fireEvent.blur(input);
    return onSave;
  };
  test('celda vacía: clic y salir → no guarda', () => { expect(abrirYSalir(0)).not.toHaveBeenCalled(); });
  test('celda con valor: clic y salir → no guarda', () => { expect(abrirYSalir(2600)).not.toHaveBeenCalled(); });
  test('escribir el mismo valor → no guarda', () => { expect(abrirYSalir(2600, '2600')).not.toHaveBeenCalled(); });
  test('escribir un valor nuevo → guarda ese valor', () => {
    const onSave = abrirYSalir(0, '5.000');
    expect(onSave).toHaveBeenCalledTimes(1); expect(onSave).toHaveBeenCalledWith(5000);
  });
  test('escribir 0 explícito sobre una celda con valor → guarda 0', () => {
    const onSave = abrirYSalir(2600, '0');
    expect(onSave).toHaveBeenCalledWith(0);
  });
  test('Escape no guarda', () => {
    const onSave = jest.fn();
    const { container } = render(<CeldaEditable val={100} onSave={onSave} color="#000" canEdit={true} />);
    fireEvent.click(container.querySelector('span'));
    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: '999' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onSave).not.toHaveBeenCalled();
  });
});

// Vista semanal (oct-2026). Un mensual sin reparto queda SIN FECHA (no se le
// inventa una semana). REGLA ACORDADA: con semanas cargadas manda su suma; sin
// semanas, el mensual. Cargar la 1ª semana NO convierte el mensual ni su
// diferencia en otro compromiso: se pide confirmar el cambio del total.
describe('vista semanal · regla acordada (semanas mandan)', () => {
  test('la semilla son solo las semanas que el mes ya tiene', () => {
    expect(semillaSemanal(undefined, 2600, undefined)).toEqual({});
    expect(semillaSemanal(5200, 2600, undefined)).toEqual({});
    expect(semillaSemanal(0, 2600, undefined)).toEqual({});
    expect(semillaSemanal(null, 50, undefined)).toEqual({});
    expect(semillaSemanal({ _sem1: 10 }, 50, undefined)).toEqual({ _sem1: 10 });
    expect(semillaSemanal(undefined, 300, [0, 100, 0, 200])).toEqual({ _sem1: 100, _sem3: 200 });
  });
  test('cargar el mes completo en una semana: el total no cambia y no hay confirmación', () => {
    expect(cambioAlCargarSemana(106000, 0, undefined, 3, 106000)).toBeNull();
    expect(cambioAlCargarSemana(undefined, 2600, undefined, 3, 2600)).toBeNull();
    const o = aplicarEdicionSemana(semillaSemanal(106000, 0), 3, 106000);
    expect(o).toEqual({ _sem3: 106000 });
    expect(totalMesOverride(o)).toBe(106000);
  });
  test('cargar una parte: el mes pasa a la suma de semanas y se pide confirmar (no queda un pendiente extra)', () => {
    expect(cambioAlCargarSemana(undefined, 2600, undefined, 2, 1000)).toEqual({ antes: 2600, despues: 1000 });
    const o = aplicarEdicionSemana(semillaSemanal(undefined, 2600), 2, 1000);
    expect(o).toEqual({ _sem2: 1000 });
    expect(totalMesOverride(o)).toBe(1000);
  });
  test('con semanas ya cargadas, editar otra semana no pide confirmación y suma', () => {
    expect(cambioAlCargarSemana({ _sem2: 1000 }, 2600, undefined, 3, 500)).toBeNull();
    expect(totalMesOverride(aplicarEdicionSemana({ _sem2: 1000 }, 3, 500))).toBe(1500);
  });
  test('sin valor mensual previo no hay nada que confirmar', () => {
    expect(cambioAlCargarSemana(undefined, 0, undefined, 1, 700)).toBeNull();
    expect(cambioAlCargarSemana(0, 2600, undefined, 1, 700)).toBeNull();
  });
  test('Créditos (semanas propias): no aplica', () => {
    expect(cambioAlCargarSemana(undefined, 300, [0, 100, 0, 200], 1, 50)).toBeNull();
  });
  test('negativos legítimos (devolución, ajuste): se cargan igual que los positivos', () => {
    expect(cambioAlCargarSemana(-1000, 0, undefined, 0, -1000)).toBeNull();
    expect(cambioAlCargarSemana(-1000, 0, undefined, 0, -400)).toEqual({ antes: -1000, despues: -400 });
    const o = aplicarEdicionSemana(aplicarEdicionSemana({}, 0, -400), 2, 150);
    expect(o).toEqual({ _sem0: -400, _sem2: 150 });
    expect(totalMesOverride(o)).toBe(-250);
  });
  test('Excel/consolidado (buildEmpresasConOverrides) = pantalla: suma de semanas', () => {
    const empresas = buildEmpresas({}, { cobros: [] });
    const emp = empresas['Allegria Foods'];
    const sec = emp.sections.find(s => s.lines.some(l => l.label === 'Arriendo Oficina'));
    const idx = 6; // Oct-26
    const ov = aplicarEdicionSemana(aplicarEdicionSemana({}, 2, 1000), 3, 250);
    const real = { 'Allegria Foods': { _proyOverrides: { [claveLinea(sec.cat, 'Arriendo Oficina')]: { [idx]: ov } } } };
    const out = buildEmpresasConOverrides(empresas, real, {}, {});
    const l = out['Allegria Foods'].sections.find(s => s.cat === sec.cat).lines.find(x => x.label === 'Arriendo Oficina');
    expect(l.proy[idx]).toBe(1250);
  });
  // Control del SITIO DE LLAMADA (regla 10): se lee el código real de la pantalla.
  // Puntos ciegos: una llamada por alias o desde otro handler no se ve aquí.
  test('handleEditProy: con semanas no escribe el mensual; la 1ª semana pide confirmar ANTES de escribir', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'FinanzasModule.jsx'), 'utf8');
    const i = src.indexOf('const handleEditProy = useCallback(');
    const fin = src.indexOf('setProyOverrides(prev=>{', i);
    expect(i).toBeGreaterThan(0); expect(fin).toBeGreaterThan(i);
    const antes = src.slice(i, fin);
    expect(antes).toMatch(/if \(semIdx == null\) \{\s*if \(efectivoAhora !== null && typeof efectivoAhora === "object"\) \{[\s\S]*?return;\s*\}/);
    expect(antes).toMatch(/cambioAlCargarSemana\([\s\S]*?\);\s*if \(c && !window\.confirm\([\s\S]*?\)\) return;/);
    const cuerpo = src.slice(fin, src.indexOf('},[empNombre, onSaveProy, emp, resoluciones, proyOverrides]);', fin));
    expect(cuerpo).toMatch(/if \(efectivo !== null && typeof efectivo === "object"\) return prev;/);
    expect(cuerpo).not.toMatch(/_sinFecha/);
  });
  test('la celda mensual no se edita con semanas cargadas (vista mensual y mes plegado)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'FinanzasModule.jsx'), 'utf8');
    expect(src).toMatch(/const isEditable=canEdit && !formulaBloquea && !isTot && col\.type!=="month_collapsed" && !mesConSemanas;/);
    expect(src).toMatch(/canEdit=\{canEdit && !formulaBloquea && !mesConSemanas\}\s*real=\{real\}\s*onSave=\{v=>handleEditProy\(sec\.cat,line\.label,col\.idx,v\)\}/);
  });
});

// Semana en curso: una sola regla (flujo y Créditos). Semana
// ISO del DÍA (sin la hora) y, si esa semana no está entre las 4 del mes
// calendario, 1ª semana en los días 1-7 y última en el resto.
describe('semana en curso · fin de mes y domingos', () => {
  const pos = (y, m, d) => { const r = posicionSemanaFecha(y, m, d); return `${r.mes} ${r.semIdx} ${r.semana}`; };
  test('semana normal y domingo (el domingo cierra la semana ISO)', () => {
    expect(pos(2026, 10, 14)).toBe('Oct-26 2 S42');
    expect(pos(2026, 10, 18)).toBe('Oct-26 2 S42');   // domingo
    expect(pos(2026, 10, 19)).toBe('Oct-26 3 S43');   // lunes siguiente
  });
  test('fin de mes: la semana ISO es de otro mes → última semana del mes calendario', () => {
    expect(pos(2026, 10, 26)).toBe('Oct-26 3 S43');   // S44 en el flujo es de noviembre
    expect(pos(2026, 10, 29)).toBe('Oct-26 3 S43');
    expect(pos(2026, 10, 31)).toBe('Oct-26 3 S43');
    expect(pos(2026, 11, 30)).toBe('Nov-26 3 S47');
    expect(pos(2026, 12, 31)).toBe('Dec-26 3 S51');
  });
  test('inicio de mes', () => {
    expect(pos(2026, 11, 1)).toBe('Nov-26 0 S44');    // domingo de la S44
    expect(pos(2027, 1, 1)).toBe('Jan-27 0 S01');     // semana ISO 53 de 2026
    expect(pos(2027, 1, 4)).toBe('Jan-27 0 S01');
  });
  test('los vencimientos de Créditos usan la MISMA semana (domingo y 2027)', () => {
    const cr = (uid, f) => ({ uid, n: 1, empresa: 'Allegria Foods', acreedor: 'Banco ' + uid, tipo_inst: 'Banco',
      monto: 1000, f_venc: f, cuota: 1000, tipo_cr: 'Bullet', pagado: false, control_desde: '2026-10-01' });
    jest.useFakeTimers('modern'); jest.setSystemTime(new Date(2026, 9, 12, 12));
    try {
      const e = aplicarCreditosAEmpresas(buildEmpresas({}, { cobros: [] }), [cr('D', '2026-10-18'), cr('F', '2027-02-10')]);
      const l = e['Allegria Foods'].sections.flatMap(x => x.lines).find(x => x.label === 'Pago Préstamos - Total');
      expect(l._semProy[6]).toEqual([0, 0, 1000, 0]);            // domingo 18-10 → S42 (semana ISO que cierra ese día)
      expect(l._semProy[10]).toEqual([0, 1000, 0, 0]);           // miércoles 10-02-2027 → S06 = 2ª de febrero
      expect(posicionSemanaFecha(2027, 2, 8).semIdx).toBe(1);    // el lunes 08-02-2027 es la misma semana
    } finally { jest.useRealTimers(); }
  });
});

describe('vista semanal · saldo semanal (corte en semana intermedia)', () => {
  // Mes del corte = 6 (Oct-26), semana en curso = 2 (S42). Flujo fechado por semana:
  const fechado = { '6_0': -100, '6_1': 0, '6_2': -30, '6_3': -500, '7_0': 50, '7_1': 0, '7_2': 0, '7_3': 0 };
  const flujoSemana = (m, s) => fechado[`${m}_${s}`] || 0;
  const base = { mesIni: 6, semIni: 2, saldoIni: 1000, flujoSemana };
  test('semanas anteriores al corte: sin saldo', () => {
    expect(saldoSemanal({ ...base, mesIdx: 6, semIdx: 1, acumMesPrevio: null })).toBeNull();
  });
  test('lo fechado en una semana pasada NO se da por pagado: entra en la semana en curso', () => {
    // 1000 − 100 (atrasado S40) − 30 (S42) = 870
    expect(saldoSemanal({ ...base, mesIdx: 6, semIdx: 2, acumMesPrevio: null })).toBe(870);
    expect(saldoSemanal({ ...base, mesIdx: 6, semIdx: 3, acumMesPrevio: null })).toBe(370);
  });
  test('mes siguiente parte del cierre mensual (que incluye lo sin fecha)', () => {
    // cierre Oct (mensual) = 370 − 200 sin fecha = 170
    expect(saldoSemanal({ ...base, mesIdx: 7, semIdx: 0, acumMesPrevio: 170 })).toBe(220);
  });
});

describe('D2 · avisos de Créditos en el Excel', () => {
  // Sintéticos: un crédito en CLP sin TC (no entra al flujo) y uno en USD con
  // una cuota vencida sin pago ni control (queda por conciliar, fuera del flujo).
  const sinTC = { uid: 'S1', n: 901, empresa: 'Allegria Foods', acreedor: 'Banco Sintético CLP', moneda: 'CLP',
    monto: 50000000, f_venc: '2027-03-15', cuota: 50000000, tipo_cr: 'Capital de Trabajo', pagado: false };
  const vencido = { uid: 'V1', n: 902, empresa: 'Allegria Foods', acreedor: 'Banco Sintético USD', moneda: 'USD',
    monto: 70000, f_venc: '2026-05-15', cuota: 70000, tipo_cr: 'Capital de Trabajo', pagado: false };
  let empresas;
  beforeAll(() => { empresas = aplicarCreditosAEmpresas(buildEmpresas({}, { cobros: [] }), [sinTC, vencido]); });

  test('misma fuente que la pantalla', () => {
    const av = avisosCreditosEmpresa(empresas['Allegria Foods'], 'Allegria Foods', [sinTC, vencido], {}, []);
    expect(av.sinTC.map(c => c.acreedor)).toEqual(['Banco Sintético CLP']);
    expect(av.porConciliar.map(v => v.acreedor)).toEqual(['Banco Sintético USD']);
  });

  test('sin `creditos` no cambia lo que ya devolvía', () => {
    const real = {};
    const cons = buildEmpresasConOverrides(empresas, real, {}, {});
    expect(avisosDeEmpresa(real, cons, 'Allegria Foods')).toEqual([]);
  });

  test('con `creditos` los avisos llegan al archivo (subtítulo y pie)', () => {
    const real = {};
    const cons = buildEmpresasConOverrides(empresas, real, {}, {});
    const avisos = avisosDeEmpresa(real, cons, 'Allegria Foods', { creditos: [sinTC, vencido], empresasBase: empresas });
    expect(avisos.some(a => a.includes('sin tipo de cambio') && a.includes('Banco Sintético CLP'))).toBe(true);
    expect(avisos.some(a => a.includes('por conciliar') && a.includes('Banco Sintético USD'))).toBe(true);
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, 'avisos.xlsx');
    exportarFlujoEmpresa({ emp: cons['Allegria Foods'], empName: 'Allegria Foods', saldoIni: 0, fileName: file, avisos });
    const wb = XLSX.readFile(file);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const textos = Object.values(ws).filter(c => c && c.t === 's').map(c => String(c.v));
    expect(textos.some(t => t.includes('sin tipo de cambio') && t.includes('Banco Sintético CLP'))).toBe(true);
    expect(textos.some(t => t.includes('por conciliar') && t.includes('Banco Sintético USD'))).toBe(true);
  });

  test('valor manual antiguo sobre Pago Préstamos: compara con el calendario, no consigo mismo', () => {
    const emp = empresas['Allegria Foods'];
    const sec = emp.sections.find(s => s.lines.some(l => l._fuenteCreditos));
    const linea = sec.lines.find(l => l._fuenteCreditos);
    const real = { 'Allegria Foods': { _proyOverrides: { [claveLinea(sec.cat, linea.label)]: { 7: 12345 } } } };
    const cons = buildEmpresasConOverrides(empresas, real, {}, {});
    const avisos = avisosDeEmpresa(real, cons, 'Allegria Foods', { creditos: [sinTC, vencido], empresasBase: empresas });
    const t = avisos.find(a => a.includes('siguen aplicándose'));
    expect(t).toBeTruthy();
    const m = t.match(/Nov-26: manual (\S+) → Créditos (\S+?)\.?(?: ·|$)/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/12.345/);
    expect(m[2]).not.toMatch(/12.345/);
  });
});

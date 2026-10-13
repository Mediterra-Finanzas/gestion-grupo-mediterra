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
import { CeldaEditable, semillaSemanal, aplicarEdicionSemana, aplicarTotalMes, totalMesOverride, saldoSemanal, reporte_armarDatosEmpresa, buildEmpresas, buildEmpresasConOverrides, aplicarCreditosAEmpresas,
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

// Vista semanal (oct-2026): un mensual sin reparto queda SIN FECHA; distribuir
// lo MUEVE a una semana (no duplica el mes) y bajar una semana lo devuelve.
describe('vista semanal · semilla y distribución', () => {
  test('sin valor manual: el calculado queda sin fecha', () => {
    expect(semillaSemanal(undefined, 2600, undefined)).toEqual({ _sinFecha: 2600 });
  });
  test('valor manual mensual: queda sin fecha (antes se fingía en la última semana)', () => {
    expect(semillaSemanal(5200, 2600, undefined)).toEqual({ _sinFecha: 5200 });
  });
  test('valor manual mensual 0 (mes cerrado): nada que distribuir', () => {
    expect(semillaSemanal(0, 2600, undefined)).toEqual({});
  });
  test('línea con reparto semanal propio (fechas de Créditos): se conservan', () => {
    expect(semillaSemanal(undefined, 300, [0, 100, 0, 200])).toEqual({ _sem1: 100, _sem3: 200 });
  });
  test('null o texto se tratan como sin valor manual (igual que la pantalla)', () => {
    expect(semillaSemanal(null, 50, undefined)).toEqual({ _sinFecha: 50 });
    expect(semillaSemanal('x', 50, undefined)).toEqual({ _sinFecha: 50 });
  });
  test('distribuir todo a fin de mes: el mes no cambia y no queda nada sin fecha', () => {
    const o = aplicarEdicionSemana(semillaSemanal(undefined, 2600), 3, 2600);
    expect(o).toEqual({ _sem3: 2600 });
    expect(totalMesOverride(o)).toBe(2600);
  });
  test('distribuir una parte: el resto sigue sin fecha (no se duplica ni desaparece)', () => {
    const o = aplicarEdicionSemana(semillaSemanal(undefined, 2600), 2, 1000);
    expect(o).toEqual({ _sem2: 1000, _sinFecha: 1600 });
    expect(totalMesOverride(o)).toBe(2600);
  });
  test('bajar una semana devuelve el importe a sin fecha', () => {
    const o = aplicarEdicionSemana({ _sem3: 2600 }, 3, 600);
    expect(o).toEqual({ _sem3: 600, _sinFecha: 2000 });
    expect(totalMesOverride(o)).toBe(2600);
  });
  test('distribuir MÁS que el mes sube el total solo por el exceso', () => {
    const o = aplicarEdicionSemana({ _sinFecha: 1000 }, 1, 1500);
    expect(o).toEqual({ _sem1: 1500 });
    expect(totalMesOverride(o)).toBe(1500);
  });
  test('objeto antiguo sin _sinFecha: las semanas mandan, como antes', () => {
    expect(totalMesOverride({ _sem0: 100, _sem2: 50 })).toBe(150);
  });
  test('Excel/consolidado (buildEmpresasConOverrides) = pantalla: semanas + sin fecha', () => {
    const empresas = buildEmpresas({}, { cobros: [] });
    const emp = empresas['Allegria Foods'];
    const sec = emp.sections.find(s => s.lines.some(l => l.label === 'Arriendo Oficina'));
    const idx = 6; // Oct-26
    const base = sec.lines.find(l => l.label === 'Arriendo Oficina').proy[idx];
    expect(base).toBeGreaterThan(0);
    const ov = aplicarEdicionSemana(semillaSemanal(undefined, base), 2, 1000);
    const real = { 'Allegria Foods': { _proyOverrides: { [claveLinea(sec.cat, 'Arriendo Oficina')]: { [idx]: ov } } } };
    const out = buildEmpresasConOverrides(empresas, real, {}, {});
    const l = out['Allegria Foods'].sections.find(s => s.cat === sec.cat).lines.find(x => x.label === 'Arriendo Oficina');
    expect(l.proy[idx]).toBe(base);
  });
});

describe('vista semanal · montos negativos y total del mes (hallazgos de la revisión)', () => {
  test('mes −1000: distribuir −400 y luego volver a 0 no pierde el mes', () => {
    const a = aplicarEdicionSemana(semillaSemanal(-1000, 0), 0, -400);
    expect(a).toEqual({ _sem0: -400, _sinFecha: -600 });
    const b = aplicarEdicionSemana(a, 0, 0);
    expect(totalMesOverride(b)).toBe(-1000);
  });
  test('mes −1000: escribir +200 (signo opuesto) cambia el mes solo en esos 200', () => {
    const o = aplicarEdicionSemana({ _sinFecha: -1000 }, 0, 200);
    expect(totalMesOverride(o)).toBe(-800);
    expect(o._sinFecha).toBe(-1000);
  });
  test('cambiar de signo una semana: lo que había vuelve a sin fecha', () => {
    const o = aplicarEdicionSemana({ _sem1: 500 }, 1, -300);
    expect(o).toEqual({ _sem1: -300, _sinFecha: 500 });
  });
  test('subir una semana dentro del mes la toma de sin fecha', () => {
    expect(aplicarEdicionSemana({ _sem1: 1000, _sinFecha: 1000 }, 1, 1500)).toEqual({ _sem1: 1500, _sinFecha: 500 });
  });
  test('editar el TOTAL del mes conserva las semanas fechadas', () => {
    expect(aplicarTotalMes({ _sem3: 106000 }, 120000)).toEqual({ _sem3: 106000, _sinFecha: 14000 });
    expect(aplicarTotalMes({ _sem3: 1000, _sinFecha: 1700 }, 1000)).toEqual({ _sem3: 1000 });
    // por debajo de lo fechado: no se aplica (hay que bajar primero las semanas)
    expect(aplicarTotalMes({ _sem1: 1000, _sem2: 1000 }, 1500)).toBeNull();
    expect(aplicarTotalMes({ _sem3: 1000 }, 600)).toBeNull();
    // meses negativos: misma regla con su signo
    expect(aplicarTotalMes({ _sem0: -400 }, -1000)).toEqual({ _sem0: -400, _sinFecha: -600 });
  });
});

// El Reporte Semanal conserva su regla anterior (limitación declarada en
// CLAUDE.md); lo único nuevo es que la parte sin distribuir de un reparto
// parcial no desaparece: va donde el reporte ya pone lo mensual (1ª semana).
describe('reporte semanal · lo sin distribuir no desaparece (reloj fijo 14-10-2026)', () => {
  test('reparto parcial en noviembre: 1.000 en S4 y 1.700 en S1', () => {
    jest.useFakeTimers('modern'); jest.setSystemTime(new Date(2026, 9, 14, 12, 0, 0));
    try {
      const empresas = buildEmpresas({}, { cobros: [] });
      const real = { 'Allegria Foods': { _proyOverrides: {
        'egr_fijo::Arriendo Oficina': { 7: { _sem3: 1000, _sinFecha: 1700 } },
      } } };
      const d = reporte_armarDatosEmpresa('Allegria Foods', real, empresas, null, 0, '', 950, {}, {});
      const c = d.compromisos.map(x => `${x.mes}|${x.label}|${Math.round(x.monto)}`);
      expect(c).toContain('Nov 26 S4|Arriendo Oficina|1000');
      expect(c).toContain('Nov 26 S1|Arriendo Oficina|1700');
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

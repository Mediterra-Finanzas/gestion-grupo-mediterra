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
import { CeldaEditable, semillaSemanal, buildEmpresas, buildEmpresasConOverrides, aplicarCreditosAEmpresas,
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

describe('D1 · semillaSemanal: las otras semanas parten de lo que se veía', () => {
  test('sin valor manual: el calculado queda en la semana 1', () => {
    expect(semillaSemanal(undefined, 2600, undefined)).toEqual({ _sem0: 2600 });
  });
  test('valor manual mensual: queda en la última semana (donde se mostraba)', () => {
    expect(semillaSemanal(5200, 2600, undefined)).toEqual({ _sem3: 5200 });
  });
  test('valor manual mensual 0 (mes cerrado) se respeta', () => {
    expect(semillaSemanal(0, 2600, undefined)).toEqual({ _sem3: 0 });
  });
  test('línea con reparto semanal propio', () => {
    expect(semillaSemanal(undefined, 300, [0, 100, 0, 200])).toEqual({ _sem1: 100, _sem3: 200 });
  });
  test('sin nada que conservar', () => { expect(semillaSemanal(undefined, 0, undefined)).toEqual({}); });
  test('null o texto se tratan como sin valor manual (igual que la pantalla)', () => {
    expect(semillaSemanal(null, 50, undefined)).toEqual({ _sem0: 50 });
    expect(semillaSemanal('x', 50, undefined)).toEqual({ _sem0: 50 });
  });

  // Mismo cálculo que el mes en pantalla (getProy) y que el Excel
  // (buildEmpresasConOverrides): Σ semanas guardadas.
  test('editar la semana 3 conserva el calculado: mes = 2.600 + 1.000 (antes 1.000)', () => {
    const empresas = buildEmpresas({}, { cobros: [] });
    const emp = empresas['Allegria Foods'];
    const sec = emp.sections.find(s => s.lines.some(l => l.label === 'Arriendo Oficina'));
    const idx = 6; // Oct-26
    const base = sec.lines.find(l => l.label === 'Arriendo Oficina').proy[idx];
    expect(base).toBeGreaterThan(0);
    const ov = { ...semillaSemanal(undefined, base, undefined), _sem2: 1000 };
    const real = { 'Allegria Foods': { _proyOverrides: { [claveLinea(sec.cat, 'Arriendo Oficina')]: { [idx]: ov } } } };
    const out = buildEmpresasConOverrides(empresas, real, {}, {});
    const l = out['Allegria Foods'].sections.find(s => s.cat === sec.cat).lines.find(x => x.label === 'Arriendo Oficina');
    expect(l.proy[idx]).toBe(base + 1000);
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

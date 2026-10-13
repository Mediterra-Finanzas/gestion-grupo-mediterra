/* eslint-disable */
// Revisión de repartos semanales posiblemente duplicados (solo lectura).
// Casos sintéticos siempre; con FINANZAS_JSON=<archivo con el `value` de la
// fila finanzas> además escribe la lista de filas sospechosas en
// OUT_DIR/repartos-sospechosos.csv. No escribe en ninguna base.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { analizarRepartosSemanales } from '../revisionRepartos.js';
import { buildEmpresas } from '../FinanzasModule.jsx';
import { MESES as MESES_65 } from '../horizonte.js';

describe('repartos semanales sospechosos (sintético)', () => {
  const base = { 'egr_fijo::Arriendo Oficina': 2700, 'egr_var::Seguros Exportación': 0 };
  const baseDe = (e, cat, et) => (base[`${cat}::${et}`] ?? null);
  const real = { 'Allegria Foods': { _proyOverrides: {
    'egr_fijo::Arriendo Oficina': { 6: { _sem0: 2700, _sem2: 1000 }, 7: { _sem2: 1000 }, 8: { _sem1: 0 } },
    'egr_var::Seguros Exportación': { 6: { _sem3: 106000, _sem1: 5000 }, 7: { _sem3: 106000 } },
    'egr_fijo::Otro': { 6: { _sem0: 500, _sem1: 500 } },
    'egr_fijo::Manual': { 6: 1234 },
  } } };
  const f = analizarRepartosSemanales(real, baseDe, MESES_65);
  const de = (clave, idx) => f.find(x => x.clave === clave && x.idx === idx);
  test('semilla calculada: S1 = calculado + otra semana → propone quitar S1', () => {
    const x = de('egr_fijo::Arriendo Oficina', 6);
    expect(x.tipo).toBe('semilla_calculada_probable');
    expect([x.antes, x.despues, x.quitar]).toEqual([3700, 1000, '_sem0']);
  });
  test('mes en cero por clic: propone volver al calculado', () => {
    const x = de('egr_fijo::Arriendo Oficina', 8);
    expect(x.tipo).toBe('mes_en_cero');
    expect([x.antes, x.despues]).toEqual([0, 2700]);
  });
  test('S4 + otra semana: posible semilla del manual, a confirmar', () => {
    const x = de('egr_var::Seguros Exportación', 6);
    expect(x.tipo).toBe('posible_semilla_manual');
    expect([x.antes, x.despues]).toEqual([111000, 5000]);
  });
  test('sin base conocida, o S1 distinto del calculado de hoy: se marca para comparar, no se afirma', () => {
    expect(de('egr_fijo::Otro', 6).tipo).toBe('posible_semilla_calculada');
    const g = analizarRepartosSemanales({ E: { _proyOverrides: { 'egr_fijo::Arriendo Oficina': { 6: { _sem0: 2600, _sem2: 1000 } } } } }, baseDe, MESES_65);
    expect(g.map(x => `${x.tipo} ${x.antes} ${x.despues}`)).toEqual(['posible_semilla_calculada 3600 1000']);
  });
  test('S1 y S4 con valor: ambigua, se presentan las dos alternativas sin elegir', () => {
    const g = analizarRepartosSemanales({ E: { _proyOverrides: { 'egr_fijo::Arriendo Oficina': { 6: { _sem0: 2700, _sem3: 1000 } } } } }, baseDe, MESES_65);
    expect(g.map(x => `${x.tipo} ${x.antes} ${x.despues}`)).toEqual(['ambigua_s1_s4 3700 null']);
    expect(g[0].accion).toMatch(/quitar S1 deja 1000; quitar S4 deja 2700/);
  });
  test('objeto sin claves de semana: mes en 0, igual que el SQL', () => {
    const g = analizarRepartosSemanales({ E: { _proyOverrides: { 'egr_fijo::Arriendo Oficina': { 6: {}, 7: { _sinFecha: 500 } } } } }, baseDe, MESES_65);
    expect(g.map(x => `${x.mes} ${x.tipo} ${x.antes} ${x.despues}`)).toEqual(['Oct-26 mes_en_cero 0 2700', 'Nov-26 mes_en_cero 0 2700']);
  });
  test('una sola semana o valor numérico: no se lista', () => {
    expect(de('egr_fijo::Arriendo Oficina', 7)).toBeUndefined();
    expect(de('egr_var::Seguros Exportación', 7)).toBeUndefined();
    expect(f.some(x => x.clave === 'egr_fijo::Manual')).toBe(false);
  });
  test('no modifica los datos de entrada', () => {
    const copia = JSON.parse(JSON.stringify(real));
    analizarRepartosSemanales(real, baseDe, MESES_65);
    expect(real).toEqual(copia);
  });
});

const archivo = process.env.FINANZAS_JSON;
(archivo ? describe : describe.skip)('repartos semanales sospechosos (datos entregados, solo lectura)', () => {
  test('lista filas sospechosas con valor actual y propuesta', () => {
    let v = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (typeof v === 'string') v = JSON.parse(v);
    if (Array.isArray(v)) v = v[0]?.value ?? v[0];
    if (typeof v === 'string') v = JSON.parse(v);
    const empresas = buildEmpresas(v.allegria_params || {}, v.allegria_comision_arandanos || { cobros: [] });
    // Calculado solo donde se puede saber fuera de la app. El resto queda «a comparar en pantalla».
    const baseDe = (emp, cat, et, idx) => {
      const e = empresas[emp]; if (!e) return null;
      const l = (e.sections.find(s => s.cat === cat)?.lines || []).find(x => x.label === et);
      if (!l || l._fuenteCreditos) return null;
      // Solo Allegria Foods se arma igual que en la pantalla (buildAllegria);
      // en las otras empresas la pantalla inyecta cálculos que aquí no están.
      if (emp !== 'Allegria Foods') return null;
      return Number(l.proy?.[idx]) || 0;
    };
    const filas = analizarRepartosSemanales(v.finanzas_real || {}, baseDe, MESES_65);
    const out = process.env.OUT_DIR || path.join(os.tmpdir(), 'repartos');
    fs.mkdirSync(out, { recursive: true });
    const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const csv = ['empresa;linea;mes;S1;S2;S3;S4;antes;base_calculada;tipo;quitar;despues_propuesto;motivo;accion',
      ...filas.map(x => [x.empresa, x.clave, x.mes, ...x.semanas.map(s => s ?? ''), x.antes, x.baseCalculada ?? 'no calculable',
        x.tipo, x.quitar, x.despues ?? 'no calculable', x.motivo, x.accion].map(q).join(';'))].join('\n');
    fs.writeFileSync(path.join(out, 'repartos-sospechosos.csv'), csv);
    console.log(`${filas.length} fila(s) sospechosa(s) → ${path.join(out, 'repartos-sospechosos.csv')}`);
    expect(Array.isArray(filas)).toBe(true);
  });
});

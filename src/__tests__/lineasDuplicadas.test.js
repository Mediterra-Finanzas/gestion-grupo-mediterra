/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// ETIQUETAS REPETIDAS ENTRE CATEGORÍAS
//
// Es válido que dos categorías tengan conceptos con el mismo nombre
// (Allpa Farms tiene 14: "Electricidad", "Gratificaciones", …). Lo que no
// es válido es identificar una línea solo por su etiqueta: la búsqueda
// devolvía la primera coincidencia de cualquier categoría, y la segunda
// categoría mostraba el valor de la primera en su fila, su subtotal, el
// flujo neto y el acumulado.
//
// Identidad correcta: categoría + etiqueta (`claveLinea`).
// ═══════════════════════════════════════════════════════════════════
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as XLSX from 'xlsx-js-style';
import { buildEmpresas, buildEmpresasConOverrides, claveLinea, overridesDeLinea, overridesAmbiguos,
         avisoProvisional, clavesDuplicadas, avisosDeEmpresa } from '../FinanzasModule.jsx';
import { exportarFlujoEmpresa } from '../flujoExportExcel.js';

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = (() => { const o=[]; let y=2026,m=3; while(o.length<63){o.push(`${MN[m]}-${String(y).slice(2)}`); m++; if(m>11){m=0;y++;}} return o; })();
const iM = (l) => MESES.indexOf(l);
const OUT_DIR = process.env.DUP_OUT_DIR || path.join(os.tmpdir(), 'dup-lineas');

const empresas = buildEmpresas({}, { cobros: [] });

// Empresa sintética con la misma etiqueta en dos categorías y valores distintos
function empDuplicada() {
  const z = () => Array(63).fill(0);
  const varr = z(); varr[iM('May-26')] = 5000;
  const fija = z(); fija[iM('May-26')] = 80;
  return {
    emoji:'🧪', color:'#000', saldo_ini:0, desc:'prueba',
    sections: [
      { cat:'ing_op',  label:'Ingresos Operacionales', signo:1,  lines:[ { label:'Ventas', proy:z() } ] },
      { cat:'egr_var', label:'Egresos Operacionales',  signo:-1, lines:[ { label:'Electricidad', proy:varr } ] },
      { cat:'egr_fijo',label:'Costos Fijos / SG&A',    signo:-1, lines:[ { label:'Electricidad', proy:fija } ] },
    ],
  };
}

describe('identidad de línea', () => {
  test('claveLinea distingue dos conceptos con el mismo nombre', () => {
    expect(claveLinea('egr_var', 'Electricidad')).toBe('egr_var::Electricidad');
    expect(claveLinea('egr_fijo', 'Electricidad')).toBe('egr_fijo::Electricidad');
    expect(claveLinea('egr_var', 'Electricidad')).not.toBe(claveLinea('egr_fijo', 'Electricidad'));
  });

  test('Allpa Farms tiene etiquetas repetidas: el caso real que motivó el arreglo', () => {
    const emp = empresas['Allpa Farms'];
    const porLabel = {};
    emp.sections.forEach(sec => sec.lines.forEach(l => (porLabel[l.label] = porLabel[l.label] || []).push(sec.cat)));
    const dups = Object.entries(porLabel).filter(([, cats]) => new Set(cats).size > 1);
    expect(dups.length).toBeGreaterThanOrEqual(14);
    expect(dups.map(([l]) => l)).toEqual(expect.arrayContaining(['Electricidad', 'Gratificaciones', 'Casino - Colaciones']));
  });

  test('ninguna línea con sublíneas usa una etiqueta repetida (las sublíneas se guardan por etiqueta)', () => {
    // Si esto falla, hay que darle identidad por categoría también a subLines.
    Object.entries(empresas).forEach(([nombre, emp]) => {
      const porLabel = {};
      emp.sections.forEach(sec => sec.lines.forEach(l => (porLabel[l.label] = porLabel[l.label] || []).push(l)));
      Object.entries(porLabel).forEach(([label, lineas]) => {
        if (lineas.length > 1) {
          expect(`${nombre}/${label}: ${lineas.filter(l => l.subLines).length}`).toBe(`${nombre}/${label}: 0`);
        }
      });
    });
  });
});

describe('overrides con etiquetas repetidas', () => {
  const emp = empDuplicada();
  const idx = iM('May-26');

  test('cada línea homónima se edita por separado', () => {
    const ov = {
      [claveLinea('egr_var', 'Electricidad')]:  { [idx]: 1111 },
      [claveLinea('egr_fijo', 'Electricidad')]: { [idx]: 2222 },
    };
    expect(overridesDeLinea(ov, emp, 'egr_var', 'Electricidad')[idx]).toBe(1111);
    expect(overridesDeLinea(ov, emp, 'egr_fijo', 'Electricidad')[idx]).toBe(2222);
  });

  test('el árbol aplica cada override a SU línea, sin contagiar a la homónima', () => {
    const realData = { X: { _proyOverrides: {
      [claveLinea('egr_var', 'Electricidad')]:  { [idx]: 1111 },
      [claveLinea('egr_fijo', 'Electricidad')]: { [idx]: 2222 },
    } } };
    const cons = buildEmpresasConOverrides({ X: emp }, realData, {}, {})['X'];
    const varr = cons.sections.find(s => s.cat === 'egr_var').lines[0];
    const fija = cons.sections.find(s => s.cat === 'egr_fijo').lines[0];
    expect(varr.proy[idx]).toBe(1111);
    expect(fija.proy[idx]).toBe(2222);
  });

  test('editar una sola de las dos NO toca a la otra', () => {
    const realData = { X: { _proyOverrides: { [claveLinea('egr_fijo', 'Electricidad')]: { [idx]: 999 } } } };
    const cons = buildEmpresasConOverrides({ X: emp }, realData, {}, {})['X'];
    expect(cons.sections.find(s => s.cat === 'egr_var').lines[0].proy[idx]).toBe(5000);   // intacta
    expect(cons.sections.find(s => s.cat === 'egr_fijo').lines[0].proy[idx]).toBe(999);
  });

  test('clave antigua (solo etiqueta) sobre etiqueta ÚNICA: se sigue leyendo', () => {
    const ov = { 'Ventas': { [idx]: 777 } };
    expect(overridesDeLinea(ov, emp, 'ing_op', 'Ventas')[idx]).toBe(777);
    const cons = buildEmpresasConOverrides({ X: emp }, { X: { _proyOverrides: ov } }, {}, {})['X'];
    expect(cons.sections.find(s => s.cat === 'ing_op').lines[0].proy[idx]).toBe(777);
  });

  test('clave antigua sobre etiqueta REPETIDA: no se duplica en las dos líneas', () => {
    const ov = { 'Electricidad': { [idx]: 4444 } };
    const cons = buildEmpresasConOverrides({ X: emp }, { X: { _proyOverrides: ov } }, {}, {})['X'];
    const varr = cons.sections.find(s => s.cat === 'egr_var').lines[0].proy[idx];
    const fija = cons.sections.find(s => s.cat === 'egr_fijo').lines[0].proy[idx];
    // se mantiene el comportamiento histórico (primera categoría) y la otra
    // línea conserva SU valor: antes ambas quedaban en 4444
    expect(varr).toBe(4444);
    expect(fija).toBe(80);
  });

  test('las claves antiguas ambiguas se reportan para resolverlas a mano', () => {
    const otro = iM('Jun-26');
    const ov = { 'Electricidad': { [idx]: 4444, [otro]: 100 }, 'Ventas': { [idx]: 1 },
                 // May-26 ya resuelto a Costos Fijos: solo debe quedar Jun-26 por resolver
                 [claveLinea('egr_fijo', 'Electricidad')]: { [idx]: 4444 } };
    const amb = overridesAmbiguos(ov, emp);
    expect(amb).toHaveLength(1);
    expect(amb[0]).toMatchObject({ label: 'Electricidad', cats: ['egr_var', 'egr_fijo'] });
    expect(amb[0].meses).toHaveLength(1);
    expect(amb[0].meses[0]).toMatchObject({ mes: 'Jun-26', valor: 100 });
  });
});

describe('Excel con etiquetas repetidas', () => {
  test('cada fila lleva su propio valor y el subtotal cuadra con la suma de sus líneas', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const emp = empDuplicada();
    const file = path.join(OUT_DIR, 'dup.xlsx');
    exportarFlujoEmpresa({ emp, empName: 'X', saldoIni: 0, fileName: file });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const colMay = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === 'May-26').replace(/\d+$/, '');
    const filas = Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === 'Electricidad').map(k => Number(k.slice(1)));
    expect(filas).toHaveLength(2);
    const valores = filas.map(f => ws[`${colMay}${f}`].v).sort((a, b) => a - b);
    expect(valores).toEqual([80, 5000]);          // cada una con lo suyo
    const cat = (et) => {
      const k = Object.keys(ws).filter(x => /^A\d+$/.test(x) && ws[x].v === et)[0];
      return ws[`${colMay}${k.slice(1)}`].v;
    };
    expect(cat('· Egresos Operacionales (variables)')).toBe(5000);
    expect(cat('· Costos Fijos / SG&A')).toBe(80);
    expect(cat('(=) Flujo neto')).toBe(-5080);    // ingresos 0 − (5000 + 80)
  });

  test('una etiqueta repetida no recibe la fórmula viva de la hoja Parametros', () => {
    const emp = empDuplicada();
    const file = path.join(OUT_DIR, 'dup-formula.xlsx');
    // se simula un builder que mapea la etiqueta repetida a una fórmula
    exportarFlujoEmpresa({
      emp, empName: 'Allegria Foods', saldoIni: 0, fileName: file,
      params: { paramsAllegria: { "2026-2027": { cerezas: { kg: 1, fob_usd_kg: 1, anticipos_cliente: [], anticipos_productor: [], dist_mat: [], dist_srv: [] } } }, allegraComisionArandanos: { cobros: [] } },
    });
    const wb = XLSX.readFile(file, { cellFormula: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const colMay = Object.keys(ws).filter(k => /^[A-Z]+3$/.test(k)).find(k => ws[k].v === 'May-26').replace(/\d+$/, '');
    Object.keys(ws).filter(k => /^A\d+$/.test(k) && ws[k].v === 'Electricidad').forEach(k => {
      const celda = ws[`${colMay}${k.slice(1)}`];
      expect(celda.f).toBeUndefined();            // valor propio, no SUMIF compartido
    });
  });
});

describe('resolución de overrides ambiguos', () => {
  const emp = empDuplicada();
  const iMay = iM('May-26'), iJun = iM('Jun-26');

  test('el detalle llega mes a mes, con monto y categorías candidatas', () => {
    const ov = { 'Electricidad': { [iMay]: 4444, [iJun]: { _sem0: 100, _sem2: 50 } } };
    const amb = overridesAmbiguos(ov, emp, 'Allpa Farms');
    expect(amb).toHaveLength(1);
    expect(amb[0]).toMatchObject({ empresa:'Allpa Farms', label:'Electricidad',
      cats:['egr_var','egr_fijo'], catProvisional:'egr_var' });
    expect(amb[0].meses).toEqual([
      { idx:iMay, mes:'May-26', valor:4444, porSemana:false },
      { idx:iJun, mes:'Jun-26', valor:150,  porSemana:true  },
    ]);
  });

  test('meses distintos pueden ir a categorías distintas', () => {
    const ov = {
      'Electricidad': { [iJun]: 777 },                       // sin resolver
      [claveLinea('egr_fijo','Electricidad')]: { [iMay]: 4444 }, // May-26 ya resuelto acá
    };
    // May-26: manda la categoría elegida; Jun-26 sigue provisional en egr_var
    expect(overridesDeLinea(ov, emp, 'egr_fijo','Electricidad')[iMay]).toBe(4444);
    expect(overridesDeLinea(ov, emp, 'egr_fijo','Electricidad')[iJun]).toBeUndefined();
    expect(overridesDeLinea(ov, emp, 'egr_var','Electricidad')[iJun]).toBe(777);
    const amb = overridesAmbiguos(ov, emp);
    expect(amb[0].meses.map(m => m.mes)).toEqual(['Jun-26']);   // May-26 ya no figura
  });

  test('un mes resuelto deja de leerse de la clave antigua aunque esta siga ahí', () => {
    // simula que el paso 2 (borrar la clave vieja) no alcanzó a guardarse
    const ov = {
      'Electricidad': { [iMay]: 4444 },
      [claveLinea('egr_fijo','Electricidad')]: { [iMay]: 4444 },
    };
    expect(overridesDeLinea(ov, emp, 'egr_var','Electricidad')).toBeUndefined();  // no se duplica
    expect(overridesDeLinea(ov, emp, 'egr_fijo','Electricidad')[iMay]).toBe(4444);
    const cons = buildEmpresasConOverrides({ X: emp }, { X: { _proyOverrides: ov } }, {}, {})['X'];
    expect(cons.sections.find(s=>s.cat==='egr_var').lines[0].proy[iMay]).toBe(5000);  // su valor propio
    expect(cons.sections.find(s=>s.cat==='egr_fijo').lines[0].proy[iMay]).toBe(4444);
  });

  test('el aviso nombra el criterio provisional y dice que no está confirmado', () => {
    const ov = { 'Electricidad': { [iMay]: 4444 } };
    const texto = avisoProvisional(overridesAmbiguos(ov, emp));
    expect(texto).toMatch(/SIN categoría asignada/);
    expect(texto).toMatch(/provisionalmente a Egresos Operacionales/);
    expect(texto).toMatch(/no confirmado/);
  });

  test('cat::label es único dentro de cada empresa del grupo', () => {
    Object.entries(empresas).forEach(([nombre, e]) => {
      expect(`${nombre}:${clavesDuplicadas(e).length}`).toBe(`${nombre}:0`);
    });
  });

  test('avisosDeEmpresa arma lo que viaja al Excel', () => {
    const realData = { X: { _proyOverrides: { 'Electricidad': { [iMay]: 4444 } } } };
    const av = avisosDeEmpresa(realData, { X: emp }, 'X');
    expect(av).toHaveLength(1);
    expect(av[0]).toMatch(/provisionalmente/);
    expect(avisosDeEmpresa({}, { X: emp }, 'X')).toHaveLength(0);
  });
});

describe('Excel: aviso de imputación provisional', () => {
  test('el libro lleva el aviso y la grilla NO se mueve (meses siguen en la fila 3)', () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const emp = empDuplicada();
    const aviso = avisoProvisional(overridesAmbiguos({ 'Electricidad': { [iM('May-26')]: 4444 } }, emp));
    const file = path.join(OUT_DIR, 'aviso.xlsx');
    exportarFlujoEmpresa({ emp, empName:'X', saldoIni:0, fileName:file, avisos:[aviso] });
    const wb = XLSX.readFile(file, { cellFormula:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    // los meses siguen en la fila 3 (si se movieran, se rompen lecturas y pruebas)
    const enFila3 = Object.keys(ws).filter(k=>/^[A-Z]+3$/.test(k)).map(k=>ws[k].v);
    expect(enFila3).toContain('May-26');
    // el aviso aparece en el subtítulo y como nota al pie
    const textos = Object.keys(ws).map(k=>ws[k]?.v).filter(v=>typeof v==='string');
    expect(textos.filter(t=>t.includes('provisionalmente')).length).toBeGreaterThanOrEqual(2);
  });
});

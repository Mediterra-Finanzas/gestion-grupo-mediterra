/* eslint-disable */
// src/anf/anfKpis.js
// 17 KPIs financieros derivados — calculados al aprobar el informe.

function round2(v) { return v != null && !isNaN(v) ? Math.round(v * 100) / 100 : null; }
function round3(v) { return v != null && !isNaN(v) ? Math.round(v * 1000) / 1000 : null; }

function clasificarSeccionEsf(codigo) {
  const parts = (codigo || '').split('.');
  const p1 = parts[0], p2 = parts[1];
  if (p1 === '1') return p2 === '01' ? 'Activo Corriente' : 'Activo No Corriente';
  if (p1 === '2') return p2 === '01' ? 'Pasivo Corriente' : 'Pasivo No Corriente';
  if (p1 === '3') return 'Patrimonio';
  return null;
}

function sumaEsf(esf, categorias) {
  const set = new Set(categorias);
  return esf.filter(c => set.has(c.categoria_ifrs || clasificarSeccionEsf(c.codigo))).reduce((a, c) => a + (c.saldo_neto || 0), 0);
}

function sumaEr(er, gruposEr, campo = 'real_ytd') {
  const set = new Set(gruposEr);
  return er.filter(c => set.has(c.grupo_er)).reduce((a, c) => a + (c[campo] || 0), 0);
}

export function calcularKpisDerivaos(esf, er) {
  const kpis = [];

  // ── Bloques ESF ────────────────────────────────────────────────────────
  const activoCte    = sumaEsf(esf, ['Activo Corriente']);
  const activoNoCte  = sumaEsf(esf, ['Activo No Corriente']);
  const totalActivos = activoCte + activoNoCte;

  const pasivoCte    = Math.abs(sumaEsf(esf, ['Pasivo Corriente']));
  const pasivoNoCte  = Math.abs(sumaEsf(esf, ['Pasivo No Corriente']));
  const totalPasivos = pasivoCte + pasivoNoCte;

  const patrimonioAbs = Math.abs(sumaEsf(esf, ['Patrimonio']));

  // ── Bloques ER — YTD ────────────────────────────────────────────────────
  const ingOp   = sumaEr(er, ['Ingreso Operacional']);
  const cosOp   = sumaEr(er, ['Costo Operacional']);
  const gasOp   = sumaEr(er, ['Gasto Operacional']);
  const ingNOp  = sumaEr(er, ['Ingreso No Operacional']);
  const gasNOp  = sumaEr(er, ['Gasto No Operacional']);
  const imp     = sumaEr(er, ['Impuesto']);

  const ingOpPpto   = sumaEr(er, ['Ingreso Operacional'], 'ppto_ytd');
  const ebitda      = ingOp - cosOp - gasOp;
  const resultadoNeto = ingOp - cosOp - gasOp + ingNOp - gasNOp - imp;

  // ── Bloques ER — Temporada ───────────────────────────────────────────────
  const ingOpT  = sumaEr(er, ['Ingreso Operacional'],    'real_temporada');
  const cosOpT  = sumaEr(er, ['Costo Operacional'],      'real_temporada');
  const gasOpT  = sumaEr(er, ['Gasto Operacional'],      'real_temporada');
  const ingNOpT = sumaEr(er, ['Ingreso No Operacional'], 'real_temporada');
  const gasNOpT = sumaEr(er, ['Gasto No Operacional'],   'real_temporada');
  const impT    = sumaEr(er, ['Impuesto'],               'real_temporada');
  const resultadoTemp = ingOpT - cosOpT - gasOpT + ingNOpT - gasNOpT - impT;

  // ── RENTABILIDAD ───────────────────────────────────────────────────────
  kpis.push({ clave: 'margen_bruto',
    valor: round2(ingOp !== 0 ? ((ingOp - cosOp) / ingOp) * 100 : null), unidad: '%' });

  kpis.push({ clave: 'margen_ebitda',
    valor: round2(ingOp !== 0 ? (ebitda / ingOp) * 100 : null), unidad: '%' });

  kpis.push({ clave: 'margen_neto',
    valor: round2(ingOp !== 0 ? (resultadoNeto / ingOp) * 100 : null), unidad: '%' });

  kpis.push({ clave: 'roe',
    valor: round2(patrimonioAbs !== 0 ? (resultadoNeto / patrimonioAbs) * 100 : null), unidad: '%' });

  kpis.push({ clave: 'roa',
    valor: round2(totalActivos !== 0 ? (resultadoNeto / totalActivos) * 100 : null), unidad: '%' });

  kpis.push({ clave: 'cumplimiento_ppto',
    valor: round2(ingOpPpto !== 0 ? (ingOp / ingOpPpto) * 100 : null), unidad: '%' });

  // ── LIQUIDEZ ───────────────────────────────────────────────────────────
  kpis.push({ clave: 'liquidez_corriente',
    valor: round3(pasivoCte !== 0 ? activoCte / pasivoCte : null), unidad: 'x' });

  kpis.push({ clave: 'capital_trabajo',
    valor: round2(activoCte - pasivoCte), unidad: 'moneda' });

  // ── ENDEUDAMIENTO ──────────────────────────────────────────────────────
  kpis.push({ clave: 'deuda_patrimonio',
    valor: round3(patrimonioAbs !== 0 ? totalPasivos / patrimonioAbs : null), unidad: 'x' });

  kpis.push({ clave: 'deuda_ebitda',
    valor: round3(ebitda !== 0 ? totalPasivos / Math.abs(ebitda) : null), unidad: 'x' });

  // ── BALANCE ────────────────────────────────────────────────────────────
  kpis.push({ clave: 'total_activos',      valor: round2(totalActivos),  unidad: 'moneda' });
  kpis.push({ clave: 'total_pasivos',      valor: round2(totalPasivos),  unidad: 'moneda' });
  kpis.push({ clave: 'total_patrimonio',   valor: round2(patrimonioAbs), unidad: 'moneda' });
  kpis.push({ clave: 'activos_corrientes', valor: round2(activoCte),     unidad: 'moneda' });
  kpis.push({ clave: 'pasivos_corrientes', valor: round2(pasivoCte),     unidad: 'moneda' });

  // ── RESULTADOS ─────────────────────────────────────────────────────────
  kpis.push({ clave: 'resultado_neto_ytd',  valor: round2(resultadoNeto), unidad: 'moneda' });
  kpis.push({ clave: 'resultado_temporada', valor: round2(resultadoTemp), unidad: 'moneda' });

  return kpis;
}

// ── Metadatos para UI ─────────────────────────────────────────────────────

export const KPI_GRUPOS = [
  {
    key: 'rentabilidad', label: 'Rentabilidad',
    claves: ['margen_bruto','margen_ebitda','margen_neto','roe','roa','cumplimiento_ppto'],
  },
  {
    key: 'liquidez', label: 'Liquidez',
    claves: ['liquidez_corriente','capital_trabajo'],
  },
  {
    key: 'endeudamiento', label: 'Endeudamiento',
    claves: ['deuda_patrimonio','deuda_ebitda'],
  },
  {
    key: 'balance', label: 'Balance',
    claves: ['total_activos','total_pasivos','total_patrimonio','activos_corrientes','pasivos_corrientes'],
  },
  {
    key: 'resultados', label: 'Resultados',
    claves: ['resultado_neto_ytd','resultado_temporada'],
  },
];

export const KPI_LABELS = {
  margen_bruto:        'Margen Bruto',
  margen_ebitda:       'Margen EBITDA',
  margen_neto:         'Margen Neto',
  roe:                 'ROE',
  roa:                 'ROA',
  cumplimiento_ppto:   'Cumpl. Presupuesto',
  liquidez_corriente:  'Liquidez Corriente',
  capital_trabajo:     'Capital de Trabajo',
  deuda_patrimonio:    'Deuda / Patrimonio',
  deuda_ebitda:        'Deuda / EBITDA',
  total_activos:       'Total Activos',
  total_pasivos:       'Total Pasivos',
  total_patrimonio:    'Total Patrimonio',
  activos_corrientes:  'Activos Corrientes',
  pasivos_corrientes:  'Pasivos Corrientes',
  resultado_neto_ytd:  'Resultado Neto YTD',
  resultado_temporada: 'Resultado Temporada',
};

export const KPI_TOOLTIPS = {
  margen_bruto:        '(Ingresos Op − Costos Op) / Ingresos Op × 100',
  margen_ebitda:       '(Ingresos − Costos − Gastos Op) / Ingresos Op × 100',
  margen_neto:         'Resultado Neto / Ingresos Op × 100',
  roe:                 'Resultado Neto / Patrimonio × 100',
  roa:                 'Resultado Neto / Total Activos × 100',
  cumplimiento_ppto:   'Ingresos reales YTD / Ingresos ppto YTD × 100',
  liquidez_corriente:  'Activo Corriente / Pasivo Corriente',
  capital_trabajo:     'Activo Corriente − Pasivo Corriente',
  deuda_patrimonio:    'Total Pasivos / Patrimonio',
  deuda_ebitda:        'Total Pasivos / EBITDA (no anualizado)',
  total_activos:       'Activo Corriente + Activo No Corriente',
  total_pasivos:       'Pasivo Corriente + Pasivo No Corriente',
  total_patrimonio:    'Patrimonio neto (valor absoluto)',
  activos_corrientes:  'Activos realizables en menos de 12 meses',
  pasivos_corrientes:  'Obligaciones vencibles en menos de 12 meses',
  resultado_neto_ytd:  'Resultado Neto acumulado año calendario (ene→mes)',
  resultado_temporada: 'Resultado Neto acumulado temporada agrícola (jul→mes)',
};

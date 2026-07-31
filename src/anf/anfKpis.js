/* eslint-disable */
// src/anf/anfKpis.js
// Cálculo de los 6 KPIs financieros derivados (Fase 3).
// Se llaman al momento de aprobar el informe.
// Todos los montos asumen la misma moneda (moneda funcional de la filial).

// ── Helpers de lookup en arrays ESF/ER ──────────────────────────────────────

// Suma saldo_neto de cuentas ESF que coincidan con las categorías IFRS dadas.
function sumaEsf(esf, categorias) {
  const set = new Set(categorias);
  return esf
    .filter(c => set.has(c.categoria_ifrs))
    .reduce((acc, c) => acc + (c.saldo_neto || 0), 0);
}

// Suma de un campo ER para cuentas que coincidan con grupo_er dado.
function sumaEr(er, gruposEr, campo = 'real_ytd') {
  const set = new Set(gruposEr);
  return er
    .filter(c => set.has(c.grupo_er))
    .reduce((acc, c) => acc + (c[campo] || 0), 0);
}

// ── Los 6 KPIs ───────────────────────────────────────────────────────────────

/**
 * Calcula los 6 KPIs financieros a partir de los datos del informe.
 *
 * @param {Object[]} esf       - Filas de anf_saldos_esf (con categoria_ifrs y saldo_neto)
 * @param {Object[]} er        - Filas de anf_movimientos_er (con grupo_er, real_ytd, ppto_ytd)
 * @param {Object}   informe   - Fila de anf_informes (para meta info)
 * @returns {Object[]}         - Array de { clave, valor, unidad } para insertar en anf_kpis_derivados
 *
 * Convenciones de signo:
 *   ESF Activos → saldo_neto positivo (ia > ip para activos).
 *   ESF Pasivos → saldo_neto negativo si se guarda como ia - ip. Aquí invertimos para operar.
 *   ER Ingresos → real_ytd positivo (ganancia > pérdida).
 *   ER Costos/Gastos → real_ytd positivo en el campo (la UI ya muestra con signo correcto).
 *
 * NOTA: Si el plan maestro no está configurado, grupo_er puede ser null → los KPIs darán 0.
 * Agregar categorías según el plan maestro real de cada empresa.
 */
export function calcularKpisDerivaos(esf, er) {
  const kpis = [];

  // ── 1. Margen EBITDA ────────────────────────────────────────────────────
  // EBITDA = Resultado Operacional + Depreciación/Amortización
  // Aproximación: (Ingresos Operacionales) - (Costos + Gastos Operacionales)
  // + D&A (si está clasificada como Gasto Operacional con nombre "Depreciación/Amortización")
  // En esta versión simplificada: EBITDA ≈ Resultado operacional (sin recuperar D&A aún).
  const ingresosOp = sumaEr(er, ['Ingreso Operacional']);
  const costosOp   = sumaEr(er, ['Costo Operacional']);
  const gastosOp   = sumaEr(er, ['Gasto Operacional']);
  const ebitdaAprox = ingresosOp - costosOp - gastosOp;
  const margenEbitda = ingresosOp !== 0
    ? (ebitdaAprox / ingresosOp) * 100
    : null;

  kpis.push({
    clave:  'margen_ebitda',
    valor:  margenEbitda != null ? Math.round(margenEbitda * 100) / 100 : null,
    unidad: '%',
  });

  // ── 2. Cumplimiento vs Presupuesto ──────────────────────────────────────
  // % de ingreso real YTD sobre presupuesto YTD de ingresos operacionales.
  const ingresosOpPpto = sumaEr(er, ['Ingreso Operacional'], 'ppto_ytd');
  const cumplimiento = ingresosOpPpto !== 0
    ? (ingresosOp / ingresosOpPpto) * 100
    : null;

  kpis.push({
    clave:  'cumplimiento_ppto',
    valor:  cumplimiento != null ? Math.round(cumplimiento * 100) / 100 : null,
    unidad: '%',
  });

  // ── 3. Liquidez Corriente ────────────────────────────────────────────────
  // Activo Corriente / Pasivo Corriente
  const activoCte  = sumaEsf(esf, ['Activo Corriente']);
  const pasivoCte  = Math.abs(sumaEsf(esf, ['Pasivo Corriente']));
  const liquidez   = pasivoCte !== 0 ? activoCte / pasivoCte : null;

  kpis.push({
    clave:  'liquidez_corriente',
    valor:  liquidez != null ? Math.round(liquidez * 1000) / 1000 : null,
    unidad: 'x',
  });

  // ── 4. Capital de Trabajo ────────────────────────────────────────────────
  // Activo Corriente - Pasivo Corriente (monto absoluto en moneda funcional)
  kpis.push({
    clave:  'capital_trabajo',
    valor:  Math.round((activoCte - pasivoCte) * 100) / 100,
    unidad: 'moneda',
  });

  // ── 5. Deuda Financiera / Patrimonio ─────────────────────────────────────
  // (Pasivo Corriente financiero + Pasivo No Corriente financiero) / Patrimonio
  // Aproximación: total pasivos / total patrimonio
  const pasivosTotal = Math.abs(sumaEsf(esf, ['Pasivo Corriente', 'Pasivo No Corriente']));
  const patrimonio   = sumaEsf(esf, ['Patrimonio']);
  const deudaPatr    = patrimonio !== 0 ? pasivosTotal / Math.abs(patrimonio) : null;

  kpis.push({
    clave:  'deuda_patrimonio',
    valor:  deudaPatr != null ? Math.round(deudaPatr * 1000) / 1000 : null,
    unidad: 'x',
  });

  // ── 6. Deuda Financiera / EBITDA ─────────────────────────────────────────
  // Para anualizar el EBITDA mensual: EBITDA_ytd / (mes / 12)
  // Requiere saber cuántos meses van → se pasa por parámetro si se necesita
  // En esta versión: usa EBITDA YTD tal cual (no anualiza; usuario lo interpreta).
  const deudaEbitda = ebitdaAprox !== 0 ? pasivosTotal / Math.abs(ebitdaAprox) : null;

  kpis.push({
    clave:  'deuda_ebitda',
    valor:  deudaEbitda != null ? Math.round(deudaEbitda * 1000) / 1000 : null,
    unidad: 'x',
  });

  return kpis;
}

// Nombres para display de cada KPI
export const KPI_LABELS = {
  margen_ebitda:      'Margen EBITDA',
  cumplimiento_ppto:  'Cumplimiento Ppto',
  liquidez_corriente: 'Liquidez Corriente',
  capital_trabajo:    'Capital de Trabajo',
  deuda_patrimonio:   'Deuda / Patrimonio',
  deuda_ebitda:       'Deuda / EBITDA',
};

export const KPI_TOOLTIPS = {
  margen_ebitda:      'EBITDA aprox. / Ingresos Operacionales × 100',
  cumplimiento_ppto:  'Ingresos reales YTD / Ingresos ppto YTD × 100',
  liquidez_corriente: 'Activo Corriente / Pasivo Corriente',
  capital_trabajo:    'Activo Corriente − Pasivo Corriente',
  deuda_patrimonio:   'Pasivos totales / Patrimonio',
  deuda_ebitda:       'Pasivos totales / EBITDA (no anualizado)',
};

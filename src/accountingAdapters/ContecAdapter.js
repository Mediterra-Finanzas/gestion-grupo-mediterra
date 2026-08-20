/* eslint-disable */
// =============================================================================
// ContecAdapter.js — OA-024-08
// Parsing y transformación de archivos nativos Contec para Allegria Foods (ALF)
// =============================================================================
// SCOPE: Parsing puro. Sin I/O de base de datos. Sin uploads. Sin Supabase.
// Recibe filas del worksheet (array-of-arrays desde xlsx-js-style o SheetJS).
// Retorna estructuras normalizadas listas para posting.
//
// EVIDENCIA AC-04 (OA-024-06):
//   Balance Foods.xlsx     — 366 filas, ESF acumulado, 10 columnas (A-J)
//   EERR Julio A.Foods     —  90 filas, ER período mensual, 9 columnas (A-I)
//   EERR Acumulado A.Foods — 175 filas, ER acumulado YTD, 9 columnas (A-I)
//
// NO IMPORTAR: Supabase, friskuHelpers, anfParser (evitar acoplamiento).
// El ContecAdapter es un módulo de transformación puro.
// =============================================================================


// =============================================================================
// CONSTANTES — Column indices (0-based, confirmados en AC-04)
// =============================================================================

// Balance (ESF) — 10 columnas
export const BALANCE_COL = Object.freeze({
  CODE:         0,  // A: Código de cuenta ("1.01.01.001") o grupo ("1.00.00.000")
  NAME:         1,  // B: Nombre de cuenta / grupo
  DEBE_YTD:     2,  // C: Movimientos Debe YTD (brutos acumulados — V2)
  HABER_YTD:    3,  // D: Movimientos Haber YTD (brutos acumulados — V2)
  SALDO_D:      4,  // E: Saldo deudor neto (columna intermedia)
  SALDO_A:      5,  // F: Saldo acreedor neto (columna intermedia)
  INV_ACTIVO:   6,  // G: Inventario Activo — saldo deudor final → debit_balance
  INV_PASIVO:   7,  // H: Inventario Pasivo — saldo acreedor final → credit_balance
  RES_PERDIDA:  8,  // I: Resultado Pérdida (solo cuentas ER; 0 en cuentas ESF)
  RES_GANANCIA: 9,  // J: Resultado Ganancia (solo cuentas ER; 0 en cuentas ESF)
});

// EERR Período / Acumulado — 9 columnas
export const EERR_COL = Object.freeze({
  NATURALEZA: 0,  // A: Naturaleza (INGRESOS / GASTOS DE ADM. Y VENTAS / …)
  CLASE:      1,  // B: Clase (INGRESOS POR VENTA / …) o marcador de subtotal
  SUBCLASE:   2,  // C: Sub-clase (VENTAS EXPORTACION / GASTOS DE PERSONAL / …)
  CODIGO:     3,  // D: Código de cuenta ("6.11.01.010")
  NOMBRE:     4,  // E: Nombre de cuenta ("SUELDOS Y SALARIOS")
  CC:         5,  // F: Centro de Costo ("ADMINISTRACION Y FINANZAS" / "SIN DESCRIPCION")
  REAL:       6,  // G: Monto real del período (o acumulado YTD)
  PPTO:       7,  // H: Presupuesto (0 si no hay cargado)
  VARIANZA:   8,  // I: Varianza = G − H
});

// Marcadores de filas de subtotal/cabecera en EERR (col B)
const EERR_SUBTOTAL_MARKERS = [
  'Total Sub Clase',
  'Total Clase',
  'Total Naturaleza',
  'RESULTADO FINAL',
];

// Tolerancia matemática para reconciliación (en unidad monetaria del source)
export const RECONCILIATION_TOLERANCE = 0.01;

// Tipos de reporte válidos
export const REPORT_TYPES = Object.freeze({
  BALANCE:         'balance',
  EERR_PERIODO:    'eerr_periodo',
  EERR_ACUMULADO:  'eerr_acumulado',
});


// =============================================================================
// HELPERS INTERNOS
// =============================================================================

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function toStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function isEerrSubtotalRow(row) {
  const clase = toStr(row[EERR_COL.CLASE]);
  if (!clase) return false;
  return EERR_SUBTOTAL_MARKERS.some(m => clase.startsWith(m));
}

function isBalanceGroupRow(row) {
  // Filas de grupo: código termina en .000 o está vacío
  const code = toStr(row[BALANCE_COL.CODE]);
  if (!code) return true;
  return /\.000$/.test(code);
}


// =============================================================================
// parseBalanceContec(rows, sourceCurrency) → BalanceSourceRow[]
// =============================================================================
// Parsea una exportación nativa del Balance (ESF) de Contec.
// Filtra filas de grupo/subtotal (código vacío o terminado en .000).
// Preserva cuentas ESF (1.xx / 2.xx / 3.xx) con valores en G/H.
// Preserva cuentas ER (4.xx+) con valores en I/J — los reporta con debit/credit = 0
// (correcto: el resultado de ER no se registra en ESF directamente).
//
// @param {(string|number|null)[][]} rows — Filas del worksheet (array-of-arrays)
// @param {string} sourceCurrency — ISO 4217 (ej. 'USD','CLP'). Tomado de
//   acc_entity_config.functional_currency. Obligatorio — el formato Contec no
//   incluye columna de moneda; la moneda es implícita de la configuración contable
//   de la entidad en Contec.
// @returns {BalanceSourceRow[]}
// =============================================================================
export function parseBalanceContec(rows, sourceCurrency) {
  if (!sourceCurrency || typeof sourceCurrency !== 'string' || sourceCurrency.length !== 3) {
    throw new Error(
      `ContecAdapter: sourceCurrency obligatorio para parseBalanceContec. ` +
      `Valor recibido: "${sourceCurrency}". ` +
      `Obtener de acc_entity_config.functional_currency para la entidad.`
    );
  }
  const result = [];

  rows.forEach((row, rowIdx) => {
    if (!row || row.length === 0) return;

    const code = toStr(row[BALANCE_COL.CODE]);
    const name = toStr(row[BALANCE_COL.NAME]);

    // Ignorar filas sin código de cuenta o de grupo
    if (!code) return;
    if (isBalanceGroupRow(row)) return;

    const debitBalance  = toNum(row[BALANCE_COL.INV_ACTIVO]);   // col G
    const creditBalance = toNum(row[BALANCE_COL.INV_PASIVO]);   // col H
    const ytdDebit      = toNum(row[BALANCE_COL.DEBE_YTD]);     // col C (V2)
    const ytdCredit     = toNum(row[BALANCE_COL.HABER_YTD]);    // col D (V2)

    // Ignorar filas completamente vacías (cuentas sin actividad)
    if (debitBalance === 0 && creditBalance === 0 && ytdDebit === 0 && ytdCredit === 0) return;

    result.push({
      source_row_ref:      `row:${rowIdx + 1}`,
      source_report_type:  REPORT_TYPES.BALANCE,
      source_account_code: code,
      source_account_name: name,
      cost_center_code:    null,
      nature:              null,
      class:               null,
      subclass:            null,
      actual_amount:       null,
      budget_amount:       null,
      variance_amount:     null,
      ytd_debit:           ytdDebit  || null,
      ytd_credit:          ytdCredit || null,
      debit_balance:       debitBalance  || null,
      credit_balance:      creditBalance || null,
      source_currency:     sourceCurrency,
    });
  });

  return result;
}


// =============================================================================
// parseEerrContec(rows, sourceReportType, sourceCurrency) → EerrSourceRow[]
// =============================================================================
// Parsea EERR-Período o EERR-Acumulado de Contec.
// Retorna UNA FILA POR (account_code × cost_center) — sin agregación.
// Filtra filas de subtotal (B contiene "Total Sub Clase", "Total Clase", etc.)
// y filas sin código de cuenta (D vacío).
//
// @param {(string|number|null)[][]} rows
// @param {'eerr_periodo'|'eerr_acumulado'} sourceReportType
// @param {string} sourceCurrency — ISO 4217 (ej. 'USD','CLP'). Tomado de
//   acc_entity_config.functional_currency. Obligatorio — el formato Contec no
//   incluye columna de moneda.
// @returns {EerrSourceRow[]}
// =============================================================================
export function parseEerrContec(rows, sourceReportType = REPORT_TYPES.EERR_PERIODO, sourceCurrency) {
  if (sourceReportType !== REPORT_TYPES.EERR_PERIODO && sourceReportType !== REPORT_TYPES.EERR_ACUMULADO) {
    throw new Error(`ContecAdapter: sourceReportType inválido: "${sourceReportType}"`);
  }
  if (!sourceCurrency || typeof sourceCurrency !== 'string' || sourceCurrency.length !== 3) {
    throw new Error(
      `ContecAdapter: sourceCurrency obligatorio para parseEerrContec. ` +
      `Valor recibido: "${sourceCurrency}". ` +
      `Obtener de acc_entity_config.functional_currency para la entidad.`
    );
  }

  const result = [];

  rows.forEach((row, rowIdx) => {
    if (!row || row.length === 0) return;

    // Filtrar subtotales
    if (isEerrSubtotalRow(row)) return;

    const code = toStr(row[EERR_COL.CODIGO]);
    if (!code) return; // fila sin código = cabecera o subtotal no detectado

    const realAmount = toNum(row[EERR_COL.REAL]);
    const pptoAmount = toNum(row[EERR_COL.PPTO]);

    // Preservar incluso si real = 0 (puede tener solo presupuesto cargado)
    // Solo ignorar si real = 0 Y ppto = 0 (sin información útil)
    if (realAmount === 0 && pptoAmount === 0) return;

    result.push({
      source_row_ref:      `row:${rowIdx + 1}`,
      source_report_type:  sourceReportType,
      source_account_code: code,
      source_account_name: toStr(row[EERR_COL.NOMBRE]),
      cost_center_code:    toStr(row[EERR_COL.CC]),
      nature:              toStr(row[EERR_COL.NATURALEZA]),
      class:               toStr(row[EERR_COL.CLASE]),
      subclass:            toStr(row[EERR_COL.SUBCLASE]),
      actual_amount:       realAmount,
      budget_amount:       pptoAmount,
      variance_amount:     toNum(row[EERR_COL.VARIANZA]),
      ytd_debit:           null,
      ytd_credit:          null,
      debit_balance:       null,
      credit_balance:      null,
      source_currency:     sourceCurrency,
    });
  });

  return result;
}


// =============================================================================
// aggregateEerrToCanonical(sourceRows) → CanonicalBalanceRow[]
// =============================================================================
// Agrega filas EERR por source_account_code (múltiples CC → una fila canónica).
// Para posting a acc_account_balance: balance_type = 'actual'.
// El presupuesto NO se incluye en la salida canónica (scope pln_*).
//
// Invariante garantizado:
//   SUM(sourceRow.actual_amount WHERE account_code = X)
//   = canonical.net_balance WHERE account_code = X
//
// @param {EerrSourceRow[]} sourceRows
// @returns {CanonicalBalanceRow[]}
// =============================================================================
export function aggregateEerrToCanonical(sourceRows) {
  const map = new Map(); // account_code → aggregated data

  sourceRows.forEach(row => {
    const key = row.source_account_code;
    if (!map.has(key)) {
      map.set(key, {
        account_code:    key,
        account_name:    row.source_account_name,
        nature:          row.nature,
        source_sum:      0,
        source_currency: row.source_currency,
      });
    }
    const entry = map.get(key);
    entry.source_sum += (row.actual_amount ?? 0);
  });

  const result = [];
  map.forEach((entry) => {
    // Cuentas de gastos/egresos: naturaleza positiva → debit (deudor)
    // Cuentas de ingresos: naturaleza positiva → credit (acreedor)
    // En EERR Contec los gastos son positivos y los ingresos positivos también.
    // La distinción débito/crédito se resuelve por naturaleza de la cuenta.
    // En V1: net_balance = sum directo. El Adapter no infiere débito/crédito
    // del EERR sin el mapping. El acc_chart_mapping define el tipo de cuenta.
    const sum = Math.round(entry.source_sum * 100) / 100; // redondear a 2 decimales
    result.push({
      account_code:    entry.account_code,
      account_name:    entry.account_name,
      debit_balance:   sum >= 0 ? sum : 0,
      credit_balance:  sum < 0  ? Math.abs(sum) : 0,
      net_balance:     sum,
      balance_type:    'actual',
      source_currency: entry.source_currency,
    });
  });

  return result;
}


// =============================================================================
// aggregateBalanceToCanonical(sourceRows) → CanonicalBalanceRow[]
// =============================================================================
// Transforma filas de Balance (ESF) a formato canónico para acc_account_balance.
// El Balance de Contec ya trae un saldo por cuenta (sin múltiples CC).
// Las cuentas ESF: debit_balance = col G (inv_activo), credit_balance = col H (inv_pasivo).
//
// @param {BalanceSourceRow[]} sourceRows
// @returns {CanonicalBalanceRow[]}
// =============================================================================
export function aggregateBalanceToCanonical(sourceRows) {
  return sourceRows.map(row => {
    const debit  = row.debit_balance  ?? 0;
    const credit = row.credit_balance ?? 0;
    return {
      account_code:    row.source_account_code,
      account_name:    row.source_account_name,
      debit_balance:   debit,
      credit_balance:  credit,
      net_balance:     Math.round((debit - credit) * 100) / 100,
      balance_type:    'actual',
      source_currency: row.source_currency,
    };
  });
}


// =============================================================================
// validateAggregateInvariant(sourceRows, canonicalRows) → void | throws
// =============================================================================
// Verifica que SUM(actual_amount) por account_code en source
// = net_balance en canónico, dentro de RECONCILIATION_TOLERANCE.
// Aplica a EERR; para Balance el invariante es trivial (1:1).
// Lanza Error con detalle si hay discrepancia fuera de tolerancia.
//
// @param {EerrSourceRow[]}        sourceRows
// @param {CanonicalBalanceRow[]}  canonicalRows
// @throws {Error} si alguna cuenta tiene discrepancia > RECONCILIATION_TOLERANCE
// =============================================================================
export function validateAggregateInvariant(sourceRows, canonicalRows) {
  // Calcular sumas por account_code desde source
  const sourceSums = new Map();
  sourceRows.forEach(row => {
    const key = row.source_account_code;
    sourceSums.set(key, (sourceSums.get(key) ?? 0) + (row.actual_amount ?? 0));
  });

  // Indexar canónico por account_code
  const canonicalMap = new Map(canonicalRows.map(r => [r.account_code, r.net_balance]));

  const violations = [];
  sourceSums.forEach((sum, code) => {
    const canonical = canonicalMap.get(code) ?? 0;
    const diff = Math.abs(Math.round((sum - canonical) * 100) / 100);
    if (diff > RECONCILIATION_TOLERANCE) {
      violations.push({ code, sum_source: sum, canonical, diff });
    }
  });

  if (violations.length > 0) {
    const detail = violations.map(v =>
      `  ${v.code}: source_sum=${v.sum_source} canonical=${v.canonical} diff=${v.diff}`
    ).join('\n');
    throw new Error(
      `ContecAdapter INVARIANT VIOLATION: ${violations.length} cuenta(s) fuera de tolerancia (${RECONCILIATION_TOLERANCE}):\n${detail}`
    );
  }
}


// =============================================================================
// deriveMonthlyFromYtd(currentRows, priorRows, opts) → EerrSourceRow[]
// =============================================================================
// Deriva movimientos mensuales del período N restando el YTD del período N-1.
// SOLO para sourceReportType = 'eerr_acumulado'.
// SOLO para períodos consecutivos del mismo ejercicio fiscal.
// Para enero (no hay prior del mismo ejercicio): actual_amount = YTD enero directo.
//
// @param {EerrSourceRow[]} currentRows — EERR acumulado del período N
// @param {EerrSourceRow[]|null} priorRows — EERR acumulado del período N-1 (null = enero)
// @param {Object} opts
// @param {boolean} opts.isJanuary — true si el período corriente es enero (no hay prior)
// @param {number}  opts.currentFiscalYear — año fiscal del período actual (anti-crossing)
// @param {number}  opts.priorFiscalYear   — año fiscal del período prior (anti-crossing)
// @returns {EerrSourceRow[]} — rows con actual_amount derivado y derived_from_ytd=true
// =============================================================================
export function deriveMonthlyFromYtd(currentRows, priorRows, opts = {}) {
  const { isJanuary = false, currentFiscalYear, priorFiscalYear } = opts;

  // Guard: no derivar crossing fiscal year
  if (!isJanuary && currentFiscalYear && priorFiscalYear && currentFiscalYear !== priorFiscalYear) {
    throw new Error(
      `ContecAdapter: No se puede derivar mensual cruzando año fiscal (${priorFiscalYear} → ${currentFiscalYear}). ` +
      `Para el primer período del ejercicio usar isJanuary=true o proveer prior del mismo año.`
    );
  }

  // Para enero: los montos YTD son el monto del período
  if (isJanuary || !priorRows || priorRows.length === 0) {
    return currentRows.map(row => ({
      ...row,
      derived_from_ytd: true,
      prior_ytd_amount: 0,
    }));
  }

  // Indexar prior por (account_code, cost_center_code) — clave compuesta
  const priorMap = new Map();
  priorRows.forEach(row => {
    const key = `${row.source_account_code}||${row.cost_center_code ?? ''}`;
    priorMap.set(key, (priorMap.get(key) ?? 0) + (row.actual_amount ?? 0));
  });

  return currentRows.map(row => {
    const key = `${row.source_account_code}||${row.cost_center_code ?? ''}`;
    const priorAmount = priorMap.get(key) ?? 0;
    const derivedAmount = Math.round(((row.actual_amount ?? 0) - priorAmount) * 100) / 100;
    return {
      ...row,
      actual_amount:    derivedAmount,
      derived_from_ytd: true,
      prior_ytd_amount: priorAmount,
    };
  });
}


// =============================================================================
// detectReportType(rows) → 'balance'|'eerr_periodo'|'eerr_acumulado'|null
// =============================================================================
// Detecta el tipo de reporte por estructura de columnas, no por nombre del archivo.
// Heurística:
//   - Si col A (idx 0) contiene valores como "INGRESOS" / "GASTOS" → EERR
//   - Si col A tiene códigos tipo "x.xx.xx.xxx" → Balance
//   - Retorna null si no se puede determinar con certeza
//
// @param {(string|number|null)[][]} rows
// @returns {'balance'|'eerr_periodo'|'eerr_acumulado'|null}
// =============================================================================
export function detectReportType(rows) {
  const EERR_NATURALEZAS = ['INGRESOS', 'GASTOS', 'EGRESOS'];
  const ACCOUNT_CODE_RE = /^\d+\.\d+\.\d+\.\d+$/;
  const GROUP_CODE_RE = /^\d+\.0+\.0+\.0+$/;

  let eerrSignals = 0;
  let balanceSignals = 0;

  const sample = rows.slice(0, 30);
  sample.forEach(row => {
    if (!row || row.length === 0) return;
    const colA = toStr(row[0]);
    if (!colA) return;

    if (EERR_NATURALEZAS.some(n => colA.toUpperCase().startsWith(n))) {
      eerrSignals++;
    }
    if (ACCOUNT_CODE_RE.test(colA) || GROUP_CODE_RE.test(colA)) {
      balanceSignals++;
    }
  });

  if (eerrSignals > balanceSignals) return REPORT_TYPES.EERR_PERIODO; // default EERR → eerr_periodo
  if (balanceSignals > 0)          return REPORT_TYPES.BALANCE;
  return null;
}


// =============================================================================
// buildIssues(sourceRows, canonicalRows, mappingFn) → BatchIssue[]
// =============================================================================
// Genera BatchIssue[] para cuentas sin mapping válido en acc_chart_mapping.
// mappingFn: (account_code) → boolean (true si existe mapping)
// Retorna issues con severity='ERROR' para cuentas con saldo != 0 sin mapping.
//
// @param {CanonicalBalanceRow[]} canonicalRows
// @param {(string) => boolean} mappingFn
// @returns {BatchIssueSpec[]}
// =============================================================================
export function buildMappingIssues(canonicalRows, mappingFn) {
  const issues = [];
  canonicalRows.forEach(row => {
    if (Math.abs(row.net_balance) < RECONCILIATION_TOLERANCE) return; // saldo cero → no issue
    if (!mappingFn(row.account_code)) {
      issues.push({
        severity:            'ERROR',
        issue_code:          'SRC_ACCOUNT_UNMAPPED',
        source_record_ref:   `account:${row.account_code}`,
        field_name:          'account_code',
        value_found:         row.account_code,
        message:             `Cuenta ${row.account_code} (${row.account_name ?? ''}) tiene saldo ${row.net_balance} sin mapping a acc_chart_mapping.`,
        suggested_resolution: `Agregar mapping para cuenta ${row.account_code} en acc_chart_mapping para esta entidad.`,
      });
    }
  });
  return issues;
}


// =============================================================================
// EXPORTED TYPE DOCUMENTATION (JSDoc — no TypeScript)
// =============================================================================

/**
 * @typedef {Object} BalanceSourceRow
 * @property {string}  source_row_ref
 * @property {'balance'} source_report_type
 * @property {string}  source_account_code
 * @property {string|null} source_account_name
 * @property {null}    cost_center_code
 * @property {null}    nature
 * @property {null}    class
 * @property {null}    subclass
 * @property {null}    actual_amount
 * @property {null}    budget_amount
 * @property {null}    variance_amount
 * @property {number|null} ytd_debit
 * @property {number|null} ytd_credit
 * @property {number|null} debit_balance
 * @property {number|null} credit_balance
 * @property {string}  source_currency
 */

/**
 * @typedef {Object} EerrSourceRow
 * @property {string}  source_row_ref
 * @property {'eerr_periodo'|'eerr_acumulado'} source_report_type
 * @property {string}  source_account_code
 * @property {string|null} source_account_name
 * @property {string|null} cost_center_code
 * @property {string|null} nature
 * @property {string|null} class
 * @property {string|null} subclass
 * @property {number}  actual_amount
 * @property {number}  budget_amount
 * @property {number}  variance_amount
 * @property {null}    ytd_debit
 * @property {null}    ytd_credit
 * @property {null}    debit_balance
 * @property {null}    credit_balance
 * @property {string}  source_currency
 * @property {boolean} [derived_from_ytd]
 * @property {number}  [prior_ytd_amount]
 */

/**
 * @typedef {Object} CanonicalBalanceRow
 * @property {string}  account_code
 * @property {string|null} account_name
 * @property {number}  debit_balance
 * @property {number}  credit_balance
 * @property {number}  net_balance
 * @property {'actual'} balance_type
 * @property {string}  source_currency
 */

/**
 * @typedef {Object} BatchIssueSpec
 * @property {'FATAL'|'ERROR'|'WARNING'|'INFO'} severity
 * @property {string}  issue_code
 * @property {string}  source_record_ref
 * @property {string}  field_name
 * @property {string}  value_found
 * @property {string}  message
 * @property {string}  suggested_resolution
 */

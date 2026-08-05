/* eslint-disable */
// src/anf/anfParser.js
// Parser de archivos Excel multi-hoja para Análisis Financiero.
//
// Para agregar una empresa nueva con sistema contec o megasystem:
//   → solo INSERT en anf_filiales. Este archivo NO cambia.
// Para agregar un sistema contable nuevo (ej: SAP, Softland):
//   → agregar parser propio + case en parsearInformeANF().

import * as XLSX from 'xlsx-js-style';

// ── Constantes ───────────────────────────────────────────────────────────────

const MESES_ABR = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
                       'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ── Utilidades ───────────────────────────────────────────────────────────────

// Serial Excel → mes (1-12). Aplica corrección al bug del año 1900 de Excel.
function serialToMes(serial) {
  if (!serial || typeof serial !== 'number' || serial < 1) return null;
  const ms = (serial - 25569) * 86400000;
  return new Date(ms).getUTCMonth() + 1;
}

// Busca una hoja por regex (case-insensitive). Si hay varios matches devuelve el más corto.
function findSheet(wb, re) {
  const matches = wb.SheetNames.filter(n => re.test(n));
  if (!matches.length) return null;
  matches.sort((a, b) => a.length - b.length);
  return wb.Sheets[matches[0]];
}

// Busca la hoja de balance comparativo año anterior: "BALANCE JUN 2025", "BALANCE JUN 25".
function findBalanceT1(wb, mes, anio) {
  const anioT1 = anio - 1;
  const abr = MESES_ABR[mes].toUpperCase();
  const short = String(anioT1).slice(2);
  const re1 = new RegExp(`^BALANCE\\s+${abr}\\s+${anioT1}\\b`, 'i');
  const re2 = new RegExp(`^BALANCE\\s+${abr}\\s+${short}\\b`, 'i');
  return findSheet(wb, re1) || findSheet(wb, re2);
}

// Busca la hoja EERR TEMP de la temporada vigente.
// mes<=6 anio=2026 → temporada 25-26 → busca "EERR TEMP 25-26" o "EERR MENSUAL TEMP 25-26".
// mes>=7 anio=2026 → temporada 26-27 → busca "EERR TEMP 26-27".
function findEerrTemp(wb, mes, anio) {
  const [a, b] = mes >= 7 ? [anio, anio + 1] : [anio - 1, anio];
  const sa = String(a).slice(2), sb = String(b).slice(2);
  return (
    findSheet(wb, new RegExp(`EERR\\s+(MENSUAL\\s+)?TEMP\\s+${sa}-${sb}`, 'i')) ||
    findSheet(wb, new RegExp(`EERR\\s+(MENSUAL\\s+)?TEMP\\s+${a}-${b}`, 'i')) ||
    findSheet(wb, /EERR\s+(MENSUAL\s+)?TEMP/i)  // fallback genérico
  );
}

// Devuelve los month-keys de la temporada que ya han transcurrido hasta `mes`.
// mes=6 (Jun) → [7,8,9,10,11,12,1,2,3,4,5,6] (temporada completa).
// mes=9 (Sep) → [7,8,9] (inicio de nueva temporada).
function mesesTemporada(mes) {
  if (mes >= 7) return Array.from({ length: mes - 6 }, (_, i) => String(i + 7));
  return [
    ...Array.from({ length: 6 }, (_, i) => String(i + 7)),  // 7..12
    ...Array.from({ length: mes }, (_, i) => String(i + 1)), // 1..mes
  ];
}

// Filtra filas de título/jerarquía según el sistema.
// Contec: códigos terminados en .000 son grupos.
// Megasystem: códigos de 7 dígitos son detalle; menos de 7 son grupos.
function esCuentaDetalle(codigo, sistema) {
  if (!codigo || !/^\d/.test(codigo)) return false;
  // Contec: debe tener puntos (1.01.01.001) y no terminar en .000 (grupos)
  if (sistema === 'contec') return codigo.includes('.') && !/\.000$/.test(codigo);
  if (sistema === 'megasystem') return codigo.length >= 7;
  return true;
}

// ── Parser BALANCE Contec ────────────────────────────────────────────────────
// Cols relevantes: [0]=codigo [1]=nombre [6]=ACTIVOS(ia) [7]=PASIVOS(ip)
//                  [8]=PERDIDAS(rp) [9]=GANANCIAS(rg)
// Cabeceras ocupan las primeras filas; el filtro de código vacío las salta.

function parseBalanceContec(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = [];
  for (const row of rows) {
    const codigo = row[0] != null ? String(row[0]).trim() : '';
    if (!esCuentaDetalle(codigo, 'contec')) continue;
    out.push({
      codigo,
      nombre: row[1] != null ? String(row[1]).trim() : '',
      inventario_activo:  Number(row[6]) || 0,
      inventario_pasivo:  Number(row[7]) || 0,
      resultado_perdida:  Number(row[8]) || 0,
      resultado_ganancia: Number(row[9]) || 0,
      sistema: 'contec',
    });
  }
  return out;
}

// ── Parser BALANCE Megasystem ────────────────────────────────────────────────
// Cols: [0]=codigo [1]=nombre [2]=DEBITO [3]=CREDITOS [4]=TOTAL SALDO (extra!)
//       [5]=DEUDOR [6]=ACREEDOR [7]=ACTIVOS(ia) [8]=PASIVOS(ip) [9]=PERDIDAS [10]=GANANCIAS

function parseBalanceMegasystem(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = [];
  for (const row of rows) {
    const codigo = row[0] != null ? String(row[0]).trim() : '';
    if (!esCuentaDetalle(codigo, 'megasystem')) continue;
    out.push({
      codigo,
      nombre: row[1] != null ? String(row[1]).trim() : '',
      inventario_activo:  Number(row[7]) || 0,
      inventario_pasivo:  Number(row[8]) || 0,
      resultado_perdida:  Number(row[9]) || 0,
      resultado_ganancia: Number(row[10]) || 0,
      sistema: 'megasystem',
    });
  }
  return out;
}

// ── Parser EERR TEMP (ambos sistemas) ────────────────────────────────────────
// Layout: fila con seriales Excel en col 4+ indica inicio de cabecera de fechas.
// En esa fila: cols 4,6,8,... = Real; 5,7,9,... = Ppto (pares por mes).
// Datos: col 1 = código, col 2 = nombre, cols 4+ = valores.
//
// Devuelve Map<codigo, { nombre, desglose: {"7":{real,ppto}, "8":{...}, ...} }>

function parseEerrTemp(ws, sistema) {
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Detectar fila de fechas (busca primera fila con serial Excel en col[4])
  let dateRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (typeof rows[i][4] === 'number' && rows[i][4] > 40000) {
      dateRowIdx = i;
      break;
    }
  }
  if (dateRowIdx < 0) return new Map();

  const dateRow = rows[dateRowIdx];
  const dataStart = dateRowIdx + 2; // saltar fila de fechas + fila "Real/Presupuesto"

  // Mapa col → { mes, tipo }
  // La fila de fechas tiene seriales solo en columnas "Real"; la col+1 es "Presupuesto" (null).
  const colInfo = {};
  for (let col = 4; col < dateRow.length; col++) {
    const mes = serialToMes(dateRow[col]);
    if (!mes) continue;
    colInfo[col]     = { mes, tipo: 'real' };
    colInfo[col + 1] = { mes, tipo: 'ppto' }; // columna inmediata = Presupuesto
  }

  const mapa = new Map();
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    // Código está en col 1 (Contec) o col 0 (algunos Megasystem)
    const codigoRaw = row[1] ?? row[0];
    if (codigoRaw == null) continue;
    const codigo = String(codigoRaw).trim();
    if (!esCuentaDetalle(codigo, sistema)) continue;

    const nombre = (row[2] ?? row[1]) != null ? String(row[2] ?? row[1]).trim() : '';

    if (!mapa.has(codigo)) mapa.set(codigo, { nombre, desglose: {} });
    const entry = mapa.get(codigo);

    for (const [colStr, info] of Object.entries(colInfo)) {
      const val = Number(row[Number(colStr)]) || 0;
      const key = String(info.mes);
      if (!entry.desglose[key]) entry.desglose[key] = { real: 0, ppto: 0 };
      entry.desglose[key][info.tipo] = (entry.desglose[key][info.tipo] || 0) + val;
    }
  }
  return mapa;
}

// ── Parser EERR MENSUAL Contec ────────────────────────────────────────────────
// Igual que EERR TEMP pero solo Real (una columna por mes, sin Ppto).
// Devuelve Map<codigo, { nombre, desglose: {"1":{real}, ..., "12":{real}} }>

function parseEerrMensualContec(ws) {
  if (!ws) return new Map();
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  let dateRowIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (typeof rows[i][4] === 'number' && rows[i][4] > 40000) { dateRowIdx = i; break; }
  }
  if (dateRowIdx < 0) return new Map();

  const dateRow = rows[dateRowIdx];
  const dataStart = dateRowIdx + 2;
  const colMes = {};
  for (let col = 4; col < dateRow.length; col++) {
    const mes = serialToMes(dateRow[col]);
    if (mes) colMes[col] = mes;
  }

  const mapa = new Map();
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const codigoRaw = row[1] ?? row[0];
    if (codigoRaw == null) continue;
    const codigo = String(codigoRaw).trim();
    if (!esCuentaDetalle(codigo, 'contec')) continue;

    const nombre = row[2] != null ? String(row[2]).trim() : '';
    if (!mapa.has(codigo)) mapa.set(codigo, { nombre, desglose: {} });
    const entry = mapa.get(codigo);

    for (const [colStr, mes] of Object.entries(colMes)) {
      const val = Number(row[Number(colStr)]) || 0;
      const key = String(mes);
      if (!entry.desglose[key]) entry.desglose[key] = { real: 0 };
      entry.desglose[key].real = (entry.desglose[key].real || 0) + val;
    }
  }
  return mapa;
}

// ── Parser sheets "EERR <MES> <AÑO>" Megasystem ──────────────────────────────
// Estas hojas tienen primera fila como header con nombres de columna:
// cuenta | name_1 | NombreGrupo | total | correlativogrupo | mes | anho | tipo | clasif | ...
// Devuelve array de movimientos crudos.

function parseEerrMesMegasystem(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  return rows
    .filter(r => r.cuenta != null)
    .map(r => ({
      codigo: String(r.cuenta).trim(),
      nombre: String(r.name_1 || r.name_2 || '').trim(),
      total:  Number(r.total) || 0,
      mes:    Number(r.mes),
    }));
}

// ── Parser hoja INFORME (narrativas, principalmente Contec) ──────────────────
// Columnas: ITEM | VAR REAL VS PPTO | texto
// Devuelve [{ codigo, texto }]

function parseInforme(ws) {
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  const out = [];
  for (const row of rows) {
    // Layout Contec: col A vacía | col B = ITEM | col C = VAR% | col D vacía | col E = texto
    const codigo = row[1] != null ? String(row[1]).trim() : '';
    const texto  = row[4] != null ? String(row[4]).trim() : '';
    if (!codigo || !texto) continue;
    out.push({ codigo, texto });
  }
  return out;
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Parsea el archivo Excel de cierre mensual.
 *
 * @param {File}   file   - Archivo xlsx subido por el usuario
 * @param {Object} filial - Fila de anf_filiales { codigo, nombre, sistema, moneda }
 * @param {number} anio   - Año del cierre (4 dígitos)
 * @param {number} mes    - Mes del cierre (1-12)
 * @returns {Promise<ParseResult>}
 *
 * ParseResult = {
 *   esf            : cuenta[]      — balance mes actual
 *   esf_t1         : cuenta[]      — balance mismo mes año anterior
 *   er_temp        : Map           — EERR TEMP (Real+Ppto temporada)
 *   er_mensual     : Map           — EERR MENSUAL (Real año calendario)
 *   narrativas     : {codigo,texto}[]
 *   advertencias   : string[]
 * }
 */
export async function parsearInformeANF(file, filial, anio, mes) {
  if (!filial || filial.sistema === 'tbd') {
    throw new Error(
      `La empresa "${filial?.nombre || '?'}" aún no tiene parser configurado (sistema = TBD). ` +
      `Actualiza el campo "sistema" en anf_filiales para habilitar el procesamiento.`
    );
  }

  const sistema = filial.sistema; // 'contec' | 'megasystem'
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const advertencias = [];

  // DIAGNÓSTICO: log de hojas disponibles (revisar en DevTools → Console)
  console.log('[ANF Parser] Hojas en el Excel:', wb.SheetNames);
  console.log('[ANF Parser] Sistema:', sistema, '| Empresa:', filial.nombre, '| Mes:', mes, '| Año:', anio);

  // DIAGNÓSTICO COLUMNAS (solo Megasystem)
  if (sistema === 'megasystem') {
    const _wsBal = findSheet(wb, /^BALANCE$/i);
    if (_wsBal) {
      const _rowsBal = XLSX.utils.sheet_to_json(_wsBal, { header: 1, defval: null });
      console.log('[ANF Parser] BALANCE filas 0-8:', JSON.stringify(_rowsBal.slice(0, 9)));
      const _primeraDato = _rowsBal.find(r => r[0] != null && String(r[0]).trim().length >= 5 && !isNaN(Number(String(r[0]).trim())));
      console.log('[ANF Parser] BALANCE primera fila con código numérico:', JSON.stringify(_primeraDato));
    }
    // Buscar hoja EERR del año actual
    const _eerrMesNomAnio = wb.SheetNames.find(n => {
      const _m = n.match(/^EERR\s+\w+\s+(\d{4})$/i);
      return _m && Number(_m[1]) === anio;
    });
    if (_eerrMesNomAnio) {
      const _wsEerr = wb.Sheets[_eerrMesNomAnio];
      const _rowsEerr = XLSX.utils.sheet_to_json(_wsEerr, { defval: null });
      console.log('[ANF Parser] EERR hoja año actual:', _eerrMesNomAnio, '| columnas:', Object.keys(_rowsEerr[0] || {}));
      const _conCodigo = _rowsEerr.filter(r => r.cuenta != null && String(r.cuenta).trim().length >= 5);
      console.log('[ANF Parser] EERR filas con código (primeras 4):', JSON.stringify(_conCodigo.slice(0, 4)));
      console.log('[ANF Parser] EERR total filas con código:', _conCodigo.length);
    } else {
      console.log('[ANF Parser] EERR: no se encontraron hojas del año', anio);
    }
  }

  // 1. BALANCE actual (requerido)
  const wsBalance = findSheet(wb, /^BALANCE$/i);
  if (!wsBalance) {
    throw new Error(
      'Hoja "BALANCE" no encontrada. Verifica que sea un archivo de cierre EEFF y no un parcial.'
    );
  }
  const esf = sistema === 'contec'
    ? parseBalanceContec(wsBalance)
    : parseBalanceMegasystem(wsBalance);

  if (esf.length === 0) {
    advertencias.push('La hoja BALANCE no generó cuentas. Revisa que el archivo corresponda al sistema configurado para esta empresa.');
  }

  // 2. BALANCE comparativo año anterior (opcional)
  const wsT1 = findBalanceT1(wb, mes, anio);
  let esf_t1 = [];
  if (!wsT1) {
    advertencias.push(
      `Hoja de balance comparativo no encontrada (esperado: "BALANCE ${MESES_ABR[mes].toUpperCase()} ${anio - 1}"). ` +
      `Las variaciones vs año anterior quedarán en blanco hasta cargarlo.`
    );
  } else {
    esf_t1 = sistema === 'contec'
      ? parseBalanceContec(wsT1)
      : parseBalanceMegasystem(wsT1);
  }

  // 3. EERR TEMP — temporada actual con Real + Ppto (opcional pero importante)
  const wsTemp = findEerrTemp(wb, mes, anio);
  let er_temp = new Map();
  if (!wsTemp) {
    advertencias.push(
      `Hoja EERR TEMP de la temporada no encontrada. ` +
      `El presupuesto y análisis de temporada quedarán vacíos.`
    );
  } else {
    er_temp = parseEerrTemp(wsTemp, sistema);
  }

  // 4. EERR MENSUAL — año calendario (opcional)
  let er_mensual = new Map();
  if (sistema === 'contec') {
    // Contec: hoja "EERR MENSUAL" con todas las columnas del año
    const wsMensual = findSheet(wb, /^EERR\s+MENSUAL$/i);
    if (wsMensual) {
      er_mensual = parseEerrMensualContec(wsMensual);
    } else {
      advertencias.push('Hoja EERR MENSUAL no encontrada. El acumulado año calendario se tomará de EERR TEMP.');
    }
  } else {
    // Megasystem: hojas "EERR <MES> <AÑO>" del año → agregar todas
    const mesSheetNames = wb.SheetNames.filter(n => {
      const m = n.match(/^EERR\s+\w+\s+(\d{4})$/i);
      return m && Number(m[1]) === anio;
    });
    for (const shName of mesSheetNames) {
      const movs = parseEerrMesMegasystem(wb.Sheets[shName]);
      for (const mov of movs) {
        if (!mov.codigo || !mov.mes) continue;
        if (!er_mensual.has(mov.codigo)) er_mensual.set(mov.codigo, { nombre: mov.nombre, desglose: {} });
        const entry = er_mensual.get(mov.codigo);
        const key = String(mov.mes);
        if (!entry.desglose[key]) entry.desglose[key] = { real: 0 };
        entry.desglose[key].real += mov.total;
      }
    }
    if (mesSheetNames.length === 0) {
      advertencias.push(`No se encontraron hojas EERR del año ${anio}. El acumulado año calendario se tomará de EERR TEMP.`);
    }
  }

  // 5. Narrativas del sheet INFORME (opcional)
  const wsInforme = findSheet(wb, /INFORME/i);
  const narrativas = parseInforme(wsInforme);
  if (!wsInforme) {
    advertencias.push('Hoja INFORME no encontrada. Las narrativas deberán ingresarse manualmente.');
  }

  return { esf, esf_t1, er_temp, er_mensual, narrativas, advertencias };
}

// ── Builders — transforman el resultado del parser a registros de DB ─────────

/**
 * Combina esf + esf_t1 → array de objetos para insertar en anf_saldos_esf.
 * saldo_neto = ia - ip (convención deudora; la UI ajusta signo por tipo_ifrs).
 * es_material se marca con el piso de la filial.
 */
export function buildSaldosEsf(esf, esf_t1, pisoMaterialidad = 10) {
  // Solo cuentas de balance: prefijos 1 (activo), 2 (pasivo), 3 (patrimonio).
  // Las cuentas de resultado (4-9) vienen en el BALANCE de Contec/Megasystem pero no pertenecen al ESF.
  const esfSolo = esf.filter(c => ['1','2','3'].includes((c.codigo || '').split('.')[0]));
  const t1 = new Map(esf_t1.map(c => [c.codigo, c]));
  return esfSolo.map(c => {
    const saldo_neto   = c.inventario_activo - c.inventario_pasivo;
    const prev = t1.get(c.codigo);
    const saldo_neto_t1 = prev ? prev.inventario_activo - prev.inventario_pasivo : null;
    const var_abs = saldo_neto_t1 != null ? saldo_neto - saldo_neto_t1 : null;
    const var_pct = (var_abs != null && saldo_neto_t1 !== 0)
      ? (var_abs / Math.abs(saldo_neto_t1)) * 100
      : null;
    const es_material = var_pct != null
      ? Math.abs(var_pct) >= pisoMaterialidad
      : (saldo_neto_t1 === 0 && saldo_neto !== 0); // apareció de la nada → material
    return {
      codigo:            c.codigo,
      nombre:            c.nombre,
      nombre_origen:     c.nombre,
      sistema:           c.sistema,
      inventario_activo: c.inventario_activo,
      inventario_pasivo: c.inventario_pasivo,
      saldo_neto,
      saldo_neto_t1,
      var_abs,
      var_pct: var_pct != null ? Math.round(var_pct * 100) / 100 : null,
      es_material,
    };
  });
}

// Clasifica una cuenta en un grupo ER según su prefijo numérico.
// Contec y Megasystem comparten la convención: 4=ingresos, 5=costos, 6=gastos oper., 7=ing. no oper., 8=egr. no oper., 9=impuesto.
function clasificarGrupoEr(codigo) {
  const pref = codigo.split('.')[0];
  switch (pref) {
    case '4': return 'Ingreso Operacional';
    case '5': return 'Costo Operacional';
    case '6': return 'Gasto Operacional';
    case '7': return 'Ingreso No Operacional';
    case '8': return 'Gasto No Operacional';
    case '9': return 'Impuesto';
    default:  return 'Gasto Operacional';
  }
}

/**
 * Combina er_temp + er_mensual → array de objetos para insertar en anf_movimientos_er.
 * Si una cuenta aparece solo en TEMP, usa sus reales como fallback del calendario.
 */
export function buildMovimientosEr(er_temp, er_mensual, mes, anio, sistema) {
  const codigos = new Set([...er_temp.keys(), ...er_mensual.keys()]);
  const tempKeys = mesesTemporada(mes);
  const result = [];

  for (const codigo of codigos) {
    const tempEntry = er_temp.get(codigo);
    const calEntry  = er_mensual.get(codigo);
    const nombre = tempEntry?.nombre || calEntry?.nombre || '';

    const desglose_temp = tempEntry?.desglose || {};
    const desglose_cal  = calEntry?.desglose  || {};

    // Cal merged: EERR MENSUAL tiene prioridad; EERR TEMP como fallback por mes
    const mergedCal = {};
    for (const [k, v] of Object.entries(desglose_temp)) {
      mergedCal[k] = { real: v.real || 0 };
    }
    for (const [k, v] of Object.entries(desglose_cal)) {
      mergedCal[k] = { real: v.real || 0 }; // MENSUAL sobreescribe
    }

    // Totales mes actual
    const mk = String(mes);
    const real_mes = mergedCal[mk]?.real || 0;
    const ppto_mes = desglose_temp[mk]?.ppto ?? null;

    // YTD año calendario (ene → mes)
    let real_ytd = 0, ppto_ytd = 0;
    for (let m = 1; m <= mes; m++) {
      const k = String(m);
      real_ytd += mergedCal[k]?.real || 0;
      ppto_ytd += desglose_temp[k]?.ppto || 0;
    }

    // Totales temporada (meses transcurridos hasta `mes`)
    let real_temp = 0, ppto_temp = 0;
    for (const k of tempKeys) {
      real_temp += desglose_temp[k]?.real || 0;
      ppto_temp += desglose_temp[k]?.ppto || 0;
    }

    // ppto_mes puede ser 0 genuino (presupuesto $0 para esa cuenta/período) → no convertir a null
    result.push({
      codigo,
      nombre,
      nombre_origen:      nombre,
      sistema,
      grupo_er:           clasificarGrupoEr(codigo),
      real_mes,
      real_ytd,
      ppto_mes,
      ppto_ytd,
      real_t1_mes:        null,
      real_t1_ytd:        null,
      real_temporada:     real_temp,
      ppto_temporada:     ppto_temp,
      real_t1_temporada:  null,
      desglose_cal:       Object.keys(mergedCal).length ? mergedCal : null,
      desglose_temp:      Object.keys(desglose_temp).length ? desglose_temp : null,
    });
  }
  return result;
}

/**
 * Temporada string para un (mes, anio). Ej: mes=6, anio=2026 → "2025-2026".
 */
export function calcTemporada(mes, anio) {
  return mes >= 7 ? `${anio}-${anio + 1}` : `${anio - 1}-${anio}`;
}

/* eslint-disable */
import * as XLSX from 'xlsx';

const SUPA_URL = 'https://bywovqayuzodbzwsriet.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk';

// ═══════════════════════════════════════════════════════════════════
// DETECCIÓN DE FORMATO
// ═══════════════════════════════════════════════════════════════════

export function detectarFormatoBalance(file) {
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (ext === 'xls') return 'megasystem';
  if (ext === 'xlsx') return 'contec';
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PARSER MEGASYSTEM (.xls BIFF)
// Primera fila = header con nombres de campo exactos.
// Puede haber múltiples filas por código (una por centro de costo);
// se agrupan y suman los valores numéricos.
// ═══════════════════════════════════════════════════════════════════

export async function parsearMegasystem(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // sheet_to_json con defval null usa la primera fila como claves
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  // Agrupar por codigo_cuenta — puede haber una fila por CC
  const mapa = new Map();
  for (const row of rows) {
    const codigo = row['codigo_cuenta'];
    if (!codigo) continue;
    const key = String(codigo).trim();

    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo:           key,
        nombre:           (row['nombre_cuenta'] || '').toString().trim(),
        debe:             Number(row['total_debe'])        || 0,
        haber:            Number(row['total_haber'])       || 0,
        saldoDeudor:      Number(row['saldo_deudor'])      || 0,
        saldoAcreedor:    Number(row['saldo_acreedor'])    || 0,
        inventarioActivo: Number(row['inventario_activo']) || 0,
        inventarioPasivo: Number(row['inventario_pasivo']) || 0,
        resultadoPerdida: Number(row['resultado_perdida']) || 0,
        resultadoGanancia:Number(row['resultado_ganancia'])|| 0,
        mes:              Number(row['mes'])  || null,
        anio:             Number(row['anho']) || null,
        clasificCuenta:   row['clasif_cuenta'] ? String(row['clasif_cuenta']).trim() : null,
        sistema:          'megasystem',
      });
    } else {
      // Sumar valores numéricos de filas adicionales (centros de costo)
      const acc = mapa.get(key);
      acc.debe             += Number(row['total_debe'])        || 0;
      acc.haber            += Number(row['total_haber'])       || 0;
      acc.saldoDeudor      += Number(row['saldo_deudor'])      || 0;
      acc.saldoAcreedor    += Number(row['saldo_acreedor'])    || 0;
      acc.inventarioActivo += Number(row['inventario_activo']) || 0;
      acc.inventarioPasivo += Number(row['inventario_pasivo']) || 0;
      acc.resultadoPerdida += Number(row['resultado_perdida']) || 0;
      acc.resultadoGanancia+= Number(row['resultado_ganancia'])|| 0;
    }
  }

  return Array.from(mapa.values());
}

// ═══════════════════════════════════════════════════════════════════
// PARSER CONTEC (.xlsx)
// Sin encabezados de columna; columnas por posición fija:
//   [0] código   [1] nombre
//   [2] debe     [3] haber
//   [4] SD       [5] SA
//   [6] IA       [7] IP
//   [8] RP       [9] RG
//
// Tipos de fila:
//   - código termina ".000"       → título jerárquico  → ignorar
//   - código vacío, hay montos    → subtotal            → ignorar
//   - código vacío, todo vacío    → separador           → ignorar
//   - código presente, sin ".000" → cuenta de detalle  → procesar
//
// mes y anio se pasan como parámetros (no están en el archivo).
// ═══════════════════════════════════════════════════════════════════

export async function parsearContec(file, mes, anio) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];

  // header:1 → array de arrays; defval null → celdas vacías son null
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const cuentas = [];
  for (const row of rows) {
    const codigo = row[0];
    if (codigo == null || codigo === '') continue;         // subtotal / separador
    const codigoStr = String(codigo).trim();
    if (codigoStr.endsWith('.000')) continue;              // título jerárquico

    cuentas.push({
      codigo:            codigoStr,
      nombre:            row[1] != null ? String(row[1]).trim() : '',
      debe:              Number(row[2]) || 0,
      haber:             Number(row[3]) || 0,
      saldoDeudor:       Number(row[4]) || 0,
      saldoAcreedor:     Number(row[5]) || 0,
      inventarioActivo:  Number(row[6]) || 0,
      inventarioPasivo:  Number(row[7]) || 0,
      resultadoPerdida:  Number(row[8]) || 0,
      resultadoGanancia: Number(row[9]) || 0,
      mes:               mes  || null,
      anio:              anio || null,
      clasificCuenta:    null,   // Contec no incluye este campo
      sistema:           'contec',
    });
  }
  return cuentas;
}

// ═══════════════════════════════════════════════════════════════════
// WRAPPER PRINCIPAL
// Detecta formato, llama al parser correcto, agrega empresa.
// Para Megasystem: mes y anio vienen del propio archivo.
// Para Contec: mes y anio deben pasarse explícitamente.
// ═══════════════════════════════════════════════════════════════════

export async function parsearBalance(file, empresa, mes, anio) {
  const formato = detectarFormatoBalance(file);
  if (!formato) throw new Error(`Formato no reconocido: ${file.name}. Use .xls (Megasystem) o .xlsx (Contec).`);

  let cuentas;
  if (formato === 'megasystem') {
    cuentas = await parsearMegasystem(file);
  } else {
    cuentas = await parsearContec(file, mes, anio);
  }

  // Añadir empresa a cada cuenta
  return cuentas.map(c => ({ ...c, empresa: empresa || '' }));
}

// ═══════════════════════════════════════════════════════════════════
// UTILIDADES
// ═══════════════════════════════════════════════════════════════════

// Saldo efectivo con signo contable: positivo = deudor, negativo = acreedor
export function saldoEfectivo(cuenta) {
  return cuenta.saldoDeudor - cuenta.saldoAcreedor;
}

// Nombre de mes en español para display
export const NOMBRES_MES = [
  '', 'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
];

// Formatear monto como USD con separador de miles
export function fmtMonto(v, decimales = 0) {
  if (v == null || isNaN(v)) return '—';
  return v.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

// ═══════════════════════════════════════════════════════════════════
// PLAN MAESTRO — PARSER
// Lee las hojas PLAN MAESTRO MEGA y PLAN MAESTRO CONTEC del xlsx.
// Solo incluye cuentas de detalle (Tipo IFRS ∈ TIPOS_DETALLE).
// Devuelve { mega: Map<string, EntryPlan>, contec: Map<string, EntryPlan> }
//   EntryPlan = { nombreOficial, tipoIFRS, subtipo, categoriaIFRS, orden }
// ═══════════════════════════════════════════════════════════════════

const TIPOS_DETALLE = new Set(['Activo','Pasivo','Patrimonio','Ingreso','Costo','Gasto']);
export const TIPOS_SITUACION  = new Set(['Activo','Pasivo','Patrimonio']);
export const TIPOS_RESULTADOS = new Set(['Ingreso','Costo','Gasto']);

export async function parsearPlanMaestro(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });

  function parseHoja(ws) {
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    const mapa = new Map();
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row[0] == null) continue;
      const tipoIFRS = row[3] ? String(row[3]).trim() : '';
      if (!TIPOS_DETALLE.has(tipoIFRS)) continue;
      mapa.set(String(row[0]).trim(), {
        nombreOficial: row[1] ? String(row[1]).trim() : '',
        tipoIFRS,
        subtipo:       row[4] ? String(row[4]).trim() : '',
        categoriaIFRS: row[5] ? String(row[5]).trim() : '',
        orden:         Number(row[6]) || 999,
      });
    }
    return mapa;
  }

  const wsMega   = wb.Sheets['PLAN MAESTRO MEGA'];
  const wsContec = wb.Sheets['PLAN MAESTRO CONTEC'];
  if (!wsMega)   throw new Error('Hoja "PLAN MAESTRO MEGA" no encontrada en el archivo.');
  if (!wsContec) throw new Error('Hoja "PLAN MAESTRO CONTEC" no encontrada en el archivo.');

  return { mega: parseHoja(wsMega), contec: parseHoja(wsContec) };
}

// ═══════════════════════════════════════════════════════════════════
// CLASIFICADOR
// Para cada cuenta busca su entrada en el map del sistema correcto.
// Sin match → sinClasificar (visible, no descartada).
// Devuelve { situacion, resultados, sinClasificar }
// ═══════════════════════════════════════════════════════════════════

export function clasificarCuentas(cuentas, planMaps) {
  const situacion = [], resultados = [], sinClasificar = [];
  for (const cuenta of cuentas) {
    const mapa  = cuenta.sistema === 'megasystem' ? planMaps?.mega : planMaps?.contec;
    const entry = mapa?.get(cuenta.codigo);
    if (!entry) { sinClasificar.push(cuenta); continue; }
    const enriquecida = { ...cuenta, ...entry };
    if (TIPOS_SITUACION.has(entry.tipoIFRS))       situacion.push(enriquecida);
    else if (TIPOS_RESULTADOS.has(entry.tipoIFRS)) resultados.push(enriquecida);
    else                                            sinClasificar.push(enriquecida);
  }
  return { situacion, resultados, sinClasificar };
}

// ═══════════════════════════════════════════════════════════════════
// SUPABASE — PLAN MAESTRO (id: maestro_plan_cuentas)
// Serializa Maps a objetos planos para JSON; reconstruye al cargar.
// ═══════════════════════════════════════════════════════════════════

function _mapToObj(m) {
  const o = {};
  m.forEach((v, k) => { o[k] = v; });
  return o;
}

export function planObjToMaps(obj) {
  if (!obj) return null;
  return {
    mega:   new Map(Object.entries(obj.mega   || {})),
    contec: new Map(Object.entries(obj.contec || {})),
  };
}

export async function dbSavePlanMaestro(planMaps, cargadoPor) {
  const value = {
    mega:       _mapToObj(planMaps.mega),
    contec:     _mapToObj(planMaps.contec),
    version:    'v5',
    cargadoEn:  new Date().toISOString(),
    cargadoPor: cargadoPor || '',
  };
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 'maestro_plan_cuentas', value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error guardando Plan Maestro: ${res.status}`);
}

export async function dbLoadPlanMaestro() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.maestro_plan_cuentas&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  if (!rows?.[0]?.value) return null;
  const val = rows[0].value;
  return {
    maps: planObjToMaps(val),
    meta: { version: val.version, cargadoEn: val.cargadoEn, cargadoPor: val.cargadoPor },
  };
}

// ═══════════════════════════════════════════════════════════════════
// EEFF CLASIFICADO — PERSISTENCIA SUPABASE
// id: eeff_{empresa_slug}_{anio}_{mes_2d}  ej. eeff_allegria_foods_2026_04
//
// Esquema value:
//   empresa, mes, anio, sistema, formato, fechaGuardado, guardadoPor,
//   resumen: { totalCuentas, situacion, resultados, sinClasificar },
//   cuentas: [ ...campos_cuenta, grupo, composicion:null, narrativa:null ]
//
// Los campos composicion y narrativa se reservan para Etapas 2-3 (análisis
// de cuenta y comentarios CFO); se guardan en null desde ahora.
// ═══════════════════════════════════════════════════════════════════

export function eeffId(empresa, anio, mes) {
  const slug = empresa.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return `eeff_${slug}_${anio}_${String(mes).padStart(2, '0')}`;
}

export async function guardarEEFF({
  empresa, mes, anio, guardadoPor,
  // Nuevo formato dual (YTD + Mes)
  clasif_mes, clasif_ytd, sistema_mes, formato_mes, sistema_ytd, formato_ytd,
  // Legacy (un solo balance — retrocompat)
  clasif, sistema, formato,
}) {
  const enrich = (grupo) => (c) => ({ ...c, grupo, composicion: null, narrativa: null });
  const enrichAll = (cl) => [
    ...cl.situacion.map(enrich('situacion')),
    ...cl.resultados.map(enrich('resultados')),
    ...cl.sinClasificar.map(enrich('sinClasificar')),
  ];

  let value;
  if (clasif_mes && clasif_ytd) {
    const cuentas_mes = enrichAll(clasif_mes);
    const cuentas_ytd = enrichAll(clasif_ytd);
    value = {
      empresa, mes, anio,
      sistema_mes, formato_mes, sistema_ytd, formato_ytd,
      fechaGuardado: new Date().toISOString(),
      guardadoPor:   guardadoPor || '',
      resumen_mes: { totalCuentas: cuentas_mes.length, situacion: clasif_mes.situacion.length, resultados: clasif_mes.resultados.length, sinClasificar: clasif_mes.sinClasificar.length },
      resumen_ytd: { totalCuentas: cuentas_ytd.length, situacion: clasif_ytd.situacion.length, resultados: clasif_ytd.resultados.length, sinClasificar: clasif_ytd.sinClasificar.length },
      cuentas_mes,
      cuentas_ytd,
    };
  } else {
    const cuentas = enrichAll(clasif);
    value = {
      empresa, mes, anio, sistema, formato,
      fechaGuardado: new Date().toISOString(),
      guardadoPor:   guardadoPor || '',
      resumen: { totalCuentas: cuentas.length, situacion: clasif.situacion.length, resultados: clasif.resultados.length, sinClasificar: clasif.sinClasificar.length },
      cuentas,
    };
  }

  const id  = eeffId(empresa, anio, mes);
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method:  'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error guardando EEFF (${res.status})`);
  return id;
}

export async function cargarEEFF(empresa, anio, mes) {
  const id  = eeffId(empresa, anio, mes);
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0]?.value ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// LIBRO MAYOR — PARSERS
//
// Salida normalizada por movimiento:
//   { fecha, tipo, numDoc, glosa, debe, haber, saldo,
//     codigoCuenta, nombreCuenta, moneda, tc, mes, anio, sistema }
//
// MEGASYSTEM (.xls): tabla plana, una fila por movimiento.
//   Columnas clave: mot_fecdoc (DD-MM-YYYY HH:MM:SS), mod_cuenta,
//   pla_nombre, mod_debe, mod_haber, mot_tipmov, mot_numdoc,
//   mot_detall, glosa_detalle, Nombre_Moneda, Valor_Moneda.
//   Sin saldo acumulado en el export → saldo: null.
//
// CONTEC (.xlsx): estructura jerárquica por cuenta.
//   Cabecera cuenta: col0 === "Cuenta :", col2=código, col3=nombre.
//   Movimiento: col0 = fecha "DD/MM/YYYY", col1=tipo, col2=numDoc,
//   col3=glosa, col4=TC, col5=debe, col6=haber, col7=saldo acum.
//   Totalizador: col0 vacío, col5/col6 con totales → ignorar.
// ═══════════════════════════════════════════════════════════════════

function _parseFechaMega(str) {
  // "DD-MM-YYYY HH:MM:SS" → "YYYY-MM-DD"
  if (!str || typeof str !== 'string') return null;
  const [d, m, y] = str.split(' ')[0].split('-');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

function _parseFechaContec(str) {
  // "DD/MM/YYYY" → "YYYY-MM-DD"
  if (!str || typeof str !== 'string') return null;
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
}

export async function parsearMayorMegasystem(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // Primera fila = header con nombres de campo exactos
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  const movimientos = [];
  for (const row of rows) {
    const fechaStr = _parseFechaMega(row['mot_fecdoc']);
    if (!fechaStr) continue;
    const mes  = parseInt(fechaStr.substring(5, 7), 10);
    const anio = parseInt(fechaStr.substring(0, 4), 10);
    const glosa = [row['mot_detall'], row['glosa_detalle']]
      .filter(Boolean).join(' — ').trim() || '';
    movimientos.push({
      fecha:        fechaStr,
      tipo:         row['mot_tipmov'] != null ? String(row['mot_tipmov']) : '',
      numDoc:       row['mot_numdoc'] != null ? String(row['mot_numdoc']) : '',
      glosa,
      debe:         Number(row['mod_debe'])  || 0,
      haber:        Number(row['mod_haber']) || 0,
      saldo:        null,  // Megasystem no exporta saldo acumulado
      codigoCuenta: row['mod_cuenta'] != null ? String(row['mod_cuenta']).trim() : '',
      nombreCuenta: row['pla_nombre'] != null ? String(row['pla_nombre']).trim() : '',
      moneda:       row['Nombre_Moneda'] != null ? String(row['Nombre_Moneda']).trim() : '',
      tc:           Number(row['Valor_Moneda']) || null,
      mes,
      anio,
      sistema:      'megasystem',
    });
  }
  return movimientos;
}

export async function parsearMayorContec(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  const movimientos = [];
  let cuentaActual = { codigo: '', nombre: '' };

  for (const row of rows) {
    const col0 = row[0];

    // Cabecera de cuenta
    if (col0 === 'Cuenta :') {
      cuentaActual = {
        codigo: row[2] != null ? String(row[2]).trim() : '',
        nombre: row[3] != null ? String(row[3]).trim() : '',
      };
      continue;
    }

    // Movimiento: col0 es fecha "DD/MM/YYYY"
    if (typeof col0 === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(col0)) {
      const fechaStr = _parseFechaContec(col0);
      if (!fechaStr) continue;
      const mes  = parseInt(fechaStr.substring(5, 7), 10);
      const anio = parseInt(fechaStr.substring(0, 4), 10);
      movimientos.push({
        fecha:        fechaStr,
        tipo:         row[1] != null ? String(row[1]).trim() : '',
        numDoc:       row[2] != null ? String(row[2]).trim() : '',
        glosa:        row[3] != null ? String(row[3]).trim() : '',
        debe:         Number(row[5]) || 0,
        haber:        Number(row[6]) || 0,
        saldo:        row[7] != null ? Number(row[7]) : null,
        codigoCuenta: cuentaActual.codigo,
        nombreCuenta: cuentaActual.nombre,
        moneda:       '',   // Contec no incluye código de moneda por movimiento
        tc:           Number(row[4]) || null,
        mes,
        anio,
        sistema:      'contec',
      });
      continue;
    }
    // Totalizador / separador → ignorar
  }
  return movimientos;
}

export async function parsearMayor(file) {
  const ext = (file.name || '').split('.').pop().toLowerCase();
  if (ext === 'xls')  return parsearMayorMegasystem(file);
  if (ext === 'xlsx') return parsearMayorContec(file);
  throw new Error(`Formato no reconocido para libro mayor: ${file.name}. Use .xls (Megasystem) o .xlsx (Contec).`);
}

// ═══════════════════════════════════════════════════════════════════
// LIBRO MAYOR — PERSISTENCIA SUPABASE
// id: mayor_{empresa_slug}_{anio}  (un row por empresa-año)
// El mayor cubre todos los meses del año; la UI filtra por mes.
// ═══════════════════════════════════════════════════════════════════

export function mayorId(empresa, anio) {
  const slug = empresa.toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return `mayor_${slug}_${anio}`;
}

export async function dbSaveMayor({ empresa, anio, movimientos, guardadoPor }) {
  const value = {
    empresa,
    anio,
    totalMovimientos: movimientos.length,
    meses: [...new Set(movimientos.map(m => m.mes))].sort((a,b) => a-b),
    cargadoEn:  new Date().toISOString(),
    guardadoPor: guardadoPor || '',
    movimientos,
  };
  const id  = mayorId(empresa, anio);
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method:  'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error guardando Mayor (${res.status})`);
  return id;
}

export async function dbLoadMayor(empresa, anio, empresasPermitidas) {
  if (empresasPermitidas && !empresasPermitidas.includes(empresa)) return null;
  const id  = mayorId(empresa, anio);
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0]?.value ?? null;
}

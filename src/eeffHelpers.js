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

export async function guardarEEFF({ empresa, mes, anio, sistema, formato, clasif, guardadoPor }) {
  const enrich = (grupo) => (c) => ({ ...c, grupo, composicion: null, narrativa: null });
  const cuentas = [
    ...clasif.situacion.map(enrich('situacion')),
    ...clasif.resultados.map(enrich('resultados')),
    ...clasif.sinClasificar.map(enrich('sinClasificar')),
  ];
  const value = {
    empresa, mes, anio, sistema, formato,
    fechaGuardado: new Date().toISOString(),
    guardadoPor:   guardadoPor || '',
    resumen: {
      totalCuentas:  cuentas.length,
      situacion:     clasif.situacion.length,
      resultados:    clasif.resultados.length,
      sinClasificar: clasif.sinClasificar.length,
    },
    cuentas,
  };
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

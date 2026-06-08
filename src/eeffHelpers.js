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
    maps:               planObjToMaps(val),
    meta:               { version: val.version, cargadoEn: val.cargadoEn, cargadoPor: val.cargadoPor },
    categoriasAuxiliar: val.categoriasAuxiliar || null,
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
      // col[9]=RUT auxiliar, col[10]=tipoDoc, col[12]=vencimiento
      const rutRaw9 = row[9] != null ? String(row[9]).trim() : '';
      const vctoRaw = row[12] != null ? String(row[12]).trim() : '';
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
        rutAuxiliar:  (rutRaw9 && rutRaw9 !== '0') ? rutRaw9 : null,
        tipoDoc:      row[10] != null ? String(row[10]).trim() || null : null,
        vencimiento:  /^\d{2}\/\d{2}\/\d{4}$/.test(vctoRaw) ? _parseFechaContec(vctoRaw) : null,
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
  const id      = mayorId(empresa, anio);
  const bodyStr = JSON.stringify({ id, value, updated_at: new Date().toISOString() });
  // Medir tamaño real del payload en bytes (UTF-8)
  const payloadBytes = new TextEncoder().encode(bodyStr).length;

  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method:  'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: bodyStr,
  });
  if (!res.ok) throw new Error(`Error guardando Mayor (${res.status})`);
  return { id, payloadBytes };
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSICIÓN DE CUENTA — PERSISTENCIA (Etapa 2, Parte 3)
//
// Guarda el análisis manual de una cuenta dentro del mismo row EEFF.
// composicion = { items: [{ descripcion, monto, nota }],
//                 actualizadoPor, fechaActualizacion }
//
// Solo se muta cuentas_ytd (o cuentas en legacy). cuentas_mes no
// se toca porque la composición referencia el saldo YTD.
// ═══════════════════════════════════════════════════════════════════

export async function guardarComposicionCuenta({
  empresa, anio, mes, codigoCuenta, items, actualizadoPor,
}) {
  const current = await cargarEEFF(empresa, anio, mes);
  if (!current) throw new Error(`No hay EEFF guardado para ${empresa} ${mes}/${anio}`);

  const composicion = {
    items: items || [],
    actualizadoPor: actualizadoPor || '',
    fechaActualizacion: new Date().toISOString(),
  };

  let updated = false;
  const patchList = (list) => {
    if (!list) return list;
    return list.map(c => {
      if (c.codigo === codigoCuenta) { updated = true; return { ...c, composicion }; }
      return c;
    });
  };

  let value;
  if (current.cuentas_ytd) {
    value = { ...current, cuentas_ytd: patchList(current.cuentas_ytd) };
  } else {
    value = { ...current, cuentas: patchList(current.cuentas) };
  }

  if (!updated) throw new Error(`Cuenta ${codigoCuenta} no encontrada en el EEFF`);

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
  if (!res.ok) throw new Error(`Error guardando composición (${res.status})`);
  return { id, codigoCuenta, composicion };
}

// ═══════════════════════════════════════════════════════════════════
// RUT CHILE — NORMALIZACIÓN
// Forma canónica: cuerpo+dígito verificador sin puntos ni guión.
// Ejemplos: "76.351.274-6" → "763512746", "24133442-2" → "241334422"
// Caso especial: RUT foráneo corto con guión ej. "1000-6" → ya tiene DV.
// Caso numérico puro de Excel (sin guión, ≤8 dígitos): calcula DV.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// RUT DESDE GLOSA MEGASYSTEM
// Extrae el RUT embebido en glosas del tipo:
//   "Prove.: 76.351.274-6 Docto.: FAC ELEC Nro.: 5730"
//   "Cliente.: 77.997.049-3"
// ═══════════════════════════════════════════════════════════════════

export function extraerRutGlosaMega(glosa) {
  if (!glosa) return null;
  const m = String(glosa).match(/(?:Prove|Cliente)\.\:\s*([\d.]+\-[\dKk])/i);
  if (!m) return null;
  return normalizeRut(m[1]);
}

function _dvRut(body) {
  const digits = String(body).split('').reverse();
  let sum = 0, f = 2;
  for (const d of digits) { sum += Number(d) * f; f = f === 7 ? 2 : f + 1; }
  const r = 11 - (sum % 11);
  return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}

export function normalizeRut(raw) {
  if (raw == null || raw === '') return '';
  let s = String(raw).trim().toUpperCase();
  const hasHyphen = s.includes('-');                     // guión presente → DV ya incluido
  s = s.replace(/\./g, '').replace(/,/g, '').replace(/\s/g, '');
  if (hasHyphen) {
    s = s.replace('-', '');                              // quitar guión, DV ya estaba
  } else if (/^\d+$/.test(s) && s.length <= 8) {
    s = s + _dvRut(s);                                   // número puro de Excel → calcular DV
  }
  s = s.replace(/k$/, 'K');
  return s;
}

// ═══════════════════════════════════════════════════════════════════
// MAESTRO DE TERCEROS — PARSERS
// Devuelven [{ rut: string (normalizado), nombre: string }]
//
// Megasystem: .xls con headers; busca columnas rut_prove / rut_cliente / rut
//             y razon_social_prov / razon_social_cli / razon_social / nombre
// Contec:     .xlsx con headers; busca columnas RUT y RAZON SOCIAL
//             (los RUTs vienen en formato "XX.XXX.XXX-D" o "X,XXX,XXX-D")
// ═══════════════════════════════════════════════════════════════════

// Extrae terceros únicos directamente de los movimientos ya cargados del mayor.
// Útil para poblar el maestro sin necesitar un archivo separado.
export function extraerTercerosDelMayor(movimientos) {
  const vistos = {};
  for (const m of movimientos) {
    let rutNorm = null;
    if (m.sistema === 'contec' && m.rutAuxiliar) {
      rutNorm = normalizeRut(m.rutAuxiliar);
    } else if (m.sistema === 'megasystem') {
      rutNorm = extraerRutGlosaMega(m.glosa);
    }
    if (rutNorm && !vistos[rutNorm]) vistos[rutNorm] = { rut: rutNorm, nombre: '' };
  }
  return Object.values(vistos);
}

export async function parseTercerosMegasystem(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  const resultado = [];
  for (const row of rows) {
    const rutRaw = row['rut_prove'] ?? row['rut_cliente'] ?? row['rut'] ?? row['RUT'] ?? null;
    const nombre = row['razon_social_prov'] ?? row['razon_social_cli'] ?? row['razon_social']
                   ?? row['nombre'] ?? row['NOMBRE'] ?? '';
    if (!rutRaw) continue;
    const rut = normalizeRut(rutRaw);
    if (!rut) continue;
    resultado.push({ rut, nombre: String(nombre).trim() });
  }
  return resultado;
}

export async function parseTercerosContec(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

  const resultado = [];
  for (const row of rows) {
    const rutRaw = row['RUT'] ?? row['Rut'] ?? row['rut']
                   ?? row['RUT_PROVEEDOR'] ?? row['RUT_CLIENTE'] ?? null;
    const nombre = row['RAZON SOCIAL'] ?? row['Razon Social'] ?? row['razon_social']
                   ?? row['NOMBRE'] ?? row['Nombre'] ?? '';
    if (!rutRaw) continue;
    const rut = normalizeRut(rutRaw);
    if (!rut) continue;
    resultado.push({ rut, nombre: String(nombre).trim() });
  }
  return resultado;
}

// ═══════════════════════════════════════════════════════════════════
// MAESTRO DE TERCEROS — MERGE
// existing  = mapa { [rutNorm]: { nombre, activo, fuente, updatedAt } } | null
// nuevos    = [{ rut, nombre }]
// fuente    = 'megasystem' | 'contec' | 'manual'
// Regla: entradas 'manual' preservan su nombre (no se sobreescriben).
// ═══════════════════════════════════════════════════════════════════

export function mergeTerceros(existing, nuevos, fuente) {
  const mapa = { ...(existing || {}) };
  let nNuevos = 0, nActualizados = 0;
  for (const { rut, nombre } of nuevos) {
    if (!rut) continue;
    if (mapa[rut]) {
      const esManual = mapa[rut].fuente === 'manual';
      if (!esManual && nombre && nombre !== mapa[rut].nombre) {
        mapa[rut] = { ...mapa[rut], nombre, fuente, updatedAt: new Date().toISOString() };
        nActualizados++;
      }
    } else {
      mapa[rut] = { nombre, activo: true, fuente, updatedAt: new Date().toISOString() };
      nNuevos++;
    }
  }
  return { mapa, stats: { nuevos: nNuevos, actualizados: nActualizados } };
}

// ═══════════════════════════════════════════════════════════════════
// MAESTRO DE TERCEROS — PERSISTENCIA (id: terceros_maestro)
// value = { terceros: {[rutNorm]:{nombre,activo,fuente,updatedAt}},
//           totalRuts, guardadoEn, guardadoPor }
// ═══════════════════════════════════════════════════════════════════

export async function dbSaveTercerosMaestro(tercerosMapa, guardadoPor) {
  const value = {
    terceros:    tercerosMapa,
    totalRuts:   Object.keys(tercerosMapa).length,
    guardadoEn:  new Date().toISOString(),
    guardadoPor: guardadoPor || '',
  };
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 'terceros_maestro', value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error guardando Maestro de Terceros (${res.status})`);
  return value.totalRuts;
}

export async function dbLoadTercerosMaestro() {
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.terceros_maestro&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  if (!rows?.[0]?.value?.terceros) return null;
  return rows[0].value.terceros;   // { [rutNorm]: {...} }
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORÍAS AUXILIAR — PERSISTENCIA
// Parcela solo el campo categoriasAuxiliar en maestro_plan_cuentas,
// preservando mega/contec y demás metadatos del Plan Maestro.
// ═══════════════════════════════════════════════════════════════════

export async function dbSaveCategoriasAuxiliar(categorias, guardadoPor) {
  // Leer row actual para no perder mega/contec
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.maestro_plan_cuentas&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  const val = rows?.[0]?.value || {};
  const newValue = {
    ...val,
    categoriasAuxiliar:      categorias,
    catAuxActualizadoEn:     new Date().toISOString(),
    catAuxActualizadoPor:    guardadoPor || '',
  };
  const res2 = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id: 'maestro_plan_cuentas', value: newValue, updated_at: new Date().toISOString() }),
  });
  if (!res2.ok) throw new Error(`Error guardando categorias auxiliar (${res2.status})`);
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

// ═══════════════════════════════════════════════════════════════════
// EXPORTAR AUXILIAR → XLSX
// filas, hayVencimiento, totales, cobertura, labelSaldo vienen del
// drawerAuxiliar useMemo en EEFFModule.
// ═══════════════════════════════════════════════════════════════════
export function exportarAuxiliarXLSX({ filas, hayVencimiento, totales, cobertura, labelSaldo, cuenta, empresa, mes, anio }) {
  const NM = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const headers = ['RUT', 'Nombre', 'Debe', 'Haber', labelSaldo || 'Saldo'];
  if (hayVencimiento) headers.push('Vencido');

  const dataRows = filas.map(f => {
    const r = [f.rutNorm || 'Sin RUT', f.nombre || '', f.debe, f.haber, Math.abs(f.saldo)];
    if (hayVencimiento) r.push(f.vencido || 0);
    return r;
  });
  const totRow = [
    'TOTAL',
    `${cobertura.conRut}/${cobertura.total} mov. con RUT (${cobertura.pct}%)`,
    totales.debe, totales.haber, Math.abs(totales.saldo),
  ];
  if (hayVencimiento) totRow.push(totales.vencido || 0);
  dataRows.push(totRow);

  const ws = XLSX.utils.aoa_to_sheet([
    [`Auxiliar — Cta. ${cuenta}`, '', `${empresa} · ${NM[mes]} ${anio}`],
    [],
    headers,
    ...dataRows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Auxiliar');
  const fname = `auxiliar_${String(cuenta).replace(/\W/g,'_')}_${empresa.replace(/\s+/g,'_')}_${anio}_${String(mes).padStart(2,'0')}.xlsx`.toLowerCase();
  XLSX.writeFile(wb, fname);
}

// ═══════════════════════════════════════════════════════════════════
// EXPORTAR EEFF COMPLETO → XLSX  (hojas ESF + ER)
// cpgYtd y cpgMes son los mapas {grupo:[cuentas]} construidos por buildCpg.
// ═══════════════════════════════════════════════════════════════════
export function exportarEEFFXLSX({ cpgYtd, cpgMes, empresa, mes, anio }) {
  const NM = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const hasMes = cpgMes && Object.keys(cpgMes).length > 0;

  // ── Hoja ESF ──────────────────────────────────────────────────────
  const ESF_GRUPOS = ['Activo Corriente','Activo No Corriente','Pasivo Corriente','Pasivo No Corriente','Patrimonio'];
  const esfRows = [];
  esfRows.push([`Estado de Situación Financiera — ${empresa} · Acumulado ${NM[mes]} ${anio}`]);
  esfRows.push([]);
  esfRows.push(['Sección','Categoría','Código','Nombre','Saldo YTD']);
  for (const grupo of ESF_GRUPOS) {
    const cuentas = cpgYtd[grupo] || [];
    if (!cuentas.length) continue;
    let grupoTotal = 0;
    for (const c of cuentas) {
      const ia = c.inventarioActivo || 0, ip = c.inventarioPasivo || 0;
      const v = c.tipoIFRS === 'Activo' ? ia - ip : ip - ia;
      grupoTotal += v;
      esfRows.push([grupo, c.categoriaIFRS || '', c.codigo, c.nombre || c.nombreOficial || '', v]);
    }
    esfRows.push([`TOTAL ${grupo.toUpperCase()}`, '', '', '', grupoTotal]);
    esfRows.push([]);
  }

  // ── Hoja ER ───────────────────────────────────────────────────────
  const ER_GRUPOS_MAP = [
    { label:'Ingresos Operacionales', grupo:'Ingreso Operacional',   signo: 1 },
    { label:'Costos',                 grupo:'Costo Operacional',     signo:-1 },
    { label:'Gastos Operacionales',   grupo:'Gasto Operacional',     signo:-1 },
    { label:'Ingresos No Oper.',      grupo:'Ingreso No Operacional',signo: 1 },
    { label:'Gastos No Oper.',        grupo:'Gasto No Operacional',  signo:-1 },
    { label:'No Operacional',         grupo:'No Operacional',        signo: 0 },
    { label:'Impuesto a la Renta',    grupo:'Impuesto',              signo:-1 },
  ];
  const erRows = [];
  erRows.push([`Estado de Resultados — ${empresa} · ${NM[mes]} ${anio}`]);
  erRows.push([]);
  const hdrER = ['Sección','Categoría','Código','Nombre','YTD'];
  if (hasMes) hdrER.push(`${NM[mes]} (mes)`);
  erRows.push(hdrER);

  for (const { label, grupo, signo } of ER_GRUPOS_MAP) {
    const cuentas = cpgYtd[grupo] || [];
    if (!cuentas.length) continue;
    let grupoTotal = 0;
    for (const c of cuentas) {
      const rg = c.resultadoGanancia || 0, rp = c.resultadoPerdida || 0;
      const v = signo === 1 ? rg - rp : signo === -1 ? rp - rg : rg - rp;
      grupoTotal += v;
      const row = [label, c.categoriaIFRS || '', c.codigo, c.nombre || c.nombreOficial || '', v];
      if (hasMes) {
        const cM = (cpgMes[grupo] || []).find(x => x.codigo === c.codigo);
        const rgM = cM?.resultadoGanancia || 0, rpM = cM?.resultadoPerdida || 0;
        row.push(signo === 1 ? rgM - rpM : signo === -1 ? rpM - rgM : rgM - rpM);
      }
      erRows.push(row);
    }
    erRows.push([`TOTAL ${label.toUpperCase()}`, '', '', '', grupoTotal]);
    erRows.push([]);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(esfRows), 'ESF');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(erRows),  'ER');
  const fname = `eeff_${empresa.replace(/\s+/g,'_')}_${anio}_${String(mes).padStart(2,'0')}.xlsx`.toLowerCase();
  XLSX.writeFile(wb, fname);
}

// ═══════════════════════════════════════════════════════════════════
// PRESUPUESTO (PPTO) — PERSISTENCIA
// id: ppto_{empresa_slug}_{anio}_{mes_2d}
// Mismo formato que EEFF pero solo guarda cuentas_ytd (=ppto acumulado).
// ═══════════════════════════════════════════════════════════════════
export function pptoid(empresa, anio, mes) {
  const slug = empresa.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
  return `ppto_${slug}_${anio}_${String(mes).padStart(2,'0')}`;
}

export async function guardarPpto({ empresa, mes, anio, clasif_ytd, sistema, formato, guardadoPor }) {
  const enrich = (grupo) => (c) => ({ ...c, grupo, composicion: null, narrativa: null });
  const cuentas_ytd = [
    ...clasif_ytd.situacion.map(enrich('situacion')),
    ...clasif_ytd.resultados.map(enrich('resultados')),
    ...clasif_ytd.sinClasificar.map(enrich('sinClasificar')),
  ];
  const value = {
    empresa, mes, anio, sistema, formato,
    fechaGuardado: new Date().toISOString(),
    guardadoPor: guardadoPor || '',
    resumen_ytd: { totalCuentas: cuentas_ytd.length },
    cuentas_ytd,
  };
  const id = pptoid(empresa, anio, mes);
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({ id, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Error guardando Ppto (${res.status})`);
  return id;
}

export async function cargarPpto(empresa, anio, mes) {
  const id = pptoid(empresa, anio, mes);
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  const rows = await res.json();
  return rows?.[0]?.value ?? null;
}

// ═══════════════════════════════════════════════════════════════════
// RESUMEN MULTI-EMPRESA — BATCH STATUS
// Devuelve [{empresa, tieneEEFF, fechaEEFF, guardadoPor, totalCuentas,
//            tieneMayor, mayorMovs, mayorMeses}]
// ═══════════════════════════════════════════════════════════════════
export async function cargarResumenEstados(empresas, anio, mes) {
  const eeffIds  = empresas.map(emp => eeffId(emp, anio, mes));
  const mayorIds = empresas.map(emp => mayorId(emp, anio));
  const hdrs     = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

  const [resE, resM] = await Promise.all([
    fetch(`${SUPA_URL}/rest/v1/calendario_data?id=in.(${eeffIds.join(',')})&select=id,value`, { headers: hdrs }),
    fetch(`${SUPA_URL}/rest/v1/calendario_data?id=in.(${mayorIds.join(',')})&select=id,value->>'empresa',value->>'totalMovimientos',value->>'meses'`, { headers: hdrs }),
  ]);

  const byEeff  = {};
  const byMayor = {};
  if (resE.ok) { for (const r of (await resE.json() || [])) byEeff[r.id]  = r.value; }
  if (resM.ok) { for (const r of (await resM.json() || [])) byMayor[r.id] = r; }

  return empresas.map((emp, i) => {
    const ev = byEeff[eeffIds[i]];
    const mv = byMayor[mayorIds[i]];
    return {
      empresa:      emp,
      tieneEEFF:    !!ev,
      fechaEEFF:    ev?.fechaGuardado || null,
      guardadoPor:  ev?.guardadoPor   || null,
      sistemaEEFF:  ev?.sistema_ytd   || ev?.sistema || null,
      totalCuentas: ev?.resumen_ytd?.totalCuentas || ev?.resumen?.totalCuentas || 0,
      tieneMayor:   !!mv,
      mayorMovs:    mv ? Number(mv['?column?'] || mv.totalMovimientos || 0) : 0,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
// CONSOLIDADO — AGREGAR CUENTAS CON FACTORES NCI
// eeffsData = [{empresa, factor, cuentas}]
// Produce array de cuentas consolidadas (empresa → 'Consolidado').
// ═══════════════════════════════════════════════════════════════════
export function consolidarCuentas(eeffsData) {
  const mapa = new Map();
  for (const { empresa, factor, cuentas } of eeffsData) {
    if (!cuentas?.length) continue;
    const f = factor ?? 1;
    for (const c of cuentas) {
      if (c.grupo === 'sinClasificar') continue;
      const key = c.codigo;
      if (!mapa.has(key)) {
        mapa.set(key, {
          ...c,
          empresa:           'Consolidado',
          debe:              (c.debe              || 0) * f,
          haber:             (c.haber             || 0) * f,
          saldoDeudor:       (c.saldoDeudor       || 0) * f,
          saldoAcreedor:     (c.saldoAcreedor     || 0) * f,
          inventarioActivo:  (c.inventarioActivo  || 0) * f,
          inventarioPasivo:  (c.inventarioPasivo  || 0) * f,
          resultadoPerdida:  (c.resultadoPerdida  || 0) * f,
          resultadoGanancia: (c.resultadoGanancia || 0) * f,
          _empresas: [empresa],
        });
      } else {
        const acc = mapa.get(key);
        acc.debe              += (c.debe              || 0) * f;
        acc.haber             += (c.haber             || 0) * f;
        acc.saldoDeudor       += (c.saldoDeudor       || 0) * f;
        acc.saldoAcreedor     += (c.saldoAcreedor     || 0) * f;
        acc.inventarioActivo  += (c.inventarioActivo  || 0) * f;
        acc.inventarioPasivo  += (c.inventarioPasivo  || 0) * f;
        acc.resultadoPerdida  += (c.resultadoPerdida  || 0) * f;
        acc.resultadoGanancia += (c.resultadoGanancia || 0) * f;
        if (!acc._empresas.includes(empresa)) acc._empresas.push(empresa);
      }
    }
  }
  return Array.from(mapa.values());
}

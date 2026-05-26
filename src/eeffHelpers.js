/* eslint-disable */
import * as XLSX from 'xlsx';

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

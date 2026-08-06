/* eslint-disable */
/**
 * FIXTURE: Frisku Foods — Balance y ER junio 2026 (Megasystem)
 *
 * Fuente: datos persistidos en Supabase (anf_saldos_esf + anf_movimientos_er).
 * Sin validación directa contra el Excel fuente original.
 * Los totales globales (TOTALES_EXACTOS) son exactos.
 * Las filas individuales son representativas de la estructura de códigos y
 * NO corresponden a valores de cuentas reales del libro mayor.
 *
 * Contexto: estas pruebas congelan el comportamiento del sistema ANTES de
 * implementar SourceAdapter/AccountingProfile (Fases 2–3).
 */

// ── Totales exactos de Supabase (no redondear en pruebas) ─────────────────────
// Obtenidos mediante consulta directa a anf_saldos_esf (jun 2026, informe Frisku).
export const TOTALES_EXACTOS = {
  inv_activo:  5_024_481.71,
  inv_pasivo:  2_902_083.35,
  /** Descuadre algebraico actual: inv_activo − inv_pasivo = 2.122.398,36 */
  descuadre:   2_122_398.36,
};

// ── Cuentas ESF representativas (salida simulada de parseBalanceMegasystem) ────
// Cubre los rangos de códigos que demostraron bugs en la clasificación.
// Valores individuales: SINTÉTICOS (representativos, no del libro mayor real).
export const ESF = [
  // 11xxxx — Activo Circulante (clasificación correcta)
  { codigo: '1101003', nombre: 'Banco - Cuenta Corriente CLP', inventario_activo: 312_500.00, inventario_pasivo: 0, sistema: 'megasystem' },
  { codigo: '1102001', nombre: 'Clientes Nacionales',          inventario_activo: 980_000.00, inventario_pasivo: 0, sistema: 'megasystem' },
  { codigo: '1103001', nombre: 'Otras Cuentas por Cobrar',     inventario_activo: 207_981.71, inventario_pasivo: 0, sistema: 'megasystem' },
  // 12xxxx — Activo Fijo (clasificación correcta)
  { codigo: '1201001', nombre: 'Maquinaria y Equipos',         inventario_activo: 1_500_000.00, inventario_pasivo: 0, sistema: 'megasystem' },
  // 13xxxx — Otros Activos No Corrientes (clasificación correcta)
  { codigo: '1301001', nombre: 'Depósito en Garantía',         inventario_activo: 500_000.00, inventario_pasivo: 0, sistema: 'megasystem' },
  // 21xxxx — Pasivo Circulante (clasificación correcta)
  { codigo: '2101001', nombre: 'Proveedores Nacionales',       inventario_activo: 0, inventario_pasivo: 420_000.00, sistema: 'megasystem' },
  { codigo: '2102001', nombre: 'Retenciones por Pagar',        inventario_activo: 0, inventario_pasivo: 180_000.00, sistema: 'megasystem' },
  // 22xxxx — Pasivo Largo Plazo (clasificación correcta)
  { codigo: '2201001', nombre: 'Deuda Bancaria Largo Plazo',   inventario_activo: 0, inventario_pasivo: 800_000.00, sistema: 'megasystem' },
  // 27xxxx — Capital y Reservas
  // KNOWN_BUG: clasificarSeccionEsf retorna 'Pasivo No Corriente' para 27xxxx.
  // Correcto según PB-MEGASYSTEM-v1: 'Patrimonio'.
  // Será corregido en Fase 3 al implementar AccountingProfile.
  { codigo: '2701001', nombre: 'Capital Pagado',               inventario_activo: 0, inventario_pasivo: 600_000.00, sistema: 'megasystem' },
  { codigo: '2702001', nombre: 'Reservas Acumuladas',          inventario_activo: 0, inventario_pasivo: 250_000.00, sistema: 'megasystem' },
  // 3xxxxx — Ingresos en Megasystem
  // KNOWN_BUG: clasificarSeccionEsf retorna 'Patrimonio' para 3xxxxx Megasystem.
  // Correcto: null (son cuentas de resultado, no de balance).
  // Doble conteo: aparecen en ESF y en ER simultáneamente.
  // Será corregido en Fase 3.
  { codigo: '3101001', nombre: 'Ingresos por Prestación de Servicios', inventario_activo: 0, inventario_pasivo: 452_083.35, sistema: 'megasystem' },
  // 4xxxxx — Egresos en Megasystem
  // Estos códigos se EXCLUYEN de anf_saldos_esf por el filtro de buildSaldosEsf.
  // Su exclusión contribuye al descuadre de 2.122.398,36.
  // KNOWN_BUG en buildSaldosEsf: el filtro ['1','2','3'].includes(codigo.split('.')[0])
  // también excluye TODOS los códigos Megasystem (no solo 4xxx) porque split('.')[0]
  // para '4101001' retorna '4101001' (7 chars), no '4'.
  // Para Contec, '4.01.001'.split('.')[0] = '4' → excluido correctamente.
  { codigo: '4101001', nombre: 'Costo de Ventas',              inventario_activo: 1_122_398.36, inventario_pasivo: 0, sistema: 'megasystem' },
  { codigo: '4201001', nombre: 'Gastos de Administración',     inventario_activo: 1_000_000.00, inventario_pasivo: 0, sistema: 'megasystem' },
];

// ── Subset solo de 3xxx (para probar bug de doble conteo) ─────────────────────
export const ESF_CUENTAS_3XXX = ESF.filter(c => c.codigo.startsWith('3'));

// ── Subset solo de 27xxx (para probar bug de clasificación patrimonio) ─────────
export const ESF_CUENTAS_27XXX = ESF.filter(c => c.codigo.startsWith('27'));

// ── Subset de 4xxx (excluidos — causa del descuadre) ──────────────────────────
export const ESF_CUENTAS_4XXX = ESF.filter(c => c.codigo.startsWith('4'));

// ── ER representativo: salida simulada de buildMovimientosEr ──────────────────
// grupo_er refleja lo que el parser ACTUAL asignaría (incluye bug de default silencioso).
// Los valores son SINTÉTICOS.
export const ER_MOVIMIENTOS_REPRESENTATIVO = [
  {
    codigo: '3101001', nombre: 'Ingresos por Prestación de Servicios',
    sistema: 'megasystem',
    // KNOWN_BUG: clasificarGrupoEr interno del parser asigna 'Gasto Operacional'
    // por defecto para cualquier código que no sea '4','5','6','7','8','9'.
    // '3101001'.split('.')[0] = '3101001' → no coincide → 'Gasto Operacional' (incorrecto).
    grupo_er: 'Gasto Operacional',
    real_mes: 75_000.00, real_ytd: 452_083.35, ppto_mes: 70_000.00, ppto_ytd: 420_000.00,
    real_temporada: 452_083.35, ppto_temporada: 420_000.00,
  },
  {
    codigo: '4101001', nombre: 'Costo de Ventas',
    sistema: 'megasystem',
    // KNOWN_BUG: mismo problema — '4101001'.split('.')[0] = '4101001' → default.
    grupo_er: 'Gasto Operacional',
    real_mes: 187_000.00, real_ytd: 1_122_398.36, ppto_mes: 180_000.00, ppto_ytd: 1_100_000.00,
    real_temporada: 1_122_398.36, ppto_temporada: 1_100_000.00,
  },
];

// ── Input para buildMovimientosEr ─────────────────────────────────────────────
// Simula lo que parseEerrTemp y parseEerrMesMegasystem producirían.
export const ER_TEMP_MAP = new Map([
  ['3101001', {
    nombre: 'Ingresos por Prestación de Servicios',
    desglose: {
      '7': { real: 70_000.00, ppto: 65_000.00 },
      '8': { real: 80_000.00, ppto: 75_000.00 },
      '1': { real: 65_000.00, ppto: 60_000.00 },
      '2': { real: 72_000.00, ppto: 68_000.00 },
      '3': { real: 78_000.00, ppto: 72_000.00 },
      '4': { real: 82_000.00, ppto: 80_000.00 },
      '5': { real: 80_000.00, ppto: 75_000.00 },
      '6': { real: 75_000.00, ppto: 70_000.00 },
    },
  }],
  ['4101001', {
    nombre: 'Costo de Ventas',
    desglose: {
      '1': { real: 187_000.00, ppto: 180_000.00 },
      '2': { real: 195_000.00, ppto: 190_000.00 },
      '3': { real: 200_000.00, ppto: 195_000.00 },
      '4': { real: 210_000.00, ppto: 200_000.00 },
      '5': { real: 185_000.00, ppto: 180_000.00 },
      '6': { real: 145_398.36, ppto: 155_000.00 },
    },
  }],
]);

export const ER_MENSUAL_MAP = new Map([
  ['3101001', {
    nombre: 'Ingresos por Prestación de Servicios',
    desglose: {
      '1': { real: 65_000.00 },
      '2': { real: 72_000.00 },
      '3': { real: 78_000.00 },
      '4': { real: 82_000.00 },
      '5': { real: 80_000.00 },
      '6': { real: 75_083.35 },
    },
  }],
  ['4101001', {
    nombre: 'Costo de Ventas',
    desglose: {
      '1': { real: 187_000.00 },
      '2': { real: 195_000.00 },
      '3': { real: 200_000.00 },
      '4': { real: 210_000.00 },
      '5': { real: 185_000.00 },
      '6': { real: 145_398.36 },
    },
  }],
]);

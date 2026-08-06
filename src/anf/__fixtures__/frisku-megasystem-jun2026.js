/* eslint-disable */
/**
 * FIXTURE: Frisku Foods — Balance y ER junio 2026 (Megasystem)
 *
 * Fuente de los datos: Supabase tabla anf_saldos_esf + anf_movimientos_er.
 * Sin validación directa contra el Excel fuente original de Megasystem.
 *
 * SEPARACIÓN OBLIGATORIA (observación #5):
 *   REAL_AGGREGATES       — valores exactos persistidos en Supabase (validados manualmente)
 *   SYNTHETIC_ACCOUNT_SAMPLES — filas individuales fabricadas ÚNICAMENTE para probar ramas
 *                              del parser y clasificación; NO reproducen el cierre real.
 *
 * La suma de los valores en SYNTHETIC_ACCOUNT_SAMPLES NO debe confundirse con REAL_AGGREGATES.
 *
 * Contexto: este fixture congela el comportamiento del sistema ANTES de implementar
 * SourceAdapter/AccountingProfile (Fases 2–3).
 */

// ── REAL_AGGREGATES ─────────────────────────────────────────────────────────────
// Valores exactos obtenidos de Supabase (anf_saldos_esf, cierre junio 2026, Frisku Foods).
// Validados manualmente por el CFO. No redondear en pruebas.
export const REAL_AGGREGATES = {
  inv_activo:  5_024_481.71,   // Σ inventario_activo de todas las filas ESF de Frisku jun 2026
  inv_pasivo:  2_902_083.35,   // Σ inventario_pasivo de todas las filas ESF de Frisku jun 2026
  /** Descuadre algebraico actual: inv_activo − inv_pasivo = 2.122.398,36
   *  Origen: cuentas 3xxx Megasystem (ingresos) persisten en ESF por bug de buildSaldosEsf
   *  y cuentas 4xxx/gastos que deberían excluirse. */
  descuadre:   2_122_398.36,
};

// ── SYNTHETIC_ACCOUNT_SAMPLES ────────────────────────────────────────────────────
// Filas FABRICADAS para ejercitar ramas del parser y la clasificación ESF/ER.
// Los valores son REPRESENTATIVOS, no del libro mayor real de Frisku Foods.
// Cubre todos los rangos de código Megasystem relevantes (11xxxx–34xxxx + 4xxxxx).
//
// Rangos cubiertos:
//   11xxxx → Activo Circulante         (CORRECT_BEHAVIOR)
//   12xxxx → Activo Fijo               (CORRECT_BEHAVIOR)
//   13xxxx → Otros Activos NC          (CORRECT_BEHAVIOR)
//   21xxxx → Pasivo Circulante         (CORRECT_BEHAVIOR)
//   22xxxx → Pasivo Largo Plazo        (CORRECT_BEHAVIOR)
//   27xxxx → Capital y Reservas        (KNOWN_BUG: clasificado como 'Pasivo No Corriente')
//   31xxxx → Ingresos Operacionales    (KNOWN_BUG: clasificado como 'Patrimonio', debería ser null)
//   33xxxx → Ingresos Financieros      (KNOWN_BUG: ídem 31xxxx)
//   34xxxx → Otros Ingresos            (KNOWN_BUG: ídem 31xxxx)
//   4xxxxx → Egresos (excluidos ESF)   (CORRECT_BEHAVIOR: buildSaldosEsf los excluye)
export const SYNTHETIC_ACCOUNT_SAMPLES = [
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
  // KNOWN_BUG: clasificarSeccionEsf retorna 'Pasivo No Corriente' (primerNivel='2', segundoNivel='7' ≠ '1').
  // Correcto según plan de cuentas Megasystem: 'Patrimonio'.
  // Impacto: patrimonio aparece en Pasivo No Corriente → balance descuadrado en UI.
  // Corrección en Fase 3 al implementar AccountingProfile para Megasystem.
  { codigo: '2701001', nombre: 'Capital Pagado',               inventario_activo: 0, inventario_pasivo: 600_000.00, sistema: 'megasystem' },
  { codigo: '2702001', nombre: 'Reservas Acumuladas',          inventario_activo: 0, inventario_pasivo: 250_000.00, sistema: 'megasystem' },
  // 31xxxx — Ingresos Operacionales Megasystem
  // KNOWN_BUG: clasificarSeccionEsf retorna 'Patrimonio' (primerNivel='3').
  // Correcto: null (3xxx en Megasystem = ingresos, no balance).
  // Doble conteo: aparecen en ESF y en ER simultáneamente.
  { codigo: '3101001', nombre: 'Ingresos por Prestación de Servicios', inventario_activo: 0, inventario_pasivo: 452_083.35, sistema: 'megasystem' },
  // 33xxxx — Ingresos Financieros Megasystem
  // KNOWN_BUG: ídem 31xxxx — clasificarSeccionEsf retorna 'Patrimonio' (debería ser null).
  { codigo: '3301001', nombre: 'Ingresos Financieros',         inventario_activo: 0, inventario_pasivo: 85_000.00,  sistema: 'megasystem' },
  // 34xxxx — Otros Ingresos Megasystem
  // KNOWN_BUG: ídem 31xxxx — clasificarSeccionEsf retorna 'Patrimonio' (debería ser null).
  { codigo: '3401001', nombre: 'Otros Ingresos No Operacionales', inventario_activo: 0, inventario_pasivo: 45_000.00, sistema: 'megasystem' },
  // 4xxxxx — Egresos en Megasystem
  // CORRECT_BEHAVIOR: buildSaldosEsf los EXCLUYE (primer dígito '4' → fuera del filtro ['1','2','3']).
  // Su exclusión histórica contribuye al descuadre de REAL_AGGREGATES.
  { codigo: '4101001', nombre: 'Costo de Ventas',              inventario_activo: 1_122_398.36, inventario_pasivo: 0, sistema: 'megasystem' },
  { codigo: '4201001', nombre: 'Gastos de Administración',     inventario_activo: 1_000_000.00, inventario_pasivo: 0, sistema: 'megasystem' },
];

// ── ESF: alias de SYNTHETIC_ACCOUNT_SAMPLES ──────────────────────────────────────
// Mantenido para compatibilidad con imports existentes en los tests.
export const ESF = SYNTHETIC_ACCOUNT_SAMPLES;

// ── Subsets filtrados por rango ──────────────────────────────────────────────────
export const ESF_CUENTAS_3XXX    = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('3'));
export const ESF_CUENTAS_31XXX   = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('31'));
export const ESF_CUENTAS_33XXX   = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('33'));
export const ESF_CUENTAS_34XXX   = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('34'));
export const ESF_CUENTAS_27XXX   = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('27'));
export const ESF_CUENTAS_4XXX    = SYNTHETIC_ACCOUNT_SAMPLES.filter(c => c.codigo.startsWith('4'));

// ── ER representativo: input para buildMovimientosEr ─────────────────────────────
// Simula salida de parseEerrTemp y parseEerrMesMegasystem.
// Valores SINTÉTICOS.
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

/* eslint-disable */
/**
 * FIXTURE: Allegria Service — Balance y ER junio 2026 (Contec)
 *
 * Fuente: estructura conocida de Contec (códigos con puntos).
 * Datos individuales: SINTÉTICOS (no extraídos de Supabase ni del Excel fuente).
 * No existe validación contra el Excel fuente original de Allegria Service.
 *
 * Incluye:
 *   - Cuentas ESF válidas (activo, pasivo, patrimonio con puntos)
 *   - Cuentas ER válidas (4-9 con puntos)
 *   - Cuentas ER legacy almacenadas en ESF (anomalía conocida: cuentas con
 *     prefijo 4+ que fueron persistidas en anf_saldos_esf por error histórico)
 *
 * Contexto: congela el comportamiento del sistema ANTES de implementar
 * SourceAdapter/AccountingProfile (Fases 2–3).
 */

// ── Cuentas ESF válidas (salida simulada de parseBalanceContec) ───────────────
export const ESF = [
  // 1.01.xxx — Activo Corriente (CORRECT_BEHAVIOR)
  { codigo: '1.01.01.001', nombre: 'Caja',                   inventario_activo: 150_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.01.02.001', nombre: 'Banco BCI CLP',           inventario_activo: 480_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.01.05.001', nombre: 'Clientes Nacionales',     inventario_activo: 920_000.00, inventario_pasivo: 0, sistema: 'contec' },
  // 1.02.xxx — Activo No Corriente (CORRECT_BEHAVIOR)
  { codigo: '1.02.01.001', nombre: 'Edificios',               inventario_activo: 2_500_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.02.01.002', nombre: 'Maquinaria y Equipos',    inventario_activo: 1_100_000.00, inventario_pasivo: 0, sistema: 'contec' },
  // 2.01.xxx — Pasivo Corriente (CORRECT_BEHAVIOR)
  { codigo: '2.01.01.001', nombre: 'Proveedores Nacionales',  inventario_activo: 0, inventario_pasivo: 340_000.00, sistema: 'contec' },
  { codigo: '2.01.03.001', nombre: 'Remuneraciones por Pagar',inventario_activo: 0, inventario_pasivo: 95_000.00, sistema: 'contec' },
  // 2.02.xxx — Pasivo No Corriente (CORRECT_BEHAVIOR)
  { codigo: '2.02.01.001', nombre: 'Deuda Largo Plazo BCI',   inventario_activo: 0, inventario_pasivo: 1_200_000.00, sistema: 'contec' },
  // 3.xx.xxx — Patrimonio (CORRECT_BEHAVIOR — en Contec 3.xxx SÍ es Patrimonio)
  { codigo: '3.01.001',    nombre: 'Capital Social',          inventario_activo: 0, inventario_pasivo: 2_800_000.00, sistema: 'contec' },
  { codigo: '3.02.001',    nombre: 'Utilidades Retenidas',    inventario_activo: 0, inventario_pasivo: 715_000.00, sistema: 'contec' },
];

// ── Cuentas ER legacy almacenadas en ESF (anomalía conocida) ──────────────────
// Estas cuentas tienen prefijo 4+ (resultado) pero fueron persistidas en
// anf_saldos_esf. En un sistema correcto no deberían estar aquí.
// buildSaldosEsf con filtro correcto las EXCLUYE (CORRECT_BEHAVIOR para Contec).
// Su presencia en la DB es deuda técnica a limpiar en Fase 6 (M13).
export const ESF_LEGACY_ER_EN_ESF = [
  { codigo: '4.01.01.001', nombre: 'Ventas de Servicios',        inventario_activo: 0, inventario_pasivo: 850_000.00, sistema: 'contec' },
  { codigo: '5.01.01.001', nombre: 'Costo Directo de Servicios', inventario_activo: 510_000.00, inventario_pasivo: 0, sistema: 'contec' },
];

// ── ESF combinado (válido + legacy) ──────────────────────────────────────────
export const ESF_CON_LEGACY = [...ESF, ...ESF_LEGACY_ER_EN_ESF];

// ── Período T1: mismas cuentas, valores año anterior (sintético) ──────────────
export const ESF_T1 = [
  { codigo: '1.01.01.001', nombre: 'Caja',                   inventario_activo: 120_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.01.02.001', nombre: 'Banco BCI CLP',           inventario_activo: 390_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.01.05.001', nombre: 'Clientes Nacionales',     inventario_activo: 780_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.02.01.001', nombre: 'Edificios',               inventario_activo: 2_500_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '1.02.01.002', nombre: 'Maquinaria y Equipos',    inventario_activo: 900_000.00, inventario_pasivo: 0, sistema: 'contec' },
  { codigo: '2.01.01.001', nombre: 'Proveedores Nacionales',  inventario_activo: 0, inventario_pasivo: 280_000.00, sistema: 'contec' },
  { codigo: '2.02.01.001', nombre: 'Deuda Largo Plazo BCI',   inventario_activo: 0, inventario_pasivo: 1_500_000.00, sistema: 'contec' },
  { codigo: '3.01.001',    nombre: 'Capital Social',          inventario_activo: 0, inventario_pasivo: 2_800_000.00, sistema: 'contec' },
  // 2.01.03.001 ausente en T1 → variación desde $0 → es_material=true (cuenta nueva)
  // 3.02.001 ausente en T1 → ídem
];

// ── ER representativo Contec ──────────────────────────────────────────────────
export const ER_TEMP_MAP = new Map([
  ['4.01.01.001', {
    nombre: 'Ventas de Servicios',
    desglose: {
      '7': { real: 140_000.00, ppto: 130_000.00 },
      '8': { real: 145_000.00, ppto: 135_000.00 },
      '1': { real: 138_000.00, ppto: 128_000.00 },
      '2': { real: 142_000.00, ppto: 132_000.00 },
      '3': { real: 148_000.00, ppto: 140_000.00 },
      '4': { real: 137_000.00, ppto: 130_000.00 },
      '5': { real: 143_000.00, ppto: 135_000.00 },
      '6': { real: 157_000.00, ppto: 150_000.00 },
    },
  }],
  ['5.01.01.001', {
    nombre: 'Costo Directo de Servicios',
    desglose: {
      '1': { real: 85_000.00, ppto: 80_000.00 },
      '2': { real: 88_000.00, ppto: 82_000.00 },
      '3': { real: 90_000.00, ppto: 85_000.00 },
      '4': { real: 82_000.00, ppto: 78_000.00 },
      '5': { real: 84_000.00, ppto: 80_000.00 },
      '6': { real: 81_000.00, ppto: 80_000.00 },
    },
  }],
]);

export const ER_MENSUAL_MAP = new Map([
  ['4.01.01.001', {
    nombre: 'Ventas de Servicios',
    desglose: {
      '1': { real: 138_000.00 },
      '2': { real: 142_000.00 },
      '3': { real: 148_000.00 },
      '4': { real: 137_000.00 },
      '5': { real: 143_000.00 },
      '6': { real: 142_000.00 },
    },
  }],
  ['5.01.01.001', {
    nombre: 'Costo Directo de Servicios',
    desglose: {
      '1': { real: 85_000.00 },
      '2': { real: 88_000.00 },
      '3': { real: 90_000.00 },
      '4': { real: 82_000.00 },
      '5': { real: 84_000.00 },
      '6': { real: 81_000.00 },
    },
  }],
]);

/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Formato numérico VISIBLE de Créditos y Reportes (oct-2026): formato chileno.
// Solo presentación: no cambia valores guardados ni cómo se leen los campos de
// entrada (InputNumero y los formularios siguen igual).
//   miles con punto, decimales con coma: 1.234.567,89
//   decimales por moneda: CLP 0 · UF 4 · USD/EUR/PEN y el resto 2
//   US$ para dólares (en Chile «$» se lee como pesos)
// ═══════════════════════════════════════════════════════════════════
export const decimalesVista = (moneda) => (moneda === 'CLP' ? 0 : moneda === 'UF' ? 4 : 2);
const vacio = (n) => n === null || n === undefined || n === '' || isNaN(Number(n));

// Número sin símbolo, con `dec` decimales fijos.
export function numCL(n, dec = 2) {
  if (vacio(n)) return '—';
  return Number(n).toLocaleString('es-CL', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
// Monto en su moneda: «US$ 256.066,67» · «CLP 95.000.000» · «UF 500,0000».
export function montoCL(n, moneda = 'USD', dec = decimalesVista(moneda)) {
  if (vacio(n)) return '—';
  const v = Number(n), s = v < 0 ? '-' : '';
  return `${s}${!moneda || moneda === 'USD' ? 'US$' : moneda} ${numCL(Math.abs(v), dec)}`;
}
// Dólares redondeados (KPI y tablas en US$): «US$ 514.551».
export const usdCL = (n, dec = 0) => montoCL(n, 'USD', dec);

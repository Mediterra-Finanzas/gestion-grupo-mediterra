/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Cómo se MUESTRA un capital de Créditos (oct-2026). Solo presentación: las cifras
// salen de creditos.js sin cambios.
//   · no_determinable: no hay capital identificado y sí hay cuotas sin desglose
//     → «No determinable: sin desglose» (nunca 0).
//   · parcial: hay capital conocido, pero también cuotas sin desglose, por conciliar o
//     sin tipo de cambio → el capital conocido se rotula «parcial» y esos importes se
//     muestran APARTE, sin sumarlos.
//   · determinado: nada de lo anterior → el número tal cual; un 0 aquí es un 0 real.
// Lo usan las vistas de Créditos (CeldaCapital) y los Reportes.
// ═══════════════════════════════════════════════════════════════════
export const NO_DETERMINABLE = 'No determinable: sin desglose';
export const EPS_CAPITAL = 0.005;
const hay = (x) => Math.abs(Number(x) || 0) > EPS_CAPITAL;

// sinTC: lista de importes no convertidos [{moneda, monto}] o un número (> 0 = hay).
export function estadoCapital({ capital = 0, sinDesglose = 0, porConciliar = 0, sinTC = [] } = {}) {
  const stc = Array.isArray(sinTC) ? sinTC.some(x => hay(x && x.monto)) : hay(sinTC);
  if (!hay(capital) && hay(sinDesglose)) return 'no_determinable';
  if (hay(sinDesglose) || hay(porConciliar) || stc) return 'parcial';
  return 'determinado';
}
// Texto del capital. `fmt` formatea el número (p. ej. usdCL).
export function textoCapital(x, fmt) {
  const e = estadoCapital(x);
  if (e === 'no_determinable') return NO_DETERMINABLE;
  return e === 'parcial' ? `${fmt(x.capital || 0)} (parcial)` : fmt(x.capital || 0);
}

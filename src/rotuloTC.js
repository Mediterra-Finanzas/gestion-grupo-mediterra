/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// Rótulo ÚNICO de un tipo de cambio de Créditos (oct-2026). Solo presentación:
// el cálculo sigue en creditos.js (infoTC / ufPorFecha) y no se toca.
//
// Convención: el TC es «unidades de la moneda por 1 US$» (lo que usa infoTC):
//   CLP 955 = 955 CLP por 1 US$ · UF 0,023796567 = UF por 1 US$ = USD-CLP ÷ UF-CLP.
// Para pasar un importe a US$ se DIVIDE: 500 UF ÷ 0,023796567 UF/US$ = US$ 21.011,43.
// Se muestra con 8 cifras significativas (mínimo 2 decimales) a partir del valor EXACTO
// (1 / factor), no del redondeo a 6 decimales que infoTC guarda en `tc`: con 0,023797
// la división daba US$ 21.011,05 en vez de 21.011,43.
// Lo usan la pantalla de Créditos (FinanzasModule → valorTC) y los Reportes.
// ═══════════════════════════════════════════════════════════════════
export const CIFRAS_TC = 8;

// Valor exacto del TC a partir de lo que traiga el objeto: factor (infoTC), pares UF o el tc guardado.
export function tcExacto(t) {
  if (!t) return null;
  if (Number(t.factor) > 0) return 1 / Number(t.factor);
  if (Number(t.usdCLP) > 0 && Number(t.ufCLP) > 0) return Number(t.usdCLP) / Number(t.ufCLP);
  return Number(t.tc) > 0 ? Number(t.tc) : null;
}
export function decimalesTC(x) {
  if (!(x > 0)) return 2;
  const d = CIFRAS_TC - 1 - Math.floor(Math.log10(x));
  // sin ceros de relleno más allá de 2 decimales: 955 → 955,00 · 0,85 → 0,85
  let k = Math.max(2, d);
  while (k > 2 && Number(x.toFixed(k - 1)) === Number(x.toFixed(k))) k--;
  return k;
}
export const numeroTC = (x) => (x > 0 ? Number(x.toFixed(decimalesTC(x))) : null);
// `locale`: la pantalla de Créditos formatea en en-US (como el resto de sus montos); los Reportes en es-CL.
// El valor, los decimales, la unidad y el sentido de la división son los mismos en ambos.
export const fmtTC = (x, locale = 'es-CL') => (x > 0 ? x.toLocaleString(locale, { minimumFractionDigits: decimalesTC(x), maximumFractionDigits: decimalesTC(x) }) : '—');
// «0,023796567 UF por 1 US$»
export const rotuloTC = (x, moneda, locale = 'es-CL') => `${fmtTC(x, locale)} ${moneda || ''} por 1 US$`.replace(/\s+por/, ' por');
// UF: la identidad con los dos pares, en el sentido correcto (CLP/US$ ÷ CLP/UF = UF/US$).
export function identidadUF(usdCLP, ufCLP, locale = 'es-CL') {
  const f2 = (v) => Number(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${f2(usdCLP)} CLP por 1 US$ ÷ ${f2(ufCLP)} CLP por 1 UF`;
}

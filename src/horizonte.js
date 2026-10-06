/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// HORIZONTE DEL FLUJO — fuente única
//
// El horizonte y el mes de corte los define la app, no cada módulo ni
// cada prueba: así nadie fija un mes a mano y después diverge.
// ═══════════════════════════════════════════════════════════════════
export const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function generarMeses() {
  const out = [];
  let y = 2026, m = 3;                 // Empieza en Apr-26
  while (out.length < 63) {            // Apr-26 a Jun-31 = 63 meses
    out.push({ label: `${MN[m]}-${String(y).slice(2)}`, y, m, idx: out.length });
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

export const MESES_INFO = generarMeses();
export const MESES = MESES_INFO.map(x => x.label);

/** Índice del mes dentro del horizonte. <0 = fuera del horizonte o sin fecha. */
export function mIdx(label) { return MESES.indexOf(label); }

/** Etiqueta del mes en curso según el reloj, no un mes fijado a mano. */
export function mesActual(hoy = new Date()) {
  return `${MN[hoy.getMonth()]}-${String(hoy.getFullYear()).slice(2)}`;
}

/** Corte del saldo acumulado: el mes en curso dentro del horizonte. <0 si no está. */
export function mesIdxActual(hoy = new Date()) { return mIdx(mesActual(hoy)); }

/** Rótulo del horizonte derivado de la serie real (no escrito a mano):
 *  "Apr-2026 → Jun-2031 · 63 meses". */
export function rotuloHorizonte(meses = MESES_INFO) {
  if (!meses.length) return "";
  const a = meses[0], b = meses[meses.length - 1];
  return `${MN[a.m]}-${a.y} → ${MN[b.m]}-${b.y} · ${meses.length} meses`;
}

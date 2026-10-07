/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// CONVERSIÓN DE SALDOS BANCARIOS A US$ — fuente única (política maestro_tc_v1)
//
// Una sola regla para todas las pantallas y exportaciones:
//   · TC de maestro_tc VIGENTE EN LA FECHA DEL SALDO; si ese día no hay, la última
//     cotización anterior dentro de MAX_DIAS_HABILES días hábiles.
//     DEFINICIÓN: día hábil = lunes a viernes. Se excluyen SOLO sábados y domingos;
//     los feriados cuentan como hábiles (no hay calendario oficial de feriados en la
//     app). Efecto: tras un feriado el plazo es un día más corto, nunca más largo.
//     La antigüedad usada se guarda y se muestra (días hábiles y corridos).
//   · CLP: USD-CLP (dólar observado, mindicador). EUR: EUR-USD (BCE) o USD-EUR.
//     PEN: USD-PEN solo con fuente "manual" (no hay fuente automática).
//   · Sin cotización dentro del límite → la cuenta queda SIN PARIDAD (no suma y el
//     total se rotula INCOMPLETO). Nunca se usa 0 ni un TC fijo.
//
// Saldos HISTÓRICOS vs NUEVOS
//   · Nuevo: se guarda con { usd, tc, tcPar, tcOp, tcFecha, tcFuente,
//     tcDiasHabiles, tcPolitica:"maestro_tc_v1" } (o usd:null + tcEstado:"sin_tc").
//   · Histórico: registro SIN tcPolitica. Se respeta su `usd` guardado (TC de
//     open.er-api al momento de guardar; ni fecha ni fuente quedaron registradas) y
//     se rotula "TC histórico". No se recalcula ni se reescribe en bloque: pasa a la
//     política solo cuando alguien vuelve a guardar ESE saldo.
// ═══════════════════════════════════════════════════════════════════

export const POLITICA_TC = "maestro_tc_v1";
export const MAX_DIAS_HABILES = 5;

// Par → cómo pasar a US$: "div" = monto / valor (1 USD = valor MONEDA);
// "mul" = monto × valor (1 MONEDA = valor USD).
export const PARES_POLITICA = {
  clp: [{ par: "USD-CLP", op: "div" }],
  eur: [{ par: "EUR-USD", op: "mul" }, { par: "USD-EUR", op: "div" }],
  pen: [{ par: "USD-PEN", op: "div", fuentes: ["manual"] }],
};

const r2 = (x) => Math.round(x * 100) / 100;

// "AAAA-MM-DD" como fecha local (new Date("AAAA-MM-DD") es UTC y en Chile corre el día)
export function fechaLocalTC(d) {
  if (d instanceof Date) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const m = typeof d === "string" && d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const x = new Date(d); return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

// Días hábiles (lun–vie) en (desde, hasta]. 0 si es el mismo día.
export function diasCorridosEntre(desde, hasta) {
  const a = fechaLocalTC(desde), b = fechaLocalTC(hasta);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
}

export function diasHabilesEntre(desde, hasta) {
  const a = fechaLocalTC(desde), b = fechaLocalTC(hasta);
  if (!(a < b)) return 0;
  let n = 0; const d = new Date(a);
  while (d < b) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return n;
}

const iso = (d) => { const x = fechaLocalTC(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };

// Cotización aplicable a un saldo en `moneda` con fecha `fechaSaldo`.
// → { ok:true, tc, par, op, fechaTC, fuente, diasHabiles } | { ok:false, motivo }
export function cotizacionSaldo(moneda, fechaSaldo, tcData) {
  const mon = String(moneda || "").toLowerCase();
  if (mon === "usd") return { ok: true, tc: 1, par: "USD", op: "mul", fechaTC: iso(fechaSaldo), fuente: "—", diasHabiles: 0 };
  const cands = PARES_POLITICA[mon];
  if (!cands) return { ok: false, motivo: `moneda ${mon.toUpperCase()} sin regla de conversión` };
  if (!tcData || typeof tcData !== "object") return { ok: false, motivo: "maestro_tc no disponible" };
  if (!fechaSaldo) return { ok: false, motivo: "saldo sin fecha" };
  const fs = iso(fechaSaldo);
  const motivos = [];
  for (const c of cands) {
    const serie = (tcData[c.par] || []).filter(p => p && p.fecha && Number(p.valor) > 0 && p.fecha.slice(0, 10) <= fs
      && (!c.fuentes || c.fuentes.includes(p.fuente)));
    if (!serie.length) { motivos.push(`sin ${c.par}${c.fuentes ? " " + c.fuentes.join("/") : ""} al ${fs}`); continue; }
    const ult = serie.reduce((a, b) => (b.fecha > a.fecha ? b : a));
    const dh = diasHabilesEntre(ult.fecha, fs);
    if (dh > MAX_DIAS_HABILES) { motivos.push(`${c.par} más reciente del ${ult.fecha.slice(0, 10)} (${dh} días hábiles antes; máximo ${MAX_DIAS_HABILES})`); continue; }
    return { ok: true, tc: Number(ult.valor), par: c.par, op: c.op, fechaTC: ult.fecha.slice(0, 10), fuente: ult.fuente || "sin fuente", diasHabiles: dh, diasCorridos: diasCorridosEntre(ult.fecha, fs) };
  }
  return { ok: false, motivo: motivos.join("; ") };
}

// Campos a guardar junto a un saldo NUEVO.
export function convertirSaldoNuevo(monto, moneda, fechaSaldo, tcData) {
  const m = Number(monto);
  if ((moneda || "usd") === "usd") return { usd: m, tcPolitica: POLITICA_TC };
  const c = cotizacionSaldo(moneda, fechaSaldo, tcData);
  if (!c.ok) return { usd: null, tcPolitica: POLITICA_TC, tcEstado: "sin_tc", tcMotivo: c.motivo };
  const usd = c.op === "div" ? m / c.tc : m * c.tc;
  return { usd: r2(usd), tc: c.tc, tcPar: c.par, tcOp: c.op, tcFecha: c.fechaTC, tcFuente: c.fuente, tcDiasHabiles: c.diasHabiles, tcDiasCorridos: c.diasCorridos, tcPolitica: POLITICA_TC };
}

const fmtTC = (x) => Number(x).toLocaleString("es-CL", { maximumFractionDigits: 4 });
export const textoAntiguedad = (dh, dc) => (!dh && !dc ? "del mismo día" : `${dh || 0} día${dh === 1 ? "" : "s"} hábil${dh === 1 ? "" : "es"}${dc != null ? ` (${dc} corrido${dc === 1 ? "" : "s"})` : ""} antes del saldo`);

// ¿maestro_tc cambió después de confirmar el saldo? El saldo NO se recalcula: se avisa.
// → null si no aplica o coincide; si no, { actual:{tc,par,fechaTC,fuente}, guardado:{...}, usdConActual }
export function revisarCotizacionGuardada(rec, moneda, tcData) {
  if (!rec?.tcPolitica || rec.usd == null || !tcData || String(moneda || rec.moneda) === "usd") return null;
  const q = cotizacionSaldo(moneda || rec.moneda, rec.fecha, tcData);
  if (!q.ok) return { actual: null, guardado: { tc: rec.tc, par: rec.tcPar, fechaTC: rec.tcFecha, fuente: rec.tcFuente }, motivo: q.motivo };
  if (q.par === rec.tcPar && q.fechaTC === rec.tcFecha && Number(q.tc) === Number(rec.tc)) return null;
  const m = Number(rec.monto) || 0;
  return { actual: { tc: q.tc, par: q.par, fechaTC: q.fechaTC, fuente: q.fuente }, guardado: { tc: rec.tc, par: rec.tcPar, fechaTC: rec.tcFecha, fuente: rec.tcFuente },
    usdConActual: r2(q.op === "div" ? m / q.tc : m * q.tc) };
}

// Lectura ÚNICA del US$ de un saldo guardado (todas las pantallas y exportaciones).
// → { usd:number|null, estado:"usd"|"politica"|"historico"|"sin_paridad", etiqueta, motivo? }
export function leerUsdSaldo(rec, moneda) {
  const mon = String(moneda || rec?.moneda || "usd").toLowerCase();
  const monto = Number(rec?.monto) || 0;
  if (mon === "usd") return { usd: monto, estado: "usd", etiqueta: "US$" };
  const u = rec?.usd == null ? NaN : Number(rec.usd);
  if (rec?.tcPolitica) {
    if (!Number.isFinite(u)) return { usd: null, estado: "sin_paridad", etiqueta: "sin paridad", motivo: rec.tcMotivo || "sin cotización" };
    return { usd: u, estado: "politica", etiqueta: `TC ${fmtTC(rec.tc)} ${rec.tcPar} al ${rec.tcFecha} · ${rec.tcFuente} · ${textoAntiguedad(rec.tcDiasHabiles, rec.tcDiasCorridos)}` };
  }
  if (!Number.isFinite(u)) return { usd: null, estado: "sin_paridad", etiqueta: "sin paridad", motivo: "guardado sin TC" };
  if (u === 0 && monto !== 0) return { usd: null, estado: "sin_paridad", etiqueta: "sin paridad", motivo: "se guardó US$ 0: la fuente no traía la moneda" };
  return { usd: u, estado: "historico", etiqueta: "TC histórico (fuente y fecha no registradas)" };
}

// Saldo VIGENTE por cuenta (banco + moneda) de una empresa: el registro más reciente.
//   excluirFuturas: descarta fechas posteriores a `hoy`
//   antesDe: solo fechas estrictamente anteriores (saldo al inicio de una semana)
export function saldosVigentes(saldosBancos, empNombre, { excluirFuturas = false, hoy = new Date(), antesDe = null } = {}) {
  if (!saldosBancos) return [];
  const lim = excluirFuturas ? fechaLocalTC(hoy) : null;
  const porCuenta = {};
  Object.entries(saldosBancos).forEach(([key, rec]) => {
    const parts = key.split("||");
    if (parts[0] !== empNombre) return;
    if (!rec?.monto || !rec?.fecha) return;
    const f = fechaLocalTC(rec.fecha);
    if (isNaN(f.getTime())) return;
    if (lim && f > lim) return;
    if (antesDe && !(f < antesDe)) return;
    const moneda = parts[2] || rec.moneda || "usd";
    const k = `${parts[1]}||${moneda}`;
    if (!porCuenta[k] || fechaLocalTC(porCuenta[k].rec.fecha) < f) porCuenta[k] = { key, banco: parts[1], moneda, rec };
  });
  return Object.values(porCuenta);
}

// Total US$ de una empresa con su detalle (cuentas, conversión, sin paridad).
export function totalSaldosUSD(saldosBancos, empNombre, opts = {}) {
  const cuentas = saldosVigentes(saldosBancos, empNombre, opts).map(c => ({ ...c, empresa: empNombre, monto: Number(c.rec.monto), fecha: c.rec.fecha, ...leerUsdSaldo(c.rec, c.moneda) }));
  const total = cuentas.reduce((a, c) => a + (c.usd || 0), 0);
  return { total, encontrado: cuentas.length > 0, cuentas, sinParidad: cuentas.filter(c => c.estado === "sin_paridad") };
}

// Texto para el pie del Excel: cada cuenta no-USD con su conversión.
export function textoConversionSaldos(cuentas) {
  const no = (cuentas || []).filter(c => c.estado !== "usd");
  if (!no.length) return null;
  const f = (x) => Number(x).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  return "Conversión de saldos a US$ (política maestro_tc_v1): " + no.map(c =>
    `${c.empresa} · ${c.banco} ${String(c.moneda).toUpperCase()} ${f(c.monto)} al ${c.fecha} → ` +
    (c.usd == null ? `SIN PARIDAD (${c.motivo})` : `US$ ${f(c.usd)} · ${c.etiqueta}`)).join(" | ");
}

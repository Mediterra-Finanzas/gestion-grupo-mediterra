/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// SALDO BANCARIO EN US$ POR EMPRESA — fuente única
//
// Lo usan, con el MISMO cálculo:
//   · la pestaña Saldos Bancos (total por empresa, consolidado, Chile/Perú)
//   · el flujo por empresa (fila «Saldo Banco (USD)» y saldo inicial del mes en curso)
//   · el consolidado en pantalla y su KPI «Saldo Inicial Consolidado»
//   · el Excel individual y el consolidado (saldo inicial del mes en curso)
//   · el reporte semanal
//
// Antes había cinco copias de esta regla y no coincidían:
//   · Saldos Bancos convertía cada cuenta no-US$ con la paridad EN VIVO de
//     open.er-api (la del momento en que se abre la pestaña), mientras el flujo y
//     el Excel sumaban el `usd` GUARDADO con el saldo (la paridad del momento en
//     que se registró). Una cuenta en CLP daba un US$ distinto en cada pantalla, y
//     la pestaña rotulaba su total como «= saldo inicial del flujo».
//   · El Excel (getSaldoBancoInicial) no excluía saldos con fecha futura; el
//     flujo en pantalla sí.
//   · Saldos Bancos sumaba un saldo sin fecha o sin `usd` guardado (con la
//     paridad en vivo); el flujo y el Excel no.
//
// Criterio único (el que ya usaban el flujo en pantalla y el Excel):
//   · Conjunto: por empresa, el registro más reciente de cada cuenta
//     (banco + moneda) con monto distinto de 0 y fecha no posterior a `hoy`.
//   · US$: cuenta en USD → el monto. Otra moneda → el `usd` guardado al
//     registrar el saldo (paridad open.er-api de ese momento). Si no hay `usd`
//     guardado (o se guardó 0 porque la fuente no traía la moneda), la cuenta
//     queda SIN TC: no suma y se informa. Nunca se inventa una paridad.
//   · Sin redondeo: el total se usa con todos sus decimales; solo la
//     presentación redondea (pantalla a 0 decimales, celda Excel `$#,##0`).
//
// La paridad en vivo sigue mostrándose en Saldos Bancos, pero como dato
// informativo aparte («a paridad de hoy»), con la diferencia por tipo de cambio.
// ═══════════════════════════════════════════════════════════════════

// Fecha del saldo con la MISMA lectura que usaba el flujo (`new Date(fecha)`),
// para no mover qué saldo queda dentro o fuera respecto de lo que ya se veía.
const fechaDe = (s) => new Date(s);

// US$ de un registro según el criterio único. Devuelve también la paridad
// implícita (monto / usd) para poder reconstruir la conversión.
//   estado: "usd" | "guardado" | "sin_tc"
export function usdDeSaldo(rec, moneda) {
  const mon = String(moneda || rec?.moneda || "usd").toLowerCase();
  const monto = Number(rec?.monto) || 0;
  if (mon === "usd") return { usd: monto, estado: "usd", tc: null };
  const u = rec?.usd == null ? NaN : Number(rec.usd);
  if (!Number.isFinite(u) || (u === 0 && monto !== 0)) return { usd: null, estado: "sin_tc", tc: null };
  // clp/pen: unidades de moneda por 1 US$ · eur: US$ por 1 EUR
  const tc = u === 0 ? null : (mon === "eur" ? u / monto : monto / u);
  return { usd: u, estado: "guardado", tc };
}

// Cuentas vigentes de una empresa (una por banco + moneda), con su US$.
export function cuentasSaldoEmpresa(saldosBancos, empNombre, { hoy = new Date() } = {}) {
  if (!saldosBancos) return [];
  const porCuenta = {};
  Object.entries(saldosBancos).forEach(([key, rec]) => {
    const parts = key.split("||");
    if (parts[0] !== empNombre) return;
    if (!rec?.monto || !rec?.fecha) return;
    const f = fechaDe(rec.fecha);
    if (isNaN(f.getTime()) || f > hoy) return;
    const moneda = parts[2] || rec.moneda || "usd";
    const cuentaKey = `${parts[1]}||${moneda}`;
    const ex = porCuenta[cuentaKey];
    if (!ex || fechaDe(ex.rec.fecha) < f) porCuenta[cuentaKey] = { key, banco: parts[1], moneda, rec };
  });
  return Object.values(porCuenta).map(c => ({
    key: c.key, banco: c.banco, moneda: c.moneda,
    monto: Number(c.rec.monto), fecha: c.rec.fecha,
    ...usdDeSaldo(c.rec, c.moneda),
  }));
}

// Por qué un registro guardado NO entra al saldo (para decirlo en pantalla).
export function motivoExclusion(rec, { hoy = new Date() } = {}) {
  if (!rec || rec.monto == null || Number(rec.monto) === 0) return null; // sin saldo: nada que explicar
  if (!rec.fecha) return "sin fecha: no entra al saldo inicial";
  const f = fechaDe(rec.fecha);
  if (isNaN(f.getTime())) return "fecha inválida: no entra al saldo inicial";
  if (f > hoy) return "fecha futura: no entra al saldo inicial";
  return null;
}

// Total US$ de la empresa. `total` es null si no hay ninguna cuenta vigente
// (el llamador decide el respaldo, p. ej. el saldo base de la empresa).
export function saldoBancoEmpresaUSD(saldosBancos, empNombre, opts = {}) {
  const cuentas = cuentasSaldoEmpresa(saldosBancos, empNombre, opts);
  let total = 0;
  cuentas.forEach(c => { if (c.usd != null) total += c.usd; });
  return {
    total: cuentas.length ? total : null,
    cuentas,
    sinTC: cuentas.filter(c => c.estado === "sin_tc"),
  };
}

// Valor de una cuenta a la paridad EN VIVO (solo informativo).
// fx: { clp, eur, pen, usd } = US$ por 1 unidad de moneda.
export function usdAParidadVivo(monto, moneda, fx) {
  if (!fx || monto == null) return null;
  const f = fx[String(moneda || "usd").toLowerCase()];
  return f == null ? null : Number(monto) * f;
}

const fmt = (x, dec) => Number(x).toLocaleString("es-CL", { minimumFractionDigits: dec, maximumFractionDigits: dec });

// Nota para el pie del Excel: de qué cuentas, fechas y paridades sale el
// saldo inicial, para que el archivo se pueda reconstruir sin la app.
export function notasSaldoInicial(saldosBancos, empNombre, { hoy = new Date(), mesLabel = "", fallback = null } = {}) {
  const r = saldoBancoEmpresaUSD(saldosBancos, empNombre, { hoy });
  const corte = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  if (r.total == null) {
    return [`Saldo inicial${mesLabel ? ` ${mesLabel}` : ""}: sin saldos bancarios vigentes al ${corte}; se usa el saldo base de la empresa (US$ ${fmt(Number(fallback) || 0, 2)}).`];
  }
  const incompleto = avisoSaldoIncompleto(r);
  const notas = [
    ...(incompleto ? [incompleto] : []),
    `Saldo inicial${mesLabel ? ` ${mesLabel}` : ""} = US$ ${fmt(r.total, 2)}${incompleto ? " (INCOMPLETO)" : ""}: saldos bancarios vigentes al ${corte} (último saldo de cada cuenta). ` +
    `Cuentas en otra moneda al TC guardado al registrar cada saldo (open.er-api), el mismo valor que muestran Saldos Bancos y el flujo en pantalla.`,
  ];
  r.cuentas.forEach(c => {
    const mon = String(c.moneda).toUpperCase();
    const base = `· ${c.banco} ${mon} ${fmt(c.monto, 2)} al ${c.fecha}`;
    if (c.estado === "usd") notas.push(`${base} → US$ ${fmt(c.usd, 2)}`);
    else if (c.estado === "sin_tc") notas.push(`${base} → SIN TC guardado: no suma (volver a guardar el saldo con paridad).`);
    else notas.push(`${base} → TC ${fmt(c.tc, 4)} ${c.moneda === "eur" ? "US$/EUR" : `${mon}/US$`} → US$ ${fmt(c.usd, 2)}`);
  });
  return notas;
}

// Advertencia de saldo INCOMPLETO: hay cuentas vigentes sin conversión válida a
// US$ (sin `usd` guardado). Su monto queda fuera del total, así que el total no
// es el saldo real de la empresa. Se nombra cada cuenta con su monto en la moneda
// original para que se vea qué falta. null si el total está completo.
export function avisoSaldoIncompleto(r, empNombre = "") {
  const sin = r?.sinTC || [];
  if (!sin.length) return null;
  const det = sin.map(c => `${c.banco} ${String(c.moneda).toUpperCase()} ${fmt(c.monto, 2)} al ${c.fecha}`).join("; ");
  return `Saldo bancario INCOMPLETO${empNombre ? ` (${empNombre})` : ""}: ${sin.length} cuenta(s) sin TC guardado quedan excluidas del total en US$ (${det}). ` +
    `Vuelva a guardar esos saldos con la paridad cargada.`;
}

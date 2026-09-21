/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// ANTICIPOS CON REALIZACIONES — Allegria Foods
//
// Un anticipo se pacta en US$/kg (acordado) y se cobra/paga en uno o más
// eventos reales (realizaciones), cada uno con monto FIJO en USD y fecha.
// Lo ya cobrado/pagado NO se vuelve a proyectar en el flujo (ya está en la
// caja), pero SÍ se descuenta de la liquidación final.
//
//   acordado   = kilos × US$/kg            (recalcula si cambian kilos/tarifa)
//   realizado  = Σ realizaciones vigentes  (histórico: NUNCA recalcula)
//   pendiente  = cerrado ? 0 : MAX(0, acordado − realizado)
//   descLiq    = realizado + pendiente     (lo que se descuenta de la liq.)
//
// Casos que cubre el modelo:
//   · realización parcial    → pendiente = resto; descLiq = acordado
//   · realización total      → pendiente = 0;     descLiq = realizado
//   · kilos/tarifa a la baja → acordado baja, realizado queda intacto
//   · realizado > acordado   → pendiente = 0;     descLiq = realizado
//   · anticipo cerrado       → pendiente = 0;     descLiq = realizado
//                              (el saldo no cobrado se traslada a la liq.)
//
// Sobre-anticipo: si Σ descLiq supera la venta (o el costo neto), la
// liquidación queda en 0 y el exceso se expone como `excedente`. NO se
// genera automáticamente una devolución: es una decisión del CFO.
// ═══════════════════════════════════════════════════════════════════

const n = (x) => Number(x) || 0;

// ── Identificadores estables ──────────────────────────────────────
// Anclan las realizaciones a su anticipo aunque se reordenen las filas.
function uid(pref) {
  return `${pref}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export function nuevoIdAnticipo()    { return uid("ant"); }
export function nuevoIdRealizacion() { return uid("rea"); }

// Asegura que un anticipo tenga id y arreglo de realizaciones (no muta).
export function normalizarAnticipo(a) {
  const base = a || {};
  return {
    ...base,
    id: base.id || nuevoIdAnticipo(),
    realizaciones: Array.isArray(base.realizaciones) ? base.realizaciones : [],
    cerrado: !!base.cerrado,
  };
}

// ── Magnitudes de un anticipo ─────────────────────────────────────
// `base` = kilos (o unidades) vigentes de la fruta/producto.
export function antAcordado(a, base) {
  return n(a?.usd_kg) * n(base);
}

// Realizaciones vigentes = las NO anuladas. Las anuladas se conservan en el
// arreglo para trazabilidad (regla: nunca borrar en silencio).
export function realizacionesVigentes(a) {
  return (a?.realizaciones || []).filter(r => r && !r.anulada);
}

export function antRealizado(a) {
  return realizacionesVigentes(a).reduce((s, r) => s + n(r.usd), 0);
}

export function antPendiente(a, base) {
  if (a?.cerrado) return 0;
  return Math.max(0, antAcordado(a, base) - antRealizado(a));
}

// Lo que el anticipo descuenta de la liquidación: lo ya entregado más lo que
// falta por entregar. Equivale a MAX(acordado, realizado) cuando no está
// cerrado, y a `realizado` cuando sí lo está.
export function antDescuentoLiq(a, base) {
  return antRealizado(a) + antPendiente(a, base);
}

// ── Resumen de una lista de anticipos ─────────────────────────────
// `total` = venta (kg × FOB) o costo neto (kg × precio neto productor).
//
// opts.esProyectable(a) → ¿el pendiente de este anticipo llega al flujo?
// Un anticipo sin mes (o con un mes fuera del horizonte) no se puede
// proyectar; en ese caso su pendiente NO se descuenta de la liquidación, de
// modo que el dinero no desaparece del flujo: se cobra/paga al liquidar.
// (Es el mismo comportamiento que tiene hoy el módulo para esas filas.)
export function resumenAnticipos(items, base, total = 0, opts = {}) {
  const arr = Array.isArray(items) ? items : [];
  const proyectable = typeof opts.esProyectable === "function" ? opts.esProyectable : () => true;
  let acordado = 0, realizado = 0, pendiente = 0, pendienteSinMes = 0;
  arr.forEach(a => {
    acordado  += antAcordado(a, base);
    realizado += antRealizado(a);
    const pend = antPendiente(a, base);
    if (proyectable(a)) pendiente += pend;
    else                pendienteSinMes += pend;
  });
  const descuentoLiq = realizado + pendiente;
  const t = n(total);
  return {
    acordado,
    realizado,
    pendiente,                 // pendiente que sí se proyecta en su mes
    pendienteSinMes,           // pendiente sin mes válido → cae en la liquidación
    descuentoLiq,
    liquidacion: Math.max(0, t - descuentoLiq),
    // Exceso de anticipos por sobre la venta/costo. Se muestra, no se compensa.
    excedente: Math.max(0, descuentoLiq - t),
    // Lo que queda por mover en el flujo desde hoy.
    flujoPendiente: pendiente + Math.max(0, t - descuentoLiq),
  };
}

// ── Alta / corrección de realizaciones (con trazabilidad) ─────────
// Devuelven un anticipo NUEVO; no mutan el original.
export function agregarRealizacion(a, { fecha, usd, nota = "", usuario = "" } = {}) {
  const ant = normalizarAnticipo(a);
  const rea = {
    id: nuevoIdRealizacion(),
    fecha: fecha || "",
    usd: n(usd),
    nota: String(nota || ""),
    usuario: String(usuario || ""),
    ts: new Date().toISOString(),
  };
  return { ...ant, realizaciones: [...ant.realizaciones, rea] };
}

// Corregir = anular la realización errada (queda en el registro con motivo)
// y, si corresponde, registrar la correcta. Nunca se borra ni se edita el
// monto original: así el histórico siempre explica de dónde salió el saldo.
export function anularRealizacion(a, reaId, { motivo = "", usuario = "" } = {}) {
  const ant = normalizarAnticipo(a);
  return {
    ...ant,
    realizaciones: ant.realizaciones.map(r =>
      r.id === reaId
        ? { ...r, anulada: true, motivoAnulacion: String(motivo || ""),
            anuladaPor: String(usuario || ""), anuladaTs: new Date().toISOString() }
        : r
    ),
  };
}

// Un anticipo con realizaciones vigentes no se puede borrar: primero hay que
// anular sus cobros/pagos (dejando el motivo) o cerrarlo.
export function puedeBorrarAnticipo(a) {
  return realizacionesVigentes(a).length === 0;
}

// ── Saldo bancario: ¿el realizado ya está en la caja de partida? ──
// Los saldos se cargan por cuenta y cada cuenta tiene SU fecha. No existe una
// fecha de corte única, así que solo se afirma lo que el dato permite:
//   "incluida"      → la realización es anterior a la fecha de TODAS las
//                     cuentas: todo saldo cargado ya debería contenerla.
//   "indeterminada" → cae entre la cuenta más atrasada y la más reciente:
//                     no se puede comprobar con los saldos cargados.
//   "no_incluida"   → posterior a la fecha de TODAS las cuentas: ningún saldo
//                     la contiene todavía.
//   "sin_saldos"    → no hay saldos cargados: no hay con qué comprobar.
//   "sin_fecha"     → la realización no tiene fecha: no se puede comprobar.
export function clasificarRealizacionVsSaldos(fechaRealizacion, fechasCuentas) {
  const fechas = (fechasCuentas || [])
    .map(f => (f instanceof Date ? f : new Date(f)))
    .filter(f => f instanceof Date && !isNaN(f.getTime()));
  if (!fechas.length) return "sin_saldos";
  const fr = fechaRealizacion instanceof Date ? fechaRealizacion : new Date(fechaRealizacion);
  if (!(fr instanceof Date) || isNaN(fr.getTime())) return "sin_fecha";
  const min = new Date(Math.min(...fechas.map(f => f.getTime())));
  const max = new Date(Math.max(...fechas.map(f => f.getTime())));
  if (fr <= min) return "incluida";
  if (fr > max)  return "no_incluida";
  return "indeterminada";
}

// Resumen de la lista completa de anticipos contra los saldos cargados.
// Devuelve el monto realizado en cada estado, para avisar en pantalla.
export function conciliacionRealizaciones(listas, fechasCuentas) {
  const out = { incluida:0, indeterminada:0, no_incluida:0, sin_saldos:0, sin_fecha:0, detalle:[] };
  (listas || []).forEach(items => {
    (items || []).forEach(a => {
      realizacionesVigentes(a).forEach(r => {
        const estado = clasificarRealizacionVsSaldos(r.fecha, fechasCuentas);
        out[estado] += n(r.usd);
        out.detalle.push({ anticipoId: a.id, reaId: r.id, fecha: r.fecha, usd: n(r.usd), estado });
      });
    });
  });
  return out;
}

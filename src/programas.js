/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// LIQUIDACIÓN DE FRUTA CON ANTICIPOS — Allegria Foods
//
// Representa la operación completa entre cliente, exportadora y productor,
// no un calendario de cuotas.
//
//   Cliente   → Allegria:  base = kg × FOB
//   Allegria  → productor: base = kg × MAX(0, FOB×(1−desc%) − mat/kg − srv/kg)
//
// Por lado:
//
//   base            = liquidación definitiva si existe, si no el presupuesto
//   realizado       = Σ movimientos reales aplicados (histórico, fijo en USD)
//   pendientes      = Σ anticipos futuros con mes (estimados + calendarizados)
//   liquidación     = MAX(0, base − realizado − pendientes)
//   saldo pendiente = pendientes + liquidación
//   excedente       = MAX(0, realizado + pendientes − base)
//
// Cobrar un pendiente lo pasa a realizado por el mismo monto: la liquidación
// no se mueve y nada se descuenta dos veces.
//
// REGLAS QUE NO HAY QUE ROMPER
//
// 1. Un movimiento real se descuenta UNA sola vez, exista o no la cuota,
//    esté o no completo el programa, supere o no lo acordado. Cambiar kilos,
//    tarifas o meses no mueve el dinero ya cobrado o pagado.
// 2. Un movimiento declara qué cumple: una cuota, una estimación, o nada
//    todavía (pendiente de conciliación: visible y sin descontar).
// 3. Imputar un movimiento NO modifica el acuerdo. El pendiente de una cuota
//    es `total acordado − imputado`; quién decide el total acordado es el
//    usuario, respondiendo si el movimiento estaba incluido o es adicional.
// 4. Una cuota en borrador no proyecta ni consume estimación. Su realizado
//    sí descuenta igual: la plata ya se movió.
// 5. La estimación de origen descuenta las realizaciones MOVIDAS desde ella,
//    estén donde estén: mover no reabre el pendiente, revertir tampoco.
// 6. Anular con motivo quita el efecto en todo: realizado global y capacidad
//    de la estimación de origen.
// 7. Dato que falta vale `null`, nunca 0. Sin `MAX(0)` que esconda una
//    sobre-sustitución: se detecta y se resuelve a mano.
// 8. Una operación fuera de presupuesto no proyecta ni descuenta de las
//    operaciones presupuestadas; sus movimientos reales se muestran aparte.
// ═══════════════════════════════════════════════════════════════════

import {
  antRealizado, realizacionesVigentes, normalizarAnticipo,
  agregarRealizacion,
} from "./anticipos.js";

const n = (x) => Number(x) || 0;

/** ¿Es un número cargado? `null`, `undefined` y "" son dato faltante. */
export function esDato(x) {
  if (x === null || x === undefined || x === "") return false;
  return Number.isFinite(Number(x));
}

function uid(pref) {
  return `${pref}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export function nuevoIdPrograma() { return uid("prg"); }
export function nuevoIdCuota()    { return uid("cuo"); }

export const LADOS = ["cliente", "productor"];
export const MODALIDADES = ["usd_kg", "monto", "por_confirmar"];
export const ESTADOS_CUOTA = ["borrador", "vigente", "anulada"];

// ── Normalización ─────────────────────────────────────────────────
export function normalizarCuota(c) {
  const base = normalizarAnticipo(c || {});
  return {
    ...base,
    id: base.id || nuevoIdCuota(),
    modalidad: MODALIDADES.includes(base.modalidad) ? base.modalidad : "por_confirmar",
    estado: ESTADOS_CUOTA.includes(base.estado) ? base.estado : "borrador",
    fecha_prevista: base.fecha_prevista || "",
    mes: base.mes || "",
    usd_kg: esDato(base.usd_kg) ? Number(base.usd_kg) : null,
    monto:  esDato(base.monto)  ? Number(base.monto)  : null,
    sustituye: (Array.isArray(base.sustituye) ? base.sustituye : [])
      .map(s => ({ estimacionId: s?.estimacionId || "", usd: esDato(s?.usd) ? Number(s.usd) : 0 }))
      .filter(s => s.estimacionId),
    extra_acordado: n(base.extra_acordado),
    referencia: base.referencia || "",
  };
}

export function normalizarPrograma(p) {
  const base = p || {};
  return {
    ...base,
    id: base.id || nuevoIdPrograma(),
    lado: LADOS.includes(base.lado) ? base.lado : "cliente",
    contraparte: base.contraparte || "",
    kilos: esDato(base.kilos) ? Number(base.kilos) : null,
    precio_usd_kg: esDato(base.precio_usd_kg) ? Number(base.precio_usd_kg) : null, // informativo
    fueraPresupuesto: !!base.fueraPresupuesto,
    archivado: !!base.archivado,
    motivoArchivo: base.motivoArchivo || "",
    nota: base.nota || "",
    cuotas: (Array.isArray(base.cuotas) ? base.cuotas : []).map(normalizarCuota),
    antecedentes: (Array.isArray(base.antecedentes) ? base.antecedentes : []).map(x => ({
      ...x, id: x?.id || uid("ante"), usd: esDato(x?.usd) ? Number(x.usd) : null,
    })),
  };
}

export const programasDeLado = (programas, lado) =>
  (Array.isArray(programas) ? programas : []).map(normalizarPrograma).filter(p => p.lado === lado);

// ── Cuota ─────────────────────────────────────────────────────────
// `acordado` = total acordado de la cuota. Modalidad US$/kg usa los kilos
// DEL PROGRAMA, nunca los de la fruta.
export function cuotaAcordado(c0, kilosPrograma) {
  const c = normalizarCuota(c0);
  const faltantes = [];
  // `extra_acordado` guarda lo que se sumó al acuerdo por un movimiento
  // declarado ADICIONAL: así la tarifa pactada queda intacta y a la vista.
  const extra = n(c.extra_acordado);
  if (c.modalidad === "monto") {
    if (!esDato(c.monto)) faltantes.push("monto de la cuota");
    return { valor: faltantes.length ? null : Number(c.monto) + extra, faltantes };
  }
  if (c.modalidad === "usd_kg") {
    if (!esDato(c.usd_kg))        faltantes.push("tarifa US$/kg");
    if (!esDato(kilosPrograma))   faltantes.push("kilos del programa");
    return { valor: faltantes.length ? null : Number(c.usd_kg) * Number(kilosPrograma) + extra, faltantes };
  }
  faltantes.push("modalidad de la cuota (US$/kg o monto fijo)");
  return { valor: null, faltantes };
}

export const cuotaRealizado = (c) => antRealizado(normalizarCuota(c));

/** Pendiente de la cuota = acordado − imputado. Null si falta el acordado. */
export function cuotaPendiente(c0, kilosPrograma) {
  const c = normalizarCuota(c0);
  if (c.estado === "anulada") return 0;
  const { valor } = cuotaAcordado(c, kilosPrograma);
  if (valor === null) return null;
  if (c.cerrado) return 0;
  return Math.max(0, valor - cuotaRealizado(c));
}

/** Lo que la cuota declara sustituir, solo si está vigente. */
export function cuotaSustituye(c0) {
  const c = normalizarCuota(c0);
  if (c.estado !== "vigente") return [];
  return c.sustituye;
}

// ── Estimación (fila de anticipos_cliente / anticipos_productor) ───
// Conserva la forma histórica: US$/kg sobre los kilos de la FRUTA.
export function estAcordado(e0, kgFruta) {
  const e = normalizarAnticipo(e0 || {});
  if (esDato(e.monto) && !esDato(e.usd_kg)) return Number(e.monto);
  return n(e.usd_kg) * n(kgFruta);
}

/**
 * Realizado que "pertenece" a la estimación: lo que tiene + lo que se movió
 * desde ella a una cuota. Por eso mover un cobro no reabre su pendiente.
 */
export function estRealizadoOriginado(e0, programas) {
  const e = normalizarAnticipo(e0 || {});
  let total = antRealizado(e);
  programasTodos(programas).forEach(p => p.cuotas.forEach(c => {
    realizacionesVigentes(c).forEach(r => {
      if (r?.origen?.tipo === "estimacion" && r.origen.id === e.id) total += n(r.usd);
    });
  }));
  return total;
}

const programasTodos = (programas) =>
  (Array.isArray(programas) ? programas : []).map(normalizarPrograma);

/** Σ de lo que las cuotas VIGENTES declaran sustituir de esta estimación. */
export function estSustituido(e0, programas) {
  const id = (e0 || {}).id;
  if (!id) return 0;
  let total = 0;
  programasTodos(programas).forEach(p => {
    if (p.archivado) return;
    p.cuotas.forEach(c => cuotaSustituye(c).forEach(s => {
      if (s.estimacionId === id) total += n(s.usd);
    }));
  });
  return total;
}

/**
 * Pendiente de la estimación, SIN MAX(0): un negativo es una
 * sobre-sustitución que hay que resolver, no un cero.
 */
export function estPendienteCrudo(e0, kgFruta, programas) {
  const e = normalizarAnticipo(e0 || {});
  if (e.cerrado) return 0;
  return estAcordado(e, kgFruta) - estRealizadoOriginado(e, programas) - estSustituido(e, programas);
}
export function estPendiente(e0, kgFruta, programas) {
  return Math.max(0, estPendienteCrudo(e0, kgFruta, programas));
}
export function estSobreSustituida(e0, kgFruta, programas) {
  return Math.max(0, -estPendienteCrudo(e0, kgFruta, programas));
}
/** Monto todavía disponible para que una cuota lo sustituya. */
export function estDisponible(e0, kgFruta, programas) {
  const e = normalizarAnticipo(e0 || {});
  if (e.cerrado) return 0;          // su pendiente ya se trasladó a liquidación
  return estPendiente(e, kgFruta, programas);
}

// ── Resumen de un lado ────────────────────────────────────────────
// `mIdx(mes)` → índice del mes, o <0 si no corresponde. `mesIdxActual` marca
// el corte del saldo acumulado: lo anterior se proyecta pero no entra.
export function resumenLado({
  estimaciones = [], programas = [], lado = "cliente",
  kgFruta = 0, basePresupuesto = 0, liquidacionDefinitiva = null,
  mIdx = () => -1, mesIdxActual = -1, sinAsignar = [],
} = {}) {
  const ests = (Array.isArray(estimaciones) ? estimaciones : []).map(normalizarAnticipo);
  const progs = programasDeLado(programas, lado).filter(p => !p.archivado);
  const dentro = progs.filter(p => !p.fueraPresupuesto);
  const fuera  = progs.filter(p => p.fueraPresupuesto);

  const definitiva = liquidacionDefinitiva && esDato(liquidacionDefinitiva.total)
    ? Number(liquidacionDefinitiva.total) : null;
  const base = definitiva !== null ? definitiva : n(basePresupuesto);

  // Realizado: cada movimiento vive en un solo lugar y se cuenta una vez.
  let realizado = 0;
  ests.forEach(e => { realizado += antRealizado(e); });
  dentro.forEach(p => p.cuotas.forEach(c => { realizado += cuotaRealizado(c); }));
  const realizadoFuera = fuera.reduce((s, p) =>
    s + p.cuotas.reduce((t, c) => t + cuotaRealizado(c), 0), 0);

  // Pendientes. Solo proyectan los que tienen mes; los que no, se cobran o
  // pagan dentro de la liquidación y por eso no la descuentan.
  const detalle = [];
  let pendEstimado = 0, pendCalendarizado = 0, pendSinMes = 0;
  let faltanDatos = 0, sobreSustitucion = 0;

  ests.forEach(e => {
    const pend = estPendiente(e, kgFruta, programas);
    sobreSustitucion += estSobreSustituida(e, kgFruta, programas);
    if (pend <= 0) return;
    if (!e.mes) { pendSinMes += pend; return; }
    pendEstimado += pend;
    detalle.push({ tipo: "estimacion", id: e.id, mes: e.mes, usd: pend, contraparte: "" });
  });

  dentro.forEach(p => p.cuotas.forEach(c => {
    if (c.estado !== "vigente") return;
    const pend = cuotaPendiente(c, p.kilos);
    if (pend === null) { faltanDatos += 1; return; }
    if (pend <= 0) return;
    if (!c.mes) { pendSinMes += pend; return; }
    pendCalendarizado += pend;
    detalle.push({ tipo: "cuota", id: c.id, mes: c.mes, usd: pend,
                   contraparte: p.contraparte, programaId: p.id });
  }));

  const pendientes = pendEstimado + pendCalendarizado;
  const liquidacion = Math.max(0, base - realizado - pendientes);
  const excedente   = Math.max(0, realizado + pendientes - base);
  const saldoTotal  = pendientes + liquidacion;

  // Vencido: proyectado en un mes anterior al corte. Se muestra aparte y
  // NUNCA se llama flujo futuro: no entra al saldo acumulado.
  let pendVencido = 0, pendFuturo = 0;
  const vencidos = [];
  detalle.forEach(d => {
    const i = mIdx(d.mes);
    const vencido = i >= 0 && mesIdxActual >= 0 && i < mesIdxActual;
    if (vencido) { pendVencido += d.usd; vencidos.push(d); } else pendFuturo += d.usd;
  });

  const sinAsignarUsd = (Array.isArray(sinAsignar) ? sinAsignar : [])
    .filter(m => m && !m.anulada)
    .reduce((s, m) => s + n(m.usd), 0);

  return {
    base, basePresupuesto: n(basePresupuesto), definitiva,
    variacionBase: definitiva === null ? null : definitiva - n(basePresupuesto),
    realizado, realizadoFuera,
    pendienteEstimado: pendEstimado, pendienteCalendarizado: pendCalendarizado,
    pendientes, pendienteSinMes: pendSinMes,
    pendienteVencido: pendVencido, pendienteFuturo: pendFuturo, vencidos,
    liquidacion, excedente, saldoTotal,
    detalle, faltanDatos, sobreSustitucion,
    sinAsignarUsd, programasFuera: fuera,
  };
}

/**
 * Movimientos que este lado manda al flujo: el pendiente de cada anticipo en
 * su mes y la liquidación en el mes de liquidación de la fruta. Lo realizado
 * no vuelve a proyectarse. Fuente única de pantalla, flujo y Excel.
 */
export function movimientosLado(opts = {}) {
  const r = resumenLado(opts);
  const movs = r.detalle.map(d => ({ ...d }));
  const mesLiq = opts.mesLiquidacion || "";
  if (mesLiq && r.liquidacion > 0) {
    movs.push({ tipo: "liquidacion", id: "liq", mes: mesLiq, usd: r.liquidacion, contraparte: "" });
  }
  return { movimientos: movs, resumen: r };
}

// ── Imputar un movimiento a una cuota ─────────────────────────────
// La app pregunta si el movimiento estaba INCLUIDO en el total acordado o si
// es ADICIONAL, y muestra el efecto antes de confirmar. Nunca lo decide sola.
export function efectoImputacion({ cuota, kilosPrograma, usd, incluido }) {
  const c = normalizarCuota(cuota);
  const ac = cuotaAcordado(c, kilosPrograma).valor;
  const reAntes = cuotaRealizado(c);
  const pendAntes = ac === null ? null : Math.max(0, ac - reAntes);
  const acDespues = ac === null ? null : (incluido ? ac : ac + n(usd));
  const pendDespues = acDespues === null ? null : Math.max(0, acDespues - (reAntes + n(usd)));
  return {
    acordadoAntes: ac, acordadoDespues: acDespues,
    realizadoAntes: reAntes, realizadoDespues: reAntes + n(usd),
    pendienteAntes: pendAntes, pendienteDespues: pendDespues,
    // "incluido" baja el pendiente; "adicional" sube el total y lo conserva.
    deltaPendiente: (pendAntes === null || pendDespues === null) ? null : pendDespues - pendAntes,
  };
}

/** Aplica la imputación: agrega la realización y, si es adicional, sube el total. */
export function imputarMovimiento(cuota, kilosPrograma, { fecha, usd, nota, usuario, referencia, incluido, origen }) {
  const c = normalizarCuota(cuota);
  let next = c;
  // Adicional: el acuerdo crece y el pendiente del calendario no se achica.
  // Se anota aparte para no tocar la tarifa ni el monto pactados.
  if (!incluido) next = { ...next, extra_acordado: n(next.extra_acordado) + n(usd) };
  const conRea = agregarRealizacion(next, { fecha, usd, nota, usuario });
  const rea = conRea.realizaciones[conRea.realizaciones.length - 1];
  if (referencia) rea.referencia = referencia;
  if (origen) rea.origen = origen;
  return normalizarCuota(conRea);
}

// ── Mover una realización, conservando identidad e historial ───────
// Devuelve {estimaciones, programas} nuevos. El movimiento no se copia: sale
// de un contenedor y entra en el otro, con traza en los dos.
export function moverRealizacion({ estimaciones, programas, reaId, desde, hacia, usuario = "" }) {
  const ests = (Array.isArray(estimaciones) ? estimaciones : []).map(normalizarAnticipo);
  const progs = programasTodos(programas);
  let movida = null;

  const sacar = (cont) => {
    const r = (cont.realizaciones || []).find(x => x && x.id === reaId && !x.anulada);
    if (!r) return cont;
    movida = { ...r };
    return { ...cont, realizaciones: (cont.realizaciones || []).filter(x => x.id !== reaId),
             movidas: [...(cont.movidas || []), { reaId, hacia, usuario, ts: new Date().toISOString() }] };
  };

  const estsOut = ests.map(e => (desde.tipo === "estimacion" && e.id === desde.id) ? sacar(e) : e);
  const progsOut1 = progs.map(p => ({ ...p, cuotas: p.cuotas.map(c =>
    (desde.tipo === "cuota" && c.id === desde.id) ? sacar(c) : c) }));
  if (!movida) return { estimaciones: ests, programas: progs, movida: null };

  const conOrigen = { ...movida, origen: movida.origen || { tipo: desde.tipo, id: desde.id },
                      movidaPor: usuario, movidaTs: new Date().toISOString() };
  const meter = (cont) => ({ ...cont, realizaciones: [...(cont.realizaciones || []), conOrigen] });
  const estsFin = estsOut.map(e => (hacia.tipo === "estimacion" && e.id === hacia.id) ? meter(e) : e);
  const progsFin = progsOut1.map(p => ({ ...p, cuotas: p.cuotas.map(c =>
    (hacia.tipo === "cuota" && c.id === hacia.id) ? normalizarCuota(meter(c)) : c) }));
  return { estimaciones: estsFin, programas: progsFin, movida: conOrigen };
}

// ── Archivar un programa (nunca borrar si tiene historial) ─────────
export function tieneHistorial(p0) {
  const p = normalizarPrograma(p0);
  return p.cuotas.some(c => (c.realizaciones || []).length > 0 || cuotaSustituye(c).length > 0);
}
export function archivarPrograma(p0, { motivo, usuario }) {
  const p = normalizarPrograma(p0);
  if (!motivo || !String(motivo).trim()) throw new Error("Archivar un programa necesita un motivo.");
  return {
    ...p, archivado: true, motivoArchivo: String(motivo).trim(),
    archivadoPor: usuario || "", archivadoTs: new Date().toISOString(),
    // Las cuotas dejan de proyectar y de sustituir; las realizaciones quedan.
    cuotas: p.cuotas.map(c => (c.estado === "anulada" ? c : { ...c, estado: "anulada", estadoPrevio: c.estado })),
  };
}

// ── Movimientos sin asignar (bandeja de conciliación) ──────────────
// Existen, se ven, y NO descuentan de ninguna liquidación hasta asignarlos.
export function nuevoMovimientoSinAsignar({ fecha, usd, referencia = "", contraparte = "", lado = "cliente", usuario = "" }) {
  if (!fecha) throw new Error("Un movimiento necesita su fecha real.");
  if (!(n(usd) > 0)) throw new Error("Un movimiento necesita su monto.");
  return { id: uid("mov"), fecha, usd: n(usd), referencia, contraparte, lado,
           usuario, ts: new Date().toISOString(), aplicaciones: [] };
}
/** Σ aplicado nunca puede superar el monto del movimiento. */
export function puedeAplicar(mov, usd) {
  const aplicado = (mov?.aplicaciones || []).reduce((s, a) => s + n(a.usd), 0);
  return n(usd) <= n(mov?.usd) - aplicado + 0.005;
}

export { realizacionesVigentes, antRealizado };

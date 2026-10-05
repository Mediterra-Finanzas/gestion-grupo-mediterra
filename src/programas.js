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


// ═══════════════════════════════════════════════════════════════════
// TRATAMIENTO DE FECHAS
//
// Un pendiente cae en UNA sola cubeta temporal: vencido (antes del corte),
// dentro del horizonte, después del horizonte, o sin fecha. Ningún monto
// aparece dos veces ni desaparece.
//
// Una fecha vacía NO es una decisión de trasladar el anticipo a la
// liquidación. Un anticipo acordado sin fecha queda *pendiente de
// calendarizar* y RESERVA su monto fuera de la liquidación.
// ═══════════════════════════════════════════════════════════════════

export const MODELO_VERSION = 2;
export const CUBETAS = ["vencido", "horizonte", "fuera_horizonte", "sin_fecha"];

/** Cubeta temporal de un pendiente. Excluyentes por construcción. */
export function cubetaTemporal(mes, mIdx, mesIdxActual) {
  if (!mes) return "sin_fecha";
  const i = typeof mIdx === "function" ? mIdx(mes) : -1;
  if (i < 0) return "fuera_horizonte";
  if (mesIdxActual >= 0 && i < mesIdxActual) return "vencido";
  return "horizonte";
}

/**
 * Regla EXPLÍCITA de versión: un registro es antiguo si no lleva su propia
 * marca `v` y la fruta todavía está en la versión 1 del modelo. Un anticipo
 * nuevo sin fecha NO es antiguo: lo nuevo se graba con `v: MODELO_VERSION`.
 */
export function esItemLegacy(item, modeloVersion) {
  if (item && Number(item.v) >= MODELO_VERSION) return false;
  return Number(modeloVersion || 1) < MODELO_VERSION;
}

/**
 * Qué se hace con un pendiente SIN FECHA:
 *   "reservado"      → pendiente de calendarizar; reserva su monto y NO se proyecta
 *   "en_liquidacion" → su monto queda dentro de la liquidación
 *
 * Mientras un registro antiguo no tenga decisión, se conserva EXACTAMENTE el
 * comportamiento anterior ("en_liquidacion"), que es lo que la app viene
 * haciendo. Nada se migra solo.
 */
export function tratoSinFecha(item, { modeloVersion = 1, decisiones = {} } = {}) {
  if (item?.cerrado) return "en_liquidacion";              // decisión explícita de siempre
  const d = decisiones?.[item?.id];
  if (d?.trato === "acordado_sin_fecha")   return "reservado";
  if (d?.trato === "trasladar_liquidacion") return "en_liquidacion";
  return esItemLegacy(item, modeloVersion) ? "en_liquidacion" : "reservado";
}

/** Registra la decisión del usuario, con trazabilidad. No muta el original. */
export function registrarDecisionSinFecha(decisiones, itemId, trato, { usuario = "", nota = "" } = {}) {
  if (!itemId) throw new Error("La decisión necesita identificar el registro.");
  if (trato !== "acordado_sin_fecha" && trato !== "trasladar_liquidacion") {
    throw new Error("Trato no válido para un pendiente sin fecha.");
  }
  const previo = (decisiones || {})[itemId] || null;
  return {
    ...(decisiones || {}),
    [itemId]: {
      trato, usuario, nota, ts: new Date().toISOString(),
      historial: [...(previo?.historial || []), ...(previo ? [{ trato: previo.trato, usuario: previo.usuario, ts: previo.ts }] : [])],
    },
  };
}

/**
 * Cuadre de UNA posición (una operación individual o el bloque residual).
 *
 *   saldo económico     = MAX(0, base − realizado)
 *   excedente real      = MAX(0, realizado − base)          ← lo único que puede ser deuda
 *   compromisos         = pendientes con fecha + sin fecha RESERVADOS
 *   liquidación         = MAX(0, base − realizado − compromisos)
 *   exceso compromisos  = MAX(0, realizado + compromisos − base) − excedente real
 *
 * Identidad que se cumple siempre:
 *   saldo económico = total calendarizado + pendiente de calendarizar − exceso de compromisos
 */
export function cuadrePosicion({
  etiqueta = "", base = 0, realizado = 0, pendientes = [],
  mesLiquidacion = "", mIdx = () => -1, mesIdxActual = -1,
} = {}) {
  const cubetas = { vencido: 0, horizonte: 0, fuera_horizonte: 0, sin_fecha: 0 };
  const sinFechaEnLiquidacion = [];
  const detalle = [];
  (pendientes || []).forEach(p => {
    const usd = n(p.usd);
    if (usd <= 0) return;
    const cub = cubetaTemporal(p.mes, mIdx, mesIdxActual);
    if (cub === "sin_fecha" && p.trato === "en_liquidacion") {
      // No es compromiso aparte: su monto vive dentro de la liquidación.
      sinFechaEnLiquidacion.push({ ...p, usd });
      return;
    }
    cubetas[cub] += usd;
    detalle.push({ ...p, usd, cubeta: cub });
  });

  const compromisos = cubetas.vencido + cubetas.horizonte + cubetas.fuera_horizonte + cubetas.sin_fecha;
  const saldoEconomico = Math.max(0, n(base) - n(realizado));
  const excedenteReal  = Math.max(0, n(realizado) - n(base));
  const liquidacion    = Math.max(0, n(base) - n(realizado) - compromisos);
  const excesoCompromisos = Math.max(0, n(realizado) + compromisos - n(base)) - excedenteReal;

  const ubicacionLiq = cubetaTemporal(mesLiquidacion, mIdx, mesIdxActual);
  const liqCalendarizada = liquidacion > 0 && ubicacionLiq !== "sin_fecha";
  const totalCalendarizado = cubetas.vencido + cubetas.horizonte + cubetas.fuera_horizonte
                           + (liqCalendarizada ? liquidacion : 0);
  const pendienteDeCalendarizar = cubetas.sin_fecha + (liqCalendarizada ? 0 : liquidacion);

  return {
    etiqueta, base: n(base), realizado: n(realizado),
    saldoEconomico, excedenteReal, excesoCompromisos,
    compromisos, cubetas, detalle, sinFechaEnLiquidacion,
    liquidacion, liquidacionMes: mesLiquidacion || "", ubicacionLiquidacion: ubicacionLiq,
    liquidacionCalendarizada: liqCalendarizada ? liquidacion : 0,
    totalCalendarizado, pendienteDeCalendarizar,
    // Lo que de verdad llega al flujo mensual: horizonte + liquidación ubicada
    // dentro del horizonte. Lo vencido se proyecta antes del corte y NO entra
    // al saldo acumulado; lo de fuera del horizonte no tiene columna.
    cajaEnHorizonte: cubetas.horizonte + (ubicacionLiq === "horizonte" ? liquidacion : 0),
    cuadra: Math.abs(saldoEconomico - (totalCalendarizado + pendienteDeCalendarizar - excesoCompromisos)) < 0.005,
  };
}

// ── Resumen de un lado ────────────────────────────────────────────
// `mIdx(mes)` → índice del mes, o <0 si no corresponde. `mesIdxActual` marca
// el corte del saldo acumulado: lo anterior se proyecta pero no entra.
export function resumenLado({
  estimaciones = [], programas = [], lado = "cliente",
  kgFruta = 0, basePresupuesto = 0, liquidacionDefinitiva = null,
  mIdx = () => -1, mesIdxActual = -1, sinAsignar = [], mesLiquidacion = "",
  modeloVersion = 1, decisionesSinFecha = {},
} = {}) {
  const ests = (Array.isArray(estimaciones) ? estimaciones : []).map(normalizarAnticipo);
  const progs = programasDeLado(programas, lado).filter(p => !p.archivado);
  const dentro = progs.filter(p => !p.fueraPresupuesto);
  const fuera  = progs.filter(p => p.fueraPresupuesto);
  const ctxTrato = { modeloVersion, decisiones: decisionesSinFecha };

  // Una operación sale del bloque ENTERA: su presupuesto, sus movimientos y
  // sus pendientes al mismo tiempo. Se individualiza con presupuesto asignado
  // o con liquidación definitiva propia.
  const individual = dentro.filter(p => esDato(p.presupuesto_asignado) || esDato(p.importe_definitivo));
  const delBloque  = dentro.filter(p => !(esDato(p.presupuesto_asignado) || esDato(p.importe_definitivo)));

  let faltanDatos = 0, sobreSustitucion = 0;
  const avisosCompatibilidad = [];

  const pendientesDeCuotas = (lista) => {
    const out = [];
    lista.forEach(p => p.cuotas.forEach(c => {
      if (c.estado !== "vigente") return;
      const pend = cuotaPendiente(c, p.kilos);
      if (pend === null) { faltanDatos += 1; return; }
      if (pend <= 0) return;
      const trato = c.mes ? "" : tratoSinFecha(c, ctxTrato);
      if (!c.mes && esItemLegacy(c, modeloVersion) && !decisionesSinFecha?.[c.id]) {
        avisosCompatibilidad.push({ tipo: "cuota", id: c.id, contraparte: p.contraparte,
          usd: pend, tratoActual: "en_liquidacion" });
      }
      out.push({ tipo: "cuota", id: c.id, mes: c.mes, usd: pend, trato,
                 contraparte: p.contraparte, programaId: p.id });
    }));
    return out;
  };

  const pendientesDeEstimaciones = () => {
    const out = [];
    ests.forEach(e => {
      const pend = estPendiente(e, kgFruta, programas);
      sobreSustitucion += estSobreSustituida(e, kgFruta, programas);
      if (pend <= 0) return;
      const trato = e.mes ? "" : tratoSinFecha(e, ctxTrato);
      if (!e.mes && esItemLegacy(e, modeloVersion) && !decisionesSinFecha?.[e.id]) {
        avisosCompatibilidad.push({ tipo: "estimacion", id: e.id, contraparte: "",
          usd: pend, tratoActual: "en_liquidacion" });
      }
      out.push({ tipo: "estimacion", id: e.id, mes: e.mes, usd: pend, trato, contraparte: "" });
    });
    return out;
  };

  const realizadoDe = (lista) => lista.reduce((s, p) =>
    s + p.cuotas.reduce((t, c) => t + cuotaRealizado(c), 0), 0);

  // ── Posiciones individuales ──────────────────────────────────────
  const posiciones = individual.map(p => {
    const base = esDato(p.importe_definitivo) ? Number(p.importe_definitivo)
               : (esDato(p.presupuesto_asignado) ? Number(p.presupuesto_asignado) : 0);
    const q = cuadrePosicion({
      etiqueta: p.contraparte || "sin nombre", base,
      realizado: realizadoDe([p]), pendientes: pendientesDeCuotas([p]),
      mesLiquidacion: p.mes_liquidacion || mesLiquidacion, mIdx, mesIdxActual,
    });
    return {
      ...q, programaId: p.id, contraparte: p.contraparte,
      presupuestoAsignado: esDato(p.presupuesto_asignado) ? Number(p.presupuesto_asignado) : null,
      importeDefinitivo: esDato(p.importe_definitivo) ? Number(p.importe_definitivo) : null,
      variacionBase: (esDato(p.importe_definitivo) && esDato(p.presupuesto_asignado))
        ? Number(p.importe_definitivo) - Number(p.presupuesto_asignado) : null,
    };
  });

  // ── Bloque presupuestario residual ───────────────────────────────
  // Su base descuenta SOLO el presupuesto de las operaciones que salieron, y
  // sus movimientos y pendientes son los del mismo conjunto que quedó.
  const presupuestoRetirado = individual.reduce((s, p) =>
    s + (esDato(p.presupuesto_asignado) ? Number(p.presupuesto_asignado) : 0), 0);
  const definitivaLado = liquidacionDefinitiva && esDato(liquidacionDefinitiva.total)
    ? Number(liquidacionDefinitiva.total) : null;
  const baseBloque = definitivaLado !== null
    ? definitivaLado - presupuestoRetirado
    : n(basePresupuesto) - presupuestoRetirado;

  const bloque = cuadrePosicion({
    etiqueta: "Bloque presupuestario", base: baseBloque,
    realizado: ests.reduce((s, e) => s + antRealizado(e), 0) + realizadoDe(delBloque),
    pendientes: [...pendientesDeEstimaciones(), ...pendientesDeCuotas(delBloque)],
    mesLiquidacion, mIdx, mesIdxActual,
  });

  // ── Totales del lado: SUMA de posiciones, sin neteo ──────────────
  const todas = [...posiciones, bloque];
  const sum = (f) => todas.reduce((s, q) => s + (f(q) || 0), 0);
  const cub = (k) => todas.reduce((s, q) => s + q.cubetas[k], 0);

  const realizado = sum(q => q.realizado);
  const pendientes = cub("vencido") + cub("horizonte") + cub("fuera_horizonte");
  const liquidacion = sum(q => q.liquidacion);
  const detalle = todas.flatMap(q => q.detalle.filter(d => d.cubeta !== "sin_fecha")
    .map(d => ({ ...d, posicion: q.etiqueta })));
  if (liquidacion > 0 && mesLiquidacion) {
    // la liquidación del bloque y de cada posición se proyecta en su mes
  }
  const realizadoFuera = realizadoDe(fuera);
  const sinAsignarUsd = (Array.isArray(sinAsignar) ? sinAsignar : [])
    .filter(m => m && !m.anulada).reduce((s, m) => s + n(m.usd), 0);

  return {
    // ── compatibilidad con lo que ya consume la app ───────────────
    base: definitivaLado !== null ? definitivaLado : n(basePresupuesto),
    basePresupuesto: n(basePresupuesto), definitiva: definitivaLado,
    variacionBase: definitivaLado === null ? null : definitivaLado - n(basePresupuesto),
    realizado, realizadoFuera,
    pendienteEstimado: todas.reduce((s, q) => s + q.detalle
      .filter(d => d.tipo === "estimacion" && d.cubeta !== "sin_fecha")
      .reduce((t, d) => t + d.usd, 0), 0),
    pendienteCalendarizado: todas.reduce((s, q) => s + q.detalle
      .filter(d => d.tipo === "cuota" && d.cubeta !== "sin_fecha")
      .reduce((t, d) => t + d.usd, 0), 0),
    pendientes,
    // Sin fecha, cualquiera sea su trato: es lo que la pantalla viene avisando.
    pendienteSinMes: cub("sin_fecha") + todas.reduce((s2, q) =>
      s2 + q.sinFechaEnLiquidacion.reduce((t, x) => t + x.usd, 0), 0),
    pendienteVencido: cub("vencido"),
    pendienteFuturo: cub("horizonte") + cub("fuera_horizonte"),
    vencidos: detalle.filter(d => d.cubeta === "vencido"),
    liquidacion, saldoTotal: pendientes + liquidacion,
    excedente: sum(q => q.excedenteReal) + sum(q => q.excesoCompromisos),   // mezclado: lo reemplaza excedenteReal
    detalle, faltanDatos, sobreSustitucion, sinAsignarUsd,
    programasFuera: fuera,
    // ── cuadre nuevo ──────────────────────────────────────────────
    posiciones, bloque, todas,
    saldoEconomico: sum(q => q.saldoEconomico),
    excedenteReal: sum(q => q.excedenteReal),
    excesoCompromisos: sum(q => q.excesoCompromisos),
    totalCalendarizado: sum(q => q.totalCalendarizado),
    pendienteDeCalendarizar: sum(q => q.pendienteDeCalendarizar),
    pendienteFueraHorizonte: cub("fuera_horizonte"),
    // Sin fecha RESERVADO (pendiente de calendarizar) vs. absorbido en la liquidación.
    pendienteSinFechaReservado: cub("sin_fecha"),
    pendienteSinFechaEnLiquidacion: todas.reduce((s2, q) =>
      s2 + q.sinFechaEnLiquidacion.reduce((t, x) => t + x.usd, 0), 0),
    cajaEnHorizonte: sum(q => q.cajaEnHorizonte),
    cubetas: { vencido: cub("vencido"), horizonte: cub("horizonte"),
               fuera_horizonte: cub("fuera_horizonte"), sin_fecha: cub("sin_fecha") },
    avisosCompatibilidad,
    cuadra: todas.every(q => q.cuadra),
  };
}

/**
 * Movimientos que este lado manda al flujo: el pendiente de cada anticipo en
 * su mes y la liquidación en el mes de liquidación de la fruta. Lo realizado
 * no vuelve a proyectarse. Fuente única de pantalla, flujo y Excel.
 */
export function movimientosLado(opts = {}) {
  const r = resumenLado(opts);
  // Pendientes con fecha, cada uno en su mes (los sin fecha ya quedaron fuera
  // de `detalle`), más la liquidación de CADA posición en su propio mes.
  const movs = r.detalle.map(d => ({ ...d }));
  r.todas.forEach(q => {
    if (q.liquidacionMes && q.liquidacion > 0) {
      movs.push({ tipo: "liquidacion", id: `liq_${q.etiqueta}`, mes: q.liquidacionMes,
                  usd: q.liquidacion, contraparte: q.etiqueta === "Bloque presupuestario" ? "" : q.etiqueta });
    }
  });
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

// ═══════════════════════════════════════════════════════════════════
// SALDOS A FAVOR
//
// Programar NO extingue el saldo. Solo lo resuelven los movimientos
// efectivamente realizados y las compensaciones APLICADAS.
//
//   resuelto   = ejecutadas (recuperación/devolución) + compensaciones aplicadas
//   programado = programadas sin ejecutar + compensaciones reservadas
//   pendiente real = reconocido − resuelto
//   disponible     = pendiente real − programado
// ═══════════════════════════════════════════════════════════════════

export const ESTADOS_SALDO = ["provisional", "en_discusion", "reconocido"];
export const TIPOS_APLICACION = ["recuperacion", "devolucion", "compensacion", "aplazamiento"];

export function normalizarSaldo(x) {
  const base = x || {};
  return {
    ...base,
    id: base.id || uid("sf"),
    lado: LADOS.includes(base.lado) ? base.lado : "cliente",
    contraparte: base.contraparte || "",
    programaId: base.programaId || null,
    usd: esDato(base.usd) ? Number(base.usd) : null,
    estado: ESTADOS_SALDO.includes(base.estado) ? base.estado : "provisional",
    respaldo: base.respaldo || null,
    aplicaciones: (Array.isArray(base.aplicaciones) ? base.aplicaciones : []).map(a => ({
      ...a, id: a?.id || uid("ap"), usd: esDato(a?.usd) ? Number(a.usd) : 0,
      tipo: TIPOS_APLICACION.includes(a?.tipo) ? a.tipo : "recuperacion",
      estado: a?.estado || "programada",
      historial: Array.isArray(a?.historial) ? a.historial : [],
    })),
  };
}

const vigentes = (s) => s.aplicaciones.filter(a => !a.anulada && a.estado !== "anulada");

/**
 * Reconocer un saldo exige respaldo: liquidación definitiva individual o un
 * documento que lo acredite. Una nota que solo asigna presupuesto no basta.
 */
export function puedeReconocer({ importeDefinitivo = null, respaldo = null } = {}) {
  if (esDato(importeDefinitivo)) return { puede: true, motivo: "liquidación definitiva individual" };
  if (respaldo && respaldo.tipo === "documento" && respaldo.referencia && respaldo.fecha) {
    return { puede: true, motivo: "documento que acredita el saldo" };
  }
  return { puede: false, motivo: "falta liquidación definitiva individual o documento con contraparte, operación, monto, fecha y respaldo" };
}

export function resumenSaldo(s0) {
  const s = normalizarSaldo(s0);
  const act = vigentes(s);
  const resuelto = act
    .filter(a => (a.tipo === "recuperacion" || a.tipo === "devolucion") ? a.estado === "ejecutada"
                : a.tipo === "compensacion" ? a.estado === "aplicada" : false)
    .reduce((t, a) => t + n(a.usd), 0);
  const programado = act
    .filter(a => (a.tipo === "recuperacion" || a.tipo === "devolucion") ? a.estado === "programada"
                : a.tipo === "compensacion" ? a.estado === "reservada" : false)
    .reduce((t, a) => t + n(a.usd), 0);
  const reconocido = n(s.usd);
  const pendienteReal = Math.max(0, reconocido - resuelto);
  return {
    reconocido, resuelto, programado,
    pendienteReal, disponible: Math.max(0, pendienteReal - programado),
    estado: s.estado, cerrado: pendienteReal <= 0.005,
    aplicaciones: act,
  };
}

/** Agrega una aplicación, sin permitir usar dos veces el mismo monto. */
export function agregarAplicacion(s0, { tipo, usd, mes, destino = null, motivo = "", usuario = "" }) {
  const s = normalizarSaldo(s0);
  if (!TIPOS_APLICACION.includes(tipo)) throw new Error("Tipo de aplicación no válido.");
  if (tipo === "aplazamiento") throw new Error("El aplazamiento se hace sobre una aplicación existente.");
  const r = resumenSaldo(s);
  if (!(n(usd) > 0)) throw new Error("La aplicación necesita su monto.");
  if (n(usd) > r.disponible + 0.005) {
    throw new Error(`No se puede aplicar ${Math.round(n(usd))}: quedan ${Math.round(r.disponible)} disponibles. ` +
      `Lo ya programado sigue ocupando saldo aunque no esté ejecutado.`);
  }
  if (tipo === "compensacion" && !destino) throw new Error("Una compensación necesita identificar la operación destino.");
  const estado = tipo === "compensacion" ? "reservada" : "programada";
  return { ...s, aplicaciones: [...s.aplicaciones, {
    id: uid("ap"), tipo, usd: n(usd), mes: mes || "", destino, motivo, usuario,
    estado, ts: new Date().toISOString(), historial: [],
  }] };
}

/** Marca una programación como efectivamente ejecutada (hubo movimiento real). */
export function ejecutarAplicacion(s0, aplicacionId, { fecha, movimientoId = null, usuario = "" }) {
  const s = normalizarSaldo(s0);
  if (!fecha) throw new Error("Ejecutar una aplicación necesita la fecha real del movimiento.");
  return { ...s, aplicaciones: s.aplicaciones.map(a => a.id === aplicacionId
    ? { ...a, estado: "ejecutada", fechaEjecucion: fecha, movimientoId, usuario,
        historial: [...a.historial, { de: a.estado, a: "ejecutada", ts: new Date().toISOString(), usuario }] }
    : a) };
}

/** Aplica una compensación reservada contra el destino, validando su saldo. */
export function aplicarCompensacion(s0, aplicacionId, { saldoDestino, usuario = "" }) {
  const s = normalizarSaldo(s0);
  const ap = s.aplicaciones.find(a => a.id === aplicacionId);
  if (!ap || ap.tipo !== "compensacion") throw new Error("No es una compensación.");
  if (ap.estado !== "reservada") throw new Error("Solo se aplica una compensación reservada.");
  if (!esDato(saldoDestino)) throw new Error("Falta el saldo de la operación destino.");
  const absorbe = Math.min(n(ap.usd), Number(saldoDestino));
  if (absorbe <= 0) throw new Error("La operación destino no tiene saldo que absorber.");
  const remanente = n(ap.usd) - absorbe;
  const aplicaciones = s.aplicaciones.map(a => a.id === aplicacionId
    ? { ...a, estado: "aplicada", usd: absorbe, usuario, fechaAplicacion: new Date().toISOString(),
        historial: [...a.historial, { de: "reservada", a: "aplicada", usd: absorbe, remanente, ts: new Date().toISOString(), usuario }] }
    : a);
  return { saldo: { ...s, aplicaciones }, absorbido: absorbe, remanente };
}

/** Aplaza una programación: cambia su mes, deja historial y NO duplica cuotas. */
export function aplazarAplicacion(s0, aplicacionId, { mes, motivo, usuario = "" }) {
  const s = normalizarSaldo(s0);
  if (!motivo || !String(motivo).trim()) throw new Error("Aplazar necesita un motivo.");
  return { ...s, aplicaciones: s.aplicaciones.map(a => {
    if (a.id !== aplicacionId) return a;
    if (a.estado === "ejecutada" || a.estado === "aplicada") {
      throw new Error("No se aplaza una aplicación ya ejecutada o aplicada.");
    }
    return { ...a, mes: mes || "", motivo: String(motivo).trim(), usuario,
      historial: [...a.historial, { mesAnterior: a.mes, mesNuevo: mes || "", motivo: String(motivo).trim(), ts: new Date().toISOString(), usuario }] };
  }) };
}

/**
 * Anular una programación libera su reserva. NUNCA borra ni revierte un
 * movimiento ya realizado: una aplicación ejecutada o aplicada no se anula
 * desde acá, se corrige anulando su movimiento con motivo.
 */
export function anularAplicacion(s0, aplicacionId, { motivo, usuario = "" }) {
  const s = normalizarSaldo(s0);
  const ap = s.aplicaciones.find(a => a.id === aplicacionId);
  if (!ap) return s;
  if (ap.estado === "ejecutada" || ap.estado === "aplicada") {
    throw new Error("Esta aplicación ya se ejecutó: para revertirla hay que anular su movimiento, con motivo.");
  }
  if (!motivo || !String(motivo).trim()) throw new Error("Anular necesita un motivo.");
  return { ...s, aplicaciones: s.aplicaciones.map(a => a.id === aplicacionId
    ? { ...a, anulada: true, estado: "anulada", motivoAnulacion: String(motivo).trim(), usuario,
        anuladaTs: new Date().toISOString(),
        historial: [...a.historial, { de: ap.estado, a: "anulada", motivo: String(motivo).trim(), ts: new Date().toISOString(), usuario }] }
    : a) };
}

/** Movimientos que los saldos a favor mandan al flujo. */
export function movimientosSaldos(saldos, { mIdx = () => -1 } = {}) {
  const out = [];
  (Array.isArray(saldos) ? saldos : []).map(normalizarSaldo).forEach(s => {
    vigentes(s).forEach(a => {
      // Solo lo programado y todavía no ejecutado llega al flujo: lo ejecutado
      // ya es caja y las compensaciones no generan movimiento bancario.
      if (a.tipo === "compensacion" || a.tipo === "aplazamiento") return;
      if (a.estado !== "programada" || !a.mes) return;
      out.push({ tipo: a.tipo, saldoId: s.id, aplicacionId: a.id, mes: a.mes, usd: n(a.usd),
                 lado: s.lado, contraparte: s.contraparte,
                 // recuperación del productor = entrada · devolución al cliente = salida
                 signo: a.tipo === "recuperacion" ? 1 : -1 });
    });
  });
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// RECONSTRUIR LA BASE DESDE UN DOCUMENTO NETO
//
// Solo vuelven los anticipos y compensaciones que ESE documento descontó.
// Las deducciones comerciales (comisión, materiales, servicios) y los otros
// ajustes quedan descontados: no se suman de nuevo.
// ═══════════════════════════════════════════════════════════════════
export const TIPOS_DEDUCCION = ["comercial", "anticipo", "compensacion", "otro"];
const VUELVEN = new Set(["anticipo", "compensacion"]);

export function baseDesdeDocumento({ neto, deducciones = [] } = {}) {
  if (!esDato(neto)) return { base: null, faltantes: ["neto del documento"], devuelve: 0, cuadra: false };
  const faltantes = [];
  let devuelve = 0;
  (deducciones || []).forEach((d, i) => {
    if (!TIPOS_DEDUCCION.includes(d?.tipo)) { faltantes.push(`tipo de la deducción ${i + 1}`); return; }
    if (!esDato(d?.usd)) { faltantes.push(`monto de la deducción ${i + 1}`); return; }
    if (VUELVEN.has(d.tipo)) devuelve += Number(d.usd);
  });
  if (faltantes.length) return { base: null, faltantes, devuelve, cuadra: false };
  const base = Number(neto) + devuelve;
  // Validación: deshacer el cálculo tiene que devolver el neto del documento.
  const cuadra = Math.abs((base - devuelve) - Number(neto)) < 0.005;
  return { base, devuelve, faltantes: [], cuadra };
}

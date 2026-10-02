/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// PROGRAMAS COMERCIALES — Allegria Foods
//
// Un programa es el acuerdo con UNA contraparte: cliente o productor.
// Tiene sus propios kilos y su propio precio, y cuelga de él su calendario
// de anticipos. Los 850.000 kg y el FOB de la fruta son PRESUPUESTO y no
// son la base de ningún acuerdo: cada programa trae la suya.
//
//   lado cliente    → total = venta del programa
//   lado productor  → total = costo neto del programa
//
// Las dos listas son independientes: asignar kilos a un cliente no asigna
// nada a ningún productor, y registrar un cobro no registra ningún pago.
//
// REGLAS QUE NO HAY QUE ROMPER
//
// 1. Un dato que falta vale `null`, nunca 0. Si falta el dato, el número
//    no se calcula: se devuelve `null` y se lista en `faltantes`. Nada se
//    convierte en cero en silencio.
// 2. Registrar una contraparte NO la mete en el cálculo. Eso lo hace
//    `activo:true`, y `validarActivacion` lo impide mientras falten datos
//    o mientras los programas activos se pasen del presupuesto.
// 3. El presupuesto de la fruta es el techo del lado. Los programas
//    redistribuyen ese total, no se suman encima.
// 4. El realizado es histórico y fijo en USD: cambiar kilos o tarifas
//    mueve el acordado y el pendiente, nunca lo ya cobrado o pagado.
// 5. El excedente se mide contra el TOTAL del programa (venta o costo
//    neto), no contra su calendario de anticipos. Pasarse del calendario
//    de anticipos no deja la liquidación en cero.
// 6. Un antecedente (monto informado sin fecha) no es un movimiento: no
//    descuenta, no se proyecta y no cuenta como cobrado o pagado. Queda
//    a la vista hasta que se complete.
// ═══════════════════════════════════════════════════════════════════

import {
  antRealizado, realizacionesVigentes, normalizarAnticipo,
  agregarRealizacion,
} from "./anticipos.js";

const n = (x) => Number(x) || 0;

/** ¿Es un número cargado? `null`, `undefined` y "" son dato faltante. */
export function esDato(x) {
  if (x === null || x === undefined || x === "") return false;
  const v = Number(x);
  return Number.isFinite(v);
}

function uid(pref) {
  return `${pref}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
export function nuevoIdPrograma()     { return uid("prg"); }
export function nuevoIdAntAcuerdo()   { return uid("pan"); }
export function nuevoIdAntecedente()  { return uid("ante"); }

export const LADOS = ["cliente", "productor"];
export const MODALIDADES = ["usd_kg", "monto", "por_confirmar"];

// ── Normalización ─────────────────────────────────────────────────
export function normalizarAnticipoPrograma(a) {
  const base = normalizarAnticipo(a || {});
  const modalidad = MODALIDADES.includes(base.modalidad) ? base.modalidad : "por_confirmar";
  return {
    ...base,
    modalidad,
    fecha_prevista: base.fecha_prevista || "",
    mes: base.mes || "",
    usd_kg: esDato(base.usd_kg) ? Number(base.usd_kg) : null,
    monto:  esDato(base.monto)  ? Number(base.monto)  : null,
    referencia: base.referencia || "",
    id: base.id || nuevoIdAntAcuerdo(),
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
    precio_modo: base.precio_modo === "monto" ? "monto" : "usd_kg",
    precio_usd_kg: esDato(base.precio_usd_kg) ? Number(base.precio_usd_kg) : null,
    monto_total:   esDato(base.monto_total)   ? Number(base.monto_total)   : null,
    mes_liquidacion: base.mes_liquidacion || "",
    activo: !!base.activo,
    nota: base.nota || "",
    anticipos: (Array.isArray(base.anticipos) ? base.anticipos : []).map(normalizarAnticipoPrograma),
    antecedentes: (Array.isArray(base.antecedentes) ? base.antecedentes : []).map(x => ({
      ...x, id: x?.id || nuevoIdAntecedente(), usd: esDato(x?.usd) ? Number(x.usd) : null,
    })),
  };
}

// ── Magnitudes de un anticipo de programa ─────────────────────────
// Devuelve { valor, faltantes }. `valor:null` = no se puede calcular.
export function acordadoAnticipo(a0, kilos) {
  const a = normalizarAnticipoPrograma(a0);
  const faltantes = [];
  if (a.modalidad === "monto") {
    if (!esDato(a.monto)) faltantes.push("monto del anticipo");
    return { valor: faltantes.length ? null : Number(a.monto), faltantes };
  }
  if (a.modalidad === "usd_kg") {
    if (!esDato(a.usd_kg)) faltantes.push("tarifa US$/kg");
    if (!esDato(kilos))    faltantes.push("kilos del programa");
    return { valor: faltantes.length ? null : Number(a.usd_kg) * Number(kilos), faltantes };
  }
  // por_confirmar: el importe del calendario sirve de referencia, pero NO es
  // contractual. No se proyecta hasta definir la modalidad.
  faltantes.push("modalidad del anticipo (US$/kg o monto fijo)");
  return { valor: null, faltantes };
}

export function realizadoAnticipo(a) { return antRealizado(normalizarAnticipoPrograma(a)); }

export function pendienteAnticipo(a0, kilos) {
  const a = normalizarAnticipoPrograma(a0);
  const { valor } = acordadoAnticipo(a, kilos);
  if (valor === null) return null;
  if (a.cerrado) return 0;
  return Math.max(0, valor - realizadoAnticipo(a));
}

/** Importe que el calendario declara, aunque todavía no sea contractual. */
export function referenciaAnticipo(a0, kilos) {
  const a = normalizarAnticipoPrograma(a0);
  const { valor } = acordadoAnticipo(a, kilos);
  if (valor !== null) return valor;
  return esDato(a.monto) ? Number(a.monto) : null;
}

// ── Total del programa ────────────────────────────────────────────
// Cliente: venta del programa. Productor: costo neto del programa.
export function totalPrograma(p0) {
  const p = normalizarPrograma(p0);
  const faltantes = [];
  if (p.precio_modo === "monto") {
    if (!esDato(p.monto_total)) faltantes.push("monto total del programa");
    return { valor: faltantes.length ? null : Number(p.monto_total), faltantes };
  }
  if (!esDato(p.kilos))         faltantes.push("kilos del programa");
  if (!esDato(p.precio_usd_kg)) faltantes.push(p.lado === "cliente" ? "precio US$/kg del programa" : "precio neto US$/kg del programa");
  return { valor: faltantes.length ? null : Number(p.kilos) * Number(p.precio_usd_kg), faltantes };
}

// ── Resumen de un programa ────────────────────────────────────────
// `liquidacion` solo se calcula si el programa está completo; si falta un
// dato devuelve null y el detalle de lo que falta.
export function resumenPrograma(p0) {
  const p = normalizarPrograma(p0);
  const tot = totalPrograma(p);
  const faltantes = [...tot.faltantes];
  let acordado = 0, realizado = 0, pendiente = 0, pendienteSinMes = 0, descuento = 0;
  let incompleto = false;

  p.anticipos.forEach(a => {
    const ac = acordadoAnticipo(a, p.kilos);
    const re = realizadoAnticipo(a);
    realizado += re;
    if (ac.valor === null) {
      incompleto = true;
      ac.faltantes.forEach(f => { if (!faltantes.includes(f)) faltantes.push(f); });
      // El realizado siempre descuenta: la plata ya se movió.
      descuento += re;
      return;
    }
    const pe = a.cerrado ? 0 : Math.max(0, ac.valor - re);
    acordado += ac.valor;
    pendiente += pe;
    if (!a.mes) pendienteSinMes += pe;
    // Sin mes no se proyecta en el flujo, así que se cobra/paga en la
    // liquidación: no se descuenta de ella. El realizado sí, siempre.
    descuento += re + (a.mes ? pe : 0);
  });

  const completo = tot.valor !== null && !incompleto;
  const liquidacion = completo ? Math.max(0, tot.valor - descuento) : null;
  const excedente   = completo ? Math.max(0, descuento - tot.valor) : null;
  const antecedentesUsd = p.antecedentes
    .filter(x => x && !x.convertidoEn && esDato(x.usd))
    .reduce((s, x) => s + Number(x.usd), 0);

  return {
    total: tot.valor, acordado, realizado, pendiente, pendienteSinMes,
    pendienteProyectable: pendiente - pendienteSinMes,
    descuento, liquidacion, excedente, completo, faltantes,
    antecedentes: p.antecedentes.filter(x => x && !x.convertidoEn).length,
    antecedentesUsd,
  };
}

// ── Movimientos que un programa manda al flujo ────────────────────
// Solo el pendiente de cada anticipo (lo realizado ya está en la caja) y la
// liquidación del programa. Mismo criterio que src/anticipos.js.
export function movimientosPrograma(p0) {
  const p = normalizarPrograma(p0);
  const r = resumenPrograma(p);
  if (!r.completo) return [];
  const movs = [];
  p.anticipos.forEach(a => {
    if (!a.mes) return;
    const pe = pendienteAnticipo(a, p.kilos);
    if (pe > 0) movs.push({ mes: a.mes, usd: pe, tipo: "anticipo", programaId: p.id,
                            contraparte: p.contraparte, anticipoId: a.id });
  });
  if (p.mes_liquidacion && r.liquidacion > 0) {
    movs.push({ mes: p.mes_liquidacion, usd: r.liquidacion, tipo: "liquidacion",
                programaId: p.id, contraparte: p.contraparte });
  }
  return movs;
}

// ── Resumen de un lado completo (clientes o productores) ──────────
// Las asignaciones de kilos de los dos lados son independientes: este
// resumen mira UN lado y nunca suma el otro.
export function resumenLado(programas, { kgPresupuesto = null, totalPresupuesto = null } = {}) {
  const lista = (Array.isArray(programas) ? programas : []).map(normalizarPrograma);
  const activos = lista.filter(p => p.activo);
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const kilosAsignados       = sum(lista,   p => esDato(p.kilos) ? Number(p.kilos) : 0);
  const kilosAsignadosAct    = sum(activos, p => esDato(p.kilos) ? Number(p.kilos) : 0);
  const sinKilos             = lista.filter(p => !esDato(p.kilos)).length;
  const totalProgramas       = sum(lista,   p => totalPrograma(p).valor);
  const totalActivos         = sum(activos, p => totalPrograma(p).valor);
  const sinTotal             = lista.filter(p => totalPrograma(p).valor === null).length;
  const incompletos          = lista.filter(p => !resumenPrograma(p).completo);
  return {
    programas: lista, activos, registrados: lista.filter(p => !p.activo),
    kilosAsignados, kilosAsignadosActivos: kilosAsignadosAct, sinKilos,
    kilosLibres: esDato(kgPresupuesto) ? Number(kgPresupuesto) - kilosAsignados : null,
    totalProgramas, totalActivos, sinTotal,
    variacion: esDato(totalPresupuesto) ? totalProgramas - Number(totalPresupuesto) : null,
    incompletos,
    realizado: sum(lista, p => resumenPrograma(p).realizado),
    antecedentesUsd: sum(lista, p => resumenPrograma(p).antecedentesUsd),
  };
}

// ── Activación ────────────────────────────────────────────────────
// Registrar una contraparte NO la mete en el cálculo. Acá se decide si se
// puede activar, y la respuesta dice exactamente qué falta.
export function validarActivacion(p0, { kgPresupuesto = null, totalPresupuesto = null, otrosActivos = [] } = {}) {
  const p = normalizarPrograma(p0);
  const r = resumenPrograma(p);
  const faltantes = [...r.faltantes];
  const avisos = [];
  if (!p.contraparte.trim()) faltantes.push("nombre de la contraparte");
  if (!p.mes_liquidacion) faltantes.push("mes de liquidación del programa");
  p.anticipos.forEach((a, i) => {
    if (!a.mes && !a.cerrado) {
      avisos.push(`El anticipo ${i + 1} no tiene mes de flujo: no se proyecta y se cobra/paga en la liquidación.`);
    }
  });

  const otros = (Array.isArray(otrosActivos) ? otrosActivos : []).map(normalizarPrograma).filter(x => x.id !== p.id);
  const kilosOtros = otros.reduce((s, x) => s + (esDato(x.kilos) ? Number(x.kilos) : 0), 0);
  const totalOtros = otros.reduce((s, x) => s + (totalPrograma(x).valor || 0), 0);
  const kilosCon = kilosOtros + (esDato(p.kilos) ? Number(p.kilos) : 0);
  const totalCon = totalOtros + (totalPrograma(p).valor || 0);

  const bloqueos = [];
  if (esDato(kgPresupuesto) && kilosCon > Number(kgPresupuesto) + 0.5) {
    bloqueos.push(`Los kilos de los programas activos quedarían en ${kilosCon.toLocaleString("es-CL")} contra ${Number(kgPresupuesto).toLocaleString("es-CL")} de presupuesto.`);
  }
  if (esDato(totalPresupuesto) && totalCon > Number(totalPresupuesto) + 0.5) {
    bloqueos.push(`Los programas activos sumarían ${Math.round(totalCon).toLocaleString("es-CL")} contra ${Math.round(Number(totalPresupuesto)).toLocaleString("es-CL")} de presupuesto. El presupuesto es el techo del lado: no se suman ventas encima.`);
  }
  return { puede: faltantes.length === 0 && bloqueos.length === 0, faltantes, bloqueos, avisos };
}

// ── Proyección del lado ───────────────────────────────────────────
// Fuente única de los movimientos del lado: la usan el flujo (calcAllegria),
// la pantalla y el Excel, así que no pueden divergir.
//
// Con programas activos: cada programa proyecta lo suyo y el presupuesto NO
// asignado se cobra/paga en el mes de liquidación de la fruta. El total del
// lado nunca supera el presupuesto.
export function proyeccionLado(programas, { totalPresupuesto = 0, mesLiquidacionFruta = "" } = {}) {
  const activos = (Array.isArray(programas) ? programas : []).map(normalizarPrograma)
    .filter(p => p.activo && resumenPrograma(p).completo);
  // Sin programas activos el lado sigue calculando con la estimación de la
  // fruta: acá no se devuelve nada, para no sumar una proyección encima.
  if (!activos.length) {
    return { activos, movimientos: [], totalProgramas: 0, resto: 0,
             totalProyectado: 0, realizado: 0, hayActivos: false };
  }
  const movimientos = [];
  activos.forEach(p => movimientos.push(...movimientosPrograma(p)));
  const totalProgramas = activos.reduce((s, p) => s + (totalPrograma(p).valor || 0), 0);
  const resto = Math.max(0, n(totalPresupuesto) - totalProgramas);
  if (resto > 0 && mesLiquidacionFruta) {
    movimientos.push({ mes: mesLiquidacionFruta, usd: resto, tipo: "resto",
                       programaId: null, contraparte: "Presupuesto sin programa" });
  }
  return {
    activos, movimientos, totalProgramas, resto,
    totalProyectado: movimientos.reduce((s, m) => s + m.usd, 0),
    realizado: activos.reduce((s, p) => s + resumenPrograma(p).realizado, 0),
    hayActivos: activos.length > 0,
  };
}

/** ¿Este lado ya calcula con programas? Decide si se reemplaza la estimación. */
export function ladoActivo(programas) {
  return (Array.isArray(programas) ? programas : []).map(normalizarPrograma)
    .some(p => p.activo && resumenPrograma(p).completo);
}

// ── Antecedentes: montos informados sin fecha ─────────────────────
// No son movimientos. No descuentan, no se proyectan y no cuentan como
// cobrado ni pagado. Existen para no perder el dato mientras falta la fecha.
export function agregarAntecedente(p0, { usd, nota = "", usuario = "" }) {
  const p = normalizarPrograma(p0);
  return { ...p, antecedentes: [...p.antecedentes, {
    id: nuevoIdAntecedente(), usd: esDato(usd) ? Number(usd) : null,
    nota, usuario, ts: new Date().toISOString(), convertidoEn: null,
  }] };
}

/** Completa un antecedente: pasa a ser una realización con fecha real. */
export function completarAntecedente(p0, antecedenteId, { anticipoId, fecha, usuario = "", nota = "" }) {
  const p = normalizarPrograma(p0);
  const ante = p.antecedentes.find(x => x.id === antecedenteId);
  if (!ante || ante.convertidoEn) return p;
  if (!fecha) throw new Error("Un antecedente necesita la fecha real para convertirse en movimiento.");
  if (!esDato(ante.usd)) throw new Error("El antecedente no tiene monto.");
  const idx = p.anticipos.findIndex(a => a.id === anticipoId);
  if (idx < 0) return p;
  const anticipos = [...p.anticipos];
  anticipos[idx] = agregarRealizacion(anticipos[idx], {
    fecha, usd: Number(ante.usd), usuario,
    nota: nota || ante.nota || "desde antecedente informado",
  });
  const antecedentes = p.antecedentes.map(x => x.id === antecedenteId
    ? { ...x, convertidoEn: { anticipoId, fecha, ts: new Date().toISOString(), usuario } } : x);
  return { ...p, anticipos, antecedentes };
}

// ── Cuadre antes/después de activar ───────────────────────────────
// Qué estimación reemplazan los programas y en qué queda el lado.
export function cuadreActivacion({ movimientosEstimacion = [], programas = [], totalPresupuesto = 0, mesLiquidacionFruta = "" } = {}) {
  const antes = (movimientosEstimacion || []).reduce((s, m) => s + n(m.usd), 0);
  const proy = proyeccionLado(programas, { totalPresupuesto, mesLiquidacionFruta });
  return {
    antes: { movimientos: movimientosEstimacion, total: antes },
    despues: { movimientos: proy.movimientos, total: proy.totalProyectado },
    diferencia: proy.totalProyectado - antes,
    totalProgramas: proy.totalProgramas,
    resto: proy.resto,
    presupuesto: n(totalPresupuesto),
  };
}

export { realizacionesVigentes };

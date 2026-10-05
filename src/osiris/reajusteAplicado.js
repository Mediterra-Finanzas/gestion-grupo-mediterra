/* eslint-disable */
// Entrega B · Aplicar el reajuste, cuando se active explícitamente.
//
// Estado: MODELO PURO. Todavía no hay pantalla, ni persistencia, ni conexión
// con el motor. Nada de lo que hay acá cambia un importe hoy.
//
// Reglas que este modelo sostiene, y que no son negociables:
//
//   1. Confirmar un antecedente y activar el reajuste son DOS acciones.
//   2. La activación es por contrato, con fecha de referencia y respaldo.
//   3. La configuración antigua (`royaltyInflacion` + `rcInflacionPct`) manda
//      mientras no se autorice la transición. Si hay dos, la nueva NO se
//      presenta como activa: se muestra el conflicto, sin tocar resultados.
//   4. Una fila con CUALQUIER antecedente de factura o pago no se recalcula.
//   5. Lo que no esté resuelto bloquea la aplicación. Un importe no confirmado
//      puede mostrarse como escenario, pero NO alimenta totales, exportaciones
//      operativas ni facturación.
//
// Cuatro fechas distintas, que no se deben confundir:
//
//   · aniversario contractual — cuándo sube la tasa según la cláusula;
//   · período del servicio    — la temporada que se está cobrando (jul–jun);
//   · emisión                 — cuándo se emite la factura;
//   · pago                    — cuándo se paga.
//
// **Cuál de esas fechas determina la tasa aplicable es una regla que el
// contrato tiene que respaldar.** Este modelo NO la supone. Mientras no esté
// respaldada, no aplica nada y entrega los escenarios por separado.

import { configReajuste, faltantesReajuste, estadoReajuste } from "./condicionesConfigurables";

export const SIN_ACTIVAR = "sinActivar";
export const ACTIVADO = "activado";
export const NO_ACTIVABLE = "noActivable";
export const CONFLICTO_CON_ANTIGUA = "conflictoConAntigua";

// Qué fecha gobierna la tasa. Ninguna es el default: hay que declararla y
// respaldarla. `null` significa "sin resolver", no "la de cobro".
export const REGLAS_FECHA = ["emision", "inicioPeriodoServicio", "finPeriodoServicio", "pago"];

const txt = (v) => (v == null ? "" : String(v).trim());
const MESES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// ── Fechas ────────────────────────────────────────────────────────────────

export function aFecha(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = txt(v);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f;
}

const diasDelMes = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

// PROPUESTA TÉCNICA, PENDIENTE DE APROBACIÓN — no es una regla contractual.
// Si la fecha de referencia cae un 29 de febrero, el aniversario en un año no
// bisiesto se toma el 28. La alternativa sería el 1 de marzo. El contrato no
// lo dice y el CFO no lo aprobó: se deja declarado para decidirlo.
export const REGLA_29_FEBRERO = Object.freeze({
  propuesta: "ultimoDiaDelMes",
  alternativa: "primeroDeMarzo",
  aprobada: false,
  nota: "Propuesta técnica pendiente de aprobación. No es una regla contractual decidida.",
});

export function aniversario(desde, n) {
  const f = aFecha(desde);
  if (!f) return null;
  const a = f.getUTCFullYear() + n, m = f.getUTCMonth();
  const d = Math.min(f.getUTCDate(), diasDelMes(a, m));
  return new Date(Date.UTC(a, m, d));
}

// ¿Esta fecha de referencia depende de la regla del 29 de febrero?
export function dependeDeRegla29Feb(desde) {
  const f = aFecha(desde);
  return !!f && f.getUTCMonth() === 1 && f.getUTCDate() === 29;
}

// Cuántos aniversarios se cumplieron a la fecha de corte. El día del
// aniversario YA cuenta: "desde un año después" incluye ese día.
export function periodosCumplidos(desde, corte) {
  const f = aFecha(desde), c = aFecha(corte);
  if (!f || !c || c < f) return 0;
  let n = c.getUTCFullYear() - f.getUTCFullYear();
  if (aniversario(desde, n) > c) n -= 1;
  return Math.max(0, n);
}

// ── Temporada (julio–junio) ───────────────────────────────────────────────

export function limitesTemporada(temporada) {
  const [a1] = txt(temporada).split("/").map(Number);
  if (!a1 || isNaN(a1)) return null;
  return { desde: new Date(Date.UTC(a1, 6, 1)), hasta: new Date(Date.UTC(a1 + 1, 5, 30)) };
}

// La fecha que el motor usa hoy para ubicar el cobro. Se replica para poder
// mostrarla como UNA de las candidatas, no como la que manda.
export function fechaCobroDeTemporada(temporada, mesCobro) {
  const [a1] = txt(temporada).split("/").map(Number);
  if (!a1 || isNaN(a1)) return null;
  const i = MESES_ES.indexOf(txt(mesCobro));
  const m = i >= 0 ? i : 3;
  return new Date(Date.UTC(a1 + 1, m, 1));
}

// Las cuatro fechas de una fila, cada una con su nombre y su origen.
export function fechasDeLaFila(fila, antecedentes, mesCobro) {
  const a = antecedentes || {};
  const lim = limitesTemporada(fila && fila.temporada);
  return {
    inicioPeriodoServicio: lim ? lim.desde : null,
    finPeriodoServicio: lim ? lim.hasta : null,
    emision: aFecha(a.fechaEst) || null,
    pago: aFecha(a.fechaPago) || null,
    cobroEstimadoPorElMotor: fechaCobroDeTemporada(fila && fila.temporada, mesCobro),
  };
}

export function aniversarioDentroDeTemporada(desde, temporada) {
  const lim = limitesTemporada(temporada);
  const f = aFecha(desde);
  if (!lim || !f) return { cae: false, fecha: null };
  for (let n = 1; n <= 60; n++) {
    const an = aniversario(desde, n);
    if (an > lim.hasta) break;
    if (an > lim.desde && an <= lim.hasta) return { cae: true, fecha: an, periodo: n };
  }
  return { cae: false, fecha: null };
}

// ── Antecedentes de factura y pago ────────────────────────────────────────

// TODOS los antecedentes, no solo una fecha. Si hay número de factura, marca
// de pagado, fecha de pago, monto facturado o cualquier parcialidad con algo
// cargado, la fila no se recalcula.
export function antecedentesDeCobro(pagoDeTemporada) {
  const p = pagoDeTemporada || {};
  const motivos = [];
  if (txt(p.nFact)) motivos.push("número de factura " + txt(p.nFact));
  if (p.pagado === true) motivos.push("marcada como pagada");
  if (aFecha(p.fechaPago)) motivos.push("fecha de pago " + txt(p.fechaPago));
  if (p.montoFacturado !== undefined && p.montoFacturado !== null && txt(p.montoFacturado) !== "")
    motivos.push("monto facturado " + txt(p.montoFacturado));
  const parciales = Array.isArray(p.parciales) ? p.parciales : [];
  const parcialesConDatos = parciales.filter((x) => x && (txt(x.nFact) || txt(x.monto) || aFecha(x.fecha) || x.pagado === true));
  if (parcialesConDatos.length) motivos.push(parcialesConDatos.length + " parcialidad(es) con datos");
  // `haCobrar` es un override de hectáreas, no un antecedente de cobro. Se
  // nombra aparte para no confundirlo ni ignorarlo.
  const overrideHa = p.haCobrar !== undefined && p.haCobrar !== null && txt(p.haCobrar) !== "";
  return { hay: motivos.length > 0, motivos, overrideHa };
}

// ── Activación ────────────────────────────────────────────────────────────

export function configAntiguaOperando(ct) {
  const pct = ct && ct.royaltyInflacion ? (Number(ct.rcInflacionPct) || 0) : 0;
  return { opera: pct > 0, pct };
}

// La regla que relaciona las fechas. Sin declarar y sin respaldo → sin resolver.
export function reglaFechaAplicable(ct) {
  const act = (ct && ct.reajusteActivacion) || {};
  const regla = txt(act.reglaFecha);
  const respaldo = txt(act.reglaFechaRespaldo);
  if (!regla || REGLAS_FECHA.indexOf(regla) < 0) {
    return {
      definida: false, regla: null,
      motivo: "No está declarado cuál fecha determina la tasa aplicable. Aniversario contractual, " +
        "período del servicio, emisión y pago son cuatro fechas distintas, y el contrato tiene que " +
        "decir cuál manda. Sin eso no se aplica ningún reajuste.",
      opciones: REGLAS_FECHA,
    };
  }
  if (!respaldo) {
    return {
      definida: false, regla,
      motivo: 'Se eligió "' + regla + '" pero sin respaldo documental. La regla que relaciona las ' +
        "fechas tiene que estar respaldada para aplicarse.",
      opciones: REGLAS_FECHA,
    };
  }
  return { definida: true, regla, respaldo, motivo: "" };
}

export function estadoActivacion(ct) {
  const cfg = configReajuste(ct);
  const act = (ct && ct.reajusteActivacion) || {};
  const antigua = configAntiguaOperando(ct);

  if (estadoReajuste(ct) !== "confirmado") {
    return {
      estado: NO_ACTIVABLE, activo: false,
      motivo: "El antecedente no está confirmado. Falta: " + (faltantesReajuste(ct).join(", ") || "—") + ".",
      faltan: faltantesReajuste(ct),
    };
  }
  if (cfg.tipo === "indice") {
    return {
      estado: NO_ACTIVABLE, activo: false,
      motivo: "Reajuste por índice: el sistema no proyecta una serie publicada. " +
        "Activarlo requiere cargar la serie, que no es parte de esta entrega.",
      faltan: ["serie del índice"],
    };
  }
  if (cfg.tipo === "sin_reajuste") {
    return { estado: NO_ACTIVABLE, activo: false, motivo: "El contrato declara que no lleva reajuste.", faltan: [] };
  }
  if (!act.activado) {
    return {
      estado: SIN_ACTIVAR, activo: false,
      motivo: "Antecedente confirmado, reajuste NO activado. Confirmar y activar son dos acciones " +
        "distintas: mientras no se active, los importes no cambian.",
      faltan: [],
    };
  }

  const falta = [];
  if (!aFecha(act.fechaReferencia)) falta.push("fecha de referencia");
  if (!txt(act.respaldo)) falta.push("respaldo de la fecha");
  if (falta.length) {
    return {
      estado: SIN_ACTIVAR, activo: false,
      motivo: "La activación está marcada pero incompleta. Falta: " + falta.join(", ") + ".",
      faltan: falta,
    };
  }

  const regla = reglaFechaAplicable(ct);
  if (!regla.definida) {
    return { estado: SIN_ACTIVAR, activo: false, motivo: regla.motivo, faltan: ["regla de fecha aplicable"], regla };
  }

  // Regla 3: con una configuración antigua operando, la nueva NO se declara
  // activa. El motor sigue usando la anterior y eso tiene que verse.
  if (antigua.opera) {
    return {
      estado: CONFLICTO_CON_ANTIGUA, activo: false,
      motivo: "Este contrato tiene una configuración antigua OPERANDO (" + antigua.pct + " %/año), que es la " +
        "que el motor usa y la que produce los importes actuales. La activación nueva queda registrada " +
        "pero **no activa**: no se sustituye una por otra sin autorizar la transición.",
      pctAntiguo: antigua.pct, pctNuevo: cfg.pct, regla,
      fechaReferencia: txt(act.fechaReferencia),
    };
  }

  return {
    estado: ACTIVADO, activo: true, motivo: "",
    fechaReferencia: txt(act.fechaReferencia), respaldo: txt(act.respaldo),
    usuario: txt(act.usuario), fecha: txt(act.fecha), pct: cfg.pct, regla,
  };
}

// ── Qué le pasaría a una fila ─────────────────────────────────────────────

const FACTOR = (pct, n) => Math.pow(1 + pct / 100, n);

export function reajusteDeFila(ct, fila, opciones) {
  const o = opciones || {};
  const act = estadoActivacion(ct);
  const base = Number((fila && fila.montoFact) || 0);
  const temporada = (fila && fila.temporada) || "";
  const ant = antecedentesDeCobro(o.antecedentes);
  const fechas = fechasDeLaFila(fila, o.antecedentes, o.mesCobro);

  const salida = {
    temporada, base,
    aplica: false,            // ¿entra en totales y exportaciones operativas?
    bloqueado: true,          // por defecto, nada se aplica
    factor: 1, periodos: 0,
    ajustado: base,           // SIEMPRE la base mientras esté bloqueado
    diferencia: 0,
    motivo: "", escenarios: [], intocable: false, reglaPendiente: false,
    fechas, antecedentes: ant,
  };

  if (!act.activo) { salida.motivo = act.motivo; return salida; }

  // Regla 4: cualquier antecedente de factura o pago protege la fila.
  if (ant.hay) {
    salida.intocable = true;
    salida.motivo = "Esta temporada tiene antecedentes de facturación o pago (" + ant.motivos.join("; ") +
      "). No se recalcula. Si hubiera diferencia, se presenta aparte.";
    return salida;
  }

  const anclaRegla = {
    emision: fechas.emision,
    inicioPeriodoServicio: fechas.inicioPeriodoServicio,
    finPeriodoServicio: fechas.finPeriodoServicio,
    pago: fechas.pago,
  }[act.regla.regla];

  if (!anclaRegla) {
    salida.motivo = 'La regla declarada es "' + act.regla.regla + '" y esa fecha no está cargada en esta fila. ' +
      "Sin la fecha que manda, no se aplica nada.";
    return salida;
  }

  const n = periodosCumplidos(act.fechaReferencia, anclaRegla);
  const dentro = aniversarioDentroDeTemporada(act.fechaReferencia, temporada);

  // Regla 5: el aniversario cae dentro del período del servicio y el contrato
  // no dice qué hacer. Se BLOQUEA la aplicación y se muestran los escenarios.
  if (dentro.cae) {
    salida.reglaPendiente = true;
    salida.periodos = n;
    salida.motivo = "El aniversario del reajuste (" + dentro.fecha.toISOString().slice(0, 10) + ") cae DENTRO " +
      "del período del servicio (" + temporada + "), que se factura de una sola vez. El contrato no dice si " +
      "ese período va entero al valor nuevo, prorrateado, o al anterior hasta el período siguiente. " +
      "**No se aplica ninguno**: los escenarios son informativos y no alimentan totales ni exportaciones.";
    salida.escenarios = [
      { nombre: "período entero al valor nuevo", monto: +(base * FACTOR(act.pct, n)).toFixed(2), confirmado: false },
      { nombre: "al valor anterior hasta el período siguiente", monto: +(base * FACTOR(act.pct, Math.max(0, n - 1))).toFixed(2), confirmado: false },
      { nombre: "prorrateo por días", monto: null, confirmado: false,
        nota: "No se calcula: requiere decidir la base de prorrateo (días, meses, kilos facturados)." },
    ];
    return salida;   // bloqueado: ajustado sigue siendo base
  }

  salida.bloqueado = false;
  salida.periodos = n;
  salida.factor = FACTOR(act.pct, n);
  salida.ajustado = +(base * salida.factor).toFixed(2);
  salida.diferencia = +(salida.ajustado - base).toFixed(2);
  salida.aplica = n > 0;
  return salida;
}

// Vista previa por fila. Los totales SOLO suman lo que se aplica de verdad.
export function previsualizarActivacion(ct, filas, opciones) {
  const o = opciones || {};
  const antesDe = o.antecedentesDe || (() => null);
  const detalle = (filas || []).map((f) =>
    reajusteDeFila(ct, f, { mesCobro: o.mesCobro, antecedentes: antesDe(f) }));

  const aplicadas = detalle.filter((d) => d.aplica && !d.bloqueado && !d.intocable);
  return {
    activacion: estadoActivacion(ct),
    detalle,
    filas: detalle.length,
    filasQueCambian: aplicadas.length,
    filasIntocables: detalle.filter((d) => d.intocable).length,
    filasBloqueadasPorReglaPendiente: detalle.filter((d) => d.reglaPendiente).length,
    totalBase: +detalle.reduce((s, d) => s + d.base, 0).toFixed(2),
    // Un importe no confirmado NO entra acá. El total refleja lo que se cobraría.
    totalAplicado: +detalle.reduce((s, d) => s + d.ajustado, 0).toFixed(2),
    diferenciaAplicada: +aplicadas.reduce((s, d) => s + d.diferencia, 0).toFixed(2),
  };
}

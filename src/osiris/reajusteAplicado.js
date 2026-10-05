/* eslint-disable */
// Entrega B · Aplicar el reajuste, cuando se active explícitamente.
//
// Reglas que este modelo sostiene, y que no son negociables acá:
//
//   1. Confirmar un antecedente y activar el reajuste son DOS acciones. Un
//      `reajuste` confirmado no aplica nada hasta que alguien lo active.
//   2. La activación es por contrato, con fecha de referencia y respaldo.
//   3. La configuración antigua (`royaltyInflacion` + `rcInflacionPct`) se
//      conserva y se sigue respetando. No se sustituye en silencio.
//   4. Una fila con antecedentes de facturación o pago no se recalcula. La
//      diferencia se informa aparte.
//   5. Si el contrato no resuelve qué pasa cuando el aniversario cae DENTRO de
//      una temporada, no se supone nada: queda como decisión pendiente.
//
// El motor actual ancla el factor en el índice de la cohorte. Acá el ancla es
// una FECHA, porque una cláusula como la de Olmos —"2 % anual desde un año
// después del primer pago"— no se puede expresar con un índice de cohorte.

import { configReajuste, faltantesReajuste, estadoReajuste } from "./condicionesConfigurables";

export const SIN_ACTIVAR = "sinActivar";
export const ACTIVADO = "activado";
export const NO_ACTIVABLE = "noActivable";

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
  // Rechaza fechas imposibles (31 de febrero y similares).
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f;
}

const diasDelMes = (a, m) => new Date(Date.UTC(a, m + 1, 0)).getUTCDate();

// El aniversario n de una fecha. Si el día no existe en el mes destino —el
// caso del 29 de febrero— se usa el último día de ese mes. Queda escrito acá
// porque es una decisión, no una obviedad.
export function aniversario(desde, n) {
  const f = aFecha(desde);
  if (!f) return null;
  const a = f.getUTCFullYear() + n, m = f.getUTCMonth();
  const d = Math.min(f.getUTCDate(), diasDelMes(a, m));
  return new Date(Date.UTC(a, m, d));
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

// La fecha de cobro que usa el motor: mes de cobro del segundo año de la
// temporada. No se cambia acá; se replica para poder anclar sobre ella.
export function fechaCobroDeTemporada(temporada, mesCobro) {
  const [a1] = txt(temporada).split("/").map(Number);
  if (!a1 || isNaN(a1)) return null;
  const i = MESES_ES.indexOf(txt(mesCobro));
  const m = i >= 0 ? i : 3;                       // Abril por defecto, igual que el motor
  return new Date(Date.UTC(a1 + 1, m, 1));
}

// ¿El aniversario cae DENTRO de la temporada? Ese es el caso que el contrato
// no resuelve: la temporada se factura de una vez y el ajuste entraría a mitad.
//
// El primer día de la temporada NO cuenta como "dentro": si el aniversario es
// el 1 de julio, toda la temporada queda después y no hay ambigüedad.
//
// Consecuencia que conviene tener presente: con temporada julio–junio, el
// único ancla que evita la ambigüedad es el 1 de julio. Cualquier otra fecha
// pone el aniversario dentro de TODAS las temporadas, no de una.
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

// ── Activación ────────────────────────────────────────────────────────────

export function estadoActivacion(ct) {
  const cfg = configReajuste(ct);
  const act = (ct && ct.reajusteActivacion) || {};
  const confirmado = estadoReajuste(ct) === "confirmado";

  if (!confirmado) {
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
      motivo: "La activación está marcada pero incompleta. Falta: " + falta.join(", ") +
        ". Sin eso no se aplica nada.",
      faltan: falta,
    };
  }
  return {
    estado: ACTIVADO, activo: true, motivo: "",
    fechaReferencia: txt(act.fechaReferencia), respaldo: txt(act.respaldo),
    usuario: txt(act.usuario), fecha: txt(act.fecha), pct: cfg.pct,
  };
}

// ── Qué le pasaría a una fila ─────────────────────────────────────────────

// `fila` es una fila de royalty comercial derivada: { temporada, montoFact, ... }
// `antecedentes` dice si esa fila ya tiene factura o pago registrados.
export function reajusteDeFila(ct, fila, opciones) {
  const o = opciones || {};
  const act = estadoActivacion(ct);
  const base = Number((fila && fila.montoFact) || 0);
  const salida = {
    temporada: (fila && fila.temporada) || "",
    base, aplica: false, factor: 1, periodos: 0, ajustado: base, diferencia: 0,
    motivo: "", reglaPendiente: false, intocable: false,
  };

  if (!act.activo) { salida.motivo = act.motivo; return salida; }

  // Regla 4: una fila con factura o pago registrados no se recalcula.
  if (o.conAntecedenteDeCobro) {
    salida.intocable = true;
    salida.motivo = "Esta temporada ya tiene antecedentes de facturación o pago. No se recalcula: " +
      "la diferencia, si la hubiera, se presenta aparte.";
    const corteX = fechaCobroDeTemporada(salida.temporada, o.mesCobro);
    const nX = periodosCumplidos(act.fechaReferencia, corteX);
    salida.periodos = nX;
    salida.diferenciaInformativa = +(base * (Math.pow(1 + act.pct / 100, nX) - 1)).toFixed(2);
    return salida;
  }

  const corte = fechaCobroDeTemporada(salida.temporada, o.mesCobro);
  const n = periodosCumplidos(act.fechaReferencia, corte);
  const dentro = aniversarioDentroDeTemporada(act.fechaReferencia, salida.temporada);

  salida.periodos = n;
  salida.factor = Math.pow(1 + act.pct / 100, n);
  salida.ajustado = +(base * salida.factor).toFixed(2);
  salida.diferencia = +(salida.ajustado - base).toFixed(2);
  salida.aplica = n > 0;

  // Regla 5: el aniversario cae dentro de la temporada y el contrato no dice
  // qué hacer. No se supone prorrateo ni aplicación a toda la temporada.
  if (dentro.cae) {
    salida.reglaPendiente = true;
    salida.motivo = "El aniversario del reajuste (" + dentro.fecha.toISOString().slice(0, 10) +
      ") cae DENTRO de la temporada " + salida.temporada + ", que se factura de una sola vez. " +
      "El contrato no dice si ese período se cobra entero al valor nuevo, prorrateado, o al " +
      "valor anterior hasta la temporada siguiente. **Decisión pendiente**: no se supone ninguna " +
      "de las tres. El valor de arriba es el que resultaría de mirar la fecha de cobro, y no " +
      "está confirmado.";
  }
  return salida;
}

// Vista previa por fila, para decidir con los números a la vista.
export function previsualizarActivacion(ct, filas, opciones) {
  const o = opciones || {};
  const act = estadoActivacion(ct);
  const conAntecedente = o.conAntecedenteDeCobro || (() => false);
  const detalle = (filas || []).map((f) =>
    reajusteDeFila(ct, f, { mesCobro: o.mesCobro, conAntecedenteDeCobro: conAntecedente(f) }));
  const mueve = detalle.filter((d) => d.aplica && !d.intocable);
  return {
    activacion: act,
    detalle,
    filas: detalle.length,
    filasQueCambian: mueve.length,
    filasIntocables: detalle.filter((d) => d.intocable).length,
    filasConReglaPendiente: detalle.filter((d) => d.reglaPendiente).length,
    totalBase: +detalle.reduce((s, d) => s + d.base, 0).toFixed(2),
    totalAjustado: +detalle.reduce((s, d) => s + (d.intocable ? d.base : d.ajustado), 0).toFixed(2),
    diferencia: +mueve.reduce((s, d) => s + d.diferencia, 0).toFixed(2),
    diferenciaNoAplicada: +detalle.filter((d) => d.intocable)
      .reduce((s, d) => s + (d.diferenciaInformativa || 0), 0).toFixed(2),
  };
}

// ── La configuración antigua se conserva ──────────────────────────────────

// Qué pasa con `royaltyInflacion` + `rcInflacionPct` cuando se activa lo nuevo.
// Respuesta: nada. Conviven, y se dice cuál manda, sin borrar la otra.
export function convivenciaConConfigAntigua(ct) {
  const pctViejo = ct && ct.royaltyInflacion ? (Number(ct.rcInflacionPct) || 0) : 0;
  const act = estadoActivacion(ct);
  if (pctViejo > 0 && act.activo) {
    return {
      hayDos: true, mandaNueva: false,
      aviso: "Este contrato tiene una configuración antigua operando (" + pctViejo + " %/año) y " +
        "además una activación nueva. **No se sustituye una por otra automáticamente.** " +
        "Mientras no se autorice la transición, manda la antigua y la nueva queda registrada.",
      pctAntiguo: pctViejo, pctNuevo: act.pct,
    };
  }
  return { hayDos: false, mandaNueva: !!act.activo, pctAntiguo: pctViejo, pctNuevo: act.activo ? act.pct : null, aviso: "" };
}

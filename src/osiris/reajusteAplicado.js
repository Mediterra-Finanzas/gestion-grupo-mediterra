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

// ── Version de recuperacion ───────────────────────────────────────────────
//
// Volver a una version SIN soporte de activaciones no es recuperacion: borra
// el reajuste aplicado, que es una operacion economica y no puede ocurrir como
// efecto silencioso de un rollback. Medido: US$ 25.690,69 en el caso sintetico.
//
// Por eso existe una VERSION DE RECUPERACION COMPATIBLE: calcula igual las
// activaciones que ya existen en los datos, y bloquea la creacion de nuevas.
// Es la unica a la que se puede volver sin cambiar importes.
//
// En el candidato esta bandera va en true. En la rama de recuperacion, en
// false. Es la UNICA diferencia entre las dos.
export const ACTIVACIONES_NUEVAS_HABILITADAS = true;

export function puedeCrearActivacion() {
  return ACTIVACIONES_NUEVAS_HABILITADAS
    ? { puede: true, motivo: "" }
    : { puede: false, motivo: "Esta es la version de recuperacion: conserva el calculo de las " +
        "activaciones que ya existen, pero no permite crear nuevas." };
}

export const SIN_ACTIVAR = "sinActivar";
export const ACTIVADO = "activado";
export const NO_ACTIVABLE = "noActivable";
export const CONFLICTO_CON_ANTIGUA = "conflictoConAntigua";
export const MODIFICACION_PENDIENTE = "modificacionPendiente";

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

// ── Sello de los terminos economicos ──────────────────────────────────────
//
// Al activar se sella CON QUE terminos se activo: porcentaje, fecha de
// referencia y regla de fecha. Editar despues cualquiera de los tres NO
// recalcula: seria mover plata por editar un antecedente. El sello sigue
// gobernando y la diferencia queda como modificacion economica pendiente de
// confirmar explicitamente.
//
// Ese flujo de confirmacion NO entra en este paquete, asi que la modificacion
// queda bloqueada mientras el reajuste este activo.
export function sellarTerminos(cfg, act) {
  return {
    pct: cfg.pct,
    fechaReferencia: txt(act.fechaReferencia),
    reglaFecha: txt(act.reglaFecha),
  };
}

export function terminosVigentes(ct) {
  const cfg = configReajuste(ct);
  const act = (ct && ct.reajusteActivacion) || {};
  return sellarTerminos(cfg, act);
}

export function diferenciasConElSello(ct) {
  const act = (ct && ct.reajusteActivacion) || {};
  const sello = act.sello;
  if (!sello) return { hay: false, campos: [], sello: null, vigentes: terminosVigentes(ct) };
  const v = terminosVigentes(ct);
  const campos = [];
  if (String(sello.pct) !== String(v.pct)) campos.push({ campo: "porcentaje", sellado: sello.pct, actual: v.pct });
  if (txt(sello.fechaReferencia) !== txt(v.fechaReferencia))
    campos.push({ campo: "fecha de referencia", sellado: sello.fechaReferencia, actual: v.fechaReferencia });
  if (txt(sello.reglaFecha) !== txt(v.reglaFecha))
    campos.push({ campo: "regla de fecha", sellado: sello.reglaFecha, actual: v.reglaFecha });
  return { hay: campos.length > 0, campos, sello, vigentes: v };
}

// Con el reajuste activo, estos tres campos no se editan desde la pantalla de
// antecedentes. Cambiarlos es una modificacion economica y necesita su propio
// flujo, que no esta en este paquete.
export function puedeEditarTerminos(ct) {
  const e = estadoActivacion(ct);
  if (e.estado === ACTIVADO || e.estado === MODIFICACION_PENDIENTE) {
    return {
      puede: false,
      campos: ["porcentaje", "fecha de referencia", "regla de fecha"],
      motivo: "El reajuste esta activo. Cambiar el porcentaje, la fecha de referencia o la regla de " +
        "fecha mueve importes, asi que es una modificacion economica y no una edicion de antecedentes. " +
        "Ese flujo (vista previa fila por fila y confirmacion explicita) no esta en este paquete: " +
        "para modificar, primero hay que desactivar, que tambien es una operacion economica.",
    };
  }
  return { puede: true, campos: [], motivo: "" };
}

// Crear una activacion. En la version de recuperacion se RECHAZA en la accion,
// no solo ocultando un boton.
export function activar(ct, datos) {
  const permiso = puedeCrearActivacion();
  if (!permiso.puede) return { ok: false, motivo: permiso.motivo, contrato: ct };
  const d = datos || {};
  const cfg = configReajuste(ct);
  if (estadoReajuste(ct) !== "confirmado")
    return { ok: false, motivo: "El antecedente no esta confirmado.", contrato: ct };
  const act = {
    activado: true,
    fechaReferencia: txt(d.fechaReferencia),
    respaldo: txt(d.respaldo),
    reglaFecha: txt(d.reglaFecha),
    reglaFechaRespaldo: txt(d.reglaFechaRespaldo),
    usuario: txt(d.usuario),
    fecha: txt(d.fecha) || new Date().toISOString().slice(0, 10),
  };
  act.sello = sellarTerminos(cfg, act);
  return { ok: true, motivo: "", contrato: Object.assign({}, ct, { reajusteActivacion: act }) };
}

// Desactivar es una operacion economica propia, no un efecto secundario.
export function desactivar(ct, motivo, usuario) {
  const act = (ct && ct.reajusteActivacion) || {};
  if (!act.activado) return { ok: false, motivo: "No hay una activacion vigente.", contrato: ct };
  if (!txt(motivo)) return { ok: false, motivo: "Desactivar mueve importes: hace falta un motivo.", contrato: ct };
  return {
    ok: true, motivo: "",
    contrato: Object.assign({}, ct, {
      reajusteActivacion: Object.assign({}, act, {
        activado: false,
        desactivadoMotivo: txt(motivo),
        desactivadoPor: txt(usuario),
        desactivadoFecha: new Date().toISOString().slice(0, 10),
      }),
    }),
  };
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

  // El sello manda sobre los campos editables: una edicion posterior del
  // antecedente no mueve importes por si sola.
  const dif = diferenciasConElSello(ct);
  const sello = act.sello || null;
  const base = {
    fechaReferencia: sello ? txt(sello.fechaReferencia) : txt(act.fechaReferencia),
    pct: sello ? sello.pct : cfg.pct,
    reglaSellada: sello ? txt(sello.reglaFecha) : regla.regla,
    respaldo: txt(act.respaldo), usuario: txt(act.usuario), fecha: txt(act.fecha),
    regla: Object.assign({}, regla, { regla: sello ? txt(sello.reglaFecha) : regla.regla }),
  };

  if (dif.hay) {
    return Object.assign({
      estado: MODIFICACION_PENDIENTE, activo: true,
      motivo: "Se edito " + dif.campos.map((c) => c.campo).join(", ") + " despues de activar. " +
        "**Los importes NO cambiaron**: sigue aplicandose lo sellado al activar. Aplicar la " +
        "modificacion es una operacion economica aparte, con vista previa y confirmacion, y " +
        "no esta en este paquete.",
      diferencias: dif.campos,
    }, base);
  }

  return Object.assign({ estado: ACTIVADO, activo: true, motivo: "" }, base);
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

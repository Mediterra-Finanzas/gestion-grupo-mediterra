/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Retención tributaria por contrato  (A1 · A2 · A3)
//
// Hoy el motor calcula la retención con el país del cliente: `pct(pais)`,
// Chile 1,00 y el resto 0,85. El país es a la vez dato de identificación y
// parámetro tributario, así que corregir una identificación mueve el neto.
//
// Acá la retención pasa a ser un dato propio del contrato, con tres estados y
// una transición explícita. Nada de esto se aplica solo:
//
//   · "sinTransicion"        — el contrato todavía no pasó por la transición.
//                              El motor sigue calculando por país, igual que
//                              antes, y el neto NO está validado. Mientras el
//                              contrato esté así, cambiar el país SÍ mueve el
//                              neto: eso es lo que arregla la transición.
//   · "heredado_sin_validar" — la transición congeló en el contrato el valor
//                              que el motor venía aplicando. El número no
//                              cambia, y por eso el país deja de moverlo. NO
//                              es una tasa tributaria aprobada: sigue sin
//                              validar.
//   · "validada"             — un usuario autorizado la confirmó, con su
//                              respaldo. Recién acá el neto está validado.
//
// Una "propuesta" vive aparte y NUNCA entra al cálculo. Registrar el respaldo
// no valida nada: hace falta la confirmación de quien está autorizado.
// ══════════════════════════════════════════════════════════════════

const txt = (v) => (v === undefined || v === null ? "" : String(v).trim());
const numOrNull = (v) => {
  if (v === undefined || v === null || txt(v) === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
const red2 = (n) => Math.round(n * 100) / 100;

export const SIN_TRANSICION = "sinTransicion";
export const HEREDADO = "heredado_sin_validar";
export const VALIDADA = "validada";

export const ETIQUETA_RETENCION = {
  [SIN_TRANSICION]: "sin validar (heredado del país)",
  [HEREDADO]: "heredado, sin validar",
  [VALIDADA]: "validado",
};

// Lo que el motor viene aplicando hoy, expresado en porcentaje de retención.
// Es la única regla que mira el país, y solo se usa para la transición y para
// los contratos que todavía no pasaron por ella.
export function pctPorPaisLegado(pais) {
  return txt(pais).toLowerCase().includes("chile") ? 0 : 15;
}

export function configRetencion(ct) {
  const r = (ct && ct.retencionTributaria) || null;
  if (!r) return { estado: SIN_TRANSICION, pct: null, origen: "", congeladoEl: "", validadoPor: "", validadoEl: "", respaldo: "", propuesta: null };
  const p = r.propuesta && numOrNull(r.propuesta.pct) !== null
    ? { pct: numOrNull(r.propuesta.pct), respaldo: txt(r.propuesta.respaldo), propuestaPor: txt(r.propuesta.propuestaPor), propuestaEl: txt(r.propuesta.propuestaEl) }
    : null;
  const estado = r.estado === VALIDADA ? VALIDADA : (r.estado === HEREDADO ? HEREDADO : SIN_TRANSICION);
  return {
    estado,
    pct: numOrNull(r.pct),
    origen: txt(r.origen),
    congeladoEl: txt(r.congeladoEl),
    validadoPor: txt(r.validadoPor),
    validadoEl: txt(r.validadoEl),
    respaldo: txt(r.respaldo),
    propuesta: p,
  };
}

// Estado completo de la retención de un contrato, con el porcentaje que el
// motor está usando de verdad.
export function estadoRetencion(ct) {
  const c = configRetencion(ct);
  if (c.estado === SIN_TRANSICION || c.pct === null) {
    const pct = pctPorPaisLegado(ct && ct.pais);
    return {
      estado: SIN_TRANSICION, pct, validado: false,
      etiqueta: ETIQUETA_RETENCION[SIN_TRANSICION],
      detalle: `El motor calcula por país (${txt(ct && ct.pais) || "sin país"}: ${pct} %). Mientras el contrato no pase por la transición, cambiar el país mueve el neto.`,
      propuesta: c.propuesta,
    };
  }
  if (c.estado === HEREDADO) {
    return {
      estado: HEREDADO, pct: c.pct, validado: false,
      etiqueta: ETIQUETA_RETENCION[HEREDADO],
      detalle: `${c.pct} % congelado en la transición${c.congeladoEl ? ` el ${c.congeladoEl}` : ""}. Es lo que el motor ya venía aplicando, no una tasa tributaria aprobada: el neto sigue sin validar.`,
      propuesta: c.propuesta,
    };
  }
  return {
    estado: VALIDADA, pct: c.pct, validado: true,
    etiqueta: ETIQUETA_RETENCION[VALIDADA],
    detalle: `${c.pct} % validado por ${c.validadoPor || "—"}${c.validadoEl ? ` el ${c.validadoEl}` : ""}. Respaldo: ${c.respaldo || "—"}.`,
    propuesta: c.propuesta,
  };
}

// Factor que multiplica al monto facturado para obtener el neto.
// 1 = sin retención. Nunca lo decide una propuesta.
export function factorNeto(ct) {
  return red2(1 - estadoRetencion(ct).pct / 100) ;
}

export function netoValidado(ct) {
  return estadoRetencion(ct).estado === VALIDADA;
}

// ── Filas derivadas ───────────────────────────────────────────────
// Las filas que produce el motor llevan su propio estado, para que cada tabla
// y cada exportación lo muestre sin volver a calcularlo. Una fila suelta que
// solo tiene país (datos antiguos cargados a mano) queda "sin transición".
export function sellarFila(fila, ct) {
  const e = estadoRetencion(ct || { pais: fila && fila.pais });
  return { ...fila, retEstado: e.estado, retPct: e.pct, netoValidado: e.validado, retEtiqueta: e.etiqueta };
}
export function estadoDeFila(fila) {
  if (fila && fila.retEstado) return { estado: fila.retEstado, pct: fila.retPct, validado: !!fila.netoValidado, etiqueta: fila.retEtiqueta };
  const pct = pctPorPaisLegado(fila && fila.pais);
  return { estado: SIN_TRANSICION, pct, validado: false, etiqueta: ETIQUETA_RETENCION[SIN_TRANSICION] };
}
export function factorNetoFila(fila) {
  return red2(1 - estadoDeFila(fila).pct / 100);
}

// ── Transición explícita (A1) ─────────────────────────────────────
// Congela en cada contrato el valor que el motor ya aplica. El factor de antes
// y el de después son el mismo: ningún importe se mueve. Aplicarla sobre datos
// productivos se autoriza aparte.
export function transicionHeredada(ct, fecha) {
  if (!ct) return ct;
  if (configRetencion(ct).estado !== SIN_TRANSICION) return ct;   // idempotente
  return {
    ...ct,
    retencionTributaria: {
      pct: pctPorPaisLegado(ct.pais),
      estado: HEREDADO,
      origen: "pais",
      congeladoEl: txt(fecha) || new Date().toISOString().slice(0, 10),
    },
  };
}

export function aplicarTransicion(contratos, fecha) {
  const lista = Array.isArray(contratos) ? contratos : [];
  const salida = lista.map((ct) => transicionHeredada(ct, fecha));
  const cambiados = salida.filter((ct, i) => ct !== lista[i]).length;
  const desvios = salida
    .map((ct, i) => ({ id: ct.id, antes: red2(1 - pctPorPaisLegado(lista[i].pais) / 100), despues: factorNeto(ct) }))
    .filter((x) => x.antes !== x.despues);
  return { contratos: salida, cambiados, yaMigrados: lista.length - cambiados, desvios };
}

// ── Cambiar el país: nunca en silencio ────────────────────────────
// Mientras un contrato no pase por la transición, el país sigue decidiendo su
// retención. Cambiarlo es entonces un cambio económico disfrazado de
// corrección de identificación, así que hay que decirlo antes de hacerlo.
export function efectoCambioPais(ct, nuevoPais) {
  const antes = estadoRetencion(ct);
  const despues = estadoRetencion({ ...(ct || {}), pais: txt(nuevoPais) });
  const cambia = antes.pct !== despues.pct;
  if (!cambia) {
    return {
      cambiaElNeto: false, pctAntes: antes.pct, pctDespues: despues.pct,
      requiereConfirmacion: false,
      detalle: antes.estado === SIN_TRANSICION
        ? `El país cambia, la retención sigue en ${antes.pct} %: el neto no se mueve.`
        : `La retención de este contrato ya no depende del país (${antes.etiqueta}): el neto no se mueve.`,
    };
  }
  return {
    cambiaElNeto: true, pctAntes: antes.pct, pctDespues: despues.pct,
    requiereConfirmacion: true,
    detalle: `Este contrato todavía calcula la retención por país. Cambiarlo de "${txt(ct && ct.pais) || "sin país"}" a "${txt(nuevoPais)}" mueve la retención de ${antes.pct} % a ${despues.pct} % y con ella el neto de este contrato. No es solo una corrección de identificación.`,
  };
}

// Registro del cambio en el propio contrato, para que quede rastro de quién
// movió el neto y por qué.
export function registrarCambioPais(ct, nuevoPais, usuario, fecha) {
  const e = efectoCambioPais(ct, nuevoPais);
  const hist = Array.isArray(ct && ct.historialPais) ? ct.historialPais : [];
  return {
    ...ct,
    pais: txt(nuevoPais),
    historialPais: hist.concat([{
      de: txt(ct && ct.pais), a: txt(nuevoPais),
      pctAntes: e.pctAntes, pctDespues: e.pctDespues, movioElNeto: e.cambiaElNeto,
      usuario: txt(usuario && (usuario.nombre || usuario.email)),
      fecha: txt(fecha) || new Date().toISOString().slice(0, 10),
    }]),
  };
}

// ── Propuesta y validación (A2) ───────────────────────────────────
// Proponer no cambia ningún cálculo. Validar lo cambia, y solo puede hacerlo
// quien está autorizado; registrar el respaldo no reemplaza esa confirmación.
// OJO: esto NO es un permiso que ya exista en el sistema. `rol:"admin"` y la
// marca `esCFO` sí existen y se usan en otros módulos, pero usarlos como
// condición para validar una tasa tributaria es una REGLA NUEVA, propuesta por
// esta entrega y pendiente de aprobación del CFO. Hasta que se apruebe, se
// muestra en pantalla como propuesta.
export const REGLA_VALIDACION = {
  aprobada: false,
  descripcion: "Solo un administrador o el CFO puede validar una tasa de retención.",
  nota: "Regla propuesta, pendiente de aprobación. No es un permiso existente del sistema.",
};

export function puedeValidarRetencion(usuario) {
  if (!usuario) return false;
  return usuario.rol === "admin" || !!usuario.esCFO;
}

export function proponerRetencion(ct, { pct, respaldo, propuestaPor, fecha } = {}) {
  if (!ct) return ct;
  const valor = numOrNull(pct);
  const base = (ct.retencionTributaria && { ...ct.retencionTributaria }) || {};
  if (valor === null) { delete base.propuesta; }
  else base.propuesta = { pct: valor, respaldo: txt(respaldo), propuestaPor: txt(propuestaPor), propuestaEl: txt(fecha) || new Date().toISOString().slice(0, 10) };
  if (!base.estado) base.estado = SIN_TRANSICION;
  return { ...ct, retencionTributaria: base };
}

export function faltantesValidacion(ct) {
  const c = configRetencion(ct);
  const falta = [];
  if (!c.propuesta) return ["una tasa propuesta"];
  if (c.propuesta.pct === null || c.propuesta.pct < 0) falta.push("porcentaje");
  if (!c.propuesta.respaldo) falta.push("respaldo documental");
  return falta;
}

// Devuelve el contrato validado, o null si no corresponde (sin permiso, sin
// propuesta o sin respaldo). No lanza: quien llama decide qué avisar.
export function validarRetencion(ct, usuario, fecha) {
  if (!ct || !puedeValidarRetencion(usuario)) return null;
  if (faltantesValidacion(ct).length > 0) return null;
  const c = configRetencion(ct);
  const previo = estadoRetencion(ct);
  return {
    ...ct,
    retencionTributaria: {
      pct: c.propuesta.pct,
      estado: VALIDADA,
      origen: "validacion",
      validadoPor: txt(usuario.nombre) || txt(usuario.email),
      validadoEl: txt(fecha) || new Date().toISOString().slice(0, 10),
      respaldo: c.propuesta.respaldo,
      congeladoEl: c.congeladoEl,
      // Qué regía antes de validar. Al quitar la validación se vuelve a ESTO,
      // no a lo que diga el país hoy: si no, el país volvería a decidir.
      pctPrevio: previo.pct,
      estadoPrevio: previo.estado,
    },
  };
}

// Deshacer una validación vuelve al estado anterior, nunca borra el respaldo:
// queda como propuesta para que la trazabilidad no se pierda.
export function revertirValidacion(ct, usuario) {
  if (!ct || !puedeValidarRetencion(usuario)) return null;
  const r = (ct && ct.retencionTributaria) || {};
  const c = configRetencion(ct);
  if (c.estado !== VALIDADA) return null;
  const teniaCongelado = !!c.congeladoEl;
  const previo = numOrNull(r.pctPrevio);
  // Vuelve a regir exactamente lo que regía antes de validar.
  const pctVuelve = previo !== null ? previo : (teniaCongelado ? pctPorPaisLegado(ct.pais) : null);
  return {
    ...ct,
    retencionTributaria: {
      pct: teniaCongelado ? pctVuelve : null,
      estado: teniaCongelado ? HEREDADO : SIN_TRANSICION,
      origen: teniaCongelado ? "pais" : "",
      congeladoEl: c.congeladoEl,
      // El respaldo no se pierde: la tasa retirada queda como propuesta, y
      // como propuesta NO entra al cálculo.
      propuesta: { pct: c.pct, respaldo: c.respaldo, propuestaPor: c.validadoPor, propuestaEl: c.validadoEl },
    },
  };
}

// Qué queda operativo si se retira la validación. Sirve para avisarlo ANTES.
export function efectoRetirarValidacion(ct) {
  const c = configRetencion(ct);
  if (c.estado !== VALIDADA) return { aplica: false };
  const despues = estadoRetencion(revertirValidacion(ct, { rol: "admin" }));
  return {
    aplica: true,
    pctAntes: c.pct,
    pctDespues: despues.pct,
    estadoDespues: despues.estado,
    cambiaElNeto: c.pct !== despues.pct,
    detalle: `Queda operativa la retención ${despues.pct} % (${despues.etiqueta}). La tasa retirada (${c.pct} %) queda como propuesta con su respaldo y NO entra al cálculo.`,
  };
}

// ── Avisos para tablas y exportaciones (A3) ───────────────────────
export const COLUMNA_NETO = "Neto validado";

export function celdaNeto(filaOCt) {
  const e = filaOCt && filaOCt.retEstado ? estadoDeFila(filaOCt) : estadoRetencion(filaOCt);
  return e.validado ? "Sí" : `No · ${e.etiqueta}`;
}

// Resumen para el pie de una tabla o de un archivo exportado.
export function resumenValidacion(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const porEstado = { [VALIDADA]: 0, [HEREDADO]: 0, [SIN_TRANSICION]: 0 };
  lista.forEach((f) => { porEstado[estadoDeFila(f).estado] += 1; });
  const sinValidar = porEstado[HEREDADO] + porEstado[SIN_TRANSICION];
  return {
    total: lista.length,
    validadas: porEstado[VALIDADA],
    heredadas: porEstado[HEREDADO],
    sinTransicion: porEstado[SIN_TRANSICION],
    sinValidar,
    haySinValidar: sinValidar > 0,
    nota: sinValidar === 0 ? "" :
      `${sinValidar} de ${lista.length} fila(s) tienen el neto SIN VALIDAR (${porEstado[HEREDADO]} con retención heredada de la transición, ${porEstado[SIN_TRANSICION]} calculadas por país). "Heredado" no es "validado": esos netos no están confirmados tributariamente.`,
  };
}

// ══════════════════════════════════════════════════════════════════
// RECUPERABILIDAD · paso mínimo de compatibilidad y guarda de rollback
//
// El problema: el código que hoy corre en producción CONSERVA el campo
// `retencionTributaria` al guardar, pero NO lo lee: calcula con `pct(pais)`.
// Volver a ese código después de validar una tasa distinta de la heredada, o
// después de corregir un país post-transición, muestra netos distintos.
// El rollback deja de ser económicamente seguro justo ahí.
//
// Lo de abajo son dos piezas independientes:
//
//   1. El PASO MÍNIMO (expand): tres funciones que son reemplazo directo de
//      `pct()` y `whtLabel()` del módulo, y que leen el campo cuando está
//      cargado. Sin UI, sin transición, sin validación. Mientras ningún
//      contrato tenga el campo, devuelven exactamente lo mismo que hoy, así
//      que publicarlas solas no mueve ni un importe.
//
//   2. La GUARDA: mientras el destino de rollback no lea el campo, quedan
//      bloqueadas las dos operaciones que vuelven irrecuperable el estado
//      (validar una tasa y corregir el país de un contrato ya migrado).
//
// Nada de esto aplica la transición ni valida ninguna tasa.
// ══════════════════════════════════════════════════════════════════

// Factor que aplica el código ANTERIOR (el de producción): solo mira el país.
// Es el oráculo contra el que se mide si un rollback movería importes.
export function factorNetoLegado(pais) {
  return red2(1 - pctPorPaisLegado(pais) / 100);
}

// ── 1 · Paso mínimo (expand) ──────────────────────────────────────
// Resuelve el estado de retención aceptando lo mismo que aceptaba `pct()`
// (un país suelto) y además un contrato o una fila. Cuando el objeto no trae
// el campo cargado, cae al país: comportamiento idéntico al de hoy.
function resolverCompat(x) {
  if (x === null || x === undefined) return estadoRetencion({ pais: "" });
  if (typeof x === "string" || typeof x === "number") return estadoRetencion({ pais: String(x) });
  if (typeof x !== "object") return estadoRetencion({ pais: "" });
  if (x.retencionTributaria) return estadoRetencion(x);
  if (x.retEstado) {
    const e = estadoDeFila(x);
    return { estado: e.estado, pct: e.pct, validado: e.validado, etiqueta: e.etiqueta, detalle: "", propuesta: null };
  }
  return estadoRetencion(x);
}

// Reemplazo directo de `pct(pais)`. En el módulo, `pct(r.pais)` pasa a `pct(r)`.
export function factorNetoCompat(x) {
  return red2(1 - resolverCompat(x).pct / 100);
}

// Reemplazo directo de `pct(ct.pais) === 1 ? 0 : 15`, que hoy muestra 15 fijo
// aunque el factor aplicado sea otro. Devuelve el porcentaje que rige.
export function pctRetencionCompat(x) {
  return resolverCompat(x).pct;
}

// Reemplazo directo de `whtLabel(pais)`: null cuando no hay retención.
export function etiquetaWhtCompat(x) {
  const p = resolverCompat(x).pct;
  return p > 0 ? "WHT " + p + "%" : null;
}

// Estado completo para las pantallas que hoy muestran texto fijo ("WHT 15 %",
// "85 %"). Sirve para que el paso mínimo no deje leyendas que contradigan el
// número aplicado.
export function estadoCompat(x) {
  return resolverCompat(x);
}

// ── Leyenda común de pantalla ─────────────────────────────────────
// UN solo formato para todos los sitios que rotulan la retención. Antes cada
// lugar escribía su propio texto, con el 15 % a mano, así que la pantalla
// podía decir una cosa mientras el motor aplicaba otra. Con una tasa validada
// distinta eso deja de ser un detalle: es un documento tributario que miente.
//
// Acepta lo mismo que el paso mínimo: un país suelto (firma antigua), un
// contrato o una fila ya sellada. Devuelve siempre la tasa efectivamente
// utilizada y su estado de validación, nunca uno sin el otro.
//
//   tasa     "WHT 20%" | "Sin WHT"                 — el número aplicado
//   marca    "validado" | "heredado" | "por país"  — el estado, corto
//   etiqueta texto completo del estado             — para el tooltip
//   badge    "WHT 20% · heredado"                  — insignia de tabla
//   sufijo   " (WHT 20% · heredado)"               — dentro de otra frase
//   frase    oración completa                      — leyendas de cabecera
export const MARCA_RETENCION = {
  [VALIDADA]: "validado",
  [HEREDADO]: "heredado",
  [SIN_TRANSICION]: "por país",
};

export function leyendaRetencion(x) {
  const e = resolverCompat(x);
  const hay = e.pct > 0;
  const marca = MARCA_RETENCION[e.estado] || MARCA_RETENCION[SIN_TRANSICION];
  const tasa = hay ? "WHT " + e.pct + "%" : "Sin WHT";
  return {
    pct: e.pct,
    factor: red2(1 - e.pct / 100),
    estado: e.estado,
    validado: e.validado,
    etiqueta: e.etiqueta,
    marca,
    tasa,
    badge: tasa + " · " + marca,
    sufijo: " (" + (hay ? "WHT " + e.pct + "%" : "sin WHT") + " · " + marca + ")",
    frase: "Se cobra el " + red2(100 - e.pct) + " % de lo facturado" +
      (hay ? " (retención " + e.pct + " %" : " (sin retención") + " · " + e.etiqueta + ").",
  };
}

// La misma leyenda, para una cabecera que rotula una tabla entera. No inventa
// una tasa "del grupo": enumera las que hay en pantalla y remite a cada fila.
export function leyendaRetencionFilas(filas) {
  const lista = Array.isArray(filas) ? filas : [];
  const pcts = [];
  lista.forEach((f) => { const p = estadoDeFila(f).pct; if (pcts.indexOf(p) === -1) pcts.push(p); });
  pcts.sort((a, b) => a - b);
  const r = resumenValidacion(lista);
  const tasasTexto = pcts.map((p) => (p > 0 ? p + " %" : "sin retención")).join(" / ");
  const frase = "Monto a Cobrar = Monto a Facturar × (1 − retención del contrato). " +
    (pcts.length === 0
      ? "No hay filas que mostrar."
      : "En pantalla " + (pcts.length === 1 ? "rige una tasa" : "rigen " + pcts.length + " tasas") +
        ": " + tasasTexto + ". Cada fila muestra la suya y su estado de validación.") +
    (r.sinValidar > 0 ? " " + r.sinValidar + " de " + r.total + " sin validar." : "");
  return { tasas: pcts, tasasTexto, total: r.total, validadas: r.validadas, sinValidar: r.sinValidar, frase };
}

// ── 2 · Guarda de rollback ────────────────────────────────────────
// `destinoLeeElCampo` describe un hecho del entorno, no una preferencia:
// la versión a la que se volvería en un rollback, ¿lee `retencionTributaria`?
// Arranca en falso porque hoy la respuesta es no. Lo cambia el despliegue del
// paso mínimo, no una opinión.
export const COMPAT_ROLLBACK = {
  destinoLeeElCampo: false,
  descripcion: "El destino de rollback lee retencionTributaria.",
  nota: "Mientras sea falso, volver al código anterior ignora las tasas validadas y vuelve a calcular por país. Por eso quedan bloqueadas las operaciones que no se pueden deshacer sin mover importes.",
};

export function destinoRollbackLeeElCampo() {
  return !!COMPAT_ROLLBACK.destinoLeeElCampo;
}

export function setDestinoRollbackLeeElCampo(v) {
  COMPAT_ROLLBACK.destinoLeeElCampo = !!v;
  return COMPAT_ROLLBACK.destinoLeeElCampo;
}

export const MOTIVO_GUARDA_VALIDAR =
  "Validar una tasa distinta de la heredada deja el estado sin rollback seguro: " +
  "el código al que se volvería no lee retencionTributaria y seguiría calculando por país, " +
  "con netos distintos. Para habilitarlo hay que desplegar antes el paso mínimo de compatibilidad.";

export const MOTIVO_GUARDA_PAIS =
  "Este contrato ya pasó por la transición, así que su retención dejó de depender del país. " +
  "Corregir el país ahora no mueve el neto en esta versión, pero sí lo movería al volver al código " +
  "anterior, que vuelve a calcular por país. Para habilitarlo hay que desplegar antes el paso mínimo " +
  "de compatibilidad.";

const COMO_DESBLOQUEAR =
  "Desplegar el paso mínimo (que el código anterior lea retencionTributaria) y recién entonces marcar la compatibilidad.";

// ¿Se puede validar la retención de este contrato, acá y ahora?
// Separa tres cosas que no son lo mismo: el permiso propuesto, lo que falta
// para validar, y la guarda de recuperabilidad.
export function guardaValidacion(ct, usuario) {
  const faltantes = faltantesValidacion(ct);
  const conPermiso = puedeValidarRetencion(usuario);
  const bloqueada = !destinoRollbackLeeElCampo();
  return {
    permitida: conPermiso && faltantes.length === 0 && !bloqueada,
    bloqueada,
    conPermiso,
    faltantes,
    motivo: bloqueada ? MOTIVO_GUARDA_VALIDAR : "",
    comoDesbloquear: bloqueada ? COMO_DESBLOQUEAR : "",
    reglaAprobada: REGLA_VALIDACION.aprobada,
  };
}

// Validar pasando por la guarda. Es la puerta que debe cablear la pantalla;
// `validarRetencion` queda como la transición de estado que usa por dentro.
export function validarRetencionConGuarda(ct, usuario, fecha) {
  const g = guardaValidacion(ct, usuario);
  if (g.bloqueada) return { ok: false, contrato: ct, bloqueo: g };
  const v = validarRetencion(ct, usuario, fecha);
  if (!v) return { ok: false, contrato: ct, bloqueo: g };
  return { ok: true, contrato: v, bloqueo: null };
}

// Cambiar el país es seguro mientras el contrato siga "sin transición": el
// código anterior y el nuevo calculan igual. Deja de serlo en cuanto el
// contrato tiene valor propio.
export function guardaCambioPais(ct, nuevoPais) {
  const efecto = efectoCambioPais(ct, nuevoPais);
  const yaMigrado = configRetencion(ct).estado !== SIN_TRANSICION;
  const bloqueada = yaMigrado && !destinoRollbackLeeElCampo();
  return {
    ...efecto,
    bloqueada,
    motivo: bloqueada ? MOTIVO_GUARDA_PAIS : "",
    comoDesbloquear: bloqueada ? COMO_DESBLOQUEAR : "",
  };
}

// Lo que tiene que hacer la pantalla ante un cambio de país, en un solo
// lugar. Separa tres cosas que se confundieron una vez: si la operación está
// bloqueada, si hay que preguntar (solo cuando el neto se mueve) y que el
// cambio siempre se registra. Que hoy el neto no se mueva no vuelve inocuo al
// cambio: lo que decide el bloqueo es el rollback, no el efecto de hoy.
export function decisionCambioPais(ct, nuevoPais) {
  const g = guardaCambioPais(ct, nuevoPais);
  return {
    bloqueada: g.bloqueada,
    motivo: g.motivo,
    comoDesbloquear: g.comoDesbloquear,
    preguntar: !g.bloqueada && !!g.cambiaElNeto,
    registrar: !g.bloqueada,
    efecto: g,
  };
}

export function registrarCambioPaisConGuarda(ct, nuevoPais, usuario, fecha) {
  const g = guardaCambioPais(ct, nuevoPais);
  if (g.bloqueada) return { ok: false, contrato: ct, bloqueo: g };
  return { ok: true, contrato: registrarCambioPais(ct, nuevoPais, usuario, fecha), bloqueo: null };
}

// ── Medición: ¿un rollback movería importes hoy? ──────────────────
// Compara, contrato por contrato, el factor que aplica esta versión contra el
// que aplicaría el código anterior. No decide nada: informa. El impacto en
// plata lo calcula quien tenga los montos delante.
export function divergenciaRollback(ct) {
  const nuevo = estadoRetencion(ct);
  const anterior = pctPorPaisLegado(ct && ct.pais);
  return {
    id: (ct && ct.id) || "",
    pais: txt(ct && ct.pais),
    estado: nuevo.estado,
    pctEstaVersion: nuevo.pct,
    pctCodigoAnterior: anterior,
    factorEstaVersion: red2(1 - nuevo.pct / 100),
    factorCodigoAnterior: red2(1 - anterior / 100),
    diverge: nuevo.pct !== anterior,
  };
}

export function estadoRecuperabilidad(contratos) {
  const lista = Array.isArray(contratos) ? contratos : [];
  const detalle = lista.map(divergenciaRollback);
  const divergen = detalle.filter((d) => d.diverge);
  const destinoOk = destinoRollbackLeeElCampo();
  return {
    total: lista.length,
    divergen: divergen.length,
    contratos: divergen,
    destinoLeeElCampo: destinoOk,
    rollbackSeguro: destinoOk || divergen.length === 0,
    nota: destinoOk
      ? "El destino de rollback lee retencionTributaria: volver atrás no mueve importes."
      : divergen.length === 0
        ? "Ningún contrato aplica una retención distinta de la que daría su país: hoy volver atrás no movería importes. Deja de ser cierto en cuanto se valide una tasa distinta o se corrija un país ya migrado."
        : divergen.length + " de " + lista.length + " contrato(s) aplican una retención distinta de la que daría su país. Volver al código anterior cambiaría el neto de esos contratos: los datos no se pierden, se ignoran.",
  };
}

/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Osiris · Condiciones configurables por contrato
//
// A. Beneficio del contract fee (cupo de plantas sin royalty por planta)
// B. Reajuste por inflación pactado
// C. País del cliente / territorio contractual / retención
//
// Reglas que atraviesan todo el archivo:
//  · Lo que no está confirmado se devuelve como PENDIENTE. Nunca como cero,
//    exención ni cálculo definitivo.
//  · Nada se aplica solo: una condición rige cuando una persona la marcó como
//    confirmada, con sus datos completos.
//  · No se recalcula nada histórico: estas funciones informan, no facturan.
// ══════════════════════════════════════════════════════════════════

import { estadoRetencion, factorNeto } from "./retencion";

const txt = (v) => (v === undefined || v === null ? "" : String(v).trim());
const numOrNull = (v) => {
  if (v === undefined || v === null || txt(v) === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
const num0 = (v) => numOrNull(v) || 0;

export const PENDIENTE = "pendiente";

// ══════════════════════════════════════════════════════════════════
// A · Beneficio del contract fee
// ══════════════════════════════════════════════════════════════════
// Configuración esperada en el contrato, bajo `beneficioFee`:
//   {
//     confirmado: false,            // solo una persona lo pone en true
//     plantasCubiertas: "",         // cupo pactado, en plantas
//     alcance: "solo_este" | "grupo",
//     contratosDelGrupo: [],        // ids que comparten el MISMO cupo
//     referencia: "",               // cláusula y página que lo respalda
//     consumoPrevio: "",            // entregas anteriores al sistema, si se conocen
//     consumoPrevioConocido: false, // false = falta historial -> pendiente
//   }
export const ESTADOS_BENEFICIO = {
  sinBeneficio: "Sin beneficio declarado",
  pendiente: "Pendiente de definición",
  confirmado: "Confirmado",
};

export function configBeneficio(ct) {
  const b = (ct && ct.beneficioFee) || {};
  return {
    declarado: !!b.declarado,
    confirmado: !!b.confirmado,
    plantasCubiertas: numOrNull(b.plantasCubiertas),
    alcance: txt(b.alcance) || "solo_este",
    contratosDelGrupo: Array.isArray(b.contratosDelGrupo) ? b.contratosDelGrupo.filter((x) => txt(x) !== "") : [],
    referencia: txt(b.referencia),
    consumoPrevio: numOrNull(b.consumoPrevio),
    consumoPrevioConocido: !!b.consumoPrevioConocido,
  };
}

// Qué falta para que el beneficio pueda aplicarse. Mientras la lista no esté
// vacía, el beneficio NO rige y así se informa.
//
// `contratos` es opcional. Si se pasa y el cupo es compartido, se exige además
// que TODOS los contratos del grupo declaren su propio historial: si a uno le
// falta, el consumo del grupo no se puede sumar sin inventar un cero.
export function faltantesBeneficio(ct, contratos) {
  const b = configBeneficio(ct);
  if (!b.declarado) return ["no declarado"];
  const falta = [];
  if (b.plantasCubiertas === null || b.plantasCubiertas <= 0) falta.push("cupo de plantas");
  if (!b.referencia) falta.push("cláusula que lo respalda");
  if (b.alcance === "grupo" && b.contratosDelGrupo.length === 0) falta.push("contratos que comparten el cupo");
  if (!b.consumoPrevioConocido) falta.push("historial de entregas anteriores");
  else {
    const sinHistorial = gruposSinHistorial(ct, contratos);
    if (sinHistorial.length > 0)
      falta.push(`historial de entregas anteriores de ${sinHistorial.length} contrato(s) que comparten el cupo`);
  }
  if (!b.confirmado) falta.push("confirmación");
  return falta;
}

// Contratos del grupo (sin contar el propio) que todavía no declaran su
// historial de entregas anteriores.
export function gruposSinHistorial(ct, contratos) {
  const b = configBeneficio(ct);
  if (b.alcance !== "grupo") return [];
  const lista = Array.isArray(contratos) ? contratos : [];
  if (!lista.length) return [];
  const propio = txt(ct && ct.id);
  return grupoDelBeneficio(ct, lista)
    .filter((id) => id !== propio)
    .filter((id) => {
      const otro = lista.find((c) => txt(c.id) === id);
      return !configBeneficio(otro).consumoPrevioConocido;
    });
}

export function estadoBeneficio(ct, contratos) {
  const b = configBeneficio(ct);
  if (!b.declarado) return "sinBeneficio";
  return faltantesBeneficio(ct, contratos).length === 0 ? "confirmado" : "pendiente";
}

// Contratos que comparten el mismo cupo: el propio más los declarados. El cupo
// se cuenta UNA vez para todo el grupo, nunca una vez por contrato.
export function grupoDelBeneficio(ct, contratos) {
  const b = configBeneficio(ct);
  const propio = txt(ct && ct.id);
  if (b.alcance !== "grupo") return [propio].filter(Boolean);
  const ids = new Set([propio, ...b.contratosDelGrupo].filter(Boolean));
  const existentes = new Set((contratos || []).map((c) => txt(c.id)));
  return [...ids].filter((id) => existentes.has(id));
}

// Consumo del cupo. `plantasPorContrato` es un mapa {contratoId: plantas
// entregadas}, calculado fuera con los datos que ya existen.
// Devuelve siempre `estado`; cuando es "pendiente", `disponible` es null: no se
// inventa un saldo.
export function consumoCupo(ct, contratos, plantasPorContrato) {
  const b = configBeneficio(ct);
  const estado = estadoBeneficio(ct, contratos);
  const grupo = grupoDelBeneficio(ct, contratos);
  const mapa = plantasPorContrato || {};
  const lista = Array.isArray(contratos) ? contratos : [];
  const detalle = grupo.map((id) => {
    const otro = lista.find((c) => txt(c.id) === id);
    const cfg = configBeneficio(otro);
    return {
      contratoId: id,
      plantas: num0(mapa[id]),
      // Cada contrato declara SUS entregas anteriores al sistema. Se suman una
      // vez cada una: ni se repiten entre contratos ni se pisan.
      previas: cfg.consumoPrevioConocido ? num0(cfg.consumoPrevio) : null,
      historialDeclarado: cfg.consumoPrevioConocido,
    };
  });
  const entregadas = detalle.reduce((s, x) => s + x.plantas, 0);
  const todosDeclaran = detalle.every((x) => x.historialDeclarado);
  const previo = todosDeclaran ? detalle.reduce((s, x) => s + (x.previas || 0), 0) : null;

  if (estado !== "confirmado") {
    return {
      estado,
      faltan: faltantesBeneficio(ct, contratos),
      cupo: b.plantasCubiertas,          // puede ser null: aún sin definir
      entregadasRegistradas: entregadas, // lo que sí se puede contar hoy
      consumoPrevio: previo,
      consumido: null,
      disponible: null,                  // nunca 0 ni el cupo entero
      indeterminado: previo === null,
      motivoIndeterminado: previo === null
        ? "Falta declarar el historial de entregas: el consumo y el disponible quedan indeterminados."
        : "",
      compartidoCon: grupo.filter((id) => id !== txt(ct.id)),
      detalle,
      aplica: false,
    };
  }
  // Si por cualquier via se llegara acá sin el historial completo del grupo,
  // NO se completa con cero: el consumo y el disponible quedan indeterminados.
  // Hoy `faltantesBeneficio` ya lo exige para confirmar; esto lo vuelve una
  // propiedad del cálculo y no una confianza en el llamador.
  if (previo === null) {
    return {
      estado,
      faltan: faltantesBeneficio(ct, contratos),
      cupo: b.plantasCubiertas,
      entregadasRegistradas: entregadas,
      consumoPrevio: null,
      consumido: null,
      disponible: null,
      indeterminado: true,
      motivoIndeterminado: "Falta el historial de entregas de al menos un contrato del cupo compartido: el consumo no se puede sumar sin inventar un cero.",
      compartidoCon: grupo.filter((id) => id !== txt(ct.id)),
      detalle,
      aplica: false,
    };
  }
  const consumido = entregadas + previo;
  return {
    estado,
    faltan: [],
    cupo: b.plantasCubiertas,
    entregadasRegistradas: entregadas,
    consumoPrevio: previo,
    consumido,
    disponible: Math.max(0, b.plantasCubiertas - consumido),
    excedido: consumido > b.plantasCubiertas,
    compartidoCon: grupo.filter((id) => id !== txt(ct.id)),
    detalle,
    aplica: true,
  };
}

// El mismo cupo no puede contarse dos veces: si dos contratos declaran el mismo
// grupo, el cupo pertenece al grupo. Esta función lista los grupos una sola vez.
export function gruposDeBeneficio(contratos) {
  const lista = Array.isArray(contratos) ? contratos : [];
  const vistos = new Set();
  const grupos = [];
  lista.forEach((ct) => {
    if (estadoBeneficio(ct) === "sinBeneficio") return;
    const grupo = grupoDelBeneficio(ct, lista).slice().sort();
    const clave = grupo.join("|");
    if (vistos.has(clave)) return;
    vistos.add(clave);
    grupos.push({ clave, contratos: grupo, titular: txt(ct.id), estado: estadoBeneficio(ct) });
  });
  return grupos;
}

// ══════════════════════════════════════════════════════════════════
// B · Reajuste por inflación
// ══════════════════════════════════════════════════════════════════
// Configuración esperada bajo `reajuste`:
//   { tipo: "sin_reajuste" | "porcentaje" | "indice",
//     pct: "", indice: "", fuente: "", fechaBase: "", desde: "",
//     referencia: "", confirmado: false }
export const TIPOS_REAJUSTE = ["sin_reajuste", "porcentaje", "indice"];

export function configReajuste(ct) {
  const r = (ct && ct.reajuste) || {};
  const tipo = TIPOS_REAJUSTE.includes(txt(r.tipo)) ? txt(r.tipo) : "";
  return {
    tipo,
    pct: numOrNull(r.pct),
    indice: txt(r.indice),
    fuente: txt(r.fuente),
    fechaBase: txt(r.fechaBase),
    desde: txt(r.desde),
    referencia: txt(r.referencia),
    confirmado: !!r.confirmado,
  };
}

export function faltantesReajuste(ct) {
  const r = configReajuste(ct);
  if (!r.tipo) return ["tipo de reajuste"];
  if (r.tipo === "sin_reajuste") return r.confirmado ? [] : ["confirmación"];
  const falta = [];
  if (r.tipo === "porcentaje" && (r.pct === null || r.pct < 0)) falta.push("porcentaje");
  if (r.tipo === "indice") {
    if (!r.indice) falta.push("índice");
    if (!r.fuente) falta.push("fuente del índice");
    if (!r.fechaBase) falta.push("fecha base");
  }
  if (!r.desde) falta.push("desde cuándo se aplica");
  if (!r.referencia) falta.push("cláusula que lo respalda");
  if (!r.confirmado) falta.push("confirmación");
  return falta;
}

// Estado del reajuste. Ojo con la marca antigua `royaltyInflacion`: si está
// activada pero no hay configuración nueva, el contrato queda PENDIENTE, no en
// cero. Hoy esos contratos no reajustan nada; la diferencia es que ahora se ve.
export function estadoReajuste(ct) {
  const r = configReajuste(ct);
  if (r.tipo) return faltantesReajuste(ct).length === 0 ? (r.tipo === "sin_reajuste" ? "sinReajuste" : "confirmado") : "pendiente";
  if (ct && ct.royaltyInflacion) return "pendiente";   // marca antigua sin datos
  return "noDeclarado";
}

// Comprobación: qué haría el reajuste configurado sobre un valor base, por
// períodos. Solo para el tipo "porcentaje" y solo si está confirmado. Con un
// índice no se proyecta: la serie la define quien la publica, no el sistema.
export function previsualizarReajuste(ct, valorBase, periodos) {
  const estado = estadoReajuste(ct);
  const r = configReajuste(ct);
  const base = num0(valorBase);
  const n = Math.max(0, Math.floor(num0(periodos)));
  if (estado !== "confirmado") return { estado, faltan: faltantesReajuste(ct), filas: [], motivo: "sin configuración confirmada" };
  if (r.tipo === "indice")
    return { estado, faltan: [], filas: [], motivo: `Reajuste por índice (${r.indice}, fuente ${r.fuente}, base ${r.fechaBase}). El sistema no proyecta valores de un índice: hay que cargar la serie publicada.` };
  const filas = [];
  for (let i = 0; i <= n; i++) {
    const factor = Math.pow(1 + r.pct / 100, i);
    filas.push({ periodo: i, factor: Math.round(factor * 1e6) / 1e6, valor: Math.round(base * factor * 100) / 100 });
  }
  return { estado, faltan: [], filas, motivo: "" };
}

// ══════════════════════════════════════════════════════════════════
// C · País del cliente, territorio contractual y retención
// ══════════════════════════════════════════════════════════════════
export const REINO_UNIDO = "Reino Unido";

export function paisesConReinoUnido(lista) {
  const base = Array.isArray(lista) ? lista.filter((x) => txt(x) !== "") : [];
  return base.includes(REINO_UNIDO) ? base : base.concat([REINO_UNIDO]);
}

// Países con tratamiento de retención conocido. Es una referencia documental:
// NO decide ninguna tasa. Quién decide es `retencion.js`, publicado.
export const PAISES_CON_TRATAMIENTO = ["Chile", "Peru", "Perú", "Mexico", "México", "Corea", "España"];

// El territorio contractual es un dato propio. Si no está cargado, se informa
// como pendiente: NO se copia del país, que es otra cosa.
export function territorioDe(ct) {
  const t = txt(ct && ct.territorio);
  return t ? { valor: t, estado: "declarado" } : { valor: "", estado: PENDIENTE };
}

// Retención. Tres estados posibles y ninguno inventa una tasa:
//  · "definida"  : alguien cargó `retencionPct` para este contrato.
//  · "heredada"  : el país tiene el tratamiento que el sistema ya aplicaba.
//  · "pendiente" : país sin tratamiento definido (por ejemplo Reino Unido).
// `pctVigente` es lo que el motor está usando hoy, para no ocultarlo; cuando el
// estado es "pendiente" se marca `definitivo:false`.
export function resolverRetencion(ct) {
  const e = estadoRetencion(ct);
  return {
    estado: e.validado ? "definida" : "heredada",
    pct: e.pct,
    pctVigente: e.pct,
    // `definitivo` = la tasa está validada tributariamente. Antes esta función
    // daba por definitivo cualquier país con tratamiento conocido; el modelo
    // publicado distingue "lo que el motor aplica" de "lo que está validado",
    // y manda ese. La TASA es la misma; lo que cambia es no llamar definitivo
    // a un porcentaje sin respaldo.
    definitivo: e.validado,
    validado: e.validado,
    etiqueta: e.etiqueta,
    detalle: e.detalle,
    factor: factorNeto(ct),
  };
}

// Cambiar el país no toca la retención propia del contrato: si había una
// definida, se conserva; si no, sigue sin haberla. Nunca se asigna sola.
export function cambiarPais(ct, nuevoPais) {
  if (!ct) return ct;
  const destino = txt(nuevoPais);
  if (txt(ct.pais) === destino) return ct;
  return { ...ct, pais: destino };   // retencionPct y territorio quedan como estaban
}

// ══════════════════════════════════════════════════════════════════
// Qué hace cada cosa HOY. Tres términos, y solo tres, para que en pantalla no
// se confunda guardar un dato con que el motor lo use:
//   · "Guarda configuración" — se anota y se conserva. El cálculo no cambia.
//   · "Simula"               — muestra qué pasaría. No escribe ni factura.
//   · "Aplica al cálculo real" — el motor cobra con eso.
// ══════════════════════════════════════════════════════════════════
export const ACCION = {
  configura: "Guarda configuración",
  simula: "Simula",
  aplica: "Aplica al cálculo real",
};

// Un neto es definitivo cuando su tasa está validada tributariamente. Lo
// resuelve el modelo publicado, no esta función: acá solo se traduce al texto
// que esta pantalla usa, para que no existan dos respuestas distintas a la
// misma pregunta.
export function netoNoDefinitivo(ct) {
  const e = estadoRetencion(ct);
  if (e.validado) return { noDefinitivo: false, motivo: "" };
  return {
    noDefinitivo: true,
    motivo: "El neto usa " + e.pct + " % (" + e.etiqueta + "): la tasa no está validada tributariamente.",
  };
}

export const AVISO_NETO_NO_DEFINITIVO =
  "Neto no definitivo: el motor calcula la retención solo por país.";

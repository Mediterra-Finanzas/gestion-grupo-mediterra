/* eslint-disable */
// ════════════════════════════════════════════════════════════════════════════
// friskuLiquidacionesLogic.js — Lógica PURA de Liquidaciones Frisku.
// Sin React, sin red, sin localStorage: funciones deterministas y testeables.
// Usado por FriskuComercialModule y por friskuLiquidacionesLogic.test.js
// (tests versionados en el repo, auditables — no dependen de archivos temporales).
// No modifica la persistencia transversal; sólo interpreta su resultado.
// ════════════════════════════════════════════════════════════════════════════

// ── Fase 1: filtro por N° de contenedor (sobre la OE real) ──
export function pasaFiltroContenedor(oe, filtro) {
  if (!filtro) return true;
  const q = String(filtro).trim().toLowerCase();
  if (!q) return true;
  return String((oe && oe.numeroContenedor) || "").trim().toLowerCase().includes(q);
}

// ── Fase 2: liquidaciones ACTIVAS de una OE ──
// "Activa" según la semántica REAL existente: el modelo no tiene soft-delete
// (el borrado es físico) y los estados válidos son borrador/enviada/pagada, todos
// activos. Se excluyen defensivamente, si algún día existieran, `eliminada` y
// estado "anulada" — sin inventar UI para ellos. `excluirId` = el propio borrador.
export function esLiquidacionActiva(l) {
  return !!l && !l.eliminada && l.estado !== "anulada";
}
export function liqsActivasOE(liquidaciones, oeId, excluirId) {
  return (liquidaciones || []).filter(
    (l) => esLiquidacionActiva(l) && l.oeId === oeId && l.id !== excluirId
  );
}
export function hayLiquidacionActiva(liquidaciones, oeId, excluirId) {
  return liqsActivasOE(liquidaciones, oeId, excluirId).length > 0;
}

// ── Validador de UNICIDAD por OE (regla del CONSUMIDOR Liquidaciones) ──
// Se pasa como opts.validarCandidato a dbSaveGeneric: rechaza un candidato que contenga DOS
// liquidaciones ACTIVAS de IDs DISTINTOS para el mismo oeId (la carrera concurrente). Ignora
// inactivas/anuladas (semántica real). Editar la misma liq (mismo id) NO es duplicado; distintas
// OEs pasan. No modifica el candidato, no borra nada. idExistente = la que ya está en el servidor
// (ganadora), para poder ofrecer Ver/Editar. La regla NO vive en dbSaveGeneric ni en fusionarPorId.
export function validarUnicidadOE(candidato, contexto) {
  const arr = Array.isArray(candidato) ? candidato : [];
  const servidor = contexto && Array.isArray(contexto.servidor) ? contexto.servidor : [];
  const idsServidor = new Set(servidor.filter(esLiquidacionActiva).map((l) => l.id));
  const porOE = new Map();                       // oeId -> Set(ids activos)
  for (const l of arr) {
    if (!esLiquidacionActiva(l) || !l.oeId) continue;
    if (!porOE.has(l.oeId)) porOE.set(l.oeId, new Set());
    porOE.get(l.oeId).add(l.id);
  }
  for (const [oeId, ids] of porOE) {
    if (ids.size > 1) {
      const arrIds = [...ids];
      const existente = arrIds.find((id) => idsServidor.has(id)) || arrIds[0];
      return { ok: false, motivo: "duplicado_oe", conflictoNegocio: true, oeId, idExistente: existente };
    }
  }
  return { ok: true };
}

// ── Fase 2: upsert idempotente por id estable sobre el estado más reciente ──
// Reemplaza si el id ya existe; agrega si no. Nunca duplica; sólo toca el registro
// correspondiente y preserva el resto y el orden.
export function upsertPorId(prev, item) {
  const arr = prev || [];
  return arr.some((l) => l && l.id === item.id)
    ? arr.map((l) => (l && l.id === item.id ? item : l))
    : [...arr, item];
}

// ── Fase 3: identidad estable para el namespace de borradores ──
// Sólo email corporativo normalizado (único e inmutable). Si no hay email:
// devuelve null → el llamador DESHABILITA el borrador persistente (nunca "anon").
export function normalizarEmail(e) {
  return typeof e === "string" ? e.trim().toLowerCase() : "";
}
export function identidadUsuario(user) {
  const em = normalizarEmail(user && user.email);
  return em || null;
}

// ── Fase 3: claves de borrador (aisladas por usuario + entidad + INSTANCIA) ──
export const LIQ_DRAFT_PREFIX = "frisku_liq_draft_v1";
export function liqDraftKey(userKey, entityKey) {
  return `${LIQ_DRAFT_PREFIX}::${userKey}::${entityKey}`;
}
// Entidad BASE del borrador: id de la liquidación (al editar) o `new::<oeId>` (al crear).
// NO identifica la pestaña: dos pestañas para la misma OE comparten base.
export function entityBaseDe(liq, oeId) {
  if (liq && liq.id) return liq.id;
  return oeId ? `new::${oeId}` : null;
}
// entityKey = base + instancia de formulario. Cada pestaña/instancia tiene su propio
// identificador estable, así dos pestañas de la MISMA OE no comparten clave ni se pisan.
export function draftEntityKey(base, instanceId) {
  if (!base) return null;
  return `${base}#${instanceId}`;
}
// Clave EXACTA a limpiar tras una mutación CONFIRMADA: sólo la de ESA operación/instancia.
// Nunca por prefijo, nunca "todas las de una OE", nunca las de otra pestaña.
export function clavesBorradorDeOp(op) {
  return op && op.entityKey ? [op.entityKey] : [];
}
// Prefijo de scaneo para descubrir borradores recuperables de una entidad base
// (todas las instancias/pestañas de esa liquidación/OE), para este usuario.
export function prefijoBorradorEntidad(userKey, base) {
  return `${LIQ_DRAFT_PREFIX}::${userKey}::${base}#`;
}
// De una lista de claves de localStorage, devuelve las de OTRAS instancias de la misma
// entidad base (excluye la instancia actual). Puro: el componente lee cada valor aparte.
export function clavesRecuperablesDeEntidad(storageKeys, userKey, base, instanciaActual) {
  if (!userKey || !base) return [];
  const pref = prefijoBorradorEntidad(userKey, base);
  const propia = draftEntityKey(base, instanciaActual);
  const propiaKey = propia ? liqDraftKey(userKey, propia) : null;
  return (storageKeys || []).filter((k) => typeof k === "string" && k.indexOf(pref) === 0 && k !== propiaKey);
}

// ── Contrato de confirmación Frisku-local ──
// Interpreta el resultado `r` de friskuHelpers.dbSaveGeneric contra la operación
// pendiente `op` (id + version esperada = fechaActualizacion estampada al enviar).
// NO crea persistencia paralela: reutiliza r.ok / r.valor / r.fusionado / r.motivo /
// r.conflictos / r.superseded / r.sinCambios.
//   op = { id, version, createKey }
// Estados: "guardado" | "conflicto" | "error" | "pendiente" | "idle"
export function evaluarConfirmacion(r, op, enviado) {
  if (!op) return { estado: "idle" };
  if (!r) return { estado: "error", motivo: "sin_resultado" };
  // Una edición posterior encoló otro guardado: el mío aún no es la última palabra.
  if (r.superseded) return { estado: "pendiente", motivo: "superseded" };
  if (r.ok) {
    const arr = Array.isArray(r.valor) ? r.valor : (Array.isArray(enviado) ? enviado : []);
    const item = arr.find((x) => x && x.id === op.id);
    if (item && item.fechaActualizacion === op.version) return { estado: "guardado", fusionado: !!r.fusionado };
    if (item) return { estado: "conflicto", motivo: "item_divergente" };
    return { estado: "conflicto", motivo: "ausente" };
  }
  // !r.ok — mi escritura NO persistió.
  // Conflicto de NEGOCIO: ya existe una liquidación activa para esa OE (carrera). No reintentable.
  if (r.motivo === "duplicado_oe") return { estado: "duplicado", motivo: "duplicado_oe", idExistente: r.idExistente, oeId: r.oeId };
  // Infraestructura: la fila protegida no existe (no se hace upsert ciego). Error, no éxito.
  if (r.motivo === "fila_ausente") return { estado: "error", motivo: "fila_ausente" };
  const mine = Array.isArray(r.conflictos) && r.conflictos.indexOf(op.id) !== -1;
  if (mine) return { estado: "conflicto", motivo: "conflicto_item" };
  if (r.motivo === "conflicto" || r.motivo === "conflicto_item")
    return { estado: "error", motivo: r.motivo }; // conflicto de OTRO ítem: reintentable
  return { estado: "error", motivo: r.motivo || "desconocido" };
}

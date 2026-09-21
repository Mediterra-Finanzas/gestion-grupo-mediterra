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

// ── Fase 3: claves de borrador ──
export const LIQ_DRAFT_PREFIX = "frisku_liq_draft_v1";
export function liqDraftKey(userKey, entityKey) {
  return `${LIQ_DRAFT_PREFIX}::${userKey}::${entityKey}`;
}
// entityKey = id de la liquidación (al editar) o `new::<oeId>` (al crear con OE elegida).
export function entityKeyDe(liq, oeId) {
  if (liq && liq.id) return liq.id;
  return oeId ? `new::${oeId}` : null;
}
// Claves EXACTAS a limpiar tras una mutación CONFIRMADA (id + su clave de creación).
// Nunca "todas las del array": sólo las de la operación confirmada.
export function clavesBorradorDeOp(op) {
  if (!op) return [];
  const out = [];
  if (op.id) out.push(op.id);
  if (op.createKey) out.push(op.createKey);
  return out;
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
  const mine = Array.isArray(r.conflictos) && r.conflictos.indexOf(op.id) !== -1;
  if (mine) return { estado: "conflicto", motivo: "conflicto_item" };
  if (r.motivo === "conflicto" || r.motivo === "conflicto_item")
    return { estado: "error", motivo: r.motivo }; // conflicto de OTRO ítem: reintentable
  return { estado: "error", motivo: r.motivo || "desconocido" };
}

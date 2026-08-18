/* eslint-disable */
// src/proceso/core/procesoEnvasesDB.js
// PROC-ENVASES-001 — capa DB de la UI de envases retornables. Reutiliza primitivas de procesoDB.js.
// Backend = autoridad (saldo/concurrencia/tenant). Read-models derivados del ledger (nunca mutables).
import { procSelect, procRpc } from "./procesoDB.js";

const qE = (e, extra = "") => `?empresa_id=eq.${e}${extra}`;

// Catálogo de tipos de envase (solo activos, para selects).
export const cargarTiposEnvase = (e, soloActivos = true) =>
  procSelect("proc_tipo_envase", qE(e, `&deleted_at=is.null${soloActivos ? "&activo=eq.true" : ""}&order=codigo`));

// Saldos derivados por posición (tipo/owner/holder/ubicación/condición). Etiquetas humanas.
export const cargarEnvaseSaldos = (e, extra = "") =>
  procSelect("proc_v_envase_saldo", qE(e, `&order=tipo_codigo${extra}`));

// Ledger con etiquetas humanas (Movimientos). Orden por fecha operacional desc.
export const cargarEnvaseMovimientos = (e, extra = "") =>
  procSelect("proc_v_envase_movimiento", qE(e, `&order=fecha.desc&limit=300${extra}`));

// Registro transaccional (valida saldo + lockea concurrencia en backend). Omite p_fecha si no viene.
export const registrarEnvaseMovimiento = (a) => procRpc("proc_fn_envase_registrar_movimiento", {
  p_empresa: a.empresaId, p_tipo: a.tipoId, p_cantidad: Number(a.cantidad), p_naturaleza: a.naturaleza,
  p_owner: a.ownerId || null, p_holder_desde: a.holderDesdeId || null, p_holder_hacia: a.holderHaciaId || null,
  p_ubic_desde: a.ubicDesdeId || null, p_ubic_hacia: a.ubicHaciaId || null,
  p_condicion_desde: a.condicionDesde || "normal", p_condicion_hacia: a.condicionHacia || "normal",
  p_ref_tipo: a.refTipo || "manual", p_ref_id: a.refId || null, p_motivo: a.motivo || null,
  p_actor: a.actor || null,
  ...(a.fechaOperacional ? { p_fecha: a.fechaOperacional } : {}),
});

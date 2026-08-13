/* eslint-disable */
// src/proceso/core/procesoF7DB.js
// proc_* F7.1 — capa DB de la UI operacional (correlativos, QC, read-models,
// CRUD genérico de maestros). Reutiliza primitivas de procesoDB.js con gate Regla 9.
import { procSelect, procInsert, procUpdate, procRpc } from "./procesoDB.js";

// ── Correlativos (concurrency-safe en backend) ──────────────────────────────
export const siguienteCorrelativo = (a) => procRpc("proc_fn_siguiente_correlativo", {
  p_empresa: a.empresaId, p_temporada: a.temporada, p_tipo: a.tipo, p_prefijo: a.prefijo || null,
});

// ── QC (gate enforceable en backend; la UI pre-valida con evaluarQC) ────────
export const registrarQc = (a) => procRpc("proc_fn_registrar_qc", {
  p_empresa: a.empresaId, p_recepcion: a.recepcionId, p_valores: a.valores || {}, p_actor: a.actor || null,
});

// ── Read-models del Centro de Operaciones (solo lectura, RLS aplica) ────────
export const centroOperaciones = (a) => procRpc("proc_fn_centro_operaciones", {
  p_empresa: a.empresaId, p_planta: a.plantaId || null, p_temporada: a.temporada || null, p_fecha: a.fecha,
});
export const excepcionesOperacionales = (a) => procRpc("proc_fn_excepciones", {
  p_empresa: a.empresaId, p_planta: a.plantaId || null, p_temporada: a.temporada || null,
});

// ── CRUD genérico de maestros (REST; RLS + CHECK/FK en backend) ─────────────
// La UI de Configuración es data-driven: un descriptor por maestro define tabla+campos.
const qEmpresa = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null${extra}`;

export const cargarMaestro = (tabla, empresaId, extra = "") =>
  procSelect(tabla, qEmpresa(empresaId, `&order=created_at.desc${extra}`));

export async function crearMaestro(tabla, fila) {
  const res = await procInsert(tabla, [fila]);
  return Array.isArray(res) ? res[0] : res;
}
export const actualizarMaestro = (tabla, id, empresaId, patch) =>
  procUpdate(tabla, `?id=eq.${id}&empresa_id=eq.${empresaId}`, patch);

// Soft-delete coherente con el patrón proc_* (nunca borrado físico).
export const desactivarMaestro = (tabla, id, empresaId, actor) =>
  procUpdate(tabla, `?id=eq.${id}&empresa_id=eq.${empresaId}`, { deleted_at: new Date().toISOString(), updated_by: actor || null });

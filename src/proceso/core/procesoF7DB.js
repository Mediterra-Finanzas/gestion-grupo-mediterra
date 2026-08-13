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

// ── F7.2 · Recepción + QC + Lotes ───────────────────────────────────────────
// Listados paginables/filtrables server-side (PostgREST sobre vistas RLS).
export const cargarRecepcionListado = (e, extra = "") =>
  procSelect("proc_v_recepcion_listado", `?empresa_id=eq.${e}&order=fecha.desc${extra}`);
export const cargarLoteListado = (e, extra = "") =>
  procSelect("proc_v_lote_listado", `?empresa_id=eq.${e}&order=codigo.desc${extra}`);

// Elegibilidad de lote para proceso (mirror del gate; para mensajería UI).
export const loteElegible = (e, loteId) => procRpc("proc_fn_lote_elegible", { p_empresa: e, p_lote: loteId });

// Cabecera de recepción (REST; el lote/ledger va por RPC atómica).
export const crearRecepcion = (fila) => crearMaestro("proc_recepcion", fila);
export const actualizarRecepcion = (id, e, patch) => actualizarMaestro("proc_recepcion", id, e, patch);

// Loaders acotados
export const cargarVinculosPorRol = (e, rol) =>
  procSelect("proc_vinculo", `?empresa_id=eq.${e}&rol_operacional=eq.${rol}&deleted_at=is.null&order=nombre_provisional`);
export const cargarUbicacionesActivas = (e, plantaId) =>
  procSelect("proc_ubicaciones", `?empresa_id=eq.${e}&activa=eq.true&deleted_at=is.null${plantaId ? `&planta_id=eq.${plantaId}` : ""}&order=codigo`);
export const cargarQcParamsEspecie = (e, especie) =>
  procSelect("proc_qc_parametro", `?empresa_id=eq.${e}&especie_codigo=eq.${especie}&activo=eq.true&deleted_at=is.null&order=orden`);
export const cargarLotesDeRecepcion = (e, recId) =>
  procSelect("proc_lote", `?empresa_id=eq.${e}&recepcion_id=eq.${recId}&deleted_at=is.null&order=codigo`);
export const cargarQcDeRecepcion = (e, recId) =>
  procSelect("proc_qc_recepcion", `?empresa_id=eq.${e}&recepcion_id=eq.${recId}&deleted_at=is.null`);
export const cargarMovimientosObjeto = (e, objetoId) =>
  procSelect("proc_movimiento", `?empresa_id=eq.${e}&objeto_id=eq.${objetoId}&order=created_at.desc`);
export const cargarRecepcionPorId = (e, id) =>
  procSelect("proc_recepcion", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarLotePorId = (e, id) =>
  procSelect("proc_v_lote_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarMovimientosRef = (e, refId) =>
  procSelect("proc_movimiento", `?empresa_id=eq.${e}&ref_id=eq.${refId}&order=created_at.desc`);

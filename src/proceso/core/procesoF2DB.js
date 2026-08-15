/* eslint-disable */
// src/proceso/core/procesoF2DB.js
// proc_* F2 — capa DB (relacional). Reutiliza las primitivas F1 (procSelect/procRpc)
// con el gate Regla 9 (cargas propagan error). Bounded context proc_*; no toca exp_*.
import { procSelect, procRpc } from "./procesoDB.js";

const q = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null&order=created_at.desc${extra}`;

// Cargas (propagan error de red — Regla 9)
export const cargarUbicaciones   = (e) => procSelect("proc_ubicaciones", q(e));
export const cargarLineas        = (e) => procSelect("proc_lineas_proceso", q(e));
export const cargarCategorias    = (e) => procSelect("proc_categorias_calidad", q(e));
export const cargarMotivosDescarte = (e) => procSelect("proc_motivos_descarte", q(e));
export const cargarMotivosMerma  = (e) => procSelect("proc_motivos_merma", q(e));
export const cargarQcParametros  = (e, especie) =>
  procSelect("proc_qc_parametro", q(e, especie ? `&especie_codigo=eq.${especie}&activo=eq.true` : "&activo=eq.true"));
export const cargarProgramas     = (e) => procSelect("proc_programa_proceso", q(e));
export const cargarOrdenes       = (e) => procSelect("proc_orden_proceso", q(e));
export const cargarInsumosOrden  = (e, ordenId) => procSelect("proc_orden_insumo", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}`);
export const cargarResultados    = (e, ordenId) => procSelect("proc_resultado", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}&deleted_at=is.null`);

// Saldo por ubicación (vista derivada; SoT = ledger)
export const saldoPorUbicacion = (e, loteId) =>
  procSelect("proc_v_lote_ubicacion", `?empresa_id=eq.${e}&lote_id=eq.${loteId}`);
// Estado de conciliación de una orden (vista derivada)
export const conciliacionOrden = (e, ordenId) =>
  procSelect("proc_v_orden_conciliacion", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}`).then(r => r[0] || null);

// RPC transaccionales F2 (atómicas)
export const ingresarLoteUbicado = (a) => procRpc("proc_fn_ingresar_lote_ubicado", {
  p_empresa_id: a.empresaId, p_recepcion_id: a.recepcionId, p_codigo: a.codigo,
  p_especie: a.especie, p_variedad: a.variedad || null, p_kg: a.kg,
  p_planta_id: a.plantaId || null, p_temporada: a.temporada || null,
  p_ubicacion_id: a.ubicacionId, p_actor: a.actor || null,
  // T4 (TRAZABILIDAD-001): origen agrícola del lote — backend congela el snapshot.
  p_productor: a.productorId || null, p_predio: a.predioId || null, p_cuartel: a.cuartelId || null,
});
export const trasladar = (a) => procRpc("proc_fn_trasladar", {
  p_empresa_id: a.empresaId, p_lote_id: a.loteId, p_ubic_origen: a.ubicOrigen,
  p_ubic_destino: a.ubicDestino, p_kg: a.kg, p_motivo: a.motivo || null, p_actor: a.actor || null,
});
// Consumo con genealogía: movimiento (ledger) + lineage, atómico. Nunca uno sin el otro.
export const consumirLoteEnOrden = (a) => procRpc("proc_fn_consumir_lote_en_orden", {
  p_empresa_id: a.empresaId, p_orden_id: a.ordenId, p_lote_id: a.loteId, p_kg: a.kg,
  p_transaccion_id: a.transaccionId || null, p_actor: a.actor || null,
});
export const conciliarOrden = (a) => procRpc("proc_fn_conciliar_orden", {
  p_empresa_id: a.empresaId, p_orden_id: a.ordenId, p_actor: a.actor || null,
});

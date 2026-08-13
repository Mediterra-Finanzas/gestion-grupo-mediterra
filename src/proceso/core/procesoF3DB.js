/* eslint-disable */
// src/proceso/core/procesoF3DB.js
// proc_* F3 — capa DB. Reutiliza primitivas F1 (procSelect/procRpc) con gate Regla 9.
import { procSelect, procRpc } from "./procesoDB.js";

const q = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null&order=created_at.desc${extra}`;

// Cargas (propagan error — Regla 9)
export const cargarFormatos = (e, especie) =>
  procSelect("proc_formato", q(e, especie ? `&especie_codigo=eq.${especie}&activo=eq.true` : "&activo=eq.true"));
export const cargarPT       = (e, ordenId) => procSelect("proc_producto_terminado", q(e, ordenId ? `&orden_id=eq.${ordenId}` : ""));
export const cargarPallets  = (e) => procSelect("proc_pallet", q(e));
export const cargarLineasPallet = (e, palletId) =>
  procSelect("proc_pallet_linea", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}&estado=eq.activa`);

// Vistas derivadas (SoT = ledger)
export const resultadoDisponible = (e, resultadoId) =>
  procSelect("proc_v_resultado_disponible", `?empresa_id=eq.${e}&resultado_id=eq.${resultadoId}`).then(r => r[0] || null);
export const saldoPT     = (e, ptId) => procSelect("proc_v_pt_saldos", `?empresa_id=eq.${e}&pt_id=eq.${ptId}`).then(r => r[0] || null);
export const saldoPallet = (e, palletId) => procSelect("proc_v_pallet_saldos", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}`).then(r => r[0] || null);
export const composicionPallet = (e, palletId) =>
  procSelect("proc_v_pallet_composicion", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}`).then(r => r[0] || null);

// RPC transaccionales F3 (atómicas; ledger + composición coherentes)
export const materializarPT = (a) => procRpc("proc_fn_materializar_pt", {
  p_empresa_id: a.empresaId, p_resultado_id: a.resultadoId, p_formato_id: a.formatoId,
  p_cajas: a.cajas ?? null, p_kg: a.kg, p_actor: a.actor || null,
});
export const crearPallet = (a) => procRpc("proc_fn_crear_pallet", {
  p_empresa_id: a.empresaId, p_codigo: a.codigo, p_temporada: a.temporada || null,
  p_planta_id: a.plantaId || null, p_formato_id: a.formatoId || null,
  p_ubicacion_id: a.ubicacionId || null, p_actor: a.actor || null,
});
export const palletizar = (a) => procRpc("proc_fn_palletizar", {
  p_empresa_id: a.empresaId, p_pt_id: a.ptId, p_pallet_id: a.palletId,
  p_cajas: a.cajas ?? null, p_kg: a.kg, p_actor: a.actor || null,
});
// moves = [{origen_pallet_id, pt_id, cajas, kg, destino_pallet_id}] — cantidades absolutas
export const repaletizar = (a) => procRpc("proc_fn_repaletizar", {
  p_empresa_id: a.empresaId, p_motivo: a.motivo || null, p_tipo: a.tipo || "repaletizaje",
  p_moves: a.moves, p_actor: a.actor || null,
});
export const trasladarPallet = (a) => procRpc("proc_fn_trasladar_pallet", {
  p_empresa_id: a.empresaId, p_pallet_id: a.palletId, p_ubic_destino: a.ubicDestino, p_actor: a.actor || null,
});

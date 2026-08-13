/* eslint-disable */
// src/proceso/core/procesoF4DB.js
// proc_* F4 — capa DB (Despacho). Reutiliza primitivas F1 con gate Regla 9.
import { procSelect, procRpc } from "./procesoDB.js";

const q = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null&order=created_at.desc${extra}`;

export const cargarDespachos = (e) => procSelect("proc_despacho", q(e));
export const cargarLineasDespacho = (e, despachoId) =>
  procSelect("proc_despacho_linea", `?empresa_id=eq.${e}&despacho_id=eq.${despachoId}`);
export const cargarDocsDespacho = (e, despachoId) =>
  procSelect("proc_despacho_doc", `?empresa_id=eq.${e}&despacho_id=eq.${despachoId}&deleted_at=is.null`);
export const conciliacionDespacho = (e, despachoId) =>
  procSelect("proc_v_despacho_conciliacion", `?empresa_id=eq.${e}&despacho_id=eq.${despachoId}`).then(r => r[0] || null);
export const saldoPallet = (e, palletId) =>
  procSelect("proc_v_pallet_saldos", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}`).then(r => r[0] || null);

// RPC transaccionales F4
export const crearDespacho = (a) => procRpc("proc_fn_crear_despacho", {
  p_empresa_id: a.empresaId, p_folio: a.folio, p_planta: a.plantaId || null,
  p_cliente: a.clienteVinculoId || null, p_destinatario: a.destinatarioVinculoId || null, p_actor: a.actor || null,
});
export const reservarPallet = (a) => procRpc("proc_fn_reservar_pallet", {
  p_empresa_id: a.empresaId, p_despacho_id: a.despachoId, p_pallet_id: a.palletId, p_kg: a.kg, p_actor: a.actor || null,
});
export const liberarReserva = (a) => procRpc("proc_fn_liberar_reserva", {
  p_empresa_id: a.empresaId, p_despacho_id: a.despachoId, p_pallet_id: a.palletId, p_actor: a.actor || null,
});
// lineas = [{pallet_id, pt_id, cajas, kg}] — salida física por pallet+PT, desde su ubicación
export const confirmarDespacho = (a) => procRpc("proc_fn_confirmar_despacho", {
  p_empresa_id: a.empresaId, p_despacho_id: a.despachoId, p_lineas: a.lineas, p_actor: a.actor || null,
});
export const reversarDespacho = (a) => procRpc("proc_fn_reversar_despacho", {
  p_empresa_id: a.empresaId, p_despacho_id: a.despachoId, p_motivo: a.motivo, p_actor: a.actor || null,
});

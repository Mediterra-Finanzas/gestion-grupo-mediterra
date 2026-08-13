/* eslint-disable */
// src/proceso/core/procesoF5DB.js
// proc_* F5 — capa DB (Resultado de Proceso). Reutiliza primitivas F1 con gate Regla 9.
// El envío real de email es UI-side (interfaz neutral emailHelper), gated: aquí solo
// se registra el envío en estado 'pendiente'.
import { procSelect, procRpc } from "./procesoDB.js";

const q = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null&order=created_at.desc${extra}`;

export const cargarInformes = (e) => procSelect("proc_informe", q(e));
export const cargarVersiones = (e, informeId) =>
  procSelect("proc_informe_version", `?empresa_id=eq.${e}&informe_id=eq.${informeId}&order=version.desc`);
export const cargarFuentes = (e, versionId) =>
  procSelect("proc_informe_fuente", `?empresa_id=eq.${e}&version_id=eq.${versionId}`);
export const cargarDestinatarios = (e, versionId) =>
  procSelect("proc_informe_destinatario", `?empresa_id=eq.${e}&version_id=eq.${versionId}`);
export const cargarEnvios = (e, versionId) =>
  procSelect("proc_informe_envio", `?empresa_id=eq.${e}&version_id=eq.${versionId}&order=created_at.desc`);

// RPC transaccionales F5
export const crearInforme = (a) => procRpc("proc_fn_crear_informe", {
  p_empresa_id: a.empresaId, p_folio: a.folio, p_temporada: a.temporada || null,
  p_planta: a.plantaId || null, p_destinatario: a.destinatarioVinculoId || null, p_actor: a.actor || null,
});
export const generarVersion = (a) => procRpc("proc_fn_generar_version", {
  p_empresa_id: a.empresaId, p_informe_id: a.informeId, p_orden_ids: a.ordenIds,
  p_observaciones: a.observaciones || null, p_motivo: a.motivo || null, p_actor: a.actor || null,
});
export const agregarDestinatario = (a) => procRpc("proc_fn_agregar_destinatario", {
  p_empresa_id: a.empresaId, p_version_id: a.versionId, p_vinculo_id: a.vinculoId, p_actor: a.actor || null,
});
export const emitirVersion = (a) => procRpc("proc_fn_emitir_version", {
  p_empresa_id: a.empresaId, p_version_id: a.versionId, p_pdf_path: a.pdfPath || null, p_actor: a.actor || null,
});
export const registrarEnvio = (a) => procRpc("proc_fn_registrar_envio", {
  p_empresa_id: a.empresaId, p_version_id: a.versionId, p_destinatario_id: a.destinatarioId || null,
  p_canal: a.canal, p_destino_email: a.destinoEmail || null, p_actor: a.actor || null,
});

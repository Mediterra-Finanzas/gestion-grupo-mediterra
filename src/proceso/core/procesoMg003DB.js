/* eslint-disable */
// src/proceso/core/procesoMg003DB.js
// MG-003 — capa DB de pesajes (relacional, tablas proc_recepcion_pesaje / proc_recepcion_bin).
// Reutiliza las primitivas F1 (procSelect/procRpc/procUpdate) — mismas reglas de anti-borrado
// (Regla 9: las cargas propagan el error de red, nunca devuelven defaults) y RLS por empresa.
import { procSelect, procRpc, procUpdate } from "./procesoDB.js";

const q = (empresaId, extra = "") =>
  `?empresa_id=eq.${empresaId}&deleted_at=is.null${extra}`;

// ── Cargas (scoped por empresa; propagan error) ──────────────────────────────
export const cargarPesajesDeRecepcion = (e, recepcionId) =>
  procSelect("proc_recepcion_pesaje", q(e, `&recepcion_id=eq.${recepcionId}&order=secuencia.asc`));

export const cargarPesajePorId = (e, pesajeId) =>
  procSelect("proc_recepcion_pesaje", q(e, `&id=eq.${pesajeId}`)).then((r) => r[0] || null);

export const cargarBinsDePesaje = (e, pesajeId) =>
  procSelect("proc_recepcion_bin", q(e, `&pesaje_id=eq.${pesajeId}&order=created_at.asc`));

export const cargarBinsDeRecepcion = (e, recepcionId) =>
  procSelect("proc_recepcion_bin", q(e, `&recepcion_id=eq.${recepcionId}&order=created_at.asc`));

// Conciliación DERIVADA (vistas; el ledger sigue siendo SoT del lote).
export const conciliacionPesaje = (e, pesajeId) =>
  procSelect("proc_v_pesaje_conciliacion", `?empresa_id=eq.${e}&pesaje_id=eq.${pesajeId}`).then((r) => r[0] || null);

export const balancePesajesRecepcion = (e, recepcionId) =>
  procSelect("proc_v_recepcion_pesaje_balance", `?empresa_id=eq.${e}&recepcion_id=eq.${recepcionId}`).then((r) => r[0] || null);

// ── Registrar una pesada con 1..N bins (RPC atómica; NO auto-split) ──────────
// pesaje: {folio_pesaje?, fecha?, balanza?, captura?, peso_documental?, peso_bruto?, tara?,
//          peso_neto?, n_bins_declarado?, metodo_reparto?, destino_frio?, estado?, observaciones?}
// bins:   [ {codigo?, envase_codigo?, envase_propiedad?, n_envases?, tara_envase?, peso_bruto?,
//            peso_neto?, origen_peso?, especie_codigo?, variedad_codigo?, condicion?, lote_id?}, ... ]
export const registrarPesaje = (a) => procRpc("proc_fn_registrar_pesaje", {
  p_empresa_id: a.empresaId, p_recepcion_id: a.recepcionId,
  p_pesaje: a.pesaje || {}, p_bins: a.bins || [], p_actor: a.actor || null,
});

// ── Asignar un bin a un lote (recepción→pesaje→bin→lote). El trigger valida coherencia. ──
export const asignarBinALote = (e, binId, loteId) =>
  procUpdate("proc_recepcion_bin", `?empresa_id=eq.${e}&id=eq.${binId}`,
    { lote_id: loteId, estado: "asignado_lote" });

// ── Cambiar estado de la pesada (borrador → confirmada / anulada). ───────────
export const cambiarEstadoPesaje = (e, pesajeId, estado) =>
  procUpdate("proc_recepcion_pesaje", `?empresa_id=eq.${e}&id=eq.${pesajeId}`, { estado });

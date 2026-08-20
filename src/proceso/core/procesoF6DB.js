/* eslint-disable */
// src/proceso/core/procesoF6DB.js
// proc_* F6 — capa DB (Tarifario + Servicios Facturables + Base de Cobro).
// Reutiliza primitivas F1 con gate Regla 9. Revenue, no factura legal.
import { procSelect, procRpc } from "./procesoDB.js";

const q = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null&order=created_at.desc${extra}`;

export const cargarTiposServicio = (e) => procSelect("proc_tipo_servicio", q(e, "&activo=eq.true"));
export const cargarTarifas = (e, tipoServicio) =>
  procSelect("proc_tarifa", q(e, tipoServicio ? `&tipo_servicio_id=eq.${tipoServicio}` : ""));
export const cargarServicios = (e, estado) =>
  procSelect("proc_servicio_facturable", q(e, estado ? `&estado=eq.${estado}` : ""));
export const cargarBases = (e) => procSelect("proc_base_cobro", q(e));
export const cargarLineasBase = (e, baseId) =>
  procSelect("proc_base_cobro_linea", `?empresa_id=eq.${e}&base_cobro_id=eq.${baseId}`);

// Resolución de tarifa (determinística) — para preview en UI
export const resolverTarifa = (a) => procRpc("proc_fn_resolver_tarifa", {
  p_empresa_id: a.empresaId, p_cliente: a.clienteVinculoId || null, p_temporada: a.temporada || null,
  p_especie: a.especie || null, p_tipo_servicio: a.tipoServicioId, p_fecha: a.fecha,
});

// RPC transaccionales F6
export const generarServicioProceso = (a) => procRpc("proc_fn_generar_servicio_proceso", {
  p_empresa_id: a.empresaId, p_orden_id: a.ordenId, p_cliente: a.clienteVinculoId,
  p_tipo_servicio: a.tipoServicioId, p_actor: a.actor || null,
});
export const generarServicioManual = (a) => procRpc("proc_fn_generar_servicio_manual", {
  p_empresa_id: a.empresaId, p_cliente: a.clienteVinculoId, p_tipo_servicio: a.tipoServicioId,
  p_cantidad: a.cantidad, p_unidad: a.unidad, p_tarifa: a.tarifa, p_moneda: a.moneda || "USD",
  p_fecha: a.fecha, p_motivo: a.motivo, p_autorizado_por: a.autorizadoPor, p_actor: a.actor || null,
});
export const crearBaseCobro = (a) => procRpc("proc_fn_crear_base_cobro", {
  p_empresa_id: a.empresaId, p_folio: a.folio, p_cliente: a.clienteVinculoId || null,
  p_temporada: a.temporada || null, p_desde: a.periodoDesde || null, p_hasta: a.periodoHasta || null,
  p_moneda: a.moneda || "USD", p_actor: a.actor || null,
});
export const agregarABase = (a) => procRpc("proc_fn_agregar_a_base", {
  p_empresa_id: a.empresaId, p_base_id: a.baseId, p_servicio_id: a.servicioId, p_actor: a.actor || null,
});
export const aprobarBase = (a) => procRpc("proc_fn_aprobar_base", {
  p_empresa_id: a.empresaId, p_base_id: a.baseId, p_actor: a.actor || null,
});

/* eslint-disable */
// src/proceso/core/procesoF6Domain.js
// proc_* F6 (Tarifario + Servicios Facturables + Base de Cobro) — LÓGICA PURA.
// Espeja invariantes de schema_proc_v6_f6.sql. Revenue, no factura legal.

// Redondeo monetario a 2 decimales (no floats crudos).
export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

export function calcularSubtotal(cantidad, tarifa) { return round2((Number(cantidad) || 0) * (Number(tarifa) || 0)); }

// Resolución determinística de tarifa (debe coincidir con proc_fn_resolver_tarifa):
// vigencia cubre la fecha, compatibilidad (cliente/temporada/especie null = cualquiera),
// prioridad por especificidad (cliente > temporada > especie) + campo prioridad.
export function resolverTarifa(tarifas = [], { cliente, temporada, especie, tipoServicio, fecha } = {}) {
  const f = new Date(fecha).getTime();
  const cand = (tarifas || []).filter((t) => {
    if (t.estado !== "vigente") return false;
    if (t.tipo_servicio_id !== tipoServicio) return false;
    if (new Date(t.vigencia_desde).getTime() > f) return false;                 // futura no aplica
    if (t.vigencia_hasta && new Date(t.vigencia_hasta).getTime() < f) return false; // vencida no aplica
    if (t.cliente_vinculo_id != null && t.cliente_vinculo_id !== cliente) return false;
    if (t.temporada_codigo != null && t.temporada_codigo !== temporada) return false;
    if (t.especie_codigo != null && t.especie_codigo !== especie) return false;
    return true;
  });
  cand.sort((a, b) =>
    (b.cliente_vinculo_id != null) - (a.cliente_vinculo_id != null) ||
    (b.temporada_codigo != null) - (a.temporada_codigo != null) ||
    (b.especie_codigo != null) - (a.especie_codigo != null) ||
    (Number(b.prioridad) || 0) - (Number(a.prioridad) || 0) ||
    new Date(b.vigencia_desde) - new Date(a.vigencia_desde)
  );
  return cand[0] || null; // null → pendiente_tarifa (nunca cero/genérica silenciosa)
}

// Clave de idempotencia (no doble cobro del mismo hecho+servicio).
export function claveIdempotencia(origenTipo, refId, tipoServicioId) {
  return `${origenTipo}:${refId}:srv:${tipoServicioId}`;
}

// Máquina de estados de la base de cobro (debe coincidir con proc_fn_base_guard).
const TRANS_BASE = {
  borrador: ["en_revision", "aprobada", "anulada"],
  en_revision: ["aprobada", "borrador", "anulada"],
  aprobada: ["enviada_a_facturacion", "anulada"],
  enviada_a_facturacion: ["cerrada", "anulada"],
  cerrada: [], anulada: [],
};
export function transicionBaseValida(desde, hasta) {
  if (desde === hasta) return false;
  return (TRANS_BASE[desde] || []).includes(hasta);
}
export function baseEditable(estado) { return estado === "borrador" || estado === "en_revision"; }

// Manual exige motivo + autorización.
export function validarManual({ motivo, autorizadoPor } = {}) {
  if (!motivo || !autorizadoPor) return { ok: false, error: "línea manual exige motivo y autorización" };
  return { ok: true };
}

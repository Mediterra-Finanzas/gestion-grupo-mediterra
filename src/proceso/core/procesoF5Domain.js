/* eslint-disable */
// src/proceso/core/procesoF5Domain.js
// proc_* F5 (Resultado de Proceso) — LÓGICA PURA. Espeja invariantes de
// schema_proc_v5_f5.sql. El informe DERIVA de F1-F4 (no recalcula la operación).
import { kg3 } from "./procesoDomain.js";

// Consolidación MATEMÁTICA (DF5-4 pto 4): packout = Σ kg comerciales / Σ kg procesados,
// NUNCA promedio de porcentajes. Ídem descarte%/merma%.
export function consolidar(ordenes = []) {
  let kgProcesados = 0, kgComerciales = 0, kgDescarte = 0, kgMerma = 0;
  for (const o of ordenes) {
    kgProcesados += Number(o.kgProcesado) || 0;
    kgComerciales += Number(o.kgComercial) || 0;
    kgDescarte += Number(o.kgDescarte) || 0;
    kgMerma += Number(o.kgMerma) || 0;
  }
  kgProcesados = kg3(kgProcesados); kgComerciales = kg3(kgComerciales);
  kgDescarte = kg3(kgDescarte); kgMerma = kg3(kgMerma);
  const pct = (n) => (kgProcesados > 0 ? Math.round((n / kgProcesados) * 10000) / 10000 : null);
  return {
    kgProcesados, kgComerciales, kgDescarte, kgMerma,
    packout: pct(kgComerciales), descartePct: pct(kgDescarte), mermaPct: pct(kgMerma),
  };
}

// Snapshot estructurado obligatorio (DF5 pto 7): identificacion/resumen/detalle/adicional.
export function construirSnapshot({ identificacion = {}, resumen = {}, detalle = [], adicional = {} } = {}) {
  return { identificacion, resumen, detalle, adicional };
}

// Máquina de estados de la versión (debe coincidir con proc_fn_version_guard).
const TRANS_VER = {
  borrador: ["generada", "anulada"],
  generada: ["aprobada", "emitida", "anulada"],
  aprobada: ["emitida", "anulada"],
  emitida: ["reemplazada", "anulada"],   // solo transición de estado, sin tocar datos
  reemplazada: ["anulada"],
  anulada: [],
};
export function transicionVersionValida(desde, hasta) {
  if (desde === hasta) return false;
  return (TRANS_VER[desde] || []).includes(hasta);
}
// Versión emitida/reemplazada/anulada = inmutable en datos (corrección = nueva versión).
export function versionDatosEditables(estado) { return estado === "borrador" || estado === "generada" || estado === "aprobada"; }

// Estados de envío (DF5-5 pto 6): 'enviado' exige acción de envío, no solo PDF.
export function envioValido(estado) {
  return ["pendiente", "enviado", "error", "reintentado", "cancelado"].includes(estado);
}
export function puedeMarcarEnviado(estadoVersion, tieneEvidencia) {
  if (estadoVersion !== "emitida") return { ok: false, error: "solo versión emitida se envía" };
  if (!tieneEvidencia) return { ok: false, error: "marcar 'enviado' exige evidencia de la acción de envío" };
  return { ok: true };
}

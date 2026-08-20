/* eslint-disable */
// src/proceso/core/procesoF2Domain.js
// proc_* F2 (ejecución de proceso) — LÓGICA PURA (sin red). Espeja las invariantes
// de schema_proc_v2_f2.sql para testeo offline y reuso en capa DB/UI.
import { kg3 } from "./procesoDomain.js";

export const NATURALEZA_F2 = { ENTRADA: "entrada", SALIDA: "salida", TRANSFERENCIA: "transferencia" };

// on_hand TOTAL: la transferencia NO afecta el total físico (solo redistribuye).
export function onHandTotal(movimientos) {
  let s = 0;
  for (const m of movimientos || []) {
    if (m.naturaleza === "entrada") s += Number(m.cantidad) || 0;
    else if (m.naturaleza === "salida") s -= Number(m.cantidad) || 0;
    // 'transferencia' → 0 (no afecta total)
  }
  return kg3(s);
}

// Saldo por ubicación: crédito en destino, débito en origen (entrada/salida/transferencia).
export function saldoPorUbicacion(movimientos) {
  const acc = {};
  const add = (u, d) => { if (u == null) return; acc[u] = kg3((acc[u] || 0) + d); };
  for (const m of movimientos || []) {
    const c = Number(m.cantidad) || 0;
    if ((m.naturaleza === "entrada" || m.naturaleza === "transferencia") && m.ubicacion_destino_id != null)
      add(m.ubicacion_destino_id, c);
    if ((m.naturaleza === "salida" || m.naturaleza === "transferencia") && m.ubicacion_origen_id != null)
      add(m.ubicacion_origen_id, -c);
  }
  return acc;
}

// pct de un consumo respecto del kg inicial del lote (derivado).
export function pctDerivado(kg, kgInicial) {
  const i = Number(kgInicial) || 0;
  return i > 0 ? Math.round(((Number(kg) || 0) / i) * 10000) / 10000 : null;
}

// Conciliación de masa de una orden (DF2-3): entrada = resultado + descarte + merma ± tol.
// Descarte y merma SEPARADOS. Sin doble descuento (el consumo ya descontó el lote).
export function conciliacionOrden(kgEntrada, { resultado = 0, descarte = 0, merma = 0 } = {}, toleranciaPct = 0.5) {
  const entrada = Number(kgEntrada) || 0;
  const salidas = kg3(Number(resultado) + Number(descarte) + Number(merma));
  const diff = kg3(entrada - salidas);
  const tolerancia = kg3((entrada * (Number(toleranciaPct) || 0)) / 100);
  return { ok: Math.abs(diff) <= tolerancia, diff, tolerancia, entrada, salidas };
}

// Máquina de estados de la orden (debe coincidir con proc_fn_orden_transicion).
const TRANSICIONES = {
  borrador: ["en_proceso", "anulado"],
  en_proceso: ["pendiente_conciliacion", "anulado"],
  pendiente_conciliacion: ["conciliado", "en_proceso", "anulado"],
  conciliado: ["cerrado", "en_proceso", "anulado"],
  cerrado: [],
  anulado: [],
};
export function transicionOrdenValida(desde, hasta) {
  if (desde === hasta) return true;
  return (TRANSICIONES[desde] || []).includes(hasta);
}
export function ordenEsEditable(estado) { return estado !== "cerrado" && estado !== "anulado"; }

// Validación de un valor de QC contra su parámetro (DF2-1: jsonb con reglas, no depósito).
export function validarQcValor(param = {}, valor) {
  if (valor == null || valor === "") {
    return param.obligatorio ? { ok: false, error: `parámetro obligatorio '${param.codigo}' sin valor` } : { ok: true };
  }
  if (param.tipo_dato === "numero") {
    const n = Number(valor);
    if (!Number.isFinite(n)) return { ok: false, error: `'${param.codigo}' debe ser número` };
    if (param.rango_min != null && n < Number(param.rango_min)) return { ok: false, error: `'${param.codigo}' < mínimo` };
    if (param.rango_max != null && n > Number(param.rango_max)) return { ok: false, error: `'${param.codigo}' > máximo` };
  } else if (param.tipo_dato === "booleano") {
    if (typeof valor !== "boolean") return { ok: false, error: `'${param.codigo}' debe ser booleano` };
  }
  return { ok: true };
}

// Un consumo válido para el lineage EXIGE un movimiento de respaldo (nunca lineage sin ledger).
export function consumoLineageConsistente({ movimiento_id, kg } = {}) {
  if (!movimiento_id) return { ok: false, error: "lineage sin movimiento de ledger (prohibido)" };
  if (!(Number(kg) > 0)) return { ok: false, error: "kg de consumo debe ser > 0" };
  return { ok: true };
}

/* eslint-disable */
// src/proceso/core/procesoF3Domain.js
// proc_* F3 (PT · Pallets · Repaletizaje) — LÓGICA PURA. Espeja invariantes de
// schema_proc_v3_f3.sql. SoTs: ledger (existencia física) + proc_pallet_linea
// (composición/genealogía). La reconciliación es INVARIANTE, no cache.
import { kg3 } from "./procesoDomain.js";

// Invariante: Σ líneas activas = saldo físico del pallet (ledger), dentro de tolerancia.
export function reconciliacionPallet(kgLineas, kgLedger, toleranciaPct = 0.1) {
  const l = kg3(kgLineas), f = kg3(kgLedger);
  const tol = kg3((Math.max(Math.abs(l), Math.abs(f)) * (Number(toleranciaPct) || 0)) / 100) + 0.001;
  return { ok: Math.abs(l - f) <= tol, diff: kg3(l - f), tolerancia: tol };
}

// Balance de repaletizaje: Σ kg origen = Σ kg destino ± tolerancia. No se crean kilos.
export function balanceRepaletizaje(origenes = [], destinos = [], toleranciaPct = 0.1) {
  const so = kg3((origenes || []).reduce((s, x) => s + (Number(x.kg) || 0), 0));
  const sd = kg3((destinos || []).reduce((s, x) => s + (Number(x.kg) || 0), 0));
  const tol = kg3((Math.max(so, sd) * (Number(toleranciaPct) || 0)) / 100) + 0.001;
  return { ok: Math.abs(so - sd) <= tol, sumaOrigen: so, sumaDestino: sd, diff: kg3(so - sd) };
}

// Disponible de una línea de resultado para materializar PT (Regla 2).
export function resultadoDisponible(kgResultado, kgMaterializado) {
  return kg3((Number(kgResultado) || 0) - (Number(kgMaterializado) || 0));
}
export function puedeMaterializar(disponible, kg) {
  const d = Number(disponible) || 0, k = Number(kg) || 0;
  if (!(k > 0)) return { ok: false, error: "kg de PT debe ser > 0" };
  if (k > d) return { ok: false, error: `materialización ${k} excede disponible ${d}` };
  return { ok: true };
}
export function puedePalletizar(ptOnHand, kg) {
  const d = Number(ptOnHand) || 0, k = Number(kg) || 0;
  if (!(k > 0)) return { ok: false, error: "kg a palletizar debe ser > 0" };
  if (k > d) return { ok: false, error: `palletiza ${k} excede PT disponible ${d}` };
  return { ok: true };
}

// Compatibilidad de pallet (Regla 5): dims configurables deben coincidir con líneas existentes.
export function compatiblePallet(nuevoPT = {}, lineasExistentes = [], compatKeys = ["especie_codigo", "formato_id"]) {
  if (!lineasExistentes.length) return { ok: true };
  for (const key of compatKeys || []) {
    const nv = nuevoPT[key];
    for (const l of lineasExistentes) {
      const ev = l[key];
      if (ev != null && nv != null && ev !== nv) {
        return { ok: false, error: `pallet incompatible en ${key}: ${ev} ≠ ${nv}` };
      }
    }
  }
  return { ok: true };
}

// Estado del pallet derivado del saldo físico (Regla 11): no usar 'repaletizado' terminal.
export function palletEstadoPorSaldo(kgFisico, kgOriginal, estadoActual = "disponible") {
  if (estadoActual === "anulado") return "anulado";
  const f = Number(kgFisico) || 0, o = Number(kgOriginal) || 0;
  if (f <= 0) return "agotado";
  if (o > 0 && f < o) return "parcialmente_consumido";
  if (estadoActual === "armando") return "disponible";
  return estadoActual;
}

/* eslint-disable */
// src/proceso/core/procesoF4Domain.js
// proc_* F4 (Despacho y salida física) — LÓGICA PURA. Espeja invariantes de
// schema_proc_v4_f4.sql. Ledger = SoT física; reserva = proc_hold (no segundo sistema).
import { kg3 } from "./procesoDomain.js";

// Disponible del pallet = físico − reservado − bloqueado (reserva reduce libre, no físico).
export function disponiblePallet(fisico, reservado = 0, bloqueado = 0) {
  return kg3((Number(fisico) || 0) - (Number(reservado) || 0) - (Number(bloqueado) || 0));
}

export function puedeReservar(disponible, kg) {
  const d = Number(disponible) || 0, k = Number(kg) || 0;
  if (!(k > 0)) return { ok: false, error: "kg a reservar debe ser > 0" };
  if (k > d) return { ok: false, error: `reserva ${k} excede disponible ${d}` };
  return { ok: true };
}
export function puedeDespachar(disponible, kg) {
  const d = Number(disponible) || 0, k = Number(kg) || 0;
  if (!(k > 0)) return { ok: false, error: "kg a despachar debe ser > 0" };
  if (k > d) return { ok: false, error: `despacho ${k} excede disponible ${d}` };
  return { ok: true };
}

// Invariante 16: Σ líneas de despacho = Σ movimientos de salida asociados.
export function conciliacionDespacho(kgLineas, kgMovimientos, toleranciaPct = 0) {
  const l = kg3(kgLineas), m = kg3(kgMovimientos);
  const tol = kg3((Math.max(l, m) * (Number(toleranciaPct) || 0)) / 100) + 0.001;
  return { ok: Math.abs(l - m) <= tol, diff: kg3(l - m) };
}

// Máquina de estados del despacho (debe coincidir con proc_fn_despacho_transicion).
const TRANS = {
  borrador: ["preparando", "cancelado"],
  preparando: ["listo", "cancelado"],
  listo: ["cargando", "cancelado"],
  cargando: ["despachado", "cancelado"],
  despachado: ["cancelado"], // solo reversa
  cancelado: [],
};
export function transicionDespachoValida(desde, hasta) {
  if (desde === hasta) return desde !== "despachado" && desde !== "cancelado"; // despachado/cancelado no editables
  return (TRANS[desde] || []).includes(hasta);
}
// 'despachado' no editable libremente (solo →cancelado por reversa); 'cancelado' terminal.
export function despachoEditable(estado) { return estado !== "despachado" && estado !== "cancelado"; }

// Pallet tras despacho parcial: conserva identidad y saldo mientras físico > 0 (Regla 8).
export function saldoTrasDespacho(fisicoAntes, kgDespachado) {
  return kg3((Number(fisicoAntes) || 0) - (Number(kgDespachado) || 0));
}
export function palletSigueOperable(saldoFisico) { return (Number(saldoFisico) || 0) > 0; }

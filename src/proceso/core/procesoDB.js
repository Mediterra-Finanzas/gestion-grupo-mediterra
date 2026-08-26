/* eslint-disable */
// src/proceso/core/procesoDB.js
// Capability proc_* — capa de acceso a datos (relacional, tablas proc_*).
// A diferencia del patrón blob calendario_data, proc_* es relacional (como contab_*):
// cada entidad es una tabla scoped por empresa_id, consultada por PostgREST.
//
// REGLA 9 (anti-borrado, OBLIGATORIA): las funciones de CARGA PROPAGAN el error de
// red (lanzan excepción) — NUNCA devuelven defaults/{}/[] en catch. El componente
// marca la carga OK sólo tras éxito (crearGateCarga) y bloquea todo guardado si la
// carga falló. Aquí, además, la seguridad real depende de RLS por empresa (deny-by-
// default) — ver GO-LIVE BLOCKER en schema_proc_v1.sql.
//
// PROC-INFRA-001 (deuda): SUPA_URL/SUPA_KEY se referencian temporalmente desde
// friskuHelpers (infra corporativa compartida — bucket ③, NO dominio Frisku).
// Deben moverse a un config neutral compartido; no es una dependencia de negocio.

import { SUPA_URL, SUPA_KEY } from "../../friskuHelpers";
import { procAuthGuardToken, getProcEmpresa, ProcAuthRequiredError } from "./procAuth";
export { ProcAuthRequiredError };  // re-export para consumidores del data-layer

function headers(extra) {
  // F-2 FAIL-CLOSED: con flag ON y token ausente/expirado → procAuthGuardToken() lanza
  // ProcAuthRequiredError (dispara re-auth) en vez de caer a anon. Con flag OFF devuelve null → anon.
  const proc = procAuthGuardToken();
  const emp = getProcEmpresa();  // tenant autorizado del contexto (request-scoped por pestaña)
  return {
    apikey: SUPA_KEY,
    Authorization: `Bearer ${proc || SUPA_KEY}`,
    "Content-Type": "application/json",
    // X-Proc-Empresa: contexto de tenant re-validado por la RLS en cada request (multi-membership).
    // Single-membership la RLS la auto-deriva del sub → el header es redundante pero inocuo.
    ...(emp ? { "X-Proc-Empresa": emp } : {}),
    ...(extra || {}),
  };
}

const REST = `${SUPA_URL}/rest/v1`;

// ── Primitivas (todas propagan error — Regla 9) ──────────────────────────────
export async function procSelect(tabla, query = "") {
  const res = await fetch(`${REST}/${tabla}${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`proc load ${tabla} → HTTP ${res.status}`); // NO defaults
  return res.json();
}

export async function procInsert(tabla, filas) {
  const res = await fetch(`${REST}/${tabla}`, {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(Array.isArray(filas) ? filas : [filas]),
  });
  if (!res.ok) throw new Error(`proc insert ${tabla} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function procUpdate(tabla, query, patch) {
  const res = await fetch(`${REST}/${tabla}${query}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`proc update ${tabla} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// RPC transaccional (proc_fn_*). Propaga error.
export async function procRpc(fn, args) {
  const res = await fetch(`${REST}/rpc/${fn}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) throw new Error(`proc rpc ${fn} → HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Gate de carga (Regla 9): guardar sólo tras una carga exitosa ─────────────
export function crearGateCarga() {
  let cargaOk = false;
  return {
    marcarOk() { cargaOk = true; },
    estaOk() { return cargaOk; },
    // Envuelve un guardado: si la carga no fue OK, NO escribe (evita pisar con vacío).
    async guardar(fn) {
      if (!cargaOk) throw new Error("guardado bloqueado: la carga inicial no fue exitosa (Regla 9)");
      return fn();
    },
  };
}

// ── Cargas por entidad (scoped por empresa_id) ───────────────────────────────
const q = (empresaId, extra = "") =>
  `?empresa_id=eq.${empresaId}&deleted_at=is.null&order=created_at.desc${extra}`;

export const cargarVinculos    = (e) => procSelect("proc_vinculo", q(e));
export const cargarPlantas     = (e) => procSelect("proc_planta", q(e));
export const cargarTemporadas  = (e) => procSelect("proc_temporada", q(e));
export const cargarPredios     = (e) => procSelect("proc_predios", q(e));
export const cargarCalibres    = (e) => procSelect("proc_calibre", q(e));
export const cargarColores     = (e) => procSelect("proc_color", q(e));
export const cargarRecepciones = (e) => procSelect("proc_recepcion", q(e));
export const cargarLotes       = (e) => procSelect("proc_lote", q(e));
export const cargarTiposMovimiento = () => procSelect("proc_tipo_movimiento", "?activo=eq.true&order=orden");

// Saldo de un lote — DERIVADO por la vista (SoT = ledger, no cache).
export async function saldoLote(empresaId, loteId) {
  const rows = await procSelect("proc_v_lote_saldos", `?empresa_id=eq.${empresaId}&lote_id=eq.${loteId}`);
  return rows[0] || { lote_id: loteId, on_hand: 0, bloqueado: 0, reservado: 0, disponible: 0 };
}

// ── Operaciones transaccionales (vía RPC — atómicas + no-negativo) ───────────
export const ingresarLote = (a) => procRpc("proc_fn_ingresar_lote", {
  p_empresa_id: a.empresaId, p_recepcion_id: a.recepcionId, p_codigo: a.codigo,
  p_especie: a.especie, p_variedad: a.variedad || null, p_kg: a.kg,
  p_planta_id: a.plantaId || null, p_temporada: a.temporada || null, p_actor: a.actor || null,
});

export const registrarConsumo = (a) => procRpc("proc_fn_registrar_consumo", {
  p_empresa_id: a.empresaId, p_lote_id: a.loteId, p_kg: a.kg, p_ref_id: a.refId || null,
  p_transaccion_id: a.transaccionId || null, p_actor: a.actor || null,
});

export const reversarMovimiento = (a) => procRpc("proc_fn_reversar_movimiento", {
  p_empresa_id: a.empresaId, p_mov_id: a.movId, p_motivo: a.motivo, p_actor: a.actor || null,
});

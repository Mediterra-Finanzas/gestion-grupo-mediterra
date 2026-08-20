/* eslint-disable */
// src/proceso/core/procesoDomain.js
// Capability proc_* — Servicio de Proceso de Fruta Fresca. LÓGICA PURA (sin red).
// Espeja las invariantes del schema (schema_proc_v1.sql) para poder testearlas offline
// y reutilizarlas en la capa DB / UI. Fuente de verdad del inventario = el ledger
// (proc_movimiento); estas funciones DERIVAN saldos, nunca los persisten.

// Tipos de movimiento del ledger (deben coincidir con proc_tipo_movimiento).
export const TIPOS_MOV = {
  RECEPCION: "recepcion",
  CONSUMO: "consumo_proceso",
  DESPACHO: "despacho",
  AJUSTE: "ajuste",
};
export const NATURALEZA = { ENTRADA: "entrada", SALIDA: "salida" };

// Redondeo a 3 decimales (kg) evitando ruido de float.
export function kg3(n) {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

// on_hand = Σ entradas − Σ salidas (solo movimientos físicos del objeto).
export function onHandFromMovimientos(movimientos) {
  let s = 0;
  for (const m of movimientos || []) {
    const c = Number(m.cantidad) || 0;
    s += m.naturaleza === NATURALEZA.ENTRADA ? c : -c;
  }
  return kg3(s);
}

// bloqueado / reservado = Σ holds ACTIVOS por tipo (no son masa física).
export function holdsActivos(holds) {
  let bloqueado = 0, reservado = 0;
  for (const h of holds || []) {
    if (h.estado && h.estado !== "activo") continue;
    const c = Number(h.cantidad) || 0;
    if (h.tipo === "bloqueo") bloqueado += c;
    else if (h.tipo === "reserva") reservado += c;
  }
  return { bloqueado: kg3(bloqueado), reservado: kg3(reservado) };
}

// Saldo derivado de un lote: físico vs disponible (sin doble descuento).
//   disponible = on_hand − bloqueado − reservado
export function computeSaldoLote(movimientos, holds) {
  const on_hand = onHandFromMovimientos(movimientos);
  const { bloqueado, reservado } = holdsActivos(holds);
  return { on_hand, bloqueado, reservado, disponible: kg3(on_hand - bloqueado - reservado) };
}

// Validación de kg de recepción (kg_neto > 0, kg_neto <= kg_bruto si ambos).
export function validarKgRecepcion({ kg_neto, kg_bruto } = {}) {
  const neto = Number(kg_neto);
  if (!(neto > 0)) return { ok: false, error: "kg_neto debe ser > 0" };
  if (kg_bruto != null && Number(kg_bruto) >= 0 && neto > Number(kg_bruto)) {
    return { ok: false, error: "kg_neto no puede exceder kg_bruto" };
  }
  return { ok: true };
}

// XOR de identidad del vínculo: exactamente uno de {grupo, auxiliar, pendiente}.
export function validarVinculoRef(v = {}) {
  const n =
    (v.grupo_empresa_id ? 1 : 0) +
    (v.auxiliar_id ? 1 : 0) +
    (v.pendiente_alta_corporativa ? 1 : 0);
  if (n !== 1) {
    return { ok: false, error: "exactamente una identidad: grupo | auxiliar | pendiente" };
  }
  if (v.pendiente_alta_corporativa && !v.nombre_provisional) {
    return { ok: false, error: "modo pendiente exige nombre_provisional" };
  }
  return { ok: true };
}

// ¿Puede consumirse p_kg del disponible? (no negativo).
export function puedeConsumir(disponible, kg) {
  const d = Number(disponible) || 0;
  const k = Number(kg) || 0;
  if (!(k > 0)) return { ok: false, error: "kg de consumo debe ser > 0" };
  if (k > d) return { ok: false, error: `consumo ${k} excede disponible ${d}` };
  return { ok: true };
}

// Naturaleza opuesta para una reversa/contramovimiento.
export function reversaNaturaleza(naturaleza) {
  return naturaleza === NATURALEZA.ENTRADA ? NATURALEZA.SALIDA : NATURALEZA.ENTRADA;
}

// Conciliación de masa del proceso (F4, aquí solo la regla pura):
//   kg_entrada = producto + descarte + merma (± tolerancia). Descarte/merma NO
//   descuentan el lote de MP: nacen aquí, del resultado del proceso.
export function conciliacionMasa(kgEntrada, { producto = 0, descarte = 0, merma = 0 } = {}, toleranciaPct = 0.5) {
  const entrada = Number(kgEntrada) || 0;
  const salidas = kg3(Number(producto) + Number(descarte) + Number(merma));
  const diff = kg3(entrada - salidas);
  const tol = kg3((entrada * (Number(toleranciaPct) || 0)) / 100);
  return { ok: Math.abs(diff) <= tol, diff, tolerancia: tol, entrada, salidas };
}

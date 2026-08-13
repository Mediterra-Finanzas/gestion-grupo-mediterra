/* eslint-disable */
// src/proceso/core/procesoF7Domain.js
// proc_* F7.1 — LÓGICA PURA de la UI operacional. Espeja invariantes de
// schema_proc_v7_f7_1.sql. La DB es la AUTORIDAD; esto es pre-validación UX
// + mapeo estado→presentación + traducción de errores. Sin llamadas de red.

// ── Correlativos (espejo de proc_fn_siguiente_correlativo) ──────────────────
export const PREFIJOS_DEFAULT = {
  recepcion: "REC", lote: "LOT", orden: "ORD", pallet: "PAL",
  despacho: "DES", informe: "INF", base: "BCO",
};
export function compactarTemporada(t) {
  const d = String(t || "").replace(/[^0-9]/g, "");
  return d.length === 8 ? d.slice(2, 4) + d.slice(6, 8) : d; // "20262027"->"2627"; "2526"->"2526"
}
export function formatearCorrelativo(prefijo, temporada, n) {
  return `${prefijo}-${compactarTemporada(temporada)}-${String(Number(n) || 0).padStart(6, "0")}`;
}

// ── QC severidad (espejo de proc_fn_registrar_qc) ───────────────────────────
export const SEVERIDADES = ["informativo", "advertencia", "bloqueante"];
// params: [{codigo,tipo_dato,rango_min,rango_max,severidad,obligatorio}]; valores: {codigo: valor}
export function evaluarQC(params = [], valores = {}) {
  let resultado = "aprobado";
  const detalles = [];
  for (const p of params) {
    const raw = valores[p.codigo];
    let fuera = false;
    if (raw == null || raw === "") {
      if (p.obligatorio) fuera = true;
    } else if (p.tipo_dato === "numero") {
      const n = Number(raw);
      if (Number.isNaN(n)) fuera = true;
      else if ((p.rango_min != null && n < Number(p.rango_min)) ||
               (p.rango_max != null && n > Number(p.rango_max))) fuera = true;
    }
    if (fuera) {
      if (p.severidad === "bloqueante") resultado = "rechazado";
      else if (p.severidad === "advertencia" && resultado !== "rechazado") resultado = "condicional";
    }
    detalles.push({ codigo: p.codigo, fuera, severidad: p.severidad });
  }
  return { resultado, bloquea: resultado === "rechazado", detalles };
}

// ── Estado → presentación (mapeo backend→badge; NO se guarda 2º estado) ─────
export const ESTADOS_BADGE = {
  borrador: { label: "Borrador", tono: "neutral" },
  planificada: { label: "Planificada", tono: "info" },
  recibida: { label: "Recibida", tono: "info" },
  publicado: { label: "Publicado", tono: "info" },
  en_proceso: { label: "En proceso", tono: "primary" },
  pendiente_conciliacion: { label: "Pend. conciliación", tono: "warning" },
  conciliado: { label: "Conciliado", tono: "success" },
  cerrado: { label: "Cerrado", tono: "success" },
  cerrada: { label: "Cerrada", tono: "success" },
  procesada: { label: "Procesada", tono: "success" },
  disponible: { label: "Disponible", tono: "success" },
  agotado: { label: "Agotado", tono: "neutral" },
  activa: { label: "Activa", tono: "success" },
  activo: { label: "Activo", tono: "success" },
  inactiva: { label: "Inactiva", tono: "neutral" },
  inactivo: { label: "Inactivo", tono: "neutral" },
  reservado: { label: "Reservado", tono: "warning" },
  bloqueado: { label: "Bloqueado", tono: "danger" },
  preparando: { label: "Preparando", tono: "info" },
  listo: { label: "Listo", tono: "primary" },
  cargando: { label: "Cargando", tono: "warning" },
  despachado: { label: "Despachado", tono: "success" },
  despachada: { label: "Despachada", tono: "success" },
  cancelado: { label: "Cancelado", tono: "danger" },
  generada: { label: "Generada", tono: "info" },
  emitida: { label: "Emitida", tono: "success" },
  reemplazada: { label: "Reemplazada", tono: "neutral" },
  valorizado: { label: "Valorizado", tono: "success" },
  pendiente_tarifa: { label: "Pendiente tarifa", tono: "warning" },
  aprobada: { label: "Aprobada", tono: "success" },
  enviada_a_facturacion: { label: "Enviada a facturación", tono: "info" },
  anulado: { label: "Anulado", tono: "danger" },
  anulada: { label: "Anulada", tono: "danger" },
  rechazado: { label: "Rechazado", tono: "danger" },
  condicional: { label: "Condicional", tono: "warning" },
  aprobado: { label: "Aprobado", tono: "success" },
  consumida: { label: "Consumida", tono: "neutral" },
};
export function badgeDe(estado) {
  return ESTADOS_BADGE[estado] || { label: estado || "—", tono: "neutral" };
}

// ── Traducción de errores backend → mensaje accionable (backend sigue autoridad) ──
const REGLAS_ERROR = [
  { re: /excede disponible ([0-9.]+) del lote/i, msg: (m) => `No hay stock suficiente en el lote. Disponible: ${m[1]} kg.` },
  { re: /excede disponible ([0-9.]+) del pallet/i, msg: (m) => `El pallet no tiene saldo suficiente. Disponible: ${m[1]} kg.` },
  { re: /excede composición/i, msg: () => "La cantidad supera la composición disponible del pallet." },
  { re: /no elegible para proceso|QC rechazado|QC obligatorio no ejecutado/i, msg: () => "El lote no está habilitado para proceso por QC. La fruta existe físicamente, pero no puede consumirse hasta resolver el control de calidad." },
  { re: /ubicaci[oó]n .* no existe|ubicacion_destino/i, msg: () => "La ubicación seleccionada no es válida para esta planta." },
  { re: /kg .* > 0|kg del lote debe ser|debe ser > 0/i, msg: () => "La cantidad debe ser mayor que cero." },
  { re: /no concilia|tolerancia/i, msg: () => "La orden no cuadra en masa: entrada ≠ resultado + descarte + merma (fuera de tolerancia)." },
  { re: /cerrad[ao].*no editable|orden .* cerrada|no editable/i, msg: () => "El registro está cerrado; no admite cambios." },
  { re: /transición .* inválida|transicion .* invalida/i, msg: () => "Ese cambio de estado no está permitido desde el estado actual." },
  { re: /pendiente_tarifa|sin tarifa|no valorizado/i, msg: () => "No hay tarifa vigente para este servicio; queda pendiente de tarifa (no $0)." },
  { re: /reserva|reservado/i, msg: () => "Hay una reserva activa sobre el pallet." },
  { re: /base aprobada|inmutable/i, msg: () => "La base de cobro ya fue aprobada; es inmutable." },
  { re: /permission denied|violates row-level|no tenés permiso/i, msg: () => "No tenés permiso para esta acción." },
  { re: /duplicate key|unique|ya existe/i, msg: () => "Ya existe un registro con ese código." },
  { re: /foreign key|violates foreign/i, msg: () => "Falta una referencia requerida (vínculo/maestro no encontrado)." },
];
export function traducirError(err) {
  const t = typeof err === "string" ? err : (err && err.message) || String(err || "");
  for (const r of REGLAS_ERROR) {
    const m = t.match(r.re);
    if (m) return r.msg(m);
  }
  return t || "Ocurrió un error inesperado.";
}

// ── Pesos de recepción (kg_neto = kg_bruto − tara; DB es autoridad) ─────────
export function calcularNeto(bruto, tara) {
  const b = Number(bruto) || 0, t = Number(tara) || 0;
  return Math.round((b - t) * 1000) / 1000;
}
export function validarPesos({ bruto, tara } = {}) {
  const b = Number(bruto), t = Number(tara), err = [];
  if (bruto !== "" && bruto != null && (Number.isNaN(b) || b < 0)) err.push("Peso bruto inválido.");
  if (tara !== "" && tara != null && (Number.isNaN(t) || t < 0)) err.push("Tara inválida.");
  if (!Number.isNaN(b) && !Number.isNaN(t) && bruto !== "" && bruto != null && (b - t) < 0)
    err.push("El peso neto no puede ser negativo (la tara supera el bruto).");
  return { ok: err.length === 0, errores: err, neto: calcularNeto(bruto, tara) };
}

// ── Filtros operacionales del shell ─────────────────────────────────────────
export function validarFiltros({ empresa, planta, temporada, fecha } = {}) {
  const errores = [];
  if (!empresa) errores.push("Falta seleccionar empresa (tenant).");
  if (fecha && Number.isNaN(new Date(fecha).getTime())) errores.push("Fecha operacional inválida.");
  return { ok: errores.length === 0, errores };
}

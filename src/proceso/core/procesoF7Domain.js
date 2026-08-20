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
  // Contrato (T7): máquina de estados versionada
  pendiente_firma: { label: "Pendiente de firma", tono: "warning" },
  vigente: { label: "Vigente", tono: "success" },
  vencido: { label: "Vencido", tono: "danger" },
  reemplazado: { label: "Reemplazado", tono: "neutral" },
  terminado: { label: "Terminado", tono: "neutral" },
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

// ── Producción: conciliación / packout / acciones de orden (F7.3) ───────────
// Preview UX; la DB (proc_v_orden_conciliacion + trigger de transición) es autoridad.
export function packout(comercial, entrada) {
  const b = Number(entrada) || 0;
  return b > 0 ? Math.round((Number(comercial) / b) * 10000) / 10000 : null;
}
export function estadoConciliacion(diff, tolerancia) {
  return Math.abs(Number(diff) || 0) <= (Number(tolerancia) || 0) ? "cuadra" : "descuadra";
}
export function resumenConciliacion({ entrada, comercial, descarte, merma, tolerancia } = {}) {
  const ent = Number(entrada) || 0, com = Number(comercial) || 0, des = Number(descarte) || 0, mer = Number(merma) || 0;
  const diff = Math.round((ent - (com + des + mer)) * 1000) / 1000;
  return { entrada: ent, comercial: com, descarte: des, merma: mer, diff, packout: packout(com, ent), cuadra: estadoConciliacion(diff, tolerancia) === "cuadra" };
}
// Transiciones disponibles según estado (rpc:true = va por conciliar_orden).
const ACCIONES_ORDEN = {
  borrador: [{ a: "en_proceso", l: "Iniciar proceso" }],
  en_proceso: [{ a: "pendiente_conciliacion", l: "Pasar a conciliación" }],
  pendiente_conciliacion: [{ a: "conciliado", l: "Conciliar", rpc: true }, { a: "en_proceso", l: "Volver a proceso" }],
  conciliado: [{ a: "cerrado", l: "Cerrar orden" }, { a: "en_proceso", l: "Reabrir" }],
};
export function accionesOrden(estado) { return ACCIONES_ORDEN[estado] || []; }
export function ordenTerminal(estado) { return estado === "cerrado" || estado === "anulado"; }
// Qué falta para poder conciliar/cerrar (mensaje accionable).
export function faltaParaCerrar({ estado, entrada, comercial, descarte, merma, tolerancia } = {}) {
  if (ordenTerminal(estado)) return null;
  if (!(Number(entrada) > 0)) return "Faltan consumos: la orden no tiene kg de entrada.";
  if (!(Number(comercial) + Number(descarte) + Number(merma) > 0)) return "Falta registrar resultado / descarte / merma.";
  const r = resumenConciliacion({ entrada, comercial, descarte, merma, tolerancia });
  if (!r.cuadra) return `No cuadra: faltan ${Math.abs(r.diff)} kg por conciliar (diferencia ${r.diff} > tolerancia ${Number(tolerancia) || 0}).`;
  return null;
}

// ── Despacho (F7.5): máquina de estados + totales (preview UX; DB autoridad) ──
export function despachoTerminal(estado) { return estado === "despachado" || estado === "cancelado"; }
export function despachoEditableCab(estado) { return ["borrador", "preparando", "listo"].includes(estado); }
export function puedeConfirmarDespacho(estado) { return ["listo", "cargando"].includes(estado); }
export function puedeCargarDespacho(estado) { return ["preparando", "listo"].includes(estado); }
// Transiciones disponibles (además de confirmar/reversar/cancelar que van por RPC).
export function accionesDespacho(estado) {
  const m = { borrador: ["preparando"], preparando: ["listo"], listo: ["cargando"], cargando: [] };
  return m[estado] || [];
}
export function totalKg(lineas = [], filtroEstado = "confirmada") {
  return lineas.filter((l) => !filtroEstado || l.estado === filtroEstado).reduce((a, l) => a + (Number(l.kg) || 0), 0);
}

// ── F7.7 Tarifario / Servicios Facturables / Base de Cobro ──────────────────
// Preview UX; la DB (proc_fn_resolver_tarifa + guards + NUMERIC) es la AUTORIDAD.
// El monto para decisiones económicas viene del backend (subtotal/total); esto es
// solo para MOSTRAR cantidad × tarifa = monto y previsualizar el manual.
export function montoServicio(cantidad, tarifa) {
  if (cantidad == null || cantidad === "" || tarifa == null || tarifa === "") return null;
  const c = Number(cantidad), t = Number(tarifa);
  if (Number.isNaN(c) || Number.isNaN(t)) return null;
  return Math.round(c * t * 100) / 100;
}
// Especificidad de una tarifa (por qué una gana sobre otra).
export function especificidadTarifa(t = {}) {
  const partes = [];
  if (t.cliente_vinculo_id) partes.push("cliente");
  if (t.temporada_codigo) partes.push("temporada");
  if (t.especie_codigo) partes.push("especie");
  return partes.length ? partes.join(" + ") : "general";
}
// Estado de vigencia respecto de una fecha (espejo del CASE del read-model).
export function vigenciaTarifa(t = {}, hoy = null) {
  if (t.estado && t.estado !== "vigente") return t.estado; // cerrada / anulada
  const h = hoy ? new Date(hoy) : new Date();
  const desde = t.vigencia_desde ? new Date(t.vigencia_desde) : null;
  const hasta = t.vigencia_hasta ? new Date(t.vigencia_hasta) : null;
  if (desde && desde > h) return "futura";
  if (hasta && hasta < h) return "vencida";
  return "vigente";
}
// Base de cobro: editable solo en borrador / en_revision (espejo de proc_fn_base_guard).
export function baseEditable(estado) { return estado === "borrador" || estado === "en_revision"; }
export function accionesBase(estado) {
  const m = {
    borrador: [{ a: "aprobar", l: "Aprobar base", rpc: true }],
    en_revision: [{ a: "aprobar", l: "Aprobar base", rpc: true }],
    aprobada: [{ a: "enviada_a_facturacion", l: "Enviar a facturación" }],
    enviada_a_facturacion: [{ a: "cerrada", l: "Cerrar" }],
  };
  return m[estado] || [];
}
// Un servicio puede sumarse a una base si está valorizado (no pendiente_tarifa/anulado).
export function servicioAgregableABase(estado) {
  return ["valorizado", "revisado", "facturable"].includes(estado);
}
// Totales por moneda (NUNCA mezclar monedas). Suma cruda y redondea al final.
export function totalesPorMoneda(items = [], campoMonto = "subtotal", campoMoneda = "moneda") {
  const map = new Map();
  for (const it of items) {
    const mon = it[campoMoneda] || "—";
    const cur = map.get(mon) || { moneda: mon, total: 0, n: 0 };
    cur.total += Number(it[campoMonto]) || 0; cur.n += 1; map.set(mon, cur);
  }
  return [...map.values()].map((x) => ({ ...x, total: Math.round(x.total * 100) / 100 }));
}

// ── T10 · Selects dinámicos / cascada de maestros (lógica pura, testeable) ──
// Un campo "ref" declara { tabla, value, label, filter?, dep?, depMatch? }. Las
// opciones se derivan de las filas cargadas del maestro fuente, aplicando: solo
// activos/no borrados, filtro propio (ej. rol), y —si hay dep— coincidencia con
// el valor del campo padre. Sin dep-satisfecho → opciones vacías (disabled en UI).
export function opcionesRef(rows, ref, form = {}) {
  if (!ref || !Array.isArray(rows)) return [];
  let out = rows.filter((r) => r && r.deleted_at == null && r.activo !== false);
  if (typeof ref.filter === "function") out = out.filter(ref.filter);
  if (ref.dep) {
    const parentVal = form[ref.dep];
    if (parentVal == null || parentVal === "") return [];   // sin contexto → nada
    const matchCol = ref.depMatch || ref.dep;
    out = out.filter((r) => String(r[matchCol]) === String(parentVal));
  }
  return out.map((r) => ({ value: r[ref.value], label: typeof ref.label === "function" ? ref.label(r) : r[ref.label] }));
}

// Al cambiar un campo padre, limpia SOLO los hijos que dependían de él (recursivo).
// No toca campos no relacionados. Devuelve el nuevo objeto de valores.
export function limpiarDependencias(campos, valores, cambiadoC) {
  let next = { ...valores };
  for (const h of (campos || []).filter((f) => f.ref && f.ref.dep === cambiadoC)) {
    if (next[h.c] != null && next[h.c] !== "") { next[h.c] = ""; next = limpiarDependencias(campos, next, h.c); }
  }
  return next;
}
// Resuelve el label de un valor ref para mostrar en tablas (nunca UUID crudo).
export function labelRef(rows, ref, valor) {
  if (valor == null || valor === "" || !Array.isArray(rows) || !ref) return "—";
  const r = rows.find((x) => String(x[ref.value]) === String(valor));
  if (!r) return String(valor);
  return typeof ref.label === "function" ? ref.label(r) : r[ref.label];
}

// ── T10c · Recepción multi-lote: preview de masas / resumen / tono contractual ─
// Preview UX; el ledger sigue siendo SoT. No introduce constraint nueva.
export function resumenKgLotes(pesoNeto, lotes = []) {
  const asignado = Math.round((lotes || []).reduce((a, l) => a + (Number(l.kg) || 0), 0) * 1000) / 1000;
  const neto = Number(pesoNeto) || 0;
  const dif = Math.round((neto - asignado) * 1000) / 1000;
  return { asignado, neto, pendiente: dif > 0 ? dif : 0, exceso: dif < 0 ? -dif : 0 };
}
export function resumenOrigenes(lotes = []) {
  const distintos = (k) => new Set((lotes || []).map((l) => l[k]).filter(Boolean)).size;
  return { lotes: (lotes || []).length, productores: distintos("productorId"), predios: distintos("predioId"),
    cuarteles: distintos("cuartelId"), kg: resumenKgLotes(0, lotes).asignado };
}

// NR-02 · Completitud del origen agrícola de un lote en captura (cascada Productor→Predio→
// Cuartel). NO cubre Especie (obligatoria por separado) ni Variedad (opcional). Puro/testeable.
// Si el origen es incompleto la fruta física igual se registra, pero exige confirmación consciente;
// nunca se infiere desde la cabecera ni se fabrica snapshot.
export function evaluarOrigenLote(nl = {}) {
  const prod = !!(nl && nl.productorId), pred = !!(nl && nl.predioId), cuar = !!(nl && nl.cuartelId);
  if (prod && pred && cuar) return { completo: true, faltantes: [], ninguno: false, mensaje: "" };
  const faltantes = [];
  if (!prod) faltantes.push("Productor");
  if (!pred) faltantes.push("Predio");
  if (!cuar) faltantes.push("Cuartel");
  const ninguno = !prod && !pred && !cuar;
  const mensaje = ninguno
    ? "Origen agrícola no informado: el lote quedará sin Productor, Predio ni Cuartel. La fruta física queda trazable, pero sin origen agrícola registrado."
    : `Origen agrícola incompleto: falta ${faltantes.join(" y ")}. El lote se registrará sin esa(s) dimensión(es); no se infiere desde la cabecera.`;
  return { completo: false, faltantes, ninguno, mensaje };
}

// T10C-FECHA-OPERACIONAL · timezone operacional canónica (ratificada por CURRENT: default de
// proc_fn_informe_diario_operacion). No hay config por empresa/planta (agregarla sería estructural).
export const TZ_OPERACIONAL = "America/Santiago";

// Fecha calendario (YYYY-MM-DD) de un instante EN la tz operacional. Reemplaza a
// `new Date().toISOString().slice(0,10)` (que da fecha UTC del navegador). DST-correcto vía Intl.
export function fechaCalendarioTz(instante = new Date(), tz = TZ_OPERACIONAL) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

// Wall-clock NAIVE (fecha + hora) de un instante en la tz operacional. El backend convierte
// (AT TIME ZONE) — el navegador nunca es autoridad de tz. Sin argumento = "ahora" (default del
// formulario); con un instante = reconstruye el wall-clock de esa recepción (reanudación de borrador).
export function ahoraOperacional(tz = TZ_OPERACIONAL, instante = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instante)
    .reduce((a, x) => (a[x.type] = x.value, a), {});
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

// Deriva la temporada que cubre una fecha calendario (YYYY-MM-DD) desde el catálogo CURRENT
// (autoridad = catálogo). Exactamente una → {codigo}; cero o varias → {error} para bloquear el
// correlativo con mensaje humano (nunca "s-t", nunca folios "REC--"). No hardcodea.
export function temporadaDeFecha(temporadas = [], fecha) {
  if (!fecha) return { error: "sin_fecha" };
  const cubren = (temporadas || []).filter((t) => t && !t.deleted_at &&
    String(t.fecha_inicio) <= fecha && fecha <= String(t.fecha_fin));
  if (cubren.length === 1) return { codigo: cubren[0].codigo };
  return { error: cubren.length === 0 ? "cero" : "multiple" };
}

// ── PROC-ENVASES-001 · helpers de UI (puros/testeables) ──────────────────────
export const NATURALEZA_ENVASE_LABEL = { apertura: "Apertura", ingreso: "Ingreso", salida: "Salida / Entrega",
  transferencia: "Transferencia", ajuste: "Ajuste", dano: "Daño", perdida: "Pérdida", baja: "Baja" };
export const NATURALEZA_ENVASE_TONO = { apertura: "neutral", ingreso: "success", salida: "warning",
  transferencia: "primary", ajuste: "neutral", dano: "warning", perdida: "danger", baja: "danger" };
export const NATURALEZA_ENVASE_OPCIONES = ["ingreso", "salida", "transferencia", "apertura", "ajuste", "dano", "perdida", "baja"];

// KPIs derivados de proc_v_envase_saldo. Service = holder rol propietario_planta.
// enService = en custodia de Service (condición normal); nuestrosEnTerceros = owner Service en poder
// de terceros; danados = condición dañado; pendientesDevolucion = bins de terceros en custodia Service.
export function resumenEnvases(saldos = []) {
  let enService = 0, nuestrosEnTerceros = 0, danados = 0, pendientesDevolucion = 0;
  for (const r of saldos || []) {
    const s = Number(r?.saldo) || 0;
    if (r?.condicion === "danado") danados += s;
    if (r?.holder_es_service && r?.condicion === "normal") enService += s;
    if (r?.owner_rol === "propietario_planta" && !r?.holder_es_service) nuestrosEnTerceros += s;
    // pendiente de devolución = bins normales de terceros en custodia Service (los dañados van al KPI dañados).
    if (r?.holder_es_service && r?.condicion === "normal" && r?.owner_rol && r?.owner_rol !== "propietario_planta") pendientesDevolucion += s;
  }
  return { enService, nuestrosEnTerceros, danados, pendientesDevolucion };
}

// NR-05 · kg de ENTRADA INICIAL por lote desde el ledger — misma autoridad de masa que
// proc_fn_cerrar_recepcion (movimientos de la recepción con objeto_tipo=lote, naturaleza=entrada).
// NO usa on_hand (que neto de salidas posteriores). Devuelve mapa objeto_id(lote) → kg. Puro/testeable.
export function kgEntradaPorLote(movimientos = []) {
  const m = {};
  for (const mv of movimientos || []) {
    if (mv && mv.ref_tipo === "recepcion" && mv.objeto_tipo === "lote" && mv.naturaleza === "entrada" && mv.objeto_id) {
      m[mv.objeto_id] = Math.round(((m[mv.objeto_id] || 0) + (Number(mv.cantidad) || 0)) * 1000) / 1000;
    }
  }
  return m;
}

// NR-04 · Copy del QC de cabecera (fallback). Aclara alcance mono-especie: no cubre toda la
// recepción multi-especie. El QC por lote sigue siendo autoridad. Puro/testeable.
export function textoQcCabecera(especie) {
  const esp = especie || "la especie principal";
  return `QC de cabecera para ${esp}. Aplica como fallback a lotes de esa especie sin QC propio. Las demás especies requieren QC por lote en el Detalle de Recepción.`;
}
// Mapa nivel contractual → tono de badge (backend es autoridad del nivel).
export function tonoContractual(nivel) {
  return nivel === "bloqueante" ? "danger" : nivel === "advertencia" ? "warning"
    : nivel === "informativo" ? "info" : "success";
}
// Copy-down: hereda origen del lote previo, salvo lo que se re-elige (kg nunca se copia).
export function copiarOrigen(prev = {}) {
  if (!prev) return {};
  const { productorId, predioId, cuartelId, especie_codigo, variedad_codigo } = prev;
  return { productorId: productorId || "", predioId: predioId || "", cuartelId: cuartelId || "",
    especie_codigo: especie_codigo || "", variedad_codigo: variedad_codigo || "", kg: "", ubicacion: "" };
}

// ── T10d · Contrato / estado contractual (helpers puros; backend = autoridad) ──
// Máquina de estados del contrato (espejo del guard T7 para habilitar acciones UI).
export const CONTRATO_TRANSICIONES = {
  borrador: ["pendiente_firma", "anulado"],
  pendiente_firma: ["vigente", "borrador", "anulado"],
  vigente: ["vencido", "reemplazado", "terminado", "anulado"],
  vencido: ["reemplazado", "terminado"],
  reemplazado: [], terminado: [], anulado: [],
};
export function transicionesContrato(estado) { return CONTRATO_TRANSICIONES[estado] || []; }

// Payload de fecha para RPC: si NO hay fecha, se OMITE p_fecha del payload para que el
// backend aplique su DEFAULT current_date (enviar p_fecha:null lo anula → bug CONTRACT-DETAIL-01).
// Con fecha explícita, se envía tal cual. No se calcula vigencia en React.
export function rpcFecha(fecha) { return fecha ? { p_fecha: fecha } : {}; }

// Resumen QC para el LISTADO de recepciones (T11-VIS-QC-01): prioriza QC por-lote (conteos
// = hechos); si no hay QC por-lote pero existe QC de cabecera (fallback efectivo del gate),
// devuelve ese resultado real; sólo "ninguno" cuando realmente no hay QC aplicable. Sin nueva SoT.
export function qcListadoResumen(r) {
  const a = Number(r?.qc_aprobados) || 0, x = Number(r?.qc_rechazados) || 0,
        c = Number(r?.qc_condicional) || 0, con = Number(r?.qc_con_qc) || 0;
  if (con > 0) return { kind: "lotes", aprobados: a, condicional: c, rechazados: x, mixto: !!r?.qc_mixto };
  if (r?.qc_resultado) return { kind: "header", resultado: r.qc_resultado };  // fallback header efectivo
  return { kind: "ninguno" };
}

// Lote sin origen agrícola registrado (legacy): no hay productor/predio/cuartel ni sus FKs.
// La UI lo muestra como "Origen no informado" (no infiere de la cabecera, no fabrica historia).
export function loteSinOrigen(l) {
  if (!l) return false;
  return !l.productor && !l.predio && !l.cuartel &&
         !l.productor_vinculo_id && !l.predio_id && !l.cuartel_id;
}

// Tono del badge según el nivel del backend (ok/info/informativo/advertencia/bloqueante).
export function tonoNivelContractual(nivel) {
  return nivel === "bloqueante" ? "danger" : nivel === "advertencia" ? "warning"
    : nivel === "info" || nivel === "informativo" ? "info" : "success";
}

// Alerta contractual a partir del estado que devuelve el backend. La UI NO recrea
// la regla: solo mapea nivel→presentación. mostrar=false cuando no hay que alertar.
export function alertaContractual(ec) {
  if (!ec) return { mostrar: false, tono: "neutral", titulo: "—", texto: "" };
  const nivel = ec.nivel;
  if (nivel === "ok") return { mostrar: false, tono: "success", titulo: ec.estado_display || "Contrato vigente", texto: "Contrato firmado vigente." };
  if (nivel === "info") return { mostrar: false, tono: "info", titulo: ec.estado_display || "—", texto: ec.tiene_contrato_vigente ? "Contrato vigente." : "Sin requisito de contrato para este cliente." };
  if (nivel === "informativo") return { mostrar: true, tono: "info", titulo: "Sin contrato firmado vigente", texto: "Este cliente no posee un contrato firmado vigente. Registro informativo; no restringe la operación." };
  if (nivel === "advertencia") return { mostrar: true, tono: "warning", titulo: "Contrato no vigente", texto: "Este cliente no posee un contrato firmado vigente. Se puede recibir fruta; regularizá el contrato para operar sin restricciones." };
  if (nivel === "bloqueante") return { mostrar: true, tono: "danger", titulo: "Contrato no vigente (bloqueante)", texto: "Este cliente no posee un contrato firmado vigente. La recepción física se registra igual, pero el avance a proceso o facturación queda bloqueado por la política contractual." };
  return { mostrar: false, tono: "neutral", titulo: ec.estado_display || "—", texto: "" };
}

// QC por lote: resuelve el estado de QC de cada lote (propio → fallback header legacy).
// Espejo de proc_fn_lote_elegible para la presentación; el gate real es el backend.
export function qcPorLote(lotes = [], qcRows = []) {
  const header = (qcRows || []).find((q) => !q.lote_id) || null;
  return (lotes || []).map((l) => {
    const propio = (qcRows || []).find((q) => q.lote_id === l.id) || null;
    const q = propio || header;
    return {
      id: l.id,
      lote: l,
      resultado: q ? q.resultado : null,
      esHeader: !propio && !!header,   // aplicado por fallback del QC de recepción
      tieneQc: !!q,
      valores: q ? (q.valores || {}) : {},
    };
  });
}

// Resumen QC de una recepción para PRESENTACIÓN (los estados de lote son autoridad).
// No inventa un veredicto global: entrega conteos + flag de mezcla.
export function resumenQcRecepcion(lotes = [], qcRows = []) {
  const porLote = qcPorLote(lotes, qcRows);
  const aprobados = porLote.filter((x) => x.resultado === "aprobado").length;
  const rechazados = porLote.filter((x) => x.resultado === "rechazado").length;
  const condicional = porLote.filter((x) => x.resultado === "condicional").length;
  const pendientes = porLote.filter((x) => !x.tieneQc).length;
  const conResultado = new Set(porLote.filter((x) => x.resultado).map((x) => x.resultado));
  return {
    total: porLote.length, aprobados, rechazados, condicional, pendientes,
    mixto: conResultado.size > 1,   // hay QC distinto entre lotes → granularidad visible
  };
}

// ── Filtros: lógica pura de chips activos / reset (usada por ProcFilters) ────
// Un filtro está "activo" si su valor no es vacío/"todos". Certifica que:
// combinaciones son acumulativas (todos los activos cuentan), reset limpia todo,
// y no quedan chips fantasma. Testeable sin navegador.
export function filtrosActivos(filtros = [], busqueda = "") {
  const activos = (filtros || []).filter((f) => f && f.valor != null && f.valor !== "" && f.valor !== "todos");
  const hay = activos.length > 0 || (busqueda != null && busqueda !== "");
  return { activos, hay, conteo: activos.length + (busqueda ? 1 : 0) };
}

// ── Filtros operacionales del shell ─────────────────────────────────────────
export function validarFiltros({ empresa, planta, temporada, fecha } = {}) {
  const errores = [];
  if (!empresa) errores.push("Falta seleccionar empresa (tenant).");
  if (fecha && Number.isNaN(new Date(fecha).getTime())) errores.push("Fecha operacional inválida.");
  return { ok: errores.length === 0, errores };
}

// ── Sub-vistas por params: título/subtítulo y resaltado de menú (genéricos) ───
// Preparación / Despachos / Historial comparten la página `despachos` y se distinguen
// por `filtroEstado`. El título/subtítulo se derivan de ese param (no se duplica página).
export function vistaDespachos(filtroEstado) {
  if (filtroEstado === "listo")
    return { titulo: "Preparación de despachos", subtitulo: "Cargas listas para preparar y confirmar la salida" };
  if (filtroEstado === "despachado")
    return { titulo: "Historial de despachos", subtitulo: "Salidas confirmadas (despachos completados)" };
  return { titulo: "Despachos", subtitulo: "Salida física de producto (no es venta/exportación)" };
}

// Resolver genérico del ítem de menú activo. Varias entradas del nav comparten `page`
// (QC→recepciones, Ejecución/Resultados/Conciliaciones→ordenes, Preparación/Despachos/Historial
// →despachos) y sólo se distinguen por `params`. Este resolver:
//   1) mapea la vista actual a su "page base" (para páginas de detalle) vía `mapaPage`;
//   2) si varias entradas comparten esa page, desempata por coincidencia de `params`;
//   3) si ninguna matchea, cae en la entrada "plana" (sin params) de esa page.
// Preserva el comportamiento previo cuando no hay hermanos que compartan page.
export function resolverItemActivo(vista = {}, items = [], mapaPage = {}) {
  const base = mapaPage[vista.page] || vista.page;
  const params = vista.params || {};
  const hermanos = (items || []).filter((i) => (i.page || i.id) === base);
  if (hermanos.length > 1) {
    const match = hermanos.find((i) => i.params && Object.keys(i.params).length &&
      Object.entries(i.params).every(([k, v]) => params[k] === v));
    if (match) return match.id;
    const plano = hermanos.find((i) => !i.params || !Object.keys(i.params).length);
    if (plano) return plano.id;
  }
  return base;
}

// ── Orquestación de "Confirmar salida" del despacho (testeable sin navegador) ──
// El backend es autoritativo: la salida es atómica y una segunda llamada sobre un
// despacho ya despachado es rechazada por el guard (no duplica). Este envoltorio evita
// que la UI quede stale o dispare doble-submit:
//   (1) si ya está confirmando, no ejecuta otra RPC (anti doble-submit);
//   (2) marca confirmando true antes de la RPC y false en finally;
//   (3) recarga SIEMPRE el estado autoritativo — tanto en éxito como en error —
//       para que la pantalla nunca siga mostrando "Listo" cuando el backend ya despachó.
// `alExito` limpia la carga local sólo en éxito (en error se conserva para reintento válido).
export async function orquestarConfirmarDespacho({
  yaConfirmando, lineas, rpc, recargar, notificar, setConfirmando, alExito,
} = {}) {
  if (yaConfirmando) return { ejecutado: false, motivo: "en_curso" };
  if (!lineas || lineas.length === 0) {
    if (notificar) notificar("Agregá pallets a la carga", "error");
    return { ejecutado: false, motivo: "sin_carga" };
  }
  if (setConfirmando) setConfirmando(true);
  try {
    await rpc(lineas);
    if (alExito) alExito();
    if (notificar) notificar("Salida confirmada ✓");
    if (recargar) await recargar();
    return { ejecutado: true, ok: true };
  } catch (e) {
    if (notificar) notificar(traducirError(e), "error");
    if (recargar) await recargar(); // recupera estado autoritativo aunque falle
    return { ejecutado: true, ok: false, error: e };
  } finally {
    if (setConfirmando) setConfirmando(false);
  }
}

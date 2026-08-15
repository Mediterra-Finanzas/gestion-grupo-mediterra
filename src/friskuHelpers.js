/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// friskuHelpers.js — Helpers compartidos del módulo Frisku
// Fase 2: cálculo de comisión, formateo de montos, conversión de monedas
// Las funciones de TC quedan como stubs hasta el Commit 2 (UI + API).
// ═══════════════════════════════════════════════════════════════════

// ── Persistencia genérica (Supabase calendario_data) ──
// DEV/UAT override (F7.8.1-D): si REACT_APP_SUPA_URL/KEY están seteadas (solo en
// .env.development.local local, NUNCA en prod), la app apunta a ese entorno. Sin
// esas env vars el valor es EXACTAMENTE el productivo → build de prod idéntico.
export const SUPA_URL = process.env.REACT_APP_SUPA_URL || "https://bywovqayuzodbzwsriet.supabase.co";
export const SUPA_KEY = process.env.REACT_APP_SUPA_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5d292cWF5dXpvZGJ6d3NyaWV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2ODU1MDgsImV4cCI6MjA5MTI2MTUwOH0.s2x2O_CxE6rl8dBqFuyfQdMyRqSyjJQWXJXesmVGXtk";

// FASE 4A — guardia de archivos. Cuando el interruptor está prendido, las
// operaciones de Storage piden URLs firmadas al servidor (/api/storage) en
// vez de usar la llave pública. Así funcionan aun con los buckets cerrados.
import { USE_GUARD } from "./guardClient";

// Pide al guardia una operación de Storage. Devuelve el JSON de respuesta.
async function guardStorage(op, bucket, path, expiresIn) {
  const res = await fetch("/api/storage", {
    method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op, bucket, path, expiresIn }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
  return j;
}

// Sube un File usando una URL de subida firmada por el guardia (no pasa por
// la función serverless → sin tope de tamaño).
async function guardUpload(bucket, path, file) {
  const { url } = await guardStorage("upload-url", bucket, path);
  if (!url) throw new Error("sin_url_subida");
  const up = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!up.ok) { const t = await up.text().catch(() => ""); throw new Error(`subida ${up.status} ${t.slice(0,80)}`); }
}

export async function dbLoadGeneric(id) {
  // NO atrapar el error: si la lectura falla (red/HTTP), la excepción DEBE
  // propagar para que el caller NO habilite el guardado (que sobrescribiría
  // los datos en Supabase con los defaults vacíos en memoria). Solo se
  // devuelve null cuando la fila existe pero está vacía / no existe.
  const res = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` }
  });
  if (!res.ok) throw new Error(`dbLoadGeneric ${id} HTTP ${res.status}`);
  const rows = await res.json();
  if (rows?.[0]?.value) {
    return typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
  }
  return null;
}

export async function dbSaveGeneric(id, value) {
  try {
    await fetch(`${SUPA_URL}/rest/v1/calendario_data`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json", Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify({ id, value, updated_at: new Date().toISOString() })
    });
  } catch (e) { console.error(`[Frisku:${id}] Error guardando:`, e); }
}

// ═══════════════════════════════════════════════════════════════════
// SEEDING — siembra automática de defaults en Supabase
// Si la fila no existe → graba defaults y los retorna (queda persistido
// para todos los usuarios). Si existe → respeta su contenido actual
// (incluso si el usuario lo dejó vacío deliberadamente).
// ═══════════════════════════════════════════════════════════════════
export async function loadConSeed(id, defaults) {
  // En error de red NO atrapamos para devolver defaults: eso, combinado con
  // el auto-save del módulo, sembraba los defaults ENCIMA de los datos reales
  // en Supabase ante un parpadeo de conexión. Ahora la excepción propaga y el
  // caller deja el guardado deshabilitado esa sesión.
  const res = await fetch(
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`,
    { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } }
  );
  if (!res.ok) throw new Error(`loadConSeed ${id} HTTP ${res.status}`);
  const rows = await res.json();
  if (Array.isArray(rows) && rows.length > 0) {
    // Fila existe: retornar lo que tenga (incluido array vacío)
    const v = rows[0].value;
    return typeof v === "string" ? JSON.parse(v) : v;
  }
  // Fila NO existe (lectura OK, sin filas): sembrar defaults y retornarlos
  await dbSaveGeneric(id, defaults);
  console.log(`[Seed:${id}] Sembrado con ${Array.isArray(defaults) ? defaults.length : "?"} items`);
  return defaults;
}

// ═══════════════════════════════════════════════════════════════════
// COMISIÓN FRISKU
// Modelo: base = venta en destino − gastos en destino (base neta).
// El cliente cobra X% sobre esa base neta; Frisku recibe Y% de ese X%.
// Ejemplo Disney: cliente 8% × Frisku 25% → Frisku recibe 2% de la base neta.
// ═══════════════════════════════════════════════════════════════════

// Resuelve los porcentajes aplicables para un cliente+especie+formato.
// Busca primero override por (especieCodigo + formatoCodigo); luego por
// especieCodigo solo; al final cae al global del cliente.
export function resolverPorcentajesComision(cliente, especieCodigo, formatoCodigo) {
  const overrides = cliente?.comisionOverrides || {};
  const keyEsp = especieCodigo || "";
  const keyEspFmt = `${especieCodigo || ""}::${formatoCodigo || ""}`;

  let cliPct = null, friPct = null;
  if (overrides[keyEspFmt]) {
    cliPct = overrides[keyEspFmt].cliente;
    friPct = overrides[keyEspFmt].frisku;
  } else if (overrides[keyEsp]) {
    cliPct = overrides[keyEsp].cliente;
    friPct = overrides[keyEsp].frisku;
  }
  if (cliPct == null) cliPct = cliente?.comisionGlobalSobreFOB ?? 0;
  if (friPct == null) friPct = cliente?.comisionFriskuSobreClienteGlobal ?? 0;
  return { cliPct: Number(cliPct) || 0, friPct: Number(friPct) || 0 };
}

// Calcula los montos sobre la base neta (venta destino − gastos destino).
// Retorna { cliPct%, friPct%, friSobreBaseNeta%,
//           montoComisionCliente, montoComisionFrisku, baseNeta }
export function calcularComisionFrisku(cliente, especieCodigo, formatoCodigo, baseNeta) {
  const { cliPct, friPct } = resolverPorcentajesComision(cliente, especieCodigo, formatoCodigo);
  const base = Number(baseNeta) || 0;
  const friSobreBaseNeta = (cliPct * friPct) / 100;              // ej. 8 × 25 / 100 = 2
  const montoComisionCliente = (base * cliPct) / 100;
  const montoComisionFrisku  = (base * friSobreBaseNeta) / 100;  // == montoCliente × friPct/100
  return {
    cliPct, friPct, friSobreBaseNeta,
    montoComisionCliente, montoComisionFrisku, baseNeta: base,
  };
}

// ═══════════════════════════════════════════════════════════════════
// FORMATEO DE MONTOS Y NÚMEROS
// ═══════════════════════════════════════════════════════════════════

// Formatea un número como dinero según la moneda dada.
// monedasMap es opcional; si se entrega, se usa el símbolo del maestro.
export function formatearMonto(monto, monedaCodigo = "USD", monedasMap = null, decimales = 2) {
  if (monto == null || isNaN(monto)) return "—";
  const n = Number(monto);
  const simbolo = monedasMap?.[monedaCodigo]?.simbolo || monedaCodigo;
  const formato = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
  return `${simbolo} ${formato.format(n)}`;
}

// Parsea un string en formato es-CL ("1.234,56") a número
export function parsearMonto(s) {
  if (s == null) return 0;
  if (typeof s === "number") return s;
  const limpio = String(s).replace(/\./g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
  const n = parseFloat(limpio);
  return isNaN(n) ? 0 : n;
}

// ═══════════════════════════════════════════════════════════════════
// TIPO DE CAMBIO — stubs (UI y API se agregan en Commit 2)
// Estructura esperada de tcData (id "maestro_tc"):
//   { "USD-CLP": [{ fecha:"2026-05-19", valor:950, fuente:"mindicador" }, ...],
//     "USD-EUR": [...], ... }
// Convención: par "ORIGEN-DESTINO" significa "1 ORIGEN = X DESTINO".
// ═══════════════════════════════════════════════════════════════════

// Busca el TC más cercano con fecha <= fechaPedida.
// Si no hay datos, retorna null.
// Si origen === destino, retorna 1.
// Si solo existe el par inverso (DESTINO-ORIGEN), retorna 1/valor.
export function buscarTC(monedaOrigen, monedaDestino, fecha, tcData) {
  if (!monedaOrigen || !monedaDestino) return null;
  if (monedaOrigen === monedaDestino) return 1;
  if (!tcData || typeof tcData !== "object") return null;

  const parDirecto = `${monedaOrigen}-${monedaDestino}`;
  const parInverso = `${monedaDestino}-${monedaOrigen}`;
  const fechaPedida = fecha || new Date().toISOString().slice(0, 10);

  const buscarEnSerie = (serie) => {
    if (!Array.isArray(serie) || !serie.length) return null;
    const validos = serie.filter(p => p.fecha && p.fecha <= fechaPedida && p.valor != null);
    if (!validos.length) return null;
    validos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    return Number(validos[0].valor);
  };

  const directo = buscarEnSerie(tcData[parDirecto]);
  if (directo != null && directo !== 0) return directo;

  const inverso = buscarEnSerie(tcData[parInverso]);
  if (inverso != null && inverso !== 0) return 1 / inverso;

  return null;
}

// Convierte un monto entre monedas. Si no hay TC, retorna null
// (la UI debe decidir cómo mostrar el faltante).
export function convertirMonto(monto, monedaOrigen, monedaDestino, fecha, tcData) {
  const tc = buscarTC(monedaOrigen, monedaDestino, fecha, tcData);
  if (tc == null) return null;
  return (Number(monto) || 0) * tc;
}

// ═══════════════════════════════════════════════════════════════════
// ACTUALIZACIÓN AUTOMÁTICA DE TC — APIs públicas con CORS abierto
// mindicador.cl     → USD/EUR/UF/UTM contra CLP (Banco Central Chile)
// api.frankfurter.app → cross-rates global (Banco Central Europeo)
// ═══════════════════════════════════════════════════════════════════

// Pares por defecto que se actualizan al pedir "TC hoy".
// Convención par "ORIGEN-DESTINO" → 1 ORIGEN = X DESTINO.
export const TC_PARES_DEFAULT = [
  "USD-CLP", "USD-PEN", "USD-EUR", "USD-GBP", "USD-CNY",
  "USD-BRL", "USD-MXN", "USD-AUD", "USD-CAD", "USD-JPY",
  "EUR-CLP", "EUR-USD",
];

// Helper: fecha YYYY-MM-DD
export function fechaISO(d = new Date()) {
  return new Date(d).toISOString().slice(0, 10);
}

// Helper: deriva (origen, destino) de un par "USD-CLP"
function partesPar(par) {
  const [origen, destino] = String(par).split("-");
  return { origen, destino };
}

// Merge inteligente: las entradas con fuente "manual" se conservan
// si ya existen para esa fecha (no las pisa la API).
// Retorna nueva serie ordenada por fecha desc.
export function mergeTCSerie(serieExistente, nuevasEntradas) {
  const existentes = Array.isArray(serieExistente) ? [...serieExistente] : [];
  const porFecha = new Map();
  existentes.forEach(e => { if (e?.fecha) porFecha.set(e.fecha, e); });
  (nuevasEntradas || []).forEach(nueva => {
    if (!nueva?.fecha || nueva.valor == null) return;
    const existente = porFecha.get(nueva.fecha);
    if (existente && existente.fuente === "manual") return; // respetar manual
    porFecha.set(nueva.fecha, { ...nueva });
  });
  return Array.from(porFecha.values()).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

// ── mindicador.cl ────────────────────────────────────────────
// Endpoint: https://mindicador.cl/api/dolar/2026-05-19 → {serie:[{fecha,valor}]}
// La API devuelve para la fecha pedida + algunos días anteriores.
async function fetchMindicadorSerie(indicador, fechaDDMMYYYY) {
  // mindicador acepta tanto YYYY-MM-DD como DD-MM-YYYY; usamos DD-MM-YYYY para ser explícitos
  const url = `https://mindicador.cl/api/${indicador}/${fechaDDMMYYYY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mindicador.cl ${indicador} HTTP ${res.status}`);
  const data = await res.json();
  return (data.serie || []).map(s => ({
    fecha: s.fecha.slice(0, 10),
    valor: Number(s.valor),
    fuente: "mindicador",
  }));
}

// Actualiza pares ?-CLP usando mindicador. Solo soporta USD, EUR contra CLP.
export async function actualizarTCMindicador(fecha = null) {
  const f = fecha || fechaISO();
  const [yyyy, mm, dd] = f.split("-");
  const ddmmyyyy = `${dd}-${mm}-${yyyy}`;
  const updates = {}; // { "USD-CLP": [entradas], ... }
  try {
    const dolar = await fetchMindicadorSerie("dolar", ddmmyyyy);
    if (dolar.length) updates["USD-CLP"] = dolar;
  } catch (e) { console.warn("[TC mindicador USD]", e.message); }
  try {
    const euro = await fetchMindicadorSerie("euro", ddmmyyyy);
    if (euro.length) updates["EUR-CLP"] = euro;
  } catch (e) { console.warn("[TC mindicador EUR]", e.message); }
  return updates;
}

// ── frankfurter.app ─────────────────────────────────────────
// Endpoint: https://api.frankfurter.app/2026-05-19?from=USD&to=CLP,EUR,PEN
// O https://api.frankfurter.app/latest?from=USD&to=...
// Soporta gran parte de monedas; algunas exóticas (PEN p.ej.) no están.
// Si una moneda no está, frankfurter la omite silenciosamente.
async function fetchFrankfurter(fecha, origen, destinos) {
  const path = fecha === fechaISO() ? "latest" : fecha;
  const url = `https://api.frankfurter.app/${path}?from=${origen}&to=${destinos.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`frankfurter.app HTTP ${res.status}`);
  const data = await res.json();
  const fechaUsada = data.date || fecha;
  const rates = data.rates || {};
  const out = {};
  Object.keys(rates).forEach(destino => {
    const par = `${origen}-${destino}`;
    out[par] = [{ fecha: fechaUsada, valor: Number(rates[destino]), fuente: "frankfurter" }];
  });
  return out;
}

// Actualiza pares vía frankfurter para los pares pedidos.
// Agrupa por moneda origen para minimizar llamadas.
export async function actualizarTCFrankfurter(pares, fecha = null) {
  const f = fecha || fechaISO();
  const porOrigen = {};
  pares.forEach(p => {
    const { origen, destino } = partesPar(p);
    if (!origen || !destino || origen === destino) return;
    porOrigen[origen] = porOrigen[origen] || new Set();
    porOrigen[origen].add(destino);
  });
  const updates = {};
  for (const origen of Object.keys(porOrigen)) {
    const destinos = Array.from(porOrigen[origen]);
    try {
      const parcial = await fetchFrankfurter(f, origen, destinos);
      Object.assign(updates, parcial);
    } catch (e) { console.warn(`[TC frankfurter ${origen}]`, e.message); }
  }
  return updates;
}

// Orquestador: para una fecha dada, llama mindicador (CLP) y frankfurter (resto)
// y retorna un objeto { "USD-CLP": [...], "USD-EUR": [...], ... } listo para mergear.
export async function actualizarTCDesdeAPIs(pares = TC_PARES_DEFAULT, fecha = null) {
  const f = fecha || fechaISO();
  // Separar pares: los que terminan en CLP los manda mindicador (es más oficial para Chile)
  const paresClp = pares.filter(p => p.endsWith("-CLP"));
  const paresOtros = pares.filter(p => !p.endsWith("-CLP"));

  const [updMindicador, updFrankfurter] = await Promise.all([
    paresClp.length ? actualizarTCMindicador(f) : Promise.resolve({}),
    paresOtros.length ? actualizarTCFrankfurter(paresOtros, f) : Promise.resolve({}),
  ]);

  // Frankfurter como fallback para pares CLP que mindicador no haya devuelto
  const faltantesClp = paresClp.filter(p => !updMindicador[p]);
  if (faltantesClp.length) {
    try {
      const fallback = await actualizarTCFrankfurter(faltantesClp, f);
      Object.assign(updMindicador, fallback);
    } catch (e) { console.warn("[TC fallback frankfurter]", e.message); }
  }

  return { ...updMindicador, ...updFrankfurter };
}

// Aplica un objeto de updates sobre tcData existente (immutable).
export function aplicarUpdatesATCData(tcData, updates) {
  const base = (tcData && typeof tcData === "object") ? { ...tcData } : {};
  Object.keys(updates || {}).forEach(par => {
    base[par] = mergeTCSerie(base[par], updates[par]);
  });
  return base;
}

// ═══════════════════════════════════════════════════════════════════
// SUPABASE STORAGE — Fase 3
// Bucket: frisku-docs (público, sin RLS por ahora — mismo criterio
// que el resto del proyecto hasta que se implemente RLS global)
// ═══════════════════════════════════════════════════════════════════

const STORAGE_BUCKET = "frisku-docs";
const STORAGE_BASE   = `${SUPA_URL}/storage/v1`;

// Crea el bucket si no existe. Idempotente: 409 "already exists" no es error.
export async function ensureBucketFrisku() {
  try {
    const res = await fetch(`${STORAGE_BASE}/bucket`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id: STORAGE_BUCKET, name: STORAGE_BUCKET, public: true }),
    });
    if (res.ok || res.status === 409) return true;
    const err = await res.json().catch(() => ({}));
    console.warn("[Storage] No se pudo crear bucket:", err.message || res.status);
    return false;
  } catch (e) {
    console.warn("[Storage] Error creando bucket:", e.message);
    return false;
  }
}

// Sube un File al bucket frisku-docs bajo la ruta dada.
// Retorna la URL pública si tuvo éxito, o null si falló.
// path: e.g. "clientes/abc123/doc456/contrato.pdf"
export async function uploadArchivoFrisku(file, path) {
  uploadArchivoFrisku.lastError = null;
  if (USE_GUARD) {
    try {
      await guardUpload(STORAGE_BUCKET, path, file);
      return `${STORAGE_BASE}/object/public/${STORAGE_BUCKET}/${path}`;
    } catch (e) {
      uploadArchivoFrisku.lastError = e.message || String(e);
      console.error("[Storage] guard upload falló:", uploadArchivoFrisku.lastError);
      return null;
    }
  }
  try {
    await ensureBucketFrisku();
    const res = await fetch(`${STORAGE_BASE}/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error || `HTTP ${res.status}`;
      uploadArchivoFrisku.lastError = msg;
      console.error("[Storage] Upload falló:", msg);
      return null;
    }
    return `${STORAGE_BASE}/object/public/${STORAGE_BUCKET}/${path}`;
  } catch (e) {
    uploadArchivoFrisku.lastError = e.message || String(e);
    console.error("[Storage] Upload error:", e.message);
    return null;
  }
}

// Elimina un archivo del bucket.
export async function eliminarArchivoFrisku(path) {
  if (USE_GUARD) {
    try { await guardStorage("delete", STORAGE_BUCKET, path); }
    catch (e) { console.warn("[Storage] guard delete:", e.message); }
    return;
  }
  try {
    await fetch(`${STORAGE_BASE}/object/${STORAGE_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    });
  } catch (e) {
    console.warn("[Storage] Error eliminando archivo:", e.message);
  }
}

// Extrae el path relativo de una URL pública de Storage.
// Retorna null si la URL no es del bucket frisku-docs.
export function pathDesdeUrlStorage(url) {
  if (!url) return null;
  const prefix = `/object/public/${STORAGE_BUCKET}/`;
  const idx = url.indexOf(prefix);
  return idx !== -1 ? url.slice(idx + prefix.length) : null;
}

// ═══════════════════════════════════════════════════════════════════
// SUPABASE STORAGE — Expediente Digital de Nóminas (Fase 0)
// Bucket: nominas-docs (PRIVADO). A diferencia de frisku-docs, los
// documentos NO se sirven por URL pública: se accede vía URL firmada de
// expiración corta. En el JSON de la nómina se guarda SOLO el path.
// El bucket se crea manualmente en el dashboard (el key 'anon' no puede
// crear buckets); estas funciones no asumen que ya exista y reportan el
// error si falta o si RLS bloquea la operación.
// ═══════════════════════════════════════════════════════════════════

export const NOMINAS_BUCKET = "nominas-docs";

// Verificación idempotente/best-effort del bucket. Con key 'anon' lo normal
// es que devuelva error de permisos (el bucket se crea en el dashboard);
// 409 = ya existe. Nunca lanza: solo informa true/false.
export async function ensureBucketNominas() {
  try {
    const res = await fetch(`${STORAGE_BASE}/bucket`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: NOMINAS_BUCKET, name: NOMINAS_BUCKET, public: false }),
    });
    return res.ok || res.status === 409;
  } catch {
    return false;
  }
}

// Sube un File al bucket PRIVADO nominas-docs.
// Devuelve { ok, path, error }. NO retorna URL pública (el bucket es privado);
// para mostrar el documento usar urlFirmadaNomina(path) bajo demanda.
// path sugerido: `nominas/{empresaSlug}/{nominaId}/{itemId}/{archivo}`
export async function uploadDocNomina(file, path) {
  uploadDocNomina.lastError = null;
  if (USE_GUARD) {
    try {
      await guardUpload(NOMINAS_BUCKET, path, file);
      return { ok: true, path, error: null };
    } catch (e) {
      uploadDocNomina.lastError = e.message || String(e);
      console.error("[Storage/nominas] guard upload:", uploadDocNomina.lastError);
      return { ok: false, path: null, error: uploadDocNomina.lastError };
    }
  }
  try {
    const res = await fetch(`${STORAGE_BASE}/object/${NOMINAS_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
      },
      body: file,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error || `HTTP ${res.status}`;
      uploadDocNomina.lastError = msg;
      console.error("[Storage/nominas] Upload falló:", msg);
      return { ok: false, path: null, error: msg };
    }
    return { ok: true, path, error: null };
  } catch (e) {
    uploadDocNomina.lastError = e.message || String(e);
    console.error("[Storage/nominas] Upload error:", e.message);
    return { ok: false, path: null, error: uploadDocNomina.lastError };
  }
}

// Genera una URL firmada (temporal) para ver/descargar un documento privado.
// ttlSegundos: validez (default 1h). Devuelve la URL absoluta o null.
// La URL NO debe persistirse: expira. Se genera bajo demanda al abrir el doc.
export async function urlFirmadaNomina(path, ttlSegundos = 3600) {
  urlFirmadaNomina.lastError = null;
  if (USE_GUARD) {
    try {
      const { url } = await guardStorage("sign", NOMINAS_BUCKET, path, ttlSegundos);
      return url || null;
    } catch (e) {
      urlFirmadaNomina.lastError = e.message || String(e);
      console.error("[Storage/nominas] guard sign:", urlFirmadaNomina.lastError);
      return null;
    }
  }
  try {
    const res = await fetch(`${STORAGE_BASE}/object/sign/${NOMINAS_BUCKET}/${path}`, {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: ttlSegundos }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.message || err.error || `HTTP ${res.status}`;
      urlFirmadaNomina.lastError = msg;
      console.error("[Storage/nominas] Firma falló:", msg);
      return null;
    }
    const data = await res.json();
    // Supabase responde { signedURL: "/object/sign/bucket/path?token=..." }
    const rel = data.signedURL || data.signedUrl;
    if (!rel) { urlFirmadaNomina.lastError = "Respuesta sin signedURL"; return null; }
    return rel.startsWith("http") ? rel : `${STORAGE_BASE}${rel}`;
  } catch (e) {
    urlFirmadaNomina.lastError = e.message || String(e);
    console.error("[Storage/nominas] Firma error:", e.message);
    return null;
  }
}

// URL pública directa al bucket privado. DEBE fallar (400/403) si el bucket
// está bien configurado como privado. Solo se usa en el auto-test de
// privacidad de Fase 0 — no usar en el flujo normal.
export function urlPublicaDirectaNominaTest(path) {
  return `${STORAGE_BASE}/object/public/${NOMINAS_BUCKET}/${path}`;
}

/* eslint-disable */
// ════════════════════════════════════════════════════════════════════════════
// friskuComexVinculo.js — Lógica PURA de vinculación de referencias SharePoint a
// requisitos de la Carpeta COMEX (Frisku). Sin red, sin React, sin Storage.
//
// SOLO metadatos de referencia: driveId, itemId, nombre, webUrl, origen, fecha, usuario.
// NUNCA descarga, copia ni sube el archivo. SharePoint permanece 100% read-only: estas
// funciones sólo transforman el modelo local del embarque (oe.carpetaComex). No mutan la
// entrada (devuelven una copia nueva). Registran historial de vínculo/desvínculo.
// ════════════════════════════════════════════════════════════════════════════

const hoyISO = () => new Date().toISOString().slice(0, 10);

// SharePoint AUTORIZADO de Grupo Mediterra / Frisku. Solo se aceptan enlaces https del
// host y sitio Frisku; cualquier otra URL (http, otro dominio, otro sitio, vacía) se rechaza.
const SP_HOST = "grupomediterra.sharepoint.com";
const SP_SITE_PREFIJO = "/sites/friskufoodsspa/";   // se compara en minúsculas (host/site case-insensitive)
export function esWebUrlSharePointFrisku(u) {
  try {
    const url = new URL(String(u));
    if (url.protocol !== "https:") return false;
    if (url.hostname.toLowerCase() !== SP_HOST) return false;
    if (!url.pathname.toLowerCase().startsWith(SP_SITE_PREFIJO)) return false;
    return true;
  } catch (e) { return false; }
}
const esHttp = (u) => /^https?:\/\//i.test(String(u || ""));
// Un requisito con archivo SUBIDO a Storage (no un vínculo SharePoint) NO es reemplazable por
// vínculo: reemplazarlo dejaría el archivo huérfano en Storage. Se bloquea (ver aplicarVinculoComex).
export function esArchivoStorage(doc) {
  return !!doc && doc.fuente === "storage" && esHttp(doc.url) && !doc.spRef;
}

// Requisitos COMEX del embarque para el selector del buscador.
// tieneRef = ya tiene una referencia (SharePoint/URL/archivo) → exige 2ª confirmación.
// bloqueadoStorage = tiene un archivo subido a Storage → NO reemplazable por vínculo (huérfano).
export function requisitosDeComex(cx) {
  const docs = cx && Array.isArray(cx.docs) ? cx.docs : [];
  return docs.map((d) => ({
    docId: d.id,
    tipo: d.tipo,
    tieneRef: !!d.spRef || (typeof d.url === "string" && d.url.trim() !== ""),
    bloqueadoStorage: esArchivoStorage(d),
  }));
}

// ¿El requisito tiene una referencia SharePoint vinculada? (para ofrecer Desvincular)
export function esVinculoSharePoint(doc) {
  return !!(doc && doc.spRef && doc.fuente === "sharepoint");
}

// Aplica un vínculo SharePoint a un requisito (docId). Guarda SÓLO metadatos de referencia.
// No muta cx. Devuelve { ok:true, cx } | { ok:false, motivo }.
export function aplicarVinculoComex(cx, docId, ref, meta = {}) {
  if (!cx || !Array.isArray(cx.docs)) return { ok: false, motivo: "sin_carpeta" };
  const idx = cx.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return { ok: false, motivo: "requisito_inexistente" };
  const r = ref || {};
  if (!r.driveId || !r.itemId) return { ok: false, motivo: "ref_invalida" };
  // Fail-closed: solo enlaces https del SharePoint autorizado Frisku (nunca URLs arbitrarias).
  if (!esWebUrlSharePointFrisku(r.webUrl)) return { ok: false, motivo: "weburl_invalida" };
  // No reemplazar un archivo subido a Storage (quedaría huérfano): solo vínculos SP o requisitos
  // sin archivo. La infraestructura de Storage no se toca; se bloquea el reemplazo por ahora.
  if (esArchivoStorage(cx.docs[idx])) return { ok: false, motivo: "reemplazo_storage_bloqueado" };
  const fecha = meta.fecha || hoyISO();
  const usuario = meta.usuario || "";
  const spRef = {
    driveId: String(r.driveId),
    itemId: String(r.itemId),
    nombre: r.nombre != null ? String(r.nombre) : "",
    webUrl: r.webUrl != null ? String(r.webUrl) : "",
    origen: "sharepoint",
    fecha,
    usuario,
  };
  const prev = cx.docs[idx];
  const docActualizado = {
    ...prev,
    nombre: spRef.nombre || prev.nombre || "",
    url: spRef.webUrl,             // habilita "Abrir" y cuenta en el semáforo si es http(s)
    fuente: "sharepoint",
    fechaCarga: fecha,
    estado: "cargado",
    spRef,
  };
  const docs = cx.docs.map((d, i) => (i === idx ? docActualizado : d));
  const historial = [
    ...(Array.isArray(cx.historial) ? cx.historial : []),
    { ts: Date.now(), fecha, usuario, accion: "vincular", docId, tipo: prev.tipo, itemId: spRef.itemId, driveId: spRef.driveId, nombre: spRef.nombre },
  ];
  return { ok: true, cx: { ...cx, docs, historial } };
}

// Desvincula la referencia SharePoint de un requisito SIN borrar nada en SharePoint ni el
// requisito. Sólo limpia la referencia local. No muta cx. { ok:true, cx } | { ok:false, motivo }.
export function quitarVinculoComex(cx, docId, meta = {}) {
  if (!cx || !Array.isArray(cx.docs)) return { ok: false, motivo: "sin_carpeta" };
  const idx = cx.docs.findIndex((d) => d.id === docId);
  if (idx < 0) return { ok: false, motivo: "requisito_inexistente" };
  const prev = cx.docs[idx];
  if (!esVinculoSharePoint(prev)) return { ok: false, motivo: "sin_vinculo" };
  const fecha = meta.fecha || hoyISO();
  const usuario = meta.usuario || "";
  const { spRef, ...sinSp } = prev;
  const docActualizado = { ...sinSp, nombre: "", url: "", fuente: "manual", estado: "pendiente", fechaCarga: "" };
  const docs = cx.docs.map((d, i) => (i === idx ? docActualizado : d));
  const historial = [
    ...(Array.isArray(cx.historial) ? cx.historial : []),
    { ts: Date.now(), fecha, usuario, accion: "desvincular", docId, tipo: prev.tipo, itemId: spRef.itemId, driveId: spRef.driveId, nombre: spRef.nombre },
  ];
  return { ok: true, cx: { ...cx, docs, historial } };
}

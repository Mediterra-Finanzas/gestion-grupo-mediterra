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

// Requisitos COMEX del embarque para el selector del buscador.
// tieneRef = el requisito ya tiene una referencia (SharePoint o archivo/URL) → exige 2ª confirmación.
export function requisitosDeComex(cx) {
  const docs = cx && Array.isArray(cx.docs) ? cx.docs : [];
  return docs.map((d) => ({
    docId: d.id,
    tipo: d.tipo,
    tieneRef: !!d.spRef || (typeof d.url === "string" && d.url.trim() !== ""),
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

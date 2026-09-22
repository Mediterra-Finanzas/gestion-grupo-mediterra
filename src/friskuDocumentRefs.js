/* eslint-disable */
// ════════════════════════════════════════════════════════════════════════════
// friskuDocumentRefs.js — Clasificación PURA de referencias documentales Frisku (S1).
// Sin red, sin estado, sin persistencia. NO muta el input. NO fabrica webUrl/tenant/
// site/driveId/itemId. NO convierte una carpeta en documento. Distingue una referencia
// legacy de SharePoint SINCRONIZADO (OneDrive) de otras clases, para dejar de mostrar
// "Requiere recarga" en algo que en realidad está online.
//
// Identidad futura de un documento SharePoint = driveId+itemId (NO carpeta/nombre/ruta).
// Este módulo NO resuelve esa identidad; solo reconoce y describe la referencia local.
// ════════════════════════════════════════════════════════════════════════════

// Allowlist EXACTA de bibliotecas reconocidas (no heurística amplia como "* - Documentos").
export const SP_LIBRARIES = ["Frisku Foods SpA - Documentos"];

function decode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
function esHttp(u) { return /^https?:\/\//i.test(u); }
function esSupabaseStorage(u) { return esHttp(u) && /\/storage\/v1\/object\//i.test(u); }

// Normaliza: quita esquema file://, decodifica %20/UTF-8, unifica separadores, corta en segmentos.
function partes(rawUrl) {
  let u = String(rawUrl == null ? "" : rawUrl).trim();
  let scheme = "";
  if (/^file:\/\//i.test(u)) { scheme = "file"; u = u.replace(/^file:\/+/i, ""); } // file:///C:/… → C:/…
  u = decode(u).replace(/\\/g, "/");                 // \ → /
  const segments = u.split("/").filter(Boolean);
  return { scheme, segments, decoded: u };
}

// Índice del segmento que ES EXACTAMENTE una biblioteca de la allowlist (case-insensitive).
function idxBiblioteca(segments) {
  const low = SP_LIBRARIES.map((x) => x.toLowerCase());
  for (let i = 0; i < segments.length; i++) {
    if (low.indexOf(segments[i].toLowerCase()) !== -1) return i;
  }
  return -1;
}

function pareceRutaLocal(scheme, decoded) {
  return scheme === "file" || /^[a-zA-Z]:\//.test(decoded) || /^\/\//.test(decoded);
}

// Tokens best-effort desde la ruta relativa. NO es plantilla universal: pistas + confianza.
function extraerTokens(rel) {
  const t = {};
  const joined = rel.join("/");
  const mTemp = joined.match(/COMEX[_\- ]?(\d{4})[_\- ](\d{4})/i);
  if (mTemp) t.temporada = { valor: `${mTemp[1]}-${mTemp[2]}`, confianza: "alta" };
  const mCont = joined.match(/(?<![A-Za-z0-9])([A-Z]{4}\d{7})(?![A-Za-z0-9])/); // contenedor ISO (4 letras + 7 dígitos)
  if (mCont) t.contenedorOE = { valor: mCont[1], confianza: "alta" };
  for (let i = 0; i < rel.length - 1; i++) {
    if (/clientes?$/i.test(rel[i]) && !t.cliente) t.cliente = { valor: rel[i + 1], confianza: "media" };
    if (/exportadoras?$/i.test(rel[i]) && !t.exportador) t.exportador = { valor: rel[i + 1], confianza: "media" };
  }
  if (rel.length >= 2) t.especie = { valor: rel[rel.length - 2], confianza: "baja" }; // heurística débil
  return t;
}

/**
 * Clasifica una referencia documental. Función PURA (no muta, no persiste).
 * clase ∈ sharepoint_synced_pending | supabase_storage | http_external | local_real | pending | unknown
 * Para sharepoint_synced_pending devuelve rutaRelativa/Display (SIN username), nombre/ext y tokens.
 * NUNCA incluye el username de Windows ni fabrica webUrl/driveId/itemId.
 */
export function clasificarReferenciaDoc(rawUrl) {
  const raw = rawUrl == null ? "" : String(rawUrl);
  if (!raw.trim()) return { clase: "pending", provider: "pending" };
  if (esHttp(raw)) {
    return esSupabaseStorage(raw)
      ? { clase: "supabase_storage", provider: "supabase" }
      : { clase: "http_external", provider: "http" };
  }
  const { scheme, segments, decoded } = partes(raw);
  const bi = idxBiblioteca(segments);
  if (bi !== -1) {
    const rel = segments.slice(bi + 1);                        // portable, SIN username
    const last = rel.length ? rel[rel.length - 1] : "";
    const hasExt = /\.[a-z0-9]{1,6}$/i.test(last);
    const nombre = hasExt ? last : "";                          // el ejemplo puede ser CARPETA (sin archivo)
    const ext = hasExt ? (last.match(/\.([a-z0-9]{1,6})$/i) || [])[1].toLowerCase() : "";
    return {
      clase: "sharepoint_synced_pending",
      provider: "sharepoint",
      biblioteca: segments[bi],
      rutaRelativa: rel,
      rutaRelativaDisplay: rel.join(" / "),
      esCarpeta: !hasExt,
      nombre,
      ext,
      tokens: extraerTokens(rel),
    };
  }
  if (pareceRutaLocal(scheme, decoded)) return { clase: "local_real", provider: "local" };
  return { clase: "unknown", provider: "unknown" };             // patrón no reconocido → revisión
}

// Hash de diagnóstico EN MEMORIA (S1–S2 NO lo persisten). No revela la ruta ni el usuario.
export function hashRutaLegacy(rawUrl) {
  const s = String(rawUrl == null ? "" : rawUrl);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return "lp_" + h.toString(16);
}

// Azúcar para la UI: ¿esta referencia es una SharePoint sincronizada pendiente de vincular?
export function esSharePointPendiente(rawUrl) {
  return clasificarReferenciaDoc(rawUrl).clase === "sharepoint_synced_pending";
}

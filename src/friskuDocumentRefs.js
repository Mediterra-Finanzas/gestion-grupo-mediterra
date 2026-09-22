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

// ── S2.2: decisión de aplicación de un borrador de campo manual ──
// El input de reemplazo manual mantiene un BORRADOR local que representa una NUEVA
// referencia; SOLO se aplica al documento (doc.url) cuando es un enlace válido http(s).
// Cualquier otra cosa —ruta parcial (C, C:\, C:\Users…), ruta local real o ruta SharePoint
// sincronizada— NO se aplica: así ningún valor intermedio ni una ruta local llega al modelo
// por el solo hecho de teclear. El VACÍO tampoco se aplica: un borrador vacío significa
// "no se ingresó reemplazo", no "borrar la referencia existente"; la eliminación es una
// acción explícita aparte (botón ✕), nunca un efecto de vaciar el campo transitorio.
// Función PURA (no muta, no persiste). Devuelve { aplicar, valorAplicado?, aviso }.
//   aviso ∈ null | "sharepoint" | "local"
export function decidirAplicacionRef(valor) {
  const v = valor == null ? "" : String(valor);
  if (v.trim() === "") return { aplicar: false, aviso: null }; // vacío = sin reemplazo; NO borra lo existente
  if (/^https?:\/\/\S+/i.test(v)) return { aplicar: true, valorAplicado: v, aviso: null }; // http(s) con host → válido
  if (/^https?:\/\//i.test(v)) return { aplicar: false, aviso: null }; // "http://" aún incompleto: se sigue tecleando
  const clase = clasificarReferenciaDoc(v).clase;
  if (clase === "sharepoint_synced_pending") return { aplicar: false, aviso: "sharepoint" };
  return { aplicar: false, aviso: "local" }; // local_real / parcial / unknown → NO se aplica
}

// ── Conservación de referencias documentales legacy (Hallazgo 1) ──
// ¿La referencia de un documento tiene CONTENIDO que hay que conservar? Un enlace subido
// (http/Supabase) o CUALQUIER referencia no vacía —ruta legacy file://, SharePoint
// sincronizado, o desconocida pendiente de revisión— representa un documento real y se
// conserva. Solo un string vacío/espacios es un placeholder sin contenido. PURA.
export function refTieneContenido(rawUrl) {
  return String(rawUrl == null ? "" : rawUrl).trim() !== "";
}

// Filtra la colección de docs COMEX al abrir el panel SIN descartar ninguna referencia real.
// Un documento de tipo "deprecado" (que ya no tiene slot propio) se descarta SOLO si es un
// placeholder verdaderamente vacío (sin enlace y sin ninguna referencia legacy). Cualquier
// referencia no vacía —subida, file:// legacy, SharePoint sincronizado o desconocida— se
// conserva intacta: mismos id/tipo/nombre/url/metadatos, sin fabricar webUrl/driveId/itemId
// ni convertir la URL. Los documentos NO deprecados nunca se descartan (comportamiento
// histórico). PURA: no muta el array ni los documentos; devuelve un array nuevo con las
// mismas referencias de objeto.
export function conservarDocsComex(docs, deprecados) {
  const lista = Array.isArray(docs) ? docs : [];
  const dep = Array.isArray(deprecados) ? deprecados : [];
  return lista.filter((d) => {
    if (!d) return false;
    if (!dep.includes(d.tipo)) return true;   // no deprecado → siempre se conserva
    return refTieneContenido(d.url);          // deprecado → solo si tiene contenido real
  });
}

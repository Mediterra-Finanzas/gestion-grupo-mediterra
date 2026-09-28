/* eslint-disable */
// api/_friskuSpGraph.js — Cliente Microsoft Graph READ-ONLY para Frisku (S4.1)
// ------------------------------------------------------------------------------
// NO es un endpoint. Backend-only, sin dependencias: intercambia el token OIDC de Vercel
// por un token de Graph (Entra Workload Identity Federation, SIN secreto) y hace GET
// acotado EXCLUSIVAMENTE al site/drive Frisku autorizado. Nunca escribe en Graph.
//
// Anti-SSRF: la URL de Graph se CONSTRUYE aquí a partir de ids validados/allowlist; jamás
// se usa una URL recibida del cliente. Solo método GET. Timeout + tope de resultados.
//
// El token de Graph vive solo en memoria de la función; nunca se devuelve al frontend ni
// se registra. Todo `fetch` es inyectable para test (sin red real).

const ENTRA_HOST = "https://login.microsoftonline.com";
const GRAPH = "https://graph.microsoft.com/v1.0";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";
const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
const PAGE_DEFAULT = 50, PAGE_MAX = 200, Q_MAX = 128;
// Sitio Frisku por ruta fija (allowlist); de ahí se enumeran sus bibliotecas y se elige la
// biblioteca de documentos por coincidencia EXACTA de nombre. No se depende de un ID copiado.
const FRISKU_SITE_META = `${GRAPH}/sites/grupomediterra.sharepoint.com:/sites/FriskuFoodsSpA?$select=id`;
const FRISKU_DRIVE_NAME = "Documentos";
const FRISKU_WEBURL_PREFIJO = "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/";
const RE_SITE_ID = /^[A-Za-z0-9.\-]+,[0-9a-fA-F-]{36},[0-9a-fA-F-]{36}$/;   // "host,guid,guid" de Graph
// Límites explícitos del recorrido BFS de la biblioteca (acotado y fail-closed).
const BFS_LIMITES = { carpetas: 40, items: 400, paginas: 80, tiempoMs: 12000, porPagina: 200 };

// Intercambio federado: el token OIDC de Vercel actúa como client_assertion (sin secreto).
async function obtenerTokenGraph({ oidcToken, tenantId, clientId, fetchImpl, timeoutMs = 8000 }) {
  if (!oidcToken || !tenantId || !clientId) return { ok: false, status: 503, error: "no_configurado" };
  const url = `${ENTRA_HOST}/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    scope: GRAPH_SCOPE,
    client_assertion_type: CLIENT_ASSERTION_TYPE,
    client_assertion: oidcToken,
  });
  const r = await conTimeout(fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() }), timeoutMs);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) return { ok: false, status: 502, error: "token_exchange" };
  return { ok: true, token: j.access_token };
}

// Allowlist estricta: solo el drive del site Frisku autorizado.
function drivePermitido(driveId, cfg) {
  return !!(cfg && cfg.driveId && driveId && String(driveId) === String(cfg.driveId));
}
function sanearQuery(q) {
  const s = String(q == null ? "" : q).replace(/[\r\n\t]/g, " ").trim();
  if (!s || s.length > Q_MAX) return null;
  return s;
}
function validarItemId(id) {
  // itemId de Graph: alfanumérico + ! _ - . (no rutas, no espacios, no "/").
  return typeof id === "string" && /^[A-Za-z0-9!_.\-]{1,256}$/.test(id);
}
function clampPage(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v <= 0) return PAGE_DEFAULT;
  return Math.min(v, PAGE_MAX);
}

// Construye la URL de Graph SOLO desde ids validados + cfg (nunca desde una URL del cliente).
// Devuelve { ok, url } | { ok:false, error }.
function construirUrlGraph(op, params, cfg) {
  if (!cfg || !cfg.driveId) return { ok: false, error: "no_configurado" };
  const drive = encodeURIComponent(cfg.driveId);
  const top = clampPage(params && params.top);
  if (op === "list") {
    const carpeta = params && params.carpetaId;
    if (carpeta != null && !validarItemId(carpeta)) return { ok: false, error: "param_invalido" };
    const base = carpeta
      ? `${GRAPH}/drives/${drive}/items/${encodeURIComponent(carpeta)}/children`
      : `${GRAPH}/drives/${drive}/root/children`;
    return { ok: true, url: `${base}?$top=${top}` };
  }
  // "search" a nivel de drive fue retirado a propósito: Graph responde 500 en bibliotecas
  // SharePoint. La búsqueda se resuelve listando (BFS acotado) + matcher S5A en el cliente.
  if (op === "item") {
    const id = params && params.itemId;
    if (!validarItemId(id)) return { ok: false, error: "param_invalido" };
    return { ok: true, url: `${GRAPH}/drives/${drive}/items/${encodeURIComponent(id)}` };
  }
  return { ok: false, error: "op_desconocida" };
}

// Un nextLink de Graph solo se acepta si apunta al MISMO drive permitido (no una URL arbitraria).
function nextLinkPermitido(link, cfg) {
  if (!link || !cfg || !cfg.driveId) return null;
  try {
    const u = new URL(link);
    if (u.origin !== "https://graph.microsoft.com") return null;
    if (!u.pathname.includes(`/drives/${cfg.driveId}/`)) return null;
    return link;
  } catch (e) { return null; }
}

function conTimeout(promesa, ms) {
  return Promise.race([
    promesa,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

// GET a Graph con token bearer y timeout. Devuelve { ok, status, json }.
async function graphGet(url, token, fetchImpl, timeoutMs = 8000) {
  let r;
  try {
    r = await conTimeout(fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }), timeoutMs);
  } catch (e) {
    return { ok: false, status: 504, json: { error: "timeout" } };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

// Resuelve la biblioteca de documentos ENUMERANDO los drives del sitio Frisku y eligiendo la
// coincidencia EXACTA y ÚNICA por nombre "Documentos" (dentro del sitio autorizado). Ausencia
// o duplicado → fail-closed. Evita depender de un ID copiado a mano (case-sensitive). Solo GET.
async function resolverDriveFrisku(token, fetchImpl, timeoutMs = 8000) {
  // 1) Sitio Frisku por ruta fija → su id (host,guid,guid).
  const rs = await graphGet(FRISKU_SITE_META, token, fetchImpl, timeoutMs);
  if (!rs.ok) return { ok: false, status: rs.status, error: "site_resolve" };
  const siteId = rs.json && typeof rs.json.id === "string" ? rs.json.id : "";
  if (!RE_SITE_ID.test(siteId)) return { ok: false, status: 502, error: "site_shape" };
  // 2) Enumerar las bibliotecas del sitio (siteId ya validado; sin chars que rompan la ruta).
  const rd = await graphGet(`${GRAPH}/sites/${siteId}/drives?$select=id,name,webUrl`, token, fetchImpl, timeoutMs);
  if (!rd.ok) return { ok: false, status: rd.status, error: "drive_resolve" };
  const arr = Array.isArray(rd.json && rd.json.value) ? rd.json.value : null;
  if (!arr) return { ok: false, status: 502, error: "drive_shape" };
  // 3) Coincidencia exacta y única por nombre, dentro del sitio Frisku, con id válido.
  const docs = arr.filter((d) => d && d.name === FRISKU_DRIVE_NAME
    && typeof d.webUrl === "string" && d.webUrl.startsWith(FRISKU_WEBURL_PREFIJO)
    && validarItemId(d.id));
  if (docs.length !== 1) return { ok: false, status: 502, error: "drive_ambiguo" };
  return { ok: true, driveId: docs[0].id };
}

// Recorrido BFS ACOTADO de la biblioteca (solo GET; NUNCA search()). Recorre raíz + subcarpetas
// hasta topes explícitos (carpetas, ítems, páginas, tiempo). Sin reintentos: ante 429, timeout
// (graphGet→504) o respuesta anómala, falla cerrado. Devuelve { ok, items, truncated }; items son
// driveItems crudos que normaliza el llamador. `truncated` = se alcanzó algún límite.
async function listarBibliotecaBFS(driveId, token, fetchImpl, limites = {}, ahoraFn) {
  if (!validarItemId(driveId)) return { ok: false, status: 502, error: "drive_invalido" };
  const L = {
    carpetas: Number.isInteger(limites.carpetas) ? limites.carpetas : BFS_LIMITES.carpetas,
    items: Number.isInteger(limites.items) ? limites.items : BFS_LIMITES.items,
    paginas: Number.isInteger(limites.paginas) ? limites.paginas : BFS_LIMITES.paginas,
    tiempoMs: Number.isInteger(limites.tiempoMs) ? limites.tiempoMs : BFS_LIMITES.tiempoMs,
    porPagina: BFS_LIMITES.porPagina,
  };
  const ahora = typeof ahoraFn === "function" ? ahoraFn : (() => Date.now());
  const t0 = ahora();
  const drive = encodeURIComponent(String(driveId));
  const items = [];
  let truncated = false, paginas = 0, carpetas = 0;
  const cola = [`${GRAPH}/drives/${drive}/root/children?$top=${L.porPagina}`];
  while (cola.length) {
    if (ahora() - t0 > L.tiempoMs || paginas >= L.paginas || items.length >= L.items) { truncated = true; break; }
    const url = cola.shift();
    const r = await graphGet(url, token, fetchImpl);
    if (!r.ok) return { ok: false, status: r.status };   // 429 / 504(timeout) / 5xx / anómalo → cerrado
    const val = r.json && r.json.value;
    if (!Array.isArray(val)) return { ok: false, status: 502 };   // respuesta anómala → cerrado
    paginas += 1;
    for (const it of val) {
      if (items.length >= L.items) { truncated = true; break; }
      items.push(it);
      if (it && it.folder && it.id) {
        if (carpetas < L.carpetas) { carpetas += 1; cola.push(`${GRAPH}/drives/${drive}/items/${encodeURIComponent(String(it.id))}/children?$top=${L.porPagina}`); }
        else { truncated = true; }
      }
    }
    const next = nextLinkPermitido(r.json && r.json["@odata.nextLink"], { driveId });
    if (next) cola.push(next);
  }
  return { ok: true, items, truncated };
}

// Normaliza un driveItem de Graph a la forma que consume el matcher S5A. Solo metadatos
// (nada de rutas locales ni usernames: Graph entrega rutas relativas del drive).
function normalizarDriveItem(item, cfg) {
  if (!item || typeof item !== "object") return null;
  const pref = (item.parentReference && item.parentReference.path) || "";
  // parentReference.path viene como "/drives/{id}/root:/Carpeta/Sub" → dejar solo la parte relativa.
  let parentPath = String(pref);
  const idx = parentPath.indexOf("root:");
  parentPath = idx >= 0 ? parentPath.slice(idx + 5) : parentPath;
  return {
    driveId: (item.parentReference && item.parentReference.driveId) ? String(item.parentReference.driveId) : (cfg && cfg.driveId ? String(cfg.driveId) : ""),
    itemId: item.id != null ? String(item.id) : "",
    name: item.name != null ? String(item.name) : "",
    webUrl: item.webUrl != null ? String(item.webUrl) : "",
    parentPath,
    size: Number.isFinite(item.size) ? item.size : null,
    mimeType: (item.file && item.file.mimeType) ? String(item.file.mimeType) : (item.folder ? "folder" : ""),
    lastModifiedAt: item.lastModifiedDateTime != null ? String(item.lastModifiedDateTime) : "",
    esCarpeta: !!item.folder,
  };
}

// Cursor opaco: SOLO el $skiptoken del nextLink (validado del mismo drive). NO se devuelve
// la URL cruda de Graph al cliente (evita exponer estructura/parametros internos).
function cursorDeNextLink(link, cfg) {
  const permitido = nextLinkPermitido(link, cfg);
  if (!permitido) return undefined;
  try {
    const u = new URL(permitido);
    const tok = u.searchParams.get("$skiptoken") || u.searchParams.get("$skip");
    return tok || undefined;
  } catch (e) { return undefined; }
}

function normalizarRespuesta(json, cfg) {
  const arr = Array.isArray(json && json.value) ? json.value : (json && json.id ? [json] : []);
  const items = arr.map(it => normalizarDriveItem(it, cfg)).filter(Boolean);
  const cursor = cursorDeNextLink(json && json["@odata.nextLink"], cfg);
  return { items, nextCursor: cursor, truncated: !!cursor };
}

module.exports = {
  GRAPH, GRAPH_SCOPE, FRISKU_SITE_META, FRISKU_DRIVE_NAME, BFS_LIMITES, PAGE_DEFAULT, PAGE_MAX, Q_MAX,
  obtenerTokenGraph, drivePermitido, sanearQuery, validarItemId, clampPage,
  construirUrlGraph, nextLinkPermitido, graphGet, resolverDriveFrisku, listarBibliotecaBFS,
  normalizarDriveItem, normalizarRespuesta,
};

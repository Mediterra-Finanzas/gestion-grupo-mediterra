// api/db/[...path].js — "Guardia intermedio" hacia la base (Etapa 1)
// ------------------------------------------------------------------
// El navegador llama a /api/db/<tabla>?<filtros> EN VEZ de ir directo a
// Supabase con la llave pública. Este guardia:
//   1. Verifica que haya una sesión válida (cookie firmada del login).
//   2. Reenvía la petición a Supabase usando la llave de SERVICIO, que
//      vive solo en el servidor (nunca en el bundle del navegador).
//
// Así, aunque alguien inspeccione la página, no encuentra ninguna llave
// con la que entrar a la base: tiene que pasar por aquí, y aquí se exige
// sesión.
//
// Espejo de PostgREST: /api/db/calendario_data?id=eq.main&select=value
//   → https://...supabase.co/rest/v1/calendario_data?id=eq.main&select=value
//
// NOTA: se usa req.query (no req.url) porque Vercel inyecta el segmento
// de ruta ('path') en la query del catch-all; lo excluimos al reconstruir.

const zlib = require("zlib");
const { sesionDeRequest, supaFetch, faltanSecretos } = require("../_auth");

// El filtro de seguridad principal es la SESIÓN: sin cookie válida no se pasa.
// La restricción por tabla/fila (por empresa, por rol) es trabajo de RLS y se
// afina después. Por ahora, con sesión válida se permite acceso a las tablas
// del proyecto (calendario_data + tablas del módulo contable, que se acceden
// dinámicamente). Se mantiene una denylist mínima por si acaso.
const TABLAS_BLOQUEADAS = new Set([]);

module.exports = async function handler(req, res) {
  if (faltanSecretos()) {
    return res.status(503).json({ error: "no_configurado" });
  }

  // 1) Exigir sesión válida
  const sesion = sesionDeRequest(req);
  if (!sesion) {
    return res.status(401).json({ error: "sin_sesion" });
  }

  // 2) Tabla + querystring, parseando la URL real (robusto ante cómo
  //    Vercel inyecta el segmento de ruta). Se descarta cualquier 'path'.
  const urlObj = new URL(req.url, "http://local");
  const pathname = urlObj.pathname.replace(/^\/api\/db\//, "").replace(/^\//, "");
  const segs = pathname.split("/").filter(Boolean);
  const tabla = segs[0];

  if (!tabla || TABLAS_BLOQUEADAS.has(tabla)) {
    return res.status(403).json({ error: "tabla_no_permitida", tabla: tabla || null });
  }
  // Limpiar la query: Vercel inyecta el segmento del catch-all como '...path'
  const params = new URLSearchParams(urlObj.searchParams);
  params.delete("...path");
  params.delete("path");
  const qs = params.toString();
  const destino = segs.join("/") + (qs ? "?" + qs : "");

  // 3) Cuerpo (para POST/PATCH). Si viene comprimido (X-Gzip), se descomprime
  //    aquí: el cliente comprime los envíos grandes (ej. finanzas ~4.4MB) para
  //    no superar el tope de ~4.5MB de las funciones de Vercel.
  let body;
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    if (req.headers["x-gzip"] === "1") {
      const raw = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || "", typeof req.body === "string" ? "binary" : undefined);
      try {
        body = zlib.gunzipSync(raw).toString("utf8");
      } catch (e) {
        return res.status(400).json({ error: "gzip_invalido", detalle: String(e && e.message || e) });
      }
    } else if (req.body == null) body = undefined;
    else if (typeof req.body === "string") body = req.body;
    else body = JSON.stringify(req.body);
  }

  // 4) Cabeceras seguras a reenviar (PostgREST usa Prefer/Range/Content-Type)
  const headers = { "Content-Type": "application/json" };
  if (req.headers["prefer"]) headers["Prefer"] = req.headers["prefer"];
  if (req.headers["range"]) headers["Range"] = req.headers["range"];
  if (req.headers["accept"]) headers["Accept"] = req.headers["accept"];

  try {
    const r = await supaFetch(destino, { method: req.method, headers, body });
    const text = await r.text();
    res.status(r.status);
    const ct = r.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    const cr = r.headers.get("content-range");
    if (cr) res.setHeader("Content-Range", cr);
    return res.send(text);
  } catch (e) {
    return res.status(502).json({ error: "upstream", detalle: String(e && e.message || e) });
  }
};

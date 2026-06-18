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

const { sesionDeRequest, supaFetch, faltanSecretos } = require("../_auth");

// Tablas que el guardia permite tocar (lista blanca de seguridad).
const TABLAS_PERMITIDAS = new Set(["calendario_data"]);

module.exports = async function handler(req, res) {
  if (faltanSecretos()) {
    return res.status(503).json({ error: "no_configurado" });
  }

  // 1) Exigir sesión válida
  const sesion = sesionDeRequest(req);
  if (!sesion) {
    return res.status(401).json({ error: "sin_sesion" });
  }

  // 2) Reconstruir path + querystring tal cual (espejo de PostgREST)
  //    req.url = "/api/db/calendario_data?id=eq.main&select=value"
  const url = req.url || "";
  const resto = url.replace(/^\/api\/db\//, ""); // "calendario_data?..."
  const tabla = resto.split("?")[0].split("/")[0];
  if (!TABLAS_PERMITIDAS.has(tabla)) {
    return res.status(403).json({ error: "tabla_no_permitida", tabla });
  }

  // 3) Cuerpo (para POST/PATCH): re-serializar si Vercel ya lo parseó
  let body;
  if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
    if (req.body == null) body = undefined;
    else if (typeof req.body === "string") body = req.body;
    else body = JSON.stringify(req.body);
  }

  // 4) Cabeceras seguras a reenviar (PostgREST usa Prefer/Range/Content-Type)
  const headers = { "Content-Type": "application/json" };
  if (req.headers["prefer"]) headers["Prefer"] = req.headers["prefer"];
  if (req.headers["range"]) headers["Range"] = req.headers["range"];
  if (req.headers["accept"]) headers["Accept"] = req.headers["accept"];

  try {
    const r = await supaFetch(resto, { method: req.method, headers, body });
    // Reenviar estado y cuerpo tal cual
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

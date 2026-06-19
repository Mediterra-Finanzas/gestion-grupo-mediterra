// api/storage.js — Guardia de ARCHIVOS (FASE 4A)
// ------------------------------------------------------------------
// Genera URLs firmadas (con la llave de servicio) para subir/ver/eliminar
// archivos, exigiendo sesión válida. Así, cuando los buckets se cierren
// (Fase B), la app sigue subiendo/viendo archivos por aquí, pero nadie de
// afuera puede entrar.
//
// El archivo NO pasa por esta función (Vercel tiene tope de tamaño): aquí
// solo se entrega un "permiso firmado" y el archivo viaja directo a Supabase.
//
// Operaciones (POST { op, bucket, path, expiresIn? }):
//   op=sign        → URL firmada de DESCARGA/lectura.
//   op=upload-url  → URL firmada de SUBIDA (el cliente hace PUT del archivo).
//   op=delete      → elimina el archivo.

const { sesionDeRequest, faltanSecretos } = require("./_auth");

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKETS_PERMITIDOS = new Set(["frisku-docs", "nominas-docs"]);

module.exports = async function handler(req, res) {
  if (faltanSecretos()) return res.status(503).json({ error: "no_configurado" });
  if (!sesionDeRequest(req)) return res.status(401).json({ error: "sin_sesion" });
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "metodo" }); }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const op = body && body.op;
  const bucket = body && body.bucket;
  const path = body && body.path;
  const expiresIn = (body && body.expiresIn) || 3600;

  if (!BUCKETS_PERMITIDOS.has(bucket)) return res.status(403).json({ error: "bucket_no_permitido", bucket: bucket || null });
  if (!path || typeof path !== "string" || path.includes("..")) return res.status(400).json({ error: "path_invalido" });

  const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const enc = path.split("/").map(encodeURIComponent).join("/");

  try {
    if (op === "sign") {
      const r = await fetch(`${SUPA_URL}/storage/v1/object/sign/${bucket}/${enc}`,
        { method: "POST", headers: H, body: JSON.stringify({ expiresIn }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json(j);
      return res.status(200).json({ url: `${SUPA_URL}/storage/v1${j.signedURL || j.signedUrl}` });
    }
    if (op === "upload-url") {
      const r = await fetch(`${SUPA_URL}/storage/v1/object/upload/sign/${bucket}/${enc}`,
        { method: "POST", headers: H, body: JSON.stringify({}) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json(j);
      return res.status(200).json({ url: `${SUPA_URL}/storage/v1${j.url}` });
    }
    if (op === "delete") {
      const r = await fetch(`${SUPA_URL}/storage/v1/object/${bucket}/${enc}`,
        { method: "DELETE", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
      return res.status(r.ok ? 200 : r.status).json({ ok: r.ok });
    }
    return res.status(400).json({ error: "op_desconocida" });
  } catch (e) {
    return res.status(502).json({ error: "upstream", detalle: String(e && e.message || e) });
  }
};

// api/_respaldo-diario.js — Cron del respaldo diario seguro (auto-v4).
// INERTE a propósito: el "_" inicial hace que Vercel NO lo publique como función.
// Activarlo = renombrar a api/respaldo-diario.js + agregar el cron en vercel.json
// (pasos en docs/respaldo-seguro.md, previa aprobación de Angelo). Fail-closed: sin Bearer <CRON_SECRET> → 401;
// sin SUPABASE_SERVICE_ROLE_KEY → 500 sin tocar nada. Nunca imprime valores.
const { SUPA_URL } = require("./_auth.js");
const { cronAutorizado } = require("./_reportingScheduler.js");
const { ejecutarRespaldo } = require("./_respaldo.js");

module.exports = async function handler(req, res) {
  if (!cronAutorizado(req.headers && req.headers.authorization, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "falta configuración del servidor" });
  }
  try {
    const estado = await ejecutarRespaldo({ supaUrl: SUPA_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
    return res.status(200).json(estado);   // resumen: archivo, n° filas, hashes; sin datos
  } catch (e) {
    console.error("[respaldo-diario] falló:", e && e.message);
    return res.status(500).json({ ok: false, error: String(e && e.message || e).slice(0, 200) });
  }
};

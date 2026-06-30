// api/db/[...path].js — RETIRADO (2026-06-30)
// ------------------------------------------------------------------
// El proxy del guard hacia la base quedó deshabilitado: la app habla DIRECTO
// a Supabase desde el cliente (guard off). Se cierra para que ningún bundle
// viejo en caché siga usándolo. Responde 410 Gone. Los clientes nuevos no lo
// llaman; los viejos se recargan solos al bundle nuevo (checkNewDeploy).
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({ ok: false, error: "endpoint_retirado" });
};

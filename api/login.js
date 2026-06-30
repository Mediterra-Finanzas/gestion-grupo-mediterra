// api/login.js — RETIRADO (2026-06-30)
// ------------------------------------------------------------------
// El login server-side (guard) quedó deshabilitado: la app autentica 100%
// client-side (se borró REACT_APP_USE_GUARD). Este endpoint se cierra a
// propósito para que NINGÚN bundle viejo en caché pueda autenticar por acá y
// saltarse la migración forzada de PIN (incidente: un usuario con PIN base de
// 4 dígitos entró por /api/login sin que se le forzara el PIN de 6 dígitos).
// Responde 410 Gone. Los clientes nuevos (guard off) no llaman a este endpoint;
// los viejos se recargan solos al bundle nuevo (checkNewDeploy en App.jsx).
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({ ok: false, error: "endpoint_retirado" });
};

// api/diag.js — Chequeo TEMPORAL de configuración (Etapa 2, se elimina luego)
// Reporta SOLO si cada secreto está presente (true/false). Nunca su valor.
module.exports = function handler(req, res) {
  return res.status(200).json({
    hasService: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    hasSession: !!process.env.SESSION_SECRET,
    serviceLen: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    sessionLen: (process.env.SESSION_SECRET || "").length,
    node: process.version,
  });
};

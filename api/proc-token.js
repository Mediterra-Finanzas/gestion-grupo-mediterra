// api/proc-token.js — Endpoint PROC-scoped de minteo de JWT authenticated (Opción C).
// NO es un guard global: sólo emite un token para que src/proceso/** hable con proc_* bajo RLS.
// NO intercepta /rest/v1, NO toca el login/roster de Mediterra One (evita el lockout histórico).
//
// Flujo (todo server-side): valida email+PIN contra la fila `pins` → resuelve la identidad estable
// en iam_usuario (sub) → comprueba membresía activa en iam_usuario_empresa para la empresa PEDIDA
// (intención del cliente, verificada, nunca confiada) → mintea JWT corto {role:authenticated, sub,
// empresa_id}. Si algo falla: DENY. Nunca expone service_role ni el JWT secret.
const { supaFetch, faltanSecretos } = require("./_auth.js");
const { mintProcToken, verifyPinPBKDF2 } = require("./_iamToken.js");

const norm = (s) => (s == null ? "" : String(s)).trim().toLowerCase();
const TTL = 1200; // 20 min

async function getJSON(path) {
  const r = await supaFetch(path);
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";
  // Fail-closed: sin secreto de firma o sin service_role/sesión, no se emite nada.
  if (faltanSecretos() || !JWT_SECRET) return res.status(503).json({ error: "auth_no_configurado" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = norm(body && body.email);
  const pin = String((body && body.pin) || "");
  const empresaId = String((body && body.empresa_id) || "").trim();
  if (!email || !pin || !empresaId) return res.status(400).json({ error: "faltan_credenciales" });

  try {
    // 1) usuario legado (para validar PIN) + fila pins
    const usuarios = (await getJSON(`calendario_data?id=eq.main&select=value`))?.[0]?.value?.usuarios || [];
    const u = usuarios.find((x) => x && norm(x.email) === email && !x.desactivado);
    if (!u) return res.status(401).json({ error: "credenciales" });

    const pinsRow = (await getJSON(`calendario_data?id=eq.pins&select=value`))?.[0]?.value || {};
    const credH = pinsRow[u.nombre + "_h"];
    const pinOk = credH ? verifyPinPBKDF2(pin, credH) : (pin === String(pinsRow[u.nombre] || u.pin || ""));
    if (!pinOk) return res.status(401).json({ error: "credenciales" });

    // 2) identidad estable en IAM (sub). iam_* es server-only (service_role bypassa RLS).
    const iamU = (await getJSON(`iam_usuario?email=eq.${encodeURIComponent(u.email)}&activo=eq.true&select=id`))?.[0];
    if (!iamU || !iamU.id) return res.status(403).json({ error: "identidad_no_provisionada" });
    const sub = iamU.id;

    // 3) membresía activa para la empresa PEDIDA (verificada server-side; el browser sólo sugiere)
    const mem = (await getJSON(
      `iam_usuario_empresa?usuario_id=eq.${sub}&empresa_id=eq.${encodeURIComponent(empresaId)}&activo=eq.true&select=id`
    ))?.[0];
    if (!mem) return res.status(403).json({ error: "empresa_no_autorizada" });

    // 4) mintear JWT authenticated. empresa_id = el verificado (no el crudo del cliente).
    const token = mintProcToken({ secret: JWT_SECRET, sub, empresaId, ttlSec: TTL });
    return res.status(200).json({ token, exp: Math.floor(Date.now() / 1000) + TTL, sub, empresa_id: empresaId });
  } catch (e) {
    return res.status(500).json({ error: "error_interno" });
  }
};

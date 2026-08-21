// api/_supaAdmin.js — Adaptador server-only para Supabase Auth (GoTrue) admin. Option C.
// Reutiliza el patrón probado en osiris-auth: admin/generate_link(magiclink) → verify → sesión.
// NUNCA en browser. service_role solo aquí (server). fetch inyectable para tests.
const SUPA_URL = process.env.SUPABASE_URL || "https://bywovqayuzodbzwsriet.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON = process.env.SUPABASE_ANON_KEY || "";

function makeAdmin({ url = SUPA_URL, service = SERVICE, anon = ANON, fetchImpl = fetch } = {}) {
  const admHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };

  // Busca un auth.users por email (admin). Devuelve {id} o null.
  async function findUserByEmail(email) {
    const r = await fetchImpl(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, { headers: admHeaders });
    if (!r.ok) throw new Error(`admin/users ${r.status}`);
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j && j.users) || [];
    return arr[0] || null;
  }
  // Provisiona (idempotente) auth.users para el email. email_confirm:true (sin email al usuario).
  async function ensureUser(email) {
    const found = await findUserByEmail(email);
    if (found && found.id) return found;
    const r = await fetchImpl(`${url}/auth/v1/admin/users`, {
      method: "POST", headers: admHeaders,
      body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!r.ok) throw new Error(`admin/create ${r.status}`);
    return await r.json();
  }
  // Mintea una sesión GoTrue sin login interactivo: generate_link(magiclink) → verify(token_hash).
  // Devuelve { access_token, refresh_token, expires_at, expires_in, token_type }.
  async function mintSession(email) {
    const g = await fetchImpl(`${url}/auth/v1/admin/generate_link`, {
      method: "POST", headers: admHeaders,
      body: JSON.stringify({ type: "magiclink", email }),
    });
    if (!g.ok) throw new Error(`generate_link ${g.status}`);
    const gl = await g.json();
    const tokenHash = gl.hashed_token || gl.token_hash;
    if (!tokenHash) throw new Error("generate_link: sin hashed_token");
    const v = await fetchImpl(`${url}/auth/v1/verify`, {
      method: "POST", headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
    });
    if (!v.ok) throw new Error(`verify ${v.status}`);
    return await v.json();
  }
  return { findUserByEmail, ensureUser, mintSession };
}
module.exports = { makeAdmin };

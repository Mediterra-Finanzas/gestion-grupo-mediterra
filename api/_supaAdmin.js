// api/_supaAdmin.js — Adaptador server-only para Supabase Auth (GoTrue) admin. Option C.
// Reutiliza el patrón probado en osiris-auth: admin/generate_link(magiclink) → verify → sesión.
// NUNCA en browser. service_role solo aquí (server). fetch inyectable para tests.
const SUPA_URL = process.env.SUPABASE_URL || "https://bywovqayuzodbzwsriet.supabase.co";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANON = process.env.SUPABASE_ANON_KEY || "";

function makeAdmin({ url = SUPA_URL, service = SERVICE, anon = ANON, fetchImpl = fetch } = {}) {
  const admHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };

  const normEmail = (e) => String(e == null ? "" : e).trim().toLowerCase();

  // Lee UNA página del listado admin. GoTrue pagina 1-indexado (page/per_page); el filtro
  // ?email= NO es confiable entre versiones, así que NO se usa: escaneamos y comparamos exacto.
  async function listUsersPage(page, perPage) {
    const r = await fetchImpl(`${url}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers: admHeaders });
    if (!r.ok) throw new Error(`admin/users ${r.status}`);   // API error → propaga → FAIL CLOSED
    const j = await r.json();
    return Array.isArray(j) ? j : (j && j.users) || [];
  }

  // Resuelve auth.users por email con IGUALDAD EXACTA normalizada, recorriendo TODAS las páginas.
  // Contrato fail-closed: 0 exactos → null; 1 → ese; >1 exactos → ERROR (identidad ambigua).
  // NUNCA infiere por posición (arr[0]) ni devuelve un usuario de otro email. Sólo declara "no existe"
  // (null → habilita creación) si CONFIRMÓ el fin de la paginación; si no pudo cubrir todo → ERROR.
  async function findUserByEmail(email) {
    const norm = normEmail(email);
    if (!norm) return null;
    const perPage = 100, maxPages = 100;
    const exact = [];
    const seen = new Set();
    let completed = false;
    for (let page = 1; page <= maxPages; page++) {
      const arr = await listUsersPage(page, perPage);
      if (!arr.length) { completed = true; break; }          // fin de paginación confirmado
      let progressed = false;
      for (const u of arr) {
        if (u && u.id && !seen.has(u.id)) {
          seen.add(u.id); progressed = true;
          if (normEmail(u.email) === norm) exact.push(u);
        }
      }
      if (!progressed) { completed = true; break; }           // sin avance (páginas repetidas) → fin
    }
    if (!completed) throw new Error("findUserByEmail: pagination_cap");  // no se cubrió todo → FAIL CLOSED
    if (exact.length === 0) return null;
    if (exact.length > 1) throw new Error("findUserByEmail: ambiguous_email");  // >1 exacto → FAIL CLOSED
    return exact[0];
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

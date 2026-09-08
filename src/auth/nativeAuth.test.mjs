/* eslint-disable */
// Tests de src/auth/nativeAuth.js (AUTH_NATIVE). Sin red: fetch mockeado por inyección de cfg.
// Correr: node src/auth/nativeAuth.test.mjs
process.env.REACT_APP_AUTH_NATIVE = "true";
process.env.REACT_APP_SUPA_KEY = "anon-test-key";

const M = await import("./nativeAuth.js");
const {
  authNativeActivo, signInWithPassword, refreshSession, ensureFreshToken, signOut,
  recoverPassword, updatePassword, getSession, getAccessToken, clearSession, setSession, AuthError,
} = M;

let P = 0, F = 0;
const ok = (c, m) => { if (c) { P++; console.log("PASS", m); } else { F++; console.log("FAIL", m); } };
const NOW = 1_000_000; // epoch fijo
const baseCfg = (over) => ({ url: "https://x.supabase.co", anonKey: "anon-test-key", now: () => NOW, ...over });

// Captura la última request para asertar contrato (path/headers/body).
function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    const { status, body } = handler(url, opts) || { status: 200, body: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => (body == null ? "" : JSON.stringify(body)),
    };
  };
  return { fetchImpl, calls };
}

// ── flag ──
ok(authNativeActivo() === true, "flag AUTH_NATIVE ON");

// ── T1 signInWithPassword → sesión normalizada (exp de expires_at) ──
clearSession();
{
  const { fetchImpl, calls } = mockFetch((url) =>
    url.includes("grant_type=password")
      ? { status: 200, body: { access_token: "AT1", refresh_token: "RT1", expires_at: NOW + 3600, user: { id: "sub-1" } } }
      : { status: 500, body: {} });
  const s = await signInWithPassword({ email: "A@X.CL ", password: "secret" }, baseCfg({ fetchImpl }));
  ok(s.access_token === "AT1" && s.sub === "sub-1", "T1 sesión con sub");
  ok(s.exp === NOW + 3600, "T1 exp desde expires_at");
  const body = JSON.parse(calls[0].opts.body);
  ok(body.email === "a@x.cl", "T1 email normalizado (trim+lower)");
  ok(calls[0].opts.headers.apikey === "anon-test-key", "T1 apikey anon en header");
  ok(!/service/i.test(JSON.stringify(calls[0].opts.headers)), "T1 sin service_role");
  ok(getAccessToken(NOW) === "AT1", "T1 token vigente");
}

// ── T2 credenciales inválidas → AuthError code 'credenciales', fail-closed (sin sesión) ──
clearSession();
{
  const { fetchImpl } = mockFetch(() => ({ status: 400, body: { error_code: "invalid_grant", msg: "Invalid login credentials" } }));
  let threw = null;
  try { await signInWithPassword({ email: "a@x.cl", password: "bad" }, baseCfg({ fetchImpl })); }
  catch (e) { threw = e; }
  ok(threw instanceof AuthError && threw.code === "credenciales", "T2 code=credenciales");
  ok(getSession() === null, "T2 fail-closed: sin sesión");
}

// ── T3 rate-limit 429 → code demasiados_intentos ──
clearSession();
{
  const { fetchImpl } = mockFetch(() => ({ status: 429, body: { msg: "rate limit exceeded" } }));
  let code = null;
  try { await signInWithPassword({ email: "a@x.cl", password: "x" }, baseCfg({ fetchImpl })); } catch (e) { code = e.code; }
  ok(code === "demasiados_intentos", "T3 429 → demasiados_intentos");
}

// ── T4 getAccessToken respeta margen de expiración ──
clearSession();
setSession({ access_token: "AT", refresh_token: "RT", exp: NOW + 10, sub: "s" });
ok(getAccessToken(NOW, 15) === null, "T4 token dentro del margen (15s) → null");
ok(getAccessToken(NOW, 5) === "AT", "T4 token fuera del margen → válido");

// ── T5 refreshSession rota el refresh_token y renueva exp ──
clearSession();
setSession({ access_token: "OLD", refresh_token: "RT-OLD", exp: NOW - 1, sub: "s" });
{
  const { fetchImpl, calls } = mockFetch((url) =>
    url.includes("grant_type=refresh_token")
      ? { status: 200, body: { access_token: "NEW", refresh_token: "RT-NEW", expires_in: 3600, user: { id: "s" } } }
      : { status: 500, body: {} });
  const s = await refreshSession(baseCfg({ fetchImpl }));
  ok(s.access_token === "NEW" && s.refresh_token === "RT-NEW", "T5 refresh rota token");
  ok(s.exp === NOW + 3600, "T5 exp desde expires_in");
  ok(JSON.parse(calls[0].opts.body).refresh_token === "RT-OLD", "T5 envió el refresh viejo");
}

// ── T6 ensureFreshToken auto-refresca cuando el access está por vencer ──
clearSession();
setSession({ access_token: "STALE", refresh_token: "RT", exp: NOW + 30, sub: "s" }); // dentro de margen 60s
{
  const { fetchImpl } = mockFetch(() => ({ status: 200, body: { access_token: "FRESH", refresh_token: "RT2", expires_in: 3600, user: { id: "s" } } }));
  const t = await ensureFreshToken(baseCfg({ fetchImpl }));
  ok(t === "FRESH", "T6 ensureFreshToken refrescó");
}
// sin sesión ni refresh → null (no lanza; el caller re-autentica)
clearSession();
ok((await ensureFreshToken(baseCfg({ fetchImpl: async () => ({ ok: false, status: 401, text: async () => "" }) }))) === null, "T6 sin sesión → null");

// ── T7 recoverPassword SIEMPRE neutro (anti-enumeración), incluso si GoTrue falla ──
clearSession();
{
  const { fetchImpl, calls } = mockFetch(() => ({ status: 500, body: { msg: "boom" } }));
  const r = await recoverPassword("nadie@x.cl", baseCfg({ fetchImpl }));
  ok(r.ok === true, "T7 recover neutro pese a 500");
  ok(calls[0].url.endsWith("/auth/v1/recover"), "T7 pegó a /recover");
}

// ── T8 updatePassword usa Bearer del access token (o el de recovery) ──
clearSession();
setSession({ access_token: "AT-SESS", refresh_token: "RT", exp: NOW + 3600, sub: "s" });
{
  const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: { id: "s" } }));
  await updatePassword("Nueva-Clave-123", null, baseCfg({ fetchImpl }));
  ok(/Bearer AT-SESS/.test(calls[0].opts.headers.Authorization), "T8 PUT /user con Bearer de sesión");
  ok(calls[0].opts.method === "PUT" && calls[0].url.endsWith("/auth/v1/user"), "T8 método/URL correctos");
  ok(!JSON.stringify(calls).includes("service"), "T8 sin service_role");
}
// recovery callback: token del link explícito
{
  const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: { id: "s" } }));
  await updatePassword("Otra-Clave-9", "RECOVERY-TOKEN", baseCfg({ fetchImpl }));
  ok(/Bearer RECOVERY-TOKEN/.test(calls[0].opts.headers.Authorization), "T8b usa el token de recovery");
}

// ── T9 signOut revoca best-effort y limpia memoria ──
clearSession();
setSession({ access_token: "AT", refresh_token: "RT", exp: NOW + 3600, sub: "s" });
{
  const { fetchImpl, calls } = mockFetch(() => ({ status: 204, body: null }));
  await signOut(baseCfg({ fetchImpl }));
  ok(getSession() === null, "T9 sesión limpiada");
  ok(calls[0].url.includes("/auth/v1/logout"), "T9 llamó a /logout");
}
// signOut tolera fallo de red (limpia igual)
clearSession();
setSession({ access_token: "AT", refresh_token: "RT", exp: NOW + 3600, sub: "s" });
await signOut(baseCfg({ fetchImpl: async () => { throw new Error("net"); } }));
ok(getSession() === null, "T9b signOut limpia pese a error de red");

// ── T10 store opcional persiste/borra el refresh_token ──
clearSession();
{
  const mem = {}; const store = { get: (k) => mem[k], set: (k, v) => { mem[k] = v; }, del: (k) => { delete mem[k]; } };
  const { fetchImpl } = mockFetch(() => ({ status: 200, body: { access_token: "AT", refresh_token: "RT-STORED", expires_in: 3600, user: { id: "s" } } }));
  await signInWithPassword({ email: "a@x.cl", password: "p" }, baseCfg({ fetchImpl, store }));
  ok(mem.rt === "RT-STORED", "T10 store guardó refresh_token");
  clearSession(baseCfg({ store }));
  ok(mem.rt === undefined, "T10 clearSession borró del store");
}

console.log(`\nNATIVE-AUTH RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);

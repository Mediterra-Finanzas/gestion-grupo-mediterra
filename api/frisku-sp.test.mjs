/* eslint-disable */
// Tests del endpoint frisku-sp (S4.1 hardened) con mocks. Ejecutar: node api/frisku-sp.test.mjs
import crypto from "node:crypto";
import mod from "./frisku-sp.js";
const { crearHandler, crearRateLimiterMemoriaSoloTest, limiterNoConfigurado } = mod;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esp ${JSON.stringify(b)}, obt ${JSON.stringify(a)})`);

const PIN = "246810";
function mkCred(pin) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, 1000, 32, "sha256").toString("hex");
  return JSON.stringify({ v: 1, iter: 1000, salt: salt.toString("hex"), hash, pol: "6dig" });
}
const usuarios = [
  { nombre: "Trabajador Uno", email: "uno@ejemplo.test", rol: "editor", modulos: ["tareas", "frisku"] },
  { nombre: "Trabajador Dos", email: "dos@ejemplo.test", rol: "editor", modulos: ["tareas"] },
];
const pins = { "Trabajador Uno_h": mkCred(PIN), "Trabajador Dos_h": mkCred(PIN) };
const ORIGIN = "https://app.frisku.test";
const HOST = "app.frisku.test";

function mkRes() {
  return {
    statusCode: 200, headers: {}, body: undefined, ended: false,
    setHeader(k, v) { this.headers[k] = v; }, getHeader(k) { return this.headers[k]; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end() { this.ended = true; return this; },
  };
}
function mkReq({ method = "POST", headers = {}, body, cookie, origin = ORIGIN, host = HOST, noOrigin, noHost } = {}) {
  const h = Object.assign({ "content-type": "application/json" }, headers);
  if (cookie) h.cookie = cookie;
  if (origin && !noOrigin) h.origin = origin;
  if (host && !noHost) h.host = host;
  return { method, headers: h, body, socket: { remoteAddress: "1.2.3.4" } };
}
function mkFetch({ graphValue = [], graphStatus = 200, capturar, tokenOk = true } = {}) {
  return async (url, opts) => {
    if (String(url).includes("oauth2/v2.0/token")) return { ok: tokenOk, status: tokenOk ? 200 : 400, json: async () => (tokenOk ? { access_token: "GRAPH_TOK_SECRETO" } : {}) };
    if (capturar) capturar({ url, method: opts && opts.method });
    if (graphStatus !== 200) return { ok: false, status: graphStatus, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ value: graphValue }) };
  };
}
function baseCfg() { return { secret: "SES_SECRET", tenantId: "TEN", clientId: "CLI", driveId: "DRV", origenesPermitidos: [ORIGIN], hostsPermitidos: [HOST] }; }
function mkHandler(over = {}) {
  const clock = over.clock || { t: 1_000_000_000_000 };
  return crearHandler({
    cfg: over.cfg || baseCfg(),
    leerDatos: over.leerDatos || (async () => ({ usuarios, pins })),
    obtenerTokenOidc: ("obtenerTokenOidc" in over) ? over.obtenerTokenOidc : (() => "OIDC_SECRETO"),
    fetchImpl: over.fetchImpl || mkFetch(),
    rate: ("rate" in over) ? over.rate : crearRateLimiterMemoriaSoloTest(),
    ahora: over.ahora || (() => clock.t),
  });
}
function cookieDeSet(res) { const m = String(res.getHeader("Set-Cookie") || "").match(/frisku_sp_sess=([^;]+)/); return m ? `frisku_sp_sess=${m[1]}` : ""; }
async function loginOk(h) { const res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res); return res; }

async function run() {
  let h, res;

  // Origin / Host
  h = mkHandler();
  res = mkRes(); await h(mkReq({ method: "OPTIONS" }), res); eq(res.statusCode, 204, "OPTIONS origen ok → 204");
  ok(res.headers["Access-Control-Allow-Origin"] === ORIGIN, "CORS refleja origen (no *)");
  res = mkRes(); await h(mkReq({ noOrigin: true, body: { op: "logout" } }), res); eq(res.statusCode, 403, "Origin ausente → 403");
  res = mkRes(); await h(mkReq({ origin: "https://evil.test", body: { op: "logout" } }), res); eq(res.statusCode, 403, "Origin inválido → 403");
  res = mkRes(); await h(mkReq({ noHost: true, body: { op: "logout" } }), res); eq(res.statusCode, 403, "Host ausente → 403");
  res = mkRes(); await h(mkReq({ host: "otro.host", body: { op: "logout" } }), res); eq(res.statusCode, 403, "Host inválido → 403");

  // método / content-type / body
  res = mkRes(); await h(mkReq({ method: "GET" }), res); eq(res.statusCode, 405, "GET → 405");
  res = mkRes(); await h(mkReq({ headers: { "content-type": "text/plain" }, body: "x" }), res); eq(res.statusCode, 415, "content-type no JSON → 415");
  res = mkRes(); await h(mkReq({ headers: { "content-length": "99999" }, body: { op: "login" } }), res); eq(res.statusCode, 413, "body grande (content-length) → 413");
  res = mkRes(); await h(mkReq({ body: "no-json{" }), res); eq(res.statusCode, 400, "JSON inválido → 400");
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN, extra: 1 } }), res); eq(res.statusCode, 400, "campo extra → 400");
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "x".repeat(400), pin: PIN } }), res); eq(res.statusCode, 401, "email demasiado largo → 401");
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: "1".repeat(50) } }), res); eq(res.statusCode, 401, "pin demasiado largo → 401");
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: 246810 } }), res); eq(res.statusCode, 401, "pin numérico (no string) → 401");

  // headers no-store / Pragma
  res = await loginOk(h);
  eq(res.getHeader("Cache-Control"), "no-store", "Cache-Control no-store");
  eq(res.getHeader("Pragma"), "no-cache", "Pragma no-cache");
  eq(res.statusCode, 200, "login correcto → 200");
  ok(/frisku_sp_sess=/.test(res.getHeader("Set-Cookie") || "") && /HttpOnly/.test(res.getHeader("Set-Cookie")) && /Path=\/api\/frisku-sp/.test(res.getHeader("Set-Cookie")), "cookie segura + Path acotado");
  ok(!JSON.stringify(res.body).includes("OIDC") && !JSON.stringify(res.body).includes(PIN), "login sin token/PIN en respuesta");

  // credenciales / capability
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: "000000" } }), res); eq(res.body.error, "credenciales", "PIN malo → credenciales"); eq(res.statusCode, 401, "→401");
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "dos@ejemplo.test", pin: PIN } }), res); eq(res.statusCode, 403, "sin frisku → 403");

  // ── Rate limiter fail-closed ──
  const hSin = mkHandler({ rate: undefined_forzar() }); // sin limiter → fail-closed
  res = mkRes(); await hSin(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res);
  eq(res.statusCode, 503, "sin limiter → 503 (antes de verificar PIN)");
  ok(!res.getHeader("Set-Cookie"), "sin limiter → no emite cookie");
  const hCaido = mkHandler({ rate: { async golpe() { throw new Error("store caido"); } } });
  res = mkRes(); await hCaido(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res);
  eq(res.statusCode, 503, "limiter caído → 503");
  const hDeny = mkHandler({ rate: { async golpe() { return { permitido: false }; } } });
  res = mkRes(); await hDeny(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res);
  eq(res.statusCode, 429, "limiter deniega → 429");
  // el handler de producción NO trae limiter en memoria (fail-closed)
  res = mkRes(); await mod(mkReqProd(), res); // handler prod real, sin env → 403 host/origen o 503; nunca 200
  ok(res.statusCode !== 200, "handler prod nunca 200 sin config (fail-closed)");

  // leerDatos falla → 503, sin defaults
  const hFail = mkHandler({ leerDatos: async () => { throw new Error("supa down"); } });
  res = mkRes(); await hFail(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res); eq(res.statusCode, 503, "carga falla → 503");
  const hVacio = mkHandler({ leerDatos: async () => ({ usuarios: null }) });
  res = mkRes(); await hVacio(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res); eq(res.statusCode, 503, "datos inesperados → 503");

  // email duplicado / nombre duplicado → cerrado (credenciales)
  const hDupE = mkHandler({ leerDatos: async () => ({ usuarios: [usuarios[0], { ...usuarios[0] }], pins }) });
  res = mkRes(); await hDupE(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res); eq(res.statusCode, 401, "email duplicado → 401 cerrado");

  // op sin cookie / cookie válida / cookie duplicada / expirada / alterada
  res = mkRes(); await h(mkReq({ body: { op: "list" } }), res); eq(res.statusCode, 401, "op sin sesión → 401");
  const item = { id: "IT1", name: "BL.pdf", webUrl: "https://sp/BL.pdf", parentReference: { driveId: "DRV", path: "/drives/DRV/root:/COMEX" }, file: { mimeType: "application/pdf" } };
  let cap = null;
  const hG = mkHandler({ fetchImpl: mkFetch({ graphValue: [item], capturar: (x) => (cap = x) }) });
  const ck = cookieDeSet(await loginOk(hG));
  res = mkRes(); await hG(mkReq({ body: { op: "list" }, cookie: ck }), res);
  eq(res.statusCode, 200, "op list con sesión → 200"); eq(res.body.items[0].itemId, "IT1", "items normalizados"); eq(cap.method, "GET", "Graph solo GET");
  ok(!JSON.stringify(res.body).includes("GRAPH_TOK_SECRETO") && !JSON.stringify(res.body).includes("OIDC_SECRETO"), "op sin tokens en respuesta");
  res = mkRes(); await hG(mkReq({ body: { op: "list" }, cookie: ck + "; frisku_sp_sess=otra" }), res); eq(res.statusCode, 401, "cookie duplicada/ambigua → 401");
  res = mkRes(); await hG(mkReq({ body: { op: "list" }, cookie: ck + "x" }), res); eq(res.statusCode, 401, "cookie alterada → 401");
  { const clock = { t: 2e12 }; const hE = mkHandler({ ahora: () => clock.t }); const c2 = cookieDeSet(await loginOk(hE)); clock.t += 31 * 60 * 1000;
    res = mkRes(); await hE(mkReq({ body: { op: "list" }, cookie: c2 }), res); eq(res.statusCode, 401, "cookie expirada / replay tardío → 401"); }

  // op inválidas / driveId ajeno ignorado
  res = mkRes(); await hG(mkReq({ body: { op: "search", q: "" }, cookie: ck }), res); eq(res.statusCode, 400, "search q vacío → 400");
  res = mkRes(); await hG(mkReq({ body: { op: "item", itemId: "a/b" }, cookie: ck }), res); eq(res.statusCode, 400, "item id inválido → 400");
  cap = null; res = mkRes(); await hG(mkReq({ body: { op: "list", carpetaId: "OK123" }, cookie: ck }), res); ok(cap.url.includes("/drives/DRV/") , "usa driveId de cfg (allowlist)");

  // OIDC ausente → 503
  const hNoOidc = mkHandler({ obtenerTokenOidc: () => null });
  const ck3 = cookieDeSet(await loginOk(hNoOidc));
  res = mkRes(); await hNoOidc(mkReq({ body: { op: "list" }, cookie: ck3 }), res); eq(res.statusCode, 503, "OIDC ausente → 503");

  // token exchange falla → 502 ; Graph 404/500/429
  { const hx = mkHandler({ fetchImpl: mkFetch({ tokenOk: false }) }); const c = cookieDeSet(await loginOk(hx));
    res = mkRes(); await hx(mkReq({ body: { op: "list" }, cookie: c }), res); eq(res.statusCode, 502, "token exchange falla → 502"); eq(res.body.error, "auth_upstream", "auth_upstream"); }
  for (const [gs, exp] of [[404, 404], [500, 502], [429, 429]]) {
    const hx = mkHandler({ fetchImpl: mkFetch({ graphStatus: gs }) }); const c = cookieDeSet(await loginOk(hx));
    res = mkRes(); await hx(mkReq({ body: { op: "list" }, cookie: c }), res); eq(res.statusCode, exp, `Graph ${gs} → ${exp}`);
    ok(!("status" in (res.body || {})), `Graph ${gs}: sin estado upstream crudo en respuesta`);
  }

  // rate limit login (max 8) → 9º = 429
  { const hRl = mkHandler(); let last = mkRes();
    for (let i = 0; i < 9; i++) { last = mkRes(); await hRl(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: "000000" } }), last); }
    eq(last.statusCode, 429, "9º login → 429"); }

  // logout borra cookie con mismos atributos
  res = mkRes(); await h(mkReq({ body: { op: "logout" } }), res);
  ok(/Max-Age=0/.test(res.getHeader("Set-Cookie") || "") && /Path=\/api\/frisku-sp/.test(res.getHeader("Set-Cookie")) && /HttpOnly/.test(res.getHeader("Set-Cookie")), "logout borra cookie con mismos atributos");

  // sin información sensible en errores (nunca stack/upstream/email)
  res = mkRes(); await h(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: "000000" } }), res);
  ok(JSON.stringify(res.body) === JSON.stringify({ error: "credenciales" }), "error genérico sin detalles");

  // NINGÚN console.* durante login+op (no se registra body/cookie/token/PII)
  const spy = []; const origErr = console.error, origLog = console.log, origWarn = console.warn;
  console.error = (...a) => spy.push(a); console.log = (...a) => spy.push(a); console.warn = (...a) => spy.push(a);
  try {
    const hL = mkHandler({ fetchImpl: mkFetch({ graphValue: [item] }) });
    const cL = cookieDeSet(await loginOk(hL));
    await hL(mkReq({ body: { op: "list" }, cookie: cL }), mkRes());
  } finally { console.error = origErr; console.log = origLog; console.warn = origWarn; }
  ok(spy.length === 0, "el handler no registra nada en consola");

  console.log(`\nfrisku-sp endpoint: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

function undefined_forzar() { return undefined; }
// Request para el handler de producción (mod): origen/host no configurados en prod sin env.
function mkReqProd() { return { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, host: HOST }, body: { op: "login", email: "uno@ejemplo.test", pin: PIN }, socket: { remoteAddress: "1.2.3.4" } }; }

run();

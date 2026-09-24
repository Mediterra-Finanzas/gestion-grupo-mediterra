/* eslint-disable */
// Tests del endpoint frisku-sp (S4.1 hardened) con mocks. Ejecutar: node api/frisku-sp.test.mjs
import crypto from "node:crypto";
import mod from "./frisku-sp.js";
const { crearHandler, crearRateLimiterMemoriaSoloTest, limiterNoConfigurado, leerDatosProd } = mod;

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
function mkReq({ method = "POST", headers = {}, body, cookie, origin = ORIGIN, host = HOST, noOrigin, noHost, ip = "203.0.113.5", noIp } = {}) {
  const h = Object.assign({ "content-type": "application/json" }, headers);
  if (cookie) h.cookie = cookie;
  if (origin && !noOrigin) h.origin = origin;
  if (host && !noHost) h.host = host;
  if (ip && !noIp && !("x-vercel-forwarded-for" in h)) h["x-vercel-forwarded-for"] = ip;
  return { method, headers: h, body, socket: { remoteAddress: "1.2.3.4" } };
}
function mkFetch({ graphValue = [], graphStatus = 200, capturar, tokenOk = true } = {}) {
  return async (url, opts) => {
    if (String(url).includes("oauth2/v2.0/token")) return { ok: tokenOk, status: tokenOk ? 200 : 400, json: async () => (tokenOk ? { access_token: "GRAPH_TOK_SECRETO" } : {}) };
    if (String(url).includes("/lists/Documentos/drive?")) return { ok: true, status: 200, json: async () => ({
      id: "DRV", name: "Documentos",
      webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos",
    }) };
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

  // rate limit login capa identidad (max 8) → 9º = 429 + Retry-After
  { const hRl = mkHandler(); let last = mkRes();
    for (let i = 0; i < 9; i++) { last = mkRes(); await hRl(mkReq({ body: { op: "login", email: "uno@ejemplo.test", pin: "000000" } }), last); }
    eq(last.statusCode, 429, "9º login → 429");
    ok(String(last.getHeader("Retry-After") || "").length > 0, "429 incluye Retry-After"); }

  // IP confiable ausente → 503 (no se puede rate-limit por IP) — fail-closed
  { const hNoIp = mkHandler();
    res = mkRes(); await hNoIp(mkReq({ noIp: true, body: { op: "login", email: "uno@ejemplo.test", pin: PIN } }), res);
    eq(res.statusCode, 503, "sin IP confiable → 503"); }

  // Capas independientes: un login exitoso NO resetea la capa IP (buckets distintos).
  { const hL = mkHandler(); // limiter en memoria por clave: ip y email son claves separadas
    await loginOk(hL); // consume ip(1) + id(1)
    const r2 = await loginOk(hL); // consume ip(2) + id(2) — sigue permitido
    eq(r2.statusCode, 200, "segundo login exitoso permitido (capas independientes, sin reset)"); }

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

  // ── graphdiag: log privado fijo por etapa 502; respuesta pública genérica sin datos sensibles ──
  {
    const capturarConsola = async (fn) => {
      const spy = []; const oe = console.error, ol = console.log, ow = console.warn;
      console.error = (...a) => spy.push(a.join(" ")); console.log = (...a) => spy.push(a.join(" ")); console.warn = (...a) => spy.push(a.join(" "));
      try { await fn(); } finally { console.error = oe; console.log = ol; console.warn = ow; }
      return spy;
    };
    // Nada de esto puede aparecer en un log de diagnóstico.
    const SENSIBLE = ["GRAPH_TOK_SECRETO", "OIDC_SECRETO", "graph.microsoft.com", "login.microsoftonline.com", "TEN", "CLI", "DRV", "uno@ejemplo.test", "Bearer"];
    const sinSensibles = (spy) => spy.every((l) => SENSIBLE.every((s) => !l.includes(s)));
    const corrida = async (fetchImpl) => {
      const hx = mkHandler({ fetchImpl }); const c = cookieDeSet(await loginOk(hx));
      let rr; const spy = await capturarConsola(async () => { rr = mkRes(); await hx(mkReq({ body: { op: "list" }, cookie: c }), rr); });
      return { rr, spy };
    };
    // token_exchange → 502 auth_upstream
    { const { rr, spy } = await corrida(mkFetch({ tokenOk: false }));
      eq(rr.statusCode, 502, "graphdiag token_exchange → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "auth_upstream" }), "token_exchange: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:token_exchange", "token_exchange: log fijo único");
      ok(sinSensibles(spy), "token_exchange: log sin datos sensibles"); }
    // op del drive → Graph 401 → 502 graph, log con status exacto op_401
    { const { rr, spy } = await corrida(mkFetch({ graphStatus: 401 }));
      eq(rr.statusCode, 502, "graphdiag op_401 → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "graph" }), "op_401: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:op_401", "op_401: log con status exacto");
      ok(sinSensibles(spy), "op_401: log sin datos sensibles"); }
    // op del drive → Graph 500 → 502 graph, log op_500
    { const { rr, spy } = await corrida(mkFetch({ graphStatus: 500 }));
      eq(rr.statusCode, 502, "graphdiag op_500 → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "graph" }), "op_500: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:op_500", "op_500: log con status exacto");
      ok(sinSensibles(spy), "op_500: log sin datos sensibles"); }
    // op del drive → red/timeout (graphGet devuelve 504) → 502 graph, log op_504
    { const fRed = async (url) => {
        if (String(url).includes("oauth2/v2.0/token")) return { ok: true, status: 200, json: async () => ({ access_token: "GRAPH_TOK_SECRETO" }) };
        if (String(url).includes("/lists/Documentos/drive?")) return { ok: true, status: 200, json: async () => ({
          id: "DRV", name: "Documentos",
          webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos",
        }) };
        throw new Error("red");
      };
      const { rr, spy } = await corrida(fRed);
      eq(rr.statusCode, 502, "graphdiag op_504 → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "graph" }), "op_504: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:op_504", "op_504: log con status exacto");
      ok(sinSensibles(spy), "op_504: log sin datos sensibles"); }
    // 404/429 NO producen graphdiag (no son 502) ni datos crudos
    { const { rr, spy } = await corrida(mkFetch({ graphStatus: 404 }));
      eq(rr.statusCode, 404, "graph 404 → 404 (no 502)");
      ok(spy.length === 0, "graph 404: sin graphdiag (no es 502)"); }
    // resolución del drive → Graph 500 (GET a /lists/Documentos/drive) → 502 graph, log resolve_http_500
    { const fRes = async (url) => {
        if (String(url).includes("oauth2/v2.0/token")) return { ok: true, status: 200, json: async () => ({ access_token: "GRAPH_TOK_SECRETO" }) };
        if (String(url).includes("/lists/Documentos/drive?")) return { ok: false, status: 500, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ value: [] }) };
      };
      const { rr, spy } = await corrida(fRes);
      eq(rr.statusCode, 502, "graphdiag resolve_http_500 → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "graph" }), "resolve_http_500: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:resolve_http_500", "resolve_http_500: log con status exacto");
      ok(sinSensibles(spy), "resolve_http_500: log sin datos sensibles"); }
    // resolución del drive → 200 pero forma inesperada (nombre) → 502 graph, log resolve_shape
    { const fShape = async (url) => {
        if (String(url).includes("oauth2/v2.0/token")) return { ok: true, status: 200, json: async () => ({ access_token: "GRAPH_TOK_SECRETO" }) };
        if (String(url).includes("/lists/Documentos/drive?")) return { ok: true, status: 200, json: async () => ({ id: "D", name: "Otro", webUrl: "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/x" }) };
        return { ok: true, status: 200, json: async () => ({ value: [] }) };
      };
      const { rr, spy } = await corrida(fShape);
      eq(rr.statusCode, 502, "graphdiag resolve_shape → 502");
      ok(JSON.stringify(rr.body) === JSON.stringify({ error: "graph" }), "resolve_shape: body público genérico");
      ok(spy.length === 1 && spy[0] === "frisku-sp graphdiag:resolve_shape", "resolve_shape: log fijo");
      ok(sinSensibles(spy), "resolve_shape: log sin datos sensibles"); }
  }

  // ── leerDatosProd: lee id="main" (value.usuarios) + id="pins" (value); estricto; SOLO GET ──
  {
    const OLD = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "SVC";
    const mkSupaFetch = (spec) => {
      const calls = [];
      const f = async (url, opts) => {
        calls.push({ url: String(url), method: (opts && opts.method) || "GET" });
        const which = String(url).includes("id=eq.main") ? "main" : String(url).includes("id=eq.pins") ? "pins" : null;
        const s = which && spec[which];
        if (!s) return { ok: false, status: 404, json: async () => [] };
        if (s.throw) throw new Error("red");
        return { ok: s.ok !== false, status: s.status || 200, json: async () => s.rows };
      };
      f.calls = calls;
      return f;
    };
    const mainRows = (usrs) => [{ value: { usuarios: usrs, meta: 1 } }];
    const pinsRows = [{ value: pins }];
    const lanza = async (f, m) => { let t = false; try { await leerDatosProd(f); } catch (e) { t = true; } ok(t, m); };
    try {
      // estructura correcta main + pins
      { const f = mkSupaFetch({ main: { rows: mainRows(usuarios) }, pins: { rows: pinsRows } });
        const d = await leerDatosProd(f);
        ok(Array.isArray(d.usuarios) && d.usuarios.length === 2, "leerDatosProd: usuarios desde main.value.usuarios");
        ok(d.pins && d.pins["Trabajador Uno_h"], "leerDatosProd: pins desde fila pins.value");
        ok(f.calls.length === 2 && f.calls.every((c) => c.method === "GET"), "leerDatosProd: solo GET (cero escrituras)");
        ok(f.calls.some((c) => c.url.includes("id=eq.main")) && !f.calls.some((c) => c.url.includes("id=eq.usuarios")), "leerDatosProd: consulta id=eq.main (no id=eq.usuarios)"); }
      // main inexistente
      await lanza(mkSupaFetch({ main: { rows: [] }, pins: { rows: pinsRows } }), "leerDatosProd: main inexistente → throw");
      // main duplicado
      await lanza(mkSupaFetch({ main: { rows: [mainRows(usuarios)[0], mainRows(usuarios)[0]] }, pins: { rows: pinsRows } }), "leerDatosProd: main duplicado → throw");
      // main.value no objeto
      await lanza(mkSupaFetch({ main: { rows: [{ value: null }] }, pins: { rows: pinsRows } }), "leerDatosProd: main.value no objeto → throw");
      // value.usuarios ausente
      await lanza(mkSupaFetch({ main: { rows: [{ value: { meta: 1 } }] }, pins: { rows: pinsRows } }), "leerDatosProd: value.usuarios ausente → throw");
      // value.usuarios inválido (no array)
      await lanza(mkSupaFetch({ main: { rows: [{ value: { usuarios: { a: 1 } } }] }, pins: { rows: pinsRows } }), "leerDatosProd: value.usuarios no array → throw");
      // pins inexistente
      await lanza(mkSupaFetch({ main: { rows: mainRows(usuarios) }, pins: { rows: [] } }), "leerDatosProd: pins inexistente → throw");
      // pins duplicado
      await lanza(mkSupaFetch({ main: { rows: mainRows(usuarios) }, pins: { rows: [pinsRows[0], pinsRows[0]] } }), "leerDatosProd: pins duplicado → throw");
      // pins inválido (array, no mapa)
      await lanza(mkSupaFetch({ main: { rows: mainRows(usuarios) }, pins: { rows: [{ value: [1, 2, 3] }] } }), "leerDatosProd: pins.value array → throw");
      // error HTTP
      await lanza(mkSupaFetch({ main: { ok: false, status: 500, rows: [] }, pins: { rows: pinsRows } }), "leerDatosProd: HTTP no ok → throw");
      // error de red
      await lanza(mkSupaFetch({ main: { throw: true }, pins: { rows: pinsRows } }), "leerDatosProd: error de red → throw");
      // sin service key → throw y cero requests
      { process.env.SUPABASE_SERVICE_ROLE_KEY = "";
        const f = mkSupaFetch({ main: { rows: mainRows(usuarios) }, pins: { rows: pinsRows } });
        await lanza(f, "leerDatosProd: sin service key → throw");
        ok(f.calls.length === 0, "leerDatosProd: sin service key → cero requests");
        process.env.SUPABASE_SERVICE_ROLE_KEY = "SVC"; }
    } finally {
      if (OLD === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = OLD;
    }
  }

  console.log(`\nfrisku-sp endpoint: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

function undefined_forzar() { return undefined; }
// Request para el handler de producción (mod): origen/host no configurados en prod sin env.
function mkReqProd() { return { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, host: HOST }, body: { op: "login", email: "uno@ejemplo.test", pin: PIN }, socket: { remoteAddress: "1.2.3.4" } }; }

run();

// Tests S4 del endpoint (throttle HMAC + binding concurrente + PII-never-DB). node api/proc-token.s4.test.mjs
import { createRequire } from "module";
import crypto from "crypto";
const require = createRequire(import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SESSION_SECRET = "sess";
process.env.PROC_THROTTLE_SECRET = "test-throttle-secret-0123456789";
const { makeHandler } = require("./proc-token.js");
const { verifyPinPBKDF2 } = require("./_iamToken.js");
const T = require("./_procThrottle.js");

const ALS = "5aa10886-2a76-4a9e-9bc3-303fb776cd49";
const AU = "a0000000-0000-0000-0000-0000000000a1";
const HEX64 = /^[a-f0-9]{64}$/;
function cred(pin) { const s = crypto.randomBytes(16); return { v: 1, iter: 100000, salt: s.toString("hex"), hash: crypto.pbkdf2Sync(pin, s, 100000, 32, "sha256").toString("hex") }; }

function deps(scn) {
  const rpcKeys = []; const patched = [];
  return {
    _rpcKeys: rpcKeys, _patched: patched,
    getJSON: async (path) => {
      if (path.includes("id=eq.main")) return [{ value: { usuarios: [{ nombre: "Angelo", email: "a@x.cl" }] } }];
      if (path.includes("id=eq.pins")) return [{ value: { Angelo_h: cred("1234") } }];
      if (path.startsWith("iam_usuario?email=")) return [{ id: "iam-ang", auth_user_id: scn.iamBound ?? null }];
      if (path.startsWith("iam_usuario?id=eq.iam-ang&select=auth_user_id")) return [{ auth_user_id: scn.refetch ?? AU }];
      if (path.startsWith("iam_usuario_empresa?")) return [{ empresa_id: ALS }];
      return [];
    },
    rpc: async (fn, args) => {
      if (fn === "proc_fn_auth_attempt") { rpcKeys.push(args.p_key); return scn.block ? scn.block(args.p_key) : true; }
      return null;
    },
    patch: async (path, body) => { patched.push({ path, body }); },
    admin: { ensureUser: async () => ({ id: AU }), mintSession: async () => ({ access_token: "AT", expires_at: 1 }) },
    verifyPin: verifyPinPBKDF2,
  };
}
function resMock() { const o = { code: 0, body: null }; return { status(c){o.code=c;return this;}, json(b){o.body=b;return o;}, _o:o }; }
async function call(scn, body, headers = {}) { const d = deps(scn); const res = resMock();
  await makeHandler(d)({ method: "POST", headers, body }, res); return { o: res._o, d }; }

let P = 0, F = 0; const ok = (c, m) => { if (c) { P++; console.log("PASS", m); } else { F++; console.log("FAIL", m); } };

// S4 secret fail-closed
{ delete process.env.PROC_THROTTLE_SECRET;
  const { o } = await call({}, { email: "a@x.cl", pin: "1234" });
  ok(o.code === 503, "S4 sin PROC_THROTTLE_SECRET → 503 (fail-closed)");
  process.env.PROC_THROTTLE_SECRET = "test-throttle-secret-0123456789"; }

// S4-09 success single + reset
{ const { o, d } = await call({}, { email: "a@x.cl", pin: "1234" }, { "x-real-ip": "9.9.9.9" });
  ok(o.code === 200 && o.body.access_token === "AT" && o.body.empresa_id === ALS, "S4-09 single → 200 auto ALS");
  ok(o.body.sub === AU && o.body.iam_usuario_id === "iam-ang", "sub=auth.users.id, actor=iam"); }

// S4-18 PII nunca a la DB: todas las p_key son HMAC hex64, sin email/IP
{ const { d } = await call({}, { email: "a@x.cl", pin: "1234" }, { "x-real-ip": "9.9.9.9" });
  ok(d._rpcKeys.length >= 2 && d._rpcKeys.every((k) => HEX64.test(k) && !k.includes("@") && !k.includes("9.9.9.9")),
     "S4-18 DB recibe solo claves opacas (sin email/IP)"); }

// S4-20 throttle: identidad bloqueada → 429
{ const idKey = T.bucket(process.env.PROC_THROTTLE_SECRET, "identity", "a@x.cl");
  const { o } = await call({ block: (k) => k !== idKey }, { email: "a@x.cl", pin: "1234" }, { "x-real-ip": "9.9.9.9" });
  ok(o.code === 429, "S4-20 identidad throttled → 429"); }

// S4-19 rotar IP no evade el límite por identidad (dos IPs, identidad bloqueada → ambas 429)
{ const idKey = T.bucket(process.env.PROC_THROTTLE_SECRET, "identity", "a@x.cl");
  const r1 = await call({ block: (k) => k === idKey ? false : true }, { email: "a@x.cl", pin: "1234" }, { "x-real-ip": "1.1.1.1" });
  const r2 = await call({ block: (k) => k === idKey ? false : true }, { email: "a@x.cl", pin: "1234" }, { "x-real-ip": "2.2.2.2" });
  ok(r1.o.code === 429 && r2.o.code === 429, "S4-19 rotar IP no evade identity lockout"); }

// S4-12 binding bootstrap: null → PATCH condicional is.null + re-fetch au.id → 200
{ const { o, d } = await call({ iamBound: null, refetch: AU }, { email: "a@x.cl", pin: "1234" });
  ok(o.code === 200, "S4-12 binding bootstrap → 200");
  ok(d._patched.some((p) => p.path.includes("auth_user_id=is.null") && p.body.auth_user_id === AU), "PATCH condicionado is.null"); }

// S4-13 binding idempotente: ya == au.id → sin patch, 200
{ const { o, d } = await call({ iamBound: AU }, { email: "a@x.cl", pin: "1234" });
  ok(o.code === 200 && d._patched.length === 0, "S4-13 binding idempotente (sin PATCH)"); }

// S4-14 binding conflict: ya != au.id → 403
{ const { o } = await call({ iamBound: "b0000000-0000-0000-0000-0000000000b9" }, { email: "a@x.cl", pin: "1234" });
  ok(o.code === 403 && o.body.error === "binding_conflicto", "S4-14 binding conflict → 403 FAIL CLOSED"); }

// S4-15 first-login concurrente: PATCH is.null pierde la carrera pero re-fetch ve el ganador (au.id) → 200
{ const { o } = await call({ iamBound: null, refetch: AU }, { email: "a@x.cl", pin: "1234" });
  ok(o.code === 200, "S4-15 first-login concurrente converge (re-fetch autoritativo)"); }

// S4-03 PIN malo → 401 uniforme
{ const { o } = await call({}, { email: "a@x.cl", pin: "0000" });
  ok(o.code === 401 && o.body.error === "credenciales", "S4-03 PIN malo → 401 uniforme"); }

console.log(`\nS4-ENDPOINT RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);

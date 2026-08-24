// Test de lógica del endpoint Option C (mock GoTrue/DB; PIN PBKDF2 real). node api/proc-token.optionc.test.mjs
import { createRequire } from "module";
import crypto from "crypto";
const require = createRequire(import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SESSION_SECRET = "sess"; // faltanSecretos() → false
process.env.PROC_THROTTLE_SECRET = "test-throttle-secret-0123456789";               // S4: throttle activo
const { makeHandler } = require("./proc-token.js");
const AUA = "a0000000-0000-0000-0000-0000000000a1";

const ALS = "5aa10886-2a76-4a9e-9bc3-303fb776cd49", B = "11111111-1111-1111-1111-111111111111";
function cred(pin) { const salt = crypto.randomBytes(16); const hash = crypto.pbkdf2Sync(pin, salt, 100000, 32, "sha256");
  return { v: 1, iter: 100000, salt: salt.toString("hex"), hash: hash.toString("hex") }; }
const { verifyPinPBKDF2 } = require("./_iamToken.js");

// Fábrica de deps mock para un escenario.
function deps(scn) {
  const patched = {};
  return {
    _patched: patched,
    getJSON: async (path) => {
      if (path.includes("id=eq.main")) return [{ value: { usuarios: scn.usuarios } }];
      if (path.includes("id=eq.pins")) return [{ value: scn.pins }];
      if (path.includes("select=auth_user_id")) return [{ auth_user_id: scn.rebind ?? AUA }];  // re-fetch binding (S4)
      if (path.startsWith("iam_usuario?email=")) return scn.iam ? [scn.iam] : [];
      if (path.startsWith("iam_usuario_empresa?")) return scn.mems || [];
      if (path.startsWith("contab_empresas?")) return [{ id: ALS, codigo: "ALS", nombre: "Allegria Service" }, { id: B, codigo: "BET", nombre: "Empresa B" }];
      return [];
    },
    rpc: async (fn) => (fn === "proc_fn_auth_attempt" ? (scn.allowed !== false) : null),
    patch: async (path, body) => { patched.path = path; patched.body = body; },
    admin: {
      ensureUser: async () => scn.authUser || { id: "a0000000-0000-0000-0000-0000000000a1" },
      mintSession: async () => scn.session || { access_token: "AT", refresh_token: "RT", expires_at: 123 },
    },
    verifyPin: verifyPinPBKDF2,
  };
}
function resMock() { const o = { code: 0, body: null }; return { status(c){o.code=c;return this;}, json(b){o.body=b;return o;}, _o:o }; }
async function call(scn, body) { const h = makeHandler(deps(scn)); const res = resMock();
  await h({ method: "POST", headers: {}, body }, res); return res._o; }

let P = 0, F = 0; const ck = (l, ok, d) => { if (ok) { P++; console.log("PASS", l); } else { F++; console.log("FAIL", l, JSON.stringify(d)); } };

const angelo = { usuarios: [{ nombre: "Angelo", email: "a@x.cl" }], pins: { Angelo_h: cred("1234") },
  iam: { id: "iam-ang", auth_user_id: null }, mems: [{ empresa_id: ALS }] };

// 01 PIN correcto → token
let r = await call(angelo, { email: "a@x.cl", pin: "1234" });
ck("E2E-01 pin ok → token", r.code === 200 && r.body.access_token === "AT", r.body);
ck("E2E-06 single auto ALS", r.body.empresa_id === ALS, r.body);
ck("E2E-08 iam actor id", r.body.iam_usuario_id === "iam-ang", r.body);
ck("E2E-07 sub=auth.users.id", r.body.sub === "a0000000-0000-0000-0000-0000000000a1", r.body);
// binding bootstrap: patch auth_user_id
r = await call(angelo, { email: "a@x.cl", pin: "1234" });
// 02 PIN incorrecto → DENY
r = await call(angelo, { email: "a@x.cl", pin: "9999" });
ck("E2E-02 pin malo → 401", r.code === 401, r);
// 03 sin hash → DENY (solo plaintext legacy en pins)
r = await call({ ...angelo, pins: { Angelo: "1234" } }, { email: "a@x.cl", pin: "1234" });
ck("E2E-03/04 sin hash y plano imposible → 401", r.code === 401, r);
// 05 sin membership → DENY
r = await call({ ...angelo, mems: [] }, { email: "a@x.cl", pin: "1234" });
ck("E2E-05 sin membership → 403", r.code === 403 && r.body.error === "sin_membership", r.body);
// identidad no provisionada
r = await call({ ...angelo, iam: null }, { email: "a@x.cl", pin: "1234" });
ck("E2E identidad_no_provisionada → 403", r.code === 403 && r.body.error === "identidad_no_provisionada", r.body);
// binding conflicto → FAIL CLOSED
r = await call({ ...angelo, iam: { id: "iam-ang", auth_user_id: "OTRO" } }, { email: "a@x.cl", pin: "1234" });
ck("E2E binding_conflicto → 403", r.code === 403 && r.body.error === "binding_conflicto", r.body);
// N sin selección → needs_selection (sin token)
const multi = { ...angelo, iam: { id: "iam-m", auth_user_id: "a0000000-0000-0000-0000-0000000000a1" }, mems: [{ empresa_id: ALS }, { empresa_id: B }] };
r = await call(multi, { email: "a@x.cl", pin: "1234" });
ck("E2E-16 N sin selección → lista, sin token", r.code === 200 && r.body.needs_selection === true && !r.body.access_token && r.body.memberships.length === 2, r.body);
// N con selección válida → token
r = await call(multi, { email: "a@x.cl", pin: "1234", empresa_id: B });
ck("E2E N selección válida → token B", r.code === 200 && r.body.access_token === "AT" && r.body.empresa_id === B, r.body);
// N con selección arbitraria (no membership) → needs_selection (NO token)
r = await call(multi, { email: "a@x.cl", pin: "1234", empresa_id: "22222222-2222-2222-2222-222222222222" });
ck("E2E-15 N selección no autorizada → sin token", r.code === 200 && r.body.needs_selection === true && !r.body.access_token, r.body);
// 26 rate limit → 429
r = await call({ ...angelo, allowed: false }, { email: "a@x.cl", pin: "1234" });
ck("E2E-26 rate limit → 429", r.code === 429, r);
// binding bootstrap patch aplicado
{ const d = deps(angelo); const h = makeHandler(d); const res = resMock();
  await h({ method: "POST", headers: {}, body: { email: "a@x.cl", pin: "1234" } }, res);
  ck("E2E binding bootstrap patch", d._patched.body && d._patched.body.auth_user_id === "a0000000-0000-0000-0000-0000000000a1", d._patched); }
// REGRESIÓN (staging real): la app guarda `_h` como STRING JSON (JSON.stringify(cred)), no objeto.
// El endpoint debe parsearlo antes de verifyPinPBKDF2. Sin el parse → 401 (bug que vimos en el Preview).
const angeloStr = { ...angelo, pins: { Angelo_h: JSON.stringify(cred("1234")) } };
r = await call(angeloStr, { email: "a@x.cl", pin: "1234" });
ck("E2E-STR _h string JSON → token (parse)", r.code === 200 && r.body.access_token === "AT", r.body);
r = await call(angeloStr, { email: "a@x.cl", pin: "9999" });
ck("E2E-STR _h string + pin malo → 401", r.code === 401, r);
// `_h` string malformado → FAIL CLOSED (no crashea, no autentica)
r = await call({ ...angelo, pins: { Angelo_h: "{no-es-json" } }, { email: "a@x.cl", pin: "1234" });
ck("E2E-STR _h malformado → 401 fail-closed", r.code === 401, r);

console.log(`\nOPTIONC-LOGIC RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);

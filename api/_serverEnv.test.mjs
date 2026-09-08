// api/_serverEnv.test.mjs — SEC-ENV-002 (STG-7b) regression.
// Ejecuta: node api/_serverEnv.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { resolverServerEnv } = require("./_serverEnv.js");

const STAGING = "https://nlvfjpwiecgrosjnwwik.supabase.co";
const PROD = "https://bywovqayuzodbzwsriet.supabase.co";

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log("PASS " + name); } else { fail++; console.log("FAIL " + name); } }
function throws(env) { try { resolverServerEnv(env); return false; } catch (_) { return true; } }
function resolves(env) { try { return resolverServerEnv(env).SUPABASE_REF; } catch (e) { return "THREW:" + e.message; } }

// Matriz CFO §5
ok("preview + staging URL = PASS",        resolves({ APP_ENV: "preview",    SUPABASE_URL: STAGING }) === "nlvfjpwiecgrosjnwwik");
ok("staging + staging URL = PASS",        resolves({ APP_ENV: "staging",    SUPABASE_URL: STAGING }) === "nlvfjpwiecgrosjnwwik");
ok("preview + PROD URL = HARD FAIL",      throws({ APP_ENV: "preview",    SUPABASE_URL: PROD }));
ok("staging + PROD URL = HARD FAIL",      throws({ APP_ENV: "staging",    SUPABASE_URL: PROD }));
ok("missing SUPABASE_URL = HARD FAIL",    throws({ APP_ENV: "preview",    SUPABASE_URL: "" }));
ok("missing APP_ENV + staging = PASS (contrato: sin tripwire, exige URL)", resolves({ SUPABASE_URL: STAGING }) === "nlvfjpwiecgrosjnwwik");
ok("missing APP_ENV + missing URL = HARD FAIL", throws({}));
ok("production + staging URL = HARD FAIL", throws({ APP_ENV: "production", SUPABASE_URL: STAGING }));
ok("production + PROD URL = PASS (completitud)", resolves({ APP_ENV: "production", SUPABASE_URL: PROD }) === "bywovqayuzodbzwsriet");
ok("APP_ENV inválido = HARD FAIL",         throws({ APP_ENV: "prod",       SUPABASE_URL: STAGING }));
ok("URL mal formada = HARD FAIL",          throws({ APP_ENV: "preview",    SUPABASE_URL: "not-a-url" }));

// Lazy: importar endpoints con deps inyectadas NO rompe sin env
let lazyOk = true;
try {
  const { makeAdmin } = require("./_supaAdmin.js");           // require no debe lanzar (lazy)
  const adm = makeAdmin({ url: "http://x", service: "s", anon: "a", fetchImpl: async () => ({}) });
  lazyOk = !!adm; // makeAdmin con url inyectada NO evalúa serverSupaUrl() → no lanza aunque falte env
} catch (_) { lazyOk = false; }
ok("resolver lazy: makeAdmin con url inyectada no lanza (testeable sin env)", lazyOk);

let importOk = true;
try { require("./_auth.js"); require("./storage.js"); require("./informe.js"); } catch (_) { importOk = false; }
ok("resolver lazy: require de endpoints no lanza al importar", importOk);

console.log(`\nSERVER-ENV RESULT: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);

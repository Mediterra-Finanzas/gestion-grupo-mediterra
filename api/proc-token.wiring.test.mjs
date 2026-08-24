// Regresión de wiring real: realRpc/realPatch DEBEN mandar Content-Type: application/json
// (PostgREST responde 415 sin él). node api/proc-token.wiring.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
process.env.SUPABASE_URL = "https://nlvfjpwiecgrosjnwwik.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "svc"; process.env.SESSION_SECRET = "sess";
const { realRpc, realPatch } = require("./proc-token.js");

let P = 0, F = 0; const ok = (c, m) => { if (c) { P++; console.log("PASS", m); } else { F++; console.log("FAIL", m); } };
let captured = null;
global.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, text: async () => "true" }; };

await realRpc("proc_fn_auth_attempt", { p_key: "x".repeat(64) });
ok(captured.opts.headers["Content-Type"] === "application/json", "realRpc envía Content-Type: application/json");
ok(captured.url.endsWith("/rest/v1/rpc/proc_fn_auth_attempt"), "realRpc pega al path RPC correcto");
ok(captured.opts.headers.apikey === "svc" && /Bearer svc/.test(captured.opts.headers.Authorization), "realRpc usa service_role");

await realPatch("iam_usuario?id=eq.1&auth_user_id=is.null", { auth_user_id: "u" });
ok(captured.opts.method === "PATCH" && captured.opts.headers["Content-Type"] === "application/json", "realPatch envía Content-Type: application/json");

console.log(`\nWIRING RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);

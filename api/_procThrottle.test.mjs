// Tests del rate-limit HMAC por capas. node api/_procThrottle.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const T = require("./_procThrottle.js");

let P = 0, F = 0; const ok = (c, m) => { if (c) { P++; console.log("PASS", m); } else { F++; console.log("FAIL", m); } };
const SEC = "test-throttle-secret-0123456789";
const HEX64 = /^[a-f0-9]{64}$/;

// S4-16/17 HMAC opaco determinístico + formato
const b1 = T.bucket(SEC, "identity", "a@x.cl");
ok(HEX64.test(b1), "S4-16 bucket = hex64 opaco");
ok(b1 === T.bucket(SEC, "identity", "a@x.cl"), "HMAC determinístico");
ok(b1 !== T.bucket(SEC, "identity-ip", "a@x.cl"), "domain separation cambia el bucket");
ok(b1 !== T.bucket("otro-secret", "identity", "a@x.cl"), "secreto distinto → bucket distinto");

// IP autoritativa: x-real-ip primario; fallback último segmento XFF; null si no hay
ok(T.trustedIp({ headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }) === "9.9.9.9", "IP: x-real-ip primario");
ok(T.trustedIp({ headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }) === "2.2.2.2", "IP: fallback último segmento XFF (Vercel)");
ok(T.trustedIp({ headers: {} }) === null, "IP: null si ausente");

// bucketsFor: con IP → 2 capas; sin IP → solo identidad
ok(T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: "9.9.9.9" }).length === 2, "S4-17 con IP → 2 buckets");
ok(T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: null }).length === 1, "S4-19 sin IP → solo identidad");

// S4-18 nunca PII: los buckets no contienen email ni IP
const keys = T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: "9.9.9.9" });
ok(keys.every((k) => HEX64.test(k) && !k.includes("@") && !k.includes("9.9.9.9")), "S4-18 buckets sin PII (email/IP)");

// S4-19 rotar IP NO cambia el bucket de identidad → no evade el límite por identidad
const idA = T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: "1.1.1.1" })[0];
const idB = T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: "2.2.2.2" })[0];
ok(idA === idB, "S4-19 identity bucket idéntico aunque cambie la IP");

// checkAttempt: capa de identidad bloqueada → allowed=false aunque la de IP permita
{
  const rpc = async (fn, args) => (args.p_key === idA ? false : true); // identidad bloqueada
  const r = await T.checkAttempt({ rpc }, { secret: SEC, email: "a@x.cl", ip: "1.1.1.1" });
  ok(r.allowed === false, "S4-20 identidad bloqueada → request bloqueada (IP no la salva)");
}
// checkAttempt: capa IP bloqueada → allowed=false
{
  const ipKey = T.bucketsFor({ secret: SEC, email: "a@x.cl", ip: "1.1.1.1" })[1];
  const rpc = async (fn, args) => (args.p_key === ipKey ? false : true);
  const r = await T.checkAttempt({ rpc }, { secret: SEC, email: "a@x.cl", ip: "1.1.1.1" });
  ok(r.allowed === false, "capa IP bloqueada → request bloqueada");
}
// todo permitido → allowed=true; reset llama ambas capas
{
  const calls = []; const rpc = async (fn, args) => { calls.push([fn, args.p_key]); return true; };
  const r = await T.checkAttempt({ rpc }, { secret: SEC, email: "a@x.cl", ip: "1.1.1.1" });
  ok(r.allowed === true && r.keys.length === 2, "todo permitido → allowed, 2 capas");
  await T.resetKeys({ rpc }, r.keys);
  ok(calls.filter(([f]) => f === "proc_fn_auth_reset").length === 2, "S4-21 reset limpia ambas capas");
}
// fail-closed sin secreto
try { T.bucketsFor({ secret: "", email: "a@x.cl", ip: null }); ok(false, "sin secreto debía throw"); }
catch (e) { ok(e.failClosed === true, "S4-fail-closed: sin PROC_THROTTLE_SECRET → throw failClosed"); }

console.log(`\nPROCTHROTTLE RESULT: PASS=${P} FAIL=${F}`);
if (F > 0) process.exit(1);

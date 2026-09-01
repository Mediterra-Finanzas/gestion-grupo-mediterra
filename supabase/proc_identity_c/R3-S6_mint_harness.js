// ============================================================================
// R3-S6_mint_harness.js - Harness LOCAL UAT-only para certificar revocation-next-request
// SAME JWT en el stack REAL de staging, sin password grant. Reusa api/_supaAdmin.js (mintSession =
// admin/generate_link magiclink -> verify). service_role SOLO en este proceso Node (server-side),
// NUNCA browser, NUNCA impreso, NUNCA a repo/log. J1 vive SOLO en memoria del proceso.
//
// Uso (en la maquina del operador, con env de STAGING):
//   SUPABASE_URL=https://nlvfjpwiecgrosjnwwik.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service staging> SUPABASE_ANON_KEY=<anon staging> \
//   node supabase/proc_identity_c/R3-S6_mint_harness.js
// Corre por fases con PAUSAS: en cada pausa el operador corre el SQL indicado en el SQL Editor.
// ============================================================================
const crypto = require("crypto");

const EMAIL = "uat-revoke-r3s6@fixture.invalid";
const AUID  = "78313a98-1a83-4d3d-b11a-eddce226bb3c";
const A     = "f1000000-0000-0000-0000-0000000000aa";
const PROD  = "bywovqayuzodbzwsriet";      // Production - HANDS-OFF
const STAG  = "nlvfjpwiecgrosjnwwik";      // staging - unico target permitido

function b64urlToStr(s){ return Buffer.from(String(s).replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"); }
function decodeClaims(t){ return JSON.parse(b64urlToStr(String(t).split(".")[1])); }
function sha256(t){ return crypto.createHash("sha256").update(String(t)).digest("hex"); }

// Nucleo testeable: deps inyectables (admin/who/rows/pause/log) para rehearsal sin remoto.
// who(token) -> empresa (uuid|null) ; rows(token) -> {status, motivos:[...]} ; pause(msg) -> Promise
async function runRevocationE2E({ admin, who, rows, pause, log }) {
  // ---- T0 : mint J1 real + baseline ALLOW ----
  const sess = await admin.mintSession(EMAIL);
  const J1 = sess && sess.access_token;
  if (!J1) throw new Error("mint: sin access_token");
  const c0 = decodeClaims(J1);
  const now0 = Math.floor(Date.now() / 1000);
  if (c0.sub !== AUID) throw new Error("claim sub != AUID (got " + c0.sub + ")");
  if (c0.role !== "authenticated") throw new Error("claim role != authenticated (got " + c0.role + ")");
  if (!(c0.exp > now0)) throw new Error("token ya expirado en T0");
  const FP0 = sha256(J1);
  log("T0 mint OK | sub=" + c0.sub + " role=" + c0.role + " exp>now=" + (c0.exp > now0) +
      " secsToExp=" + (c0.exp - now0) + " sha256=" + FP0.slice(0, 16) + "...");
  let e = await who(J1), r = await rows(J1);
  const t0 = (e === A) && r.status === 200 && r.motivos.length === 1 && r.motivos[0] === "R3S6-FIXTURE-A";
  log("T0 who=" + e + " rows.status=" + r.status + " rows=" + JSON.stringify(r.motivos) + " => " + (t0 ? "ALLOW" : "??"));
  if (!t0) throw new Error("T0 no dio ALLOW");

  await pause("T1: corre R3-S6_revoke.sql (membership.activo=false) en el SQL Editor. NO re-login, NO refresh.");

  // ---- T2 : MISMO J1 (byte-identico), sin re-login/refresh ----
  const c2 = decodeClaims(J1), now2 = Math.floor(Date.now() / 1000);
  const same2 = sha256(J1) === FP0, valid2 = c2.exp > now2;
  e = await who(J1); r = await rows(J1);
  const t2 = (e === null || e === undefined) && r.status === 200 && r.motivos.length === 0;
  log("T2 SAME-JWT sha256==T0:" + same2 + " exp>now:" + valid2 + " | who=" + e +
      " rows.status=" + r.status + " rows=" + JSON.stringify(r.motivos) + " => " + (t2 ? "DENY" : "??"));
  if (!(same2 && valid2)) throw new Error("T2: el token NO es el mismo J1 vigente (same=" + same2 + " valid=" + valid2 + ")");
  if (!t2) throw new Error("T2 no dio DENY (revocation next-request fallo)");

  await pause("T3: corre R3-S6_restore.sql (membership.activo=true) en el SQL Editor. Mismo J1.");

  // ---- T2b : MISMO J1, ALLOW restaurado sin re-login ----
  const c3 = decodeClaims(J1), now3 = Math.floor(Date.now() / 1000);
  const same3 = sha256(J1) === FP0, valid3 = c3.exp > now3;
  e = await who(J1); r = await rows(J1);
  const t2b = (e === A) && r.status === 200 && r.motivos.length === 1 && r.motivos[0] === "R3S6-FIXTURE-A";
  log("T2b SAME-JWT sha256==T0:" + same3 + " exp>now:" + valid3 + " | who=" + e +
      " rows.status=" + r.status + " => " + (t2b ? "ALLOW" : "??"));
  if (!(same3 && valid3 && t2b)) throw new Error("T2b no restauro ALLOW con el mismo J1");

  log("R3-S6 E2E OK: revocation-next-request SAME-JWT probado (ALLOW -> DENY -> ALLOW) sin re-login/refresh; sha256(J1) constante T0/T2/T2b; exp vigente en todo momento.");
  return { fingerprintT0: FP0.slice(0, 16), ok: true };
}

module.exports = { runRevocationE2E, decodeClaims, sha256, EMAIL, AUID, A, PROD, STAG };

// ---------------- CLI real (staging) ----------------
if (require.main === module) {
  (async () => {
    const URL = process.env.SUPABASE_URL || "";
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const ANON = process.env.SUPABASE_ANON_KEY || "";
    if (URL.indexOf(PROD) !== -1) { console.error("ABORT: SUPABASE_URL apunta a PRODUCTION. HANDS-OFF."); process.exit(1); }
    if (URL.indexOf(STAG) === -1) { console.error("ABORT: SUPABASE_URL no es staging (" + STAG + ")."); process.exit(1); }
    if (!SERVICE || !ANON) { console.error("ABORT: faltan SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY en el env."); process.exit(1); }
    const { makeAdmin } = require("../../api/_supaAdmin.js");
    const admin = makeAdmin({ url: URL, service: SERVICE, anon: ANON });
    const who = async (tok) => {
      const r = await fetch(URL + "/rest/v1/rpc/proc_whoami", {
        method: "POST",
        headers: { apikey: ANON, Authorization: "Bearer " + tok, "Content-Type": "application/json", "X-Proc-Empresa": A },
        body: "{}",
      });
      const j = await r.json();
      return j && j.empresa;
    };
    const rows = async (tok) => {
      const r = await fetch(URL + "/rest/v1/proc_repaletizaje?select=motivo", {
        headers: { apikey: ANON, Authorization: "Bearer " + tok, "X-Proc-Empresa": A },
      });
      const j = await r.json();
      return { status: r.status, motivos: Array.isArray(j) ? j.map((x) => x.motivo) : [] };
    };
    const readline = require("readline");
    const pause = (msg) => new Promise((res) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question("\n[PAUSA] " + msg + "\n  -> Enter para continuar: ", () => { rl.close(); res(); });
    });
    try {
      await runRevocationE2E({ admin, who, rows, pause, log: (m) => console.log(m) });
      console.log("\nCERTIFICADO. Corre ahora R3-S6_cleanup.sql y luego borra el auth user en el Dashboard.");
    } catch (e) {
      console.error("R3-S6 E2E FAIL:", e.message);
      process.exit(2);
    }
  })();
}

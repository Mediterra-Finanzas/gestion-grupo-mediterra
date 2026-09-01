// ============================================================================
// R3-S7_deny_harness.js - Harness LOCAL UAT-only: certifica que un usuario AUTHENTICATED REAL
// SIN acceso PROC (sin iam identity / sin membership) queda DENEGADO (whoami null, rows [], WRITE 403).
// Reusa api/_supaAdmin.js mintSession (generate_link+verify, server-side, sin email). NO password grant.
// service_role SOLO en este proceso Node; NUNCA browser/log/repo. JWT solo en memoria (sha256, no token).
// NO crea/borra/muta nada: mintear un usuario EXISTENTE no lo modifica; el WRITE es bloqueado por RLS
// antes de persistir. Target email se pasa por env R3S7_TARGET_EMAIL. TARGET staging unicamente.
//
// Uso:
//   SUPABASE_URL=https://nlvfjpwiecgrosjnwwik.supabase.co SUPABASE_SERVICE_ROLE_KEY=<...> \
//   SUPABASE_ANON_KEY=<...> R3S7_TARGET_EMAIL=<email de un auth_sin_iam> \
//   node supabase/proc_identity_c/R3-S7_deny_harness.js
// ============================================================================
const crypto = require("crypto");

const PROD = "bywovqayuzodbzwsriet";
const STAG = "nlvfjpwiecgrosjnwwik";
const SPOOF = "11111111-1111-1111-1111-111111111111";   // empresa a la que el target NO pertenece
const PROBE = "R3S7-DENY-PROBE";

function b64urlToStr(s){ return Buffer.from(String(s).replace(/-/g,"+").replace(/_/g,"/"), "base64").toString("utf8"); }
function decodeClaims(t){ return JSON.parse(b64urlToStr(String(t).split(".")[1])); }
function sha256(t){ return crypto.createHash("sha256").update(String(t)).digest("hex"); }

// Nucleo testeable. deps: admin.mintSession, resolveEmpresa(codigo)->uuid, who(tok,emp)->empresa|null,
// rows(tok,emp)->{status,motivos[]}, writeAttempt(tok,emp,motivo)->{status,body}, log, targetEmail.
async function runDenyE2E({ admin, resolveEmpresa, who, rows, writeAttempt, log, targetEmail }) {
  const fails = [];
  const chk = (cond, label) => { log((cond ? "PASS " : "FAIL ") + label); if (!cond) fails.push(label); };

  // --- mint J (usuario existente; no lo muta) ---
  const sess = await admin.mintSession(targetEmail);
  const J = sess && sess.access_token;
  if (!J) throw new Error("mint: sin access_token para " + targetEmail);
  const c = decodeClaims(J);
  const now = Math.floor(Date.now() / 1000);
  log("A identidad: target=" + targetEmail + " sub=" + c.sub + " role=" + c.role +
      " exp>now=" + (c.exp > now) + " sha256=" + sha256(J).slice(0, 16) + "...");
  chk(c.role === "authenticated", "A role=authenticated");
  chk(c.exp > now, "A exp>now (token vigente)");

  const ALS = await resolveEmpresa("ALS");
  log("   (empresa ALS resuelta server-side = " + ALS + ")");

  // --- B: sin header empresa -> DENY ---
  chk((await who(J, null)) == null, "B who() sin header => null");
  const rB = await rows(J, null);
  chk(rB.status === 200 && rB.motivos.length === 0, "B rows() sin header => [] (status " + rB.status + ")");

  // --- C: header ALS (no es miembro) -> DENY ---
  chk((await who(J, ALS)) == null, "C who(ALS) => null");
  const rC = await rows(J, ALS);
  chk(rC.status === 200 && rC.motivos.length === 0, "C rows(ALS) => [] (status " + rC.status + ")");

  // --- D: spoof empresa ajena -> DENY ---
  chk((await who(J, SPOOF)) == null, "D who(spoof) => null");
  const rD = await rows(J, SPOOF);
  chk(rD.status === 200 && rD.motivos.length === 0, "D rows(spoof) => [] (status " + rD.status + ")");

  // --- E: WRITE controlado (destinado a ser bloqueado por RLS antes de persistir) ---
  const w = await writeAttempt(J, ALS, PROBE);
  chk(w.status === 403 || w.status === 401, "E WRITE proc_repaletizaje(ALS) => " + w.status + " DENY (WITH CHECK)");

  if (fails.length) throw new Error("DENY NO se cumplio en: " + fails.join(" | "));
  log("R3-S7 DENY OK: authenticated real (" + targetEmail + ") SIN acceso PROC = DENY total (whoami null, rows [], WRITE " + w.status + "). Verificar aparte DATA MODIFIED=0 (motivo '" + PROBE + "').");
  return { ok: true, probe: PROBE, sha: sha256(J).slice(0, 16) };
}

module.exports = { runDenyE2E, decodeClaims, sha256, SPOOF, PROBE, PROD, STAG };

// ---------------- CLI real (staging) ----------------
if (require.main === module) {
  (async () => {
    const URL = process.env.SUPABASE_URL || "";
    const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const ANON = process.env.SUPABASE_ANON_KEY || "";
    const TARGET = process.env.R3S7_TARGET_EMAIL || "";
    if (URL.indexOf(PROD) !== -1) { console.error("ABORT: SUPABASE_URL apunta a PRODUCTION. HANDS-OFF."); process.exit(1); }
    if (URL.indexOf(STAG) === -1) { console.error("ABORT: SUPABASE_URL no es staging (" + STAG + ")."); process.exit(1); }
    if (!SERVICE || !ANON) { console.error("ABORT: faltan SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY en el env."); process.exit(1); }
    if (!TARGET) { console.error("ABORT: falta R3S7_TARGET_EMAIL (email de un auth_sin_iam)."); process.exit(1); }
    const { makeAdmin } = require("../../api/_supaAdmin.js");
    const admin = makeAdmin({ url: URL, service: SERVICE, anon: ANON });
    // resolveEmpresa via service_role (bypassa RLS), server-side, no browser
    const resolveEmpresa = async (codigo) => {
      const r = await fetch(URL + "/rest/v1/contab_empresas?select=id&codigo=eq." + encodeURIComponent(codigo),
        { headers: { apikey: SERVICE, Authorization: "Bearer " + SERVICE } });
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) throw new Error("no se resolvio empresa " + codigo);
      return j[0].id;
    };
    const H = (tok, emp) => { const h = { apikey: ANON, Authorization: "Bearer " + tok }; if (emp) h["X-Proc-Empresa"] = emp; return h; };
    const who = async (tok, emp) => {
      const r = await fetch(URL + "/rest/v1/rpc/proc_whoami", { method: "POST", headers: { ...H(tok, emp), "Content-Type": "application/json" }, body: "{}" });
      const j = await r.json(); return j && j.empresa;
    };
    const rows = async (tok, emp) => {
      const r = await fetch(URL + "/rest/v1/proc_repaletizaje?select=motivo", { headers: H(tok, emp) });
      const j = await r.json(); return { status: r.status, motivos: Array.isArray(j) ? j.map((x) => x.motivo) : [] };
    };
    const writeAttempt = async (tok, emp, motivo) => {
      const r = await fetch(URL + "/rest/v1/proc_repaletizaje", {
        method: "POST", headers: { ...H(tok, emp), "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ empresa_id: emp, motivo }) });
      let body = null; try { body = await r.json(); } catch (e) {}
      return { status: r.status, body };
    };
    try {
      await runDenyE2E({ admin, resolveEmpresa, who, rows, writeAttempt, log: (m) => console.log(m), targetEmail: TARGET });
      console.log("\nCERTIFICADO. Verifica DATA MODIFIED=0 con: SELECT count(*) FROM proc_repaletizaje WHERE motivo='" + PROBE + "';  (esperado 0)");
    } catch (e) { console.error("R3-S7 DENY FAIL:", e.message); process.exit(2); }
  })();
}

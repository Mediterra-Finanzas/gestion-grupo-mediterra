/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// MAIN-JSONB-400 — reproducción + certificación del HF-JSONB contra un PostgREST
// REAL (no MOCK: el fakeSupabase en memoria guarda el value verbatim y jamás
// reproduce el rechazo jsonb de Postgres — por eso este bug pasó el pre-deploy).
//
// SÍNTOMA (PROD): la fila `main` es la ÚNICA object-encoded en `calendario_data`.
// Cuando su valor lleva un carácter que jsonb NO admite en texto — U+0000 (byte
// nulo) o un sustituto UTF-16 suelto, que llegan del texto tipeado por el usuario
// en comentarios/estados de Tareas — el PATCH condicionado de persistContract cae
// con HTTP 400 (Postgres 22P05 "unsupported Unicode escape sequence" / PGRST102
// "Empty or invalid json"), y `main` NO se guarda en cada ciclo. Las filas
// string-encoded (usuarios/pins/finanzas) son inmunes: el doble JSON.stringify
// guarda el escape como texto literal, nunca como carácter jsonb.
//
// BEFORE = lo que persistContract enviaba antes del HF (PATCH object con el U+0000
//          verbatim) → 400.
// AFTER  = persistContract.saveConfirmed (post-HF: _sanearJsonb en el camino
//          objeto) → 200, la fila persiste, el U+0000 se elimina, el emoji (par
//          sustituto válido) se conserva, y las filas string-encoded no cambian.
//
// REQUIERE un PostgREST local (Docker). Env:
//   LOCAL_PGRST_URL   p.ej. http://127.0.0.1:3070   (con /rest/v1 servible)
//   LOCAL_PGRST_JWT   un JWT {"role":"anon"} HS256 efímero del secreto local
// Sin esos env → SKIP (exit 0). NUNCA apuntar a PROD (tripwire aborta).
//
//   node tests/permisos/main_jsonb_400.harness.mjs
// ═══════════════════════════════════════════════════════════════════════════════
import { crearPersistencia } from "../../src/persistencia/persistContract.js";

const URL = process.env.LOCAL_PGRST_URL || null;
const JWT = process.env.LOCAL_PGRST_JWT || null;
const mudo = { info: () => {}, warn: () => {}, error: () => {} };
let pass = 0, fail = 0; const fallos = [];
const check = (id, desc, cond, nota = "") => { if (cond) { pass++; console.log(`✓ ${id}  ${desc}`); } else { fail++; fallos.push(id); console.log(`✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); } };

if (!URL || !JWT) {
  console.log("── MAIN-JSONB-400 · SKIP: falta LOCAL_PGRST_URL/LOCAL_PGRST_JWT (requiere PostgREST local). No es una falla. ──");
  process.exit(0);
}
if (/bywovqayuzodbzwsriet/.test(URL)) { console.error("ABORT: LOCAL_PGRST_URL apunta a PROD. Solo PostgREST local."); process.exit(2); }

const NUL = String.fromCharCode(0); // U+0000, sin escapes en fuente
const H = () => ({ apikey: JWT, Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" });
async function seed(id, valueField) {
  await fetch(`${URL}/rest/v1/calendario_data?id=eq.${id}`, { method: "DELETE", headers: H() });
  const r = await fetch(`${URL}/rest/v1/calendario_data`, { method: "POST", headers: { ...H(), Prefer: "return=representation" }, body: JSON.stringify({ id, value: valueField, updated_at: new Date().toISOString() }) });
  const j = await r.json(); return j[0].updated_at;
}
async function getRow(id) { const r = await fetch(`${URL}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H() }); return (await r.json())[0] || null; }

console.log("\n── MAIN-JSONB-400 · MODO=POSTGREST-REAL ──");

// ── BEFORE: el PATCH condicionado object con U+0000 verbatim (comportamiento pre-HF) → 400 ──
{
  const ver = await seed("mjmain", { estados: { t: "x" } }); // object-encoded
  const body = JSON.stringify({ value: { estados: { t: "bad" + NUL + "y" } }, updated_at: new Date().toISOString() });
  const r = await fetch(`${URL}/rest/v1/calendario_data?id=eq.mjmain&updated_at=eq.${encodeURIComponent(ver)}`, { method: "PATCH", headers: { ...H(), Prefer: "return=representation" }, body });
  const txt = await r.text();
  check("BEFORE", "PATCH object con U+0000 → HTTP 400 (jsonb lo rechaza)", r.status === 400 && /22P05|PGRST102|Unicode|invalid json/i.test(txt), `status=${r.status} body=${txt.slice(0, 120)}`);
  const row = await getRow("mjmain");
  check("BEFORE-2", "la fila NO se tocó (server preservado, sin false-save)", JSON.stringify(row.value) === JSON.stringify({ estados: { t: "x" } }));
}

// ── AFTER: persistContract.saveConfirmed (post-HF) → 200, persiste, U+0000 fuera, emoji intacto ──
{
  const ver = await seed("mjmain", { estados: { t: "x" } }); // object-encoded
  const P = crearPersistencia({ supaUrl: URL, supaKey: JWT, fetch: globalThis.fetch, logger: mudo });
  P.registrarCarga("mjmain", { estados: { t: "x" } }, ver, false); // 4º arg false = encoding desconocido (como App.dbLoad)
  const r = await P.saveConfirmed("mjmain", { estados: { t: "bad" + NUL + "y" }, comentarios: { c: "ok😀 世界" }, n: 5, flag: true, z: null }, {});
  const row = await getRow("mjmain");
  check("AFTER", "saveConfirmed object saneado → ok:true (persiste)", r.ok === true, `motivo=${r.motivo} status=${r.status}`);
  check("AFTER-2", "la fila quedó object-encoded (no se flipeó a string; rollback-safe)", row && typeof row.value === "object" && !Array.isArray(row.value));
  check("AFTER-3", "U+0000 eliminado del valor persistido", row && !JSON.stringify(row.value).includes(NUL) && row.value.estados.t === "bady");
  check("AFTER-4", "emoji (par sustituto válido) y CJK conservados", row && row.value.comentarios.c === "ok😀 世界");
  check("AFTER-5", "tipos no-string intactos", row && row.value.n === 5 && row.value.flag === true && row.value.z === null);
}

// ── NO-REGRESIÓN: una fila string-encoded (usuarios) con el MISMO carácter sigue guardando 200 y no cambia de codificación ──
{
  const ver = await seed("mjusr", JSON.stringify([{ n: "A" }])); // string-encoded
  const P = crearPersistencia({ supaUrl: URL, supaKey: JWT, fetch: globalThis.fetch, logger: mudo });
  P.registrarCarga("mjusr", [{ n: "A" }], ver, true); // 4º arg true = string
  const r = await P.saveConfirmed("mjusr", [{ n: "A" }, { n: "bad" + NUL + "x" }], {});
  const row = await getRow("mjusr");
  check("STR-1", "fila string-encoded guarda 200 (inmune, camino sin tocar)", r.ok === true);
  check("STR-2", "sigue string-encoded (el fix no la toca)", row && typeof row.value === "string");
}

console.log(`\n── RESUMEN MAIN-JSONB-400: PASS=${pass} FAIL=${fail} ${fail ? ("FALLOS: " + fallos.join(",")) : ""} ──`);
process.exit(fail ? 1 : 0);

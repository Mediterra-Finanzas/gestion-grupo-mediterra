/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// stale-compat.mjs — compatibilidad bidireccional bundle NUEVO ↔ VIEJO (F0-C).
//
// Prueba, contra STAGING y sobre una fila FIXTURE, que la preservación de la
// codificación física hace SEGURO convivir con pestañas del bundle viejo y hacer
// rollback del frontend:
//   SC-01 NEW escribe  → OLD lee (JSON.parse crudo)      … sin romperse
//   SC-02 OLD escribe  → NEW lee (capability.load)       … sin romperse
//   SC-03 NEW escribe  → ROLLBACK a OLD → OLD sigue cargando (JSON.parse no lanza)
//
// El bundle VIEJO se emula con transporte crudo:
//   - lector viejo  = GET + JSON.parse(value)  INCONDICIONAL (lo que hacía dbLoad).
//   - escritor viejo = POST value:JSON.stringify(obj) (string-encoded, LWW histórico).
//
// SEGURIDAD: tripwire staging (ref nlvfjpwiecgrosjnwwik), llaves por ENV, solo filas
// '_f0_rt_probe_*', borradas al final. NO se ejecuta en la sesión del agente.
//
// Uso:  SUPA_URL=... SUPA_KEY=... node tests/persistencia-staging/stale-compat.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia } from "../../src/persistencia/persistContract.js";

// ── Tripwire ─────────────────────────────────────────────────────────────────────
const STAGING_REF = "nlvfjpwiecgrosjnwwik";
const SUPA_URL = process.env.SUPA_URL || process.env.REACT_APP_SUPA_URL || "";
const SUPA_KEY = process.env.SUPA_KEY || process.env.REACT_APP_SUPA_KEY || "";
if (!SUPA_URL.includes(STAGING_REF)) {
  console.error(`HARD STOP — SUPA_URL no apunta a STAGING (ref ${STAGING_REF}). No se emitió ninguna request.`);
  console.error(`SUPA_URL recibido: ${SUPA_URL || "(vacío)"}`);
  process.exit(2);
}
if (!SUPA_KEY) { console.error("HARD STOP — falta SUPA_KEY en el entorno."); process.exit(2); }
const realFetch = globalThis.fetch;
if (typeof realFetch !== "function") { console.error("HARD STOP — no hay fetch global (usa Node ≥18)."); process.exit(2); }

// ── Transporte crudo (emula el bundle VIEJO) + fixtures ─────────────────────────
const cab = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });
const cabJson = () => ({ ...cab(), "Content-Type": "application/json" });
const creados = new Set();

// Escritor VIEJO: value = JSON.stringify(obj) → string-encoded (upsert LWW histórico).
async function viejoEscribe(id, obj) {
  creados.add(id);
  const body = JSON.stringify({ id, value: JSON.stringify(obj), updated_at: new Date().toISOString() });
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...cabJson(), Prefer: "resolution=merge-duplicates,return=representation" }, body });
  if (!res.ok) throw new Error(`viejoEscribe HTTP ${res.status}`);
}
// Lector VIEJO: GET + JSON.parse(value) INCONDICIONAL (rompe si value fuera objeto).
async function viejoLee(id) {
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, { headers: cab() });
  if (!res.ok) throw new Error(`viejoLee HTTP ${res.status}`);
  const fila = (await res.json())[0];
  return JSON.parse(fila.value); // incondicional, como el bundle previo a F0
}
async function fxBorrarTodo() {
  for (const id of creados) {
    try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: cab() }); } catch {}
  }
  try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=like._f0_rt_probe_*`, { method: "DELETE", headers: cab() }); } catch {}
}
function nuevoId() { return `_f0_rt_probe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }
const nueva = () => crearPersistencia({ fetch: realFetch, supaUrl: SUPA_URL, supaKey: SUPA_KEY, logger: mudo });

let pass = 0, fail = 0; const grid = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; grid.push(`  ✓ ${id}  ${desc}`); }
  else { fail++; grid.push(`  ✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };

async function main() {
  // ── SC-01 · NEW escribe → OLD lee (JSON.parse crudo) sin romperse ───────────
  {
    const id = nuevoId();
    await viejoEscribe(id, { seed: true }); // fila string-encoded, como en producción
    const P = nueva(); const l = await P.load(id);
    const rN = await P.saveConfirmed(id, { ...l.value, nuevo: 123 });
    let lanzo = false, visto = null;
    try { visto = await viejoLee(id); } catch { lanzo = true; }
    check("SC-01", "NEW escribe → OLD (JSON.parse crudo) lee sin lanzar",
      rN.ok === true && lanzo === false && visto && visto.nuevo === 123, `lanzo=${lanzo}`);
  }

  // ── SC-02 · OLD escribe → NEW lee (capability.load) sin romperse ────────────
  {
    const id = nuevoId();
    await viejoEscribe(id, { viejo: 456 }); // escritura string-encoded del bundle viejo
    const P = nueva(); const l = await P.load(id);
    check("SC-02", "OLD escribe → NEW (capability.load) lee correcto",
      l.existe === true && l.value.viejo === 456 && P.estado(id).encoding === "string",
      `enc=${P.estado(id).encoding}`);
  }

  // ── SC-03 · NEW escribe → ROLLBACK a OLD → OLD sigue cargando ────────────────
  {
    const id = nuevoId();
    await viejoEscribe(id, { pre: 1 });
    const P = nueva(); const l = await P.load(id);
    await P.saveConfirmed(id, { ...l.value, post: 2 }); // escrito por el bundle NUEVO
    // …luego se hace ROLLBACK del frontend al bundle VIEJO. Debe seguir cargando:
    let lanzo = false, visto = null;
    try { visto = await viejoLee(id); } catch { lanzo = true; }
    check("SC-03", "rollback a OLD tras un save NEW → OLD carga sin lanzar",
      lanzo === false && visto && visto.pre === 1 && visto.post === 2, `lanzo=${lanzo}`);
  }
}

let exit = 0;
try { await main(); }
catch (e) { fail++; grid.push(`  ✗ EXCEPCIÓN: ${String((e && e.message) || e)}`); exit = 1; }
finally { await fxBorrarTodo(); }

console.log("\n═══ STALE-COMPAT (NEW ↔ OLD · STAGING) ═══");
for (const line of grid) console.log(line);
console.log(`\n${pass} OK · ${fail} FALLA · fixtures _f0_rt_probe_* borradas`);
if (fail) { console.log("\n❌ stale-compat en rojo."); process.exit(exit || 1); }
console.log("\n✅ compatibilidad bidireccional NEW ↔ OLD verde contra staging.");

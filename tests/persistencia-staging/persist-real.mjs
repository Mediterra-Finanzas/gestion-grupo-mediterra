/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// persist-real.mjs — subconjunto real-backend de PERSIST-01..15 contra STAGING.
//
// Corre los casos del contrato que SÍ pueden ejercerse contra un backend real, con
// el mismo patrón fixture-only + tripwire + cleanup que rt.mjs. Dos "pestañas" se
// simulan con dos instancias de la capability que comparten la MISMA fila fixture
// en staging (dos pestañas literales de navegador no se pueden abrir aquí).
//
// Solo se mockea lo que genuinamente no puede tocar el backend real:
//   - caída de RED  → un `fetch` inyectado que lanza (no hay forma determinista de
//     "apagar la red" del backend real sin falsear DNS).
//   - llave inválida (401) → SÍ es real: se usa una SUPA_KEY inválida a propósito.
//
// SEGURIDAD: tripwire de staging (ref nlvfjpwiecgrosjnwwik), llaves por ENV, solo
// filas '_f0_rt_probe_*', borradas al final. NO se ejecuta en la sesión del agente.
//
// Uso:  SUPA_URL=... SUPA_KEY=... node tests/persistencia-staging/persist-real.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS } from "../../src/persistencia/persistContract.js";

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

// ── Fixtures ──────────────────────────────────────────────────────────────────────
const cab = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });
const cabJson = () => ({ ...cab(), "Content-Type": "application/json" });
const creados = new Set();
async function fxCrearStringEncoded(id, obj) {
  creados.add(id);
  const body = JSON.stringify({ id, value: JSON.stringify(obj), updated_at: new Date().toISOString() });
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...cabJson(), Prefer: "resolution=merge-duplicates,return=representation" }, body });
  if (!res.ok) throw new Error(`fixture POST HTTP ${res.status}`);
  return (await res.json())[0];
}
async function fxLeerCrudo(id) {
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, { headers: cab() });
  if (!res.ok) throw new Error(`fixture GET HTTP ${res.status}`);
  return (await res.json())[0] || null;
}
async function fxBorrarTodo() {
  for (const id of creados) {
    try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: cab() }); } catch {}
  }
  try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=like._f0_rt_probe_*`, { method: "DELETE", headers: cab() }); } catch {}
}
function nuevoId() { return `_f0_rt_probe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`; }

// ── Modelo blob (como el flujo) ────────────────────────────────────────────────
const seed = () => ({ finanzas_real: { Holding: { "5": { "0": { ing: 100 } } } } });
function setCell(blob, emp, mes, sem, vals) {
  const b = JSON.parse(JSON.stringify(blob || {}));
  b.finanzas_real = b.finanzas_real || {};
  b.finanzas_real[emp] = b.finanzas_real[emp] || {};
  b.finanzas_real[emp][mes] = b.finanzas_real[emp][mes] || {};
  b.finanzas_real[emp][mes][sem] = vals; return b;
}
const cellOf = (obj, emp, mes, sem) => obj?.finanzas_real?.[emp]?.[mes]?.[sem]?.ing;
const nueva = (fetchImpl = realFetch, key = SUPA_KEY) => crearPersistencia({ fetch: fetchImpl, supaUrl: SUPA_URL, supaKey: key, logger: mudo });

let pass = 0, fail = 0; const grid = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; grid.push(`  ✓ ${id}  ${desc}`); }
  else { fail++; grid.push(`  ✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };

async function main() {
  // ── PR-A · dos escritores / versiones distintas → ambas sobreviven ──────────
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const T1 = nueva(); await T1.load(id);
    const T2 = nueva(); await T2.load(id);
    const r1 = await T1.saveConfirmed(id, (base) => setCell(base, "Holding", "5", "0", { ing: 111 }));
    const r2 = await T2.saveConfirmed(id, (base) => setCell(base, "Allegria", "6", "0", { ing: 222 }));
    const disco = JSON.parse((await fxLeerCrudo(id)).value);
    check("PR-A", "dos pestañas, celdas distintas → ambas persisten (recompute)",
      r1.ok && r2.ok && cellOf(disco, "Holding", "5", "0") === 111 && cellOf(disco, "Allegria", "6", "0") === 222,
      `h=${cellOf(disco, "Holding", "5", "0")} a=${cellOf(disco, "Allegria", "6", "0")}`);
  }

  // ── PR-B · conflicto no fusionable (next VALOR) → CONFLICT, sin clobber ──────
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const A = nueva(); const la = await A.load(id);
    const B = nueva(); const lb = await B.load(id);
    await A.saveConfirmed(id, setCell(la.value, "Holding", "5", "0", { ing: 500 }));   // avanza la versión
    const rB = await B.saveConfirmed(id, setCell(lb.value, "Holding", "5", "0", { ing: 999 })); // versión vieja, valor
    const disco = JSON.parse((await fxLeerCrudo(id)).value);
    check("PR-B", "conflicto (valor, versión vieja) → CONFLICT y no pisa (queda 500)",
      rB.ok === false && rB.motivo === MOTIVOS.CONFLICTO && cellOf(disco, "Holding", "5", "0") === 500,
      `motivo=${rB.motivo} ing=${cellOf(disco, "Holding", "5", "0")}`);
  }

  // ── PR-C · save + segunda edición coalescen (cola por id) → ambos persisten ──
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const P = nueva(); const l = await P.load(id);
    let local = setCell(l.value, "Holding", "5", "0", { ing: 10 });
    const p1 = P.saveConfirmed(id, local);            // en vuelo (latencia real)
    local = setCell(local, "Holding", "5", "1", { ing: 20 });
    const p2 = P.saveConfirmed(id, local);            // coalesce con el anterior
    await Promise.all([p1, p2]);
    const disco = JSON.parse((await fxLeerCrudo(id)).value);
    check("PR-C", "save lento + 2ª edición → coalescencia sin pérdida",
      cellOf(disco, "Holding", "5", "0") === 10 && cellOf(disco, "Holding", "5", "1") === 20,
      `c0=${cellOf(disco, "Holding", "5", "0")} c1=${cellOf(disco, "Holding", "5", "1")}`);
  }

  // ── PR-D · 401 real (llave inválida) → no guardado ──────────────────────────
  {
    const id = nuevoId(); const f0 = await fxCrearStringEncoded(id, seed());
    const B = nueva(realFetch, "llave-invalida-deliberada");
    B.registrarCarga(id, seed(), f0.updated_at, "string");
    const r = await B.saveConfirmed(id, setCell(seed(), "Holding", "5", "0", { ing: 7 }));
    const disco = await fxLeerCrudo(id);
    check("PR-D", "401 real → ok:false HTTP y la fila intacta",
      r.ok === false && r.motivo === MOTIVOS.HTTP && (r.status === 401 || r.status === 403) &&
      disco.updated_at === f0.updated_at, `motivo=${r.motivo} status=${r.status}`);
  }

  // ── PR-E · caída de RED (fetch que lanza) → RED, dirty, no guardado ──────────
  {
    const id = nuevoId(); const f0 = await fxCrearStringEncoded(id, seed());
    const fetchCae = async () => { throw new TypeError("Failed to fetch"); };
    const P = nueva(fetchCae);
    P.registrarCarga(id, seed(), f0.updated_at, "string"); // cargaOk sin tocar red
    const r = await P.saveConfirmed(id, setCell(seed(), "Holding", "5", "0", { ing: 1 }));
    const disco = await fxLeerCrudo(id);
    check("PR-E", "red caída → ok:false RED, dirty, fila intacta",
      r.ok === false && r.motivo === MOTIVOS.RED && P.isDirty(id) === true && disco.updated_at === f0.updated_at,
      `motivo=${r.motivo}`);
  }

  // ── PR-F · ventana post-carga: sin falso-éxito inmediato tras load ──────────
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const fetchCae = (fase) => async (u, i) => { if (fase.red) throw new TypeError("Failed to fetch"); return realFetch(u, i); };
    const fase = { red: false };
    const P = nueva(fetchCae(fase));
    const l = await P.load(id);      // recién montado (la ventana vieja fingía éxito aquí)
    fase.red = true;
    const r = await P.saveConfirmed(id, setCell(l.value, "Holding", "5", "0", { ing: 8 }));
    check("PR-F", "inmediatamente tras load, un save con red caída NO finge éxito",
      r.ok === false && P.isDirty(id) === true, `ok=${r.ok}`);
  }

  // ── PR-G · codificación preservada tras varios saves ────────────────────────
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const P = nueva(); const l = await P.load(id);
    await P.saveConfirmed(id, setCell(l.value, "Holding", "5", "0", { ing: 33 }));
    await P.saveConfirmed(id, (base) => setCell(base, "Holding", "5", "1", { ing: 44 }));
    const crudo = await fxLeerCrudo(id);
    check("PR-G", "la fila sigue STRING-ENCODED tras varios saves (sin migración incidental)",
      typeof crudo.value === "string", `typeof=${typeof crudo.value}`);
  }

  // ── PR-H · reload tras ACK → una instancia nueva ve el dato confirmado ───────
  {
    const id = nuevoId(); await fxCrearStringEncoded(id, seed());
    const A = nueva(); const la = await A.load(id);
    const rA = await A.saveConfirmed(id, setCell(la.value, "Holding", "5", "0", { ing: 777 }));
    const B = nueva(); const lb = await B.load(id); // proceso nuevo
    check("PR-H", "tras confirmar, un reload (instancia nueva) ve el cambio",
      rA.ok === true && cellOf(lb.value, "Holding", "5", "0") === 777,
      `ing=${cellOf(lb.value, "Holding", "5", "0")}`);
  }
}

let exit = 0;
try { await main(); }
catch (e) { fail++; grid.push(`  ✗ EXCEPCIÓN: ${String((e && e.message) || e)}`); exit = 1; }
finally { await fxBorrarTodo(); }

console.log("\n═══ PERSIST real-backend (STAGING) ═══");
for (const line of grid) console.log(line);
console.log(`\n${pass} OK · ${fail} FALLA · fixtures _f0_rt_probe_* borradas`);
if (fail) { console.log("\n❌ PERSIST real en rojo."); process.exit(exit || 1); }
console.log("\n✅ subset PERSIST real verde contra staging.");

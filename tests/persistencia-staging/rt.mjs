/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// rt.mjs — Round-Trip real contra STAGING de la capability de persistencia (F0-C).
//
// EJERCE EL CONTRATO REAL (src/persistencia/persistContract.js) con `fetch` real y
// las credenciales de STAGING inyectadas por ENV. Prueba, sobre una fila FIXTURE
// controlada (jamás una fila real/financiera), el ciclo:
//   read → PATCH condicional por updated_at → confirmación → conflicto → retry →
//   codificación preservada → 401 → 2xx-sin-representación.
//
// SEGURIDAD (NO NEGOCIABLE):
//   - Tripwire: SUPA_URL DEBE apuntar a staging (ref nlvfjpwiecgrosjnwwik). Si no,
//     HARD STOP y exit ≠ 0 SIN emitir una sola request.
//   - Las llaves salen de process.env. NUNCA hardcodear llaves de staging.
//   - Solo toca filas id='_f0_rt_probe_*'. Al final las BORRA.
//
// Este script NO se ejecuta en la sesión del agente (sin red, sin llaves). Es para
// que el operador lo corra en su terminal con las ENV de staging. Ver README.md.
//
// Uso:
//   SUPA_URL=... SUPA_KEY=... node tests/persistencia-staging/rt.mjs
// ═══════════════════════════════════════════════════════════════════════════════

import { crearPersistencia, MOTIVOS } from "../../src/persistencia/persistContract.js";

// ── Tripwire de entorno ─────────────────────────────────────────────────────────
const STAGING_REF = "nlvfjpwiecgrosjnwwik";
const SUPA_URL = process.env.SUPA_URL || process.env.REACT_APP_SUPA_URL || "";
const SUPA_KEY = process.env.SUPA_KEY || process.env.REACT_APP_SUPA_KEY || "";

if (!SUPA_URL.includes(STAGING_REF)) {
  console.error("╔══════════════════════════════════════════════════════════════════╗");
  console.error("║  HARD STOP — SUPA_URL no apunta a STAGING (ref " + STAGING_REF + ").  ║");
  console.error("║  No se emitió ninguna request. Exporta las ENV de staging y reintenta. ║");
  console.error("║  SUPA_URL recibido: " + (SUPA_URL || "(vacío)") + "                    ");
  console.error("╚══════════════════════════════════════════════════════════════════╝");
  process.exit(2);
}
if (!SUPA_KEY) { console.error("HARD STOP — falta SUPA_KEY en el entorno."); process.exit(2); }

const realFetch = globalThis.fetch;
if (typeof realFetch !== "function") { console.error("HARD STOP — no hay fetch global (usa Node ≥18)."); process.exit(2); }

// ── Utilidades de FIXTURE (transporte crudo, solo filas _f0_rt_probe_*) ──────────
const cab = () => ({ apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` });
const cabJson = () => ({ ...cab(), "Content-Type": "application/json" });
const creados = new Set();

async function fxCrearStringEncoded(id, obj) {
  // Crea la fila fixture STRING-ENCODED (como las filas vivas): value = JSON string.
  creados.add(id);
  const body = JSON.stringify({ id, value: JSON.stringify(obj), updated_at: new Date().toISOString() });
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data`, {
    method: "POST", headers: { ...cabJson(), Prefer: "resolution=merge-duplicates,return=representation" }, body });
  if (!res.ok) throw new Error(`fixture POST HTTP ${res.status}`);
  const filas = await res.json();
  return filas[0];
}
async function fxLeerCrudo(id) {
  const res = await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, { headers: cab() });
  if (!res.ok) throw new Error(`fixture GET HTTP ${res.status}`);
  const filas = await res.json();
  return filas[0] || null;
}
async function fxBorrarTodo() {
  // Borra por id exacto lo creado + barrido like como cinturón (solo el prefijo probe).
  for (const id of creados) {
    try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers: cab() }); } catch {}
  }
  try { await realFetch(`${SUPA_URL}/rest/v1/calendario_data?id=like._f0_rt_probe_*`, { method: "DELETE", headers: cab() }); } catch {}
}

// ── Grid de resultados ───────────────────────────────────────────────────────────
let pass = 0, fail = 0; const grid = [];
function check(id, desc, cond, nota = "") {
  if (cond) { pass++; grid.push(`  ✓ ${id}  ${desc}`); }
  else { fail++; grid.push(`  ✗ FALLA ${id}  ${desc}${nota ? "  — " + nota : ""}`); }
}
const mudo = { info: () => {}, warn: () => {}, error: () => {} };

async function main() {
  const id = `_f0_rt_probe_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const original = { probe: true, celda: { ing: 100 }, marca: "F0-C" };
  await fxCrearStringEncoded(id, original);

  const P = crearPersistencia({ fetch: realFetch, supaUrl: SUPA_URL, supaKey: SUPA_KEY, logger: mudo });

  // ── RT-01 · read + updated_at V1 ──────────────────────────────────────────────
  const l1 = await P.load(id);
  const V1 = l1.version;
  check("RT-01", "read fixture → existe + updated_at V1", l1.existe === true && !!V1 && l1.value.marca === "F0-C", `V1=${V1}`);

  // ── RT-02 · PATCH condicionado updated_at=eq.V1 + return=representation → 1 fila ─
  // (la capability solo declara ok cuando el servidor devolvió EXACTAMENTE 1 fila).
  const r2 = await P.saveConfirmed(id, { ...l1.value, celda: { ing: 200 } });
  check("RT-02", "PATCH condicional por V1 confirma exactamente 1 fila", r2.ok === true, `motivo=${r2.motivo || "-"}`);

  // ── RT-03 · la respuesta trae una versión nueva V2 ────────────────────────────
  const V2 = r2.version;
  check("RT-03", "la representación trae updated_at V2 ≠ V1", !!V2 && V2 !== V1, `V2=${V2}`);

  // ── RT-04 · reusar V1 (escritor viejo) → 0 filas → CONFLICT → V2 intacto ───────
  // Una 2ª instancia que cargó en V1 y NO se enteró de V2; con `next` VALOR (no
  // función) no recomputa: debe reportar conflicto y NO pisar.
  const Q = crearPersistencia({ fetch: realFetch, supaUrl: SUPA_URL, supaKey: SUPA_KEY, logger: mudo });
  Q.registrarCarga(id, l1.value, V1, "string"); // parada en V1 a propósito
  const r4 = await Q.saveConfirmed(id, { ...l1.value, celda: { ing: 999 } });
  const trasR4 = await fxLeerCrudo(id);
  const trasR4Obj = JSON.parse(trasR4.value);
  check("RT-04", "escritor con V1 → CONFLICT y V2 queda intacto (ing=200)",
    r4.ok === false && r4.motivo === MOTIVOS.CONFLICTO && trasR4.updated_at === V2 && trasR4Obj.celda.ing === 200,
    `motivo=${r4.motivo} ing=${trasR4Obj.celda.ing}`);

  // ── RT-05 · usar V2 → escritura PASS ──────────────────────────────────────────
  const r5 = await P.saveConfirmed(id, { ...l1.value, celda: { ing: 300 } });
  check("RT-05", "con V2 (versión fresca) la escritura PASA", r5.ok === true, `motivo=${r5.motivo || "-"}`);

  // ── RT-06 · codificación idéntica a la original tras los saves ────────────────
  const trasR6 = await fxLeerCrudo(id);
  check("RT-06", "la fila sigue STRING-ENCODED (igual que el original) tras varios saves",
    typeof trasR6.value === "string", `typeof value=${typeof trasR6.value}`);

  // ── RT-07 · 401/403 real (llave inválida) → nunca guardado ────────────────────
  // Instancia con llave deliberadamente inválida → PATCH 401. cargaOk se habilita
  // por registrarCarga para llegar al write. La fila NO debe cambiar.
  const antesR7 = await fxLeerCrudo(id);
  const B = crearPersistencia({ fetch: realFetch, supaUrl: SUPA_URL, supaKey: "llave-invalida-deliberada", logger: mudo });
  B.registrarCarga(id, JSON.parse(antesR7.value), antesR7.updated_at, "string");
  const r7 = await B.saveConfirmed(id, { hackeado: true });
  const despuesR7 = await fxLeerCrudo(id);
  check("RT-07", "401/403 real → ok:false HTTP y la fila NO se tocó",
    r7.ok === false && r7.motivo === MOTIVOS.HTTP && (r7.status === 401 || r7.status === 403) &&
    despuesR7.value === antesR7.value && despuesR7.updated_at === antesR7.updated_at,
    `motivo=${r7.motivo} status=${r7.status}`);

  // ── RT-08 · 2xx sin representación válida → SIN_CONFIRMACION ───────────────────
  // El backend real no devuelve 2xx-sin-updated_at a voluntad, así que se envuelve
  // fetch para DESPOJAR la representación SOLO de la request PATCH de este caso
  // (transporte real, respuesta recortada). Verifica el req-14 del contrato.
  const antesR8 = await fxLeerCrudo(id);
  let interceptar = true;
  const fetchRecorta = async (url, init) => {
    const res = await realFetch(url, init);
    if (interceptar && (init?.method || "GET").toUpperCase() === "PATCH") {
      interceptar = false;
      // 2xx pero cuerpo SIN updated_at (representación inválida). No refleja la fila.
      return { ok: true, status: 200, text: async () => "", json: async () => [{ id }] };
    }
    return res;
  };
  const C = crearPersistencia({ fetch: fetchRecorta, supaUrl: SUPA_URL, supaKey: SUPA_KEY, logger: mudo });
  C.registrarCarga(id, JSON.parse(antesR8.value), antesR8.updated_at, "string");
  const r8 = await C.saveConfirmed(id, { ...JSON.parse(antesR8.value), x: 1 });
  check("RT-08", "2xx sin representación válida → ok:false (sin_confirmacion)",
    r8.ok === false && r8.motivo === MOTIVOS.SIN_CONFIRMACION, `motivo=${r8.motivo}`);

  return id;
}

let exit = 0;
try {
  await main();
} catch (e) {
  fail++; grid.push(`  ✗ EXCEPCIÓN: ${String((e && e.message) || e)}`); exit = 1;
} finally {
  await fxBorrarTodo();
}

console.log("\n═══ RT (Round-Trip real · STAGING) ═══");
for (const line of grid) console.log(line);
console.log(`\n${pass} OK · ${fail} FALLA · fixtures _f0_rt_probe_* borradas`);
if (fail) { console.log("\n❌ RT en rojo."); process.exit(exit || 1); }
console.log("\n✅ RT-01..08 verde contra staging.");

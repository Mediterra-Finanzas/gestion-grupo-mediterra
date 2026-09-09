/* eslint-disable */
// auditLoadGate.test.mjs — ejecutar: node src/auditLoadGate.test.mjs
//
// Regresión del hallazgo CRÍTICO de la sweep DATA_SAFETY (App.jsx auditLoad/auditFlush).
//
// INVARIANTE (DATA_SAFETY_INVARIANT.md): ningún fallo de carga puede convertirse
// en un `[]` "válido" que habilite un guardado destructivo.
//
// Cadena real: auditLog() bufferiza eventos → auditFlush() hace un
// READ-MODIFY-WRITE: carga el log existente (auditLoad), le concatena los
// eventos nuevos y REEMPLAZA la fila `audit_log` (POST merge-duplicates = pisa
// el `value` entero). Si auditLoad tragaba el error como `[]`, un parpadeo de
// red/403 en el primer flush de la sesión hacía que auditSave persistiera SOLO
// los eventos nuevos, borrando todo el historial (misma clase que el wipe de
// `main` del 2026-06-16).
//
// Este test modela la forma real ANTES (buggy) y DESPUÉS (fix) y prueba que el
// fix deja de ver una carga fallida como un log vacío válido.
//
// Estilo idéntico a src/persistencia vm-harness / drafts/rlsA_invariant_guard.test.mjs.

let pass = 0, fail = 0;
function ok(n, c) { if (c) { pass++; console.log("PASS " + n); } else { fail++; console.log("FAIL " + n); } }

// ── fetch falsos ────────────────────────────────────────────────────────────
const HISTORIAL = Array.from({ length: 5000 }, (_, i) => ({
  id: "ev_" + i, timestamp: new Date().toISOString(), accion: "editar"
}));
const fakes = {
  // Lectura OK con historial real de 5000 eventos.
  ok_con_datos: async () => ({ ok: true, status: 200, json: async () => [{ value: { eventos: HISTORIAL } }] }),
  // Lectura OK, fila aún no existe (instalación nueva legítima).
  ok_fila_vacia: async () => ({ ok: true, status: 200, json: async () => [] }),
  // Denegación dura (Lane A REVOKE a anon) — el peligro.
  http_403: async () => ({ ok: false, status: 403, json: async () => ({ message: "permission denied" }) }),
  // Token vencido.
  http_401: async () => ({ ok: false, status: 401, json: async () => ({ message: "JWT expired" }) }),
  // Error de conectividad (el original del 2026-06-16).
  red: async () => { throw new TypeError("Failed to fetch"); },
  // JSON truncado.
  json_parcial: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } }),
};

const RETENCION_MESES = 24;
function retener(eventos) {
  const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - RETENCION_MESES);
  return eventos.filter(e => new Date(e.timestamp) >= cutoff);
}

// ── SUT ANTES (buggy): auditLoad traga el error como [] ───────────────────────
async function auditLoad_ANTES(f) {
  try {
    const res = await f();
    const data = await res.json();
    return retener(data?.[0]?.value?.eventos || []);
  } catch { return []; }
}

// ── SUT DESPUÉS (fix real de App.jsx): auditLoad LANZA ante !res.ok / red / parse
async function auditLoad_DESPUES(f) {
  const res = await f();
  if (!res.ok) throw new Error(`auditLoad HTTP ${res.status}`);
  const data = await res.json();
  return retener(data?.[0]?.value?.eventos || []);
}

// ── Harness de flush (forma real de auditFlush) con auditLoad inyectable ──────
// Devuelve { saved, savedLen, buffer, allEvents } para poder afirmar.
function makeFlush(auditLoadImpl, useFix) {
  const w = { buffer: [], allEvents: null };
  let saved = null; // último value persistido (lo que quedaría en la fila)
  let saveCalls = 0; // # de veces que se invocó auditSave == # de upserts a audit_log
  async function auditSave(eventos) { saveCalls++; saved = eventos; }
  async function auditFlush(f) {
    if (w.buffer.length === 0) return;
    const nuevos = [...w.buffer];
    w.buffer = [];
    if (useFix) {
      if (!w.allEvents) {
        try { w.allEvents = await auditLoadImpl(f); }
        catch (e) { w.buffer = [...nuevos, ...w.buffer]; w.allEvents = null; return; } // fail-closed
      }
    } else {
      if (!w.allEvents) w.allEvents = await auditLoadImpl(f); // ANTES: nunca lanza (traga [])
    }
    w.allEvents = [...w.allEvents, ...nuevos];
    await auditSave(w.allEvents);
  }
  return { w, auditFlush, getSaved: () => saved, getSaveCalls: () => saveCalls };
}

// ── PART 1 — ANTES: la carga fallida BORRA el historial (demuestra el bug) ────
{
  const { w, auditFlush, getSaved } = makeFlush(auditLoad_ANTES, /*useFix*/false);
  w.buffer.push({ id: "ev_login", timestamp: new Date().toISOString(), accion: "login" });
  await auditFlush(fakes.http_403); // 403 en el primer flush de la sesión
  const saved = getSaved();
  // BUG: guardó solo 1 evento, pisando los 5000 del historial.
  ok("P1 (ANTES) 403 => auditSave persiste log truncado (WIPE del historial)",
     Array.isArray(saved) && saved.length === 1);
}

// ── PART 2 — DESPUÉS: cada modo de falla ABORTA el flush (no se guarda nada) ──
for (const modo of ["http_403", "http_401", "red", "json_parcial"]) {
  const { w, auditFlush, getSaved, getSaveCalls } = makeFlush(auditLoad_DESPUES, /*useFix*/true);
  w.buffer.push({ id: "ev_login", timestamp: new Date().toISOString(), accion: "login" });
  let threw = false;
  try { await auditFlush(fakes[modo]); } catch { threw = true; }
  const saved = getSaved();
  ok(`P2 (FIX) ${modo} => NO se persiste (audit_log intacto)`, saved === null);
  // Prueba EXPLÍCITA del invariante: auditSave (el ÚNICO writer/upsert de audit_log)
  // no se invocó ni una sola vez. saved===null es el resultado; esto es el conteo de llamadas.
  ok(`P2 (FIX) ${modo} => auditSave/upsert NO invocado (call count === 0)`, getSaveCalls() === 0);
  ok(`P2 (FIX) ${modo} => eventos re-encolados (no se pierden)`, w.buffer.length === 1 && w.allEvents === null);
  ok(`P2 (FIX) ${modo} => auditFlush no explota (aborta limpio)`, threw === false);
}

// ── PART 3 — DESPUÉS: éxito legítimo SÍ persiste historial + evento nuevo ─────
{
  const { w, auditFlush, getSaved } = makeFlush(auditLoad_DESPUES, /*useFix*/true);
  w.buffer.push({ id: "ev_login", timestamp: new Date().toISOString(), accion: "login" });
  await auditFlush(fakes.ok_con_datos);
  const saved = getSaved();
  ok("P3 (FIX) lectura OK => persiste 5000 historial + 1 nuevo = 5001", Array.isArray(saved) && saved.length === 5001);
}

// ── PART 4 — DESPUÉS: instalación nueva legítima (fila vacía, lectura OK) ─────
{
  const { w, auditFlush, getSaved } = makeFlush(auditLoad_DESPUES, /*useFix*/true);
  w.buffer.push({ id: "ev_login", timestamp: new Date().toISOString(), accion: "login" });
  await auditFlush(fakes.ok_fila_vacia);
  const saved = getSaved();
  // Vacío legítimo: se guarda el único evento nuevo. Válido SOLO porque la lectura fue OK.
  ok("P4 (FIX) fila vacía con lectura OK => persiste 1 evento (vacío legítimo, no wipe)",
     Array.isArray(saved) && saved.length === 1);
}

// ── PART 5 — DESPUÉS: CADENA COMPLETA en un solo harness continuo ─────────────
// Demuestra la cadena exacta que exige la certificación P0-INTEGRITY, paso a paso,
// SIN reiniciar el estado entre el fallo y la recuperación:
//   historial existente (5000) → fallo de lectura (403) → eventos buffered
//   → NO escritura destructiva (auditSave NO invocado / upsert count 0)
//   → retry/recovery (una lectura posterior EXITOSA)
//   → historial preservado (5000) + eventos buffered agregados (no perdidos) = 5001
{
  const { w, auditFlush, getSaved, getSaveCalls } = makeFlush(auditLoad_DESPUES, /*useFix*/true);

  // Paso 1 — el servidor TIENE 5000 eventos de historial (fakes.ok_con_datos los
  // devuelve cuando la lectura sea exitosa). Estado de partida no vacío.
  ok("P5 paso1: historial existente en servidor = 5000 (precondición)", HISTORIAL.length === 5000);

  // Paso 2 — se bufferiza un evento nuevo de la sesión.
  w.buffer.push({ id: "ev_login", timestamp: new Date().toISOString(), accion: "login" });
  ok("P5 paso2: 1 evento buffered antes del primer flush", w.buffer.length === 1);

  // Paso 3 — primer flush golpea 403 (fallo de lectura).
  await auditFlush(fakes.http_403);
  // Paso 4 — NO escritura destructiva: auditSave (único upsert) jamás se invocó.
  ok("P5 paso4: fallo de lectura => auditSave/upsert NO invocado (call count === 0)", getSaveCalls() === 0);
  ok("P5 paso4: fallo de lectura => audit_log NO reemplazado (saved === null)", getSaved() === null);
  // Paso 5 — los eventos siguen buffered (no se perdieron ni se persistieron truncados).
  ok("P5 paso5: eventos siguen buffered tras el fallo (no perdidos)", w.buffer.length === 1 && w.allEvents === null);

  // Paso 6 — RETRY/RECOVERY: un flush posterior con lectura EXITOSA.
  await auditFlush(fakes.ok_con_datos);
  const saved = getSaved();
  ok("P5 paso6: recovery => auditSave/upsert invocado exactamente 1 vez", getSaveCalls() === 1);
  // Paso 7 — historial preservado + evento buffered agregado, sin pérdida.
  ok("P5 paso7: recovery => persiste 5000 historial + 1 buffered = 5001", Array.isArray(saved) && saved.length === 5001);
  const idsGuardados = new Set(saved.map(e => e.id));
  const historialIntacto = HISTORIAL.every(e => idsGuardados.has(e.id));
  ok("P5 paso7: recovery => los 5000 eventos históricos preservados (ninguno borrado)", historialIntacto);
  ok("P5 paso7: recovery => el evento buffered quedó agregado (no perdido)", idsGuardados.has("ev_login"));
  ok("P5 paso7: recovery => buffer drenado tras persistir", w.buffer.length === 0);
}

console.log(`\nRESULT: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);

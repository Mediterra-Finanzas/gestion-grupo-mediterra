// persistContract.env.test.mjs — STG-8 regresión de aislamiento de base Supabase.
// Ejecuta: node src/persistencia/persistContract.env.test.mjs
import vm from "node:vm";
const BASE = "file:///C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/proc-fase1/src/persistencia/persistContract.js";
const STAGING = "https://nlvfjpwiecgrosjnwwik.supabase.co";

let pass = 0, fail = 0;
function ok(n, c) { if (c) { pass++; console.log("PASS " + n); } else { fail++; console.log("FAIL " + n); } }
function makeFake() { const calls = []; const f = async (url) => { calls.push(String(url)); return { ok: true, status: 200, json: async () => [], text: async () => "" }; }; f.calls = calls; return f; }

// PART 1 — ROOT CAUSE demostrado: en un contexto SIN `process` (browser), la guarda
// vieja corta y la base queda VACÍA; el patrón nuevo resuelve sin depender de process.
const ctx = {}; vm.createContext(ctx);
const OLD = vm.runInContext('(typeof process !== "undefined" && process.env && "' + STAGING + '") || ""', ctx);
const NEW = vm.runInContext('(function(v){return typeof v==="string"?v:""})("' + STAGING + '")', ctx);
ok("P1 guarda vieja `typeof process` → base VACÍA en browser (reproduce el bug)", OLD === "");
ok("P1 patrón nuevo resuelve la base SIN process (fix)", NEW === STAGING);

// Importa el módulo SIN env → SUPA_URL_DEFAULT = "" (congelado al cargar).
delete process.env.REACT_APP_SUPABASE_URL; delete process.env.REACT_APP_SUPA_URL;
delete process.env.REACT_APP_SUPABASE_ANON_KEY; delete process.env.REACT_APP_SUPA_KEY;
const modVacio = await import(BASE);

// PART 4 — node harness (sin window): base vacía + fake fetch NO lanza (host irrelevante).
{
  const fake = makeFake();
  const p = modVacio.crearPersistencia({ fetch: fake });
  let threw = false; try { await p.load("main"); } catch (e) { if (/no resuelta/.test(String(e.message||e))) threw = true; }
  ok("P4 node harness (sin window) NO lanza por base vacía", threw === false);
}

// PART 3 — FAIL-CLOSED (browser simulado): base vacía → THROW, sin fetch relativo. (regresión)
{
  globalThis.window = {};
  const fake = makeFake();
  const p = modVacio.crearPersistencia({ fetch: fake });
  let threw = false, msg = "";
  try { await p.load("main"); } catch (e) { threw = true; msg = String(e.message || e); }
  delete globalThis.window;
  ok("P3 browser + base vacía → THROW fail-closed (0 fetch relativo)", threw && /no resuelta/.test(msg) && fake.calls.length === 0);
}

// PART 2 — INTEGRACIÓN: con env staging (import fresco cache-bust), base ABSOLUTA staging.
process.env.REACT_APP_SUPABASE_URL = STAGING;
process.env.REACT_APP_SUPABASE_ANON_KEY = "eyJ.anon.dummy";
const modEnv = await import(BASE + "?v=2");
{
  const fake = makeFake();
  const p = modEnv.crearPersistencia({ fetch: fake });
  await p.load("main");
  const u = fake.calls[0] || "";
  ok("P2 load() usa URL ABSOLUTA staging (no relativa al origin)", u.startsWith(STAGING + "/rest/v1/calendario_data"));
}

console.log(`\nRESULT: PASS=${pass} FAIL=${fail}`);
process.exit(fail === 0 ? 0 : 1);

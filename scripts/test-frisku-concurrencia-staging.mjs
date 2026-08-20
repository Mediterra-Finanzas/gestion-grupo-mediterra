/* NIVEL 1 + 2 — validacion contra STAGING con dos clientes concurrentes reales.
 * Reproduce el escenario Maria/Pedro sobre una fila de prueba propia, con las mismas
 * llamadas HTTP que hace dbSaveGeneric. Fail-closed sobre la identidad del proyecto.
 * No toca ninguna fila de negocio: usa __test_concurrencia y la borra al final.
 */
import { existsSync, readFileSync } from "node:fs";
import { fusionarPorId } from "../src/friskuPersistencia.js";

const STG = "nlvfjpwiecgrosjnwwik", PROD = "bywovqayuzodbzwsriet";
const ENVF = ".claude/worktrees/osiris-piloto2/.env.osiris-staging.local";
const FILA = "__test_concurrencia";

if (!existsSync(ENVF)) { console.log("ABORT: env de staging ausente"); process.exit(2); }
const env = {};
for (const l of readFileSync(ENVF, "utf8").split(/\r?\n/)) {
  const m = l.replace(/^\s*export\s+/, "").match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) { let v = m[2].trim(); if (/^".*"$/.test(v)) v = v.slice(1, -1); env[m[1]] = v; }
}
const URL_ = (() => { try { return new URL(env.OSIRIS_STAGING_SUPABASE_URL).origin; } catch { return ""; } })();
const KEY = env.OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY || "";
if (!URL_.includes(STG) || JSON.stringify(env).includes(PROD)) { console.log("ABORT: identidad no es staging"); process.exit(2); }

const H = (extra) => Object.assign({ apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json" }, extra || {});
let fallos = 0;
const T = (n, ok, d) => { console.log("  " + (ok ? "PASS " : "FAIL ") + n + (d ? "  " + d : "")); if (!ok) fallos++; };

async function leer() {
  const r = await fetch(`${URL_}/rest/v1/calendario_data?id=eq.${FILA}&select=value,updated_at`, { headers: H() });
  if (!r.ok) throw new Error("lectura HTTP " + r.status);
  const rows = await r.json();
  if (!rows.length) return { existe: false, valor: null, updatedAt: null };
  return { existe: true, valor: rows[0].value, updatedAt: rows[0].updated_at };
}
async function escribirCond(value, version) {
  const cab = H({ Prefer: version ? "return=representation" : "resolution=merge-duplicates,return=representation" });
  const url = version
    ? `${URL_}/rest/v1/calendario_data?id=eq.${FILA}&updated_at=eq.${encodeURIComponent(version)}`
    : `${URL_}/rest/v1/calendario_data`;
  const body = version ? JSON.stringify({ value, updated_at: new Date().toISOString() })
                       : JSON.stringify({ id: FILA, value, updated_at: new Date().toISOString() });
  const r = await fetch(url, { method: version ? "PATCH" : "POST", headers: cab, body });
  if (!r.ok) return { ok: false, motivo: "http", status: r.status };
  const filas = await r.json().catch(() => []);
  if (!filas.length) return { ok: false, motivo: "conflicto" };
  return { ok: true, updatedAt: filas[0].updated_at };
}

// Simula un cliente completo: carga, edita en memoria, guarda con fusion.
function cliente(nombre) {
  return {
    nombre, base: null, version: null, memoria: null,
    async cargar() { const a = await leer(); this.base = JSON.parse(JSON.stringify(a.valor || [])); this.version = a.updatedAt; this.memoria = JSON.parse(JSON.stringify(a.valor || [])); },
    async guardar() {
      let aGuardar = this.memoria, fusionado = false;
      for (let i = 0; i < 3; i++) {
        const r = await escribirCond(aGuardar, this.version);
        if (r.ok) { this.version = r.updatedAt; this.base = JSON.parse(JSON.stringify(aGuardar)); this.memoria = aGuardar; return { ok: true, fusionado }; }
        if (r.motivo !== "conflicto") return r;
        const actual = await leer();
        const f = fusionarPorId(this.base, aGuardar, actual.valor);
        if (!f.ok || f.conflictos.length) { this.base = JSON.parse(JSON.stringify(actual.valor)); this.version = actual.updatedAt; return { ok: false, motivo: "conflicto_item", conflictos: f.conflictos || [] }; }
        this.version = actual.updatedAt; this.base = JSON.parse(JSON.stringify(actual.valor));
        aGuardar = f.valor; fusionado = true;
      }
      return { ok: false, motivo: "reintentos" };
    },
  };
}

const emb = (id, cajas) => ({ id, nave: "Nave" + id, cajas });

console.log("== NIVEL 1+2 · dos clientes concurrentes · STAGING ==\n");
try {
  // semilla
  await escribirCond([emb(1, 100), emb(2, 200)], null);

  // ── ESCENARIO REAL: Maria carga, Pedro agrega, Maria edita y guarda ──
  const maria = cliente("Maria"), pedro = cliente("Pedro");
  await maria.cargar();
  await pedro.cargar();

  pedro.memoria = [...pedro.memoria, emb(3, 300)];
  const rp = await pedro.guardar();
  T("Pedro agrega el embarque 3 y guarda", rp.ok);

  maria.memoria = maria.memoria.map(x => x.id === 1 ? { ...x, cajas: 999 } : x);
  const rm = await maria.guardar();
  T("Maria edita el 1 sobre una copia vieja y su guardado se fusiona", rm.ok && rm.fusionado);

  const final = await leer();
  const ids = final.valor.map(x => x.id).sort();
  T("quedan los tres embarques (no se perdio el de Pedro)", JSON.stringify(ids) === "[1,2,3]", "ids=" + JSON.stringify(ids));
  T("la edicion de Maria quedo aplicada", final.valor.find(x => x.id === 1).cajas === 999);
  T("el embarque de Pedro quedo intacto", final.valor.find(x => x.id === 3).cajas === 300);
  T("la memoria de Maria quedo sincronizada con la fusion", maria.memoria.some(x => x.id === 3));

  // ── CONFLICTO REAL: los dos editan el MISMO item ──
  await maria.cargar(); await pedro.cargar();
  pedro.memoria = pedro.memoria.map(x => x.id === 2 ? { ...x, cajas: 111 } : x);
  await pedro.guardar();
  maria.memoria = maria.memoria.map(x => x.id === 2 ? { ...x, cajas: 222 } : x);
  const rc = await maria.guardar();
  T("editar el mismo item da conflicto y NO se guarda", rc.ok === false && rc.motivo === "conflicto_item", "conflictos=" + JSON.stringify(rc.conflictos));
  const tras = await leer();
  T("se conserva lo de Pedro, no se pisa", tras.valor.find(x => x.id === 2).cajas === 111);

  // ── borrado vs edicion ──
  await maria.cargar(); await pedro.cargar();
  pedro.memoria = pedro.memoria.map(x => x.id === 3 ? { ...x, cajas: 777 } : x);
  await pedro.guardar();
  maria.memoria = maria.memoria.filter(x => x.id !== 3);
  const rb = await maria.guardar();
  T("borrar un item que el otro edito da conflicto", rb.ok === false && rb.motivo === "conflicto_item");
  const tras2 = await leer();
  T("el item editado por Pedro sigue vivo", !!tras2.valor.find(x => x.id === 3));

  // ── sin concurrencia, el guardado normal no cambia de comportamiento ──
  await maria.cargar();
  maria.memoria = [...maria.memoria, emb(9, 9)];
  const rs = await maria.guardar();
  T("guardado normal sin nadie mas: directo, sin fusion", rs.ok && !rs.fusionado);

} finally {
  await fetch(`${URL_}/rest/v1/calendario_data?id=eq.${FILA}`, { method: "DELETE", headers: H() });
  const q = await leer();
  console.log("\n  limpieza de la fila de prueba: " + (q.existe ? "REVISAR MANUALMENTE" : "OK, eliminada"));
}

console.log("\n== " + (fallos === 0 ? "TODO VERDE" : fallos + " FALLO(S)") + " ==");
process.exit(fallos === 0 ? 0 : 1);

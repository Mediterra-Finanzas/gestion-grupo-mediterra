/* PASO 1 — validacion del mecanismo de persistencia contra STAGING.
 * Reproduce exactamente las llamadas HTTP que hace dbLoadOsiris/dbSaveOsiris.
 * Fail-closed: aborta si el env no resuelve a staging o menciona produccion.
 * Al final restaura la fila al estado exacto en que la encontro.
 */
import { existsSync, readFileSync } from "node:fs";

const STG = "nlvfjpwiecgrosjnwwik", PROD = "bywovqayuzodbzwsriet";
const ENVF = ".claude/worktrees/osiris-piloto2/.env.osiris-staging.local";

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
const ID = "osiris";
let fallos = 0;
const T = (nombre, ok, det) => { console.log("  " + (ok ? "PASS " : "FAIL ") + nombre + (det ? "  " + det : "")); if (!ok) fallos++; };

// --- las mismas primitivas del modulo ---
async function cargar() {
  const r = await fetch(`${URL_}/rest/v1/calendario_data?id=eq.${ID}&select=value,updated_at`, { headers: H() });
  if (!r.ok) throw new Error("carga fallida: HTTP " + r.status);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error("respuesta inesperada");
  if (!rows.length) return { value: null, updatedAt: null };
  return { value: rows[0].value || null, updatedAt: rows[0].updated_at || null };
}
async function guardarCondicionado(value, version) {
  const body = JSON.stringify({ value, updated_at: new Date().toISOString() });
  const url = `${URL_}/rest/v1/calendario_data?id=eq.${ID}&updated_at=eq.${encodeURIComponent(version)}`;
  const r = await fetch(url, { method: "PATCH", headers: H({ Prefer: "return=representation" }), body });
  if (!r.ok) return { ok: false, motivo: "http", status: r.status, detalle: (await r.text()).slice(0, 120) };
  const filas = await r.json().catch(() => []);
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, motivo: "conflicto" };
  if (!filas[0].updated_at) return { ok: false, motivo: "sin_confirmacion" };
  return { ok: true, updatedAt: filas[0].updated_at };
}

console.log("== PASO 1 · persistencia verificada + bloqueo optimista · STAGING ==\n");

const inicial = await cargar();
console.log("  fila inicial: updated_at=" + String(inicial.updatedAt).slice(0, 19) +
  " · " + Math.round(Buffer.byteLength(JSON.stringify(inicial.value || {}), "utf8") / 1024) + " KB\n");

try {
  // 1. la carga entrega version
  T("la carga devuelve un updated_at utilizable", !!inicial.updatedAt, String(inicial.updatedAt).slice(0, 19));

  // 2. guardado con la version correcta -> escribe y confirma
  const marca = { ...(inicial.value || {}), __test_paso1: "A" };
  const r1 = await guardarCondicionado(marca, inicial.updatedAt);
  T("guardar con la version vigente funciona", r1.ok, r1.ok ? "nueva v=" + String(r1.updatedAt).slice(11, 19) : r1.motivo);
  T("el servidor confirma devolviendo la fila escrita", !!r1.updatedAt);
  T("la version avanza (no se repite la anterior)", r1.updatedAt !== inicial.updatedAt);

  // 3. el mismo cliente reintentando con la version VIEJA -> conflicto, sin sobrescribir
  const r2 = await guardarCondicionado({ ...(inicial.value || {}), __test_paso1: "B-pisador" }, inicial.updatedAt);
  T("guardar con una version obsoleta da CONFLICTO", r2.ok === false && r2.motivo === "conflicto", r2.motivo);

  // 4. y de verdad NO piso el contenido del otro
  const tras = await cargar();
  T("el contenido del primero quedo intacto tras el conflicto", tras.value && tras.value.__test_paso1 === "A",
    "valor en servidor = " + (tras.value && tras.value.__test_paso1));
  T("la version del servidor es la del primer guardado", tras.updatedAt === r1.updatedAt);

  // 5. el segundo, recargando, si puede guardar
  const r3 = await guardarCondicionado({ ...(tras.value || {}), __test_paso1: "B-tras-recargar" }, tras.updatedAt);
  T("tras recargar, el segundo si puede guardar", r3.ok, r3.ok ? "" : r3.motivo);

  // 6. version inventada -> conflicto, nunca escritura a ciegas
  const r4 = await guardarCondicionado({ __test_paso1: "no debe escribirse" }, "2000-01-01T00:00:00+00:00");
  T("una version inventada nunca escribe", r4.ok === false && r4.motivo === "conflicto", r4.motivo);

  // 7. tamaño real: el blob completo viaja sin problema (sin keepalive)
  const grande = await cargar();
  const kb = Buffer.byteLength(JSON.stringify(grande.value || {}), "utf8") / 1024;
  const r5 = await guardarCondicionado(grande.value, grande.updatedAt);
  T("un cuerpo de " + Math.round(kb) + " KB se guarda sin problema", r5.ok, r5.ok ? "" : r5.motivo);

} finally {
  // --- restaurar el estado original, pase lo que pase ---
  const actual = await cargar();
  const r = await guardarCondicionado(inicial.value, actual.updatedAt);
  const fin = await cargar();
  const limpio = !fin.value || fin.value.__test_paso1 === undefined;
  console.log("\n  restauracion: " + (r.ok && limpio ? "OK, sin marcas de prueba" : "REVISAR MANUALMENTE"));
}

console.log("\n== " + (fallos === 0 ? "TODO VERDE" : fallos + " FALLO(S)") + " ==");
process.exit(fallos === 0 ? 0 : 1);

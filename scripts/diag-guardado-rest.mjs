/* INCIDENTE — guardado roto en produccion. SONDA REST.
 * Reproduce el camino EXACTO de la app (anon + POST upsert) sin tocar datos reales:
 *  - GET     -> ¿lee?
 *  - PATCH sobre un id INEXISTENTE -> prueba el privilegio UPDATE sin modificar ninguna fila.
 *  - HEAD    -> confirma alcance.
 * Cero filas creadas, cero filas modificadas.
 */
import { existsSync, readFileSync } from "node:fs";

const SUPA_URL = "https://bywovqayuzodbzwsriet.supabase.co";
// anon key: es publica, viaja en el bundle del cliente. Se usa tal cual la usa la app.
const ANON = (readFileSync("src/OsirisModule.jsx", "utf8").match(/const SUPA_KEY\s*=\s*"([^"]+)"/) || [])[1] || "";
if (!ANON) { console.log("ABORT: no se pudo leer la anon key del fuente"); process.exit(2); }

const ENVF = ".claude/worktrees/osiris-piloto2/.env.osiris-production.local";
let SEC = "";
if (existsSync(ENVF)) {
  for (const l of readFileSync(ENVF, "utf8").split(/\r?\n/)) {
    const m = l.replace(/^\s*export\s+/, "").match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[1] === "OSIRIS_PROD_SUPABASE_SERVICE_ROLE_KEY_LEGACY") { SEC = m[2].trim().replace(/^"|"$/g, ""); }
  }
}

const h = (k, extra) => Object.assign({ apikey: k, Authorization: "Bearer " + k }, extra || {});
const ID_FANTASMA = "__diag_no_existe_20260820__";

async function probe(nombre, url, opts) {
  try {
    const r = await fetch(url, opts);
    const txt = r.ok ? "" : (await r.text()).slice(0, 160).replace(/\s+/g, " ");
    console.log("  " + nombre.padEnd(52) + " HTTP " + r.status + (txt ? "  " + txt : ""));
    return r.status;
  } catch (e) { console.log("  " + nombre.padEnd(52) + " ERROR " + e.message); return -1; }
}

console.log("== SONDA REST · produccion · calendario_data ==\n");

console.log("-- con ANON (lo que usa la app en el navegador) --");
await probe("GET  id=osiris (lectura)", `${SUPA_URL}/rest/v1/calendario_data?id=eq.osiris&select=id,updated_at`, { headers: h(ANON) });
await probe("PATCH id INEXISTENTE (prueba UPDATE, 0 filas)",
  `${SUPA_URL}/rest/v1/calendario_data?id=eq.${ID_FANTASMA}`,
  { method: "PATCH", headers: h(ANON, { "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ updated_at: new Date().toISOString() }) });
await probe("POST upsert id INEXISTENTE, sin cuerpo valido (privilegio INSERT)",
  `${SUPA_URL}/rest/v1/calendario_data`,
  { method: "POST", headers: h(ANON, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([]) });

if (SEC) {
  console.log("\n-- con SERVICE ROLE (bypassa RLS; separa 'permisos' de 'otra cosa') --");
  await probe("GET  id=osiris", `${SUPA_URL}/rest/v1/calendario_data?id=eq.osiris&select=id,updated_at`, { headers: h(SEC) });
  await probe("PATCH id INEXISTENTE (0 filas)",
    `${SUPA_URL}/rest/v1/calendario_data?id=eq.${ID_FANTASMA}`,
    { method: "PATCH", headers: h(SEC, { "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ updated_at: new Date().toISOString() }) });
} else {
  console.log("\n(sin service role a mano: solo se probo anon)");
}

console.log("\n-- ultimas escrituras registradas --");
const k = SEC || ANON;
try {
  const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data?select=id,updated_at&order=updated_at.desc&limit=10`, { headers: h(k) });
  if (r.ok) for (const row of await r.json()) console.log("  " + String(row.id).padEnd(24) + " " + String(row.updated_at).slice(0, 19));
  else console.log("  no se pudo listar: HTTP " + r.status);
} catch (e) { console.log("  error: " + e.message); }

console.log("\n== SONDA COMPLETA · 0 filas creadas · 0 filas modificadas ==");

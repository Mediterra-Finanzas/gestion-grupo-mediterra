/* Cobertura de recuperacion de PRODUCCION con la evidencia accesible.
 * SOLO GET. No se activa ningun servicio, no se restaura nada, no se escribe. */
import { readFileSync } from "node:fs";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const H = { apikey: K, Authorization: "Bearer " + K };
const get = (r) => fetch(`${U}/rest/v1/${r}`, { headers: H });

console.log("== COBERTURA DE RECUPERACION · PRODUCCION (solo lectura) ==");
console.log();

// 1 · respaldos en tabla (el mecanismo de la app)
const r1 = await get("calendario_data?id=like.backup_*&select=id,updated_at&order=id.desc&limit=40");
const backs = r1.ok ? await r1.json() : [];
console.log("1 · RESPALDOS EN TABLA (mecanismo de la aplicacion)");
console.log("    filas backup_*: " + backs.length + (backs.length ? " · mas reciente " + backs[0].id : ""));
console.log("    veredicto: " + (backs.length ? "hay respaldos en tabla" : "NO HAY NINGUNO. auto-v3 esta suspendido desde el hotfix, y antes tampoco dejaba filas."));
console.log();

// 2 · bitacora de cambios
const r2 = await get("calendario_data?id=eq.audit_log&select=value,updated_at");
const [au] = r2.ok ? await r2.json() : [];
console.log("2 · BITACORA (fila audit_log)");
if (!au) console.log("    no legible con esta clave");
else {
  const v = au.value;
  const arr = Array.isArray(v) ? v : Array.isArray(v?.entradas) ? v.entradas : Array.isArray(v?.log) ? v.log : null;
  console.log("    forma: " + (Array.isArray(v) ? "array" : typeof v) + " · claves: " + (Array.isArray(v) ? "-" : Object.keys(v || {}).slice(0, 6).join(",")));
  if (arr) {
    const fechas = arr.map((x) => x.fecha || x.ts || x.timestamp || x.created_at).filter(Boolean).sort();
    console.log("    entradas: " + arr.length + " · desde " + String(fechas[0]).slice(0, 10) + " hasta " + String(fechas[fechas.length - 1]).slice(0, 10));
    const modulos = {};
    for (const x of arr) { const m = x.modulo || x.module || "?"; modulos[m] = (modulos[m] || 0) + 1; }
    console.log("    por modulo: " + Object.entries(modulos).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => k + "=" + n).join(" · "));
    const conAntes = arr.filter((x) => x.antes !== undefined || x.valorAnterior !== undefined || x.previo !== undefined).length;
    console.log("    entradas con valor ANTERIOR guardado: " + conAntes + "/" + arr.length);
    console.log("    veredicto: " + (conAntes === arr.length ? "la bitacora permitiria revertir campo a campo"
      : conAntes === 0 ? "la bitacora dice QUE cambio, no A QUE valor estaba antes: no sirve para revertir por si sola"
      : "cobertura parcial para revertir"));
  }
  console.log("    ultima escritura: " + au.updated_at);
}
console.log();

// 3 · alcance del dato vivo
const r3 = await get("calendario_data?select=id,updated_at&order=updated_at.desc");
const filas = r3.ok ? await r3.json() : [];
console.log("3 · SUPERFICIE A RECUPERAR");
console.log("    filas en calendario_data: " + filas.length);
const hoy = new Date().toISOString().slice(0, 10);
console.log("    escritas hoy (" + hoy + "): " + filas.filter((f) => String(f.updated_at).startsWith(hoy)).length);
const antig = filas.map((f) => (Date.now() - new Date(f.updated_at)) / 86400000);
console.log("    antiguedad: mediana " + Math.round(antig.sort((a, b) => a - b)[Math.floor(antig.length / 2)]) + " dias · mas vieja " + Math.round(antig[antig.length - 1]) + " dias");
console.log();

// 4 · lo que NO se puede ver con esta clave
console.log("4 · LO QUE ESTA CLAVE NO PUEDE VER");
for (const [q, etiq] of [["rpc/version", "version de Postgres"], ["pg_stat_activity?select=pid", "actividad"]]) {
  const r = await get(q);
  console.log("    " + etiq.padEnd(22) + " HTTP " + r.status);
}
console.log("    pg_settings (archive_mode, wal_level)  requiere una conexion de base, no PostgREST");
console.log("    frecuencia / retencion / PITR          solo el panel o la API de gestion los exponen");

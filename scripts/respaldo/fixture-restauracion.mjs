/* Fixture de login para la restauración aplicada. SOLO staging.
 *
 * Paso 1 (por defecto, solo lectura): ¿sirve el usuario sintético que ya existe?
 *   Para probar login contra datos restaurados, el sujeto debe estar en el padrón
 *   (main.usuarios), tener credencial `_h` en `pins`, tener alias vigente en la bóveda con
 *   origen calendario_data_main (si no, el lote queda INCOMPLETO) y tener su PIN custodiado
 *   en .env.osiris-staging.local. Se informa cada condición; no se cambia su identidad ni
 *   sus vínculos.
 *
 * Paso 2 (--crear, solo si el paso 1 dice que no sirve): fixture ADICIONAL autorizado.
 *   - La identidad NO la crea este script: la enrola el dueño de identidad con su función
 *     canónica (no hay segundo modelo). El script exige que el alias ya exista y aborta si no.
 *   - Genera el PIN, lo custodia en el archivo local excluido de git y no lo imprime.
 *   - Agrega el usuario a main.usuarios y la credencial `_h` (con pol y fecha) a pins, cada
 *     una en UNA sentencia que parte del valor vigente: preserva lo que el equipo escriba.
 *   - Nunca escribe un PIN en claro en main ni en pins.
 *
 * Paso 3 (--desactivar): marca SOLO al fixture como desactivado, para probar en un lote
 *   posterior que un desactivado restaurado no entra.
 *
 * Uso:  SP=<scratchpad con pgclient> node fixture-restauracion.mjs [--crear | --desactivar] */
import { readFileSync, appendFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const ENV = RAIZ + "/.env.osiris-staging.local";
const t = readFileSync(ENV, "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
if (!DSN || DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: el destino no es staging"); process.exit(2); }
const { hashPin, pinNuevoValido } = await import("file:///" + W + "/src/pinHash.js");
const hashLlave = (n) => crypto.createHash("sha256").update(Buffer.from(String(n), "utf8")).digest("hex");
const modo = process.argv.includes("--crear") ? "crear" : process.argv.includes("--desactivar") ? "desactivar" : "inspeccionar";

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
// Huella estructural: staging tiene la bóveda; producción no. Sin ella, no se sigue.
const { rows: [huella] } = await c.query("select to_regclass('public.sec_identidad') is not null as boveda, to_regclass('public.sec_identidad_alias') is not null as alias");
if (!huella.boveda || !huella.alias) { console.log("ABORT: sin bóveda sec_*; no parece staging"); process.exit(2); }

const leerMainPins = async () => {
  const { rows } = await c.query("select id, value from public.calendario_data where id in ('main','pins')");
  const m = Object.fromEntries(rows.map((r) => [r.id, r.value]));
  return { usuarios: m.main?.usuarios || [], pins: m.pins || {} };
};
const aliasVigente = async (nombre) => (await c.query(`select a.identity_id::text as identity_id, i.estado
  from public.sec_identidad_alias a join public.sec_identidad i on i.identity_id = a.identity_id
  where a.origen = 'calendario_data_main' and a.vigente_hasta is null and a.llave_hash = $1`, [hashLlave(nombre)])).rows;

// ── 1 · inspección del sintético existente ───────────────────────────────────
console.log("== 1 · ¿SIRVE EL USUARIO SINTÉTICO EXISTENTE? ==");
const testEmail = G("OSIRIS_TEST_EMAIL").toLowerCase();
const { usuarios, pins } = await leerMainPins();
let sirve = false;
if (!testEmail) console.log("   no hay OSIRIS_TEST_EMAIL custodiado");
else {
  const { rows: au } = await c.query("select id::text from auth.users where lower(email) = $1", [testEmail]);
  const { rows: vinc } = au.length ? await c.query("select identity_id::text from public.sec_identidad_auth_vinculo where auth_user_id = $1", [au[0].id]) : { rows: [] };
  const enPadron = usuarios.find((u) => String(u.email || "").toLowerCase() === testEmail);
  const alias = enPadron ? await aliasVigente(enPadron.nombre) : [];
  const conds = {
    "usuario de Auth": au.length === 1,
    "vínculo con una identidad": vinc.length >= 1,
    "está en el padrón (main.usuarios)": !!enPadron,
    "tiene credencial _h en pins": !!(enPadron && pins[enPadron.nombre + "_h"]),
    "alias vigente origen calendario_data_main": alias.length === 1 && alias[0].estado === "activa",
    "el alias apunta a la misma identidad del vínculo": alias.length === 1 && vinc.some((v) => v.identity_id === alias[0].identity_id),
    "PIN custodiado (OSIRIS_RESPALDO_FIXTURE_PIN) para ese correo": !!G("OSIRIS_RESPALDO_FIXTURE_PIN") && G("OSIRIS_RESPALDO_FIXTURE_EMAIL").toLowerCase() === testEmail,
  };
  for (const [k, v] of Object.entries(conds)) console.log("   " + (v ? "sí " : "no ") + " " + k);
  sirve = Object.values(conds).every(Boolean);
}
console.log("   VEREDICTO: " + (sirve ? "SIRVE para la prueba, sin cambios" : "NO SIRVE para login contra datos restaurados"));
if (modo === "inspeccionar") { await c.end(); process.exit(0); }

// ── 2 · fixture adicional ────────────────────────────────────────────────────
const NOMBRE = G("OSIRIS_RESPALDO_FIXTURE_NOMBRE") || "Fixture Respaldo Sintetico";
const EMAIL = G("OSIRIS_RESPALDO_FIXTURE_EMAIL") || "respaldo.fixture@ejemplo.invalid";
if (modo === "crear") {
  if (sirve) { console.log("ABORT: el sintético existente sirve; no se crea otro"); process.exit(3); }
  console.log("\n== 2 · FIXTURE ADICIONAL ==");
  const alias = await aliasVigente(NOMBRE);
  if (alias.length !== 1 || alias[0].estado !== "activa") {
    console.log("   DETENIDO: falta el alias vigente de la identidad del fixture.");
    console.log("   Lo enrola el dueño de identidad con su función canónica; llave_hash = sha256 del nombre del fixture.");
    console.log("   Firma disponible: " + ((await c.query("select pg_get_function_identity_arguments(oid) a from pg_proc where proname = 'sec_identidad_enrolar'")).rows.map((r) => r.a).join(" | ") || "no existe"));
    await c.end(); process.exit(4);
  }
  let pin = G("OSIRIS_RESPALDO_FIXTURE_PIN");
  if (!pin) {
    do { pin = String(crypto.randomInt(0, 1000000)).padStart(6, "0"); } while (!pinNuevoValido(pin).ok);
    appendFileSync(ENV, `\nOSIRIS_RESPALDO_FIXTURE_NOMBRE=${NOMBRE}\nOSIRIS_RESPALDO_FIXTURE_EMAIL=${EMAIL}\nOSIRIS_RESPALDO_FIXTURE_PIN=${pin}\n`);
    console.log("   PIN generado y custodiado en .env.osiris-staging.local (no se imprime)");
  }
  const cred = { ...(await hashPin(pin)), fecha: new Date().toISOString().slice(0, 10), pol: "6dig" };
  const usuario = { nombre: NOMBRE, email: EMAIL, cargo: "Fixture de restauración", rol: "consulta", modulos: ["tareas"],
    empresas_permitidas: [], esCFO: false, desactivado: false, tab_permisos: {}, cadenaAprobacion: [], rendPorOtros: false, rendVerTodas: false };
  const u = await c.query(`update public.calendario_data
      set value = jsonb_set(value, '{usuarios}', coalesce(value->'usuarios', '[]'::jsonb) || jsonb_build_array($1::jsonb)), updated_at = now()
    where id = 'main' and not exists (select 1 from jsonb_array_elements(coalesce(value->'usuarios','[]'::jsonb)) x
                                       where x->>'nombre' = $2 or lower(x->>'email') = lower($3))`,
    [JSON.stringify(usuario), NOMBRE, EMAIL]);
  console.log("   padrón: " + (u.rowCount ? "fixture agregado" : "ya estaba; sin cambios"));
  const p = await c.query(`update public.calendario_data set value = value || jsonb_build_object($1::text, $2::text), updated_at = now()
    where id = 'pins' and not (value ? $1)`, [NOMBRE + "_h", JSON.stringify(cred)]);
  console.log("   pins: " + (p.rowCount ? "credencial del fixture agregada" : "ya existía; sin cambios"));
}

// ── 3 · desactivar solo al fixture ───────────────────────────────────────────
if (modo === "desactivar") {
  const r = await c.query(`update public.calendario_data
      set value = jsonb_set(value, '{usuarios}', (select jsonb_agg(case when x->>'nombre' = $1 then x || '{"desactivado":true}'::jsonb else x end order by o)
                                                  from jsonb_array_elements(value->'usuarios') with ordinality e(x, o))), updated_at = now()
    where id = 'main' and exists (select 1 from jsonb_array_elements(value->'usuarios') x where x->>'nombre' = $1)`, [NOMBRE]);
  console.log("== 3 · fixture " + (r.rowCount ? "desactivado" : "no encontrado; sin cambios") + " ==");
}
await c.end();

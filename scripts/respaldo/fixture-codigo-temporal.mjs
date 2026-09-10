/* Emite en STAGING un código provisorio para el FIXTURE sintético, con el formato de App.jsx
 * (crearTempCred: hashPin(código) + `exp` a 45 minutos). Sirve para probar que, tras restaurar, el
 * PIN anterior sigue inhabilitado y la app pide un código nuevo.
 *
 * - Solo toca la llave `<fixture>_temp` de `pins`, en una sentencia aditiva que no pisa si existe.
 * - No toca a ningún otro usuario.
 * - El código no se guarda ni se imprime: después de restaurar ya no sirve, que es lo que se prueba.
 *
 * Uso: SP=<pgclient> node fixture-codigo-temporal.mjs */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), NOMBRE = G("OSIRIS_RESPALDO_FIXTURE_NOMBRE");
if (!DSN.includes("nlvfjpwiecgrosjnwwik") || DSN.includes("bywovqayuzodbzwsriet") || !NOMBRE) { console.log("ABORT: no es staging o falta el fixture"); process.exit(2); }
const { hashPin } = await import("file:///" + W + "/src/pinHash.js");

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: [h] } = await c.query("select to_regclass('public.sec_identidad_alias') is not null as boveda");
if (!h.boveda) { console.log("ABORT: sin bóveda; no parece staging"); process.exit(2); }
const { rows } = await c.query("select id, value from public.calendario_data where id in ('main','pins')");
const m = Object.fromEntries(rows.map((r) => [r.id, r.value]));
const fx = (m.main?.usuarios || []).find((u) => u.nombre === NOMBRE);
if (!fx || !m.pins?.[NOMBRE + "_h"]) { console.log("ABORT: el fixture no está en el padrón o no tiene credencial"); process.exit(3); }

const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
const cred = await hashPin(codigo);
cred.exp = Date.now() + 45 * 60 * 1000;
const r = await c.query(`update public.calendario_data set value = value || jsonb_build_object($1::text, $2::text), updated_at = now()
  where id = 'pins' and not (value ? $1)`, [NOMBRE + "_temp", JSON.stringify(cred)]);
await c.end();
console.log(`código provisorio del fixture: ${r.rowCount ? "emitido (vence en 45 min; no se guarda ni se imprime)" : "ya existía; sin cambios"}`);

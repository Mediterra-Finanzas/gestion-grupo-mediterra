/* Enrolamiento del usuario sintético ADICIONAL de restauración, con las funciones canónicas de
 * SEC-HF2-A. SOLO staging. Autorizado por el CFO (2026-09-10) como alta aditiva.
 *
 * No crea un segundo modelo de identidad: usa `sec_identidad_enrolar` y `sec_alias_resolver`
 * con el rol `sec_cred_backend` (SEC_BACKEND_DSN), igual que hf2a5-22-staging-mapa.mjs.
 *   - identity_id GENERADO (randomUUID), nunca derivado del correo ni del nombre;
 *   - empresa = la de las identidades legacy de `calendario_data_main` (se lee, no se inventa);
 *   - correo solo hasheado: sha256(trim(lower(correo)));
 *   - alias `calendario_data_main`, llave sha256 del nombre EXACTO, método EXACT, con motivo;
 *   - actor propio del carril de respaldo, para que la auditoría no se confunda con la migración.
 * No toca identidades, alias ni usuarios existentes. Si el alias o el correo ya existen, no
 * enrola otro: informa y se detiene.
 *
 * Uso: SP=<pgclient> node enrolar-fixture.mjs [--aplicar]   (sin --aplicar: en seco) */
import { readFileSync, appendFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const REF = "nlvfjpwiecgrosjnwwik", PROD = "bywovqayuzodbzwsriet";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const SEC = G("SEC_BACKEND_DSN"), DSN = G("OSIRIS_STAGING_DATABASE_URL");
const aplicar = process.argv.includes("--aplicar");
const abortar = (m, c = 2) => { console.log("ABORT: " + m); process.exit(c); };
const usuario = (d) => { try { return new URL(d).username; } catch (e) { return ""; } };
if (![SEC, DSN].every((x) => x && x.includes(REF) && !x.includes(PROD))) abortar("credenciales ausentes o no son de staging");
if (usuario(SEC) !== `sec_cred_backend.${REF}`) abortar("SEC_BACKEND_DSN no es el rol sec_cred_backend de staging");

const NOMBRE = G("OSIRIS_RESPALDO_FIXTURE_NOMBRE") || "Fixture Respaldo Sintetico";
const EMAIL = G("OSIRIS_RESPALDO_FIXTURE_EMAIL") || "respaldo.fixture@ejemplo.invalid";
const ACTOR = "5e5a1d00-0000-4000-8000-00000000f1a0";      // carril respaldo
const sha = (s) => crypto.createHash("sha256").update(Buffer.from(String(s), "utf8")).digest("hex");
const llave = sha(NOMBRE), correoHash = sha(EMAIL.trim().toLowerCase());

// Lectura con el rol postgres, en solo lectura: empresa de las identidades legacy y ausencia del fixture.
const lec = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await lec.connect();
await lec.query("begin transaction read only");
const { rows: emp } = await lec.query(`select i.empresa_id::text as empresa, count(*)::int as n from public.sec_identidad i
  join public.sec_identidad_alias a on a.identity_id = i.identity_id where a.origen = 'calendario_data_main' and a.vigente_hasta is null group by 1`);
const { rows: [ya] } = await lec.query(`select
  (select count(*)::int from public.sec_identidad_alias where origen = 'calendario_data_main' and llave_hash = $1 and vigente_hasta is null) as alias,
  (select count(*)::int from public.sec_identidad where correo_norm_hash = $2) as correo,
  (select count(*)::int from public.sec_identidad) as identidades`, [llave, correoHash]);
await lec.query("rollback"); await lec.end();
if (emp.length !== 1) abortar(`se esperaba una sola empresa en las identidades legacy; hay ${emp.length}`);
const EMPRESA = emp[0].empresa;
console.log(`== ENROLAMIENTO DEL FIXTURE · staging · ${aplicar ? "APLICAR" : "en seco"} ==`);
console.log(`   empresa de las ${emp[0].n} identidades legacy: ${EMPRESA.slice(0, 8)}… · identidades hoy: ${ya.identidades}`);
if (ya.alias) { console.log(`   el alias del fixture ya existe (${ya.alias}). No se enrola otro.`); process.exit(0); }

// Reanudación: si la identidad ya quedó enrolada con el correo sintético del fixture y el alias
// falló, se reutiliza ESA identidad. No se crea otra.
let identityId = null;
if (ya.correo) {
  const l2 = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
  await l2.connect();
  const { rows } = await l2.query("select identity_id::text as id, empresa_id::text as emp, estado from public.sec_identidad where correo_norm_hash = $1", [correoHash]);
  await l2.end();
  if (rows.length !== 1 || rows[0].emp !== EMPRESA || rows[0].estado !== "activa") abortar("el correo del fixture existe con otra forma; revisar antes de seguir");
  identityId = rows[0].id;
  console.log(`   identidad del fixture ya enrolada (${identityId.slice(0, 8)}…), sin alias: se completa el alias`);
}
if (!aplicar) {
  console.log(`   EN SECO: ${identityId ? "falta resolver el alias" : "alias y correo ausentes; se enrolaría una identidad nueva"}. Para aplicar: --aplicar`);
  process.exit(0);
}
const custodiar = (id) => {
  if (readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8").includes("OSIRIS_RESPALDO_FIXTURE_IDENTITY_ID=")) return;
  appendFileSync(RAIZ + "/.env.osiris-staging.local",
    `\n# fixture de restauracion enrolado ${new Date().toISOString()} (identidad sintetica)\nOSIRIS_RESPALDO_FIXTURE_IDENTITY_ID=${id}\n`);
};

const c = new Client({ connectionString: SEC, ssl: { rejectUnauthorized: false } });
await c.connect();
if (!identityId) {
  identityId = crypto.randomUUID();
  const r1 = (await c.query("select public.sec_identidad_enrolar($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid) as r",
    [identityId, EMPRESA, correoHash, ACTOR, crypto.randomUUID()])).rows[0].r;
  console.log("   sec_identidad_enrolar → " + r1);
  if (r1 !== "OK:enrolada") { await c.end(); abortar("el enrolamiento no quedó OK:enrolada", 1); }
}
custodiar(identityId);
// El motivo es un código: sec_evid_motivo_ck exige ^[a-z][a-z0-9_]{1,60}$.
const MOTIVO = "fixture_sintetico_respaldo_recuperacion";
const r2 = (await c.query("select public.sec_alias_resolver($1::uuid, 'calendario_data_main', $2, 'EXACT', $3, $4::uuid, $5::uuid, $6::uuid) as r",
  [identityId, llave, MOTIVO, ACTOR, crypto.randomUUID(), crypto.randomUUID()])).rows[0].r;
console.log("   sec_alias_resolver    → " + r2.replace(/:\d+$/, ":<alias_id>"));
await c.end();
if (!/^OK:resuelto:/.test(r2)) abortar("el alias no quedó resuelto", 1);
console.log("   identity_id custodiado en .env.osiris-staging.local · operaciones registradas en sec_operacion");

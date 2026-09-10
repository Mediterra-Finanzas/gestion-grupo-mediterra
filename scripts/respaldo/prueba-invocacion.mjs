/* Registro de invocaciones y correo de prueba del handler, contra STAGING.
 * Las invocaciones de esta prueba usan user-agent "prueba-local", para que la
 * verificacion posterior no las confunda con un Run o un disparo de Vercel.
 * La tabla es append-only: estas filas quedan, rotuladas. Sin SMTP configurado,
 * ningun correo sale. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const W = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/wt-respaldo-prod";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
Object.assign(process.env, {
  SUPABASE_URL: G("OSIRIS_STAGING_SUPABASE_URL"), SUPABASE_SERVICE_ROLE_KEY: G("OSIRIS_STAGING_SUPABASE_SECRET_KEY"),
  CRON_SECRET: G("CRON_SECRET"), BACKUP_ENCRYPTION_KEY_A: G("BACKUP_ENCRYPTION_KEY_A"), BACKUP_ENCRYPTION_KEY_B: G("BACKUP_ENCRYPTION_KEY_B"),
  BACKUP_KID_A: G("BACKUP_KID_A"), BACKUP_KID_B: G("BACKUP_KID_B"), RESPALDO_BUCKET: "respaldo-osiris-staging",
});
for (const k of ["SMTP_MEDITERRA_USER", "SMTP_MEDITERRA_PASS", "SMTP_OSIRIS_USER", "SMTP_OSIRIS_PASS"]) delete process.env[k];
if (process.env.SUPABASE_URL.includes("bywovqayuzodbzwsriet")) { console.log("ABORT"); process.exit(2); }
const H = require(W + "/api/osiris-respaldo-cron.js");
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const c = new Client({ connectionString: G("OSIRIS_STAGING_DATABASE_URL"), ssl: { rejectUnauthorized: false } }); await c.connect();

let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(58) + (d || "")); };
const resp = () => { const o = {}; return { status(x) { o.code = x; return this; }, json(b) { o.body = b; return o; } }; };
const marca = "prueba-" + Date.now();
const llamar = (sufijo, url = "/api/osiris-respaldo-cron") => H({ method: "GET", url,
  headers: { authorization: "Bearer " + process.env.CRON_SECRET, "user-agent": "prueba-local/1.0", "x-vercel-id": marca + "-" + sufijo } }, resp());

console.log("== REGISTRO DE INVOCACIONES Y CORREO DE PRUEBA · staging ==");
delete process.env.RESPALDO_CORREO_PRUEBA; delete process.env.CORREO_PRUEBA_PERMITIDOS;
const r1 = await llamar("a");
chk("invocacion registrada", r1.body.invocacionRegistrada === true, "estado " + r1.body.estado);
chk("sin RESPALDO_CORREO_PRUEBA no se intenta correo", r1.body.correoPrueba === null);

process.env.RESPALDO_CORREO_PRUEBA = "si";
const r2 = await llamar("b", "/api/osiris-respaldo-cron?origen=manual");
chk("correo de prueba sin buzon aprobado -> no se envia", r2.body.correoPrueba && r2.body.correoPrueba.aceptado === false &&
    /sin destinatario de prueba aprobado/.test(r2.body.correoPrueba.motivo), r2.body.correoPrueba && r2.body.correoPrueba.motivo);

process.env.CORREO_PRUEBA_PERMITIDOS = "buzon.prueba@ejemplo.invalid";
const r3 = await llamar("c");
chk("con buzon aprobado pero sin SMTP -> no aceptado, sin fingir", r3.body.correoPrueba && r3.body.correoPrueba.aceptado === false,
    r3.body.correoPrueba && r3.body.correoPrueba.motivo);

const { rows } = await c.query("select * from public.respaldo_invocacion where vercel_id like $1 order by id", [marca + "%"]);
chk("las tres invocaciones quedaron registradas", rows.length === 3, rows.length + " filas");
chk("origen declarado se guarda", rows[1] && rows[1].origen_declarado === "manual");
chk("el registro no guarda direcciones de correo", rows.every((x) => !JSON.stringify(x.correo_prueba || {}).includes("@")));
chk("user-agent de prueba, distinto de vercel-cron", rows.every((x) => x.user_agent === "prueba-local/1.0"));
let inmutable = false;
try { await c.query("update public.respaldo_invocacion set estado='x' where id=$1", [rows[0].id]); } catch (e) { inmutable = /append-only/.test(e.message); }
chk("la invocacion registrada no se puede modificar", inmutable);
await c.end();
console.log();
console.log("INVOCACION: " + (f === 0 ? "PASS" : "FALLA · " + f));

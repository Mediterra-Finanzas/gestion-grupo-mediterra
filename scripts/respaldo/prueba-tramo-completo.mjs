/* Tramo COMPLETO del respaldo, ejercido contra staging real con el mismo handler
 * que desplegara Vercel. Aca se invoca en proceso; el disparo por el programador
 * es el tramo aparte que exige el proyecto de Vercel. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const W = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/wt-respaldo-prod";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();

process.env.SUPABASE_URL = G("OSIRIS_STAGING_SUPABASE_URL");
process.env.SUPABASE_SERVICE_ROLE_KEY = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
process.env.CRON_SECRET = G("CRON_SECRET");
process.env.BACKUP_ENCRYPTION_KEY_A = G("BACKUP_ENCRYPTION_KEY_A");
process.env.BACKUP_ENCRYPTION_KEY_B = G("BACKUP_ENCRYPTION_KEY_B");
process.env.BACKUP_KID_A = G("BACKUP_KID_A");
process.env.BACKUP_KID_B = G("BACKUP_KID_B");
process.env.RESPALDO_BUCKET = "respaldo-osiris-staging";
process.env.RESPALDO_AVISO_TO = "respaldo-cfo@ejemplo.invalid";
if (process.env.SUPABASE_URL.includes("bywovqayuzodbzwsriet")) { console.log("ABORT"); process.exit(2); }

const H = require(W + "/api/osiris-respaldo-cron.js");
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const DSN = G("OSIRIS_STAGING_DATABASE_URL");

let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(52) + (d || "")); };
const resp = () => { const o = { code: 0, body: null }; return { status(c) { o.code = c; return this; }, json(b) { o.body = b; return o; }, _o: o }; };
const llamar = (headers, method = "GET") => H({ method, headers }, resp());

console.log("== TRAMO COMPLETO · snapshot -> cifrado A/B -> subida -> READY -> verificacion ==");

// autenticacion, con el mismo helper que ya usa el cron productivo
chk("sin Authorization -> 401", (await llamar({})).code === 401);
chk("secreto incorrecto -> 401", (await llamar({ authorization: "Bearer " + "z".repeat(40) })).code === 401);
chk("metodo distinto de GET -> 405", (await llamar({ authorization: "Bearer " + process.env.CRON_SECRET }, "POST")).code === 405);

// guardia fail-closed contra produccion
const guardaProd = H.guardia({ url: "https://bywovqayuzodbzwsriet.supabase.co", key: "x", claveA: "a", claveB: "b", permiteProduccion: false });
chk("guardia: apuntar a produccion sin permiso -> aborta", !!guardaProd, guardaProd);
chk("guardia: claves A y B iguales -> aborta", !!H.guardia({ url: "https://x.supabase.co", key: "k", claveA: "m", claveB: "m" }), "misma clave");

// limpiar el lote de hoy para poder medir una corrida completa
const lote = "auto-" + new Date().toISOString().slice(0, 10);
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
await c.query("delete from public.respaldo_lote where lote_id=$1", [lote]);

const r = await llamar({ authorization: "Bearer " + process.env.CRON_SECRET });
console.log();
for (const p of r.body.pasos || []) console.log("      " + (p.ok ? "ok   " : "FALLA") + " " + String(p.paso).padEnd(14) + (p.detalle || ""));
console.log();
chk("la corrida completa devuelve 200", r.code === 200, "HTTP " + r.code);
chk("estado final READY_VERIFICADO", r.body.estado === "READY_VERIFICADO", r.body.estado);
chk("los seis pasos en verde", (r.body.pasos || []).every((p) => p.ok), (r.body.pasos || []).length + " pasos");

const { rows: [fila] } = await c.query("select * from public.respaldo_lote where lote_id=$1", [lote]);
chk("la base registra READY", fila && fila.estado === "READY", fila && fila.estado);
chk("la base registra verificado_at", !!(fila && fila.verificado_at), fila && fila.verificacion);
chk("sha de A y B registrados", !!(fila && fila.sha_a && fila.sha_b), fila && (fila.sha_a || "").slice(0, 12) + "… / " + (fila.sha_b || "").slice(0, 12) + "…");

// segunda corrida el mismo dia: idempotente, no duplica
const r2 = await llamar({ authorization: "Bearer " + process.env.CRON_SECRET });
chk("segunda corrida del mismo dia -> no duplica", r2.body.estado === "READY", r2.body.estado + " (" + (r2.body.pasos[0] || {}).detalle + ")");

// dos corridas simultaneas: la clave primaria resuelve la carrera
await c.query("delete from public.respaldo_lote where lote_id=$1", [lote]);
const [a, b] = await Promise.all([llamar({ authorization: "Bearer " + process.env.CRON_SECRET }), llamar({ authorization: "Bearer " + process.env.CRON_SECRET })]);
const creadas = [a, b].filter((x) => x.body.creado).length;
chk("dos corridas simultaneas -> una sola creacion", creadas === 1, a.body.estado + " / " + b.body.estado);

const { rows: [salud] } = await c.query("select veredicto, horas_desde_verificado from public.respaldo_salud");
chk("la salud pasa a OK con un lote verificado", salud.veredicto === "OK", salud.veredicto + " · " + salud.horas_desde_verificado + " h");
await c.end();
console.log();
console.log("TRAMO: " + (f === 0 ? "PASS" : "FALLA · " + f));

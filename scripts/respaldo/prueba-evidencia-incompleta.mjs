/* Credencial sin identidad -> EVIDENCIA INCOMPLETA -> resuelta la identidad,
 * el reintento produce A y B completos y vinculados al MISMO snapshot.
 * Todo contra staging real. La fila `pins` se altera y se restaura al final. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto"; import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const W = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/wt-respaldo-prod";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
for (const [k, v] of Object.entries({
  SUPABASE_URL: G("OSIRIS_STAGING_SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: G("OSIRIS_STAGING_SUPABASE_SECRET_KEY"),
  CRON_SECRET: G("CRON_SECRET"),
  BACKUP_ENCRYPTION_KEY_A: G("BACKUP_ENCRYPTION_KEY_A"),
  BACKUP_ENCRYPTION_KEY_B: G("BACKUP_ENCRYPTION_KEY_B"),
  BACKUP_KID_A: G("BACKUP_KID_A"), BACKUP_KID_B: G("BACKUP_KID_B"),
  RESPALDO_BUCKET: "respaldo-osiris-staging",
})) process.env[k] = v;
if (process.env.SUPABASE_URL.includes("bywovqayuzodbzwsriet")) { console.log("ABORT"); process.exit(2); }

const H = require(W + "/api/osiris-respaldo-cron.js");
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const ident = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const { restaurarLote, MOTIVO } = await import("file:///" + W + "/src/data/restaurarLote.js");
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
const U = process.env.SUPABASE_URL, S = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HS = { apikey: S, Authorization: "Bearer " + S };
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const bajar = async (p) => { const r = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${p}`, { headers: HS });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
const claves = { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") };
const descifrar = (sobre, clave) => ident.descifrar(sobre, { clave, crypto, zlib });
const resp = () => { const o = { code: 0, body: null }; return { status(c) { o.code = c; return this; }, json(b) { o.body = b; return o; } }; };
const correr = () => H({ method: "GET", headers: { authorization: "Bearer " + process.env.CRON_SECRET } }, resp());

let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(56) + (d || "")); };
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
const lote = "auto-" + new Date().toISOString().slice(0, 10);
const HUERFANO = "Fantasma Sin Boveda";
const { rows: [pinsPrev] } = await c.query("select value from public.calendario_data where id='pins'");

console.log("== CREDENCIAL SIN IDENTIDAD -> EVIDENCIA -> REINTENTO COMPLETO ==");
try {
  // 1 · se agrega un PIN cuyo dueño no existe en la bóveda
  await c.query(`update public.calendario_data set value = value || $1::jsonb, updated_at=now() where id='pins'`,
    [JSON.stringify({ [HUERFANO + "_h"]: JSON.stringify({ v: 1, iter: 100000, salt: crypto.randomBytes(16).toString("hex"), hash: crypto.randomBytes(32).toString("hex") }) })]);
  await c.query("delete from public.respaldo_lote where lote_id=$1", [lote]);

  const r1 = await correr();
  const pasosMal = (r1.body.pasos || []).map((p) => (p.ok ? "ok " : "NO ") + p.paso);
  chk("la corrida se detiene en credenciales", r1.body.estado === "INCOMPLETO", r1.body.estado + " · " + pasosMal.join(" · "));
  const { rows: [f1] } = await c.query("select * from public.respaldo_lote where lote_id=$1", [lote]);
  chk("estado explicito INCOMPLETO, no FAILED", f1.estado === "INCOMPLETO", f1.estado);
  chk("la razon queda escrita", /credenciales_sin_identidad:1/.test(f1.verificacion || ""), (f1.verificacion || "").slice(0, 70));
  chk("los objetos cifrados se conservan como evidencia", !!(f1.objeto_a && f1.objeto_b && f1.sha_a && f1.sha_b), f1.objeto_a);
  const bA = await bajar(f1.objeto_a), bB = await bajar(f1.objeto_b);
  chk("la evidencia esta realmente en Storage y cuadra su sha",
      !!bA && !!bB && sha256(bA) === f1.sha_a && sha256(bB) === f1.sha_b, (bA ? bA.length : 0) + " + " + (bB ? bB.length : 0) + " bytes");
  chk("NO cuenta como verificado", !f1.verificado_at, "verificado_at nulo");

  const rechazo = await restaurarLote({ fila: f1, bajar, sha256, descifrar, claves });
  chk("el restore RECHAZA la evidencia incompleta", !rechazo.ok && rechazo.motivo === MOTIVO.EVIDENCIA_INCOMPLETA, rechazo.motivo);
  const { rows: [s1] } = await c.query("select veredicto, incompletos from public.respaldo_salud");
  chk("la alarma lo dice con esas palabras", /evidencia incompleta/.test(s1.veredicto), s1.veredicto + " · incompletos=" + s1.incompletos);

  // 2 · se resuelve la identidad y se reintenta el MISMO lote
  console.log();
  await c.query(`update public.calendario_data set value = value - $1, updated_at=now() where id='pins'`, [HUERFANO + "_h"]);
  const r2 = await correr();
  for (const p of r2.body.pasos || []) console.log("      " + (p.ok ? "ok   " : "FALLA") + " " + String(p.paso).padEnd(22) + (p.detalle || ""));
  chk("el reintento retoma el mismo lote", r2.body.lote === lote, r2.body.lote);
  chk("el reintento publica y verifica", r2.body.estado === "READY_VERIFICADO", r2.body.estado);
  const { rows: [f2] } = await c.query("select * from public.respaldo_lote where lote_id=$1", [lote]);
  chk("estado final READY con verificado_at", f2.estado === "READY" && !!f2.verificado_at, f2.estado + " · " + f2.verificacion);
  chk("el intento avanzo (testigo de cercado)", f2.intento > f1.intento, "intento " + f1.intento + " -> " + f2.intento);
  chk("los objetos se reemplazaron por los completos", f2.sha_a !== f1.sha_a && f2.sha_b !== f1.sha_b, "sha nuevos");

  // 3 · A y B del reintento, completos y del MISMO snapshot
  const ok = await restaurarLote({ fila: f2, bajar, sha256, descifrar, claves });
  if (!ok.ok) { console.log("   no hay objetos para comparar: " + ok.motivo); }
  else {
  chk("el restore ACEPTA el lote reintentado", ok.ok, ok.ok ? "" : ok.motivo);
  chk("A y B comparten correlationId", ok.A.correlationId === ok.B.correlationId, String(ok.A.correlationId).slice(0, 8) + "…");
  chk("A y B comparten el instante del snapshot", ok.A.tomado_at === ok.B.tomado_at && !!ok.A.tomado_at, ok.A.tomado_at);
  chk("A y B declaran el mismo numero de filas", ok.A.filas === ok.B.filas, ok.A.filas + " filas");
  chk("A trae el padron completo", ok.A.padron.total > 0, ok.A.padron.total + " usuarios · " + ok.A.recursos + " recursos");
  chk("B trae credenciales vinculadas por identity_id", ok.B.total > 0 && ok.B.credenciales.every((x) => x.identity_id),
      ok.B.total + " credenciales, todas con UUID");
  chk("el huerfano ya no aparece en B", !JSON.stringify(ok.B).includes(HUERFANO), "sin " + HUERFANO.slice(0, 8) + "…");
  }
  const { rows: [s2] } = await c.query("select veredicto from public.respaldo_salud");
  chk("la salud vuelve a OK", s2.veredicto === "OK", s2.veredicto);
} finally {
  await c.query(`update public.calendario_data set value=$1, updated_at=now() where id='pins'`, [pinsPrev.value]);
  await c.end();
}
console.log();
console.log("AUTOMATIZACION COMPLETA = NO EJERCIDA (falta el disparo del programador sobre el tramo entero)");
console.log("REINTENTO: " + (f === 0 ? "PASS" : "FALLA · " + f));

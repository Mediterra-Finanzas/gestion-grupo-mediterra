/* §2 · SNAPSHOT TRANSACCIONAL en staging. REPEATABLE READ READ ONLY.
 * Cero escrituras: el propio servidor las rechaza por el modo de la transaccion. */
import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");

const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const ENV = RAIZ + "/.env.osiris-staging.local";
const PROD_REF = "bywovqayuzodbzwsriet", STG_REF = "nlvfjpwiecgrosjnwwik";
if (!existsSync(ENV)) { console.log("ABORT: falta el archivo gitignored"); process.exit(2); }
const t = readFileSync(ENV, "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : null; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
if (!DSN) { console.log("ABORT: DSN ausente"); process.exit(2); }

// ── §1 · AISLAMIENTO, fail-closed antes de conectar ──────────────────────────
console.log("== §1 · AISLAMIENTO ==");
for (const [k, v] of Object.entries({ DSN, URL: G("OSIRIS_STAGING_SUPABASE_URL") })) {
  if (v && v.includes(PROD_REF)) { console.log("   ABORT: ref productivo en " + k); process.exit(2); }
}
if (!DSN.includes(STG_REF)) { console.log("   ABORT: el DSN no nombra staging"); process.exit(2); }
console.log("   ref productivo ausente        : PASS");
console.log("   DSN nombra staging            : PASS");
console.log("   vinculo CLI implicito         : " + (existsSync(RAIZ + "/supabase/.temp/project-ref") ? "PRESENTE — abortar" : "ausente · PASS"));
console.log();

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
const correlationId = crypto.randomUUID();
const t0 = process.hrtime.bigint();
let filas = [], txid = null, escriturasRechazadas = null;
try {
  await c.query("begin");
  await c.query("set transaction isolation level repeatable read read only");
  const meta = await c.query("select txid_current_if_assigned() tx, current_setting('transaction_isolation') iso, current_setting('transaction_read_only') ro");
  txid = meta.rows[0];
  // Todo sale del MISMO snapshot logico: una sola sentencia, un solo instante.
  const r = await c.query(`select id, value, updated_at from public.calendario_data
                            where id not like 'backup\_%' order by id`);
  filas = r.rows;
  // Prueba dentro de la transaccion: una escritura DEBE ser rechazada por el servidor.
  try { await c.query("update public.calendario_data set updated_at = now() where id = 'main'"); escriturasRechazadas = "NO — la escritura paso"; }
  catch (e) { escriturasRechazadas = "SI · " + (e.code || e.message.slice(0, 40)); }
  await c.query("commit");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.log("ABORT: " + e.message.slice(0, 120)); process.exit(2);
} finally { await c.end(); }
const ms = Number(process.hrtime.bigint() - t0) / 1e6;

console.log("== §2 · SNAPSHOT TRANSACCIONAL ==");
console.log("   correlation      : " + correlationId);
console.log("   aislamiento      : " + txid.iso + "   solo lectura: " + txid.ro);
console.log("   filas capturadas : " + filas.length);
console.log("   duracion         : " + ms.toFixed(0) + " ms");
console.log("   escritura dentro de la transaccion rechazada: " + escriturasRechazadas);
console.log();
// revision/hash por recurso, para poder detectar deriva
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const recursos = filas.map((f) => ({ id: f.id, updated_at: f.updated_at,
  hash: sha(JSON.stringify(f.value)).slice(0, 16), bytes: JSON.stringify(f.value).length }));
console.log("   hash+revision por recurso: " + recursos.length + " registrados");
console.log("   bytes totales del snapshot: " + (recursos.reduce((s, r) => s + r.bytes, 0) / 1024 / 1024).toFixed(2) + " MB");
import("node:fs").then((fs) => fs.writeFileSync(process.env.SP + "/snapshot-staging.json",
  JSON.stringify({ correlationId, iso: txid.iso, ro: txid.ro, ms, recursos,
                   filas: filas.map((f) => ({ id: f.id, value: f.value })) })));
console.log("   snapshot guardado fuera del repo");

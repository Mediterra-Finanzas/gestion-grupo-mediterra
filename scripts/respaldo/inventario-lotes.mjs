/* Inventario de los lotes de staging: estado, fechas, versión y cobertura. SOLO LECTURA.
 *
 * Por cada lote con objetos, descarga A y B, compara el SHA registrado y los descifra en memoria
 * para leer versión y cobertura. No borra, no marca y no escribe nada. Los lotes anteriores se
 * conservan: que el restaurador nuevo los rechace no autoriza borrarlos.
 *
 * No imprime datos personales: solo conteos y versiones.
 * Uso: SP=<scratchpad con pgclient> node inventario-lotes.mjs */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
if (![DSN, U].every((x) => x.includes("nlvfjpwiecgrosjnwwik")) || [DSN, U].some((x) => x.includes("bywovqayuzodbzwsriet"))) { console.log("ABORT: el destino no es staging"); process.exit(2); }
const ID = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const claves = { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") };
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
await c.query("begin transaction read only");
const { rows } = await c.query(`select lote_id, estado, creado_at, listo_at, verificado_at, objeto_a, objeto_b, sha_a, sha_b
  from public.respaldo_lote order by creado_at`);
await c.query("rollback");
await c.end();

const bajar = async (ruta) => {
  const r = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${ruta}`, { headers: { apikey: S, Authorization: "Bearer " + S } });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
};
const abrir = async (ruta, shaReg, clave) => {
  if (!ruta) return { estado: "sin objeto" };
  const b = await bajar(ruta);
  if (!b) return { estado: "objeto ausente" };
  if (shaReg && sha256(b) !== shaReg) return { estado: "sha distinto" };
  const d = await ID.descifrar(JSON.parse(b.toString("utf8")), { clave, crypto, zlib });
  return d.ok ? { estado: "ok", o: d.objeto } : { estado: d.motivo };
};
const f = (x) => (x ? new Date(x).toISOString().slice(0, 16).replace("T", " ") : "—");

console.log("| lote | estado | creado (UTC) | verificado | A | B | cobertura |");
console.log("|---|---|---|---|---|---|---|");
const resumen = {};
for (const l of rows) {
  const a = await abrir(l.objeto_a, l.sha_a, claves.A), b = await abrir(l.objeto_b, l.sha_b, claves.B);
  const A = a.o, B = b.o;
  const vB = B ? B.version : b.estado;
  const cob = !A || !B ? "no legible" : [
    A.negocio && A.negocio.main ? "Tareas" : "sin Tareas",
    B.version === "credencial-v3" ? `modo ${B.modo_identidad} · huérfanas ${B.huerfanas.length} · reemisiones ${B.reemisiones.length}`
      : B.version === "credencial-v2" ? "fecha/pol/_hist/_tel · sin huérfanas ni reemisiones"
      : "solo _h sin fecha/pol · sin _hist/_tel",
  ].join(" · ");
  resumen[vB] = (resumen[vB] || 0) + 1;
  console.log(`| ${l.lote_id} | ${l.estado} | ${f(l.creado_at)} | ${f(l.verificado_at)} | ${A ? (A.version || "?") : a.estado} | ${vB} | ${cob} |`);
}
console.log(`\n${rows.length} lotes · por versión de B: ${JSON.stringify(resumen)} · nada escrito ni borrado`);

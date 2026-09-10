/* Carga un lote de staging en una base PostgreSQL LOCAL y desechable, para ejercer el login real.
 *
 * - Solo usa lo que viaja en el lote: restaurarLote + reconstruirDesdeLote, credenciales y marcas de
 *   reemisión incluidas. No lee `calendario_data` de staging.
 * - Destino: RESPALDO_PG_AISLADO, obligatoriamente 127.0.0.1 o localhost, y sin calendario_data
 *   previa: no sobrescribe nada.
 * - Replica de staging lo que afecta al acceso y a la integridad: la tabla y sus dos triggers
 *   (antiencogimiento del padrón de `main` y guarda de `osiris`), copiados con
 *   pg_get_functiondef/pg_get_triggerdef, sin reescribirlos.
 * - Roles: `anon` sin login, con select/insert/update sobre calendario_data; `autenticador` con
 *   login y noinherit para PostgREST. Nada más queda expuesto.
 * - No imprime credenciales, correos ni nombres.
 *
 * Uso: SP=<pgclient> RESPALDO_PG_AISLADO=postgres://postgres:<clave>@127.0.0.1:<p>/postgres
 *      AISLADO_AUT_PASS=<clave local> node cargar-lote-aislado.mjs <lote_id> */
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
if (![DSN, U].every((x) => x.includes("nlvfjpwiecgrosjnwwik")) || [DSN, U].some((x) => x.includes("bywovqayuzodbzwsriet"))) { console.log("ABORT: el origen no es staging"); process.exit(2); }
const LOCAL = process.env.RESPALDO_PG_AISLADO || "", AUT = process.env.AISLADO_AUT_PASS || "";
let host = ""; try { host = new URL(LOCAL).hostname; } catch (e) {}
if (!["127.0.0.1", "localhost"].includes(host) || !/^[0-9a-f]{16,}$/.test(AUT)) { console.log("ABORT: destino no local o clave de autenticador inválida"); process.exit(2); }
const LOTE = process.argv[2];
if (!LOTE) { console.log("ABORT: falta lote_id"); process.exit(64); }

const ID = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const { restaurarLote } = await import("file:///" + W + "/src/data/restaurarLote.js");
const { reconstruirDesdeLote } = await import("file:///" + W + "/src/data/reconstruirDesdeLote.js");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const hashLlave = (n) => sha256(Buffer.from(String(n), "utf8"));

// ── staging: fila del lote y definición de los triggers, en solo lectura ────────
const st = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await st.connect();
await st.query("begin transaction read only");
const { rows: [fila] } = await st.query("select * from public.respaldo_lote where lote_id = $1", [LOTE]);
const { rows: trig } = await st.query(`select t.tgname, pg_get_triggerdef(t.oid) as tdef, pg_get_functiondef(t.tgfoid) as fdef
  from pg_trigger t where t.tgrelid = 'public.calendario_data'::regclass and not t.tgisinternal order by t.tgname`);
await st.query("rollback"); await st.end();
const bajar = async (r) => { const x = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${r}`, { headers: { apikey: S, Authorization: "Bearer " + S } });
  return x.ok ? Buffer.from(await x.arrayBuffer()) : null; };
const mem = await restaurarLote({ fila, bajar, sha256, descifrar: (s, clave) => ID.descifrar(s, { clave, crypto, zlib }),
  claves: { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") } });
if (!mem.ok) { console.log("ABORT: lote no restaurable: " + mem.motivo); process.exit(1); }
const rec = reconstruirDesdeLote({ A: mem.A, B: mem.B, hashLlave });
if (rec.sinDueno.length || rec.ambiguas.length) { console.log("ABORT: entradas sin dueño o ambiguas"); process.exit(1); }

// ── destino local ────────────────────────────────────────────────────────────
const c = new Client({ connectionString: LOCAL });
await c.connect();
if ((await c.query("select to_regclass('public.calendario_data') is not null as hay")).rows[0].hay) { console.log("ABORT: el destino ya tiene calendario_data"); process.exit(3); }
await c.query("begin");
await c.query("create table public.calendario_data (id text primary key, value jsonb, updated_at timestamptz default now())");
for (const x of trig) { await c.query(x.fdef); await c.query(x.tdef); }
await c.query("create table public._aislado_origen (lote_id text, correlation_id text, tomado_at timestamptz, cargado_at timestamptz default now(), filas int)");
for (const [id, r] of Object.entries(rec.filas))
  await c.query("insert into public.calendario_data (id, value, updated_at) values ($1, $2::jsonb, coalesce($3::timestamptz, now()))",
    [id, JSON.stringify(r.value), r.updated_at]);
await c.query("insert into public._aislado_origen (lote_id, correlation_id, tomado_at, filas) values ($1, $2, $3, $4)",
  [LOTE, mem.A.correlationId, mem.A.tomado_at, Object.keys(rec.filas).length]);
await c.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'autenticador') then create role autenticador login noinherit; end if;
end $$`);
await c.query(`alter role autenticador with password '${AUT}'`);
await c.query("grant anon to autenticador");
await c.query("grant usage on schema public to anon");
await c.query("grant select, insert, update on public.calendario_data to anon");
await c.query("commit");

const pins = rec.filas.pins.value;
const usuarios = rec.filas.main.value.usuarios || [];
console.log(`CARGADO · lote ${LOTE} · ${Object.keys(rec.filas).length} filas · ${usuarios.length} usuarios (${usuarios.filter((u) => u.desactivado).length} desactivados) · ` +
  `${Object.keys(pins).filter((k) => k.endsWith("_h")).length} credenciales · ${Object.keys(pins).filter((k) => k.endsWith("_temp")).length} marcas de reemisión · ` +
  `${rec.excluidas.length} excluidos no repuestos · triggers ${trig.map((x) => x.tgname).join(", ")}`);
await c.end();

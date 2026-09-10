/* Snapshot portable · prueba en un PostgreSQL LOCAL y DESECHABLE. No toca staging ni producción.
 *
 * Prueba sql/respaldo/snapshot-consistente.sql antes de aplicarlo en staging:
 *   1 · origen SIN bóveda (forma de producción): la función se crea y declara 'legacy'.
 *       CONTRAPRUEBA: una función `language sql` que nombra sec_identidad_alias (la forma
 *       anterior) no se puede crear en ese origen.
 *   2 · bóveda a medias: declara 'boveda_incompleta'.
 *   3 · bóveda sin alias y con alias: declara 'boveda'; solo cuentan alias vigentes, de
 *       calendario_data_main y de identidades activas.
 *   4 · privilegios efectivos, llamadas reales como anon y service_role, atributos.
 *   5 · decisión del handler (decidirModoIdentidad) sobre las salidas reales.
 *   6 · consistencia: un escritor cambia dos filas Y un alias en una transacción; en cada
 *       snapshot las dos filas traen el mismo contador y la presencia del alias calza con él.
 *       CONTRAPRUEBA: lecturas separadas sí quedan a caballo; si no, NO CONCLUYENTE.
 *
 * Uso: RESPALDO_PG_LOCAL=postgres://postgres:<clave>@127.0.0.1:<puerto>/postgres
 *      SP=<scratchpad con pgclient> node prueba-snapshot-portable-local.mjs
 * El destino tiene que ser 127.0.0.1 o localhost y una base sin calendario_data: el script
 * crea sus propias tablas y roles, y aborta si calendario_data ya existe. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const W = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/wt-respaldo-prod";
const DSN = process.env.RESPALDO_PG_LOCAL || "";
let host = "";
try { host = new URL(DSN).hostname; } catch (e) {}
if (!["127.0.0.1", "localhost"].includes(host)) { console.log("ABORT: RESPALDO_PG_LOCAL tiene que apuntar a 127.0.0.1 o localhost"); process.exit(2); }
const SQL = readFileSync(W + "/sql/respaldo/snapshot-consistente.sql", "utf8");
const { decidirModoIdentidad, MOTIVO_SNAPSHOT } = await import("file:///" + W + "/src/data/respaldoDesdeSnapshot.js");

let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(76) + (d ? " " + d : "")); return ok; };
const conectar = async () => { const x = new Client({ connectionString: DSN }); await x.connect(); return x; };
const c = await conectar();
if ((await c.query("select to_regclass('public.calendario_data') is not null as hay")).rows[0].hay) {
  console.log("ABORT: la base ya tiene calendario_data; se usa solo una base local vacía"); process.exit(3);
}
const snap = async (cli = c) => (await cli.query("select public.respaldo_snapshot() as s")).rows[0].s;
const comoRol = async (rol) => {
  await c.query("begin");
  try { await c.query(`set local role ${rol}`); await c.query("select public.respaldo_snapshot()"); return "permitido"; }
  catch (e) { return /permission denied/.test(e.message) ? "denegado" : "error: " + e.message.slice(0, 60); }
  finally { await c.query("rollback"); }
};

console.log("== 0 · base local mínima ==");
await c.query(`do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$`);
await c.query("create table public.calendario_data (id text primary key, value jsonb not null, updated_at timestamptz not null default now())");
await c.query(`insert into public.calendario_data (id, value) values
  ('main', '{"usuarios":[]}'), ('pins', '{}'), ('prueba_a', '{"n":0}'), ('prueba_b', '{"n":0}')`);
console.log("   " + (await c.query("select version()")).rows[0].version.split(",")[0]);

console.log("\n== 1 · origen SIN bóveda (forma de producción) ==");
let error = null;
await c.query("begin");
try {
  await c.query(`create function public.respaldo_snapshot_forma_anterior() returns jsonb language sql stable as $$
    select jsonb_build_object('identidades', (select jsonb_agg(a.llave_hash) from public.sec_identidad_alias a)) $$`);
} catch (e) { error = e.message; }
await c.query("rollback");
chk("CONTRAPRUEBA · la forma anterior (language sql) no se puede crear sin bóveda", !!error, error ? error.slice(0, 50) : "se creó");
await c.query(SQL);
const s1 = await snap();
chk("la versión portable se crea y declara 'legacy'", s1.modo_identidad === "legacy", s1.modo_identidad);
chk("legacy: identidades es null, no un arreglo vacío", s1.identidades === null, JSON.stringify(s1.identidades));
chk("'filas' coincide con 'datos'", Number(s1.filas) === s1.datos.length && s1.datos.length === 4, `${s1.filas} / ${s1.datos.length}`);

console.log("\n== 2 · bóveda a medias ==");
await c.query("create table public.sec_identidad (identity_id uuid primary key default gen_random_uuid(), estado text not null)");
const s2 = await snap();
chk("solo sec_identidad: declara 'boveda_incompleta'", s2.modo_identidad === "boveda_incompleta" && s2.identidades === null, s2.modo_identidad);

console.log("\n== 3 · bóveda completa ==");
await c.query(`create table public.sec_identidad_alias (llave_hash text not null,
  identity_id uuid not null references public.sec_identidad, origen text not null, vigente_hasta timestamptz)`);
const s3 = await snap();
chk("bóveda sin alias: declara 'boveda' con identidades = []", s3.modo_identidad === "boveda" && Array.isArray(s3.identidades) && s3.identidades.length === 0,
    JSON.stringify(s3.identidades));
const { rows: ids } = await c.query("insert into public.sec_identidad (estado) values ('activa'), ('activa'), ('activa'), ('suspendida') returning identity_id::text as id");
await c.query(`insert into public.sec_identidad_alias values
  ('h-vigente', $1, 'calendario_data_main', null),
  ('h-cerrado', $2, 'calendario_data_main', now()),
  ('h-otro-origen', $3, 'otro', null),
  ('h-inactiva', $4, 'calendario_data_main', null)`, ids.map((x) => x.id));
const s4 = await snap();
chk("solo alias vigentes, de calendario_data_main y de identidades activas",
    s4.identidades.length === 1 && s4.identidades[0].llave_hash === "h-vigente" && s4.identidades[0].identity_id === ids[0].id,
    JSON.stringify(s4.identidades.map((x) => x.llave_hash)));

console.log("\n== 4 · privilegios y atributos ==");
const { rows: priv } = await c.query(`select r.rol, has_function_privilege(r.rol, 'public.respaldo_snapshot()', 'EXECUTE') as ejecuta
  from unnest(array['public','anon','authenticated','service_role']) r(rol)`);
const P = Object.fromEntries(priv.map((x) => [x.rol, x.ejecuta]));
chk("public, anon y authenticated no ejecutan; service_role sí", !P.public && !P.anon && !P.authenticated && P.service_role === true, JSON.stringify(P));
chk("llamada real como anon: denegada", (await comoRol("anon")) === "denegado");
chk("llamada real como authenticated: denegada", (await comoRol("authenticated")) === "denegado");
chk("llamada real como service_role: permitida", (await comoRol("service_role")) === "permitido");
const { rows: [fn] } = await c.query(`select p.prosecdef, p.provolatile, p.proconfig,
  (select count(*)::int from pg_proc q join pg_namespace m on m.oid = q.pronamespace where m.nspname = 'public' and q.proname = 'respaldo_snapshot') as sobrecargas
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'respaldo_snapshot'`);
chk("una sola versión, STABLE, SECURITY DEFINER y search_path fijo",
    fn.sobrecargas === 1 && fn.provolatile === "s" && fn.prosecdef && (fn.proconfig || []).some((x) => /^search_path=/.test(x)), JSON.stringify(fn.proconfig));

console.log("\n== 5 · decisión del handler sobre las salidas reales ==");
const d = (s, declarado) => decidirModoIdentidad({ snapshot: s, declarado });
chk("sin bóveda + legacy declarado → ok", d(s1, "legacy").ok === true);
chk("sin bóveda + bóveda declarada (defecto) → se detiene", d(s1, "boveda").motivo === MOTIVO_SNAPSHOT.MODO_DISTINTO);
chk("bóveda a medias → error de esquema con cualquier declaración",
    d(s2, "legacy").motivo === MOTIVO_SNAPSHOT.BOVEDA_INCOMPLETA && d(s2, "boveda").motivo === MOTIVO_SNAPSHOT.BOVEDA_INCOMPLETA);
chk("bóveda sin alias → error de datos", d(s3, "boveda").motivo === MOTIVO_SNAPSHOT.BOVEDA_SIN_ALIAS);
chk("bóveda con alias + legacy declarado → se detiene", d(s4, "legacy").motivo === MOTIVO_SNAPSHOT.MODO_DISTINTO);
chk("bóveda con alias + bóveda declarada → ok", d(s4, "boveda").ok === true);

console.log("\n== 6 · consistencia frente a escrituras concurrentes (modo bóveda) ==");
const { rows: [idx] } = await c.query("insert into public.sec_identidad (estado) values ('activa') returning identity_id::text as id");
const escritor = await conectar(), lector = await conectar();
let corriendo = true, escrituras = 0;
const bucle = (async () => {
  for (let n = 1; corriendo; n++) {
    await escritor.query("begin");
    await escritor.query("update public.calendario_data set value = jsonb_build_object('n', $1::int), updated_at = now() where id = 'prueba_a'", [n]);
    if (n % 2) await escritor.query("insert into public.sec_identidad_alias values ('h-concurrente', $1, 'calendario_data_main', null)", [idx.id]);
    else await escritor.query("delete from public.sec_identidad_alias where llave_hash = 'h-concurrente'");
    await escritor.query("select pg_sleep(0.01)");   // ensancha la ventana dentro de la transacción
    await escritor.query("update public.calendario_data set value = jsonb_build_object('n', $1::int), updated_at = now() where id = 'prueba_b'", [n]);
    await escritor.query("commit");
    escrituras++;
  }
})();

const N = 200;
let inconsistentes = 0, conteoMal = 0;
const vistos = new Set();
for (let i = 0; i < N; i++) {
  const s = await snap(lector);
  const a = s.datos.find((x) => x.id === "prueba_a").value.n, b = s.datos.find((x) => x.id === "prueba_b").value.n;
  const alias = s.identidades.some((x) => x.llave_hash === "h-concurrente");
  if (a !== b || alias !== (a % 2 === 1)) inconsistentes++;
  if (Number(s.filas) !== s.datos.length) conteoMal++;
  vistos.add(a);
}
let aCaballo = 0;
for (let i = 0; i < N; i++) {
  const a = (await lector.query("select (value->>'n')::int as n from public.calendario_data where id = 'prueba_a'")).rows[0].n;
  const alias = (await lector.query("select count(*)::int as k from public.sec_identidad_alias where llave_hash = 'h-concurrente'")).rows[0].k === 1;
  const b = (await lector.query("select (value->>'n')::int as n from public.calendario_data where id = 'prueba_b'")).rows[0].n;
  if (a !== b || alias !== (a % 2 === 1)) aCaballo++;
}
corriendo = false;
await bucle;
chk(`${N} snapshots: filas y alias siempre del mismo estado`, inconsistentes === 0, `${inconsistentes} inconsistentes`);
chk(`${N} snapshots: 'filas' = largo de 'datos'`, conteoMal === 0);
chk("el escritor avanzó durante la prueba", vistos.size > 1, `${vistos.size} estados vistos · ${escrituras} transacciones`);
const sensible = aCaballo > 0;
console.log(`   contraprueba: ${aCaballo} de ${N} lecturas separadas quedaron a caballo`);
await escritor.end(); await lector.end(); await c.end();

console.log("\nSNAPSHOT PORTABLE (LOCAL): " + (fallas === 0 && sensible ? "PASS" : fallas ? "FALLA · " + fallas : "NO CONCLUYENTE"));
process.exit(fallas ? 1 : sensible ? 0 : 4);

/* Aplicación de sql/respaldo/snapshot-consistente.sql en STAGING, con preflight que aborta solo.
 *
 *   --capturar   solo lectura. Verifica el destino y guarda la definición, el dueño y los
 *                privilegios vigentes de public.respaldo_snapshot() en
 *                sql/respaldo/previo/respaldo_snapshot-staging-<marca>.sql, listo para recuperar.
 *   --aplicar    exige la captura y que la función no haya cambiado desde entonces; repite el
 *                preflight; revisa que el SQL no borre, no escriba datos y no amplíe permisos;
 *                aplica en una transacción y verifica con catálogo y llamadas reales.
 *
 * Destino permitido: gestion-mediterra-staging, ref nlvfjpwiecgrosjnwwik. Cualquier otro aborta.
 * El preflight no confía en current_database(): exige la ref en el usuario del DSN y en la URL,
 * la bóveda y las tablas del respaldo, y que DSN y API vean el mismo último lote.
 *
 * Uso: SP=<scratchpad con pgclient> node aplicar-snapshot-consistente.mjs --capturar | --aplicar */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const DIR_PREVIO = W + "/sql/respaldo/previo";
const REF = "nlvfjpwiecgrosjnwwik", PROD = "bywovqayuzodbzwsriet";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), U = G("OSIRIS_STAGING_SUPABASE_URL");
const S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY"), P = G("OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY");
const modo = process.argv.includes("--aplicar") ? "aplicar" : process.argv.includes("--capturar") ? "capturar" : null;
const abortar = (m, code = 2) => { console.log("ABORT: " + m); process.exit(code); };
if (!modo) abortar("indicar --capturar o --aplicar", 64);
let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(72) + (d ? " " + d : "")); return ok; };
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

// ── preflight de destino ─────────────────────────────────────────────────────
console.log(`== PREFLIGHT · ${modo} ==`);
let dsnUser = "", urlHost = "";
try { dsnUser = new URL(DSN).username; urlHost = new URL(U).hostname; } catch (e) {}
if ([DSN, U, S, P].some((x) => !x) || [DSN, U].some((x) => x.includes(PROD))) abortar("credenciales ausentes o productivas");
if (!dsnUser.includes(REF) || urlHost !== `${REF}.supabase.co`) abortar("el destino no es gestion-mediterra-staging");
console.log("   ref en usuario del DSN y en la URL: " + REF);
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows: [huella] } = await c.query(`select
  to_regclass('public.sec_identidad') is not null as identidad, to_regclass('public.sec_identidad_alias') is not null as alias,
  to_regclass('public.respaldo_lote') is not null as lote, to_regclass('public.calendario_data') is not null as datos`);
if (!huella.identidad || !huella.alias || !huella.lote || !huella.datos) abortar("huella estructural distinta de staging: " + JSON.stringify(huella));
const { rows: [ultSql] } = await c.query("select (select count(*)::int from public.respaldo_lote) as n, (select lote_id from public.respaldo_lote order by creado_at desc limit 1) as ultimo");
const rest = await fetch(`${U}/rest/v1/respaldo_lote?select=lote_id&order=creado_at.desc&limit=1`,
  { headers: { apikey: S, Authorization: "Bearer " + S, Prefer: "count=exact" } });
const nRest = Number(String(rest.headers.get("content-range") || "").split("/")[1]);
const [ultRest] = rest.ok ? await rest.json() : [];
if (!rest.ok || nRest !== ultSql.n || (ultRest && ultRest.lote_id) !== ultSql.ultimo) abortar(`DSN y API no ven la misma base (lotes ${ultSql.n} vs ${nRest})`);
console.log(`   bóveda y tablas del respaldo presentes · DSN y API ven el mismo último lote (${ultSql.n} lotes)`);

const funciones = async () => (await c.query(`select p.oid::regprocedure::text as firma, pg_get_functiondef(p.oid) as definicion,
    pg_get_userbyid(p.proowner) as dueno, p.proacl::text as acl, l.lanname as lenguaje, p.provolatile as volatilidad,
    p.prosecdef as security_definer, p.proconfig as configuracion
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.proname = 'respaldo_snapshot' order by 1`)).rows;
const privilegios = async () => Object.fromEntries((await c.query(`select r.rol, has_function_privilege(r.rol, 'public.respaldo_snapshot()', 'EXECUTE') as e
  from unnest(array['public','anon','authenticated','service_role']) r(rol)`)).rows.map((x) => [x.rol, x.e]));
const concesionarios = (acl) => new Set(String(acl || "").replace(/[{}"]/g, "").split(",").filter((x) => /=[^/]*X/.test(x)).map((x) => x.split("=")[0] || "PUBLIC"));
const idsDatos = async () => (await c.query("select count(*)::int as n, md5(coalesce(string_agg(id, ',' order by id), '')) as h from public.calendario_data")).rows[0];

const previo = await funciones();
if (previo.length !== 1) abortar(`se esperaba una sola respaldo_snapshot() vigente; hay ${previo.length}`);
const [fnPrev] = previo;
const hashPrev = sha(fnPrev.definicion);

// ── captura ──────────────────────────────────────────────────────────────────
if (modo === "capturar") {
  const priv = await privilegios();
  const marca = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  const archivo = `${DIR_PREVIO}/respaldo_snapshot-staging-${marca}.sql`;
  mkdirSync(DIR_PREVIO, { recursive: true });
  if (existsSync(archivo)) abortar("la captura ya existe; no se sobrescribe");
  const grants = [...concesionarios(fnPrev.acl)].map((g) => `grant execute on function public.respaldo_snapshot() to ${g === "PUBLIC" ? "public" : g};`);
  writeFileSync(archivo, [
    `-- Captura previa de ${fnPrev.firma} en gestion-mediterra-staging (${REF}).`,
    `-- Tomada: ${new Date().toISOString()} · sha256 de la definición: ${hashPrev}`,
    `-- Dueño: ${fnPrev.dueno} · lenguaje: ${fnPrev.lenguaje} · volatilidad: ${fnPrev.volatilidad} · security definer: ${fnPrev.security_definer}`,
    `-- Configuración: ${JSON.stringify(fnPrev.configuracion)} · ACL: ${fnPrev.acl}`,
    `-- Privilegios efectivos: ${JSON.stringify(priv)}`,
    `-- Recuperación: ejecutar este archivo en staging. Devuelve la definición y la ACL anteriores.`,
    `-- La ACL se reconstruye desde la línea anterior; ${fnPrev.acl == null ? "ACL nula = privilegios por defecto (EXECUTE a PUBLIC)" : "revisar contra la ACL capturada antes de ejecutar"}.`,
    "",
    fnPrev.definicion.trim() + ";",
    "",
    "revoke all on function public.respaldo_snapshot() from public, anon, authenticated, service_role;",
    ...(fnPrev.acl == null ? ["grant execute on function public.respaldo_snapshot() to public;"] : grants),
    "notify pgrst, 'reload schema';",
    "",
  ].join("\n"));
  console.log("\n== CAPTURA ==");
  console.log(`   ${archivo.replace(W + "/", "")}`);
  console.log(`   ${fnPrev.firma} · ${fnPrev.lenguaje} · volatilidad ${fnPrev.volatilidad} · security definer ${fnPrev.security_definer} · dueño ${fnPrev.dueno}`);
  console.log(`   ACL ${fnPrev.acl} · efectivos ${JSON.stringify(priv)} · sha256 ${hashPrev.slice(0, 12)}`);
  await c.end();
  process.exit(0);
}

// ── aplicación ───────────────────────────────────────────────────────────────
const capturas = existsSync(DIR_PREVIO) ? readdirSync(DIR_PREVIO).filter((f) => /^respaldo_snapshot-staging-.*\.sql$/.test(f)).sort() : [];
if (!capturas.length) abortar("falta la captura previa (--capturar)");
const captura = readFileSync(`${DIR_PREVIO}/${capturas.at(-1)}`, "utf8");
const hashCaptura = (captura.match(/sha256 de la definición: ([0-9a-f]{64})/) || [])[1];
if (hashCaptura !== hashPrev) abortar("la función cambió desde la captura; capturar de nuevo y revisar el diff");
console.log(`   captura vigente: ${capturas.at(-1)}`);

console.log("\n== REVISIÓN ESTÁTICA DEL SQL ==");
const SQL = readFileSync(W + "/sql/respaldo/snapshot-consistente.sql", "utf8");
const sinComentarios = SQL.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
chk("no borra ni escribe datos ni altera tablas", !/\b(drop|delete|truncate|insert|update|alter)\b/i.test(sinComentarios));
const grantsSql = [...sinComentarios.matchAll(/\bgrant\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " ").trim());
const revokesSql = [...sinComentarios.matchAll(/\brevoke\b[^;]*;/gi)].map((m) => m[0].replace(/\s+/g, " ").trim());
chk("un único GRANT: EXECUTE de respaldo_snapshot() a service_role", grantsSql.length === 1 && grantsSql[0] === "grant execute on function public.respaldo_snapshot() to service_role;", JSON.stringify(grantsSql));
chk("un único REVOKE, solo sobre respaldo_snapshot()", revokesSql.length === 1 && revokesSql[0] === "revoke all on function public.respaldo_snapshot() from public, anon, authenticated;", JSON.stringify(revokesSql));
chk("solo crea o reemplaza public.respaldo_snapshot()", [...sinComentarios.matchAll(/\bcreate\b[^(]*/gi)].every((m) => /^create or replace function public\.respaldo_snapshot$/i.test(m[0].replace(/\s+/g, " ").trim())));
if (fallas) abortar("la revisión estática no pasó", 1);

const antes = await idsDatos();
console.log("\n== APLICACIÓN ==");
try {
  await c.query("begin");
  await c.query(SQL);
  await c.query("commit");
  console.log("   aplicado en una transacción");
} catch (e) {
  await c.query("rollback").catch(() => {});
  abortar("error al aplicar, revertido: " + String(e.message).slice(0, 160), 1);
}

console.log("\n== VERIFICACIÓN ==");
const despues = await funciones();
const [fnNueva] = despues;
chk("una sola versión de la función", despues.length === 1, `${despues.length}`);
chk("plpgsql, STABLE, SECURITY DEFINER, search_path=public", fnNueva.lenguaje === "plpgsql" && fnNueva.volatilidad === "s" && fnNueva.security_definer
    && (fnNueva.configuracion || []).includes("search_path=public"), `${fnNueva.lenguaje} · ${fnNueva.volatilidad} · ${JSON.stringify(fnNueva.configuracion)}`);
chk("mismo dueño que antes", fnNueva.dueno === fnPrev.dueno, fnNueva.dueno);
const nuevosConcesionarios = [...concesionarios(fnNueva.acl)].filter((g) => !concesionarios(fnPrev.acl).has(g) && g !== fnNueva.dueno);
chk("no aparece ningún concesionario nuevo salvo service_role", nuevosConcesionarios.every((g) => g === "service_role"), `antes ${fnPrev.acl} · ahora ${fnNueva.acl}`);
const priv = await privilegios();
chk("privilegio efectivo: public, anon y authenticated no; service_role sí", !priv.public && !priv.anon && !priv.authenticated && priv.service_role === true, JSON.stringify(priv));
const tras = await idsDatos();
chk("calendario_data: mismas filas antes y después", tras.n === antes.n && tras.h === antes.h, `${antes.n} → ${tras.n}`);
const llamar = (clave) => fetch(`${U}/rest/v1/rpc/respaldo_snapshot`, { method: "POST",
  headers: { apikey: clave, Authorization: "Bearer " + clave, "Content-Type": "application/json" }, body: "{}" });
const conPub = await llamar(P);
chk("llamada real con clave publicable: denegada", !conPub.ok, "HTTP " + conPub.status);
const conSrv = await llamar(S);
const s = conSrv.ok ? await conSrv.json() : null;
chk("llamada real con clave de servicio: modo 'boveda', identidades y conteo coherentes",
    !!s && s.modo_identidad === "boveda" && Array.isArray(s.identidades) && s.identidades.length > 0 && Number(s.filas) === s.datos.length,
    s ? `HTTP ${conSrv.status} · ${s.modo_identidad} · ${s.identidades.length} identidades · ${s.filas} filas` : "HTTP " + conSrv.status);
await c.end();
console.log(`\nAPLICACIÓN SNAPSHOT CONSISTENTE · ${fallas === 0 ? "PASS" : "FALLA · " + fallas} · recuperación: ${capturas.at(-1)}`);
process.exit(fallas ? 1 : 0);

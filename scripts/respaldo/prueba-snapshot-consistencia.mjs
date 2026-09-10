/* Snapshot del runtime real: consistencia frente a escrituras concurrentes y
 * privilegios EFECTIVOS de la RPC. Solo staging.
 *
 * RPC exacta que obtiene A y B: POST /rest/v1/rpc/respaldo_snapshot (una sentencia que
 * devuelve datos de calendario_data, conteo e identidades de la bóveda). El handler no
 * hace otra lectura de negocio, padrón, pins ni identidades.
 *
 * CONSISTENCIA
 *   Un escritor actualiza dos filas de prueba en UNA transacción con el mismo contador.
 *   En paralelo se llama la RPC muchas veces por PostgREST. En cada snapshot ambas filas
 *   deben traer el mismo contador y `filas` debe igualar el largo de `datos`.
 *   CONTRAPRUEBA: dos lecturas separadas (dos GET) con el mismo escritor deben mostrar al
 *   menos una vez contadores distintos. Si la contraprueba no detecta nada, el PASS no
 *   vale y se informa NO CONCLUYENTE.
 *   Filas usadas: `respaldo_prueba_consistencia_a` y `_b`. Se crean si faltan y se dejan:
 *   no se borra nada. No están en la allowlist, así que ningún lote las copia.
 *
 * PRIVILEGIOS EFECTIVOS
 *   has_function_privilege para public/anon/authenticated/service_role, ACL, dueño,
 *   SECURITY DEFINER, search_path y sobrecargas. Y llamadas reales a la RPC con la clave
 *   publicable, con un token de usuario autenticado sintético y con la clave de servicio.
 *
 * Uso: SP=<scratchpad con pgclient> node prueba-snapshot-consistencia.mjs */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const DSN = G("OSIRIS_STAGING_DATABASE_URL"), U = G("OSIRIS_STAGING_SUPABASE_URL");
const S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY"), P = G("OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY");
if ([DSN, U].some((x) => x.includes("bywovqayuzodbzwsriet"))) { console.log("ABORT: producción"); process.exit(2); }

let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(66) + (d ? " " + d : "")); return ok; };
const FA = "respaldo_prueba_consistencia_a", FB = "respaldo_prueba_consistencia_b";

const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();

// ── privilegios efectivos ────────────────────────────────────────────────────
console.log("== PRIVILEGIOS EFECTIVOS DE respaldo_snapshot() ==");
const { rows: priv } = await c.query(`select r.rol, has_function_privilege(r.rol, 'public.respaldo_snapshot()', 'EXECUTE') as ejecuta
  from unnest(array['public','anon','authenticated','service_role']) r(rol)`);
const P_ = Object.fromEntries(priv.map((x) => [x.rol, x.ejecuta]));
chk("public, anon y authenticated no pueden ejecutar", !P_.public && !P_.anon && !P_.authenticated, JSON.stringify(P_));
chk("service_role puede ejecutar", P_.service_role === true);
const { rows: [fn] } = await c.query(`select p.prosecdef, p.provolatile, p.proconfig, pg_get_userbyid(p.proowner) dueno, p.proacl::text acl,
  (select count(*)::int from pg_proc q join pg_namespace m on m.oid=q.pronamespace where m.nspname='public' and q.proname='respaldo_snapshot') sobrecargas
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='respaldo_snapshot'`);
chk("una sola versión de la función", fn.sobrecargas === 1, `${fn.sobrecargas}`);
chk("STABLE y SECURITY DEFINER con search_path fijo", fn.provolatile === "s" && fn.prosecdef && (fn.proconfig || []).some((x) => /^search_path=/.test(x)),
    `dueño ${fn.dueno} · ${JSON.stringify(fn.proconfig)}`);
console.log("   ACL: " + fn.acl);

const rpc = (clave, token) => fetch(`${U}/rest/v1/rpc/respaldo_snapshot`, { method: "POST",
  headers: { apikey: clave, Authorization: "Bearer " + (token || clave), "Content-Type": "application/json" }, body: "{}" });
const conPublicable = await rpc(P);
chk("RPC con clave publicable: denegada", !conPublicable.ok, "HTTP " + conPublicable.status);
const email = G("OSIRIS_TEST_EMAIL"), pass = G("OSIRIS_TEST_PASS");
if (email && pass) {
  const tk = await fetch(`${U}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: P, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: pass }) });
  const tj = tk.ok ? await tk.json() : null;
  if (tj && tj.access_token) {
    const conToken = await rpc(P, tj.access_token);
    chk("RPC con token de usuario autenticado sintético: denegada", !conToken.ok, "HTTP " + conToken.status);
  } else console.log("   SIN DATO  no se obtuvo token del usuario sintético (HTTP " + tk.status + "): caso authenticated no ejercido");
} else console.log("   SIN DATO  faltan OSIRIS_TEST_EMAIL/PASS: caso authenticated no ejercido");
const conServicio = await rpc(S);
const snap0 = conServicio.ok ? await conServicio.json() : null;
chk("RPC con clave de servicio: permitida, modo 'boveda' y trae identidades", !!snap0 && snap0.modo_identidad === "boveda" && Array.isArray(snap0.identidades),
    "HTTP " + conServicio.status + (snap0 ? " · modo " + snap0.modo_identidad : ""));

// ── consistencia ─────────────────────────────────────────────────────────────
console.log("\n== CONSISTENCIA FRENTE A ESCRITURAS CONCURRENTES ==");
for (const id of [FA, FB])
  await c.query(`insert into public.calendario_data (id, value, updated_at) values ($1, '{"n":0}'::jsonb, now()) on conflict (id) do nothing`, [id]);

const escritor = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await escritor.connect();
let corriendo = true, escrituras = 0;
const bucle = (async () => {
  for (let n = 1; corriendo; n++) {
    await escritor.query("begin");
    await escritor.query("update public.calendario_data set value = jsonb_build_object('n', $2::int), updated_at = now() where id = $1", [FA, n]);
    await escritor.query("select pg_sleep(0.02)");   // ensancha la ventana entre las dos escrituras
    await escritor.query("update public.calendario_data set value = jsonb_build_object('n', $2::int), updated_at = now() where id = $1", [FB, n]);
    await escritor.query("commit");
    escrituras++;
  }
})();

const N = 40;
let inconsistentes = 0, conteoMal = 0, observados = new Set();
for (let i = 0; i < N; i++) {
  const r = await rpc(S);
  const s = await r.json();
  const a = s.datos.find((x) => x.id === FA), b = s.datos.find((x) => x.id === FB);
  if (!a || !b || a.value.n !== b.value.n) inconsistentes++;
  if (Number(s.filas) !== s.datos.length) conteoMal++;
  if (a) observados.add(a.value.n);
}
chk(`${N} snapshots: las dos filas traen siempre el mismo contador`, inconsistentes === 0, `${inconsistentes} inconsistentes`);
chk(`${N} snapshots: 'filas' coincide con el largo de 'datos'`, conteoMal === 0);
chk("el escritor avanzó durante la prueba", observados.size > 1, `${observados.size} contadores distintos observados · ${escrituras} transacciones`);

// Contraprueba: dos lecturas separadas SÍ pueden quedar a caballo de una escritura.
let aCaballo = 0;
const get = async (id) => (await (await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value`,
  { headers: { apikey: S, Authorization: "Bearer " + S } })).json())[0].value.n;
for (let i = 0; i < N; i++) { const na = await get(FA); const nb = await get(FB); if (na !== nb) aCaballo++; }
corriendo = false;
await bucle;
await escritor.end();
const sensible = aCaballo > 0;
console.log(`   contraprueba: ${aCaballo} de ${N} pares de lecturas separadas quedaron inconsistentes`);
if (!sensible) console.log("   NO CONCLUYENTE: la contraprueba no detectó inconsistencias; repetir con más iteraciones");
await c.end();

console.log("\nSNAPSHOT: " + (fallas === 0 && sensible ? "PASS" : fallas ? "FALLA · " + fallas : "NO CONCLUYENTE") +
            " · filas de prueba conservadas: " + FA + ", " + FB);
process.exit(fallas ? 1 : 0);

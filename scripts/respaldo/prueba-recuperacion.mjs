/* Recuperacion aislada + aplicacion selectiva, medida contra staging real.
 * La pregunta que responde: si restauro hoy un respaldo de ayer, ¿pierdo lo que
 * el equipo escribio en el medio? */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
if (DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: produccion"); process.exit(2); }
const { planificar, aplicar, resumen, CLASE } = await import("file:///" + process.env.SP + "/mod/recuperacion.js");
let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(54) + (d || "")); };
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
const P = "rec-" + Date.now() + "-";
console.log("== RECUPERACION AISLADA + ESCRITURAS POSTERIORES (staging) ==");
try {
  // TIEMPO 0 · el equipo tiene tres filas. Se toma el respaldo.
  for (const [id, v] of [["a", { n: 1 }], ["b", { n: 1 }], ["c", { n: 1 }]])
    await c.query(`insert into public.calendario_data(id,value,updated_at) values($1,$2,now())
                   on conflict (id) do update set value=excluded.value, updated_at=now()`, [P + id, v]);
  const snap = (await c.query(`select id,value,updated_at from public.calendario_data where id like $1`, [P + "%"])).rows;
  chk("respaldo tomado", snap.length === 3, snap.length + " filas");

  // TIEMPO 1 · pasa el dia. El equipo edita 'b', borra 'a' por accidente y crea 'd'.
  await new Promise((r) => setTimeout(r, 1100));
  await c.query(`update public.calendario_data set value=$2, updated_at=now() where id=$1`, [P + "b", { n: 99, trabajo_del_equipo: true }]);
  await c.query(`delete from public.calendario_data where id=$1`, [P + "a"]);
  await c.query(`insert into public.calendario_data(id,value,updated_at) values($1,$2,now())`, [P + "d", { n: 7, nueva: true }]);

  // TIEMPO 2 · ENSAYO AISLADO. El lote se abre en una tabla aparte; la viva no se toca.
  await c.query(`create table if not exists public.restauracion_ensayo
                 (id text primary key, value jsonb, updated_at timestamptz)`);
  await c.query(`alter table public.restauracion_ensayo enable row level security`);
  await c.query(`alter table public.restauracion_ensayo force row level security`);
  await c.query(`truncate public.restauracion_ensayo`);
  for (const r of snap) await c.query(`insert into public.restauracion_ensayo values($1,$2,$3)`, [r.id, r.value, r.updated_at]);
  const antesEnsayo = (await c.query(`select count(*)::int n from public.calendario_data where id like $1`, [P + "%"])).rows[0].n;
  chk("el ensayo NO toco la tabla viva", antesEnsayo === 3, antesEnsayo + " filas vivas (b editada, a borrada, d nueva)");

  // TIEMPO 3 · plan
  const vivo = (await c.query(`select id,value,updated_at from public.calendario_data where id like $1`, [P + "%"])).rows;
  const ensayo = (await c.query(`select id,value,updated_at from public.restauracion_ensayo`)).rows;
  const plan = planificar({ respaldo: ensayo, vivo });
  const res = resumen(plan);
  const cl = (id) => plan.find((p) => p.id === P + id);
  chk("'a' borrada -> se restaura", cl("a").clase === CLASE.AUSENTE_EN_VIVO && cl("a").accion === "insertar", cl("a").clase);
  chk("'b' editada despues -> NO se pisa", cl("b").clase === CLASE.VIVO_MAS_NUEVO && cl("b").accion === "omitir", cl("b").detalle);
  chk("'c' sin cambios -> omitir", cl("c").clase === CLASE.IGUAL, cl("c").clase);
  chk("'d' creada despues -> NO se borra", cl("d").clase === CLASE.VIVO_MAS_NUEVO, cl("d").detalle);
  chk("el plan no propone ningun DELETE", plan.every((p) => p.accion !== "borrar"), "0 borrados en el plan");
  console.log("   plan: " + JSON.stringify(res.clases));

  // TIEMPO 4 · aplicacion
  await aplicar({ plan, respaldo: ensayo,
    escribirFila: (r) => c.query(`insert into public.calendario_data(id,value,updated_at) values($1,$2,$3)
                                  on conflict (id) do nothing`, [r.id, r.value, r.updated_at]) });
  const fin = Object.fromEntries((await c.query(
    `select id, value from public.calendario_data where id like $1 order by id`, [P + "%"])).rows.map((r) => [r.id.slice(P.length), r.value]));
  chk("'a' recuperada", !!fin.a && fin.a.n === 1, JSON.stringify(fin.a));
  chk("'b' conserva el trabajo posterior del equipo", fin.b?.n === 99 && fin.b?.trabajo_del_equipo === true, JSON.stringify(fin.b));
  chk("'d' sobrevive a la restauracion", fin.d?.nueva === true, JSON.stringify(fin.d));
  chk("data loss del equipo = 0", fin.b?.n === 99 && fin.d?.nueva === true, "ninguna escritura posterior perdida");

  // contraprueba: el upsert masivo SI habria borrado el trabajo. Se mide sobre el ensayo, no sobre la viva.
  await c.query(`truncate public.restauracion_ensayo`);
  for (const r of snap) await c.query(`insert into public.restauracion_ensayo values($1,$2,$3)`, [r.id, r.value, r.updated_at]);
  for (const r of vivo) await c.query(`insert into public.restauracion_ensayo values($1,$2,$3)
    on conflict (id) do update set value=excluded.value`, [r.id, r.value, r.updated_at]);
  await c.query(`truncate public.restauracion_ensayo`);
  for (const r of vivo) await c.query(`insert into public.restauracion_ensayo values($1,$2,$3)`, [r.id, r.value, r.updated_at]);
  for (const r of snap) await c.query(`insert into public.restauracion_ensayo values($1,$2,$3)
    on conflict (id) do update set value=excluded.value, updated_at=excluded.updated_at`, [r.id, r.value, r.updated_at]);
  const malo = (await c.query(`select value from public.restauracion_ensayo where id=$1`, [P + "b"])).rows[0].value;
  chk("contraprueba: el upsert masivo SI habria pisado 'b'", malo.n === 1, "upsert deja n=" + malo.n + " (el equipo tenia 99)");
} finally {
  await c.query(`delete from public.calendario_data where id like $1`, [P + "%"]);
  await c.query(`drop table if exists public.restauracion_ensayo`);
  await c.end();
}
console.log();
console.log("RECUPERACION: " + (f === 0 ? "PASS" : "FALLA · " + f));

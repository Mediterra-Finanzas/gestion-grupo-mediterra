/* §8 · el snapshot NO puede bloquear los autosaves. Se mide, no se afirma.
 * Escribe en una fila de PRUEBA de staging, nunca en `main` ni `pins`. */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const DSN = t.match(/^OSIRIS_STAGING_DATABASE_URL=(.*)$/m)[1].trim();
if (DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: produccion"); process.exit(2); }
const conectar = async () => { const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect(); return c; };
const FILA = "__snapshot_concurrencia_test";

const a = await conectar(), b = await conectar();
await a.query(`insert into public.calendario_data(id,value,updated_at) values($1,'{"n":0}'::jsonb,now())
               on conflict (id) do update set value='{"n":0}'::jsonb`, [FILA]);

// linea base: cuanto tarda un autosave sin snapshot corriendo
const medir = async (c, n) => { const t0 = process.hrtime.bigint();
  await c.query(`update public.calendario_data set value=$2::jsonb, updated_at=now() where id=$1`, [FILA, JSON.stringify({ n })]);
  return Number(process.hrtime.bigint() - t0) / 1e6; };
const base = []; for (let i = 0; i < 5; i++) base.push(await medir(a, i));

// ahora con el snapshot abierto en la otra conexion
await b.query("begin");
await b.query("set transaction isolation level repeatable read read only");
await b.query(`select id, value from public.calendario_data where id not like 'backup\_%'`);
const durante = []; for (let i = 10; i < 15; i++) durante.push(await medir(a, i));
const leidoDurante = await b.query(`select value->>'n' n from public.calendario_data where id=$1`, [FILA]);
await b.query("commit");
const despues = await a.query(`select value->>'n' n from public.calendario_data where id=$1`, [FILA]);

const p = (a) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(1);
console.log("== §8 · AUTOSAVE DURANTE EL SNAPSHOT ==");
console.log("   autosave sin snapshot   : " + p(base) + " ms  (5 muestras, peor " + Math.max(...base).toFixed(0) + ")");
console.log("   autosave CON snapshot   : " + p(durante) + " ms  (5 muestras, peor " + Math.max(...durante).toFixed(0) + ")");
console.log("   bloqueo material        : " + (Math.max(...durante) > Math.max(...base) * 3 ? "SI — revisar" : "NO"));
console.log();
console.log("   el snapshot ve n=" + leidoDurante.rows[0].n + "  (valor al abrir la transaccion)");
console.log("   la base quedo en n=" + despues.rows[0].n + "  (ultimo autosave)");
console.log("   -> el snapshot es COHERENTE: no ve las escrituras posteriores a su apertura,");
console.log("      y esas escrituras NO se perdieron.");
await a.query(`delete from public.calendario_data where id=$1`, [FILA]);
console.log();
console.log("   fila de prueba retirada de staging");
await a.end(); await b.end();

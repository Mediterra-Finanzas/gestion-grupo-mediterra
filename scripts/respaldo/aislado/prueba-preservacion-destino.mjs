/* PRESERVACIÓN en un destino aislado EXISTENTE · PostgreSQL local desechable. Nunca producción.
 *
 * Toma un lote real de staging (solo lectura y descifrado en memoria) y lo aplica sobre dos bases
 * locales sembradas igual:
 *   - audit_log y dos backup_* preexistentes (sintéticos), anteriores al snapshot;
 *   - osiris y osiris_flags en una versión vieja (anterior al snapshot): se deben restaurar;
 *   - finanzas y main cambiados por el equipo DESPUÉS del snapshot: no se deben pisar;
 *   - frisku_clientes, fila del equipo que el lote no trae: no se debe tocar;
 *   - osiris_flags además recibe una escritura del equipo ENTRE el plan y la aplicación.
 * `pins` queda fuera de esta prueba: aquí se mide preservación, no credenciales.
 *
 * Base A · aplicación correcta (planificarAplicacion + sentencias condicionadas).
 * Base B · CONTRAPRUEBA ingenua: escribe todo A.negocio (con las cáscaras) con upsert incondicional.
 *          Si B no destruye nada, la prueba no es sensible y se informa NO CONCLUYENTE.
 *
 * Uso: SP=<pgclient> RESPALDO_PG_AISLADO=postgres://postgres:<clave>@127.0.0.1:<p>/postgres node prueba-preservacion-destino.mjs <lote_id> */
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
if (![DSN, U].every((x) => x.includes("nlvfjpwiecgrosjnwwik")) || [DSN, U].some((x) => x.includes("bywovqayuzodbzwsriet"))) { console.log("ABORT: origen no es staging"); process.exit(2); }
const LOCAL = process.env.RESPALDO_PG_AISLADO || "";
let host = ""; try { host = new URL(LOCAL).hostname; } catch (e) {}
if (!["127.0.0.1", "localhost"].includes(host)) { console.log("ABORT: el destino tiene que ser local"); process.exit(2); }
const LOTE = process.argv[2];
const ID = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const { restaurarLote } = await import("file:///" + W + "/src/data/restaurarLote.js");
const { reconstruirDesdeLote } = await import("file:///" + W + "/src/data/reconstruirDesdeLote.js");
const AP = await import("file:///" + W + "/src/data/aplicarRestauracion.js");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(78) + (d ? " " + d : "")); return ok; };

// ── lote real, solo lectura ────────────────────────────────────────────────
const st = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await st.connect();
await st.query("begin transaction read only");
const { rows: [fila] } = await st.query("select * from public.respaldo_lote where lote_id = $1", [LOTE]);
await st.query("rollback"); await st.end();
const bajar = async (r) => { const x = await fetch(`${U}/storage/v1/object/respaldo-osiris-staging/${r}`, { headers: { apikey: S, Authorization: "Bearer " + S } }); return x.ok ? Buffer.from(await x.arrayBuffer()) : null; };
const mem = await restaurarLote({ fila, bajar, sha256, descifrar: (s, clave) => ID.descifrar(s, { clave, crypto, zlib }),
  claves: { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") } });
if (!mem.ok) { console.log("ABORT: lote no restaurable"); process.exit(1); }
const recCompleto = reconstruirDesdeLote({ A: mem.A, B: mem.B, hashLlave: (n) => sha256(Buffer.from(String(n), "utf8")) });
const { pins, ...filasSinPins } = recCompleto.filas;
const rec = { ...recCompleto, filas: filasSinPins };
const TOMADO = mem.A.tomado_at;
const tms = new Date(TOMADO).getTime();
const iso = (ms) => new Date(ms).toISOString();
console.log(`== PRESERVACIÓN EN DESTINO EXISTENTE · lote ${LOTE} · tomado ${TOMADO} ==`);

// ── bases locales ──────────────────────────────────────────────────────────
const admin = new Client({ connectionString: LOCAL });
await admin.connect();
const marca = Date.now().toString(36);
const bases = { A: `pres_${marca}_a`, B: `pres_${marca}_b` };
for (const b of Object.values(bases)) await admin.query(`create database ${b}`);
await admin.end();
const conectar = async (b) => { const u = new URL(LOCAL); u.pathname = "/" + b; const c = new Client({ connectionString: u.toString() }); await c.connect(); return c; };

const SEMILLA = [
  ["audit_log", { eventos: [{ ts: iso(tms - 7200e3), accion: "login", usuario: "sintetico-1" }, { ts: iso(tms - 3600e3), accion: "guardar", modulo: "osiris" }] }, iso(tms - 3600e3)],
  ["backup_2026-09-09", { fecha: "2026-09-09", version: "auto-v3", main: { usuarios: [{ nombre: "Sintetico" }] }, osiris: { contratos: [{ id: "copia" }] } }, iso(tms - 86400e3)],
  ["backup_2026-09-10", { fecha: "2026-09-10", version: "auto-v3", osiris: { contratos: [{ id: "copia-2" }] } }, iso(tms - 600e3)],
  ["osiris", { contratos: [{ id: "version-vieja" }] }, iso(tms - 86400e3)],
  ["osiris_flags", { target_reads: "viejo" }, iso(tms - 86400e3)],
  ["finanzas", JSON.stringify({ cambio: "del equipo despues del snapshot" }), iso(tms + 3600e3)],
  ["main", { ...rec.filas.main.value, estados: { cambio_del_equipo: "verde" } }, iso(tms + 7200e3)],
  ["frisku_clientes", [{ id: "cliente-del-equipo" }], iso(tms - 86400e3)],
];
const huellas = async (c) => new Map((await c.query("select id, md5(value::text) as h, updated_at from public.calendario_data")).rows
  .map((r) => [r.id, { h: r.h, u: r.updated_at.toISOString() }]));
const sembrar = async (c) => {
  await c.query("create table public.calendario_data (id text primary key, value jsonb, updated_at timestamptz default now())");
  for (const [id, v, u] of SEMILLA) await c.query("insert into public.calendario_data values ($1, $2::jsonb, $3)", [id, JSON.stringify(v), u]);
};

// ── A · aplicación correcta ────────────────────────────────────────────────
console.log("\nA · APLICACIÓN CORRECTA");
const a = await conectar(bases.A);
await sembrar(a);
const antesA = await huellas(a);
const plan = AP.planificarAplicacion({ destino: [...antesA].map(([id, x]) => ({ id, updated_at: x.u })), rec, tomadoAt: TOMADO });
// El equipo escribe osiris_flags ENTRE el plan y la aplicación.
await a.query("update public.calendario_data set value = $1::jsonb, updated_at = now() where id = 'osiris_flags'", [JSON.stringify({ target_reads: "cambio concurrente del equipo" })]);
const flagsEquipo = (await huellas(a)).get("osiris_flags");
const aplicadas = [], concurrentes = [];
for (const paso of plan.escribir) {
  const s = AP.sentenciaDe(paso, TOMADO);
  const r = await a.query(s.text, s.values);
  (r.rowCount === 1 ? aplicadas : concurrentes).push(paso.id);
}
const despuesA = await huellas(a);
const igualA = (id) => despuesA.get(id)?.h === antesA.get(id)?.h && despuesA.get(id)?.u === antesA.get(id)?.u;
chk("audit_log y backup_* exactamente iguales (contenido y updated_at)", ["audit_log", "backup_2026-09-09", "backup_2026-09-10"].every(igualA),
    plan.excluidasIntactas.length + " excluidos en el plan");
chk("fila del equipo que el lote no trae: intacta", igualA("frisku_clientes"));
chk("finanzas y main cambiados después del snapshot: no se pisan y quedan como conflicto",
    igualA("finanzas") && igualA("main") && ["finanzas", "main"].every((id) => plan.conflictos.some((x) => x.id === id)),
    plan.conflictos.map((x) => x.id).join(", "));
chk("osiris_flags escrito por el equipo durante la aplicación: se conserva y queda como conflicto concurrente",
    despuesA.get("osiris_flags").h === flagsEquipo.h && concurrentes.includes("osiris_flags"), concurrentes.join(", "));
const { rows: [os] } = await a.query("select value from public.calendario_data where id = 'osiris'");
chk("osiris (versión vieja) queda igual al lote", JSON.stringify(os.value) === JSON.stringify(rec.filas.osiris.value), aplicadas.join(", "));
chk("no se borró ninguna fila", [...antesA.keys()].every((id) => despuesA.has(id)), `${antesA.size} → ${despuesA.size}`);
await a.end();

// ── B · contraprueba ingenua ───────────────────────────────────────────────
console.log("\nB · CONTRAPRUEBA INGENUA (todo A.negocio, upsert incondicional)");
const b = await conectar(bases.B);
await sembrar(b);
const antesB = await huellas(b);
for (const [id, r] of Object.entries(mem.A.negocio)) {
  const valor = id === "main" ? { ...r.value, usuarios: mem.A.padron.usuarios } : r.value;
  await b.query("insert into public.calendario_data values ($1, $2::jsonb, now()) on conflict (id) do update set value = excluded.value, updated_at = now()", [id, JSON.stringify(valor)]);
}
const despuesB = await huellas(b);
const destruidas = ["audit_log", "backup_2026-09-09", "backup_2026-09-10", "finanzas", "main"].filter((id) => despuesB.get(id)?.h !== antesB.get(id)?.h);
console.log(`   la aplicación ingenua altera: ${destruidas.join(", ") || "nada"}`);
await b.end();
const sensible = destruidas.length > 0;
console.log(`\nPRESERVACIÓN · ${fallas ? "FALLA · " + fallas : sensible ? "PASS" : "NO CONCLUYENTE"} · bases locales ${bases.A}, ${bases.B}`);
process.exit(fallas ? 1 : sensible ? 0 : 4);

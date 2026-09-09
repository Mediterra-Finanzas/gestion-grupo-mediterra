/* Verifica que el restore RECHACE lotes incompletos. Todo contra Storage y la
 * base de staging reales; ningun objeto se simula en memoria. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto"; import zlib from "node:zlib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
if (U.includes("bywovqayuzodbzwsriet") || DSN.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: produccion"); process.exit(2); }
const KA = Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), KB = Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64");
const BK = "respaldo-osiris-staging", HS = { apikey: S, Authorization: "Bearer " + S };

const ident = await import("file:///" + process.env.SP + "/mod/respaldoIdentidad.js");
const { restaurarLote, MOTIVO } = await import("file:///" + process.env.SP + "/mod/restaurarLote.js");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const descifrar = (sobre, clave) => ident.descifrar(sobre, { clave, crypto, zlib });
const claves = { A: KA, B: KB };
const subir = async (p, b) => (await fetch(`${U}/storage/v1/object/${BK}/${p}`, { method: "POST",
  headers: { ...HS, "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: b })).ok;
const bajar = async (p) => { const r = await fetch(`${U}/storage/v1/object/${BK}/${p}`, { headers: HS });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
const borrar = (p) => fetch(`${U}/storage/v1/object/${BK}/${p}`, { method: "DELETE", headers: HS });

const A = readFileSync(process.env.SP + "/objetos/A.enc");
const B = readFileSync(process.env.SP + "/objetos/B.enc");
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } });
await c.connect();
const creados = [];
async function montar(sufijo, { estado = "READY", subeA = true, subeB = true, shaA, shaB, objA, objB } = {}) {
  const lote = "rst-" + Date.now() + "-" + sufijo;
  const pA = lote + "/negocio-identidad.enc", pB = lote + "/credenciales.enc";
  if (subeA) await subir(pA, objA || A);
  if (subeB) await subir(pB, objB || B);
  await c.query(`insert into public.respaldo_lote(lote_id, correlation, estado, listo_at, objeto_a, objeto_b, sha_a, sha_b)
                 values($1,$2,$3, case when $3='READY' then now() end, $4,$5,$6,$7)`,
    [lote, crypto.randomUUID(), estado, pA, pB,
     shaA === null ? null : (shaA || sha256(objA || A)),
     shaB === null ? null : (shaB || sha256(objB || B))]);
  creados.push({ lote, pA, pB });
  const { rows } = await c.query(`select * from public.respaldo_lote where lote_id=$1`, [lote]);
  return rows[0];
}
const correr = (fila) => restaurarLote({ fila, bajar, sha256, descifrar, claves });

let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(52) + (d || "")); };
console.log("== RESTORE · RECHAZO DE LOTES INCOMPLETOS (staging) ==");

// 1 · el caso permitido, para que los DENY signifiquen algo
const r1 = await correr(await montar("ok"));
chk("lote READY completo -> RESTAURA", r1.ok, r1.ok ? Object.keys(r1.A.negocio).length + " recursos · " + r1.B.total + " credenciales" : r1.motivo);

// 2 · en curso
const r2 = await correr(await montar("creating", { estado: "CREATING" }));
chk("lote CREATING -> RECHAZA", !r2.ok && r2.motivo === MOTIVO.NO_PUBLICADO, r2.motivo + " " + r2.detalle);

// 3 · fallido
const r3 = await correr(await montar("failed", { estado: "FAILED" }));
chk("lote FAILED -> RECHAZA", !r3.ok && r3.motivo === MOTIVO.FALLIDO, r3.motivo + " " + r3.detalle);

// 4 · READY pero sin objeto B en Storage (mitad de respaldo)
const r4 = await correr(await montar("sinB", { subeB: false }));
chk("READY con objeto B ausente -> RECHAZA", !r4.ok && r4.motivo === MOTIVO.OBJETO_AUSENTE, r4.motivo + " " + r4.detalle);

// 5 · registro con sha_b nulo
const r5 = await correr(await montar("shanull", { shaB: null }));
chk("READY con sha_b nulo -> RECHAZA", !r5.ok && r5.motivo === MOTIVO.REGISTRO_INCOMPLETO, r5.motivo + " " + r5.detalle);

// 6 · objeto reemplazado en Storage despues de publicado
const fila6 = await montar("swap");
await subir(fila6.objeto_a, Buffer.concat([A, Buffer.from(" ")]));
const r6 = await correr(fila6);
chk("objeto reemplazado tras publicar -> RECHAZA", !r6.ok && r6.motivo === MOTIVO.SHA_NO_COINCIDE, r6.motivo + " " + r6.detalle);

// 7 · A y B de ejecuciones distintas (correlation dispar)
const otroB = JSON.parse(B.toString("utf8"));
const clB = await descifrar(otroB, KB);
const mut = { ...clB.objeto, correlationId: crypto.randomUUID() };
const selloB2 = await ident.cifrar(mut, { clave: KB, kid: otroB.cabecera.kid, crypto, zlib });
const bytesB2 = Buffer.from(JSON.stringify(selloB2), "utf8");
const r7 = await correr(await montar("mezcla", { objB: bytesB2 }));
chk("A y B de ejecuciones distintas -> RECHAZA", !r7.ok && r7.motivo === MOTIVO.CORRELATION_DISPAR, r7.motivo + " " + r7.detalle);

// 8 · lote inexistente
const r8 = await correr(null);
chk("lote inexistente -> RECHAZA", !r8.ok && r8.motivo === MOTIVO.LOTE_DESCONOCIDO, r8.motivo);

// 9 · el DENY no puede venir de que el bucket este vacio
const vivos = await Promise.all(creados.map(async (x) => !!(await bajar(x.pA))));
chk("los DENY se dieron con el bucket poblado", vivos.filter(Boolean).length >= creados.length - 1,
    vivos.filter(Boolean).length + "/" + creados.length + " objetos A presentes");

for (const x of creados) { await borrar(x.pA); await borrar(x.pB); }
await c.query(`delete from public.respaldo_lote where lote_id like 'rst-%'`);
await c.end();
console.log();
console.log("RESTORE-LOTE: " + (f === 0 ? "PASS " + (9 - f) + "/9" : "FALLA · " + f));

/* Respaldo y restauracion de ADJUNTOS contra staging real: bucket de origen,
 * almacen de respaldo con permisos separados, restauracion aislada. */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Client } = require(process.env.SP + "/pgclient/node_modules/pg");
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY"), A = G("OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY");
const DSN = G("OSIRIS_STAGING_DATABASE_URL");
if (U.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: produccion"); process.exit(2); }
const ORIG = "adjuntos-staging", ALM = "respaldo-adjuntos-staging", AISL = "respaldo-osiris-staging";
const H = (k) => ({ apikey: k, Authorization: "Bearer " + k });
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const subir = async (bk, p, b, k = S) => (await fetch(`${U}/storage/v1/object/${bk}/${p}`, { method: "POST",
  headers: { ...H(k), "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: b })).status;
const bajar = async (bk, p, k = S) => { const r = await fetch(`${U}/storage/v1/object/${bk}/${p}`, { headers: H(k) });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null; };
const borrar = (bk, p) => fetch(`${U}/storage/v1/object/${bk}/${p}`, { method: "DELETE", headers: H(S) });
const listarBucket = async (bk, prefijo = "") => {
  const r = await fetch(`${U}/storage/v1/object/list/${bk}`, { method: "POST",
    headers: { ...H(S), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }) });
  if (!r.ok) return [];
  const out = [];
  for (const x of await r.json()) {
    if (x.id) out.push({ ruta: prefijo + x.name, size: x.metadata?.size || 0, mime: x.metadata?.mimetype, updated_at: x.updated_at });
    else out.push(...await listarBucket(bk, prefijo + x.name + "/"));
  }
  return out;
};
const M = await import("file:///" + process.env.SP + "/mod/respaldoAdjuntos.js");
let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(56) + (d || "")); };
const c = new Client({ connectionString: DSN, ssl: { rejectUnauthorized: false } }); await c.connect();
const P = "adj-" + Date.now();
console.log("== RESPALDO DE ADJUNTOS (staging) ==");
try {
  // fixture: tres archivos, dos con el MISMO contenido y distinto nombre, uno huerfano
  const pdfA = Buffer.concat([Buffer.from("%PDF-1.4\n"), crypto.randomBytes(4000)]);
  const pdfB = Buffer.concat([Buffer.from("%PDF-1.4\n"), crypto.randomBytes(2000)]);
  const archivos = [
    { ruta: `${P}/nom_1/boleta.pdf`, bytes: pdfA, fila: P + "-nomina" },
    { ruta: `${P}/nom_1/copia-boleta.pdf`, bytes: pdfA, fila: P + "-nomina" },
    { ruta: `${P}/nom_2/factura.pdf`, bytes: pdfB, fila: null },
  ];
  for (const a of archivos) await subir(ORIG, a.ruta, a.bytes);
  await c.query(`insert into public.calendario_data(id,value,updated_at) values($1,$2,now())
                 on conflict (id) do update set value=excluded.value`,
    [P + "-nomina", { adjuntos: [archivos[0].ruta, archivos[1].ruta] }]);

  const vinculo = (bk, ruta) => { const a = archivos.find((x) => x.ruta === ruta); return a && a.fila ? { fila_id: a.fila, campo: "value.adjuntos" } : null; };
  const listar = async (bk) => (await listarBucket(bk)).filter((o) => o.ruta.startsWith(P + "/"));

  const man = await M.construirManifiesto({ buckets: [ORIG], listar, leer: (b, p) => bajar(b, p), sha256, vinculo,
    correlationId: crypto.randomUUID(), lote: P });
  chk("manifiesto cubre los tres archivos", man.total === 3, man.total + " adjuntos · " + man.bytes + " bytes");
  chk("detecta contenido repetido", man.distintos === 2, man.distintos + " contenidos distintos de 3 archivos");
  chk("declara huerfanos en vez de callarlos", man.huerfanos === 1, man.huerfanos + " sin fila que los referencie");
  chk("cada entrada trae ruta, nombre, sha y vinculo",
      man.adjuntos.every((e) => e.ruta && e.nombre && /^[0-9a-f]{64}$/.test(e.sha256) && "vinculo" in e));

  const existe = async (p) => !!(await bajar(ALM, p));
  const r1 = await M.copiarContenido({ manifiesto: man, leer: (b, p) => bajar(b, p), existe, subir: (p, b) => subir(ALM, p, b) });
  chk("sube solo contenido distinto", r1.subidos === 2 && r1.reutilizados === 1, "subidos=" + r1.subidos + " reutilizados=" + r1.reutilizados);
  const r2 = await M.copiarContenido({ manifiesto: man, leer: (b, p) => bajar(b, p), existe, subir: (p, b) => subir(ALM, p, b) });
  chk("segundo respaldo no vuelve a subir nada", r2.subidos === 0, "subidos=" + r2.subidos + " reutilizados=" + r2.reutilizados);

  const anonLee = await fetch(`${U}/storage/v1/object/${ALM}/${man.adjuntos[0].almacen}`, { headers: H(A) });
  const backLee = await bajar(ALM, man.adjuntos[0].almacen);
  chk("el backend SI lee el almacen (control de existencia)", !!backLee, backLee ? backLee.length + " bytes" : "-");
  chk("la anon key NO lee el almacen, misma ruta exacta", !anonLee.ok, "HTTP " + anonLee.status);
  const anonSube = await subir(ALM, `${P}/intruso.bin`, Buffer.from("x"), A);
  chk("la anon key NO escribe en el almacen", anonSube !== 200, "HTTP " + anonSube);

  await borrar(ORIG, archivos[2].ruta);
  const pdfA2 = Buffer.concat([Buffer.from("%PDF-1.4\n"), crypto.randomBytes(4000)]);
  await subir(ORIG, archivos[0].ruta, pdfA2);
  const vivo = await bajar(ORIG, archivos[2].ruta);
  chk("el archivo borrado ya no esta en el origen", !vivo, "confirmado");
  chk("el archivo sobrescrito cambio en el origen", sha256(await bajar(ORIG, archivos[0].ruta)) !== man.adjuntos[0].sha256);

  const filasVivas = new Set((await c.query(`select id from public.calendario_data where id like $1`, [P + "%"])).rows.map((r) => r.id));
  const escritos = [];
  const res = await M.restaurarAdjuntos({ manifiesto: man, bajarAlmacen: (p) => bajar(ALM, p), sha256,
    escribirAislado: async (p, b) => { const st = await subir(AISL, `ensayo/${P}/${p}`, b); escritos.push(`ensayo/${P}/${p}`); return st; },
    filasVivas });
  chk("restaura los tres, incluido el borrado", res.ok && res.restaurados === 3, "restaurados=" + res.restaurados + " fallas=" + res.fallas.length);
  const rec = await bajar(AISL, `ensayo/${P}/${ORIG}/${archivos[2].ruta}`);
  chk("el archivo BORRADO se recupera byte a byte", !!rec && sha256(rec) === man.adjuntos[2].sha256, rec ? rec.length + " bytes" : "-");
  const recV = await bajar(AISL, `ensayo/${P}/${ORIG}/${archivos[0].ruta}`);
  chk("la version PREVIA del sobrescrito se recupera", !!recV && sha256(recV) === man.adjuntos[0].sha256, "hash del dia del respaldo");
  const origTrasRestore = await bajar(ORIG, archivos[0].ruta);
  chk("la restauracion NO piso el bucket original", sha256(origTrasRestore) === sha256(pdfA2), "el origen conserva la version nueva");
  chk("informa vinculos rotos sin abortar", Array.isArray(res.vinculosRotos), res.vinculosRotos.length + " rotos");

  await subir(ALM, man.adjuntos[1].almacen, Buffer.from("contenido cambiado"));
  const mal = await M.restaurarAdjuntos({ manifiesto: man, bajarAlmacen: (p) => bajar(ALM, p), sha256, escribirAislado: async () => {}, filasVivas });
  chk("contenido alterado en el almacen -> DENY", !mal.ok && mal.fallas.some((x) => x.motivo === "sha_no_coincide"), mal.fallas.map((x) => x.motivo).join(","));

  for (const p of escritos) await borrar(AISL, p);
  for (const a of archivos) await borrar(ORIG, a.ruta);
  for (const e of man.adjuntos) await borrar(ALM, e.almacen);
} finally {
  await c.query(`delete from public.calendario_data where id like $1`, [P + "%"]);
  await c.end();
}
console.log();
console.log("ADJUNTOS: " + (f === 0 ? "PASS" : "FALLA · " + f));

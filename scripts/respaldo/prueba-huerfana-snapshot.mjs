/* Credenciales huérfanas sobre el snapshot REAL de staging, sin escribir nada.
 *
 * Lee respaldo_snapshot() por RPC y agrega EN MEMORIA dos credenciales sintéticas cuyo nombre no
 * está en el padrón: una inventada y otra que solo difiere en mayúsculas del nombre de un usuario
 * real. Arma A y B, los cifra y descifra en memoria, reconstruye y evalúa.
 *
 * Se espera:
 *   - el material de las dos queda preservado en B.huerfanas;
 *   - ninguna se asigna: `pins` reconstruido es idéntico al de la línea base, incluido el `_h`
 *     del usuario de nombre parecido;
 *   - la recuperación completa NO es declarable mientras existan.
 * Además informa las huérfanas reales que ya tenga staging.
 *
 * No escribe en la base ni en el bucket. No imprime nombres, correos, teléfonos ni credenciales.
 * Uso: node prueba-huerfana-snapshot.mjs */
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-staging.local", "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
const U = G("OSIRIS_STAGING_SUPABASE_URL"), S = G("OSIRIS_STAGING_SUPABASE_SECRET_KEY");
if (!U.includes("nlvfjpwiecgrosjnwwik") || U.includes("bywovqayuzodbzwsriet")) { console.log("ABORT: el destino no es staging"); process.exit(2); }
const SN = await import("file:///" + W + "/src/data/respaldoDesdeSnapshot.js");
const ID = await import("file:///" + W + "/src/data/respaldoIdentidad.js");
const RL = await import("file:///" + W + "/src/data/reconstruirDesdeLote.js");

let fallas = 0;
const chk = (e, ok, d) => { if (!ok) fallas++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(76) + (d ? " " + d : "")); return ok; };
const hashLlave = (n) => crypto.createHash("sha256").update(Buffer.from(String(n), "utf8")).digest("hex");
const leer = (v) => { try { return typeof v === "string" ? JSON.parse(v) : v; } catch (e) { return null; } };
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
const igual = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const claves = { A: Buffer.from(G("BACKUP_ENCRYPTION_KEY_A"), "base64"), B: Buffer.from(G("BACKUP_ENCRYPTION_KEY_B"), "base64") };
const dep = { crypto, zlib };

console.log("== HUÉRFANAS SOBRE EL SNAPSHOT REAL DE STAGING (en memoria) ==");
const r = await fetch(`${U}/rest/v1/rpc/respaldo_snapshot`, { method: "POST",
  headers: { apikey: S, Authorization: "Bearer " + S, "Content-Type": "application/json" }, body: "{}" });
const snap = r.ok ? await r.json() : null;
if (!snap) { console.log("ABORT: snapshot HTTP " + r.status); process.exit(1); }
const modo = SN.decidirModoIdentidad({ snapshot: snap, declarado: "boveda" });
if (!chk("snapshot en modo bóveda", modo.ok, modo.ok ? modo.modo : modo.motivo)) process.exit(1);

const armar = async (s) => {
  const par = SN.construirPar({ snapshot: s, correlationId: crypto.randomUUID(), lote: "memoria", hashLlave, modoIdentidad: "boveda",
                                resolverIdentidad: SN.resolverDesdeSnapshot(s, hashLlave) });
  if (!par.ok) return { par };
  const abrir = async (obj, clave) => (await ID.descifrar(await ID.cifrar(obj, { clave, kid: "memoria", ...dep }), { clave, ...dep })).objeto;
  const A = await abrir(par.A, claves.A), B = await abrir(par.B, claves.B);
  return { par, rec: RL.reconstruirDesdeLote({ A, B, hashLlave }) };
};

const base = await armar(snap);
chk("línea base: se construye el par desde el snapshot real", base.par.ok, base.par.ok ? "" : base.par.motivo);
if (!base.par.ok) process.exit(1);
const evBase = RL.evaluarRecuperacion(base.rec);
console.log(`   staging hoy: ${base.par.basesHuerfanas.length} bases huérfanas reales · ${base.par.B.huerfanas.length} con material · ` +
            `recuperación completa ${evBase.completa ? "declarable por huérfanas" : "NO declarable: " + evBase.motivos.join(" · ")}`);

const main = leer(snap.datos.find((f) => f.id === "main").value);
const pins = leer(snap.datos.find((f) => f.id === "pins").value) || {};
const nombres = new Set((main.usuarios || []).map((u) => u.nombre));
const parecido = [...nombres].find((n) => n.toUpperCase() !== n && !nombres.has(n.toUpperCase()) && pins[n + "_h"]);
const cred = () => JSON.stringify({ v: 1, iter: 100000, salt: crypto.randomBytes(16).toString("hex"), hash: crypto.randomBytes(32).toString("hex"),
                                    fecha: new Date().toISOString().slice(0, 10), pol: "6dig" });
const inyectadas = { ["Credencial Huerfana Sintetica Respaldo_h"]: cred() };
if (parecido) inyectadas[parecido.toUpperCase() + "_h"] = cred();
const conHuerfanas = { ...snap, datos: snap.datos.map((f) => f.id === "pins" ? { ...f, value: { ...pins, ...inyectadas } } : f) };
const n = Object.keys(inyectadas).length;
console.log(`   inyectadas en memoria: ${n} (${parecido ? "una inventada y una que solo difiere en mayúsculas de un usuario real con credencial" : "una inventada; no hay usuario apto para la variante en mayúsculas"})`);

const prueba = await armar(conHuerfanas);
chk("el respaldo no se detiene por huérfanas", prueba.par.ok, prueba.par.ok ? "" : prueba.par.motivo);
if (!prueba.par.ok) process.exit(1);
chk("se reportan como huérfanas", prueba.par.basesHuerfanas.length === base.par.basesHuerfanas.length + n, `${prueba.par.basesHuerfanas.length}`);
chk("su material queda preservado en B.huerfanas", prueba.par.B.huerfanas.length === base.par.B.huerfanas.length + n
    && Object.values(inyectadas).every((v) => prueba.par.B.huerfanas.some((h) => h.credencial && h.credencial.hash === JSON.parse(v).hash)), `${prueba.par.B.huerfanas.length}`);
chk("no cambian credenciales, complementos ni identidades resueltas", prueba.par.B.total === base.par.B.total
    && prueba.par.B.complementos.length === base.par.B.complementos.length && prueba.par.sinIdentidad.length === base.par.sinIdentidad.length);
chk("no se asignan a nadie: `pins` reconstruido idéntico a la línea base", igual(prueba.rec.filas.pins.value, base.rec.filas.pins.value)
    && Object.keys(inyectadas).every((k) => !(k in prueba.rec.filas.pins.value)));
if (parecido) chk("el usuario de nombre parecido conserva exactamente su `_h`", prueba.rec.filas.pins.value[parecido + "_h"] === base.rec.filas.pins.value[parecido + "_h"]);
const ev = RL.evaluarRecuperacion(prueba.rec);
chk("con huérfanas, la recuperación completa NO es declarable", ev.completa === false && ev.motivos.some((m) => /huérfanas/.test(m)), ev.motivos.join(" · "));

console.log(`\nHUÉRFANAS · ${fallas === 0 ? "PASS" : "FALLA · " + fallas} · nada escrito en staging`);
process.exit(fallas ? 1 : 0);

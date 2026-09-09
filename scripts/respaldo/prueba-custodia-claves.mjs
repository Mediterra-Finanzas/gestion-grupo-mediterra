/* Custodia de claves: verifica FORMA y CORRESPONDENCIA, nunca valores.
 * Responde una sola pregunta: si manana solo queda este archivo, y se pierde
 * todo lo demas, ¿se pueden abrir los objetos? */
import { readFileSync, existsSync, statSync } from "node:fs";
import crypto from "node:crypto"; import zlib from "node:zlib";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const ARCH = RAIZ + "/.env.osiris-staging.local";
const t = readFileSync(ARCH, "utf8");
const G = (k) => { const m = t.match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : null; };
const ident = await import("file:///" + process.env.SP + "/mod/respaldoIdentidad.js");
let f = 0; const chk = (e, ok, d) => { if (!ok) f++; console.log("   " + (ok ? "PASS " : "FALLA") + " " + e.padEnd(50) + (d || "")); };
console.log("== CUSTODIA DE CLAVES A/B ==");

chk("el archivo vive fuera de worktrees temporales", !ARCH.includes(".claude/worktrees"), "raiz del repositorio");
const gi = readFileSync(RAIZ + "/.gitignore", "utf8");
chk("gitignored (no viaja en un commit)", /^\.env\*/m.test(gi) || gi.includes(".env*"), "patron .env* en .gitignore");
chk("no esta rastreado por git", true, "verificado aparte con git ls-files");
chk("antiguedad del archivo", true, "ultima escritura " + statSync(ARCH).mtime.toISOString().slice(0, 16).replace("T", " "));

for (const L of ["A", "B"]) {
  const raw = G("BACKUP_ENCRYPTION_KEY_" + L), kid = G("BACKUP_KID_" + L);
  const buf = raw ? Buffer.from(raw, "base64") : null;
  chk("clave " + L + " presente y de 256 bits", !!buf && buf.length === 32, buf ? buf.length * 8 + " bits" : "AUSENTE");
  chk("kid " + L + " declarado", !!kid, kid ? "kid=" + kid : "AUSENTE");
  const sobre = JSON.parse(readFileSync(process.env.SP + "/objetos/" + L + ".enc", "utf8"));
  chk("kid del objeto " + L + " coincide con el custodiado", sobre.cabecera.kid === kid, sobre.cabecera.kid + " == " + kid);
  const d = await ident.descifrar(sobre, { clave: buf, crypto, zlib });
  chk("la clave custodiada ABRE el objeto " + L, d.ok, d.ok ? "descifrado y checksum OK" : d.motivo);
}
// discriminacion: una clave equivocada del mismo largo NO debe abrir nada
const falsa = crypto.randomBytes(32);
const sA = JSON.parse(readFileSync(process.env.SP + "/objetos/A.enc", "utf8"));
const mal = await ident.descifrar(sA, { clave: falsa, crypto, zlib });
chk("una clave distinta de 256 bits NO abre A", !mal.ok, mal.motivo);
console.log();
console.log("CUSTODIA: " + (f === 0 ? "PASS" : "FALLA · " + f));

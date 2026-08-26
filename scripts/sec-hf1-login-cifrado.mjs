/* SEC-HF1 · GATE «login cifrado 6/6», read-only y sin exponer credenciales.
 *
 * QUÉ PRUEBA, exactamente: que las seis personas de `WORKERS_BASE` tienen una credencial
 * cifrada USABLE por el verificador del login, de modo que retirar el PIN literal del
 * código no las deja fuera.
 *
 * QUÉ NO PRUEBA, y no lo puede probar nadie: que cada persona recuerde su PIN. Eso exigiría
 * conocer el PIN, y este gate está construido justamente para no conocerlo. Decirlo importa:
 * un «6/6 PASS» que se leyera como «las seis pueden entrar» sería una afirmación más fuerte
 * que la evidencia.
 *
 * Comprobaciones por persona:
 *   1. existe credencial en la fuente autorizada (fila `pins`, clave `<nombre>_h`);
 *   2. parsea y tiene la forma del esquema vigente;
 *   3. algoritmo y parámetros son los del código (PBKDF2-HMAC-SHA256, 100.000, sal por usuario);
 *   4. la derivación PBKDF2 con esa sal y esas iteraciones se ejecuta y produce un valor de
 *      la forma correcta, es decir, el verificador puede operar sobre ella;
 *   5. la credencial NO es el PIN en claro guardado, o sea el literal no es lo que autentica.
 *
 * No escribe nada. No imprime PIN, hash, sal, correo ni nombre. Salida agregada.
 *
 *   node scripts/sec-hf1-login-cifrado.mjs
 */
import { readFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const src = readFileSync("src/OsirisModule.jsx", "utf8");
const U = (src.match(/const SUPA_URL\s*=\s*"([^"]+)"/) || [])[1];
const K = (src.match(/const SUPA_KEY\s*=\s*"([^"]+)"/) || [])[1];
if (!U || !K) { console.log("no se pudieron leer las constantes de conexión"); process.exit(2); }

const ITER_ESPERADO = 100000, LARGO_HASH = 64, LARGO_SAL = 32;

const hexToBuf = (hex) => {
  const a = new Uint8Array(hex.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(hex.substr(i * 2, 2), 16);
  return a;
};
async function derivar(pin, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)),
    { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuf(saltHex), iterations: iter, hash: "SHA-256" }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Los seis nombres salen de WORKERS_BASE, no de una lista escrita a mano: una lista a mano
// se desincroniza del código y el gate deja de medir a quien corresponde.
const app = readFileSync("src/App.jsx", "utf8");
const i = app.indexOf("const WORKERS_BASE");
const bloque = app.slice(i, app.indexOf("\n];", i));
const NOMBRES = [...bloque.matchAll(/nombre\s*:\s*"([^"]+)"/g)].map((m) => m[1]);

const leer = async (id) => {
  const r = await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value`,
    { headers: { apikey: K, Authorization: "Bearer " + K } });
  return (await r.json())[0]?.value || null;
};

console.log("== SEC-HF1 · gate de login cifrado ==");
console.log("   read-only · no se imprime ningún PIN, hash, sal, correo ni nombre\n");

const PP = await leer("pins");
const MAIN = await leer("main");
const usuarios = (MAIN && MAIN.usuarios) || [];

let ok = 0;
const fallos = [];
for (let n = 0; n < NOMBRES.length; n++) {
  const nombre = NOMBRES[n];
  const etiqueta = "U-" + String(n + 1).padStart(2, "0");   // enmascarado
  const raw = PP && PP[nombre + "_h"];
  if (!raw) { fallos.push(etiqueta + ": sin credencial cifrada"); continue; }

  let c;
  try { c = JSON.parse(raw); } catch (e) { fallos.push(etiqueta + ": credencial ilegible"); continue; }
  if (!c || typeof c.salt !== "string" || typeof c.hash !== "string") {
    fallos.push(etiqueta + ": forma inválida"); continue;
  }
  if (c.iter !== ITER_ESPERADO) { fallos.push(etiqueta + ": iteraciones " + c.iter); continue; }
  if (c.hash.length !== LARGO_HASH) { fallos.push(etiqueta + ": largo de hash " + c.hash.length); continue; }
  if (c.salt.length !== LARGO_SAL) { fallos.push(etiqueta + ": largo de sal " + c.salt.length); continue; }

  // La derivación se ejecuta de verdad: si la sal o las iteraciones fueran inservibles,
  // el verificador del login fallaría en tiempo de ejecución y esto lo detecta ahora.
  let derivado;
  try { derivado = await derivar("prueba-de-forma", c.salt, c.iter); }
  catch (e) { fallos.push(etiqueta + ": la derivación no se pudo ejecutar"); continue; }
  if (!/^[0-9a-f]{64}$/.test(derivado)) { fallos.push(etiqueta + ": derivación con forma inesperada"); continue; }

  // Y el literal no es lo que autentica: si el PIN en claro guardado verificara contra la
  // credencial, retirarlo del código sería irrelevante y el diagnóstico estaría mal.
  const u = usuarios.find((x) => String(x.nombre || "") === nombre);
  if (u && u.pin !== undefined && String(u.pin) !== "") {
    const h = await derivar(u.pin, c.salt, c.iter);
    if (h === c.hash) { fallos.push(etiqueta + ": el PIN en claro ES la credencial vigente"); continue; }
  }
  ok++;
}

console.log("   personas en WORKERS_BASE          : " + NOMBRES.length);
console.log("   con credencial cifrada usable     : " + ok);
if (fallos.length) { console.log("   fallos:"); for (const f of fallos) console.log("     - " + f); }

const veredicto = ok === NOMBRES.length && NOMBRES.length === 6;
console.log("\n   login cifrado = " + ok + "/" + NOMBRES.length + "  ·  " + (veredicto ? "PASS" : "FAIL"));
console.log("\n   Alcance: prueba que la credencial cifrada existe y es operable por el");
console.log("   verificador. NO prueba que cada persona recuerde su PIN, y nada podría");
console.log("   probarlo sin conocerlo.");
process.exitCode = veredicto ? 0 : 1;

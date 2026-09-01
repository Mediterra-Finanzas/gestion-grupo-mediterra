/* F0-A1 · Login legacy HASH-ONLY: no debe existir NINGÚN fallback plaintext.
 *
 * Invariante de fuente (determinista, sin crypto): las dos rutas de credencial del login legacy
 * (login y verificación de PIN actual en el cambio) deben resolver `credH ? verifyPin(...) : false`,
 * nunca comparar el PIN en claro (w.pin / PP[nombre] / getPinActivo).
 */
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "..", "App.jsx"), "utf8");

describe("F0-A1 · login legacy hash-only", () => {
  test("no queda comparación plaintext del PIN en el login (pinInput===)", () => {
    expect(/pinInput\s*===/.test(APP)).toBe(false);
  });
  test("no queda comparación plaintext del PIN actual en el cambio (pinActual===)", () => {
    expect(/pinActual\s*===/.test(APP)).toBe(false);
  });
  test("getPinActivo fue eliminado (era la fuente de credencial plaintext)", () => {
    expect(/function\s+getPinActivo/.test(APP)).toBe(false);
    expect(/getPinActivo\s*\(/.test(APP)).toBe(false);
  });
  test("no se usa w.pin como credencial (||w.pin)", () => {
    expect(/\|\|\s*w\.pin\b/.test(APP)).toBe(false);
  });
  test("no se usa PP[nombre] como credencial plaintext (PP[w.nombre] sin _h/_temp)", () => {
    // se permiten PP[w.nombre+"_h"] y PP[w.nombre+"_temp"]; NO PP[w.nombre] a secas como credencial
    expect(/PP\[w\.nombre\]\s*\|\|/.test(APP)).toBe(false);
  });
  test("las dos rutas de credencial resuelven a false cuando no hay _h (hash-only)", () => {
    // login
    expect(/credH\s*\?\s*await\s+verifyPin\(pinInput,\s*credH\)\s*:\s*false/.test(APP)).toBe(true);
    // cambio de PIN (verificación del PIN actual)
    expect(/credH\s*\?\s*await\s+verifyPin\(pinActual,\s*credH\)\s*:\s*false/.test(APP)).toBe(true);
  });
});

describe("F0-A1 · primitiva verifyPin (ALLOW/DENY) — si hay WebCrypto en el entorno", () => {
  const hasSubtle = !!(globalThis.crypto && globalThis.crypto.subtle);
  const t = hasSubtle ? test : test.skip;
  t("_h válido + PIN correcto = ALLOW ; PIN incorrecto = DENY", async () => {
    const { hashPin, verifyPin } = require("../../pinHash");
    const cred = JSON.stringify(await hashPin("135790"));
    expect(await verifyPin("135790", cred)).toBe(true);
    expect(await verifyPin("246801", cred)).toBe(false);
  });
});

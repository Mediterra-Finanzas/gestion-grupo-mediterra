// Fase E · tests ADVERSARIALES adicionales de api/legacy-login.js (sin red).
// Archivo NUEVO — no modifica legacy-login.test.mjs. Usa solo la API real makeHandler(deps):
//   deps = { getMainValue, getPinsValue, verifyPin, secretsOk }.
// Cubre: anti-enumeración (misma forma para usuario inexistente vs PIN incorrecto vs desactivado),
// fail-closed si falta la fila pins, rechazo cuando SOLO existe plaintext (sin _h => nunca autentica),
// cero fuga de credenciales en la respuesta, y robustez de parseo (body string, pin numérico,
// email con espacios/mayúsculas, cred como objeto, cred malformada, verifyPin que lanza).
import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "./legacy-login.js";
const { makeHandler } = pkg;

// res falso (idéntico shape al del test base)
function fakeRes() {
  return { code: 0, body: null, status(c){ this.code = c; return this; }, json(o){ this.body = o; return this; } };
}
// verifyPin falso: cred lleva marcador __correct; ok si el pin coincide exactamente.
const verifyPin = (pin, cred) => !!(cred && pin === cred.__correct);

const MAIN = { usuarios: [
  { nombre: "Ana",  email: "ana@x",  rol: "editor", desactivado: false },
  { nombre: "Beto", email: "beto@x", rol: "editor", desactivado: false },  // sin _h
  { nombre: "Ceta", email: "ceta@x", rol: "editor", desactivado: true  },  // desactivado
  { nombre: "Plai", email: "plai@x", rol: "editor", desactivado: false },  // solo plaintext
] };
const PINS = {
  "Ana_h": JSON.stringify({ v:1, iter:100000, salt:"s", hash:"h", __correct:"1357" }),
  // Beto: sin _h
  // Plai: solo plaintext, jamás un _h
  "Plai": "1357",
};

const deps = { getMainValue: async () => MAIN, getPinsValue: async () => PINS, verifyPin, secretsOk: () => true };
const call = (body, d = deps, method = "POST") => {
  const h = makeHandler(d); const res = fakeRes();
  return h({ method, body }, res).then(() => res);
};

// ── Anti-enumeración: misma forma de respuesta para los tres fallos de credencial ──
test("anti-enumeración: usuario inexistente, PIN incorrecto y desactivado dan la MISMA respuesta", async () => {
  const desconocido = await call({ email:"nadie@x", pin:"1357" });
  const pinMalo    = await call({ email:"ana@x",   pin:"9999" });
  const inactivo   = await call({ email:"ceta@x",  pin:"1357" });
  assert.equal(desconocido.code, 200);
  assert.equal(pinMalo.code, 200);
  assert.equal(inactivo.code, 200);
  // Cuerpo byte-idéntico entre los tres → no filtra qué falló.
  assert.deepEqual(desconocido.body, { ok: false });
  assert.deepEqual(pinMalo.body, { ok: false });
  assert.deepEqual(inactivo.body, { ok: false });
  assert.equal(JSON.stringify(desconocido.body), JSON.stringify(pinMalo.body));
  assert.equal(JSON.stringify(pinMalo.body), JSON.stringify(inactivo.body));
});

// ── Hash-only: SOLO plaintext presente (sin _h) NUNCA autentica ──
test("solo plaintext (sin _h) => ok:false aunque el PIN 'coincida' con el plaintext", async () => {
  // Plai tiene pins["Plai"]="1357" pero NO pins["Plai_h"]. El handler solo mira `${nombre}_h`.
  const r = await call({ email:"plai@x", pin:"1357" });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

// ── Fail-closed: la fila pins no existe (null) => DENY, sin crash ──
test("fila pins ausente (null) => ok:false (fail-closed, no lanza)", async () => {
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getPinsValue: async () => null });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

// ── Fail-closed: la fila main no existe (null) => DENY ──
test("fila main ausente (null) => ok:false", async () => {
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getMainValue: async () => null });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

// ── pins como valor no-objeto (defensivo) => DENY ──
test("pins no-objeto (string basura) => ok:false", async () => {
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getPinsValue: async () => "no-soy-objeto" });
  assert.equal(r.body.ok, false);
});

// ── Cero fuga de credenciales, incluso con PIN correcto ──
test("respuesta exitosa expone SOLO {ok, nombre}: nada de _h/_temp/hash/salt/iter/__correct", async () => {
  const r = await call({ email:"ana@x", pin:"1357" });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.nombre, "Ana");
  assert.deepEqual(Object.keys(r.body).sort(), ["nombre", "ok"]);
  const s = JSON.stringify(r.body);
  for (const bad of ["_h","_temp","hash","salt","iter","__correct","1357"]) {
    assert.equal(s.includes(bad), false, `la respuesta filtró "${bad}"`);
  }
});

// ── verifyPin que LANZA => se trata como fallo, DENY (no 500, no fuga) ──
test("verifyPin que lanza => ok:false (catch interno, no propaga)", async () => {
  const verifyThrows = () => { throw new Error("boom"); };
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, verifyPin: verifyThrows });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

// ── cred almacenada como OBJETO (no string JSON) también valida ──
test("cred como objeto (no string) => valida igual", async () => {
  const PINS_OBJ = { "Ana_h": { v:1, iter:100000, salt:"s", hash:"h", __correct:"1357" } };
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getPinsValue: async () => PINS_OBJ });
  assert.equal(r.body.ok, true);
});

// ── cred string malformada (JSON inválido) => DENY sin crash ──
test("cred _h con JSON malformado => ok:false", async () => {
  const PINS_BAD = { "Ana_h": "{ esto no es json" };
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getPinsValue: async () => PINS_BAD });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

// ── Robustez de entrada: body como STRING JSON se parsea ──
test("body string JSON se parsea y valida", async () => {
  const r = await call(JSON.stringify({ email:"ana@x", pin:"1357" }));
  assert.equal(r.body.ok, true);
});

// ── body string no-JSON => DENY (body queda {}) ──
test("body string no-JSON => ok:false", async () => {
  const r = await call("no-es-json");
  assert.equal(r.body.ok, false);
});

// ── email con espacios y mayúsculas se normaliza (trim + lowercase) ──
test("email '  ANA@X  ' normaliza y valida", async () => {
  const r = await call({ email:"  ANA@X  ", pin:"1357" });
  assert.equal(r.body.ok, true);
});

// ── pin numérico se coacciona a string ──
test("pin numérico (1357) => valida", async () => {
  const r = await call({ email:"ana@x", pin:1357 });
  assert.equal(r.body.ok, true);
});

// ── pin=0 (numérico, falsy) con email presente => DENY por credencial, no por 'faltan datos' ──
test("pin numérico 0 => ok:false (no autentica), sin 4xx de formato", async () => {
  const r = await call({ email:"ana@x", pin:0 });
  assert.equal(r.code, 200);
  assert.equal(r.body.ok, false);
});

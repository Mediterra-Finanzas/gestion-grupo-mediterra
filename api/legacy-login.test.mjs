// Fase E · tests de api/legacy-login.js (validación PIN server-side, hash-only, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "./legacy-login.js";
const { makeHandler } = pkg;

// res falso
function fakeRes() {
  return { code: 0, body: null, status(c){ this.code = c; return this; }, json(o){ this.body = o; return this; } };
}
// verifyPin falso: cred lleva marcador __correct; ok si pin coincide
const verifyPin = (pin, cred) => cred && pin === cred.__correct;

const MAIN = { usuarios: [
  { nombre: "Ana",  email: "ana@x",  rol: "editor", desactivado: false },
  { nombre: "Beto", email: "beto@x", rol: "editor", desactivado: false },
  { nombre: "Ceta", email: "ceta@x", rol: "editor", desactivado: true  },  // inactivo
] };
const PINS = {
  "Ana_h": JSON.stringify({ v:1, iter:100000, salt:"s", hash:"h", __correct:"1357" }), // Ana migrada
  // Beto NO tiene _h (hash-only => DENY)
};

const deps = {
  getMainValue: async () => MAIN,
  getPinsValue: async () => PINS,
  verifyPin,
  secretsOk: () => true,
};
const call = (body, d = deps, method = "POST") => {
  const h = makeHandler(d); const res = fakeRes();
  return h({ method, body }, res).then(() => res);
};

test("_h válido + PIN correcto => ok:true", async () => {
  const r = await call({ email:"ana@x", pin:"1357" });
  assert.equal(r.code, 200); assert.equal(r.body.ok, true);
});
test("_h válido + PIN incorrecto => ok:false", async () => {
  const r = await call({ email:"ana@x", pin:"0000" });
  assert.equal(r.code, 200); assert.equal(r.body.ok, false);
});
test("sin _h (hash-only) => ok:false", async () => {
  const r = await call({ email:"beto@x", pin:"whatever" });
  assert.equal(r.body.ok, false);
});
test("email desconocido => ok:false (anti-enumeración)", async () => {
  const r = await call({ email:"nadie@x", pin:"1357" });
  assert.equal(r.body.ok, false);
});
test("usuario desactivado => ok:false", async () => {
  const r = await call({ email:"ceta@x", pin:"1357" });
  assert.equal(r.body.ok, false);
});
test("falta email/pin => ok:false", async () => {
  assert.equal((await call({ email:"ana@x" })).body.ok, false);
  assert.equal((await call({ pin:"1357" })).body.ok, false);
});
test("fail-closed sin secretos => 503", async () => {
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, secretsOk:()=>false });
  assert.equal(r.code, 503);
});
test("método != POST => 405", async () => {
  const r = await call({}, deps, "GET");
  assert.equal(r.code, 405);
});
test("falla de lectura backend => 503 (fail-closed)", async () => {
  const r = await call({ email:"ana@x", pin:"1357" }, { ...deps, getPinsValue: async()=>{ throw new Error("net"); } });
  assert.equal(r.code, 503);
});
test("la respuesta NUNCA contiene credenciales (_h/_temp/pin/hash/salt)", async () => {
  const r = await call({ email:"ana@x", pin:"1357" });
  const s = JSON.stringify(r.body);
  for (const bad of ["_h","_temp","hash","salt","iter","pin","__correct"]) {
    assert.equal(s.includes(bad), false, `la respuesta filtró "${bad}"`);
  }
});

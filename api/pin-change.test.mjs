// Fase E · tests de api/pin-change.js (E-3, cambio/alta de PIN server-side, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-change.js";
const { makeHandler } = pkg;
const { hashPinPBKDF2, verifyPinPBKDF2, crearTempCredServer } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const hoy = new Date().toISOString().slice(0, 10);
const MAIN = { usuarios: [
  { nombre: "Ana", email: "ana@x", rol: "editor", desactivado: false },
  { nombre: "Cy",  email: "cy@x",  rol: "editor", desactivado: false },  // con _temp
  { nombre: "Zoe", email: "zoe@x", rol: "editor", desactivado: true },
] };
function basePins() {
  const c = hashPinPBKDF2("482913"); Object.assign(c, { pol: "6dig", fecha: hoy });
  return {
    "Ana_h": JSON.stringify(c),
    "Cy_temp": crearTempCredServer("246801"),
    "otro_dato": "preservar",   // clave ajena que debe sobrevivir el read-modify-write
  };
}
function mkDeps(pins) {
  const store = { pins: JSON.parse(JSON.stringify(pins)), saved: null };
  return {
    deps: {
      getMainValue: async () => MAIN,
      getPinsValue: async () => store.pins,
      setPinsValue: async (v) => { store.saved = v; store.pins = v; },
      secretsOk: () => true,
    },
    store,
  };
}
const call = (body, d, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("cambio con PIN actual correcto => ok:true, escribe nuevo _h, borra _temp inexistente, preserva ajenas", async () => {
  const { deps, store } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "482913", nuevo: "571902", confirm: "571902" }, deps);
  assert.deepEqual(r.body, { ok: true, nombre: "Ana" });
  assert.equal(verifyPinPBKDF2("571902", JSON.parse(store.saved["Ana_h"])), true);
  assert.equal(JSON.parse(store.saved["Ana_h"]).pol, "6dig");
  assert.equal(store.saved["otro_dato"], "preservar");   // read-modify-write no pierde claves
});
test("cambio con PIN actual incorrecto => {ok:false,error:credencial}, NO escribe", async () => {
  const { deps, store } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "000000", nuevo: "571902", confirm: "571902" }, deps);
  assert.equal(r.body.ok, false); assert.equal(r.body.error, "credencial");
  assert.equal(store.saved, null);
});
test("cambio vía _temp: código correcto fija PIN y elimina _temp", async () => {
  const { deps, store } = mkDeps(basePins());
  const r = await call({ email: "cy@x", actual: "246801", nuevo: "640182", confirm: "640182" }, deps);
  assert.equal(r.body.ok, true);
  assert.equal(store.saved["Cy_temp"], undefined);
  assert.equal(verifyPinPBKDF2("640182", JSON.parse(store.saved["Cy_h"])), true);
});
test("PIN nuevo inválido (secuencia) => error pin_invalido, no escribe", async () => {
  const { deps, store } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "482913", nuevo: "123456", confirm: "123456" }, deps);
  assert.equal(r.body.error, "pin_invalido"); assert.equal(store.saved, null);
});
test("PIN nuevo no coincide con confirm => error no_coincide", async () => {
  const { deps } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "482913", nuevo: "571902", confirm: "999999" }, deps);
  assert.equal(r.body.error, "no_coincide");
});
test("no permite repetir el PIN actual (historial)", async () => {
  const { deps } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "482913", nuevo: "482913", confirm: "482913" }, deps);
  assert.equal(r.body.error, "repetido");
});
test("tel opcional válido se normaliza y guarda", async () => {
  const { deps, store } = mkDeps(basePins());
  await call({ email: "ana@x", actual: "482913", nuevo: "571902", confirm: "571902", tel: "9 1234 5678" }, deps);
  assert.equal(store.saved["Ana_tel"], "56912345678");
});
test("desactivada => credencial deny; usuario desconocido => credencial deny", async () => {
  const { deps } = mkDeps(basePins());
  assert.equal((await call({ email: "zoe@x", actual: "1", nuevo: "571902", confirm: "571902" }, deps)).body.error, "credencial");
  assert.equal((await call({ email: "nadie@x", actual: "1", nuevo: "571902", confirm: "571902" }, deps)).body.error, "credencial");
});
test("fail-closed: sin secretos 503; lectura falla 503; escritura falla 503; método 405", async () => {
  const { deps } = mkDeps(basePins());
  assert.equal((await call({ email: "ana@x", actual: "482913", nuevo: "571902" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ email: "ana@x", actual: "482913", nuevo: "571902" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({ email: "ana@x", actual: "482913", nuevo: "571902", confirm: "571902" }, { ...deps, setPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});
test("la respuesta nunca filtra hash/salt/pin", async () => {
  const { deps } = mkDeps(basePins());
  const r = await call({ email: "ana@x", actual: "482913", nuevo: "571902", confirm: "571902" }, deps);
  const s = JSON.stringify(r.body);
  for (const bad of ["hash", "salt", "iter", "_h", "482913", "571902"]) assert.equal(s.includes(bad), false);
});

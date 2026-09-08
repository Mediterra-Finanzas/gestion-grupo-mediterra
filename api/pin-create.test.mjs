// Fase E · tests de api/pin-create.js (E-6, alta de credencial _h, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-create.js";
const { makeHandler } = pkg;
const { hashPinPBKDF2, verifyPinPBKDF2 } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const hoy = new Date().toISOString().slice(0, 10);
const MAIN = { usuarios: [
  { nombre: "Adm", email: "adm@x", rol: "admin", desactivado: false },
  { nombre: "Ed",  email: "ed@x",  rol: "editor", desactivado: false },
] };
function credCon(pin) { const c = hashPinPBKDF2(pin); Object.assign(c, { pol: "6dig", fecha: hoy }); return JSON.stringify(c); }
function mkDeps() {
  const store = { pins: { "Adm_h": credCon("482913"), "Ed_h": credCon("640182"), "viejo": "preservar" }, saved: null };
  return { deps: { getMainValue: async () => MAIN, getPinsValue: async () => store.pins, setPinsValue: async (v) => { store.saved = v; store.pins = v; }, secretsOk: () => true }, store };
}
const call = (body, d, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("alta single: escribe _h con pol/fecha, verificable, preserva claves ajenas", async () => {
  const { deps, store } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", nombre: "Nuevo", pin: "571902" }, deps);
  assert.deepEqual(r.body, { ok: true, creados: ["Nuevo"], rechazados: [] });
  const cred = JSON.parse(store.saved["Nuevo_h"]);
  assert.equal(verifyPinPBKDF2("571902", cred), true);
  assert.equal(cred.pol, "6dig"); assert.equal(cred.fecha, hoy);
  assert.equal(store.saved["viejo"], "preservar");
});
test("alta batch: crea válidos y reporta rechazados por formato", async () => {
  const { deps, store } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", usuarios: [
    { nombre: "A", pin: "571902" }, { nombre: "B", pin: "123456" }, { nombre: "C", pin: "640182" },
  ] }, deps);
  assert.equal(r.body.ok, true);
  assert.deepEqual(r.body.creados.sort(), ["A", "C"]);
  assert.equal(r.body.rechazados[0].nombre, "B");
  assert.ok(store.saved["A_h"] && store.saved["C_h"] && !store.saved["B_h"]);
});
test("todos rechazados => {ok:false, rechazados}, no escribe", async () => {
  const { deps, store } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", usuarios: [{ nombre: "A", pin: "111111" }] }, deps);
  assert.equal(r.body.ok, false); assert.equal(store.saved, null);
});
test("no-admin / admin PIN incorrecto => {ok:false}, no escribe", async () => {
  const a = mkDeps(); assert.deepEqual((await call({ adminEmail: "ed@x", adminPin: "640182", nombre: "N", pin: "571902" }, a.deps)).body, { ok: false }); assert.equal(a.store.saved, null);
  const b = mkDeps(); assert.deepEqual((await call({ adminEmail: "adm@x", adminPin: "000000", nombre: "N", pin: "571902" }, b.deps)).body, { ok: false }); assert.equal(b.store.saved, null);
});
test("faltan campos => {ok:false}", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913" }, deps)).body.ok, false);
});
test("fail-closed: sin secretos 503; lectura 503; escritura 503; método 405", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", nombre: "N", pin: "571902" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", nombre: "N", pin: "571902" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", nombre: "N", pin: "571902" }, { ...deps, setPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});
test("la respuesta no filtra hash/salt/pin", async () => {
  const { deps } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", nombre: "Nuevo", pin: "571902" }, deps);
  const s = JSON.stringify(r.body);
  for (const bad of ["hash", "salt", "iter", "_h", "482913", "571902"]) assert.equal(s.includes(bad), false);
});

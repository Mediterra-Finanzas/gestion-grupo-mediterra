// Fase E · tests de api/pin-admin-reset.js (E-4, reset por admin, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-admin-reset.js";
const { makeHandler } = pkg;
const { hashPinPBKDF2, estadoTempServer, verificarTempServer, crearTempCredServer } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const hoy = new Date().toISOString().slice(0, 10);
const MAIN = { usuarios: [
  { nombre: "Adm", email: "adm@x", rol: "admin",  desactivado: false },
  { nombre: "Cfo", email: "cfo@x", rol: "editor", esCFO: true, desactivado: false },
  { nombre: "Ed",  email: "ed@x",  rol: "editor", desactivado: false },  // no admin
  { nombre: "Cy",  email: "cy@x",  rol: "editor", desactivado: false },  // objetivo
] };
function credCon(pin) { const c = hashPinPBKDF2(pin); Object.assign(c, { pol: "6dig", fecha: hoy }); return JSON.stringify(c); }
function mkDeps(extra = {}) {
  const store = { pins: { "Adm_h": credCon("482913"), "Cfo_h": credCon("571902"), "Ed_h": credCon("640182"), "Cy_h": credCon("135790"), ...extra }, saved: null };
  return { deps: { getMainValue: async () => MAIN, getPinsValue: async () => store.pins, setPinsValue: async (v) => { store.saved = v; store.pins = v; }, secretsOk: () => true }, store };
}
const call = (body, d, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("admin válido resetea a Cy => ok + código válido + _temp escrito y verificable", async () => {
  const { deps, store } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, deps);
  assert.equal(r.body.ok, true); assert.equal(r.body.nombre, "Cy");
  assert.match(r.body.codigo, /^\d{6}$/);
  const est = estadoTempServer(store.saved["Cy_temp"], Date.now());
  assert.equal(est.vigente, true);
  assert.equal(verificarTempServer(r.body.codigo, est), true);   // el código relevado abre el _temp
});
test("admin por esCFO también puede resetear", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ adminEmail: "cfo@x", adminPin: "571902", targetEmail: "cy@x" }, deps)).body.ok, true);
});
test("no-admin => {ok:false}, NO escribe", async () => {
  const { deps, store } = mkDeps();
  assert.deepEqual((await call({ adminEmail: "ed@x", adminPin: "640182", targetEmail: "cy@x" }, deps)).body, { ok: false });
  assert.equal(store.saved, null);
});
test("admin con PIN incorrecto => {ok:false}", async () => {
  const { deps } = mkDeps();
  assert.deepEqual((await call({ adminEmail: "adm@x", adminPin: "000000", targetEmail: "cy@x" }, deps)).body, { ok: false });
});
test("admin con _temp propio pendiente => {ok:false} (debe fijar su PIN primero)", async () => {
  const { deps } = mkDeps({ "Adm_temp": crearTempCredServer("223344") });
  assert.deepEqual((await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, deps)).body, { ok: false });
});
test("objetivo inexistente => {ok:false}", async () => {
  const { deps } = mkDeps();
  assert.deepEqual((await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "nadie@x" }, deps)).body, { ok: false });
});
test("faltan campos => {ok:false}", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913" }, deps)).body.ok, false);
});
test("fail-closed: sin secretos 503; lectura 503; escritura 503; método 405", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, { ...deps, setPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});
test("la respuesta no filtra hash/salt (solo código en claro al admin)", async () => {
  const { deps } = mkDeps();
  const r = await call({ adminEmail: "adm@x", adminPin: "482913", targetEmail: "cy@x" }, deps);
  const s = JSON.stringify(r.body);
  for (const bad of ["hash", "salt", "iter", "_h", "_temp", "482913"]) assert.equal(s.includes(bad), false);
});

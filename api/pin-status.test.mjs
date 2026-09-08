// Fase E · tests de api/pin-status.js (E-7, estado no sensible para el panel, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-status.js";
const { makeHandler } = pkg;
const { hashPinPBKDF2, crearTempCredServer } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const hoy = new Date().toISOString().slice(0, 10);
const MAIN = { usuarios: [
  { nombre: "Adm", email: "adm@x", rol: "admin", desactivado: false },
  { nombre: "Ed",  email: "ed@x",  rol: "editor", desactivado: false },
  { nombre: "Con", email: "con@x", rol: "editor", desactivado: false },  // con _temp vigente
  { nombre: "Exp", email: "exp@x", rol: "editor", desactivado: false },  // con _temp expirado
  { nombre: "Sin", email: "sin@x", rol: "editor", desactivado: false },  // sin _h
] };
function credCon(pin) { const c = hashPinPBKDF2(pin); Object.assign(c, { pol: "6dig", fecha: hoy }); return JSON.stringify(c); }
const expiradoTemp = (() => { const c = JSON.parse(crearTempCredServer("135790")); c.exp = Date.now() - 1000; return JSON.stringify(c); })();
const PINS = { "Adm_h": credCon("482913"), "Ed_h": credCon("640182"), "Con_h": credCon("111213"), "Con_temp": crearTempCredServer("246801"), "Exp_temp": expiradoTemp, "Ed_tel": "56912345678" };
const deps = { getMainValue: async () => MAIN, getPinsValue: async () => PINS, secretsOk: () => true };
const call = (body, d = deps, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("admin válido => estado por usuario (tieneHash, temp enum, tieneTel), SIN secretos", async () => {
  const r = await call({ adminEmail: "adm@x", adminPin: "482913" });
  assert.equal(r.body.ok, true);
  const by = Object.fromEntries(r.body.usuarios.map((u) => [u.nombre, u]));
  assert.deepEqual(by.Adm, { nombre: "Adm", tieneHash: true, temp: "none", tieneTel: false });
  assert.deepEqual(by.Ed,  { nombre: "Ed",  tieneHash: true, temp: "none", tieneTel: true });
  assert.deepEqual(by.Con, { nombre: "Con", tieneHash: true, temp: "vigente", tieneTel: false });
  assert.deepEqual(by.Exp, { nombre: "Exp", tieneHash: false, temp: "expirado", tieneTel: false });
  assert.deepEqual(by.Sin, { nombre: "Sin", tieneHash: false, temp: "none", tieneTel: false });
  const s = JSON.stringify(r.body);
  for (const bad of ["hash", "salt", "iter", "_h", "_temp", "482913", "246801"]) assert.equal(s.includes(bad), false);
});
test("no-admin / PIN incorrecto => {ok:false}", async () => {
  assert.deepEqual((await call({ adminEmail: "ed@x", adminPin: "640182" })).body, { ok: false });
  assert.deepEqual((await call({ adminEmail: "adm@x", adminPin: "000000" })).body, { ok: false });
});
test("faltan campos => {ok:false}", async () => {
  assert.equal((await call({ adminEmail: "adm@x" })).body.ok, false);
});
test("fail-closed: sin secretos 503; lectura 503; método 405", async () => {
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ adminEmail: "adm@x", adminPin: "482913" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});

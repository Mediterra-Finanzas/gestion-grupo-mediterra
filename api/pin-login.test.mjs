// Fase E · tests de api/pin-login.js (E-2, decisión de login server-side, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-login.js";
const { makeHandler } = pkg;
const { hashPinPBKDF2, crearTempCredServer } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const hoy = new Date().toISOString().slice(0, 10);
const viejo = new Date(Date.now() - 70 * 86400000).toISOString().slice(0, 10);

const MAIN = { usuarios: [
  { nombre: "Ana",  email: "ana@x",  rol: "editor", desactivado: false },  // _h ok, pol 6dig, hoy
  { nombre: "Beto", email: "beto@x", rol: "editor", desactivado: false },  // _h ok, SIN pol -> migrar
  { nombre: "Vic",  email: "vic@x",  rol: "editor", desactivado: false },  // _h ok pero vencido
  { nombre: "Cy",   email: "cy@x",   rol: "editor", desactivado: false },  // _temp vigente
  { nombre: "Dan",  email: "dan@x",  rol: "editor", desactivado: false },  // _temp expirado
  { nombre: "Eve",  email: "eve@x",  rol: "editor", desactivado: false },  // sin _h
  { nombre: "Zoe",  email: "zoe@x",  rol: "editor", desactivado: true  },  // desactivada
] };
function credCon(pin, extra) { const c = hashPinPBKDF2(pin); return JSON.stringify(Object.assign(c, extra)); }
const PINS = {
  "Ana_h":  credCon("482913", { pol: "6dig", fecha: hoy }),
  "Beto_h": credCon("571902", { fecha: hoy }),               // sin pol -> needsMigration
  "Vic_h":  credCon("640182", { pol: "6dig", fecha: viejo }),// vencido -> needsMigration
  "Cy_temp":  crearTempCredServer("246801"),                 // vigente
  "Dan_temp": (() => { const c = JSON.parse(crearTempCredServer("135790")); c.exp = Date.now() - 1000; return JSON.stringify(c); })(),
  "Zoe_h":  credCon("111213", { pol: "6dig", fecha: hoy }),
};
const deps = { getMainValue: async () => MAIN, getPinsValue: async () => PINS, secretsOk: () => true };
const call = (body, d = deps, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("PIN correcto + pol 6dig vigente => ok:true sin flags", async () => {
  const r = await call({ email: "ana@x", pin: "482913" });
  assert.deepEqual(r.body, { ok: true, nombre: "Ana" });
});
test("PIN correcto sin pol => needsMigration", async () => {
  const r = await call({ email: "beto@x", pin: "571902" });
  assert.deepEqual(r.body, { ok: true, nombre: "Beto", needsMigration: true });
});
test("PIN correcto vencido (>60d) => needsMigration", async () => {
  const r = await call({ email: "vic@x", pin: "640182" });
  assert.equal(r.body.ok, true); assert.equal(r.body.needsMigration, true);
});
test("_temp vigente + código correcto => pinTemporal:true", async () => {
  const r = await call({ email: "cy@x", pin: "246801" });
  assert.deepEqual(r.body, { ok: true, nombre: "Cy", pinTemporal: true });
});
test("_temp vigente + PIN viejo/incorrecto => {ok:false} uniforme (no revela _temp)", async () => {
  const r = await call({ email: "cy@x", pin: "000000" });
  assert.deepEqual(r.body, { ok: false });
});
test("_temp expirado + código correcto => pinTemporalVencido", async () => {
  const r = await call({ email: "dan@x", pin: "135790" });
  assert.deepEqual(r.body, { ok: false, pinTemporalVencido: true });
});
test("_temp expirado + código incorrecto => {ok:false} uniforme (no enumera)", async () => {
  const r = await call({ email: "dan@x", pin: "999999" });
  assert.deepEqual(r.body, { ok: false });
});
test("sin _h (hash-only) => ok:false", async () => {
  assert.deepEqual((await call({ email: "eve@x", pin: "482913" })).body, { ok: false });
});
test("email desconocido y desactivada dan {ok:false} (anti-enumeración)", async () => {
  assert.deepEqual((await call({ email: "nadie@x", pin: "482913" })).body, { ok: false });
  assert.deepEqual((await call({ email: "zoe@x", pin: "111213" })).body, { ok: false });
});
test("falta email/pin => ok:false", async () => {
  assert.equal((await call({ email: "ana@x" })).body.ok, false);
  assert.equal((await call({ pin: "482913" })).body.ok, false);
});
test("fail-closed: sin secretos => 503; lectura falla => 503; método!=POST => 405", async () => {
  assert.equal((await call({ email: "ana@x", pin: "482913" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ email: "ana@x", pin: "482913" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});
test("la respuesta nunca contiene credenciales", async () => {
  const r = await call({ email: "ana@x", pin: "482913" });
  const s = JSON.stringify(r.body);
  for (const bad of ["_h", "_temp", "hash", "salt", "iter", "482913"]) assert.equal(s.includes(bad), false);
});
test("body string JSON se parsea; email con espacios/mayúsculas normaliza", async () => {
  assert.equal((await call(JSON.stringify({ email: "  ANA@X ", pin: "482913" }))).body.ok, true);
});

// Fase E · tests de api/pin-reset-self.js (E-5, reset self-service público, crypto local, sin red).
import { test } from "node:test";
import assert from "node:assert/strict";
import server from "./_pinsServer.js";
import pkg from "./pin-reset-self.js";
const { makeHandler } = pkg;
const { estadoTempServer } = server;

function fakeRes() { return { code: 0, body: null, status(c){ this.code=c; return this; }, json(o){ this.body=o; return this; } }; }
const MSG = "Si los datos corresponden a una cuenta, te enviamos un PIN temporal al correo.";
const MAIN = { usuarios: [
  { nombre: "Ana", email: "ana@x.cl", rol: "editor", desactivado: false },  // sin _tel
  { nombre: "Tel", email: "tel@x.cl", rol: "editor", desactivado: false },  // con _tel
  { nombre: "Zoe", email: "zoe@x.cl", rol: "editor", desactivado: true },
] };
function mkDeps(extraPins = {}) {
  const store = { pins: { "Ana_h": "x", "Tel_h": "x", "Tel_tel": "56912345678", ...extraPins }, saved: null, emails: [] };
  return {
    deps: {
      getMainValue: async () => MAIN,
      getPinsValue: async () => store.pins,
      setPinsValue: async (v) => { store.saved = v; store.pins = v; },
      sendEmail: async (m) => { store.emails.push(m); return { success: true }; },
      secretsOk: () => true,
    }, store,
  };
}
const call = (body, d, method = "POST") => { const h = makeHandler(d); const r = fakeRes(); return h({ method, body }, r).then(() => r); };

test("cuenta sin _tel: emite _temp, envía correo, responde neutro (sin código)", async () => {
  const { deps, store } = mkDeps();
  const r = await call({ email: "ana@x.cl" }, deps);
  assert.deepEqual(r.body, { ok: true, message: MSG });
  assert.ok(store.saved["Ana_temp"]);
  assert.equal(store.emails.length, 1);
  assert.equal(store.emails[0].to, "ana@x.cl");
  assert.equal(JSON.stringify(r.body).includes("codigo"), false);   // el código NUNCA se devuelve
});
test("cuenta con _tel: coincide => emite; no coincide => neutro sin escribir", async () => {
  const okd = mkDeps();
  const r1 = await call({ email: "tel@x.cl", tel: "9 1234 5678" }, okd.deps);
  assert.deepEqual(r1.body, { ok: true, message: MSG });
  assert.ok(okd.store.saved["Tel_temp"]);
  const bad = mkDeps();
  const r2 = await call({ email: "tel@x.cl", tel: "9 9999 9999" }, bad.deps);
  assert.deepEqual(r2.body, { ok: true, message: MSG });
  assert.equal(bad.store.saved, null);
  assert.equal(bad.store.emails.length, 0);
});
test("email inexistente / desactivada / formato inválido => neutro idéntico, sin escribir", async () => {
  const a = mkDeps(); assert.deepEqual((await call({ email: "nadie@x" }, a.deps)).body, { ok: true, message: MSG }); assert.equal(a.store.saved, null);
  const b = mkDeps(); assert.deepEqual((await call({ email: "zoe@x.cl" }, b.deps)).body, { ok: true, message: MSG }); assert.equal(b.store.saved, null);
  const c = mkDeps(); assert.deepEqual((await call({ email: "no-es-email" }, c.deps)).body, { ok: true, message: MSG }); assert.equal(c.store.saved, null);
});
test("_temp emitido es vigente", async () => {
  const { deps, store } = mkDeps();
  await call({ email: "ana@x.cl" }, deps);
  assert.equal(estadoTempServer(store.saved["Ana_temp"], Date.now()).vigente, true);
});
test("fallo de envío de correo NO cambia la respuesta neutra (best-effort), _temp queda escrito", async () => {
  const { deps, store } = mkDeps();
  deps.sendEmail = async () => { throw new Error("smtp"); };
  const r = await call({ email: "ana@x.cl" }, deps);
  assert.deepEqual(r.body, { ok: true, message: MSG });
  assert.ok(store.saved["Ana_temp"]);
});
test("fail-closed: sin secretos 503; lectura 503; escritura 503; método 405", async () => {
  const { deps } = mkDeps();
  assert.equal((await call({ email: "ana@x.cl" }, { ...deps, secretsOk: () => false })).code, 503);
  assert.equal((await call({ email: "ana@x.cl" }, { ...deps, getPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({ email: "ana@x.cl" }, { ...deps, setPinsValue: async () => { throw new Error("net"); } })).code, 503);
  assert.equal((await call({}, deps, "GET")).code, 405);
});

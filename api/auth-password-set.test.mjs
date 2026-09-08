// Tests de api/auth-password-set.js (AUTH_NATIVE admin bootstrap). node --test. Sin red (deps mock).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const mod = require("./auth-password-set.js");
const { makeHandler, genTempPassword } = mod;

const cred = { v: 1, iter: 1, salt: "aa", hash: "bb" }; // el verifyPin lo mockeamos
const mainVal = { usuarios: [
  { nombre: "Ana", email: "ana@x.cl", rol: "admin" },
  { nombre: "Beto", email: "beto@x.cl", rol: "user" },
  { nombre: "Cata", email: "cata@x.cl", rol: "user", desactivado: true },
] };
const pinsVal = { "Ana_h": JSON.stringify(cred) };

function mkRes() {
  return { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
function baseDeps(over = {}) {
  return {
    getMainValue: async () => mainVal,
    getPinsValue: async () => pinsVal,
    ensureAuthUser: async () => ({ id: "au-target" }),
    setAuthPassword: async () => true,
    verifyPin: (pin) => pin === "ADMINOK",
    secretsOk: () => true,
    adminEnabled: () => true,
    genPwd: () => "TEMP-PWD-123",
    ...over,
  };
}
async function call(deps, body, method = "POST") {
  const res = mkRes();
  await makeHandler(deps)({ method, body }, res);
  return res;
}

test("405 si no es POST", async () => {
  const res = await call(baseDeps(), {}, "GET");
  assert.equal(res.code, 405);
});

test("503 fail-closed sin secretos", async () => {
  const res = await call(baseDeps({ secretsOk: () => false }), { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "beto@x.cl" });
  assert.equal(res.code, 503);
});

test("403 si el flag admin está apagado (gate de prod)", async () => {
  const res = await call(baseDeps({ adminEnabled: () => false }), { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "beto@x.cl" });
  assert.equal(res.code, 403);
});

test("éxito: admin válido setea temp password del target y lo devuelve SOLO al admin", async () => {
  let setId = null, setPwd = null;
  const res = await call(baseDeps({ setAuthPassword: async (id, p) => { setId = id; setPwd = p; return true; } }),
    { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "beto@x.cl" });
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.tempPassword, "TEMP-PWD-123");
  assert.equal(setId, "au-target");
  assert.equal(setPwd, "TEMP-PWD-123");
});

test("DENY neutro si el admin no es admin", async () => {
  const res = await call(baseDeps(), { adminEmail: "beto@x.cl", adminPin: "ADMINOK", targetEmail: "ana@x.cl" });
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, false);
});

test("DENY neutro si el PIN de admin es incorrecto", async () => {
  const res = await call(baseDeps(), { adminEmail: "ana@x.cl", adminPin: "MALO", targetEmail: "beto@x.cl" });
  assert.equal(res.body.ok, false);
});

test("DENY si el target está desactivado", async () => {
  const res = await call(baseDeps(), { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "cata@x.cl" });
  assert.equal(res.body.ok, false);
});

test("DENY si el admin no tiene _h (hash-only)", async () => {
  const res = await call(baseDeps({ getPinsValue: async () => ({}) }), { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "beto@x.cl" });
  assert.equal(res.body.ok, false);
});

test("nunca devuelve el _h ni el PIN del admin", async () => {
  const res = await call(baseDeps(), { adminEmail: "ana@x.cl", adminPin: "ADMINOK", targetEmail: "beto@x.cl" });
  const s = JSON.stringify(res.body);
  assert.ok(!s.includes("ADMINOK") && !s.includes("\"hash\"") && !s.includes("salt"));
});

test("genTempPassword produce clave fuerte (>=16 chars, no PIN)", () => {
  const p = genTempPassword();
  assert.ok(p.length >= 16);
  assert.ok(!/^\d{6}$/.test(p));
});

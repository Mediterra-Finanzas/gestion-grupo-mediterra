// Tests de api/auth-recover.js (AUTH_NATIVE). node --test. Sin red (trigger mockeado).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { makeHandler } = require("./auth-recover.js");

function mkRes() {
  return { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
}
async function call(deps, body, method = "POST") {
  const res = mkRes();
  await makeHandler(deps)({ method, body }, res);
  return res;
}

test("405 si no es POST", async () => {
  const res = await call({ trigger: async () => {} }, {}, "GET");
  assert.equal(res.code, 405);
});

test("email válido → dispara trigger y responde neutro 200 ok", async () => {
  let called = null;
  const res = await call({ trigger: async (e) => { called = e; }, validEmail: () => true }, { email: "ana@x.cl" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(called, "ana@x.cl");
});

test("email inexistente/GoTrue falla → IGUAL neutro (anti-enumeración)", async () => {
  const res = await call({ trigger: async () => { throw new Error("boom"); }, validEmail: () => true }, { email: "nadie@x.cl" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true });
});

test("email inválido → neutro y NO pega a GoTrue", async () => {
  let called = false;
  const res = await call({ trigger: async () => { called = true; }, validEmail: () => false }, { email: "no-es-email" });
  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(called, false);
});

test("sin email → neutro, sin trigger", async () => {
  let called = false;
  const res = await call({ trigger: async () => { called = true; } }, {});
  assert.deepEqual(res.body, { ok: true });
  assert.equal(called, false);
});

test("body string se parsea", async () => {
  let called = null;
  const res = await call({ trigger: async (e) => { called = e; }, validEmail: () => true }, JSON.stringify({ email: "X@Y.CL" }));
  assert.equal(called, "x@y.cl"); // normalizado
  assert.deepEqual(res.body, { ok: true });
});

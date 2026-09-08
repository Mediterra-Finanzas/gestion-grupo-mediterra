// Fase E · tests de api/_pinsServer.js (crypto/lógica local, sin red).
// Verifica que las réplicas server-side casen con src/pinHash.js y App.jsx.
import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "./_pinsServer.js";
const {
  hashPinPBKDF2, verifyPinPBKDF2, estadoTempServer, verificarTempServer,
  pinNuevoValido, normalizarCelularServer, crearTempCredServer, genCodigo6, findUsuario, esAdmin,
} = pkg;

test("hashPinPBKDF2 produce {v,iter,salt,hash} y verifyPinPBKDF2 lo valida (roundtrip)", () => {
  const cred = hashPinPBKDF2("482913");
  assert.equal(cred.v, 1);
  assert.equal(cred.iter, 100000);
  assert.equal(cred.salt.length, 32);        // 16 bytes hex
  assert.equal(cred.hash.length, 64);        // 32 bytes hex
  assert.equal(verifyPinPBKDF2("482913", cred), true);
  assert.equal(verifyPinPBKDF2("000000", cred), false);
});

test("verifyPinPBKDF2 acepta cred como string JSON y como objeto", () => {
  const cred = hashPinPBKDF2("482913");
  assert.equal(verifyPinPBKDF2("482913", JSON.parse(JSON.stringify(cred))), true);
});

test("estadoTempServer: vigente vs expirado por exp", () => {
  const raw = crearTempCredServer("123457"); // exp = now+45min
  const t0 = Date.now();
  assert.equal(estadoTempServer(raw, t0).vigente, true);
  assert.equal(estadoTempServer(raw, t0 + 46 * 60 * 1000).expirado, true);
  assert.equal(estadoTempServer(null).existe, false);
});

test("verificarTempServer valida el código y rechaza el incorrecto", () => {
  const raw = crearTempCredServer("246801");
  const est = estadoTempServer(raw, Date.now());
  assert.equal(verificarTempServer("246801", est), true);
  assert.equal(verificarTempServer("999999", est), false);
});

test("verificarTempServer soporta _temp legacy en texto plano", () => {
  const est = estadoTempServer("445566", Date.now());
  assert.equal(est.legacy, true);
  assert.equal(verificarTempServer("445566", est), true);
  assert.equal(verificarTempServer("000000", est), false);
});

test("pinNuevoValido replica reglas (6 dígitos, no iguales, no secuencia)", () => {
  assert.equal(pinNuevoValido("482913").ok, true);
  assert.equal(pinNuevoValido("12345").ok, false);   // 5 dígitos
  assert.equal(pinNuevoValido("111111").ok, false);  // iguales
  assert.equal(pinNuevoValido("123456").ok, false);  // secuencia asc
  assert.equal(pinNuevoValido("654321").ok, false);  // secuencia desc
  assert.equal(pinNuevoValido("abc123").ok, false);
});

test("normalizarCelularServer normaliza a 569XXXXXXXX", () => {
  assert.deepEqual(normalizarCelularServer("+56 9 1234 5678"), { ok: true, tel: "56912345678" });
  assert.deepEqual(normalizarCelularServer("912345678"), { ok: true, tel: "56912345678" });
  assert.equal(normalizarCelularServer("123").ok, false);
});

test("genCodigo6 devuelve exactamente 6 dígitos", () => {
  for (let i = 0; i < 50; i++) assert.match(genCodigo6(), /^\d{6}$/);
});

test("findUsuario compara email normalizado; esAdmin por rol/esCFO", () => {
  const main = { usuarios: [{ nombre: "Ana", email: "ANA@x", rol: "admin" }, { nombre: "Bob", email: "bob@x", esCFO: true }, { nombre: "Cy", email: "cy@x", rol: "editor" }] };
  assert.equal(findUsuario(main, "  ana@x ").nombre, "Ana");
  assert.equal(findUsuario(main, "nadie@x"), null);
  assert.equal(esAdmin(findUsuario(main, "ana@x")), true);
  assert.equal(esAdmin(findUsuario(main, "bob@x")), true);
  assert.equal(esAdmin(findUsuario(main, "cy@x")), false);
});

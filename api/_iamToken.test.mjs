/* eslint-disable */
// Tests del minter/verificador JWT PROC + verify PIN. Ejecutar: node api/_iamToken.test.mjs
import iam from "./_iamToken.js";
import crypto from "crypto";
const { mintProcToken, verifyProcToken, verifyPinPBKDF2 } = iam;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

const SECRET = "super-secret-jwt-proyecto-local";
const OTRO   = "otro-secret-distinto-produccion";
const SUB = "aaaaaaaa-1111-2222-3333-444444444444";
const ALS = "5aa10886-2a76-4a9e-9bc3-303fb776cd49";
const NOW = 1_700_000_000;

// roundtrip válido
{
  const t = mintProcToken({ secret: SECRET, sub: SUB, empresaId: ALS, ttlSec: 1200, now: NOW });
  const p = verifyProcToken(t, SECRET, NOW + 10);
  ok(p && p.role === "authenticated", "AUTH: token válido → role authenticated");
  ok(p && p.sub === SUB, "AUTH-17/25: sub = uuid estable (no email)");
  ok(p && p.empresa_id === ALS, "AUTH: empresa_id presente en claims");
  ok(p && p.aud === "authenticated", "AUTH: aud authenticated");
}
// AUTH-22: token firmado con secret staging NO lo acepta prod (otro secret) y viceversa
{
  const t = mintProcToken({ secret: SECRET, sub: SUB, empresaId: ALS, now: NOW });
  ok(verifyProcToken(t, OTRO, NOW + 10) === null, "AUTH-22: secret distinto (staging≠prod) → rechazo");
}
// AUTH-05: empresa_id manipulado en el payload invalida la firma
{
  const t = mintProcToken({ secret: SECRET, sub: SUB, empresaId: ALS, now: NOW });
  const [h, p, s] = t.split(".");
  const payload = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  payload.empresa_id = "11111111-1111-1111-1111-111111111111"; // otro tenant
  const pForged = Buffer.from(JSON.stringify(payload)).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
  const forged = `${h}.${pForged}.${s}`;
  ok(verifyProcToken(forged, SECRET, NOW + 10) === null, "AUTH-05: empresa_id manipulado → firma inválida → rechazo");
}
// AUTH-11: token expirado → rechazo
{
  const t = mintProcToken({ secret: SECRET, sub: SUB, empresaId: ALS, ttlSec: 60, now: NOW });
  ok(verifyProcToken(t, SECRET, NOW + 61) === null, "AUTH-11: token expirado → rechazo");
  ok(verifyProcToken(t, SECRET, NOW + 59) !== null, "AUTH-11b: dentro de exp → válido");
}
// mint sin sub/empresa → error (no se emite identidad incompleta)
{
  let err = false; try { mintProcToken({ secret: SECRET, sub: SUB }); } catch { err = true; }
  ok(err, "AUTH-07: mint sin empresa_id lanza (no emite token sin tenant)");
}
// verifyPinPBKDF2 contra credencial real generada como pinHash.js
{
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync("482913", salt, 100000, 32, "sha256").toString("hex");
  const cred = { v: 1, iter: 100000, salt: salt.toString("hex"), hash };
  ok(verifyPinPBKDF2("482913", cred) === true, "PIN correcto → true");
  ok(verifyPinPBKDF2("000000", cred) === false, "PIN incorrecto → false");
  ok(verifyPinPBKDF2("482913", null) === false, "sin credencial → false");
}

console.log(`\nIAM token tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");

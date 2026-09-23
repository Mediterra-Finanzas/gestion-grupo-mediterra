/* eslint-disable */
// Tests de _friskuSpAuth (S4.1). Datos ficticios. Ejecutar: node api/_friskuSpAuth.test.mjs
import crypto from "node:crypto";
import A from "./_friskuSpAuth.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esp ${JSON.stringify(b)}, obt ${JSON.stringify(a)})`);

const SECRET = "test-secret-frisku-sp-s4-1";
function mkCred(pin, { pol = "6dig", iter = 1000 } = {}) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, iter, 32, "sha256").toString("hex");
  return JSON.stringify({ v: 1, iter, salt: salt.toString("hex"), hash, pol });
}

const PIN = "246810";
const usuarios = [
  { nombre: "Trabajador Uno", email: "uno@ejemplo.test", rol: "editor", modulos: ["tareas", "frisku"] },
  { nombre: "Trabajador Dos", email: "dos@ejemplo.test", rol: "editor", modulos: ["tareas"] },
  { nombre: "Admin Ej", email: "admin@ejemplo.test", rol: "admin", modulos: [] },
  { nombre: "Inactivo", email: "off@ejemplo.test", rol: "editor", modulos: ["frisku"], desactivado: true },
];
const pins = {
  "Trabajador Uno_h": mkCred(PIN),
  "Trabajador Dos_h": mkCred(PIN),
  "Admin Ej_h": mkCred(PIN),
  "Inactivo_h": mkCred(PIN),
  "Legacy_h": mkCred(PIN, { pol: "4dig" }),
};

// verificarPin round-trip
ok(A.verificarPin(PIN, mkCred(PIN)), "verificarPin: correcto → true");
ok(!A.verificarPin("000000", mkCred(PIN)), "verificarPin: incorrecto → false");
ok(!A.verificarPin(PIN, "no-json"), "verificarPin: cred basura → false");

// capability
ok(A.tieneCapabilidadFrisku(usuarios[0]), "cap: modulos incluye frisku");
ok(!A.tieneCapabilidadFrisku(usuarios[1]), "cap: sin frisku");
ok(A.tieneCapabilidadFrisku(usuarios[2]), "cap: admin → sí");
ok(!A.tieneCapabilidadFrisku(usuarios[3]), "cap: desactivado → no");

// evaluarAcceso
const rOk = A.evaluarAcceso({ usuarios, pins, email: "UNO@ejemplo.test", pin: PIN, secret: SECRET });
ok(rOk.ok && rOk.sub, "acceso: uno + PIN correcto → ok con sub");
eq(A.evaluarAcceso({ usuarios, pins, email: "uno@ejemplo.test", pin: "000000", secret: SECRET }).motivo, "credenciales", "acceso: PIN malo → credenciales");
eq(A.evaluarAcceso({ usuarios, pins, email: "noexiste@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "credenciales", "acceso: email inexistente → credenciales (no enumera)");
eq(A.evaluarAcceso({ usuarios, pins, email: "dos@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "sin_capability", "acceso: sin frisku + PIN correcto → sin_capability");
eq(A.evaluarAcceso({ usuarios, pins, email: "off@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "credenciales", "acceso: desactivado → credenciales");
ok(A.evaluarAcceso({ usuarios, pins, email: "admin@ejemplo.test", pin: PIN, secret: SECRET }).ok, "acceso: admin → ok");

// política 6dig: un usuario cuyo cred sea legacy 4dig NO pasa (evita bypass del login retirado)
const usuariosLegacy = [{ nombre: "Legacy", email: "leg@ejemplo.test", rol: "editor", modulos: ["frisku"] }];
eq(A.evaluarAcceso({ usuarios: usuariosLegacy, pins, email: "leg@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "credenciales", "acceso: cred pol!=6dig → credenciales (sin bypass)");

// sub opaco: no expone el nombre
ok(!rOk.sub.includes("Trabajador"), "sub opaco no contiene el nombre");

// duplicados de email o de nombre → fallo CERRADO (nunca elegir el primero)
const dupEmail = [usuarios[0], { ...usuarios[0] }];
eq(A.evaluarAcceso({ usuarios: dupEmail, pins, email: "uno@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "credenciales", "email duplicado → credenciales");
const dupNombre = [{ nombre: "Trabajador Uno", email: "a@ejemplo.test", rol: "editor", modulos: ["frisku"] }, { nombre: "Trabajador Uno", email: "b@ejemplo.test", rol: "editor", modulos: ["frisku"] }];
eq(A.evaluarAcceso({ usuarios: dupNombre, pins, email: "a@ejemplo.test", pin: PIN, secret: SECRET }).motivo, "credenciales", "nombre duplicado → credenciales");
// pin no-string → credenciales (nunca convertido a número)
eq(A.evaluarAcceso({ usuarios, pins, email: "uno@ejemplo.test", pin: 246810, secret: SECRET }).motivo, "credenciales", "pin no-string → credenciales");

// cookie duplicada/ambigua → leerCookieSp devuelve null (sin sesión)
ok(A.leerCookieSp({ headers: { cookie: "frisku_sp_sess=a; frisku_sp_sess=b" } }) === null, "cookie duplicada → null");
ok(A.leerCookieSp({ headers: { cookie: "frisku_sp_sess=solo" } }) === "solo", "cookie única → valor");

// sesión HMAC
const now = 1_000_000_000_000;
const tok = A.firmarSesionSp(rOk.sub, SECRET, now);
const p = A.verificarSesionSp(tok, SECRET, now + 1000);
ok(p && p.cap === "frisku-sp:read" && p.sub === rOk.sub, "sesión: firma/verifica round-trip con cap");
ok(!A.verificarSesionSp(tok, SECRET, now + 31 * 60 * 1000), "sesión: expirada → null");
ok(!A.verificarSesionSp(tok, "otro-secreto", now + 1000), "sesión: secreto distinto → null");
ok(!A.verificarSesionSp(tok + "x", SECRET, now + 1000), "sesión: firma alterada → null");
ok(!A.verificarSesionSp("payloadfalso.firmafalsa", SECRET, now + 1000), "sesión: token forjado por frontend → null");
// token con payload manipulado (cambia sub) sin re-firmar → null
const [b, f] = tok.split(".");
const bodyMal = Buffer.from(JSON.stringify({ sub: "otro", cap: "frisku-sp:read", v: 1, iat: now, exp: now + 9e9 })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
ok(!A.verificarSesionSp(bodyMal + "." + f, SECRET, now + 1000), "sesión: payload cambiado con firma vieja → null");

// cookie exclusiva
const ck = A.cookieSesionSp(tok);
ok(ck.includes("frisku_sp_sess="), "cookie: nombre exclusivo");
ok(/HttpOnly/.test(ck) && /Secure/.test(ck) && /SameSite=Strict/.test(ck), "cookie: HttpOnly+Secure+SameSite=Strict");
ok(ck.includes("Path=/api/frisku-sp"), "cookie: Path limitado al endpoint Frisku");
ok(A.cookieBorrarSp().includes("Max-Age=0"), "cookie borrar: Max-Age=0");

// escaneo: ni el token ni la cookie exponen PIN/hash/email
ok(!tok.includes(PIN) && !ck.includes("ejemplo.test"), "sesión/cookie: sin PIN ni email");

console.log(`\n_friskuSpAuth: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

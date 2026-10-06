/* eslint-disable */
// Tests de api/_reglasLogin.js (reglas de login en el servidor). Datos ficticios.
// Ejecutar: node api/_reglasLogin.test.mjs
import crypto from "node:crypto";
import R from "./_reglasLogin.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? "" : ` (esp ${JSON.stringify(b)}, obt ${JSON.stringify(a)})`}`);

const AHORA = Date.parse("2026-10-06T12:00:00Z");
const DIA = 86400000;
function cred(pin, extra = {}, iter = 1000) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(pin), salt, iter, 32, "sha256").toString("hex");
  return JSON.stringify({ v: 1, iter, salt: salt.toString("hex"), hash, ...extra });
}
const hoyISO = new Date(AHORA).toISOString().slice(0, 10);
const haceDias = (d) => new Date(AHORA - d * DIA).toISOString().slice(0, 10);

const U = [
  { nombre: "Ana", email: "ana@prueba.test", rol: "admin" },
  { nombre: "Beto", email: "beto@prueba.test", rol: "editor" },
  { nombre: "Caro", email: "caro@prueba.test", rol: "editor", desactivado: true },
];
const login = (pins, email, pin) => R.evaluarLogin({ usuarios: U, pins, email, pin, ahora: AHORA });

console.log("Los 5 casos del commit 8d7116f (decisión de migración con sello):");
{ // 1. _temp vigente → solo el código entra y obliga a cambiar
  const pins = { Ana_h: cred("482916", { pol: "6dig", fecha: hoyISO }), Ana_temp: JSON.parse(R.crearTempCred("731904", AHORA)) };
  pins.Ana_temp = JSON.stringify(pins.Ana_temp);
  const r = login(pins, "ana@prueba.test", "731904");
  eq([r.ok, r.debeCambiarPin, r.motivo], [true, true, "temp"], "1. _temp vigente + código correcto → debe cambiar (temp)");
  const r2 = login(pins, "ana@prueba.test", "482916");
  eq([r2.ok, r2.error, r2.detalle], [false, "credenciales", "pin_con_temp"], "1b. _temp vigente: el PIN antiguo NO entra");
}
{ // 2. sin _h → sin respaldo a texto plano en el servidor
  const pins = { Beto: "1234" };
  const r = R.evaluarLogin({ usuarios: [{ ...U[1], pin: "1234" }], pins, email: "beto@prueba.test", pin: "1234", ahora: AHORA });
  eq([r.ok, r.error, r.detalle], [false, "credenciales", "sin_h"], "2. sin _h → credenciales (sin PIN plano; debe usar recuperar)");
  eq(R.decidirMigracion(undefined, AHORA), { debe: true, motivo: "politica" }, "2b. regla pura: sin _h → debe migrar");
}
{ // 3. _h sin sello pol
  const pins = { Beto_h: cred("4821", { fecha: hoyISO }) };
  const r = login(pins, "beto@prueba.test", "4821");
  eq([r.ok, r.debeCambiarPin, r.motivo], [true, true, "politica"], "3. _h sin pol:6dig (PIN de 4 dígitos) → debe cambiar (politica)");
}
{ // 4. vencido > 60 días
  const pins = { Beto_h: cred("482916", { pol: "6dig", fecha: haceDias(61) }) };
  const r = login(pins, "beto@prueba.test", "482916");
  eq([r.ok, r.debeCambiarPin, r.motivo], [true, true, "vencido"], "4. pol:6dig con fecha de hace 61 días → debe cambiar (vencido)");
  const pins60 = { Beto_h: cred("482916", { pol: "6dig", fecha: haceDias(59) }) };
  eq(login(pins60, "beto@prueba.test", "482916").debeCambiarPin, false, "4b. 59 días → no vence");
}
{ // 5. OK
  const pins = { Beto_h: cred("482916", { pol: "6dig", fecha: hoyISO }) };
  const r = login(pins, "beto@prueba.test", "  482916 ");
  eq([r.ok, r.debeCambiarPin, r.usuario && r.usuario.nombre], [true, false, "Beto"], "5. pol:6dig vigente + PIN correcto → sesión completa");
  eq(login(pins, "BETO@Prueba.test", "482917").error, "credenciales", "5b. PIN incorrecto → credenciales");
}

console.log("Otros casos:");
{
  const pins = { Ana_h: cred("482916", { pol: "6dig", fecha: hoyISO }), Ana_temp: R.crearTempCred("731904", AHORA - 46 * 60000) };
  const r = login(pins, "ana@prueba.test", "731904");
  eq([r.ok, r.detalle], [false, "temp_vencido"], "temp expirado → rechazo (aunque el código sea correcto)");
  eq(login(pins, "ana@prueba.test", "482916").ok, false, "temp expirado → el PIN antiguo TAMPOCO entra");
}
{
  const pins = { Caro_h: cred("482916", { pol: "6dig", fecha: hoyISO }) };
  eq(login(pins, "caro@prueba.test", "482916").error, "desactivado", "cuenta desactivada → desactivado");
  eq(login(pins, "caro@prueba.test", "000000").error, "desactivado", "desactivado se informa antes del PIN (igual que el cliente)");
}
{
  const pins = { Beto_h: cred("482916", { pol: "6dig", fecha: hoyISO }), Beto_temp: "550231" };
  const r = login(pins, "beto@prueba.test", "550231");
  eq([r.ok, r.debeCambiarPin, r.motivo], [true, true, "temp"], "código temp legacy en texto plano → entra pero DEBE cambiar");
  eq(login(pins, "beto@prueba.test", "482916").ok, false, "temp legacy presente → el PIN antiguo no entra");
}
eq(login({}, "nadie@prueba.test", "482916").error, "credenciales", "email inexistente → credenciales (genérico)");
eq(R.evaluarLogin({ usuarios: [U[1], { ...U[1], nombre: "Beto2" }], pins: {}, email: "beto@prueba.test", pin: "1", ahora: AHORA }).detalle, "sin_usuario", "email duplicado en el padrón → fallo cerrado");

console.log("Cambio de PIN:");
{
  const actual = cred("482916", { pol: "6dig", fecha: haceDias(10) });
  const viejo1 = JSON.parse(cred("579135")), viejo2 = JSON.parse(cred("680246"));
  const pins = { Beto_h: actual, Beto_hist: JSON.stringify([viejo1, viejo2]), Beto: "1234" };
  const u = U[1];
  const c = (o) => R.evaluarCambioPin({ usuario: u, pins, ahora: AHORA, sesion: { scope: "completa" }, ...o });
  eq(c({ pinActual: "482916", pinNuevo: "482916" }).error, "pin_repetido", "repetir el PIN actual → pin_repetido");
  eq(c({ pinActual: "482916", pinNuevo: "579135" }).error, "pin_repetido", "repetir un PIN del historial → pin_repetido");
  eq(c({ pinActual: "482916", pinNuevo: "123456" }).error, "pin_invalido", "secuencia → pin_invalido");
  eq(c({ pinActual: "482916", pinNuevo: "4829" }).error, "pin_invalido", "4 dígitos → pin_invalido");
  eq(c({ pinActual: "000000", pinNuevo: "791357" }).status, 401, "PIN actual incorrecto → 401");
  eq(c({ pinNuevo: "791357" }).status, 401, "sesión completa sin PIN actual → 401");
  const r = c({ pinActual: "482916", pinNuevo: "791357", tel: "9 1234 5678" });
  ok(r.ok, "cambio correcto");
  const h = JSON.parse(r.nuevosPins.Beto_h);
  eq([h.pol, h.fecha, h.iter], ["6dig", hoyISO, 100000], "nuevo _h sellado pol:6dig con fecha de hoy");
  eq(JSON.parse(r.nuevosPins.Beto_hist).length, 3, "historial = últimas 3 (actual + 2)");
  eq([r.nuevosPins.Beto, r.nuevosPins.Beto_tel], [undefined, "56912345678"], "se borra el PIN plano residual y se guarda el celular");
  eq(R.evaluarLogin({ usuarios: U, pins: r.nuevosPins, email: "beto@prueba.test", pin: "791357", ahora: AHORA }).debeCambiarPin, false, "con el PIN nuevo entra sin cambio forzado");
}
{
  const pins = { Ana_h: cred("482916", { fecha: hoyISO }), Ana_temp: R.crearTempCred("731904", AHORA) };
  const fp = R.huellaCredencial(pins, "Ana");
  const c = (o) => R.evaluarCambioPin({ usuario: U[0], pins, ahora: AHORA, ...o });
  ok(c({ pinNuevo: "791357", sesion: { scope: "cambio_pin", fp } }).ok, "cookie cambio_pin con huella vigente: no exige PIN actual");
  eq(c({ pinNuevo: "791357", sesion: { scope: "cambio_pin", fp: "otra" } }).status, 401, "huella distinta (credencial cambió) → 401");
  eq(c({ pinActual: "482916", pinNuevo: "791357", sesion: { scope: "completa" } }).status, 401, "con _temp vigente el PIN antiguo no sirve para cambiar");
  const r = c({ pinActual: "731904", pinNuevo: "791357", sesion: { scope: "completa" } });
  ok(r.ok && r.nuevosPins.Ana_temp === undefined, "con el código provisorio se cambia y el _temp se elimina");
  const vencido = { ...pins, Ana_temp: R.crearTempCred("731904", AHORA - 50 * 60000) };
  eq(R.evaluarCambioPin({ usuario: U[0], pins: vencido, ahora: AHORA, pinNuevo: "791357", sesion: { scope: "cambio_pin", fp: R.huellaCredencial(vencido, "Ana") } }).status, 401, "temp vencido → no se puede cambiar ni con cookie");
}

console.log("Recuperación, padrón y main:");
{
  const pins = { Beto_tel: "56912345678" };
  eq(R.evaluarRecuperacion({ usuarios: U, pins, email: "beto@prueba.test", tel: "" }).emitir, false, "con celular registrado y sin celular → no se emite");
  eq(R.evaluarRecuperacion({ usuarios: U, pins, email: "beto@prueba.test", tel: "+56 9 1234 5678" }).emitir, true, "celular coincide → se emite");
  eq(R.evaluarRecuperacion({ usuarios: U, pins: {}, email: "caro@prueba.test" }).emitir, false, "desactivado → no se emite");
  const t = R.estadoTemp(R.crearTempCred("123987", AHORA), AHORA + 44 * 60000);
  ok(t.vigente && R.verificarTemp("123987", t) && !R.verificarTemp("123988", t), "código provisorio hasheado verifica y vence a los 45 min");
  ok(R.estadoTemp(R.crearTempCred("123987", AHORA), AHORA + 46 * 60000).expirado, "a los 46 min está vencido");
  ok(/^\d{6}$/.test(R.generarCodigo6()), "código de 6 dígitos");
}
{
  eq(R.validarUsuariosEntrantes([{ nombre: "Ana", email: "a@x", pin: "1234" }]), "campos_credenciales", "PUT con pin → rechazado");
  eq(R.validarUsuariosEntrantes([{ nombre: "Ana", email: "a@x", Ana_h: "{}" }]), "campos_credenciales", "PUT con _h → rechazado");
  eq(R.validarUsuariosEntrantes([{ nombre: "Ana", email: "a@x", pinsPersonalizados: {} }]), "campos_credenciales", "PUT con pinsPersonalizados → rechazado");
  eq(R.validarUsuariosEntrantes([{ nombre: "Ana", email: "a@x", pin: "" }]), null, "pin vacío (alta) → aceptado e ignorado");
  eq(R.validarUsuariosEntrantes([{ nombre: "Ana", email: "a@x" }, { nombre: "B", email: "A@x" }]), "duplicado", "email duplicado → rechazado");
  const f = R.fusionarUsuarios([{ nombre: "Ana", email: "a@x", pin: "9999", rol: "admin", extra: 1 }], [{ nombre: "Ana", email: "a@x", rol: "editor", pin: "" }]);
  eq(f, [{ pin: "9999", extra: 1, nombre: "Ana", email: "a@x", rol: "editor" }], "fusión conserva campos no visibles y el pin guardado");
  eq(R.filtrarRoster({ nombre: "A", email: "a@x", pin: "1", rol: "admin", foo: 1 }), { nombre: "A", email: "a@x", rol: "admin" }, "roster sin pin ni campos extra");
  eq(R.espejoUsuarios([{ email: "a@x" }], [{ email: "A@x" }, { email: "b@x" }]).length, 2, "espejo conserva el usuario que main tenía");
}
{
  const actual = { estados: { a: 1 }, tareasConfig: { t: 1 }, pinsPersonalizados: { x: 1 } };
  eq(R.aplicarPatchMain(actual, { tareasConfig: { t: 2 } }, { puedeConfig: false }).error, "sin_permiso", "config sin permiso → 403");
  ok(R.aplicarPatchMain(actual, { tareasConfig: { t: 1 }, estados: { a: 2 } }, { puedeConfig: false }).ok, "config idéntica sin permiso → se acepta (no cambia)");
  ok(R.aplicarPatchMain(actual, { tareasConfig: { t: 2 } }, { puedeConfig: true }).ok, "config con permiso → ok");
  eq(R.aplicarPatchMain(actual, { usuarios: [] }, { puedeConfig: true }).error, "campos_no_permitidos", "patch de usuarios en main → rechazado");
  eq(Object.keys(R.mainParaCliente({ ...actual, usuarios: [] })).sort(), ["estados", "tareasConfig"], "main al cliente sin pinsPersonalizados ni usuarios");
  eq(R.puedeEditarConfig({ rol: "admin" }, false), false, "rol admin en usuarios NO da permiso de config (solo seg_administradores)");
  eq(R.puedeEditarConfig({ tab_permisos: { tareas: { config: "editar" } } }, false), true, "permiso de pestaña Config = editar → ok");
}

console.log(`\n_reglasLogin: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

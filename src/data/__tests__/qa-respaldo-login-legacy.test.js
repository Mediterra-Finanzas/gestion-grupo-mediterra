/* eslint-disable */
/* VERIFICACIÓN DE CREDENCIAL · réplica de la decisión de acceso de App.jsx.
 *
 * Dos cosas distintas:
 * 1. App.jsx sigue teniendo las reglas que la réplica copia. Si alguien las cambia, este
 *    archivo falla y la réplica se revisa: sin eso, la verificación de lo restaurado podría
 *    decir "entra" con reglas que la app ya no usa.
 * 2. La réplica decide igual que esas reglas en cada rama.
 * Ninguna de las dos es un login real: la app lee `main` y `pins` del origen.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const V = require(path.resolve(__dirname, "..", "verificacionCredencialLegacy.js"));

const APP = fs.readFileSync(path.resolve(__dirname, "..", "..", "App.jsx"), "utf8").replace(/\s+/g, "");
const REGLAS = {
  "WORKERS excluye desactivados": "constWORKERS=usuarios.filter(u=>!u.desactivado);",
  "busca por correo en minúsculas": "constw=WORKERS.find(x=>x.email&&x.email.toLowerCase()===emailInput);",
  "largo del PIN": "if(pinInput.length<4||pinInput.length>64)",
  "el código provisorio manda sobre el PIN": 'constestTemp=estadoTemp(PP[w.nombre+"_temp"]);if(estTemp.existe){if(estTemp.expirado){',
  "código con formato nuevo y expiración": "if(cred&&cred.salt&&cred.hash){constexpirado=!!(cred.exp&&Date.now()>cred.exp);",
  "código legado en claro": "if(est.legacy)returnString(codigo)===est.plano;",
  "PIN contra _h o contra PIN en claro": "constesOk=credH?awaitverifyPin(pinInput,credH):(pinInput===(PP[w.nombre]||w.pin));",
  "vencimiento a 60 días": "pinVencido=(Date.now()-newDate(credCj.fecha).getTime())/86400000>60;",
  "sello de política": 'constcumplePolitica=!!(credCj&&credCj.pol==="6dig");',
  "reemisión por ¿Olvidaste tu PIN?": 'constnuevosPins={...pinsPersonalizados,[w.nombre+"_temp"]:tempCred};',
  "reemisión por Resetear PIN": 'constnext={...pinsPersonalizados,[nombre+"_temp"]:tempCred};',
  "crear el PIN borra el código": 'deletenuevosPins[worker.nombre+"_temp"];',
  "segundo factor por celular": 'consttelReg=w?pinsPersonalizados[w.nombre+"_tel"]:null;',
};

const derivar = (pin, salt, iter) => crypto.pbkdf2Sync(String(pin), Buffer.from(salt, "hex"), iter, 32, "sha256").toString("hex");
const credDe = (pin, extra) => { const salt = crypto.randomBytes(16).toString("hex"); return { v: 1, iter: 1000, salt, hash: derivar(pin, salt, 1000), ...extra }; };
const verifyPin = async (pin, cred) => {
  try { const c = typeof cred === "string" ? JSON.parse(cred) : cred; return !!(c && c.salt && c.hash) && derivar(pin, c.salt, c.iter || 100000) === c.hash; }
  catch (e) { return false; }
};
const hoy = new Date().toISOString().slice(0, 10);
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
const U = (nombre, extra) => ({ nombre, email: nombre.toLowerCase() + "@x.invalid", rol: "editor", modulos: ["tareas"], desactivado: false, ...extra });
const usuarios = [U("Ana"), U("Beto", { desactivado: true })];
const decidir = (pins, email, pin, us = usuarios) => V.decidirAcceso({ usuarios: us, pins, email, pin, verifyPin });
const D = V.DECISION;

describe("App.jsx conserva las reglas que la réplica copia", () => {
  test.each(Object.entries(REGLAS))("%s", (_, fragmento) => {
    expect(APP.includes(fragmento)).toBe(true);
  });
  test("el módulo se declara verificación de credencial, no login", () => {
    expect(V.ALCANCE).toBe("verificacion_de_credencial");
  });
});

describe("Decisión de acceso replicada", () => {
  test("PIN correcto con política vigente → entra; PIN incorrecto → rechazado", async () => {
    const pins = { Ana_h: JSON.stringify(credDe("482915", { fecha: hoy, pol: "6dig" })) };
    expect(await decidir(pins, "ana@x.invalid", "482915")).toBe(D.ENTRA);
    expect(await decidir(pins, "ANA@x.invalid", "482915")).toBe(D.ENTRA);
    expect(await decidir(pins, "ana@x.invalid", "482916")).toBe(D.PIN);
  });

  test("sin sello de política, o con más de 60 días → entra y debe cambiar el PIN", async () => {
    expect(await decidir({ Ana_h: JSON.stringify(credDe("482915", { fecha: hoy })) }, "ana@x.invalid", "482915")).toBe(D.ENTRA_CAMBIA);
    expect(await decidir({ Ana_h: JSON.stringify(credDe("482915", { fecha: hace(61), pol: "6dig" })) }, "ana@x.invalid", "482915")).toBe(D.ENTRA_CAMBIA);
    expect(await decidir({ Ana_h: JSON.stringify(credDe("482915", { fecha: hace(59), pol: "6dig" })) }, "ana@x.invalid", "482915")).toBe(D.ENTRA);
  });

  test("desactivado y correo inexistente reciben la misma respuesta", async () => {
    const pins = { Beto_h: JSON.stringify(credDe("482915", { fecha: hoy, pol: "6dig" })) };
    expect(await decidir(pins, "beto@x.invalid", "482915")).toBe(D.CORREO);
    expect(await decidir(pins, "nadie@x.invalid", "482915")).toBe(D.CORREO);
  });

  test("código provisorio vigente: el PIN anterior no entra y el código sí", async () => {
    const pins = { Ana_h: JSON.stringify(credDe("482915", { fecha: hoy, pol: "6dig" })),
                   Ana_temp: JSON.stringify({ ...credDe("731064"), exp: Date.now() + 45 * 60000 }) };
    expect(await decidir(pins, "ana@x.invalid", "482915")).toBe(D.PIN_INHABILITADO);
    expect(await decidir(pins, "ana@x.invalid", "731064")).toBe(D.CODIGO_OK);
  });

  test("código provisorio vencido: ni el PIN anterior ni el código entran; hay que reemitir", async () => {
    const pins = { Ana_h: JSON.stringify(credDe("482915", { fecha: hoy, pol: "6dig" })),
                   Ana_temp: JSON.stringify({ ...credDe("731064"), exp: Date.now() - 1 }) };
    expect(await decidir(pins, "ana@x.invalid", "482915")).toBe(D.CODIGO_VENCIDO);
    expect(await decidir(pins, "ana@x.invalid", "731064")).toBe(D.CODIGO_VENCIDO);
  });

  test("código legado en texto plano: vigente sin expiración", async () => {
    const pins = { Ana_h: JSON.stringify(credDe("482915", { fecha: hoy, pol: "6dig" })), Ana_temp: "123987" };
    expect(await decidir(pins, "ana@x.invalid", "123987")).toBe(D.CODIGO_OK);
    expect(await decidir(pins, "ana@x.invalid", "482915")).toBe(D.PIN_INHABILITADO);
  });

  test("sin `_h`: compara con el PIN en claro legado (que el respaldo no trae)", async () => {
    expect(await decidir({ Ana: "5555" }, "ana@x.invalid", "5555")).toBe(D.ENTRA_CAMBIA);
    expect(await decidir({}, "ana@x.invalid", "5555")).toBe(D.PIN);
  });

  test("formato de correo o de PIN inválido", async () => {
    expect(await decidir({}, "ana", "482915")).toBe(D.FORMATO);
    expect(await decidir({}, "ana@x.invalid", "12")).toBe(D.FORMATO);
  });

  test("la rama sin PIN coincide con la decisión en cada estado", () => {
    const R = V.RAMA, rama = (pins, nombre = "Ana") => V.ramaDe({ usuarios, pins, nombre });
    expect(rama({})).toBe(R.SIN_CREDENCIAL);
    expect(rama({ Ana: "5555" })).toBe(R.PIN_EN_CLARO);
    expect(rama({ Ana_h: "{roto" })).toBe(R.CREDENCIAL_ILEGIBLE);
    expect(rama({ Ana_h: JSON.stringify(credDe("1", { fecha: hoy, pol: "6dig" })) })).toBe(R.ENTRA);
    expect(rama({ Ana_h: JSON.stringify(credDe("1", { fecha: hoy })) })).toBe(R.DEBE_CAMBIAR);
    expect(rama({ Ana_temp: JSON.stringify({ ...credDe("1"), exp: Date.now() + 60000 }) })).toBe(R.CODIGO_VIGENTE);
    expect(rama({ Ana_temp: JSON.stringify({ ...credDe("1"), exp: 1 }) })).toBe(R.CODIGO_VENCIDO);
    expect(rama({}, "Beto")).toBe(R.DESACTIVADO);
    expect(rama({}, "Nadie")).toBe(R.SIN_USUARIO);
    expect(V.pinInhabilitado(R.CODIGO_VIGENTE) && V.pinInhabilitado(R.CODIGO_VENCIDO) && !V.pinInhabilitado(R.ENTRA)).toBe(true);
  });
});

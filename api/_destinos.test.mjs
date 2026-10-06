// Prueba de api/_destinos.js y de su uso en api/send-email.js. Sin red: el
// transporte SMTP se reemplaza por uno que solo anota. node api/_destinos.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const D = require("./_destinos.js");
const SE = require("./send-email.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.error("  ✗ " + m); } };

// Captura de logs para comprobar la marca y que no lleve contenido.
const logs = [];
const warnReal = console.warn;
console.warn = (...a) => { logs.push(a.join(" ")); };

const PROD = { VERCEL_ENV: "production" };
const PREV = { VERCEL_ENV: "preview", DESTINOS_PERMITIDOS: "staging-ref.supabase.co, smtp.office365.com,127.0.0.1:54329",
  CORREO_DESTINOS_PERMITIDOS: "pruebas@ejemplo.test,@prueba.mediterra.test" };

console.log("activación");
ok(!D.guardiaActiva(PROD), "producción: guardia apagada");
ok(!D.guardiaActiva({ VERCEL_ENV: "production", DESTINOS_PERMITIDOS: "x" }), "producción con lista: igual apagada");
ok(!D.guardiaActiva({}), "local sin variables: apagada (como hoy)");
ok(D.guardiaActiva({ VERCEL_ENV: "preview" }), "preview: activa");
ok(D.guardiaActiva({ VERCEL_ENV: "development" }), "development: activa");
ok(D.guardiaActiva({ DESTINOS_PERMITIDOS: "127.0.0.1:1" }), "fuera de Vercel con DESTINOS_PERMITIDOS: activa");

console.log("hosts");
ok(D.hostPermitido("https://bywovqayuzodbzwsriet.supabase.co/rest/v1/x", PROD).ok, "producción: host de producción permitido (sin cambio)");
ok(D.hostPermitido("https://cualquiera.example/x", PROD).ok, "producción: cualquier host permitido (sin cambio)");
ok(D.hostPermitido("https://staging-ref.supabase.co/rest/v1/x", PREV).ok, "preview: staging en la lista → sí");
ok(D.hostPermitido("http://127.0.0.1:54329/rest/v1/x", PREV).ok, "preview: host:puerto en la lista → sí");
ok(!D.hostPermitido("http://127.0.0.1:9999/x", PREV).ok, "preview: mismo host, otro puerto no listado → no");
ok(D.hostPermitido("https://bywovqayuzodbzwsriet.supabase.co/x", { ...PREV, DESTINOS_PERMITIDOS: "bywovqayuzodbzwsriet.supabase.co" }).motivo === "host_de_produccion",
  "preview: producción rechazada aunque esté en la lista");
ok(D.hostPermitido("https://gestion-grupo-mediterra.vercel.app/", PREV).motivo === "host_de_produccion", "preview: vercel.app de producción rechazado");
ok(D.hostPermitido("https://staging-ref.supabase.co/x", { VERCEL_ENV: "preview" }).motivo === "sin_lista_destinos", "preview sin DESTINOS_PERMITIDOS → falla cerrado");
ok(D.hostPermitido("no es url", PREV).motivo === "url_invalida", "url inválida → no");
let lanzo = null;
try { D.exigirDestinoPermitido("https://otro.example/x", "prueba", PREV); } catch (e) { lanzo = e; }
ok(lanzo && lanzo.code === "destino_no_autorizado", "exigirDestinoPermitido lanza destino_no_autorizado");
ok(D.exigirDestinoPermitido("https://otro.example/x", "prueba", PROD) === "https://otro.example/x", "exigirDestinoPermitido en producción devuelve la URL");

console.log("correos");
ok(D.correoPermitido("pruebas@ejemplo.test", PREV), "dirección exacta");
ok(D.correoPermitido("Ana@Prueba.Mediterra.Test", PREV), "dominio @ (sin distinguir mayúsculas)");
ok(!D.correoPermitido("ana@sub.prueba.mediterra.test", PREV), "subdominio no listado → no");
ok(!D.correoPermitido("ahuerta@grupomediterra.cl", PREV), "dirección real → no");
ok(D.correoPermitido("ahuerta@grupomediterra.cl", PROD), "producción → sí (sin cambio)");
ok(D.revisarDestinatarios("Ana <ana@prueba.mediterra.test>, pruebas@ejemplo.test", "t", PREV).ok, "varios permitidos → ok");
const mix = D.revisarDestinatarios("ana@prueba.mediterra.test, ahuerta@grupomediterra.cl", "t", PREV);
ok(!mix.ok && mix.motivo === "destinatario_no_autorizado" && mix.rechazados === 1, "uno no permitido → se rechaza el mensaje entero");
const sin = D.revisarDestinatarios("ana@prueba.mediterra.test", "t", { VERCEL_ENV: "preview", DESTINOS_PERMITIDOS: "x" });
ok(!sin.ok && sin.motivo === "sin_lista_correos", "sin CORREO_DESTINOS_PERMITIDOS → falla cerrado");
ok(D.revisarDestinatarios("cualquiera@x.cl", "t", PROD).ok, "producción: sin revisión");

// ── send-email.js con transporte simulado ──
const enviados = [];
SE.__pruebas.setTransporte((config) => ({ sendMail: async (m) => { enviados.push({ host: config.host, to: m.to }); return { messageId: "simulado" }; } }));
function llamar(body) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); return this; }, end() { resolve({ status: this.statusCode }); } };
    SE({ method: "POST", body }, res);
  });
}
const conEnv = async (env, fn) => {
  const claves = ["VERCEL_ENV", "DESTINOS_PERMITIDOS", "CORREO_DESTINOS_PERMITIDOS", "SMTP_MEDITERRA_USER", "SMTP_MEDITERRA_PASS"];
  const antes = Object.fromEntries(claves.map((k) => [k, process.env[k]]));
  for (const k of claves) delete process.env[k];
  Object.assign(process.env, { SMTP_MEDITERRA_USER: "casilla@ejemplo.test", SMTP_MEDITERRA_PASS: "x" }, env);
  try { return await fn(); } finally { for (const k of claves) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } }
};
const MSG = { to: "ahuerta@grupomediterra.cl", subject: "Asunto secreto", message: "CONTENIDO-SECRETO-123" };

console.log("send-email");
await conEnv(PROD, async () => {
  const r = await llamar(MSG);
  ok(r.status === 200 && enviados.length === 1 && enviados[0].to === MSG.to, "producción: envía a cualquier destinatario como hoy (sin guardia)");
  const r2 = await SE.enviarCorreo(MSG);
  ok(r2.success && enviados.length === 2, "producción: enviarCorreo igual que hoy");
});
await conEnv({}, async () => {
  const r = await llamar(MSG);
  ok(r.status === 200 && enviados.length === 3, "local sin variables: igual que hoy");
});
enviados.length = 0; logs.length = 0;
await conEnv({ VERCEL_ENV: "preview", DESTINOS_PERMITIDOS: "smtp.office365.com" }, async () => {
  const r = await llamar({ ...MSG, to: "ana@prueba.mediterra.test" });
  ok(r.status === 403 && r.body.motivo === "sin_lista_correos" && enviados.length === 0, "preview sin CORREO_DESTINOS_PERMITIDOS: 403 y nada enviado");
});
await conEnv(PREV, async () => {
  const r = await llamar(MSG);
  ok(r.status === 403 && r.body.error === "destino_no_autorizado" && enviados.length === 0, "preview: destinatario real → 403 y nada enviado");
  const r2 = await llamar({ ...MSG, to: "ana@prueba.mediterra.test, " + MSG.to });
  ok(r2.status === 403 && enviados.length === 0, "preview: un destinatario no permitido bloquea el mensaje entero");
  const r3 = await SE.enviarCorreo(MSG);
  ok(!r3.success && r3.error === "destino_no_autorizado" && enviados.length === 0, "preview: enviarCorreo (códigos del servidor) también rechaza");
  const r4 = await llamar({ ...MSG, to: "ana@prueba.mediterra.test" });
  ok(r4.status === 200 && enviados.length === 1, "preview: destinatario permitido → se envía");
});
await conEnv({ ...PREV, DESTINOS_PERMITIDOS: "staging-ref.supabase.co" }, async () => {
  const r = await llamar({ ...MSG, to: "ana@prueba.mediterra.test" });
  ok(r.status === 403 && r.body.motivo === "host_no_autorizado" && enviados.length === 1, "preview: SMTP fuera de DESTINOS_PERMITIDOS → 403");
});
const marcas = logs.filter((l) => l.includes("[destino-no-autorizado]"));
ok(marcas.length >= 4, `log con [destino-no-autorizado] (${marcas.length} líneas)`);
ok(!logs.some((l) => /CONTENIDO-SECRETO|Asunto secreto|ahuerta@/.test(l)), "el log no lleva contenido, asunto ni direcciones completas");

console.warn = warnReal;
console.log(`\n_destinos: ${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

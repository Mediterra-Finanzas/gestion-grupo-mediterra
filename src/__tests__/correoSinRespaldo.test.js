/* eslint-disable */
// Correo sin respaldo por EmailJS, con errores visibles y reintento sin duplicar (oct-2026).
// fetch simulado: ningún correo real. Cubre lo que antes abría la vía: con un 5xx o una falla
// de red la app reenviaba por EmailJS, sin sesión ni destinatarios validados.
const fs = require("fs");
const path = require("path");
const H = require("../emailHelper");

let llamadas, respuestas;
const resp = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
beforeEach(() => {
  H._reiniciarCorreos();
  llamadas = []; respuestas = [];
  global.fetch = jest.fn(async (url, init) => {
    llamadas.push({ url, body: init && init.body ? JSON.parse(init.body) : null });
    const r = respuestas.shift();
    if (r === "red") throw new TypeError("Failed to fetch");
    return r || resp(200, { success: true });
  });
});
const aEmailJS = () => llamadas.filter((l) => /emailjs/i.test(String(l.url)));
const notif = () => H.enviarAccion("notificacion", { para: ["a@x.cl"], asunto: "Tarea", mensaje: "m" }, { descripcion: "Tarea → A" });

test("5xx: no recurre a EmailJS, queda pendiente y visible", async () => {
  respuestas = [resp(503, { error: "no_disponible" })];
  const r = await notif();
  expect(r.success).toBe(false);
  expect(r.estado).toBe("servidor");
  expect(aEmailJS()).toHaveLength(0);
  expect(llamadas).toHaveLength(1);
  expect(H.correosPendientes().map((p) => p.descripcion)).toEqual(["Tarea → A"]);
});

test("falla de red: no recurre a EmailJS; el reintento usa la MISMA identidad (no duplica)", async () => {
  respuestas = ["red", resp(200, { success: true, duplicado: true })];
  await notif();
  expect(aEmailJS()).toHaveLength(0);
  const [p] = H.correosPendientes();
  expect(p.estado).toBe("red");
  const r = await H.reintentarCorreo(p.id);
  expect(r.success).toBe(true);
  expect(r.duplicado).toBe(true);                         // ya había salido: el servidor no lo repite
  expect(llamadas[0].body.idEnvio).toBe(llamadas[1].body.idEnvio);
  expect(H.correosPendientes()).toHaveLength(0);
});

test("502 con reintento:'nuevo' (ese intento no salió): el siguiente lleva otra identidad", async () => {
  respuestas = [resp(502, { error: "no_enviado", reintento: "nuevo" }), resp(200, { success: true })];
  await notif();
  const [p] = H.correosPendientes();
  await H.reintentarCorreo(p.id);
  const [a, b] = llamadas.map((l) => l.body.idEnvio);
  expect(b).toBe(`${a}.1`);
  expect(aEmailJS()).toHaveLength(0);
});

test("401 (sesión vencida o revocada): pendiente con estado sin_sesion; renovar y reintentar lo envía una vez", async () => {
  respuestas = [resp(401, { error: "sin_sesion" }), resp(200, { ok: true }), resp(200, { success: true })];
  await notif();
  expect(H.correosPendientes()[0].estado).toBe("sin_sesion");
  await H.abrirSesionCorreo("a@x.cl", "123456");
  await H.reintentarTodos();
  expect(llamadas.map((l) => l.body.accion)).toEqual(["notificacion", "sesion", "notificacion"]);
  expect(llamadas[0].body.idEnvio).toBe(llamadas[2].body.idEnvio);
  expect(H.correosPendientes()).toHaveLength(0);
});

test("rechazo (403): visible, no se reintenta ni va a EmailJS", async () => {
  respuestas = [resp(403, { error: "destinatario_no_permitido" })];
  await notif();
  const [p] = H.correosPendientes();
  expect(p.estado).toBe("rechazado");
  const r = await H.reintentarCorreo(p.id);
  expect(r.success).toBe(false);
  expect(llamadas).toHaveLength(1);
  expect(aEmailJS()).toHaveLength(0);
});

test("salir descarta los pendientes: no se reintentan con la sesión de otra persona", async () => {
  respuestas = [resp(503, {})];
  await notif();
  expect(H.correosPendientes()).toHaveLength(1);
  await H.cerrarSesionCorreo();
  expect(H.correosPendientes()).toHaveLength(0);
});

test("alEnviar corre solo cuando el servidor confirma (p. ej. la fecha de envío del informe)", async () => {
  respuestas = [resp(503, {}), resp(200, { success: true })];
  const marcar = jest.fn();
  await H.enviarAccion("informe_osiris", { para: "c@x.cl", asunto: "Inf", mensaje: "m" }, { alEnviar: marcar });
  expect(marcar).not.toHaveBeenCalled();
  await H.reintentarTodos();
  expect(marcar).toHaveBeenCalledTimes(1);
});

test("el código de la app no llama a EmailJS ni conserva sus claves", () => {
  const raiz = path.resolve(__dirname, "..");
  const archivos = [];
  const recorrer = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== "__tests__") recorrer(p); }
    else if (/\.(js|jsx|mjs)$/.test(e.name) && !/\.test\./.test(e.name)) archivos.push(p);
  });
  recorrer(raiz);
  const conEmailJS = archivos.filter((f) => /api\.emailjs\.com|REACT_APP_EMAILJS|bwCBq7JXlEwCTzWNe|template_notif_tarea/.test(fs.readFileSync(f, "utf8")));
  expect(conEmailJS.map((f) => path.relative(raiz, f))).toEqual([]);
});

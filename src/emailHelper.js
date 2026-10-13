// emailHelper.js — Correo de la app, SOLO por /api/send-email (oct-2026)
// Usado por todos los módulos de la app.
//
// Ya no hay respaldo vía EmailJS. Antes, ante una falla de red o un 5xx, la app reenviaba
// por EmailJS lo mismo que el servidor podía haber rechazado, sin sesión ni destinatarios
// validados: un 5xx bastaba para saltarse la autorización. Ahora un envío que no sale queda
// a la vista (ver CorreosPendientes.jsx) y se reintenta desde ahí.

const VERCEL_API = "/api/send-email";

// ── Correo con autorización comprobada en el servidor (ver api/_correo.js) ──
// Cada llamada nombra una ACCIÓN; el texto, los destinatarios permitidos y la cuenta los
// decide el servidor. La sesión de correo es una cookie HttpOnly que emite el servidor
// tras comprobar correo y PIN: el navegador no guarda ningún secreto.
export async function correoServidor(accion, datos = {}) {
  try {
    const res = await fetch(VERCEL_API, { method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion, ...datos }) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (e) { return { ok: false, status: 0, data: {}, red: true }; }
}
let emailSesion = "";
export const emailSesionCorreo = () => emailSesion;
export const abrirSesionCorreo = (email, pin) => { emailSesion = String(email || ""); return correoServidor("sesion", { email, pin }); };
// Al salir se descartan los pendientes: no deben reintentarse con la sesión de otra persona.
export const cerrarSesionCorreo = () => { emailSesion = ""; pendientes = []; avisar(); return correoServidor("cerrar"); };

// ── Envíos con identidad: reintentar no duplica ──
// Cada envío lleva un `idEnvio` propio. El servidor lo consume justo antes de enviar, así
// que repetir la MISMA petición (p. ej. porque se perdió la respuesta) no manda un segundo
// correo. Si el servidor responde que ese intento no salió (`reintento:"nuevo"`), el
// siguiente intento usa otra identidad. Los envíos que no salieron quedan en memoria de
// esta pestaña (no se guardan en el navegador): incluyen textos y, en la bienvenida, el PIN.
let pendientes = [];
const subs = new Set();
const avisar = () => { const copia = pendientes.slice(); subs.forEach((f) => { try { f(copia); } catch (e) {} }); };
export function suscribirCorreos(f) { subs.add(f); f(pendientes.slice()); return () => subs.delete(f); }
export const correosPendientes = () => pendientes.slice();

const nuevoId = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
  return `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
};

// Qué le pasó a un intento. «enviado» incluye «ya procesado por el servidor».
export function clasificarRespuesta(r) {
  const err = r && r.data && r.data.error;
  if (r && r.ok) return "enviado";
  if (r && r.status === 409 && err === "ya_enviado") return "enviado";
  if (!r || r.status === 0) return "red";
  if (r.status === 401) return "sin_sesion";
  if (r.status === 429) return "limite";
  if (r.status === 503 && err === "no_configurado") return "no_configurado";
  if (r.status >= 500) return "servidor";
  return "rechazado";                                   // 400/403/404/409: reintentar no sirve
}
export const REINTENTABLE = { red: true, sin_sesion: true, limite: true, servidor: true, no_configurado: true, rechazado: false };

async function intentar(envio) {
  const idEnvio = envio.intento ? `${envio.id}.${envio.intento}` : envio.id;
  envio.enCurso = true; avisar();
  const r = await correoServidor(envio.accion, { ...envio.datos, idEnvio, intento: envio.intento || undefined });
  envio.enCurso = false;
  const estado = clasificarRespuesta(r);
  if (estado === "enviado") {
    pendientes = pendientes.filter((p) => p.id !== envio.id); avisar();
    try { envio.alEnviar && envio.alEnviar(r); } catch (e) {}
    return { success: true, method: "smtp", duplicado: !!(r.data && r.data.duplicado), data: r.data };
  }
  if (r.data && r.data.reintento === "nuevo") envio.intento = (envio.intento || 0) + 1;   // ese intento no salió
  Object.assign(envio, { estado, status: r.status, error: (r.data && r.data.error) || (r.red ? "red" : `HTTP ${r.status}`), ts: Date.now() });
  if (!pendientes.some((p) => p.id === envio.id)) pendientes = [...pendientes, envio];
  avisar();
  console.warn("[Email] no enviado:", envio.descripcion, estado, envio.error);
  return { success: false, estado, error: envio.error };
}

// enviarAccion("notificacion", {para, asunto, mensaje}, {descripcion, alEnviar})
export function enviarAccion(accion, datos = {}, { descripcion = accion, alEnviar = null } = {}) {
  return intentar({ id: nuevoId(), intento: 0, accion, datos, descripcion, alEnviar, creado: Date.now() });
}
export function reintentarCorreo(id) {
  const e = pendientes.find((p) => p.id === id);
  if (!e || e.enCurso || !REINTENTABLE[e.estado]) return Promise.resolve({ success: false, estado: e ? e.estado : "inexistente" });
  return intentar(e);
}
export async function reintentarTodos() {
  const lista = pendientes.filter((p) => !p.enCurso && REINTENTABLE[p.estado]);
  for (const e of lista) await intentar(e);              // en orden: no dispara ráfagas
}
export function descartarCorreo(id) { pendientes = pendientes.filter((p) => p.id !== id); avisar(); }
// Solo para pruebas.
export function _reiniciarCorreos() { pendientes = []; avisar(); }

export async function enviarReporteDiario({ empresaId, ejecucionId }) {
  const r = await enviarAccion("reporte_diario", { empresaId, ejecucionId }, { descripcion: `Reporte diario ${ejecucionId}` });
  return r.success ? { success: true, method: "smtp", messageId: r.data && r.data.messageId } : { success: false, error: r.error };
}

/**
 * Notificación interna (texto). El servidor exige sesión y que los destinatarios sean usuarios.
 * @returns {Promise<{success: boolean, method?: string, error?: string, estado?: string}>}
 */
export async function enviarEmail({ to, subject, message }) {
  if (!to || !subject) return { success: false, error: "to y subject son obligatorios" };
  const para = String(to).split(",").map((x) => x.trim()).filter(Boolean);
  return enviarAccion("notificacion", { para, asunto: subject, mensaje: message || "" }, { descripcion: `${subject} → ${para.join(", ")}` });
}

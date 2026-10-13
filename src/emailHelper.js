// emailHelper.js — Helper para enviar emails via Vercel Function o EmailJS (fallback)
// Usado por todos los módulos de la app

const VERCEL_API = "/api/send-email";

// ── Correo con autorización comprobada en el servidor (oct-2026, ver api/_correo.js) ──
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
export const abrirSesionCorreo = (email, pin) => correoServidor("sesion", { email, pin });
export const cerrarSesionCorreo = () => correoServidor("cerrar");
// Un rechazo de autorización (400/401/403/404/409/429) NO se reintenta por EmailJS: sería
// saltarse el control. Solo una falla de red o del servidor (0 / 5xx) usa el respaldo.
export const puedeUsarRespaldo = (r) => !r.ok && (r.status === 0 || r.status >= 500);
export async function enviarReporteDiario({ empresaId, ejecucionId }) {
  const r = await correoServidor("reporte_diario", { empresaId, ejecucionId });
  return r.ok ? { success: true, method: "smtp", messageId: r.data.messageId } : { success: false, error: r.data.error || `HTTP ${r.status}` };
}

// EmailJS fallback config (se usa si Vercel Function no está disponible)
const EMAILJS_SERVICE = "service_ahuerta";
const EMAILJS_TEMPLATE = "template_notif_tarea";
const EMAILJS_KEY = "bwCBq7JXlEwCTzWNe";

/**
 * Envía un email usando Vercel Function (SMTP directo) con fallback a EmailJS
 * @param {Object} params
 * @param {string} params.to - Email(s) destinatario(s), separados por coma
 * @param {string} params.subject - Asunto
 * @param {string} params.message - Cuerpo en texto plano
 * @param {string} params.html - Cuerpo en HTML (opcional, tiene prioridad sobre message)
 * @param {string} params.modulo - "osiris" | "allegria" | "frisku" | "mediterra" (determina remitente)
 * @returns {Promise<{success: boolean, method: string, error?: string}>}
 */
export async function enviarEmail({ to, subject, message, html, modulo = "mediterra" }) {
  if (!to || !subject) {
    return { success: false, error: "to y subject son obligatorios" };
  }
  // Notificación interna (texto). El servidor exige sesión y destinatarios que sean usuarios.
  const r = await correoServidor("notificacion", { para: String(to).split(",").map((x) => x.trim()).filter(Boolean), asunto: subject, mensaje: message || "" });
  if (r.ok) return { success: true, method: "smtp" };
  if (!puedeUsarRespaldo(r)) { console.warn("[Email] el servidor rechazó el envío:", r.status, r.data && r.data.error); return { success: false, error: (r.data && r.data.error) || `HTTP ${r.status}` }; }
  console.warn("[Email] servidor de correo no disponible — intentando EmailJS...");

  // Fallback: EmailJS
  try {
    const NAMES = {
      osiris: "Osiris Plant Management",
      allegria: "Allegria Foods",
      frisku: "Frisku Foods",
      mediterra: "Grupo Mediterra",
    };

    const emailList = to.split(",").map((e) => e.trim()).filter(Boolean);
    for (const email of emailList) {
      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: EMAILJS_SERVICE,
          template_id: EMAILJS_TEMPLATE,
          user_id: EMAILJS_KEY,
          template_params: {
            to_email: email,
            name: NAMES[modulo] || "Grupo Mediterra",
            subject: subject,
            message: message || "",
          },
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[Email] EmailJS error:", res.status, errText);
      }
    }
    console.log(`[Email] ✅ Enviado via EmailJS a ${to}`);
    return { success: true, method: "emailjs" };
  } catch (e) {
    console.error("[Email] EmailJS también falló:", e);
    return { success: false, error: e.message, method: "none" };
  }
}

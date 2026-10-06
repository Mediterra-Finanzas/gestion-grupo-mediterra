// emailHelper.js — Helper para enviar emails via Vercel Function o EmailJS (fallback)
// Usado por todos los módulos de la app

const VERCEL_API = "/api/send-email";

// EmailJS fallback config (se usa si Vercel Function no está disponible)
const EMAILJS_SERVICE = "service_ahuerta";
const EMAILJS_TEMPLATE = "template_notif_tarea";
const EMAILJS_KEY = "bwCBq7JXlEwCTzWNe";
// Producción: igual que hoy. Se apaga con REACT_APP_EMAILJS_DESACTIVADO=true o en un build
// que apunte la base a otro proyecto (REACT_APP_SUPA_URL, p. ej. staging).
const EMAILJS_PERMITIDO = process.env.REACT_APP_EMAILJS_DESACTIVADO !== "true" && !process.env.REACT_APP_SUPA_URL;

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

  // Intentar Vercel Function primero
  try {
    const res = await fetch(VERCEL_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, message, html, modulo }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log(`[Email] ✅ Enviado via SMTP (${data.fromName}) a ${to}`);
      return { success: true, method: "smtp", ...data };
    }

    // Si la API devuelve error, intentar fallback
    const err = await res.json().catch(() => ({ error: "Error desconocido" }));
    // El servidor rechazó el destinatario (lista de permitidos fuera de producción):
    // reintentar por EmailJS saltaría ese control.
    if (err.error === "destino_no_autorizado") {
      console.warn("[Email] Destinatario no autorizado en este entorno: no se envía.");
      return { success: false, error: "destino_no_autorizado", method: "none" };
    }
    console.warn("[Email] SMTP falló:", err.error, "— intentando EmailJS...");
  } catch (e) {
    console.warn("[Email] SMTP no disponible:", e.message, "— intentando EmailJS...");
  }

  // Fallback: EmailJS
  if (!EMAILJS_PERMITIDO) {
    console.warn("[Email] EmailJS desactivado en este entorno: no se envía.");
    return { success: false, error: "emailjs_desactivado", method: "none" };
  }
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

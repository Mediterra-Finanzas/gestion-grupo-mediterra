// api/send-email.js — Vercel Serverless Function
// Envía correos vía SMTP Microsoft 365, con autorización comprobada en el servidor
// (ver api/_correo.js). Ya no es un relé abierto: solo acciones conocidas, con texto del
// servidor, sesión firmada por el servidor y destinatarios validados.
//
// Variables de entorno (Vercel, NUNCA en el navegador):
//   SMTP_{MEDITERRA,OSIRIS,ALLEGRIA,FRISKU}_{USER,PASS}   cuentas por empresa (sin cambio)
//   SUPABASE_SERVICE_ROLE_KEY   leer usuarios/pins y la ejecución del reporte (solo lectura)
//   CORREO_SESSION_SECRET       firma de la sesión de correo (nuevo, obligatorio)
//   CORREO_RATELIMIT_SECRET     limitador de intentos (nuevo, obligatorio)
//   CORREO_ORIGENES             orígenes permitidos, separados por coma (default: el sitio publicado)
// Sin CORREO_SESSION_SECRET o sin limitador, el endpoint responde 503 (falla cerrado).

const { crearCorreo } = require("./_correo.js");
const RL = require("./_friskuSpRateLimiter.js");
const { emailDesdeSnapshot } = require("./_reporteDiarioEmail.js");

const SUPA_URL = process.env.SUPABASE_URL || "https://bywovqayuzodbzwsriet.supabase.co";

function getAccountForModule(modulo) {
  const accounts = {
    osiris:    { user: process.env.SMTP_OSIRIS_USER || "",    pass: process.env.SMTP_OSIRIS_PASS || "",    name: "Osiris Plant Management" },
    allegria:  { user: process.env.SMTP_ALLEGRIA_USER || "",  pass: process.env.SMTP_ALLEGRIA_PASS || "",  name: "Allegria Foods" },
    frisku:    { user: process.env.SMTP_FRISKU_USER || "",    pass: process.env.SMTP_FRISKU_PASS || "",    name: "Frisku Foods" },
    mediterra: { user: process.env.SMTP_MEDITERRA_USER || "", pass: process.env.SMTP_MEDITERRA_PASS || "", name: "Grupo Mediterra" },
  };
  const account = accounts[modulo] || accounts.mediterra;
  if (!account.user || !account.pass) {
    const fb = accounts.mediterra;
    if (fb.user && fb.pass) return { ...fb, name: account.name || fb.name };
  }
  return account;
}

// TLS validado: antes se aceptaba cualquier certificado, lo que permitía interceptar la conexión SMTP.
function crearTransporter(account) {
  const nodemailer = require("nodemailer");
  return nodemailer.createTransport({
    host: "smtp.office365.com", port: 587, secure: false, requireTLS: true,
    auth: { user: account.user, pass: account.pass },
    tls: { minVersion: "TLSv1.2" },
  });
}

// Envío server-side reutilizable (lo usa el cron del reporte diario). No es accesible desde
// el navegador: solo lo llama código del servidor.
async function enviarCorreo({ to, subject, message, modulo, html }) {
  if (!to || !subject) return { success: false, error: "to y subject son obligatorios" };
  const account = getAccountForModule(modulo || "mediterra");
  if (!account.user || !account.pass) return { success: false, error: "Cuenta SMTP no configurada" };
  const info = await crearTransporter(account).sendMail({ from: `"${account.name}" <${account.user}>`, to, subject, text: message || "", html: html || undefined });
  return { success: true, method: "smtp", messageId: info.messageId, from: account.user };
}

async function leerFila(id) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!key) throw new Error("sin_service_key");
  const r = await fetch(`${SUPA_URL}/rest/v1/calendario_data?id=eq.${id}&select=value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`fila_${id}_${r.status}`);
  const j = await r.json();
  if (!Array.isArray(j) || j.length !== 1) throw new Error(`fila_${id}`);
  const v = j[0].value;
  return typeof v === "string" ? JSON.parse(v) : v;
}

const handler = crearCorreo({
  // Fuente de verdad de usuarios: la fila dedicada `usuarios`. Sin ella, falla cerrado.
  leerFilas: async () => {
    const [usuarios, pins] = await Promise.all([leerFila("usuarios"), leerFila("pins")]);
    if (!Array.isArray(usuarios)) throw new Error("usuarios_forma");
    if (!pins || typeof pins !== "object" || Array.isArray(pins)) throw new Error("pins_forma");
    return { usuarios, pins };
  },
  transporte: {
    async enviar({ cuenta, para, asunto, texto, html }) {
      const account = getAccountForModule(cuenta);
      if (!account.user || !account.pass) throw new Error("smtp_no_configurado");
      return crearTransporter(account).sendMail({ from: `"${account.name}" <${account.user}>`, to: para.join(", "), subject: asunto, text: texto || "", html: html || undefined });
    },
  },
  limitador: RL.crearLimiterSupabase({
    supaUrl: SUPA_URL, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    hmacSecret: process.env.CORREO_RATELIMIT_SECRET || "", fetchImpl: (typeof fetch === "function" ? fetch : null),
  }),
  leerEjecucion: async ({ empresaId, ejecucionId }) => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!key || !empresaId || !ejecucionId) return null;
    const r = await fetch(`${SUPA_URL}/rest/v1/proc_reporte_ejecucion?id=eq.${encodeURIComponent(ejecucionId)}&empresa_id=eq.${encodeURIComponent(empresaId)}&select=*`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`ejecucion_${r.status}`);
    const j = await r.json();
    return Array.isArray(j) && j.length === 1 ? j[0] : null;
  },
  armarReporte: emailDesdeSnapshot,
  cfg: {
    secret: process.env.CORREO_SESSION_SECRET || "",
    origenes: (process.env.CORREO_ORIGENES || "https://gestion-grupo-mediterra.vercel.app").split(",").map((x) => x.trim()).filter(Boolean),
  },
  log: (x) => console.log("[correo]", JSON.stringify(x)),
});

module.exports = handler;
module.exports.enviarCorreo = enviarCorreo;

// api/send-email.js — Vercel Serverless Function
// Envía emails via SMTP Microsoft 365 (Outlook empresarial)
// Cada empresa tiene su propia cuenta de correo

const nodemailer = require("nodemailer");

// Configuración de cuentas por empresa (se leen de variables de entorno)
function getAccountForModule(modulo) {
  const accounts = {
    osiris: {
      user: process.env.SMTP_OSIRIS_USER || "",
      pass: process.env.SMTP_OSIRIS_PASS || "",
      name: "Osiris Plant Management",
    },
    allegria: {
      user: process.env.SMTP_ALLEGRIA_USER || "",
      pass: process.env.SMTP_ALLEGRIA_PASS || "",
      name: "Allegria Foods",
    },
    frisku: {
      user: process.env.SMTP_FRISKU_USER || "",
      pass: process.env.SMTP_FRISKU_PASS || "",
      name: "Frisku Foods",
    },
    mediterra: {
      user: process.env.SMTP_MEDITERRA_USER || "",
      pass: process.env.SMTP_MEDITERRA_PASS || "",
      name: "Grupo Mediterra",
    },
  };

  // Buscar cuenta del módulo, fallback a mediterra
  const account = accounts[modulo] || accounts.mediterra;
  
  // Si la cuenta del módulo no tiene credenciales, usar mediterra como fallback
  if (!account.user || !account.pass) {
    const fallback = accounts.mediterra;
    if (fallback.user && fallback.pass) {
      return { ...fallback, name: account.name || fallback.name };
    }
  }

  return account;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { to, subject, message, modulo, html } = req.body;

    if (!to || !subject) {
      return res.status(400).json({ error: "to y subject son obligatorios" });
    }

    const account = getAccountForModule(modulo || "mediterra");

    if (!account.user || !account.pass) {
      return res.status(500).json({ 
        error: "Cuenta SMTP no configurada para: " + (modulo || "mediterra"),
        hint: "Configura las variables de entorno SMTP_*_USER y SMTP_*_PASS en Vercel"
      });
    }

    // Crear transporter SMTP para Microsoft 365
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: account.user,
        pass: account.pass,
      },
      tls: {
        ciphers: "SSLv3",
        rejectUnauthorized: false,
      },
    });

    // Preparar email
    const mailOptions = {
      from: `"${account.name}" <${account.user}>`,
      to: to, // puede ser "email1@x.com, email2@y.com"
      subject: subject,
      text: message || "",
      html: html || undefined, // Si se envía HTML, se usa como cuerpo principal
    };

    // Enviar
    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({
      success: true,
      messageId: info.messageId,
      from: account.user,
      fromName: account.name,
      to: to,
    });
  } catch (error) {
    console.error("Error enviando email:", error);
    return res.status(500).json({
      error: "Error al enviar email",
      details: error.message,
    });
  }
};

// Envío reutilizable server-side (usado por el cron de reporting). Misma cuenta/transporter que el
// handler HTTP; devuelve resultado estructurado, no lanza en errores de config esperados.
async function enviarCorreo({ to, subject, message, modulo, html }) {
  if (!to || !subject) return { success: false, error: "to y subject son obligatorios" };
  const account = getAccountForModule(modulo || "mediterra");
  if (!account.user || !account.pass) return { success: false, error: "Cuenta SMTP no configurada para: " + (modulo || "mediterra") };
  const transporter = nodemailer.createTransport({
    host: "smtp.office365.com", port: 587, secure: false,
    auth: { user: account.user, pass: account.pass },
    tls: { ciphers: "SSLv3", rejectUnauthorized: false },
  });
  const info = await transporter.sendMail({
    from: `"${account.name}" <${account.user}>`, to, subject, text: message || "", html: html || undefined,
  });
  return { success: true, method: "smtp", messageId: info.messageId, from: account.user };
}
module.exports.enviarCorreo = enviarCorreo;

/* eslint-disable */
// api/_correo.js — Correo con autorización comprobada en el SERVIDOR (oct-2026)
// ------------------------------------------------------------------------------
// NO es un endpoint: lo usa api/send-email.js. Sin red propia: todo lo externo
// (filas, transporte SMTP, limitador, ejecuciones del reporte) se inyecta, para
// probarlo con correo SIMULADO.
//
// Antes /api/send-email era un relé abierto: CORS "*", sin sesión, y destinatario,
// asunto y HTML los ponía quien llamaba. Ahora:
//   · Solo ACCIONES conocidas. El texto lo arma el servidor con plantillas; no se
//     acepta HTML del navegador (el único HTML sale de la plantilla del reporte diario,
//     armada en el servidor desde el snapshot inmutable, igual que el cron).
//   · Sesión emitida y verificada por el servidor: el correo y el PIN se comprueban
//     contra las filas `usuarios` y `pins` con el MISMO PBKDF2 del navegador
//     (credencial vigente de 6 dígitos) y se emite una cookie HttpOnly firmada con un
//     secreto que solo vive en el servidor (CORREO_SESSION_SECRET), acotada a esta
//     ruta. Un secreto incorporado al navegador no serviría: cualquiera lo leería.
//   · El código provisorio no necesita sesión (quien lo pide no puede entrar), pero
//     el servidor comprueba que exista ese código VIGENTE para ese usuario (la app ya lo
//     guarda cifrado en `pins`) y lo envía SOLO a la casilla registrada. La respuesta
//     es siempre la misma, para no revelar qué correos existen.
//   · Destinatarios: notificaciones solo a usuarios activos; el informe de Osiris y el
//     reporte diario, a lo que su módulo ya define (cliente del informe, destinatarios
//     del reporte), con tope y solo para quien tiene ese módulo.
//   · Origen exacto permitido (nunca "*"), límite de intentos que falla cerrado,
//     errores genéricos (sin detalles del SMTP) y TLS validado.
// ------------------------------------------------------------------------------

const crypto = require("crypto");

const COOKIE = "mediterra_correo";
const COOKIE_PATH = "/api/send-email";
const SESION_HORAS = 12;
const CAP = "correo:enviar";
const PIN_ITER = 100000;

const LIMITES = {
  sesion:  { max: 5,  ventanaMs: 15 * 60e3, bloqueoMs: 15 * 60e3 },
  codigo:  { max: 3,  ventanaMs: 60 * 60e3, bloqueoMs: 60 * 60e3 },
  envio:   { max: 60, ventanaMs: 60 * 60e3, bloqueoMs: 30 * 60e3 },
};
const TOPES = { asunto: 200, mensaje: 8000, destNotif: 25, destInforme: 10 };

const norm = (e) => String(e == null ? "" : e).trim().toLowerCase();
const parse = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return null; } };
const esEmail = (e) => /^[^\s@<>(),;:"\[\]]+@[^\s@<>(),;:"\[\]]+\.[a-z]{2,}$/i.test(String(e || ""));
const listaEmails = (v) => (Array.isArray(v) ? v : String(v || "").split(",")).map((x) => String(x).trim()).filter(Boolean);
const textoPlano = (s, max) => String(s == null ? "" : s).replace(/\r\n/g, "\n").slice(0, max);
const sinSaltos = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim();   // asunto: nada de inyección de cabeceras

// ── PIN (mismo PBKDF2 que src/pinHash.js) ──
function verificarHash(valor, cred) {
  const c = parse(cred);
  if (!c || !c.salt || !c.hash) return false;
  let calc;
  try { calc = crypto.pbkdf2Sync(String(valor), Buffer.from(c.salt, "hex"), c.iter || PIN_ITER, 32, "sha256").toString("hex"); }
  catch (e) { return false; }
  const a = Buffer.from(calc), b = Buffer.from(String(c.hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function usuarioPorEmail(usuarios, email) {
  const em = norm(email);
  const m = (Array.isArray(usuarios) ? usuarios : []).filter((u) => u && norm(u.email) === em);
  if (m.length !== 1) return null;                               // inexistente o ambiguo: falla cerrado
  const u = m[0];
  if (!u.nombre || u.desactivado) return null;
  if (usuarios.filter((x) => x && x.nombre === u.nombre).length !== 1) return null;
  return u;
}
const tieneModulo = (u, mod) => !!u && (u.rol === "admin" || (Array.isArray(u.modulos) && u.modulos.includes(mod)));

// ── Sesión firmada (HMAC con secreto del servidor) ──
const b64 = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deB64 = (s) => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
function firmar(payload, secret) {
  const body = b64(JSON.stringify(payload));
  return body + "." + b64(crypto.createHmac("sha256", secret).update(body).digest());
}
function verificarToken(token, secret, ahora) {
  if (!token || !secret) return null;
  const [body, firma, extra] = String(token).split(".");
  if (!body || !firma || extra !== undefined) return null;
  const a = Buffer.from(firma), b = Buffer.from(b64(crypto.createHmac("sha256", secret).update(body).digest()));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p; try { p = JSON.parse(deB64(body)); } catch (e) { return null; }
  if (!p || p.cap !== CAP || !p.exp || ahora > p.exp || !p.email) return null;
  return p;
}
function leerCookie(req) {
  const raw = (req.headers && req.headers.cookie) || "";
  const v = raw.split(";").map((x) => x.trim()).filter((x) => x.startsWith(COOKIE + "=")).map((x) => decodeURIComponent(x.slice(COOKIE.length + 1)));
  return v.length === 1 ? v[0] : null;                            // ausente o duplicada: sin sesión
}
const cookieSesion = (t) => `${COOKIE}=${encodeURIComponent(t)}; HttpOnly; Secure; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=${SESION_HORAS * 3600}`;
const cookieBorrar = () => `${COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=${COOKIE_PATH}; Max-Age=0`;

// ── Plantillas (el texto lo pone el servidor) ──
const PLANTILLAS = {
  codigo_provisorio: (u, codigo) => ({
    asunto: "Código provisorio - Mediterra",
    texto: `${u.nombre}\n\nTu código provisorio es: ${codigo}\n\nVence en 45 minutos. Al ingresar deberás crear un PIN nuevo de 6 dígitos. Tu PIN anterior quedó inhabilitado.\n\nSi no lo pediste, avisa a administración.`,
  }),
  // E3 (pendiente de decisión): el PIN de bienvenida sigue viajando por correo, como hoy.
  bienvenida: (d) => ({
    asunto: "Bienvenido a Mediterra Hub",
    texto: `Hola ${sinSaltos(d.nombre)},\n\nSe creó tu acceso a Mediterra Hub.\n\nCorreo: ${d.email}\nPIN temporal: ${d.pin}\nPerfil: ${sinSaltos(d.rol)}\n\nAl ingresar cambia tu PIN.`,
  }),
};

function crearCorreo(deps) {
  const { leerFilas, transporte, limitador, leerEjecucion, cfg = {}, ahora = () => Date.now(), log = () => {} } = deps;
  const secret = cfg.secret || "";
  const origenes = Array.isArray(cfg.origenes) ? cfg.origenes : [];

  const responder = (res, status, body, headers = {}) => {
    Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Cache-Control", "no-store");
    return res.status(status).json(body);
  };
  async function limitar(clave, regla, res) {
    let r;
    try { r = await limitador.golpe(clave, regla, ahora()); }
    catch (e) { responder(res, 503, { error: "no_disponible" }); return false; }   // falla cerrado
    if (!r || r.permitido !== true) { responder(res, 429, { error: "demasiados_intentos" }); return false; }
    return true;
  }
  async function enviar(cuenta, para, asunto, texto, html) {
    const r = await transporte.enviar({ cuenta, para, asunto: sinSaltos(asunto).slice(0, TOPES.asunto), texto, html });
    log({ evento: "correo_enviado", cuenta, n: para.length });
    return r;
  }

  return async function handler(req, res) {
    const origin = (req.headers && req.headers.origin) || "";
    if (origin && origenes.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); res.setHeader("Access-Control-Allow-Credentials", "true"); }
    if (req.method === "OPTIONS") return res.status(origenes.includes(origin) ? 204 : 403).end();
    if (req.method !== "POST") return responder(res, 405, { error: "metodo_no_permitido" });
    if (!origenes.includes(origin)) return responder(res, 403, { error: "origen_no_permitido" });
    if (!secret) return responder(res, 503, { error: "no_configurado" });            // sin secreto no hay sesiones: cerrado

    const body = (req.body && typeof req.body === "object") ? req.body : (parse(req.body) || {});
    const accion = body.accion;
    const ip = String((req.headers && (req.headers["x-forwarded-for"] || "")) || "").split(",")[0].trim() || "sin-ip";
    let filas;
    const cargar = async () => { if (!filas) filas = await leerFilas(); return filas; };

    try {
      // ── 1. Abrir sesión: correo + PIN, comprobados en el servidor ──
      if (accion === "sesion") {
        if (!(await limitar(`sesion:ip:${ip}`, LIMITES.sesion, res))) return;
        if (!(await limitar(`sesion:em:${norm(body.email)}`, LIMITES.sesion, res))) return;
        const { usuarios, pins } = await cargar();
        const u = usuarioPorEmail(usuarios, body.email);
        const cred = u && pins ? parse(pins[`${u.nombre}_h`]) : null;
        const vigente = cred && cred.salt && cred.hash && cred.pol === "6dig";
        if (!u || !vigente || typeof body.pin !== "string" || !verificarHash(body.pin, cred)) return responder(res, 401, { error: "credenciales" });
        const t = firmar({ cap: CAP, email: norm(u.email), nombre: u.nombre, iat: ahora(), exp: ahora() + SESION_HORAS * 3600e3 }, secret);
        return responder(res, 200, { ok: true }, { "Set-Cookie": cookieSesion(t) });
      }
      if (accion === "cerrar") return responder(res, 200, { ok: true }, { "Set-Cookie": cookieBorrar() });

      // ── 2. Código provisorio: sin sesión, comprobado contra el código guardado ──
      if (accion === "codigo_provisorio") {
        if (!(await limitar(`codigo:ip:${ip}`, { ...LIMITES.codigo, max: 10 }, res))) return;
        if (!(await limitar(`codigo:em:${norm(body.email)}`, LIMITES.codigo, res))) return;
        const { usuarios, pins } = await cargar();
        const u = usuarioPorEmail(usuarios, body.email);
        const temp = u && pins ? parse(pins[`${u.nombre}_temp`]) : null;
        const valido = u && temp && temp.salt && temp.hash && temp.exp && ahora() <= temp.exp
          && /^\d{6}$/.test(String(body.codigo || "")) && verificarHash(String(body.codigo), temp);
        if (valido) { const p = PLANTILLAS.codigo_provisorio(u, String(body.codigo)); await enviar("mediterra", [u.email], p.asunto, p.texto); }
        return responder(res, 202, { aceptado: true });                // misma respuesta siempre
      }

      // ── 3. Todo lo demás exige sesión vigente ──
      const ses = verificarToken(leerCookie(req), secret, ahora());
      if (!ses) return responder(res, 401, { error: "sin_sesion" });
      const { usuarios } = await cargar();
      const yo = usuarioPorEmail(usuarios, ses.email);
      if (!yo || yo.nombre !== ses.nombre) return responder(res, 401, { error: "sin_sesion" });   // desactivado o cambiado
      if (!(await limitar(`envio:${norm(yo.email)}`, LIMITES.envio, res))) return;

      if (accion === "notificacion") {
        const para = listaEmails(body.para);
        const internos = new Set((usuarios || []).filter((u) => u && !u.desactivado && u.email).map((u) => norm(u.email)));
        if (!para.length || para.length > TOPES.destNotif) return responder(res, 400, { error: "destinatarios" });
        if (para.some((e) => !esEmail(e) || !internos.has(norm(e)))) return responder(res, 403, { error: "destinatario_no_permitido" });
        if (!body.asunto || body.html) return responder(res, 400, { error: "contenido" });
        await enviar("mediterra", para, body.asunto, textoPlano(body.mensaje, TOPES.mensaje));
        return responder(res, 200, { success: true });
      }
      if (accion === "bienvenida") {
        if (yo.rol !== "admin") return responder(res, 403, { error: "no_autorizado" });
        if (!esEmail(body.email) || !/^\d{4,6}$/.test(String(body.pin || ""))) return responder(res, 400, { error: "contenido" });
        const p = PLANTILLAS.bienvenida({ nombre: body.nombre, email: String(body.email).trim(), pin: String(body.pin), rol: body.rol || "" });
        await enviar("mediterra", [String(body.email).trim()], p.asunto, p.texto);
        return responder(res, 200, { success: true });
      }
      if (accion === "informe_osiris") {
        if (!tieneModulo(yo, "osiris")) return responder(res, 403, { error: "no_autorizado" });
        const para = listaEmails(body.para);
        if (!para.length || para.length > TOPES.destInforme || para.some((e) => !esEmail(e))) return responder(res, 400, { error: "destinatarios" });
        if (!body.asunto || body.html) return responder(res, 400, { error: "contenido" });
        await enviar("osiris", para, body.asunto, textoPlano(body.mensaje, 20000));
        return responder(res, 200, { success: true });
      }
      if (accion === "reporte_diario") {
        if (!tieneModulo(yo, "allegria_service")) return responder(res, 403, { error: "no_autorizado" });
        const ej = await leerEjecucion({ empresaId: body.empresaId, ejecucionId: body.ejecucionId });
        if (!ej) return responder(res, 404, { error: "ejecucion" });
        if (ej.estado === "enviado") return responder(res, 409, { error: "ya_enviado" });
        const para = (ej.destinatarios_snapshot || []).map((d) => d && d.email).filter(esEmail);
        if (!para.length) return responder(res, 400, { error: "destinatarios" });
        const { asunto, html, texto } = deps.armarReporte(ej);          // misma plantilla que el cron
        const r = await enviar("allegria", para, asunto, texto, html);
        return responder(res, 200, { success: true, method: "smtp", messageId: r && r.messageId });
      }
      return responder(res, 400, { error: "accion_no_permitida" });
    } catch (e) {
      log({ evento: "correo_error", accion, motivo: String((e && e.message) || e).slice(0, 80) });
      return responder(res, 502, { error: "no_enviado" });             // genérico: sin detalles del SMTP
    }
  };
}

module.exports = { crearCorreo, verificarHash, verificarToken, firmar, COOKIE, COOKIE_PATH, LIMITES, TOPES, CAP };

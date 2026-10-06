/* eslint-disable */
// api/_segServidor.js — E/S compartida de api/auth/[op].js y api/datos/[fila].js
// ------------------------------------------------------------------------------
// NO es un endpoint. Lee/escribe filas de calendario_data con la llave de
// SERVICIO (solo servidor), resuelve la sesión releyendo el padrón en CADA
// petición y decide quién es ADMIN: SOLO una fila activa en
// public.seg_administradores (nunca el rol de main/usuarios, la cookie ni metadata).
//
// Variables de entorno (Vercel, por NOMBRE): SUPABASE_SERVICE_ROLE_KEY,
// SESSION_SECRET, AUTH_RATELIMIT_SECRET, OSIRIS_VERIFICAR_SECRETO,
// SMTP_MEDITERRA_USER/PASS (correo). Opcionales: SUPABASE_URL (staging/pruebas),
// AUTH_RL_IP_MAX, AUTH_RL_ID_MAX (límites del rate limit).

const A = require("./_auth");
const R = require("./_reglasLogin");
const RL = require("./_friskuSpRateLimiter");

const MAX_BODY = 4 * 1024 * 1024;

function json(res, status, obj, extra) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (extra) for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  return res.status(status).json(obj);
}
function hdr(req, k) { const h = req.headers || {}; return h[k] || h[k.toLowerCase()] || ""; }
function cuerpo(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { return null; } }
  return b && typeof b === "object" && !Array.isArray(b) ? b : null;
}
// Mutaciones solo con JSON (obliga a preflight CORS desde otro origen; la cookie
// además es SameSite=Strict).
function esJSON(req) { return /application\/json/i.test(hdr(req, "content-type")); }
function ipDe(req) {
  return RL.normalizarIp(hdr(req, "x-vercel-forwarded-for") || hdr(req, "x-real-ip") || hdr(req, "x-forwarded-for"));
}

// ── Filas de calendario_data (service_role) ──
function parseValor(v) {
  if (typeof v === "string") { try { return { valor: JSON.parse(v), eraTexto: true }; } catch (e) { return { valor: null, eraTexto: true }; } }
  return { valor: v, eraTexto: false };
}
async function leerFila(id) {
  const r = await A.supaFetch(`calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!r.ok) throw new Error(`leer_${id}_http_${r.status}`);
  const filas = await r.json();
  if (!Array.isArray(filas) || filas.length > 1) throw new Error(`leer_${id}_forma`);
  if (filas.length === 0) return { existe: false, valor: null, version: null, eraTexto: false };
  const { valor, eraTexto } = parseValor(filas[0].value);
  return { existe: true, valor, version: filas[0].updated_at || null, eraTexto };
}
// Escritura condicionada a la versión leída (PATCH ... &updated_at=eq.<versión>).
// Sin versión (fila inexistente) → POST sin merge (409 = ya existe → conflicto).
// → { ok:true, version } | { ok:false, conflicto:true }
async function escribirFila(id, valor, version, eraTexto) {
  const value = eraTexto ? JSON.stringify(valor) : valor;
  // Versión nueva estrictamente posterior a la leída (dos escrituras en el mismo
  // milisegundo no deben dejar la misma versión).
  const previa = version ? Date.parse(version) : NaN;
  const updated_at = new Date(Math.max(Date.now(), Number.isFinite(previa) ? previa + 1 : 0)).toISOString();
  const H = { "Content-Type": "application/json", Prefer: "return=representation" };
  let r;
  if (version) {
    r = await A.supaFetch(`calendario_data?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(version)}&select=updated_at`, {
      method: "PATCH", headers: H, body: JSON.stringify({ value, updated_at }),
    });
  } else {
    r = await A.supaFetch(`calendario_data?select=updated_at`, {
      method: "POST", headers: H, body: JSON.stringify({ id, value, updated_at }),
    });
    if (r.status === 409) return { ok: false, conflicto: true };
  }
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`escribir_${id}_http_${r.status}:${t.slice(0, 200)}`); }
  const filas = await r.json();
  if (!Array.isArray(filas) || filas.length === 0) return { ok: false, conflicto: true };
  return { ok: true, version: filas[0].updated_at };
}
// Lee-modifica-escribe con reintento ante conflicto. `cambio(valor)` devuelve el
// valor nuevo o { abortar: <resultado> } para no escribir.
async function actualizarFila(id, cambio, intentos = 4) {
  for (let i = 0; i < intentos; i++) {
    const f = await leerFila(id);
    const nuevo = cambio(f.valor, f);
    if (nuevo && nuevo.abortar !== undefined) return { abortado: nuevo.abortar };
    const w = await escribirFila(id, nuevo, f.existe ? f.version : null, f.eraTexto);
    if (w.ok) return { ok: true, version: w.version };
  }
  throw new Error(`actualizar_${id}_conflicto_persistente`);
}

async function leerUsuarios() {
  const f = await leerFila("usuarios");
  if (!f.existe || !Array.isArray(f.valor)) throw new Error("usuarios_forma");
  return { usuarios: f.valor, version: f.version, eraTexto: f.eraTexto };
}
async function leerPins() {
  const f = await leerFila("pins");
  if (f.existe && (!f.valor || typeof f.valor !== "object" || Array.isArray(f.valor))) throw new Error("pins_forma");
  return f.existe ? f.valor : {};
}

// ADMIN = fila activa en seg_administradores, leída en CADA petición. Error → lanza (503).
async function esAdmin(email) {
  const em = String(email || "").trim().toLowerCase();
  if (!em) return false;
  const r = await A.supaFetch(`seg_administradores?email=eq.${encodeURIComponent(em)}&activo=is.true&select=email`, {
    headers: { "Cache-Control": "no-cache" },
  });
  if (!r.ok) throw new Error(`admins_http_${r.status}`);
  const filas = await r.json();
  return Array.isArray(filas) && filas.length === 1;
}

// Sesión: cookie HMAC válida + usuario vigente en la fila `usuarios` (por email,
// mismo nombre). Desactivado o ausente → 401. Scope "completa" salvo que se pida otro.
// → { ok:true, ses, usuario, usuarios } | { ok:false, status, error }
async function resolverSesion(req, { permitirCambioPin = false } = {}) {
  const ses = A.sesionCualquierScope(req);
  if (!ses) return { ok: false, status: 401, error: "sin_sesion" };
  if (ses.scope !== "completa" && !permitirCambioPin) return { ok: false, status: 403, error: "sin_permiso" };
  const { usuarios, version } = await leerUsuarios();
  const u = R.buscarUsuario(usuarios, ses.email);
  if (!u || u.nombre !== ses.nombre || u.desactivado) return { ok: false, status: 401, error: "sin_sesion" };
  return { ok: true, ses, usuario: u, usuarios, versionUsuarios: version };
}

// ── Rate limit (RPC frisku_sp_rl_consumir, buckets HMAC con secreto propio) ──
function reglas() {
  const n = (v, d) => { const x = parseInt(v || "", 10); return Number.isFinite(x) && x > 0 ? x : d; };
  return {
    ip: { ventanaMs: 5 * 60 * 1000, max: n(process.env.AUTH_RL_IP_MAX, 30), bloqueoMs: 15 * 60 * 1000, tipo: "ip" },
    id: { ventanaMs: 5 * 60 * 1000, max: n(process.env.AUTH_RL_ID_MAX, 8), bloqueoMs: 15 * 60 * 1000, tipo: "identidad" },
  };
}
let limiterInyectado = null;
function limiter() {
  if (limiterInyectado) return limiterInyectado;
  return RL.crearLimiterSupabase({
    supaUrl: A.SUPA_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    hmacSecret: process.env.AUTH_RATELIMIT_SECRET || "",
    fetchImpl: typeof fetch === "function" ? fetch : null,
  });
}
// → "ok" | "bloqueado" | "no_disponible" (fail-closed)
async function limitar(clave, regla) {
  try {
    const r = await limiter().golpe(`auth:${clave}`, regla);
    return r && r.permitido === true ? "ok" : "bloqueado";
  } catch (e) { return "no_disponible"; }
}

// ── Correo (mismo transporte SMTP de api/send-email.js) ──
let correoInyectado = null;
async function enviarCorreo(msg) {
  if (correoInyectado) return correoInyectado(msg);
  const { enviarCorreo: smtp } = require("./send-email");
  return smtp({ ...msg, modulo: "mediterra" });
}
function textoCodigo(nombre, codigo, saludo) {
  return `${saludo ? `Hola ${nombre},\n\n` : ""}Tu código provisorio es: ${codigo}\n\nVence en 45 minutos. Al ingresar deberás crear un PIN nuevo de 6 dígitos. Tu PIN anterior quedó inhabilitado.\n\nhttps://gestion-grupo-mediterra.vercel.app`;
}

// SOLO PARA PRUEBAS en el mismo proceso (scripts/seguridad-main-pins/entorno.mjs).
const __pruebas = {
  setEnviarCorreo(fn) { correoInyectado = fn; },
  setLimiter(l) { limiterInyectado = l; },
};

module.exports = {
  MAX_BODY, json, hdr, cuerpo, esJSON, ipDe,
  leerFila, escribirFila, actualizarFila, leerUsuarios, leerPins,
  esAdmin, resolverSesion, reglas, limitar, enviarCorreo, textoCodigo, __pruebas,
};

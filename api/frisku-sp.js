/* eslint-disable */
// api/frisku-sp.js — Proxy READ-ONLY SharePoint/Graph para Frisku (S4.1, hardened)
// ------------------------------------------------------------------------------
// POST { op:"login", email, pin }   → verifica server-side + emite cookie exclusiva.
// POST { op:"logout" }              → borra la cookie.
// POST { op:"list"|"search"|"item" }→ exige cookie válida (cap frisku-sp:read); GET Graph.
// Nada escribe (Supabase ni SharePoint). El frontend nunca recibe el token OIDC ni el de Graph.
// Todas las dependencias externas son inyectables (crearHandler) para test con mocks.
//
// FAIL-CLOSED: el rate limiter es una dependencia OBLIGATORIA y distribuida (contrato abajo).
// El handler de producción NO trae limiter en memoria; sin limiter configurado o si el limiter
// falla, login responde 503 y NO verifica PIN ni emite cookie.
//
// Secretos (Vercel env, jamás en el bundle): FRISKU_SP_SESSION_SECRET, SUPABASE_SERVICE_ROLE_KEY.
// No secretos: AZURE_TENANT_ID, AZURE_CLIENT_ID, FRISKU_SP_DRIVE_ID,
//   FRISKU_SP_ALLOWED_ORIGINS, FRISKU_SP_ALLOWED_HOSTS (coma-separados).
//
// Sin console.* en este módulo ni en _friskuSpAuth/_friskuSpGraph: no se registran body,
// cookies, Authorization, email, PIN, tokens ni respuestas crudas de Graph.

const A = require("./_friskuSpAuth");
const G = require("./_friskuSpGraph");
const RL = require("./_friskuSpRateLimiter");

// Dos capas independientes (defaults conservadores; configurables por env en prod).
// IP: 30/5min; identidad(email): 8/5min; op(sesión): 60/min. Bloqueo temporal (no permanente).
const RL_IP = { ventanaMs: 5 * 60 * 1000, max: 30, bloqueoMs: 15 * 60 * 1000, tipo: "ip" };
const RL_ID = { ventanaMs: 5 * 60 * 1000, max: 8, bloqueoMs: 15 * 60 * 1000, tipo: "identidad" };
const RL_OP = { ventanaMs: 60 * 1000, max: 60, bloqueoMs: 60 * 1000, tipo: "identidad" };
const MAX_BODY = 2048;            // bytes
const MAX_EMAIL = 320, MAX_PIN = 12;
const CAMPOS = {
  login: ["op", "email", "pin"], logout: ["op"],
  list: ["op", "carpetaId", "top"], search: ["op", "q", "top"], item: ["op", "itemId"],
};

// ── Contrato del rate limiter (OBLIGATORIO, distribuido, inyectable) ──
//   golpe(key: string, regla: {ventanaMs, max}) => Promise<{ permitido: boolean }>
//   - Atómico e independiente de instancia (store distribuido); NO memoria por instancia.
//   - Debe lanzar/rechazar si el store no está disponible → el handler lo trata como 503.
// Producción recomendada (capability EXCLUSIVA Frisku, NO reutilizar PROC/Osiris/otros):
//   (a) RPC/tabla dedicada en Supabase p. ej. `frisku_sp_ratelimit(key,count,reset)` con
//       incremento atómico server-side; o (b) KV/Redis administrado. Se implementa/despliega
//       en una fase aparte con autorización; aquí solo se define y se exige fail-closed.
function limiterNoConfigurado() {
  return { async golpe() { throw new Error("rate_limiter_no_configurado"); } };
}
// SOLO PARA TESTS: limiter en memoria por clave. Nunca usar como protección real en producción.
function crearRateLimiterMemoriaSoloTest() {
  const m = new Map();
  return {
    async golpe(key, regla, ahora) {
      const now = Number.isFinite(ahora) ? ahora : Date.now();
      const e = m.get(key);
      if (!e || now > e.reset) { m.set(key, { n: 1, reset: now + regla.ventanaMs }); return { permitido: true, retry_after_seg: 0 }; }
      e.n++;
      const permitido = e.n <= regla.max;
      return { permitido, retry_after_seg: permitido ? 0 : Math.ceil((regla.bloqueoMs || regla.ventanaMs || 0) / 1000) };
    },
  };
}

// IP del cliente desde señales de confianza de Vercel. `x-forwarded-for` lo sobrescribe Vercel
// (no reenvía IPs externas → anti-spoofing); `x-vercel-forwarded-for`/`x-real-ip` son idénticas
// y no las pisa un proxy encima. Se normaliza (no se persiste ni registra la IP original).
function ipDe(req) {
  const raw = hdr(req, "x-vercel-forwarded-for") || hdr(req, "x-real-ip") || hdr(req, "x-forwarded-for");
  return RL.normalizarIp(raw);
}
function hdr(req, k) { return (req.headers && (req.headers[k] || req.headers[k.replace(/(^|-)([a-z])/g, (m) => m.toUpperCase())])) || ""; }

function tamanoBody(req) {
  const cl = parseInt(hdr(req, "content-length") || "0", 10);
  if (Number.isFinite(cl) && cl > 0) return cl;
  const b = req.body;
  if (typeof b === "string") return Buffer.byteLength(b, "utf8");
  if (b && typeof b === "object") { try { return Buffer.byteLength(JSON.stringify(b), "utf8"); } catch (e) { return MAX_BODY + 1; } }
  return 0;
}
function parseBody(req) {
  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { return null; } }
  return (b && typeof b === "object" && !Array.isArray(b)) ? b : null;
}
function camposValidos(body, op) {
  const permitidos = CAMPOS[op];
  if (!permitidos) return false;
  return Object.keys(body).every(k => permitidos.includes(k));   // rechaza propiedades extra
}

function json(res, status, obj, extraHeaders) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  return res.status(status).json(obj);
}

// Fábrica testeable. deps = { leerDatos, obtenerTokenOidc, fetchImpl, rate(OBLIGATORIO), ahora, cfg }.
function crearHandler(deps = {}) {
  const cfg = deps.cfg || {};
  const secret = cfg.secret || "";
  const origenes = Array.isArray(cfg.origenesPermitidos) ? cfg.origenesPermitidos : [];
  const hosts = Array.isArray(cfg.hostsPermitidos) ? cfg.hostsPermitidos : [];
  const rate = deps.rate || limiterNoConfigurado();   // sin limiter → fail-closed
  const fetchImpl = deps.fetchImpl || (typeof fetch === "function" ? fetch : null);
  const ahora = deps.ahora || (() => Date.now());
  const obtenerTokenOidc = deps.obtenerTokenOidc || ((req) => hdr(req, "x-vercel-oidc-token") || null);
  const leerDatos = deps.leerDatos;
  // Contador COMPARTIDO con el login de la app (auth:login:<email>, api/_segServidor.js):
  // este endpoint también verifica el PIN, así que no puede sumar intentos aparte.
  // (email) → "ok" | "bloqueado" | "no_disponible". Producción siempre lo trae.
  const limiteLogin = deps.limiteLogin || null;

  async function limitar(key, regla, res) {
    let r;
    try { r = await rate.golpe(key, regla, ahora()); }
    catch (e) { json(res, 503, { error: "no_disponible" }); return false; }   // fail-closed ANTES de verificar PIN
    if (!r || r.permitido !== true) {
      const ra = (r && Number.isFinite(r.retry_after_seg)) ? r.retry_after_seg : Math.ceil((regla.bloqueoMs || 0) / 1000);
      return json(res, 429, { error: "rate_limit" }, { "Retry-After": String(ra) }), false;
    }
    return true;
  }

  return async function handler(req, res) {
    // Origin (obligatorio, allowlist exacta, nunca *) + Host (allowlist independiente).
    const origin = hdr(req, "origin");
    const host = hdr(req, "host");
    const originOk = !!origin && origenes.includes(origin);
    const hostOk = !!host && hosts.includes(host);
    if (originOk) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    if (req.method === "OPTIONS") return res.status(originOk ? 204 : 403).end();
    if (!originOk) return json(res, 403, { error: "origen_no_permitido" });
    if (!hostOk) return json(res, 403, { error: "host_no_permitido" });
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "metodo" }); }
    if (!/application\/json/i.test(hdr(req, "content-type"))) return json(res, 415, { error: "content_type" });
    if (tamanoBody(req) > MAX_BODY) return json(res, 413, { error: "body_grande" });

    const body = parseBody(req);
    if (!body) return json(res, 400, { error: "body_invalido" });
    const op = body.op;
    if (!camposValidos(body, op)) return json(res, 400, { error: "op_desconocida" });

    if (op === "login") return login(req, res, body);
    if (op === "logout") return json(res, 200, { ok: true }, { "Set-Cookie": A.cookieBorrarSp() });
    return opGraph(req, res, body, op);
  };

  async function login(req, res, body) {
    const email = A.normalizarEmail(body.email);
    const pin = body.pin;
    // Validaciones de forma (PIN nunca se convierte a número; longitudes máximas).
    if (typeof body.email !== "string" || email.length > MAX_EMAIL) return json(res, 401, { error: "credenciales" });
    if (typeof pin !== "string" || pin.length > MAX_PIN || pin.length === 0) return json(res, 401, { error: "credenciales" });
    // Rate limit ANTES de tocar datos o verificar PIN (fail-closed si el limiter falla).
    // Dos capas independientes: IP (no se resetea por un login exitoso) e identidad(email).
    const ip = ipDe(req);
    if (!ip) return json(res, 503, { error: "no_disponible" });   // sin IP confiable → no se puede limitar → cerrado
    if (!await limitar(ip, RL_IP, res)) return;
    if (!await limitar(email, RL_ID, res)) return;
    // Contadores combinados de la app (api/_intentos.js): devuelve "ok" | "bloqueado" |
    // "verificacion" | "no_disponible", o { estado:"ok", liberar } para liberar si el PIN es correcto.
    let liberarLogin = null;
    if (limiteLogin) {
      let l;
      try { l = await limiteLogin(email, ip); } catch (e) { l = "no_disponible"; }
      if (l && typeof l === "object") { liberarLogin = l.liberar || null; l = l.estado; }
      if (l === "bloqueado") return json(res, 429, { error: "rate_limit" }, { "Retry-After": String(Math.ceil(RL_ID.bloqueoMs / 1000)) });
      // Umbral por cuenta superado: desde aquí no se prueba el PIN (verificación por correo en la app).
      if (l === "verificacion") return json(res, 403, { error: "verificacion_requerida" });
      if (l !== "ok") return json(res, 503, { error: "no_disponible" });
    }
    if (!secret) return json(res, 503, { error: "no_configurado" });
    let datos;
    try { datos = await leerDatos(); } catch (e) { return json(res, 503, { error: "no_disponible" }); }
    if (!datos || !Array.isArray(datos.usuarios)) return json(res, 503, { error: "no_disponible" });
    const r = A.evaluarAcceso({ usuarios: datos.usuarios, pins: datos.pins, email, pin, secret });
    if (!r.ok && r.motivo === "sin_capability") return json(res, 403, { error: "sin_capability" });
    if (!r.ok) return json(res, 401, { error: "credenciales" });
    if (liberarLogin) { try { await liberarLogin(); } catch (e) { /* el contador vence solo */ } }
    const token = A.firmarSesionSp(r.sub, secret, ahora());     // sesión NUEVA cada login (anti-fijación)
    return json(res, 200, { ok: true, cap: A.CAP }, { "Set-Cookie": A.cookieSesionSp(token) });
  }

  async function opGraph(req, res, body, op) {
    const ses = A.verificarSesionSp(A.leerCookieSp(req), secret, ahora());   // cookie dup/ambigua → null → 401
    if (!ses) return json(res, 401, { error: "sin_sesion" });
    if (!await limitar(`op:${ses.sub}`, RL_OP, res)) return;
    if (!cfg.tenantId || !cfg.clientId) return json(res, 503, { error: "no_configurado" });

    const oidc = obtenerTokenOidc(req);   // header inyectado por Vercel; un token forjado por el
    if (!oidc) return json(res, 503, { error: "no_configurado" });  // cliente NO valida en Entra (fail-closed upstream)
    const tok = await G.obtenerTokenGraph({ oidcToken: oidc, tenantId: cfg.tenantId, clientId: cfg.clientId, fetchImpl });
    if (!tok.ok) { console.error("frisku-sp graphdiag:token_exchange"); return json(res, 502, { error: "auth_upstream" }); } // diag privado; respuesta pública sin cambios

    // Resolución del drive por enumeración de bibliotecas (coincidencia exacta y única "Documentos").
    const drive = await G.resolverDriveFrisku(tok.token, fetchImpl);
    if (!drive.ok) {
      const st = Number.isInteger(drive.status) ? drive.status : "x";
      console.error("frisku-sp graphdiag:resolve_" + (drive.error || "err") + "_" + st);   // diag temporal; etapa + status, sin datos
      return json(res, drive.status === 403 ? 403 : 502, { error: "graph" });
    }
    const cfgDrive = { ...cfg, driveId: drive.driveId };
    const mapErr = { 403: 403, 404: 404, 429: 429 };   // 401 de Graph = problema del proxy, no del usuario
    const diagOp = (st) => { if (!mapErr[st]) console.error("frisku-sp graphdiag:op_" + (Number.isInteger(st) ? st : "x")); };

    // "item": lectura puntual por id (GET). "list"/"search": recorrido BFS acotado (sin search());
    // el filtrado/puntaje lo hace el matcher S5A en el cliente sobre los items devueltos.
    if (op === "item") {
      const built = G.construirUrlGraph("item", body, cfgDrive);
      if (!built.ok) return json(res, 400, { error: built.error });
      const r = await G.graphGet(built.url, tok.token, fetchImpl);
      if (!r.ok) { diagOp(r.status); return json(res, mapErr[r.status] || 502, { error: "graph" }); }
      return json(res, 200, G.normalizarRespuesta(r.json, cfgDrive));
    }

    const rec = await G.listarBibliotecaBFS(drive.driveId, tok.token, fetchImpl);
    if (!rec.ok) { diagOp(rec.status); return json(res, mapErr[rec.status] || 502, { error: "graph" }); }
    const items = rec.items.map((it) => G.normalizarDriveItem(it, cfgDrive)).filter(Boolean);
    return json(res, 200, { items, nextCursor: undefined, truncated: !!rec.truncated });
  }
}

// ── Handler de producción (dependencias reales) ──
// Misma regla de aislamiento que api/_auth.js: en una Preview sin SUPABASE_URL no hay URL
// (la lectura falla → 503); en producción el valor no cambia.
const SUPA_URL = require("./_auth").urlSupabase();
// Los usuarios viven en la fila id="usuarios" (value = array; fuente de verdad del padrón,
// la misma que usa la app; main.usuarios es solo un espejo de compatibilidad) y los PIN en
// id="pins" (value). SOLO lectura (GET). Sin defaults ni fallback a WORKERS_BASE: cualquier
// ausencia, duplicado, forma inesperada o error de red lanza → 503 aguas arriba (fail-closed).
// fetchImpl inyectable para test; en producción usa el fetch global.
async function leerDatosProd(fetchImpl) {
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) throw new Error("sin_fetch");
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!service) throw new Error("sin_service_key");
  const H = { apikey: service, Authorization: `Bearer ${service}` };
  const [ru, rp] = await Promise.all([
    f(`${SUPA_URL}/rest/v1/calendario_data?id=eq.usuarios&select=value`, { headers: H }),
    f(`${SUPA_URL}/rest/v1/calendario_data?id=eq.pins&select=value`, { headers: H }),
  ]);
  if (!ru.ok || !rp.ok) throw new Error("supa_no_ok");
  const ju = await ru.json().catch(() => null);
  const jp = await rp.json().catch(() => null);
  // Exactamente una fila por consulta (vacío/duplicado → error).
  if (!Array.isArray(ju) || ju.length !== 1) throw new Error("usuarios_row");
  if (!Array.isArray(jp) || jp.length !== 1) throw new Error("pins_row");
  let usuarios = ju[0] && ju[0].value;
  // La fila puede venir guardada como texto JSON (mismo criterio que dbLoadUsuarios).
  if (typeof usuarios === "string") { try { usuarios = JSON.parse(usuarios); } catch (e) { usuarios = null; } }
  const pins = jp[0] && jp[0].value;
  // usuarios array; pins objeto no-array. Sin defaults.
  if (!Array.isArray(usuarios)) throw new Error("usuarios_shape");
  if (!pins || typeof pins !== "object" || Array.isArray(pins)) throw new Error("pins_shape");
  return { usuarios, pins };
}

const handlerProd = crearHandler({
  leerDatos: leerDatosProd,
  // Mismos contadores combinados que /api/auth/login (requiere AUTH_RATELIMIT_SECRET; sin él → 503).
  limiteLogin: async (email, ip) => {
    const I = require("./_intentos");
    const r = await I.reservarLogin({ email, ip, dispositivo: null, canal: "frisku" });
    if (!r.ok) return r.status === 429 ? "bloqueado" : "verificacion";
    if (r.soloCodigo) return "verificacion";
    return { estado: "ok", liberar: () => r.liberar(false) };
  },
  // PRODUCCIÓN: limiter distribuido en Supabase (RPC frisku_sp_rl_consumir). Si falta
  // FRISKU_SP_RATELIMIT_SECRET o la service key, golpe() lanza → login 503 (fail-closed).
  rate: RL.crearLimiterSupabase({
    supaUrl: SUPA_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    hmacSecret: process.env.FRISKU_SP_RATELIMIT_SECRET || "",
    fetchImpl: (typeof fetch === "function" ? fetch : null),
  }),
  cfg: {
    secret: process.env.FRISKU_SP_SESSION_SECRET || "",
    tenantId: process.env.AZURE_TENANT_ID || "",
    clientId: process.env.AZURE_CLIENT_ID || "",
    driveId: process.env.FRISKU_SP_DRIVE_ID || "",
    origenesPermitidos: (process.env.FRISKU_SP_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean),
    hostsPermitidos: (process.env.FRISKU_SP_ALLOWED_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean),
  },
});

module.exports = handlerProd;
module.exports.crearHandler = crearHandler;
module.exports.limiterNoConfigurado = limiterNoConfigurado;
module.exports.crearRateLimiterMemoriaSoloTest = crearRateLimiterMemoriaSoloTest;
module.exports.leerDatosProd = leerDatosProd;

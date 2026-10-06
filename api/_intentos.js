/* eslint-disable */
// api/_intentos.js — Límite de intentos combinado (D4) y equipo reconocido
// ------------------------------------------------------------------------------
// NO es un endpoint. Contadores en Postgres (api/sql/seg_intentos.sql), compartidos
// por todas las instancias, atómicos (FOR UPDATE), con demora progresiva y tope:
//
//   K1  cuenta + origen  (origen = equipo reconocido o IP/64)  5 fallos libres → 1,2,4…60 min
//   K2  origen (IP/64, todas las cuentas)                      30 fallos/15 min → 5…60 min
//   K3  cuenta, orígenes NO reconocidos (acumulado 30 días)    10 fallos → ningún origen
//       nuevo prueba PIN: solo con el código enviado por correo (verificación adicional)
//   KD  equipo reconocido (acumulado 30 días)                  10 fallos → deja de contar
//       como reconocido (pasa a K3)
//   KC  código por correo: 5 intentos por código; KCA 20 acumulados en 30 días
//
// Un intento se RESERVA antes de evaluar la credencial (cuenta como fallo provisional:
// concurrentes no pueden pasarse del límite) y se LIBERA si resulta correcto.
// Ningún bloqueo es indefinido: todos tienen tope y vencen; el administrador puede
// liberar K3/KC/KCA de una cuenta ("desbloquear", dentro de admin-reset-pin).
//
// Equipo reconocido: cookie `mediterra_disp` (HttpOnly, Secure, SameSite=Strict,
// Path=/api/auth, 90 días) con {t:"disp", e:email, d:id aleatorio 128 bits, v:época, exp}
// firmada con HMAC-SHA256 y una llave DERIVADA de SESSION_SECRET solo para este uso.
// Sin la llave no se puede fabricar; vale solo para su correo y su época (el cambio de
// PIN y el reseteo del admin la suben); no da acceso: solo permite PROBAR el PIN desde
// ese equipo con sus propios límites (K1, KD). La IP no forma parte del reconocimiento.

const crypto = require("crypto");
const A = require("./_auth");
const RL = require("./_friskuSpRateLimiter");

const DIA = 86400;
const BASE = {
  K1: { libres: 5, base: 60, tope: 3600, reinicio: DIA },
  K2: { libres: 30, base: 300, tope: 3600, reinicio: 900 },
  K3: { libres: 10, base: 30 * DIA, tope: 30 * DIA, reinicio: 30 * DIA },
  KD: { libres: 10, base: 30 * DIA, tope: 30 * DIA, reinicio: 30 * DIA },
  KC: { libres: 5, base: 2700, tope: 2700, reinicio: 2700 },
  KCA: { libres: 20, base: 30 * DIA, tope: 30 * DIA, reinicio: 30 * DIA },
};
// AUTH_INTENTOS_FACTOR acorta los tiempos SOLO fuera de producción (pruebas en tiempo real).
function reglas(env = process.env) {
  const f = env.VERCEL_ENV !== "production" ? Number(env.AUTH_INTENTOS_FACTOR) : NaN;
  const k = Number.isFinite(f) && f > 0 && f <= 1 ? f : 1;
  const out = {};
  for (const [n, r] of Object.entries(BASE)) {
    out[n] = { ...r, base: Math.max(1, Math.round(r.base * k)), tope: Math.max(1, Math.round(r.tope * k)), reinicio: Math.max(1, Math.round(r.reinicio * k)) };
  }
  return out;
}

// IPv6 se agrupa por /64 (un mismo cliente controla todo su /64); IPv4 tal cual.
function origenIp(ipNormalizada) {
  const ip = String(ipNormalizada || "");
  if (!ip.includes(":")) return ip;
  const partes = ip.split("::");
  const izq = partes[0] ? partes[0].split(":") : [];
  const der = partes.length > 1 && partes[1] ? partes[1].split(":") : [];
  const completo = partes.length > 1 ? [...izq, ...Array(8 - izq.length - der.length).fill("0"), ...der] : izq;
  return completo.slice(0, 4).map((x) => (x || "0").toLowerCase()).join(":") + "::/64";
}

function bucket(tipo, clave) {
  const secreto = process.env.AUTH_RATELIMIT_SECRET || "";
  if (!secreto) throw new Error("intentos_no_configurado");
  return RL.bucketHmac(secreto, `seg:${tipo}:${clave}`);
}
async function rpc(nombre, cuerpo) {
  const r = await A.supaFetch(`rpc/${nombre}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
  if (!r.ok) throw new Error(`intentos_${nombre}_http_${r.status}`);
  return r.json();
}
async function tomar(tipo, clave, regla) {
  const filas = await rpc("seg_intento_tomar", { p_bucket: bucket(tipo, clave), p_tipo: tipo, p_libres: regla.libres,
    p_base_seg: regla.base, p_tope_seg: regla.tope, p_reinicio_seg: regla.reinicio });
  const f = Array.isArray(filas) ? filas[0] : filas;
  if (!f || typeof f.permitido !== "boolean") throw new Error("intentos_forma");
  return { permitido: f.permitido, retry: f.retry_seg || 0 };
}
async function estado(tipo, clave) {
  const filas = await rpc("seg_intento_estado", { p_bucket: bucket(tipo, clave) });
  const f = Array.isArray(filas) ? filas[0] : filas;
  if (!f || typeof f.bloqueado !== "boolean") throw new Error("intentos_forma");
  return { bloqueado: f.bloqueado, retry: f.retry_seg || 0 };
}
async function liberar(pares) {
  if (!pares.length) return 0;
  return rpc("seg_intento_liberar", { p_buckets: pares.map(([t, c]) => bucket(t, c)) });
}
async function descontar(pares, libres) {
  if (!pares.length) return 0;
  return rpc("seg_intento_descontar", { p_buckets: pares.map(([t, c]) => bucket(t, c)), p_libres: libres });
}

// Reserva un intento de login. `origen` = { ip (normalizada) | null, dispositivo (id) | null,
// canal: "app" | "osiris" | "frisku" }. `hayCodigo` = existe un código vigente.
// → { ok:true, soloCodigo, liberar(viaCodigo) }  |  { ok:false, status, error, retry }
async function reservarLogin({ email, ip, dispositivo, canal = "app", hayCodigo = false, idCodigo = "" }) {
  const R = reglas();
  const em = String(email || "").trim().toLowerCase();
  const tomados = [];       // contadores a liberar si la credencial resulta correcta
  const descontables = [];  // contadores a los que solo se descuenta este intento (K2)
  if (ip) {
    const k2 = await tomar("K2", origenIp(ip), R.K2);
    if (!k2.permitido) return { ok: false, status: 429, error: "bloqueado", retry: k2.retry };
    descontables.push(["K2", origenIp(ip)]);
  }
  let disp = dispositivo || null;
  if (disp) {
    const kd = await estado("KD", `${disp}|${em}`);
    if (kd.bloqueado) disp = null;           // el equipo dejó de contar como reconocido
  }
  let soloCodigo = false;
  if (!disp) soloCodigo = (await estado("K3", em)).bloqueado;
  const claveK1 = disp ? `disp:${disp}|${em}` : `${canal}:${ip ? origenIp(ip) : "-"}|${em}`;
  const k1 = await tomar("K1", claveK1, R.K1);
  if (!k1.permitido) return { ok: false, status: 429, error: "bloqueado", retry: k1.retry };
  tomados.push(["K1", claveK1]);
  if (disp) {
    await tomar("KD", `${disp}|${em}`, R.KD);
    tomados.push(["KD", `${disp}|${em}`]);
  } else if (!soloCodigo) {
    const k3 = await tomar("K3", em, R.K3);
    if (!k3.permitido) soloCodigo = true; else tomados.push(["K3", em]);
  }
  const tomadosCodigo = [];
  if (hayCodigo) {
    // Cada intento con un código pendiente puede ser una adivinación del código.
    const kca = await tomar("KCA", em, R.KCA);
    if (!kca.permitido) return { ok: false, status: 403, error: "verificacion_bloqueada", retry: kca.retry };
    tomadosCodigo.push(["KCA", em]);
    const kc = await tomar("KC", `${em}|${idCodigo}`, R.KC);
    if (!kc.permitido) return { ok: false, status: 403, error: "codigo_agotado", retry: kc.retry };
    tomadosCodigo.push(["KC", `${em}|${idCodigo}`]);
  }
  return {
    ok: true, soloCodigo, dispositivo: disp,
    // Credencial correcta: se liberan los contadores de ESTE origen y los de código.
    // Con el código (verificación adicional) también se libera K3: la persona demostró
    // acceso a su correo.
    liberar: async (viaCodigo) => {
      const pares = [...tomados, ...tomadosCodigo];
      if (viaCodigo) pares.push(["K3", em]);
      await liberar(pares);
      await descontar(descontables, R.K2.libres);
    },
  };
}

// Desbloqueo por el administrador: libera K3, KCA y el KC del código vigente.
async function desbloquearCuenta(email, idCodigo) {
  const em = String(email || "").trim().toLowerCase();
  const pares = [["K3", em], ["KCA", em]];
  if (idCodigo) pares.push(["KC", `${em}|${idCodigo}`]);
  return liberar(pares);
}

// ── Equipo reconocido ──
const COOKIE_DISP = "mediterra_disp";
const DISP_DIAS = 90;
function llaveDisp() {
  const s = process.env.SESSION_SECRET || "";
  if (!s) throw new Error("intentos_no_configurado");
  return crypto.createHmac("sha256", s).update("mediterra/dispositivo/v1").digest();
}
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function firmarDisp(payload) {
  const cuerpo = b64u(JSON.stringify(payload));
  return cuerpo + "." + b64u(crypto.createHmac("sha256", llaveDisp()).update(cuerpo).digest());
}
// → payload válido (firma, tipo y vencimiento) o null. El correo y la época los compara
// quien llama (dispositivoReconocido).
function leerDisp(req) {
  const token = A.leerCookie(req, COOKIE_DISP);
  if (!token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  let esperado;
  try { esperado = b64u(crypto.createHmac("sha256", llaveDisp()).update(partes[0]).digest()); } catch (e) { return null; }
  const a = Buffer.from(partes[1]), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let p;
  try { p = JSON.parse(Buffer.from(partes[0].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch (e) { return null; }
  if (!p || p.t !== "disp" || typeof p.d !== "string" || p.d.length < 32 || !Number.isFinite(p.exp) || Date.now() > p.exp) return null;
  return p;
}
function dispositivoReconocido(req, email, epoca) {
  const p = leerDisp(req);
  const em = String(email || "").trim().toLowerCase();
  return p && p.e === em && p.v === epoca ? p.d : null;
}
function cookieDisp(email, epoca, idExistente) {
  const ahora = Date.now();
  const d = idExistente || crypto.randomBytes(16).toString("hex");
  const tok = firmarDisp({ t: "disp", e: String(email || "").trim().toLowerCase(), d, v: epoca, iat: ahora, exp: ahora + DISP_DIAS * DIA * 1000 });
  return `${COOKIE_DISP}=${encodeURIComponent(tok)}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=${DISP_DIAS * DIA}`;
}

module.exports = { reglas, origenIp, reservarLogin, desbloquearCuenta, leerDisp, dispositivoReconocido, cookieDisp, COOKIE_DISP, firmarDisp };

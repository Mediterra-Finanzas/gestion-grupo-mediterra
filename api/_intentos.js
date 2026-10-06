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
//   KC  código por correo (60 bits): 5 intentos por código y por ORIGEN
//
// Un intento se RESERVA antes de evaluar la credencial (cuenta como fallo provisional:
// concurrentes no pueden pasarse del límite) y se LIBERA si resulta correcto.
// Ningún bloqueo es indefinido: todos tienen tope y vencen; el administrador puede
// liberar K3 de una cuenta ("desbloquear", dentro de admin-reset-pin).
//
// Equipo reconocido: cookie `mediterra_disp` (HttpOnly, Secure, SameSite=Strict,
// Path=/api, 90 días) con {t:"disp", e:email, d:id aleatorio 128 bits, v:época, exp}
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
  let ip = String(ipNormalizada || "").toLowerCase();
  const mapeada = ip.match(/^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);   // ::ffff:a.b.c.d → IPv4
  if (mapeada) return mapeada[1];
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

// Reserva un intento de login. `ip` (normalizada) o null; `dispositivo` = id de equipo
// reconocido o null; `canal` = "app" | "osiris" | "frisku"; `hayCodigo` = existe un código
// vigente (su id en `idCodigo`).
// → { ok:true, soloCodigo, codigoBloqueado, dispositivo, liberar(viaCodigo) }
//   | { ok:false, status, error, retry }
// Ningún contador que un tercero pueda llenar bloquea a un equipo reconocido: K1 y KD de
// ese equipo solo los consume quien tiene su cookie; K3 no aplica a equipos reconocidos;
// los intentos con código se limitan por ORIGEN (sin tope global por cuenta).
async function reservarLogin({ email, ip, dispositivo, canal = "app", hayCodigo = false, idCodigo = "" }) {
  const R = reglas();
  const em = String(email || "").trim().toLowerCase();
  const liberables = [];    // se liberan si la credencial resulta correcta (este origen)
  const descontables = [];  // solo se descuenta este intento (K2, y K3 con PIN correcto)
  const origen = ip ? origenIp(ip) : "-";
  let disp = dispositivo || null;
  if (disp) {
    const kd = await tomar("KD", `${disp}|${em}`, R.KD);
    if (kd.permitido) liberables.push(["KD", `${disp}|${em}`]);
    else disp = null;                        // el equipo agotó su margen: deja de contar como reconocido
  }
  // K2 (por IP, todas las cuentas) no aplica a un equipo reconocido: su cookie solo sirve
  // para su propia cuenta, y así un tercero detrás de la misma IP no lo puede demorar.
  if (ip && !disp) {
    const k2 = await tomar("K2", origen, R.K2);
    if (!k2.permitido) return { ok: false, status: 429, error: "bloqueado", retry: k2.retry };
    descontables.push(["K2", origen, R.K2.libres]);
  }
  let soloCodigo = false;
  if (!disp) soloCodigo = (await estado("K3", em)).bloqueado;
  const claveK1 = disp ? `disp:${disp}|${em}` : `${canal}:${origen}|${em}`;
  const k1 = await tomar("K1", claveK1, R.K1);
  if (!k1.permitido) return { ok: false, status: 429, error: "bloqueado", retry: k1.retry };
  liberables.push(["K1", claveK1]);
  if (!disp && !soloCodigo) {
    const k3 = await tomar("K3", em, R.K3);
    if (!k3.permitido) soloCodigo = true; else descontables.push(["K3", em, R.K3.libres]);
  }
  let codigoBloqueado = false;
  if (hayCodigo) {
    // 5 intentos por código y por origen: agotarlos solo afecta a ESE origen (el código
    // tiene 60 bits; adivinarlo repartiendo orígenes no es practicable).
    const claveKC = `${em}|${idCodigo}|${disp ? "disp:" + disp : canal + ":" + origen}`;
    const kc = await tomar("KC", claveKC, R.KC);
    if (kc.permitido) liberables.push(["KC", claveKC]); else codigoBloqueado = true;
  }
  return {
    ok: true, soloCodigo, codigoBloqueado, dispositivo: disp,
    // Credencial correcta. Con el CÓDIGO (verificación por correo) se libera además el
    // umbral de la cuenta; con el PIN solo se descuenta este intento (no lo reinicia).
    liberar: async (viaCodigo) => {
      const pares = liberables.slice();
      if (viaCodigo) pares.push(["K3", em]);
      await liberar(pares);
      for (const [t, c, libres] of descontables) {
        if (viaCodigo && t === "K3") continue;
        await descontar([[t, c]], libres);
      }
    },
  };
}

// Desbloqueo por el administrador: libera el umbral por cuenta (K3).
async function desbloquearCuenta(email) {
  const em = String(email || "").trim().toLowerCase();
  return liberar([["K3", em]]);
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
  return `${COOKIE_DISP}=${encodeURIComponent(tok)}; HttpOnly; Secure; SameSite=Strict; Path=/api; Max-Age=${DISP_DIAS * DIA}`;
}

module.exports = { reglas, origenIp, reservarLogin, desbloquearCuenta, leerDisp, dispositivoReconocido, cookieDisp, COOKIE_DISP, firmarDisp };

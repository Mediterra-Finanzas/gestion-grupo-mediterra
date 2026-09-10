/* VERIFICACIÓN DE CREDENCIAL contra filas `main` y `pins`. NO es login.
 *
 * Replica en Node la DECISIÓN de acceso de src/App.jsx (handleLogin sin guardia): con estas
 * filas, ¿qué haría la app con este correo y este PIN? Sirve para comprobar que lo restaurado
 * conserva credenciales, código provisorio y política de PIN.
 *
 * Lo que NO prueba: el login real. La app lee `main` y `pins` del origen (SUPA_URL) y no puede
 * apuntar a un esquema restaurado, así que el login por el flujo real contra lo restaurado
 * sigue NO EJERCIDO hasta que exista un runtime cuyo origen sea lo restaurado.
 *
 * Si App.jsx cambia estas reglas, qa-respaldo-login-legacy.test.js falla y la réplica se
 * revisa. verifyPin se inyecta (src/pinHash.js en Node; una derivación local en jest). */

export const ALCANCE = "verificacion_de_credencial";
const DIA_MS = 86400000;

export const DECISION = {
  FORMATO: "rechazado_formato",
  CORREO: "rechazado_correo",                  // no existe o está desactivado: mismo mensaje
  CODIGO_VENCIDO: "codigo_vencido_reemitir",   // PIN anterior inhabilitado; pedir código nuevo
  PIN_INHABILITADO: "rechazado_pin_inhabilitado",
  CODIGO_OK: "codigo_ok_debe_crear_pin",
  PIN: "rechazado_pin",
  ENTRA: "entra",
  ENTRA_CAMBIA: "entra_y_debe_cambiar_pin",
};

export const RAMA = {
  SIN_USUARIO: "sin_usuario",
  DESACTIVADO: "desactivado",
  CODIGO_VIGENTE: "pin_inhabilitado_codigo_vigente",
  CODIGO_VENCIDO: "pin_inhabilitado_codigo_vencido",
  CREDENCIAL_ILEGIBLE: "credencial_ilegible",
  PIN_EN_CLARO: "sin_hash_pin_en_claro",
  SIN_CREDENCIAL: "sin_credencial",
  ENTRA: "entra",
  DEBE_CAMBIAR: "entra_y_debe_cambiar_pin",
};
export const pinInhabilitado = (rama) => rama === RAMA.CODIGO_VIGENTE || rama === RAMA.CODIGO_VENCIDO;

// Igual que estadoTemp de App.jsx, con el reloj inyectado.
export function estadoTemp(rawTemp, ahora = Date.now()) {
  if (!rawTemp) return { existe: false, vigente: false, expirado: false, cred: null, legacy: false };
  let cred = null;
  try {
    if (typeof rawTemp === "string" && rawTemp.trim().startsWith("{")) cred = JSON.parse(rawTemp);
    else if (rawTemp && typeof rawTemp === "object") cred = rawTemp;
  } catch (e) { cred = null; }
  if (cred && cred.salt && cred.hash) {
    const expirado = !!(cred.exp && ahora > cred.exp);
    return { existe: true, vigente: !expirado, expirado, cred, legacy: false };
  }
  return { existe: true, vigente: true, expirado: false, cred: null, legacy: true, plano: String(rawTemp) };
}

const politica = (credH, ahora) => {
  let cj = null, vencido = false;
  try {
    cj = credH ? JSON.parse(credH) : null;
    if (cj && cj.fecha) vencido = (ahora - new Date(cj.fecha).getTime()) / DIA_MS > 60;
  } catch (e) {}
  return !!(cj && cj.pol === "6dig") && !vencido;
};

export async function decidirAcceso({ usuarios, pins, email, pin, verifyPin, ahora = Date.now() }) {
  const e = String(email || "").trim().toLowerCase();
  const p = String(pin || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 120) return DECISION.FORMATO;
  if (p.length < 4 || p.length > 64) return DECISION.FORMATO;
  const w = (usuarios || []).filter((u) => !u.desactivado).find((x) => x.email && x.email.toLowerCase() === e);
  if (!w) return DECISION.CORREO;
  const PP = pins || {};

  const t = estadoTemp(PP[w.nombre + "_temp"], ahora);
  if (t.existe) {
    if (t.expirado) return DECISION.CODIGO_VENCIDO;
    const ok = t.legacy ? p === t.plano : await verifyPin(p, t.cred);
    return ok ? DECISION.CODIGO_OK : DECISION.PIN_INHABILITADO;
  }
  const credH = PP[w.nombre + "_h"];
  const ok = credH ? await verifyPin(p, credH) : p === (PP[w.nombre] || w.pin);
  if (!ok) return DECISION.PIN;
  return politica(credH, ahora) ? DECISION.ENTRA : DECISION.ENTRA_CAMBIA;
}

/* Rama que seguiría un usuario que conoce su PIN vigente, sin necesitar el PIN. Permite
 * comparar origen y restaurado para todos los usuarios, no solo para el fixture. */
export function ramaDe({ usuarios, pins, nombre, ahora = Date.now() }) {
  const w = (usuarios || []).find((x) => x.nombre === nombre);
  if (!w) return RAMA.SIN_USUARIO;
  if (w.desactivado) return RAMA.DESACTIVADO;
  const PP = pins || {};
  const t = estadoTemp(PP[w.nombre + "_temp"], ahora);
  if (t.existe) return t.expirado ? RAMA.CODIGO_VENCIDO : RAMA.CODIGO_VIGENTE;
  const credH = PP[w.nombre + "_h"];
  if (credH) {
    let c = null;
    try { c = typeof credH === "string" ? JSON.parse(credH) : credH; } catch (e) {}
    if (!c || !c.salt || !c.hash) return RAMA.CREDENCIAL_ILEGIBLE;
    return politica(credH, ahora) ? RAMA.ENTRA : RAMA.DEBE_CAMBIAR;
  }
  return String(PP[w.nombre] || w.pin || "").trim() ? RAMA.PIN_EN_CLARO : RAMA.SIN_CREDENCIAL;
}

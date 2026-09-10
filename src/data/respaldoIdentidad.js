/* eslint-disable */
/* RESPALDO DE IDENTIDAD · DOS OBJETOS SEPARADOS CON CLAVES DISTINTAS
 * ══════════════════════════════════════════════════════════════════════════════
 *                     ██  STAGING. No hay nada productivo acá.  ██
 *
 * POR QUÉ EXISTE ESTE ARCHIVO, y no es una mejora del generador de negocio.
 *
 * El respaldo anterior conservaba seis campos del padrón —nombre, email, rol, modulos,
 * activo, cargo— y descartaba el resto. Confundí «no es dato de negocio» con «es
 * secreto». `esCFO`, `desactivado`, `tab_permisos`, `empresas_permitidas`,
 * `cadenaAprobacion`, `rendPorOtros` y `rendVerTodas` no son secretos: son AUTORIZACIÓN.
 * Sin ellos el respaldo protege la privacidad y a la vez impide reconstruir una cuenta,
 * que es la peor combinación posible: parece seguro y no sirve para recuperar.
 *
 * ── LOS DOS OBJETOS ───────────────────────────────────────────────────────────
 *
 *   A · NEGOCIO + IDENTIDAD    quién es cada persona y qué puede hacer.
 *       Contiene el padrón completo salvo la credencial. Restaurar A devuelve
 *       usuarios, roles, módulos, capacidades y estado activo/inactivo — y no
 *       permite que nadie entre, porque no lleva con qué autenticarse.
 *
 *   B · BÓVEDA DE CREDENCIALES  con qué se autentica cada persona.
 *       Solo material cifrado: hash, sal, algoritmo, iteraciones, versión, estado.
 *       Nunca un PIN en claro. Se vincula a A por `identity_id`, no por nombre.
 *
 * ── POR QUÉ DOS CLAVES Y NO UNA ───────────────────────────────────────────────
 * Restaurar el negocio es una operación frecuente y de riesgo medio. Restaurar
 * credenciales es rara y de riesgo alto. Con una sola clave, quien puede hacer lo
 * primero puede hacer lo segundo, y el permiso de recuperar un módulo se convierte sin
 * querer en el permiso de recuperar las credenciales de todos.
 *
 * **La clave de A no descifra B, y la de B no descifra A.** No es una convención: con
 * AES-GCM, una clave equivocada falla en la etiqueta de autenticación, no devuelve
 * basura. Está probado en los dos sentidos.
 *
 * ── EL CAMPO DESCONOCIDO ABORTA ───────────────────────────────────────────────
 * Si aparece un campo de usuario que no está clasificado, el respaldo se DETIENE. No se
 * incluye —podría ser un secreto nuevo— y tampoco se descarta en silencio —podría ser
 * autorización nueva—. Las dos decisiones automáticas son malas, así que la toma una
 * persona. Es exactamente el defecto que este archivo viene a corregir, elevado a regla.
 * ══════════════════════════════════════════════════════════════════════════════ */

/* ── clasificación de los campos del padrón ────────────────────────────────────
 * Medido el 2026-09-07 sobre los dos ambientes: 13 campos en total, 12 en producción
 * (sin `pin`) y 13 en staging. Cada uno está clasificado, y no hay una tercera casilla.
 * ───────────────────────────────────────────────────────────────────────────── */
export const CAMPOS_USUARIO = {
  // AUTORIZACIÓN e identidad. Todo esto viaja en A: sin ello no se reconstruye la cuenta.
  conservar: [
    "identity_id",          // UUID estable, cuando exista. Es la llave de reconciliación.
    "nombre",
    "email",
    "cargo",
    "rol",                  // rol global
    "modulos",              // módulos asignados
    "capabilities",         // capacidades por módulo, cuando existan
    "empresas_permitidas",  // vínculo de empresa/tenant
    "esCFO",                // habilita aprobación en Rendiciones y Finanzas
    "desactivado",          // estado activo/inactivo — su pérdida REACTIVA a alguien
    "tab_permisos",         // permisos por pestaña dentro de cada módulo
    "cadenaAprobacion",     // relación de aprobación entre personas
    "rendPorOtros",         // puede rendir gastos por otros
    "rendVerTodas",         // puede ver todas las rendiciones
  ],
  // CREDENCIAL. Nunca entra en A. En B viaja solo su forma cifrada.
  prohibidos: ["pin", "password", "clave", "hash", "salt", "sal", "token", "jwt", "secret", "secreto"],
};

const CONSERVAR = new Set(CAMPOS_USUARIO.conservar);
const PROHIBIDO = new Set(CAMPOS_USUARIO.prohibidos);

export const MOTIVO_ID = {
  CAMPO_DESCONOCIDO: "campo_de_usuario_no_clasificado",
  SIN_PADRON: "sin_padron",
  CREDENCIAL_EN_A: "credencial_en_objeto_a",
  PIN_PLANO_EN_B: "pin_plano_en_objeto_b",
};

/** Aborta si aparece un campo que nadie clasificó. Ver la nota de arriba. */
export function clasificarCampos(usuarios) {
  const vistos = new Set();
  for (const u of usuarios || []) for (const k of Object.keys(u || {})) vistos.add(k);
  const desconocidos = [...vistos].filter((k) => !CONSERVAR.has(k) && !PROHIBIDO.has(k)).sort();
  return { vistos: [...vistos].sort(), desconocidos };
}

/* ── OBJETO A · negocio + identidad ──────────────────────────────────────────── */
export function construirObjetoA({ negocio, padron }) {
  const usuarios = Array.isArray(padron?.usuarios) ? padron.usuarios : null;
  if (!usuarios) return { ok: false, motivo: MOTIVO_ID.SIN_PADRON };

  const { desconocidos } = clasificarCampos(usuarios);
  if (desconocidos.length) {
    return { ok: false, motivo: MOTIVO_ID.CAMPO_DESCONOCIDO, desconocidos };
  }

  const retirados = new Set();
  const limpios = usuarios.map((u) => {
    const o = {};
    for (const k of Object.keys(u)) {
      if (CONSERVAR.has(k)) o[k] = u[k];
      else retirados.add(k);
    }
    return o;
  });

  // Contraprueba dentro del propio constructor: si un prohibido sobrevivió, no se emite.
  for (const u of limpios) for (const k of Object.keys(u)) {
    if (PROHIBIDO.has(k)) return { ok: false, motivo: MOTIVO_ID.CREDENCIAL_EN_A, campo: k };
  }

  return {
    ok: true,
    objeto: {
      tipo: "A", version: "identidad-v1", creado: new Date().toISOString(),
      negocio: negocio || {},
      padron: { usuarios: limpios, total: limpios.length,
                activos: limpios.filter((u) => !u.desactivado).length,
                desactivados: limpios.filter((u) => !!u.desactivado).length },
    },
    retirados: [...retirados].sort(),
  };
}

/* ── OBJETO B · bóveda de credenciales ───────────────────────────────────────
 * `pins` es la fuente de credenciales mientras producción dependa de esa fila. B respalda
 * TODO el material recuperable, cifrado, sin convertirlo en fuente TARGET. Cada llave se
 * clasifica; ninguna se descarta en silencio:
 *
 *   `${nombre}_h`     credencial {v, iter, salt, hash, fecha, pol}. Viaja completa. `fecha`
 *                     decide el vencimiento a 60 días y `pol` el sello de política de 6
 *                     dígitos: sin ellas, restaurar obliga a todos a cambiar el PIN.
 *   `${nombre}_hist`  credenciales anteriores (arreglo de {v, iter, salt, hash}) para no
 *                     repetir las últimas 3. Viaja. Un historial ilegible se reporta y no se
 *                     copia: la regla de no repetir vuelve a empezar vacía; el login no cambia.
 *   `${nombre}_tel`   celular normalizado, segundo factor de la recuperación de PIN. Dato
 *                     personal de recuperación: viaja en B, nunca en A.
 *   `${nombre}_temp`  código provisorio (hash + expiración de 45 minutos). Su material NO
 *                     viaja: es transitorio. Viaja la MARCA `reemisiones[{llave_hash}]`,
 *                     porque mientras exista un `_temp` App.jsx inhabilita el PIN anterior, y
 *                     restaurar el `_h` sin la marca lo rehabilitaría. La reconstrucción
 *                     escribe un `_temp` ya vencido (reconstruirDesdeLote.js) y el usuario pide
 *                     uno nuevo: "¿Olvidaste tu PIN?" o "Resetear PIN" del administrador.
 *   `${nombre}`       PIN en claro legado. PROHIBIDO. Alternativa: código provisorio.
 *
 * Cualquier otra llave DETIENE el respaldo: podría ser material nuevo que se perdería.
 *
 * ── VÍNCULO CREDENCIAL ↔ USUARIO ──────────────────────────────────────────────
 * `llave_hash` = sha256 del nombre EXACTO. Es la llave de enlace LEGADA —la misma que usa el
 * login, `pins[w.nombre + "_h"]`—, no una identidad canónica. Por eso:
 *   - no se normaliza: "José" y "Jose" son llaves distintas, igual que en el login;
 *   - dos usuarios del padrón con el mismo nombre DETIENEN el respaldo: ni el login ni la
 *     reconstrucción pueden distinguirlos. Dos nombres con la misma huella, también;
 *   - una llave cuyo nombre base no está en el padrón (renombre, baja física) es HUÉRFANA:
 *     su material viaja en `huerfanas`, no se asigna a nadie y se reporta.
 * `nombres` es el ARREGLO del padrón, con repetidos: un Set los escondería.
 *
 * ── MODO DE IDENTIDAD · declarado, nunca inferido ────────────────────────────
 *   "boveda"  cada entrada lleva el identity_id de sec_identidad_alias (staging). Una
 *             credencial sin alias va a `sinIdentidad` y el lote queda INCOMPLETO.
 *   "legacy"  origen SIN bóveda sec_* por arquitectura (hoy producción). identity_id = null
 *             y el vínculo es solo `llave_hash`. No se inventa ningún UUID. Solo aplica si se
 *             declara y el snapshot confirma que la bóveda no existe
 *             (respaldoDesdeSnapshot.js · decidirModoIdentidad).
 * ───────────────────────────────────────────────────────────────────────────── */
export const MODO_IDENTIDAD = { BOVEDA: "boveda", LEGACY: "legacy" };
export const MOTIVO_PINS = {
  LLAVE_NO_CLASIFICADA: "llave_de_pins_no_clasificada",
  CREDENCIAL_ILEGIBLE: "credencial_ilegible",
  HISTORIAL_ILEGIBLE: "historial_formato_desconocido",
  TEMP_TRANSITORIO: "codigo_provisorio_transitorio",
  PIN_EN_CLARO: "pin_en_claro_prohibido",
  MODO_NO_DECLARADO: "modo_de_identidad_no_declarado",
  SIN_HASH_LLAVE: "falta_hash_de_llave",
  NOMBRE_DUPLICADO: "nombre_duplicado_en_padron",
  COLISION_LLAVE: "colision_de_llave_hash",
};
const CAMPOS_CREDENCIAL = new Set(["v", "iter", "salt", "hash", "fecha", "pol"]);
const PROHIBIDO_EN_B = new Set(["pin", "password", "clave", "token", "jwt", "secret", "secreto"]);
const leerJson = (x) => { try { return typeof x === "string" ? JSON.parse(x) : x; } catch (e) { return undefined; } };
const llaveProhibida = (x) => !!x && typeof x === "object" &&
  Object.entries(x).some(([k, v]) => PROHIBIDO_EN_B.has(k) || llaveProhibida(v));
const materialDe = (cred) => {
  const adicionales = Object.fromEntries(Object.entries(cred).filter(([k]) => !CAMPOS_CREDENCIAL.has(k)));
  return {
    algoritmo: "PBKDF2-HMAC-SHA256",
    hash: cred.hash, sal: cred.salt,
    iteraciones: Number(cred.iter) || 100000,
    version: Number(cred.v) || 1,
    fecha: cred.fecha ?? null,
    pol: cred.pol ?? null,
    atributosAdicionales: Object.keys(adicionales).length ? adicionales : null,
  };
};

export function construirObjetoB({ pins, resolverIdentidad, hashLlave, nombres, modoIdentidad = MODO_IDENTIDAD.BOVEDA }) {
  if (!Object.values(MODO_IDENTIDAD).includes(modoIdentidad)) return { ok: false, motivo: MOTIVO_PINS.MODO_NO_DECLARADO };
  const legacy = modoIdentidad === MODO_IDENTIDAD.LEGACY;
  const huella = typeof hashLlave === "function" ? hashLlave : null;
  if (legacy && !huella) return { ok: false, motivo: MOTIVO_PINS.SIN_HASH_LLAVE };

  // Sin padrón (uso unitario) no hay huérfanas ni repetidos que detectar.
  const padronConocido = nombres != null;
  const lista = padronConocido ? [...nombres] : [];
  const delPadron = new Set(lista);
  // Solo conteos: los nombres pueden ser nombres de personas.
  if (lista.length !== delPadron.size)
    return { ok: false, motivo: MOTIVO_PINS.NOMBRE_DUPLICADO, desconocidos: `${lista.length - delPadron.size} nombres repetidos` };
  if (huella && new Set(lista.map(huella)).size !== delPadron.size) return { ok: false, motivo: MOTIVO_PINS.COLISION_LLAVE };

  const porBase = new Map();
  const desconocidas = [];
  const noRespaldados = [];
  for (const llave of Object.keys(pins || {})) {
    const m = llave.match(/^(.+)_(h|hist|tel|temp)$/);
    if (m) {
      const g = porBase.get(m[1]) || {};
      g[m[2]] = pins[llave];
      porBase.set(m[1], g);
    } else if (delPadron.has(llave)) {
      noRespaldados.push({ base: llave, llave: "pin", motivo: MOTIVO_PINS.PIN_EN_CLARO });
    } else {
      desconocidas.push(llave);
    }
  }
  // No se devuelven los nombres de las llaves: pueden ser nombres de personas.
  if (desconocidas.length) return { ok: false, motivo: MOTIVO_PINS.LLAVE_NO_CLASIFICADA, desconocidos: `${desconocidas.length} llaves` };

  const credenciales = [], complementos = [], huerfanas = [], reemisiones = [], sinIdentidad = [], basesHuerfanas = [];
  for (const [base, g] of porBase) {
    const huerfana = padronConocido && !delPadron.has(base);
    const llave_hash = huella ? huella(base) : null;
    if (g.temp !== undefined) {
      noRespaldados.push({ base, llave: "_temp", motivo: MOTIVO_PINS.TEMP_TRANSITORIO });
      if (!huerfana) reemisiones.push({ llave_hash });
    }

    let historial = null;
    if (g.hist !== undefined) {
      const arr = leerJson(g.hist);
      const items = Array.isArray(arr) ? arr.map(leerJson) : null;
      if (items && items.every((x) => x && typeof x === "object" && x.salt && x.hash)) historial = items;
      else noRespaldados.push({ base, llave: "_hist", motivo: MOTIVO_PINS.HISTORIAL_ILEGIBLE });
    }
    const telefono = typeof g.tel === "string" && g.tel.trim() ? g.tel : null;

    let cred = null;
    if (g.h !== undefined) {
      const c = leerJson(g.h);
      if (c && typeof c === "object" && c.hash && c.salt) cred = c;
      else noRespaldados.push({ base, llave: "_h", motivo: MOTIVO_PINS.CREDENCIAL_ILEGIBLE });
    }
    if (huerfana) basesHuerfanas.push(base);
    if (!cred && !historial && telefono === null) continue;      // solo _temp o material ilegible
    // Huérfana: el material se conserva, pero no se asigna a nadie ni se le busca identidad.
    if (huerfana) { huerfanas.push({ llave_hash, credencial: cred ? materialDe(cred) : null, historial, telefono }); continue; }

    const identityId = legacy ? null : resolverIdentidad ? resolverIdentidad(base) : null;
    if (!legacy && !identityId) { sinIdentidad.push(base); continue; }   // no se adivina: se reporta

    const comunes = { identity_id: identityId, llave_hash, historial, telefono };
    if (!cred) { complementos.push(comunes); continue; }
    credenciales.push({
      ...comunes,
      ...materialDe(cred),
      estado: "activa",
      auth_user_id: null,
      revocada_at: null, revocada_por: null,
      origen: "calendario_data.pins",
    });
  }
  // El PIN en claro no puede estar ni en B, en ningún nivel. Se comprueba, no se supone.
  if ([...credenciales, ...complementos, ...huerfanas].some(llaveProhibida)) return { ok: false, motivo: MOTIVO_ID.PIN_PLANO_EN_B };

  const excluidas = {};
  for (const x of noRespaldados) excluidas[x.motivo] = (excluidas[x.motivo] || 0) + 1;
  return {
    ok: true,
    objeto: { tipo: "B", version: "credencial-v3", modo_identidad: modoIdentidad, creado: new Date().toISOString(),
              credenciales, complementos, huerfanas, reemisiones, total: credenciales.length, excluidas },
    sinIdentidad,
    noRespaldados,
    basesHuerfanas,
  };
}

/* ── cifrado · AES-256-GCM ────────────────────────────────────────────────────
 * `kid` identifica la clave para poder rotarla sin perder lo ya guardado. El nonce es
 * único por objeto: reutilizarlo en GCM rompe la confidencialidad, no solo la prolijidad.
 * La clave NO viaja con el objeto y no vive en el bucket ni en el repositorio.
 * ───────────────────────────────────────────────────────────────────────────── */
export async function cifrar(objeto, { clave, kid, crypto: c, zlib }) {
  const json = Buffer.from(JSON.stringify(objeto), "utf8");
  const comprimido = await new Promise((res, rej) =>
    zlib.gzip(json, { level: 9 }, (e, b) => (e ? rej(e) : res(b))));
  const nonce = c.randomBytes(12);
  const cif = c.createCipheriv("aes-256-gcm", clave, nonce);
  const cuerpo = Buffer.concat([cif.update(comprimido), cif.final()]);
  const tag = cif.getAuthTag();
  return {
    // La cabecera va EN CLARO a propósito: hay que poder saber qué clave usar antes de
    // descifrar. No revela contenido.
    cabecera: { alg: "AES-256-GCM", kid, tipo: objeto.tipo, creado: objeto.creado,
                comprimido: "gzip", bytesPlano: json.length, bytesCifrados: cuerpo.length,
                sha256Plano: c.createHash("sha256").update(json).digest("hex") },
    nonce: nonce.toString("base64"), tag: tag.toString("base64"),
    datos: cuerpo.toString("base64"),
  };
}

export async function descifrar(sobre, { clave, crypto: c, zlib }) {
  try {
    const des = c.createDecipheriv("aes-256-gcm", clave, Buffer.from(sobre.nonce, "base64"));
    des.setAuthTag(Buffer.from(sobre.tag, "base64"));
    const comprimido = Buffer.concat([des.update(Buffer.from(sobre.datos, "base64")), des.final()]);
    const json = await new Promise((res, rej) =>
      zlib.gunzip(comprimido, (e, b) => (e ? rej(e) : res(b))));
    const sha = c.createHash("sha256").update(json).digest("hex");
    if (sobre.cabecera?.sha256Plano && sha !== sobre.cabecera.sha256Plano) {
      return { ok: false, motivo: "checksum_no_coincide" };
    }
    return { ok: true, objeto: JSON.parse(json.toString("utf8")) };
  } catch (e) {
    // Clave equivocada, objeto alterado o truncado caen todos acá: GCM falla en la
    // etiqueta de autenticación, no devuelve basura. Es la propiedad que hace que el
    // SHA-256 sea verificación ADICIONAL y no el mecanismo de integridad.
    return { ok: false, motivo: "autenticacion_fallida" };
  }
}

/* ── reconciliación por identity_id ──────────────────────────────────────────
 * Un restore NO reemplaza el conjunto: reconcilia. Y hay cuatro cosas que jamás debe
 * hacer solo, porque cada una es un incidente de seguridad con forma de recuperación.
 * ───────────────────────────────────────────────────────────────────────────── */
export function reconciliar({ actuales, respaldados }) {
  const porId = new Map((actuales || []).map((u) => [u.identity_id || u.nombre, u]));
  const plan = { aplicar: [], conflictos: [], sinCambio: [] };

  for (const r of respaldados || []) {
    const llave = r.identity_id || r.nombre;
    const act = porId.get(llave);
    if (!act) { plan.aplicar.push({ llave, accion: "alta", motivo: "no_existe_hoy" }); continue; }

    // 1 · nunca reactivar en silencio a alguien dado de baja
    if (act.desactivado && !r.desactivado) {
      plan.conflictos.push({ llave, motivo: "reactivaria_usuario_desactivado" }); continue;
    }
    // 2 · nunca retirar permisos vigentes
    const modsAct = new Set(act.modulos || []), modsResp = new Set(r.modulos || []);
    const perdidos = [...modsAct].filter((m) => !modsResp.has(m));
    if (perdidos.length) {
      plan.conflictos.push({ llave, motivo: "retiraria_modulos", detalle: perdidos }); continue;
    }
    // 3 · nunca cambiar el UUID de una persona
    if (act.identity_id && r.identity_id && act.identity_id !== r.identity_id) {
      plan.conflictos.push({ llave, motivo: "cambiaria_identity_id" }); continue;
    }
    // 4 · nunca conceder permisos que hoy no tiene
    const nuevos = [...modsResp].filter((m) => !modsAct.has(m));
    if (nuevos.length) {
      plan.conflictos.push({ llave, motivo: "concederia_modulos_nuevos", detalle: nuevos }); continue;
    }
    plan.sinCambio.push(llave);
  }
  const vistos = new Set((respaldados || []).map((r) => r.identity_id || r.nombre));
  plan.huerfanos = (actuales || []).map((u) => u.identity_id || u.nombre).filter((k) => !vistos.has(k));
  return plan;
}

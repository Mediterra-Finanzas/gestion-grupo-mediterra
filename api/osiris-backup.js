// api/osiris-backup.js — ENDPOINT DEDICADO DE RESPALDO  (hotfix B)
// ══════════════════════════════════════════════════════════════════════════════
//                 ██  PREPARADO. BLOCKED BY AUTH — no desplegar.  ██
//
// POR QUÉ NO SE REACTIVA `api/db`. Aquel era un proxy GENÉRICO: reescribía cualquier
// llamada a cualquier tabla. Un endpoint así vuelve a poner al cliente a elegir rutas y
// recursos, que es exactamente lo que hay que quitarle. Éste hace UNA cosa y no acepta
// que le digan cómo hacerla.
//
// EL CONTRATO CON EL CLIENTE, entero:
//     POST /api/osiris-backup      cuerpo: {}    ← se ignora lo que venga
//     respuesta: { ok, backupId, correlationId, recursos, bytes, checksum }
// El cliente pide «creá un respaldo». No elige filas, ni campos, ni contenido, ni
// destino. Todo eso lo decide el servidor con su propia allowlist.
//
// ── POR QUÉ ESTÁ BLOQUEADO, medido y no supuesto ──────────────────────────────
// El §AUTENTICACIÓN exige comprobar que la sesión server-side EXISTE en la versión
// productiva antes de dar PASS. Medido contra producción el 2026-09-03:
//
//     GET /api/login              → 410  {"error":"endpoint_retirado"}
//     GET /api/db/calendario_data → 410  {"error":"endpoint_retirado"}
//     GET /api/storage            → 401  {"error":"sin_sesion"}
//
// La maquinaria de VERIFICACIÓN está desplegada y viva: `/api/storage` rechaza por
// falta de sesión, usando el mismo `_auth.js` que usa este archivo. Lo que no existe
// es un EMISOR: `crearToken` y `cookieSesion` están exportados y no los llama nadie,
// porque su único llamador —`/api/login`— fue retirado el 2026-06-30.
//
// Una cerradura sin llave. El endpoint es correcto y hoy no puede autorizar a nadie,
// así que devolvería 401 a todo el mundo, incluido el administrador. Por eso el estado
// es BLOCKED BY AUTH y no FAIL: no está mal construido, le falta el emisor.
//
// QUÉ LO DESBLOQUEA: restituir un emisor de sesión server-side —`/api/login` u otro—
// que valide credencial contra la bóveda y emita la cookie firmada. Ese es un paquete
// aparte, con su propia autorización, porque toca el camino de login.
// ══════════════════════════════════════════════════════════════════════════════
const {
  SUPA_URL, sesionDeRequest, supaFetch, faltanSecretos,
} = require("./_auth");
const crypto = require("crypto");

// La allowlist vive en el SERVIDOR. Aunque el cliente mandara una, se ignora.
// El generador es ESM y este handler es CJS, asi que se carga con import() dinamico:
// un require() sobre un modulo ESM revienta en el runtime de Vercel.
let _gen = null;
async function generador() {
  if (!_gen) _gen = await import("../src/data/backupGenerador.js");
  return _gen;
}

const digest = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

/** Respuesta uniforme. Nunca devuelve contenido del respaldo ni secretos. */
function responder(res, codigo, cuerpo) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(codigo).json(cuerpo);
}

module.exports = async function handler(req, res) {
  const correlationId = crypto.randomUUID();

  // 1 · sólo POST. Un GET que respalde es un respaldo que dispara un buscador.
  if (req.method !== "POST") return responder(res, 405, { ok: false, error: "metodo_no_permitido" });

  // 2 · secretos del servidor. Sin ellos no se degrada a "modo abierto": se corta.
  if (faltanSecretos()) return responder(res, 503, { ok: false, error: "servidor_sin_secretos", correlationId });

  // 3 · SESIÓN REAL, firmada y no vencida. `anon` y "sin cookie" caen acá.
  //     El rol NO se lee del cuerpo ni de una cabecera: sale del payload firmado.
  const sesion = sesionDeRequest(req);
  if (!sesion) return responder(res, 401, { ok: false, error: "sin_sesion", correlationId });

  // 4 · AUTORIZACIÓN por rol, en el servidor. Un rol que llegue por el cuerpo se ignora.
  if (sesion.rol !== "admin") {
    return responder(res, 403, { ok: false, error: "rol_insuficiente", correlationId });
  }

  // 5 · el cliente no elige NADA. Se descarta cualquier lista que haya mandado.
  //     No es paranoia: si el cuerpo pudiera nombrar filas, `pins` sería una de ellas.
  const hoy = new Date().toISOString().slice(0, 10);
  const backupId = "backup_" + hoy;

  try {
    // 6 · lectura con el secreto del SERVIDOR. La clave pública no participa.
    // `supaFetch` toma la ruta SIN el prefijo /rest/v1/ y devuelve el Response crudo.
    const resFilas = await supaFetch(
      "calendario_data?select=id,value&id=not.like.backup_*", { method: "GET" });
    const filas = resFilas.ok ? await resFilas.json() : null;
    if (!Array.isArray(filas)) {
      return responder(res, 502, { ok: false, error: "origen_ilegible", correlationId });
    }

    // 7 · allowlist por recurso y campo, y detector como segunda capa.
    const { construirRespaldo, detectarSensibles, ALLOWLIST } = await generador();
    const r = construirRespaldo(filas, { allowlist: ALLOWLIST, digest, version: "auto-v4" });
    if (!r.ok) {
      // Si algo sensible sobrevivió no se emite NADA. El motivo va sin el contenido.
      return responder(res, 409, { ok: false, error: "respaldo_rechazado", motivo: r.motivo,
        sensibles: (r.sensibles || []).length, correlationId });
    }
    // Cinturón y tirantes: se vuelve a mirar lo que se va a escribir.
    const sobrevivientes = detectarSensibles(r.payload);
    if (sobrevivientes.length > 0) {
      return responder(res, 409, { ok: false, error: "material_sensible", sensibles: sobrevivientes.length, correlationId });
    }
    if (Object.prototype.hasOwnProperty.call(r.payload, "pins")) {
      return responder(res, 409, { ok: false, error: "pins_en_el_respaldo", correlationId });
    }

    // 8 · ALTA ÚNICA por fecha. `ignore-duplicates` deja que la unicidad la resuelva la
    //     clave primaria, de forma atómica. Dos solicitudes concurrentes producen UNA
    //     creación lógica: la segunda no pisa a la primera y tampoco miente.
    const resEscritura = await supaFetch("calendario_data", {
      method: "POST",
      headers: { "Content-Type": "application/json",
                 Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({ id: backupId, value: { ...r.payload, __manifiesto: r.manifiesto },
                             updated_at: new Date().toISOString() }),
    });
    const escrito = resEscritura.ok ? await resEscritura.json().catch(() => []) : null;
    if (escrito === null) {
      return responder(res, 502, { ok: false, error: "escritura_rechazada", http: resEscritura.status, correlationId });
    }
    const creado = Array.isArray(escrito) && escrito.length > 0;

    // 9 · CERO FILAS NO ES ÉXITO. Se distingue "creado ahora" de "ya existía", y se
    //     confirma leyendo: sin confirmación del servidor no se declara nada.
    const resConfirm = await supaFetch(
      `calendario_data?id=eq.${encodeURIComponent(backupId)}&select=id`, { method: "GET" });
    const confirm = resConfirm.ok ? await resConfirm.json() : null;
    const existe = Array.isArray(confirm) && confirm.length === 1;
    if (!existe) {
      return responder(res, 500, { ok: false, error: "sin_confirmacion_del_servidor", correlationId });
    }

    // 10 · auditoría sin PII: ni nombres, ni correos, ni contenido. Sólo el actor
    //      enmascarado, para poder correlacionar sin publicar quién es.
    const actor = digest(String(sesion.email || "")).slice(0, 12);
    console.log(JSON.stringify({
      evt: "osiris_backup", correlationId, backupId, actor,
      resultado: creado ? "creado" : "ya_existia",
      recursos: r.manifiesto.filas, excluidos: (r.manifiesto.excluidos || []).length,
      noDeclarados: (r.manifiesto.noDeclarados || []).length,
      bytes: r.manifiesto.bytesTotal, checksum: r.manifiesto.huellaTotal.slice(0, 16),
    }));

    return responder(res, creado ? 201 : 200, {
      ok: true, backupId, correlationId,
      resultado: creado ? "creado" : "ya_existia",
      recursos: r.manifiesto.filas,
      bytes: r.manifiesto.bytesTotal,
      checksum: r.manifiesto.huellaTotal.slice(0, 16),
    });
  } catch (e) {
    // El mensaje del driver puede traer host, usuario o consulta. No sale de acá.
    console.error(JSON.stringify({ evt: "osiris_backup_error", correlationId, clase: e && e.name }));
    return responder(res, 500, { ok: false, error: "fallo_interno", correlationId });
  }
};

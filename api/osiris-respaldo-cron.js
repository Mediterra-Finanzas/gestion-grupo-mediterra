// api/osiris-respaldo-cron.js — Vercel Cron del respaldo seguro.
//
// Mismo patrón que api/proc-reporting-daily-cron.js, que ya opera en producción:
// Vercel Cron hace un GET a la URL de PRODUCCIÓN del proyecto, con
// `Authorization: Bearer <CRON_SECRET>` puesto por la plataforma. Este archivo no
// inventa un mecanismo nuevo ni una segunda fuente de verdad.
//
// La entrega del cron es best-effort: puede faltar una corrida y puede repetirse.
// Por eso todo el tramo es idempotente y reconciliable — la unicidad la resuelve
// la clave primaria en Postgres, no un `if` en este handler.
//
// Tramo completo: reserva → snapshot → cifrado A/B → subida → READY →
// verificación (descarga, descifra, restaura en aislamiento) → aviso.
//
// Variables esperadas en el proyecto de Vercel:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (acepta la clave sb_secret_), CRON_SECRET,
//   BACKUP_ENCRYPTION_KEY_A, BACKUP_ENCRYPTION_KEY_B, BACKUP_KID_A, BACKUP_KID_B,
//   RESPALDO_BUCKET, RESPALDO_AVISO_TO (coma-separado),
//   RESPALDO_CORREO_PRUEBA, CORREO_PRUEBA_PERMITIDOS,
//   SMTP_OSIRIS_USER, SMTP_OSIRIS_PASS (send-email.js, modulo "osiris": el aviso y el
//   correo de prueba salen por esa cuenta, no por la de mediterra).
//   RESPALDO_PERMITIR_PRODUCCION = "si"  ← sin esto, se niega a correr contra producción.
//   RESPALDO_MODO_IDENTIDAD = "boveda" (defecto) | "legacy"  ← tiene que coincidir con el
//   `modo_identidad` que declara el snapshot. "legacy" es para un origen sin bóveda sec_*.
// No abre conexiones PostgreSQL: reserva, snapshot y publicación van por RPC de PostgREST.
// Lee además variables de sistema de Vercel (VERCEL_GIT_COMMIT_SHA, VERCEL_GIT_COMMIT_REF,
// VERCEL_ENV, VERCEL_DEPLOYMENT_ID) para registrar qué deployment corrió.

const crypto = require("crypto");
const zlib = require("zlib");
const { cronAutorizado } = require("./_reportingScheduler.js");

const REF_PRODUCCION = "bywovqayuzodbzwsriet";

function config() {
  return {
    url: process.env.SUPABASE_URL || "",
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    cron: process.env.CRON_SECRET || "",
    bucket: process.env.RESPALDO_BUCKET || "respaldo-osiris-staging",
    kidA: process.env.BACKUP_KID_A || "",
    kidB: process.env.BACKUP_KID_B || "",
    claveA: process.env.BACKUP_ENCRYPTION_KEY_A || "",
    claveB: process.env.BACKUP_ENCRYPTION_KEY_B || "",
    avisoA: (process.env.RESPALDO_AVISO_TO || "").split(",").map((s) => s.trim()).filter(Boolean),
    permiteProduccion: process.env.RESPALDO_PERMITIR_PRODUCCION === "si",
    // "boveda" por defecto: un origen sin bóveda (producción) queda detenido hasta que alguien
    // declare "legacy" por escrito. Nunca se infiere del snapshot.
    modoIdentidad: process.env.RESPALDO_MODO_IDENTIDAD || "boveda",
    // Correo de prueba: solo a direcciones aprobadas una por una. Un dominio
    // .invalid no recibe correo, asi que la entrega real exige un buzon real
    // designado para pruebas.
    correoPrueba: process.env.RESPALDO_CORREO_PRUEBA === "si",
    correoPruebaPara: (process.env.CORREO_PRUEBA_PERMITIDOS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  };
}

// Guardia fail-closed. Un despliegue mal apuntado no debe escribir en producción
// por descuido; tiene que ser una decisión explícita y escrita.
function guardia(c) {
  if (!c.url || !c.key) return "faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY";
  if (c.url.includes(REF_PRODUCCION) && !c.permiteProduccion)
    return "el destino es el proyecto productivo y RESPALDO_PERMITIR_PRODUCCION no está en 'si'";
  if (!c.claveA || !c.claveB) return "faltan las claves de cifrado A/B";
  if (c.claveA === c.claveB) return "las claves A y B son la misma: la separación en dos objetos no protegería nada";
  if (!["boveda", "legacy"].includes(c.modoIdentidad)) return "RESPALDO_MODO_IDENTIDAD debe ser 'boveda' o 'legacy'";
  return null;
}

const api = (c, ruta, opt = {}) =>
  fetch(`${c.url}/rest/v1/${ruta}`, {
    ...opt,
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json", ...(opt.headers || {}) },
  });

const rpc = async (c, fn, args) => {
  const r = await api(c, `rpc/${fn}`, { method: "POST", body: JSON.stringify(args || {}) });
  if (!r.ok) throw new Error(`${fn} → HTTP ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
};

const subir = (c, ruta, bytes) =>
  fetch(`${c.url}/storage/v1/object/${c.bucket}/${ruta}`, {
    method: "POST",
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/octet-stream", "x-upsert": "true" },
    body: bytes,
  });

const bajar = async (c, ruta) => {
  const r = await fetch(`${c.url}/storage/v1/object/${c.bucket}/${ruta}`, {
    headers: { apikey: c.key, Authorization: `Bearer ${c.key}` },
  });
  return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
};

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
// El prefijo permite a las pruebas de staging crear lotes propios SIN borrar el lote
// diario. Solo acepta minúsculas, dígitos y guiones; cualquier otra cosa vuelve a "auto".
const prefijoLote = () => (/^[a-z0-9-]{1,40}$/.test(process.env.RESPALDO_PREFIJO_LOTE || "") ? process.env.RESPALDO_PREFIJO_LOTE : "auto");
const loteDeHoy = (ahora) => prefijoLote() + "-" + ahora.toISOString().slice(0, 10);

// El módulo de identidad es ESM y este archivo es CommonJS: import() dinámico.
// require() aquí falla en tiempo de ejecución, no de build, y por eso es fácil
// que pase la revisión y reviente de noche.
async function identidad() {
  return import("../src/data/respaldoIdentidad.js");
}

async function corrida({ c, ahora }) {
  const pasos = [];
  const paso = (nombre, ok, detalle) => { pasos.push({ paso: nombre, ok, detalle }); return ok; };
  const lote = loteDeHoy(ahora);
  const correlationId = crypto.randomUUID();

  const res = await rpc(c, "respaldo_reservar", { p_lote: lote, p_correlation: correlationId });
  if (!res.reservado) { paso("reserva", true, `ya existía · estado=${res.estado}`); return { lote, estado: res.estado, pasos, creado: false }; }
  const intento = res.intento;
  paso("reserva", true, `intento=${intento}${res.retomado ? " (retomado de una corrida abandonada)" : ""}`);

  try {
    const snap = await rpc(c, "respaldo_snapshot", {});
    if (!paso("snapshot", !!snap && Array.isArray(snap.datos), `${snap && snap.filas} filas en una sola sentencia`))
      throw new Error("snapshot vacío");

    const ident = await identidad();
    const { construirPar, resolverDesdeSnapshot, decidirModoIdentidad } = await import("../src/data/respaldoDesdeSnapshot.js");
    const dep = { crypto, zlib };
    const hashLlave = (nombre) => sha256(Buffer.from(String(nombre), "utf8"));
    // Modo de identidad: el DECLARADO (RESPALDO_MODO_IDENTIDAD) tiene que coincidir con el que
    // declara el snapshot. Bóveda a medias o sin alias son errores, nunca modo legacy.
    // Las identidades vienen del MISMO snapshot que `main` y `pins`
    // (sql/respaldo/snapshot-consistente.sql): leerlas con otra RPC sería otra transacción.
    const modo = decidirModoIdentidad({ snapshot: snap, declarado: c.modoIdentidad });
    if (!paso("identidad", modo.ok, !modo.ok ? `${modo.motivo} · ${modo.detalle}`
        : modo.modo === "boveda" ? `bóveda · ${snap.identidades.length} identidades · misma instantánea que los datos`
        : "legacy declarado · origen sin bóveda · vínculo por llave_hash del nombre exacto · sin UUID"))
      throw new Error(`${modo.motivo}: ${modo.detalle}`);
    const resolverIdentidad = modo.modo === "boveda" ? resolverDesdeSnapshot(snap, hashLlave) : null;

    const par = construirPar({ snapshot: snap, correlationId, lote, resolverIdentidad, hashLlave, modoIdentidad: modo.modo });
    if (!paso("objetos", par.ok, par.ok
        ? `A: ${par.A.recursos} recursos · ${par.A.padron.total} usuarios · B: ${par.B.total} credenciales · ` +
          `${par.basesHuerfanas.length} huérfanas · ${par.reemisiones} códigos provisorios a reemitir`
        : `${par.motivo} ${(par.desconocidos || par.campo || "")}`))
      throw new Error("no se pudieron construir los objetos: " + par.motivo);


    const selloA = await ident.cifrar(par.A, { clave: Buffer.from(c.claveA, "base64"), kid: c.kidA, ...dep });
    const selloB = await ident.cifrar(par.B, { clave: Buffer.from(c.claveB, "base64"), kid: c.kidB, ...dep });
    const bytesA = Buffer.from(JSON.stringify(selloA), "utf8");
    const bytesB = Buffer.from(JSON.stringify(selloB), "utf8");
    paso("cifrado", true, `AES-256-GCM · kid A=${c.kidA} · kid B=${c.kidB} · claves distintas`);

    const rutaA = `${lote}/negocio-identidad.enc`, rutaB = `${lote}/credenciales.enc`;
    const okA = (await subir(c, rutaA, bytesA)).ok, okB = (await subir(c, rutaB, bytesB)).ok;
    if (!paso("subida", okA && okB, `A=${okA} B=${okB}`)) {
      await rpc(c, "respaldo_marcar", { p_lote: lote, p_estado: "FAILED", p_verificacion: "subida incompleta" });
      return { lote, estado: "FAILED", pasos, creado: true };
    }

    // Una credencial cuyo dueño no se puede resolver no se puede restaurar a nadie,
    // así que el lote NO se publica: nadie debe restaurar desde un padrón al que
    // le faltan credenciales. Pero los bytes ya cifrados sí quedan subidos y
    // registrados, porque tirarlos convertiría un problema de identidad en una
    // pérdida de respaldo. El lote queda FAILED y la alarma suena.
    if (!paso("credenciales completas", par.sinIdentidad.length === 0,
        par.sinIdentidad.length
          ? `${par.sinIdentidad.length} PIN sin identidad en la bóveda: ${par.sinIdentidad.slice(0, 5).join(", ")}`
          : "todas resueltas")) {
      await api(c, `respaldo_lote?lote_id=eq.${encodeURIComponent(lote)}`, {
        method: "PATCH",
        body: JSON.stringify({ objeto_a: rutaA, objeto_b: rutaB, sha_a: sha256(bytesA), sha_b: sha256(bytesB) }),
      });
      // INCOMPLETO, no FAILED: los bytes cifrados quedan como EVIDENCIA y sirven
      // para una recuperación manual, pero el lote no cuenta como respaldo
      // recuperable y la alarma lo dice con esas palabras.
      await rpc(c, "respaldo_marcar", { p_lote: lote, p_estado: "INCOMPLETO",
        p_verificacion: "credenciales_sin_identidad:" + par.sinIdentidad.length + " · objetos cifrados conservados como evidencia, lote NO publicado" });
      return { lote, estado: "INCOMPLETO", pasos, creado: true, sinIdentidad: par.sinIdentidad.length };
    }

    const pub = await rpc(c, "respaldo_publicar", {
      p_lote: lote, p_intento: intento, p_objeto_a: rutaA, p_objeto_b: rutaB,
      p_sha_a: sha256(bytesA), p_sha_b: sha256(bytesB),
    });
    if (!paso("READY", pub.publicado, pub.publicado ? "publicado" : pub.motivo))
      return { lote, estado: "no_publicado", pasos, creado: true };

    // Verificación. Sin esto, un lote que sube basura deja la alarma en verde.
    const { restaurarLote } = await import("../src/data/restaurarLote.js");
    const { rows } = { rows: await (await api(c, `respaldo_lote?lote_id=eq.${encodeURIComponent(lote)}&select=*`)).json() };
    const fila = Array.isArray(rows) ? rows[0] : rows;
    const ver = await restaurarLote({
      fila,
      bajar: (ruta) => bajar(c, ruta),
      sha256,
      descifrar: (sobre, clave) => ident.descifrar(sobre, { clave, ...dep }),
      claves: { A: Buffer.from(c.claveA, "base64"), B: Buffer.from(c.claveB, "base64") },
    });
    if (!paso("verificación", ver.ok, ver.ok ? `restaurado en aislamiento · ${Object.keys(ver.A.negocio || {}).length} recursos` : `${ver.motivo} ${ver.detalle || ""}`)) {
      await rpc(c, "respaldo_marcar", { p_lote: lote, p_estado: "FAILED", p_verificacion: ver.motivo });
      return { lote, estado: "FAILED", pasos, creado: true };
    }
    await rpc(c, "respaldo_marcar", { p_lote: lote, p_estado: "VERIFICADO", p_verificacion: "ok" });
    return { lote, estado: "READY_VERIFICADO", pasos, creado: true, correlationId };
  } catch (e) {
    await rpc(c, "respaldo_marcar", { p_lote: lote, p_estado: "FAILED", p_verificacion: String(e.message).slice(0, 200) });
    paso("error", false, String(e.message).slice(0, 200));
    return { lote, estado: "FAILED", pasos, creado: true };
  }
}

async function avisarSiHaceFalta({ c, enviar, ahora }) {
  const r = await api(c, "respaldo_salud?select=*");
  if (!r.ok) return { enviado: false, motivo: `salud HTTP ${r.status}` };
  const [salud] = await r.json();
  if (!salud) return { enviado: false, motivo: "sin salud" };
  const { avisar } = await import("../src/data/avisoRespaldo.js");
  return avisar({
    salud, ultimoAviso: null, entorno: c.url.includes(REF_PRODUCCION) ? "producción" : "staging",
    destinatarios: c.avisoA, enviar, ahora,
  });
}

/* Cada invocacion queda registrada (append-only) para distinguir despues el Run
 * manual del disparo por horario. No guarda direcciones de correo. */
async function registrarInvocacion(c, fila) {
  try {
    const r = await api(c, "respaldo_invocacion", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(fila) });
    return r.ok;
  } catch (e) { return false; }
}

async function enviarCorreoPrueba({ c, ahora, out, enviar }) {
  if (!c.correoPruebaPara.length) return { aceptado: false, destinatarios: 0, motivo: "sin destinatario de prueba aprobado" };
  try {
    const r = await enviar({
      to: c.correoPruebaPara,
      subject: `Osiris · correo de prueba del respaldo · ${ahora.toISOString().slice(0, 16)} UTC`,
      message: `Correo de prueba del runtime de staging. Lote ${out.lote}, estado ${out.estado}. No requiere accion.`,
      html: `<p>Correo de prueba del runtime de staging.</p><p>Lote ${out.lote} · estado ${out.estado}.</p><p>No requiere acción.</p>`,
      modulo: "osiris",
    });
    const aceptado = !!(r && (r.ok === true || r.success === true || r.messageId || (Array.isArray(r.accepted) && r.accepted.length)));
    return { aceptado, destinatarios: c.correoPruebaPara.length, motivo: aceptado ? "aceptado por SMTP" : "SMTP no confirmo aceptacion" };
  } catch (e) {
    return { aceptado: false, destinatarios: c.correoPruebaPara.length, motivo: String(e.message).slice(0, 120) };
  }
}

module.exports = async function handler(req, res) {
  const c = config();
  if (req.method && req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!cronAutorizado(req.headers && req.headers.authorization, c.cron))
    return res.status(401).json({ error: "unauthorized" });

  const impedimento = guardia(c);
  if (impedimento) return res.status(500).json({ error: "guardia", detalle: impedimento });

  const ahora = new Date();
  const h = req.headers || {};
  const origen = (req.query && req.query.origen) || (String(req.url || "").match(/[?&]origen=([a-z]+)/) || [])[1] || null;
  const out = await corrida({ c, ahora });

  let aviso = { enviado: false, motivo: "no evaluado" };
  let correoPrueba = null;
  try {
    const { enviarCorreo } = require("./send-email.js");
    aviso = await avisarSiHaceFalta({ c, enviar: enviarCorreo, ahora });
    if (c.correoPrueba) correoPrueba = await enviarCorreoPrueba({ c, ahora, out, enviar: enviarCorreo });
  } catch (e) { aviso = { enviado: false, motivo: String(e.message).slice(0, 120) }; }

  // Identidad del deployment que corrió. Son variables de sistema de Vercel, no
  // secretos; permiten confirmar después que se ejecutó el commit revisado.
  const despliegue = {
    commit_sha: process.env.VERCEL_GIT_COMMIT_SHA || null,
    commit_ref: process.env.VERCEL_GIT_COMMIT_REF || null,
    vercel_env: process.env.VERCEL_ENV || null,
    deployment_id: process.env.VERCEL_DEPLOYMENT_ID || null,
  };

  const registrada = await registrarInvocacion(c, {
    user_agent: h["user-agent"] || null,
    cron_schedule: h["x-vercel-cron-schedule"] || null,
    vercel_id: h["x-vercel-id"] || null,
    origen_declarado: origen,
    lote_id: out.lote, estado: out.estado,
    correo_prueba: correoPrueba,
    ...despliegue,
  });

  const ok = out.estado === "READY_VERIFICADO" || out.estado === "READY" || out.creado === false;
  return res.status(ok ? 200 : 500).json({
    lote: out.lote, estado: out.estado, creado: out.creado === true, pasos: out.pasos, aviso,
    correoPrueba, invocacionRegistrada: registrada,
    programador: h["x-vercel-cron-schedule"] || null,
    despliegue,
  });
};

module.exports.corrida = corrida;
module.exports.guardia = guardia;
module.exports.config = config;
module.exports.enviarCorreoPrueba = enviarCorreoPrueba;

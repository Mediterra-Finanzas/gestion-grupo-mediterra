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
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET,
//   BACKUP_ENCRYPTION_KEY_A, BACKUP_ENCRYPTION_KEY_B, BACKUP_KID_A, BACKUP_KID_B,
//   RESPALDO_BUCKET, RESPALDO_AVISO_TO (coma-separado)
//   RESPALDO_PERMITIR_PRODUCCION = "si"  ← sin esto, se niega a correr contra producción.

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
const loteDeHoy = (ahora) => "auto-" + ahora.toISOString().slice(0, 10);

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
    const { construirPar } = await import("../src/data/respaldoDesdeSnapshot.js");
    const dep = { crypto, zlib };
    // Resolver de identidad desde la boveda: solo pares (hash del nombre -> uuid).
    // Ni nombres ni credenciales salen de sec_*.
    const pares = await rpc(c, "respaldo_identidades", {});
    const porHash = new Map((pares || []).map((x) => [x.llave_hash, x.identity_id]));
    const resolverIdentidad = (nombre) => porHash.get(sha256(Buffer.from(String(nombre), "utf8"))) || null;
    paso("boveda", porHash.size > 0, `${porHash.size} identidades resolubles`);

    const par = construirPar({ snapshot: snap, correlationId, lote, resolverIdentidad });
    if (!paso("objetos", par.ok, par.ok
        ? `A: ${par.A.recursos} recursos · ${par.A.padron.total} usuarios · B: ${par.B.total} credenciales`
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

module.exports = async function handler(req, res) {
  const c = config();
  if (req.method && req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
  if (!cronAutorizado(req.headers && req.headers.authorization, c.cron))
    return res.status(401).json({ error: "unauthorized" });

  const impedimento = guardia(c);
  if (impedimento) return res.status(500).json({ error: "guardia", detalle: impedimento });

  const ahora = new Date();
  const out = await corrida({ c, ahora });

  let aviso = { enviado: false, motivo: "no evaluado" };
  try {
    const { enviarCorreo } = require("./send-email.js");
    aviso = await avisarSiHaceFalta({ c, enviar: enviarCorreo, ahora });
  } catch (e) { aviso = { enviado: false, motivo: String(e.message).slice(0, 120) }; }

  const ok = out.estado === "READY_VERIFICADO" || out.estado === "READY" || out.creado === false;
  return res.status(ok ? 200 : 500).json({
    lote: out.lote, estado: out.estado, creado: out.creado === true, pasos: out.pasos, aviso,
    programador: (req.headers && req.headers["x-vercel-cron-schedule"]) || null,
  });
};

module.exports.corrida = corrida;
module.exports.guardia = guardia;
module.exports.config = config;

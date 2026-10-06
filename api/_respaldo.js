// api/_respaldo.js — Núcleo del respaldo diario seguro (auto-v4). NO es un endpoint.
// ---------------------------------------------------------------------------------
// Reemplaza al generador del navegador (auto-v3, suspendido en el hotfix A), que
// copiaba `main` y `pins` con credenciales y corría con la llave pública.
//
// Reglas:
//   · Corre SOLO en servidor (cron de Vercel) con la llave service_role, que nunca
//     llega al navegador. Sin CRON_SECRET o sin llave: no hace nada (fail-closed).
//   · Lee calendario_data. NO escribe en la base: el respaldo va a un bucket
//     PRIVADO de Supabase Storage (`respaldos`).
//   · Excluye filas enteras de credenciales (`pins`) y los respaldos viejos.
//   · Sanea el resto: quita PIN, hashes de credencial (objetos con salt+hash),
//     historiales de PIN, tokens, secretos y JWT. Anota QUÉ ruta quitó, nunca el valor.
//   · Cada fila lleva su SHA-256; el paquete se verifica bajándolo de nuevo.
//   · Retención: 30 días diarios + el primero de cada mes por 12 meses.
//   · Restaurar: simulación por defecto, foto previa del estado actual, bloqueo
//     optimista por updated_at, y las credenciales ACTUALES se reinyectan en las
//     rutas que el respaldo no trae. `pins` nunca se restaura.
//
// Sin dependencias npm: crypto y zlib nativos. CommonJS (Vercel) + import desde .mjs.

const crypto = require("crypto");
const zlib = require("zlib");

const VERSION = "mediterra-respaldo-v4";
const BUCKET = "respaldos";
const PREFIJO_DIARIO = "diario/";

// ── Qué no se respalda ──────────────────────────────────────────────────────
const FILAS_EXCLUIDAS = [/^pins$/, /^backup_/, /^respaldo_/];
const filaExcluida = (id) => FILAS_EXCLUIDAS.some((re) => re.test(String(id)));

// Claves cuyo valor es una credencial en cualquier lugar del documento.
const CLAVE_SENSIBLE = /^(pin|pins|pin_?temporal|pin_?hash|pin_?provisorio|codigo_?provisorio|password|passwd|contrase(n|ñ)a|token|access_?token|refresh_?token|id_?token|bearer|secret|client_?secret|session_?secret|cron_?secret|api_?key|apikey|service_?role(_?key)?|authorization|cookie|otp)$/i;
// Sufijos de la fila de PINs (`Nombre_h` = hash, `Nombre_hist` = historial).
const SUFIJO_SENSIBLE = /_(h|hist)$/;
// Valores que son credenciales aunque la clave no lo diga.
const VALOR_SENSIBLE = /^(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+|Bearer\s+\S{8,}|sb_secret_\S+)$/;

function esObjetoCredencial(v) {
  return v && typeof v === "object" && !Array.isArray(v) && "salt" in v && ("hash" in v || "iter" in v);
}
function stringCredencial(v) {
  if (typeof v !== "string") return false;
  if (VALOR_SENSIBLE.test(v.trim())) return true;
  if (v.length < 400 && /"salt"/.test(v) && /"(hash|iter)"/.test(v)) {
    try { return esObjetoCredencial(JSON.parse(v)); } catch (_) { return false; }
  }
  return false;
}

// Identidad estable de un elemento de arreglo (para reinyectar credenciales aunque cambie el orden).
function idElemento(el, i) {
  if (el && typeof el === "object" && !Array.isArray(el)) {
    for (const k of ["id", "email", "nombre", "label"]) {
      if (el[k] != null && el[k] !== "") return `[${k}=${String(el[k])}]`;
    }
  }
  return `[${i}]`;
}

// Devuelve { valor, rutas }: copia saneada y lista de rutas quitadas (sin valores).
function sanear(valor) {
  const rutas = [];
  const rec = (v, ruta) => {
    if (Array.isArray(v)) {
      const out = [];
      v.forEach((el, i) => {
        const r = ruta + idElemento(el, i);
        if (esObjetoCredencial(el) || stringCredencial(el)) { rutas.push(r); return; }
        out.push(rec(el, r));
      });
      return out;
    }
    if (v && typeof v === "object") {
      const out = {};
      Object.keys(v).forEach((k) => {
        const r = ruta ? `${ruta}.${k}` : k;
        const x = v[k];
        if (CLAVE_SENSIBLE.test(k) || SUFIJO_SENSIBLE.test(k) || esObjetoCredencial(x) || stringCredencial(x)) { rutas.push(r); return; }
        out[k] = rec(x, r);
      });
      return out;
    }
    return v;
  };
  return { valor: rec(valor, ""), rutas };
}

// ── Utilidades ─────────────────────────────────────────────────────────────
// JSON canónico (claves ordenadas): el mismo contenido da el mismo hash.
function canonico(v) {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonico(v[k])}`).join(",")}}`;
  return JSON.stringify(v === undefined ? null : v);
}
const sha256 = (x) => crypto.createHash("sha256").update(typeof x === "string" ? x : Buffer.from(x)).digest("hex");
const fechaISO = (d) => new Date(d).toISOString().slice(0, 10);

function decodificar(value) {
  if (typeof value === "string") {
    try { return { valor: JSON.parse(value), codificacion: "texto" }; } catch (_) { return { valor: value, codificacion: "crudo" }; }
  }
  return { valor: value, codificacion: "json" };
}
function codificar(valor, codificacion) {
  return codificacion === "texto" ? JSON.stringify(valor) : valor;
}

// ── Paquete + manifiesto ───────────────────────────────────────────────────
function construirPaquete(filas, ahora = new Date()) {
  const paquete = { version: VERSION, fecha: new Date(ahora).toISOString(), filas: {} };
  const manifiesto = { version: VERSION, fecha: paquete.fecha, filas: [], excluidas: [] };
  (filas || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id))).forEach((f) => {
    if (filaExcluida(f.id)) { manifiesto.excluidas.push(f.id); return; }
    const { valor, codificacion } = decodificar(f.value);
    const s = sanear(valor);
    const texto = canonico(s.valor);
    paquete.filas[f.id] = { updated_at: f.updated_at || null, codificacion, valor: s.valor };
    manifiesto.filas.push({ id: f.id, updated_at: f.updated_at || null, codificacion, bytes: Buffer.byteLength(texto), sha256: sha256(texto), rutasQuitadas: s.rutas });
  });
  const json = JSON.stringify(paquete);
  const gz = zlib.gzipSync(Buffer.from(json), { level: 9 });
  manifiesto.sha256Paquete = sha256(json);
  manifiesto.bytesJson = Buffer.byteLength(json);
  manifiesto.bytesGzip = gz.length;
  return { paquete, manifiesto, gz };
}

// Comprueba un paquete descargado contra su manifiesto (integridad fila a fila).
function verificarPaquete(gz, manifiesto) {
  const errores = [];
  let paquete;
  try { paquete = JSON.parse(zlib.gunzipSync(gz).toString("utf8")); } catch (e) { return { ok: false, errores: ["no se pudo descomprimir/leer"] }; }
  if (sha256(JSON.stringify(paquete)) !== manifiesto.sha256Paquete) errores.push("sha256 del paquete no coincide");
  manifiesto.filas.forEach((m) => {
    const f = paquete.filas[m.id];
    if (!f) { errores.push(`falta la fila ${m.id}`); return; }
    if (sha256(canonico(f.valor)) !== m.sha256) errores.push(`sha256 de ${m.id} no coincide`);
  });
  return { ok: errores.length === 0, errores, paquete };
}

// Busca restos de credenciales en un texto (prueba de que el saneo funcionó).
function buscarFugas(texto, secretosConocidos = []) {
  const fugas = [];
  secretosConocidos.filter(Boolean).forEach((s) => { if (texto.includes(s)) fugas.push(`aparece un secreto conocido (${String(s).slice(0, 3)}…)`); });
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(texto)) fugas.push("aparece un JWT");
  if (/"salt"\s*:/.test(texto) && /"(hash|iter)"\s*:/.test(texto)) fugas.push("aparece un objeto salt/hash");
  if (/"pin"\s*:/.test(texto)) fugas.push('aparece la clave "pin"');
  return fugas;
}

// ── Retención ──────────────────────────────────────────────────────────────
// nombres: ["diario/2026-10-06.json.gz", ...]. Conserva los últimos `dias` días
// y el primer respaldo de cada uno de los últimos `meses` meses. Nunca borra el
// más reciente ni archivos que no sigan el patrón.
function planRetencion(nombres, ahora = new Date(), { dias = 30, meses = 12 } = {}) {
  const re = /^diario\/(\d{4}-\d{2}-\d{2})(-\d+)?\.json\.gz$/;
  const items = (nombres || []).map((n) => ({ n, m: re.exec(n) })).filter((x) => x.m).map((x) => ({ n: x.n, fecha: x.m[1] }));
  items.sort((a, b) => a.n.localeCompare(b.n));
  const hoy = new Date(fechaISO(ahora) + "T00:00:00Z");
  const limiteDiario = new Date(hoy.getTime() - (dias - 1) * 86400000);
  const limiteMensual = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() - (meses - 1), 1));
  const primeroDelMes = {};
  items.forEach((x) => { const k = x.fecha.slice(0, 7); if (!primeroDelMes[k]) primeroDelMes[k] = x.n; });
  const conservar = [], borrar = [];
  items.forEach((x, i) => {
    const f = new Date(x.fecha + "T00:00:00Z");
    const ultimo = i === items.length - 1;
    const mensual = primeroDelMes[x.fecha.slice(0, 7)] === x.n && f >= limiteMensual;
    (ultimo || f >= limiteDiario || mensual ? conservar : borrar).push(x.n);
  });
  return { conservar, borrar };
}

// ── Restauración ───────────────────────────────────────────────────────────
function partirRuta(ruta) {
  const partes = [];
  const re = /([^.[\]]+)|\[([^\]]+)\]/g; let m;
  while ((m = re.exec(ruta))) partes.push(m[1] != null ? { k: m[1] } : { sel: m[2] });
  return partes;
}
function buscarEnArreglo(arr, sel) {
  const eqi = sel.indexOf("=");
  if (eqi < 0) return { i: Number(sel) };
  const k = sel.slice(0, eqi), v = sel.slice(eqi + 1);
  return { i: arr.findIndex((el) => el && typeof el === "object" && String(el[k]) === v) };
}
function leerRuta(obj, ruta) {
  let cur = obj;
  for (const p of partirRuta(ruta)) {
    if (cur == null) return { existe: false };
    if (p.k != null) { if (typeof cur !== "object" || !(p.k in cur)) return { existe: false }; cur = cur[p.k]; }
    else { if (!Array.isArray(cur)) return { existe: false }; const { i } = buscarEnArreglo(cur, p.sel); if (i < 0 || i >= cur.length) return { existe: false }; cur = cur[i]; }
  }
  return { existe: true, valor: cur };
}
function escribirRuta(obj, ruta, valor) {
  const partes = partirRuta(ruta);
  let cur = obj;
  for (let j = 0; j < partes.length; j++) {
    const p = partes[j], ultimo = j === partes.length - 1;
    if (p.k != null) {
      if (ultimo) { cur[p.k] = valor; return true; }
      if (cur[p.k] == null || typeof cur[p.k] !== "object") return false;
      cur = cur[p.k];
    } else {
      if (!Array.isArray(cur)) return false;
      const { i } = buscarEnArreglo(cur, p.sel);
      if (ultimo) { if (i >= 0) { cur[i] = valor; return true; } cur.push(valor); return true; }
      if (i < 0) return false;
      cur = cur[i];
    }
  }
  return false;
}

// Plan por fila: qué cambiaría, qué credenciales se conservan del valor ACTUAL.
function planRestauracion({ paquete, manifiesto, actuales, ids }) {
  const porId = Object.fromEntries((actuales || []).map((f) => [f.id, f]));
  const mPorId = Object.fromEntries(manifiesto.filas.map((m) => [m.id, m]));
  return (ids || Object.keys(paquete.filas)).map((id) => {
    if (filaExcluida(id)) return { id, accion: "excluida", motivo: "las credenciales no se restauran desde respaldos" };
    const r = paquete.filas[id];
    if (!r) return { id, accion: "no_esta_en_el_respaldo" };
    const actual = porId[id];
    const valorFinal = JSON.parse(JSON.stringify(r.valor));
    const conservadas = [], perdidas = [];
    const actualValor = actual ? decodificar(actual.value).valor : null;
    (mPorId[id]?.rutasQuitadas || []).forEach((ruta) => {
      const x = actualValor != null ? leerRuta(actualValor, ruta) : { existe: false };
      if (x.existe && escribirRuta(valorFinal, ruta, x.valor)) conservadas.push(ruta);
      else perdidas.push(ruta);
    });
    const igual = actual && canonico(sanear(actualValor).valor) === canonico(r.valor);
    return {
      id, accion: igual ? "sin_cambios" : "restaurar",
      updatedAtActual: actual ? actual.updated_at : null,
      updatedAtRespaldo: r.updated_at,
      credencialesConservadas: conservadas, credencialesSinValorActual: perdidas,
      valorFinal: codificar(valorFinal, actual ? decodificar(actual.value).codificacion : r.codificacion),
    };
  });
}

// ── Acceso a Supabase (REST + Storage) con fetch inyectable ────────────────
function cliente({ supaUrl, serviceKey, fetchImpl }) {
  const f = fetchImpl || fetch;
  const h = (extra = {}) => Object.assign({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, extra);
  return {
    async leerFilas(ids) {
      const filtro = ids && ids.length ? `id=in.(${ids.map(encodeURIComponent).join(",")})` : "id=not.like.backup_*";
      const r = await f(`${supaUrl}/rest/v1/calendario_data?select=id,value,updated_at&${filtro}`, { headers: h() });
      if (!r.ok) throw new Error(`lectura calendario_data → ${r.status}`);
      const d = await r.json();
      if (!Array.isArray(d)) throw new Error("calendario_data no devolvió una lista");
      return d;
    },
    async patchConVersion(id, value, updatedAtEsperado) {
      const filtroV = updatedAtEsperado ? `&updated_at=eq.${encodeURIComponent(updatedAtEsperado)}` : "";
      const r = await f(`${supaUrl}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}${filtroV}`, {
        method: "PATCH", headers: h({ "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
      });
      if (!r.ok) throw new Error(`escritura ${id} → ${r.status}`);
      const d = await r.json();
      return Array.isArray(d) && d.length > 0;   // [] = cambió en el servidor (conflicto)
    },
    async insertar(id, value) {
      const r = await f(`${supaUrl}/rest/v1/calendario_data`, {
        method: "POST", headers: h({ "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify({ id, value, updated_at: new Date().toISOString() }),
      });
      if (r.status === 409) return false;   // apareció mientras tanto: no se pisa
      if (!r.ok) throw new Error(`inserción ${id} → ${r.status}`);
      return true;
    },
    async subir(ruta, cuerpo, tipo) {
      const r = await f(`${supaUrl}/storage/v1/object/${BUCKET}/${ruta}`, {
        method: "POST", headers: h({ "Content-Type": tipo, "x-upsert": "false" }), body: cuerpo,
      });
      if (!r.ok) throw new Error(`subida ${ruta} → ${r.status}`);
    },
    async subirReemplazando(ruta, cuerpo, tipo) {
      const r = await f(`${supaUrl}/storage/v1/object/${BUCKET}/${ruta}`, {
        method: "POST", headers: h({ "Content-Type": tipo, "x-upsert": "true" }), body: cuerpo,
      });
      if (!r.ok) throw new Error(`subida ${ruta} → ${r.status}`);
    },
    async bajar(ruta) {
      const r = await f(`${supaUrl}/storage/v1/object/${BUCKET}/${ruta}`, { headers: h() });
      if (!r.ok) throw new Error(`descarga ${ruta} → ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
    async listar(prefijo) {
      const r = await f(`${supaUrl}/storage/v1/object/list/${BUCKET}`, {
        method: "POST", headers: h({ "Content-Type": "application/json" }),
        body: JSON.stringify({ prefix: prefijo, limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } }),
      });
      if (!r.ok) throw new Error(`listado ${prefijo} → ${r.status}`);
      return (await r.json()).map((o) => prefijo + o.name);
    },
    async borrar(rutas) {
      if (!rutas.length) return;
      const r = await f(`${supaUrl}/storage/v1/object/${BUCKET}`, {
        method: "DELETE", headers: h({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: rutas }),
      });
      if (!r.ok) throw new Error(`borrado → ${r.status}`);
    },
  };
}

// ── Ejecución completa (lo que corre el cron) ──────────────────────────────
async function ejecutarRespaldo({ supaUrl, serviceKey, fetchImpl, ahora = new Date(), retencion } = {}) {
  if (!serviceKey) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY (fail-closed)");
  const c = cliente({ supaUrl, serviceKey, fetchImpl });
  const filas = await c.leerFilas();
  const { manifiesto, gz } = construirPaquete(filas, ahora);
  const existentes = await c.listar(PREFIJO_DIARIO);
  const base = `${PREFIJO_DIARIO}${fechaISO(ahora)}`;
  let nombre = `${base}.json.gz`, n = 2;
  while (existentes.includes(nombre)) nombre = `${base}-${n++}.json.gz`;   // nunca sobrescribe
  const nombreManifiesto = nombre.replace(/\.json\.gz$/, ".manifiesto.json");
  manifiesto.archivo = nombre;
  await c.subir(nombre, gz, "application/gzip");
  await c.subir(nombreManifiesto, Buffer.from(JSON.stringify(manifiesto, null, 2)), "application/json");
  // Verificación de ida y vuelta: se baja lo subido y se compara fila a fila.
  const v = verificarPaquete(await c.bajar(nombre), manifiesto);
  if (!v.ok) throw new Error(`verificación fallida: ${v.errores.join("; ")}`);
  // Retención (solo después de un respaldo verificado; solo dentro de diario/).
  const todos = (await c.listar(PREFIJO_DIARIO)).filter((x) => x.endsWith(".json.gz"));
  const plan = planRetencion(todos, ahora, retencion);
  const borrar = plan.borrar.flatMap((x) => [x, x.replace(/\.json\.gz$/, ".manifiesto.json")]);
  await c.borrar(borrar);
  const estado = {
    ok: true, fecha: manifiesto.fecha, archivo: nombre, filas: manifiesto.filas.length,
    excluidas: manifiesto.excluidas, rutasQuitadas: manifiesto.filas.reduce((a, m) => a + m.rutasQuitadas.length, 0),
    bytesGzip: manifiesto.bytesGzip, sha256Paquete: manifiesto.sha256Paquete,
    retencion: { conservados: plan.conservar.length, borrados: plan.borrar },
  };
  await c.subirReemplazando("estado/ultimo.json", Buffer.from(JSON.stringify(estado, null, 2)), "application/json");
  return estado;
}

// ── Restauración (CLI de administrador; nunca desde el navegador) ──────────
async function restaurar({ supaUrl, serviceKey, fetchImpl, archivo, ids, aplicar = false, ahora = new Date() }) {
  if (!serviceKey) throw new Error("falta SUPABASE_SERVICE_ROLE_KEY");
  const c = cliente({ supaUrl, serviceKey, fetchImpl });
  const manifiesto = JSON.parse((await c.bajar(archivo.replace(/\.json\.gz$/, ".manifiesto.json"))).toString("utf8"));
  const v = verificarPaquete(await c.bajar(archivo), manifiesto);
  if (!v.ok) throw new Error(`el respaldo no pasa la verificación: ${v.errores.join("; ")}`);
  const pedidas = ids && ids.length ? ids : Object.keys(v.paquete.filas);
  const actuales = await c.leerFilas(pedidas.filter((id) => !filaExcluida(id)));
  const plan = planRestauracion({ paquete: v.paquete, manifiesto, actuales, ids: pedidas });
  const resumen = plan.map(({ valorFinal, ...r }) => r);
  if (!aplicar) return { simulacion: true, archivo, plan: resumen };
  // Foto previa del estado actual, saneada igual que un respaldo diario (sin
  // credenciales) y restaurable con este mismo comando: es el "deshacer".
  const previo = `previo-restauracion/${new Date(ahora).toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(3).toString("hex")}.json.gz`;
  const foto = construirPaquete(actuales, ahora);
  foto.manifiesto.archivo = previo;
  await c.subir(previo, foto.gz, "application/gzip");
  await c.subir(previo.replace(/\.json\.gz$/, ".manifiesto.json"), Buffer.from(JSON.stringify(foto.manifiesto, null, 2)), "application/json");
  const resultados = [];
  for (const p of plan) {
    if (p.accion !== "restaurar") { resultados.push({ id: p.id, resultado: p.accion }); continue; }
    const ok = p.updatedAtActual
      ? await c.patchConVersion(p.id, p.valorFinal, p.updatedAtActual)
      : await c.insertar(p.id, p.valorFinal);
    resultados.push({ id: p.id, resultado: ok ? "restaurada" : "conflicto: cambió en el servidor, no se escribió" });
  }
  return { simulacion: false, archivo, previo, plan: resumen, resultados };
}

module.exports = {
  VERSION, BUCKET, PREFIJO_DIARIO, filaExcluida, sanear, canonico, sha256,
  construirPaquete, verificarPaquete, buscarFugas, planRetencion,
  leerRuta, escribirRuta, planRestauracion, cliente, ejecutarRespaldo, restaurar,
};

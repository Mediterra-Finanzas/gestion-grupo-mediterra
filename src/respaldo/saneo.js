/* eslint-disable */
// src/respaldo/saneo.js — Saneo de credenciales y plan de restauración.
// ÚNICA fuente para el navegador (botones Respaldo/Restaurar, correo del admin)
// y el servidor. El servidor usa api/_saneo.js, una COPIA CommonJS generada con
// `node scripts/respaldo/sincronizar-saneo.mjs`; un test falla si la copia
// difiere de esta fuente. Sin dependencias ni imports.

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

function decodificar(value) {
  if (typeof value === "string") {
    try { return { valor: JSON.parse(value), codificacion: "texto" }; } catch (_) { return { valor: value, codificacion: "crudo" }; }
  }
  return { valor: value, codificacion: "json" };
}
function codificar(valor, codificacion) {
  return codificacion === "texto" ? JSON.stringify(valor) : valor;
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
// respaldo: { id: { valor, updated_at, codificacion, rutasQuitadas } } (valor YA saneado)
// actuales: [{ id, value, updated_at }] leídos del servidor justo antes.
// fechaRespaldo (opcional): para avisar filas modificadas después del respaldo.
function planRestaurar({ respaldo, actuales, ids, fechaRespaldo }) {
  const porId = Object.fromEntries((actuales || []).map((f) => [f.id, f]));
  const tRes = fechaRespaldo ? Date.parse(fechaRespaldo) : NaN;
  return (ids || Object.keys(respaldo)).map((id) => {
    if (filaExcluida(id)) return { id, accion: "excluida", motivo: "las credenciales no se restauran desde respaldos" };
    const r = respaldo[id];
    if (!r) return { id, accion: "no_esta_en_el_respaldo" };
    const actual = porId[id];
    const valorFinal = JSON.parse(JSON.stringify(r.valor === undefined ? null : r.valor));
    const conservadas = [], perdidas = [];
    const dec = actual ? decodificar(actual.value) : null;
    const actualValor = dec ? dec.valor : null;
    (r.rutasQuitadas || []).forEach((ruta) => {
      const x = actualValor != null ? leerRuta(actualValor, ruta) : { existe: false };
      if (x.existe && escribirRuta(valorFinal, ruta, x.valor)) conservadas.push(ruta);
      else perdidas.push(ruta);
    });
    const actualSaneado = actual ? sanear(actualValor).valor : null;
    const igual = !!actual && canonico(actualSaneado) === canonico(r.valor);
    const top = (o) => (o && typeof o === "object" && !Array.isArray(o) ? Object.keys(o) : []);
    const clavesCambiadas = [...new Set([...top(actualSaneado), ...top(r.valor)])]
      .filter((k) => canonico(actualSaneado ? actualSaneado[k] : undefined) !== canonico(r.valor ? r.valor[k] : undefined));
    const tAct = actual && actual.updated_at ? Date.parse(actual.updated_at) : NaN;
    return {
      id, accion: igual ? "sin_cambios" : "restaurar",
      existeActual: !!actual,
      updatedAtActual: actual ? actual.updated_at : null,
      updatedAtRespaldo: r.updated_at || null,
      modificadaDespuesDelRespaldo: !isNaN(tAct) && !isNaN(tRes) && tAct > tRes,
      bytesActual: actual ? canonico(actualSaneado).length : 0,
      bytesRespaldo: canonico(r.valor).length,
      clavesCambiadas: clavesCambiadas.slice(0, 20),
      credencialesConservadas: conservadas, credencialesSinValorActual: perdidas,
      valorFinal: codificar(valorFinal, dec ? dec.codificacion : (r.codificacion || "texto")),
    };
  });
}

// Lee un archivo de respaldo (botón "💾 Respaldo" v1/v2 o paquete auto-v4) y
// devuelve { ok, version, fecha, respaldo, excluidas, errores } con los datos
// YA SANEADOS (aunque el archivo antiguo traiga credenciales).
const VERSIONES_ARCHIVO = ["Mediterra Hub Backup v1", "Mediterra Hub Backup Automático v1", "Mediterra Hub Backup v2", "mediterra-respaldo-v4"];
function leerArchivoRespaldo(obj) {
  const errores = [];
  if (!obj || typeof obj !== "object") return { ok: false, errores: ["el archivo no es un objeto JSON"] };
  const version = obj.version;
  if (!VERSIONES_ARCHIVO.includes(version)) errores.push(`versión desconocida: ${JSON.stringify(version)} (se aceptan: ${VERSIONES_ARCHIVO.join(", ")})`);
  const fecha = obj.fecha;
  if (!fecha || isNaN(Date.parse(fecha))) errores.push("falta la fecha del respaldo o no es válida");
  const fuente = version === "mediterra-respaldo-v4" ? obj.filas : obj.tablas;
  if (!fuente || typeof fuente !== "object" || Array.isArray(fuente) || !Object.keys(fuente).length) errores.push("no trae filas (tablas) para restaurar");
  if (errores.length) return { ok: false, version, fecha, errores };
  const respaldo = {}, excluidas = [], saneadas = [];
  Object.entries(fuente).forEach(([id, t]) => {
    if (filaExcluida(id)) { excluidas.push(id); return; }
    const crudo = version === "mediterra-respaldo-v4" ? t.valor : (t && Object.prototype.hasOwnProperty.call(t, "data") ? t.data : undefined);
    if (crudo === undefined) { errores.push(`la fila ${id} no trae datos`); return; }
    const { valor, codificacion } = decodificar(crudo);
    const s = sanear(valor);
    const rutasPrevias = (t && Array.isArray(t.rutasQuitadas)) ? t.rutasQuitadas : [];
    const rutas = [...new Set([...rutasPrevias, ...s.rutas])];
    if (s.rutas.length) saneadas.push(id);
    respaldo[id] = { valor: s.valor, updated_at: t && t.updated_at || null, codificacion, rutasQuitadas: rutas };
  });
  return { ok: errores.length === 0, version, fecha, respaldo, excluidas, traiaCredenciales: saneadas, errores };
}

// Respaldo descargable desde el navegador (botón "💾 Respaldo"): saneado.
function armarRespaldoDescargable(filas, { usuario = "", ahora = new Date() } = {}) {
  const out = { version: "Mediterra Hub Backup v2", formato: "saneado", fecha: new Date(ahora).toISOString(), usuario,
    nota: "Sin credenciales: no incluye la fila pins ni PIN, hashes, tokens o JWT. Las rutas quitadas están en rutasQuitadas.",
    tablas: {}, excluidas: [] };
  (filas || []).forEach((row) => {
    if (filaExcluida(row.id)) { out.excluidas.push(row.id); return; }
    const { valor } = decodificar(row.value);
    const s = sanear(valor);
    out.tablas[row.id] = { data: s.valor, updated_at: row.updated_at, rutasQuitadas: s.rutas };
  });
  return out;
}

export {
  FILAS_EXCLUIDAS, filaExcluida, sanear, canonico, decodificar, codificar, buscarFugas,
  leerRuta, escribirRuta, planRestaurar, leerArchivoRespaldo, armarRespaldoDescargable, VERSIONES_ARCHIVO,
};

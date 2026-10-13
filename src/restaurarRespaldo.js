/* eslint-disable */
// Restauración de un respaldo "Mediterra Hub Backup v1" fila por fila,
// COMPROBANDO cada respuesta del servidor. Antes el botón "📤 Restaurar"
// ignoraba las respuestas y siempre informaba "restaurado exitosamente".
//
//   restaurarFilas(backup, escribir) → { total, restauradas:[id], fallidas:[{id, status, motivo, detalle}] }
//     escribir(id, value) → Promise<Response-like {ok, status, text()}> (puede lanzar: sin red)
//   mensajeRestauracion(resultado, fechaRespaldo) → texto para el aviso
//
// Se intentan TODAS las filas aunque alguna falle, y el resultado dice cuáles
// quedaron y cuáles no. Nunca se informa una restauración completa si hubo fallas.

export function valorDeTabla(tabla) {
  return typeof tabla.data === "string" ? tabla.data : JSON.stringify(tabla.data);
}

export function motivoFallo(status, texto) {
  if (status === 0) return "sin conexión con el servidor";
  if (/MEDITERRA_NOMINAS_SIN_VERSION/.test(texto)) return "rechazada por la protección de Nóminas (se restaura desde el SQL Editor)";
  if (/MEDITERRA_NOMINAS_LEGADO/.test(texto)) return "fila antigua de Nóminas: solo lectura";
  if (/MEDITERRA_SELLO/.test(texto)) return "rechazada por un sello de conciliación";
  if (status === 401 || status === 403) return `sin permiso (HTTP ${status})`;
  return `error del servidor (HTTP ${status})`;
}

// ── Formato aceptado y plan de restauración (oct-2026) ──────────────────────
// Antes: (1) toda fila se reescribía como TEXTO (`valorDeTabla`), aunque en el servidor
// fuera un objeto; `main` quedaba como texto y la siguiente apertura reemplazaba Tareas
// con datos vacíos. (2) La fila `pins` del respaldo pisaba las credenciales vigentes:
// quien cambió su PIN después del respaldo volvía al anterior.
// Ahora: se valida el archivo antes de escribir nada; cada fila se escribe con la
// codificación que tiene HOY en el servidor (texto o objeto); y en `pins` las
// credenciales vigentes mandan: del respaldo solo se agregan las que hoy no existen.
export const VERSIONES_ACEPTADAS = ["Mediterra Hub Backup v1"];
const ID_VALIDO = /^[A-Za-z0-9_:.\-]{1,120}$/;
const FILAS_CREDENCIALES = new Set(["pins"]);

export function validarRespaldo(backup) {
  const errores = [];
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) return { ok: false, errores: ["el archivo no es un objeto JSON"] };
  if (!VERSIONES_ACEPTADAS.includes(backup.version)) errores.push(`versión no aceptada: ${JSON.stringify(backup.version ?? null)} (se acepta ${VERSIONES_ACEPTADAS.join(", ")})`);
  if (!backup.tablas || typeof backup.tablas !== "object" || Array.isArray(backup.tablas)) errores.push("falta «tablas» o no es un objeto");
  else {
    const ids = Object.keys(backup.tablas);
    if (!ids.length) errores.push("el respaldo no trae filas");
    ids.forEach((id) => {
      const t = backup.tablas[id];
      if (!ID_VALIDO.test(id)) errores.push(`identificador de fila inválido: ${JSON.stringify(id).slice(0, 60)}`);
      else if (/^backup_/.test(id)) errores.push(`fila de respaldo interno no restaurable: ${id}`);
      else if (!t || typeof t !== "object" || !("data" in t)) errores.push(`fila ${id}: sin «data»`);
      else if (t.data === null || t.data === undefined) errores.push(`fila ${id}: «data» vacío`);
    });
  }
  return { ok: errores.length === 0, errores };
}

const parsear = (v) => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch (e) { return v; } };

// actuales: { [id]: { value, updated_at } } tal como están HOY en el servidor.
export function prepararRestauracion(backup, actuales) {
  const v = validarRespaldo(backup);
  if (!v.ok) return { ok: false, errores: v.errores, filas: [] };
  const filas = [], notas = [];
  for (const [id, tabla] of Object.entries(backup.tablas)) {
    let dato = parsear(tabla.data);
    const actual = actuales[id];
    if (FILAS_CREDENCIALES.has(id) && actual) {
      const vig = parsear(actual.value) || {};
      const resp = dato && typeof dato === "object" ? dato : {};
      const agregadas = Object.keys(resp).filter((k) => !(k in vig));
      dato = { ...resp, ...vig };                         // las vigentes mandan
      notas.push(`${id}: se conservaron las credenciales vigentes (${Object.keys(vig).length}); del respaldo se agregaron ${agregadas.length} que hoy no existen`);
    }
    // Misma codificación que la fila tiene hoy. Si no existe, como objeto (jsonb).
    const comoTexto = actual ? typeof actual.value === "string" : typeof tabla.data === "string" && typeof dato === "string";
    const value = comoTexto ? (typeof dato === "string" ? dato : JSON.stringify(dato)) : dato;
    filas.push({ id, value, codificacion: comoTexto ? "texto" : "objeto" });
  }
  return { ok: true, errores: [], filas, notas };
}

// `actuales` (recomendado): el estado de hoy en el servidor. Sin él se conserva el
// comportamiento anterior (todo como texto) solo para compatibilidad de pruebas viejas.
export async function restaurarFilas(backup, escribir, { actuales } = {}) {
  let plan;
  if (actuales) {
    plan = prepararRestauracion(backup, actuales);
    if (!plan.ok) return { total: 0, restauradas: [], fallidas: [], invalido: true, errores: plan.errores };
  } else {
    plan = { filas: Object.entries((backup && backup.tablas) || {}).map(([id, tabla]) => ({ id, value: valorDeTabla(tabla) })), notas: [] };
  }
  const tablas = plan.filas;
  const restauradas = [], fallidas = [];
  for (const { id, value } of tablas) {
    let res;
    try { res = await escribir(id, value); }
    catch (e) { fallidas.push({ id, status: 0, motivo: motivoFallo(0, ""), detalle: String((e && e.message) || e).slice(0, 200) }); continue; }
    if (res && res.ok) { restauradas.push(id); continue; }
    let texto = "";
    try { texto = await res.text(); } catch (e) {}
    const status = res ? res.status : 0;
    fallidas.push({ id, status, motivo: motivoFallo(status, texto), detalle: texto.slice(0, 200) });
  }
  return { total: tablas.length, restauradas, fallidas, notas: plan.notas || [] };
}

export function mensajeRestauracion(r, fechaRespaldo) {
  const lista = (ids, max = 15) => ids.slice(0, max).map((x) => `  • ${x}`).join("\n") + (ids.length > max ? `\n  … y ${ids.length - max} más` : "");
  if (r.invalido) return `❌ Archivo de respaldo NO aceptado. No se escribió nada.\n\n${lista(r.errores || [], 10)}`;
  const notas = (r.notas && r.notas.length) ? `\n\n${r.notas.join("\n")}` : "";
  if (!r.fallidas.length) {
    return `✅ Respaldo restaurado: ${r.restauradas.length} de ${r.total} filas.\nFecha del respaldo: ${fechaRespaldo}${notas}\n\nLa página se recargará ahora.`;
  }
  const encabezado = r.restauradas.length
    ? `⚠️ RESTAURACIÓN PARCIAL: se restauraron ${r.restauradas.length} de ${r.total} filas. ${r.fallidas.length} NO se restauraron.`
    : `❌ NO se restauró ninguna fila (${r.fallidas.length} de ${r.total} fallaron).`;
  return `${encabezado}\nFecha del respaldo: ${fechaRespaldo}\n\n` +
    `NO restauradas (siguen con los datos que tenían antes):\n${lista(r.fallidas.map((f) => `${f.id}: ${f.motivo}`))}\n\n` +
    (r.restauradas.length ? `Restauradas:\n${lista(r.restauradas)}\n\n` : "") +
    `Los datos quedaron MEZCLADOS entre el respaldo y lo anterior. Revisa las filas no restauradas antes de seguir trabajando.\n\nLa página se recargará ahora.`;
}

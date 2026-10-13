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

export async function restaurarFilas(backup, escribir) {
  const tablas = Object.entries((backup && backup.tablas) || {});
  const restauradas = [], fallidas = [];
  for (const [id, tabla] of tablas) {
    let res;
    try { res = await escribir(id, valorDeTabla(tabla)); }
    catch (e) { fallidas.push({ id, status: 0, motivo: motivoFallo(0, ""), detalle: String((e && e.message) || e).slice(0, 200) }); continue; }
    if (res && res.ok) { restauradas.push(id); continue; }
    let texto = "";
    try { texto = await res.text(); } catch (e) {}
    const status = res ? res.status : 0;
    fallidas.push({ id, status, motivo: motivoFallo(status, texto), detalle: texto.slice(0, 200) });
  }
  return { total: tablas.length, restauradas, fallidas };
}

export function mensajeRestauracion(r, fechaRespaldo) {
  const lista = (ids, max = 15) => ids.slice(0, max).map((x) => `  • ${x}`).join("\n") + (ids.length > max ? `\n  … y ${ids.length - max} más` : "");
  if (!r.fallidas.length) {
    return `✅ Respaldo restaurado: ${r.restauradas.length} de ${r.total} filas.\nFecha del respaldo: ${fechaRespaldo}\n\nLa página se recargará ahora.`;
  }
  const encabezado = r.restauradas.length
    ? `⚠️ RESTAURACIÓN PARCIAL: se restauraron ${r.restauradas.length} de ${r.total} filas. ${r.fallidas.length} NO se restauraron.`
    : `❌ NO se restauró ninguna fila (${r.fallidas.length} de ${r.total} fallaron).`;
  return `${encabezado}\nFecha del respaldo: ${fechaRespaldo}\n\n` +
    `NO restauradas (siguen con los datos que tenían antes):\n${lista(r.fallidas.map((f) => `${f.id}: ${f.motivo}`))}\n\n` +
    (r.restauradas.length ? `Restauradas:\n${lista(r.restauradas)}\n\n` : "") +
    `Los datos quedaron MEZCLADOS entre el respaldo y lo anterior. Revisa las filas no restauradas antes de seguir trabajando.\n\nLa página se recargará ahora.`;
}

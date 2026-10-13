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
// Ahora: se valida el archivo antes de escribir nada y cada fila se escribe con la
// codificación que tiene HOY en el servidor (texto o objeto).
//
// ACCESOS: un respaldo NO cambia quién entra ni qué puede hacer. Las filas de acceso
// (usuarios y permisos, credenciales, facultades) NO se escriben: se conservan como están
// hoy, aunque el respaldo sea distinto, y las diferencias se informan para revisarlas por
// separado (sin mostrar credenciales). Lo mismo con los campos de acceso que viven dentro
// de otras filas: el espejo `main.usuarios` (que siembra `usuarios` si esa fila faltara) y
// los aprobadores de Rendiciones. Así un respaldo no reactiva a una persona desactivada,
// no devuelve un PIN revocado ni restituye permisos o aprobadores antiguos.
export const VERSIONES_ACEPTADAS = ["Mediterra Hub Backup v1"];
const ID_VALIDO = /^[A-Za-z0-9_:.\-]{1,120}$/;
export const FILAS_ACCESO = { usuarios: "usuarios y permisos", pins: "credenciales (PIN)", permisos_facultades: "facultades" };
export const CAMPOS_ACCESO = { main: { usuarios: "espejo de usuarios" }, rendiciones_config: { aprobadores: "aprobadores de Rendiciones" } };

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
const igual = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const conjunto = (xs) => new Set(Array.isArray(xs) ? xs : []);

// Diferencias de acceso por persona (respaldo vs hoy). Solo nombres y campos, nunca PIN.
export function diferenciasUsuarios(respaldo, hoy) {
  const porClave = (lista) => { const m = new Map(); (Array.isArray(lista) ? lista : []).forEach((u) => { if (u && (u.email || u.nombre)) m.set(String(u.email || u.nombre).toLowerCase(), u); }); return m; };
  const R = porClave(respaldo), H = porClave(hoy), out = [];
  for (const [k, r] of R) {
    const h = H.get(k), n = r.nombre || k;
    if (!h) { out.push(`${n}: está en el respaldo y hoy no existe (no se recrea)`); continue; }
    const cambios = [];
    if (!!h.desactivado !== !!r.desactivado) cambios.push(h.desactivado ? "hoy desactivada; el respaldo la tiene activa (sigue desactivada)" : "hoy activa; el respaldo la tiene desactivada");
    if ((h.rol || "") !== (r.rol || "")) cambios.push(`perfil hoy «${h.rol || "—"}», en el respaldo «${r.rol || "—"}»`);
    const mh = conjunto(h.modulos), mr = conjunto(r.modulos);
    const mas = [...mr].filter((x) => !mh.has(x)), menos = [...mh].filter((x) => !mr.has(x));
    if (mas.length || menos.length) cambios.push(`módulos: el respaldo ${mas.length ? "agregaría " + mas.join(", ") : ""}${mas.length && menos.length ? " y " : ""}${menos.length ? "quitaría " + menos.join(", ") : ""}`);
    if (!igual(h.tabPermisos, r.tabPermisos)) cambios.push("permisos por pestaña distintos");
    if (cambios.length) out.push(`${n}: ${cambios.join("; ")}`);
  }
  for (const [k, h] of H) if (!R.has(k)) out.push(`${h.nombre || k}: existe hoy y no está en el respaldo (se conserva)`);
  return out;
}
export function diferenciasCredenciales(respaldo, hoy) {
  const r = respaldo && typeof respaldo === "object" ? respaldo : {}, h = hoy && typeof hoy === "object" ? hoy : {};
  const nombre = (k) => k.replace(/_(h|temp)$/, "");
  const distintas = new Set(), soloRespaldo = new Set();
  Object.keys(r).forEach((k) => { if (!(k in h)) soloRespaldo.add(nombre(k)); else if (!igual(r[k], h[k])) distintas.add(nombre(k)); });
  const out = [];
  if (distintas.size) out.push(`credencial distinta a la del respaldo (se conserva la de hoy): ${[...distintas].sort().join(", ")}`);
  if (soloRespaldo.size) out.push(`credencial que solo existe en el respaldo (no se recupera): ${[...soloRespaldo].sort().join(", ")}`);
  return out;
}
function diferenciasAprobadores(r, h) {
  const R = r && typeof r === "object" ? r : {}, H = h && typeof h === "object" ? h : {};
  const claves = [...new Set([...Object.keys(R), ...Object.keys(H)])].filter((k) => (R[k] || "") !== (H[k] || ""));
  return claves.length ? [`${claves.length} asignación(es) de aprobador distintas: ${claves.slice(0, 10).join(", ")}${claves.length > 10 ? "…" : ""} (se conservan las de hoy)`] : [];
}

// actuales: { [id]: { value, updated_at } } tal como están HOY en el servidor.
export function prepararRestauracion(backup, actuales) {
  const v = validarRespaldo(backup);
  if (!v.ok) return { ok: false, errores: v.errores, filas: [] };
  const filas = [], notas = [], accesos = [];
  const hoy = (id) => (actuales[id] ? parsear(actuales[id].value) : undefined);
  for (const [id, tabla] of Object.entries(backup.tablas)) {
    let dato = parsear(tabla.data);
    const actual = actuales[id];
    if (FILAS_ACCESO[id]) {
      const dif = !actual ? [`hoy no existe; restaurarla devolvería los accesos del respaldo sin revisión`]
        : id === "usuarios" ? diferenciasUsuarios(dato, hoy(id))
        : id === "pins" ? diferenciasCredenciales(dato, hoy(id))
        : (igual(dato, hoy(id)) ? [] : ["contenido distinto al de hoy"]);
      accesos.push({ id, que: FILAS_ACCESO[id], diferencias: dif });
      continue;                                           // nunca se escribe desde un respaldo
    }
    if (CAMPOS_ACCESO[id] && dato && typeof dato === "object" && !Array.isArray(dato)) {
      const act = hoy(id);
      dato = { ...dato };
      for (const campo of Object.keys(CAMPOS_ACCESO[id])) {
        // Valor vigente: el de la fila de hoy; para el espejo de main, la fila `usuarios`.
        const vigente = act && typeof act === "object" && campo in act ? act[campo]
          : (id === "main" && campo === "usuarios" && Array.isArray(hoy("usuarios"))) ? hoy("usuarios") : undefined;
        const dif = campo === "usuarios" ? diferenciasUsuarios(dato[campo], vigente) : diferenciasAprobadores(dato[campo], vigente);
        if (vigente === undefined) delete dato[campo]; else dato[campo] = vigente;
        if (dif.length) accesos.push({ id: `${id}.${campo}`, que: CAMPOS_ACCESO[id][campo], diferencias: dif });
      }
    }
    // Misma codificación que la fila tiene hoy. Si no existe, como objeto (jsonb).
    const comoTexto = actual ? typeof actual.value === "string" : typeof tabla.data === "string" && typeof dato === "string";
    const value = comoTexto ? (typeof dato === "string" ? dato : JSON.stringify(dato)) : dato;
    filas.push({ id, value, codificacion: comoTexto ? "texto" : "objeto" });
  }
  if (accesos.length) notas.push(`Accesos: se conservaron los vigentes (${accesos.map((a) => a.id).join(", ")}). Un cambio de acceso se revisa por separado.`);
  return { ok: true, errores: [], filas, notas, accesos };
}

// `actuales` (recomendado): el estado de hoy en el servidor. Sin él se conserva el
// comportamiento anterior (todo como texto) solo para compatibilidad de pruebas viejas.
export async function restaurarFilas(backup, escribir, { actuales } = {}) {
  let plan;
  if (actuales) {
    plan = prepararRestauracion(backup, actuales);
    if (!plan.ok) return { total: 0, restauradas: [], fallidas: [], invalido: true, errores: plan.errores };
  } else {
    plan = { filas: Object.entries((backup && backup.tablas) || {}).filter(([id]) => !FILAS_ACCESO[id]).map(([id, tabla]) => ({ id, value: valorDeTabla(tabla) })), notas: [] };   // accesos: nunca
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
  return { total: tablas.length, restauradas, fallidas, notas: plan.notas || [], accesos: plan.accesos || [] };
}

export function mensajeRestauracion(r, fechaRespaldo) {
  const lista = (ids, max = 15) => ids.slice(0, max).map((x) => `  • ${x}`).join("\n") + (ids.length > max ? `\n  … y ${ids.length - max} más` : "");
  if (r.invalido) return `❌ Archivo de respaldo NO aceptado. No se escribió nada.\n\n${lista(r.errores || [], 10)}`;
  const conDif = (r.accesos || []).filter((a) => a.diferencias.length);
  const notas = ((r.notas && r.notas.length) ? `\n\n${r.notas.join("\n")}` : "")
    + (conDif.length ? `\n\nDiferencias de acceso NO aplicadas (revisar por separado):\n${lista(conDif.flatMap((a) => a.diferencias.map((d) => `${a.que}: ${d}`)))}` : "");
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

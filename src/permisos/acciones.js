/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────
// Autorización de ACCIONES en el navegador (oct-2026).
//
// Regla: una acción no puede contradecir un permiso explícito existente.
//   · Perfil (rol + nivel por pestaña) = permisos generales; los niveles efectivos salen de
//     permisosCore.getTabPerm (consulta sin configurar = "ver"; "editar" guardado = excepción).
//   · Facultades explícitas por persona (aprobar lo asignado, marcar pagada) no dependen
//     de la edición del módulo ni la conceden.
//   · Un nivel de pestaña explícito "ver" / "sin_acceso" se respeta.
//   · Lo NO configurado conserva el comportamiento anterior: acá no se concede
//     ni se quita nada por inferencia (decisiones pendientes en
//     docs/estado-rama-2026-10.md).
//
// Esto es defensa en el navegador, NO seguridad: con la llave pública cualquiera
// puede escribir directo en Supabase. La protección real es RLS/servidor
// (supabase/propuesta_rls_calendario_data.sql, sin activar).
// ─────────────────────────────────────────────────────────────────────────

export const NIVELES = ["editar", "ver", "sin_acceso"];

// Nivel EXPLÍCITO guardado para la pestaña, o undefined si no está configurado.
export function nivelExplicito(tabPermisos, clave) {
  const v = tabPermisos?.[clave];
  return NIVELES.includes(v) ? v : undefined;
}

// ── Rendiciones ──────────────────────────────────────────────────────────
// ¿Le toca a este usuario aprobar la rendición ahora? (misma regla de siempre)
// Sin aprobador asignado (cadena vacía) → solo admin/CFO.
export function meTocaAprobar(r, miEmail, admin, esCFO) {
  if (admin) return true;
  const cad = Array.isArray(r?.cadena) ? r.cadena : [];
  const paso = cad.length ? cad[r.nivelActual || 0] || null : null;
  if (!paso) return !!esCFO;
  return (paso.email || "").toLowerCase() === (miEmail || "").toLowerCase();
}

// u = { admin, esCFO, rendVerTodas, rendPagar, consulta, email, nombre }
// Aprobar: la ASIGNACIÓN (maestro de Rendiciones) es la facultad. Vale para cualquier rol,
// incluido consulta (caso Lucía Corbetto, matriz 08-10-2026), y no da ninguna otra facultad.
// Override existente: el admin puede aprobar cualquier paso (queda registrado como override).
export function puedeAprobarRendicion(u, r) {
  if (!r || r.estado !== "enviada" || !u) return false;
  return meTocaAprobar(r, u.email, !!u.admin, !!u.esCFO);
}

// Marcar pagada, siempre sobre una rendición APROBADA. Depende del modo de la fila
// `permisos_facultades` (src/permisos/facultades.js):
//   · "matriz": SOLO la facultad explícita rendPagar (08-10-2026: Carol Machuca y Milagros
//     Becerra; Angelo Huerta como reemplazo). No la da ser admin, CFO ni ver todas.
//   · "transicion": la regla publicada hoy en producción (ve todas = admin, CFO o
//     rendVerTodas). No amplía nada: evita que quede un periodo sin nadie que pague.
//   · fila sin cargar (u._facultadesOk !== true): no se sabe el modo → no se paga.
// u = usuario enriquecido con enriquecerUsuario (o el objeto `yo` de Rendiciones).
export function puedeMarcarPagada(u, r) {
  if (!r || r.estado !== "aprobada" || !u) return false;
  if (u._facultadesOk !== true) return false;
  if (u._modoPermisos === "matriz") return u.rendPagar === true;
  if (u._modoPermisos === "transicion") return !!(u.admin || u.esCFO || u.rendVerTodas);
  return false;
}

// Devolver una rendición aprobada: quien la aprobó o un admin (regla existente).
export function puedeDevolverAprobada(u, r) {
  if (!r || r.estado !== "aprobada" || !u) return false;
  return !!(u.admin || (r.revisadoPor && r.revisadoPor === u.nombre));
}

// ── Allegria: tabs configurables en Gestión de Usuarios ──────────────────
// sub-app / pestaña de liquidación → clave de TABS_PERMISOS_CONFIG.allegria
export const CLAVE_TAB_ALLEGRIA = {
  clientes: "clientes", productores: "productores", embarques: "embarques",
  liq_productor: "liquidaciones", liq_cliente: "liq_cliente", anticipos: "anticipos", cobranza: "cobranza",
};
// can = permiso de módulo de siempre (admin, o editor no consulta). Solo se RESTA lo explícito.
export function permisoTabAllegria(can, tabPermisos, vista) {
  const clave = CLAVE_TAB_ALLEGRIA[vista];
  const n = clave ? nivelExplicito(tabPermisos, clave) : undefined;
  return { ver: n !== "sin_acceso", editar: !!can && n !== "ver" && n !== "sin_acceso" };
}

// ── Finanzas: sub-vista Parámetros del flujo ─────────────────────────────
// Antes dependía solo de "flujo"; la pestaña "params" se configuraba sin efecto.
export function permisoParametros({ esAdmin, nivelFlujo, nivelParams }) {
  if (esAdmin) return { ver: true, editar: true };
  const edita = (n) => n !== "ver" && n !== "sin_acceso";
  return {
    ver: nivelParams !== "sin_acceso",
    editar: edita(nivelFlujo) && edita(nivelParams),
  };
}

// ── Allegria Service: páginas según el permiso EXPLÍCITO de su pestaña ────────
// Antes el menú no se filtraba: una página configurada «sin acceso» seguía visible
// (solo se bloqueaba editar). Se oculta SOLO si su clave está guardada como
// «sin_acceso» en la ficha (tab_permisos.allegria_service). No se usa el valor
// resuelto: para «config» el resuelto es «sin_acceso» por omisión y ocultaría la
// página a quien hoy la ve (sería retirar acceso por inferencia).
// Páginas sin clave propia (envases, repaletizaje, clientes, tarifario, servicios,
// pendientes, bases, reportes automáticos) no cambian: no hay permiso que respetar.
export const CLAVE_PAGINA_SERVICE = Object.freeze({
  centro: "centro",
  recepciones: "recepciones", recepcion_nueva: "recepciones", recepcion_detalle: "recepciones",
  lotes: "lotes", lote_detalle: "lotes",
  programa: "programa",
  ordenes: "ordenes", orden: "ordenes",
  pt: "pt",
  bodega: "pallets", pallet_detalle: "pallets",
  despachos: "despachos", despacho: "despachos",
  informes: "informes", informe_detalle: "informes",
  config: "config",
});
export function paginaServiceVisible(usuario, esAdmin, page) {
  if (esAdmin) return true;
  const k = CLAVE_PAGINA_SERVICE[page];
  if (!k) return true;
  return usuario?.tab_permisos?.allegria_service?.[k] !== "sin_acceso";
}

// ── Frisku · Reportería BI ─────────────────────────────────────────────────
// Se muestra si cualquiera de bi/reportes/tablero/resumen lo permite (regla de
// main). Desde que «bi» se puede configurar en Gestión de Usuarios, si «bi» está
// guardada explícitamente manda ella; si no, se mantiene la regla anterior. Nadie
// la tiene configurada hoy: no cambia el acceso de nadie.
export function visibilidadReporteriaFrisku(usuario, esAdmin, perm) {
  if (esAdmin) return true;
  const explicito = usuario?.tab_permisos?.frisku?.bi;
  if (explicito === "editar" || explicito === "ver" || explicito === "sin_acceso") return explicito !== "sin_acceso";
  return !!(perm.bi?.visible || perm.reportes?.visible || perm.tablero?.visible || perm.resumen?.visible);
}

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

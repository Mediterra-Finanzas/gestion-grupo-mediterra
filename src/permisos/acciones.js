/* eslint-disable */
// ─────────────────────────────────────────────────────────────────────────
// Autorización de ACCIONES en el navegador (oct-2026).
//
// Regla: una acción no puede contradecir un permiso explícito existente.
//   · rol "consulta" = "Consulta – solo visualiza" (App.jsx ROLES): nunca edita,
//     aprueba, paga ni devuelve. Tope "ver" en todas las pestañas.
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

// El rol consulta nunca supera "ver".
export function topeConsulta(rol, nivel) {
  return rol === "consulta" && nivel === "editar" ? "ver" : nivel;
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

// u = { admin, esCFO, rendVerTodas, consulta, email, nombre }
export function puedeAprobarRendicion(u, r) {
  if (!r || r.estado !== "enviada" || u?.consulta) return false;
  return meTocaAprobar(r, u.email, !!u.admin, !!u.esCFO);
}

// Marcar pagada: solo con autorización EXPLÍCITA para pagar.
//   · admin (rol "Administrador – acceso total") y esCFO (CLAUDE.md: Pagos = admin o esCFO).
//   · rendVerTodas NO autoriza a pagar: su definición en RendicionesModule es "ve TODAS
//     (solo lectura; solo el dueño modifica)". Antes bastaba para ver el botón.
// Si alguien más debe pagar, se decide y se configura de forma explícita (decisión D1);
// acá no se infiere de otros flags ni de la lista de avisos EMAILS_PAGO.
// Condiciones necesarias además: la rendición está aprobada y el usuario no es de consulta.
export function puedeMarcarPagada(u, r) {
  if (!r || r.estado !== "aprobada" || u?.consulta) return false;
  return !!(u.admin || u.esCFO);
}

// Devolver una rendición aprobada: quien la aprobó o un admin (regla existente).
export function puedeDevolverAprobada(u, r) {
  if (!r || r.estado !== "aprobada" || u?.consulta) return false;
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

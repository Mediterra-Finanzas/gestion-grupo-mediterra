/* eslint-disable */
// Matriz de permisos confirmada por Angelo Huerta el 08-10-2026 (docs/estado-rama-2026-10.md §4.10).
//
// Este archivo NO aplica nada solo: `planMatriz` calcula, contra la lista de usuarios
// cargada en la app, qué cambia y qué ya cumple; el admin ve esa vista previa y confirma.
// `aplicarPlan` devuelve la lista nueva y el registro para auditoría.
//
// Identidad de una persona: su CORREO normalizado (estable; el nombre puede repetirse o
// cambiar). Para quienes el código ya conoce el correo (WORKERS_BASE) se exige correo Y
// nombre coincidentes. Para el resto, la matriz solo trae el nombre tal como figura en el
// archivo de permisos autorizado (que no lleva correos): se exige UNA sola persona activa
// con ese nombre exacto (sin distinguir tildes ni mayúsculas) y CON correo; ese correo se
// muestra en la vista previa y queda en la auditoría. Si hay 0 o más de 1, no se aplica.
// Ojo: "José Tomás Silva" y "Jose Tomas Reyes Guevara" son personas distintas; la
// comparación es por nombre completo, nunca por prefijo.

export const MATRIZ_ID = "matriz-permisos-2026-10-08";

const P = {
  angelo:   { nombre: "Angelo Huerta",    email: "ahuerta@grupomediterra.cl" },
  carol:    { nombre: "Carol Machuca",    email: "cmachuca@grupomediterra.cl" },
  milagros: { nombre: "Milagros Becerra", email: "mbecerra@grupomediterra.cl" },
  michelle: { nombre: "Michelle Garcia",  email: "mgarcia@grupomediterra.cl" },
  pablo:    { nombre: "Pablo Duran",      email: "pduran@grupomediterra.cl" },
  // Sin correo en el código: se resuelven por nombre único (ver arriba).
  lucia:    { nombre: "Lucía Corbetto" },
  raimundo: { nombre: "Raimundo Valenzuela" },
  carolina: { nombre: "Carolina Lara" },
  denise:   { nombre: "Denise Piaget" },
  joseTomas:{ nombre: "José Tomás Silva" },
};

// Cada regla: a quién, qué campo y qué valor. `tipo:"facultad"` es un booleano en la ficha;
// `tipo:"pestana"` es tab_permisos[modulo][tab].
export const MATRIZ = Object.freeze([
  // Rendiciones: marcan pagada (solo aprobadas: lo exige puedeMarcarPagada)
  ...[P.carol, P.milagros, P.angelo].map(p => ({ persona: p, tipo: "facultad", campo: "rendPagar", valor: true })),
  // Rendiciones: ven todas (Angelo por CFO; el resto por la marca) — verificación
  ...[P.carol, P.milagros, P.michelle, P.pablo].map(p => ({ persona: p, tipo: "facultad", campo: "rendVerTodas", valor: true })),
  // Contabilidad: editan
  ...[P.angelo, P.michelle, P.pablo].map(p => ({ persona: p, tipo: "facultad", campo: "contabEditar", valor: true })),
  // Lucía: excepción explícita en Flujo; Parámetros sin acceso
  { persona: P.lucia, tipo: "pestana", modulo: "finanzas", tab: "flujo", valor: "editar" },
  { persona: P.lucia, tipo: "pestana", modulo: "finanzas", tab: "params", valor: "sin_acceso" },
  // Nóminas: preparan Carol y Milagros (Angelo por admin) — verificación
  ...[P.carol, P.milagros].map(p => ({ persona: p, tipo: "pestana", modulo: "finanzas", tab: "nominas", valor: "editar" })),
  // Frisku · Liquidaciones
  ...[P.raimundo, P.carolina].map(p => ({ persona: p, tipo: "pestana", modulo: "frisku", tab: "liquidaciones", valor: "editar" })),
  ...[P.denise, P.joseTomas].map(p => ({ persona: p, tipo: "pestana", modulo: "frisku", tab: "liquidaciones", valor: "sin_acceso" })),
  // Tareas · Configuración (Angelo por admin) — verificación
  ...[P.milagros, P.carol, P.michelle, P.pablo].map(p => ({ persona: p, tipo: "pestana", modulo: "tareas", tab: "config", valor: "editar" })),
]);

export const normNombre = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ").trim();
export const normCorreo = (s) => String(s || "").trim().toLowerCase();

// Resuelve la persona de la matriz a UN usuario de la lista. Devuelve {usuario} o {error}.
export function resolverPersona(usuarios, persona) {
  const activos = (usuarios || []).filter(u => u && !u.desactivado);
  if (persona.email) {
    const porCorreo = activos.filter(u => normCorreo(u.email) === normCorreo(persona.email));
    if (porCorreo.length !== 1) return { error: porCorreo.length ? "correo repetido en la lista de usuarios" : "no hay usuario activo con ese correo" };
    if (normNombre(porCorreo[0].nombre) !== normNombre(persona.nombre))
      return { error: `el correo corresponde a "${porCorreo[0].nombre}", no a "${persona.nombre}"` };
    return { usuario: porCorreo[0] };
  }
  const porNombre = activos.filter(u => normNombre(u.nombre) === normNombre(persona.nombre));
  if (porNombre.length !== 1) return { error: porNombre.length ? "nombre repetido: no se puede identificar" : "no hay usuario activo con ese nombre" };
  if (!normCorreo(porNombre[0].email)) return { error: "el usuario no tiene correo: no hay identificador estable" };
  return { usuario: porNombre[0] };
}

const valorActual = (u, r) => r.tipo === "facultad"
  ? u[r.campo] === true
  : (u.tab_permisos?.[r.modulo]?.[r.tab] ?? null);

// Vista previa: qué cambia, qué ya cumple y qué no se puede aplicar.
export function planMatriz(usuarios, matriz = MATRIZ) {
  const cambios = [], cumple = [], errores = [];
  for (const r of matriz) {
    const { usuario, error } = resolverPersona(usuarios, r.persona);
    const que = r.tipo === "facultad" ? r.campo : `${r.modulo}.${r.tab}`;
    if (error) { errores.push({ nombre: r.persona.nombre, que, motivo: error }); continue; }
    const antes = valorActual(usuario, r);
    const fila = { nombre: usuario.nombre, email: normCorreo(usuario.email), tipo: r.tipo, que,
      campo: r.campo, modulo: r.modulo, tab: r.tab, antes, despues: r.valor };
    (antes === r.valor ? cumple : cambios).push(fila);
  }
  return { id: MATRIZ_ID, cambios, cumple, errores };
}

// Aplica SOLO los cambios del plan (identificados por correo). No toca nada más de la ficha.
export function aplicarPlan(usuarios, plan) {
  const porCorreo = new Map();
  for (const c of plan.cambios) {
    if (!porCorreo.has(c.email)) porCorreo.set(c.email, []);
    porCorreo.get(c.email).push(c);
  }
  return (usuarios || []).map(u => {
    const cs = porCorreo.get(normCorreo(u.email));
    if (!cs || u.desactivado) return u;
    let n = { ...u };
    for (const c of cs) {
      if (c.tipo === "facultad") n[c.campo] = c.despues;
      else n = { ...n, tab_permisos: { ...(n.tab_permisos || {}),
        [c.modulo]: { ...((n.tab_permisos || {})[c.modulo] || {}), [c.tab]: c.despues } } };
    }
    return n;
  });
}

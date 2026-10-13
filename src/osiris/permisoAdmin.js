/* eslint-disable */
// ¿La persona en sesión es administradora? (oct-2026)
// App.jsx pasa `esAdmin` como FUNCIÓN (nombre) => bool. Usarla como booleano (`!!esAdmin`,
// `if(!esAdmin)`, `esAdmin&&…`) la vuelve SIEMPRE verdadera: cualquier perfil, incluido el de
// consulta, quedaba como administrador. Aquí se llama la función con la persona en sesión; un
// valor booleano explícito se respeta tal cual; cualquier otra cosa es «no administrador».
export function esAdministrador(usuarioActual, esAdmin) {
  if (typeof esAdmin === "function") { try { return esAdmin(usuarioActual && usuarioActual.nombre) === true; } catch (e) { return false; } }
  return esAdmin === true;
}

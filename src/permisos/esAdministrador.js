/* eslint-disable */
// ¿La persona en sesión es administradora? (oct-2026)
// App.jsx pasa `esAdmin` a los módulos como FUNCIÓN (nombre) => bool. Usarla como booleano
// (`!!esAdmin`, `if(!esAdmin)`, `esAdmin&&…`) la vuelve SIEMPRE verdadera. Aquí se llama con la
// persona en sesión; un booleano explícito se respeta; cualquier otra cosa es «no administrador».
// (Misma regla que src/osiris/permisoAdmin.js de la rama claude/osiris-permiso-orden.)
export function esAdministrador(usuarioActual, esAdmin) {
  if (typeof esAdmin === "function") { try { return esAdmin(usuarioActual && usuarioActual.nombre) === true; } catch (e) { return false; } }
  return esAdmin === true;
}

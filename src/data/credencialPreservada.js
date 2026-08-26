/* SEC-HF1 · La credencial guardada se preserva; el código nunca la aporta.
 *
 * `WORKERS_BASE` dejó de declarar `pin` porque el literal viajaba en el bundle publicado y
 * en su sourcemap. Pero el merge de usuarios hace `...wb`, y el autosave escribe `usuarios`
 * en la fila `main`: si el objeto fusionado saliera sin credencial, o con una cadena vacía,
 * el guardado siguiente BORRARÍA el PIN almacenado de esas personas.
 *
 * Retirar credenciales de `main` es trabajo de la migración SEC, con respaldo, validación y
 * rollback. No puede ocurrir como efecto lateral de un deploy de frontend.
 *
 * Esta función existe para que ese invariante sea COMPROBABLE. Podría ser una línea dentro
 * del merge, pero entonces la única forma de probarla sería replicar el merge en el test, y
 * un test que replica el código no prueba el código.
 */

/**
 * Devuelve el fragmento a esparcir en el usuario fusionado: la credencial que ya estaba
 * guardada, o nada.
 *
 * Distingue "no hay campo" de "el campo vale algo falsy". Un `pin: ""` guardado se
 * preserva tal cual: no es tarea de esta función decidir que está mal, y descartarlo sería
 * la misma escritura destructiva por otra vía.
 */
export function credencialPreservada(guardado) {
  if (!guardado || typeof guardado !== "object") return {};
  return Object.prototype.hasOwnProperty.call(guardado, "pin") ? { pin: guardado.pin } : {};
}

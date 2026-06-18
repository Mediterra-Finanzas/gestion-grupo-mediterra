/* eslint-disable */
// src/guardClient.js — "Redirector" del cliente hacia el guardia (Etapa 3)
// ----------------------------------------------------------------------
// Intercepta UNA sola vez window.fetch. Cuando el interruptor está PRENDIDO,
// reescribe automáticamente toda llamada directa a la base
//   ${SUPA_URL}/rest/v1/<tabla>?...   →   /api/db/<tabla>?...
// y le quita la llave pública (apikey/Authorization), enviando la sesión
// por cookie (credentials:'include'). Así la app habla con la base SOLO a
// través del guardia, sin tener que editar las decenas de lugares que la
// usan.
//
// Interruptor: variable de entorno REACT_APP_USE_GUARD === 'true'
//   - Apagado (por defecto): no toca nada, la app funciona igual que hoy.
//   - Prendido: enruta por el guardia.
//
// NO afecta:
//   - Archivos/Storage (${SUPA_URL}/storage/v1/...) → se blindan aparte.
//   - APIs externas (mindicador, frankfurter, emailjs) y /api/* propios.

export const USE_GUARD = (process.env.REACT_APP_USE_GUARD === "true");

export function installGuard(SUPA_URL) {
  if (!USE_GUARD) return;                 // interruptor apagado → no hacer nada
  if (typeof window === "undefined") return;
  if (window.__guardInstalled) return;    // instalar una sola vez
  window.__guardInstalled = true;

  const orig = window.fetch.bind(window);
  const prefijo = SUPA_URL.replace(/\/+$/, "") + "/rest/v1/";

  window.fetch = function (input, init) {
    init = init || {};
    // Solo nos interesan las llamadas con URL string (lo que usa la app)
    const url = (typeof input === "string") ? input
              : (input && input.url) ? input.url : null;

    if (url && url.indexOf(prefijo) === 0) {
      const resto = url.slice(prefijo.length);   // "calendario_data?..."
      const nuevaUrl = "/api/db/" + resto;

      // Copiar headers quitando la llave pública
      const h = new Headers((init.headers) || (typeof input !== "string" && input && input.headers) || {});
      h.delete("apikey");
      h.delete("Authorization");

      const nuevoInit = Object.assign({}, init, {
        method: init.method || (typeof input !== "string" && input && input.method) || "GET",
        headers: h,
        credentials: "include",
      });
      // Conservar el body si venía en init
      if (init.body != null) nuevoInit.body = init.body;

      return orig(nuevaUrl, nuevoInit);
    }

    return orig(input, init);
  };
  try { console.log("[guard] redirector activo → /api/db"); } catch {}
}

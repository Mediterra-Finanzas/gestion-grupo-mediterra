// api/_destinos.js — Lista de destinos de salida permitidos FUERA DE PRODUCCIÓN.
//
// Activa solo si VERCEL_ENV !== "production" y (VERCEL_ENV está definida o
// DESTINOS_PERMITIDOS está definida). En producción no hace nada: todas las
// funciones responden "permitido" sin mirar las listas.
//
//   DESTINOS_PERMITIDOS         hosts de salida, separados por coma
//                               (ej. "<ref-staging>.supabase.co,smtp.office365.com").
//                               Se compara con host:puerto o con el nombre del host.
//   CORREO_DESTINOS_PERMITIDOS  direcciones exactas y/o dominios "@dominio", por coma.
//                               Si falta, NO se envía ningún correo (falla cerrado).
//
// Hosts de producción siempre rechazados fuera de producción, aunque estén en la lista.
// Lo rechazado deja una línea "[destino-no-autorizado]" en el log, sin contenido del mensaje.

const HOSTS_PRODUCCION = ["bywovqayuzodbzwsriet.supabase.co", "gestion-grupo-mediterra.vercel.app"];

const lista = (v) => String(v || "").split(/[,;\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

function guardiaActiva(env = process.env) {
  return env.VERCEL_ENV !== "production" && (!!env.VERCEL_ENV || !!env.DESTINOS_PERMITIDOS);
}

function registrar(contexto, detalle) {
  console.warn(`[destino-no-autorizado] ${contexto}: ${detalle}`);
}

// ¿Se puede salir a esta URL? → {ok, host, motivo?}
function hostPermitido(url, env = process.env) {
  if (!guardiaActiva(env)) return { ok: true, host: null, guardia: false };
  let u;
  try { u = new URL(String(url)); } catch (e) { return { ok: false, host: null, motivo: "url_invalida" }; }
  const host = u.host.toLowerCase(), nombre = u.hostname.toLowerCase();
  if (HOSTS_PRODUCCION.includes(nombre)) return { ok: false, host, motivo: "host_de_produccion" };
  const permitidos = lista(env.DESTINOS_PERMITIDOS);
  if (!permitidos.length) return { ok: false, host, motivo: "sin_lista_destinos" };
  if (permitidos.includes(host) || permitidos.includes(nombre)) return { ok: true, host, guardia: true };
  return { ok: false, host, motivo: "host_no_autorizado" };
}

// Para envolver una salida: lanza Error(code "destino_no_autorizado") si no se puede.
function exigirDestinoPermitido(url, contexto = "salida", env = process.env) {
  const r = hostPermitido(url, env);
  if (r.ok) return url;
  registrar(contexto, `host=${r.host || "?"} motivo=${r.motivo}`);
  const e = new Error(`Destino no autorizado fuera de producción (${r.motivo})`);
  e.code = "destino_no_autorizado";
  e.motivo = r.motivo;
  throw e;
}

// "Nombre <a@b.cl>, c@d.cl" | ["a@b.cl"] → ["a@b.cl", "c@d.cl"]
function direcciones(to) {
  const partes = Array.isArray(to) ? to : String(to || "").split(/[,;]+/);
  return partes.map((p) => {
    const s = String(p && typeof p === "object" ? p.address || "" : p || "").trim();
    const m = /<([^>]+)>/.exec(s);
    return (m ? m[1] : s).trim().toLowerCase();
  }).filter(Boolean);
}

function correoPermitido(direccion, env = process.env) {
  if (!guardiaActiva(env)) return true;
  const d = String(direccion || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(d)) return false;
  const dominio = d.slice(d.indexOf("@"));
  return lista(env.CORREO_DESTINOS_PERMITIDOS).some((p) => (p.startsWith("@") ? p === dominio : p === d));
}

// Todos los destinatarios deben estar permitidos; si uno no lo está, se rechaza el mensaje entero.
// → {ok:true} | {ok:false, motivo:"sin_lista_correos"|"destinatario_no_autorizado"|"sin_destinatarios", rechazados:n}
function revisarDestinatarios(to, contexto = "correo", env = process.env) {
  if (!guardiaActiva(env)) return { ok: true, guardia: false };
  const dirs = direcciones(to);
  let motivo = null, rechazados = 0;
  if (!lista(env.CORREO_DESTINOS_PERMITIDOS).length) { motivo = "sin_lista_correos"; rechazados = dirs.length; }
  else if (!dirs.length) motivo = "sin_destinatarios";
  else { rechazados = dirs.filter((d) => !correoPermitido(d, env)).length; if (rechazados) motivo = "destinatario_no_autorizado"; }
  if (!motivo) return { ok: true, guardia: true };
  // Sin contenido ni direcciones completas: solo dominios.
  const dominios = [...new Set(dirs.map((d) => d.slice(d.indexOf("@"))))].join(",");
  registrar(contexto, `motivo=${motivo} destinatarios=${dirs.length} rechazados=${rechazados} dominios=${dominios || "-"}`);
  return { ok: false, guardia: true, motivo, rechazados };
}

module.exports = { guardiaActiva, hostPermitido, exigirDestinoPermitido, correoPermitido, revisarDestinatarios, direcciones, HOSTS_PRODUCCION };

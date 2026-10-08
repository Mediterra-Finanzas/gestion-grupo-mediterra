/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// Facultades explícitas por persona (matriz 08-10-2026) en una FILA PROPIA.
//
// Por qué no van en la ficha de `usuarios`: el código de `main` publicado
// reconstruye la ficha de los usuarios base (Angelo, Carol, Milagros, Michelle,
// Pablo, Nicolás) con una lista cerrada de campos y la reescribe al iniciar
// sesión. Un campo nuevo en la ficha se perdería en cuanto alguien abriera la
// versión anterior (rollback), y al volver a la nueva nadie podría pagar. La
// fila `permisos_facultades` no la toca ninguna versión anterior.
//
// Identidad = correo normalizado. Sin correo no hay facultad.
//
// Modo de la regla de pago (`modo`):
//   · "transicion" (fila inexistente o recién creada): paga quien paga HOY en
//     producción (`admin`, `esCFO` o `rendVerTodas`). No es un permiso nuevo ni
//     más amplio: es el comportamiento publicado, que sigue hasta que el admin
//     active la matriz.
//   · "matriz": paga SOLO quien tiene `rendPagar`. Solo se activa si al menos una
//     persona activa con correo tiene la facultad (no puede quedar nadie).
//   Volver a "transicion" es un paso explícito, con motivo y registro.
// Si la fila no se pudo leer, no se sabe el modo: no se paga (falla cerrada).
// ══════════════════════════════════════════════════════════════════════

export const FILA_FACULTADES = "permisos_facultades";
export const FACULTADES = Object.freeze(["rendPagar", "contabEditar", "remPreparar", "remAprobar"]);
export const ETIQUETA_FACULTAD = Object.freeze({
  rendPagar: "marca rendiciones pagadas",
  contabEditar: "edita en Contabilidad",
  remPreparar: "prepara la nómina de remuneraciones",
  remAprobar: "aprueba la nómina de remuneraciones",
});
export const MODOS = Object.freeze(["transicion", "matriz"]);

export const normCorreo = (s) => String(s || "").trim().toLowerCase();

export function filaVacia() {
  return { v: 1, modo: "transicion", porCorreo: {}, historial: [] };
}

export function normalizarFila(f) {
  const base = filaVacia();
  if (!f || typeof f !== "object") return base;
  const porCorreo = {};
  for (const [k, v] of Object.entries(f.porCorreo || {})) {
    const c = normCorreo(k); if (!c || !v || typeof v !== "object") continue;
    porCorreo[c] = {};
    for (const fac of FACULTADES) if (v[fac] === true) porCorreo[c][fac] = true;
  }
  return { ...base, ...f, modo: MODOS.includes(f.modo) ? f.modo : "transicion", porCorreo,
    historial: Array.isArray(f.historial) ? f.historial : [] };
}

// Facultades de una persona según la fila. Nada viene del rol ni de la ficha.
export function facultadesDe(usuario, fila) {
  const r = {}; FACULTADES.forEach(f => (r[f] = false));
  const c = normCorreo(usuario?.email);
  const p = c && fila?.porCorreo?.[c];
  if (p) FACULTADES.forEach(f => (r[f] = p[f] === true));
  return r;
}

// Usuario listo para la app: facultades desde la fila + modo + si la fila cargó.
// Lo que traiga la ficha en esos campos se ignora (la fila es la única fuente).
export function enriquecerUsuario(usuario, fila, filaOk) {
  if (!usuario) return usuario;
  const fac = filaOk ? facultadesDe(usuario, fila) : facultadesDe(null, null);
  return { ...usuario, ...fac, _facultadesOk: !!filaOk, _modoPermisos: filaOk ? (fila?.modo || "transicion") : null };
}

const entrada = (accion, usuario, extra = {}) => ({ accion, usuario: usuario?.nombre || "—",
  correo: normCorreo(usuario?.email), ts: new Date().toISOString(), ...extra });

export function conFacultad(fila, correo, facultad, valor, autor) {
  const f = normalizarFila(fila); const c = normCorreo(correo);
  if (!c) throw new Error("Sin correo no hay identidad para la facultad");
  if (!FACULTADES.includes(facultad)) throw new Error(`Facultad desconocida: ${facultad}`);
  const antes = f.porCorreo[c]?.[facultad] === true;
  if (antes === !!valor) return f;
  const persona = { ...(f.porCorreo[c] || {}) };
  if (valor) persona[facultad] = true; else delete persona[facultad];
  const porCorreo = { ...f.porCorreo, [c]: persona };
  return { ...f, porCorreo, historial: [...f.historial, entrada("facultad", autor, { destino: c, facultad, antes, despues: !!valor })] };
}

export function pagadoresActivos(fila, usuarios) {
  const f = normalizarFila(fila);
  return (usuarios || []).filter(u => u && !u.desactivado && normCorreo(u.email) && f.porCorreo[normCorreo(u.email)]?.rendPagar === true);
}

// ¿Se puede activar la regla de pago de la matriz sin dejar a nadie pagando?
export function puedeActivarMatriz(fila, usuarios) {
  const n = pagadoresActivos(fila, usuarios).length;
  return n > 0 ? { ok: true, pagadores: n } : { ok: false, motivo: "Ninguna persona activa tiene la facultad de pagar: activar dejaría sin pagos." };
}

export function cambiarModo(fila, modo, autor, motivo, usuarios) {
  const f = normalizarFila(fila);
  if (!MODOS.includes(modo)) throw new Error(`Modo desconocido: ${modo}`);
  if (f.modo === modo) return f;
  if (modo === "matriz") { const v = puedeActivarMatriz(f, usuarios); if (!v.ok) throw new Error(v.motivo); }
  if (modo === "transicion" && !String(motivo || "").trim()) throw new Error("Volver a la regla de transición exige un motivo");
  return { ...f, modo, historial: [...f.historial, entrada("modo", autor, { desde: f.modo, hacia: modo, motivo: motivo || "" })] };
}

// ── Persistencia (contrato único; carga que lanza, guardado confirmado) ──
// `persist` se inyecta para poder probar sin red.
export async function cargarFacultades(persist) {
  const r = await persist.load(FILA_FACULTADES);   // lanza ante fallo de red (Regla 9)
  return normalizarFila(r.existe ? r.value : null);
}
export async function guardarFacultades(persist, fila) {
  return persist.saveConfirmed(FILA_FACULTADES, normalizarFila(fila), {});
}

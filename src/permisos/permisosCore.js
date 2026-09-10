/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// permisosCore — lógica PURA del modelo usuarios/permisos (sin React, sin red).
//
// PROCEDENCIA Y JUSTIFICACIÓN DE REUSO (vs el fix viejo 952dbcb sobre a599f47)
// El fix viejo se construyó sobre OTRA arquitectura de persistencia (dbSave LWW).
// Su RCA de transporte era inválida para 27b423b (aquí `main` YA tiene OCC vía
// persistContract). PERO estas funciones son PURAS del MODELO DE DATOS de
// `usuarios[]` (mismos campos `rol/modulos/tab_permisos/…` y misma semántica de
// merge por usuario/campo/pestaña), y el modelo es IDÉNTICO en 27b423b
// (App.jsx:2105-2174 boot-merge, App.jsx:740 getTabPerm). Por eso se reusa el
// MODELO/MERGE puro; lo que cambia es el TRANSPORTE: en vez de una fila LWW
// bespoke, el store (permisosUsuariosStore.js) EXTIENDE el contrato F0
// (persistContract), usando su OCC/confirmación/dirty/coalescencia.
//
// Cada línea reusada se justifica así: es semántica de datos, no de transporte.
// ══════════════════════════════════════════════════════════════════════

const _eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const _clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

// ── Provisión de Rendiciones (fiel a App.jsx garantizarAccesoRendiciones) ──
// Puramente ADITIVA: nunca degrada a quien ya tiene Finanzas.
export function garantizarAccesoRendiciones(u) {
  const mods = Array.isArray(u.modulos) ? u.modulos : ["tareas"];
  if (mods.includes("finanzas")) return u;
  const finanzasPrev = (u.tab_permisos && u.tab_permisos.finanzas) || {};
  return {
    ...u,
    modulos: [...mods, "finanzas"],
    tab_permisos: {
      ...(u.tab_permisos || {}),
      finanzas: {
        ...finanzasPrev,
        dashboard: "sin_acceso", flujo: "sin_acceso", bancos: "sin_acceso",
        creditos: "sin_acceso", nominas: "sin_acceso", params: "sin_acceso",
        reporte: "sin_acceso", auditoria: "sin_acceso", eeff: "sin_acceso",
        rendiciones: finanzasPrev.rendiciones || "ver",
      },
    },
  };
}

// ── Guard anti-pérdida (fiel al guard de dbSave, App.jsx:148-167) ──
// Bloquea la escritura si la lista cae por debajo del piso o se queda sin admin.
export function antiLossGuard(usuarios, prevCount, minUsers = 6) {
  if (!Array.isArray(usuarios)) return { ok: true };
  if (usuarios.length < minUsers)
    return { ok: false, reason: `usuarios ${usuarios.length} < minUsers ${minUsers}` };
  const pc = prevCount || minUsers;
  if (usuarios.length < pc)
    return { ok: false, reason: `usuarios ${usuarios.length} < prevCount ${pc}` };
  if (usuarios.filter((u) => u.rol === "admin").length === 0)
    return { ok: false, reason: "sin admin" };
  return { ok: true };
}

// ¿esta sesión cambió ALGO de este usuario respecto de su base?
function cambioAlgo(bu, lu) {
  const keys = new Set([...Object.keys(bu || {}), ...Object.keys(lu || {})]);
  for (const k of keys) if (!_eq((bu || {})[k], (lu || {})[k])) return true;
  return false;
}

// ══════════════════════════════════════════════════════════════════════
// MERGE DE TRES VÍAS por usuario / campo / pestaña.
//   base  = snapshot que ESTA sesión cargó (ancestro común)
//   local = estado actual de ESTA sesión (mis cambios sobre base)
//   fresh = fila recién releída del servidor (puede traer cambios ajenos)
//
// Regla por campo/pestaña que ESTA sesión cambió (local !== base):
//   • fresh === base  → nadie más lo tocó → aplico mi valor (targeted)
//   • fresh === local → ya coincide → no-op idempotente
//   • si no           → CONFLICTO real mismo-objetivo/mismo-campo → se reporta,
//                       jamás LWW silencioso (fail-closed).
// Lo que NO cambié conserva el valor de `fresh` (adopto la verdad ajena).
// Devuelve { merged, conflicts }. conflicts != [] ⇒ el caller NO debe escribir.
// ══════════════════════════════════════════════════════════════════════
export function mergeUsuariosThreeWay(base, local, fresh) {
  const conflicts = [];
  const baseByName = new Map((base || []).map((u) => [u.nombre, u]));
  const freshByName = new Map((fresh || []).map((u) => [u.nombre, u]));

  const out = (fresh || []).map((fu) => _clone(fu)); // partir del servidor
  const outByName = new Map(out.map((u) => [u.nombre, u]));

  (local || []).forEach((lu) => {
    const bu = baseByName.get(lu.nombre);
    const fu = freshByName.get(lu.nombre);

    // Usuario NUEVO en esta sesión
    if (!bu) {
      if (!fu) { const nu = _clone(lu); out.push(nu); outByName.set(nu.nombre, nu); }
      else if (!_eq(fu, lu)) conflicts.push({ nombre: lu.nombre, tipo: "create-create" });
      return;
    }

    const target = outByName.get(lu.nombre);
    if (!target) { // lo borró otra sesión mientras yo lo editaba
      if (cambioAlgo(bu, lu)) conflicts.push({ nombre: lu.nombre, tipo: "edit-vs-delete" });
      return;
    }

    // Campos planos (todo menos tab_permisos)
    const keys = new Set([...Object.keys(bu), ...Object.keys(lu)]);
    keys.forEach((k) => {
      if (k === "tab_permisos") return;
      const b = bu[k], l = lu[k], f = fu ? fu[k] : undefined;
      if (_eq(b, l)) return;                 // no cambié este campo
      if (_eq(f, b)) target[k] = l;          // nadie más lo tocó → aplico
      else if (_eq(f, l)) { /* ya coincide */ }
      else conflicts.push({ nombre: lu.nombre, campo: k, base: b, local: l, server: f });
    });

    // tab_permisos: granularidad módulo / pestaña
    const btp = bu.tab_permisos || {}, ltp = lu.tab_permisos || {}, ftp = (fu && fu.tab_permisos) || {};
    const modulos = new Set([...Object.keys(btp), ...Object.keys(ltp)]);
    modulos.forEach((mod) => {
      const bm = btp[mod] || {}, lm = ltp[mod] || {}, fm = ftp[mod] || {};
      const tabs = new Set([...Object.keys(bm), ...Object.keys(lm)]);
      tabs.forEach((t) => {
        const b = bm[t], l = lm[t], f = fm[t];
        if (b === l) return;                 // no cambié esta pestaña
        if (f === b) {                        // nadie más la tocó → aplico
          if (!target.tab_permisos) target.tab_permisos = {};
          if (!target.tab_permisos[mod]) target.tab_permisos[mod] = {};
          target.tab_permisos[mod][t] = l;
        } else if (f === l) { /* ya coincide */ }
        else conflicts.push({ nombre: lu.nombre, modulo: mod, tab: t, base: b, local: l, server: f });
      });
    });
  });

  return { merged: out, conflicts };
}

// Lectura efectiva de permiso de pestaña (fiel a getTabPerm, App.jsx:740).
export function getTabPerm(usuario, modulo, tabId) {
  if (!usuario) return "sin_acceso";
  if (usuario.rol === "admin") return "editar";
  if (usuario.rol === "gerente_tecnico" && modulo === "osiris") return "editar";
  if (tabId === "config") return (usuario.tab_permisos?.[modulo]?.[tabId]) ?? "sin_acceso";
  return (usuario.tab_permisos?.[modulo]?.[tabId]) ?? "editar";
}

export const _internal = { _eq, _clone, cambioAlgo };

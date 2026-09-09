/* Adaptador entre el snapshot transaccional y los constructores que ya existen.
 * No es una segunda fuente de verdad: no decide qué se respalda ni cómo se cifra,
 * solo traduce la forma `{datos:[{id,value,updated_at}]}` a lo que
 * `respaldoIdentidad.js` y `backupGenerador.js` ya esperan. */

import { ALLOWLIST, reglaDe, sanearFila, CLASE } from "./backupGenerador.js";
import { construirObjetoA, construirObjetoB, MOTIVO_ID } from "./respaldoIdentidad.js";

export const FILA_PADRON = "main";
export const FILA_PINS = "pins";

/* El padrón y las credenciales no entran en `negocio`: A ya los lleva en su
 * propia sección y B es un objeto aparte con otra clave. Duplicarlos en
 * `negocio` metería credenciales dentro del objeto equivocado. */
export function partirSnapshot(snapshot, allowlist = ALLOWLIST) {
  const filas = Array.isArray(snapshot?.datos) ? snapshot.datos : [];
  const negocio = {};
  const bloqueadas = [];
  let padron = null, pins = null;

  for (const f of filas) {
    if (f.id === FILA_PADRON) { padron = f.value; continue; }
    if (f.id === FILA_PINS) { pins = f.value; continue; }
    const regla = reglaDe(f.id, allowlist);
    if (!regla || regla.clase === CLASE.BLOQUEADA) { bloqueadas.push(f.id); continue; }
    const { valor, retirados } = sanearFila(f.value, regla);
    negocio[f.id] = { value: valor, updated_at: f.updated_at, retirados };
  }
  return { negocio, padron, pins, bloqueadas, filas: filas.length };
}

/* El padrón vive en `main.usuarios`. Si esa forma cambia, se aborta: adivinar
 * la ubicación del padrón es exactamente cómo se pierde gente en un restore. */
export function padronDe(valorMain) {
  const u = valorMain && Array.isArray(valorMain.usuarios) ? valorMain.usuarios : null;
  return u ? { usuarios: u } : null;
}

/* Los PIN se guardan como `${nombre}_h`. La identidad se resuelve contra el
 * padrón por nombre canónico; si no hay correspondencia se informa, no se
 * inventa un identity_id. */
export function resolverContra(padron) {
  const porNombre = new Map();
  for (const u of padron?.usuarios || []) {
    const id = u.identity_id || null;
    if (!id) continue;
    for (const clave of [u.nombre, u.email]) {
      if (typeof clave === "string" && clave.trim()) porNombre.set(normalizar(clave), id);
    }
  }
  return (base) => porNombre.get(normalizar(base)) || null;
}

export function normalizar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/* Devuelve los dos objetos listos para cifrar, con el mismo correlationId.
 * Si A no se puede construir, B tampoco se emite: un objeto de credenciales sin
 * su padrón es material sensible sin nada que lo justifique. */
export function construirPar({ snapshot, correlationId, lote, allowlist = ALLOWLIST, resolverIdentidad }) {
  const { negocio, padron: valorMain, pins, bloqueadas, filas } = partirSnapshot(snapshot, allowlist);
  const padron = padronDe(valorMain);
  if (!padron) return { ok: false, motivo: MOTIVO_ID.SIN_PADRON };

  const a = construirObjetoA({ negocio, padron });
  if (!a.ok) return { ok: false, motivo: a.motivo, desconocidos: a.desconocidos, campo: a.campo };

  // La boveda sec_* manda. El padron solo se usa si no hay resolvedor de boveda,
  // porque `main.usuarios[].identity_id` puede estar vacio y eso no debe inventarse.
  const b = construirObjetoB({ pins: pins || {}, resolverIdentidad: resolverIdentidad || resolverContra(padron) });
  if (!b.ok) return { ok: false, motivo: b.motivo };

  const sello = { correlationId, lote, tomado_at: snapshot?.tomado_at || null, filas };
  return {
    ok: true,
    A: { ...a.objeto, ...sello, recursos: Object.keys(negocio).length, bloqueadas },
    B: { ...b.objeto, ...sello },
    retirados: a.retirados,
    sinIdentidad: b.sinIdentidad,
    bloqueadas,
  };
}

/* Adaptador entre el snapshot transaccional y los constructores que ya existen.
 * No es una segunda fuente de verdad: no decide qué se respalda ni cómo se cifra,
 * solo traduce la forma `{datos:[{id,value,updated_at}], modo_identidad, identidades}` a lo
 * que `respaldoIdentidad.js` y `backupGenerador.js` ya esperan. */

import { ALLOWLIST, reglaDe, sanearFila, CLASE } from "./backupGenerador.js";
import { construirObjetoA, construirObjetoB, MOTIVO_ID, MOTIVO_PINS, MODO_IDENTIDAD } from "./respaldoIdentidad.js";

export const FILA_PADRON = "main";
export const FILA_PINS = "pins";

export const MOTIVO_SNAPSHOT = {
  MAIN_NO_CLASIFICADA: "clave_de_main_no_clasificada",
  SIN_IDENTIDADES: "snapshot_sin_identidades",
  MODO_INDETERMINADO: "snapshot_sin_modo_de_identidad",
  BOVEDA_INCOMPLETA: "boveda_incompleta",
  BOVEDA_SIN_ALIAS: "boveda_sin_alias_vigentes",
  MODO_DISTINTO: "modo_de_identidad_distinto_del_declarado",
};

/* `main` es MIXTA: padrón de usuarios + datos de Tareas.
 * - El padrón va a A.padron (sin credenciales en claro).
 * - Las claves de Tareas declaradas en la allowlist van a `negocio.main`, como cualquier
 *   recurso de negocio. Antes `main` se tomaba entero como padrón y estas claves se
 *   perdían sin aviso (estados, comentarios, tareasConfig, supervisores, tareasExtra,
 *   tareasOverrides, recsDone, recsComentarios, mes, anio).
 * - Una clave de `main` que no es el padrón ni está declarada DETIENE el respaldo: si es
 *   Tareas nueva, omitirla es pérdida de datos; si es sensible, copiarla es una fuga.
 *   Decide una persona y se declara en la allowlist.
 * `pins` no entra en `negocio`: su material va a B, que es otro objeto con otra clave. */
export function partirSnapshot(snapshot, allowlist = ALLOWLIST) {
  const filas = Array.isArray(snapshot?.datos) ? snapshot.datos : [];
  const negocio = {};
  const bloqueadas = [];
  let padron = null, pins = null, mainNoClasificadas = [];

  for (const f of filas) {
    if (f.id === FILA_PINS) { pins = f.value; continue; }
    const regla = reglaDe(f.id, allowlist);
    if (f.id === FILA_PADRON) {
      padron = f.value;
      const valor = f.value && typeof f.value === "object" && !Array.isArray(f.value) ? f.value : {};
      const declaradas = new Set(Array.isArray(regla?.campos) ? regla.campos : []);
      mainNoClasificadas = Object.keys(valor).filter((k) => k !== "usuarios" && !declaradas.has(k)).sort();
      const tareas = {};
      for (const k of Object.keys(valor)) if (declaradas.has(k)) tareas[k] = valor[k];
      negocio[FILA_PADRON] = { value: tareas, updated_at: f.updated_at, retirados: [], padronEnObjetoA: true, clase: CLASE.NEGOCIO };
      continue;
    }
    if (!regla || regla.clase === CLASE.BLOQUEADA) { bloqueadas.push(f.id); continue; }
    const { valor, retirados } = sanearFila(f.value, regla);
    // La clase viaja con el recurso: la reconstrucción solo repone NEGOCIO. Auditoría y copias
    // viajan vacías como constancia de lo retirado, nunca para escribirse encima.
    negocio[f.id] = { value: valor, updated_at: f.updated_at, retirados, clase: regla.clase };
  }
  return { negocio, padron, pins, bloqueadas, filas: filas.length, mainNoClasificadas };
}

/* El padrón vive en `main.usuarios`. Si esa forma cambia, se aborta: adivinar
 * la ubicación del padrón es exactamente cómo se pierde gente en un restore. */
export function padronDe(valorMain) {
  const u = valorMain && Array.isArray(valorMain.usuarios) ? valorMain.usuarios : null;
  return u ? { usuarios: u } : null;
}

/* Los PIN se guardan como `${nombre}_h` y el login los busca con el nombre EXACTO. La
 * identidad se resuelve igual: sin quitar acentos ni mayúsculas ("José" y "Jose" son dos
 * llaves) y sin usar el correo, que no es llave de `pins`. Sin correspondencia, null: no se
 * inventa un identity_id. */
export function resolverContra(padron) {
  const porNombre = new Map();
  for (const u of padron?.usuarios || []) {
    if (typeof u.nombre === "string" && u.identity_id) porNombre.set(u.nombre, u.identity_id);
  }
  return (base) => porNombre.get(base) || null;
}

/* Resolvedor desde las identidades que vienen DENTRO del snapshot (misma instantánea que
 * `pins` y `main`). `hashLlave` es el mismo sha256 del nombre que usa la bóveda. Una huella
 * con dos identity_id distintos no se resuelve: queda sin identidad y se reporta. */
export function resolverDesdeSnapshot(snapshot, hashLlave) {
  if (!Array.isArray(snapshot?.identidades) || typeof hashLlave !== "function") return null;
  const porHash = new Map();
  for (const x of snapshot.identidades) {
    const previo = porHash.get(x.llave_hash);
    porHash.set(x.llave_hash, previo === undefined || previo === x.identity_id ? x.identity_id : null);
  }
  return (nombre) => porHash.get(hashLlave(nombre)) || null;
}

/* Modo de identidad del ORIGEN, según lo que declara el snapshot
 * (sql/respaldo/snapshot-consistente.sql). Sin el campo no se infiere nada. */
export function modoIdentidadDe(snapshot) {
  const m = snapshot?.modo_identidad;
  if (m === "boveda") return Array.isArray(snapshot.identidades) ? "boveda" : "indeterminado";
  if (m === "legacy") return snapshot.identidades == null ? "legacy" : "indeterminado";
  if (m === "boveda_incompleta") return "boveda_incompleta";
  return "indeterminado";
}

/* El modo DECLARADO por configuración tiene que coincidir con el del origen. Separa la
 * ausencia de bóveda por arquitectura (legacy, válido si se declara) de los errores que
 * nunca se tratan como legacy: bóveda a medias, bóveda sin alias y snapshot viejo. Un alias
 * faltante para una credencial concreta se detecta después (sinIdentidad → INCOMPLETO). */
export function decidirModoIdentidad({ snapshot, declarado }) {
  if (!Object.values(MODO_IDENTIDAD).includes(declarado))
    return { ok: false, motivo: MOTIVO_PINS.MODO_NO_DECLARADO, detalle: "RESPALDO_MODO_IDENTIDAD debe ser 'boveda' o 'legacy'" };
  const origen = modoIdentidadDe(snapshot);
  if (origen === "indeterminado")
    return { ok: false, motivo: MOTIVO_SNAPSHOT.MODO_INDETERMINADO, detalle: "el snapshot no declara modo_identidad: aplicar sql/respaldo/snapshot-consistente.sql" };
  if (origen === "boveda_incompleta")
    return { ok: false, motivo: MOTIVO_SNAPSHOT.BOVEDA_INCOMPLETA, detalle: "existe solo una de sec_identidad y sec_identidad_alias: error de esquema, no modo legacy" };
  if (origen !== declarado)
    return { ok: false, motivo: MOTIVO_SNAPSHOT.MODO_DISTINTO, detalle: origen === "legacy"
      ? "el origen no tiene bóveda sec_*: declarar RESPALDO_MODO_IDENTIDAD=legacy solo si esa es la arquitectura del origen"
      : "el origen tiene bóveda: el modo legacy no se usa para saltar identidades" };
  if (origen === "boveda" && snapshot.identidades.length === 0)
    return { ok: false, motivo: MOTIVO_SNAPSHOT.BOVEDA_SIN_ALIAS, detalle: "la bóveda existe y no tiene alias vigentes: error de datos, no modo legacy" };
  return { ok: true, modo: origen };
}

/* Devuelve los dos objetos listos para cifrar, con el mismo correlationId.
 * Si A no se puede construir, B tampoco se emite: un objeto de credenciales sin
 * su padrón es material sensible sin nada que lo justifique. */
export function construirPar({ snapshot, correlationId, lote, allowlist = ALLOWLIST, resolverIdentidad, hashLlave,
                               modoIdentidad = MODO_IDENTIDAD.BOVEDA }) {
  const p = partirSnapshot(snapshot, allowlist);
  if (p.mainNoClasificadas.length)
    return { ok: false, motivo: MOTIVO_SNAPSHOT.MAIN_NO_CLASIFICADA, desconocidos: p.mainNoClasificadas };
  const padron = padronDe(p.padron);
  if (!padron) return { ok: false, motivo: MOTIVO_ID.SIN_PADRON };

  const a = construirObjetoA({ negocio: p.negocio, padron });
  if (!a.ok) return { ok: false, motivo: a.motivo, desconocidos: a.desconocidos, campo: a.campo };

  // Modo bóveda: manda sec_*; el padrón solo se usa si no hay resolvedor, porque
  // `main.usuarios[].identity_id` puede estar vacío y eso no debe inventarse.
  // Modo legacy: no se resuelve identidad; el vínculo es llave_hash.
  const legacy = modoIdentidad === MODO_IDENTIDAD.LEGACY;
  const b = construirObjetoB({ pins: p.pins || {}, hashLlave, modoIdentidad,
                               resolverIdentidad: legacy ? null : resolverIdentidad || resolverContra(padron),
                               nombres: padron.usuarios.map((u) => u.nombre) });
  if (!b.ok) return { ok: false, motivo: b.motivo, desconocidos: b.desconocidos };

  const sello = { correlationId, lote, tomado_at: snapshot?.tomado_at || null, filas: p.filas };
  return {
    ok: true,
    A: { ...a.objeto, ...sello, modo_identidad: modoIdentidad, recursos: Object.keys(p.negocio).length, bloqueadas: p.bloqueadas },
    B: { ...b.objeto, ...sello },
    retirados: a.retirados,
    sinIdentidad: b.sinIdentidad,
    noRespaldados: b.noRespaldados,
    basesHuerfanas: b.basesHuerfanas,
    reemisiones: b.objeto.reemisiones.length,
    bloqueadas: p.bloqueadas,
  };
}

/* eslint-disable */
// src/data/osirisDirty.js
// Detección de "cambios sin guardar" (dirty) de Osiris por SNAPSHOT SEMÁNTICO.
//
// Problema que resuelve: el indicador dependía de un flag de un solo render (primeraCargaRef)
// y de la referencia de osirisData ([osirisData] en el effect). Como tras cargar CURRENT el
// estado hace más de un "settle" (hidratación/normalización/re-set con el MISMO contenido pero
// nueva referencia u orden de claves distinto), el segundo render escapaba al guard y marcaba
// "Cambios sin guardar" de forma permanente sin que el usuario tocara nada.
//
// Solución: un baseline canónico capturado post-load (y refrescado tras cada guardado exitoso).
// dirty = snapshot(actual) !== baseline. La serialización canónica ordena las claves de objeto
// recursivamente y omite `undefined` (igual que JSON), de modo que:
//   - re-set con el mismo contenido (nueva referencia)          -> NO dirty
//   - orden de claves distinto tras hidratar                    -> NO dirty
//   - cambios NO persistidos (tab, filtro, auth, derivados)     -> NO dirty (no viven en el blob)
//   - mutación real persistible del usuario (editar/crear/borrar)-> dirty
//
// Módulo PURO (sin React, sin red): testeable y reutilizable. NO altera reglas económicas.

// Serialización estable: claves de objeto ordenadas recursivamente; arrays preservan su orden
// (el orden de un array SÍ puede ser semántico). Omite claves con valor undefined (como JSON).
export function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

// Snapshot canónico del blob Osiris (tolera null/undefined -> objeto vacío).
export function snapshotOsiris(blob) {
  return stableStringify(blob == null ? {} : blob);
}

// ¿El estado actual difiere semánticamente del baseline (snapshot previo)?
export function isDirty(current, baselineSnapshot) {
  return snapshotOsiris(current) !== baselineSnapshot;
}

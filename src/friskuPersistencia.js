/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// friskuPersistencia.js — fusión por ítem para el guardado compartido
//
// PROBLEMA QUE RESUELVE
// Las filas de `calendario_data` guardan un arreglo completo (embarques, clientes,
// contratos, rendiciones…) y el guardado REEMPLAZA la fila entera. Las filas se
// cargan una vez al montar y no se refrescan, así que la copia en memoria envejece
// mientras la pestaña sigue abierta. Con dos personas trabajando:
//
//   María abre a las 9:00 y carga 87 embarques.
//   Pedro agrega el embarque 88 a las 10:00 y guarda.
//   María edita cualquier cosa a las 11:00: su copia sigue teniendo 87.
//   Al guardar, escribe su arreglo completo y el embarque de Pedro desaparece.
//
// Nadie se entera. Este módulo hace que ese caso se resuelva solo y sin pérdida.
//
// CÓMO
// Fusión de tres vías por ítem, apoyada en que todos los ítems tienen `id` estable.
//   base     = lo que traía el servidor cuando yo cargué
//   mío      = lo que quiero guardar
//   servidor = lo que hay ahora
// Se parte del servidor y se aplican ENCIMA solo los ítems que yo cambié de verdad.
//
// Un ítem entra en conflicto real únicamente si el otro y yo tocamos EL MISMO ítem.
// En ese caso NO se inventa una resolución: gana el servidor y se informa cuál fue,
// para que la persona decida. Nada se descarta en silencio.
// ═══════════════════════════════════════════════════════════════════════════════

const clonar = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clave = (x) => String(x.id);

/** ¿Es un arreglo de objetos con `id` único? Es el requisito para poder fusionar. */
export function esListaFusionable(a) {
  if (!Array.isArray(a)) return false;
  if (!a.every((x) => x && typeof x === "object" && !Array.isArray(x) && x.id !== undefined && x.id !== null)) return false;
  return new Set(a.map(clave)).size === a.length;
}

/**
 * Fusión de tres vías por ítem.
 * Devuelve { ok, valor, conflictos, cambios } o { ok:false, motivo:"no_fusionable" }.
 *
 * `conflictos` lista los ids que los dos tocamos. Si viene con elementos, el llamador
 * NO debe guardar a ciegas: hay que mostrárselos a la persona.
 */
export function fusionarPorId(base, mio, servidor) {
  if (!esListaFusionable(base) || !esListaFusionable(mio) || !esListaFusionable(servidor)) {
    return { ok: false, motivo: "no_fusionable" };
  }
  const B = new Map(base.map((x) => [clave(x), x]));
  const M = new Map(mio.map((x) => [clave(x), x]));
  const S = new Map(servidor.map((x) => [clave(x), x]));

  const conflictos = [];
  const salida = new Map(S);            // se parte SIEMPRE de lo que hay en el servidor
  const cambios = { agregados: 0, modificados: 0, eliminados: 0, ajenosPreservados: 0 };

  // Lo que agregué o modifiqué yo
  for (const [k, item] of M) {
    const b = B.get(k);
    const s = S.get(k);
    if (!b) {                                   // ítem nuevo mío
      if (!s) { salida.set(k, item); cambios.agregados++; }
      else if (!igual(s, item)) conflictos.push(k);   // dos personas crearon el mismo id distinto
      continue;
    }
    if (igual(b, item)) continue;               // no lo toqué: se respeta lo del servidor
    if (!s) { conflictos.push(k); continue; }   // lo borraron mientras yo lo editaba
    if (igual(s, b)) { salida.set(k, item); cambios.modificados++; }  // nadie más lo tocó
    else conflictos.push(k);                    // los dos lo editamos
  }

  // Lo que borré yo
  for (const [k, b] of B) {
    if (M.has(k)) continue;
    const s = S.get(k);
    if (!s) continue;                           // ya no está: nada que hacer
    if (igual(s, b)) { salida.delete(k); cambios.eliminados++; }      // nadie lo tocó
    else conflictos.push(k);                    // lo editaron después: no lo borro
  }

  // Lo que agregó el otro y yo ni conocía
  for (const k of S.keys()) if (!B.has(k) && !M.has(k)) cambios.ajenosPreservados++;

  // Orden estable: primero el orden que tenía yo, después lo que sumó el otro.
  const vistos = new Set();
  const valor = [];
  for (const x of mio) { const k = clave(x); if (salida.has(k) && !vistos.has(k)) { valor.push(salida.get(k)); vistos.add(k); } }
  for (const x of servidor) { const k = clave(x); if (salida.has(k) && !vistos.has(k)) { valor.push(salida.get(k)); vistos.add(k); } }

  return { ok: true, valor, conflictos, cambios };
}

/** Copia defensiva, para guardar la base sin quedar atado a la referencia del llamador. */
export const clonarValor = clonar;
export const valoresIguales = igual;

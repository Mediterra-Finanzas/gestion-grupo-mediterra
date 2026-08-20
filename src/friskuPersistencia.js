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

// Campos que pueden hacer de identificador estable. `id` en los datos comerciales y en
// rendiciones; `codigo` en los maestros (países, puertos, especies, monedas). Se detecta,
// no se asume: una fila con la clave equivocada no se fusiona, se reporta como conflicto.
export const CLAVES_CANDIDATAS = ["id", "codigo", "code"];

const esObjetoSimple = (x) => x && typeof x === "object" && !Array.isArray(x);
const sirveClave = (a, k) =>
  a.every((x) => esObjetoSimple(x) && x[k] !== undefined && x[k] !== null && x[k] !== "") &&
  new Set(a.map((x) => String(x[k]))).size === a.length;

/** Devuelve el campo que identifica los ítems de la lista, o null si no hay ninguno servible. */
export function detectarClave(a) {
  if (!Array.isArray(a)) return null;
  if (a.length === 0) return CLAVES_CANDIDATAS[0];   // lista vacía: cualquiera sirve
  return CLAVES_CANDIDATAS.find((k) => sirveClave(a, k)) || null;
}

/** ¿Es un arreglo de objetos con identificador único? Requisito para poder fusionar. */
export function esListaFusionable(a, k) {
  if (!Array.isArray(a)) return false;
  if (a.length === 0) return true;
  const usar = k || detectarClave(a);
  return !!usar && sirveClave(a, usar);
}

// Elige la clave comun a las tres partes. Si no coinciden, no se fusiona.
function claveComun(base, mio, servidor) {
  for (const k of CLAVES_CANDIDATAS) {
    if ([base, mio, servidor].every((a) => Array.isArray(a) && (a.length === 0 || sirveClave(a, k)))) return k;
  }
  return null;
}

/**
 * Fusión de tres vías por ítem.
 * Devuelve { ok, valor, conflictos, cambios } o { ok:false, motivo:"no_fusionable" }.
 *
 * `conflictos` lista los ids que los dos tocamos. Si viene con elementos, el llamador
 * NO debe guardar a ciegas: hay que mostrárselos a la persona.
 */
export function fusionarPorId(base, mio, servidor) {
  const k = claveComun(base, mio, servidor);
  if (!k) return { ok: false, motivo: "no_fusionable" };
  const clave = (x) => String(x[k]);
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

  return { ok: true, valor, conflictos, cambios, clave: k };
}

/** Copia defensiva, para guardar la base sin quedar atado a la referencia del llamador. */
export const clonarValor = clonar;
export const valoresIguales = igual;

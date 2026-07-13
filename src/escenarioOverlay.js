/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// MOTOR DE OVERLAY DE ESCENARIOS (herencia viva base → escenarios)
// ═══════════════════════════════════════════════════════════════════
// Un escenario ya NO guarda una copia completa del base. Guarda solo su
// "capa de cambios" (overlay) respecto al base vivo. Al abrir el escenario:
//     estado = applyOverlay(baseVivo, overlay)
// Al guardar estando en un escenario:
//     overlay = computeOverlay(baseVivo, estadoActual)
// Así cualquier cambio del base fluye a todos los escenarios, salvo las
// ramas que el escenario haya modificado.
//
// GRANULARIDAD:
//   - Objetos planos: se recorren campo a campo (herencia fina).
//   - Arrays y valores (números, strings, bool, null): atómicos. Si el
//     escenario tocó un array (ej. líneas agregadas, créditos), guarda el
//     array completo y ESE array deja de heredar cambios del base. Los
//     objetos/parametros sí heredan campo a campo.
//   - Se soportan altas (clave nueva) y bajas (clave borrada) de objeto.
//
// Marcadores internos del overlay (no chocan con datos: las claves reales
// del blob son nombres de empresa, meses, especies, etc.):
//   { __ovl_set__: v } → reemplazar por v (hoja/array/tipo distinto)
//   { __ovl_del__: true } → borrar la clave
//   objeto sin marcador → overlay recursivo (merge campo a campo)

const SET = "__ovl_set__";
const DEL = "__ovl_del__";

export function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

export function deepEqual(a, b) {
  if (a === b) return true;
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr || bArr) {
    if (!aArr || !bArr || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false; // primitivos distintos, o tipos distintos
}

// Diferencia dispersa: overlay tal que applyOverlay(base, overlay) === actual.
// Devuelve null si base y actual son iguales (sin cambios).
export function computeOverlay(base, actual) {
  if (deepEqual(base, actual)) return null;
  // Solo se recorre campo a campo cuando AMBOS son objetos planos.
  // Arrays, primitivos o cambio de tipo → reemplazo atómico.
  if (!isPlainObject(base) || !isPlainObject(actual)) {
    return { [SET]: clone(actual) };
  }
  const ov = {};
  for (const k of Object.keys(actual)) {
    if (!Object.prototype.hasOwnProperty.call(base, k)) {
      ov[k] = { [SET]: clone(actual[k]) };            // clave nueva
    } else {
      const sub = computeOverlay(base[k], actual[k]);  // recursivo
      if (sub !== null) ov[k] = sub;
    }
  }
  for (const k of Object.keys(base)) {
    if (!Object.prototype.hasOwnProperty.call(actual, k)) {
      ov[k] = { [DEL]: true };                         // clave borrada
    }
  }
  return ov;
}

// Aplica el overlay sobre el base vivo. NO muta el base.
export function applyOverlay(base, overlay) {
  if (overlay == null) return clone(base);
  if (isPlainObject(overlay) && Object.prototype.hasOwnProperty.call(overlay, SET)) {
    return clone(overlay[SET]);
  }
  // overlay recursivo: partimos de una copia del base (si es objeto).
  const result = isPlainObject(base) ? clone(base) : {};
  if (!isPlainObject(overlay)) return clone(base); // defensivo
  for (const k of Object.keys(overlay)) {
    const entry = overlay[k];
    if (isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, DEL)) {
      delete result[k];
    } else if (isPlainObject(entry) && Object.prototype.hasOwnProperty.call(entry, SET)) {
      result[k] = clone(entry[SET]);
    } else {
      result[k] = applyOverlay(isPlainObject(base) ? base[k] : undefined, entry);
    }
  }
  return result;
}

// ¿El overlay está vacío? (escenario que hoy no diverge del base → herencia pura)
export function overlayVacio(overlay) {
  return overlay == null || (isPlainObject(overlay) && Object.keys(overlay).length === 0);
}

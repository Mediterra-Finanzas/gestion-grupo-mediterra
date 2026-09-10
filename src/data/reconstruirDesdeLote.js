/* Reconstrucción de las filas de calendario_data a partir de un lote YA descifrado.
 *
 * Es la inversa de construirPar. Solo usa lo que viaja en el lote:
 * - `main` = claves de Tareas (A.negocio.main) + padrón (A.padron.usuarios).
 * - `pins` = credenciales, historial y teléfono de B, vinculados al usuario por
 *   `llave_hash` (sha256 del nombre exacto), sin consultar la bóveda original. Vale igual en
 *   modo bóveda y en modo legacy: el UUID no participa del vínculo.
 * - el resto de los recursos de negocio, tal como viajan.
 *
 * Código provisorio. Su material no viaja. Por cada marca de `B.reemisiones` se escribe
 * `<nombre>_temp` = TEMP_REEMISION, un código ya VENCIDO que nadie puede usar. Con él App.jsx
 * mantiene inhabilitado el PIN anterior, como en el origen, y pide reemitir: "¿Olvidaste tu
 * PIN?" o "Resetear PIN" del administrador reemplazan la marca por un código nuevo, y crear el
 * PIN la borra. Sin la marca, restaurar el `_h` rehabilitaría un PIN que un reseteo había
 * inhabilitado.
 *
 * Huérfanas. `B.huerfanas` (llaves sin usuario en el padrón) no se aplican: no hay nombre al
 * que asignarlas. Se cuentan.
 *
 * No escribe en ninguna base: devuelve las filas. Escribirlas en un destino aislado es
 * trabajo del script de restauración aplicada.
 *
 * Una entrada cuyo llave_hash no calza con exactamente un usuario del padrón no se
 * asigna: se reporta como sin dueño o ambigua. */

// `exp: 1` es 1970: vencido. salt y hash en cero no salen de ningún código y nunca se comparan,
// porque App.jsx descarta el código vencido antes de verificarlo.
export const TEMP_REEMISION = Object.freeze({ v: 1, iter: 100000, salt: "0".repeat(32), hash: "0".repeat(64), exp: 1,
  origen: "restauracion", motivo: "codigo_provisorio_no_respaldado" });

export function reconstruirDesdeLote({ A, B, hashLlave }) {
  const filas = {};
  for (const [id, r] of Object.entries(A?.negocio || {})) {
    if (id === "main") continue;
    filas[id] = { value: r.value, updated_at: r.updated_at || null };
  }
  const tareas = A?.negocio?.main?.value || {};
  filas.main = { value: { ...tareas, usuarios: A?.padron?.usuarios || [] }, updated_at: A?.negocio?.main?.updated_at || null };

  const porHash = new Map();
  for (const u of A?.padron?.usuarios || []) {
    const k = hashLlave(u.nombre);
    porHash.set(k, [...(porHash.get(k) || []), u.nombre]);
  }
  const sinDueno = [], ambiguas = [];
  // Se reporta el UUID si existe; en modo legacy, un prefijo de la huella.
  const etiqueta = (e) => e.identity_id || "…" + String(e.llave_hash || "").slice(0, 5);
  const dueno = (e) => {
    const ns = porHash.get(e.llave_hash) || [];
    if (ns.length === 1) return ns[0];
    (ns.length ? ambiguas : sinDueno).push(etiqueta(e));
    return null;
  };

  const pins = {};
  const identidadPorNombre = {};
  for (const e of B?.credenciales || []) {
    const n = dueno(e);
    if (!n) continue;
    const cred = { v: e.version, iter: e.iteraciones, salt: e.sal, hash: e.hash };
    if (e.fecha != null) cred.fecha = e.fecha;
    if (e.pol != null) cred.pol = e.pol;
    Object.assign(cred, e.atributosAdicionales || {});
    pins[n + "_h"] = JSON.stringify(cred);
    if (e.historial) pins[n + "_hist"] = JSON.stringify(e.historial);
    if (e.telefono != null) pins[n + "_tel"] = e.telefono;
    identidadPorNombre[n] = e.identity_id ?? null;
  }
  for (const e of B?.complementos || []) {
    const n = dueno(e);
    if (!n) continue;
    if (e.historial) pins[n + "_hist"] = JSON.stringify(e.historial);
    if (e.telefono != null) pins[n + "_tel"] = e.telefono;
    identidadPorNombre[n] = e.identity_id ?? null;
  }
  const reemitir = [];
  for (const e of B?.reemisiones || []) {
    const n = dueno(e);
    if (!n) continue;
    pins[n + "_temp"] = JSON.stringify(TEMP_REEMISION);
    reemitir.push(n);
  }
  filas.pins = { value: pins, updated_at: null };
  return { filas, sinDueno, ambiguas, identidadPorNombre, reemitir, huerfanasNoAplicadas: (B?.huerfanas || []).length };
}

/* ¿Se puede declarar la recuperación COMPLETA con lo reconstruido? Solo si todo lo que viajó
 * quedó con dueño. Una huérfana preservada es material de una persona que el padrón ya no
 * nombra: no se asigna a nadie, y mientras exista una persona tiene que resolverla. Lo mismo
 * vale para una entrada sin dueño o ambigua. */
export function evaluarRecuperacion(rec) {
  const motivos = [];
  if (rec?.huerfanasNoAplicadas) motivos.push(`${rec.huerfanasNoAplicadas} credenciales huérfanas preservadas sin dueño`);
  if (rec?.sinDueno?.length) motivos.push(`${rec.sinDueno.length} entradas sin dueño`);
  if (rec?.ambiguas?.length) motivos.push(`${rec.ambiguas.length} entradas ambiguas`);
  return { completa: motivos.length === 0, motivos };
}

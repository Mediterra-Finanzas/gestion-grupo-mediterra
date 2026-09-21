/* ─────────────────────────────────────────────────────────────────────────
   Lector del snapshot para la prueba con datos reales.

   Acepta dos formatos:
     a) el que deja scripts/e2e/reducir-respaldo.ps1 o snapshot.mjs
        → { finanzas:{value,updated_at}, finanzas_bancos:{...}, ... }
     b) el JSON crudo del botón "💾 Respaldo" de la app
        → { fecha, usuario, version, tablas:{ <id>:{data,updated_at} } }

   Se queda SOLO con finanzas, finanzas_bancos y finanzas_esc_index: ninguna
   otra fila (pins incluida) se lee siquiera. Se detiene ante una estructura
   inesperada y avisa qué falta, en vez de seguir con datos vacíos.
   ───────────────────────────────────────────────────────────────────────── */
export const FILAS = ['finanzas', 'finanzas_bancos', 'finanzas_esc_index'];
// Claves que identifican a la fila `finanzas` como el módulo de flujo.
const CLAVES_FINANZAS = ['allegria_params', 'finanzas_real', 'params_emp', 'params_af',
                         'params_ap', 'params_osiris', 'sub_lines', 'added_lines'];

export class SnapshotInvalido extends Error {}

function desanidar(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (_) {
    throw new SnapshotInvalido('Una fila trae texto que no es JSON válido: estructura inesperada.');
  }
}
const esObjetoConDatos = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0;

/** Devuelve { filas:{id:{value,updated_at}}, faltan:[], vacias:[], avisos:[] } */
export function leerSnapshot(crudo) {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) {
    throw new SnapshotInvalido('El archivo no es un objeto JSON.');
  }
  const avisos = [];
  let fuente = crudo;
  if (crudo.tablas && typeof crudo.tablas === 'object') {
    // formato del botón Respaldo
    if (crudo.version && !String(crudo.version).startsWith('Mediterra Hub Backup')) {
      avisos.push(`'version' dice "${crudo.version}"; se esperaba "Mediterra Hub Backup v1".`);
    }
    fuente = {};
    FILAS.forEach(id => {
      const f = crudo.tablas[id];
      if (f !== undefined) fuente[id] = { value: f?.data, updated_at: f?.updated_at };
    });
  }

  const filas = {}, faltan = [], vacias = [];
  FILAS.forEach(id => {
    const f = fuente[id];
    if (f === undefined || f === null) { faltan.push(id); return; }
    // tolera { value, updated_at } y también el valor pelado
    const bruto = (f && typeof f === 'object' && 'value' in f) ? f.value : f;
    const val = desanidar(bruto);
    if (!esObjetoConDatos(val) && !Array.isArray(val)) { vacias.push(id); return; }
    filas[id] = { value: val, updated_at: (f && f.updated_at) || null };
  });

  if (!filas.finanzas) {
    throw new SnapshotInvalido(
      "La fila 'finanzas' falta o viene vacía. Sin ella no hay nada que validar: " +
      `faltan=[${faltan.join(', ') || '—'}] vacías=[${vacias.join(', ') || '—'}].`);
  }
  const claves = Object.keys(filas.finanzas.value);
  if (!claves.some(k => CLAVES_FINANZAS.includes(k))) {
    throw new SnapshotInvalido(
      "La fila 'finanzas' no se parece al módulo de flujo (no trae ninguna de: " +
      `${CLAVES_FINANZAS.join(', ')}). Estructura inesperada.`);
  }
  if (!claves.includes('allegria_params')) {
    avisos.push("'finanzas' no trae 'allegria_params': la validación de anticipos quedará sin datos que comparar.");
  }
  faltan.forEach(f => avisos.push(`falta la fila '${f}': la prueba corre sin ella.`));
  vacias.forEach(v => avisos.push(`la fila '${v}' viene vacía: no se carga.`));
  return { filas, faltan, vacias, avisos };
}

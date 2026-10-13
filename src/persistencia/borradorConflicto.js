/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// BORRADOR EN CONFLICTO — lo que la persona tenía en pantalla cuando su guardado
// chocó con el de otra sesión.
//
// Antes, salir del módulo con la fila en conflicto perdía ese trabajo sin aviso:
// el componente se desmontaba (el estado local desaparecía) y al volver la carga
// (`registrarCarga`) limpiaba el conflicto y mostraba lo del servidor.
//
// Ahora el último valor que se intentó guardar queda aquí, por fila, mientras el
// conflicto esté pendiente. Vive en memoria de la PESTAÑA: sobrevive a navegar
// dentro de la app (inicio, otros módulos) y NO a recargar o cerrar la pestaña;
// para eso ya está el aviso de `beforeunload` cuando hay conflicto pendiente. No
// se guarda en localStorage: el blob de Finanzas pesa varios MB y no cabe.
//
// No escribe nada en el servidor ni decide nada: solo conserva. Se descarta
// únicamente cuando el conflicto se resuelve (guardado confirmado) o la persona
// descarta su borrador de forma expresa.
// ═══════════════════════════════════════════════════════════════════════════════

const _borradores = new Map();
const clonar = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const borradorConflicto = {
  guardar(rowId, valor, info = {}) {
    const previo = _borradores.get(rowId);
    _borradores.set(rowId, { valor: clonar(valor), ts: new Date().toISOString(),
      desde: previo ? previo.desde : new Date().toISOString(), ...info });
  },
  obtener(rowId) { const b = _borradores.get(rowId); return b ? { ...b, valor: clonar(b.valor) } : null; },
  tiene(rowId) { return _borradores.has(rowId); },
  descartar(rowId) { _borradores.delete(rowId); },
  _reset() { _borradores.clear(); },   // solo pruebas
};

// ── Comparar dos versiones del blob ───────────────────────────────────────────
// Diferencias hoja por hoja, agrupadas por sección (clave de primer nivel). No
// interpreta ni fusiona: muestra qué cambia para que la persona decida.
const ROTULOS = {
  finanzas_real: "Datos reales del flujo", allegria_params: "Parámetros Allegria Foods",
  allegria_comision_arandanos: "Comisión arándanos", params_emp: "Parámetros por empresa",
  creditos_data: "Créditos", params_as: "Parámetros Allegria Service", params_frisku: "Parámetros Frisku",
  params_if: "Parámetros Integrity", params_af: "Parámetros Allpa Chile", params_ap: "Parámetros Allpa Perú",
  params_osiris: "Parámetros Osiris", params_participacion: "Participación Allpa", sub_lines: "Sublíneas",
  added_lines: "Líneas agregadas", intercompany: "Intercompany",
};
const esObj = (v) => v !== null && typeof v === "object";
const corto = (v) => {
  if (v === undefined) return "(no existe)";
  const s = typeof v === "string" ? `"${v}"` : JSON.stringify(v);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
};

export function compararVersiones(local, servidor, { maxEjemplos = 6 } = {}) {
  const secciones = {};
  const walk = (a, b, ruta) => {
    if (esObj(a) && esObj(b) && Array.isArray(a) === Array.isArray(b)) {
      const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
      claves.forEach((k) => walk(a[k], b[k], [...ruta, k]));
      return;
    }
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const sec = ruta[0] || "(raíz)";
    const s = secciones[sec] || (secciones[sec] = { clave: sec, rotulo: ROTULOS[sec] || sec, cambios: 0, ejemplos: [] });
    s.cambios++;
    if (s.ejemplos.length < maxEjemplos) s.ejemplos.push({ ruta: ruta.slice(1).join(" › "), local: corto(a), servidor: corto(b) });
  };
  walk(local || {}, servidor || {}, []);
  const lista = Object.values(secciones).sort((x, y) => y.cambios - x.cambios);
  return { iguales: lista.length === 0, total: lista.reduce((n, s) => n + s.cambios, 0), secciones: lista };
}

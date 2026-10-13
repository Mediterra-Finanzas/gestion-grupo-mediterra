// ═══════════════════════════════════════════════════════════════════
// LECTURA DE CONSULTA para el inicio (rama de diseño).
//
// El inicio solo MUESTRA cifras: no edita ni guarda. Por eso no puede leer con
// las funciones de carga de los módulos, que además de leer registran la fila en
// su contrato de guardado:
//   · dbLoad / dbLoadBancos (Finanzas) → persist.registrarCarga: reemplaza versión
//     y base, BORRA la marca de cambios y el conflicto pendiente de la fila.
//   · dbLoadGeneric (friskuHelpers; Rendiciones, maestro_tc) → registra versión y
//     base con las que después guarda ese módulo.
// Si el inicio leyera así mientras un módulo tiene un conflicto o un guardado en
// curso, el guardado siguiente de ese módulo podría pisar el trabajo de otra sesión.
//
// Este lector solo hace GET. No importa ni toca ningún contrato de guardado, no
// guarda nada en memoria entre llamadas y no reintenta: una lectura fallida es un
// error para quien llama (el inicio la muestra como «no disponible», nunca en cero).
// ═══════════════════════════════════════════════════════════════════
import { SUPA_URL, SUPA_KEY } from "../friskuHelpers";

export function crearLectorConsulta({ fetchImpl, url = SUPA_URL, key = SUPA_KEY } = {}) {
  const pedir = fetchImpl || ((...a) => fetch(...a));

  // Una fila de calendario_data. { existe, valor, version }; lanza si la red o el
  // servidor fallan o la respuesta no tiene la forma esperada.
  async function fila(id) {
    const res = await pedir(`${url}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`, {
      method: "GET", headers: { apikey: key, Authorization: `Bearer ${key}`, "Cache-Control": "no-cache" },
    });
    if (!res.ok) throw new Error(`consulta ${id}: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`consulta ${id}: respuesta inesperada`);
    if (!rows.length) return { existe: false, valor: null, version: null };
    const v = rows[0].value;
    return { existe: true, valor: typeof v === "string" ? JSON.parse(v) : v, version: rows[0].updated_at || null };
  }

  // Rendiciones: la misma fila que lee el módulo. Ausente = sin rendiciones.
  async function rendiciones() {
    const r = await fila("rendiciones");
    if (r.existe && r.valor != null && !Array.isArray(r.valor)) throw new Error("consulta rendiciones: contenido inesperado");
    return Array.isArray(r.valor) ? r.valor : [];
  }

  // Nóminas. `filas` = [{ empresa, fila }] (filasNominasConsulta de Finanzas: la
  // MISMA selección de filas que dbLoadNominas). Misma forma de resultado que
  // dbLoadNominas: { nominas, filas: {fila:{empresa, estado}}, legado }, para que
  // el inicio cuente igual; una fila que falla queda en estado "error".
  async function nominas(filas, empresasPermitidas = null) {
    const migrado = (await fila("nominas_v2_done")).existe;
    if (!migrado) {
      const leg = await fila("nominas");
      let lista = Array.isArray(leg.valor?.nominas) ? leg.valor.nominas : [];
      if (empresasPermitidas?.length) lista = lista.filter(n => empresasPermitidas.includes(n.empresa));
      return { nominas: lista, filas: {}, legado: true };
    }
    const estado = {};
    const porFila = await Promise.all((filas || []).map(async ({ empresa, fila: id }) => {
      try {
        const r = await fila(id);
        if (!r.existe) { estado[id] = { empresa, estado: "inexistente" }; return []; }
        if (!r.valor || !Array.isArray(r.valor.nominas)) throw new Error("contenido inesperado en la fila");
        estado[id] = { empresa, estado: "ok" };
        return r.valor.nominas;
      } catch (e) {
        estado[id] = { empresa, estado: "error", error: String((e && e.message) || e) };
        return [];
      }
    }));
    return { nominas: porFila.flat(), filas: estado, legado: false };
  }

  return { fila, rendiciones, nominas };
}

export const lectorConsulta = crearLectorConsulta();

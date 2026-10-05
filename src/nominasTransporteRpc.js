/* eslint-disable */
// Escritura de las filas nominas_<empresa> a través de la función de base de
// datos nominas_guardar, que exige la versión leída
// (supabase/propuesta_nominas_version_obligatoria.sql, PARTE 1). Reemplaza el
// PATCH/POST directo; leer no cambia. Misma interfaz que espera guardarFila
// (src/nominasPersistencia.js):
//   patch(fila, version, texto)  → { ok, version } | { ok:false, motivo:"conflicto"|"sello"|"http" }
//   insertar(fila, texto)        → { ok, version } | { ok:false, motivo:"existe"|"sello"|"http" }
// Un fallo de red LANZA (guardarFila lo trata como "red" y verifica releyendo).
// OJO: requiere que la función exista en la base ANTES de desplegar este código
// (si no, ningún guardado de nóminas funciona: la app avisa y conserva la edición).

const LIMITE_KEEPALIVE = 60000;   // el navegador rechaza keepalive > 64 KiB
const bytes = (t) => { try { return new TextEncoder().encode(t).length; } catch (e) { return t.length * 2; } };

export function crearTransporteRpc({ url, key, fetchImpl }) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const H = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  async function fallo(res) {
    let texto = "";
    try { texto = await res.text(); } catch (e) {}
    return { ok: false, motivo: /MEDITERRA_SELLO/.test(texto) ? "sello" : "http", status: res.status, detalle: texto.slice(0, 300) };
  }
  async function guardar(fila, version, texto, o = {}) {
    // p_value = el MISMO texto JSON que hoy va en `value` (string dentro del jsonb).
    const body = JSON.stringify({ p_id: fila, p_value: texto, p_version_leida: version || null });
    const res = await f(`${url}/rest/v1/rpc/nominas_guardar`, {
      method: "POST", keepalive: !!o.keepalive && bytes(body) < LIMITE_KEEPALIVE, headers: H, body });
    if (!res.ok) return await fallo(res);
    const r = await res.json().catch(() => null);
    if (!r || typeof r !== "object") return { ok: false, motivo: "http", status: res.status, detalle: "el servidor no confirmó la escritura" };
    if (r.resultado === "ok" && r.version) return { ok: true, version: r.version };
    if (r.resultado === "existe") return { ok: false, motivo: "existe" };
    // "no_existe": la fila desapareció después de leerla → se relee (y se crea si corresponde).
    if (r.resultado === "conflicto" || r.resultado === "no_existe") return { ok: false, motivo: "conflicto" };
    return { ok: false, motivo: "http", status: res.status, detalle: "respuesta inesperada: " + JSON.stringify(r).slice(0, 200) };
  }
  return {
    async leer(fila) {
      const res = await f(`${url}/rest/v1/calendario_data?id=eq.${encodeURIComponent(fila)}&select=value,updated_at`, {
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Cache-Control": "no-cache" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error("respuesta inesperada");
      if (!rows.length) return { existe: false, valor: null, version: null };
      const v = rows[0].value;
      const valor = typeof v === "string" ? JSON.parse(v) : v;
      if (!valor || !Array.isArray(valor.nominas)) throw new Error("contenido inesperado en la fila");
      return { existe: true, valor, version: rows[0].updated_at || null };
    },
    patch: (fila, version, texto, o) => guardar(fila, version, texto, o),
    insertar: (fila, texto, o) => guardar(fila, null, texto, o),
  };
}

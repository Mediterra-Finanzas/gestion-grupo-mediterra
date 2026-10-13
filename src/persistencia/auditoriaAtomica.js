/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// AGREGAR EVENTOS AL REGISTRO DE AUDITORÍA SIN PISAR A NADIE (oct-2026)
//
// La fila `audit_log` es un único documento que escriben todas las sesiones. Leer y
// después escribir deja una carrera: dos sesiones leen la misma versión y la segunda
// escritura borra los eventos de la primera. Aquí la escritura es CONDICIONADA a la
// versión leída (PATCH … &updated_at=eq.<versión>), igual que el contrato de
// persistencia. La base la aplica de forma atómica: de dos escrituras sobre la misma
// versión solo una actualiza la fila; la otra recibe 0 filas, vuelve a leer y
// reintenta con espera aleatoria.
//
// Reintentar no duplica: los eventos se agregan POR ID sobre lo que hay en el
// servidor. Si una escritura llegó pero se perdió la respuesta, el reintento ve sus
// eventos ya guardados y no los vuelve a agregar.
//
// Si la fila no existe se crea con un INSERT simple (sin merge-duplicates): si otra
// sesión la creó al mismo tiempo, el INSERT falla (409) y se reintenta como PATCH.
//
// Lanza si no logra confirmar: quien llama conserva los eventos para el próximo envío.
// ═══════════════════════════════════════════════════════════════════════════════

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export function unirPorId(servidor, nuevos) {
  const ids = new Set(servidor.map((e) => e && e.id));
  const agregados = nuevos.filter((e) => e && !ids.has(e.id));
  return { todos: [...servidor, ...agregados], agregados: agregados.length };
}

export async function agregarEventosAtomico({
  fetchImpl, url, key, id = "audit_log", nuevos, filtrar = (x) => x,
  maxIntentos = 10, esperaBaseMs = 40, ahora = () => new Date().toISOString(),
}) {
  const cab = { apikey: key, Authorization: `Bearer ${key}` };
  let ultimoMotivo = "";
  for (let intento = 1; intento <= maxIntentos; intento++) {
    const r = await fetchImpl(`${url}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&select=value,updated_at`,
      { headers: { ...cab, "Cache-Control": "no-cache" }, cache: "no-store" });
    if (!r.ok) throw new Error(`auditoría: lectura HTTP ${r.status}`);
    const filas = await r.json();
    if (!Array.isArray(filas)) throw new Error("auditoría: respuesta inesperada");
    const fila = filas[0] || null;
    const crudo = fila ? fila.value : null;
    const esTexto = typeof crudo === "string";
    const valor = esTexto ? JSON.parse(crudo) : crudo;
    const servidor = Array.isArray(valor && valor.eventos) ? valor.eventos : (Array.isArray(valor) ? valor : []);
    const { todos, agregados } = unirPorId(servidor, nuevos);
    if (agregados === 0) return { ok: true, intentos: intento, agregados: 0, total: servidor.length };   // ya estaban (reintento)
    const nuevoValor = { ...(valor && !Array.isArray(valor) ? valor : {}), eventos: filtrar(todos) };
    const campo = esTexto ? JSON.stringify(nuevoValor) : nuevoValor;   // misma codificación de la fila
    const ts = ahora();
    let w;
    if (fila) {
      w = await fetchImpl(`${url}/rest/v1/calendario_data?id=eq.${encodeURIComponent(id)}&updated_at=eq.${encodeURIComponent(fila.updated_at)}`,
        { method: "PATCH", headers: { ...cab, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ value: campo, updated_at: ts }) });
    } else {
      w = await fetchImpl(`${url}/rest/v1/calendario_data`,
        { method: "POST", headers: { ...cab, "Content-Type": "application/json", Prefer: "return=representation" },
          body: JSON.stringify({ id, value: campo, updated_at: ts }) });
    }
    if (w.ok) {
      const rep = await w.json().catch(() => []);
      if (Array.isArray(rep) && rep.length > 0) return { ok: true, intentos: intento, agregados, total: todos.length };
      ultimoMotivo = "conflicto de versión";                 // 0 filas: otra sesión escribió antes
    } else if (w.status === 409) {
      ultimoMotivo = "la fila se creó al mismo tiempo";
    } else {
      throw new Error(`auditoría: escritura HTTP ${w.status}`);
    }
    await esperar(esperaBaseMs * intento * (0.5 + Math.random()));   // retroceso con azar
  }
  throw new Error(`auditoría: no se confirmó tras ${maxIntentos} intentos (${ultimoMotivo})`);
}

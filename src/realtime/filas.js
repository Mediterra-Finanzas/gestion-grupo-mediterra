/* eslint-disable */
// ══════════════════════════════════════════════════════════════════════
// Tiempo real limitado a filas concretas de `calendario_data` (oct-2026).
//
// Antes, App.jsx (incluso sin sesión) y FinanzasModule se unían a
// `realtime:public:calendario_data` SIN filtro: si el Realtime del proyecto
// publica la tabla, cada navegador recibía COMPLETA cada fila que cambiara
// (nóminas, remuneraciones, liquidaciones…), aunque la pantalla no la usara.
//
// Ahora cada suscripción pide UNA fila:
//   · tópico con filtro  `realtime:public:calendario_data:id=eq.<id>`  (formato
//     de los mensajes que la app ya procesaba: event INSERT/UPDATE + payload.record);
//   · y la misma restricción en `config.postgres_changes` (formato Realtime v2:
//     event "postgres_changes" + payload.data.record).
// Además, `extraerRegistro` descarta cualquier registro de otra fila
// (defensa en profundidad: si el servidor no filtra, no se APLICA, pero el
// mensaje ya llegó; eso solo lo evita la autorización en el servidor).
//
// Esto NO es protección: con la llave pública cualquiera puede suscribirse
// a la tabla entera. Ver docs/estado-rama-2026-10.md §4.14.
// ══════════════════════════════════════════════════════════════════════

export const TABLA = "calendario_data";
export const topicFila = (id) => `realtime:public:${TABLA}:id=eq.${id}`;

export function mensajeJoin(id, ref) {
  return {
    topic: topicFila(id), event: "phx_join", ref: String(ref),
    payload: { config: {
      broadcast: { ack: false, self: false }, presence: { key: "" },
      postgres_changes: [{ event: "*", schema: "public", table: TABLA, filter: `id=eq.${id}` }],
    } },
  };
}

// Devuelve {id, value, updated_at} si el mensaje trae un cambio de una fila permitida.
export function extraerRegistro(msg, idsPermitidos) {
  if (!msg || typeof msg !== "object") return null;
  let record = null;
  if (msg.event === "INSERT" || msg.event === "UPDATE") record = msg.payload?.record;
  else if (msg.event === "postgres_changes") {
    const d = msg.payload?.data;
    if (d && (d.type === "INSERT" || d.type === "UPDATE")) record = d.record;
  }
  if (!record || !record.id || record.value === undefined || record.value === null) return null;
  if (!idsPermitidos.includes(record.id)) return null;
  if (msg.topic && msg.topic !== topicFila(record.id)) return null;   // vino por otro canal
  let value = record.value;
  if (typeof value === "string") { try { value = JSON.parse(value); } catch (e) { return null; } }
  return { id: record.id, value, updated_at: record.updated_at || null };
}

// Abre un WebSocket y se une a un tópico por fila. Devuelve la función que cierra.
export function conectarFilas({ wsUrl, ids, onRegistro, WebSocketImpl }) {
  const WS = WebSocketImpl || (typeof WebSocket !== "undefined" ? WebSocket : null);
  if (!WS || !ids || !ids.length) return () => {};
  const ws = new WS(wsUrl);
  let n = 0;
  const ref = () => `${Date.now()}-${n++}`;
  ws.onopen = () => { ids.forEach(id => ws.send(JSON.stringify(mensajeJoin(id, ref())))); };
  ws.onmessage = (e) => {
    try {
      const reg = extraerRegistro(JSON.parse(e.data), ids);
      if (reg) onRegistro(reg);
    } catch (err) {}
  };
  const hb = setInterval(() => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: ref() }));
  }, 30000);
  return () => { clearInterval(hb); try { if (ws.readyState === 1 || ws.readyState === 0) ws.close(); } catch (e) {} };
}

/* Aplicación de una restauración sobre un destino EXISTENTE, sin pisar lo que no corresponde.
 *
 * Solo se escriben los recursos reconstruidos (`rec.filas`: negocio, `main` y `pins`). Nunca:
 *   - auditoría ni copias (`rec.excluidas`: audit_log, backup_*, …): quedan exactamente iguales;
 *   - filas del destino que no vienen en el lote;
 *   - filas que el equipo cambió DESPUÉS del snapshot (updated_at > tomado_at): son conflicto y
 *     las resuelve una persona.
 *
 * El plan no basta: el equipo puede escribir entre el plan y la aplicación. Por eso cada escritura
 * es condicionada (`sentenciaDe`): UPDATE solo si la fila sigue en una versión anterior al
 * snapshot, INSERT solo si la fila sigue sin existir. Cero filas afectadas es conflicto, no éxito. */

export const MOTIVO_APLICACION = {
  POSTERIOR: "cambio_posterior_del_equipo",
  CONCURRENTE: "cambio_concurrente_del_equipo",
};

export function planificarAplicacion({ destino, rec, tomadoAt }) {
  const t = new Date(tomadoAt);
  if (!tomadoAt || Number.isNaN(t.getTime())) throw new Error("tomadoAt inválido");
  const actual = new Map((destino || []).map((f) => [f.id, f]));
  const filas = rec?.filas || {};
  const excluidas = new Set(rec?.excluidas || []);
  const plan = { escribir: [], conflictos: [], intactas: [], excluidasIntactas: [] };
  for (const [id, f] of Object.entries(filas)) {
    if (excluidas.has(id)) { plan.excluidasIntactas.push(id); continue; }
    const d = actual.get(id);
    if (d && d.updated_at && new Date(d.updated_at) > t) { plan.conflictos.push({ id, motivo: MOTIVO_APLICACION.POSTERIOR }); continue; }
    plan.escribir.push({ id, value: f.value, crear: !d });
  }
  for (const id of actual.keys()) {
    if (Object.prototype.hasOwnProperty.call(filas, id)) continue;
    (excluidas.has(id) ? plan.excluidasIntactas : plan.intactas).push(id);
  }
  return plan;
}

/* Sentencia condicionada para un paso del plan. El llamador trata `rowCount === 0` como
 * MOTIVO_APLICACION.CONCURRENTE y no reintenta a ciegas. */
export function sentenciaDe(paso, tomadoAt) {
  const valor = JSON.stringify(paso.value);
  return paso.crear
    ? { text: "insert into public.calendario_data (id, value, updated_at) values ($1, $2::jsonb, now()) on conflict (id) do nothing",
        values: [paso.id, valor] }
    : { text: "update public.calendario_data set value = $2::jsonb, updated_at = now() where id = $1 and (updated_at is null or updated_at <= $3::timestamptz)",
        values: [paso.id, valor, tomadoAt] };
}

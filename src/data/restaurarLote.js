/* Restauracion desde un LOTE. Fail-closed: no restaura nada hasta haber verificado
 * que el lote esta completo. Un lote a medias es peor que ningun lote, porque
 * produce un padron que parece bueno.
 * Ninguna comprobacion se salta por conveniencia: si falta una, se aborta. */

export const MOTIVO = {
  LOTE_DESCONOCIDO: "lote_desconocido",
  NO_PUBLICADO: "lote_no_publicado",
  FALLIDO: "lote_fallido",
  REGISTRO_INCOMPLETO: "registro_incompleto",
  OBJETO_AUSENTE: "objeto_ausente",
  SHA_NO_COINCIDE: "sha_no_coincide",
  CORRELATION_DISPAR: "correlation_dispar",
  DESCIFRADO_FALLIDO: "descifrado_fallido",
};

const rechazo = (motivo, detalle) => ({ ok: false, motivo, detalle: detalle || "" });

/* fila     : la fila de respaldo_lote, o null si no existe
 * bajar    : (ruta) => Promise<Buffer|null>   null = objeto ausente en Storage
 * sha256   : (Buffer) => string hex
 * descifrar: (sobre, clave) => Promise<{ok, objeto, motivo}>
 * claves   : { A, B }                          claves distintas, a proposito */
export async function restaurarLote({ fila, bajar, sha256, descifrar, claves }) {
  if (!fila) return rechazo(MOTIVO.LOTE_DESCONOCIDO);
  if (fila.estado === "FAILED") return rechazo(MOTIVO.FALLIDO, "estado=FAILED");
  if (fila.estado !== "READY") return rechazo(MOTIVO.NO_PUBLICADO, "estado=" + fila.estado);

  // Un lote READY con campos vacios es un registro roto, no un lote bueno.
  for (const c of ["objeto_a", "objeto_b", "sha_a", "sha_b"])
    if (!fila[c]) return rechazo(MOTIVO.REGISTRO_INCOMPLETO, "falta " + c);

  const partes = [
    { etiqueta: "A", ruta: fila.objeto_a, sha: fila.sha_a, clave: claves.A },
    { etiqueta: "B", ruta: fila.objeto_b, sha: fila.sha_b, clave: claves.B },
  ];

  const abiertos = {};
  for (const p of partes) {
    const bytes = await bajar(p.ruta);
    if (!bytes) return rechazo(MOTIVO.OBJETO_AUSENTE, p.etiqueta);
    // El SHA se compara contra lo que la base registro al publicar, no contra
    // si mismo: eso detecta reemplazo del objeto despues de publicado.
    const real = sha256(bytes);
    if (real !== p.sha) return rechazo(MOTIVO.SHA_NO_COINCIDE, p.etiqueta);
    const d = await descifrar(JSON.parse(bytes.toString("utf8")), p.clave);
    if (!d.ok) return rechazo(MOTIVO.DESCIFRADO_FALLIDO, p.etiqueta + ":" + d.motivo);
    abiertos[p.etiqueta] = d.objeto;
  }

  // A y B se generan en la misma ejecucion. Si los correlation difieren, alguien
  // mezclo dos respaldos y el padron no cuadra con las credenciales.
  if (!abiertos.A.correlationId || abiertos.A.correlationId !== abiertos.B.correlationId)
    return rechazo(MOTIVO.CORRELATION_DISPAR,
      String(abiertos.A.correlationId).slice(0, 8) + " vs " + String(abiertos.B.correlationId).slice(0, 8));

  return { ok: true, lote: fila.lote_id, A: abiertos.A, B: abiertos.B, correlationId: abiertos.A.correlationId };
}

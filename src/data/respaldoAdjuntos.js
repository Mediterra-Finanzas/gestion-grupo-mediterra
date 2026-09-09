/* Respaldo de ADJUNTOS. Copiar las referencias JSON no respalda nada: el PDF
 * vive en Storage, no en la fila.
 *
 * Direccionamiento por CONTENIDO. Cada archivo se guarda bajo su propio
 * SHA-256. De ahi salen tres propiedades, no una:
 *   - deduplicacion: el archivo que no cambio no se vuelve a subir;
 *   - versiones: sobrescribir un archivo produce un hash nuevo, y el anterior
 *     sigue existiendo, asi que la sobrescritura es recuperable;
 *   - borrado recuperable: el manifiesto de cada lote dice que existia ese dia,
 *     y los bytes siguen en el almacen aunque el original ya no este.
 * El nombre y la ruta viven en el manifiesto, no en el almacen: dos archivos
 * con el mismo contenido y distinto nombre comparten bytes sin perder identidad. */

export const MOTIVO_ADJ = {
  SHA_NO_COINCIDE: "sha_no_coincide",
  BYTES_AUSENTES: "bytes_ausentes",
  MANIFIESTO_VACIO: "manifiesto_vacio",
  VINCULO_ROTO: "vinculo_roto",
};

export function rutaContenido(sha) { return `sha256/${sha.slice(0, 2)}/${sha.slice(2, 4)}/${sha}`; }

/* listar : (bucket) => [{ruta, size, mime, updated_at}]
 * leer   : (bucket, ruta) => Buffer
 * sha256 : (Buffer) => hex
 * vinculo: (bucket, ruta) => {fila_id, campo} | null   quien referencia el archivo */
export async function construirManifiesto({ buckets, listar, leer, sha256, vinculo, correlationId, lote }) {
  const entradas = [];
  for (const b of buckets) {
    for (const o of await listar(b)) {
      const bytes = await leer(b, o.ruta);
      const sha = sha256(bytes);
      entradas.push({
        bucket: b, ruta: o.ruta, nombre: o.ruta.split("/").pop(),
        bytes: bytes.length, mime: o.mime || null, modificado: o.updated_at || null,
        sha256: sha, almacen: rutaContenido(sha),
        vinculo: (vinculo && vinculo(b, o.ruta)) || null,
      });
    }
  }
  return {
    version: 1, lote, correlationId, generado: new Date().toISOString(),
    total: entradas.length, bytes: entradas.reduce((s, e) => s + e.bytes, 0),
    distintos: new Set(entradas.map((e) => e.sha256)).size,
    huerfanos: entradas.filter((e) => !e.vinculo).length,
    adjuntos: entradas,
  };
}

/* Sube solo el contenido que el almacen todavia no tiene. */
export async function copiarContenido({ manifiesto, leer, existe, subir }) {
  const vistos = new Set();
  let subidos = 0, reutilizados = 0;
  for (const e of manifiesto.adjuntos) {
    if (vistos.has(e.sha256)) { reutilizados++; continue; }
    vistos.add(e.sha256);
    if (await existe(e.almacen)) { reutilizados++; continue; }
    await subir(e.almacen, await leer(e.bucket, e.ruta));
    subidos++;
  }
  return { subidos, reutilizados, distintos: vistos.size };
}

/* Restauracion AISLADA: nada se escribe sobre el bucket original. Cada archivo
 * se verifica contra su hash antes de considerarse recuperado. */
export async function restaurarAdjuntos({ manifiesto, bajarAlmacen, sha256, escribirAislado, filasVivas }) {
  if (!manifiesto || !manifiesto.adjuntos?.length) return { ok: false, motivo: MOTIVO_ADJ.MANIFIESTO_VACIO };
  const fallas = [], hechos = [];
  for (const e of manifiesto.adjuntos) {
    const bytes = await bajarAlmacen(e.almacen);
    if (!bytes) { fallas.push({ ruta: e.ruta, motivo: MOTIVO_ADJ.BYTES_AUSENTES }); continue; }
    if (sha256(bytes) !== e.sha256) { fallas.push({ ruta: e.ruta, motivo: MOTIVO_ADJ.SHA_NO_COINCIDE }); continue; }
    if (bytes.length !== e.bytes) { fallas.push({ ruta: e.ruta, motivo: MOTIVO_ADJ.SHA_NO_COINCIDE }); continue; }
    await escribirAislado(e.bucket + "/" + e.ruta, bytes);
    hechos.push(e.ruta);
  }
  // El vinculo se comprueba, no se supone: un archivo restaurado cuya fila ya no
  // existe se recupera igual, pero se informa.
  const rotos = filasVivas
    ? manifiesto.adjuntos.filter((e) => e.vinculo && !filasVivas.has(e.vinculo.fila_id)).map((e) => e.ruta)
    : [];
  return { ok: fallas.length === 0, restaurados: hechos.length, fallas, vinculosRotos: rotos };
}

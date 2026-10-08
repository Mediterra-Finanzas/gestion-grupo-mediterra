/* Solo para pruebas: permite importar en Node los módulos de src/ (escritos para
   el empaquetador de CRA) cuyos imports relativos no llevan extensión
   (p. ej. "./friskuPersistencia"). Se registra con module.register(). */
export async function resolve(especificador, contexto, siguiente) {
  try {
    return await siguiente(especificador, contexto);
  } catch (e) {
    if (e && e.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(especificador) && !/\.[cm]?js$/.test(especificador)) {
      return siguiente(especificador + '.js', contexto);
    }
    throw e;
  }
}

/* eslint-disable */
// Geometría del desplegable de estado de cobro.
//
// El menú se dibuja respecto de la VENTANA (position:fixed) porque dentro de una
// celda queda recortado: `.osiris-root td, .osiris-root th` lleva overflow:hidden.
// Esta función es pura: recibe el rectángulo del botón y el tamaño de la ventana,
// y devuelve dónde poner el menú. Así se puede probar el borde de pantalla sin
// navegador.
export const ALTO_FILA_ESTADO = 34;
export const ANCHO_MENU_ESTADO = 210;
export const MARGEN_VENTANA = 8;

// ¿El botón sigue a la vista? Si se fue de la pantalla al desplazar, el menú se
// cierra en vez de quedar flotando lejos de su fila.
export function anclaVisible(rect, ventana) {
  const r = rect || {};
  const vAlto = (ventana && ventana.alto) || 0;
  return r.bottom > 0 && r.top < vAlto;
}

export function ubicacionMenuEstado(rect, ventana, nOpciones) {
  const r = rect || { top: 0, bottom: 0, left: 0 };
  const vAlto = (ventana && ventana.alto) || 0;
  const vAncho = (ventana && ventana.ancho) || 0;
  const alto = (nOpciones || 0) * ALTO_FILA_ESTADO + 8;

  const espacioAbajo = vAlto - r.bottom - MARGEN_VENTANA;
  const espacioArriba = r.top - MARGEN_VENTANA;
  // Solo se abre hacia arriba si abajo no cabe Y arriba hay más sitio.
  const haciaArriba = espacioAbajo < alto && espacioArriba > espacioAbajo;

  // Nunca menos de 120 px de alto útil: con poco espacio el menú se vuelve
  // desplazable, pero sigue siendo utilizable.
  const maxAltoBase = Math.max(120, haciaArriba ? espacioArriba : espacioAbajo);
  const altoReal = Math.min(alto, maxAltoBase);

  let top = haciaArriba ? r.top - altoReal - 4 : r.bottom + 4;
  // El menú nunca se sale de la ventana, ni siquiera si el botón quedó fuera
  // de vista al desplazar: se recorta contra los dos bordes.
  top = Math.min(top, Math.max(MARGEN_VENTANA, vAlto - altoReal - MARGEN_VENTANA));
  top = Math.max(MARGEN_VENTANA, top);

  const maxLeft = Math.max(MARGEN_VENTANA, vAncho - ANCHO_MENU_ESTADO - MARGEN_VENTANA);
  const left = Math.min(Math.max(MARGEN_VENTANA, r.left), maxLeft);

  return { top, left, maxAlto: maxAltoBase, haciaArriba, altoReal };
}

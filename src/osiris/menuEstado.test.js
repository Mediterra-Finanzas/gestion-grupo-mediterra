/* eslint-disable */
// Geometría del desplegable de estado. Casos sintéticos: ventanas y posiciones
// inventadas, ningún dato real.
import { ubicacionMenuEstado, ANCHO_MENU_ESTADO, MARGEN_VENTANA } from "./menuEstado";

const VENTANA = { alto: 900, ancho: 1400 };
const OPCIONES = 6;              // los seis estados de cobro
const ALTO_MENU = OPCIONES * 34 + 8; // 212

describe("ubicación del menú de estado", () => {
  test("con espacio abajo, se abre justo debajo del botón", () => {
    const u = ubicacionMenuEstado({ top: 200, bottom: 222, left: 500 }, VENTANA, OPCIONES);
    expect(u.haciaArriba).toBe(false);
    expect(u.top).toBe(226);
    expect(u.left).toBe(500);
    expect(u.top + Math.min(ALTO_MENU, u.maxAlto)).toBeLessThanOrEqual(VENTANA.alto);
  });

  test("cerca del borde inferior, se abre hacia arriba y cabe entero", () => {
    const u = ubicacionMenuEstado({ top: 850, bottom: 872, left: 500 }, VENTANA, OPCIONES);
    expect(u.haciaArriba).toBe(true);
    expect(u.top).toBeGreaterThanOrEqual(MARGEN_VENTANA);
    expect(u.top + ALTO_MENU).toBeLessThanOrEqual(872);   // termina antes del botón
  });

  test("pegado al borde derecho, el menú no se sale de la ventana", () => {
    const u = ubicacionMenuEstado({ top: 300, bottom: 322, left: 1380 }, VENTANA, OPCIONES);
    expect(u.left + ANCHO_MENU_ESTADO).toBeLessThanOrEqual(VENTANA.ancho);
  });

  test("pegado al borde izquierdo, respeta el margen", () => {
    const u = ubicacionMenuEstado({ top: 300, bottom: 322, left: -40 }, VENTANA, OPCIONES);
    expect(u.left).toBe(MARGEN_VENTANA);
  });

  test("en una ventana muy baja el menú se vuelve desplazable, nunca invisible", () => {
    const u = ubicacionMenuEstado({ top: 100, bottom: 122, left: 10 }, { alto: 200, ancho: 800 }, OPCIONES);
    expect(u.maxAlto).toBeGreaterThanOrEqual(120);
  });

  test("al desplazar la tabla, la posición sigue al botón", () => {
    const antes = ubicacionMenuEstado({ top: 400, bottom: 422, left: 300 }, VENTANA, OPCIONES);
    const despues = ubicacionMenuEstado({ top: 340, bottom: 362, left: 300 }, VENTANA, OPCIONES);
    expect(despues.top).toBe(antes.top - 60);
  });

  test("no depende de cuántas opciones tenga el menú: con más, sigue cabiendo", () => {
    const u = ubicacionMenuEstado({ top: 700, bottom: 722, left: 100 }, VENTANA, 12);
    const alto = 12 * 34 + 8;
    if (u.haciaArriba) expect(u.top + Math.min(alto, u.maxAlto)).toBeLessThanOrEqual(722);
    else expect(u.top + Math.min(alto, u.maxAlto)).toBeLessThanOrEqual(VENTANA.alto);
  });
});

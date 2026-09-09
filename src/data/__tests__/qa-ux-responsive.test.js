/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// QA UX · RESPONSIVE
// ═══════════════════════════════════════════════════════════════════
//
// El punto de partida documentado en TECH-01-WIREFRAMES §0: `OsirisModule
// .jsx` no tiene ni un `@media` ni un `matchMedia`, y sus rejillas son de
// ancho fijo. Estas pruebas verifican que el carril nuevo sí decide layout
// según el ancho real, y que el cambio es de estructura, no de padding.

import React from "react";
import "@testing-library/jest-dom";
import { render, screen, act } from "@testing-library/react";

import { clasificarAncho, estadoResponsive } from "../../ux/useResponsive";
import { BREAKPOINTS, densidad } from "../../ux/tokens";
import PrototipoUX from "../../ux/PrototipoUX";
import HomeEjecutivo from "../../ux/HomeEjecutivo";
import { DATOS_EJEMPLO, HOY_EJEMPLO } from "../../ux/ejemploDatos";

function anchoVentana(px) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: px });
}

// jsdom no implementa requestAnimationFrame de forma útil para esto; el hook
// lo usa si existe, así que se fuerza el camino síncrono en la prueba.
const rafOriginal = window.requestAnimationFrame;

beforeEach(() => {
  window.requestAnimationFrame = (cb) => {
    cb();
    return 0;
  };
});

afterEach(() => {
  window.requestAnimationFrame = rafOriginal;
});

describe("clasificación de ancho · los tres cortes", () => {
  test("los límites son exactos, no aproximados", () => {
    expect(clasificarAncho(BREAKPOINTS.movil)).toBe("movil");
    expect(clasificarAncho(BREAKPOINTS.movil + 1)).toBe("tablet");
    expect(clasificarAncho(BREAKPOINTS.tablet)).toBe("tablet");
    expect(clasificarAncho(BREAKPOINTS.tablet + 1)).toBe("escritorio");
  });

  test("un teléfono chico sigue siendo móvil", () => {
    expect(clasificarAncho(320)).toBe("movil");
  });

  test("una pantalla muy ancha sigue siendo escritorio", () => {
    expect(clasificarAncho(3840)).toBe("escritorio");
  });
});

describe("estado responsive · cada corte cambia la estructura, no el relleno", () => {
  test("escritorio: riel con etiquetas, densidad compacta, tabla como tabla", () => {
    const e = estadoResponsive(1440);
    expect(e.modoNavegacion).toBe("etiquetas");
    expect(e.densidad).toBe(densidad.compacta);
    expect(e.tablaComoTarjetas).toBe(false);
  });

  test("tablet: riel de íconos y densidad cómoda, porque se usa con el dedo", () => {
    const e = estadoResponsive(900);
    expect(e.modoNavegacion).toBe("iconos");
    expect(e.densidad).toBe(densidad.comoda);
    expect(e.tablaComoTarjetas).toBe(false);
  });

  test("teléfono: barra de navegación y tabla convertida en tarjetas", () => {
    const e = estadoResponsive(390);
    expect(e.modoNavegacion).toBe("barra");
    expect(e.tablaComoTarjetas).toBe(true);
    expect(e.esMovil).toBe(true);
  });

  test("la densidad cómoda tiene filas más altas que la compacta (tap target)", () => {
    expect(densidad.comoda.fila).toBeGreaterThan(densidad.compacta.fila);
    expect(densidad.comoda.fila).toBeGreaterThanOrEqual(40);
  });

  test("la densidad compacta mantiene la app apretada, que es la funcionalidad", () => {
    expect(densidad.compacta.fila).toBeLessThanOrEqual(30);
  });
});

describe("prototipo · el riel cambia de forma con el ancho", () => {
  test("en escritorio los destinos muestran su etiqueta como texto visible", () => {
    anchoVentana(1440);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    expect(screen.getByText("Finanzas")).toBeInTheDocument();
    expect(screen.getByText("Mediterra")).toBeInTheDocument();
  });

  test("en tablet no hay texto de etiqueta, pero el nombre accesible se mantiene", () => {
    anchoVentana(900);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    expect(screen.queryByText("Mediterra")).not.toBeInTheDocument();
    // Sigue siendo alcanzable por su nombre: nadie pierde el destino.
    expect(screen.getByRole("button", { name: "Finanzas" })).toBeInTheDocument();
  });

  test("en teléfono la tabla desaparece y quedan tarjetas, sin scroll lateral", () => {
    anchoVentana(390);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    // Ninguna tabla densa: ni la de contratos ni la de cobranza.
    expect(screen.queryAllByRole("table")).toHaveLength(0);
    expect(screen.getByText(/Contratos · 3 filas/)).toBeInTheDocument();
  });

  test("al ensanchar la ventana la tabla vuelve, sin recargar", () => {
    anchoVentana(390);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    expect(screen.queryAllByRole("table")).toHaveLength(0);
    act(() => {
      anchoVentana(1440);
      window.dispatchEvent(new Event("resize"));
    });
    // Desde que existe la bandeja de cobranza hay dos tablas densas en el home.
    // Se identifica por su `caption`, no por ser la unica: contarlas de nuevo
    // haria que agregar una tercera rompiera esta prueba sin motivo.
    expect(screen.getByRole("table", { name: /Contratos/ })).toBeInTheDocument();
    expect(screen.queryAllByRole("table").length).toBeGreaterThanOrEqual(2);
  });

  test("los ocho destinos del hub están siempre disponibles, en cualquier ancho", () => {
    for (const ancho of [390, 900, 1440]) {
      anchoVentana(ancho);
      const { unmount } = render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
      const nav = screen.getByRole("navigation", { name: "Navegación principal" });
      expect(nav.querySelectorAll("button")).toHaveLength(8);
      unmount();
    }
  });
});

describe("prototipo · el salto al contenido existe y se materializa al enfocarlo", () => {
  test("está oculto pero presente, y apunta al main", () => {
    anchoVentana(1440);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    const salto = screen.getByRole("link", { name: "Saltar al contenido" });
    expect(salto).toHaveAttribute("href", "#contenido");
    // Oculto visualmente: recortado a 1px, no `display:none`.
    expect(salto.style.width).toBe("1px");
  });

  test("al recibir foco deja de estar recortado", () => {
    anchoVentana(1440);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    const salto = screen.getByRole("link", { name: "Saltar al contenido" });
    act(() => {
      salto.focus();
    });
    expect(salto.style.width).not.toBe("1px");
    expect(salto.style.position).toBe("absolute");
  });

  test("el destino del salto es el landmark main y es programáticamente enfocable", () => {
    anchoVentana(1440);
    render(<PrototipoUX datos={DATOS_EJEMPLO} hoy={HOY_EJEMPLO} />);
    const main = screen.getByRole("main");
    expect(main.id).toBe("contenido");
    expect(main).toHaveAttribute("tabindex", "-1");
  });
});

describe("home · sirve con cualquier ancho sin romperse", () => {
  test.each([320, 390, 768, 900, 1280, 1920])("ancho %ipx renderiza sin lanzar", (px) => {
    anchoVentana(px);
    expect(() =>
      render(<HomeEjecutivo datos={DATOS_EJEMPLO} usuario="Angelo" hoy={HOY_EJEMPLO} />)
    ).not.toThrow();
  });

  test("sin datos muestra la pantalla igual, sin caerse", () => {
    anchoVentana(1440);
    render(<HomeEjecutivo datos={{}} usuario="Angelo" hoy={HOY_EJEMPLO} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/No hay nada pendiente de decisión/)).toBeInTheDocument();
  });
});

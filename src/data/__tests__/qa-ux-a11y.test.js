/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// QA UX · ACCESIBILIDAD
// ═══════════════════════════════════════════════════════════════════
//
// Accesibilidad ejercida, no declarada. Cada bloque comprueba algo que se
// puede romper con un cambio de estilo y que nadie notaría hasta que un
// usuario con teclado o lector de pantalla se queda pegado.
//
//   1. Contraste WCAG calculado de verdad sobre los pares que el diseño usa.
//   2. Ningún color prohibido llega al DOM como color de texto.
//   3. Estructura semántica: landmarks, encabezados, tabla real.
//   4. Teclado: recorrido del riel, combobox y orden de tabla.
//   5. Foco: se mueve donde corresponde al abrir una ficha.

import React from "react";
import "@testing-library/jest-dom";
import { render, screen, within, fireEvent } from "@testing-library/react";

import {
  PARES_CONTRASTE,
  TINTAS_PROHIBIDAS_COMO_TEXTO,
} from "../../ux/tokens";
import RielNavegacion from "../../ux/RielNavegacion";
import BusquedaGlobal from "../../ux/BusquedaGlobal";
import TablaDensa from "../../ux/TablaDensa";
import Ficha360 from "../../ux/Ficha360";
import PanelAlertas from "../../ux/PanelAlertas";
import HomeEjecutivo from "../../ux/HomeEjecutivo";
import { construirIndice, ficha360, alertasAccionables, filasContratos } from "../../ux/selectores";
import { DATOS_EJEMPLO, HOY_EJEMPLO } from "../../ux/ejemploDatos";

// ── Utilidades WCAG 2.1 ────────────────────────────────────────────
// Implementadas acá y no importadas: la prueba tiene que ser independiente
// del código que audita, si no se está verificando a sí misma.
function aRGB(hex) {
  const h = String(hex).replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function luminancia(hex) {
  const canal = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = aRGB(hex).map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(fg, bg) {
  const a = luminancia(fg);
  const b = luminancia(bg);
  const [alto, bajo] = a > b ? [a, b] : [b, a];
  return (alto + 0.05) / (bajo + 0.05);
}

describe("contraste · las utilidades WCAG de esta prueba son correctas", () => {
  // Calibración contra valores conocidos. Si la fórmula estuviera mal, todo
  // lo de abajo pasaría por la razón equivocada.
  test("negro sobre blanco es 21:1", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });
  test("blanco sobre blanco es 1:1", () => {
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
  test("gris medio #767676 sobre blanco es el límite AA (4,54)", () => {
    expect(contraste("#767676", "#ffffff")).toBeGreaterThan(4.5);
    expect(contraste("#777777", "#ffffff")).toBeLessThan(4.6);
  });
  test("la notación de 3 dígitos se expande igual que la de 6", () => {
    expect(contraste("#fff", "#000")).toBeCloseTo(contraste("#ffffff", "#000000"), 6);
  });
});

describe("contraste · cada par declarado cumple su mínimo", () => {
  test("hay pares que auditar", () => {
    expect(PARES_CONTRASTE.length).toBeGreaterThanOrEqual(15);
  });

  test.each(PARES_CONTRASTE.map((p) => [p.uso, p]))("%s", (_uso, par) => {
    const r = contraste(par.fg, par.bg);
    // Se compara un objeto y no el número suelto: así el diff de un fallo
    // muestra qué colores son y cuánto dieron, sin ir a calcularlo a mano.
    expect({
      par: par.uso,
      colores: `${par.fg} sobre ${par.bg}`,
      cumple: r >= par.min,
      ratio: Number(r.toFixed(2)),
    }).toEqual({
      par: par.uso,
      colores: `${par.fg} sobre ${par.bg}`,
      cumple: true,
      ratio: expect.any(Number),
    });
    expect(r).toBeGreaterThanOrEqual(par.min);
  });
});

describe("contraste · los tokens ilegibles quedan fuera del texto", () => {
  // Hallazgo que motivó la regla: `theme.muted2` (#8a97a8) da 2,97:1 sobre
  // blanco y el proyecto lo usa como texto secundario en varios lugares.
  test("los tokens prohibidos efectivamente fallan AA sobre panel blanco", () => {
    for (const hex of TINTAS_PROHIBIDAS_COMO_TEXTO) {
      expect(contraste(hex, "#ffffff")).toBeLessThan(4.5);
    }
  });

  test("ningún elemento del prototipo los usa como color de texto", () => {
    const { container } = render(
      <HomeEjecutivo datos={DATOS_EJEMPLO} usuario="Angelo" hoy={HOY_EJEMPLO} />
    );
    const prohibidos = TINTAS_PROHIBIDAS_COMO_TEXTO.map((h) => {
      const [r, g, b] = aRGB(h);
      return `rgb(${r}, ${g}, ${b})`;
    });
    const infractores = [];
    container.querySelectorAll("*").forEach((el) => {
      const c = el.style && el.style.color;
      if (c && prohibidos.includes(c)) infractores.push(`${el.tagName}: ${c}`);
    });
    expect(infractores).toEqual([]);
  });
});

// ── Estructura semántica ───────────────────────────────────────────
describe("estructura · landmarks y encabezados", () => {
  test("el riel es un landmark de navegación con nombre", () => {
    render(
      <RielNavegacion
        items={[{ id: "a", label: "Osiris", icono: "x" }]}
        activo="a"
        modo="etiquetas"
      />
    );
    expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBeInTheDocument();
  });

  test("el destino activo se marca con aria-current, no sólo con color", () => {
    render(
      <RielNavegacion
        items={[
          { id: "a", label: "Osiris", icono: "x" },
          { id: "b", label: "Finanzas", icono: "y" },
        ]}
        activo="b"
        modo="etiquetas"
      />
    );
    expect(screen.getByRole("button", { name: "Finanzas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Osiris" })).not.toHaveAttribute("aria-current");
  });

  test("en modo ícono el botón conserva nombre accesible aunque no se vea texto", () => {
    render(
      <RielNavegacion items={[{ id: "a", label: "Contabilidad", icono: "▦" }]} activo="a" modo="iconos" />
    );
    const b = screen.getByRole("button", { name: "Contabilidad" });
    // El glifo del ícono está oculto para el lector: si no lo estuviera, el
    // nombre accesible sería "▦ Contabilidad".
    expect(within(b).getByText("▦")).toHaveAttribute("aria-hidden", "true");
  });

  test("el home tiene un h1 único y los paneles cuelgan de h2", () => {
    render(<HomeEjecutivo datos={DATOS_EJEMPLO} usuario="Angelo" hoy={HOY_EJEMPLO} />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 2, name: /Qué requiere tu decisión/i })
    ).toBeInTheDocument();
  });

  test("los KPI son artículos con nombre accesible tomado de la pregunta", () => {
    render(<HomeEjecutivo datos={DATOS_EJEMPLO} usuario="Angelo" hoy={HOY_EJEMPLO} />);
    expect(
      screen.getByRole("article", { name: "¿Cuánto ingreso tengo comprometido por contrato?" })
    ).toBeInTheDocument();
  });
});

describe("estructura · la tabla densa es una tabla de verdad", () => {
  const columnas = [
    { id: "cliente", etiqueta: "Cliente" },
    { id: "plantas", etiqueta: "Plantas", formato: "conteo", alineacion: "right" },
  ];
  const filas = filasContratos(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("expone role=table con caption y encabezados de columna", () => {
    render(<TablaDensa titulo="Contratos" columnas={columnas} filas={filas} />);
    const tabla = screen.getByRole("table", { name: /Contratos/ });
    expect(tabla).toBeInTheDocument();
    expect(within(tabla).getAllByRole("columnheader")).toHaveLength(2);
  });

  test("el caption dice cuántas filas hay, que es lo que no se ve al tacto", () => {
    render(<TablaDensa titulo="Contratos" columnas={columnas} filas={filas} />);
    expect(screen.getByRole("table", { name: /3 filas/ })).toBeInTheDocument();
  });

  test("cada encabezado declara aria-sort y sólo el ordenado deja de ser 'none'", () => {
    render(
      <TablaDensa
        titulo="Contratos"
        columnas={columnas}
        filas={filas}
        ordenInicial={{ columna: "plantas", direccion: "desc" }}
      />
    );
    const cabeceras = screen.getAllByRole("columnheader");
    expect(cabeceras[0]).toHaveAttribute("aria-sort", "none");
    expect(cabeceras[1]).toHaveAttribute("aria-sort", "descending");
  });

  test("ordenar se hace desde un botón enfocable, no desde el th", () => {
    render(<TablaDensa titulo="Contratos" columnas={columnas} filas={filas} />);
    const boton = screen.getByRole("button", { name: /Plantas/ });
    expect(boton.tagName).toBe("BUTTON");
    fireEvent.click(boton);
    expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(boton);
    expect(screen.getAllByRole("columnheader")[1]).toHaveAttribute("aria-sort", "descending");
  });

  test("abrir una fila se logra con teclado porque es un botón, no un onClick en el tr", () => {
    const abrir = jest.fn();
    render(<TablaDensa titulo="Contratos" columnas={columnas} filas={filas} alAbrir={abrir} />);
    const enlace = screen.getByRole("button", { name: /Agrícola Los Maitenes · abrir ficha/ });
    fireEvent.click(enlace);
    expect(abrir).toHaveBeenCalledTimes(1);
    expect(abrir.mock.calls[0][0].id).toBe("ct1");
  });

  test("en móvil no hay tabla: se sirve una lista de tarjetas legible sin scroll lateral", () => {
    render(<TablaDensa titulo="Contratos" columnas={columnas} filas={filas} comoTarjetas />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});

// ── Teclado ────────────────────────────────────────────────────────
describe("teclado · riel", () => {
  const items = [
    { id: "a", label: "Uno", icono: "1" },
    { id: "b", label: "Dos", icono: "2" },
    { id: "c", label: "Tres", icono: "3" },
  ];

  test("todos los destinos son tabulables (no hay roving tabindex que los esconda)", () => {
    render(<RielNavegacion items={items} activo="a" modo="etiquetas" />);
    for (const it of items) {
      expect(screen.getByRole("button", { name: it.label })).not.toHaveAttribute("tabindex", "-1");
    }
  });

  test("la flecha abajo mueve el foco al siguiente y da la vuelta al final", () => {
    render(<RielNavegacion items={items} activo="a" modo="etiquetas" />);
    const [uno, dos, tres] = items.map((i) => screen.getByRole("button", { name: i.label }));
    uno.focus();
    fireEvent.keyDown(uno, { key: "ArrowDown" });
    expect(dos).toHaveFocus();
    fireEvent.keyDown(dos, { key: "ArrowDown" });
    expect(tres).toHaveFocus();
    fireEvent.keyDown(tres, { key: "ArrowDown" });
    expect(uno).toHaveFocus();
  });

  test("la flecha arriba retrocede y Home/End van a los extremos", () => {
    render(<RielNavegacion items={items} activo="a" modo="etiquetas" />);
    const [uno, dos, tres] = items.map((i) => screen.getByRole("button", { name: i.label }));
    dos.focus();
    fireEvent.keyDown(dos, { key: "ArrowUp" });
    expect(uno).toHaveFocus();
    fireEvent.keyDown(uno, { key: "End" });
    expect(tres).toHaveFocus();
    fireEvent.keyDown(tres, { key: "Home" });
    expect(uno).toHaveFocus();
  });

  test("mover el foco no cambia el destino activo: eso lo hace Enter o el clic", () => {
    const elegir = jest.fn();
    render(<RielNavegacion items={items} activo="a" alSeleccionar={elegir} modo="etiquetas" />);
    const dos = screen.getByRole("button", { name: "Dos" });
    screen.getByRole("button", { name: "Uno" }).focus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Uno" }), { key: "ArrowDown" });
    expect(elegir).not.toHaveBeenCalled();
    fireEvent.click(dos);
    expect(elegir).toHaveBeenCalledWith("b");
  });
});

describe("teclado · búsqueda transversal (patrón combobox)", () => {
  const indice = construirIndice(DATOS_EJEMPLO);

  const montar = (alElegir = () => {}) => {
    render(<BusquedaGlobal indice={indice} alElegir={alElegir} />);
    return screen.getByRole("combobox", { name: "Buscar en Osiris" });
  };

  test("el campo se anuncia como combobox cerrado hasta que hay consulta", () => {
    const input = montar();
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    fireEvent.change(input, { target: { value: "valle" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  test("la lista es un listbox con opciones y el input la referencia", () => {
    const input = montar();
    fireEvent.change(input, { target: { value: "a" } });
    const lista = screen.getByRole("listbox");
    expect(input).toHaveAttribute("aria-controls", lista.id);
    expect(within(lista).getAllByRole("option").length).toBeGreaterThan(0);
  });

  test("las flechas mueven aria-activedescendant, no el foco del DOM", () => {
    const input = montar();
    // jsdom no enfoca solo al escribir; se replica lo que hace una persona.
    input.focus();
    fireEvent.change(input, { target: { value: "a" } });
    expect(input).not.toHaveAttribute("aria-activedescendant");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activo = input.getAttribute("aria-activedescendant");
    expect(activo).toBeTruthy();
    expect(document.getElementById(activo)).toHaveAttribute("aria-selected", "true");
    // El foco sigue en el campo: es lo que exige el patrón combobox.
    expect(input).toHaveFocus();
  });

  test("Enter elige la opción marcada", () => {
    const elegir = jest.fn();
    const input = montar(elegir);
    fireEvent.change(input, { target: { value: "valle" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(elegir).toHaveBeenCalledTimes(1);
    expect(elegir.mock.calls[0][0].titulo).toMatch(/Valle Norte/);
  });

  test("Escape cierra la lista y un segundo Escape limpia, sin perder lo escrito de golpe", () => {
    const input = montar();
    fireEvent.change(input, { target: { value: "valle" } });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).toHaveValue("valle");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
  });

  test("el conteo de resultados se anuncia en región viva", () => {
    const input = montar();
    fireEvent.change(input, { target: { value: "arandano" } });
    const vivas = document.querySelectorAll('[aria-live="polite"]');
    expect(vivas.length).toBeGreaterThan(0);
    const textos = Array.from(vivas).map((n) => n.textContent).join(" ");
    expect(textos).toMatch(/resultados?/);
  });

  test("sin coincidencias lo dice con palabras, no con una lista vacía muda", () => {
    const input = montar();
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText(/Sin coincidencias/)).toBeInTheDocument();
  });
});

// ── Foco ───────────────────────────────────────────────────────────
describe("foco · la ficha 360 no deja al teclado atrás", () => {
  test("al abrirse, el foco va al título de la ficha", () => {
    const ficha = ficha360(DATOS_EJEMPLO, "contrato", "ct1");
    render(<Ficha360 ficha={ficha} alCerrar={() => {}} />);
    expect(screen.getByRole("heading", { level: 2, name: "Agrícola Los Maitenes" })).toHaveFocus();
  });

  test("cambiar de entidad vuelve a mover el foco al nuevo título", () => {
    const { rerender } = render(<Ficha360 ficha={ficha360(DATOS_EJEMPLO, "contrato", "ct1")} />);
    rerender(<Ficha360 ficha={ficha360(DATOS_EJEMPLO, "contrato", "ct2")} />);
    expect(screen.getByRole("heading", { level: 2, name: "Valle Norte SAC" })).toHaveFocus();
  });

  test("es un complementary con nombre, no un diálogo que atrape el foco", () => {
    const ficha = ficha360(DATOS_EJEMPLO, "obtentor", "obt1");
    render(<Ficha360 ficha={ficha} />);
    expect(screen.getByRole("complementary", { name: "Genética Austral" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("sin selección explica qué hacer en vez de mostrarse en blanco", () => {
    render(<Ficha360 ficha={null} />);
    expect(screen.getByText(/Elige un contrato/)).toBeInTheDocument();
  });
});

// ── Formularios ────────────────────────────────────────────────────
describe("filtros de alertas · son controles reales, no botones disfrazados", () => {
  const alertas = alertasAccionables(DATOS_EJEMPLO, HOY_EJEMPLO);

  test("el filtro es un grupo de radios con leyenda", () => {
    render(<PanelAlertas alertas={alertas} />);
    const grupo = screen.getByRole("group", { name: /Filtrar alertas por severidad/i });
    expect(within(grupo).getAllByRole("radio")).toHaveLength(4);
  });

  test("hay exactamente un radio marcado y por defecto es Todas", () => {
    render(<PanelAlertas alertas={alertas} />);
    const marcados = screen.getAllByRole("radio").filter((r) => r.checked);
    expect(marcados).toHaveLength(1);
    expect(marcados[0]).toBeChecked();
    expect(marcados[0]).toHaveAttribute("value", "todas");
  });

  test("filtrar por Crítico deja sólo alertas críticas", () => {
    render(<PanelAlertas alertas={alertas} maximo={99} />);
    const antes = screen.getAllByRole("listitem").length;
    fireEvent.click(screen.getByRole("radio", { name: /Crítico/ }));
    const despues = screen.getAllByRole("listitem").length;
    expect(despues).toBeLessThan(antes);
    expect(despues).toBe(alertas.filter((a) => a.severidad === "critico").length);
  });

  test("cada alerta ofrece un botón con el verbo de la acción", () => {
    render(<PanelAlertas alertas={alertas} maximo={99} />);
    const botones = screen
      .getAllByRole("button")
      .filter((b) => /Solicitar firma|Renovar|Cargar|Definir|Emitir|Adjuntar|Completar|Agendar|Revisar/.test(b.textContent));
    expect(botones.length).toBeGreaterThanOrEqual(alertas.length);
  });

  test("la severidad va también en texto, para que no dependa del color", () => {
    render(<PanelAlertas alertas={alertas} maximo={99} />);
    expect(screen.getAllByText("Crítico").length).toBeGreaterThan(0);
  });
});

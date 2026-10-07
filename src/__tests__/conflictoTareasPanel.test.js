/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// El panel de las dos salidas, en pantalla (PanelConflictoFila).
//
// Lo que importa acá: que la persona VEA las dos salidas y que el texto diga qué
// se pierde en cada una. Sin conflicto no aparece nada (un panel que se asoma
// cuando no hay nada que decidir sería peor que no tenerlo).
//
// Se prueba el componente y no App.jsx completo: montar App.jsx arrastra todos
// los módulos (Finanzas, Frisku, Osiris…), el login con PIN y la carga de
// Supabase; el panel se extrajo a su propio componente justamente para esto.
// ═══════════════════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import PanelConflictoFila from "../PanelConflictoFila.jsx";

const BOTON_SERVIDOR = "Recuperar la versión del servidor (descarta mi cambio)";
const BOTON_LOCAL = "Conservar mi versión (reemplaza la del servidor)";

describe("PanelConflictoFila", () => {
  test("sin conflicto no se muestra nada", () => {
    const { container } = render(<PanelConflictoFila conflicto={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(BOTON_SERVIDOR)).toBeNull();
    expect(screen.queryByText(BOTON_LOCAL)).toBeNull();
  });

  test("con el conflicto puesto aparecen las DOS salidas y dicen qué se pierde", () => {
    render(<PanelConflictoFila conflicto={{ rowId: "main", etiqueta: "las Tareas" }} />);
    expect(screen.getByText(/Tu cambio NO se guardó: otra sesión modificó las Tareas/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BOTON_SERVIDOR })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: BOTON_LOCAL })).toBeInTheDocument();
    // El texto tiene que decir que nada se perdió todavía y que no se está guardando.
    expect(screen.getByText(/no se escribe nada en el servidor/)).toBeInTheDocument();
    expect(screen.getByText(/descarta lo que escribiste acá/)).toBeInTheDocument();
    expect(screen.getByText(/escribe tu versión encima de la del servidor/)).toBeInTheDocument();
  });

  test("cada botón llama a SU salida, una sola vez", () => {
    const onRecuperar = jest.fn(), onConservar = jest.fn();
    render(<PanelConflictoFila conflicto={{ rowId: "allegria", etiqueta: "Allegria Foods" }}
      onRecuperar={onRecuperar} onConservar={onConservar} />);
    expect(screen.getByText(/otra sesión modificó Allegria Foods/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: BOTON_SERVIDOR }));
    expect(onRecuperar).toHaveBeenCalledTimes(1);
    expect(onConservar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: BOTON_LOCAL }));
    expect(onConservar).toHaveBeenCalledTimes(1);
  });

  test("mientras una salida está en vuelo los botones no se pueden volver a apretar", () => {
    const onRecuperar = jest.fn(), onConservar = jest.fn();
    render(<PanelConflictoFila conflicto={{ rowId: "main", etiqueta: "las Tareas" }} ocupado
      onRecuperar={onRecuperar} onConservar={onConservar} />);
    const b1 = screen.getByRole("button", { name: BOTON_SERVIDOR });
    expect(b1).toBeDisabled();
    fireEvent.click(b1);
    expect(onRecuperar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: BOTON_LOCAL })).toBeDisabled();
  });

  test("sin etiqueta usa el id de la fila (nunca queda el hueco vacío)", () => {
    render(<PanelConflictoFila conflicto={{ rowId: "pins" }} />);
    expect(screen.getByText(/otra sesión modificó pins/)).toBeInTheDocument();
  });
});

/* Sistema visual: etiquetas de gráficos legibles y componentes accesibles. */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { fuenteGraficoUnidades, Modal, Pestanas, EstadoVista } from "../diseno/componentes.jsx";

test("etiqueta de gráfico: un viewBox de 900 mostrado a 360 px necesita 27,5 unidades para verse de 11 px", () => {
  expect(fuenteGraficoUnidades(360 / 900, 11)).toBeCloseTo(27.5);
  expect(fuenteGraficoUnidades(1, 11, 9)).toBe(11);      // 9 px a escala 1 sube a 11
  expect(fuenteGraficoUnidades(2, 11, 9)).toBe(9);       // a escala 2, 9 unidades ya se ven de 18 px: no se achica
  expect(fuenteGraficoUnidades(0, 11)).toBe(11);
});

test("modal: Esc cierra y el foco entra al primer campo", () => {
  const cerrar = jest.fn();
  render(<Modal abierto titulo="Prueba" onCerrar={cerrar}><input aria-label="monto"/></Modal>);
  expect(document.activeElement).toBe(screen.getByLabelText("monto"));
  fireEvent.keyDown(window, { key: "Escape" });
  expect(cerrar).toHaveBeenCalled();
});

test("pestañas: no dibuja las ocultas por permiso y se mueve con flechas", () => {
  const cambiar = jest.fn();
  render(<Pestanas items={[{ id: "a", label: "A" }, { id: "b", label: "B", oculto: true }, { id: "c", label: "C" }]} activa="a" onCambiar={cambiar}/>);
  expect(screen.queryByText("B")).toBeNull();
  fireEvent.keyDown(screen.getByText("A"), { key: "ArrowRight" });
  expect(cambiar).toHaveBeenCalledWith("c");
});

test("estado de error ofrece reintentar y no inventa cifras", () => {
  const re = jest.fn();
  render(<EstadoVista tipo="error" onReintentar={re}>No se pudo leer</EstadoVista>);
  fireEvent.click(screen.getByText("Reintentar"));
  expect(re).toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).not.toMatch(/\d/);
});

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

describe("diálogos de la app (reemplazo de window.prompt/confirm)", () => {
  const { DialogosHost, pedirTexto, elegirOpcion, confirmar } = require("../diseno/dialogos.jsx");
  const { act } = require("@testing-library/react");
  test("pedirTexto: aceptar devuelve el texto escrito; cancelar devuelve null", async () => {
    render(<DialogosHost/>);
    let p; act(() => { p = pedirTexto("Motivo", "inicial", { titulo: "Devolver" }); });
    const campo = await screen.findByLabelText(/Respuesta/);
    expect(campo.value).toBe("inicial");
    fireEvent.change(campo, { target: { value: "falta boleta" } });
    fireEvent.click(screen.getByTestId("dialogo-aceptar"));
    await expect(p).resolves.toBe("falta boleta");
    let q; act(() => { q = pedirTexto("Otro"); });
    fireEvent.click(await screen.findByText("Cancelar"));
    await expect(q).resolves.toBeNull();
  });
  test("obligatorio: no deja aceptar vacío", async () => {
    render(<DialogosHost/>);
    act(() => { pedirTexto("Motivo", "", { obligatorio: true }); });
    expect((await screen.findByTestId("dialogo-aceptar")).disabled).toBe(true);
  });
  test("elegirOpcion devuelve el valor; confirmar devuelve true/false", async () => {
    render(<DialogosHost/>);
    let p; act(() => { p = elegirOpcion("¿A quién?", [{ valor: "1", etiqueta: "Carol" }, { valor: "2", etiqueta: "Michelle" }]); });
    fireEvent.click(await screen.findByTestId("dialogo-opcion-2"));
    await expect(p).resolves.toBe("2");
    let c; act(() => { c = confirmar("¿Seguro?"); });
    fireEvent.click(await screen.findByTestId("dialogo-aceptar"));
    await expect(c).resolves.toBe(true);
  });
  test("un solo diálogo a la vez: la segunda solicitud se responde como cancelar", async () => {
    render(<DialogosHost/>);
    let p; act(() => { p = pedirTexto("Primero"); });
    await screen.findByTestId("dialogo-app");
    await expect(pedirTexto("Segundo")).resolves.toBeNull();
    await expect(confirmar("Tercero")).resolves.toBe(false);
    expect(screen.getAllByTestId("dialogo-app")).toHaveLength(1);
    fireEvent.change(screen.getByLabelText(/Respuesta/), { target: { value: "ok" } });
    fireEvent.click(screen.getByTestId("dialogo-aceptar"));
    await expect(p).resolves.toBe("ok");
    // Cerrado el primero, se puede pedir otro.
    let q; act(() => { q = pedirTexto("Cuarto"); });
    fireEvent.keyDown(window, { key: "Escape" });   // Esc = cancelar
    await expect(q).resolves.toBeNull();
  });
  test("datos vigentes: sigueIgual detecta un cambio del registro durante la espera", () => {
    const { huella, sigueIgual } = require("../diseno/dialogos.jsx");
    const antes = { id: 1, estado: "aprobada1", items: [{ m: 10 }] };
    const h = huella(antes);
    expect(sigueIgual({ id: 1, estado: "aprobada1", items: [{ m: 10 }] }, h)).toBe(true);
    expect(sigueIgual({ id: 1, estado: "aprobada", items: [{ m: 10 }] }, h)).toBe(false);
    expect(sigueIgual(undefined, h)).toBe(false);           // el registro desapareció
  });
  test("sin anfitrión montado usa el diálogo del navegador (nunca peor que antes)", async () => {
    const orig = window.prompt; window.prompt = jest.fn(() => "nativo");
    try { await expect(pedirTexto("x")).resolves.toBe("nativo"); } finally { window.prompt = orig; }
  });
});

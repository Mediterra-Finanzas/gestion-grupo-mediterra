/* eslint-disable */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ErrorBoundaryModulo, esErrorDeVersion, comprobarGuardados } from "../ErrorBoundaryModulo.jsx";
import { persist } from "../persistencia/instancia.js";
import { crearPersistencia } from "../persistencia/persistContract.js";

function Rompe({ error }) { throw error || new Error("fallo de prueba"); }

let errSpy;
beforeEach(() => { errSpy = jest.spyOn(console, "error").mockImplementation(() => {}); persist.reset(); });
afterEach(() => { errSpy.mockRestore(); persist.reset(); });

test("un error en un módulo muestra recuperación en vez de pantalla en blanco", async () => {
  const onVolver = jest.fn();
  render(<ErrorBoundaryModulo ambito="Finanzas" onVolver={onVolver}><Rompe /></ErrorBoundaryModulo>);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByText("Ocurrió un error en Finanzas")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Volver al inicio" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Recargar la página" })).toBeInTheDocument();
  await screen.findByText(/No hay guardados pendientes registrados/);
  fireEvent.click(screen.getByRole("button", { name: "Volver al inicio" }));
  expect(onVolver).toHaveBeenCalledTimes(1);
});

test("nunca afirma que el trabajo está guardado", async () => {
  render(<ErrorBoundaryModulo ambito="Osiris"><Rompe /></ErrorBoundaryModulo>);
  await screen.findByText(/No hay guardados pendientes registrados/);
  expect(document.body.textContent).not.toMatch(/está guardado|están guardados|no se pierden/i);
});

test("informa las filas cuyo guardado el servidor no confirmó", async () => {
  persist.marcarSucio("finanzas");
  render(<ErrorBoundaryModulo ambito="Finanzas" onVolver={() => {}}><Rompe /></ErrorBoundaryModulo>);
  await screen.findByText(/no confirmó el guardado de/);
  expect(screen.getByText("finanzas")).toBeInTheDocument();
  expect(document.body.textContent).toMatch(/Si recargas la página, esos cambios se pierden/);
});

test("'nueva versión' solo para errores de carga de archivos", () => {
  const chunk = Object.assign(new Error("Loading chunk 12 failed."), { name: "ChunkLoadError" });
  expect(esErrorDeVersion(chunk)).toBe(true);
  expect(esErrorDeVersion(new TypeError("g.map is not a function"))).toBe(false);
  expect(esErrorDeVersion(new TypeError("Failed to fetch"))).toBe(false);
  render(<ErrorBoundaryModulo ambito="Frisku"><Rompe error={chunk} /></ErrorBoundaryModulo>);
  expect(screen.getByText("Hay una versión nueva de la aplicación")).toBeInTheDocument();
});

test("cambiar de módulo (resetKey) limpia el error", () => {
  const { rerender } = render(<ErrorBoundaryModulo resetKey="a"><Rompe /></ErrorBoundaryModulo>);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  rerender(<ErrorBoundaryModulo resetKey="b"><div>módulo sano</div></ErrorBoundaryModulo>);
  expect(screen.getByText("módulo sano")).toBeInTheDocument();
});

test("idsSucios es de solo lectura y refleja marcarSucio/marcarLimpio", async () => {
  const p = crearPersistencia();
  p.marcarSucio("x");
  expect(p.idsSucios()).toEqual(["x"]);
  p.marcarLimpio("x");
  expect(p.idsSucios()).toEqual([]);
  const r = await comprobarGuardados({ idsSucios: () => [], flush: async () => ({}) });
  expect(r.pendientes).toEqual([]);
});

/* eslint-disable */
// Frisku · Liquidaciones restringida (matriz 08-10-2026). Sin acceso a la pestaña, las filas
// frisku_liquidaciones y frisku_po NO se piden ni se escriben: así ninguna otra vista
// (Resumen, detalle de embarque, Reportería BI y sus exportaciones) puede mostrarlas.
// Supabase simulado. Control de la APLICACIÓN: la base sigue abierta a la llave pública.
import React from "react";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";

jest.mock("../friskuHelpers.js", () => {
  const real = jest.requireActual("../friskuHelpers.js");
  return { ...real, dbLoadGeneric: jest.fn(), dbSaveGeneric: jest.fn() };
});
import FriskuComercialModule from "../FriskuComercialModule.jsx";
import * as helpers from "../friskuHelpers.js";

const LIQ = [{ id: "L1", oeId: "OE1", estado: "emitida", monedaBase: "USD", montoComisionFrisku: 777, ventaTotal: 99999 }];
const store = () => ({
  frisku_embarques: [{ id: "OE1", numero: "OE-1", estado: "confirmado", fechaDespacho: "2099-01-01", exportadoraId: "E1", clienteId: "C1" }],
  frisku_liquidaciones: LIQ, frisku_po: [{ id: "P1", numero: "PO-1", clienteId: "C1", estado: "emitida" }],
  frisku_clientes: [{ id: "C1", nombre: "Cliente Uno" }], frisku_exportadoras: [{ id: "E1", nombre: "Exp Uno" }],
});
let pedidos, guardados, mem;
beforeEach(() => {
  pedidos = []; guardados = []; mem = store();
  helpers.dbLoadGeneric.mockImplementation(async (id) => { pedidos.push(id); return JSON.parse(JSON.stringify(mem[id] ?? null)); });
  helpers.dbSaveGeneric.mockImplementation(async (id, v) => { guardados.push(id); mem[id] = v; return { ok: true }; });
});
async function abrir(usuario, tabPermisos) {
  render(<FriskuComercialModule usuarioActual={usuario} esAdmin={() => usuario.rol === "admin"}
    esSoloConsulta={() => usuario.rol === "consulta"} tabPermisos={tabPermisos} onBack={() => {}} />);
  await waitFor(() => expect(screen.queryByText(/Cargando módulo Frisku/)).toBeNull(), { timeout: 8000 });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const tabsDe = () => screen.getAllByRole("button").map(b => b.textContent);

test("Denise (sin_acceso a Liquidaciones): no se piden ni se guardan liquidaciones/PO, y no hay pestaña", async () => {
  await abrir({ nombre: "Denise Piaget", email: "denise@ficticio.cl", rol: "editor" }, { liquidaciones: "sin_acceso" });
  expect(pedidos).toContain("frisku_embarques");
  expect(pedidos).not.toContain("frisku_liquidaciones");
  expect(pedidos).not.toContain("frisku_po");
  expect(tabsDe().some(t => /Liquidaciones/.test(t))).toBe(false);
  // Resumen sin la alerta de liquidaciones
  expect(screen.queryByText(/Liquidaciones no pagadas/)).toBeNull();
  // Reportería BI: aviso explícito de que los montos no se cargan
  fireEvent.click(screen.getAllByRole("button").find(b => /Reportería BI/.test(b.textContent)));
  await act(async () => {});
  expect(screen.getByTestId("aviso-sin-liq")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/99[.,]?999|777/);
  // Resumen ejecutivo: los paneles de dinero dicen "restringido"; ningún KPI de dinero aparece en cero
  expect(screen.getByTestId("restringido-resumen")).toBeTruthy();
  expect(screen.queryByText(/Comisión Frisku por temporada/)).toBeNull();
  expect(screen.queryByText("Venta destino (USD)")).toBeNull();
  expect(screen.queryByText("Comisión Frisku (USD)")).toBeNull();
  expect(document.body.textContent).not.toMatch(/\$0(?![\d.,])/);
  // Reportes: los de dinero se omiten (nombrados como restringidos), quedan los de volumen
  fireEvent.click(screen.getAllByRole("button").find(b => /📋 Reportes/.test(b.textContent)));
  await act(async () => {});
  expect(screen.getByTestId("reportes-restringidos")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Ingreso por temporada/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Cobranza \(aging\)/ })).toBeNull();
  expect(screen.getByRole("button", { name: /Pipeline embarques/ })).toBeTruthy();
  // Análisis: ninguna medida de dinero en cero
  fireEvent.click(screen.getAllByRole("button").find(b => /🔬 Análisis/.test(b.textContent)));
  await act(async () => { await new Promise(r => setTimeout(r, 50)); });
  expect(document.body.textContent).not.toMatch(/\$0(?![\d.,])/);
  expect(document.body.textContent).not.toMatch(/Comisión Frisku \(USD\)/);
  // espera más que el debounce del auto-save: nada se escribe en esas filas
  await act(async () => { await new Promise(r => setTimeout(r, 1500)); });
  expect(guardados).not.toContain("frisku_liquidaciones");
  expect(guardados).not.toContain("frisku_po");
}, 20000);

test("Carolina (editar explícito): se cargan liquidaciones y PO y ve la pestaña", async () => {
  await abrir({ nombre: "Carolina Lara", email: "carolina@ficticio.cl", rol: "editor" }, { liquidaciones: "editar" });
  expect(pedidos).toEqual(expect.arrayContaining(["frisku_liquidaciones", "frisku_po"]));
  expect(tabsDe().some(t => /Liquidaciones/.test(t))).toBe(true);
  expect(screen.queryByTestId("aviso-sin-liq")).toBeNull();
  fireEvent.click(screen.getAllByRole("button").find(b => /Reportería BI/.test(b.textContent)));
  await act(async () => {});
  expect(screen.getByText(/Comisión Frisku por temporada/)).toBeTruthy();
  expect(screen.queryByTestId("restringido-resumen")).toBeNull();
}, 20000);

test("admin: carga y ve Liquidaciones", async () => {
  await abrir({ nombre: "Angelo Huerta", email: "ahuerta@ficticio.cl", rol: "admin" }, {});
  expect(pedidos).toContain("frisku_liquidaciones");
  expect(tabsDe().some(t => /Liquidaciones/.test(t))).toBe(true);
}, 20000);

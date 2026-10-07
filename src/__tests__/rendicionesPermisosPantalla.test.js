/* eslint-disable */
// Rendiciones en pantalla (Supabase simulado): quién ve "Marcar pagada" y "Aprobar", y
// qué se escribe. Complementa permisosAcciones.test.js (guardas llamadas directamente).
import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const mockStore = {};
const mockSaves = [];
jest.mock("../friskuHelpers", () => ({
  dbLoadGeneric: jest.fn(), dbSaveGeneric: jest.fn(),
  uploadArchivoFrisku: jest.fn(), eliminarArchivoFrisku: jest.fn(), pathDesdeUrlStorage: jest.fn(),
  buscarTC: jest.fn(),
}));
jest.mock("../emailHelper", () => ({ enviarEmail: jest.fn() }));
import RendicionesModule from "../RendicionesModule";
import * as helpers from "../friskuHelpers";
import * as email from "../emailHelper";

const rend = (id, folio, estado, extra = {}) => ({
  id, folio, estado, titulo: `Rend ${folio}`, trabajador: "Pedro Pérez", trabajadorEmail: "pedro@x.cl",
  monedaPago: "CLP", gastos: [{ id: `g${folio}`, fecha: "2026-10-01", monto: 1000, moneda: "CLP", categoria: "otros", adjuntoUrl: "u" }],
  historial: [], ...extra,
});
function preparar() {
  // CRA reinicia los mocks antes de cada prueba (resetMocks): se fijan acá.
  helpers.dbLoadGeneric.mockImplementation(async (id) => JSON.parse(JSON.stringify(mockStore[id] ?? null)));
  helpers.dbSaveGeneric.mockImplementation(async (id, v) => { mockSaves.push({ id, v: JSON.parse(JSON.stringify(v)) }); mockStore[id] = v; return { ok: true }; });
  helpers.buscarTC.mockImplementation(() => null);
  email.enviarEmail.mockImplementation(async () => ({ ok: true }));
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockSaves.length = 0;
  mockStore.rendiciones = [
    rend("a", 1, "aprobada", { revisadoPor: "Angelo Huerta" }),
    rend("e", 2, "enviada", { cadena: [{ email: "cmachuca@x.cl", nombre: "Carol Machuca" }], nivelActual: 0 }),
  ];
  mockStore.maestro_tc = {};
  mockStore.rendiciones_config = { aprobadores: {} };
}
const USUARIOS = [
  { nombre: "Carol Machuca", email: "cmachuca@x.cl", rol: "editor", rendVerTodas: true },
  { nombre: "Consulta Uno", email: "cmachuca@x.cl", rol: "consulta", rendVerTodas: true },
];
async function abrir(usuario, nivel = "ver") {
  render(<RendicionesModule usuarioActual={usuario} esAdmin={() => usuario.rol === "admin"} nivelRendiciones={nivel} usuarios={USUARIOS} />);
  await screen.findByText(/Mis Rendiciones/i);
  await waitFor(() => expect(helpers.dbLoadGeneric).toHaveBeenCalledWith("rendiciones_config"));
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const ir = async (re) => { fireEvent.click(screen.getAllByRole("button", { name: re })[0]); await act(async () => {}); };

beforeEach(preparar);

test("Carol (rendVerTodas): ve y usa 'Marcar pagada' en una aprobada; se guarda como pagada", async () => {
  await abrir({ nombre: "Carol Machuca", email: "cmachuca@x.cl", rol: "editor", rendVerTodas: true });
  await ir(/Pagos/);
  const b = screen.getByRole("button", { name: "Marcar pagada" });
  fireEvent.click(b);
  // guardado diferido real (debounce del módulo)
  await waitFor(() => expect(mockSaves.length).toBeGreaterThan(0), { timeout: 8000 });
  const ultima = mockSaves[mockSaves.length - 1].v.find(x => x.id === "a");
  expect(ultima.estado).toBe("pagada");
  expect(ultima.pagadoPor).toBe("Carol Machuca");
}, 15000);

test("rol consulta con rendVerTodas: ve Pagos pero SIN 'Marcar pagada', y no escribe nada", async () => {
  await abrir({ nombre: "Consulta Uno", email: "cmachuca@x.cl", rol: "consulta", rendVerTodas: true });
  await ir(/Pagos/);
  expect(screen.getByText(/Rend 1/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Marcar pagada" })).toBeNull();
  // espera más que el debounce del guardado: nada se escribe
  await act(async () => { await new Promise(r => setTimeout(r, 2500)); });
  expect(mockSaves.length).toBe(0);
}, 10000);

test("aprobar: la aprobadora asignada (Carol) ve 'Aprobar'", async () => {
  await abrir({ nombre: "Carol Machuca", email: "cmachuca@x.cl", rol: "editor", rendVerTodas: true });
  await ir(/Por Aprobar/);
  expect(screen.getAllByRole("button", { name: "Aprobar" }).length).toBeGreaterThan(0);
});

test("aprobar: consulta asignada no ve el botón", async () => {
  await abrir({ nombre: "Consulta Uno", email: "cmachuca@x.cl", rol: "consulta", rendVerTodas: true });
  await ir(/Por Aprobar/);
  expect(screen.queryByRole("button", { name: "Aprobar" })).toBeNull();
  expect(screen.getAllByText(/No es tu turno/).length).toBeGreaterThan(0);
});

/* eslint-disable */
// Runtime-mock tests del Admin UI (Usuarios y permisos). NO es Preview runtime (ese es gate remoto).
// Mockea procRpc (boundary server) + useService (contexto). Verifica que la UI:
//  1 denied  2 grant  3 revoke  4 refresh caps  5 server error  6 sin usuarios.administrar
//  7 self-escalation deny (servidor rechaza)  8 cross-tenant (la UI SOLO usa la empresa del contexto)
//
// NOTA (Windows + worktree bajo .claude/): el testMatch de CRA queda con separadores mixtos y micromatch
// no matchea. Correr con override de forward-slash:
//   CI=true npx react-scripts test --watchAll=false \
//     --testMatch "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra/.claude/worktrees/proc-fase1/src/**/*.test.jsx"
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { procRpc } from "../../core/procesoDB";
import UsuariosPermisos from "./UsuariosPermisos";

const ALS = "5aa10886-2a76-4a9e-9bc3-303fb776cd49";
let mockService;

jest.mock("../../core/procesoDB", () => ({ procRpc: jest.fn() }));
jest.mock("../hooks/useServiceContext", () => ({ useService: () => mockService }));

const USERS = [
  { usuario_id: "u1", nombre: "Ana",  email: "ana@x",  membership_activa: true, roles: ["PROC_VIEWER"], capabilities: ["reporting.ver"] },
  { usuario_id: "u2", nombre: "Beto", email: "beto@x", membership_activa: true, roles: [],             capabilities: [] },
];
const ROLES = [ { codigo: "PROC_PRODUCCION", nombre: "Produccion" }, { codigo: "PROC_ADMIN", nombre: "Admin" } ];

function ctx({ caps = ["usuarios.administrar"], notificar = jest.fn() } = {}) {
  return { empresa: ALS, hasCap: (c) => caps.includes(c), notificar };
}
function happyRpc(overrides = {}) {
  procRpc.mockImplementation((fn) => {
    if (overrides[fn]) return overrides[fn]();
    if (fn === "iam_fn_listar_usuarios_roles") return Promise.resolve(USERS);
    if (fn === "iam_fn_catalogo_roles")        return Promise.resolve(ROLES);
    if (fn === "iam_fn_historial_roles")       return Promise.resolve([]);
    if (fn === "iam_fn_asignar_rol")           return Promise.resolve();
    if (fn === "iam_fn_revocar_rol")           return Promise.resolve();
    return Promise.resolve([]);
  });
}
const reject = (msg) => () => Promise.reject(new Error(msg));

beforeEach(() => { procRpc.mockReset(); mockService = ctx(); });

test("6) sin usuarios.administrar: muestra bloqueo y NO renderiza la superficie admin (gate cosmético; autoridad server-side)", async () => {
  mockService = ctx({ caps: [] });
  happyRpc();
  render(<UsuariosPermisos />);
  expect(screen.getByText(/Requiere la capability usuarios.administrar/i)).toBeTruthy();
  // el gate es reflejo de UX; la lista de usuarios NO se muestra a quien no tiene la capability.
  // (El servidor es la autoridad real y rechaza igual el RPC — cubierto por el test 1 "denied".)
  expect(screen.queryByText("Ana")).toBeNull();
  expect(screen.queryByText("Beto")).toBeNull();
});

test("1) denied: el servidor rechaza el listado (42501) -> estado denegado", async () => {
  happyRpc({ iam_fn_listar_usuarios_roles: reject("no_autorizado: usuarios.administrar") });
  render(<UsuariosPermisos />);
  expect(await screen.findByText(/El servidor rechazó la operación/i)).toBeTruthy();
});

test("5) server error (no-42501): estado error con reintento", async () => {
  happyRpc({ iam_fn_listar_usuarios_roles: reject("network boom") });
  render(<UsuariosPermisos />);
  expect(await screen.findByText(/network boom/i)).toBeTruthy();
});

test("2) grant: asigna rol con la empresa del contexto y notifica", async () => {
  const notificar = jest.fn(); mockService = ctx({ notificar });
  happyRpc();
  render(<UsuariosPermisos />);
  await screen.findByText("Beto");
  fireEvent.click(screen.getAllByText("Gestionar")[1]);            // fila Beto (sin rol)
  await screen.findByText(/Permisos ·/);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "PROC_PRODUCCION" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar rol" }));
  await waitFor(() => expect(procRpc).toHaveBeenCalledWith("iam_fn_asignar_rol",
    { p_usuario: "u2", p_empresa: ALS, p_rol: "PROC_PRODUCCION", p_motivo: null }));
  expect(notificar).toHaveBeenCalled();
});

test("3) revoke: revoca el rol existente con la empresa del contexto", async () => {
  happyRpc();
  render(<UsuariosPermisos />);
  await screen.findByText("Ana");
  fireEvent.click(screen.getAllByText("Gestionar")[0]);            // fila Ana (PROC_VIEWER)
  await screen.findByTitle(/Revocar rol/i);
  fireEvent.click(screen.getByTitle(/Revocar rol/i));
  await waitFor(() => expect(procRpc).toHaveBeenCalledWith("iam_fn_revocar_rol",
    { p_usuario: "u1", p_empresa: ALS, p_rol: "PROC_VIEWER", p_motivo: null }));
});

test("4) refresh: el botón Refrescar re-consulta usuarios y catálogo", async () => {
  happyRpc();
  render(<UsuariosPermisos />);
  await screen.findByText("Ana");
  const before = procRpc.mock.calls.filter(c => c[0] === "iam_fn_listar_usuarios_roles").length;
  fireEvent.click(screen.getByText("Refrescar"));
  await waitFor(() => {
    const after = procRpc.mock.calls.filter(c => c[0] === "iam_fn_listar_usuarios_roles").length;
    expect(after).toBe(before + 1);
  });
  expect(procRpc.mock.calls.some(c => c[0] === "iam_fn_catalogo_roles")).toBe(true);
});

test("7) self-escalation deny: el servidor rechaza asignar (42501) -> notifica error, modal sigue abierto", async () => {
  const notificar = jest.fn(); mockService = ctx({ notificar });
  happyRpc({ iam_fn_asignar_rol: reject("no_autorizado: usuarios.administrar") });
  render(<UsuariosPermisos />);
  await screen.findByText("Beto");
  fireEvent.click(screen.getAllByText("Gestionar")[1]);
  await screen.findByText(/Permisos ·/);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "PROC_ADMIN" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar rol" }));
  await waitFor(() => expect(notificar).toHaveBeenCalledWith(expect.stringMatching(/No se pudo asignar/i), "error"));
  expect(screen.getByRole("button", { name: "Asignar rol" })).toBeTruthy();           // modal sigue abierto (no cerró en error)
});

test("8) cross-tenant: toda mutación usa la empresa del contexto (no se puede forjar otra)", async () => {
  happyRpc();
  render(<UsuariosPermisos />);
  await screen.findByText("Beto");
  fireEvent.click(screen.getAllByText("Gestionar")[1]);
  await screen.findByText(/Permisos ·/);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "PROC_PRODUCCION" } });
  fireEvent.click(screen.getByRole("button", { name: "Asignar rol" }));
  await waitFor(() => {
    const call = procRpc.mock.calls.find(c => c[0] === "iam_fn_asignar_rol");
    expect(call).toBeTruthy();
    expect(call[1].p_empresa).toBe(ALS);                          // SIEMPRE el tenant del contexto
  });
});

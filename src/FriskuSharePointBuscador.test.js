/* eslint-disable */
// Test de componente (RTL) del buscador SharePoint read-only (S5B). Cliente inyectado (sin red).
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FriskuSharePointBuscador from "./FriskuSharePointBuscador.jsx";

const esSP = (u) => /^https:\/\/[^/]*\.sharepoint\.com/i.test(String(u || ""));
const OE = { id: "OE1", numeroContenedor: "HLBU9435288", temporada: "2026-2027" };
const RES = {
  estado: "exact_candidate", requiereConfirmacion: true,
  candidatos: [{ driveId: "D", itemId: "IT1", score: 90, confianza: "alta", señales: [{ tipo: "contenedor", resultado: "match" }], advertencias: [] }],
};

function mkCliente(over = {}) {
  return {
    iniciarSesionSp: over.iniciarSesionSp || jest.fn(async () => ({ ok: true })),
    buscarCandidatos: over.buscarCandidatos || jest.fn(async () => ({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://t.sharepoint.com/BL.pdf", name: "BL.pdf" } } })),
    esWebUrlSharePoint: over.esWebUrlSharePoint || esSP,
  };
}

describe("FriskuSharePointBuscador", () => {
  test("sin sesión → abre modal de acceso exclusivo", async () => {
    const cliente = mkCliente({ buscarCandidatos: jest.fn(async () => ({ ok: false, motivo: "sin_sesion" })) });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toBeInTheDocument();
  });

  test("login exitoso → busca y muestra candidatos con confianza y Abrir en SharePoint", async () => {
    const buscar = jest.fn()
      .mockResolvedValueOnce({ ok: false, motivo: "sin_sesion" })
      .mockResolvedValueOnce({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://t.sharepoint.com/BL.pdf", name: "BL.pdf" } } });
    const cliente = mkCliente({ buscarCandidatos: buscar });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("correo"), { target: { value: "uno@x.test" } });
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "246810" } });
    fireEvent.click(screen.getByText("Entrar"));
    expect(await screen.findByText("BL.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Confianza: Alta/)).toBeInTheDocument();
    const link = screen.getByText("Abrir en SharePoint");
    expect(link).toHaveAttribute("href", "https://t.sharepoint.com/BL.pdf");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
    expect(cliente.iniciarSesionSp).toHaveBeenCalledWith("uno@x.test", "246810");
  });

  test("el PIN se limpia tras enviarlo (no queda en el input)", async () => {
    const cliente = mkCliente({
      buscarCandidatos: jest.fn().mockResolvedValueOnce({ ok: false, motivo: "sin_sesion" }).mockResolvedValue({ ok: true, resultado: RES, porId: {} }),
      iniciarSesionSp: jest.fn(async () => ({ ok: true })),
    });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    await screen.findByRole("dialog");
    const pinInput = screen.getByLabelText("PIN");
    fireEvent.change(pinInput, { target: { value: "246810" } });
    fireEvent.click(screen.getByText("Entrar"));
    await waitFor(() => expect(cliente.iniciarSesionSp).toHaveBeenCalled());
    // el modal se cerró (login ok) → el input ya no existe; nunca se guardó el PIN
    await waitFor(() => expect(screen.queryByLabelText("PIN")).not.toBeInTheDocument());
  });

  test("login fallido → aviso genérico, sin exponer credenciales", async () => {
    const cliente = mkCliente({
      buscarCandidatos: jest.fn(async () => ({ ok: false, motivo: "sin_sesion" })),
      iniciarSesionSp: jest.fn(async () => ({ ok: false, motivo: "credenciales" })),
    });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    await screen.findByRole("dialog");
    fireEvent.change(screen.getByLabelText("PIN"), { target: { value: "000000" } });
    fireEvent.click(screen.getByText("Entrar"));
    expect(await screen.findByText(/incorrectos/i)).toBeInTheDocument();
  });

  test("webUrl no SharePoint → no se ofrece enlace", async () => {
    const cliente = mkCliente({ buscarCandidatos: jest.fn(async () => ({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://evil.example/x", name: "BL.pdf" } } })) });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    expect(await screen.findByText("enlace no disponible")).toBeInTheDocument();
    expect(screen.queryByText("Abrir en SharePoint")).not.toBeInTheDocument();
  });

  test("Graph caído → aviso temporal, sin romper", async () => {
    const cliente = mkCliente({ buscarCandidatos: jest.fn(async () => ({ ok: false, motivo: "graph" })) });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    expect(await screen.findByText(/SharePoint no está disponible/i)).toBeInTheDocument();
  });

  test("cambio de embarque descarta un resultado tardío (no cambia el OE visible)", async () => {
    let resolver;
    const buscar = jest.fn(() => new Promise((res) => { resolver = res; }));
    const cliente = mkCliente({ buscarCandidatos: buscar });
    const { rerender } = render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));   // queda en vuelo
    rerender(<FriskuSharePointBuscador oe={{ id: "OE2" }} cliente={cliente} />);  // cambia embarque
    resolver({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://t.sharepoint.com/BL.pdf", name: "BL.pdf" } } });  // resuelve tarde
    await Promise.resolve();
    expect(screen.queryByText("BL.pdf")).not.toBeInTheDocument();  // resultado obsoleto ignorado
  });
});

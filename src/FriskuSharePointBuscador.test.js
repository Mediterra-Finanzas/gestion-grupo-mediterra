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

  test("iniciar una nueva búsqueda borra las sugerencias anteriores", async () => {
    let resolver;
    const buscar = jest.fn()
      .mockResolvedValueOnce({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://t.sharepoint.com/BL.pdf", name: "BL.pdf" } } })
      .mockImplementationOnce(() => new Promise((res) => { resolver = res; }));  // 2ª búsqueda queda en vuelo
    const cliente = mkCliente({ buscarCandidatos: buscar });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    expect(await screen.findByText("BL.pdf")).toBeInTheDocument();   // 1ª búsqueda mostró resultado
    fireEvent.click(screen.getByText("Buscar en SharePoint"));       // 2ª búsqueda (aún en vuelo)
    await waitFor(() => expect(screen.queryByText("BL.pdf")).not.toBeInTheDocument());  // sugerencias previas borradas
    if (resolver) resolver({ ok: true, resultado: { estado: "not_found", requiereConfirmacion: true, candidatos: [] }, porId: {} });
  });

  test("401/sesión expirada tras tener resultados: borra sugerencias y pide nuevo login", async () => {
    const buscar = jest.fn()
      .mockResolvedValueOnce({ ok: true, resultado: RES, porId: { IT1: { webUrl: "https://t.sharepoint.com/BL.pdf", name: "BL.pdf" } } })
      .mockResolvedValueOnce({ ok: false, motivo: "sin_sesion" });
    const cliente = mkCliente({ buscarCandidatos: buscar });
    render(<FriskuSharePointBuscador oe={OE} cliente={cliente} />);
    fireEvent.click(screen.getByText("Buscar en SharePoint"));
    expect(await screen.findByText("BL.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Buscar en SharePoint"));       // 2ª búsqueda → 401
    expect(await screen.findByRole("dialog")).toBeInTheDocument();   // solicita nuevo login
    expect(screen.queryByText("BL.pdf")).not.toBeInTheDocument();    // sugerencias obsoletas borradas
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

describe("FriskuSharePointBuscador — vinculación manual a requisito COMEX", () => {
  const REQ = [
    { docId: "d1", tipo: "Packing List", tieneRef: false },
    { docId: "d2", tipo: "QC", tieneRef: true },   // ya tiene referencia → 2ª confirmación
  ];
  const SP_FRISKU = "https://grupomediterra.sharepoint.com/sites/FriskuFoodsSpA/Documentos%20compartidos/BL.pdf";
  const conResultado = (over = {}) => mkCliente({
    buscarCandidatos: jest.fn(async () => ({ ok: true, resultado: RES, porId: { IT1: { webUrl: SP_FRISKU, name: "BL.pdf" } } })),
    ...over,
  });
  const conPorId = (porId) => mkCliente({ buscarCandidatos: jest.fn(async () => ({ ok: true, resultado: RES, porId })) });
  const buscar = async () => { fireEvent.click(screen.getByText("Buscar en SharePoint")); await screen.findByText("BL.pdf"); };

  test("permisos: sin canEdit no se ofrece Vincular", async () => {
    render(<FriskuSharePointBuscador oe={OE} cliente={conResultado()} requisitos={REQ} onVincular={jest.fn()} canEdit={false} />);
    await buscar();
    expect(screen.queryByText("Vincular")).not.toBeInTheDocument();
  });

  test("candidato sin enlace válido: NO se ofrece Vincular (webUrl vacío)", async () => {
    render(<FriskuSharePointBuscador oe={OE} cliente={conPorId({ IT1: { webUrl: "", name: "BL.pdf" } })} requisitos={REQ} onVincular={jest.fn()} canEdit />);
    await buscar();
    expect(screen.queryByText("Vincular")).not.toBeInTheDocument();
  });

  test("candidato con dominio ajeno o http: NO se ofrece Vincular", async () => {
    render(<FriskuSharePointBuscador oe={OE} cliente={conPorId({ IT1: { webUrl: "https://evil.example/BL.pdf", name: "BL.pdf" } })} requisitos={REQ} onVincular={jest.fn()} canEdit />);
    await buscar();
    expect(screen.queryByText("Vincular")).not.toBeInTheDocument();
  });

  test("vínculo confirmado: elegir requisito → confirmar → onVincular(ref, docId)", async () => {
    const onVincular = jest.fn(() => ({ ok: true }));
    render(<FriskuSharePointBuscador oe={OE} cliente={conResultado()} requisitos={REQ} onVincular={onVincular} canEdit />);
    await buscar();
    fireEvent.click(screen.getByText("Vincular"));
    fireEvent.change(screen.getByLabelText("requisito COMEX"), { target: { value: "d1" } });
    fireEvent.click(screen.getByText("Continuar"));
    expect(onVincular).not.toHaveBeenCalled();                 // aún no: falta la confirmación
    fireEvent.click(screen.getByText("Confirmar vínculo"));
    expect(onVincular).toHaveBeenCalledWith(expect.objectContaining({ driveId: "D", itemId: "IT1", nombre: "BL.pdf", webUrl: SP_FRISKU }), "d1");
    expect(await screen.findByText(/Vinculado a Packing List/)).toBeInTheDocument();
  });

  test("cancelación: no guarda nada", async () => {
    const onVincular = jest.fn(() => ({ ok: true }));
    render(<FriskuSharePointBuscador oe={OE} cliente={conResultado()} requisitos={REQ} onVincular={onVincular} canEdit />);
    await buscar();
    fireEvent.click(screen.getByText("Vincular"));
    fireEvent.click(screen.getByText("Cancelar"));
    expect(onVincular).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("requisito COMEX")).not.toBeInTheDocument();
  });

  test("reemplazo: exige SEGUNDA confirmación antes de guardar", async () => {
    const onVincular = jest.fn(() => ({ ok: true }));
    render(<FriskuSharePointBuscador oe={OE} cliente={conResultado()} requisitos={REQ} onVincular={onVincular} canEdit />);
    await buscar();
    fireEvent.click(screen.getByText("Vincular"));
    fireEvent.change(screen.getByLabelText("requisito COMEX"), { target: { value: "d2" } });  // ya tiene ref
    fireEvent.click(screen.getByText("Continuar"));
    // paso extra de reemplazo: onVincular NO se llama todavía
    expect(screen.getByText(/ya tiene una referencia/)).toBeInTheDocument();
    expect(onVincular).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Sí, reemplazar"));
    expect(onVincular).not.toHaveBeenCalled();                 // aún falta la confirmación final
    fireEvent.click(screen.getByText("Confirmar vínculo"));
    expect(onVincular).toHaveBeenCalledWith(expect.objectContaining({ itemId: "IT1" }), "d2");
  });

  test("bloqueo por carga fallida: onVincular devuelve motivo 'carga' → aviso, sin éxito", async () => {
    const onVincular = jest.fn(() => ({ ok: false, motivo: "carga" }));
    render(<FriskuSharePointBuscador oe={OE} cliente={conResultado()} requisitos={REQ} onVincular={onVincular} canEdit />);
    await buscar();
    fireEvent.click(screen.getByText("Vincular"));
    fireEvent.change(screen.getByLabelText("requisito COMEX"), { target: { value: "d1" } });
    fireEvent.click(screen.getByText("Continuar"));
    fireEvent.click(screen.getByText("Confirmar vínculo"));
    expect(onVincular).toHaveBeenCalled();
    expect(await screen.findByText(/la carga del embarque no terminó/)).toBeInTheDocument();
  });
});

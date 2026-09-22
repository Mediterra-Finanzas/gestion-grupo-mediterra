/* eslint-disable */
// Test de componente (RTL) del input transitorio de reemplazo de referencia documental.
// Prueba la sincronización REAL del estado React: qué se aplica al modelo (onAplicar) y
// cuándo se descarta el borrador. Complementa las pruebas puras de decidirAplicacionRef.
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntradaRefManual } from "../FriskuComercialModule.jsx";

const PLACEHOLDER = "reemplazar: link http…";
const getInput = () => screen.getByPlaceholderText(PLACEHOLDER);
const type = (valor) => fireEvent.change(getInput(), { target: { value: valor } });

// Ruta legacy SharePoint con el username de Windows dentro (para el caso de no-exposición)
const RUTA_SP = "file:///C:/Users/carolina/INVERSIONES MEDITERRA SPA/Frisku Foods SpA - Documentos/FRUTA/BL.pdf";

describe("EntradaRefManual · sincronización de estado", () => {
  test("el borrador empieza vacío aunque exista una referencia legacy (no la revela)", () => {
    const { container } = render(<EntradaRefManual valorActual={RUTA_SP} documentKey="d1" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
    // el nombre de usuario de Windows nunca aparece en pantalla
    expect(container.textContent).not.toContain("carolina");
    expect(container.textContent).not.toContain("Users");
  });

  test("escribir 'C' no llama onAplicar", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type("C");
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("escribir 'C:\\' no llama onAplicar", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type("C:\\");
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("escribir una ruta SharePoint sincronizada completa no llama onAplicar (y avisa)", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type(RUTA_SP);
    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.getByText(/ruta sincronizada de SharePoint/i)).toBeInTheDocument();
  });

  test("escribir HTTP incompleto no llama onAplicar", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type("http:/");
    type("http://");
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("escribir una URL HTTPS válida llama una sola vez onAplicar con ese valor", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type("https://ejemplo.com/doc.pdf");
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith("https://ejemplo.com/doc.pdf");
  });

  test("progresivo hasta URL válida: solo el paso válido aplica, una vez", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    ["h", "ht", "http://", "https://x"].forEach(type);
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenLastCalledWith("https://x");
  });

  test("vaciar el input no elimina el valor existente (no llama onAplicar con '')", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    type("https://x/y.pdf");       // aplica una vez
    type("");                       // vaciar: NO debe aplicar
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).not.toHaveBeenCalledWith("");
  });

  test("un cambio externo de valorActual limpia el borrador y el aviso", () => {
    const { rerender } = render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={jest.fn()} />);
    type(RUTA_SP);
    expect(getInput()).toHaveValue(RUTA_SP);
    expect(screen.getByText(/ruta sincronizada de SharePoint/i)).toBeInTheDocument();
    // carga/limpieza/reemplazo externo cambia valorActual
    rerender(<EntradaRefManual valorActual="https://x/y.pdf" documentKey="d1" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
    expect(screen.queryByText(/ruta sincronizada de SharePoint/i)).not.toBeInTheDocument();
  });

  test("un cambio de documentKey (otra fila/documento) limpia el borrador", () => {
    const { rerender } = render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={jest.fn()} />);
    type("C:\\Users\\x\\algo");
    expect(getInput()).toHaveValue("C:\\Users\\x\\algo");
    rerender(<EntradaRefManual valorActual="" documentKey="d2" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
  });

  test("una carga exitosa (valorActual pasa a http) no deja visible el borrador anterior", () => {
    const { rerender } = render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={jest.fn()} />);
    type("C:\\parcial");
    expect(getInput()).toHaveValue("C:\\parcial");
    rerender(<EntradaRefManual valorActual="https://x/subido.pdf" documentKey="d1" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
  });
});

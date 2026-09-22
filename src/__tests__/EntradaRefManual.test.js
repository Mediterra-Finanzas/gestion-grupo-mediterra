/* eslint-disable */
// Test de componente (RTL) del input transitorio de reemplazo de referencia documental (S2.3).
// Prueba la sincronización REAL del estado React con ESCRITURA PROGRESIVA: teclear nunca aplica
// al modelo; la aplicación es una acción explícita (botón "Aplicar enlace" o Enter), una sola vez.
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { EntradaRefManual } from "../FriskuComercialModule.jsx";

const PLACEHOLDER = "reemplazar: link http…";
const getInput = () => screen.getByPlaceholderText(PLACEHOLDER);
const getBoton = () => screen.getByRole("button", { name: /Aplicar enlace/i });
// Escritura carácter por carácter, disparando onChange en cada paso (escritura progresiva real).
const typeProgresivo = (texto) => {
  const input = getInput();
  for (let i = 1; i <= texto.length; i++) {
    fireEvent.change(input, { target: { value: texto.slice(0, i) } });
  }
};
const setValor = (v) => fireEvent.change(getInput(), { target: { value: v } });
const enter = () => fireEvent.keyDown(getInput(), { key: "Enter" });

const RUTA_SP = "file:///C:/Users/carolina/INVERSIONES MEDITERRA SPA/Frisku Foods SpA - Documentos/FRUTA/BL.pdf";
const URL_OK = "https://sharepoint.example/documento.pdf";

describe("EntradaRefManual · aplicación EXPLÍCITA (S2.3)", () => {
  test("escribir la URL carácter por carácter NO llama onAplicar durante la escritura", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    typeProgresivo(URL_OK);
    expect(onAplicar).not.toHaveBeenCalled();          // ni un solo paso intermedio aplica
    expect(getInput()).toHaveValue(URL_OK);            // el texto queda solo en el borrador
  });

  test("tras escribir, 'Aplicar enlace' llama onAplicar exactamente una vez con la URL completa", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    typeProgresivo(URL_OK);
    expect(getBoton()).toBeEnabled();
    fireEvent.click(getBoton());
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith(URL_OK);
    // tras aplicar, el borrador se limpia y el botón vuelve a deshabilitarse
    expect(getInput()).toHaveValue("");
    expect(getBoton()).toBeDisabled();
  });

  test("Enter con URL válida llama onAplicar exactamente una vez", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor(URL_OK);
    enter();
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith(URL_OK);
  });

  test("Enter y luego el botón NO duplican la aplicación (borrador ya limpiado)", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor(URL_OK);
    enter();                       // aplica una vez, limpia el borrador
    fireEvent.click(getBoton());   // botón deshabilitado → no hace nada
    expect(onAplicar).toHaveBeenCalledTimes(1);
  });

  test("'http://' no es válido: botón deshabilitado y Enter no aplica", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor("http://");
    expect(getBoton()).toBeDisabled();
    enter();
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("'https://' no es válido: botón deshabilitado y Enter no aplica", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor("https://");
    expect(getBoton()).toBeDisabled();
    enter();
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("'https://a': válido pero SOLO se aplica por acción explícita, nunca al escribir", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    typeProgresivo("https://a");
    expect(onAplicar).not.toHaveBeenCalled();   // escribir no aplica
    expect(getBoton()).toBeEnabled();           // pero es aplicable
    fireEvent.click(getBoton());
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith("https://a");
  });

  test("URL con espacios no se aplica", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor("https://ejemplo.com/a b.pdf");
    expect(getBoton()).toBeDisabled();
    enter();
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("URL con credenciales incrustadas no se aplica", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor("https://user:pass@ejemplo.com/x.pdf");
    expect(getBoton()).toBeDisabled();
    enter();
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("C / C:\\ / file:// / ruta SharePoint sincronizada no aplican (y muestran aviso seguro)", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    for (const v of ["C", "C:\\", "file:///D:/x.pdf"]) {
      setValor(v);
      expect(getBoton()).toBeDisabled();
      enter();
    }
    setValor(RUTA_SP);
    expect(getBoton()).toBeDisabled();
    enter();
    expect(onAplicar).not.toHaveBeenCalled();
    expect(screen.getByText(/ruta sincronizada de SharePoint/i)).toBeInTheDocument();
  });

  test("el borrador no revela el username de Windows aunque valorActual sea una ruta legacy", () => {
    const { container } = render(<EntradaRefManual valorActual={RUTA_SP} documentKey="d1" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
    expect(container.textContent).not.toContain("carolina");
    expect(container.textContent).not.toContain("Users");
  });

  test("vaciar el input no borra la referencia existente (no llama onAplicar con '')", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    setValor("https://x/y.pdf");
    setValor("");                 // vaciar: no aplica nada
    enter();                       // Enter con borrador vacío: no aplica
    expect(onAplicar).not.toHaveBeenCalled();
  });

  test("cambio externo de valorActual limpia el borrador y el aviso", () => {
    const { rerender } = render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={jest.fn()} />);
    setValor(RUTA_SP);
    expect(getInput()).toHaveValue(RUTA_SP);
    expect(screen.getByText(/ruta sincronizada de SharePoint/i)).toBeInTheDocument();
    rerender(<EntradaRefManual valorActual="https://x/y.pdf" documentKey="d1" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
    expect(screen.queryByText(/ruta sincronizada de SharePoint/i)).not.toBeInTheDocument();
  });

  test("cambio de documentKey (otra fila/documento) limpia el borrador", () => {
    const { rerender } = render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={jest.fn()} />);
    setValor("C:\\Users\\x\\algo");
    expect(getInput()).toHaveValue("C:\\Users\\x\\algo");
    rerender(<EntradaRefManual valorActual="" documentKey="d2" onAplicar={jest.fn()} />);
    expect(getInput()).toHaveValue("");
  });

  test("ninguna escritura progresiva aplica, aunque el texto intermedio ya tenga forma de URL válida", () => {
    const onAplicar = jest.fn();
    render(<EntradaRefManual valorActual="" documentKey="d1" onAplicar={onAplicar} />);
    // 'https://x' ya es válido a mitad de camino; seguir tecleando no debe aplicar en ningún paso
    typeProgresivo("https://x.ejemplo.com/carpeta/documento-final.pdf");
    expect(onAplicar).not.toHaveBeenCalled();
  });
});

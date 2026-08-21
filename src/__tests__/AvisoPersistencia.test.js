/* eslint-disable */
// Render del aviso de persistencia. Cierra el hueco que quedó al entregarlo:
// la lógica que lo alimenta estaba probada, pero que se viera no.
// Lo que importa aquí es que la persona entienda qué pasó y qué tiene que hacer.

import React from "react";
// El proyecto no tiene src/setupTests.js, así que los matchers de jest-dom no se cargan
// solos. Se importan acá y no en un setup global para no alterar el resto de la suite.
import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import AvisoPersistencia, { construirAviso } from "../AvisoPersistencia";

describe("construirAviso · traduce el resultado del guardado", () => {
  test("guardado normal no genera aviso", () => {
    expect(construirAviso("frisku_embarques", { ok: true }, "Embarques")).toBeNull();
  });

  test("fusión: informa que no se perdió nada", () => {
    const a = construirAviso("frisku_embarques", { ok: true, fusionado: true }, "Embarques");
    expect(a.tipo).toBe("fusion");
    expect(a.texto).toContain("Embarques");
    expect(a.texto).toContain("no se perdió nada");
  });

  test("conflicto por ítem: dice que NO se guardó y qué hacer", () => {
    const a = construirAviso("frisku_embarques", { ok: false, motivo: "conflicto_item", conflictos: ["12"] }, "Embarques");
    expect(a.tipo).toBe("conflicto");
    expect(a.texto).toContain("No se guardó");
    expect(a.texto).toContain("el mismo registro");
    expect(a.texto).toContain("recarga la página");
    expect(a.conflictos).toEqual(["12"]);
  });

  test("varios ítems en conflicto usan el plural", () => {
    const a = construirAviso("x", { ok: false, motivo: "conflicto_item", conflictos: ["1", "2"] }, "Embarques");
    expect(a.texto).toContain("los mismos registros");
  });

  test("conflicto no fusionable (maestro_tc, rendiciones_config)", () => {
    const a = construirAviso("maestro_tc", { ok: false, motivo: "conflicto" }, "Tipo de cambio");
    expect(a.tipo).toBe("conflicto");
    expect(a.texto).toContain("no se puede combinar automáticamente");
  });

  test("error HTTP muestra el código y pide no cerrar la pestaña", () => {
    const a = construirAviso("x", { ok: false, motivo: "http", status: 503 }, "Clientes");
    expect(a.tipo).toBe("error");
    expect(a.texto).toContain("(error 503)");
    expect(a.texto).toContain("no cierres esta pestaña");
  });

  test("error de red sin código", () => {
    const a = construirAviso("x", { ok: false, motivo: "red" }, "Clientes");
    expect(a.tipo).toBe("error");
    expect(a.texto).not.toContain("(error");
  });

  test("sin etiqueta cae al id de la fila, nunca queda vacío", () => {
    expect(construirAviso("frisku_po", { ok: false, motivo: "red" }).texto).toContain("frisku_po");
  });
});

describe("AvisoPersistencia · render", () => {
  test("sin aviso no dibuja nada", () => {
    const { container } = render(<AvisoPersistencia aviso={null} onCerrar={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("fusión: título verde, sin botón de recargar", () => {
    render(<AvisoPersistencia aviso={{ tipo: "fusion", texto: "se combinaron" }} onCerrar={() => {}} />);
    expect(screen.getByText("Se combinaron los cambios")).toBeInTheDocument();
    expect(screen.getByText("se combinaron")).toBeInTheDocument();
    // no tiene sentido recargar: no hay nada que rehacer
    expect(screen.queryByText("Recargar página")).not.toBeInTheDocument();
    expect(screen.getByText("Entendido")).toBeInTheDocument();
  });

  test("conflicto: título rojo y botón de recargar", () => {
    render(<AvisoPersistencia aviso={{ tipo: "conflicto", texto: "no se guardó" }} onCerrar={() => {}} />);
    expect(screen.getByText("No se guardó · conflicto")).toBeInTheDocument();
    expect(screen.getByText("Recargar página")).toBeInTheDocument();
  });

  test("error: título y botón de recargar", () => {
    render(<AvisoPersistencia aviso={{ tipo: "error", texto: "falló" }} onCerrar={() => {}} />);
    expect(screen.getByText("No se guardó")).toBeInTheDocument();
    expect(screen.getByText("Recargar página")).toBeInTheDocument();
  });

  test("'Entendido' cierra el aviso", () => {
    const onCerrar = jest.fn();
    render(<AvisoPersistencia aviso={{ tipo: "error", texto: "falló" }} onCerrar={onCerrar} />);
    fireEvent.click(screen.getByText("Entendido"));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  test("es anunciable por lectores de pantalla", () => {
    render(<AvisoPersistencia aviso={{ tipo: "error", texto: "falló" }} onCerrar={() => {}} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  test("el texto del aviso llega íntegro a la pantalla", () => {
    const a = construirAviso("frisku_embarques", { ok: false, motivo: "conflicto_item", conflictos: ["7"] }, "Embarques");
    render(<AvisoPersistencia aviso={a} onCerrar={() => {}} />);
    expect(screen.getByText(a.texto)).toBeInTheDocument();
  });
});

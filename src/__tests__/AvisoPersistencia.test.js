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
import { construirAvisoDesde } from "../persistencia/persistContract.js";

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

  test("duplicado_oe: mensaje específico y accionable, sin IDs ni montos", () => {
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "duplicado_oe", idExistente: "mu48fmjus69jpj", oeId: "msx7tr5hzybym3" }, "Liquidaciones");
    expect(a.tipo).toBe("error");
    expect(a.texto).toBe("Ya existe otra liquidación activa para esta Orden de Embarque. Revisa la liquidación existente antes de crear una nueva.");
    // no filtra IDs internos que vengan en el resultado, ni montos
    expect(a.texto).not.toContain("mu48fmjus69jpj");
    expect(a.texto).not.toContain("msx7tr5hzybym3");
    expect(a.texto).not.toMatch(/\$|US\$|\d{3,}/);
  });

  test("duplicado_oe NO usa el mensaje genérico ni un código de error", () => {
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "duplicado_oe" }, "Liquidaciones");
    expect(a.texto).not.toContain("No se pudo guardar");
    expect(a.texto).not.toMatch(/\(error/);
  });

  test("error HTTP conserva su mensaje/código (no lo pisa el caso duplicado)", () => {
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "http", status: 400 }, "Liquidaciones");
    expect(a.tipo).toBe("error");
    expect(a.texto).toContain("(error 400)");
    expect(a.texto).toContain("no cierres esta pestaña");
    expect(a.texto).not.toContain("Orden de Embarque");
  });

  test("error desconocido mantiene el mensaje genérico", () => {
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "algo_raro_no_mapeado" }, "Liquidaciones");
    expect(a.tipo).toBe("error");
    expect(a.texto).toContain("No se pudo guardar Liquidaciones");
    expect(a.texto).toContain("Tus cambios siguen en pantalla");
    expect(a.texto).not.toContain("Orden de Embarque");
  });

  test("el rechazo duplicado_oe se surfacea (ok:false → aviso de error, no se trata como guardado)", () => {
    // Un rechazo NUNCA devuelve null (que sería "guardado, nada que avisar"): así la UI muestra el
    // aviso y NO limpia lo que la persona tiene en pantalla.
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "duplicado_oe" }, "Liquidaciones");
    expect(a).not.toBeNull();
    expect(a.tipo).toBe("error");
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

  // ── Conflicto PENDIENTE: la fila quedó bloqueada a propósito ──────────────
  // Recargar la página descartaría el trabajo local sin decirlo, y es justo una
  // de las dos salidas explícitas. Así que acá no se ofrece ni se insinúa.
  describe("conflicto pendiente", () => {
    const { MOTIVOS } = require("../persistencia/persistContract.js");
    test("el texto NO dice recargar la página, y sí que hay que elegir", () => {
      const a = construirAvisoDesde("main", { ok: false, motivo: MOTIVOS.CONFLICTO_PENDIENTE }, "las Tareas");
      expect(a.conflictoPendiente).toBe(true);
      expect(a.texto).not.toMatch(/recarg/i);
      expect(a.texto).toMatch(/Tenés que elegir/);
      expect(a.texto).toMatch(/NO se están guardando/);
    });

    test("el PRIMER conflicto de una fila-blob se trata igual que el reintento", () => {
      // El primer choque llega con motivo CONFLICTO y `conflictoPendiente` en
      // true. Antes caía en la rama que decía "recarga la página", que con la
      // fila bloqueada es falso y hace perder lo local.
      const a = construirAvisoDesde("main", { ok: false, motivo: MOTIVOS.CONFLICTO, conflictoPendiente: true }, "las Tareas");
      expect(a.conflictoPendiente).toBe(true);
      expect(a.texto).not.toMatch(/recarg/i);
      expect(a.texto).toMatch(/Tenés que elegir/);
    });

    test("un conflicto que NO deja la fila bloqueada sí puede pedir recargar", () => {
      const a = construirAvisoDesde("main", { ok: false, motivo: MOTIVOS.CONFLICTO }, "las Tareas");
      expect(a.conflictoPendiente).toBeFalsy();
      expect(a.texto).toMatch(/recarga la página/);
    });

    test("en pantalla NO aparece el botón de recargar", () => {
      const a = construirAvisoDesde("main", { ok: false, motivo: MOTIVOS.CONFLICTO_PENDIENTE }, "las Tareas");
      render(<AvisoPersistencia aviso={a} onCerrar={() => {}} />);
      expect(screen.queryByRole("button", { name: /Recargar página/i })).toBeNull();
      expect(screen.getByRole("button", { name: /Entendido/i })).toBeInTheDocument();
    });

    test("pero sí aparece en un error de red, donde recargar no pierde nada decidido", () => {
      const a = construirAvisoDesde("main", { ok: false, motivo: MOTIVOS.RED }, "las Tareas");
      render(<AvisoPersistencia aviso={a} onCerrar={() => {}} />);
      expect(screen.getByRole("button", { name: /Recargar página/i })).toBeInTheDocument();
    });
  });

  test("duplicado_oe: el mensaje específico se ve en pantalla", () => {
    const a = construirAviso("frisku_liquidaciones", { ok: false, motivo: "duplicado_oe" }, "Liquidaciones");
    render(<AvisoPersistencia aviso={a} onCerrar={() => {}} />);
    expect(screen.getByText(/Ya existe otra liquidación activa para esta Orden de Embarque/)).toBeInTheDocument();
    expect(screen.getByText("No se guardó")).toBeInTheDocument();
  });
});

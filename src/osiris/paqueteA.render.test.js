/* eslint-disable */
// Paquete A — render del JSX nuevo.
//
// Por qué existe: `OsirisModule.jsx` empieza con `/* eslint-disable */`, así
// que el build NO detecta una variable inexistente dentro del JSX. Un
// identificador mal escrito compila y revienta recién en pantalla. Esta
// prueba monta el componente de verdad para que eso no pase inadvertido.
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
// Local a este archivo: el repo no tiene src/setupTests.js y no corresponde
// crearlo dentro del alcance del paquete A.
import "@testing-library/jest-dom";
import { GraficosPlantas, añoPedido } from "../OsirisModule.jsx";

// Dos universos con una diferencia conocida, armados a mano.
const tpData = [
  { id: "tp1", ctId: "c1", cliente: "Cliente Uno", pais: "Chile", nPlantas: 1000, hectareas: 10, fechaPlantacion: "2024-01-01" },
  { id: "tp2", ctId: "c1", cliente: "Cliente Uno", pais: "Chile", nPlantas: 500, hectareas: 5, fechaPlantacion: "2025-06-15" },
  { id: "tp3", ctId: "c2", cliente: "Cliente Dos", pais: "Peru", nPlantas: 2000, hectareas: 20, fechaPlantacion: "2026-02-09" },
  { id: "tp4", ctId: "c3", cliente: "Cuadrado", pais: "Peru", nPlantas: 777, hectareas: 7, fechaPlantacion: "" },
];
const rpData = [
  { id: "rp1", ctId: "c1", cliente: "Cliente Uno", nPlantas: 1600, pagado: true },
  { id: "rp2", ctId: "c2", cliente: "Cliente Dos", nPlantas: 1800, pagado: false },
  { id: "rp3", ctId: "c3", cliente: "Cuadrado", nPlantas: 777, pagado: false },
  { id: "rp4", ctId: "c4", cliente: "Sólo OC", nPlantas: 400, pagado: false, _fromOC: true },
];
// universo A = 4.277 · universo B = 4.577 · diferencia +300

describe("A2 · render de la pantalla de Plantas", () => {
  test("monta sin errores: ninguna variable del JSX nuevo queda sin definir", () => {
    const errores = [];
    const orig = console.error;
    console.error = (...a) => {
      const msg = a.join(" ");
      // ruido de la propia @testing-library con React 18, ajeno al componente
      if (/ReactDOMTestUtils\.act|not wrapped in act/.test(msg)) return;
      errores.push(msg);
    };
    try {
      const { container } = render(<GraficosPlantas tpData={tpData} rpData={rpData} />);
      expect(container.querySelectorAll("div").length).toBeGreaterThan(5);
    } finally {
      console.error = orig;
    }
    expect(errores).toEqual([]);
  });

  test("los rótulos dicen de qué universo sale cada cifra", () => {
    render(<GraficosPlantas tpData={tpData} rpData={rpData} />);
    expect(screen.getByText("Plantas registradas")).toBeInTheDocument();
    expect(screen.getByText("Facturado y marcado pagado")).toBeInTheDocument();
    expect(screen.getByText("Facturable no marcado pagado")).toBeInTheDocument();
    // y el rótulo viejo, que presentaba un universo como si fueran tres partes
    // del mismo total, ya no está
    expect(screen.queryByText("Total Plantas Vendidas")).toBeNull();
    expect(screen.queryByText("Con Royalty Pagado")).toBeNull();
    expect(screen.queryByText("Royalty Pendiente")).toBeNull();
  });

  test("muestra la diferencia entre los dos recuentos en vez de esconderla", () => {
    render(<GraficosPlantas tpData={tpData} rpData={rpData} />);
    expect(screen.getByText(/Los dos recuentos no miden lo mismo/)).toBeInTheDocument();
    expect(screen.getByText("+300")).toBeInTheDocument();
    expect(screen.getByText("4.277")).toBeInTheDocument();
    expect(screen.getByText("4.577")).toBeInTheDocument();
    expect(screen.getByText(/No se resta de ningún total/)).toBeInTheDocument();
  });

  test("el detalle por contrato se despliega y trae todas las filas", () => {
    render(<GraficosPlantas tpData={tpData} rpData={rpData} />);
    expect(screen.queryByText("Origen de B")).toBeNull();
    fireEvent.click(screen.getByText("Ver detalle por contrato"));
    expect(screen.getByText("Origen de B")).toBeInTheDocument();
    // las 4 filas de contrato, incluida la de diferencia cero. Se busca dentro
    // de la tabla del detalle, porque el nombre del cliente aparece además en
    // el gráfico de clientes de más arriba.
    const tabla = screen.getByText("Origen de B").closest("table");
    const nombres = [...tabla.querySelectorAll("tbody tr td:first-child")].map((td) => td.textContent);
    expect(nombres).toEqual(expect.arrayContaining(["Cliente Uno", "Cliente Dos", "Cuadrado", "Sólo OC", "TOTAL"]));
    expect(nombres).toHaveLength(5);   // 4 contratos + la fila de total
    // la fila de diferencia cero está, con un guión en vez de un número
    const filaCuadrada = [...tabla.querySelectorAll("tbody tr")].find((tr) => tr.textContent.startsWith("Cuadrado"));
    expect(filaCuadrada.textContent).toContain("—");
    expect(screen.getByText(/la suma de las filas cuadra con el total/)).toBeInTheDocument();
    // y el aviso de los contratos que facturan sin plantación registrada
    expect(screen.getByText(/facturan por orden de compra sin ninguna plantación registrada/)).toBeInTheDocument();
  });

  test("A1 · el año que se imputa en el gráfico es el del texto de la fecha", () => {
    render(<GraficosPlantas tpData={tpData} rpData={rpData} />);
    // tp1 tiene fechaPlantacion 2024-01-01: debe caer en 2024, no en 2023
    expect(añoPedido(tpData[0])).toBe(2024);
    expect(screen.getAllByText("2024").length).toBeGreaterThan(0);
    expect(screen.queryByText("2023")).toBeNull();
    // la fila sin fecha queda en "?" y no inventa un año
    expect(añoPedido(tpData[3])).toBeNull();
    expect(screen.getAllByText("?").length).toBeGreaterThan(0);
  });

  test("si los dos recuentos coinciden, no se muestra ningún aviso de diferencia", () => {
    const tp = [{ id: "a", ctId: "c1", cliente: "Igual", nPlantas: 100, fechaPlantacion: "2025-01-02" }];
    const rp = [{ id: "b", ctId: "c1", cliente: "Igual", nPlantas: 100, pagado: false }];
    render(<GraficosPlantas tpData={tp} rpData={rp} />);
    expect(screen.queryByText(/Los dos recuentos no miden lo mismo/)).toBeNull();
  });

  test("declara las filas que la conciliación deja fuera por no tener contrato", () => {
    // Una fila sin ctId no cae en ningún contrato, pero el indicador de arriba
    // sí la cuenta. Antes desaparecía en silencio.
    const tp = [...tpData, { id: "huerfana", nPlantas: 9999, cliente: "Sin contrato" }];
    render(<GraficosPlantas tpData={tp} rpData={rpData} />);
    fireEvent.click(screen.getByText("Ver detalle por contrato"));
    expect(screen.getByText(/Fuera de esta conciliación por no estar ligadas a un contrato/)).toBeInTheDocument();
    expect(screen.getByText(/9\.999 plantas/)).toBeInTheDocument();
    // el denominador del aviso es 4 (las conciliadas), no 5
    expect(screen.getByText(/en 4 plantaciones/)).toBeInTheDocument();
    // y el control no se declara cuadrado por una identidad algebraica
    expect(screen.queryByText(/no reconstruye el total de los indicadores/)).toBeNull();
  });

  test("no revienta con las listas vacías", () => {
    const { container } = render(<GraficosPlantas tpData={[]} rpData={[]} />);
    expect(container).toBeTruthy();
  });
});

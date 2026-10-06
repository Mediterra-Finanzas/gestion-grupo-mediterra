/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// LO QUE UNA CUOTA MUESTRA EN PANTALLA (caso TUNGSHING)
//
// Acordado: una cuota conserva visibles las CUATRO cosas a la vez
//   1. la fecha contractual,
//   2. la condición de vencida,
//   3. la fecha estimada de caja, si existe,
//   4. el motivo de la estimación.
//
// El caso que lo exige: TUNGSHING, contractual 29/09/2026 (Sep-26, ya
// vencido con el corte en Oct-26), con la caja estimada en un mes
// futuro. Una estimación futura NO puede hacer desaparecer el
// vencimiento: el compromiso sigue vencido.
//
// Se renderiza el panel REAL (ProgramasPanel → Columna → Tarjeta →
// Cuota), no una copia del render ni el helper del modelo.
// ═══════════════════════════════════════════════════════════════════
import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import ProgramasPanel from "../ProgramasComerciales.jsx";
import { MESES } from "../horizonte.js";

// Paleta: cualquier clave devuelve un color válido. La prueba es de
// contenido, no de estilo.
const C = new Proxy({}, { get: () => "#808080" });
const $$ = (v) => new Intl.NumberFormat("es-CL").format(Math.round(Number(v) || 0));

const CONTRACTUAL = "2026-09-29";   // fecha pactada, ya pasada
const MES_CONTRACTUAL = "Sep-26";
const MES_ESTIMADO = "Feb-27";      // caja estimada a futuro
const MOTIVO = "el cliente pidió reprogramar la remesa al cierre de temporada";

const tungshing = {
  id: "p-tung", lado: "cliente", contraparte: "TUNGSHING", kilos: 100000,
  precio_usd_kg: 3, cuotas: [{
    id: "q1", fecha_prevista: CONTRACTUAL, mes: MES_CONTRACTUAL,
    modalidad: "monto", monto: 138000, estado: "vigente",
    estimacion_caja: { mes: MES_ESTIMADO, motivo: MOTIVO, usuario: "angelo", ts: "2026-10-06T12:00:00Z" },
    realizaciones: [],
  }],
};

const pintar = (readOnly) => render(
  <ProgramasPanel programas={[tungshing]} meses={MESES} kgFruta={100000}
    readOnly={readOnly} usuario="angelo" C={C} $$={$$} />
);

describe("cuota vencida con caja estimada · lo que ve el usuario", () => {
  for (const readOnly of [false, true]) {
    const modo = readOnly ? "solo lectura (preview compartida)" : "edición";

    describe(modo, () => {
      beforeEach(() => pintar(readOnly));

      test("la fecha contractual sigue visible", () => {
        // En edición es el campo de fecha; en ambos modos va en el texto del aviso.
        expect(screen.getByText(/fecha contractual/i)).toBeInTheDocument();
        const cuerpo = document.body.textContent;
        expect(cuerpo).toContain(CONTRACTUAL);
      });

      test("la cuota se muestra VENCIDA aunque la caja se estime a futuro", () => {
        expect(screen.getByText(new RegExp(`vencida\\s+${MES_CONTRACTUAL}`, "i"))).toBeInTheDocument();
        // Y lo dice explícitamente, no solo por el chip:
        expect(document.body.textContent).toMatch(/Compromiso vencido/i);
        expect(document.body.textContent)
          .toMatch(/Sigue vencido aunque la caja se proyecte en Feb-27/i);
      });

      test("la fecha estimada de caja se muestra, distinta de la contractual", () => {
        expect(screen.getByText(new RegExp(`caja estimada\\s+${MES_ESTIMADO}`, "i"))).toBeInTheDocument();
        const cuerpo = document.body.textContent;
        expect(cuerpo).toContain(MES_ESTIMADO);
        expect(cuerpo).toContain(MES_CONTRACTUAL);   // las DOS, no una en vez de la otra
      });

      test("el motivo de la estimación se muestra, con su usuario y fecha", () => {
        expect(document.body.textContent).toContain(MOTIVO);
        expect(document.body.textContent).toMatch(/angelo/);
        expect(document.body.textContent).toMatch(/2026-10-06/);
      });
    });
  }

  test("sin estimación de caja, la cuota vencida igual se declara vencida", () => {
    const sinEst = { ...tungshing, cuotas: [{ ...tungshing.cuotas[0], estimacion_caja: null }] };
    render(<ProgramasPanel programas={[sinEst]} meses={MESES} kgFruta={100000}
      readOnly={true} usuario="angelo" C={C} $$={$$} />);
    expect(screen.getByText(new RegExp(`vencida\\s+${MES_CONTRACTUAL}`, "i"))).toBeInTheDocument();
    expect(document.body.textContent).toMatch(/no reprogramado/i);
    expect(document.body.textContent).not.toMatch(/caja estimada/i);
  });

  test("una cuota con fecha futura NO se declara vencida", () => {
    const futura = {
      ...tungshing,
      cuotas: [{ ...tungshing.cuotas[0], fecha_prevista: "2027-02-15", mes: MES_ESTIMADO, estimacion_caja: null }],
    };
    render(<ProgramasPanel programas={[futura]} meses={MESES} kgFruta={100000}
      readOnly={true} usuario="angelo" C={C} $$={$$} />);
    expect(document.body.textContent).not.toMatch(/vencida/i);
    expect(document.body.textContent).not.toMatch(/Compromiso vencido/i);
  });
});

/* eslint-disable */
// Dashboard y Consolidado muestran la caja del grupo con la MISMA definición:
// 6 sociedades línea a línea (Allpa por VPP, fuera), saldo inicial = Saldos
// Bancos, arrastre desde el mes en curso. Antes el Dashboard sumaba las 8
// sociedades al 100% desde Apr-26 y daba otra cifra con el mismo rótulo.
import React from "react";
import { render } from "@testing-library/react";
import { buildEmpresas, buildEmpresasConOverrides, Dashboard, Consolidado, cajaGrupoBase } from "../FinanzasModule.jsx";

const num = (t) => { const m = /(-?)\$([\d,]+)/.exec(t); return m ? (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, "")) : null; };
const kpi = (texto, re) => { const m = re.exec(texto); return m ? num(m[1]) : null; };

const empresas = buildEmpresas({}, { cobros: [] });
const CASOS = [
  ["sin saldos bancarios", {}, {}],
  ["con saldos bancarios en varias sociedades", {
    "Allegria Foods||BICE||usd": { monto: 17433, fecha: "2026-09-15", moneda: "usd" },
    "Mediterra||Santander||usd": { monto: 250000, fecha: "2026-10-01", moneda: "usd" },
    "Allpa Farms||BCI||usd": { monto: 999999, fecha: "2026-10-01", moneda: "usd" },   // JV: no entra al consolidado
  }, {}],
  ["con un override manual", { "Osiris||BICE||usd": { monto: 40000, fecha: "2026-10-02", moneda: "usd" } },
    { Osiris: { _proyOverrides: { "ing_op::Cuentas por Cobrar": { 8: 123456 } } } }],
];

describe.each(CASOS)("%s", (_, saldos, real) => {
  beforeEach(() => { jest.useFakeTimers("modern"); jest.setSystemTime(new Date(2026, 9, 6, 12)); });
  afterEach(() => jest.useRealTimers());

  test("el Dashboard muestra las mismas cifras que el Consolidado", () => {
    const eco = buildEmpresasConOverrides(empresas, real, {}, {});
    const d = render(<Dashboard empresas={empresas} empresasConOverrides={eco} saldosBancos={saldos} />);
    const tD = d.container.textContent; d.unmount();
    const c = render(<Consolidado empresas={empresas} saldosBancos={saldos} realData={real} />);
    const tC = c.container.textContent; c.unmount();

    const ini = /Saldo inicial consolidado · Oct-26(-?\$[\d,]+)/, min = /Mínimo acumulado consolidado \(\w{3}-\d{2}\)(-?\$[\d,]+)/, fin = /Saldo final consolidado Jun-31(-?\$[\d,]+)/;
    [ini, min, fin].forEach(re => {
      expect(kpi(tD, re)).not.toBeNull();
      expect(kpi(tD, re)).toBe(kpi(tC, re));
    });
    // saldo inicial + flujo desde el mes en curso = saldo final (Consolidado)
    const flujo = kpi(tC, /Flujo neto Oct-26–Jun-31(-?\$[\d,]+)/);
    expect(Math.abs(kpi(tC, ini) + flujo - kpi(tC, fin))).toBeLessThanOrEqual(2);   // 3 cifras redondeadas a US$1
    // el perímetro está escrito en las dos pantallas
    expect(tD).toMatch(/Allpa Chile y Perú por método patrimonio \(fuera\)/);
    expect(tC).toMatch(/Allpa Chile y Perú por método patrimonio \(fuera\)/);
  });

  test("cajaGrupoBase: identidad y perímetro", () => {
    const eco = buildEmpresasConOverrides(empresas, real, {}, {});
    const r = cajaGrupoBase(eco, empresas, saldos, 6);   // Oct-26
    expect(r.nombres).not.toContain("Allpa Farms");
    expect(r.nombres).not.toContain("Allpa Farms Perú");
    expect(r.nombres).toHaveLength(6);
    expect(r.acum.slice(0, 6).every(v => v === null)).toBe(true);
    expect(Math.abs(r.saldoIni + r.flujoDesdeHoy - r.final)).toBeLessThan(1e-6);
  });
});

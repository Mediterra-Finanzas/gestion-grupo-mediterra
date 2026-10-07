/* eslint-disable */
import { MAPA_SEMANAS, planMigracionSemanas, aplicarMigracionSemanas, revertirMigracionSemanas, totalRealMes } from "../calendario/migracionSemanas.js";
import { diagnostico } from "../../scripts/calendario/diagnostico.mjs";

const REAL = {
  Mediterra: {
    "Jun-26": { S22: { "Fee Administración": 1000 }, S23: { "Gastos Varios": 250 }, S25: { "Leyes Sociales": 7210 } },
    "Oct-26": { S41: { "Fee Administración": 99 } },                 // mes sin desfase: no se toca
    _proyOverrides: { "ing_op::Fee Administración": { 5: 1 } },     // otra info: no se toca
  },
  "Allegria Foods": { "Jun-27": { S21: { "Venta": 5000 }, S24: { "Flete": 300 } } },
};

test("el mapa coincide con el diagnóstico (11 meses desfasados)", () => {
  const d = diagnostico().filter(x => x.desfasado);
  expect(d).toHaveLength(11);
  d.forEach(x => expect(MAPA_SEMANAS[x.mes]).toEqual(x.mapa));
});

test("plan: movimientos por posición, sin conflictos en datos normales", () => {
  const p = planMigracionSemanas(REAL);
  expect(p.movimientos.map(m => `${m.mes}:${m.de}→${m.a}`).sort()).toEqual(["Jun-26:S22→S23", "Jun-26:S23→S24", "Jun-26:S25→S26", "Jun-27:S21→S23", "Jun-27:S24→S26"].sort());
  expect(p.conflictos).toEqual([]);
});

test("aplicar preserva importes por mes, no duplica y se puede revertir", () => {
  const { realData: m, registro } = aplicarMigracionSemanas(REAL, MAPA_SEMANAS, { usuario: "prueba", ahora: new Date("2026-10-07T12:00:00Z") });
  expect(m.Mediterra["Jun-26"]).toEqual({ S23: { "Fee Administración": 1000 }, S24: { "Gastos Varios": 250 }, S26: { "Leyes Sociales": 7210 } });
  ["Jun-26", "Oct-26"].forEach(mes => expect(totalRealMes(m, "Mediterra", mes)).toBe(totalRealMes(REAL, "Mediterra", mes)));
  expect(totalRealMes(m, "Allegria Foods", "Jun-27")).toBe(5300);
  expect(m.Mediterra._proyOverrides).toEqual(REAL.Mediterra._proyOverrides);
  expect(revertirMigracionSemanas(m, registro)).toEqual(REAL);
  expect(REAL.Mediterra["Jun-26"].S22).toBeDefined();               // el original no se modifica
});

test("clave fuera del mapa o destino ocupado: se informa y no se aplica a ciegas", () => {
  const raro = { X: { "Jun-26": { "S-única": { a: 1 }, S22: { b: 2 } } } };
  expect(planMigracionSemanas(raro).conflictos).toEqual([{ empresa: "X", mes: "Jun-26", de: "S-única", a: null, motivo: "clave fuera del mapa: se deja igual" }]);
  const choque = { X: { "Jun-27": { S21: { a: 1 }, S25: { b: 2 } } } };      // S25 no está en la tabla de Jun-27 (S21..S24)
  expect(planMigracionSemanas(choque).conflictos.some(c => c.motivo.startsWith("destino ocupado") || c.motivo.startsWith("clave fuera"))).toBe(true);
});

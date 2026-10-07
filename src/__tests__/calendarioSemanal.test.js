/* eslint-disable */
// Calendario semanal de TODO el horizonte (Apr-26 → Jun-31).
import { SEMANAS_MES, posicionSemana } from "../FinanzasModule.jsx";
import { MESES } from "../horizonte.js";

test("los 63 meses tienen 4 semanas", () => {
  MESES.forEach(m => expect(SEMANAS_MES[m]).toHaveLength(4));
});

test("la tabla original Apr-26..Dec-27 no cambia (sus etiquetas son claves de datos guardados)", () => {
  expect(SEMANAS_MES["Jun-26"]).toEqual(["S22", "S23", "S24", "S25"]);
  expect(SEMANAS_MES["Dec-27"]).toEqual(["S48", "S49", "S50", "S51"]);
});

test("meses generados: semana del día 1 + 3 siguientes; enero parte en S01", () => {
  expect(SEMANAS_MES["Jan-28"]).toEqual(["S01", "S02", "S03", "S04"]);
  expect(SEMANAS_MES["Jun-31"][0]).toBe(posicionSemana(new Date(2031, 5, 1)).semana);
  ["Jan-29", "Jan-30", "Jan-31"].forEach(m => expect(SEMANAS_MES[m][0]).toBe("S01"));
});

test("posicionSemana: fin de mes fuera de la lista va a la última semana; día 1 de un mes generado va a S1", () => {
  expect(posicionSemana(new Date(2028, 11, 31))).toMatchObject({ mes: "Dec-28", semIdx: 3 });
  expect(posicionSemana(new Date(2029, 2, 1))).toMatchObject({ mes: "Mar-29", semIdx: 0 });
  expect(posicionSemana("2027-01-01")).toMatchObject({ mes: "Jan-27", semIdx: 0 });
});

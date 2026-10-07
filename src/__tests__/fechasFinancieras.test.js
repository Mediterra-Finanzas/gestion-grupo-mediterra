/* eslint-disable */
// Fechas financieras: "hoy" y fechas AAAA-MM-DD deben leerse en hora LOCAL.
// Correr también con  npm run test:cl  (TZ=America/Santiago).
import { hoyISOlocal, fechaLocal, posicionSemana } from "../FinanzasModule.jsx";

test("hoyISOlocal: a las 22:30 sigue siendo hoy (toISOString daba mañana en Chile)", () => {
  expect(hoyISOlocal(new Date(2026, 9, 6, 22, 30))).toBe("2026-10-06");
  expect(hoyISOlocal(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
});

test("fechaLocal no corre el día ni el año", () => {
  const d = fechaLocal("2027-01-01");
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 0, 1]);
});

test("semana real de una fecha de vencimiento del día 1", () => {
  expect(posicionSemana("2027-01-01")).toMatchObject({ mes: "Jan-27", semIdx: 0 });
  expect(posicionSemana("2026-06-01").mes).toBe("Jun-26");
});

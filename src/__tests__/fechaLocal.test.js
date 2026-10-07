/* eslint-disable */
// Una fecha "AAAA-MM-DD" se lee como fecha local: con el reloj de Chile, una cuota
// con vencimiento el 01-01-2027 caía en Dec-26 (new Date la interpreta en UTC).
// Correr también con:  TZ=America/Santiago npm run test:cl
import { fechaLocal, cuotasPrestamosEmpresa, CREDITOS_DEFAULT } from "../FinanzasModule.jsx";

test("fechaLocal no corre el día con la zona horaria", () => {
  const d = fechaLocal("2027-01-01");
  expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2027, 0, 1]);
  expect(fechaLocal("2026-06-01").getMonth()).toBe(5);
});

test("las cuotas del día 1 quedan en su mes (Mediterra, datos por defecto)", () => {
  const q = cuotasPrestamosEmpresa("Mediterra", CREDITOS_DEFAULT);
  const de = (mes) => q.filter(x => x.mes === mes).reduce((a, x) => a + x.monto, 0);
  expect(de("Jan-27")).toBe(550000);   // vence 2027-01-01
  expect(de("Jun-26")).toBe(34650);    // vence 2026-06-01
  expect(de("Dec-26")).toBe(34650);    // solo la del 2026-12-01; la de año nuevo NO
});

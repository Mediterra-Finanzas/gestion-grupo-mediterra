/* eslint-disable */
// Reporte Semanal = Flujo Empresas: los ítems de la ventana de 8 semanas suman,
// semana a semana, el mismo flujo neto que la vista semanal (motorFlujoEmpresa).
// Ventana desde el 25-nov-2026: Nov S4 → Jan S3 (cambio de año, cuota del 31-dic,
// override mensual antiguo, sublíneas mensuales y líneas agregadas mixtas).
import {
  buildEmpresas, motorFlujoEmpresa, calcPrestamosEmpresa, calcPrestamosSemanasEmpresa,
  reporte_getMovimientos4Semanas,
} from "../FinanzasModule.jsx";

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = []; for (let i = 0; i < 63; i++) { const m = (3 + i) % 12, y = 26 + Math.floor((3 + i) / 12); MESES.push(`${MN[m]}-${y}`); }
const iM = (l) => MESES.indexOf(l);

const CREDITOS = [
  { n: 1, empresa: "Mediterra", acreedor: "Fin de año", tipo_cr: "Bullet", f_venc: "2026-12-31", cuota: 50000 },
  { n: 2, empresa: "Mediterra", acreedor: "Año nuevo", tipo_cr: "Bullet", f_venc: "2027-01-01", cuota: 30000 },
  { n: 4, empresa: "Mediterra", acreedor: "Mensual", tipo_cr: "Cuotas Mensuales", f_inicio: "2026-09-15", f_venc: "2027-03-15", cuota: 18500 },
  { n: 6, empresa: "Allegria Service", acreedor: "Banco", tipo_cr: "Bullet", f_venc: "2026-11-30", cuota: 120000 },
];
const base = buildEmpresas({}, { cobros: [] });
const empresas = Object.fromEntries(Object.entries(base).map(([n, e]) => [n, { ...e, sections: e.sections.map(s => s.cat !== "egr_nop" ? s
  : { ...s, lines: s.lines.map(l => l.label === "Pago Préstamos - Total" ? { ...l, proy: calcPrestamosEmpresa(n, CREDITOS) } : l) }) }]));
const realData = { Mediterra: { _proyOverrides: {
  "ing_op::Fee Administración": { [iM("Dec-26")]: { _sem1: 60000, _sem3: 47500 }, [iM("Jan-27")]: 40000 },
} } };
const subLinesGlobal = { Mediterra: { "Pago Préstamos - Total": [
  { label: "Comisión", vals: { [iM("Dec-26")]: 7000 } },
  { label: "Notaría", vals: { [`${iM("Jan-27")}_1`]: 3000, [iM("Jan-27")]: 999 } },
] } };
const addedLinesGlobal = { Mediterra: { egr_var: [
  { label: "Gasto mixto", vals: { [iM("Dec-26")]: 4000, [`${iM("Jan-27")}_2`]: 1500, [iM("Jan-27")]: 777 } },
] } };
const HOY = new Date(2026, 10, 25);   // 25-nov-2026 → semana 4 de noviembre

describe.each(Object.keys(empresas))("%s", (n) => {
  test("Σ ítems de cada semana = flujo neto semanal de Flujo Empresas", () => {
    const motor = motorFlujoEmpresa({ emp: empresas[n], proyOverrides: realData[n]?._proyOverrides || {}, resoluciones: [],
      subLines: subLinesGlobal[n] || {}, addedLines: addedLinesGlobal[n] || {}, prestamosSemanas: calcPrestamosSemanasEmpresa(n, CREDITOS) });
    const r = reporte_getMovimientos4Semanas(n, realData, empresas, {}, subLinesGlobal, addedLinesGlobal, CREDITOS, HOY);
    expect(r.semanas.map(s => `${MESES[s.mesIdx]} S${s.semIdx + 1}`)).toEqual(
      ["Nov-26 S4", "Dec-26 S1", "Dec-26 S2", "Dec-26 S3", "Dec-26 S4", "Jan-27 S1", "Jan-27 S2", "Jan-27 S3"]);
    r.semanas.forEach(s => {
      const esperado = motor.flujoSemana(s.mesIdx, s.semIdx);
      if (Math.abs(s.neto - esperado) > 1e-6) throw new Error(`${n} ${MESES[s.mesIdx]} S${s.semIdx + 1}: reporte ${s.neto} ≠ flujo ${esperado}`);
    });
  });
});

test("Mediterra: préstamos en su semana real, override y líneas mixtas según su origen", () => {
  const r = reporte_getMovimientos4Semanas("Mediterra", realData, empresas, {}, subLinesGlobal, addedLinesGlobal, CREDITOS, HOY);
  const todos = [...r.compromisos, ...r.ingresos];
  const de = (label, mes, sem) => todos.filter(x => x.label === label && MESES[x.mesIdx] === mes && x.semIdx === sem).reduce((t, x) => t + x.valor, 0);
  expect(de("Pago Préstamos - Total", "Dec-26", 3)).toBe(18500 + 50000);   // 15-dic + 31-dic (S53 → última de Dec)
  expect(de("Pago Préstamos - Total", "Dec-26", 0)).toBe(0);               // antes se iba todo a S1
  expect(de("Pago Préstamos - Total", "Jan-27", 0)).toBe(30000);           // 01-ene, S01
  expect(de("Pago Préstamos - Total → Comisión", "Dec-26", 3)).toBe(7000); // subLine mensual → última semana (antes se omitía)
  expect(de("Pago Préstamos - Total → Notaría", "Jan-27", 1)).toBe(3000);  // con semana, el mensual 999 se ignora
  expect(de("Fee Administración", "Dec-26", 1)).toBe(60000);
  expect(de("Fee Administración", "Dec-26", 0)).toBe(0);
  expect(de("Gasto mixto", "Dec-26", 0)).toBe(4000);                       // mensual sin semanas → S1
  expect(de("Gasto mixto", "Jan-27", 0)).toBe(0);                          // Jan-27 tiene semana: 777 no se suma
  expect(de("Gasto mixto", "Jan-27", 2)).toBe(1500);
  expect(r.recortados).toEqual({ compromisos: 0, ingresos: 0 });            // el listado se recorta a 50; aquí no alcanza
});

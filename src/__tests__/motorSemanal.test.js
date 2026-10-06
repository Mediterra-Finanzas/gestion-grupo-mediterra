/* eslint-disable */
// Motor del flujo (Flujo Empresas, Consolidado semanal y Reporte Semanal):
//   · el mensual del motor = el mensual del Consolidado (buildEmpresasConOverrides)
//   · Σ semanas = mes, por categoría y en el flujo neto, todos los meses con semanas
//   · cuotas de préstamos en su semana real, incluidos cambio de año y fechas que
//     caen en una semana ISO que no está en la lista del mes (meses de 5 semanas)
import {
  buildEmpresas, buildEmpresasConOverrides, motorFlujoEmpresa, calcPrestamosEmpresa,
  calcPrestamosSemanasEmpresa, SEMANAS_MES,
} from "../FinanzasModule.jsx";

const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = []; for (let i = 0; i < 63; i++) { const m = (3 + i) % 12, y = 26 + Math.floor((3 + i) / 12); MESES.push(`${MN[m]}-${y}`); }
const iM = (l) => MESES.indexOf(l);

const CREDITOS = [
  { n: 1, empresa: "Mediterra", acreedor: "Fin de año", tipo_cr: "Bullet", f_venc: "2026-12-31", cuota: 50000 },     // S53 → última semana de Dec-26
  { n: 2, empresa: "Mediterra", acreedor: "Año nuevo", tipo_cr: "Bullet", f_venc: "2027-01-01", cuota: 30000 },      // Jan-27 S01
  { n: 3, empresa: "Mediterra", acreedor: "Quinta semana", tipo_cr: "Bullet", f_venc: "2026-08-31", cuota: 7000 },   // S36 ∉ Aug-26 → S34
  { n: 4, empresa: "Mediterra", acreedor: "Mensual", tipo_cr: "Cuotas Mensuales", f_inicio: "2026-09-15", f_venc: "2027-03-15", cuota: 18500 },
  { n: 5, empresa: "Mediterra", acreedor: "Socio", tipo_credito: "socio", monto: 200000, tasa_efectiva_anual: 8, fecha_desembolso: "2026-10-01",
    cuotas_socio: [{ fecha_vencimiento: "2026-12-10", modo: "interes" }, { fecha_vencimiento: "2027-02-20", modo: "amortizacion", amortizacion: 200000 }] },
  { n: 6, empresa: "Allegria Service", acreedor: "Banco", tipo_cr: "Bullet", f_venc: "2026-11-30", cuota: 120000 },
];
const base = buildEmpresas({}, { cobros: [] });
// Igual que FinanzasModule: la línea de Préstamos toma su proy de los créditos vigentes.
const empresas = Object.fromEntries(Object.entries(base).map(([n, e]) => [n, { ...e, sections: e.sections.map(s => s.cat !== "egr_nop" ? s
  : { ...s, lines: s.lines.map(l => l.label === "Pago Préstamos - Total" ? { ...l, proy: calcPrestamosEmpresa(n, CREDITOS) } : l) }) }]));

const realData = { Mediterra: { _proyOverrides: {
  "ing_op::Fee Administración": { [iM("Nov-26")]: { _sem0: 10000, _sem2: 25000 }, [iM("Jan-27")]: 40000 },   // semanal y mensual antiguo
  "egr_fijo::Gastos Varios": { [iM("Dec-26")]: 12345 },
} } };
const subLinesGlobal = { Mediterra: { "Pago Préstamos - Total": [
  { label: "Comisión", vals: { [iM("Dec-26")]: 7000 } },                                   // mensual → última semana
  { label: "Notaría", vals: { [`${iM("Jan-27")}_1`]: 3000, [iM("Jan-27")]: 999 } },          // hay semana → el mensual se ignora
] } };
const addedLinesGlobal = { Mediterra: { egr_var: [
  { label: "Gasto mixto", vals: { [iM("Dec-26")]: 4000, [`${iM("Jan-27")}_2`]: 1500, [`${iM("Jan-27")}_3`]: 500 } },
] } };

const eco = buildEmpresasConOverrides(empresas, realData, addedLinesGlobal, subLinesGlobal);
const motores = Object.fromEntries(Object.keys(empresas).map(n => [n, motorFlujoEmpresa({
  emp: empresas[n], proyOverrides: realData[n]?._proyOverrides || {}, resoluciones: [],
  subLines: subLinesGlobal[n] || {}, addedLines: addedLinesGlobal[n] || {}, prestamosSemanas: calcPrestamosSemanasEmpresa(n, CREDITOS),
})]));
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

describe.each(Object.keys(empresas))("%s", (n) => {
  const m = motores[n];
  test("mensual del motor = mensual del Consolidado, por categoría y mes", () => {
    empresas[n].sections.forEach(sec => {
      const secEco = eco[n].sections.find(s => s.cat === sec.cat);
      MESES.forEach((_, i) => {
        const consol = secEco.lines.reduce((a, l) => a + (Number(l.proy[i]) || 0), 0);
        if (!cerca(consol, m.catMes(sec, i))) throw new Error(`${n} ${sec.cat} ${MESES[i]}: consolidado ${consol} ≠ motor ${m.catMes(sec, i)}`);
      });
    });
  });
  test("Σ semanas = mes en cada categoría y en el flujo neto", () => {
    MESES.forEach((mes, i) => {
      if (!SEMANAS_MES[mes]) return;
      empresas[n].sections.forEach(sec => {
        const sem = [0, 1, 2, 3].reduce((a, w) => a + m.catSemana(sec, i, w, w === 3), 0);
        if (!cerca(sem, m.catMes(sec, i))) throw new Error(`${n} ${sec.cat} ${mes}: semanas ${sem} ≠ mes ${m.catMes(sec, i)}`);
      });
      const f = [0, 1, 2, 3].reduce((a, w) => a + m.flujoSemana(i, w), 0);
      expect(cerca(f, m.flujoMes(i))).toBe(true);
    });
  });
});

test("cuotas en su semana real: cambio de año y semana fuera de la lista del mes", () => {
  const m = motores.Mediterra;
  const sec = empresas.Mediterra.sections.find(s => s.cat === "egr_nop");
  const linea = sec.lines.find(l => l.label === "Pago Préstamos - Total");
  const sem = (mes, w) => m.propSemana("egr_nop", linea, iM(mes), w, w === 3);
  // Dec-26: interés socio 10-dic (S50, 2.ª semana) + cuota mensual 15-dic (S51) + 31-dic (S53 → S51)
  const dic = [0, 1, 2, 3].map(w => sem("Dec-26", w));
  expect(SEMANAS_MES["Dec-26"]).toEqual(["S48", "S49", "S50", "S51"]);
  expect(dic[3]).toBeCloseTo(18500 + 50000, 6);
  expect(dic.reduce((a, b) => a + b, 0)).toBeCloseTo(m.getProy("egr_nop", linea.label, iM("Dec-26")), 6);
  // Jan-27: 01-ene en S01 (1.ª semana) + cuota mensual 15-ene
  expect(sem("Jan-27", 0)).toBe(30000);
  // Aug-26: 31-ago cae en S36, que pertenece a Sep-26 → va a la última semana de agosto
  expect(sem("Aug-26", 3)).toBe(7000);
  expect(sem("Sep-26", 0)).toBe(0);
});

test("combinaciones mensual/semanal en una misma línea (valores a mano)", () => {
  const m = motores.Mediterra;
  const egrVar = empresas.Mediterra.sections.find(s => s.cat === "egr_var");
  // Gasto mixto: Dec-26 solo mensual (4.000 → S1); Jan-27 solo semanas (1.500 S3 + 500 S4)
  expect([0, 1, 2, 3].map(w => m.addedLineSemana(addedLinesGlobal.Mediterra.egr_var[0], iM("Dec-26"), w))).toEqual([4000, 0, 0, 0]);
  expect([0, 1, 2, 3].map(w => m.addedLineSemana(addedLinesGlobal.Mediterra.egr_var[0], iM("Jan-27"), w))).toEqual([0, 0, 1500, 500]);
  // Override semanal Nov-26: 10.000 S1 + 25.000 S3 = 35.000; mensual antiguo Jan-27 → última semana
  expect(m.getProy("ing_op", "Fee Administración", iM("Nov-26"))).toBe(35000);
  expect([0, 1, 2, 3].map(w => m.getProySemana("ing_op", "Fee Administración", iM("Jan-27"), w, w === 3))).toEqual([0, 0, 0, 40000]);
  // Sublíneas: Dec-26 mensual → última semana; Jan-27 tiene semana → el mensual 999 se ignora
  expect([0, 1, 2, 3].map(w => m.sumSubLinesSemana("Pago Préstamos - Total", iM("Dec-26"), w, w === 3))).toEqual([0, 0, 0, 7000]);
  expect(m.sumSubLinesMes("Pago Préstamos - Total", iM("Jan-27"))).toBe(3000);
  expect(egrVar).toBeDefined();
});

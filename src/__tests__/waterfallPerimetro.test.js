/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════════════════
// PERÍMETRO DEL WATERFALL = perímetro del Consolidado (oct-2026)
//
// Antes el "Total Consolidado" del Waterfall sumaba Allpa Farms Perú al 100% y
// dejaba fuera Allpa Farms Chile: con datos ficticios, saldo de caja 413.433
// donde el Consolidado mostraba 205.433 (= 413.433 − 208.000 de Allpa Perú), y
// cierre 2026-2027 2.229.559 donde el Consolidado mostraba 2.181.662
// (= 2.229.559 − 47.897). Ahora el total son las 6 sociedades; las JV se ven
// aparte y no suman, salvo que el Consolidado active su inclusión proporcional.
// ═══════════════════════════════════════════════════════════════════════════════
import { perimetroWaterfall } from "../FinanzasModule";

const OCHO = ["Mediterra","Allegria Foods","Allegria Service","Frisku Foods","Osiris","Integrity Farms","Allpa Farms","Allpa Farms Perú"];
const SEIS = ["Mediterra","Allegria Foods","Allegria Service","Frisku Foods","Osiris","Integrity Farms"];

test("sin inclusión proporcional: total = 6 sociedades; ambas JV aparte", () => {
  const { sumadas, separadas, factor } = perimetroWaterfall(OCHO);
  expect([...sumadas].sort()).toEqual([...SEIS].sort());
  expect(separadas).toEqual(["Allpa Farms","Allpa Farms Perú"]);
  // participación controladora: % de propiedad (NCI 20% y 10%), JV a su %
  expect(factor("Allegria Service")).toBe(0.8);
  expect(factor("Frisku Foods")).toBe(0.9);
  expect(factor("Allpa Farms Perú")).toBe(0.26);
});

test("Allpa Perú incluida proporcionalmente en el Consolidado: suma, y su % no se aplica dos veces", () => {
  const incl = [...SEIS, "Allpa Farms Perú"];
  const { sumadas, separadas, factor } = perimetroWaterfall(OCHO, incl, { "Allpa Farms Perú": 0.26 });
  expect(sumadas).toContain("Allpa Farms Perú");
  expect(separadas).toEqual(["Allpa Farms"]);
  expect(factor("Allpa Farms Perú")).toBe(1);   // sus líneas ya vienen al 26%
});

test("cuadre con datos ficticios: total del Waterfall = Consolidado; las JV no entran", () => {
  const saldoCaja = { "Mediterra":85000,"Allegria Service":31000,"Frisku Foods":0,"Integrity Farms":22000,"Osiris":50000,"Allegria Foods":17433,"Allpa Farms Perú":208000 };
  const { sumadas } = perimetroWaterfall(Object.keys(saldoCaja));
  const total = sumadas.reduce((s,n)=>s+saldoCaja[n],0);
  expect(total).toBe(205433);            // antes: 413.433
});

test("una JV que no está en los datos no aparece como columna vacía", () => {
  const { separadas } = perimetroWaterfall(SEIS);
  expect(separadas).toEqual([]);
});

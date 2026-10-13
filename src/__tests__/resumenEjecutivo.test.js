/* eslint-disable */
// Franja ejecutiva: sus cifras son EXACTAMENTE las de las fuentes únicas
// (saldoBancoEmpresaUSD y analisisCartera sobre créditos valorizados), con el
// perímetro que recibe. Datos sintéticos.
import { cajaEjecutiva, deudaEjecutiva } from "../diseno/resumenEjecutivo.js";
import { saldoBancoEmpresaUSD } from "../saldosBancosUSD";
import { valorizarCreditos, analisisCartera } from "../creditos";

const PER = ["Mediterra", "Osiris", "Integrity Farms"];
const FUERA = ["Allpa Farms"];
const AHORA = new Date(2026, 9, 13, 12);

const BANCOS = {
  "Mediterra||Banco A||usd": { monto: 1000, fecha: "2026-10-10" },
  "Osiris||Banco B||clp": { monto: 950000, usd: 1000, fecha: "2026-10-05" },
  "Osiris||Banco C||eur": { monto: 500, fecha: "2026-10-01" },              // sin usd guardado → sin TC
  "Allpa Farms||Banco D||usd": { monto: 99999, fecha: "2026-10-10" },        // fuera del perímetro
  "Mediterra||Banco E||usd": { monto: 5000, fecha: "2026-12-31" },           // fecha futura: no entra
};

test("caja = Σ saldoBancoEmpresaUSD del perímetro; lo sin TC se nombra y deja INCOMPLETO", () => {
  const c = cajaEjecutiva(BANCOS, PER, { ahora: AHORA });
  const esperado = PER.reduce((a, e) => a + (saldoBancoEmpresaUSD(BANCOS, e, { hoy: AHORA }).total || 0), 0);
  expect(c.total).toBe(esperado);
  expect(c.total).toBe(2000);                                  // 1.000 Mediterra + 1.000 Osiris; Allpa y la futura no
  expect(c.sinTC).toEqual([{ empresa: "Osiris", banco: "Banco C", moneda: "EUR", monto: 500, fecha: "2026-10-01" }]);
  expect(c.sinSaldo).toEqual(["Integrity Farms"]);
  expect(c.incompleto).toBe(true);
  expect([c.fechaDesde, c.fechaHasta]).toEqual(["2026-10-01", "2026-10-10"]);
});

test("caja completa cuando todo tiene TC y saldo", () => {
  const c = cajaEjecutiva({ "Mediterra||A||usd": { monto: 10, fecha: "2026-10-01" } }, ["Mediterra"], { ahora: AHORA });
  expect(c).toMatchObject({ total: 10, incompleto: false, sinTC: [], sinSaldo: [] });
});

const base = { tipo_credito: "contrato", acreedor: "Banco", tasa_tipo: "fija", tasa_anual: 0, base: "act360", modalidad: "bullet_total" };
const CRED = [
  { ...base, uid: "a", empresa: "Mediterra", moneda: "USD", monto: 100000, fecha_desembolso: "2026-01-10", vencimiento_final: "2027-01-10" },
  { ...base, uid: "b", empresa: "Osiris", moneda: "USD", monto: 50000, fecha_desembolso: "2026-01-10", vencimiento_final: "2026-09-10" },   // vencido
  { ...base, uid: "c", empresa: "Osiris", moneda: "CLP", acreedor: "Banco CLP", monto: 95000000, fecha_desembolso: "2026-01-10", vencimiento_final: "2027-06-10" },
  { ...base, uid: "d", empresa: "Allpa Farms", moneda: "USD", monto: 777, fecha_desembolso: "2026-01-10", vencimiento_final: "2027-06-10" },
];
const TC = { "USD-CLP": [{ fecha: "2026-10-10", valor: 950, fuente: "manual" }] };

test("deuda = analisisCartera(valorizarCreditos(...)) del perímetro; JV aparte, sin sumar", () => {
  const d = deudaEjecutiva(CRED, TC, PER, FUERA, { corte: "2026-10-13" });
  const an = analisisCartera(valorizarCreditos(CRED, TC, "2026-10-13"), "2026-10-13");
  const s = (k) => Math.round(PER.reduce((a, e) => a + ((an.porEmpresa[e] || {})[k] || 0), 0) * 100) / 100;
  expect(d.capital).toBe(s("saldoCapital"));
  expect(d.vencido).toBe(s("vencido"));
  expect(d.porConciliar).toBe(s("porConciliar"));
  expect(d.capital).toBeGreaterThan(150000);                   // incluye el CLP valorizado
  expect(d.fuera).toEqual({ capital: 777, empresas: ["Allpa Farms"] });
  expect(d.incompleto).toBe(false);
  expect(d).toMatchObject({ corte: "2026-10-13", moneda: "USD" });
});

test("sin tipo de cambio: el crédito en CLP no suma, se nombra y la deuda queda INCOMPLETA", () => {
  const d = deudaEjecutiva(CRED, {}, PER, FUERA, { corte: "2026-10-13" });
  expect(d.sinTC).toEqual([{ empresa: "Osiris", acreedor: "Banco CLP", moneda: "CLP" }]);
  expect(d.incompleto).toBe(true);
  const conTC = deudaEjecutiva(CRED, TC, PER, FUERA, { corte: "2026-10-13" });
  expect(d.capital).toBeLessThan(conTC.capital);
});

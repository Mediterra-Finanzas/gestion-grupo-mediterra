// ═══════════════════════════════════════════════════════════════════
// FRANJA EJECUTIVA DEL INICIO — caja y deuda del grupo, sin fórmulas propias.
//
// Solo junta lo que ya calculan las fuentes únicas de main:
//   · Caja: saldoBancoEmpresaUSD (src/saldosBancosUSD.js), la misma de Saldos
//     Bancos, el flujo, el consolidado, el reporte y el Excel.
//   · Deuda: valorizarCreditos + analisisCartera (src/creditos.js), las mismas de
//     Créditos → «Análisis CFO», valorizadas con maestro_tc a la fecha de corte.
// Perímetro: el que recibe (las sociedades consolidadas línea a línea); lo de
// fuera se informa aparte, nunca se suma. Moneda: US$. Sin mínimo proyectado.
// Nada se completa con un cero: lo que falta se lista y el total queda INCOMPLETO.
// ═══════════════════════════════════════════════════════════════════
import { saldoBancoEmpresaUSD } from "../saldosBancosUSD.js";
import { valorizarCreditos, analisisCartera, porConciliarCartera, hoyISO } from "../creditos.js";

const r2 = (x) => Math.round(x * 100) / 100;

export function cajaEjecutiva(bancos, empresas, { ahora = new Date() } = {}) {
  let total = 0;
  const porEmpresa = [], sinSaldo = [], sinTC = [];
  const fechas = [];
  (empresas || []).forEach(emp => {
    const r = saldoBancoEmpresaUSD(bancos || {}, emp, { hoy: ahora });
    if (r.total == null) { sinSaldo.push(emp); porEmpresa.push({ empresa: emp, total: null }); return; }
    total += r.total;
    r.cuentas.forEach(c => fechas.push(c.fecha));
    r.sinTC.forEach(c => sinTC.push({ empresa: emp, banco: c.banco, moneda: String(c.moneda).toUpperCase(), monto: c.monto, fecha: c.fecha }));
    porEmpresa.push({ empresa: emp, total: r.total, cuentas: r.cuentas.length });
  });
  fechas.sort();
  return { total, porEmpresa, sinSaldo, sinTC, incompleto: sinTC.length > 0 || sinSaldo.length > 0,
    fechaDesde: fechas[0] || null, fechaHasta: fechas[fechas.length - 1] || null };
}

export function deudaEjecutiva(creditos, tc, empresas, fuera = [], { corte = hoyISO() } = {}) {
  const val = valorizarCreditos(creditos || [], tc || {}, corte);
  const an = analisisCartera(val, corte);
  const suma = (lista, campo) => r2(lista.reduce((a, e) => a + ((an.porEmpresa[e] || {})[campo] || 0), 0));
  const enPerimetro = (c) => (empresas || []).includes(c.empresa);
  const sinTC = an.sinTC.filter(e => enPerimetro(e.c))
    .map(e => ({ empresa: e.c.empresa, acreedor: e.c.acreedor || "", moneda: e.c.moneda || "USD" }));
  const tcAntiguo = an.estados.filter(e => enPerimetro(e.c) && e.c._tc && e.c._tc.desactualizado)
    .map(e => ({ empresa: e.c.empresa, acreedor: e.c.acreedor || "", moneda: e.c._tc.moneda, fecha: e.c._tc.fecha }));
  const pc = porConciliarCartera(val, corte).filter(v => enPerimetro(v.credito));
  return {
    corte, moneda: "USD",
    capital: suma(empresas, "saldoCapital"),        // capital identificado pendiente
    sinDesglose: suma(empresas, "sinDesglose"),     // cuotas sin desglose (pueden traer intereses)
    vencido: suma(empresas, "vencido"),
    porConciliar: suma(empresas, "porConciliar"),
    cuotasPorConciliar: pc.length,
    sinTC, tcAntiguo, incompleto: sinTC.length > 0,
    fuera: { capital: suma(fuera, "saldoCapital"), empresas: fuera.filter(e => an.porEmpresa[e]) },
  };
}

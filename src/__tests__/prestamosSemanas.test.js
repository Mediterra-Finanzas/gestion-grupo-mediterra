/* eslint-disable */
// Cuotas de préstamos: una sola fuente (cuotasPrestamosEmpresa) para el total
// mensual, la vista semanal y el desglose por acreedor.
//   · el total mensual NO cambia respecto de la implementación anterior;
//   · Σ semanas = total del mes, mes a mes;
//   · Σ desglose por acreedor = total del mes.
import {
  cuotasPrestamosEmpresa, calcPrestamosEmpresa, calcPrestamosSemanasEmpresa,
  calcPrestamosDesglose, calcPrestamosDesgloseSemanasEmpresa, SEMANAS_MES, CREDITOS_DEFAULT,
} from "../FinanzasModule.jsx";
import { calcularAmortizacionSocio } from "../creditoSocio.js";

// ── Implementación ANTERIOR, copiada literal, como referencia del total mensual ──
const MN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MESES = []; for (let i = 0; i < 63; i++) { const m = (3 + i) % 12, y = 26 + Math.floor((3 + i) / 12); MESES.push(`${MN[m]}-${y}`); }
const mIdx = (l) => MESES.indexOf(l);
// La anterior usaba new Date("AAAA-MM-DD") (UTC): solo era correcta con el reloj en
// UTC. La referencia lee la fecha como local, que es lo que hacía en UTC.
const fechaLocalRef = (d) => { const m = typeof d === "string" && d.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(d); };
const mesDeDate = (d) => { const date = fechaLocalRef(d); return `${MN[date.getMonth()]}-${String(date.getFullYear()).slice(2)}`; };
function calcPrestamosEmpresaAnterior(empresa, creditos) {
  const arr = Array(63).fill(0);
  creditos.filter(c => c.empresa === empresa && !c.pagado).forEach(c => {
    if (c.tipo_credito === "socio") {
      const { filas } = calcularAmortizacionSocio(c.monto, c.tasa_efectiva_anual, c.fecha_desembolso, c.cuotas_socio);
      filas.forEach(f => { const mes = mesDeDate(f.fecha); if (!mes || mes.includes("NaN")) return; const i = mIdx(mes); if (i >= 0 && f.cuota_total > 0) arr[i] += f.cuota_total; });
      return;
    }
    if (!c.f_venc || !c.cuota) return;
    const cuota = Number(c.cuota) || 0; if (cuota === 0) return;
    if (c.tipo_cr === "Cuotas Mensuales" && c.f_inicio) {
      const inicio = fechaLocalRef(c.f_inicio), fin = fechaLocalRef(c.f_venc); if (isNaN(inicio) || isNaN(fin)) return;
      let fecha = new Date(inicio); fecha.setMonth(fecha.getMonth() + 1);
      while (fecha <= fin) { const i = mIdx(`${MN[fecha.getMonth()]}-${String(fecha.getFullYear()).slice(2)}`); if (i >= 0) arr[i] += cuota; fecha.setMonth(fecha.getMonth() + 1); }
    } else { const mes = mesDeDate(c.f_venc); if (!mes || mes.includes("NaN")) return; const i = mIdx(mes); if (i >= 0) arr[i] += cuota; }
  });
  return arr;
}

// Cartera mixta ficticia: bullet, cuotas mensuales, socio, pagado, fuera de rango.
const MIXTO = [
  { empresa: "X", acreedor: "Banco A", tipo_cr: "Bullet", f_venc: "2026-11-30", cuota: 120000 },
  { empresa: "X", acreedor: "Banco A", tipo_cr: "Bullet", f_venc: "2026-11-02", cuota: 5000 },
  { empresa: "X", acreedor: "Banco B", tipo_cr: "Cuotas Mensuales", f_inicio: "2026-09-15", f_venc: "2027-03-15", cuota: 18500 },
  { empresa: "X", acreedor: "Socio", tipo_credito: "socio", monto: 300000, tasa_efectiva_anual: 8, fecha_desembolso: "2026-10-01",
    cuotas_socio: [{ fecha_vencimiento: "2026-12-10", modo: "interes" }, { fecha_vencimiento: "2027-02-20", modo: "amortizacion", amortizacion: 150000 }, { fecha_vencimiento: "2027-06-05", modo: "amortizacion", amortizacion: 150000 }] },
  { empresa: "X", acreedor: "Banco C", tipo_cr: "Bullet", f_venc: "2026-12-15", cuota: 999, pagado: true },
  { empresa: "X", acreedor: "Banco D", tipo_cr: "Bullet", f_venc: "2031-12-31", cuota: 777 },
];
const EMPRESAS_DEFAULT = [...new Set(CREDITOS_DEFAULT.map(c => c.empresa))];
const casos = [["cartera mixta", "X", MIXTO], ...EMPRESAS_DEFAULT.map(e => [`CREDITOS_DEFAULT · ${e}`, e, CREDITOS_DEFAULT])];
const cerca = (a, b) => Math.abs(a - b) < 1e-6;

describe.each(casos)("%s", (_, empresa, creditos) => {
  const total = calcPrestamosEmpresa(empresa, creditos);

  test("el total mensual es idéntico a la implementación anterior", () => {
    const ref = calcPrestamosEmpresaAnterior(empresa, creditos);
    total.forEach((v, i) => expect(cerca(v, ref[i])).toBe(true));
  });

  test("Σ semanas = total del mes (en todos los meses con semanas definidas)", () => {
    const sem = calcPrestamosSemanasEmpresa(empresa, creditos);
    Object.keys(SEMANAS_MES).forEach(mes => {
      const i = mIdx(mes); if (i < 0) return;
      const suma = SEMANAS_MES[mes].reduce((a, s) => a + ((sem[mes] || {})[s] || 0), 0);
      expect(cerca(suma, total[i])).toBe(true);
    });
    // ninguna cuota queda en una semana que no pertenece a su mes
    Object.entries(sem).forEach(([mes, m]) => { if (!SEMANAS_MES[mes]) return; Object.keys(m).forEach(s => expect(SEMANAS_MES[mes]).toContain(s)); });
  });

  test("Σ desglose por acreedor = total del mes, y por semana también", () => {
    const des = calcPrestamosDesglose(empresa, creditos);
    const desSem = calcPrestamosDesgloseSemanasEmpresa(empresa, creditos);
    total.forEach((v, i) => expect(cerca(Object.values(des).reduce((a, arr) => a + arr[i], 0), v)).toBe(true));
    const sem = calcPrestamosSemanasEmpresa(empresa, creditos);
    Object.entries(sem).forEach(([mes, m]) => Object.entries(m).forEach(([s, v]) => {
      const sumaAcr = Object.values(desSem).reduce((a, x) => a + ((x[mes] || {})[s] || 0), 0);
      expect(cerca(sumaAcr, v)).toBe(true);
    }));
  });
});

test("cartera mixta: valores esperados a mano", () => {
  const sem = calcPrestamosSemanasEmpresa("X", MIXTO);
  const total = calcPrestamosEmpresa("X", MIXTO);
  // Nov-26 = 120.000 (bullet 30-nov) + 5.000 (bullet 02-nov) + 18.500 (cuota mensual 15-nov) = 143.500
  // Semanas (semanaDeDate; 01-01-2026 es jueves): 02-nov → S45; 15-nov → S47;
  // 30-nov → S49, que no está en Nov-26 (S44–S47) → va a la última semana, S47.
  expect(total[mIdx("Nov-26")]).toBe(143500);
  expect(sem["Nov-26"].S45).toBe(5000);
  expect(sem["Nov-26"].S47).toBe(138500);   // 120.000 + 18.500
  expect(SEMANAS_MES["Nov-26"].reduce((a, s) => a + (sem["Nov-26"][s] || 0), 0)).toBe(143500);
  // Cuotas mensuales: Oct-26 a Mar-27 (6 cuotas de 18.500), nada en Sep-26 (mes del desembolso)
  ["Oct-26", "Nov-26", "Dec-26", "Jan-27", "Feb-27", "Mar-27"].forEach(m => expect(calcPrestamosDesglose("X", MIXTO)["Banco B"][mIdx(m)]).toBe(18500));
  expect(calcPrestamosDesglose("X", MIXTO)["Banco B"][mIdx("Sep-26")]).toBe(0);
  // Crédito de socio presente en el desglose (antes quedaba fuera)
  expect(calcPrestamosDesglose("X", MIXTO)["Socio"]).toBeDefined();
  // El pagado no aparece
  expect(cuotasPrestamosEmpresa("X", MIXTO).some(q => q.acreedor === "Banco C")).toBe(false);
});

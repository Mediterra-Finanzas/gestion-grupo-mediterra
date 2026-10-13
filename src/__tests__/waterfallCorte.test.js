/* eslint-disable */
// Waterfall desde el saldo bancario de corte: saldo al corte + flujo proyectado = saldo final;
// el mes del corte y los meses anteriores quedan fuera de la identidad (ver src/waterfallCorte.js).
import { corteEmpresa, planEmpresa, conciliacionMensual, rotuloMesDeFecha } from "../waterfallCorte";

const MN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MESES = []; for (let y = 2026, m = 3; MESES.length < 63; m++) { if (m === 12) { m = 0; y++; } MESES.push(`${MN[m]}-${String(y).slice(2)}`); }
const ix = (l) => MESES.indexOf(l);
const temporada = (y) => MESES.map((l, i) => i).filter(i => { const [mm, yy] = MESES[i].split("-"); const mo = MN.indexOf(mm), a = 2000 + Number(yy); return (a === y && mo >= 6) || (a === y + 1 && mo <= 5); });
const T26 = temporada(2026), T27 = temporada(2027), T25 = temporada(2025);
const HOY = ix("Oct-26");
// flujo mensual = 1.000 × número de mes (fácil de sumar a mano)
const flujo = MESES.map((_, i) => (i + 1) * 1000);

test("fecha → mes local, sin corrimiento UTC", () => {
  expect(rotuloMesDeFecha("2026-10-01")).toBe("Oct-26");
  expect(rotuloMesDeFecha("2026-09-30")).toBe("Sep-26");
});

test("corte por sociedad: fecha más reciente y aviso si las cuentas difieren", () => {
  const c = corteEmpresa([{ fecha: "2026-10-08" }, { fecha: "2026-10-12" }], MESES, HOY);
  expect(c).toMatchObject({ conSaldo: true, fecha: "2026-10-12", fechaMin: "2026-10-08", fechasDistintas: true, mes: "Oct-26" });
  const sin = corteEmpresa([], MESES, HOY);
  expect(sin).toMatchObject({ conSaldo: false, fecha: null, mesIdx: HOY });
});

test("temporada en curso, corte en octubre: histórico Jul–Sep, octubre fuera, proyección Nov–Jun", () => {
  const corte = corteEmpresa([{ fecha: "2026-10-10" }], MESES, HOY);
  const p = planEmpresa({ flujo, idx: T26, saldoCorte: 85000, corte });
  expect(p.estado).toBe("en_curso");
  expect(p.historico.map(i => MESES[i])).toEqual(["Jul-26", "Aug-26", "Sep-26"]);
  expect(p.proyectados.map(i => MESES[i])).toEqual(["Nov-26","Dec-26","Jan-27","Feb-27","Mar-27","Apr-27","May-27","Jun-27"]);
  // Jul-26 = idx 3 → 4.000; Aug 5.000; Sep 6.000; Oct 7.000; Nov..Jun = 8.000..15.000
  expect(p.flujoHistorico).toBe(15000);
  expect(p.flujoMesCorte).toBe(7000);
  expect(p.flujoProyectado).toBe(8000 + 9000 + 10000 + 11000 + 12000 + 13000 + 14000 + 15000);
  expect(p.saldoInicio).toBe(85000);
  expect(p.saldoFinal).toBe(85000 + p.flujoProyectado);
  expect(p.saldoFinalConMesCorte).toBe(p.saldoFinal + 7000);
  // Nada se cuenta dos veces: histórico + mes del corte + proyectado = flujo de la temporada
  expect(p.flujoHistorico + p.flujoMesCorte + p.flujoProyectado).toBe(T26.reduce((s, i) => s + flujo[i], 0));
});

test("corte en septiembre (otra sociedad): la proyección empieza en octubre", () => {
  const p = planEmpresa({ flujo, idx: T26, saldoCorte: 17433, corte: corteEmpresa([{ fecha: "2026-09-15" }], MESES, HOY) });
  expect(MESES[p.proyectados[0]]).toBe("Oct-26");
  expect(p.flujoMesCorte).toBe(6000);
});

test("temporada futura: saldo inicial = saldo al corte + puente (no se inventa un saldo de inicio)", () => {
  const p = planEmpresa({ flujo, idx: T27, saldoCorte: 85000, corte: corteEmpresa([{ fecha: "2026-10-10" }], MESES, HOY) });
  expect(p.estado).toBe("futura");
  expect(p.puente.map(i => MESES[i])).toEqual(["Nov-26","Dec-26","Jan-27","Feb-27","Mar-27","Apr-27","May-27","Jun-27"]);
  expect(p.saldoInicio).toBe(85000 + 92000);
  expect(p.flujoMesCorte).toBe(0);     // el mes del corte no está en esta temporada
});

test("temporada terminada antes del corte: sin proyección ni saldo final", () => {
  const p = planEmpresa({ flujo, idx: T25, saldoCorte: 85000, corte: corteEmpresa([{ fecha: "2026-10-10" }], MESES, HOY) });
  expect(p).toMatchObject({ estado: "terminada", saldoInicio: null, saldoFinal: null });
});

test("conciliación mensual: cada mes en una sola clase y el acumulado cierra en el saldo final", () => {
  const cortePorEmp = { A: corteEmpresa([{ fecha: "2026-10-10" }], MESES, HOY), B: corteEmpresa([{ fecha: "2026-09-15" }], MESES, HOY) };
  const filas = conciliacionMensual({ empresas: ["A", "B"], flujoPorEmp: { A: flujo, B: flujo }, saldoCortePorEmp: { A: 100, B: 50 }, cortePorEmp, idx: T26, meses: MESES });
  ["A", "B"].forEach(n => {
    const f = filas.filter(r => r.empresa === n);
    const p = planEmpresa({ flujo, idx: T26, saldoCorte: n === "A" ? 100 : 50, corte: cortePorEmp[n] });
    expect(f[f.length - 1].saldoAcum).toBe(p.saldoFinal);
    expect(f.filter(r => r.clase === "mes_corte").length).toBe(1);
    expect(new Set(f.map(r => r.idx)).size).toBe(f.length);
  });
});

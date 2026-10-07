/* eslint-disable */
// Descompone "Compromisos 8 Sem." del Reporte (código nuevo) con el juego de datos
// de la comparación (créditos por defecto, sin overrides): ventana anterior vs real,
// recorte a 50 y origen (con fecha vs mensual sin desglose).
// Uso: DESCOMPONER=1 TZ=America/Santiago CI=true npx react-scripts test --watchAll=false --testPathPattern descomponerCompromisos
import { buildEmpresas, calcPrestamosEmpresa, CREDITOS_DEFAULT, reporte_getMovimientos4Semanas, REPORTE_EMPRESAS, PARTICIPACION_CONTROLADORA } from "../../FinanzasModule.jsx";

const correr = process.env.DESCOMPONER === "1" ? test : test.skip;
const HOY = new Date(2026, 9, 6, 22, 0);                       // misma fecha que la captura del navegador (hora Chile)
const base = buildEmpresas({}, { cobros: [] });
const empresas = Object.fromEntries(Object.entries(base).map(([n, e]) => [n, { ...e, sections: e.sections.map(s => s.cat !== "egr_nop" ? s
  : { ...s, lines: s.lines.map(l => l.label === "Pago Préstamos - Total" ? { ...l, proy: calcPrestamosEmpresa(n, CREDITOS_DEFAULT) } : l) }) }]));
const ordenAnterior = (a, b) => (a.mesIdx - b.mesIdx) || (a.semIdx - b.semIdx) || (b.monto - a.monto);

function kpi({ semIdxInicio, recorte, filtro = () => true }) {
  let t = 0;
  REPORTE_EMPRESAS.forEach(n => {
    if (!empresas[n]) return;
    const r = reporte_getMovimientos4Semanas(n, {}, empresas, {}, {}, {}, CREDITOS_DEFAULT, HOY, { semIdxInicio });
    let l = [...r.compromisos].sort(ordenAnterior);
    if (recorte) l = l.slice(0, 50);
    t += l.filter(filtro).reduce((a, c) => a + c.monto, 0) * (PARTICIPACION_CONTROLADORA[n] ?? 1);
  });
  return Math.round(t);
}

correr("descomposición de Compromisos 8 Sem.", () => {
  const real = kpi({}), ant = kpi({ semIdxInicio: 0 }), antCap = kpi({ semIdxInicio: 0, recorte: true });
  const porOrigen = (o) => ({ real: kpi({ filtro: c => c.origen === o }), anterior: kpi({ semIdxInicio: 0, filtro: c => c.origen === o }) });
  const r = { ventanaReal_sinRecorte: real, ventanaAnterior_sinRecorte: ant, ventanaAnterior_conRecorte50: antCap,
    origen: { con_fecha: porOrigen("con_fecha"), semana_cargada: porOrigen("semana_cargada"), mensual_sin_desglose: porOrigen("mensual_sin_desglose") } };
  console.log("[descomposición]", JSON.stringify(r));
});

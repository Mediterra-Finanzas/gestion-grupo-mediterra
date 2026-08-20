/* eslint-disable */
// friskuTooltip.js — Contrato central del tooltip analítico BI (P2.4a). PURO y testeable.
// No duplica métricas ni formatters: recibe el VALOR ya formateado (fmtMetric del motor) y
// solo calcula participación/ranking y ensambla las líneas estándar. Reglas:
//   · "Sin datos" NUNCA se presenta como cero.
//   · Solo se muestran las líneas que corresponden (sin ranking → sin línea de ranking, etc.).
//   · La participación usa el universo EFECTIVO que le pasa el objeto (denominador correcto).

// Participación (%) de un valor sobre el universo del objeto. null si el universo es 0.
export function participacionPct(subValor, universoValor){
  const u = Number(universoValor) || 0;
  if(u === 0) return null;
  return (Number(subValor) || 0) / u * 100;
}

// Ranking 1-based de valorActual dentro de las categorías VISIBLES (después de filtros + Top N).
// Devuelve {i, n}; i = cuántas categorías tienen valor estrictamente mayor + 1. null si no hay.
export function rankingDe(valoresVisibles, valorActual){
  const arr = (valoresVisibles || []).map(v => Number(v) || 0);
  if(!arr.length) return null;
  const v = Number(valorActual) || 0;
  const i = arr.filter(x => x > v).length + 1;
  return { i, n: arr.length };
}

// Formato de porcentaje con coma decimal (es-CL).
export function fmtPct(x, dec = 1){ return (Number(x) || 0).toFixed(dec).replace(".", ",") + "%"; }

// Etiquetas de fuente comunes (P2.4b). Vocabulario único, no cambia claves internas.
export const FUENTE_LAB = {
  unificado: "Embarques (OE) + Liquidaciones",
  liq: "Liquidaciones",
  emb: "Embarques (OE)",
  prog: "Programa Comercial",
  po:  "Cobranza / PO",
};
export function fuenteLabel(id){ return FUENTE_LAB[id] || String(id || ""); }

// Ensambla las líneas del tooltip. Omite las que no aplican; "Sin datos" si no hay valor
// (ausencia ≠ cero). `parte` en 0..100 (o null); `rank` = {i,n} (o null); `cobertura` =
// {con,total} (o null, solo medidas financieras).
export function buildTooltipData({ dimLab, valueLab, medidaLab, valorFmt, parte, rank, fuenteLab, cobertura, sinDatos }){
  const lines = [];
  if(dimLab && valueLab != null && String(valueLab) !== "") lines.push({ label: String(dimLab), value: String(valueLab) });
  if(medidaLab) lines.push({ label: String(medidaLab), value: sinDatos ? "Sin datos" : String(valorFmt) });
  if(!sinDatos && parte != null) lines.push({ label: "Participación", value: fmtPct(parte) });
  if(rank && rank.n) lines.push({ label: "Ranking", value: `${rank.i} de ${rank.n}` });
  if(fuenteLab) lines.push({ label: "Fuente", value: String(fuenteLab) });
  if(cobertura && cobertura.total != null) lines.push({ label: "Cobertura financiera", value: `${cobertura.con} de ${cobertura.total} embarques` });
  return { lines, sinDatos: !!sinDatos };
}

// Serializa a texto plano multilínea (para title= de tablas o fallback de gráficos).
export function tooltipToText(data){ return ((data && data.lines) || []).map(l => `${l.label}: ${l.value}`).join("\n"); }

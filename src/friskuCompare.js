/* eslint-disable */
// friskuCompare.js — Comparador A/B (Alternate States real, P2.3).
// Dos selecciones INDEPENDIENTES A y B evaluadas sobre la MISMA tabla de hechos
// con las MISMAS métricas del catálogo (metric.calc). No duplica métricas ni motor:
// reutiliza matchFacts. Δ = A − B; Δ% = (A−B)/|B|×100 (null si B=0, sin infinito).
// count-distinct se recalcula sobre los hechos de cada estado (nunca suma subtotales).

import { matchFacts } from "./friskuBI.js";

// Hechos que cumplen una selección {dimKey:Set|Array}.
export function factsDe(facts, sel){ return (facts||[]).filter(r=>matchFacts(r, sel, null)); }

// Valor de una métrica del catálogo en un estado (métrica.calc sobre los hechos del estado).
export function metricEnEstado(facts, sel, metric){ return metric.calc(factsDe(facts, sel)); }

export function dif(a, b){ return (Number(a)||0) - (Number(b)||0); }
// Δ% relativo a |B|. null cuando B=0 (evita infinito) → la UI muestra "—".
export function difPct(a, b){ const B=Number(b)||0; if(B===0) return null; return ((Number(a)||0) - B) / Math.abs(B) * 100; }

// Compara A vs B para una lista de métricas. Distingue cero real de "sin datos".
export function compararEstados(facts, selA, selB, metrics){
  const rowsA = factsDe(facts, selA), rowsB = factsDe(facts, selB);
  return (metrics||[]).map(m=>{
    const A = m.calc(rowsA), B = m.calc(rowsB);
    return {
      key:m.key, label:m.label, fmt:m.fmt,
      A, B, dif: dif(A,B), difPct: difPct(A,B),
      nA: rowsA.length, nB: rowsB.length,
      sinDatosA: rowsA.length===0, sinDatosB: rowsB.length===0,
    };
  });
}

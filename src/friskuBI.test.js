/* eslint-disable */
// Tests de semántica asociativa del motor BI Frisku (Qlik parity).
import { matchFacts, associativeValues, groupByDims,
         factsIgnoring, metricOverIgnoring, participacion, invertSelection, FRISKU_METRIC } from "./friskuBI.js";

// Mini tabla de hechos (4 contenedores) — solo los campos que usa el motor.
const FACTS = [
  { especie:"A", especieLab:"Arándanos", cliente:"X", clienteLab:"Cli X" },
  { especie:"A", especieLab:"Arándanos", cliente:"Y", clienteLab:"Cli Y" },
  { especie:"B", especieLab:"Cerezas",  cliente:"X", clienteLab:"Cli X" },
  { especie:"C", especieLab:"Paltas",   cliente:"Z", clienteLab:"Cli Z" },
];
const S = (...v)=>new Set(v);
const vals = (arr)=>arr.map(x=>x.value).sort();

describe("matchFacts — OR intra-dimensión / AND inter-dimensión", () => {
  test("OR dentro de una dimensión (Especie = A OR B)", () => {
    const sel = { especie:S("A","B") };
    const f = FACTS.filter(r=>matchFacts(r, sel, null));
    expect(f.length).toBe(3); // 2 de A + 1 de B
  });
  test("AND entre dimensiones (Especie = A AND Cliente = X)", () => {
    const sel = { especie:S("A"), cliente:S("X") };
    const f = FACTS.filter(r=>matchFacts(r, sel, null));
    expect(f.length).toBe(1); // A + X
  });
  test("tolerante: dim seleccionada que no existe en la fila no filtra", () => {
    const sel = { mercadoInexistente:S("Q") };
    const f = FACTS.filter(r=>matchFacts(r, sel, null));
    expect(f.length).toBe(4);
  });
});

describe("associativeValues — estados selected/possible/alternative/excluded", () => {
  test("sin selección propia: possible vs excluded según OTRO campo", () => {
    const sel = { cliente:S("X") }; // compatibles con X: especies A y B
    const r = associativeValues(FACTS, sel, "especie");
    expect(vals(r.possible)).toEqual(["A","B"]);
    expect(vals(r.excluded)).toEqual(["C"]);
    expect(r.alternative.length).toBe(0);
    expect(r.selected.length).toBe(0);
  });
  test("con selección propia: no seleccionados compatibles = ALTERNATIVE", () => {
    const sel = { especie:S("A") };
    const r = associativeValues(FACTS, sel, "especie");
    expect(vals(r.selected)).toEqual(["A"]);
    expect(vals(r.alternative)).toEqual(["B","C"]); // compatibles pero el campo tiene selección
    expect(r.excluded.length).toBe(0);
    expect(r.possible.length).toBe(0);
  });
  test("EXCLUDED por selección de otro campo", () => {
    const sel = { cliente:S("Z") }; // solo C va con Z
    const r = associativeValues(FACTS, sel, "especie");
    expect(vals(r.possible)).toEqual(["C"]);
    expect(vals(r.excluded)).toEqual(["A","B"]);
  });
  test("frecuencia (m) = nº de filas compatibles del valor", () => {
    const r = associativeValues(FACTS, {}, "especie");
    const a = r.possible.find(x=>x.value==="A");
    expect(a.m).toBe(2); // 2 contenedores de A
  });
});

describe("clear — limpiar selección", () => {
  test("selección vacía => todas las filas", () => {
    const f = FACTS.filter(r=>matchFacts(r, {}, null));
    expect(f.length).toBe(4);
  });
});

// P1.1 — Definición Qlik exacta de ALTERNATIVE:
// "un valor del mismo campo que sería POSSIBLE si se quitara ÚNICAMENTE la
//  selección de ese campo"; EXCLUDED = imposible por selección de OTRO campo.
describe("ALTERNATIVE vs EXCLUDED (definición Qlik exacta)", () => {
  const D = [
    { cliente:"A", clienteLab:"A", especie:"Aran", especieLab:"Arándanos" },
    { cliente:"A", clienteLab:"A", especie:"Cer",  especieLab:"Cerezas"  },
    { cliente:"B", clienteLab:"B", especie:"Pal",  especieLab:"Paltas"   },
  ];
  test("Cliente=A ⇒ Arándanos/Cerezas POSSIBLE, Paltas EXCLUDED", () => {
    const r = associativeValues(D, { cliente:S("A") }, "especie");
    expect(vals(r.possible)).toEqual(["Aran","Cer"]);
    expect(vals(r.excluded)).toEqual(["Pal"]);
    expect(r.alternative.length).toBe(0);
  });
  test("Cliente=A + Especie=Arándanos ⇒ Aran SELECTED, Cer ALTERNATIVE, Pal EXCLUDED", () => {
    const r = associativeValues(D, { cliente:S("A"), especie:S("Aran") }, "especie");
    expect(vals(r.selected)).toEqual(["Aran"]);      // seleccionado
    expect(vals(r.alternative)).toEqual(["Cer"]);    // sería posible si se quita SOLO la selección de especie
    expect(vals(r.excluded)).toEqual(["Pal"]);       // imposible por Cliente=A (otro campo)
    expect(r.possible.length).toBe(0);
  });
});

// P1.2 — agrupación multi-dimensión para Straight Table / Pivot.
describe("groupByDims — agrupación multi-dim", () => {
  test("agrupa por (cliente, especie) y conserva labels", () => {
    const D = [
      { cliente:"A", clienteLab:"Cli A", especie:"X", especieLab:"Esp X" },
      { cliente:"A", clienteLab:"Cli A", especie:"X", especieLab:"Esp X" },
      { cliente:"A", clienteLab:"Cli A", especie:"Y", especieLab:"Esp Y" },
      { cliente:"B", clienteLab:"Cli B", especie:"X", especieLab:"Esp X" },
    ];
    const g = groupByDims(D, ["cliente","especie"]);
    expect(g.length).toBe(3); // (A,X)=2 · (A,Y)=1 · (B,X)=1
    const ax = g.find(x=>x.dimValues.cliente==="A" && x.dimValues.especie==="X");
    expect(ax.rows.length).toBe(2);
    expect(ax.labels.cliente).toBe("Cli A");
  });
  test("sin dimensiones => un solo grupo total", () => {
    const g = groupByDims(FACTS, []);
    expect(g.length).toBe(1);
    expect(g[0].rows.length).toBe(4);
  });
});

// P1.15 — set helpers: ignore field, participación, invertir.
describe("set helpers (participación / ignore field / invert)", () => {
  // Facts con _cancel para contar contenedores (métrica no aditiva).
  const D = [
    { temporada:"T", cliente:"A", clienteLab:"A", _cancel:false },
    { temporada:"T", cliente:"A", clienteLab:"A", _cancel:false },
    { temporada:"T", cliente:"A", clienteLab:"A", _cancel:false },   // A = 3 contenedores
    { temporada:"T", cliente:"B", clienteLab:"B", _cancel:false },
    { temporada:"T", cliente:"C", clienteLab:"C", _cancel:false },
    { temporada:"T", cliente:"D", clienteLab:"D", _cancel:false },
    { temporada:"T", cliente:"E", clienteLab:"E", _cancel:false },
    { temporada:"T", cliente:"F", clienteLab:"F", _cancel:false },
    { temporada:"T", cliente:"G", clienteLab:"G", _cancel:false },
    { temporada:"T", cliente:"H", clienteLab:"H", _cancel:false }, // universo = 10 contenedores
  ];
  const M = FRISKU_METRIC.containers;
  test("ignore field: denominador ignora la selección de Cliente", () => {
    const sel = { temporada:S("T"), cliente:S("A") };
    const universo = factsIgnoring(D, sel, "cliente");    // mantiene T, ignora Cliente=A
    expect(M.calc(universo)).toBe(10);                    // 10 contenedores (no 3)
  });
  test("participación 30% aunque Cliente A esté seleccionado (denominador = universo previo)", () => {
    const sel = { temporada:S("T"), cliente:S("A") };
    const universo = factsIgnoring(D, sel, "cliente");    // 10
    const filaA = D.filter(r=>r.cliente==="A");           // 3
    expect(Math.round(participacion(filaA, universo, M)*100)).toBe(30);
  });
  test("metricOverIgnoring = métrica sobre el universo ignorando el campo", () => {
    const sel = { temporada:S("T"), cliente:S("A") };
    expect(metricOverIgnoring(D, sel, "cliente", M)).toBe(10);
  });
  test("invertir: selecciona los seleccionables NO seleccionados", () => {
    const selectable = ["A","B","C"];
    expect(invertSelection(S("A"), selectable).sort()).toEqual(["B","C"]);
    expect(invertSelection(S(), selectable).sort()).toEqual(["A","B","C"]);
  });
});

// P1.5 — Pivot: las métricas count-distinct se RECALCULAN, no se suman subtotales.
describe("Pivot — count-distinct no se duplica (metric.calc por celda/total)", () => {
  const D = [
    { cliente:"A", especie:"X", _cancel:false },
    { cliente:"A", especie:"Y", _cancel:false },  // A aparece en X e Y
    { cliente:"B", especie:"X", _cancel:false },
  ];
  const AC = FRISKU_METRIC.activeClients; // count distinct cliente
  test("total recalculado (2) ≠ suma de subtotales por especie (3)", () => {
    const total = AC.calc(D);                         // distintos: {A,B} = 2
    const porEsp = groupByDims(D, ["especie"]).map(g=>AC.calc(g.rows)); // X→2, Y→1
    const suma = porEsp.reduce((s,v)=>s+v,0);         // 3 (incorrecto si se sumara)
    expect(total).toBe(2);
    expect(suma).toBe(3);
    expect(total).not.toBe(suma);                     // por eso el pivot usa metric.calc, no suma
  });
  test("contenedores SÍ es aditivo (1 fila = 1 contenedor)", () => {
    const C = FRISKU_METRIC.containers;
    const total = C.calc(D);                          // 3
    const suma = groupByDims(D, ["especie"]).map(g=>C.calc(g.rows)).reduce((s,v)=>s+v,0); // X=2,Y=1 → 3
    expect(total).toBe(suma);
  });
});

// P1.8 — Filter Pane: las acciones de campo (⋯) componen los estados asociativos.
describe("Filter Pane — acciones de campo (posibles/alternativos/excluidos/invertir)", () => {
  const D = [
    { cliente:"A", clienteLab:"A", especie:"Aran", especieLab:"Arándanos" },
    { cliente:"A", clienteLab:"A", especie:"Cer",  especieLab:"Cerezas"  },
    { cliente:"B", clienteLab:"B", especie:"Pal",  especieLab:"Paltas"   },
  ];
  test("con Cliente=A + Especie=Arándanos, las acciones producen los sets correctos", () => {
    const sel = { cliente:S("A"), especie:S("Aran") };
    const r = associativeValues(D, sel, "especie"); // Aran SELECTED, Cer ALTERNATIVE, Pal EXCLUDED
    const val = (a)=>a.map(x=>x.value).sort();
    // "Seleccionar posibles" = selected + possible
    expect(val([...r.selected, ...r.possible])).toEqual(["Aran"]);
    // "Seleccionar alternativos"
    expect(val(r.alternative)).toEqual(["Cer"]);
    // "Seleccionar excluidos"
    expect(val(r.excluded)).toEqual(["Pal"]);
    // "Invertir": seleccionables = selected+possible+alternative; invierte sobre la selección actual
    const selectable = [...r.selected, ...r.possible, ...r.alternative].map(x=>x.value);
    expect(invertSelection(S("Aran"), selectable).sort()).toEqual(["Cer"]);
  });
});

/* eslint-disable */
// Tests de semántica asociativa del motor BI Frisku (Qlik parity).
import { matchFacts, associativeValues } from "./friskuBI.js";

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

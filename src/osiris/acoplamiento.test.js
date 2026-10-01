/* eslint-disable */
// ══════════════════════════════════════════════════════════════════
// Qué está acoplado al cálculo y qué no.
//
// Estas pruebas no comprueban que la pantalla se vea bien: comprueban qué
// mueve de verdad el motor de Osiris. Son la evidencia de tres preguntas del
// CFO:
//   1. ¿Las entregas históricas y las registradas se cuentan dos veces?
//      ¿Y con el cupo compartido?
//   2. ¿Un neto con retención pendiente puede salir como definitivo?
//   3. ¿Cambiar el país del cliente todavía mueve la retención del motor?
//
// Casos sintéticos. Ningún contrato ni cantidad real.
// ══════════════════════════════════════════════════════════════════
import {
  derivarRoyaltyPlantaDesdeContratos,
  ocLigadaAContrato,
} from "../OsirisModule";
import { consumoCupo, resolverRetencion, cambiarPais, REINO_UNIDO } from "./condicionesConfigurables";

const pctPorPais = (p) => ((p || "").toLowerCase().includes("chile") ? 1 : 0.85);

// Un contrato mínimo que el motor sepa derivar: una tanda de Royalty Planta.
const contratoRP = (extra = {}) => ({
  id: "ct1", razonSocial: "Sintético SA", clienteId: "cli1",
  pais: "Peru", valorRoyaltyPlanta: 2,
  plantaciones: [{ nPlantas: 1000 }],
  rpPlantaCuotas: [{ descripcion: "única", pct: 100 }],
  ...extra,
});
const netoRP = (ct) => {
  const filas = derivarRoyaltyPlantaDesdeContratos([ct], {});
  return filas.reduce((s, f) => s + (Number(f.montoCobro) || 0), 0);
};
const brutoRP = (ct) => {
  const filas = derivarRoyaltyPlantaDesdeContratos([ct], {});
  return filas.reduce((s, f) => s + (Number(f.montoFact) || 0), 0);
};

// ──────────────────────────────────────────────────────────────────
// 3 · El país SÍ mueve la retención del motor
// ──────────────────────────────────────────────────────────────────
describe("el país del cliente sigue acoplado al cálculo del motor", () => {
  test("de Chile a Reino Unido el neto CAE un 15 % sin que nadie lo decida", () => {
    const chile = contratoRP({ pais: "Chile" });
    const uk = cambiarPais(chile, REINO_UNIDO);
    expect(brutoRP(chile)).toBe(2000);
    expect(netoRP(chile)).toBe(2000);        // Chile: sin retención
    expect(netoRP(uk)).toBe(1700);           // Reino Unido: el motor retiene 15 %
    // El cambio de país, por sí solo, movió 300 USD.
    expect(netoRP(chile) - netoRP(uk)).toBe(300);
  });

  test("de Perú a Reino Unido el número no cambia, pero deja de estar respaldado", () => {
    const peru = contratoRP({ pais: "Peru" });
    const uk = cambiarPais(peru, REINO_UNIDO);
    expect(netoRP(uk)).toBe(netoRP(peru));                       // 1700 los dos
    // Consolidado: ninguno de los dos está validado, y el motor cobra 15 % a
    // los dos. Lo que el acoplamiento demuestra sigue en pie: el número sale
    // del país, no de un respaldo tributario.
    expect(resolverRetencion(peru).validado).toBe(false);
    expect(resolverRetencion(uk).validado).toBe(false);
    expect(resolverRetencion(uk).pct).toBe(15); // lo que aplica el motor
  });

  test("separar país y territorio NO desacopla el cálculo: el territorio no entra al motor", () => {
    const a = contratoRP({ pais: "Chile", territorio: "Perú" });
    const b = contratoRP({ pais: "Chile", territorio: "Chile" });
    expect(netoRP(a)).toBe(netoRP(b));   // el territorio no mueve nada
    expect(netoRP(a)).toBe(2000);        // manda el país, como antes
  });
});

// ──────────────────────────────────────────────────────────────────
// 2 · La retención cargada a mano es configuración, no cálculo
// ──────────────────────────────────────────────────────────────────
describe("la retención definida a mano todavía no la usa el motor", () => {
  test("cargar 20 % no cambia el neto: el motor sigue con el 15 % del país", () => {
    const sin = contratoRP({ pais: "Peru" });
    const con = contratoRP({ pais: "Peru", retencionPct: 20 });
    expect(netoRP(con)).toBe(netoRP(sin));      // 1700 los dos
    expect(netoRP(con)).not.toBe(1600);          // lo que daría el 20 %
    // La ficha dice 20 %; el motor cobra 15 %. Hay que decirlo en pantalla.
    // Y la pantalla ya no dice 20 %: desde la consolidación muestra la tasa
    // que el motor aplica de verdad, no la que alguien escribió en un campo
    // que nadie lee.
    expect(resolverRetencion(con).pct).toBe(15);
  });
});

// ──────────────────────────────────────────────────────────────────
// 1 · Doble conteo del cupo
// ──────────────────────────────────────────────────────────────────
describe("entregas históricas y registradas, sin contarse dos veces", () => {
  const completo = (id, extra = {}) => ({
    id,
    beneficioFee: {
      declarado: true, plantasCubiertas: 30000, referencia: "Annex 1", confirmado: true,
      consumoPrevioConocido: true, consumoPrevio: 0, alcance: "solo_este", ...extra,
    },
  });

  test("lo previo y lo registrado se suman una vez cada uno y quedan a la vista", () => {
    const ct = completo("ctA", { consumoPrevio: 5000 });
    const c = consumoCupo(ct, [ct], { ctA: 12000 });
    expect(c.entregadasRegistradas).toBe(12000);
    expect(c.consumoPrevio).toBe(5000);
    expect(c.consumido).toBe(17000);            // 12.000 + 5.000, no 29.000
    expect(c.disponible).toBe(13000);
  });

  test("con cupo compartido, el consumido es el MISMO se mire desde donde se mire", () => {
    const a = completo("ctA", { alcance: "grupo", contratosDelGrupo: ["ctB"], consumoPrevio: 5000 });
    const b = completo("ctB", { alcance: "grupo", contratosDelGrupo: ["ctA"], consumoPrevio: 3000 });
    const plantas = { ctA: 12000, ctB: 4000 };
    const desdeA = consumoCupo(a, [a, b], plantas);
    const desdeB = consumoCupo(b, [a, b], plantas);
    // Registradas: las del grupo, una sola vez.
    expect(desdeA.entregadasRegistradas).toBe(16000);
    expect(desdeB.entregadasRegistradas).toBe(16000);
    // Previas: las de cada contrato del grupo, una sola vez cada una.
    expect(desdeA.consumoPrevio).toBe(8000);
    expect(desdeB.consumoPrevio).toBe(8000);
    expect(desdeA.consumido).toBe(24000);
    expect(desdeB.consumido).toBe(desdeA.consumido);   // sin asimetría
    expect(desdeA.disponible).toBe(6000);
  });

  test("si un contrato del grupo no declara su historial, el consumo queda pendiente", () => {
    const a = completo("ctA", { alcance: "grupo", contratosDelGrupo: ["ctB"], consumoPrevio: 5000 });
    const b = { id: "ctB" };                            // no declara nada
    const c = consumoCupo(a, [a, b], { ctA: 12000, ctB: 4000 });
    expect(c.aplica).toBe(false);
    expect(c.estado).toBe("pendiente");
    expect(c.disponible).toBeNull();
    expect(c.faltan.join(" ")).toMatch(/historial/);
    expect(c.entregadasRegistradas).toBe(16000);        // lo contable sí se muestra
  });

  test("una orden de compra no puede sumar a dos contratos del grupo", () => {
    const a = { id: "ctA", clienteId: "cli1", razonSocial: "A" };
    const b = { id: "ctB", clienteId: "cli1", razonSocial: "B" };
    const oc = { id: "oc1", cliente_id: "cli1", cantidad_plantas: 9000 };
    const enA = ocLigadaAContrato(oc, a, [a, b]);
    const enB = ocLigadaAContrato(oc, b, [a, b]);
    expect(enA && enB).toBe(false);          // nunca en los dos
    expect(enA || enB).toBe(false);          // con dos contratos del mismo cliente queda pendiente
  });

  test("el cupo del grupo se lista una sola vez, no una por contrato", () => {
    const a = completo("ctA", { alcance: "grupo", contratosDelGrupo: ["ctB"] });
    const b = completo("ctB", { alcance: "grupo", contratosDelGrupo: ["ctA"] });
    const { gruposDeBeneficio } = require("./condicionesConfigurables");
    expect(gruposDeBeneficio([a, b])).toHaveLength(1);
  });

  test("el beneficio confirmado NO descuenta nada de lo que cobra el motor", () => {
    const base = contratoRP();
    const conBeneficio = contratoRP({
      beneficioFee: { declarado: true, plantasCubiertas: 30000, referencia: "Annex 1",
        confirmado: true, consumoPrevioConocido: true, consumoPrevio: 0, alcance: "solo_este" },
    });
    // Las 1.000 plantas caben de sobra en el cupo y aun así se cobran enteras.
    expect(brutoRP(conBeneficio)).toBe(brutoRP(base));
    expect(netoRP(conBeneficio)).toBe(netoRP(base));
  });
});

/* eslint-disable */
// Consolidación: la retención tiene UNA sola fuente, la publicada en
// retencion.js. Acá se comprueba que consolidar no cambia la TASA que el motor
// aplica, comparando contra un oráculo que reproduce la implementación
// anterior de condicionesConfigurables.

import { resolverRetencion, netoNoDefinitivo, PAISES_CON_TRATAMIENTO } from "./condicionesConfigurables";
import { estadoRetencion, factorNeto, transicionHeredada, validarRetencion, proponerRetencion } from "./retencion";

// ── oráculo: la implementación ANTERIOR, tal como estaba ───────────
// Devolvía la tasa a partir del país, con la misma tabla del motor.
function resolverAntes(ct) {
  const pais = String((ct && ct.pais) || "").trim();
  const propia = ct && ct.retencionPct !== undefined && ct.retencionPct !== null && ct.retencionPct !== ""
    ? Number(ct.retencionPct) : null;
  if (propia !== null) return { pct: propia, definitivo: true };
  const heredada = pais.toLowerCase().includes("chile") ? 1 : 0.85;
  const pct = Math.round((1 - heredada) * 10000) / 100;
  if (PAISES_CON_TRATAMIENTO.includes(pais)) return { pct, definitivo: true };
  return { pct: null, pctVigente: pct, definitivo: false };
}

const PAISES = ["Chile", "Peru", "Perú", "Mexico", "México", "Corea", "España", "Reino Unido", ""];

describe("consolidar no cambia la tasa que el motor aplica", () => {
  test("para todo país, la tasa resuelta es la que aplica el motor publicado", () => {
    PAISES.forEach((pais) => {
      const ct = { id: "c-" + pais, pais };
      const ahora = resolverRetencion(ct);
      expect(ahora.pct).toBe(estadoRetencion(ct).pct);
      expect(ahora.factor).toBe(factorNeto(ct));
    });
  });

  test("y coincide con lo que calculaba la implementación anterior", () => {
    PAISES.forEach((pais) => {
      const ct = { id: "c-" + pais, pais };
      const antes = resolverAntes(ct);
      const ahora = resolverRetencion(ct);
      // la tasa vigente: lo que el motor cobra. Antes vivía en `pct` cuando el
      // país tenía tratamiento y en `pctVigente` cuando no; ahora siempre en pct.
      const tasaAntes = antes.pct !== null ? antes.pct : antes.pctVigente;
      expect(ahora.pct).toBe(tasaAntes);
    });
  });

  test("Chile 0 % y el resto 15 %, igual que siempre", () => {
    expect(resolverRetencion({ pais: "Chile" }).pct).toBe(0);
    expect(resolverRetencion({ pais: "Peru" }).pct).toBe(15);
    expect(resolverRetencion({ pais: "Reino Unido" }).pct).toBe(15);
    expect(resolverRetencion({ pais: "" }).pct).toBe(15);
  });
});

describe("lo que la consolidación SÍ corrige, y hay que decirlo", () => {
  test("un 15 % por país ya no se llama definitivo: no está validado", () => {
    const ct = { id: "c1", pais: "Peru" };
    expect(resolverAntes(ct).definitivo).toBe(true);     // la versión anterior lo daba por cerrado
    expect(resolverRetencion(ct).definitivo).toBe(false); // el modelo publicado dice que no está validado
    expect(resolverRetencion(ct).pct).toBe(15);           // pero la TASA es la misma
  });

  test("solo una tasa validada es definitiva", () => {
    let ct = transicionHeredada({ id: "c1", pais: "Peru" }, "2026-10-01");
    expect(resolverRetencion(ct).definitivo).toBe(false);  // heredado no es validado
    ct = proponerRetencion(ct, { pct: 10, respaldo: "CDI", propuestaPor: "A" });
    expect(resolverRetencion(ct).definitivo).toBe(false);  // una propuesta tampoco
    expect(resolverRetencion(ct).pct).toBe(15);            // y no mueve la tasa
    const v = validarRetencion(ct, { nombre: "Angelo", rol: "admin", esCFO: true });
    if (v) {
      expect(resolverRetencion(v).definitivo).toBe(true);
      expect(resolverRetencion(v).pct).toBe(10);
    }
  });

  test("netoNoDefinitivo responde lo mismo que el modelo publicado", () => {
    const sinValidar = { id: "c1", pais: "Peru" };
    expect(netoNoDefinitivo(sinValidar).noDefinitivo).toBe(true);
    expect(netoNoDefinitivo(sinValidar).motivo).toMatch(/15 %/);
    expect(estadoRetencion(sinValidar).validado).toBe(false);
  });

  test("ya no hay una segunda tabla de países que decida tasas", () => {
    // PAISES_CON_TRATAMIENTO queda como referencia documental: cambiarla no
    // puede mover ninguna tasa.
    const ct = { id: "c1", pais: "Reino Unido" };   // fuera de esa lista
    expect(resolverRetencion(ct).pct).toBe(estadoRetencion(ct).pct);
    expect(resolverRetencion(ct).factor).toBe(factorNeto(ct));
  });
});

/* eslint-disable */
// Tests del contrato PDF Frisku (H1 — Opción A). Verifica que SOLO se transforme el
// conjunto auditado (emojis, Δ, Δ%, →) y que todo el texto legítimo pase intacto.
import { pdfText, pdfLabel } from "./pdfText.js";

describe("pdfText — mapeo aprobado (Opción A)", () => {
  const casos = [
    // texto legítimo → SIN cambio
    ["Agrícola", "Agrícola"],
    ["Perú", "Perú"],
    ["Compañía", "Compañía"],
    ["Anton Dürbeck GmbH", "Anton Dürbeck GmbH"],
    ["C.H. Robinson Company Inc.", "C.H. Robinson Company Inc."],
    ["Sociedad Agrícola Fistur SpA", "Sociedad Agrícola Fistur SpA"],
    ["Frisku Foods — Comercial", "Frisku Foods — Comercial"], // em-dash intacto
    ["+42% · 1.234", "+42% · 1.234"],                         // • ya no aplica; · y % intactos
    ["Ruta: A › B …", "Ruta: A › B …"],                       // › y … intactos
    // conjunto auditado → transformado
    ["Δ", "Variación"],
    ["Δ%", "Variación %"],
    ["Exportador → Cliente → Especie", "Exportador > Cliente > Especie"],
    ["🍒 Cerezas", "Cerezas"],
    ["🫐 Arándanos", "Arándanos"],
    ["🥑 Paltas", "Paltas"],
  ];
  test.each(casos)("%s → %s", (input, esperado) => {
    expect(pdfText(input)).toBe(esperado);
  });

  test("pdfLabel es alias de pdfText", () => {
    expect(pdfLabel("Δ%")).toBe("Variación %");
  });

  test("no-strings pasan intactos (números/celdas numéricas)", () => {
    expect(pdfText(1234)).toBe(1234);
    expect(pdfText(0)).toBe(0);
    expect(pdfText(null)).toBe(null);
    expect(pdfText(undefined)).toBe(undefined);
  });

  test("idempotencia: aplicar dos veces = una vez", () => {
    ["Δ", "Δ%", "🍒 Cerezas", "Exportador → Cliente", "Agrícola", "Anton Dürbeck GmbH"].forEach(s => {
      expect(pdfText(pdfText(s))).toBe(pdfText(s));
    });
  });

  test("NUNCA deja mojibake: tildes/ñ/ü/ö/ß intactas", () => {
    const s = "áéíóú ÁÉÍÓÚ ñ Ñ ü ö ä ß";
    expect(pdfText(s)).toBe(s);
  });

  test("no degrada símbolos soportados por WinAnsi (—, •, ›, …, %, ·)", () => {
    expect(pdfText("— • › … % ·")).toBe("— • › … % ·");
  });

  test("limpia el espacio que deja el emoji sin colapsar texto", () => {
    expect(pdfText("  🍒   Cerezas  ")).toBe("Cerezas");
    expect(pdfText("Especie 🍒 Cerezas")).toBe("Especie Cerezas");
  });

  test("Δ dentro de header combinado", () => {
    expect(pdfText("Δ vs anterior")).toBe("Variación vs anterior");
  });
});

/* eslint-disable */
// Tests del motor puro de candidatos SharePoint (S5A). Datos 100% ficticios/anonimizados:
// no hay usernames ni rutas corporativas reales. Un test verifica EXPRESAMENTE que una ruta
// ficticia (username/empresa/unidad inventados) no se filtra a la salida del motor.
import { evaluarCandidatosSharePoint, PESOS, PENAL } from "./friskuSharePointMatcher";

const REF = () => ({
  docId: "d1", tipo: "BL / AWB", nombre: "BL_HLBU9435288.pdf",
  referenciaLegacy: "ref-opaca",
  tokens: {
    contenedor: "HLBU9435288", numeroOE: "OE-1234", temporada: "2026-2027",
    exportadora: "Exportadora Uno", cliente: "Cliente Ejemplo", especie: "Arándanos",
    carpetaRelativa: ["COMEX_2026_2027", "Agrokasa", "Arandanos", "HLBU9435288_AGO_2026"],
    nombreArchivo: "BL_HLBU9435288.pdf",
  },
});
const cand = (o) => ({ driveId: "DR", itemId: "IT", name: "", webUrl: "https://sp/x", parentPath: "", size: 10, mimeType: "application/pdf", lastModifiedAt: "2026-08-01T00:00:00Z", ...o });

describe("evaluarCandidatosSharePoint — motor puro S5A", () => {
  it("1. candidato único con contenedor + temporada → exact_candidate (alta)", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/Arandanos/HLBU9435288_AGO_2026" })]);
    expect(r.estado).toBe("exact_candidate");
    expect(r.candidatos[0].confianza).toBe("alta");
    expect(r.requiereConfirmacion).toBe(true);
  });

  it("2. coincidencia solo por nombre NO alcanza exacta (baja / low_confidence)", () => {
    const ref = { docId: "d", tipo: "Otro", nombre: "reporte_calidad.pdf", tokens: { contenedor: "HLBU9435288", nombreArchivo: "reporte_calidad.pdf" } };
    const r = evaluarCandidatosSharePoint(ref, [cand({ driveId: "D2", itemId: "I2", name: "reporte_calidad.pdf", parentPath: "Carpeta Generica/documentos" })]);
    expect(r.estado).toBe("low_confidence");
    expect(r.candidatos[0].confianza).toBe("baja");
  });

  it("3. dos candidatos equivalentes → multiple_candidates", () => {
    const c1 = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/HLBU9435288_AGO_2026" });
    const c2 = cand({ driveId: "D2", itemId: "I2", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/HLBU9435288_AGO_2026" });
    const r = evaluarCandidatosSharePoint(REF(), [c1, c2]);
    expect(r.estado).toBe("multiple_candidates");
    expect(r.candidatos).toHaveLength(2);
  });

  it("4. contenedor incompatible → penalizado y visible (nunca alta)", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_MSKU1234567.pdf", parentPath: "COMEX_2026_2027/Agrokasa/MSKU1234567_AGO_2026" })]);
    expect(r.estado).not.toBe("exact_candidate");
    expect(r.candidatos[0].confianza).not.toBe("alta");
    expect(r.candidatos[0].advertencias).toContain("contenedor_incompatible");
  });

  it("5. OE incompatible impide exactitud aunque contenedor+temporada coincidan", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/OE-9999/HLBU9435288_AGO_2026" })]);
    expect(r.estado).not.toBe("exact_candidate");
    expect(r.candidatos[0].confianza).not.toBe("alta");
    expect(r.candidatos[0].advertencias).toContain("numeroOE_incompatible");
  });

  it("6. temporada incompatible impide exactitud", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2019_2020/Agrokasa/HLBU9435288_AGO_2019" })]);
    expect(r.estado).not.toBe("exact_candidate");
    expect(r.candidatos[0].advertencias).toContain("temporada_incompatible");
  });

  it("7. sin candidatos → not_found", () => {
    const r = evaluarCandidatosSharePoint(REF(), []);
    expect(r.estado).toBe("not_found");
    expect(r.candidatos).toHaveLength(0);
    expect(r.requiereConfirmacion).toBe(true);
  });

  it("8. entrada inválida → invalid_input", () => {
    expect(evaluarCandidatosSharePoint(null, []).estado).toBe("invalid_input");
    expect(evaluarCandidatosSharePoint(REF(), null).estado).toBe("invalid_input");
    expect(evaluarCandidatosSharePoint({}, []).estado).toBe("invalid_input"); // sin tokens
    expect(evaluarCandidatosSharePoint(null, []).requiereConfirmacion).toBe(true);
  });

  it("9. candidato sin driveId/itemId no es vinculable (descartado)", () => {
    const r = evaluarCandidatosSharePoint(REF(), [{ name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027" }]);
    expect(r.estado).toBe("not_found");
    expect(r.candidatos).toHaveLength(0);
    expect(r.descartados[0].motivo).toBe("sin_identidad_estable");
    // mezcla: uno válido + uno inválido → solo el válido puntúa
    const r2 = evaluarCandidatosSharePoint(REF(), [
      { name: "sin-id.pdf", parentPath: "x" },
      cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" }),
    ]);
    expect(r2.candidatos).toHaveLength(1);
    expect(r2.descartados).toHaveLength(1);
  });

  it("10. resultado independiente del orden de entrada", () => {
    const a = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/HLBU9435288_AGO_2026" });
    const b = cand({ driveId: "D2", itemId: "I2", name: "otro.pdf", parentPath: "Carpeta/2020" });
    const r1 = evaluarCandidatosSharePoint(REF(), [a, b]);
    const r2 = evaluarCandidatosSharePoint(REF(), [b, a]);
    expect(r2.candidatos).toEqual(r1.candidatos);
    expect(r2.estado).toBe(r1.estado);
  });

  it("11. desempate determinista (score igual → itemId ascendente)", () => {
    const c1 = cand({ driveId: "D1", itemId: "I2", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" });
    const c2 = cand({ driveId: "D2", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" });
    const r = evaluarCandidatosSharePoint(REF(), [c1, c2]);
    expect(r.candidatos[0].itemId).toBe("I1"); // empate de score → orden por itemId asc
    expect(r.candidatos[1].itemId).toBe("I2");
  });

  it("12. no muta la referencia ni los candidatos", () => {
    const ref = REF();
    const cands = [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" })];
    const snapRef = JSON.stringify(ref), snapC = JSON.stringify(cands);
    evaluarCandidatosSharePoint(ref, cands);
    expect(JSON.stringify(ref)).toBe(snapRef);
    expect(JSON.stringify(cands)).toBe(snapC);
  });

  it("13. tildes y mayúsculas normalizadas (Arándanos ↔ ARANDANOS)", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/AGROKASA/ARANDANOS/HLBU9435288_AGO_2026" })]);
    const esp = r.candidatos[0].señales.find(s => s.tipo === "especie");
    expect(esp && esp.resultado).toBe("match");
  });

  it("14. separadores de carpeta normalizados (\\ y /)", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027\\Agrokasa\\Arandanos\\HLBU9435288_AGO_2026" })]);
    const carp = r.candidatos[0].señales.find(s => s.tipo === "carpetaRelativa");
    expect(carp && carp.resultado).toBe("match");
  });

  it("15. no filtra ruta absoluta ni username en la salida", () => {
    // Fixture 100% ficticio (username, empresa y unidad inventados; no imita la estructura real).
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "X:/Profiles/UsuarioEjemplo/Empresa Ejemplo/Biblioteca Ficticia/HLBU9435288_AGO_2026" })]);
    const json = JSON.stringify(r);
    expect(json).not.toContain("UsuarioEjemplo");
    expect(json).not.toContain("X:/Profiles");
    expect(json).not.toContain("Empresa Ejemplo");
    expect(json).not.toContain("Biblioteca Ficticia");
  });

  it("16. extensión incompatible genera advertencia", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.xlsx", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" })]);
    expect(r.candidatos[0].advertencias).toContain("extension_incompatible");
  });

  it("17. dos documentos del mismo tipo siguen siendo candidatos independientes", () => {
    const c1 = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/carpetaA/HLBU9435288_AGO_2026" });
    const c2 = cand({ driveId: "D2", itemId: "I2", name: "BL_HLBU9435288_copia.pdf", parentPath: "COMEX_2026_2027/carpetaB/HLBU9435288_AGO_2026" });
    const r = evaluarCandidatosSharePoint(REF(), [c1, c2]);
    expect(r.candidatos).toHaveLength(2);
  });

  it("18. mismo nombre en carpetas distintas NO se trata como identidad (no dedupe)", () => {
    const c1 = cand({ driveId: "D1", itemId: "I1", name: "Invoice.pdf", parentPath: "COMEX_2026_2027/carpetaA" });
    const c2 = cand({ driveId: "D2", itemId: "I2", name: "Invoice.pdf", parentPath: "COMEX_2026_2027/carpetaB" });
    const r = evaluarCandidatosSharePoint(REF(), [c1, c2]);
    expect(r.candidatos).toHaveLength(2);
    // en cambio, MISMA identidad (driveId+itemId) sí se deduplica
    const dup = evaluarCandidatosSharePoint(REF(), [c1, { ...c1 }]);
    expect(dup.candidatos).toHaveLength(1);
    expect(dup.candidatos[0].advertencias).toContain("habia_duplicados");
  });

  it("19. señales contradictorias visibles", () => {
    const r = evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/OE-9999/HLBU9435288_AGO_2026" })]);
    const c = r.candidatos[0];
    expect(c.señales.some(s => s.resultado === "match")).toBe(true);
    expect(c.señales.some(s => s.resultado === "contradiccion")).toBe(true);
    expect(c.advertencias).toContain("señales_contradictorias");
  });

  it("20. requiereConfirmacion nunca es false (todos los estados)", () => {
    const casos = [
      evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/Arandanos/HLBU9435288_AGO_2026" })]), // exact
      evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "x.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" }), cand({ driveId: "D2", itemId: "I2", name: "x.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" })]), // multiple
      evaluarCandidatosSharePoint(REF(), [cand({ driveId: "D1", itemId: "I1", name: "otro.pdf", parentPath: "z" })]), // low
      evaluarCandidatosSharePoint(REF(), []), // not_found
      evaluarCandidatosSharePoint(null, []), // invalid
    ];
    for (const r of casos) expect(r.requiereConfirmacion).toBe(true);
    // y ninguno devuelve una vinculación confirmada
    for (const r of casos) expect(r).not.toHaveProperty("vinculado");
  });

  // ── Hotfix S5A: deduplicación determinista (Hallazgo 2) ──
  it("H2.1 duplicados IDÉNTICOS en distinto orden → salida idéntica (y 'habia_duplicados')", () => {
    const c1 = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" });
    const c1b = { ...c1 };
    const r1 = evaluarCandidatosSharePoint(REF(), [c1, c1b]);
    const r2 = evaluarCandidatosSharePoint(REF(), [c1b, c1]);
    expect(r2).toEqual(r1);
    expect(r1.candidatos).toHaveLength(1);
    expect(r1.candidatos[0].advertencias).toContain("habia_duplicados");
  });

  it("H2.2 misma identidad + nombre distinto → salida idéntica sin importar el orden", () => {
    const a = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" });
    const b = cand({ driveId: "D1", itemId: "I1", name: "OTRO_NOMBRE.pdf", parentPath: "COMEX_2026_2027/HLBU9435288_AGO_2026" });
    const r1 = evaluarCandidatosSharePoint(REF(), [a, b]);
    const r2 = evaluarCandidatosSharePoint(REF(), [b, a]);
    expect(r2).toEqual(r1);
  });

  it("H2.3 misma identidad + paths distintos → conflicto, no elige uno en silencio", () => {
    const a = cand({ driveId: "D1", itemId: "I1", name: "x.pdf", parentPath: "COMEX_2026_2027/carpetaA/HLBU9435288_AGO_2026" });
    const b = cand({ driveId: "D1", itemId: "I1", name: "x.pdf", parentPath: "COMEX_2026_2027/carpetaB/HLBU9435288_AGO_2026" });
    const r = evaluarCandidatosSharePoint(REF(), [a, b]);
    expect(r.candidatos).toHaveLength(1);
    expect(r.candidatos[0].advertencias).toContain("duplicated_identity_conflict");
    expect(r.candidatos[0].señales).toEqual([]); // no se elige metadata de ninguno
  });

  it("H2.4 conflicto de identidad NUNCA produce exact_candidate", () => {
    // Aunque cada versión por separado sería 'exacto', el conflicto lo impide.
    const a = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/Arandanos/HLBU9435288_AGO_2026" });
    const b = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/OtraRuta/HLBU9435288_AGO_2026" });
    const r = evaluarCandidatosSharePoint(REF(), [a, b]);
    expect(r.estado).not.toBe("exact_candidate");
    expect(r.candidatos[0].confianza).toBe("baja");
  });

  it("H2.5 la advertencia de conflicto no expone paths ni URLs", () => {
    const a = cand({ driveId: "D1", itemId: "I1", name: "x.pdf", parentPath: "X:/Profiles/UsuarioEjemplo/secreto/uno", webUrl: "https://sp/secreto-uno" });
    const b = cand({ driveId: "D1", itemId: "I1", name: "y.pdf", parentPath: "X:/Profiles/UsuarioEjemplo/secreto/dos", webUrl: "https://sp/secreto-dos" });
    const json = JSON.stringify(evaluarCandidatosSharePoint(REF(), [a, b]));
    expect(json).not.toContain("UsuarioEjemplo");
    expect(json).not.toContain("secreto");
    expect(json).not.toContain("https://sp");
  });

  // ── Hotfix S5A: match de acrónimos por palabra/frase (Hallazgo 4) ──
  it("H4.1 'GT' coincide como token, NO dentro de 'Logistica'", () => {
    const ref = { docId: "d", tipo: "Otro", nombre: "f.pdf", tokens: { exportadora: "GT" } };
    const conToken = evaluarCandidatosSharePoint(ref, [cand({ driveId: "D1", itemId: "I1", name: "f.pdf", parentPath: "COMEX/GT/HLBU9435288_AGO_2026" })]);
    const sinToken = evaluarCandidatosSharePoint(ref, [cand({ driveId: "D1", itemId: "I1", name: "f.pdf", parentPath: "COMEX/Logistica Global/HLBU9435288_AGO_2026" })]);
    const señ = (r) => r.candidatos[0].señales.find(s => s.tipo === "exportadora");
    expect(señ(conToken).resultado).toBe("match");
    expect(señ(sinToken).resultado).toBe("ausente");
  });

  it("H4.2 frases 'CMA CGM' e 'Ideal Fruits' coinciden como frase normalizada", () => {
    const ref = { docId: "d", tipo: "Otro", nombre: "f.pdf", tokens: { exportadora: "CMA CGM", cliente: "Ideal Fruits" } };
    const r = evaluarCandidatosSharePoint(ref, [cand({ driveId: "D1", itemId: "I1", name: "f.pdf", parentPath: "COMEX/CMA CGM/Ideal Fruits/HLBU9435288_AGO_2026" })]);
    const exp = r.candidatos[0].señales.find(s => s.tipo === "exportadora");
    const cli = r.candidatos[0].señales.find(s => s.tipo === "cliente");
    expect(exp.resultado).toBe("match");
    expect(cli.resultado).toBe("match");
  });

  it("H4.3 tildes y separadores siguen normalizados en el match por palabra", () => {
    const ref = { docId: "d", tipo: "Otro", nombre: "f.pdf", tokens: { cliente: "Órgano Cañón" } };
    const r = evaluarCandidatosSharePoint(ref, [cand({ driveId: "D1", itemId: "I1", name: "f.pdf", parentPath: "COMEX/ORGANO_CANON/HLBU9435288_AGO_2026" })]);
    const cli = r.candidatos[0].señales.find(s => s.tipo === "cliente");
    expect(cli.resultado).toBe("match");
  });

  // ── Hotfix S5A: contrato de opciones (Hallazgo 3) ──
  it("H3.1 margenEmpate se respeta; margen inválido cae al default", () => {
    // dos candidatos con scores cercanos pero distintos
    const fuerte = cand({ driveId: "D1", itemId: "I1", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/Arandanos/HLBU9435288_AGO_2026" });
    const casi = cand({ driveId: "D2", itemId: "I2", name: "BL_HLBU9435288.pdf", parentPath: "COMEX_2026_2027/Agrokasa/HLBU9435288_AGO_2026" });
    // margen 0 → no hay empate (scores distintos) → puede ser exacto o low, pero no multiple por empate
    const r0 = evaluarCandidatosSharePoint(REF(), [fuerte, casi], { margenEmpate: 0 });
    // margen enorme → fuerza empate → multiple_candidates
    const rBig = evaluarCandidatosSharePoint(REF(), [fuerte, casi], { margenEmpate: 1000 });
    expect(rBig.estado).toBe("multiple_candidates");
    // margen inválido (negativo / NaN) no rompe y no fuerza empate irreal
    expect(() => evaluarCandidatosSharePoint(REF(), [fuerte, casi], { margenEmpate: -5 })).not.toThrow();
    expect(() => evaluarCandidatosSharePoint(REF(), [fuerte, casi], { margenEmpate: "x" })).not.toThrow();
    expect(r0.estado).not.toBe("invalid_input");
  });
});

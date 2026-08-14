/* eslint-disable */
// Tests de la regla canónica de nombres de maestros (prevención en creación/edición).
import { normalizarNombre, claveNormalizada, buscarDuplicado } from "./nombreCanonico.js";

describe("normalizarNombre — casos aprobados FASE 2", () => {
  const casos = [
    ["AGROKASA", "Agrokasa"],
    ["AGRICOLA RIACHUELO SAC", "Agrícola Riachuelo S.A.C."],
    ["C.H. ROBINSON COMPANY INC.", "C.H. Robinson Company Inc."],
    ["TYT EXPORT S.A", "TYT Export S.A."],
    ["GT", "GT"],
    ["IDEAL FRUITS, S.L.", "Ideal Fruits, S.L."],
    ["Shanghai Nowfrutti Co.,Ltd.", "Shanghai Nowfrutti Co., Ltd."],
    ["EXPORTADORA ALFABERRIES LTDA.-", "Exportadora Alfaberries Ltda."],
    ["ANTON DÜRBECK GMBH", "Anton Dürbeck GmbH"],
    ["RVR AGRO SRL", "RVR Agro S.R.L."],
    ["COMERCIAL Y EXPORTADORA 3P LIMITADA", "Comercial y Exportadora 3P Limitada"],
    ["Sociedad C&L Frut SpA.", "Sociedad C&L Frut SpA"],
    ["Exportadora El Cisne Limitada", "Exportadora El Cisne Limitada"],
  ];
  test.each(casos)("%s → %s", (input, esperado) => {
    expect(normalizarNombre(input)).toBe(esperado);
  });

  test("idempotencia: normalizar dos veces = una vez", () => {
    casos.forEach(([input, esperado]) => {
      expect(normalizarNombre(esperado)).toBe(esperado);
      expect(normalizarNombre(normalizarNombre(input))).toBe(esperado);
    });
  });

  test("no rompe acrónimos/marcas a Title Case", () => {
    expect(normalizarNombre("GT")).toBe("GT");
    expect(normalizarNombre("TYT EXPORT S.A")).not.toContain("Tyt");
    expect(normalizarNombre("RVR AGRO SRL")).toContain("RVR");
    expect(normalizarNombre("EXPORTADORA 3P")).toContain("3P");
    expect(normalizarNombre("C&L FRUT")).toContain("C&L");
  });

  test("vacío/undefined → cadena vacía", () => {
    expect(normalizarNombre("")).toBe("");
    expect(normalizarNombre(undefined)).toBe("");
    expect(normalizarNombre(null)).toBe("");
  });
});

describe("claveNormalizada + buscarDuplicado", () => {
  test("clave ignora caso/espacios/puntuación/tildes", () => {
    expect(claveNormalizada("AGROKASA")).toBe(claveNormalizada("Agrokasa"));
    expect(claveNormalizada("Ideal Fruits, S.L.")).toBe(claveNormalizada("IDEAL FRUITS SL"));
    expect(claveNormalizada("Agrícola Riachuelo S.A.C.")).toBe(claveNormalizada("AGRICOLA RIACHUELO SAC"));
  });

  const lista = [
    { id:"e1", nombre:"Agrokasa", activo:true },
    { id:"e2", nombre:"Exportadora Frugal S.A.", activo:true },
    { id:"e3", nombre:"Hortifrut Comercial S.A.", activo:false }, // inactivo
  ];
  test("detecta duplicado por clave normalizada (mismo tipo)", () => {
    const dup = buscarDuplicado("AGROKASA", lista, null);
    expect(dup && dup.id).toBe("e1");
  });
  test("variante de casing/puntuación se detecta como duplicado", () => {
    expect(buscarDuplicado("exportadora frugal sa", lista, null)?.id).toBe("e2");
  });
  test("no se marca duplicado contra sí mismo al editar (exceptId)", () => {
    expect(buscarDuplicado("Agrokasa", lista, "e1")).toBeNull();
  });
  test("registros inactivos no bloquean", () => {
    expect(buscarDuplicado("Hortifrut Comercial S.A.", lista, null)).toBeNull();
  });
  test("nombre nuevo no colisiona", () => {
    expect(buscarDuplicado("Nueva Exportadora XYZ", lista, null)).toBeNull();
  });
});

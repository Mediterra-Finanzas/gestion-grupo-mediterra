/* eslint-disable */
// Pruebas del catálogo fenológico. Casos sintéticos: ningún informe, cliente ni
// cuartel real. Lo que se comprueba es la regla, no los datos de hoy.
import {
  ESTADOS_FENOLOGICOS,
  ESTADOS_FENOL_LEGACY,
  LABORES_CULT_LEGACY,
  catalogoFenologicoCombinado,
  estadoFenologicoVigente,
  laboresDeEstado,
  validarRespuestaLabor,
  faltantesDefinicion,
  resumenCatalogo,
} from "./fenologia";

const buscarLabor = (codigoEstado, nombreLabor) => {
  const e = ESTADOS_FENOLOGICOS.find((x) => x.codigo === codigoEstado);
  return e.labores.find((l) => l.nombre === nombreLabor);
};

// ══════════════════════════════════════════════════════════════════
describe("Catálogo nuevo (hoja Hoja1)", () => {
  test("tiene los 8 estados del Excel, en orden y sin el prefijo numérico", () => {
    expect(ESTADOS_FENOLOGICOS).toHaveLength(8);
    expect(ESTADOS_FENOLOGICOS.map((e) => e.codigo)).toEqual([
      "EST-01",
      "EST-02",
      "EST-03",
      "EST-04",
      "EST-05",
      "EST-06",
      "EST-07",
      "EST-08",
    ]);
    expect(ESTADOS_FENOLOGICOS.map((e) => e.orden)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ESTADOS_FENOLOGICOS.map((e) => e.nombre)).toEqual([
      "Establecimiento",
      "Crecimiento Vegetativo",
      "Inducción de yemas",
      "Floración y cuajado",
      "Crecimiento y Llenado del Fruto",
      "Cosecha",
      "Post-Cosecha y Acumulación de Reservas",
      "Poda",
    ]);
  });

  test("conserva la etiqueta literal del Excel junto al nombre limpio", () => {
    expect(ESTADOS_FENOLOGICOS[0].etiquetaExcel).toBe("1. Establecimiento");
    expect(ESTADOS_FENOLOGICOS[7].etiquetaExcel).toBe("8- Poda");
  });

  test("cada estado trae la cantidad de labores del Excel y suman 60", () => {
    expect(ESTADOS_FENOLOGICOS.map((e) => e.labores.length)).toEqual([9, 11, 9, 9, 7, 4, 4, 7]);
    expect(resumenCatalogo().labores).toBe(60);
  });

  test("ninguna labor queda sin estado ni sin tipo de respuesta", () => {
    const tiposValidos = [
      "opcion_unica",
      "numero",
      "macronutrientes",
      "observacion_recomendacion",
      "comentario",
    ];
    ESTADOS_FENOLOGICOS.forEach((e) => {
      e.labores.forEach((l, i) => {
        expect(l.n).toBe(i + 1);
        expect(l.nombre.length).toBeGreaterThan(0);
        expect(tiposValidos).toContain(l.tipoRespuesta);
      });
    });
  });

  test("las labores con Realizado/Pendiente/No aplica piden fecha", () => {
    const pinchado = buscarLabor("EST-02", "Pinchado");
    expect(pinchado.opciones).toEqual(["Realizado", "Pendiente", "No aplica"]);
    expect(pinchado.pideFecha).toBe(true);
    expect(pinchado.pideComentario).toBe(true);
  });

  test("Fertilización de Establecimiento sí trae los cinco macronutrientes", () => {
    const f = buscarLabor("EST-01", "Fertilización");
    expect(f.tipoRespuesta).toBe("macronutrientes");
    expect(f.campos).toEqual(["N", "P", "K", "Ca", "Mg"]);
    expect(f.camposSinDefinir).toBe(false);
  });

  test("Cadena de frío usa observación + recomendación y no pide comentario", () => {
    const l = buscarLabor("EST-06", "Cadena de frío en campo");
    expect(l.tipoRespuesta).toBe("observacion_recomendacion");
    expect(l.campos).toEqual(["Observación", "Recomendación"]);
    expect(l.pideComentario).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("Lo no definido se reporta como pendiente, nunca como valor", () => {
  test("CE no inventa unidad", () => {
    const ce = buscarLabor("EST-01", "CE");
    expect(ce.tipoRespuesta).toBe("numero");
    expect(ce.unidad).toBeNull();
  });

  test("los macronutrientes fuera de Establecimiento quedan sin definir, no en cero", () => {
    ["EST-02", "EST-03", "EST-04", "EST-05"].forEach((cod) => {
      const f = buscarLabor(cod, "Fertilización");
      expect(f.campos).toEqual([]);
      expect(f.camposSinDefinir).toBe(true);
    });
    const ajuste = buscarLabor("EST-07", "Ajuste fase nutricional");
    expect(ajuste.camposSinDefinir).toBe(true);
  });

  test("Biometría solo tiene comentario, sin campos estructurados", () => {
    const b = buscarLabor("EST-02", "Biometría");
    expect(b.tipoRespuesta).toBe("comentario");
    expect(b.campos).toEqual([]);
  });

  test("Polinización / colmenas se deja tal cual el Excel y queda como ambigüedad", () => {
    expect(buscarLabor("EST-04", "Polinización / colmenas").tipoRespuesta).toBe("macronutrientes");
    expect(buscarLabor("EST-05", "Polinización / colmenas").tipoRespuesta).toBe("macronutrientes");
    expect(faltantesDefinicion().map((f) => f.codigo)).toContain("FEN-02");
  });

  test("faltantesDefinicion cubre las ambigüedades conocidas y ninguna se da por resuelta", () => {
    const f = faltantesDefinicion();
    const codigos = f.map((x) => x.codigo);
    expect(codigos).toEqual(expect.arrayContaining(["FEN-01", "FEN-02", "FEN-03", "FEN-04", "FEN-05", "FEN-06"]));
    expect(new Set(codigos).size).toBe(codigos.length);
    f.forEach((x) => {
      expect(x.resueltoPorClaude).toBe(false);
      expect(x.titulo.length).toBeGreaterThan(0);
      expect(x.detalle.length).toBeGreaterThan(0);
    });
  });

  test("la diferencia entre las dos hojas queda registrada, no zanjada", () => {
    const uno = faltantesDefinicion().find((x) => x.codigo === "FEN-01");
    expect(uno.detalle).toMatch(/9 estados/);
    expect(uno.laboresFuera).toEqual(expect.arrayContaining(["Deshoje", "Control de Botrytis", "Malla / sombreo"]));
  });
});

// ══════════════════════════════════════════════════════════════════
describe("Preservación de valores legacy", () => {
  test("los estados legacy que no existen en el Excel sobreviven marcados", () => {
    const { estados } = catalogoFenologicoCombinado(ESTADOS_FENOL_LEGACY, []);
    const brotacion = estados.find((e) => e.nombre === "Brotación");
    expect(brotacion).toBeDefined();
    expect(brotacion.origen).toBe("legacy");
    expect(brotacion.labores).toEqual([]);
    ["Desarrollo de fruto", "Receso", "Cuaja", "Floración", "Postcosecha"].forEach((n) => {
      expect(estados.some((e) => e.nombre === n && e.origen === "legacy")).toBe(true);
    });
  });

  test("los 8 estados del Excel siguen ahí y marcados como excel", () => {
    const { estados } = catalogoFenologicoCombinado(ESTADOS_FENOL_LEGACY, LABORES_CULT_LEGACY);
    const delExcel = estados.filter((e) => e.origen === "excel");
    expect(delExcel).toHaveLength(8);
    delExcel.forEach((e) => e.labores.forEach((l) => expect(l.origen).toBe("excel")));
  });

  test("no se pierde ni una labor legacy y las que ya existen no se duplican", () => {
    const { estados, laboresLegacy } = catalogoFenologicoCombinado([], LABORES_CULT_LEGACY);
    const sueltas = laboresLegacy.map((l) => l.nombre);
    // "Poda" y "Control de malezas" ya viven en el catálogo del Excel.
    expect(sueltas).not.toContain("Poda");
    expect(sueltas).not.toContain("Control de malezas");
    expect(sueltas).toEqual(
      expect.arrayContaining([
        "Amarra / conducción",
        "Raleo",
        "Manejo de brotes",
        "Manejo de mulch",
        "Manejo de camellones / sustrato",
        "Limpieza de entrehilera",
        "Despunte",
        "Cosecha",
      ])
    );
    expect(sueltas).toHaveLength(8);
    laboresLegacy.forEach((l) => expect(l.origen).toBe("legacy"));
    // El catálogo del Excel no se contamina.
    expect(estados.filter((e) => e.origen === "excel")).toHaveLength(8);
  });

  test("una labor guardada con su estado del Excel se agrega a ese estado, sin renombrar nada", () => {
    const { estados, laboresLegacy } = catalogoFenologicoCombinado(
      [],
      [{ nombre: "Deshoje", estado: "6- Cosecha" }]
    );
    const cosecha = estados.find((e) => e.codigo === "EST-06");
    expect(cosecha.labores).toHaveLength(5);
    const deshoje = cosecha.labores[4];
    expect(deshoje.nombre).toBe("Deshoje");
    expect(deshoje.origen).toBe("legacy");
    expect(deshoje.n).toBe(5);
    expect(laboresLegacy).toHaveLength(0);
  });

  test("una labor guardada bajo un estado legacy queda colgada de ese estado", () => {
    const { estados } = catalogoFenologicoCombinado(["Receso"], [{ nombre: "Poda de invierno", estado: "Receso" }]);
    const receso = estados.find((e) => e.nombre === "Receso");
    expect(receso.origen).toBe("legacy");
    expect(receso.labores.map((l) => l.nombre)).toEqual(["Poda de invierno"]);
  });

  test("llamar sin argumentos devuelve el catálogo del Excel intacto", () => {
    const { estados, laboresLegacy } = catalogoFenologicoCombinado();
    expect(estados).toHaveLength(8);
    expect(laboresLegacy).toEqual([]);
  });

  test("valores vacíos o basura no ensucian el catálogo", () => {
    const { estados, laboresLegacy } = catalogoFenologicoCombinado([null, "", "   ", undefined], [null, ""]);
    expect(estados).toHaveLength(8);
    expect(laboresLegacy).toEqual([]);
  });

  test("el catálogo combinado no muta ESTADOS_FENOLOGICOS", () => {
    const antes = ESTADOS_FENOLOGICOS.map((e) => e.labores.length);
    catalogoFenologicoCombinado(ESTADOS_FENOL_LEGACY, [{ nombre: "Deshoje", estado: "6- Cosecha" }]);
    expect(ESTADOS_FENOLOGICOS.map((e) => e.labores.length)).toEqual(antes);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("estadoFenologicoVigente", () => {
  test("reconoce un estado del Excel por su nombre limpio", () => {
    const r = estadoFenologicoVigente("Inducción de yemas");
    expect(r).toMatchObject({ valor: "Inducción de yemas", existeEnCatalogoNuevo: true, origen: "excel", codigo: "EST-03" });
  });

  test("reconoce la etiqueta con prefijo y el código", () => {
    expect(estadoFenologicoVigente("3- Inducción de yemas").codigo).toBe("EST-03");
    expect(estadoFenologicoVigente("EST-08").valor).toBe("Poda");
  });

  test("tolera tildes ausentes y mayúsculas al reconocer", () => {
    const r = estadoFenologicoVigente("induccion DE YEMAS");
    expect(r.existeEnCatalogoNuevo).toBe(true);
    expect(r.valor).toBe("Inducción de yemas");
    expect(r.guardado).toBe("induccion DE YEMAS");
  });

  test("un valor legacy nunca se pierde ni se mapea a la fuerza", () => {
    const r = estadoFenologicoVigente("Brotación");
    expect(r).toEqual({
      valor: "Brotación",
      existeEnCatalogoNuevo: false,
      origen: "legacy",
      codigo: null,
      guardado: "Brotación",
    });
  });

  test("Cuaja y Desarrollo de fruto siguen siendo legacy: no se fusionan solos", () => {
    expect(estadoFenologicoVigente("Cuaja").existeEnCatalogoNuevo).toBe(false);
    expect(estadoFenologicoVigente("Desarrollo de fruto").existeEnCatalogoNuevo).toBe(false);
    expect(estadoFenologicoVigente("Floración").existeEnCatalogoNuevo).toBe(false);
  });

  test("sin nada guardado devuelve vacío explícito, no un default", () => {
    [null, undefined, "", "   "].forEach((v) => {
      const r = estadoFenologicoVigente(v);
      expect(r.valor).toBeNull();
      expect(r.origen).toBe("vacio");
      expect(r.existeEnCatalogoNuevo).toBe(false);
    });
  });

  test("acepta la forma guardada como objeto", () => {
    expect(estadoFenologicoVigente({ nombre: "6- Cosecha" }).codigo).toBe("EST-06");
  });
});

// ══════════════════════════════════════════════════════════════════
describe("laboresDeEstado", () => {
  test("devuelve las labores de un estado del Excel", () => {
    const r = laboresDeEstado("EST-01");
    expect(r.origen).toBe("excel");
    expect(r.labores).toHaveLength(9);
    expect(r.labores[0].nombre).toBe("Uniformidad establecimiento");
  });

  test("funciona igual con la etiqueta del Excel", () => {
    expect(laboresDeEstado("2- Crecimiento Vegetativo").labores).toHaveLength(11);
  });

  test("un estado legacy devuelve lista vacía y no lanza", () => {
    const cat = catalogoFenologicoCombinado(["Brotación"], []);
    const r = laboresDeEstado("Brotación", cat);
    expect(r.labores).toEqual([]);
    expect(r.origen).toBe("legacy");
  });

  test("un estado desconocido devuelve lista vacía y origen desconocido", () => {
    expect(() => laboresDeEstado("Estado que no existe")).not.toThrow();
    expect(laboresDeEstado("Estado que no existe")).toEqual({ labores: [], origen: "desconocido", estado: null });
    expect(laboresDeEstado(null).labores).toEqual([]);
    expect(laboresDeEstado(undefined, {}).labores).toEqual([]);
  });

  test("acepta el catálogo como arreglo o como objeto combinado", () => {
    const cat = catalogoFenologicoCombinado([], []);
    expect(laboresDeEstado("EST-06", cat).labores).toHaveLength(4);
    expect(laboresDeEstado("EST-06", cat.estados).labores).toHaveLength(4);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("validarRespuestaLabor", () => {
  const laborOpcion = buscarLabor("EST-01", "Control de malezas");
  const laborEjecucion = buscarLabor("EST-08", "Poda");
  const laborNumero = buscarLabor("EST-01", "CE");
  const laborMacroDefinida = buscarLabor("EST-01", "Fertilización");
  const laborMacroAbierta = buscarLabor("EST-03", "Fertilización");
  const laborObsRec = buscarLabor("EST-06", "Cadena de frío en campo");
  const laborComentario = buscarLabor("EST-03", "Biometría");

  test("opción válida pasa y opción inventada no", () => {
    expect(validarRespuestaLabor(laborOpcion, { valor: "Presencia" }).ok).toBe(true);
    const mal = validarRespuestaLabor(laborOpcion, { valor: "Mucha" });
    expect(mal.ok).toBe(false);
    expect(mal.motivo).toMatch(/no está en el listado/);
  });

  test("sin respuesta no se asume nada", () => {
    expect(validarRespuestaLabor(laborOpcion, null)).toEqual({ ok: false, motivo: "Sin respuesta registrada." });
    expect(validarRespuestaLabor(laborOpcion, { valor: "" }).ok).toBe(false);
    expect(validarRespuestaLabor(laborNumero, {}).ok).toBe(false);
  });

  test("la fecha de realización se valida en formato, pero no se exige", () => {
    expect(validarRespuestaLabor(laborEjecucion, { valor: "Realizado" }).ok).toBe(true);
    expect(validarRespuestaLabor(laborEjecucion, { valor: "Realizado", fecha: "2026-07-15" }).ok).toBe(true);
    const mal = validarRespuestaLabor(laborEjecucion, { valor: "Realizado", fecha: "15/07/2026" });
    expect(mal.ok).toBe(false);
    expect(mal.motivo).toMatch(/AAAA-MM-DD/);
  });

  test("el número acepta cifras y rechaza texto; el cero es un valor, no un vacío", () => {
    expect(validarRespuestaLabor(laborNumero, { valor: 1.8 }).ok).toBe(true);
    expect(validarRespuestaLabor(laborNumero, { valor: "1,8" }).ok).toBe(true);
    expect(validarRespuestaLabor(laborNumero, { valor: 0 }).ok).toBe(true);
    expect(validarRespuestaLabor(laborNumero, { valor: "alto" }).ok).toBe(false);
  });

  test("el número sin unidad definida avisa el pendiente en vez de inventarla", () => {
    expect(validarRespuestaLabor(laborNumero, { valor: 1.8 }).pendiente).toBe("FEN-04");
  });

  test("los macronutrientes definidos rechazan un nutriente ajeno", () => {
    expect(validarRespuestaLabor(laborMacroDefinida, { valores: { N: 10, P: 4, K: 12 } }).ok).toBe(true);
    const mal = validarRespuestaLabor(laborMacroDefinida, { valores: { N: 10, Zn: 1 } });
    expect(mal.ok).toBe(false);
    expect(mal.motivo).toMatch(/Zn/);
    expect(validarRespuestaLabor(laborMacroDefinida, { valores: { N: "mucho" } }).ok).toBe(false);
    expect(validarRespuestaLabor(laborMacroDefinida, { valores: {} }).ok).toBe(false);
  });

  test("los macronutrientes sin definir no se rellenan: se marcan pendientes", () => {
    const r = validarRespuestaLabor(laborMacroAbierta, { valores: { N: 8, Mg: 2 } });
    expect(r.ok).toBe(true);
    expect(r.pendiente).toBe("FEN-03");
  });

  test("observación + recomendación necesita al menos uno de los dos", () => {
    expect(validarRespuestaLabor(laborObsRec, { observacion: "Se cortó la cadena a las 14:00" }).ok).toBe(true);
    expect(validarRespuestaLabor(laborObsRec, { recomendacion: "Adelantar el retiro" }).ok).toBe(true);
    expect(validarRespuestaLabor(laborObsRec, { observacion: "", recomendacion: "" }).ok).toBe(false);
  });

  test("el comentario libre exige texto y avisa que Biometría no tiene campos", () => {
    const r = validarRespuestaLabor(laborComentario, { comentario: "Altura media 85 cm" });
    expect(r.ok).toBe(true);
    expect(r.pendiente).toBe("FEN-05");
    expect(validarRespuestaLabor(laborComentario, { comentario: "  " }).ok).toBe(false);
  });

  test("una labor no reconocida no lanza, responde que no calza", () => {
    expect(validarRespuestaLabor(null, { valor: "x" }).ok).toBe(false);
    expect(validarRespuestaLabor({ tipoRespuesta: "inventado" }, { valor: "x" }).ok).toBe(false);
  });

  test("una labor legacy rescatada se valida como comentario libre", () => {
    const { estados } = catalogoFenologicoCombinado([], [{ nombre: "Deshoje", estado: "6- Cosecha" }]);
    const legacy = estados.find((e) => e.codigo === "EST-06").labores.find((l) => l.nombre === "Deshoje");
    expect(validarRespuestaLabor(legacy, { comentario: "Se hizo en la hilera 4" }).ok).toBe(true);
    expect(validarRespuestaLabor(legacy, {}).ok).toBe(false);
  });
});

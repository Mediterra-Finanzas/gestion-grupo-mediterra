/* eslint-disable */
// Encabezado, alcance evaluado y variedades del informe técnico.
// Casos sintéticos: informes inventados, ningún dato real de un cliente.
import * as mod from "./informeAlcance";
import {
  CAMPOS_ENCABEZADO,
  UNIDADES_ALCANCE,
  SIN_DEFINIR,
  SIN_DATO,
  ETIQUETA_ESTADO_FENOLOGICO,
  etiquetaSeccionFenologia,
  alcanceEvaluado,
  cambioDeSignificado,
  conAlcance,
  densidadDeclarada,
  variedadesDe,
  conVariedades,
  etiquetaVariedades,
  resumenEncabezado,
  faltantesDefinicion,
  formatearNumero,
} from "./informeAlcance";

// Informe tal como lo guarda hoy OsirisModule: una sola variedad y la
// superficie evaluada en hectáreas.
const INFORME_LEGACY = {
  id: "inf_1",
  titulo: "Informe Técnico — Fundo El Sauce",
  tipo: "Técnica",
  fecha: "2026-03-12",
  ctId: "ct_1",
  lugar: "Fundo El Sauce",
  especie: "Arándano",
  variedad: "Biloxi",
  superficie: "12,5",
  responsable: "Nicolás Fuenzalida",
  fenologiaEstado: "Floración",
  fenologiaUniformidad: "Media",
  fenologiaObs: "Floración despareja en el sector bajo.",
};

// Informe nuevo: varias variedades y alcance declarado en plantas.
const INFORME_NUEVO = {
  ...INFORME_LEGACY,
  id: "inf_2",
  variedad: "Biloxi",
  variedades: ["Biloxi", "Ventura", "Emerald"],
  alcanceValor: "8400",
  alcanceUnidad: "plantas",
  densidadPlantacion: "3333",
  densidadPlantacionUnidad: "plantas/ha",
  sistemaProductivo: "maceta",
  sustrato: "fibra de coco",
};

describe("variedades: el histórico se sigue leyendo", () => {
  test("informe legacy con una sola variedad devuelve esa variedad", () => {
    expect(variedadesDe(INFORME_LEGACY)).toEqual(["Biloxi"]);
    expect(etiquetaVariedades(INFORME_LEGACY)).toBe("Biloxi");
  });

  test("informe nuevo con varias variedades las devuelve todas, en orden", () => {
    expect(variedadesDe(INFORME_NUEVO)).toEqual(["Biloxi", "Ventura", "Emerald"]);
    expect(etiquetaVariedades(INFORME_NUEVO)).toBe("Biloxi, Ventura, Emerald");
  });

  test("informe sin variedad alguna muestra raya, no «sin definir» ni vacío", () => {
    expect(variedadesDe({})).toEqual([]);
    expect(etiquetaVariedades({})).toBe(SIN_DATO);
    expect(etiquetaVariedades(null)).toBe(SIN_DATO);
  });

  test("conVariedades conserva `variedad` con la primera para las lecturas antiguas", () => {
    const nuevo = conVariedades(INFORME_LEGACY, ["Ventura", "Emerald"]);
    expect(nuevo.variedades).toEqual(["Ventura", "Emerald"]);
    expect(nuevo.variedad).toBe("Ventura");          // lectura antigua sigue viva
    expect(nuevo.titulo).toBe(INFORME_LEGACY.titulo); // no pisa el resto
    expect(INFORME_LEGACY.variedad).toBe("Biloxi");   // no muta el original
  });

  test("conVariedades limpia espacios, vacíos y repetidas", () => {
    const nuevo = conVariedades({}, [" Biloxi ", "", "Biloxi", "Ventura", null]);
    expect(nuevo.variedades).toEqual(["Biloxi", "Ventura"]);
    expect(nuevo.variedad).toBe("Biloxi");
  });

  test("migrar un informe legacy y volver a leerlo no pierde la variedad original", () => {
    const migrado = conVariedades(INFORME_LEGACY, variedadesDe(INFORME_LEGACY).concat(["Ventura"]));
    expect(migrado.variedad).toBe("Biloxi");
    expect(variedadesDe(migrado)).toEqual(["Biloxi", "Ventura"]);
  });
});

describe("alcance evaluado: siempre con unidad explícita", () => {
  test("alcance en hectáreas", () => {
    const a = alcanceEvaluado({ alcanceValor: "12,5", alcanceUnidad: "ha" });
    expect(a).toMatchObject({ valor: 12.5, unidad: "ha", completo: true });
    expect(a.etiqueta).toBe("12,5 ha");
  });

  test("alcance en plantas, con separador de miles chileno", () => {
    const a = alcanceEvaluado(INFORME_NUEVO);
    expect(a).toMatchObject({ valor: 8400, unidad: "plantas", completo: true });
    expect(a.etiqueta).toBe("8.400 plantas");
  });

  test("las unidades válidas son exactamente hectáreas y plantas", () => {
    expect(UNIDADES_ALCANCE).toEqual(["ha", "plantas"]);
    const raro = alcanceEvaluado({ alcanceValor: 10, alcanceUnidad: "cuarteles" });
    expect(raro.completo).toBe(false);
    expect(raro.etiqueta).toBe(SIN_DEFINIR);
  });

  test("informe legacy: la superficie histórica vale como alcance en hectáreas, con su procedencia", () => {
    const a = alcanceEvaluado(INFORME_LEGACY);
    expect(a.completo).toBe(true);
    expect(a.unidad).toBe("ha");
    expect(a.etiqueta).toBe("12,5 ha");
    expect(a.fuente).toBe("historico");
    expect(a.procedencia).toBe("Superficie evaluada (há)");
    expect(a.porVariedad).toBe(false);
  });

  test("una declaración nueva manda sobre el dato histórico", () => {
    const a = alcanceEvaluado({ ...INFORME_LEGACY, alcanceValor: "8400", alcanceUnidad: "plantas" });
    expect(a.etiqueta).toBe("8.400 plantas");
    expect(a.fuente).toBe("declarado");
    expect(a.superficieHistorica.valor).toBe(12.5);   // el histórico sigue ahí
  });

  test("cambiarle el significado al dato histórico pide confirmación; conservarlo no", () => {
    expect(cambioDeSignificado(INFORME_LEGACY, "12,5", "ha").requiereConfirmacion).toBe(false);
    const aPlantas = cambioDeSignificado(INFORME_LEGACY, "8400", "plantas");
    expect(aPlantas.requiereConfirmacion).toBe(true);
    expect(aPlantas.motivo).toMatch(/no es una conversión/);
    const otroValor = cambioDeSignificado(INFORME_LEGACY, "20", "ha");
    expect(otroValor.requiereConfirmacion).toBe(true);
    expect(otroValor.motivo).toMatch(/reemplaza el dato histórico/);
    // Sin dato histórico no hay nada que confirmar.
    expect(cambioDeSignificado({}, "8400", "plantas").requiereConfirmacion).toBe(false);
  });

  test("un informe sin superficie histórica no inventa ninguna", () => {
    expect(alcanceEvaluado({}).superficieHistorica).toBeNull();
  });

  test("alcance incompleto: sin unidad, sin valor o en cero dice «sin definir», nunca cero", () => {
    const sinUnidad = alcanceEvaluado({ alcanceValor: "8400" });
    expect(sinUnidad.completo).toBe(false);
    expect(sinUnidad.etiqueta).toBe(SIN_DEFINIR);

    const sinValor = alcanceEvaluado({ alcanceUnidad: "ha" });
    expect(sinValor.completo).toBe(false);
    expect(sinValor.etiqueta).toBe(SIN_DEFINIR);

    const enCero = alcanceEvaluado({ alcanceValor: 0, alcanceUnidad: "ha" });
    expect(enCero.completo).toBe(false);
    expect(enCero.etiqueta).toBe(SIN_DEFINIR);
    expect(enCero.etiqueta).not.toMatch(/0/);

    const vacio = alcanceEvaluado({});
    expect(vacio.etiqueta).toBe(SIN_DEFINIR);
    expect(alcanceEvaluado(null).etiqueta).toBe(SIN_DEFINIR);
  });

  test("conAlcance acepta sinónimos («há») y rechaza lo que no reconoce", () => {
    expect(alcanceEvaluado(conAlcance({}, "3", "há")).etiqueta).toBe("3 ha");
    expect(alcanceEvaluado(conAlcance({}, "3", "Hectáreas")).etiqueta).toBe("3 ha");
    expect(alcanceEvaluado(conAlcance({}, "3", "sacos")).etiqueta).toBe(SIN_DEFINIR);
  });
});

describe("prohibido convertir entre hectáreas y plantas", () => {
  test("el módulo no expone ninguna función de conversión ni de equivalencia", () => {
    const sospechosos = Object.keys(mod).filter(n =>
      /conver|equival|aplant|aplanta|ahect|ahectarea|plantasdesde|hasdesde|estimar/i.test(n));
    expect(sospechosos).toEqual([]);
  });

  test("con densidad cargada, el alcance en plantas sigue siendo el declarado", () => {
    // 8.400 plantas con densidad 3.333 plantas/ha NO se transforma en 2,52 ha.
    const a = alcanceEvaluado(INFORME_NUEVO);
    expect(a.unidad).toBe("plantas");
    expect(a.valor).toBe(8400);
    expect(a.etiqueta).toBe("8.400 plantas");
  });

  test("con densidad cargada, el alcance en hectáreas sigue siendo el declarado", () => {
    const inf = { ...INFORME_NUEVO, alcanceValor: "2,5", alcanceUnidad: "ha" };
    const a = alcanceEvaluado(inf);
    expect(a.unidad).toBe("ha");
    expect(a.valor).toBe(2.5);
    expect(a.etiqueta).toBe("2,5 ha");
  });

  test("la densidad no rescata un alcance sin unidad: queda «sin definir»", () => {
    const inf = { densidadPlantacion: "3333", densidadPlantacionUnidad: "plantas/ha", alcanceValor: "2,5" };
    expect(alcanceEvaluado(inf).etiqueta).toBe(SIN_DEFINIR);
  });
});

describe("densidad de plantación", () => {
  test("con unidad se muestra completa", () => {
    const d = densidadDeclarada(INFORME_NUEVO);
    expect(d.completo).toBe(true);
    expect(d.etiqueta).toBe("3.333 plantas/ha");
  });

  test("sin unidad nunca se muestra el número pelado", () => {
    const d = densidadDeclarada({ densidadPlantacion: "3333" });
    expect(d.completo).toBe(false);
    expect(d.etiqueta).toBe(SIN_DEFINIR);
  });
});

describe("encabezado listo para pintar", () => {
  test("los tres campos nuevos están descritos, con la densidad exigiendo unidad", () => {
    expect(CAMPOS_ENCABEZADO.map(c => c.clave))
      .toEqual(["densidadPlantacion", "sistemaProductivo", "sustrato"]);
    const dens = CAMPOS_ENCABEZADO.find(c => c.clave === "densidadPlantacion");
    expect(dens.requiereUnidad).toBe(true);
    expect(dens.unidadSugerida).toBe("plantas/ha");
    // Las opciones de sistema productivo y sustrato aún no están definidas.
    expect(CAMPOS_ENCABEZADO.filter(c => c.pendienteDefinicion).length).toBe(3);
  });

  test("informe nuevo: todo completo", () => {
    const r = resumenEncabezado(INFORME_NUEVO);
    expect(r.densidadPlantacion.texto).toBe("3.333 plantas/ha");
    expect(r.sistemaProductivo.texto).toBe("maceta");
    expect(r.sustrato.texto).toBe("fibra de coco");
    expect(r.alcanceEvaluado.texto).toBe("8.400 plantas");
    expect(r.variedades.texto).toBe("Biloxi, Ventura, Emerald");
    expect(r.variedades.etiqueta).toBe("Variedades");
    expect(r.incompletos).toEqual([]);
  });

  test("informe legacy: lo que falta dice «sin definir» y se reporta", () => {
    const r = resumenEncabezado(INFORME_LEGACY);
    expect(r.densidadPlantacion.texto).toBe(SIN_DEFINIR);
    expect(r.sistemaProductivo.texto).toBe(SIN_DEFINIR);
    expect(r.sustrato.texto).toBe(SIN_DEFINIR);
    expect(r.alcanceEvaluado.texto).toBe("12,5 ha");   // dato histórico válido, en hectáreas
    expect(r.variedades.texto).toBe("Biloxi");
    expect(r.variedades.etiqueta).toBe("Variedad");
    expect(r.incompletos).toEqual(["densidadPlantacion", "sistemaProductivo", "sustrato"]);
  });

  test("informe vacío: cinco campos y ningún cero inventado", () => {
    const r = resumenEncabezado({});
    expect(r.campos).toHaveLength(5);
    expect(r.campos.filter(c => c.completo)).toEqual([]);
    expect(r.campos.map(c => c.texto))
      .toEqual([SIN_DEFINIR, SIN_DEFINIR, SIN_DEFINIR, SIN_DEFINIR, SIN_DATO]);
  });
});

describe("etiqueta de la sección fenológica", () => {
  test("pantalla y PDF usan el mismo texto", () => {
    expect(ETIQUETA_ESTADO_FENOLOGICO).toBe("Estado fenológico predominante");
    expect(etiquetaSeccionFenologia()).toBe("Estado fenológico predominante");
    expect(etiquetaSeccionFenologia("C.")).toBe("C. Estado fenológico predominante");
  });

  test("solo cambia la etiqueta: las claves guardadas no se tocan", () => {
    expect(mod.CLAVE_SECCION_FENOLOGIA).toBe("fenologia");
    const r = resumenEncabezado(INFORME_LEGACY);
    // El resumen no toca ni renombra los campos fenológicos del informe.
    expect(r.campos.map(c => c.clave)).not.toContain("fenologiaEstado");
    expect(INFORME_LEGACY.fenologiaEstado).toBe("Floración");
  });
});

describe("definiciones pendientes del CFO", () => {
  test("se reportan las cuatro que faltan, sin resolverlas por cuenta propia", () => {
    const f = faltantesDefinicion();
    const claves = f.map(x => x.clave);
    expect(claves).toEqual(expect.arrayContaining([
      "sistemaProductivo.opciones",
      "sustrato.opciones",
      "densidadPlantacion.unidad",
      "alcanceEvaluado.granularidad",
    ]));
    expect(f.length).toBeGreaterThanOrEqual(4);
    f.forEach(x => {
      expect(typeof x.pregunta).toBe("string");
      expect(x.pregunta.length).toBeGreaterThan(0);
      expect(typeof x.bloquea).toBe("boolean");
    });
  });

  test("mientras estén pendientes, las listas de opciones siguen vacías", () => {
    CAMPOS_ENCABEZADO.forEach(c => expect(c.opciones).toEqual([]));
  });
});

describe("formato de números chileno", () => {
  test("miles con punto y decimales con coma", () => {
    expect(formatearNumero(8400)).toBe("8.400");
    expect(formatearNumero(12.5)).toBe("12,5");
    expect(formatearNumero(1234567.25)).toBe("1.234.567,25");
    expect(formatearNumero(3)).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Alcance por variedad (decisión de Nicolás, 2026-09-25)
// ---------------------------------------------------------------------------
import { alcanceDeVariedad, alcancePorVariedad, conAlcanceVariedad, resumenAlcance, NOTA_ESTADO_FENOLOGICO } from "./informeAlcance";

describe("alcance por variedad", () => {
  const base = { variedades: ["Biloxi", "Ventura", "Emerald"], variedad: "Biloxi" };

  test("cada variedad lleva su propio valor y su propia unidad", () => {
    let inf = conAlcanceVariedad(base, "Biloxi", "4", "ha");
    inf = conAlcanceVariedad(inf, "Ventura", "3,5", "ha");
    inf = conAlcanceVariedad(inf, "Emerald", "8400", "plantas");
    const filas = alcancePorVariedad(inf);
    expect(filas).toHaveLength(3);
    expect(filas[0].etiqueta).toBe("4 ha");
    expect(filas[1].etiqueta).toBe("3,5 ha");
    expect(filas[2].etiqueta).toBe("8.400 plantas");
  });

  test("no se suma ni se convierte entre variedades ni entre unidades", () => {
    let inf = conAlcanceVariedad(base, "Biloxi", "4", "ha");
    inf = conAlcanceVariedad(inf, "Emerald", "8400", "plantas");
    const r = resumenAlcance(inf);
    expect(r.modo).toBe("porVariedad");
    expect(r.etiqueta).toBe("Biloxi: 4 ha · Ventura: sin definir · Emerald: 8.400 plantas");
    expect(r).not.toHaveProperty("total");
    expect(r.completo).toBe(false);
    expect(r.faltan).toEqual(["Ventura"]);
  });

  test("una variedad sin cargar dice «sin definir», nunca cero", () => {
    const a = alcanceDeVariedad(base, "Ventura");
    expect(a.completo).toBe(false);
    expect(a.etiqueta).toBe(SIN_DEFINIR);
    expect(a.valor).toBeNull();
  });

  test("declarar una variedad no toca a las otras ni muta el informe", () => {
    const uno = conAlcanceVariedad(base, "Biloxi", "4", "ha");
    const dos = conAlcanceVariedad(uno, "Ventura", "3,5", "ha");
    expect(alcanceDeVariedad(dos, "Biloxi").etiqueta).toBe("4 ha");
    expect(base.alcanceVariedades).toBeUndefined();
    expect(alcanceDeVariedad(uno, "Ventura").completo).toBe(false);
  });

  test("informe antiguo: sigue mostrando su superficie del informe completo, sin repartirla", () => {
    const r = resumenAlcance({ variedad: "Biloxi", superficie: "12,5" });
    expect(r.modo).toBe("historico");
    expect(r.etiqueta).toBe("12,5 ha");
    expect(r.procedencia).toBe("Superficie evaluada (há)");
    expect(r.filas).toEqual([]);          // no se creo una fila por variedad
  });

  test("informe sin nada: sin definir, con la lista de variedades que faltan", () => {
    const r = resumenAlcance(base);
    expect(r.modo).toBe("sinDefinir");
    expect(r.etiqueta).toBe(SIN_DEFINIR);
    expect(r.faltan).toEqual(["Biloxi", "Ventura", "Emerald"]);
  });

  test("el estado fenológico es uno solo para todas las variedades", () => {
    expect(NOTA_ESTADO_FENOLOGICO).toMatch(/el mismo para todas las variedades/i);
  });
});

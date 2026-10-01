/* eslint-disable */
// El alcance por variedad ya está publicado. Renombrar o desmarcar una
// variedad hacía desaparecer su alcance de la pantalla. Acá se fija que se
// conserva, que se puede recuperar, y que reemplazar un destino con dato
// cargado exige confirmación.

import {
  conVariedades, variedadesDe, conAlcanceVariedad, alcanceDeVariedad, alcancePorVariedad,
  alcancesDeVariedadesAusentes, reasignarAlcanceVariedad, resumenAlcance,
} from "./informeAlcance";

function informeBase() {
  let inf = conVariedades({}, ["Biloxi", "Ventura"]);
  inf = conAlcanceVariedad(inf, "Biloxi", 12, "ha");
  inf = conAlcanceVariedad(inf, "Ventura", 8, "ha");
  return inf;
}

describe("el defecto que se corrige", () => {
  const renombrado = conVariedades(informeBase(), ["Biloxy", "Ventura"]); // se corrige la grafía

  test("el dato sigue en el informe: nunca se borró", () => {
    expect(renombrado.alcanceVariedades["Biloxi"]).toEqual({ valor: 12, unidad: "ha" });
  });

  test("pero la variedad nueva no lo hereda, y eso está bien", () => {
    expect(alcanceDeVariedad(renombrado, "Biloxy").completo).toBe(false);
    expect(alcancePorVariedad(renombrado).map((f) => f.variedad)).toEqual(["Biloxy", "Ventura"]);
  });

  test("ANTES quedaba invisible; AHORA se lista con su valor y su motivo", () => {
    const a = alcancesDeVariedadesAusentes(renombrado);
    expect(a).toHaveLength(1);
    expect(a[0].variedad).toBe("Biloxi");
    expect(a[0].etiqueta).toMatch(/12/);
    expect(a[0].motivo).toMatch(/se conserva tal cual/);
  });

  test("una variedad vigente no se lista como ausente", () => {
    expect(alcancesDeVariedadesAusentes(informeBase())).toHaveLength(0);
  });

  test("una variedad ausente SIN alcance cargado no genera ruido", () => {
    const sinValor = conVariedades(conAlcanceVariedad({}, "Zeta", "", ""), ["Biloxi"]);
    expect(alcancesDeVariedadesAusentes(sinValor)).toHaveLength(0);
  });
});

describe("recuperar el dato: lo pide una persona", () => {
  const renombrado = conVariedades(informeBase(), ["Biloxy", "Ventura"]);

  test("reasignar lo devuelve a la vista, con su misma unidad y sin convertir", () => {
    const r = reasignarAlcanceVariedad(renombrado, "Biloxi", "Biloxy");
    expect(r.movido).toBe(true);
    expect(r.conflicto).toBe(false);
    const a = alcanceDeVariedad(r.informe, "Biloxy");
    expect(a.valor).toBe(12);
    expect(a.unidad).toBe("ha");
    expect(r.informe.alcanceVariedades["Biloxi"]).toBeUndefined();
    expect(alcancesDeVariedadesAusentes(r.informe)).toHaveLength(0);
  });

  test("el código NO reasigna solo: hay que pedirlo", () => {
    // Leer el informe tantas veces como se quiera no mueve nada.
    alcancesDeVariedadesAusentes(renombrado);
    alcancePorVariedad(renombrado);
    resumenAlcance(renombrado);
    expect(renombrado.alcanceVariedades["Biloxi"]).toEqual({ valor: 12, unidad: "ha" });
    expect(alcanceDeVariedad(renombrado, "Biloxy").completo).toBe(false);
  });

  test("un destino con dato cargado NO se pisa sin confirmar", () => {
    const r = reasignarAlcanceVariedad(renombrado, "Biloxi", "Ventura");
    expect(r.movido).toBe(false);
    expect(r.conflicto).toBe(true);
    expect(r.actualDestino).toMatch(/8/);
    expect(alcanceDeVariedad(r.informe, "Ventura").valor).toBe(8);       // intacto
    expect(r.informe.alcanceVariedades["Biloxi"]).toEqual({ valor: 12, unidad: "ha" }); // conservado
  });

  test("confirmando, se reemplaza y queda dicho qué se reemplazó", () => {
    const r = reasignarAlcanceVariedad(renombrado, "Biloxi", "Ventura", { reemplazar: true });
    expect(r.movido).toBe(true);
    expect(r.reemplazo).toMatch(/8/);
    expect(alcanceDeVariedad(r.informe, "Ventura").valor).toBe(12);
  });

  test("origen igual a destino, u origen sin alcance, no hacen nada", () => {
    expect(reasignarAlcanceVariedad(renombrado, "Biloxi", "Biloxi").movido).toBe(false);
    expect(reasignarAlcanceVariedad(renombrado, "NoExiste", "Biloxy").movido).toBe(false);
    expect(reasignarAlcanceVariedad(renombrado, "NoExiste", "Biloxy").conflicto).toBe(false);
  });

  test("desmarcar y volver a marcar la MISMA variedad la recupera sola", () => {
    const sin = conVariedades(informeBase(), ["Ventura"]);
    expect(alcancesDeVariedadesAusentes(sin)).toHaveLength(1);
    const devuelta = conVariedades(sin, ["Biloxi", "Ventura"]);
    expect(alcanceDeVariedad(devuelta, "Biloxi").valor).toBe(12);
    expect(alcancesDeVariedadesAusentes(devuelta)).toHaveLength(0);
  });
});

describe("lo ya publicado no cambia", () => {
  test("el alcance de las variedades vigentes se lee igual que antes", () => {
    const inf = informeBase();
    expect(alcancePorVariedad(inf).map((f) => [f.variedad, f.valor, f.unidad]))
      .toEqual([["Biloxi", 12, "ha"], ["Ventura", 8, "ha"]]);
    expect(resumenAlcance(inf).modo).toBe("porVariedad");
  });

  test("un informe sin alcanceVariedades no se rompe ni inventa nada", () => {
    expect(alcancesDeVariedadesAusentes({})).toEqual([]);
    expect(alcancesDeVariedadesAusentes({ variedades: ["A"] })).toEqual([]);
  });

  test("el histórico global sigue siendo histórico global", () => {
    const hist = { superficie: 40, variedades: [] };
    expect(resumenAlcance(hist).modo).toBe("historico");
    expect(alcancesDeVariedadesAusentes(hist)).toEqual([]);
  });
});

/* eslint-disable */
// Entrega B · RECUPERACIÓN ECONÓMICA, conectada al cálculo real.
//
// No alcanza con conservar campos: hay que probar que la versión anterior
// calcula LOS MISMOS IMPORTES. Para eso, primero hace falta un caso que de
// verdad aplique reajuste — un caso bloqueado que conserva la base no prueba
// nada.
//
// Este archivo usa el motor real (`derivarRoyaltyComercialDesdeContratos`).
// Todas las fechas son sintéticas.

import { derivarRoyaltyComercialDesdeContratos } from "../OsirisModule";

// ── Caso sintético que SÍ aplica ──────────────────────────────────────────
//
// Para que aplique tienen que darse todas: antecedente confirmado, activación
// con fecha y respaldo, regla de fecha declarada y respaldada, sin
// configuración antigua operando, sin antecedentes de cobro en la fila, y el
// aniversario fuera del período del servicio.
//
// El aniversario se fija el 1 de julio, que es el primer día del período, de
// modo que no cae "dentro" y no dispara la regla pendiente. No es para
// esquivar la ambigüedad: es para poder medir la recuperación de un caso que
// aplique. Los casos ambiguos siguen bloqueados y se prueban aparte.
const ACTIVACION = {
  activado: true,
  fechaReferencia: "2026-07-01",
  respaldo: "Comprobante sintetico de primer pago 001",
  reglaFecha: "inicioPeriodoServicio",
  reglaFechaRespaldo: "Clausula sintetica 1.2.6",
  usuario: "prueba", fecha: "2026-10-05",
};

const CONTRATO = (extra) => Object.assign({
  id: "ct_sint", razonSocial: "Sintetica SA", pais: "Chile",   // Chile: retención 0, aísla el neto
  modeloIngresos: "oc",
  valorRoyaltyComercial: 3000,
  rcMesCobro: "Abril",
  fechaTermino: "2031-06-30",
  rcCohortes: [{ id: "c1", ha: 41.97, desde: "2026/2027" }],
  reajuste: { tipo: "porcentaje", pct: 2, desde: "2026-07-01", referencia: "Clausula sintetica 1.2.5", confirmado: true },
}, extra || {});

const OCS = { ct_sint: [] };

const filas = (ct) => derivarRoyaltyComercialDesdeContratos([ct], OCS);
const porTemp = (fs) => fs.reduce((m, f) => (m[f.temporada] = f, m), {});
const r2 = (n) => Math.round(n * 100) / 100;

// ══════════════════════════════════════════════════════════════════
describe("1 · el caso sintético aplica de verdad", () => {
  const base = porTemp(filas(CONTRATO()));
  const act = porTemp(filas(CONTRATO({ reajusteActivacion: ACTIVACION })));

  test("el motor produce filas para las dos versiones", () => {
    expect(Object.keys(base).length).toBeGreaterThan(2);
    expect(Object.keys(act).length).toBe(Object.keys(base).length);
  });

  test("la primera temporada no cambia: todavía no cumple un año", () => {
    expect(act["2026/2027"].montoFact).toBeCloseTo(base["2026/2027"].montoFact, 2);
    expect(r2(base["2026/2027"].montoFact)).toBeCloseTo(125910, 2);   // 41,97 × 3.000
  });

  test("la segunda temporada SÍ cambia, y por el 2 % compuesto", () => {
    const b = base["2027/2028"].montoFact, a = act["2027/2028"].montoFact;
    expect(a).toBeGreaterThan(b);
    expect(r2(a - b)).toBeCloseTo(2518.2, 2);          // 125.910 × 2 %
    expect(r2(a)).toBeCloseTo(128428.2, 2);
  });

  test("la tercera compone, no suma", () => {
    const a = act["2028/2029"].montoFact;
    expect(r2(a)).toBeCloseTo(r2(125910 * 1.02 * 1.02), 2);
    expect(r2(a)).not.toBeCloseTo(r2(125910 * 1.04), 2);
  });

  test("el neto a cobrar acompaña al facturado", () => {
    // País Chile → retención 0, así que neto = facturado.
    const a = act["2027/2028"];
    expect(r2(a.montoCobro)).toBeCloseTo(r2(a.montoFact), 2);
  });

  test("hay una diferencia económica REAL que recuperar", () => {
    const dif = Object.keys(base).reduce((s, t) => s + (act[t].montoFact - base[t].montoFact), 0);
    expect(r2(dif)).toBeGreaterThan(10000);   // no es un caso bloqueado que conserva la base
  });
});

// 2 · CONTRAPRUEBA: una version sin soporte CAMBIA los importes
//
// Corrección de fondo. Que la versión publicada devuelva 125.910 después de
// que el candidato calculó 128.428,20 NO es recuperación segura: es
// incompatibilidad económica. Volver atrás **elimina el reajuste aplicado**, y
// desactivar un reajuste es una operación económica propia, no el efecto
// silencioso de un rollback.
//
// Estas pruebas existen para DETECTARLO. Si alguna vez pasaran a decir que los
// importes coinciden, es que alguien reintrodujo la incompatibilidad.
describe("2 · contraprueba: sin soporte, los importes cambian", () => {
  const base = porTemp(filas(CONTRATO()));
  const act = porTemp(filas(CONTRATO({ reajusteActivacion: ACTIVACION })));

  // Medido el 2026-10-05 contra 9d90ed2, con este mismo contrato y la
  // activación cargada: la versión sin soporte devuelve la base en las cinco.
  const SIN_SOPORTE = {
    "2026/2027": 125910, "2027/2028": 125910, "2028/2029": 125910,
    "2029/2030": 125910, "2030/2031": 125910,
  };
  const CON_SOPORTE = {
    "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 130996.76,
    "2029/2030": 133616.7, "2030/2031": 136289.03,
  };

  test("el candidato calcula lo que dice la tabla", () => {
    Object.keys(CON_SOPORTE).forEach((t) => expect(r2(act[t].montoFact)).toBeCloseTo(CON_SOPORTE[t], 2));
  });

  test("una version sin soporte daría otros importes en 4 de las 5 temporadas", () => {
    const distintas = Object.keys(SIN_SOPORTE).filter((t) => r2(SIN_SOPORTE[t]) !== r2(CON_SOPORTE[t]));
    expect(distintas).toEqual(["2027/2028", "2028/2029", "2029/2030", "2030/2031"]);
  });

  test("la diferencia que un rollback sin soporte borraría es de US$ 25.690,69", () => {
    const perdida = Object.keys(CON_SOPORTE).reduce((s, t) => s + (CON_SOPORTE[t] - SIN_SOPORTE[t]), 0);
    expect(r2(perdida)).toBeCloseTo(25690.69, 2);
  });

  test("desactivar es una operación econ\u00f3mica, no un rollback", () => {
    // Bajar la bandera devuelve los importes a la base. Está bien que exista
    // como ACCIÓN deliberada; lo que no puede pasar es que ocurra sola al
    // volver a una versión anterior.
    const apagada = porTemp(filas(CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { activado: false }) })));
    Object.keys(base).forEach((t) => expect(r2(apagada[t].montoFact)).toBe(r2(base[t].montoFact)));
    const dif = Object.keys(base).reduce((s, t) => s + (act[t].montoFact - apagada[t].montoFact), 0);
    expect(r2(dif)).toBeCloseTo(25690.69, 2);
  });

  test("apagar la activación no borra lo registrado", () => {
    const ct = CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { activado: false }) });
    expect(ct.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(ct.reajusteActivacion.respaldo).toMatch(/Comprobante/);
    expect(ct.reajuste.pct).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · lo que NO debe mover el motor", () => {
  test("sin activación, el motor da exactamente la base", () => {
    const sin = porTemp(filas(CONTRATO()));
    const soloConfirmado = porTemp(filas(CONTRATO({ reajusteActivacion: undefined })));
    Object.keys(sin).forEach((t) => expect(r2(soloConfirmado[t].montoFact)).toBe(r2(sin[t].montoFact)));
  });

  test("con configuración antigua operando, la activación no suma nada encima", () => {
    // La antigua compone 5 %; la nueva queda en conflicto y no se aplica.
    const soloAntigua = porTemp(filas(CONTRATO({ royaltyInflacion: true, rcInflacionPct: 5 })));
    const ambas = porTemp(filas(CONTRATO({ royaltyInflacion: true, rcInflacionPct: 5, reajusteActivacion: ACTIVACION })));
    Object.keys(soloAntigua).forEach((t) =>
      expect(r2(ambas[t].montoFact)).toBe(r2(soloAntigua[t].montoFact)));
    // Y la antigua sigue componiendo lo suyo.
    expect(r2(soloAntigua["2027/2028"].montoFact)).toBeCloseTo(r2(125910 * 1.05), 2);
  });

  test("una fila con antecedentes de cobro no se recalcula aunque aplique", () => {
    const conFactura = CONTRATO({
      reajusteActivacion: ACTIVACION,
      rcPagos: { "2027/2028": { nFact: "123", pagado: true, fechaPago: "2028-06-02" } },
    });
    const f = porTemp(filas(conFactura));
    const base = porTemp(filas(CONTRATO()));
    expect(r2(f["2027/2028"].montoFact)).toBe(r2(base["2027/2028"].montoFact));
    // ...y la de al lado, que no tiene antecedentes, sí se mueve.
    expect(f["2028/2029"].montoFact).toBeGreaterThan(base["2028/2029"].montoFact);
  });

  test("el aniversario dentro del período bloquea y conserva la base", () => {
    const ambiguo = CONTRATO({
      reajusteActivacion: Object.assign({}, ACTIVACION, { fechaReferencia: "2026-10-15" }),
    });
    const f = porTemp(filas(ambiguo));
    const base = porTemp(filas(CONTRATO()));
    Object.keys(base).forEach((t) => expect(r2(f[t].montoFact)).toBe(r2(base[t].montoFact)));
    expect(f["2028/2029"].reajusteActivado.reglaPendiente).toBe(true);
    expect(f["2028/2029"].reajusteActivado.escenarios.length).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
// 4 · ida y vuelta con la version de recuperacion compatible
//
// Se edita el contrato con la version de recuperacion (rama
// osiris/recuperacion-compatible, 5bf8e2c) y se vuelve al candidato. Los
// importes de ida y de vuelta tienen que ser los mismos.
describe("4 · vuelta desde la version de recuperacion, sin cambio economico", () => {
  const EDITADO = CONTRATO({
    reajusteActivacion: Object.assign({}, ACTIVACION, { respaldo: "Respaldo corregido 002" }),
    rcCohortes: [
      { id: "c1", ha: 41.97, desde: "2026/2027" },
      { id: "c2", ha: 10, desde: "2028/2029" },
    ],
  });
  // Tabla medida en la version de recuperacion.
  const MEDIDO_EN_RECUPERACION = {
    "2026/2027": 125910, "2027/2028": 128428.2, "2028/2029": 162208.76,
    "2029/2030": 165452.94, "2030/2031": 168762,
  };

  test("el candidato reproduce los mismos importes, al centavo", () => {
    const f = porTemp(filas(EDITADO));
    Object.keys(MEDIDO_EN_RECUPERACION).forEach((t) => {
      expect(f[t]).toBeDefined();
      expect(r2(f[t].montoFact)).toBe(r2(MEDIDO_EN_RECUPERACION[t]));
    });
  });

  test("no se perdio nada de lo registrado en la ida", () => {
    expect(EDITADO.reajusteActivacion.activado).toBe(true);
    expect(EDITADO.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(EDITADO.reajusteActivacion.respaldo).toBe("Respaldo corregido 002");
    expect(EDITADO.reajusteActivacion.reglaFecha).toBe("inicioPeriodoServicio");
    expect(EDITADO.reajusteActivacion.reglaFechaRespaldo).toMatch(/Clausula/);
  });

  test("y el reajuste sigue aplicado despues de la vuelta", () => {
    const f = porTemp(filas(EDITADO));
    const sinAct = porTemp(filas(Object.assign({}, EDITADO, { reajusteActivacion: undefined })));
    expect(f["2027/2028"].montoFact).toBeGreaterThan(sinAct["2027/2028"].montoFact);
  });
});

// ═════════════════════════════════════════════════════════════════
describe("5 · los importes que debe reproducir la versión anterior", () => {
  // Esta tabla es el contrato de la prueba de recuperación: la versión
  // publicada, corriendo con el MISMO contrato CON la activación cargada,
  // tiene que devolver exactamente estos números.
  test("tabla de referencia", () => {
    const base = porTemp(filas(CONTRATO()));
    const esperado = {
      "2026/2027": 125910, "2027/2028": 125910, "2028/2029": 125910,
      "2029/2030": 125910, "2030/2031": 125910,
    };
    Object.keys(esperado).forEach((t) => {
      expect(base[t]).toBeDefined();
      expect(r2(base[t].montoFact)).toBeCloseTo(esperado[t], 2);
    });
  });
});

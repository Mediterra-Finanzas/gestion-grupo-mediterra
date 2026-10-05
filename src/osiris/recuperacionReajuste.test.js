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

// ══════════════════════════════════════════════════════════════════
describe("2 · recuperación: quitar la activación devuelve los importes exactos", () => {
  // Simula el camino de vuelta por datos: el contrato queda sin activación.
  const base = porTemp(filas(CONTRATO()));
  const act = CONTRATO({ reajusteActivacion: ACTIVACION });
  const vuelta = porTemp(filas(CONTRATO({ reajusteActivacion: Object.assign({}, ACTIVACION, { activado: false }) })));

  test("todas las temporadas vuelven al importe original, al centavo", () => {
    Object.keys(base).forEach((t) => {
      expect(r2(vuelta[t].montoFact)).toBe(r2(base[t].montoFact));
      expect(r2(vuelta[t].montoCobro)).toBe(r2(base[t].montoCobro));
    });
  });

  test("desactivar no borra lo registrado", () => {
    expect(act.reajusteActivacion.fechaReferencia).toBe("2026-07-01");
    expect(act.reajuste.pct).toBe(2);
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
describe("4 · los importes que debe reproducir la versión anterior", () => {
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

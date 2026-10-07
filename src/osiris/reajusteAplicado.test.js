/* eslint-disable */
// Entrega B · Modelo puro de activación del reajuste.
// Todas las fechas son SINTÉTICAS. No hay ninguna fecha real de Olmos acá.

import {
  aniversario, periodosCumplidos, dependeDeRegla29Feb, REGLA_29_FEBRERO,
  limitesTemporada, fechaCobroDeTemporada, fechasDeLaFila,
  aniversarioDentroDeTemporada, antecedentesDeCobro, configAntiguaOperando,
  reglaFechaAplicable, estadoActivacion, reajusteDeFila, previsualizarActivacion,
  SIN_ACTIVAR, ACTIVADO, NO_ACTIVABLE, CONFLICTO_CON_ANTIGUA, REGLAS_FECHA,
} from "./reajusteAplicado";

const REAJ = (extra) => Object.assign(
  { tipo: "porcentaje", pct: 2, desde: "2027-01-01", referencia: "Clausula sintetica 1.2.5", confirmado: true },
  extra || {}
);
// Activación completa: fecha, respaldo, regla de fecha y su respaldo.
const ACT_OK = {
  activado: true, fechaReferencia: "2026-03-15", respaldo: "Comprobante sintetico 001",
  reglaFecha: "emision", reglaFechaRespaldo: "Clausula sintetica 1.2.6",
  usuario: "prueba", fecha: "2026-10-05",
};
// Estas activaciones se arman a mano. La accion autorizada SIEMPRE produce
// un sello, y desde que el motor lo exige, armarlas sin sello probaria otra
// cosa. El ayudante sella con los mismos terminos, que es exactamente lo que
// haria `activar()`. Las que a proposito vienen incompletas se dejan igual:
// ahi lo que se prueba es el hueco.
const CT = (reaj, act, extra) => Object.assign(
  {
    id: "c1", pais: "Peru", valorRoyaltyComercial: 3000, reajuste: reaj,
    reajusteActivacion: (act && act.activado === true && !act.sello)
      ? Object.assign({}, act, {
          sello: { pct: (reaj || {}).pct, fechaReferencia: act.fechaReferencia, reglaFecha: act.reglaFecha },
        })
      : act,
  },
  extra || {}
);
const FILA = (temporada, montoFact) => ({ temporada, montoFact });
// Emisión fuera de la temporada para aislar la regla del aniversario.
const EMI = (f) => ({ fechaEst: f });

// ══════════════════════════════════════════════════════════════════
describe("1 · el aniversario: el día antes, el mismo día y el siguiente", () => {
  const D = "2026-03-15";

  test("el día ANTERIOR al primer aniversario no cumple ningún período", () => {
    expect(periodosCumplidos(D, "2027-03-14")).toBe(0);
  });

  test("el MISMO día del aniversario ya cumple uno", () => {
    expect(periodosCumplidos(D, "2027-03-15")).toBe(1);
  });

  test("el día SIGUIENTE sigue en uno, no en dos", () => {
    expect(periodosCumplidos(D, "2027-03-16")).toBe(1);
  });

  test("lo mismo en el segundo y el tercer aniversario", () => {
    expect(periodosCumplidos(D, "2028-03-14")).toBe(1);
    expect(periodosCumplidos(D, "2028-03-15")).toBe(2);
    expect(periodosCumplidos(D, "2028-03-16")).toBe(2);
    expect(periodosCumplidos(D, "2029-03-14")).toBe(2);
    expect(periodosCumplidos(D, "2029-03-15")).toBe(3);
  });

  test("antes de la fecha de referencia no hay períodos, ni negativos", () => {
    expect(periodosCumplidos(D, "2025-01-01")).toBe(0);
    expect(periodosCumplidos(D, "2026-03-15")).toBe(0);
  });

  test("una fecha inválida no produce períodos ni revienta", () => {
    expect(periodosCumplidos("", "2030-01-01")).toBe(0);
    expect(periodosCumplidos("2026-02-31", "2030-01-01")).toBe(0);
    expect(aniversario("no-es-fecha", 1)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · el 29 de febrero es una propuesta, no una regla decidida", () => {
  test("queda declarada como pendiente de aprobación", () => {
    expect(REGLA_29_FEBRERO.aprobada).toBe(false);
    expect(REGLA_29_FEBRERO.nota).toMatch(/pendiente de aprobación/);
    expect(REGLA_29_FEBRERO.alternativa).toBe("primeroDeMarzo");
  });

  test("se puede saber si una fecha de referencia depende de esa decisión", () => {
    expect(dependeDeRegla29Feb("2028-02-29")).toBe(true);
    expect(dependeDeRegla29Feb("2028-02-28")).toBe(false);
    expect(dependeDeRegla29Feb("2026-03-15")).toBe(false);
  });

  test("la propuesta vigente da el 28, y queda fijada para poder compararla", () => {
    expect(aniversario("2028-02-29", 1).toISOString().slice(0, 10)).toBe("2029-02-28");
    expect(aniversario("2028-02-29", 4).toISOString().slice(0, 10)).toBe("2032-02-29");
    expect(periodosCumplidos("2028-02-29", "2029-02-27")).toBe(0);
    expect(periodosCumplidos("2028-02-29", "2029-02-28")).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · las cuatro fechas son distintas y ninguna manda por defecto", () => {
  test("la regla no está definida mientras no se declare", () => {
    const r = reglaFechaAplicable(CT(REAJ(), { activado: true, fechaReferencia: "2026-03-15", respaldo: "x" }));
    expect(r.definida).toBe(false);
    expect(r.motivo).toMatch(/cuatro fechas distintas/);
    expect(r.opciones).toEqual(REGLAS_FECHA);
  });

  test("declararla sin respaldo tampoco alcanza", () => {
    const r = reglaFechaAplicable(CT(REAJ(), { activado: true, fechaReferencia: "2026-03-15", respaldo: "x", reglaFecha: "emision" }));
    expect(r.definida).toBe(false);
    expect(r.motivo).toMatch(/sin respaldo documental/);
  });

  test("sin regla respaldada, la activación no queda activa", () => {
    const e = estadoActivacion(CT(REAJ(), { activado: true, fechaReferencia: "2026-03-15", respaldo: "x" }));
    expect(e.estado).toBe(SIN_ACTIVAR);
    expect(e.faltan).toContain("regla de fecha aplicable");
  });

  test("la fila expone las cuatro fechas por separado", () => {
    const f = fechasDeLaFila(FILA("2027/2028", 100), { fechaEst: "2028-04-01", fechaPago: "2028-07-20" }, "Abril");
    expect(f.inicioPeriodoServicio.toISOString().slice(0, 10)).toBe("2027-07-01");
    expect(f.finPeriodoServicio.toISOString().slice(0, 10)).toBe("2028-06-30");
    expect(f.emision.toISOString().slice(0, 10)).toBe("2028-04-01");
    expect(f.pago.toISOString().slice(0, 10)).toBe("2028-07-20");
    expect(f.cobroEstimadoPorElMotor.toISOString().slice(0, 10)).toBe("2028-04-01");
  });

  test("la fecha de cobro del motor NO se usa como ancla", () => {
    // Regla declarada "emision", y la fila no tiene emisión cargada: no aplica,
    // aunque el motor tenga una fecha de cobro estimada.
    const ct = CT(REAJ(), ACT_OK);
    const r = reajusteDeFila(ct, FILA("2030/2031", 100), { mesCobro: "Abril" });
    expect(r.aplica).toBe(false);
    expect(r.ajustado).toBe(100);
    expect(r.motivo).toMatch(/esa fecha no está cargada en esta fila/);
  });

  test("la regla elegida cambia el ancla, y eso se nota", () => {
    // Emisión vs inicio del período del servicio, sobre la misma fila.
    const ancla = Object.assign({}, ACT_OK, { fechaReferencia: "2026-07-01" });
    const porEmision = CT(REAJ(), ancla);
    const porInicio = CT(REAJ(), Object.assign({}, ancla, { reglaFecha: "inicioPeriodoServicio" }));
    const ante = { fechaEst: "2029-04-01" };
    const a = reajusteDeFila(porEmision, FILA("2028/2029", 100), { antecedentes: ante });
    const b = reajusteDeFila(porInicio, FILA("2028/2029", 100), { antecedentes: ante });
    expect(a.periodos).toBe(2);   // emisión 2029-04-01
    expect(b.periodos).toBe(2);   // inicio 2028-07-01 → también 2, pero por otra fecha
    expect(a.fechas.emision.toISOString().slice(0, 10)).toBe("2029-04-01");
    expect(b.fechas.inicioPeriodoServicio.toISOString().slice(0, 10)).toBe("2028-07-01");
    // Y una fila donde las dos fechas dan distinto:
    const c = reajusteDeFila(porEmision, FILA("2027/2028", 100), { antecedentes: { fechaEst: "2028-04-01" } });
    const d = reajusteDeFila(porInicio, FILA("2027/2028", 100), { antecedentes: { fechaEst: "2028-04-01" } });
    expect(c.periodos).toBe(1);   // emisión 2028-04-01
    expect(d.periodos).toBe(1);   // inicio 2027-07-01
    expect(c.fechas.emision.toISOString().slice(0, 10)).not.toBe(d.fechas.inicioPeriodoServicio.toISOString().slice(0, 10));
  });

  test('con regla "pago", la proteccion de filas limita el mecanismo', () => {
    // Corrección: la fecha del primer pago que FIJA el aniversario contractual
    // no es la fecha de pago de la fila que se recalcula. Son cosas distintas.
    // Lo que sí se observa, y es lo único que esta prueba afirma: si la regla
    // declarada toma la fecha de pago DE LA FILA, esa misma fila queda
    // protegida por tener antecedente de cobro, así que el mecanismo no la
    // alcanza. No prueba que una regla contractual basada en un pago sea
    // inaplicable, y ese caso no se resuelve ni se implementa acá.
    const porPago = CT(REAJ(), Object.assign({}, ACT_OK, { reglaFecha: "pago", fechaReferencia: "2026-07-01" }));
    const conPago = reajusteDeFila(porPago, FILA("2028/2029", 100), { antecedentes: { fechaPago: "2029-04-01" } });
    expect(conPago.intocable).toBe(true);
    expect(conPago.ajustado).toBe(100);
    const sinPago = reajusteDeFila(porPago, FILA("2028/2029", 100), { antecedentes: {} });
    expect(sinPago.aplica).toBe(false);
    expect(sinPago.motivo).toMatch(/esa fecha no está cargada en esta fila/);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · confirmar no es activar", () => {
  test("antecedente confirmado y sin activar: no aplica nada y lo dice", () => {
    const e = estadoActivacion(CT(REAJ(), undefined));
    expect(e.estado).toBe(SIN_ACTIVAR);
    expect(e.motivo).toMatch(/Confirmar y activar son dos acciones/);
  });

  test("antecedente incompleto: ni siquiera es activable", () => {
    expect(estadoActivacion(CT(REAJ({ confirmado: false }), ACT_OK)).estado).toBe(NO_ACTIVABLE);
  });

  test("sin fecha de referencia o sin respaldo, no se aplica", () => {
    expect(estadoActivacion(CT(REAJ(), { activado: true, respaldo: "x" })).faltan).toContain("fecha de referencia");
    expect(estadoActivacion(CT(REAJ(), { activado: true, fechaReferencia: "2026-03-15" })).faltan).toContain("respaldo de la fecha");
  });

  test("con todo completo y sin configuración antigua, queda activo", () => {
    const e = estadoActivacion(CT(REAJ(), ACT_OK));
    expect(e.estado).toBe(ACTIVADO);
    expect(e.activo).toBe(true);
  });

  test("por índice no se puede activar: falta la serie publicada", () => {
    const e = estadoActivacion(CT(REAJ({ tipo: "indice", indice: "IPC", fuente: "INEI", fechaBase: "2026-01-01" }), ACT_OK));
    expect(e.estado).toBe(NO_ACTIVABLE);
    expect(e.motivo).toMatch(/serie publicada/);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · con configuración antigua operando, la nueva NO se presenta como activa", () => {
  const ct = CT(REAJ(), ACT_OK, { royaltyInflacion: true, rcInflacionPct: 5 });

  test("el estado es conflicto, no activado", () => {
    const e = estadoActivacion(ct);
    expect(e.estado).toBe(CONFLICTO_CON_ANTIGUA);
    expect(e.activo).toBe(false);
    expect(e.pctAntiguo).toBe(5);
    expect(e.pctNuevo).toBe(2);
    expect(e.motivo).toMatch(/configuración antigua OPERANDO/);
    expect(e.motivo).toMatch(/no se sustituye una por otra/i);
  });

  test("ninguna fila se mueve mientras haya conflicto", () => {
    const r = reajusteDeFila(ct, FILA("2029/2030", 125910), { antecedentes: EMI("2030-04-01") });
    expect(r.aplica).toBe(false);
    expect(r.ajustado).toBe(125910);
    expect(r.diferencia).toBe(0);
  });

  test("los resultados de la antigua se conservan: no se toca el contrato", () => {
    const copia = JSON.parse(JSON.stringify(ct));
    estadoActivacion(ct);
    reajusteDeFila(ct, FILA("2029/2030", 100), { antecedentes: EMI("2030-04-01") });
    expect(ct).toEqual(copia);
    expect(configAntiguaOperando(ct)).toEqual({ opera: true, pct: 5 });
  });
});

// ══════════════════════════════════════════════════════════════════
describe("6 · el aniversario dentro del período del servicio BLOQUEA la aplicación", () => {
  const ct = CT(REAJ(), ACT_OK);   // referencia 2026-03-15 → aniversarios en marzo

  test("se detecta que cae dentro del período", () => {
    const d = aniversarioDentroDeTemporada("2026-03-15", "2026/2027");
    expect(d.cae).toBe(true);
    expect(d.fecha.toISOString().slice(0, 10)).toBe("2027-03-15");
  });

  test("la fila queda bloqueada y el monto sigue siendo la base", () => {
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { antecedentes: EMI("2027-04-01") });
    expect(r.reglaPendiente).toBe(true);
    expect(r.bloqueado).toBe(true);
    expect(r.aplica).toBe(false);
    expect(r.ajustado).toBe(125910);      // ni el escenario alto ni el bajo
    expect(r.diferencia).toBe(0);
  });

  test("los escenarios se muestran, marcados como no confirmados", () => {
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { antecedentes: EMI("2027-04-01") });
    expect(r.escenarios.length).toBe(3);
    expect(r.escenarios.every((e) => e.confirmado === false)).toBe(true);
    const nombres = r.escenarios.map((e) => e.nombre);
    expect(nombres).toContain("período entero al valor nuevo");
    expect(nombres).toContain("al valor anterior hasta el período siguiente");
    const prorrateo = r.escenarios.find((e) => /prorrateo/.test(e.nombre));
    expect(prorrateo.monto).toBeNull();   // no se calcula: falta decidir la base
  });

  test("ningún importe no confirmado entra en los totales", () => {
    const p = previsualizarActivacion(ct,
      [FILA("2026/2027", 100), FILA("2027/2028", 100)],
      { antecedentesDe: () => EMI("2028-04-01") });
    expect(p.filasBloqueadasPorReglaPendiente).toBe(2);
    expect(p.filasQueCambian).toBe(0);
    expect(p.totalAplicado).toBe(p.totalBase);
    expect(p.diferenciaAplicada).toBe(0);
  });

  test("con un ancla a mitad de año, el bloqueo alcanza a TODOS los períodos", () => {
    // El aniversario se repite cada año: con temporada julio–junio cae dentro
    // de cada una. No es una fila, son todas. No se cambia el ancla para
    // esquivarlo: se bloquea y se decide.
    const p = previsualizarActivacion(ct,
      [FILA("2026/2027", 100), FILA("2027/2028", 100), FILA("2028/2029", 100)],
      { antecedentesDe: () => EMI("2029-04-01") });
    expect(p.filasBloqueadasPorReglaPendiente).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("7 · antecedentes de factura y pago: todos, no solo una fecha", () => {
  test("cada antecedente por separado protege la fila", () => {
    [
      { nFact: "123" },
      { pagado: true },
      { fechaPago: "2028-06-02" },
      { montoFacturado: 125910 },
      { parciales: [{ nFact: "A-1" }] },
      { parciales: [{ monto: 500 }] },
      { parciales: [{ pagado: true }] },
      { parciales: [{ fecha: "2028-05-01" }] },
    ].forEach((p) => {
      expect(antecedentesDeCobro(p).hay).toBe(true);
    });
  });

  test("sin antecedentes no protege, y el override de hectáreas se nombra aparte", () => {
    expect(antecedentesDeCobro({}).hay).toBe(false);
    expect(antecedentesDeCobro({ parciales: [] }).hay).toBe(false);
    const soloHa = antecedentesDeCobro({ haCobrar: "16.5" });
    expect(soloHa.hay).toBe(false);          // no es un antecedente de cobro
    expect(soloHa.overrideHa).toBe(true);    // pero tampoco se ignora
  });

  test("la fila protegida no se recalcula y dice por qué", () => {
    const ct = CT(REAJ(), ACT_OK);
    const r = reajusteDeFila(ct, FILA("2029/2030", 125910),
      { antecedentes: { nFact: "123", pagado: true, fechaPago: "2030-06-02", fechaEst: "2030-04-01" } });
    expect(r.intocable).toBe(true);
    expect(r.ajustado).toBe(125910);
    expect(r.diferencia).toBe(0);
    expect(r.motivo).toMatch(/número de factura 123/);
    expect(r.motivo).toMatch(/marcada como pagada/);
  });

  test("caso real del sistema: nFact + pagado + fechaPago protegen la fila", () => {
    // Forma exacta de `rcPagos` que existe hoy en los datos.
    const p = { nFact: "75", pagado: true, fechaEst: "2025-04-01", haCobrar: "16.5", fechaPago: "2025-06-26" };
    const a = antecedentesDeCobro(p);
    expect(a.hay).toBe(true);
    expect(a.motivos.length).toBe(3);
    expect(a.overrideHa).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("8 · lo que no se puede activar no mueve nada", () => {
  test("el monto ajustado es el mismo que la base", () => {
    const r = reajusteDeFila(CT(REAJ(), undefined), FILA("2028/2029", 125910), { antecedentes: EMI("2029-04-01") });
    expect(r.aplica).toBe(false);
    expect(r.bloqueado).toBe(true);
    expect(r.ajustado).toBe(125910);
  });

  // El describe se llamaba "sin activar, nada se mueve". Desde que la previa
  // contesta "que pasaria SI se activa", eso dejo de ser cierto: apagar la
  // activacion ya NO alcanza para que de cero. Lo que sostienen estas dos
  // pruebas es otra cosa, y por eso el titulo cambio: a este contrato le
  // faltan la fecha de referencia y el respaldo, asi que no se podria activar
  // ni suponiendolo. La prueba que custodia "apagado vs encendido" es la de
  // R2 en integracionReajuste.test.js.
  test("sin fecha ni respaldo, la previa no promete nada aunque se suponga activa", () => {
    const ct = CT(REAJ(), undefined);
    const p = previsualizarActivacion(ct,
      [FILA("2027/2028", 100), FILA("2028/2029", 100)], { antecedentesDe: () => EMI("2029-04-01") });
    expect(p.diferenciaAplicada).toBe(0);
    expect(p.totalAplicado).toBe(p.totalBase);
    // Y lo dice: el motivo nombra lo que falta, no "esta sin activar".
    expect(p.activacion.faltan.length).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("9 · activado y sin ambigüedad: ahí sí aplica", () => {
  // Referencia 1 de enero → aniversarios el 1 de enero, que cae dentro de la
  // temporada julio–junio. Para aislar el cálculo se usa una referencia cuyo
  // aniversario coincide con el inicio del período: 1 de julio.
  const ct = CT(REAJ(), Object.assign({}, ACT_OK, { fechaReferencia: "2026-07-01" }));

  test("un período cumplido compone una vez", () => {
    const r = reajusteDeFila(ct, FILA("2027/2028", 125910), { antecedentes: EMI("2028-04-01") });
    expect(r.bloqueado).toBe(false);
    expect(r.periodos).toBe(1);
    expect(r.ajustado).toBeCloseTo(128428.2, 2);
    expect(r.diferencia).toBeCloseTo(2518.2, 2);
  });

  test("dos períodos componen, no suman", () => {
    const r = reajusteDeFila(ct, FILA("2028/2029", 125910), { antecedentes: EMI("2029-04-01") });
    expect(r.periodos).toBe(2);
    expect(r.ajustado).toBeCloseTo(125910 * 1.02 * 1.02, 2);
    expect(r.ajustado).not.toBeCloseTo(125910 * 1.04, 2);
  });

  test("el total aplicado suma solo lo que se aplica", () => {
    const p = previsualizarActivacion(ct,
      [FILA("2026/2027", 100), FILA("2027/2028", 100)],
      { antecedentesDe: (f) => EMI(f.temporada === "2026/2027" ? "2027-04-01" : "2028-04-01") });
    expect(p.filasQueCambian).toBe(1);                 // la primera todavía no cumple
    expect(p.totalAplicado).toBeCloseTo(100 + 102, 2);
    expect(p.diferenciaAplicada).toBeCloseTo(2, 2);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("10 · el modelo solo lee", () => {
  test("ninguna función muta el contrato ni las filas", () => {
    const ct = CT(REAJ(), ACT_OK);
    const filas = [FILA("2026/2027", 100), FILA("2027/2028", 200)];
    const ctCopia = JSON.parse(JSON.stringify(ct));
    const filasCopia = JSON.parse(JSON.stringify(filas));
    previsualizarActivacion(ct, filas, { antecedentesDe: () => EMI("2028-04-01") });
    expect(ct).toEqual(ctCopia);
    expect(filas).toEqual(filasCopia);
  });

  test("los límites del período del servicio son julio a junio", () => {
    const l = limitesTemporada("2027/2028");
    expect(l.desde.toISOString().slice(0, 10)).toBe("2027-07-01");
    expect(l.hasta.toISOString().slice(0, 10)).toBe("2028-06-30");
  });

  test("la fecha de cobro del motor se replica, como referencia y nada más", () => {
    expect(fechaCobroDeTemporada("2027/2028", "Abril").toISOString().slice(0, 10)).toBe("2028-04-01");
    expect(fechaCobroDeTemporada("2027/2028", "").toISOString().slice(0, 10)).toBe("2028-04-01");
  });
});

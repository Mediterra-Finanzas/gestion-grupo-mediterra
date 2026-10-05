/* eslint-disable */
// Entrega B · El reajuste aplicado, con activación explícita.
// Todas las fechas son SINTÉTICAS. No hay ninguna fecha real de Olmos acá.

import {
  aniversario, periodosCumplidos, limitesTemporada, fechaCobroDeTemporada,
  aniversarioDentroDeTemporada, estadoActivacion, reajusteDeFila,
  previsualizarActivacion, convivenciaConConfigAntigua,
  SIN_ACTIVAR, ACTIVADO, NO_ACTIVABLE,
} from "./reajusteAplicado";

const REAJ = (extra) => Object.assign(
  { tipo: "porcentaje", pct: 2, desde: "2027-01-01", referencia: "Clausula sintetica 1.2.5", confirmado: true },
  extra || {}
);
const CT = (reaj, act, extra) => Object.assign(
  { id: "c1", pais: "Peru", valorRoyaltyComercial: 3000, reajuste: reaj, reajusteActivacion: act },
  extra || {}
);
const ACT_OK = { activado: true, fechaReferencia: "2026-03-15", respaldo: "Comprobante sintetico 001", usuario: "prueba", fecha: "2026-10-05" };
const FILA = (temporada, montoFact) => ({ temporada, montoFact });

// ══════════════════════════════════════════════════════════════════
describe("1 · el aniversario: el día antes, el mismo día y el siguiente", () => {
  const D = "2026-03-15";

  test("el día ANTERIOR al primer aniversario todavía no cumple ningún período", () => {
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
    expect(periodosCumplidos(D, "2026-03-14")).toBe(0);
    expect(periodosCumplidos(D, "2026-03-15")).toBe(0);   // el día cero no es aniversario
  });

  test("29 de febrero: el aniversario cae el 28 en los años que no son bisiestos", () => {
    // Es una decisión, no una obviedad. Queda fijada acá.
    expect(aniversario("2028-02-29", 1).toISOString().slice(0, 10)).toBe("2029-02-28");
    expect(aniversario("2028-02-29", 4).toISOString().slice(0, 10)).toBe("2032-02-29");
    expect(periodosCumplidos("2028-02-29", "2029-02-27")).toBe(0);
    expect(periodosCumplidos("2028-02-29", "2029-02-28")).toBe(1);
    expect(periodosCumplidos("2028-02-29", "2029-03-01")).toBe(1);
  });

  test("una fecha inválida no produce períodos ni revienta", () => {
    expect(periodosCumplidos("", "2030-01-01")).toBe(0);
    expect(periodosCumplidos("2026-02-31", "2030-01-01")).toBe(0);
    expect(aniversario("no-es-fecha", 1)).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
describe("2 · confirmar no es activar", () => {
  test("antecedente confirmado y sin activar: no aplica nada y lo dice", () => {
    const e = estadoActivacion(CT(REAJ(), undefined));
    expect(e.estado).toBe(SIN_ACTIVAR);
    expect(e.activo).toBe(false);
    expect(e.motivo).toMatch(/Confirmar y activar son dos acciones/);
  });

  test("antecedente incompleto: ni siquiera es activable", () => {
    const e = estadoActivacion(CT(REAJ({ confirmado: false }), ACT_OK));
    expect(e.estado).toBe(NO_ACTIVABLE);
    expect(e.motivo).toMatch(/no está confirmado/);
  });

  test("activado pero sin fecha de referencia: no se aplica", () => {
    const e = estadoActivacion(CT(REAJ(), { activado: true, respaldo: "x" }));
    expect(e.estado).toBe(SIN_ACTIVAR);
    expect(e.faltan).toContain("fecha de referencia");
  });

  test("activado pero sin respaldo de la fecha: no se aplica", () => {
    const e = estadoActivacion(CT(REAJ(), { activado: true, fechaReferencia: "2026-03-15" }));
    expect(e.estado).toBe(SIN_ACTIVAR);
    expect(e.faltan).toContain("respaldo de la fecha");
  });

  test("activado, con fecha y respaldo: recién ahí queda activo", () => {
    const e = estadoActivacion(CT(REAJ(), ACT_OK));
    expect(e.estado).toBe(ACTIVADO);
    expect(e.activo).toBe(true);
    expect(e.pct).toBe(2);
  });

  test("por índice no se puede activar: falta la serie publicada", () => {
    const e = estadoActivacion(CT(REAJ({ tipo: "indice", indice: "IPC", fuente: "INEI", fechaBase: "2026-01-01" }), ACT_OK));
    expect(e.estado).toBe(NO_ACTIVABLE);
    expect(e.motivo).toMatch(/serie publicada/);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("3 · sin activar, ninguna fila se mueve", () => {
  test("el monto ajustado es el mismo que la base", () => {
    const ct = CT(REAJ(), undefined);
    const r = reajusteDeFila(ct, FILA("2028/2029", 125910), { mesCobro: "Abril" });
    expect(r.aplica).toBe(false);
    expect(r.factor).toBe(1);
    expect(r.ajustado).toBe(125910);
    expect(r.diferencia).toBe(0);
  });

  test("la vista previa suma cero de diferencia", () => {
    const ct = CT(REAJ(), undefined);
    const p = previsualizarActivacion(ct, [FILA("2027/2028", 100), FILA("2028/2029", 100)], { mesCobro: "Abril" });
    expect(p.diferencia).toBe(0);
    expect(p.totalAjustado).toBe(p.totalBase);
    expect(p.filasQueCambian).toBe(0);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("4 · activado: la fecha manda, no el índice de la cohorte", () => {
  const ct = CT(REAJ(), ACT_OK);   // referencia 2026-03-15, 2 %

  test("temporada cuyo cobro cae antes del primer aniversario: sin ajuste", () => {
    // Cobro de 2025/2026 en Abril 2026 → antes del 2027-03-15.
    const r = reajusteDeFila(ct, FILA("2025/2026", 125910), { mesCobro: "Abril" });
    expect(r.periodos).toBe(0);
    expect(r.ajustado).toBe(125910);
    expect(r.aplica).toBe(false);
  });

  test("temporada cuyo cobro cae después del primero: un período", () => {
    // Cobro de 2026/2027 en Abril 2027 → 2027-04-01, pasado el 2027-03-15.
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { mesCobro: "Abril" });
    expect(r.periodos).toBe(1);
    expect(r.factor).toBeCloseTo(1.02, 10);
    expect(r.ajustado).toBeCloseTo(128428.2, 2);
    expect(r.diferencia).toBeCloseTo(2518.2, 2);
  });

  test("dos períodos componen, no suman", () => {
    const r = reajusteDeFila(ct, FILA("2027/2028", 125910), { mesCobro: "Abril" });
    expect(r.periodos).toBe(2);
    expect(r.ajustado).toBeCloseTo(125910 * 1.02 * 1.02, 2);   // 131.000,96
    expect(r.ajustado).not.toBeCloseTo(125910 * 1.04, 2);       // no es 2 % + 2 %
  });

  test("el mes de cobro cambia el resultado, porque el ancla es una fecha", () => {
    // Mismo contrato y misma temporada, distinto mes de cobro.
    const enero = reajusteDeFila(ct, FILA("2026/2027", 100), { mesCobro: "Enero" });   // 2027-01-01
    const abril = reajusteDeFila(ct, FILA("2026/2027", 100), { mesCobro: "Abril" });   // 2027-04-01
    expect(enero.periodos).toBe(0);
    expect(abril.periodos).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("5 · el aniversario dentro de la temporada: decisión pendiente", () => {
  // Referencia 2026-03-15 → aniversarios el 15 de marzo. La temporada
  // 2026/2027 va del 2026-07-01 al 2027-06-30, así que el 2027-03-15 cae
  // ADENTRO: la temporada se factura de una vez y el ajuste entraría a mitad.
  const ct = CT(REAJ(), ACT_OK);

  test("se detecta que el aniversario cae dentro de la temporada", () => {
    const d = aniversarioDentroDeTemporada("2026-03-15", "2026/2027");
    expect(d.cae).toBe(true);
    expect(d.fecha.toISOString().slice(0, 10)).toBe("2027-03-15");
  });

  test("la fila se marca como regla pendiente y lo explica", () => {
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { mesCobro: "Abril" });
    expect(r.reglaPendiente).toBe(true);
    expect(r.motivo).toMatch(/Decisión pendiente/i);
    expect(r.motivo).toMatch(/prorrateado/);
    expect(r.motivo).toMatch(/no está confirmado/);
  });

  test("NO se supone prorrateo", () => {
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { mesCobro: "Abril" });
    // Un prorrateo por los ~3,5 meses posteriores al aniversario daría algo
    // cercano a 125.910 + 2.518,20 × (107/365) ≈ 126.648. No es lo que hace.
    expect(r.ajustado).not.toBeCloseTo(126648, 0);
  });

  test("NO se da por hecho que la temporada entera va al valor nuevo", () => {
    // Calcula un número, pero lo entrega marcado como no confirmado.
    const r = reajusteDeFila(ct, FILA("2026/2027", 125910), { mesCobro: "Abril" });
    expect(r.reglaPendiente).toBe(true);
    expect(r.aplica).toBe(true);        // hay un número...
    expect(r.motivo).not.toBe("");      // ...y viene con su advertencia
  });

  test("el 1 de julio es el unico ancla que NO deja ambiguedad", () => {
    // Aniversario el 1 de julio = primer día de la temporada: toda la
    // temporada queda después, así que no hay nada que decidir.
    const limpio = CT(REAJ(), Object.assign({}, ACT_OK, { fechaReferencia: "2026-07-01" }));
    expect(aniversarioDentroDeTemporada("2026-07-01", "2027/2028").cae).toBe(false);
    expect(reajusteDeFila(limpio, FILA("2027/2028", 100), { mesCobro: "Abril" }).reglaPendiente).toBe(false);
  });

  test("el 30 de junio SI deja ambiguedad: el ajuste entra el ultimo dia", () => {
    expect(aniversarioDentroDeTemporada("2026-06-30", "2027/2028").cae).toBe(true);
  });

  test("con un ancla a mitad de año, la pendiente alcanza a TODAS las temporadas", () => {
    // Hallazgo, no detalle: el aniversario se repite cada año, así que con
    // temporada julio–junio cae dentro de cada una. No es una fila: son todas.
    const p = previsualizarActivacion(ct,
      [FILA("2026/2027", 100), FILA("2027/2028", 100), FILA("2028/2029", 100)], { mesCobro: "Abril" });
    expect(p.filasConReglaPendiente).toBe(3);
    expect(p.filas).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("6 · filas con antecedentes de facturación o pago", () => {
  const ct = CT(REAJ(), ACT_OK);

  test("no se recalculan", () => {
    const r = reajusteDeFila(ct, FILA("2027/2028", 125910), { mesCobro: "Abril", conAntecedenteDeCobro: true });
    expect(r.intocable).toBe(true);
    expect(r.ajustado).toBe(125910);          // el monto no se toca
    expect(r.diferencia).toBe(0);
    expect(r.motivo).toMatch(/ya tiene antecedentes de facturación o pago/);
  });

  test("la diferencia se informa aparte, no se aplica", () => {
    const r = reajusteDeFila(ct, FILA("2027/2028", 125910), { mesCobro: "Abril", conAntecedenteDeCobro: true });
    expect(r.diferenciaInformativa).toBeCloseTo(125910 * (1.02 * 1.02 - 1), 2);
    expect(r.diferencia).toBe(0);
  });

  test("la vista previa separa lo aplicado de lo informado", () => {
    const yaCobrada = (f) => f.temporada === "2026/2027";
    const p = previsualizarActivacion(ct,
      [FILA("2026/2027", 100), FILA("2027/2028", 100)],
      { mesCobro: "Abril", conAntecedenteDeCobro: yaCobrada });
    expect(p.filasIntocables).toBe(1);
    expect(p.diferenciaNoAplicada).toBeGreaterThan(0);
    expect(p.totalAjustado).toBeCloseTo(100 + 100 * 1.02 * 1.02, 2);  // la cobrada entra a su valor base
  });
});

// ══════════════════════════════════════════════════════════════════
describe("7 · la configuración antigua se conserva", () => {
  test("si hay una operando y además una activación, manda la antigua y se avisa", () => {
    const ct = CT(REAJ(), ACT_OK, { royaltyInflacion: true, rcInflacionPct: 5 });
    const c = convivenciaConConfigAntigua(ct);
    expect(c.hayDos).toBe(true);
    expect(c.mandaNueva).toBe(false);
    expect(c.pctAntiguo).toBe(5);
    expect(c.pctNuevo).toBe(2);
    expect(c.aviso).toMatch(/No se sustituye una por otra autom/);
  });

  test("activar no borra ni modifica la configuración antigua", () => {
    const ct = CT(REAJ(), ACT_OK, { royaltyInflacion: true, rcInflacionPct: 5 });
    const copia = JSON.parse(JSON.stringify(ct));
    estadoActivacion(ct); convivenciaConConfigAntigua(ct);
    reajusteDeFila(ct, FILA("2028/2029", 100), { mesCobro: "Abril" });
    expect(ct).toEqual(copia);
    expect(ct.royaltyInflacion).toBe(true);
    expect(ct.rcInflacionPct).toBe(5);
  });

  test("sin configuración antigua, la nueva es la única", () => {
    const c = convivenciaConConfigAntigua(CT(REAJ(), ACT_OK));
    expect(c.hayDos).toBe(false);
    expect(c.mandaNueva).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
describe("8 · el modelo solo lee", () => {
  test("ninguna función muta el contrato ni las filas", () => {
    const ct = CT(REAJ(), ACT_OK);
    const filas = [FILA("2026/2027", 100), FILA("2027/2028", 200)];
    const ctCopia = JSON.parse(JSON.stringify(ct));
    const filasCopia = JSON.parse(JSON.stringify(filas));
    previsualizarActivacion(ct, filas, { mesCobro: "Abril" });
    expect(ct).toEqual(ctCopia);
    expect(filas).toEqual(filasCopia);
  });

  test("los límites de temporada son julio a junio", () => {
    const l = limitesTemporada("2027/2028");
    expect(l.desde.toISOString().slice(0, 10)).toBe("2027-07-01");
    expect(l.hasta.toISOString().slice(0, 10)).toBe("2028-06-30");
  });

  test("la fecha de cobro replica la del motor: mes de cobro del segundo año", () => {
    expect(fechaCobroDeTemporada("2027/2028", "Abril").toISOString().slice(0, 10)).toBe("2028-04-01");
    expect(fechaCobroDeTemporada("2027/2028", "Julio").toISOString().slice(0, 10)).toBe("2028-07-01");
    expect(fechaCobroDeTemporada("2027/2028", "").toISOString().slice(0, 10)).toBe("2028-04-01");
  });
});

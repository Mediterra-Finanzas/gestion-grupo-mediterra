/* eslint-disable */
// Paquete A — pruebas de comportamiento, con datos sintéticos.
// Reproducibles en cualquier máquina: no dependen del corte de producción.
import {
  añoDeFechaTexto, haDeFila, fechaDeFila, origenHectareas,
  conciliarUniversos, nivelesCobroOC, puentePendiente, temporadaDeHoy,
} from "./paqueteA";

// ══ A1 · el año no se corre por zona horaria ══════════════════════
describe("A1 · año de una fecha", () => {
  test("el 1 de enero se queda en su año", () => {
    expect(añoDeFechaTexto("2024-01-01")).toBe(2024);
    // Esto es lo que hacía antes y por qué fallaba.
    expect(new Date("2024-01-01").getFullYear()).toBe(2023);
  });

  test("el 31 de diciembre tampoco salta", () => {
    expect(añoDeFechaTexto("2025-12-31")).toBe(2025);
  });

  test("una fecha cualquiera del año da el mismo resultado que antes", () => {
    ["2025-06-15", "2024-07-01", "2026-02-09", "2025-11-26"].forEach((f) => {
      expect(añoDeFechaTexto(f)).toBe(new Date(f).getFullYear());
    });
  });

  test("sin fecha devuelve null, no un año inventado", () => {
    [null, undefined, "", "   ", "no es fecha"].forEach((f) => {
      expect(añoDeFechaTexto(f)).toBeNull();
    });
  });

  test("acepta una fecha con hora sin romperse", () => {
    expect(añoDeFechaTexto("2024-01-01T03:00:00Z")).toBe(2024);
  });
});

// ══ A5 · una sola fuente de hectáreas y fecha por fila ════════════
describe("A5 · hectáreas y fecha de una fila", () => {
  test("la fila derivada de contrato aporta sus hectáreas una vez", () => {
    const r = { hectareas: 12.5, fechaPlantacion: "2025-11-26", _fromContract: true };
    expect(haDeFila(r)).toBe(12.5);
    expect(fechaDeFila(r)).toBe("2025-11-26");
    expect(origenHectareas(r)).toBe("plantación del contrato (hectareas)");
  });

  test("la fila cargada a mano aporta las suyas", () => {
    const r = { ha: 8, fechaPedido: "2024-03-01" };
    expect(haDeFila(r)).toBe(8);
    expect(fechaDeFila(r)).toBe("2024-03-01");
    expect(origenHectareas(r)).toBe("carga manual (ha)");
  });

  test("si la fila trae las dos, se cuenta UNA sola vez", () => {
    const r = { ha: 8, hectareas: 12.5 };
    expect(haDeFila(r)).toBe(8);          // no 20,5
    expect(haDeFila(r)).not.toBe(20.5);
  });

  test("no se inventan hectáreas a partir de las plantas", () => {
    const r = { nPlantas: 100000 };
    expect(haDeFila(r)).toBe(0);
    expect(origenHectareas(r)).toBe("sin dato");
  });

  test("la suma de una lista mixta es la suma simple de cada fila", () => {
    const filas = [{ hectareas: 10 }, { ha: 5 }, { nPlantas: 9999 }, { hectareas: 0.05 }];
    expect(filas.reduce((s, r) => s + haDeFila(r), 0)).toBeCloseTo(15.05, 6);
  });
});

// ══ A2 · dos recuentos distintos, conciliados fila por fila ═══════
describe("A2 · conciliación de universos", () => {
  const ctData = [
    { id: "c1", razonSocial: "Uno" },
    { id: "c2", razonSocial: "Dos" },
    { id: "c3", razonSocial: "Tres sin tandas" },
    { id: "c4", razonSocial: "Cuatro sin plantaciones" },
  ];
  const tpData = [
    { ctId: "c1", nPlantas: 1000 }, { ctId: "c1", nPlantas: 500 },
    { ctId: "c2", nPlantas: 2000 },
    { ctId: "c3", nPlantas: 300 },
  ];
  const rpData = [
    { ctId: "c1", nPlantas: 2100 },                  // facturó más de lo plantado
    { ctId: "c2", nPlantas: 1800 },                  // facturó menos
    { ctId: "c4", nPlantas: 400, _fromOC: true },    // factura sin plantación registrada
  ];

  test("la suma de las diferencias cuadra con la diferencia de totales", () => {
    const c = conciliarUniversos(ctData, tpData, rpData);
    expect(c.totalA).toBe(3800);
    expect(c.totalB).toBe(4300);
    expect(c.sumaDiferencias).toBe(500);
    expect(c.cuadra).toBe(true);
  });

  test("entrega TODAS las filas, incluidas las de diferencia cero", () => {
    const ct = [...ctData, { id: "c5", razonSocial: "Cinco cuadrado" }];
    const tp = [...tpData, { ctId: "c5", nPlantas: 777 }];
    const rp = [...rpData, { ctId: "c5", nPlantas: 777 }];
    const c = conciliarUniversos(ct, tp, rp);
    expect(c.filas).toHaveLength(5);
    expect(c.filas.find((f) => f.ctId === "c5").diferencia).toBe(0);
    expect(c.conDiferencia).toBe(4);
  });

  test("deja fuera los contratos sin ninguna fila en ninguno de los dos universos", () => {
    const c = conciliarUniversos([...ctData, { id: "c9", razonSocial: "Vacío" }], tpData, rpData);
    expect(c.filas.find((f) => f.ctId === "c9")).toBeUndefined();
  });

  test("marca los contratos que facturan sin plantación registrada", () => {
    const c = conciliarUniversos(ctData, tpData, rpData);
    expect(c.soloB.map((f) => f.ctId)).toEqual(["c4"]);
    expect(c.filas.find((f) => f.ctId === "c4").origenB).toBe("OC/despachos");
  });

  test("reconstruye la lista de contratos si no se la entregan", () => {
    const c = conciliarUniversos(null, [{ ctId: "c1", nPlantas: 10, cliente: "Uno" }], [{ ctId: "c1", nPlantas: 15 }]);
    expect(c.filas).toHaveLength(1);
    expect(c.filas[0].cliente).toBe("Uno");
    expect(c.sumaDiferencias).toBe(5);
  });

  test("la diferencia NO se resta de ningún total", () => {
    const c = conciliarUniversos(ctData, tpData, rpData);
    // los totales siguen siendo los de cada universo, sin compensar
    expect(c.totalA + c.sumaDiferencias).toBe(c.totalB);
    expect(c.totalA).toBe(3800);
  });
});

// ══ A3 · estado declarado ≠ documento ≠ pago ══════════════════════
describe("A3 · tres niveles de cobro en OC", () => {
  const ocs = [
    { n_oc: "A-1", estado_oc: "Pagada total", fee_total_usd: 1000, cuotas: [], fvFacturas: [] },
    { n_oc: "A-2", estado_oc: "Pagada total", fee_total_usd: 500, cuotas: [],
      fvFacturas: [{ monto: "500", estado: "Pagada", n_factura: "F-1", fecha_pago: "2024-12-23" }] },
    { n_oc: "A-3", estado_oc: "Pagada total", fee_total_usd: 300, cuotas: [],
      fvFacturas: [{ monto: "", estado: "Por cobrar", n_factura: "", fecha_pago: "" }] },
    { n_oc: "A-4", estado_oc: "Anulada", fee_total_usd: 900, cuotas: [], fvFacturas: [] },
    { n_oc: "A-5", estado_oc: "Confirmada", fee_total_usd: 200,
      cuotas: [{ pagado: true, monto_usd: 80 }], fvFacturas: [] },
  ];

  test("el estado declarado es exactamente lo que mostraba la pantalla", () => {
    const n = nivelesCobroOC(ocs);
    // 1000 + 500 + 300 (estado) + 0 (anulada) + 80 (cuota pagada)
    expect(n.estadoDeclarado).toBe(1880);
  });

  test("la documentación registrada cuenta sólo facturas con importe", () => {
    const n = nivelesCobroOC(ocs);
    expect(n.docRegistrada).toBe(500);
    expect(n.docsSinMonto).toHaveLength(1);
  });

  test("el pago verificado es 0: una factura no acredita cobranza", () => {
    const n = nivelesCobroOC(ocs);
    expect(n.pagoVerificado).toBe(0);
    // lo que existe queda listado aparte, como declaración pendiente de conciliar
    expect(n.pagoDeclarado).toBe(500);
    expect(n.pagoDeclaradoDetalle).toEqual([
      { oc: "A-2", nFactura: "F-1", monto: 500, fechaPago: "2024-12-23", estado: "Pagada" },
    ]);
  });

  test("señala el importe sin ningún documento detrás", () => {
    const n = nivelesCobroOC(ocs);
    expect(n.sinDocumento).toBe(1380);
  });

  test("señala la OC declarada pagada cuya factura dice Por cobrar", () => {
    const n = nivelesCobroOC(ocs);
    expect(n.contradicciones).toHaveLength(1);
    expect(n.contradicciones[0].oc).toBe("A-3");
  });

  test("no cambia ningún estado ni marca nada como pagado", () => {
    const copia = JSON.parse(JSON.stringify(ocs));
    nivelesCobroOC(ocs);
    expect(ocs).toEqual(copia);
  });

  test("una OC anulada no aporta ni importe ni documento", () => {
    const n = nivelesCobroOC([{ n_oc: "X", estado_oc: "Anulada", fee_total_usd: 999,
      fvFacturas: [{ monto: "999", estado: "Pagada", fecha_pago: "2024-01-01" }] }]);
    expect(n.estadoDeclarado).toBe(0);
    expect(n.docRegistrada).toBe(0);
  });
});

// ══ A4 · cobranza, calculado y proyección son tres cosas ══════════
describe("A4 · puente del pendiente", () => {
  const base = {
    ctData: [
      { id: "c1", razonSocial: "Con término", fechaTermino: "2027-06-30" },
      { id: "c2", razonSocial: "Sin término" },
    ],
    rpData: [
      { ctId: "c1", nPlantas: 1000, usdPlanta: 1, retPct: 15, pagado: false, nFact: "100", fechaPago: "2025-01-01" },
      { ctId: "c1", nPlantas: 2000, usdPlanta: 1, retPct: 15, pagado: false, nFact: "" },
      { ctId: "c1", nPlantas: 500, usdPlanta: 1, retPct: 15, pagado: true, nFact: "99" },
    ],
    feData: [
      { ctId: "c1", montoUSD: 30000, pagado: false, nFact: "200", fechaPago: "2025-02-01" },
      { ctId: "c2", montoUSD: 30000, pagado: false, nFact: "" },
    ],
    fvData: [],
    rcData: [
      { ctId: "c1", temporada: "2024/2025", montoFact: 10000, pagado: false, nFact: "300" },
      { ctId: "c1", temporada: "2025/2026", montoFact: 10000, pagado: false, nFact: "" },
      { ctId: "c2", temporada: "2030/2031", montoFact: 50000, pagado: false, nFact: "" },
    ],
    temporadaActual: "2025/2026",
  };

  test("el total del hub no cambia", () => {
    const p = puentePendiente(base);
    // royalty planta neto (3000 × 0,85) + contract fee bruto (60.000)
    expect(p.totalHub).toBeCloseTo(2550 + 60000, 6);
    expect(p.componentesHub.rpNeto).toBeCloseTo(2550, 6);
    expect(p.componentesHub.feBruto).toBe(60000);
  });

  test("la proyección futura queda separada y no se presenta como exigible", () => {
    const p = puentePendiente(base);
    expect(p.proyeccionFutura).toBe(50000);
    expect(p.detalle.rc.proyeccion).toBe(50000);
    // y se declara que ese horizonte es supuesto
    expect(p.proyeccionConHorizonteSupuesto).toBe(50000);
    expect(p.periodo.royaltyComercial.contratosSinFechaTermino).toBe(1);
  });

  test("cobranza registrada = sólo lo que tiene factura emitida", () => {
    const p = puentePendiente(base);
    // rp con factura (1000 × 0,85 = 850) + fee con factura (30.000) + rc con factura (10.000)
    expect(p.cobranzaRegistrada).toBeCloseTo(850 + 30000 + 10000, 6);
  });

  test("calculado pendiente = lo que el sistema calcula y nadie facturó", () => {
    const p = puentePendiente(base);
    expect(p.calculadoPendiente).toBeCloseTo(1700 + 30000 + 0 + 10000, 6);
  });

  test("los tres conceptos no se solapan y cubren todo el pendiente", () => {
    const p = puentePendiente(base);
    const suma = p.cobranzaRegistrada + p.calculadoPendiente + p.proyeccionFutura;
    const universo = p.componentesHub.rpNeto + p.componentesHub.feBruto +
                     p.detalle.rc.registrado + p.detalle.rc.calculado + p.detalle.rc.proyeccion;
    expect(suma).toBeCloseTo(universo, 6);
  });

  test("el puente cierra: hub + comercial omitido + retención = bruto de las tres líneas", () => {
    const p = puentePendiente(base);
    expect(p.puente.igualBrutoTresLineas).toBeCloseTo(
      p.puente.desdeTotalHub + p.puente.masRoyaltyComercialOmitido + p.puente.masRetencionRoyaltyPlanta, 6);
    // la retención es la diferencia entre bruto y neto, no un descuento extra
    expect(p.puente.masRetencionRoyaltyPlanta).toBeCloseTo(3000 - 2550, 6);
  });

  test("declara la fuente de fecha y señala lo que falta", () => {
    const p = puentePendiente(base);
    expect(p.periodo.royaltyPlanta.fuenteFecha).toMatch(/tanda/);
    expect(p.periodo.royaltyPlanta.sinFecha).toBe(1);
    expect(p.periodo.contractFee.sinFecha).toBe(1);
    expect(p.periodo.royaltyComercial.desde).toBe("2024/2025");
    expect(p.periodo.royaltyComercial.hasta).toBe("2030/2031");
  });

  test("señala el contract fee que el contrato declara pagado y la pantalla cuenta pendiente", () => {
    const p = puentePendiente({
      ...base,
      ctData: [{ id: "c1", contractFeePagado: true }, { id: "c2" }],
    });
    expect(p.detalle.fe.contradictorias).toBe(1);
    expect(p.detalle.fe.contradictorio).toBe(30000);
    // pero el total del hub sigue igual: no se corrige por suposición
    expect(p.componentesHub.feBruto).toBe(60000);
  });

  test("la temporada agrícola va de julio a junio", () => {
    expect(temporadaDeHoy(new Date(2026, 6, 1))).toBe("2026/2027");
    expect(temporadaDeHoy(new Date(2026, 5, 30))).toBe("2025/2026");
  });

  test("no muta ninguna de las listas que recibe", () => {
    const copia = JSON.parse(JSON.stringify(base));
    puentePendiente(base);
    expect(base).toEqual(copia);
  });
});

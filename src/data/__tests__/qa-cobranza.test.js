/* eslint-disable */
/* El modelo de vencimiento aprobado, caso por caso. Lo que se prueba sobre todo
 * es lo que NO hace: no supone un plazo, no clasifica como vencida una factura
 * sin vencimiento, y no netea notas de crédito que no existen. */
const {
  resolverVencimiento, plazoDocumentado, saldoDe, clasificar, filasCobranza,
  resumenCobranza, agruparParaCorreo, hoyCivil, sumarDias, diasDeAtraso,
  conflicto, cobertura, ESTADO, ORIGEN_VENCIMIENTO, SIN_RESPONSABLE,
} = require("../../ux/cobranza.js");

describe("vencimiento · prioridad y ausencias", () => {
  test("1 · la fecha explícita manda por sobre cualquier cálculo", () => {
    const v = resolverVencimiento({
      factura: { fechaVencimiento: "2026-10-15", fechaEmision: "2026-09-01", plazoPagoDias: 30 },
    });
    expect(v.vencimiento).toBe("2026-10-15");           // 2026-09-01 + 30 = 2026-10-01, y NO se usa
    expect(v.origen).toBe(ORIGEN_VENCIMIENTO.EXPLICITO);
  });

  test("2 · sin explícita, emisión + plazo de la factura", () => {
    const v = resolverVencimiento({ factura: { fechaEmision: "2026-09-01", plazoPagoDias: 30 } });
    expect(v.vencimiento).toBe("2026-10-01");
    expect(v.origen).toBe(ORIGEN_VENCIMIENTO.CALCULADO);
  });

  test("2b · el plazo puede venir del contrato o del cliente, en ese orden", () => {
    expect(plazoDocumentado({ contrato: { diasPago: 45 }, cliente: { plazoPagoDias: 60 } }))
      .toEqual({ dias: 45, fuente: "contrato" });
    expect(plazoDocumentado({ cliente: { condicionPagoDias: 60 } }))
      .toEqual({ dias: 60, fuente: "cliente" });
    expect(resolverVencimiento({ factura: { fechaEmision: "2026-09-01" }, cliente: { plazoPagoDias: 60 } }).vencimiento)
      .toBe("2026-10-31");
  });

  test("3 · sin fecha ni plazo → ausente, y NUNCA vencida", () => {
    const v = resolverVencimiento({ factura: { nFact: "F-1", montoUSD: 1000 } });
    expect(v.origen).toBe(ORIGEN_VENCIMIENTO.AUSENTE);
    expect(v.vencimiento).toBeNull();
    const c = clasificar({ factura: { nFact: "F-1", montoUSD: 1000 }, venc: v }, "2030-01-01");
    expect(c.estado).toBe(ESTADO.INFO_PENDIENTE);
    expect(c.estado).not.toBe(ESTADO.VENCIDO);
    expect(c.motivo).toContain("Completar vencimiento");
  });

  test("4 · no se asigna un plazo general supuesto", () => {
    // Emisión presente, plazo ausente en los tres niveles: sigue siendo ausente.
    const v = resolverVencimiento({ factura: { fechaEmision: "2026-01-01" }, contrato: {}, cliente: {} });
    expect(v.origen).toBe(ORIGEN_VENCIMIENTO.AUSENTE);
    expect(v.fuente).toContain("sin plazo documentado");
  });

  test("4b · plazo 0 días es un plazo documentado, no una ausencia", () => {
    const v = resolverVencimiento({ factura: { fechaEmision: "2026-09-01", plazoPagoDias: 0 } });
    expect(v.vencimiento).toBe("2026-09-01");
    expect(v.origen).toBe(ORIGEN_VENCIMIENTO.CALCULADO);
  });

  test("4c · un plazo no numérico no se interpreta", () => {
    expect(plazoDocumentado({ factura: { plazoPagoDias: "a convenir" } })).toBeNull();
  });
});

describe("saldo · pagos parciales y ajustes registrados", () => {
  test("resta los pagos parciales marcados", () => {
    const s = saldoDe({ montoUSD: 1000, pagos: [
      { monto: 300, pagado: true }, { monto: 200, pagado: true }, { monto: 500, pagado: false } ] });
    expect(s.cobrado).toBe(500);
    expect(s.saldo).toBe(500);          // 1000 − 300 − 200 = 500
    expect(s.parciales).toBe(3);
  });

  test("resta los ajustes registrados", () => {
    expect(saldoDe({ montoUSD: 1000, ajustes: [{ monto: 100, motivo: "nota de crédito 12" }] }).saldo).toBe(900);
  });

  test("no inventa notas de crédito ausentes", () => {
    const s = saldoDe({ montoUSD: 1000 });
    expect(s.ajustes).toBe(0);
    expect(s.saldo).toBe(1000);         // no se netea nada que no esté escrito
  });

  test("retrocompatible con el booleano `pagado` del modelo actual", () => {
    expect(saldoDe({ montoUSD: 30000, pagado: true }).saldo).toBe(0);
    expect(saldoDe({ montoUSD: 30000, pagado: false }).saldo).toBe(30000);
  });
});

describe("estados separados", () => {
  const venc = { vencimiento: "2026-09-01", origen: ORIGEN_VENCIMIENTO.EXPLICITO };

  test("hito cumplido sin factura → POR FACTURAR, no por cobrar", () => {
    const c = clasificar({ hito: { fecha: "2026-08-01", descripcion: "firma" }, factura: {}, venc }, "2026-09-09");
    expect(c.estado).toBe(ESTADO.POR_FACTURAR);
  });

  test("hito futuro no está por facturar", () => {
    expect(clasificar({ hito: { fecha: "2027-01-01" }, factura: {}, venc }, "2026-09-09").estado).toBe(ESTADO.CERRADO);
  });

  test("factura emitida con saldo y vencimiento futuro → POR COBRAR", () => {
    const c = clasificar({ factura: { nFact: "F-1", montoUSD: 100 },
      venc: { vencimiento: "2026-12-01", origen: ORIGEN_VENCIMIENTO.EXPLICITO } }, "2026-09-09");
    expect(c.estado).toBe(ESTADO.POR_COBRAR);
    expect(c.atraso).toBeLessThan(0);
  });

  test("factura emitida con saldo y vencimiento pasado → VENCIDO con días exactos", () => {
    const c = clasificar({ factura: { nFact: "F-1", montoUSD: 100 }, venc }, "2026-09-09");
    expect(c.estado).toBe(ESTADO.VENCIDO);
    expect(c.atraso).toBe(8);            // del 2026-09-01 al 2026-09-09
  });

  test("saldo cero cierra, aunque esté vencida", () => {
    expect(clasificar({ factura: { nFact: "F-1", montoUSD: 100, pagado: true }, venc }, "2026-09-09").estado)
      .toBe(ESTADO.CERRADO);
  });

  test("una factura emitida ya no está por facturar", () => {
    const c = clasificar({ hito: { fecha: "2026-01-01" }, factura: { nFact: "F-9", montoUSD: 10 }, venc }, "2026-09-09");
    expect(c.estado).not.toBe(ESTADO.POR_FACTURAR);
  });
});

describe("fechas civiles de Chile", () => {
  test("el día civil no se adelanta por el huso", () => {
    // 2026-09-10 02:00 UTC son todavía las 23:00 del 09 en Chile (UTC−3).
    expect(hoyCivil(new Date("2026-09-10T02:00:00Z"))).toBe("2026-09-09");
  });
  test("suma de días y atraso", () => {
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");   // 2026 no es bisiesto
    expect(diasDeAtraso("2026-09-01", "2026-09-09")).toBe(8);
    expect(diasDeAtraso("2026-09-20", "2026-09-09")).toBe(-11);
  });
});

describe("bandeja y responsable interno", () => {
  const blob = {
    contratos: [{ id: "ct1", clienteId: "cl1", cliente: "Agroextiende", moneda: "USD",
                  fechaContrato: "2026-01-15", nombreComercial: "Fundo Norte",
                  rpPlantaCuotas: [{ id: "cuo_firma", descripcion: "Cuota firma", fechaEvento: "2026-02-01" }] }],
    clientes: [{ id: "cl1", razonSocial: "Agroextiende SAC", contactoCobranza: "tesoreria@cliente.example" }],
    feeEntrada: [{ id: "fe1", ctId: "ct1", cliente: "Agroextiende", montoUSD: 30000, nFact: "", pagado: false }],
    royaltyPlanta: [{ id: "rp1", ctId: "ct1", cuotaId: "cuo_firma", cliente: "Agroextiende", montoFacturado: "" }],
    royaltyComercial: [], feeViveros: [],
  };
  const filas = filasCobranza(blob, new Date("2026-09-09T15:00:00Z"));

  test("una fila por hecho, con todas las columnas pedidas", () => {
    expect(filas).toHaveLength(2);
    for (const f of filas)
      for (const col of ["cliente", "contrato", "concepto", "moneda", "vencimiento", "atraso", "responsable", "accion", "saldo"])
        expect(f).toHaveProperty(col);
  });

  test("el responsable interno arranca en Sin asignar", () => {
    expect(filas.every((f) => f.responsable === SIN_RESPONSABLE)).toBe(true);
  });

  test("contactoCobranza es del cliente y no reemplaza al responsable", () => {
    const f = filas[0];
    expect(f.contactoCliente).toBe("tesoreria@cliente.example");
    expect(f.responsable).toBe(SIN_RESPONSABLE);
    expect(f.responsable).not.toBe(f.contactoCliente);
  });

  test("hitos cumplidos sin factura caen en Por facturar", () => {
    expect(filas.filter((f) => f.estado === ESTADO.POR_FACTURAR)).toHaveLength(2);
  });

  test("el resumen entrega los tableros", () => {
    const r = resumenCobranza(filas, blob);
    for (const k of ["porFacturar", "porCobrar", "vencido", "informacionPendiente", "conflicto"])
      expect(r[k]).toEqual(expect.objectContaining({ n: expect.any(Number), monto: expect.any(Number) }));
    expect(r.porFacturar.n).toBe(2);
    expect(r.porFacturar.monto).toBe(30000);   // solo feeEntrada tiene monto cargado
  });

  test("el correo agrupa sin duplicar filas", () => {
    const { porResponsable, consolidado } = agruparParaCorreo(filas, blob);
    const total = [...porResponsable.values()].reduce((s, l) => s + l.length, 0);
    expect(total).toBe(consolidado.length);
    expect(new Set(consolidado.map((f) => f.id)).size).toBe(consolidado.length);
  });

  test("una factura sin vencimiento aparece como información pendiente, no como vencida", () => {
    const b2 = JSON.parse(JSON.stringify(blob));
    b2.feeEntrada[0].nFact = "F-100";                 // emitida, sin fecha ni plazo
    const f2 = filasCobranza(b2, new Date("2026-09-09T15:00:00Z"));
    const fe = f2.find((f) => f.id === "fe1");
    expect(fe.estado).toBe(ESTADO.INFO_PENDIENTE);
    expect(fe.accion).toBe("Completar vencimiento");
    expect(resumenCobranza(f2, b2).vencido.n).toBe(0);
  });

  test("con plazo documentado en el contrato, la misma factura sí vence", () => {
    const b3 = JSON.parse(JSON.stringify(blob));
    b3.feeEntrada[0].nFact = "F-100";
    b3.feeEntrada[0].fechaEmision = "2026-07-01";
    b3.contratos[0].plazoPagoDias = 30;
    const fe = filasCobranza(b3, new Date("2026-09-09T15:00:00Z")).find((f) => f.id === "fe1");
    expect(fe.vencimiento).toBe("2026-07-31");
    expect(fe.estado).toBe(ESTADO.VENCIDO);
    expect(fe.atraso).toBe(40);                       // 31-jul a 9-sep
    expect(fe.origenVencimiento).toBe(ORIGEN_VENCIMIENTO.CALCULADO);
  });
});


describe("dato en conflicto · el contrato y su registro derivado se contradicen", () => {
  /* Caso real medido en produccion el 2026-09-09: el contrato declara
     contractFeeEstado=pagado, contractFeePagado=true y un numero de factura,
     mientras la fila derivada de feeEntrada dice pagado=false, estadoCF=porCobrar
     y nFact vacio. Clasificarlo como "por facturar" habria puesto USD 30.000 en
     un tablero de trabajo pendiente que ya estaba hecho. */
  const blob = {
    contratos: [{ id: "ct1", cliente: "X", moneda: "USD", fechaContrato: "2024-10-09",
                  montoContractFee: 30000, contractFeeEstado: "pagado",
                  contractFeePagado: true, contractFeeNFact: "F-4321" }],
    clientes: [], royaltyPlanta: [], royaltyComercial: [], feeViveros: [],
    feeEntrada: [{ id: "fe1", ctId: "ct1", cliente: "X", montoUSD: 30000, nFact: "", pagado: false, estadoCF: "porCobrar" }],
  };

  test("no se clasifica como por facturar", () => {
    const f = filasCobranza(blob, new Date("2026-09-09T15:00:00Z"))[0];
    expect(f.estado).toBe(ESTADO.CONFLICTO);
    expect(f.estado).not.toBe(ESTADO.POR_FACTURAR);
    expect(f.accion).toBe("Conciliar contrato y registro");
  });

  test("el motivo dice cual es la contradiccion", () => {
    const f = filasCobranza(blob, new Date("2026-09-09T15:00:00Z"))[0];
    expect(f.motivo).toMatch(/contrato declara factura/);
  });

  test("sin contradiccion no se inventa un conflicto", () => {
    const b = JSON.parse(JSON.stringify(blob));
    b.feeEntrada[0].nFact = "F-4321";
    b.feeEntrada[0].pagado = true;
    expect(conflicto({ flujo: "feeEntrada", contrato: b.contratos[0], factura: b.feeEntrada[0] })).toBeNull();
  });

  test("el conflicto solo aplica al flujo que tiene ambos registros", () => {
    expect(conflicto({ flujo: "royaltyPlanta", contrato: blob.contratos[0], factura: {} })).toBeNull();
  });
});

describe("cero no es ausencia de deuda", () => {
  const blob = {
    contratos: [
      { id: "ct1", cliente: "A", montoContractFee: 30000, fechaContrato: "2024-01-01" },
      { id: "ct2", cliente: "B", montoContractFee: 30000 },
      { id: "ct3", cliente: "C", montoContractFee: 30000, contractFeePagado: true },
    ],
    clientes: [], royaltyPlanta: [], royaltyComercial: [], feeViveros: [],
    feeEntrada: [{ id: "fe1", ctId: "ct1", cliente: "A", montoUSD: 30000, nFact: "", pagado: false }],
  };
  const filas = filasCobranza(blob, new Date("2026-09-09T15:00:00Z"));

  test("la cobertura declara cuantos contratos quedan fuera", () => {
    const c = cobertura(filas, blob);
    expect(c.contratos).toBe(3);
    expect(c.cubiertos).toBe(1);
    expect(c.sinHecho).toBe(2);
    expect(c.completa).toBe(false);
  });

  test("el fee de entrada fuera de alcance se cuantifica, y el ya pagado no cuenta", () => {
    // ct2 debe 30.000 y no aparece; ct3 esta pagado y no suma.
    expect(cobertura(filas, blob).feeEntradaFueraDeAlcance).toBe(30000);
  });

  test("un tablero vacio se distingue de un tablero con saldo no determinable", () => {
    const r = resumenCobranza(filas, blob);
    expect(r.porCobrar.n).toBe(0);
    expect(r.porCobrar.determinable).toBe(false);      // no hay filas: nada que afirmar
    expect(r.porCobrar.indeterminables).toBe(0);
  });

  test("una fila con monto y vencimiento resueltos SI es determinable", () => {
    const b = JSON.parse(JSON.stringify(blob));
    b.feeEntrada[0].nFact = "F-1";
    b.feeEntrada[0].fechaVencimiento = "2026-08-01";
    const f = filasCobranza(b, new Date("2026-09-09T15:00:00Z"));
    const r = resumenCobranza(f, b);
    expect(r.vencido.n).toBe(1);
    expect(r.vencido.determinable).toBe(true);
    expect(r.vencido.monto).toBe(30000);
  });

  test("cobertura completa cuando todos los contratos tienen hecho", () => {
    const b = { contratos: [{ id: "ct1", cliente: "A", montoContractFee: 1, fechaContrato: "2024-01-01" }],
                clientes: [], royaltyPlanta: [], royaltyComercial: [], feeViveros: [],
                feeEntrada: [{ id: "fe1", ctId: "ct1", montoUSD: 1, nFact: "", pagado: false }] };
    expect(cobertura(filasCobranza(b, new Date("2026-09-09T15:00:00Z")), b).completa).toBe(true);
  });

  test("cada fila cae en exactamente un tablero: no se pueden sumar dos veces", () => {
    const r = resumenCobranza(filas, blob);
    const suma = r.porFacturar.n + r.porCobrar.n + r.vencido.n + r.informacionPendiente.n + r.conflicto.n;
    const noCerradas = filas.filter((f) => f.estado !== ESTADO.CERRADO).length;
    expect(suma).toBe(noCerradas);
    expect(new Set(filas.map((f) => f.id)).size).toBe(filas.length);
  });
});

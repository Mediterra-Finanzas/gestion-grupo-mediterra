/* eslint-disable */
/* El modelo de vencimiento aprobado, caso por caso. Lo que se prueba sobre todo
 * es lo que NO hace: no supone un plazo, no clasifica como vencida una factura
 * sin vencimiento, y no netea notas de crédito que no existen. */
const {
  resolverVencimiento, plazoDocumentado, saldoDe, clasificar, filasCobranza,
  resumenCobranza, agruparParaCorreo, hoyCivil, sumarDias, diasDeAtraso,
  ESTADO, ORIGEN_VENCIMIENTO, SIN_RESPONSABLE,
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

  test("el resumen entrega los cuatro tableros", () => {
    const r = resumenCobranza(filas);
    for (const k of ["porFacturar", "porCobrar", "vencido", "informacionPendiente"])
      expect(r[k]).toEqual(expect.objectContaining({ n: expect.any(Number), monto: expect.any(Number) }));
    expect(r.porFacturar.n).toBe(2);
    expect(r.porFacturar.monto).toBe(30000);   // solo feeEntrada tiene monto cargado
  });

  test("el correo agrupa sin duplicar filas", () => {
    const { porResponsable, consolidado } = agruparParaCorreo(filas);
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
    expect(resumenCobranza(f2).vencido.n).toBe(0);
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

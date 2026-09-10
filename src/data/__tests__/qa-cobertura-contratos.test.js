/* eslint-disable */
/* Cobertura de contratos y correos de cobranza. Lo que se prueba sobre todo es lo
 * que NO pasa: un contrato no desaparece, un conflicto no se resuelve solo, un
 * importe contractual no se presenta como deuda y un correo no sale a un
 * destinatario real en modo prueba. */
const { evaluarContratos, evaluarContractFee, evaluarRoyaltyPlanta, evaluarRoyaltyComercial, resumir, CLASE }
  = require("../../ux/coberturaContratos.js");
const { planificarEnvios, esDestinatarioDePrueba, claveEnvio } = require("../../ux/avisoCobranza.js");

const ct = (x) => ({ id: "ct", razonSocial: "Cliente", tipoContractFee: "Sin Devolución", montoContractFee: 30000,
                     firmadoLicenciado: true, firmadoOsiris: true, ...x });

describe("contract fee · cuatro clases y conflicto", () => {
  test("factura y pago en el contrato → cerrado con evidencia", () => {
    expect(evaluarContractFee(ct({ contractFeeNFact: "43", contractFeePagado: true, contractFeeFechaPago: "2024-09-25" })).clase)
      .toBe(CLASE.CERRADO_CON_EVIDENCIA);
  });
  test("factura sin pago → pendiente confirmado", () => {
    expect(evaluarContractFee(ct({ contractFeeNFact: "44", contractFeeEstado: "porCobrar" })).clase).toBe(CLASE.PENDIENTE_CONFIRMADO);
  });
  test("sin factura ni pago → información pendiente, importe pendiente de conciliación, no deuda", () => {
    const r = evaluarContractFee(ct({}));
    expect(r.clase).toBe(CLASE.INFO_PENDIENTE);
    expect(r.pendienteConciliacion).toBe(30000);
    expect(r.motivo).toMatch(/pendiente de conciliación/);
    expect(r.motivo).not.toMatch(/deuda/);
  });
  test("pago sin factura → información pendiente, no cerrado", () => {
    expect(evaluarContractFee(ct({ contractFeePagado: true })).clase).toBe(CLASE.INFO_PENDIENTE);
  });
  test("sin contract fee → no aplicable", () => {
    expect(evaluarContractFee(ct({ tipoContractFee: "Sin Contract Fee" })).clase).toBe(CLASE.NO_APLICABLE);
    expect(evaluarContractFee(ct({ montoContractFee: 0 })).clase).toBe(CLASE.NO_APLICABLE);
  });
  test("caso Agroextiende: contrato pagado con factura, registro persistido por cobrar sin factura → conflicto", () => {
    const r = evaluarContractFee(ct({ contractFeeNFact: "43", contractFeePagado: true, contractFeeEstado: "pagado" }),
                                 { ctId: "ct", nFact: "", pagado: false, estadoCF: "porCobrar" });
    expect(r.clase).toBe(CLASE.CONFLICTO);
    expect(r.motivo).toMatch(/factura distinto/);
    expect(r.motivo).toMatch(/contrato dice pagado/);
  });
  test("un registro persistido que coincide no genera conflicto", () => {
    expect(evaluarContractFee(ct({ contractFeeNFact: "43", contractFeePagado: true }), { nFact: "43", pagado: true }).clase)
      .toBe(CLASE.CERRADO_CON_EVIDENCIA);
  });
  test("la ausencia de registro persistido no es una afirmación contraria", () => {
    expect(evaluarContractFee(ct({ contractFeeNFact: "43", contractFeePagado: true }), undefined).clase)
      .toBe(CLASE.CERRADO_CON_EVIDENCIA);
  });
});

describe("royalty planta y comercial", () => {
  test("sin plantaciones, OC ni cuotas → no aplicable", () => {
    expect(evaluarRoyaltyPlanta(ct({})).clase).toBe(CLASE.NO_APLICABLE);
  });
  test("plantaciones sin plan de cuotas → información pendiente", () => {
    expect(evaluarRoyaltyPlanta(ct({ plantaciones: [{}] })).clase).toBe(CLASE.INFO_PENDIENTE);
  });
  test("cuota con factura sin pago domina sobre cuotas cerradas", () => {
    const r = evaluarRoyaltyPlanta(ct({ rpPlantaCuotas: [
      { id: "a", fechaEvento: "2025-01-01", nFact: "1", fechaPago: "2025-02-01" },
      { id: "b", fechaEvento: "2025-03-01", nFact: "2" } ] }));
    expect(r.clase).toBe(CLASE.PENDIENTE_CONFIRMADO);
    expect(r.cuotas).toBe(2);
  });
  test("royalty comercial sin base comercial → no aplicable; con base y sin mes → información pendiente", () => {
    expect(evaluarRoyaltyComercial(ct({ valorRoyaltyComercial: 3000 })).clase).toBe(CLASE.NO_APLICABLE);
    expect(evaluarRoyaltyComercial(ct({ valorRoyaltyComercial: 3000, plantaciones: [{ tipoPlantacion: "Comercial" }] })).clase)
      .toBe(CLASE.INFO_PENDIENTE);
  });
  test("precedencia: conflicto > pendiente > información > cerrado > no aplica", () => {
    expect(resumir([CLASE.CERRADO_CON_EVIDENCIA, CLASE.CONFLICTO])).toBe(CLASE.CONFLICTO);
    expect(resumir([CLASE.NO_APLICABLE, CLASE.INFO_PENDIENTE])).toBe(CLASE.INFO_PENDIENTE);
    expect(resumir([CLASE.NO_APLICABLE])).toBe(CLASE.NO_APLICABLE);
  });
});

describe("evaluación de todos los contratos · ninguno desaparece", () => {
  const blob = {
    contratos: [
      ct({ id: "c1", contractFeeNFact: "43", contractFeePagado: true, contractFeeEstado: "pagado" }),
      ct({ id: "c2", contractFeeNFact: "44" }),
      ct({ id: "c3" }),
      ct({ id: "c4", tipoContractFee: "Sin Contract Fee" }),
      ct({ id: "c5", contractFeeNFact: "45", contractFeePagado: true }),
    ],
    feeEntrada: [{ id: "fe_c1", ctId: "c1", nFact: "", pagado: false }],
    royaltyPlanta: [], royaltyComercial: [], feeViveros: [],
  };
  const r = evaluarContratos(blob);

  test("los cinco contratos quedan evaluados, con o sin hecho persistido", () => {
    expect(r.contratos).toHaveLength(5);
    expect(r.completa).toBe(true);
    expect(Object.values(r.porClase).reduce((a, b) => a + b, 0)).toBe(5);
  });
  test("contratos, líneas, cuotas y hechos son cantidades distintas", () => {
    expect(r.conteos.contratosEvaluados).toBe(5);
    expect(r.conteos.lineasDeConcepto).toBe(15);
    expect(r.conteos.hechosPersistidos).toBe(1);
  });
  test("los importes del contract fee cuadran con la suma bruta", () => {
    const f = r.contractFee;
    expect(f.pendienteConfirmado + f.pendienteDeConciliacion + f.cerradoConEvidencia + f.enConflicto)
      .toBe(4 * 30000);                                   // c4 no tiene fee
    expect(f.enConflicto).toBe(30000);
    expect(f.pendienteDeConciliacion).toBe(30000);
  });
});

describe("correos · modo prueba, conflictos fuera, sin duplicados, cierre", () => {
  const blob = {
    contratos: [
      ct({ id: "c1", razonSocial: "Conflicto SA", contractFeeNFact: "43", contractFeePagado: true, responsableInterno: "Ana" }),
      ct({ id: "c2", razonSocial: "Pendiente SA", contractFeeNFact: "44", responsableInterno: "Ana" }),
      ct({ id: "c3", razonSocial: "Sin Responsable SA" }),
    ],
    feeEntrada: [{ id: "fe_c1", ctId: "c1", nFact: "", pagado: false }],
  };
  const ev = evaluarContratos(blob);
  const directorio = { Ana: "ana@ejemplo.invalid" };
  const cfo = "cfo@ejemplo.invalid";

  test("un destinatario real en modo prueba bloquea todo el envío", () => {
    const p = planificarEnvios({ evaluacion: ev, directorio: { Ana: "ana@grupomediterra.cl" }, cfo, fecha: "2026-09-10" });
    expect(p.ok).toBe(false);
    expect(p.correos).toHaveLength(0);
    expect(esDestinatarioDePrueba("x@ejemplo.invalid")).toBe(true);
    expect(esDestinatarioDePrueba("x@grupomediterra.cl")).toBe(false);
  });

  test("el conflicto no entra en ningún correo, pero el consolidado cuenta la exclusión", () => {
    const p = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10" });
    expect(p.ok).toBe(true);
    for (const c of p.correos) expect(c.html).not.toContain("Conflicto SA");
    const cons = p.correos.find((c) => c.para === cfo);
    expect(cons.html).toMatch(/línea\(s\) de contratos en conflicto excluidas/);
    expect(p.contratosExcluidos).toBe(1);
  });

  test("un contrato en conflicto sale ENTERO: tampoco van sus lineas que no estan en conflicto", () => {
    const b = JSON.parse(JSON.stringify(blob));
    b.contratos[0].plantaciones = [{}];            // royalty planta: informacion pendiente, no conflicto
    b.contratos[0].responsableInterno = undefined; // iria a tareas de configuracion si no se excluyera
    const p = planificarEnvios({ evaluacion: evaluarContratos(b), directorio, cfo, fecha: "2026-09-10" });
    for (const c of p.correos) expect(c.html).not.toContain("Conflicto SA");
    expect(p.excluidosPorConflicto).toBeGreaterThanOrEqual(2);
  });

  test("sin responsable no hay correo individual: va como tarea de configuración al consolidado", () => {
    const p = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10" });
    const ana = p.correos.find((c) => c.para === "ana@ejemplo.invalid");
    expect(ana.html).toContain("Pendiente SA");
    expect(ana.html).not.toContain("Sin Responsable SA");
    const cons = p.correos.find((c) => c.para === cfo);
    expect(cons.html).toMatch(/Tareas de configuración/);
    expect(cons.html).toContain("Sin Responsable SA");
    expect(p.tareasConfiguracion).toBeGreaterThan(0);
  });

  test("los importes van rotulados como contractuales, nunca como deuda", () => {
    const p = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10" });
    for (const c of p.correos) { expect(c.html).toMatch(/importes son contractuales/i); expect(c.html).not.toMatch(/\bdeuda confirmada\b(?! ni)/i); }
  });

  test("segundo intento el mismo día no reenvía nada", () => {
    const p1 = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10" });
    const hist = new Set(p1.clavesNuevas);
    const p2 = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10", historial: hist });
    const lineas = p2.correos.reduce((s, c) => s + c.lineas + c.configuracion, 0);
    expect(lineas).toBe(0);
  });

  test("al día siguiente vuelve a avisar lo que sigue pendiente", () => {
    const p1 = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-10" });
    const p2 = planificarEnvios({ evaluacion: ev, directorio, cfo, fecha: "2026-09-11", historial: new Set(p1.clavesNuevas) });
    expect(p2.correos.reduce((s, c) => s + c.lineas, 0)).toBeGreaterThan(0);
  });

  test("una línea que se cierra genera un aviso de cierre, una sola vez", () => {
    const previas = new Map([["c2|Contract Fee", CLASE.PENDIENTE_CONFIRMADO]]);
    const b2 = JSON.parse(JSON.stringify(blob));
    b2.contratos[1].contractFeePagado = true;
    const ev2 = evaluarContratos(b2);
    const p1 = planificarEnvios({ evaluacion: ev2, directorio, cfo, fecha: "2026-09-12", previas });
    const cons = p1.correos.find((c) => c.para === cfo);
    expect(cons.cierres).toBe(1);
    const p2 = planificarEnvios({ evaluacion: ev2, directorio, cfo, fecha: "2026-09-12", previas, historial: new Set(p1.clavesNuevas) });
    expect((p2.correos.find((c) => c.para === cfo) || { cierres: 0 }).cierres).toBe(0);
  });

  test("la clave de envío es estable y distingue clase", () => {
    const l = { contratoId: "c2", concepto: "Contract Fee", clase: CLASE.PENDIENTE_CONFIRMADO };
    expect(claveEnvio("2026-09-10", "A@ejemplo.invalid", l)).toBe(claveEnvio("2026-09-10", "a@ejemplo.invalid", l));
    expect(claveEnvio("2026-09-10", "a@ejemplo.invalid", l)).not.toBe(claveEnvio("2026-09-10", "a@ejemplo.invalid", { ...l, clase: CLASE.CONFLICTO }));
  });
});

/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// OSIRIS · COBERTURA DE LOS CONTRATOS
// ═══════════════════════════════════════════════════════════════════
//
// La bandeja anterior partía de los hechos de ingreso persistidos, y un contrato
// sin hecho desaparecía. Aquí se parte de los CONTRATOS: los 23 se evalúan, con
// o sin hecho, y cada uno queda en una de cuatro clases. Ninguno desaparece.
//
// SOLO LECTURA. No crea facturas, cobros ni hechos, y no modifica importes.
//
// Por qué se lee el contrato y no la fila persistida: el código del módulo lo
// declara ("El contrato es la fuente de verdad", derivarContractFeeDesdeContratos),
// y la pestaña Contratos es donde se registran factura y pago del fee. Pero la
// pestaña Fee Entrada muestra la fila persistida de `feeEntrada[]` sin mirar el
// contrato. Son dos fuentes para el mismo hecho, editadas en dos pantallas que no
// se sincronizan. Cuando ambas tienen un valor y difieren, NO se elige: es
// conflicto.

export const CLASE = {
  PENDIENTE_CONFIRMADO: "pendiente_confirmado",   // hay factura emitida y no hay pago registrado
  CERRADO_CON_EVIDENCIA: "cerrado_con_evidencia", // hay factura y pago registrados
  NO_APLICABLE: "no_aplicable",                   // el contrato no genera este concepto, o aún no tiene base
  INFO_PENDIENTE: "informacion_pendiente",        // falta un dato para poder decir algo
  CONFLICTO: "conflicto",                         // dos registros del mismo hecho se contradicen
};

// Precedencia para resumir un contrato con varios conceptos: lo que exige
// atención humana primero.
const PRECEDENCIA = [CLASE.CONFLICTO, CLASE.PENDIENTE_CONFIRMADO, CLASE.INFO_PENDIENTE,
                     CLASE.CERRADO_CON_EVIDENCIA, CLASE.NO_APLICABLE];

export const ETIQUETA = {
  [CLASE.PENDIENTE_CONFIRMADO]: "Pendiente confirmado",
  [CLASE.CERRADO_CON_EVIDENCIA]: "Cerrado con evidencia",
  [CLASE.NO_APLICABLE]: "No aplicable",
  [CLASE.INFO_PENDIENTE]: "Información pendiente",
  [CLASE.CONFLICTO]: "Conflicto",
};

const txt = (v) => (v == null ? "" : String(v)).trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* ── CONTRACT FEE ─────────────────────────────────────────────────────────── */
export function evaluarContractFee(ct, persistido) {
  const tipo = txt(ct.tipoContractFee);
  const monto = num(ct.montoContractFee);
  if (!tipo || tipo === "Sin Contract Fee" || monto <= 0)
    return { concepto: "Contract Fee", clase: CLASE.NO_APLICABLE, motivo: "el contrato no tiene contract fee", importe: 0 };

  const ctFact = txt(ct.contractFeeNFact);
  const ctPagado = ct.contractFeePagado === true || txt(ct.contractFeeEstado) === "pagado";
  const ctFechaPago = txt(ct.contractFeeFechaPago);
  const base = { concepto: "Contract Fee", importe: monto, moneda: txt(ct.moneda) || "USD",
                 evidencia: { factura: !!ctFact, pago: ctPagado, fechaPago: ctFechaPago || null, fuente: "contrato" } };

  // Conflicto solo cuando hay DOS registros con valor y difieren. Una fila
  // persistida que no existe no es una afirmación: es la ausencia de ella.
  if (persistido) {
    const peFact = txt(persistido.nFact);
    const pePagado = persistido.pagado === true || txt(persistido.estadoCF) === "pagado";
    const difFact = ctFact !== peFact;
    const difPago = ctPagado !== pePagado;
    if (difFact || difPago)
      return { ...base, clase: CLASE.CONFLICTO,
               motivo: [difFact && "número de factura distinto entre contrato y registro de Fee Entrada",
                        difPago && `el contrato dice ${ctPagado ? "pagado" : "no pagado"} y el registro dice ${pePagado ? "pagado" : "no pagado"}`]
                        .filter(Boolean).join(" · "),
               registros: { contrato: { factura: !!ctFact, pagado: ctPagado }, feeEntrada: { factura: !!peFact, pagado: pePagado } } };
  }

  if (ctFact && ctPagado)
    return { ...base, clase: CLASE.CERRADO_CON_EVIDENCIA,
             motivo: ctFechaPago ? "factura y pago registrados en el contrato" : "factura y pago registrados, sin fecha de pago" };
  if (ctFact && !ctPagado)
    return { ...base, clase: CLASE.PENDIENTE_CONFIRMADO, motivo: "factura emitida en el contrato, sin pago registrado" };
  if (!ctFact && ctPagado)
    return { ...base, clase: CLASE.INFO_PENDIENTE, motivo: "pago registrado sin número de factura" };
  // Sin factura y sin pago: puede estar por facturar, o registrado en otro lado.
  // No se afirma deuda: queda como importe contractual pendiente de conciliación.
  return { ...base, clase: CLASE.INFO_PENDIENTE, motivo: "sin factura ni pago registrados · importe contractual pendiente de conciliación",
           pendienteConciliacion: monto };
}

/* ── ROYALTY PLANTA · por cuota ───────────────────────────────────────────── */
export function evaluarRoyaltyPlanta(ct) {
  const cuotas = Array.isArray(ct.rpPlantaCuotas) ? ct.rpPlantaCuotas : [];
  const plant = Array.isArray(ct.plantaciones) ? ct.plantaciones : [];
  const ocs = Array.isArray(ct.ordenesCompra) ? ct.ordenesCompra : [];
  if (!cuotas.length) {
    if (!plant.length && !ocs.length)
      return { concepto: "Royalty Planta", clase: CLASE.NO_APLICABLE, motivo: "sin plantaciones, órdenes de compra ni cuotas", cuotas: 0 };
    return { concepto: "Royalty Planta", clase: CLASE.INFO_PENDIENTE,
             motivo: `${plant.length} plantaciones y ${ocs.length} OC sin plan de cuotas`, cuotas: 0 };
  }
  const det = cuotas.map((q) => {
    const fact = !!txt(q.nFact), pago = q.pagado === true || !!txt(q.fechaPago) || txt(q.estadoCF) === "pagado";
    const clase = fact && pago ? CLASE.CERRADO_CON_EVIDENCIA
                : fact ? CLASE.PENDIENTE_CONFIRMADO
                : !txt(q.fechaEvento) ? CLASE.INFO_PENDIENTE
                : pago ? CLASE.INFO_PENDIENTE
                : CLASE.INFO_PENDIENTE;
    const motivo = fact && pago ? "factura y pago" : fact ? "factura sin pago" : !txt(q.fechaEvento) ? "cuota sin fecha de evento"
                 : pago ? "pago sin factura" : "evento sin factura";
    return { id: txt(q.id), clase, motivo };
  });
  return { concepto: "Royalty Planta", clase: resumir(det.map((d) => d.clase)), cuotas: det.length, detalle: det,
           motivo: contar(det.map((d) => d.motivo)) };
}

/* ── ROYALTY COMERCIAL ─────────────────────────────────────────────────────── */
export function evaluarRoyaltyComercial(ct) {
  const valor = num(ct.valorRoyaltyComercial);
  const comerciales = (ct.plantaciones || []).filter((p) => /comercial/i.test(txt(p.tipoPlantacion)));
  const cohortes = Array.isArray(ct.rcCohortes) ? ct.rcCohortes : [];
  if (valor <= 0) return { concepto: "Royalty Comercial", clase: CLASE.NO_APLICABLE, motivo: "sin valor de royalty comercial" };
  if (!comerciales.length && !cohortes.length)
    return { concepto: "Royalty Comercial", clase: CLASE.NO_APLICABLE, motivo: "sin plantaciones comerciales ni cohortes: aún no hay base" };
  const mes = num(ct.rcMesCobro || ct.mesFacuracionRC);
  if (!(mes >= 1 && mes <= 12))
    return { concepto: "Royalty Comercial", clase: CLASE.INFO_PENDIENTE,
             motivo: `${comerciales.length} plantaciones comerciales sin mes de cobro definido` };
  const pagos = Array.isArray(ct.rcPagos) ? ct.rcPagos : [];
  if (!pagos.length) return { concepto: "Royalty Comercial", clase: CLASE.INFO_PENDIENTE, motivo: "mes de cobro definido, sin registros de cobro" };
  const det = pagos.map((p) => (txt(p.nFact) && (p.pagado === true || txt(p.fechaPago)) ? CLASE.CERRADO_CON_EVIDENCIA
                              : txt(p.nFact) ? CLASE.PENDIENTE_CONFIRMADO : CLASE.INFO_PENDIENTE));
  return { concepto: "Royalty Comercial", clase: resumir(det), motivo: `${pagos.length} registros de cobro` };
}

export function resumir(clases) {
  for (const c of PRECEDENCIA) if (clases.includes(c)) return c;
  return CLASE.NO_APLICABLE;
}
function contar(motivos) {
  const m = {}; for (const x of motivos) m[x] = (m[x] || 0) + 1;
  return Object.entries(m).map(([k, n]) => `${n} ${k}`).join(" · ");
}

/* ── EVALUACIÓN DE TODOS LOS CONTRATOS ────────────────────────────────────── */
export function evaluarContratos(blob) {
  const persistidos = new Map((blob?.feeEntrada || []).filter((r) => r && r.ctId).map((r) => [txt(r.ctId), r]));
  const contratos = (blob?.contratos || []).map((ct) => {
    const conceptos = [
      evaluarContractFee(ct, persistidos.get(txt(ct.id))),
      evaluarRoyaltyPlanta(ct),
      evaluarRoyaltyComercial(ct),
    ];
    return {
      contratoId: txt(ct.id),
      cliente: txt(ct.razonSocial || ct.cliente) || "—",
      moneda: txt(ct.moneda) || "USD",
      firmado: !!(ct.firmadoLicenciado && ct.firmadoOsiris),
      clase: resumir(conceptos.map((c) => c.clase)),
      conceptos,
      responsable: txt(ct.responsableInterno) || null,
    };
  });

  const porClase = {};
  for (const k of Object.values(CLASE)) porClase[k] = contratos.filter((c) => c.clase === k).length;
  const lineas = contratos.flatMap((c) => c.conceptos);
  const porConcepto = {};
  for (const l of lineas) {
    porConcepto[l.concepto] = porConcepto[l.concepto] || {};
    porConcepto[l.concepto][l.clase] = (porConcepto[l.concepto][l.clase] || 0) + 1;
  }
  const fee = lineas.filter((l) => l.concepto === "Contract Fee");
  const suma = (arr) => +arr.reduce((s, l) => s + num(l.importe), 0).toFixed(2);

  return {
    contratos,
    // Tres cantidades distintas, que no se deben mezclar en un solo número:
    conteos: {
      contratosEvaluados: contratos.length,
      lineasDeConcepto: lineas.length,
      cuotasRoyaltyPlanta: lineas.filter((l) => l.concepto === "Royalty Planta").reduce((s, l) => s + (l.cuotas || 0), 0),
      hechosPersistidos: ["feeEntrada", "royaltyPlanta", "royaltyComercial", "feeViveros"]
        .reduce((s, k) => s + (Array.isArray(blob?.[k]) ? blob[k].length : 0), 0),
    },
    porClase,
    porConcepto,
    contractFee: {
      // Importes CONTRACTUALES. No son deuda confirmada ni facturación exigible.
      pendienteConfirmado: suma(fee.filter((l) => l.clase === CLASE.PENDIENTE_CONFIRMADO)),
      pendienteDeConciliacion: +fee.reduce((s, l) => s + num(l.pendienteConciliacion), 0).toFixed(2),
      cerradoConEvidencia: suma(fee.filter((l) => l.clase === CLASE.CERRADO_CON_EVIDENCIA)),
      enConflicto: suma(fee.filter((l) => l.clase === CLASE.CONFLICTO)),
      noAplicable: fee.filter((l) => l.clase === CLASE.NO_APLICABLE).length,
    },
    completa: contratos.length === (blob?.contratos || []).length,
  };
}

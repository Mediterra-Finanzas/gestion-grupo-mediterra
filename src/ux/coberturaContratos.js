/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// OSIRIS · COBERTURA DE LOS CONTRATOS
// ═══════════════════════════════════════════════════════════════════
//
// Se parte de los CONTRATOS, no de los hechos persistidos: los 23 se evalúan,
// con o sin hecho, y ninguno desaparece.
//
// SOLO LECTURA. No crea facturas, cobros ni hechos, y no modifica importes.
//
// El contrato es la fuente canónica del contract fee (así lo declara el código
// del módulo). La fila persistida de `feeEntrada[]` se conserva como registro
// histórico: si tiene valor y difiere del contrato, es CONFLICTO y no se elige.
//
// "Marcado pagado en el sistema" NO es "pago corroborado". Un contrato con
// número de factura y estado pagado sólo dice que alguien lo marcó así. Pasa a
// corroborado únicamente si el registro trae un comprobante o una referencia de
// conciliación bancaria. Hoy, en producción, no hay ninguno.

export const CLASE = {
  PENDIENTE_CONFIRMADO: "pendiente_confirmado",   // hay factura emitida y no hay pago registrado
  CERRADO_CON_EVIDENCIA: "cerrado_con_evidencia", // factura y pago MARCADOS en el sistema, sin corroborar
  PAGO_CORROBORADO: "pago_corroborado",           // factura y pago con comprobante o conciliación
  NO_APLICABLE: "no_aplicable",                   // el contrato no genera este concepto, o aún no tiene base
  INFO_PENDIENTE: "informacion_pendiente",        // falta un dato para poder decir algo
  CONFLICTO: "conflicto",                         // dos registros del mismo hecho se contradicen
};

// Lo que exige atención humana primero. "Marcado pagado" va antes que
// "corroborado" porque todavía pide una verificación.
const PRECEDENCIA = [CLASE.CONFLICTO, CLASE.PENDIENTE_CONFIRMADO, CLASE.INFO_PENDIENTE,
                     CLASE.CERRADO_CON_EVIDENCIA, CLASE.PAGO_CORROBORADO, CLASE.NO_APLICABLE];

export const ETIQUETA = {
  [CLASE.PENDIENTE_CONFIRMADO]: "Pendiente confirmado",
  [CLASE.CERRADO_CON_EVIDENCIA]: "Marcado pagado en el sistema",
  [CLASE.PAGO_CORROBORADO]: "Pago corroborado",
  [CLASE.NO_APLICABLE]: "No aplicable",
  [CLASE.INFO_PENDIENTE]: "Información pendiente",
  [CLASE.CONFLICTO]: "Conflicto",
};

const txt = (v) => (v == null ? "" : String(v)).trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* Corroboración: un comprobante (ruta + hash) o una referencia de conciliación.
 * Un texto libre o una casilla marcada no corroboran nada. */
export function corroboracionDe(o, prefijo = "") {
  const comp = o && o[prefijo ? prefijo + "Comprobante" : "comprobante"];
  const conc = o && o[prefijo ? prefijo + "Conciliacion" : "conciliacion"];
  if (comp && typeof comp === "object" && txt(comp.ruta) && /^[0-9a-f]{64}$/i.test(txt(comp.sha256))) return "documento";
  if (conc && typeof conc === "object" && txt(conc.referencia) && txt(conc.fecha)) return "conciliacion";
  return null;
}

/* ── CONTRACT FEE ─────────────────────────────────────────────────────────── */
export function evaluarContractFee(ct, persistido) {
  const tipo = txt(ct.tipoContractFee);
  const monto = num(ct.montoContractFee);
  if (!tipo || tipo === "Sin Contract Fee" || monto <= 0)
    return { concepto: "Contract Fee", clase: CLASE.NO_APLICABLE, motivo: "el contrato no tiene contract fee", importe: 0 };

  const ctFact = txt(ct.contractFeeNFact);
  const ctPagado = ct.contractFeePagado === true || txt(ct.contractFeeEstado) === "pagado";
  const ctFechaPago = txt(ct.contractFeeFechaPago);
  const corroboracion = corroboracionDe(ct, "contractFee");
  const base = { concepto: "Contract Fee", importe: monto, moneda: txt(ct.moneda) || "USD",
                 evidencia: { factura: !!ctFact, pago: ctPagado, fechaPago: ctFechaPago || null,
                              corroboracion: corroboracion || "sin corroborar", fuente: "contrato" } };

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

  if (ctFact && ctPagado) {
    if (corroboracion)
      return { ...base, clase: CLASE.PAGO_CORROBORADO, motivo: `pago corroborado por ${corroboracion}` };
    return { ...base, clase: CLASE.CERRADO_CON_EVIDENCIA,
             motivo: ctFechaPago ? "marcado pagado en el sistema, sin comprobante ni conciliación"
                                 : "marcado pagado en el sistema, sin fecha de pago ni comprobante" };
  }
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
    const corr = corroboracionDe(q);
    const clase = fact && pago ? (corr ? CLASE.PAGO_CORROBORADO : CLASE.CERRADO_CON_EVIDENCIA)
                : fact ? CLASE.PENDIENTE_CONFIRMADO
                : CLASE.INFO_PENDIENTE;
    const motivo = fact && pago ? (corr ? "factura y pago corroborado" : "factura y pago marcados")
                 : fact ? "factura sin pago" : !txt(q.fechaEvento) ? "cuota sin fecha de evento"
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
  const det = pagos.map((p) => (txt(p.nFact) && (p.pagado === true || txt(p.fechaPago))
                                 ? (corroboracionDe(p) ? CLASE.PAGO_CORROBORADO : CLASE.CERRADO_CON_EVIDENCIA)
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
  const marcado = suma(fee.filter((l) => l.clase === CLASE.CERRADO_CON_EVIDENCIA));

  return {
    contratos,
    // Cantidades distintas, que no se deben mezclar en un solo número:
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
      marcadoPagadoSinCorroborar: marcado,
      cerradoConEvidencia: marcado,          // alias histórico del mismo importe; no implica corroboración
      pagoCorroborado: suma(fee.filter((l) => l.clase === CLASE.PAGO_CORROBORADO)),
      enConflicto: suma(fee.filter((l) => l.clase === CLASE.CONFLICTO)),
      noAplicable: fee.filter((l) => l.clase === CLASE.NO_APLICABLE).length,
    },
    completa: contratos.length === (blob?.contratos || []).length,
  };
}

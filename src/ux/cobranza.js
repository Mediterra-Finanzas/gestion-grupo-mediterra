/* eslint-disable */
// ═══════════════════════════════════════════════════════════════════
// OSIRIS · FACTURACIÓN Y COBRANZA
// ═══════════════════════════════════════════════════════════════════
//
// Extiende el carril que ya existe (`selectores.js`). No crea otra fuente de
// verdad: lee los mismos `contratos[]` y las mismas tablas de hechos derivadas
// (`feeEntrada`, `royaltyPlanta`, `royaltyComercial`, `feeViveros`), que ya se
// generan desde el contrato con `_fromContract`.
//
// Dos estados SEPARADOS, porque son dos trabajos distintos de dos personas
// distintas:
//   POR FACTURAR — el hito contractual se cumplió y todavía no hay factura.
//   POR COBRAR   — hay factura emitida y queda saldo.
// Una factura emitida ya no está "por facturar", y un hito sin factura todavía
// no está "por cobrar".
//
// VENCIMIENTO, en este orden y sin atajos:
//   1. fecha explícita de vencimiento de la factura;
//   2. si no hay, fecha de emisión + plazo documentado de esa factura o cliente;
//   3. si no hay ninguna de las dos → "Completar vencimiento".
// Nunca se supone un plazo general, y nunca se reescribe una condición histórica.

export const ESTADO = {
  POR_FACTURAR: "por_facturar",
  POR_COBRAR: "por_cobrar",
  VENCIDO: "vencido",
  INFO_PENDIENTE: "informacion_pendiente",
  CERRADO: "cerrado",
};

export const ORIGEN_VENCIMIENTO = {
  EXPLICITO: "explicito",
  CALCULADO: "calculado",
  AUSENTE: "ausente",
};

export const SIN_RESPONSABLE = "Sin asignar";

const txt = (v) => (v == null ? "" : String(v)).trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/* Fechas civiles de Chile. Comparar un vencimiento con `new Date()` en una
 * máquina en UTC adelanta el atraso un día durante toda la mañana chilena. */
export const TZ_CHILE = "America/Santiago";

export function hoyCivil(ahora = new Date(), tz = TZ_CHILE) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(ahora); // YYYY-MM-DD
}

export function aFechaCivil(v) {
  const s = txt(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : hoyCivil(d);
}

export function sumarDias(fechaCivil, dias) {
  if (!fechaCivil) return null;
  const [a, m, d] = fechaCivil.split("-").map(Number);
  const base = Date.UTC(a, m - 1, d) + num(dias) * 86400000;
  return new Date(base).toISOString().slice(0, 10);
}

export function diasDeAtraso(vencimiento, hoy) {
  if (!vencimiento) return null;
  const ms = Date.UTC(...vencimiento.split("-").map(Number).map((x, i) => (i === 1 ? x - 1 : x)))
           - Date.UTC(...hoy.split("-").map(Number).map((x, i) => (i === 1 ? x - 1 : x)));
  return Math.round(-ms / 86400000); // > 0 = atrasado
}

/* ── VENCIMIENTO ─────────────────────────────────────────────────────────────
 * `plazoDe(factura, cliente, contrato)` devuelve los días documentados, o null.
 * Se busca en la factura, luego en el contrato, luego en el cliente. Si ninguno
 * lo declara, no se inventa: la fila queda "Completar vencimiento". */
export function plazoDocumentado({ factura, contrato, cliente }) {
  for (const [fuente, obj] of [["factura", factura], ["contrato", contrato], ["cliente", cliente]]) {
    if (!obj) continue;
    for (const k of ["plazoPagoDias", "diasPago", "condicionPagoDias"]) {
      const v = obj[k];
      if (v != null && txt(v) !== "" && Number.isFinite(Number(v)) && Number(v) >= 0)
        return { dias: Number(v), fuente };
    }
  }
  return null;
}

export function resolverVencimiento({ factura, contrato, cliente }) {
  const explicito = aFechaCivil(factura && (factura.fechaVencimiento || factura.vencimiento));
  if (explicito) return { vencimiento: explicito, origen: ORIGEN_VENCIMIENTO.EXPLICITO, fuente: "factura" };

  const emision = aFechaCivil(factura && (factura.fechaEmision || factura.fecha_factura || factura.fechaFactura));
  const plazo = plazoDocumentado({ factura, contrato, cliente });
  if (emision && plazo)
    return { vencimiento: sumarDias(emision, plazo.dias), origen: ORIGEN_VENCIMIENTO.CALCULADO,
             fuente: `emisión ${emision} + ${plazo.dias} días (${plazo.fuente})` };

  return {
    vencimiento: null, origen: ORIGEN_VENCIMIENTO.AUSENTE,
    fuente: !emision && !plazo ? "sin fecha de emisión ni plazo documentado"
          : !emision ? "sin fecha de emisión" : "sin plazo documentado",
  };
}

/* ── SALDO ───────────────────────────────────────────────────────────────────
 * Considera pagos parciales y ajustes REGISTRADOS. No inventa notas de crédito
 * ni anulaciones: si no están en los datos, no existen y no se netean. */
export function saldoDe(factura) {
  const total = num(factura && (factura.montoUSD ?? factura.monto ?? factura.montoFacturado));
  const pagos = Array.isArray(factura && factura.pagos) ? factura.pagos
              : Array.isArray(factura && factura.cobros) ? factura.cobros : [];
  const pagado = pagos.filter((p) => p && (p.pagado === true || p.pagada === true || p.fecha_pago || p.fechaPago))
                      .reduce((s, p) => s + num(p.monto ?? p.montoUSD), 0);
  const ajustes = Array.isArray(factura && factura.ajustes)
    ? factura.ajustes.reduce((s, a) => s + num(a.monto), 0) : 0;
  // Retrocompatibilidad: el modelo viejo solo tiene el booleano `pagado`.
  const pagadoLegacy = pagos.length === 0 && factura && factura.pagado === true ? total : 0;
  const cobrado = pagado + pagadoLegacy;
  return { total, cobrado, ajustes, saldo: +(total - cobrado - ajustes).toFixed(2), parciales: pagos.length };
}

export function tieneFactura(f) {
  return !!txt(f && (f.nFact || f.n_factura || f.numeroFactura));
}

/* ── CLASIFICACIÓN ───────────────────────────────────────────────────────── */
export function clasificar(fila, hoy) {
  if (!tieneFactura(fila.factura)) {
    // Un hito sin factura: por facturar. Solo si el hito ya se cumplió.
    if (!fila.hito || !fila.hito.fecha) return { estado: ESTADO.INFO_PENDIENTE, motivo: "hito sin fecha" };
    return fila.hito.fecha <= hoy
      ? { estado: ESTADO.POR_FACTURAR, motivo: `hito ${fila.hito.descripcion || ""} el ${fila.hito.fecha}` }
      : { estado: ESTADO.CERRADO, motivo: "hito futuro" };
  }
  const { saldo } = saldoDe(fila.factura);
  if (saldo <= 0) return { estado: ESTADO.CERRADO, motivo: "saldo cero" };
  if (fila.venc.origen === ORIGEN_VENCIMIENTO.AUSENTE)
    return { estado: ESTADO.INFO_PENDIENTE, motivo: "Completar vencimiento — " + fila.venc.fuente };
  const atraso = diasDeAtraso(fila.venc.vencimiento, hoy);
  return atraso > 0
    ? { estado: ESTADO.VENCIDO, motivo: `${atraso} días de atraso`, atraso }
    : { estado: ESTADO.POR_COBRAR, motivo: `vence en ${-atraso} días`, atraso };
}

/* ── BANDEJA ─────────────────────────────────────────────────────────────────
 * Una fila por hecho de ingreso. Los cuatro flujos comparten forma para que la
 * bandeja sea una sola, no cuatro pantallas parecidas. */
const FLUJOS = [
  { clave: "feeEntrada", concepto: "Contract Fee" },
  { clave: "royaltyPlanta", concepto: "Royalty Planta" },
  { clave: "royaltyComercial", concepto: "Royalty Comercial" },
  { clave: "feeViveros", concepto: "Fee Vivero" },
];

export function filasCobranza(blob, ahora = new Date()) {
  const hoy = hoyCivil(ahora);
  const contratos = new Map((blob?.contratos || []).map((c) => [txt(c.id), c]));
  const clientes = new Map((blob?.clientes || []).map((c) => [txt(c.id), c]));
  const filas = [];

  for (const flujo of FLUJOS) {
    for (const h of blob?.[flujo.clave] || []) {
      const ct = contratos.get(txt(h.ctId)) || null;
      const cli = clientes.get(txt(ct && ct.clienteId)) || null;
      const hito = hitoDe(flujo.clave, h, ct);
      const factura = facturaDe(flujo.clave, h, ct);
      const venc = resolverVencimiento({ factura, contrato: ct, cliente: cli });
      const base = { flujo: flujo.clave, concepto: flujo.concepto, hito, factura, venc };
      const cl = clasificar(base, hoy);
      const s = saldoDe(factura);
      filas.push({
        id: txt(h.id),
        cliente: txt(h.cliente || (ct && ct.cliente) || (cli && cli.razonSocial)) || "—",
        contratoId: txt(h.ctId), contrato: txt(ct && (ct.nombreComercial || ct.razonSocial || ct.id)) || "—",
        concepto: flujo.concepto,
        moneda: txt(ct && ct.moneda) || "USD",
        nFact: txt(factura && (factura.nFact || factura.n_factura)) || null,
        fechaHito: hito ? hito.fecha : null,
        fechaEmision: aFechaCivil(factura && (factura.fechaEmision || factura.fechaFactura)),
        vencimiento: venc.vencimiento,
        origenVencimiento: venc.origen,
        detalleVencimiento: venc.fuente,
        total: s.total, cobrado: s.cobrado, ajustes: s.ajustes, saldo: s.saldo, pagosParciales: s.parciales,
        atraso: cl.atraso == null ? null : cl.atraso,
        estado: cl.estado, motivo: cl.motivo,
        responsable: txt(h.responsableInterno || (ct && ct.responsableInterno)) || SIN_RESPONSABLE,
        contactoCliente: txt(cli && cli.contactoCobranza) || null,   // contacto del cliente, NO el responsable
        accion: accionDe(cl.estado),
      });
    }
  }
  return filas;
}

function accionDe(estado) {
  return { [ESTADO.POR_FACTURAR]: "Emitir factura",
           [ESTADO.POR_COBRAR]: "Seguimiento de cobro",
           [ESTADO.VENCIDO]: "Gestionar cobranza",
           [ESTADO.INFO_PENDIENTE]: "Completar vencimiento",
           [ESTADO.CERRADO]: "—" }[estado] || "—";
}

/* El hito vive en el contrato, no en el hecho: es la regla contractual la que
 * dispara la facturación, no el devengo económico. */
function hitoDe(flujo, h, ct) {
  if (!ct) return null;
  if (flujo === "feeEntrada")
    return { fecha: aFechaCivil(ct.fechaContrato), descripcion: "firma de contrato" };
  if (flujo === "royaltyPlanta") {
    const cuota = (ct.rpPlantaCuotas || []).find((q) => txt(q.id) === txt(h.cuotaId));
    return cuota ? { fecha: aFechaCivil(cuota.fechaEvento), descripcion: txt(cuota.descripcion) || "cuota" } : null;
  }
  if (flujo === "royaltyComercial") {
    const mes = Number(ct.rcMesCobro || ct.mesFacuracionRC);   // el campo tiene una errata histórica
    const anio = Number(h.añoCobro);
    return mes >= 1 && mes <= 12 && anio
      ? { fecha: `${anio}-${String(mes).padStart(2, "0")}-01`, descripcion: `mes de facturación ${mes}` }
      : null;
  }
  return null;
}

/* La factura no es una entidad aparte todavía: sus campos viven en el hecho o
 * en el contrato. Se normaliza la lectura sin mover los datos de lugar. */
function facturaDe(flujo, h, ct) {
  if (flujo === "feeEntrada")
    return { nFact: h.nFact, montoUSD: h.montoUSD, pagado: h.pagado, fechaPago: h.fechaPago,
             fechaEmision: h.fechaEmision || h.fechaFactura,
             fechaVencimiento: h.fechaVencimiento, plazoPagoDias: h.plazoPagoDias,
             pagos: h.pagos || h.cobros, ajustes: h.ajustes };
  if (flujo === "royaltyPlanta") {
    const cuota = (ct?.rpPlantaCuotas || []).find((q) => txt(q.id) === txt(h.cuotaId)) || {};
    return { nFact: cuota.nFact || h.nFact, montoUSD: h.montoFacturado, fechaPago: cuota.fechaPago,
             fechaEmision: cuota.fechaEmision, fechaVencimiento: cuota.fechaVencimiento,
             plazoPagoDias: cuota.plazoPagoDias, pagos: h.pagos || h.cobros, ajustes: h.ajustes,
             pagado: !!cuota.fechaPago };
  }
  return { nFact: h.nFact, montoUSD: h.montoFacturado ?? h.montoUSD, pagado: h.pagado,
           fechaEmision: h.fechaEmision, fechaVencimiento: h.fechaVencimiento,
           plazoPagoDias: h.plazoPagoDias, pagos: h.pagos || h.cobros, ajustes: h.ajustes };
}

/* Los cuatro tableros del inicio ejecutivo. */
export function resumenCobranza(filas) {
  const de = (e) => filas.filter((f) => f.estado === e);
  const suma = (l) => +l.reduce((s, f) => s + (f.estado === ESTADO.POR_FACTURAR ? f.total : f.saldo), 0).toFixed(2);
  const porFacturar = de(ESTADO.POR_FACTURAR), porCobrar = de(ESTADO.POR_COBRAR);
  const vencido = de(ESTADO.VENCIDO), pendiente = de(ESTADO.INFO_PENDIENTE);
  return {
    porFacturar: { n: porFacturar.length, monto: suma(porFacturar), filas: porFacturar },
    porCobrar: { n: porCobrar.length, monto: suma(porCobrar), filas: porCobrar },
    vencido: { n: vencido.length, monto: suma(vencido), filas: vencido,
               peorAtraso: vencido.reduce((m, f) => Math.max(m, f.atraso || 0), 0) },
    informacionPendiente: { n: pendiente.length, monto: suma(pendiente), filas: pendiente },
  };
}

/* Correo diario. Un responsable, un correo; el CFO recibe el consolidado.
 * Sin duplicados: cada fila aparece una sola vez por destinatario. */
export function agruparParaCorreo(filas) {
  const porResponsable = new Map();
  for (const f of filas) {
    if (f.estado === ESTADO.CERRADO) continue;
    const k = f.responsable || SIN_RESPONSABLE;
    if (!porResponsable.has(k)) porResponsable.set(k, []);
    porResponsable.get(k).push(f);
  }
  const consolidado = filas.filter((f) => f.estado !== ESTADO.CERRADO);
  return { porResponsable, consolidado, resumen: resumenCobranza(filas) };
}

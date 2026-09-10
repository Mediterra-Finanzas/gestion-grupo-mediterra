/* Datos de la planilla unica de conciliacion. PRODUCCION, solo lectura (GET).
 * La clasificacion sale del mismo modulo que usa la pantalla (coberturaContratos.js),
 * para que planilla y bandeja no puedan decir cosas distintas.
 * El JSON resultante trae nombres y numeros de factura reales: queda en el scratchpad
 * local y alimenta un archivo que no se commitea. */
import { readFileSync, writeFileSync } from "node:fs";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const H = { apikey: K, Authorization: "Bearer " + K };
const leer = async (id) => {
  const r = await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H });
  if (!r.ok) throw new Error(id + " HTTP " + r.status);
  return (await r.json())[0];
};
const COB = await import("file:///" + W + "/src/ux/coberturaContratos.js");
const VEN = await import("file:///" + W + "/src/ux/cobranza.js");

const [os, au, main] = await Promise.all([leer("osiris"), leer("audit_log"), leer("main")]);
const v = os.value;
const ev = au.value.eventos;
const inicioBitacora = ev.map((e) => e.timestamp).sort()[0];
const persistidos = new Map((v.feeEntrada || []).filter((r) => r.ctId).map((r) => [String(r.ctId), r]));
const ctPorId = new Map(v.contratos.map((c) => [String(c.id), c]));
const evaluacion = COB.evaluarContratos(v);

const DECISION = (concepto, l) => {
  const C = COB.CLASE;
  if (l.clase === C.CONFLICTO) return "Cotejar factura y comprobante; decidir qué registro corrige al otro. No se resuelve automáticamente.";
  if (l.clase === C.CERRADO_CON_EVIDENCIA) return "Corroborar el pago con comprobante o conciliación bancaria.";
  if (l.clase === C.PAGO_CORROBORADO) return "Ninguna.";
  if (l.clase === C.NO_APLICABLE) return "Confirmar que no aplica.";
  if (l.clase === C.PENDIENTE_CONFIRMADO) return concepto === "Contract Fee"
    ? "Confirmar que el pago sigue pendiente y registrar vencimiento o plazo." : "Confirmar cobro de las cuotas facturadas y registrar vencimiento.";
  // informacion pendiente
  if (/pendiente de conciliación/.test(l.motivo)) return "Conciliar: ¿se facturó?, ¿se cobró?, ¿corresponde cobrarlo?";
  if (/pago registrado sin número de factura/.test(l.motivo)) return "Registrar el número de factura.";
  if (/sin plan de cuotas/.test(l.motivo)) return "Definir plan de cuotas o confirmar que aún no corresponde.";
  if (/sin mes de cobro/.test(l.motivo)) return "Definir mes de cobro del royalty comercial.";
  if (/sin fecha de evento|evento sin factura/.test(l.motivo)) return "Registrar fecha de evento y factura de las cuotas.";
  return "Completar la información faltante.";
};

const filas = [];
const cuotas = [];
const evidencia = [];
let n = 0;
for (const c of evaluacion.contratos) {
  const ct = ctPorId.get(c.contratoId);
  const pe = persistidos.get(c.contratoId);
  const [cf, rp, rc] = c.conceptos;
  const base = { contratoId: c.contratoId, cliente: c.cliente, pais: ct.pais || "", firmado: c.firmado ? "Sí" : "No",
                 fechaContrato: ct.fechaContrato || "", moneda: c.moneda, responsable: c.responsable || "Sin asignar" };
  const venc = VEN.resolverVencimiento({ factura: { fechaEmision: ct.contractFeeFechaEmision, plazoPagoDias: ct.contractFeePlazoDias }, contrato: ct });

  // Contract fee
  filas.push({ n: ++n, ...base, concepto: "Contract fee", tipo: ct.tipoContractFee || "",
    importe: cf.importe || 0, factura: ct.contractFeeNFact || "",
    pagoSistema: ct.contractFeePagado === true || ct.contractFeeEstado === "pagado" ? "Marcado pagado" : (ct.contractFeeEstado || "Sin estado"),
    fechaPago: ct.contractFeeFechaPago || "",
    corroboracion: cf.evidencia ? cf.evidencia.corroboracion : "—",
    vencimiento: cf.clase === COB.CLASE.NO_APLICABLE ? "—" : (venc.vencimiento || "Completar vencimiento · " + venc.fuente),
    fuente: "Contrato (pestaña Contratos)" + (pe ? " · existe registro histórico en Fee Entrada" : ""),
    historico: pe ? `Fee Entrada: estado ${pe.estadoCF || (pe.pagado ? "pagado" : "por cobrar")} · factura ${pe.nFact || "vacía"} · pago ${pe.fechaPago || "vacío"} · monto ${pe.montoUSD ?? "—"}` : "",
    discrepancia: cf.clase === COB.CLASE.CONFLICTO ? cf.motivo : "",
    clasificacion: COB.ETIQUETA[cf.clase], motivo: cf.motivo, decision: DECISION("Contract Fee", cf) });

  // Royalty planta (resumen del contrato; el detalle va en la hoja de cuotas)
  const qs = ct.rpPlantaCuotas || [];
  filas.push({ n: ++n, ...base, concepto: "Royalty planta", tipo: `${qs.length} cuotas`,
    importe: null, factura: qs.length ? `${qs.filter((q) => q.nFact).length} de ${qs.length} con factura` : "",
    pagoSistema: qs.length ? `${qs.filter((q) => q.pagado === true || q.fechaPago || q.estadoCF === "pagado").length} de ${qs.length} con pago` : "",
    fechaPago: "", corroboracion: qs.length ? "sin corroborar" : "—",
    vencimiento: rp.clase === COB.CLASE.NO_APLICABLE ? "—" : "Completar vencimiento · sin fecha de emisión ni plazo documentado",
    fuente: "Contrato · cuotas (rpPlantaCuotas)", historico: "", discrepancia: "",
    clasificacion: COB.ETIQUETA[rp.clase], motivo: rp.motivo, decision: DECISION("Royalty Planta", rp) });
  for (const [i, q] of qs.entries()) {
    const d = (rp.detalle || [])[i] || {};
    cuotas.push({ contratoId: c.contratoId, cliente: c.cliente, cuota: q.id, descripcion: q.descripcion || "",
      fechaEvento: q.fechaEvento || "", nPlantas: q.nPlantas === "" || q.nPlantas == null ? null : Number(q.nPlantas),
      factura: q.nFact || "", fechaPago: q.fechaPago || "", estadoSistema: q.estadoCF || (q.pagado ? "pagado" : ""),
      clasificacion: COB.ETIQUETA[d.clase] || "", motivo: d.motivo || "", responsable: base.responsable });
  }

  // Royalty comercial
  filas.push({ n: ++n, ...base, concepto: "Royalty comercial", tipo: `valor ${ct.valorRoyaltyComercial ?? "—"} por ha`,
    importe: null, factura: "", pagoSistema: `${(ct.rcPagos || []).length} registros de cobro`, fechaPago: "",
    corroboracion: "—", vencimiento: rc.clase === COB.CLASE.NO_APLICABLE ? "—" : "Completar mes de cobro y vencimiento",
    fuente: "Contrato (valorRoyaltyComercial, rcMesCobro, plantaciones)", historico: "", discrepancia: "",
    clasificacion: COB.ETIQUETA[rc.clase], motivo: rc.motivo, decision: DECISION("Royalty Comercial", rc) });

  // Evidencia de los marcados pagados y del conflicto
  if (cf.clase === COB.CLASE.CERRADO_CON_EVIDENCIA || cf.clase === COB.CLASE.PAGO_CORROBORADO || cf.clase === COB.CLASE.CONFLICTO) {
    const evFee = ev.filter((e) => e.registroId === c.contratoId && /^contractFee(Estado|Pagado|NFact|FechaPago)$/.test(String(e.campo)))
      .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    const ultPago = [...evFee].reverse().find((e) => /Estado|Pagado/.test(e.campo));
    evidencia.push({ contratoId: c.contratoId, cliente: c.cliente, clasificacion: COB.ETIQUETA[cf.clase], importe: cf.importe,
      factura: ct.contractFeeNFact || "", fechaPago: ct.contractFeeFechaPago || "",
      comprobante: "No", conciliacion: "No",
      eventos: evFee.length,
      ultimoCambioPago: ultPago ? `${String(ultPago.timestamp).slice(0, 16).replace("T", " ")} · ${ultPago.campo}: ${ultPago.valorAnterior || "vacío"} → ${ultPago.valorNuevo || "vacío"} · rol ${ultPago.rol || "—"}` : "",
      origen: evFee.length ? "Cambios registrados en bitácora" : `Fijado antes del ${String(inicioBitacora).slice(0, 10)} (sin eventos)`,
      historico: pe ? `Fee Entrada: ${pe.estadoCF || (pe.pagado ? "pagado" : "por cobrar")}, factura ${pe.nFact || "vacía"}` : "" });
  }
}

const usuarios = (main.value.usuarios || [])
  .filter((u) => !u.desactivado && Array.isArray(u.modulos) && (u.modulos.includes("osiris") || u.modulos.includes("finanzas")))
  .map((u) => u.nombre).sort();

writeFileSync(process.env.SP + "/planilla-datos.json", JSON.stringify({
  generado: new Date().toISOString(), filaOsirisActualizada: os.updated_at, inicioBitacora,
  conteos: evaluacion.conteos, porClase: evaluacion.porClase, contractFee: evaluacion.contractFee,
  etiquetas: COB.ETIQUETA, filas, cuotas, evidencia, responsables: usuarios,
}, null, 1));
console.log("filas=" + filas.length + " cuotas=" + cuotas.length + " evidencia=" + evidencia.length + " responsables candidatos=" + usuarios.length);
console.log("contract fee: " + JSON.stringify(evaluacion.contractFee));
console.log("por clase: " + JSON.stringify(evaluacion.porClase));

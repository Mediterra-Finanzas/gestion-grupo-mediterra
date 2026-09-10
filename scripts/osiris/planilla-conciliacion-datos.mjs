/* Datos de la planilla unica de conciliacion. PRODUCCION, solo lectura (GET).
 * La clasificacion sale del mismo modulo que usa la pantalla (coberturaContratos.js),
 * para que planilla y bandeja no puedan decir cosas distintas.
 *
 * Obtentor: se VALIDA por contrato y concepto (quien calza por regla y quien por variedad
 * plantada) antes de aplicar porcentajes. Para contract fee ademas se calcula la obligacion
 * con el codigo REAL de Pago Obtentores (calcularDeudaObtentor, extraido de OsirisModule.jsx
 * de origin/main) sobre dos entradas: la vigente y la fuente unica (rama DETENIDA). El
 * resultado es un impacto calculado pendiente de conciliacion, no deuda.
 *
 * Tambien lista movimientos que mencionan al obtentor fuera de Osiris (mayor contable,
 * nominas, finanzas, rendiciones). Una coincidencia no prueba una liquidacion.
 *
 * Requiere en $SP: OsirisModule-main.jsx (git show origin/main:src/OsirisModule.jsx).
 * El JSON resultante trae nombres y numeros de factura reales: queda local y alimenta un
 * archivo que no se commitea. */
import { readFileSync, writeFileSync } from "node:fs";
const RAIZ = "C:/Users/angel/Documents/Proyectos/gestion-grupo-mediterra";
const W = RAIZ + "/.claude/worktrees/wt-respaldo-prod";
const WF = RAIZ + "/.claude/worktrees/wt-fee-fuente-unica";
const t = readFileSync(RAIZ + "/.env.osiris-prod-readonly.local", "utf8");
const G = (k) => t.match(new RegExp("^" + k + "=(.*)$", "m"))[1].trim();
const U = G("OSIRIS_PROD_SUPABASE_URL"), K = G("OSIRIS_PROD_SUPABASE_ANON_KEY_LEGACY");
const H = { apikey: K, Authorization: "Bearer " + K };
const leer = async (id) => {
  const r = await fetch(`${U}/rest/v1/calendario_data?id=eq.${id}&select=value,updated_at`, { headers: H });
  if (!r.ok) throw new Error(id + " HTTP " + r.status);
  return (await r.json())[0];
};
const leerOpcional = (id) => leer(id).catch(() => null);
const COB = await import("file:///" + W + "/src/ux/coberturaContratos.js");
const VEN = await import("file:///" + W + "/src/ux/cobranza.js");
const FEE = await import("file:///" + WF + "/src/data/feeEntradaCanonica.js");

// ── codigo real de Pago Obtentores (main, sin el parche de la fuente unica) ──────
const srcMain = readFileSync(process.env.SP + "/OsirisModule-main.jsx", "utf8");
function bloque(inicio) {
  const i = srcMain.indexOf(inicio);
  if (i < 0) throw new Error("no encontrado en OsirisModule de main: " + inicio);
  const j = srcMain.indexOf("{", i);
  let prof = 0;
  for (let k = j; k < srcMain.length; k++) {
    if (srcMain[k] === "{") prof++;
    else if (srcMain[k] === "}") { prof--; if (prof === 0) return srcMain.slice(i, k + 1); }
  }
  throw new Error("bloque sin cierre: " + inicio);
}
const REAL = new Function([
  bloque("const ESTADOS_CF = {") + ";",
  bloque("function resolveEstadoCF("),
  bloque("function ingresoMatchRegla("),
  bloque("function calcMontoObtentor("),
  bloque("function calcularDeudaObtentor("),
  "return { resolveEstadoCF, ingresoMatchRegla, calcularDeudaObtentor };",
].join("\n"))();

const [os, au, main, mayor, nomOs, nominas, finanzas, rendiciones] = await Promise.all([
  leer("osiris"), leer("audit_log"), leer("main"),
  leerOpcional("mayor_osiris_2026"), leerOpcional("nominas_osiris"), leerOpcional("nominas"),
  leerOpcional("finanzas"), leerOpcional("rendiciones"),
]);
const v = os.value;
const ev = au.value.eventos;
const inicioBitacora = ev.map((e) => e.timestamp).sort()[0];
const persistidos = new Map((v.feeEntrada || []).filter((r) => r.ctId).map((r) => [String(r.ctId), r]));
const ctPorId = new Map(v.contratos.map((c) => [String(c.id), c]));
const evaluacion = COB.evaluarContratos(v);

// ── Fee Entrada: entrada vigente (copia literal de la derivacion de main) y fuente unica ──
function feDataVigente() {
  const raw = v.feeEntrada || [];
  const edits = {};
  raw.forEach((r) => { if (r.ctId) edits[r.ctId] = r; edits[r.id] = r; });
  const fromContracts = v.contratos.filter((ct) => ct.tipoContractFee && ct.tipoContractFee !== "Sin Contract Fee").map((ct) => {
    const saved = edits[ct.id] || edits[`fe_${ct.id}`] || {};
    return { id: saved.id || `fe_${ct.id}`, ctId: ct.id, cliente: saved.cliente || ct.razonSocial, pais: saved.pais || ct.pais,
      montoUSD: saved.montoUSD != null ? saved.montoUSD : (ct.montoContractFee || 30000), detalle: saved.detalle || ct.tipoContractFee || "",
      nFact: saved.nFact ?? "", pagado: saved.pagado ?? false, fechaPago: saved.fechaPago ?? "", _fromContract: true };
  });
  return [...fromContracts, ...raw.filter((r) => !r.ctId && !r._fromContract)];
}
const feHoy = feDataVigente();
const feFU = FEE.filasParaConsumo(FEE.derivarFeeEntrada(v.contratos, v.feeEntrada || []));
const porCtHoy = new Map(feHoy.filter((r) => r.ctId).map((r) => [String(r.ctId), r]));
const porCtFU = new Map(feFU.filter((r) => r.ctId).map((r) => [String(r.ctId), r]));

const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const obtsCF = (v.obtentores || []).filter((o) => (o.participacionIngresos || []).some((r) => r.tipoIngreso === "contract_fee"));
const varPorId = new Map((v.variedades || []).map((x) => [String(x.id), x]));
const varPorNombre = new Map((v.variedades || []).map((x) => [norm(x.variedad), x]));

/* Suma de los items de contract fee que calcularDeudaObtentor produce para UNA fila, en
 * TODOS los obtentores. Si dos obtentores calzan con el mismo contrato, items > 1: es el
 * doble conteo que la regla actual permite y la columna lo deja a la vista. */
function sumaCalculo(fila) {
  const acc = { bruto: 0, wht: 0, neto: 0, items: 0 };
  if (!fila) return acc;
  for (const o of v.obtentores || []) {
    const r = REAL.calcularDeudaObtentor(o, v.contratos, [fila], [], []);
    for (const it of r.items.filter((i) => i.tipo === "contract_fee")) {
      acc.bruto += it.deudaBruta; acc.wht += it.wht; acc.neto += it.neto; acc.items++;
    }
  }
  return acc;
}

/* Validacion del obtentor por contrato y CONCEPTO, antes de aplicar porcentajes: que
 * obtentor calza por regla (lo que usa el calculo) y que obtentor dicen las variedades
 * plantadas (lo que el calculo no mira). */
function validarObtentor(ct, tipoIngreso) {
  const aplicables = [];
  for (const o of v.obtentores || [])
    for (const rg of (o.participacionIngresos || []).filter((r) => r.tipoIngreso === tipoIngreso))
      if (REAL.ingresoMatchRegla(rg, ct.especie || "", ct.variedad || ""))
        aplicables.push({ obtentor: String(o.obtentor || "").trim(), id: o.id, valor: Number(rg.valor), wht: Number(rg.wht) || 0,
                          tipoCalculo: rg.tipoCalculo, especie: rg.especie || "", variedad: rg.variedad || "" });
  const porVariedad = new Set();
  let sinVariedad = 0;
  for (const p of ct.plantaciones || []) {
    const vv = varPorId.get(String(p.variedad_id)) || varPorNombre.get(norm(p.variedad));
    if (vv && vv.obtentor) porVariedad.add(String(vv.obtentor).trim()); else sinVariedad++;
  }
  const delCalculo = [...new Set(aplicables.map((a) => a.obtentor))];
  const coinciden = porVariedad.size === 0 ? "Sin datos"
    : delCalculo.length === porVariedad.size && delCalculo.every((n) => [...porVariedad].some((m) => norm(m) === norm(n))) ? "Sí" : "No";
  const textoVariedades = [...[...porVariedad], ...(sinVariedad ? [`${sinVariedad} plantaciones sin variedad en el maestro`] : [])].join(" · ");
  return {
    aplicables,
    obtentorCalculo: delCalculo.join(" · ") || "Ninguno: ninguna regla de este concepto calza",
    obtentorVariedades: textoVariedades || "Sin plantaciones",
    coinciden,
    participacion: aplicables.length === 1 ? aplicables[0].valor : aplicables.length ? aplicables.map((a) => a.valor + " %").join(" + ") : null,
    retencion: aplicables.length === 1 ? aplicables[0].wht : aplicables.length ? aplicables.map((a) => a.wht + " %").join(" + ") : null,
    regla: aplicables.map((a) => `${a.tipoCalculo} ${a.valor} · WHT ${a.wht} % · especie ${a.especie || "todas"} · variedad ${a.variedad || "todas"}`).join(" | "),
  };
}
const validacionConcepto = (ct, tipo) => { const { aplicables, ...visible } = validarObtentor(ct, tipo); return { ...visible, soloValidacion: true }; };

function obligacionContrato(ct) {
  const id = String(ct.id);
  const hoy = porCtHoy.get(id), fu = porCtFU.get(id);
  const { aplicables, ...visible } = validarObtentor(ct, "contract_fee");
  const deHoy = sumaCalculo(hoy), deFU = sumaCalculo(fu);
  return {
    ...visible,
    cobroHoy: hoy ? REAL.resolveEstadoCF(hoy) : "sin fila",
    cobroFuenteUnica: fu ? (fu.enConciliacion ? "en conciliación (sin cobro en cálculos)" : REAL.resolveEstadoCF(fu)) : "sin fila",
    base: fu ? Number(fu.montoUSD) || 0 : null,
    brutoHoy: deHoy.bruto, netoHoy: deHoy.neto,
    brutoFU: deFU.bruto, whtFU: deFU.wht, netoFU: deFU.neto, items: deFU.items,
    pagosOsiris: Array.isArray(v.pagosObtentor)
      ? `${v.pagosObtentor.filter((p) => aplicables.some((a) => a.id === p.obtentorId)).length} registros del obtentor (Pago Obtentores los descuenta por obtentor, no por contrato)`
      : "0 · la colección pagosObtentor no existe en producción",
  };
}

// Control: la suma por contrato debe igualar el calculo sobre todo el blob.
const controlObligacion = { brutoHoy: 0, netoHoy: 0, brutoFU: 0, whtFU: 0, netoFU: 0 };
for (const o of v.obtentores || []) {
  const a = REAL.calcularDeudaObtentor(o, v.contratos, feHoy, [], []).items.filter((i) => i.tipo === "contract_fee");
  const b = REAL.calcularDeudaObtentor(o, v.contratos, feFU, [], []).items.filter((i) => i.tipo === "contract_fee");
  controlObligacion.brutoHoy += a.reduce((s, i) => s + i.deudaBruta, 0);
  controlObligacion.netoHoy += a.reduce((s, i) => s + i.neto, 0);
  controlObligacion.brutoFU += b.reduce((s, i) => s + i.deudaBruta, 0);
  controlObligacion.whtFU += b.reduce((s, i) => s + i.wht, 0);
  controlObligacion.netoFU += b.reduce((s, i) => s + i.neto, 0);
}

// ── movimientos que mencionan a un obtentor con reglas de contract fee ─────────
/* Coincidencia con el obtentor SIN palabras sueltas de rubro: "berries" sola trae
 * clientes y proveedores (medido: 12 de 15 hallazgos eran otros terceros). Calza si el
 * texto contiene el nombre compacto, o TODOS los tokens propios del nombre: los cortos
 * como palabra entera y los largos por su prefijo de 5 letras, que tolera erratas como
 * "BERRIS" en la glosa del pago. Se excluyen sufijos societarios y palabras de rubro. */
const SUFIJOS = new Set(["s", "a", "sa", "spa", "ltda", "ltd", "pty", "limited", "company", "co", "inc", "llc", "gmbh", "bv",
  "sac", "eirl", "group", "farm", "farms", "plant", "plants", "varieties", "genetics", "nursery", "the", "de", "del", "y", "and"]);
const compacto = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const patrones = obtsCF.map((o) => {
  const tokens = norm(o.obtentor).split(/[^a-z0-9]+/).filter((w) => w && !SUFIJOS.has(w));
  return { compacto: compacto(o.obtentor),
           tokens: tokens.map((w) => new RegExp(w.length < 5 ? "\\b" + w + "\\b" : "\\b" + w.slice(0, 5))) };
});
const calzaObtentor = (texto) => {
  const tx = norm(texto), cp = compacto(texto);
  return patrones.some((p) => (p.compacto.length >= 4 && cp.includes(p.compacto)) || (p.tokens.length >= 2 && p.tokens.every((re) => re.test(tx))));
};
function buscar(x, ruta, out) {
  if (Array.isArray(x)) { x.forEach((e, i) => buscar(e, ruta + "[" + i + "]", out)); return; }
  if (!x || typeof x !== "object") return;
  const propios = Object.entries(x).filter(([, val]) => ["string", "number", "boolean"].includes(typeof val));
  const texto = propios.filter(([, val]) => typeof val === "string").map(([, val]) => val).join(" | ");
  if (calzaObtentor(texto)) out.push(Object.fromEntries(propios));
  for (const [k, val] of Object.entries(x)) if (val && typeof val === "object") buscar(val, ruta + "." + k, out);
}
const movimientosObtentor = [];
for (const [fuente, fila] of Object.entries({ mayor_osiris_2026: mayor, nominas_osiris: nomOs, nominas, finanzas, rendiciones })) {
  if (!fila) continue;
  const hall = [];
  buscar(fila.value, fuente, hall);
  for (const r of hall) movimientosObtentor.push({
    fuente, fecha: r.fecha || "", tipo: r.tipo || r.categoria || "",
    cuenta: [r.codigoCuenta, r.nombreCuenta].filter(Boolean).join(" "), moneda: r.moneda || "",
    tc: r.tc != null && r.tc !== "" ? Number(r.tc) : null,
    debe: r.debe != null && r.debe !== "" ? Number(r.debe) : null,
    haber: r.haber != null && r.haber !== "" ? Number(r.haber) : null,
    monto: r.monto != null && r.monto !== "" ? Number(r.monto) : null,
    documento: r.numDoc || r.docNumero || "", glosa: r.glosa || r.descripcion || r.concepto || "",
  });
}

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
    clasificacion: COB.ETIQUETA[cf.clase], motivo: cf.motivo, decision: DECISION("Contract Fee", cf),
    obtentor: obligacionContrato(ct) });

  // Royalty planta (resumen del contrato; el detalle va en la hoja de cuotas)
  const qs = ct.rpPlantaCuotas || [];
  filas.push({ n: ++n, ...base, concepto: "Royalty planta", tipo: `${qs.length} cuotas`,
    importe: null, factura: qs.length ? `${qs.filter((q) => q.nFact).length} de ${qs.length} con factura` : "",
    pagoSistema: qs.length ? `${qs.filter((q) => q.pagado === true || q.fechaPago || q.estadoCF === "pagado").length} de ${qs.length} con pago` : "",
    fechaPago: "", corroboracion: qs.length ? "sin corroborar" : "—",
    vencimiento: rp.clase === COB.CLASE.NO_APLICABLE ? "—" : "Completar vencimiento · sin fecha de emisión ni plazo documentado",
    fuente: "Contrato · cuotas (rpPlantaCuotas)", historico: "", discrepancia: "",
    clasificacion: COB.ETIQUETA[rp.clase], motivo: rp.motivo, decision: DECISION("Royalty Planta", rp),
    obtentor: validacionConcepto(ct, "royalty_planta") });
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
    clasificacion: COB.ETIQUETA[rc.clase], motivo: rc.motivo, decision: DECISION("Royalty Comercial", rc),
    obtentor: validacionConcepto(ct, "royalty_comercial") });

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

// Cuadre interno antes de escribir: la suma por contrato debe igualar el control global.
const conMontos = filas.filter((f) => f.obtentor && !f.obtentor.soloValidacion);
const sumaFilas = (k) => conMontos.reduce((s, f) => s + f.obtentor[k], 0);
const cuadre = {
  netoFU: Math.round((sumaFilas("netoFU") - controlObligacion.netoFU) * 100) / 100,
  brutoFU: Math.round((sumaFilas("brutoFU") - controlObligacion.brutoFU) * 100) / 100,
  brutoMenosWhtMenosNeto: Math.round((sumaFilas("brutoFU") - sumaFilas("whtFU") - sumaFilas("netoFU")) * 100) / 100,
};

writeFileSync(process.env.SP + "/planilla-datos.json", JSON.stringify({
  generado: new Date().toISOString(), filaOsirisActualizada: os.updated_at, inicioBitacora,
  conteos: evaluacion.conteos, porClase: evaluacion.porClase, contractFee: evaluacion.contractFee,
  etiquetas: COB.ETIQUETA, filas, cuotas, evidencia, responsables: usuarios,
  controlObligacion, cuadreObligacion: cuadre, movimientosObtentor,
  pagosObtentorEnOsiris: Array.isArray(v.pagosObtentor) ? v.pagosObtentor.length : null,
}, null, 1));
console.log("filas=" + filas.length + " cuotas=" + cuotas.length + " evidencia=" + evidencia.length + " responsables candidatos=" + usuarios.length);
console.log("contract fee: " + JSON.stringify(evaluacion.contractFee));
console.log("por clase: " + JSON.stringify(evaluacion.porClase));
const r2 = (x) => Math.round(x * 100) / 100;
console.log("obligación contract fee · hoy bruto " + r2(controlObligacion.brutoHoy) + " neto " + r2(controlObligacion.netoHoy) +
            " · fuente única bruto " + r2(controlObligacion.brutoFU) + " retención " + r2(controlObligacion.whtFU) + " neto " + r2(controlObligacion.netoFU));
console.log("cuadres (deben ser 0): " + JSON.stringify(cuadre));
const porConcepto = {};
for (const f of filas) if (f.obtentor) { const k = f.concepto + " · " + f.obtentor.coinciden; porConcepto[k] = (porConcepto[k] || 0) + 1; }
console.log("validación de obtentor por concepto: " + JSON.stringify(porConcepto));
console.log("contratos con más de un ítem de contract fee: " + conMontos.filter((f) => f.obtentor.items > 1).length);
console.log("movimientos que mencionan al obtentor: " + movimientosObtentor.length + " · " +
            JSON.stringify(movimientosObtentor.reduce((a, m) => (a[m.fuente] = (a[m.fuente] || 0) + 1, a), {})));

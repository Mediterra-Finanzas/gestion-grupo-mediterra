/* eslint-disable */
// Tests de dominio proc_* F7.1 (node). Ejecutar: node src/proceso/core/procesoF7Domain.test.mjs
import { formatearCorrelativo, compactarTemporada, evaluarQC, badgeDe, traducirError, validarFiltros, calcularNeto, validarPesos, packout, resumenConciliacion, accionesOrden, faltaParaCerrar, ordenTerminal, despachoTerminal, puedeConfirmarDespacho, accionesDespacho, totalKg, montoServicio, especificidadTarifa, vigenciaTarifa, baseEditable, accionesBase, servicioAgregableABase, totalesPorMoneda, filtrosActivos, opcionesRef, limpiarDependencias, labelRef, resumenKgLotes, resumenOrigenes, tonoContractual, copiarOrigen, alertaContractual, transicionesContrato, tonoNivelContractual, qcPorLote, resumenQcRecepcion, rpcFecha, loteSinOrigen, qcListadoResumen, evaluarOrigenLote, textoQcCabecera, kgEntradaPorLote } from "./procesoF7Domain.js";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const eq = (a, b, m) => ok(a === b, `${m} (esperado ${JSON.stringify(b)}, obtenido ${JSON.stringify(a)})`);

// Correlativos (espejo del SQL)
eq(compactarTemporada("2026/2027"), "2627", "compacta 2026/2027 -> 2627");
eq(compactarTemporada("2526"), "2526", "compacta 2526 -> 2526");
eq(formatearCorrelativo("REC", "2026/2027", 1), "REC-2627-000001", "formato correlativo #1");
eq(formatearCorrelativo("PAL", "2026/2027", 42), "PAL-2627-000042", "formato correlativo #42");

// QC por severidad (espejo de proc_fn_registrar_qc)
const P = [
  { codigo: "firmeza", tipo_dato: "numero", rango_min: 60, rango_max: 90, severidad: "bloqueante", obligatorio: true },
  { codigo: "brix", tipo_dato: "numero", rango_min: 18, rango_max: 24, severidad: "advertencia", obligatorio: false },
  { codigo: "defectos", tipo_dato: "numero", rango_min: 0, rango_max: 5, severidad: "informativo", obligatorio: false },
];
eq(evaluarQC(P, { firmeza: "70", brix: "20", defectos: "2" }).resultado, "aprobado", "QC todo en rango -> aprobado");
eq(evaluarQC(P, { firmeza: "70", brix: "20", defectos: "12" }).resultado, "aprobado", "QC informativo fuera -> aprobado");
eq(evaluarQC(P, { firmeza: "70", brix: "30", defectos: "2" }).resultado, "condicional", "QC advertencia fuera -> condicional");
eq(evaluarQC(P, { firmeza: "40", brix: "20", defectos: "2" }).resultado, "rechazado", "QC bloqueante fuera -> rechazado");
ok(evaluarQC(P, { firmeza: "40" }).bloquea === true, "QC bloqueante -> bloquea true");
eq(evaluarQC(P, { brix: "20" }).resultado, "rechazado", "QC obligatorio faltante (bloqueante) -> rechazado");

// Estado -> badge
eq(badgeDe("en_proceso").tono, "primary", "en_proceso -> primary");
eq(badgeDe("pendiente_tarifa").tono, "warning", "pendiente_tarifa -> warning");
eq(badgeDe("bloqueado").tono, "danger", "bloqueado -> danger");
eq(badgeDe("desconocido").label, "desconocido", "estado desconocido -> passthrough");

// Traductor de errores
ok(/1450.*kg/i.test(traducirError("consumo 2000 excede disponible 1450.000 del lote abc")), "traduce stock lote");
ok(/no cuadra|tolerancia/i.test(traducirError("orden O1 no concilia: |diff|=150 > tolerancia=10")), "traduce conciliación");
ok(/permiso/i.test(traducirError("permission denied for table proc_lote")), "traduce permiso");
eq(traducirError(""), "Ocurrió un error inesperado.", "error vacío -> fallback");

// Pesos (kg_neto = bruto - tara)
eq(calcularNeto(10200, 200), 10000, "neto = 10200-200 = 10000");
ok(validarPesos({ bruto: 10200, tara: 200 }).ok, "pesos válidos");
eq(validarPesos({ bruto: 10200, tara: 200 }).neto, 10000, "validarPesos.neto");
ok(!validarPesos({ bruto: 100, tara: 200 }).ok, "neto negativo -> inválido");
ok(!validarPesos({ bruto: -5, tara: 0 }).ok, "bruto negativo -> inválido");

// Traductor QC gate
ok(/no puede consumirse|QC/i.test(traducirError("Lote no elegible para proceso: QC rechazado")), "traduce gate QC");

// Conciliación / packout (F7.3)
eq(packout(7800, 9800), 0.7959, "packout 7800/9800");
eq(resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }).diff, 0, "conciliación cuadra diff 0");
ok(resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }).cuadra, "cuadra dentro de tolerancia");
ok(!resumenConciliacion({ entrada: 9800, comercial: 7800, descarte: 1500, merma: 300, tolerancia: 49 }).cuadra, "descuadra 200 > tol 49");
eq(accionesOrden("en_proceso")[0].a, "pendiente_conciliacion", "acción de en_proceso");
ok(accionesOrden("cerrado").length === 0, "orden cerrada sin acciones");
ok(ordenTerminal("cerrado"), "cerrado es terminal");
ok(/por conciliar/i.test(faltaParaCerrar({ estado: "pendiente_conciliacion", entrada: 9800, comercial: 7800, descarte: 1500, merma: 300, tolerancia: 49 })), "falta: no cuadra");
ok(faltaParaCerrar({ estado: "pendiente_conciliacion", entrada: 9800, comercial: 7800, descarte: 1700, merma: 300, tolerancia: 49 }) === null, "nada falta cuando cuadra");

// Despacho (F7.5)
ok(despachoTerminal("despachado"), "despachado terminal");
ok(despachoTerminal("cancelado"), "cancelado terminal");
ok(!despachoTerminal("listo"), "listo no terminal");
ok(puedeConfirmarDespacho("listo"), "listo puede confirmar");
ok(!puedeConfirmarDespacho("borrador"), "borrador no puede confirmar");
eq(accionesDespacho("borrador")[0], "preparando", "borrador -> preparando");
ok(accionesDespacho("despachado").length === 0, "despachado sin transiciones simples");
eq(totalKg([{ estado: "confirmada", kg: 300 }, { estado: "reversada", kg: 200 }, { estado: "confirmada", kg: 200 }]), 500, "totalKg confirmadas");

// F7.7 Tarifario / Servicios / Base de cobro
eq(montoServicio(9800, 0.30), 2940, "9.800 kg × 0,30 = 2.940 (cantidad×tarifa)");
eq(montoServicio(9800, 0.3005), 2944.9, "redondeo a 2 decimales");
ok(montoServicio(null, 0.3) == null, "sin cantidad -> null (no $0)");
ok(montoServicio(100, null) == null, "sin tarifa -> null (no $0)");
eq(especificidadTarifa({}), "general", "tarifa general");
eq(especificidadTarifa({ cliente_vinculo_id: "c1", especie_codigo: "CHE" }), "cliente + especie", "específica cliente+especie");
eq(vigenciaTarifa({ vigencia_desde: "2026-01-01", vigencia_hasta: "2026-12-31" }, "2026-08-14"), "vigente", "vigente hoy");
eq(vigenciaTarifa({ vigencia_desde: "2027-01-01" }, "2026-08-14"), "futura", "vigencia futura");
eq(vigenciaTarifa({ vigencia_desde: "2025-01-01", vigencia_hasta: "2025-12-31" }, "2026-08-14"), "vencida", "vencida");
eq(vigenciaTarifa({ estado: "anulada", vigencia_desde: "2026-01-01" }, "2026-08-14"), "anulada", "estado no-vigente manda");
ok(baseEditable("borrador") && baseEditable("en_revision"), "base borrador/en_revision editable");
ok(!baseEditable("aprobada"), "base aprobada NO editable");
eq(accionesBase("borrador")[0].a, "aprobar", "base borrador -> aprobar");
ok(accionesBase("aprobada")[0].a === "enviada_a_facturacion", "aprobada -> enviar a facturación");
ok(accionesBase("cerrada").length === 0, "cerrada sin acciones");
ok(servicioAgregableABase("valorizado") && !servicioAgregableABase("pendiente_tarifa"), "solo valorizado se agrega a base");
const tm = totalesPorMoneda([{ subtotal: 2940, moneda: "USD" }, { subtotal: 100000, moneda: "CLP" }, { subtotal: 60, moneda: "USD" }]);
eq(tm.length, 2, "dos monedas no se mezclan");
eq(tm.find((x) => x.moneda === "USD").total, 3000, "USD suma 3.000");
eq(tm.find((x) => x.moneda === "CLP").total, 100000, "CLP separado");

// F7.8 Certificación de filtros — chips activos / acumulación / reset (helper puro)
{
  const F = (v1, v2, b) => filtrosActivos([{ key: "a", valor: v1 }, { key: "b", valor: v2 }], b);
  eq(F("", "", "").conteo, 0, "sin filtros -> 0 chips");
  eq(F("x", "", "").activos.length, 1, "un filtro activo -> 1 chip");
  eq(F("x", "y", "").activos.length, 2, "dos filtros -> 2 chips (acumulativo, no reemplazo)");
  eq(F("x", "y", "texto").conteo, 3, "dos filtros + búsqueda -> 3 activos");
  ok(!F("", "", "").hay, "nada activo -> reset oculto");
  ok(F("", "", "t").hay, "solo búsqueda -> hay activo");
  eq(F("todos", "", "").activos.length, 0, "'todos' no cuenta como filtro");
  ok(filtrosActivos(null, "").conteo === 0, "robusto ante filtros null");
}

// T10 · Cascada de maestros (helpers puros)
{
  const especies = [{ codigo: "CHE", nombre: "Cereza", activo: true }, { codigo: "PLU", nombre: "Ciruela", activo: true }, { codigo: "OLD", nombre: "Vieja", activo: false }];
  const variedades = [{ codigo: "SANTINA", nombre: "Santina", especie_codigo: "CHE", activo: true }, { codigo: "REGINA", nombre: "Regina", especie_codigo: "CHE", activo: true }, { codigo: "DAGEN", nombre: "D'Agen", especie_codigo: "PLU", activo: true }];
  const refEsp = { tabla: "proc_especie", value: "codigo", label: "nombre" };
  const refVar = { tabla: "proc_variedad", value: "codigo", label: "nombre", dep: "especie_codigo", depMatch: "especie_codigo" };
  // opciones especie: excluye inactiva
  eq(opcionesRef(especies, refEsp, {}).length, 2, "opcionesRef excluye inactivos");
  // H: Cereza -> Santina/Regina
  eq(opcionesRef(variedades, refVar, { especie_codigo: "CHE" }).length, 2, "H: variedades de Cereza = 2");
  eq(opcionesRef(variedades, refVar, { especie_codigo: "PLU" }).length, 1, "variedades de Ciruela = 1");
  // sin especie seleccionada -> vacío (disabled)
  eq(opcionesRef(variedades, refVar, {}).length, 0, "sin dep -> opciones vacías");
  // filtro por rol
  const vinc = [{ id: "1", nombre_provisional: "Prod", rol_operacional: "productor", activo: true }, { id: "2", nombre_provisional: "Cli", rol_operacional: "cliente_servicio", activo: true }];
  eq(opcionesRef(vinc, { tabla: "proc_vinculo", value: "id", label: "nombre_provisional", filter: (r) => r.rol_operacional === "productor" }, {}).length, 1, "filtro por rol productor");
  // I: cambiar Especie limpia Variedad
  const campos = [{ c: "especie_codigo", ref: refEsp }, { c: "variedad_codigo", ref: refVar }];
  const limpio = limpiarDependencias([{ c: "especie_codigo", ref: refEsp }, { c: "variedad_codigo", ref: { dep: "especie_codigo" } }], { especie_codigo: "CHE", variedad_codigo: "SANTINA" }, "especie_codigo");
  eq(limpio.variedad_codigo, "", "I: cambiar especie limpia variedad");
  eq(limpio.especie_codigo, "CHE", "limpiar no toca el padre");
  // no toca campos no relacionados
  const l2 = limpiarDependencias([{ c: "a", ref: { dep: "x" } }], { x: "1", a: "v", otro: "z" }, "x");
  eq(l2.otro, "z", "no toca campos no relacionados");
  // labelRef resuelve uuid -> nombre (no UUID crudo)
  eq(labelRef(vinc, { value: "id", label: "nombre_provisional" }, "1"), "Prod", "labelRef resuelve");
  eq(labelRef([], { value: "id", label: "x" }, null), "—", "labelRef null -> guion");
}

// T10c · Recepción multi-lote
{
  const lts = [{ kg: 4000, productorId: "A", predioId: "P1", cuartelId: "C1" }, { kg: 3000, productorId: "A", predioId: "P1", cuartelId: "C2" }, { kg: 2000, productorId: "B", predioId: "P2", cuartelId: "C3" }];
  // H: suma kg
  eq(resumenKgLotes(9000, lts).asignado, 9000, "H: suma kg lotes = 9000");
  // I: pendiente por asignar
  const r1 = resumenKgLotes(9500, lts); eq(r1.pendiente, 500, "I: pendiente 500"); eq(r1.exceso, 0, "sin exceso");
  // J: exceso asignado
  const r2 = resumenKgLotes(8800, lts); eq(r2.exceso, 200, "J: exceso 200"); eq(r2.pendiente, 0, "sin pendiente");
  // resumen de orígenes: 3 lotes, 2 productores, 2 predios, 3 cuarteles
  const ro = resumenOrigenes(lts); eq(ro.lotes, 3, "3 lotes"); eq(ro.productores, 2, "2 productores"); eq(ro.predios, 2, "2 predios"); eq(ro.cuarteles, 3, "3 cuarteles");
  // K/L/M: tono contractual por nivel
  eq(tonoContractual("bloqueante"), "danger", "M: blocking -> danger");
  eq(tonoContractual("advertencia"), "warning", "L: warning");
  eq(tonoContractual("no_requerido"), "success", "K: sin requisito -> success");
  // C: copy-down hereda origen pero NO kg/ubicación
  const cp = copiarOrigen({ productorId: "A", predioId: "P1", cuartelId: "C1", especie_codigo: "CHE", variedad_codigo: "SANTINA", kg: 4000, ubicacion: "U1" });
  eq(cp.productorId, "A", "C: copia productor"); eq(cp.especie_codigo, "CHE", "copia especie"); eq(cp.kg, "", "C: NO copia kg"); eq(cp.ubicacion, "", "C: NO copia ubicación");
}

// ── T10d · Contrato / estado contractual / QC por lote (helpers puros) ──
{
  // Badges de la máquina de estados del contrato (C-visual)
  eq(badgeDe("vigente").tono, "success", "badge vigente -> success");
  eq(badgeDe("vencido").tono, "danger", "badge vencido -> danger");
  eq(badgeDe("pendiente_firma").tono, "warning", "badge pendiente_firma -> warning");
  eq(badgeDe("reemplazado").tono, "neutral", "badge reemplazado -> neutral");
  // Transiciones (espejo del guard T7)
  ok(transicionesContrato("borrador").includes("pendiente_firma"), "borrador -> pendiente_firma");
  ok(transicionesContrato("pendiente_firma").includes("vigente"), "pendiente_firma -> vigente");
  ok(transicionesContrato("vigente").includes("reemplazado"), "vigente -> reemplazado");
  eq(transicionesContrato("reemplazado").length, 0, "reemplazado es terminal");
  ok(!transicionesContrato("borrador").includes("vigente"), "borrador NO salta a vigente directo");
  // Tono por nivel del backend
  eq(tonoNivelContractual("bloqueante"), "danger", "nivel bloqueante -> danger");
  eq(tonoNivelContractual("advertencia"), "warning", "nivel advertencia -> warning");
  eq(tonoNivelContractual("ok"), "success", "nivel ok -> success");
  // Alerta contractual (mapea nivel → presentación; no recrea la regla)
  eq(alertaContractual({ nivel: "ok", estado_display: "Contrato vigente" }).mostrar, false, "ok no alerta");
  eq(alertaContractual({ nivel: "bloqueante" }).mostrar, true, "bloqueante alerta");
  eq(alertaContractual({ nivel: "bloqueante" }).tono, "danger", "bloqueante -> danger");
  eq(alertaContractual({ nivel: "advertencia" }).tono, "warning", "advertencia -> warning");
  eq(alertaContractual(null).mostrar, false, "sin estado no alerta");
  // C19/C20: QC por lote (propio) vs fallback header
  const lotes = [{ id: "L1", especie_codigo: "CHE" }, { id: "L2", especie_codigo: "PLU" }, { id: "L3", especie_codigo: "CHE" }];
  const qcRows = [
    { lote_id: "L1", resultado: "aprobado", valores: {} },
    { lote_id: "L2", resultado: "rechazado", valores: {} },
    { lote_id: null, resultado: "aprobado", valores: {} }, // header
  ];
  const q = qcPorLote(lotes, qcRows);
  eq(q.find((x) => x.id === "L1").resultado, "aprobado", "C19: L1 QC propio aprobado");
  eq(q.find((x) => x.id === "L2").resultado, "rechazado", "C19: L2 QC propio rechazado independiente");
  eq(q.find((x) => x.id === "L1").esHeader, false, "L1 no es fallback");
  eq(q.find((x) => x.id === "L3").resultado, "aprobado", "C20: L3 sin QC propio usa header");
  eq(q.find((x) => x.id === "L3").esHeader, true, "C20: L3 marcado como fallback header");
  // sin header: lote sin QC propio queda sin resultado
  const q2 = qcPorLote([{ id: "L9", especie_codigo: "CHE" }], [{ lote_id: "L1", resultado: "aprobado" }]);
  eq(q2[0].resultado, null, "sin QC propio ni header -> sin resultado");
  eq(q2[0].tieneQc, false, "sin QC -> tieneQc false");
  // E1: resumen QC de recepción (conteos + mixto; sin veredicto global)
  const rq = resumenQcRecepcion(lotes, qcRows);
  eq(rq.total, 3, "E1: 3 lotes");
  eq(rq.aprobados, 2, "E1: 2 aprobados (L1 propio + L3 header)");
  eq(rq.rechazados, 1, "E1: 1 rechazado (L2)");
  eq(rq.mixto, true, "E1: QC mixto (aprobado+rechazado)");
  const rq2 = resumenQcRecepcion([{ id: "A" }, { id: "B" }], [{ lote_id: "A", resultado: "aprobado" }]);
  eq(rq2.pendientes, 1, "E1: B sin QC ni header -> pendiente");
  eq(rq2.mixto, false, "E1: un solo resultado -> no mixto");
}

// rpcFecha (T11-VIS-CONTRACT-DETAIL-01): omitir p_fecha si no viene → deja aplicar DEFAULT current_date;
// NUNCA enviar p_fecha:null (anula el DEFAULT del SQL).
{
  eq(JSON.stringify(rpcFecha(undefined)), "{}", "rpcFecha(undefined) -> {} (omite, aplica DEFAULT)");
  eq(JSON.stringify(rpcFecha(null)), "{}", "rpcFecha(null) -> {} (omite, aplica DEFAULT)");
  eq(JSON.stringify(rpcFecha("")), "{}", "rpcFecha('') -> {} (vacío = omite)");
  eq(JSON.stringify(rpcFecha("2026-08-17")), '{"p_fecha":"2026-08-17"}', "rpcFecha(fecha) -> {p_fecha}");
  ok(!("p_fecha" in rpcFecha(null)), "rpcFecha(null) NO contiene la clave p_fecha");
}

// loteSinOrigen (T11-VIS-ORIGIN-01): lote legacy sin origen agrícola ni FKs.
{
  ok(loteSinOrigen({}) === true, "lote sin ningún campo de origen -> true");
  ok(loteSinOrigen({ productor: "Agrícola X" }) === false, "lote con productor -> false");
  ok(loteSinOrigen({ predio_id: "p1" }) === false, "lote con predio_id -> false");
  ok(loteSinOrigen({ cuartel: "C-01" }) === false, "lote con cuartel -> false");
  ok(loteSinOrigen({ productor_vinculo_id: "v1" }) === false, "lote con productor_vinculo_id -> false");
  ok(loteSinOrigen(null) === false, "lote null -> false (no rotula)");
}

// qcListadoResumen (T11-VIS-QC-01): prioriza QC por-lote; fallback a QC de cabecera; sin QC real.
{
  const porLote = qcListadoResumen({ qc_con_qc: 3, qc_aprobados: 2, qc_rechazados: 1, qc_condicional: 0, qc_mixto: true });
  eq(porLote.kind, "lotes", "hay QC por-lote -> kind lotes");
  eq(porLote.aprobados, 2, "por-lote aprobados=2");
  eq(porLote.rechazados, 1, "por-lote rechazados=1");
  ok(porLote.mixto === true, "por-lote mixto=true");
  const headAprob = qcListadoResumen({ qc_con_qc: 0, qc_resultado: "aprobado" });
  eq(headAprob.kind, "header", "sin por-lote + header aprobado -> kind header");
  eq(headAprob.resultado, "aprobado", "header resultado=aprobado");
  const headRech = qcListadoResumen({ qc_con_qc: 0, qc_resultado: "rechazado" });
  eq(headRech.kind, "header", "sin por-lote + header rechazado -> kind header");
  eq(headRech.resultado, "rechazado", "header resultado=rechazado (NUNCA 'sin QC')");
  const ninguno = qcListadoResumen({ qc_con_qc: 0, qc_resultado: null });
  eq(ninguno.kind, "ninguno", "sin por-lote ni header -> kind ninguno");
}

// evaluarOrigenLote (NR-02): completitud del origen agrícola del lote en captura.
{
  const comp = evaluarOrigenLote({ productorId: "p", predioId: "pr", cuartelId: "c" });
  ok(comp.completo === true, "origen completo -> completo true (sin advertencia)");
  eq(comp.mensaje, "", "origen completo -> sin mensaje");
  const nada = evaluarOrigenLote({});
  ok(nada.completo === false, "origen vacío -> completo false (exige confirmación)");
  ok(nada.ninguno === true, "origen vacío -> ninguno true");
  eq(JSON.stringify(nada.faltantes), JSON.stringify(["Productor", "Predio", "Cuartel"]), "faltan las 3 dimensiones");
  ok(/no informado/i.test(nada.mensaje), "origen vacío -> mensaje 'no informado'");
  const soloProd = evaluarOrigenLote({ productorId: "p" });
  ok(soloProd.completo === false, "solo productor -> incompleto");
  eq(JSON.stringify(soloProd.faltantes), JSON.stringify(["Predio", "Cuartel"]), "solo productor -> falta Predio y Cuartel");
  ok(soloProd.ninguno === false, "solo productor -> ninguno false");
  ok(/Predio y Cuartel/.test(soloProd.mensaje), "solo productor -> mensaje nombra Predio y Cuartel");
  const prodPred = evaluarOrigenLote({ productorId: "p", predioId: "pr" });
  eq(JSON.stringify(prodPred.faltantes), JSON.stringify(["Cuartel"]), "productor+predio -> falta solo Cuartel");
}

// textoQcCabecera (NR-04): copy de alcance del QC de cabecera (fallback mono-especie).
{
  const t = textoQcCabecera("Cereza");
  ok(t.includes("Cereza"), "copy nombra la especie");
  ok(/por lote/i.test(t) && /Detalle de Recepción/i.test(t), "copy remite al QC por lote en el Detalle");
  ok(/fallback/i.test(t), "copy aclara que es fallback");
  ok(textoQcCabecera("").includes("especie principal"), "sin especie -> fallback textual");
}

// kgEntradaPorLote (NR-05): kg de entrada inicial por lote (autoridad = ledger, NO on_hand).
{
  const movs = [
    { objeto_id: "L1", ref_tipo: "recepcion", objeto_tipo: "lote", naturaleza: "entrada", cantidad: 4000 },
    { objeto_id: "L2", ref_tipo: "recepcion", objeto_tipo: "lote", naturaleza: "entrada", cantidad: "3000" },
    { objeto_id: "L1", ref_tipo: "traslado", objeto_tipo: "lote", naturaleza: "salida", cantidad: 1000 }, // no cuenta
    { objeto_id: "L3", ref_tipo: "recepcion", objeto_tipo: "recepcion", naturaleza: "entrada", cantidad: 999 }, // no es lote
  ];
  const m = kgEntradaPorLote(movs);
  eq(m.L1, 4000, "L1 kg entrada = 4000 (ignora salida de traslado)");
  eq(m.L2, 3000, "L2 kg entrada = 3000 (numérico desde string)");
  ok(!("L3" in m), "objeto_tipo!=lote no entra al mapa");
  eq(JSON.stringify(kgEntradaPorLote([])), "{}", "sin movimientos -> mapa vacío");
}

// Filtros
ok(!validarFiltros({}).ok, "sin empresa -> inválido");
ok(validarFiltros({ empresa: "e1", fecha: "2026-12-05" }).ok, "con empresa+fecha -> válido");

console.log(`\nproc_* F7.1 domain tests: ${pass} pasaron, ${fail} fallaron`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");

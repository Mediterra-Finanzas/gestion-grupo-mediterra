/* eslint-disable */
// src/proceso/core/procesoF7DB.js
// proc_* F7.1 — capa DB de la UI operacional (correlativos, QC, read-models,
// CRUD genérico de maestros). Reutiliza primitivas de procesoDB.js con gate Regla 9.
import { procSelect, procInsert, procUpdate, procRpc } from "./procesoDB.js";

// ── Correlativos (concurrency-safe en backend) ──────────────────────────────
export const siguienteCorrelativo = (a) => procRpc("proc_fn_siguiente_correlativo", {
  p_empresa: a.empresaId, p_temporada: a.temporada, p_tipo: a.tipo, p_prefijo: a.prefijo || null,
});

// ── QC (gate enforceable en backend; la UI pre-valida con evaluarQC) ────────
export const registrarQc = (a) => procRpc("proc_fn_registrar_qc", {
  p_empresa: a.empresaId, p_recepcion: a.recepcionId, p_valores: a.valores || {}, p_actor: a.actor || null,
});

// ── Read-models del Centro de Operaciones (solo lectura, RLS aplica) ────────
export const centroOperaciones = (a) => procRpc("proc_fn_centro_operaciones", {
  p_empresa: a.empresaId, p_planta: a.plantaId || null, p_temporada: a.temporada || null, p_fecha: a.fecha,
});
export const excepcionesOperacionales = (a) => procRpc("proc_fn_excepciones", {
  p_empresa: a.empresaId, p_planta: a.plantaId || null, p_temporada: a.temporada || null,
});

// ── CRUD genérico de maestros (REST; RLS + CHECK/FK en backend) ─────────────
// La UI de Configuración es data-driven: un descriptor por maestro define tabla+campos.
const qEmpresa = (e, extra = "") => `?empresa_id=eq.${e}&deleted_at=is.null${extra}`;

export const cargarMaestro = (tabla, empresaId, extra = "") =>
  procSelect(tabla, qEmpresa(empresaId, `&order=created_at.desc${extra}`));

export async function crearMaestro(tabla, fila) {
  const res = await procInsert(tabla, [fila]);
  return Array.isArray(res) ? res[0] : res;
}
export const actualizarMaestro = (tabla, id, empresaId, patch) =>
  procUpdate(tabla, `?id=eq.${id}&empresa_id=eq.${empresaId}`, patch);

// Soft-delete coherente con el patrón proc_* (nunca borrado físico).
export const desactivarMaestro = (tabla, id, empresaId, actor) =>
  procUpdate(tabla, `?id=eq.${id}&empresa_id=eq.${empresaId}`, { deleted_at: new Date().toISOString(), updated_by: actor || null });

// ── F7.2 · Recepción + QC + Lotes ───────────────────────────────────────────
// Listados paginables/filtrables server-side (PostgREST sobre vistas RLS).
export const cargarRecepcionListado = (e, extra = "") =>
  procSelect("proc_v_recepcion_listado", `?empresa_id=eq.${e}&order=fecha.desc${extra}`);
export const cargarLoteListado = (e, extra = "") =>
  procSelect("proc_v_lote_listado", `?empresa_id=eq.${e}&order=codigo.desc${extra}`);

// Elegibilidad de lote para proceso (mirror del gate; para mensajería UI).
export const loteElegible = (e, loteId) => procRpc("proc_fn_lote_elegible", { p_empresa: e, p_lote: loteId });

// Cabecera de recepción (REST; el lote/ledger va por RPC atómica).
export const crearRecepcion = (fila) => crearMaestro("proc_recepcion", fila);
export const actualizarRecepcion = (id, e, patch) => actualizarMaestro("proc_recepcion", id, e, patch);

// Loaders acotados
export const cargarVinculosPorRol = (e, rol) =>
  procSelect("proc_vinculo", `?empresa_id=eq.${e}&rol_operacional=eq.${rol}&deleted_at=is.null&order=nombre_provisional`);
export const cargarUbicacionesActivas = (e, plantaId) =>
  procSelect("proc_ubicaciones", `?empresa_id=eq.${e}&activa=eq.true&deleted_at=is.null${plantaId ? `&planta_id=eq.${plantaId}` : ""}&order=codigo`);
export const cargarQcParamsEspecie = (e, especie) =>
  procSelect("proc_qc_parametro", `?empresa_id=eq.${e}&especie_codigo=eq.${especie}&activo=eq.true&deleted_at=is.null&order=orden`);
export const cargarLotesDeRecepcion = (e, recId) =>
  procSelect("proc_lote", `?empresa_id=eq.${e}&recepcion_id=eq.${recId}&deleted_at=is.null&order=codigo`);
export const cargarQcDeRecepcion = (e, recId) =>
  procSelect("proc_qc_recepcion", `?empresa_id=eq.${e}&recepcion_id=eq.${recId}&deleted_at=is.null`);
export const cargarMovimientosObjeto = (e, objetoId) =>
  procSelect("proc_movimiento", `?empresa_id=eq.${e}&objeto_id=eq.${objetoId}&order=created_at.desc`);
export const cargarRecepcionPorId = (e, id) =>
  procSelect("proc_recepcion", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarLotePorId = (e, id) =>
  procSelect("proc_v_lote_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarMovimientosRef = (e, refId) =>
  procSelect("proc_movimiento", `?empresa_id=eq.${e}&ref_id=eq.${refId}&order=created_at.desc`);

// ── F7.3 · Programa + Orden + Ejecución + Resultado + Conciliación ───────────
export const cargarProgramas = (e, extra = "") =>
  procSelect("proc_programa_proceso", `?empresa_id=eq.${e}&order=fecha.desc,prioridad.desc${extra}`);
export const crearPrograma = (fila) => crearMaestro("proc_programa_proceso", fila);
export const actualizarPrograma = (id, e, patch) => actualizarMaestro("proc_programa_proceso", id, e, patch);

export const cargarOrdenListado = (e, extra = "") =>
  procSelect("proc_v_orden_listado", `?empresa_id=eq.${e}&order=fecha.desc${extra}`);
export const cargarOrdenPorId = (e, id) =>
  procSelect("proc_v_orden_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const crearOrden = (fila) => crearMaestro("proc_orden_proceso", fila);
export const cambiarEstadoOrden = (e, id, estado) =>
  procUpdate("proc_orden_proceso", `?id=eq.${id}&empresa_id=eq.${e}`, { estado });

// Lotes con elegibilidad QC computada (para selección de consumo).
export const cargarLotesOperacionales = (e, extra = "") =>
  procSelect("proc_v_lote_operacional", `?empresa_id=eq.${e}&order=codigo${extra}`);

// Insumos de una orden (genealogía; append-only en backend).
export const cargarInsumosOrden = (e, ordenId) =>
  procSelect("proc_orden_insumo", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}&order=created_at`);

// Resultado / descarte / merma (REST; guard de orden terminal en backend).
export const crearResultado = (fila) => crearMaestro("proc_resultado", fila);
export const crearDescarte = (fila) => crearMaestro("proc_resultado_descarte", fila);
export const crearMerma = (fila) => crearMaestro("proc_resultado_merma", fila);
export const cargarResultadosOrden = (e, ordenId) =>
  procSelect("proc_resultado", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}&deleted_at=is.null&order=created_at`);
export const cargarDescartesOrden = (e, ordenId) =>
  procSelect("proc_resultado_descarte", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}&deleted_at=is.null&order=created_at`);
export const cargarMermasOrden = (e, ordenId) =>
  procSelect("proc_resultado_merma", `?empresa_id=eq.${e}&orden_id=eq.${ordenId}&deleted_at=is.null&order=created_at`);

// Catálogos para captura de resultado
export const cargarCategorias = (e) => procSelect("proc_categorias_calidad", `?empresa_id=eq.${e}&deleted_at=is.null&order=orden`);
export const cargarCalibresEspecie = (e, esp) => procSelect("proc_calibre", `?empresa_id=eq.${e}&especie_codigo=eq.${esp}&deleted_at=is.null&order=orden`);
export const cargarColoresEspecie = (e, esp) => procSelect("proc_color", `?empresa_id=eq.${e}&especie_codigo=eq.${esp}&deleted_at=is.null`);
export const cargarMotivosDescarte = (e) => procSelect("proc_motivos_descarte", `?empresa_id=eq.${e}&deleted_at=is.null&order=codigo`);
export const cargarMotivosMerma = (e) => procSelect("proc_motivos_merma", `?empresa_id=eq.${e}&deleted_at=is.null&order=codigo`);
export const cargarLineas = (e, plantaId) =>
  procSelect("proc_lineas_proceso", `?empresa_id=eq.${e}&activa=eq.true&deleted_at=is.null${plantaId ? `&planta_id=eq.${plantaId}` : ""}&order=codigo`);

// Consumo y conciliación reutilizan las RPC de F2 (re-export para la UI F7.3).
export { consumirLoteEnOrden, conciliarOrden } from "./procesoF2DB.js";

// ── F7.4 · PT + Pallets + Bodega + Repaletizaje ─────────────────────────────
// Read-models (vistas RLS security_invoker)
export const cargarResultadoMaterializable = (e, extra = "") =>
  procSelect("proc_v_resultado_materializable", `?empresa_id=eq.${e}&kg_disponible=gt.0${extra}`);
export const cargarPTOperacional = (e, extra = "") =>
  procSelect("proc_v_pt_operacional", `?empresa_id=eq.${e}&order=created_at.desc&limit=300${extra}`);
export const cargarBodega = (e, extra = "") =>
  procSelect("proc_v_pallet_bodega", `?empresa_id=eq.${e}&order=codigo&limit=400${extra}`);
export const cargarPalletBodegaPorId = (e, id) =>
  procSelect("proc_v_pallet_bodega", `?empresa_id=eq.${e}&pallet_id=eq.${id}`);
export const cargarLineasPallet = (e, palletId) =>
  procSelect("proc_pallet_linea", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}&order=created_at`);
export const cargarHoldsPallet = (e, palletId) =>
  procSelect("proc_hold", `?empresa_id=eq.${e}&objeto_tipo=eq.pallet&objeto_id=eq.${palletId}&order=created_at.desc`);

// Transacciones F3/F4 (RPC atómicas) + F7.4 holds/genealogía
export const materializarPT = (a) => procRpc("proc_fn_materializar_pt", {
  p_empresa_id: a.empresaId, p_resultado_id: a.resultadoId, p_formato_id: a.formatoId, p_cajas: a.cajas, p_kg: a.kg, p_actor: a.actor || null });
export const crearPallet = (a) => procRpc("proc_fn_crear_pallet", {
  p_empresa_id: a.empresaId, p_codigo: a.codigo, p_temporada: a.temporada || null, p_planta_id: a.plantaId || null,
  p_formato_id: a.formatoId || null, p_ubicacion_id: a.ubicacionId || null, p_actor: a.actor || null });
export const palletizar = (a) => procRpc("proc_fn_palletizar", {
  p_empresa_id: a.empresaId, p_pt_id: a.ptId, p_pallet_id: a.palletId, p_cajas: a.cajas, p_kg: a.kg, p_actor: a.actor || null });
export const trasladarPallet = (a) => procRpc("proc_fn_trasladar_pallet", {
  p_empresa_id: a.empresaId, p_pallet_id: a.palletId, p_ubic_destino: a.ubicDestino, p_actor: a.actor || null });
export const repaletizar = (a) => procRpc("proc_fn_repaletizar", {
  p_empresa_id: a.empresaId, p_motivo: a.motivo || null, p_tipo: a.tipo || "repaletizaje", p_moves: a.moves, p_actor: a.actor || null });
export const holdPallet = (a) => procRpc("proc_fn_hold_pallet", {
  p_empresa: a.empresaId, p_pallet: a.palletId, p_tipo: a.tipo, p_cantidad: a.cantidad, p_motivo: a.motivo || null, p_actor: a.actor || null });
export const liberarHold = (a) => procRpc("proc_fn_liberar_hold", { p_empresa: a.empresaId, p_hold: a.holdId, p_actor: a.actor || null });
export const palletGenealogia = (e, palletId) => procRpc("proc_fn_pallet_genealogia", { p_empresa: e, p_pallet: palletId });

// Formatos (catálogo)
export const cargarFormatos = (e, especie) =>
  procSelect("proc_formato", `?empresa_id=eq.${e}&activo=eq.true&deleted_at=is.null${especie ? `&especie_codigo=eq.${especie}` : ""}&order=codigo`);

// ── F7.5 · Despacho (salida física; NO venta/exportación) ───────────────────
export const cargarDespachoListado = (e, extra = "") =>
  procSelect("proc_v_despacho_listado", `?empresa_id=eq.${e}&order=created_at.desc&limit=300${extra}`);
export const cargarDespachoPorId = (e, id) =>
  procSelect("proc_v_despacho_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarDespachoRaw = (e, id) =>
  procSelect("proc_despacho", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarDespachoLineas = (e, despachoId) =>
  procSelect("proc_v_despacho_linea", `?empresa_id=eq.${e}&despacho_id=eq.${despachoId}&order=created_at`);
export const actualizarDespacho = (id, e, patch) =>
  procUpdate("proc_despacho", `?id=eq.${id}&empresa_id=eq.${e}`, patch);
export const cambiarEstadoDespacho = (e, id, estado) =>
  procUpdate("proc_despacho", `?id=eq.${id}&empresa_id=eq.${e}`, { estado });
export const cancelarDespacho = (a) => procRpc("proc_fn_cancelar_despacho", { p_empresa: a.empresaId, p_despacho: a.despachoId, p_actor: a.actor || null });
export const cargarPalletHoldsFolio = (e, palletId) =>
  procSelect("proc_v_pallet_hold", `?empresa_id=eq.${e}&pallet_id=eq.${palletId}&order=created_at.desc`);
export const crearDocDespacho = (fila) => crearMaestro("proc_despacho_doc", fila);
// Re-export de las RPC transaccionales de despacho (F4) para la UI F7.5.
export { crearDespacho, reservarPallet, liberarReserva, confirmarDespacho, reversarDespacho, cargarDocsDespacho } from "./procesoF4DB.js";

// ── F7.6 · Resultado de Proceso (informe/versión/PDF/envíos) ────────────────
export const cargarInformeListado = (e, extra = "") =>
  procSelect("proc_v_informe_listado", `?empresa_id=eq.${e}&order=created_at.desc&limit=300${extra}`);
export const cargarInformePorId = (e, id) =>
  procSelect("proc_v_informe_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarInformeRaw = (e, id) =>
  procSelect("proc_informe", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarOrdenesInformables = (e, extra = "") =>
  procSelect("proc_v_orden_informable", `?empresa_id=eq.${e}&order=fecha.desc&limit=400${extra}`);
export const cargarVersion = (e, versionId) =>
  procSelect("proc_informe_version", `?empresa_id=eq.${e}&id=eq.${versionId}`);
export const cargarVinculo = (e, vinculoId) =>
  procSelect("proc_vinculo", `?empresa_id=eq.${e}&id=eq.${vinculoId}`);
// Re-export de las RPC/loaders de informes (F5) para la UI F7.6.
export {
  cargarInformes, cargarVersiones, cargarFuentes, cargarDestinatarios, cargarEnvios,
  crearInforme, generarVersion, agregarDestinatario, emitirVersion, registrarEnvio,
} from "./procesoF5DB.js";

// ── F7.7 · Tarifario + Servicios Facturables + Base de Cobro (motor F6) ─────
// Read-models security_invoker (RLS por empresa); refs humanas, sin UUID visible.
export const cargarTipoServicio = (e) =>
  procSelect("proc_tipo_servicio", `?empresa_id=eq.${e}&deleted_at=is.null&order=codigo`);

export const cargarTarifas = (e, extra = "") =>
  procSelect("proc_v_tarifa_listado", `?empresa_id=eq.${e}&order=especificidad.desc,vigencia_desde.desc${extra}`);
export const crearTarifa = (fila) => crearMaestro("proc_tarifa", fila);
export const cambiarEstadoTarifa = (id, e, estado, actor) =>
  procUpdate("proc_tarifa", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null });
// Preview de resolución (envuelve proc_fn_resolver_tarifa; NO reimplementa la regla).
export const resolverTarifaDetalle = (a) => procRpc("proc_fn_resolver_tarifa_detalle", {
  p_empresa_id: a.empresaId, p_cliente: a.clienteId || null, p_temporada: a.temporada || null,
  p_especie: a.especie || null, p_tipo_servicio: a.tipoServicioId, p_fecha: a.fecha });

export const cargarServiciosFacturables = (e, extra = "") =>
  procSelect("proc_v_servicio_facturable", `?empresa_id=eq.${e}&order=fecha_hecho.desc&limit=400${extra}`);
export const cargarServicioFacturablePorId = (e, id) =>
  procSelect("proc_v_servicio_facturable", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarOrdenesFacturables = (e, extra = "") =>
  procSelect("proc_v_orden_facturable", `?empresa_id=eq.${e}&order=fecha.desc&limit=300${extra}`);
export const generarServicioProceso = (a) => procRpc("proc_fn_generar_servicio_proceso", {
  p_empresa_id: a.empresaId, p_orden_id: a.ordenId, p_cliente: a.clienteId, p_tipo_servicio: a.tipoServicioId, p_actor: a.actor || null });
export const generarServicioManual = (a) => procRpc("proc_fn_generar_servicio_manual", {
  p_empresa_id: a.empresaId, p_cliente: a.clienteId, p_tipo_servicio: a.tipoServicioId, p_cantidad: a.cantidad,
  p_unidad: a.unidad, p_tarifa: a.tarifa, p_moneda: a.moneda || "USD", p_fecha: a.fecha,
  p_motivo: a.motivo, p_autorizado_por: a.autorizadoPor, p_actor: a.actor || null });
export const revalorizarServicioPendiente = (a) => procRpc("proc_fn_revalorizar_servicio_pendiente", {
  p_empresa_id: a.empresaId, p_servicio_id: a.servicioId, p_actor: a.actor || null });

export const cargarBasesCobro = (e, extra = "") =>
  procSelect("proc_v_base_cobro_listado", `?empresa_id=eq.${e}&order=created_at.desc&limit=300${extra}`);
export const cargarBaseCobroPorId = (e, id) =>
  procSelect("proc_v_base_cobro_listado", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarBaseCobroLineas = (e, baseId) =>
  procSelect("proc_v_base_cobro_linea", `?empresa_id=eq.${e}&base_cobro_id=eq.${baseId}&order=fecha_hecho`);
export const crearBaseCobro = (a) => procRpc("proc_fn_crear_base_cobro", {
  p_empresa_id: a.empresaId, p_folio: a.folio, p_cliente: a.clienteId || null, p_temporada: a.temporada || null,
  p_desde: a.desde || null, p_hasta: a.hasta || null, p_moneda: a.moneda || "USD", p_actor: a.actor || null });
export const agregarABase = (a) => procRpc("proc_fn_agregar_a_base", {
  p_empresa_id: a.empresaId, p_base_id: a.baseId, p_servicio_id: a.servicioId, p_actor: a.actor || null });
export const aprobarBase = (a) => procRpc("proc_fn_aprobar_base", {
  p_empresa_id: a.empresaId, p_base_id: a.baseId, p_actor: a.actor || null });
export const cambiarEstadoBase = (id, e, estado, actor) =>
  procUpdate("proc_base_cobro", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null });

// ── T10 · Trazabilidad agrícola + Ficha/Contrato (consume backend T1–T9) ────
// Catálogos y maestros (loaders filtrados para las cascadas de origen)
export const cargarEspecies = (e) =>
  procSelect("proc_especie", `?empresa_id=eq.${e}&deleted_at=is.null&order=nombre`);
export const cargarVariedades = (e, especie) =>
  procSelect("proc_variedad", `?empresa_id=eq.${e}&deleted_at=is.null${especie ? `&especie_codigo=eq.${especie}` : ""}&order=nombre`);
export const cargarPredios = (e, productorId) =>
  procSelect("proc_predios", `?empresa_id=eq.${e}&deleted_at=is.null${productorId ? `&productor_vinculo_id=eq.${productorId}` : ""}&order=nombre`);
export const cargarCuarteles = (e, predioId) =>
  procSelect("proc_cuartel", `?empresa_id=eq.${e}&deleted_at=is.null${predioId ? `&predio_id=eq.${predioId}` : ""}&order=codigo`);
// Productores relacionados a un cliente (proc_cliente_productor) — devuelve la relación;
// la UI resuelve el nombre desde la lista de productores ya cargada.
export const cargarClienteProductores = (e, clienteId) =>
  procSelect("proc_cliente_productor", `?empresa_id=eq.${e}&deleted_at=is.null${clienteId ? `&cliente_vinculo_id=eq.${clienteId}` : ""}`);

// Read-models de origen / contractual
export const cargarLoteOrigen = (e, extra = "") =>
  procSelect("proc_v_lote_origen", `?empresa_id=eq.${e}&order=codigo.desc&limit=400${extra}`);
export const cargarLoteOrigenPorId = (e, id) =>
  procSelect("proc_v_lote_origen", `?empresa_id=eq.${e}&id=eq.${id}`);
export const cargarClienteContractual = (e, extra = "") =>
  procSelect("proc_v_cliente_contractual", `?empresa_id=eq.${e}${extra}`);

// Gates contractuales (backend autoridad)
export const estadoContractualCliente = (a) => procRpc("proc_fn_estado_contractual_cliente", {
  p_empresa: a.empresaId, p_cliente: a.clienteId, p_fecha: a.fecha || null });
export const clienteHabilitadoParaOperar = (a) => procRpc("proc_fn_cliente_habilitado_para_operar", {
  p_empresa: a.empresaId, p_cliente: a.clienteId, p_fecha: a.fecha || null, p_etapa: a.etapa || "proceso" });

// Genealogía extendida (T9): pallet → origen agrícola (desde snapshot) + cliente paralelo
export const palletGenealogiaOrigen = (e, palletId) => procRpc("proc_fn_pallet_genealogia", { p_empresa: e, p_pallet: palletId });

// Ficha Cliente Service (1:1)
export const cargarFichaCliente = (e, clienteId) =>
  procSelect("proc_cliente_ficha", `?empresa_id=eq.${e}&cliente_vinculo_id=eq.${clienteId}&deleted_at=is.null`);
export const crearFichaCliente = (fila) => crearMaestro("proc_cliente_ficha", fila);
export const actualizarFichaCliente = (id, e, patch) => actualizarMaestro("proc_cliente_ficha", id, e, patch);

// Contrato del cliente (versionado)
export const cargarContratosCliente = (e, clienteId) =>
  procSelect("proc_cliente_contrato", `?empresa_id=eq.${e}&cliente_vinculo_id=eq.${clienteId}&deleted_at=is.null&order=version.desc`);
export const crearContrato = (fila) => crearMaestro("proc_cliente_contrato", fila);
export const actualizarContrato = (id, e, patch) => actualizarMaestro("proc_cliente_contrato", id, e, patch);
export const cambiarEstadoContrato = (id, e, estado, actor) =>
  procUpdate("proc_cliente_contrato", `?id=eq.${id}&empresa_id=eq.${e}`, { estado, updated_by: actor || null });
export const cargarTiposDocContractual = (e) =>
  procSelect("proc_tipo_documento_contractual", `?empresa_id=eq.${e}&deleted_at=is.null&activo=eq.true&order=nombre`);

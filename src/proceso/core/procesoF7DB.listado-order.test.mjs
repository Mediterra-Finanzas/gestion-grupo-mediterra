/* eslint-disable */
// Test estático: los wrappers de listado NO deben ordenar por columnas inexistentes
// en su read-model. Cazaría el defecto T11-VIS-P1-01/02 (order=created_at en vistas
// proc_v_informe_listado / proc_v_despacho_listado que no exponen created_at → HTTP 400).
// Manifiesto de columnas tomado de las vistas reales (schema CURRENT).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "procesoF7DB.js"), "utf8");

// Columnas reales por vista _listado (evidencia PostgREST / schema CURRENT).
const COLS = {
  proc_v_recepcion_listado: "id,empresa_id,folio,fecha,planta_id,temporada_id,especie_codigo,variedad_codigo,kg_bruto,tara,kg_neto,estado,guia_despacho,patente,cliente,productor,dueno_fruta,exportadora,qc_resultado,lotes,cliente_servicio_vinculo_id,qc_aprobados,qc_rechazados,qc_condicional,qc_con_qc,qc_mixto,masa_dentro_tolerancia,nivel_contractual",
  proc_v_lote_listado: "id,empresa_id,codigo,recepcion_id,recepcion_folio,planta_id,temporada_id,especie_codigo,variedad_codigo,estado,ubicacion,cliente,productor,dueno_fruta,qc_resultado,on_hand,reservado,bloqueado,disponible,cliente_vinculo_id,productor_vinculo_id,predio,predio_id,cuartel,cuartel_id,origen_reconstruido",
  proc_v_orden_listado: "id,empresa_id,folio,fecha,planta_id,linea_id,turno,estado,especie_codigo,variedad_codigo,hora_inicio,hora_fin,cliente,linea,kg_entrada,kg_resultado,kg_descarte,kg_merma,diff,tolerancia,n_insumos",
  proc_v_despacho_listado: "id,empresa_id,folio,temporada_codigo,planta_origen_id,estado,fecha_prevista,fecha_efectiva,vehiculo_patente,conductor,cliente,destinatario,transportista,pallets,cajas,kg,docs",
  proc_v_informe_listado: "id,empresa_id,folio,temporada_codigo,planta_id,estado,version_actual,destinatario_principal_vinculo_id,destinatario,versiones,emitido_at,estado_version,packout,kg_procesados",
  proc_v_tarifa_listado: "id,empresa_id,tipo_servicio_id,servicio_codigo,servicio_nombre,cliente_vinculo_id,cliente,temporada_codigo,especie_codigo,unidad,tarifa,moneda,vigencia_desde,vigencia_hasta,prioridad,estado,version,observaciones,created_at,updated_at,es_general,especificidad,vigencia_estado",
  proc_v_base_cobro_listado: "id,empresa_id,folio,cliente_vinculo_id,cliente,temporada_codigo,periodo_desde,periodo_hasta,moneda,estado,total,observaciones,created_at,updated_at,lineas",
  // Vistas operacionales (no _listado) que también se ordenan por columna — cazan T11-VIS-PT-01.
  proc_v_pt_operacional: "pt_id,empresa_id,orden_id,orden_folio,resultado_id,especie_codigo,variedad_codigo,categoria_id,calibre_id,color_id,formato_id,formato,cajas,kg,estado,planta_id,temporada_codigo,categoria,calibre,color,on_hand",
  proc_v_despacho_linea: "id,empresa_id,despacho_id,pallet_id,pallet_codigo,pt_id,cajas,kg,ubicacion_origen_id,ubicacion_origen,estado,movimiento_id,created_at",
  proc_v_pallet_hold: "id,empresa_id,pallet_id,tipo,cantidad,estado,ref_tipo,ref_id,motivo,created_at,liberado_at,despacho_folio",
};
const setOf = (s) => new Set(s.split(","));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };

// Extrae pares (vista, columna_orden) de cada procSelect("proc_v_*", `...order=col...`).
// Solo se validan las vistas presentes en COLS (listados + operacionales con order=).
const re = /procSelect\(\s*"(proc_v_[a-z_]+)"\s*,\s*`([^`]*)`/g;
let m, encontrados = 0;
while ((m = re.exec(src)) !== null) {
  const vista = m[1];
  const query = m[2];
  const om = /order=([a-zA-Z_]+)/.exec(query);   // primera columna de orden (antes de .desc/.asc/.nullslast)
  if (!om) continue;                             // sin order= (ej. ?id=eq) → no aplica
  const col = om[1];
  const cols = COLS[vista];
  if (!cols) continue;   // solo validamos vistas con manifiesto (listados + operacionales cubiertos)
  encontrados++;
  ok(setOf(cols).has(col), `${vista} ordena por columna inexistente: "${col}"`);
}

ok(encontrados >= 9, `debía encontrar >=9 vistas con order= manifestadas (encontró ${encontrados})`);
// Guard explícito del bug corregido: ni informe ni despacho listado deben volver a usar created_at
ok(!/proc_v_informe_listado"[^`]*`[^`]*order=created_at/.test(src), "regresión T11-VIS-P1-01: informe_listado NO debe ordenar por created_at");
ok(!/proc_v_despacho_listado"[^`]*`[^`]*order=created_at/.test(src), "regresión T11-VIS-P1-02: despacho_listado NO debe ordenar por created_at");
ok(!/proc_v_pt_operacional"[^`]*`[^`]*order=created_at/.test(src), "regresión T11-VIS-PT-01: pt_operacional NO debe ordenar por created_at");

console.log(`\nlistado-order tests: ${pass} pasaron, ${fail} fallaron (${encontrados} listados con order= verificados)`);
if (fail > 0) process.exit(1);
console.log("TODOS LOS TESTS PASARON ✓");

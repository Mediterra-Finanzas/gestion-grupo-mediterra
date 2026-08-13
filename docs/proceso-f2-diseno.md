# proc_* — F2: Diseño (ejecución de proceso) — para revisión

**Capability:** Servicio de Proceso de Fruta Fresca (`proc_*`) · tenant piloto Allegria Service
**Worktree:** `worktree-proc-fase1` (sucesor definido: se continúa aquí) · **Base:** F1 VALIDATED (`254766a`)
**Fecha:** 2026-08-13 · **Estado:** Diseño F2 **para revisión** — NO se escribe SQL F2 hasta ratificar este diseño (misma disciplina diseño→gate de F1).

> **Regla heredada:** F2 **extiende** el ledger F1 (`proc_movimiento` = SoT del saldo físico), no lo reemplaza. Descarte/merma nacen del **resultado del proceso**, no descuentan el lote de MP (sin doble descuento). Identidad = Core vía `proc_vinculo`. Bounded context aislado; no toca `exp_*`/Frisku/Osiris/Foods.

## 1. Alcance F2 (ejecución de proceso)

De recepción/lote (F1) a **resultado de proceso conciliado**. F2 cierra en la corrida conciliada; producto terminado/pallets/repaletizaje son **F3**; despacho **F4**; tarifario/facturable **F5+**.

Incluye:
1. **Maestros F2** (materializar del backlog, [`proceso-f2-backlog-maestros.md`](proceso-f2-backlog-maestros.md)): `proc_ubicaciones`, `proc_condiciones`, `proc_lineas_proceso`, `proc_categorias_calidad`, `proc_motivos_descarte`, `proc_motivos_merma`.
2. **QC de recepción** configurable (no hardcodear atributos de cereza).
3. **Inventario pre-proceso** por ubicación (derivado del ledger + traslados a cámara).
4. **Programa de proceso** (planificación) y **Orden de proceso** (ejecución/corrida).
5. **Consumo de lote** con **genealogía** (N:M orden↔lote, kg/%), vía el ledger F1.
6. **Resultado de proceso** + **conciliación de masa** (entrada = producto + descarte + merma ± tolerancia).

## 2. Entidades F2 (extienden F1)

| Tabla | Propósito | Claves / FK | SoT |
|---|---|---|---|
| `proc_qc_parametro` | Catálogo de parámetros medibles por especie (firmeza, °Brix, defecto, pudrición, calibre muestra, color…), configurable | `empresa_id`, `especie_codigo`, `codigo`, `tipo_dato` (num/text/bool), `unidad` | proc |
| `proc_qc_recepcion` | QC de una recepción: valores medidos + resultado | FK `recepcion_id`; `valores jsonb` (param→valor); `resultado ∈ {aprobado,rechazado,condicional}` | proc (hecho QC) |
| `proc_programa_proceso` | Planificación de corridas | `empresa_id`, `fecha`, `turno`, FK `linea_id`, especie/variedad, `kg_estimado`, `prioridad`, `estado ∈ {borrador,publicado,cerrado}` | proc (plan) |
| `proc_orden_proceso` | Corrida (ejecución) | `folio`, FK `planta_id`,`linea_id`, `turno`, especie/variedad, `hora_inicio/fin`, `estado ∈ {borrador,en_proceso,pendiente_conciliacion,conciliado,cerrado,anulado}` | proc (hecho) |
| `proc_orden_insumo` | **Genealogía**: consumo N:M orden↔lote (kg/%) | FK `orden_id`,`lote_id`; `kg`,`pct`; `movimiento_id` (ref al ledger) | proc (puente trazabilidad) |
| `proc_resultado` | Salida comercial de la corrida por SKU | FK `orden_id`; `categoria_id`,`calibre_id`,`color_id`, formato, `cajas`, `kg` | proc (hecho resultado) |
| `proc_resultado_descarte` | Descarte por motivo | FK `orden_id`, `motivo_descarte_id`; `kg` | proc |
| `proc_resultado_merma` | Merma por motivo | FK `orden_id`, `motivo_merma_id`; `kg` | proc |

**Ledger F2 (extensión, no reemplazo):** nuevos tipos en `proc_tipo_movimiento`: `traslado` (entrada/salida entre ubicaciones), `ingreso_camara`. El **consumo** sigue usando `proc_fn_registrar_consumo` (F1): cada `proc_orden_insumo` referencia el `movimiento` de salida que lo respalda. El producto NO se convierte aún en inventario PT (eso es F3); `proc_resultado` registra kg/cajas para conciliación y reportería.

## 3. Genealogía y conciliación (invariantes)

- **Genealogía hacia atrás:** `proc_resultado`/orden → `proc_orden_insumo` (kg/% por lote) → `proc_lote` → `proc_recepcion` → productor/predio (vía `proc_vinculo`/`proc_predios`).
- **Conciliación de masa** (al cerrar la orden): `kg_entrada = Σ proc_orden_insumo.kg`; `kg_salidas = Σ resultado.kg + Σ descarte.kg + Σ merma.kg`; `|kg_entrada − kg_salidas| ≤ kg_entrada × tolerancia_masa_pct/100` (de `proc_empresa_config`). Fuera de tolerancia ⇒ **no** transita a `conciliado` (bloqueo + alerta). RPC `proc_fn_conciliar_orden` valida atómicamente.
- **Sin doble descuento:** el consumo descuenta el lote (ledger salida) **una vez**; descarte/merma son salidas del **resultado de la orden**, no del lote de MP.

## 4. Decisiones abiertas (gate F2, requieren tu criterio)

| # | Decisión | Recomendación |
|---|---|---|
| DF2-1 | QC configurable por especie (no hardcode cereza) | `proc_qc_parametro` (catálogo por especie) + `proc_qc_recepcion.valores jsonb`. **Confirmar** |
| DF2-2 | Frontera F2/F3: ¿el resultado crea PT/pallets ahora? | **No** en F2. F2 = orden→consumo→resultado+conciliación; PT/pallets/repaletizaje = F3 (con ledger `produccion`). **Confirmar frontera** |
| DF2-3 | Conciliación obligatoria para cerrar orden | Sí: `conciliado` exige cuadratura ≤ tolerancia; RPC transaccional. **Confirmar** |
| DF2-4 | Programa de proceso: ¿en F2 o diferible? | Incluir mínimo (planificación) para habilitar orden; ampliable después. **Confirmar** |
| DF2-5 | Inventario pre-proceso: traslados a cámara como movimientos de ledger | Sí (`traslado`/`ingreso_camara`), ubicación por `proc_ubicaciones`. **Confirmar** |

## 5. Seguridad / tenancy / tests (heredados de F1)

Toda tabla F2: `empresa_id` + RLS `FORCE` deny-by-default + `REVOKE anon` + DEV-ONLY separado; `created_by/updated_by/timestamps/deleted_at`; auditoría (`proc_fn_audit`); constraints (kg>0, cuadratura). Tests F2: conciliación (cuadra/descuadra), consumo actualiza genealogía + saldo, orden no cierra fuera de tolerancia, tenant aísla, RPC atómico. Validación runtime en Postgres efímero (patrón F1).

## 6. Gate F2 (diseño → SQL)

No se escribe SQL F2 hasta ratificar §4 (DF2-1..5) y el alcance §1-§2. Al aprobar: materializar maestros del backlog + entidades F2 + RPC de consumo-con-genealogía y de conciliación + tests + validación runtime + Acta F2. **STOP-AND-REPORT** solo si surge cambio de bounded context / ownership / SoT / identidad / inventario / seguridad / tenancy.

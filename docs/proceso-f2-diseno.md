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

## 7. Ratificación del gate F2 (CFO, 2026-08-13) — precisiones incorporadas

**Gate F2 APROBADO.** F2 es **incremental sobre F1 VALIDATED** (no reescribe F1, no crea schema independiente). Precisiones ratificadas:

- **DF2-1 (QC configurable):** `proc_qc_parametro` con `especie, codigo, nombre, tipo_dato, unidad, rango_min/max, obligatorio, orden, vigencia/activo` (+ scope opcional cliente/temporada preparado, sin rediseño). Valores en `jsonb` pero con validación de tipo/dominio (no depósito sin estructura).
- **DF2-2 (frontera F2/F3):** F2 termina en orden + consumo + resultado físico + descarte/merma + conciliación. **F2 NO crea PT/cajas/pallets** (dueño F3). Interfaz clara resultado→PT.
- **DF2-3 (conciliación obligatoria):** `|kg_entrada − (kg_resultado + kg_descarte + kg_merma)| ≤ tolerancia` (configurable, `proc_empresa_config`). Sin bypass silencioso; enforcement en trigger de transición (no solo RPC). Cierre excepcional (permiso+motivo+actor+ts+diff+evidencia+auditoría) **no** se habilita en F2.
- **DF2-4 (programa mínimo):** planifica (fecha/turno/planta/línea/cliente/especie/variedad/lotes previstos/kg est./prioridad/instrucciones/estado). La orden ejecuta. No mezclar; sin APS.
- **DF2-5 (inventario por ledger + ubicaciones):** el traslado interno es **`naturaleza='transferencia'`** — no cambia el stock físico total, solo la distribución por ubicación. El ledger distingue: entrada/salida física · transferencia · reserva/bloqueo/liberación (holds) · consumo. Consultas: stock total / por ubicación / reservado / bloqueado / libre, **sin doble conteo**.

**Reglas adicionales ratificadas:** genealogía N:M orden↔lote nunca se pierde (`proc_orden_insumo`); consumo genera movimiento **y** lineage atómicamente (nunca uno sin el otro); descarte (salida física identificable) y merma (diferencia no convertida) **separados**; workflow de orden `borrador→en_proceso→pendiente_conciliacion→conciliado→cerrado` (+ anulación), sin edición libre de orden cerrada; concurrencia resuelta en transacción (lock/serialización), no solo frontend.

---

## ACTA DE ENTREGA — proc_* FASE 2 (VALIDATED)

**Proyecto:** Allegria Service · **Bounded context:** `proc_*` · **Worktree:** `worktree-proc-fase1` · **Base:** F1 VALIDATED.
**Estado: ✅ VALIDATED (runtime aislado, 2026-08-13).** Incremental sobre F1 (no reescribe F1, no crea schema independiente).

**Alcance ejecutado:** QC recepción configurable · maestros de proceso · inventario pre-proceso por ubicación (traslado = transferencia, no altera total) · programa · orden de proceso · consumo con genealogía (movimiento+lineage atómico) · resultado + descarte/merma separados · conciliación de masa obligatoria para cerrar · máquina de estados.

**Archivos creados/modificados (solo rutas Service):**
- `supabase/schema_proc_v2_f2.sql` — **nuevo** (incremental): 14 tablas F2 + ALTER del ledger (`transferencia` + columnas de ubicación) + 3 vistas (`proc_v_lote_saldos` reemplazada para excluir transferencia, `proc_v_lote_ubicacion`, `proc_v_orden_conciliacion`) + 4 RPC (`ingresar_lote_ubicado`, `trasladar`, `consumir_lote_en_orden`, `conciliar_orden`) + trigger de transición de orden + triggers touch/audit + RLS `FORCE`/`REVOKE anon`.
- `supabase/schema_proc_v2_f2_DEV_ONLY_rls.sql` — **nuevo** (DEV-ONLY, tablas F2).
- `supabase/validation/proc_v2_f2_tests.sql` — **nuevo** (end-to-end + 6 negativos).
- `src/proceso/core/procesoF2Domain.js` + `.test.mjs` — **nuevo** (lógica pura + 28 asserts).
- `src/proceso/core/procesoF2DB.js` — **nuevo** (capa DB F2, RPC + loaders, gate Regla 9).
- `docs/proceso-f2-diseno.md` — **modificado** (ratificación §7 + esta Acta).

**Validación runtime (Postgres 16 efímero, Docker, sin tocar producción; teardown completo):**
- F1 + F2 aplican limpios (`ON_ERROR_STOP=1`); F1 tests **regresión OK**.
- F2 end-to-end: ingreso ubicado → traslado (total 10000 intacto; A=8000/B=2000, sin doble conteo) → orden → consumo 9800 (genealogía con `movimiento_id`; disponible=200) → resultado 7800+descarte 1700+merma 300 → conciliación (diff 0) → cierre. **PASÓ.**
- F2 negativos (**todos rechazados**): traslado>ubicación, consumo con orden en borrador, consumo>disponible, edición de orden cerrada, transición borrador→cerrado, conciliar orden descuadrada.
- RLS productiva F2: sin claim → 0; tenant A → 1; cross-tenant B → 0.
- Tests de dominio (node): F1 27/27 + F2 28/28.

**Invariantes verificadas:** ledger única SoT (transferencia no altera total); consumo genera movimiento **y** lineage atómicamente; descarte/merma separados; orden no cierra sin conciliar; orden cerrada no editable; concurrencia por `FOR UPDATE` en RPC.

**Build:** no ejecutado en worktree aislado (sin `node_modules`; módulos aditivos no importados aún); sintaxis JS validada (ESM OK).
**Schema:** DRAFT — **NO aplicado a producción**. Migraciones ejecutadas: NO. Data productiva: NO. Cross-project: NINGUNO (no toca `exp_*`/Frisku/Osiris/Foods/`main`; contenedores efímeros propios desmontados).
**Deuda:** EXP-TENANCY-001, EXP-SECURITY-001 (Core); PROC-INFRA-001 (`SUPA_KEY` vía friskuHelpers).
**Recomendación F3:** producto terminado + formatos/cajas + palletización + genealogía proceso→PT→pallet + repaletizaje, **consumiendo** el resultado F2 (interfaz resultado→PT) y extendiendo el ledger (movimientos `produccion`).

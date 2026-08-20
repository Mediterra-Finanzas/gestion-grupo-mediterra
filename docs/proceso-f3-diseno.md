# proc_* — F3: Diseño (Producto Terminado · Pallets · Repaletizaje) — para revisión

**Capability:** `proc_*` · tenant piloto Allegria Service · **Worktree:** `worktree-proc-fase1`
**Base:** F1 VALIDATED + F2 VALIDATED · **Fecha:** 2026-08-13 · **Estado:** ✅ **F3 VALIDATED** (Opción A ratificada por el CFO; §7 era el gate, ya resuelto — ver Acta al final).

> **Incremental** sobre F1+F2. El ledger `proc_movimiento` sigue siendo la **única SoT física** (no sistema paralelo). El resultado conciliado F2 (`proc_resultado`) es la **SoT del resultado**: el PT nace de líneas de resultado ya válidas, sin recalcular. Genealogía por FKs relacionales (no JSON opaco). No toca `exp_*`/Frisku/Osiris/Foods/`main`.

## 1. Alcance F3 (Reglas 1-17)

Dueño de: producto terminado (PT), formatos/cajas, palletización, pallets, genealogía resultado→PT→pallet, **repaletizaje** (N:M), movimientos de producción/repaletizaje en el ledger, inventario de PT/pallet. **NO** absorbe: despacho comercial/logístico (F4), facturación, liquidaciones, resultado económico, ni funciones de Allegria Foods.

## 2. Entidades F3

| Tabla | Propósito | Claves / FK | Notas |
|---|---|---|---|
| `proc_formato` | Catálogo de formatos de embalaje (Regla 3) | `empresa_id`, `especie_codigo`, `codigo`, `descripcion`, `kg_nominal_caja`, `tipo_embalaje`, `activo`, `vigencia_*`, `mapping_externo jsonb` | UNIQUE(empresa,especie,codigo). No hardcode cereza. kg real ≠ nominal |
| `proc_producto_terminado` | PT: unidad lógica resultante (Regla 4) | `empresa_id`,`temporada_codigo`,`planta_id`,`orden_id`, **`resultado_id`** (origen, Regla 1), `especie/variedad/categoria/calibre/color` (snapshot), `formato_id`, `cajas`, `kg`, `estado` | Objeto de ledger. Snapshot de dims para historia |
| `proc_pallet` | Cabecera de pallet (Regla 5) | `id UUID PK`, `codigo` (barcode, **no PK**), `empresa_id`,`temporada_codigo`,`planta_id`, `formato_id?`, `cajas`(cache),`kg`(cache), `estado`, `ubicacion_id`, timestamps, `created_by` | `codigo` UNIQUE(empresa,temporada). Cache reconciliable |
| `proc_pallet_linea` | Composición pallet↔PT (Regla 6: **mixto vía header+líneas**) | `empresa_id`,`pallet_id`,`pt_id` (genealogía), `formato_id`, `cajas`,`kg`, `estado` (activa/consumida) | SoT de composición + genealogía PT→pallet |
| `proc_repaletizaje` | Evento formal (Regla 9) | `empresa_id`,`fecha`,`motivo`,`estado`,`created_by` | Motor único para split/merge/desarme parcial (Regla 14) |
| `proc_repaletizaje_origen` | Pallets consumidos | `repaletizaje_id`,`pallet_id`,`cajas`,`kg` | N:M origen |
| `proc_repaletizaje_destino` | Pallets generados | `repaletizaje_id`,`pallet_id`,`cajas`,`kg` | N:M destino |

**Ledger F3 (extiende F1/F2, Regla 7):** nuevos `proc_tipo_movimiento`: `produccion` (entrada), `palletizacion` (transferencia PT→pallet), `repaletizaje` (transferencia pallet→pallet), `desarme` (pallet→PT), `ajuste_pt` (entrada/salida). `objeto_tipo` ya soporta `producto_terminado` y `pallet` (F1).

## 3. Genealogía (Regla 8) — relacional, bidireccional

`recepción → lote → orden → orden_insumo → resultado → PT → pallet` (adelante) y su inverso, todo por FK:
`proc_pallet_linea.pt_id → proc_producto_terminado.resultado_id → proc_orden_proceso ← proc_orden_insumo.lote_id → proc_lote.recepcion_id → proc_recepcion → productor (proc_vinculo)`. Repaletizaje preserva el vínculo: las líneas de los pallets destino siguen referenciando los mismos PT (y su resultado/orden/lote/recepción).

## 4. Controles de integridad (Reglas 2, 10, 15)

- **No sobreasignación (Regla 2):** `Σ PT.kg materializado desde una línea de resultado ≤ resultado.kg`. Vista `proc_v_resultado_disponible` + RPC `proc_fn_materializar_pt` con `FOR UPDATE` (transaccional, no frontend).
- **No sobre-palletización:** `Σ palletizado desde un PT ≤ PT on_hand` (ledger). RPC con lock.
- **Balance de repaletizaje (Regla 10):** `Σ kg origen = Σ kg destino ± tolerancia`; ídem cajas. No se crean kilos. Enforcement en RPC/trigger.
- **Saldos derivados (SoT = ledger):** `proc_v_pt_saldos`, `proc_v_pallet_saldos` (cajas/kg + ubicación). Caches en `proc_pallet` reconciliables.

## 5. Estados (Regla 11) y ubicación (Regla 12)

- PT: `generado → disponible → agotado / anulado`.
- Pallet: `armando → disponible → reservado → repaletizado / despachado / anulado` (terminal no editable, como orden F2).
- Traslado de pallet entre ubicaciones = `naturaleza='transferencia'` (Regla 12: no cambia stock total, redistribuye). Reusa el patrón F2.

## 6. Frontera con F4 (Regla 17)

F3 deja pallets `disponibles`/`reservados`. Despacho (guía, camión, transportista, destino, documentos) = **F4**. Solo referencias mínimas para no bloquear diseño.

---

## 7. DECISIÓN ESTRUCTURAL A ELEVAR (Regla disciplina — "detente y eleva")

Tú marcaste **granularidad caja/pallet** como punto de detención obligatoria. Es la única decisión estructural real de F3:

**¿El PALLET es un objeto de stock del ledger, o su contenido se deriva solo de `proc_pallet_linea`?**

| | **Opción A — Pallet objeto de ledger (RECOMENDADA)** | **Opción B — Pallet derivado de líneas** |
|---|---|---|
| Palletización | Movimiento ledger: PT `salida` + pallet `entrada` (kg conservado) | Solo crea `proc_pallet_linea`; sin movimiento de pallet |
| Stock del pallet | `proc_v_pallet_saldos` desde el ledger (SoT); `proc_pallet_linea` = genealogía reconciliable | `Σ proc_pallet_linea` (las líneas son la SoT del pallet) |
| Repaletizaje | Movimientos ledger pallet→pallet + detalle N:M + balance | Transformación de líneas + detalle N:M + balance |
| Total físico terminado | Σ PT-suelto (ledger) + Σ pallet (ledger); conservado en cada transición | Σ PT (ledger) − Σ palletizado + … (más indirecto) |
| A favor | Coherente con Reglas 7/10/12 (pallet con movimientos, balance, ubicación en el ledger); "ledger = SoT físico" literal; traslado de pallet ya encaja | Menos movimientos; más simple; una sola SoT por pallet (las líneas) |
| En contra | Doble representación pallet (ledger on_hand vs Σ líneas) → exige reconciliación | Stock de pallet fuera del ledger; choca con Regla 7 (lista `palletizacion`/`repaletizaje` como tipos de ledger) |

**Recomendación:** **Opción A.** Las Reglas 7 (tipos de ledger para palletización/repaletizaje), 10 (balance de kg de pallet) y 12 (traslado de pallet no cambia stock total) implican que el pallet es un objeto físico del ledger. La doble representación se controla con un **test de reconciliación** (`Σ proc_pallet_linea.kg activas == proc_v_pallet_saldos.kg`), igual que el patrón cache/vista de F1.

Sub-decisiones derivadas (resueltas si eliges A; confirmar de paso):
- **Pallet mixto:** header + líneas (tu preferencia, Regla 6) → **soportado**; una `proc_pallet_linea` por PT/formato. Un pallet homogéneo = una sola línea.
- **Desarme/split/merge/parcial (Regla 14):** mismo motor `proc_repaletizaje` (N:M), no workflows paralelos.
- **Barcode (Regla 13):** `proc_pallet.codigo` único por empresa+temporada, legible, independiente del UUID; sin hardware aún.

## 8. Gate F3 (diseño → SQL)

**No materializo la migración F3 hasta que ratifiques §7** (Opción A vs B para la granularidad caja/pallet, + sub-decisiones). Con eso —y si no cambia bounded context/SoT/seguridad— ejecuto: migración incremental + capa dominio/DB + tests SQL + tests dominio + E2E (Regla 16) + runtime aislado + regresión F1/F2 + RLS + Acta F3 + commit `service:`. STOP-AND-REPORT solo ante otro cambio estructural.

---

## ACTA DE ENTREGA — proc_* FASE 3 (VALIDATED)

**Proyecto:** Allegria Service · **Bounded context:** `proc_*` · **Worktree:** `worktree-proc-fase1` · **Base:** F1+F2 VALIDATED.
**Estado: ✅ VALIDATED (runtime aislado, 2026-08-13).** Incremental sobre F1+F2. Opción A ratificada.

**Separación de SoTs (ratificada):** `proc_movimiento` = existencia física/movimientos/ubicación/saldo; `proc_pallet_linea` = composición/genealogía. Invariante `Σ líneas activas = saldo físico del pallet` enforced por CONSTRAINT TRIGGER diferido.

**Archivos (solo rutas Service):**
- `supabase/schema_proc_v3_f3.sql` — **nuevo** (incremental): 7 tablas (formato, producto_terminado, pallet, pallet_linea, repaletizaje + origen/destino) + 5 tipos de movimiento (produccion/palletizacion/repaletizaje/desarme/ajuste_pt) + 4 vistas (resultado_disponible, pt_saldos, pallet_saldos, pallet_composicion) + invariante de reconciliación (constraint trigger diferido) + 6 RPC (materializar_pt, crear_pallet, palletizar [compat], repaletizar [N:M], trasladar_pallet, estado_por_saldo) + RLS FORCE/REVOKE anon.
- `supabase/schema_proc_v3_f3_DEV_ONLY_rls.sql` — **nuevo**.
- `supabase/validation/proc_v3_f3_tests.sql` — **nuevo** (E2E Regla 16 + N1..N7).
- `src/proceso/core/procesoF3Domain.js` + `.test.mjs` — **nuevo** (lógica pura + asserts).
- `src/proceso/core/procesoF3DB.js` — **nuevo** (capa DB, gate Regla 9).
- `docs/proceso-f3-diseno.md` — **modificado** (esta Acta).

**Reglas 1-17 materializadas:** PT desde líneas de resultado F2 (no recálculo); no-sobreasignación (vista + RPC FOR UPDATE); formatos configurables (no hardcode cereza); pallet header+líneas (mixto) con compatibilidad configurable; barcode `codigo` ≠ UUID único por empresa+temporada; ledger extendido (SoT física); genealogía relacional bidireccional; repaletizaje N:M formal (split/merge/parcial mismo motor) con balance `Σorigen=Σdestino±tol`, sin crear kilos; pallet parcialmente consumido conserva saldo (estado derivado, `repaletizado` no terminal); traslado = transferencia (no altera total); cantidades absolutas (no % autoritativo); tolerancias/precisión NUMERIC (no floats JS).

**Validación runtime (Postgres 16 efímero, sin tocar producción; teardown):**
- F1+F2+F3 aplican limpios (`ON_ERROR_STOP=1`); **F1+F2 regresión OK**.
- F3 E2E (Regla 16): recepción 10000 → orden 9800 → resultado 7800+1700+300 → conciliar/cerrar → materializar PT (4000+3800=7800) → palletizar (P1/P2/P3) → repaletizar 2→2 (P1+P2→P4 3000+P5 1000, balance 4000=4000, P1/P2 agotados) → total pallets 7800 → genealogía a resultado/orden → traslado P3 (kg intacto). **PASÓ.**
- F3 negativos (**todos rechazados**): materializar sobre resultado agotado, palletizar sobre PT agotado, **línea manual que rompe el invariante** (constraint trigger), repaletizaje excediendo origen, código de pallet duplicado, kg negativo.
- RLS productiva F3: sin claim → 0; tenant A → 1; cross-tenant B → 0.
- Dominio (node): F1 27 + F2 28 + F3 (todas pasan).

**Build:** no ejecutado (worktree aislado sin `node_modules`; módulos aditivos); sintaxis JS validada (ESM OK).
**Schema:** DRAFT — **NO aplicado a producción**. Migraciones: NO. Data: NO. Cross-project: NINGUNO (no toca `exp_*`/Frisku/Osiris/Foods/`main`; efímeros propios desmontados; contenedor `exp_pg2` de otra sesión intacto).
**Deuda:** EXP-TENANCY-001, EXP-SECURITY-001 (Core); PROC-INFRA-001.
**Frontera F4 (Regla 17):** pallets quedan `disponibles`/`reservados`; despacho (guía/camión/transportista/destino/documentos) = F4.

---
## Adenda UAT (2026-08-13) — Fix UAT-D-01
Durante la UAT integral F1–F6 se detectó que la reducción de composición de pallet (`proc_pallet_linea`) decrementaba **una sola** línea (`ORDER BY kg DESC LIMIT 1`) validando contra la **suma** de líneas activas. Un pallet mezclado (varias líneas del mismo PT tras un merge) con un movimiento mayor que su línea más grande llevaba esa línea a kg negativo → `CHECK(kg>=0)` → operación legítima rechazada. **Fix:** helper `proc_fn_reducir_composicion_pallet` (F3) que distribuye la reducción entre todas las líneas activas del PT; usado por `proc_fn_repaletizar` (F3) y `proc_fn_confirmar_despacho` (F4). Verificado en escenario D (repaletizaje 3 generaciones + despacho) y regresión F3/F4 sin cambios. Ver `docs/proceso-uat-f1-f6.md`.

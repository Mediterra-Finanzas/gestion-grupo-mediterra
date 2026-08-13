# proc_* — F3: Diseño (Producto Terminado · Pallets · Repaletizaje) — para revisión

**Capability:** `proc_*` · tenant piloto Allegria Service · **Worktree:** `worktree-proc-fase1`
**Base:** F1 VALIDATED + F2 VALIDATED · **Fecha:** 2026-08-13 · **Estado:** Diseño F3 **para revisión**.

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

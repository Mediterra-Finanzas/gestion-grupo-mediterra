# Acta de Entrega — F7.4 (Producto Terminado + Pallets + Bodega + Repaletizaje)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `623511f` · **Estado:** **F7.4 VALIDATED** (runtime + build; revisión visual en vivo pendiente — §4). Sin merge, sin producción.

## 1. Qué se entregó

La operación de **producto terminado y bodega**: el usuario puede responder desde la UI qué PT generó una orden, cuánto queda por palletizar, qué pallets existen, dónde están, de qué están compuestos, cuánto tienen libre/reservado/bloqueado, qué transformaciones sufrieron y de qué recepción/lote/orden proviene cada kilo. UI delgada sobre el motor F3 VALIDATED. **Ledger = SoT físico; `proc_pallet_linea` = SoT composición; React no mantiene saldos.**

### Backend menor (`schema_proc_v7_4_f7_4.sql`, aditivo, no destructivo)
- **Holds genéricos de bodega** (`proc_fn_hold_pallet` reserva/bloqueo + `proc_fn_liberar_hold`) sobre `proc_hold` existente (NO segundo mecanismo). Validan cantidad ≤ disponible; el saldo ya los agrega. Un hold no cambia stock físico.
- **Read-models** (security_invoker → RLS por empresa): `proc_v_resultado_materializable` (kg disponible por línea de resultado + orden), `proc_v_pt_operacional` (PT + on_hand; pendiente de palletizar = on_hand>0), `proc_v_pallet_bodega` (pallet + producto/cliente/ubicación + saldos físico/reservado/bloqueado/libre + composición).
- **Genealogía** (`proc_fn_pallet_genealogia`): backwards (PT/orden/resultado + lotes/recepciones/productor) + forwards (repaletizajes recursivos, multi-generación).

### UI (`src/proceso/ui/`)
- **Producto Terminado**: (a) Materializable — resultado conciliado con `kg_disponible`, materializar PT (backend rechaza sobreasignación); (b) PT pendiente de palletizar (on_hand) → palletizar (pallet nuevo o existente = mixto).
- **Bodega / Inventario**: pallets con producto/cliente/ubicación + saldos + filtros; navega al detalle.
- **Detalle de Pallet** (objeto de 1ª clase): identificación, saldos con **invariante Σ líneas = físico** visible, composición, **genealogía backwards/forwards navegable**, holds (reservar/bloquear/liberar), movimientos, traslado, imprimir etiqueta (stub barcode/QR), auditoría.
- **Repaletizaje** N:M: origen (multiselect) → destinos (nuevo/existente) → movimientos (línea PT → kg/cajas → destino) → balance → ejecutar (`proc_fn_repaletizar`, único motor split/merge/parcial). El parcial preserva el saldo del origen; el backend valida balance.
- **Centro**: KPIs de PT/Bodega y excepciones (pallet bloqueado) navegan al objeto.

## 2. Source of Truth (sin cambios)
`proc_movimiento` = existencia/movimientos/ubicación/saldo. `proc_pallet_linea` = composición/genealogía. Invariante `Σ líneas activas = saldo físico` garantizada por backend; la UI la **muestra**, no la calcula. React no crea inventario paralelo.

## 3. Validación runtime (PostgreSQL 16 aislado) — VALIDATED (2026-08-13)
**Postgres:** 16.14 (contenedor efímero `postgres:16`, stub Core, RLS bypass como superuser para E2E; rol `anon` para RLS). **Docker:** gate de estabilidad superado (2 verificaciones consecutivas + contenedor efímero real levanta/responde/teardown).
- **Cadena v1→v7.4 con `ON_ERROR_STOP=1`:** las 10 migraciones aplican **limpio** (F1,F2,F3,F4,F5,F6,F7.1,F7.2,F7.3,F7.4).
- **E2E F7.4** (`proc_v7_4_f7_4_tests.sql`) — **TODOS PASARON ✓**: materializar sin sobreasignación (7800=4000+3800; +100 rechazado) · palletización + **invariante Σ líneas=físico** (2000/2000) · pallet mixto (2 líneas) · traslado (stock idéntico 2000) · hold (reserva 200 → físico 2000/reserv 200/libre 1800; liberar → 2000; exceso rechazado) · repaletizaje N:M (A+B→C2 2500+D 1500) + parcial + **multi-línea UAT-D-01** (mover 2200 > línea mayor 2000 → distribuye, F=2200/C2=300) · genealogía (lotes origen + forwards) · read-models.
- **Concurrencia real** (2 sesiones psql simultáneas, mismo saldo de pallet, repaletizaje 1000): **1 éxito / 1 rechazo** ("reducción 1000 excede composición activa 0"); estado final src=0/destino=1000, **1 repaletizaje**, **0 saldos negativos**.
- **Regresión F1–F7.3** (`proc_v1..v6 + v7_f7_1 + v7_2 + v7_3` tests): **TODAS PASARON ✓** (F3 pallet/repaletizaje, F4 despacho, F7.2 QC/lote, F7.3 producción/conciliación intactos).
- **RLS/tenant (schema productivo, sin DEV_ONLY):** rol `anon` → **permission denied** en `proc_v_resultado_materializable`, `proc_v_pt_operacional`, `proc_v_pallet_bodega`, y en `proc_fn_hold_pallet` (proc_pallet) / `proc_fn_pallet_genealogia` (proc_pallet_linea). No hay fuga de datos.
- **Ledger = SoT:** verificado — palletización/traslado/hold/repaletizaje conservan la coherencia; sin saldo paralelo editable; invariante composición=físico enforced por backend.
- **Fixes realizados:** **ninguno.** No apareció ningún defecto del backend; los dos intentos fallidos iniciales de la carrera fueron errores del comando de prueba (cast `::uuid` faltante y 5º argumento `p_actor` omitido), no del sistema.

## 4. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (warnings→error). El módulo F7.4 (4 páginas nuevas + wiring) integra sin errores de compilación. node_modules por junction reversible (removido); `build/`+log eliminados. — verificación de integración real.
- **Dominio JS** (`procesoF7Domain.test.mjs`): 35/35 ✓ (sin regresión; F7.4 reutiliza helpers F3).
- **Revisión visual en vivo:** no ejecutada (requiere login + tenant con datos `proc_*` reales; además Docker caído impide levantar datos). Declarado honestamente pendiente.

## 5. UAT-D-01 (no regresión)
El escenario multi-línea (pallet con varias líneas del mismo PT, mover más que la línea individual mayor) se revalida en el E2E: el helper `proc_fn_reducir_composicion_pallet` distribuye la reducción. No regresa.

## 6. Frontera (no construido en F7.4)
Despacho, guía de salida, transportista, Resultado de Proceso PDF, tarifario/base = F7.5+. El pallet disponible de F7.4 es el insumo de despacho en F7.5.

## 7. Gaps / deuda
- Etiqueta/barcode: punto de UI preparado (botón + búsqueda por código); sin dependencia ni hardware (se implementa cuando corresponda).
- Compatibilidad de pallet mixto: se respeta `pallet_compat_keys` de F3; reglas comerciales adicionales por confirmar con planta.
- Tenant `empresa_id` manual (claim autenticado pendiente).

## 8. Aislamiento
Todo en `worktree-proc-fase1`. `src/App.jsx` = solo pestañas de permisos. No se tocó Frisku/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 9. Maestros reales requeridos (equipo de planta)
Formatos reales + kg nominales, reglas de pallet homogéneo/mixto (`pallet_compat_keys`), capacidad típica cajas/pallet, códigos de pallet (correlativo ya backend), ubicaciones, reglas de compatibilidad, etiquetas actuales, uso real de reservas/bloqueos, razones de repaletizaje. Se cargan en Configuración; no se inventan.

## 10. Próximo paso
F7.5 (Despacho) tras visto bueno del CFO. No auto-avanzar.

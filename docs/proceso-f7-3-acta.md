# Acta de Entrega — F7.3 (Programa + Orden + Ejecución + Resultado + Conciliación)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `95c7883` · **Estado:** VALIDATED (backend + E2E + build; revisión visual en vivo pendiente por Angelo — §5) · Sin merge, sin producción.

## 1. Qué se entregó

La **mesa de control de producción**: un jefe de planta puede programar qué procesar, seleccionar fruta realmente disponible y **elegible (gate QC visible)**, ejecutar consumos N:M sin romper inventario, registrar exactamente qué salió (comercial / descarte / merma), **conciliar cada kilogramo** y **cerrar** la corrida con trazabilidad hacia las recepciones y lotes que la originaron. UI delgada sobre el motor F2 VALIDATED.

### Backend menor (`schema_proc_v7_3_f7_3.sql`, aditivo, no destructivo)
- **Guard de orden terminal:** trigger BEFORE INSERT en `proc_resultado`/`_descarte`/`_merma` (`proc_fn_resultado_orden_guard`) — una orden `cerrado`/`anulado` no admite nuevos resultados (coherente con "orden cerrada = read-only"). No rompe inserciones válidas (orden en proceso).
- **Read-model `proc_v_orden_listado`** (security_invoker): orden + cliente (JOIN `proc_vinculo`) + línea + conciliación (`kg_entrada/resultado/descarte/merma/diff/tolerancia`) + nº insumos. Filtrable por estado/planta.
- **Read-model `proc_v_lote_operacional`** (security_invoker): `proc_v_lote_listado` + `elegible` (boolean) + `motivo_no_elegible`, mirror de `proc_fn_lote_elegible` (gate QC computado en SQL). Para el selector de consumo.

### UI (`src/proceso/ui/`)
- **Programa** (planificación; Programa ≠ Orden): crear, publicar, **generar orden** (hereda contexto). No colapsa ambas entidades.
- **Órdenes** (listado con conciliación + filtros por estado) → **Orden** (mesa de control):
  - Cabecera + **acciones según máquina de estados backend** (`accionesOrden`): Iniciar → Pasar a conciliación → Conciliar (RPC, deshabilitado si no cuadra) → Cerrar. Muestra **qué falta** (`faltaParaCerrar`: "faltan N kg por conciliar…").
  - **Insumos**: consumo **N:M** vía `consumir_lote_en_orden`; **selector de lotes** que muestra elegibles seleccionables y **no elegibles con motivo** (QC), sin ocultarlos; el backend rechaza cualquier consumo no elegible.
  - **Resultado comercial** (categoría/calibre/color/kg, catálogos dinámicos), **descarte** (motivo `proc_motivos_descarte`) y **merma** (motivo `proc_motivos_merma`) — separados, captura inline.
  - **Conciliación de masa**: entrada − comercial − descarte − merma = diferencia, con tolerancia y **packout** (derivado, no almacenado). El cierre lo decide el backend.
- **Centro de Operaciones**: KPIs de producción y excepciones (conciliación pendiente / diferencia de masa) navegan a la orden.
- Dominio: `packout`, `resumenConciliacion`, `accionesOrden`, `faltaParaCerrar`, `ordenTerminal` (preview UX; backend autoridad). Reusa `conciliacionOrden`/`transicionOrdenValida` de F2.

## 2. Principio: backend autoridad
- La UI **no reimplementa** stock/genealogía/conciliación/estados. Consumo, conciliación, cuadre y cierre los decide backend (RPC + triggers). React presenta preview y traduce errores. El gate QC de F7.2 sigue enforced en el consumo.

## 3. Validación runtime (PostgreSQL 16 aislado)
- Aplicación limpia `schema_proc_v1..v7_3`.
- **E2E F7.3** (`proc_v7_3_f7_3_tests.sql`) — TODOS PASARON ✓:
  - Lote en 3 corridas (4000/3000/3000) → disponible 0, 3 relaciones `orden_insumo`; conciliación individual.
  - N:M: 1 orden consume varios lotes de productores distintos.
  - Conciliación **cuadra** (9800 = 7800+1700+300, diff 0 → concilia + cierra) y **no cuadra** (9600, diff 200 > tolerancia 49 → `conciliar_orden` rechaza).
  - **Guard**: resultado en orden cerrada → rechazado.
  - Read-models: `proc_v_orden_listado` (cliente/diff/estado) y `proc_v_lote_operacional` (elegible) correctos.
- **Concurrencia** (§41): doble consumo concurrente del saldo final → 1 éxito / 1 rechazo, disponible 0, sin negativo ✓.
- **Regresión F1–F7.2**: TODAS PASARON ✓ (el guard no rompe inserciones válidas).
- **RLS**: `anon` → permission denied en `proc_v_orden_listado` y `proc_v_lote_operacional`.
- **Dominio JS F7** (`procesoF7Domain.test.mjs`): 35/35 ✓ (packout, conciliación, acciones, faltaParaCerrar).

## 4. Trazabilidad
- Orden → insumos (lote, productor, recepción, QC). Lote → (F7.2) recepción origen. Genealogía = `proc_orden_insumo` (autoridad). Grafo completo F3/F4 no se construye aún (frontera).

## 5. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (warnings→error). El módulo F7.3 + wiring integran sin errores de compilación. node_modules por junction reversible (removido); `build/` y log eliminados.
- **Revisión visual en vivo:** **no ejecutada** en este entorno (requiere login autenticado email+PIN contra Supabase de producción + tenant con datos `proc_*` reales, no disponibles/permitidos). Declarado honestamente pendiente. Recomendado: pasada local por Angelo (Centro → Programa → Órdenes → Orden: consumo de lotes elegibles/resultado/descarte/merma/conciliación/cierre; verificar tablet width, tablas, modales, estados, empty/error, jerarquía).

## 6. Frontera (no construido en F7.3)
PT, pallets, repaletizaje, despacho, informe PDF, tarifario/base = F7.4+. Una orden cerrada termina en resultado F2; no se materializa PT desde esta UI.

## 7. Gaps / deuda
- Roles de negocio granulares no materializados en backend (permiso por pestaña).
- Corrección post-cierre: no hay "editar cerrado" (correcto); anulación/reversa avanzada no implementada en F7.3.
- Tenant `empresa_id` manual (claim autenticado pendiente).

## 8. Aislamiento
Todo en `worktree-proc-fase1`. `src/App.jsx` = solo pestañas de permisos. No se tocó Frisku/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 9. Maestros reales requeridos (equipo de planta)
Líneas de proceso, turnos (hoy texto libre; formalizar si se requiere), especies/variedades, calibres/colores por especie, categorías, motivos descarte/merma, **tolerancia de conciliación** (`proc_empresa_config.tolerancia_masa_pct`), parámetros QC. Se cargan en Configuración; no se inventan.

## 10. Próximo paso
F7.4 (PT + Pallets + Bodega + Repaletizaje) tras visto bueno del CFO. No auto-avanzar.

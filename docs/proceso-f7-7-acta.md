# Acta de Entrega — F7.7 (Tarifario + Servicios Facturables + Base de Cobro)

**Fecha:** 2026-08-14 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `fd7ad02` · **Estado:** **F7.7 VALIDATED** (runtime + regresión + RLS + build; revisión visual en vivo pendiente — §12). Sin merge, sin producción.

## 1. Qué se entregó
La interfaz operacional/comercial del motor **F6 ya VALIDATED**. Responde: *¿qué debe cobrar Allegria Service, a quién, por qué servicio, sobre qué cantidad, a qué tarifa, en qué moneda y desde qué hecho operacional?* UI delgada: el backend F6 es la autoridad (resolución de tarifa, snapshot, XOR de FK, inmutabilidad, multimoneda, idempotencia). **NO es factura / CxC / cobranza / contabilidad / ERP.**

Pantallas nuevas (`src/proceso/ui/pages/`): **Tarifario**, **Servicios Facturables**, **Pendientes de Tarifa** (misma bandeja, filtro fijo), **Bases de Cobro**, **Detalle de Base de Cobro**.

## 2. Backend menor (`schema_proc_v7_7_f7_7.sql`, aditivo, NO cambia F6)
Solo LECTURA/derivación — read-models `security_invoker` (RLS por empresa) + 2 funciones que **reutilizan** `proc_fn_resolver_tarifa` (no reimplementan la regla):
- `proc_v_tarifa_listado` — tarifa + servicio + cliente (nombre) + **especificidad** (0/1/2/3) + `es_general` + **vigencia_estado** (vigente/futura/vencida) computados. Explica por qué una tarifa gana.
- `proc_v_servicio_facturable` — hecho + **referencia humana** (folio de orden / código de pallet / repaletizaje / "Manual"), snapshot de tarifa, monto, y si está en una base. Sin UUID visibles.
- `proc_v_base_cobro_listado` / `proc_v_base_cobro_linea` — bases + conteo + total; líneas con cantidad/tarifa/monto/referencia.
- `proc_v_orden_facturable` — órdenes conciliadas/cerradas con `cliente_vinculo_id`, **kg procesados** e idempotencia visible (`tiene_servicio`).
- `proc_fn_resolver_tarifa_detalle(...)` — **preview** de la tarifa ganadora (envuelve la RPC F6).
- `proc_fn_revalorizar_servicio_pendiente(...)` — tras cargar la tarifa faltante, rellena el snapshot que estaba **NULL** (no muta un snapshot ya valorizado; solo actúa sobre `pendiente_tarifa`).

## 3. Cumplimiento de los criterios de cierre (§30)
- **Tarifario utilizable:** listado con general vs específica, vigente/futura/vencida, prioridad, especificidad; crear tarifa; cerrar/anular; **"Resolver tarifa" (preview)** muestra la ganadora sin reimplementar la regla.
- **Servicios auditables:** cada fila muestra **cantidad × tarifa = monto** (detalle), tarifa SNAPSHOT, y traza al hecho (orden/pallet navegable).
- **Pendientes de tarifa visibles:** bandeja propia + banner + KPI en Centro. **Nunca $0**: sin tarifa → estado `pendiente_tarifa`, monto "—".
- **Snapshot permanece:** validado en runtime (T6: cambiar la tarifa CURRENT a 0,99 no altera el hecho, sigue 0,30 / 2.940).
- **cantidad × tarifa = monto** visible en detalle de servicio, formulario manual y detalle de base.
- **Bases auditables + aprobada read-only:** header + líneas + total del backend; banner "🔒 read-only" e inhabilita agregar líneas cuando no es borrador/en_revision (guard F6).
- **Multimoneda no se mezcla:** una base = una moneda; agregar solo servicios de la misma moneda (validado T8: CLP no entra a base USD).
- **Servicio manual identificado:** exige motivo + autorización; badge "Manual".
- **Trazabilidad al hecho:** servicio → orden / pallet (reutiliza contratos existentes; no segunda genealogía).
- **Frisku ausente / Foods solo por `proc_vinculo`:** 0 referencias a `exp_*`/`frisku_*` en el schema; 0 vistas `proc_v_*` usan `exp_*`/`frisku_*` (verificado en catálogo).

## 4. Cantidad facturable
`generar_servicio_proceso` fija **cantidad = kg PROCESADOS** (Σ `proc_orden_insumo`), no recibidos. Validado en regresión F6 (9.800, no 10.000) y en F7.7 (`proc_v_orden_facturable.kg_procesados`=9.800).

## 5. Snapshot de tarifa
El servicio congela `tarifa_aplicada` / `moneda` / `unidad_tarifa` / `vigencia_usada`. El detalle distingue **SNAPSHOT (congelada)** de CURRENT y lo dice explícitamente. `revalorizar_servicio_pendiente` solo rellena un snapshot NULL (pendiente), nunca reescribe uno ya valorizado (T5d: error si no está pendiente).

## 6. Validación runtime (PostgreSQL 16 aislado, Docker efímero) — VALIDATED
- **Cadena v1→v7.7** con `ON_ERROR_STOP=1`: aplica **limpio** (13 migraciones).
- **F7.7** (`proc_v7_7_f7_7_tests.sql`) — **TODOS PASARON ✓**: T1 especificidad/es_general/cliente en read-model · T2 preview gana específica 0,30 (y general 0,25 sin cliente) · T3 referencia humana = folio de orden + monto 2.940 · T4 pendiente_tarifa/NULL (no $0) · T5 revalorizar (sin tarifa sigue pendiente; con tarifa valoriza 9.800×0,10=980; revalorizar no-pendiente → error) · T6 **snapshot inmutable** ante cambio CURRENT · T7 base listado/línea (total 2.940, referencia) · T8 **multimoneda** (CLP no entra a base USD) · T9 orden facturable (cliente/kg/idempotencia) · T10 base aprobada rechaza líneas.
- **Regresión F1–F7.6** (12 suites): **TODAS PASARON ✓**.
- **RLS/tenant:** `anon` → **permission denied** en las 5 vistas nuevas y en `proc_fn_resolver_tarifa_detalle`. Sin fuga.
- **Estructural:** 0 dependencia de vistas `proc_v_*` a `exp_*`/`frisku_*`; 0 referencias en el schema F7.7.
- **Fixes de código backend:** ninguno (los 2 ajustes fueron expectativas erróneas del test propio, corregidas).

## 7. Tests JS
- **format** 31/31 (incluye `formatTarifa`/`formatMoneda`) · **dominio** 62/62 (incluye `montoServicio`/`especificidadTarifa`/`vigenciaTarifa`/`baseEditable`/`accionesBase`/`servicioAgregableABase`/`totalesPorMoneda`) · **PDF data** 12/12. **Total 105/105.**

## 8. Estándar F7.6.1 respetado
`ProcFilters` (chips + reset, server-side) en las 4 pantallas de listado; `ProcDataTable` sticky; formateadores canónicos (`formatTarifa`/`formatMoneda`/`formatNum`/`formatFecha`); `normalizarNombre` en nombres visibles. **0 `toLocaleString` ad-hoc** en `src/proceso/ui` (incl. `procesoPdf.js` ruteado a `format.js`). **0 `text-transform: capitalize`.**

## 9. Auditoría de filtros (§17)
`ProcFilters` estándar en Tarifario (servicio/vigencia/moneda + búsqueda), Servicios (estado/origen/moneda + búsqueda), Pendientes (origen/moneda + búsqueda), Bases (estado/moneda + búsqueda). **Mapeo verificado:** cada filtro de cardinalidad viaja server-side como `&campo=eq.valor` sobre el read-model (validado en runtime que el `eq` filtra); búsqueda de texto en cliente sobre la página; chips de activos + reset explícito por código. **Click-through en vivo (A–J): pendiente** de la revisión visual (sin login/datos reales). Declarado honestamente.

## 10. Auditoría de normalización (§19)
Corregida la deuda de F7.6.1 en pantallas de detalle CURRENT:
| Archivo | Campo | Antes | Después |
|---|---|---|---|
| LoteDetalle | cliente/productor/dueno_fruta | crudo | `normalizarNombre(...)` |
| PalletDetalle | cliente, productor (genealogía) | crudo | `normalizarNombre(...)` |
| RecepcionDetalle | cliente/productor/dueno_fruta/exportadora | crudo | `normalizarNombre(...)` |
| Orden | cliente, productor (insumos y selector) | crudo | `normalizarNombre(...)` |
| Despacho | cliente, destinatario | crudo | `normalizarNombre(...)` |
| Tarifario/Servicios/Bases (F7.7) | cliente | — | `normalizarNombre(...)` desde el inicio |
**Excepción intencional:** `InformeDetalle` (destinatario/cliente del **snapshot emitido**) NO se normaliza — el snapshot histórico es inmutable (regla F7.6.1). **Resultado: 0 inconsistencias de casing conocidas en UI CURRENT** (los snapshots quedan como fueron congelados, por diseño).

## 11. Auditoría de vocabulario (§20) y formatters (§21)
- **Vocabulario:** términos canónicos consistentes (Producto Terminado, Base de Cobro, Pendiente de Tarifa, Repaletizaje, Servicios Facturables). Las minúsculas detectadas son prosa dentro de frases (correcto en español), no etiquetas divergentes. Sin cambios de datos maestros.
- **Formatters:** re-escaneo `src/proceso/ui` → **0 `toLocaleString` ad-hoc** (se ruteó el último, en `procesoPdf.js`, a `formatNum`/`formatFechaHora`).

## 12. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (1,07 MB gzip). Junction reversible removido; `build/` eliminado.
- **Revisión visual en vivo:** **no ejecutada** (requiere login + tenant con datos `proc_*` reales, no disponibles). Declarada honestamente pendiente; NO sustituida por HTML estático. **La arquitectura visual global NO se declara terminada** — eso corresponde al gate `F7.8 (UAT integral + Visual QA / Design System Compliance)`.

## 13. Frontera / aislamiento
0 cambios a modelo F6 (tarifa/snapshot/XOR/inmutabilidad/multimoneda), ledger, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, tenancy/RLS, bounded context. Todo en `worktree-proc-fase1`. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`. Sin merge, sin deploy. Schema DRAFT no aplicado a producción.

## 14. Deuda / próximo
- Autorizador del servicio manual: hoy se captura el **nombre** (en el motivo) + un token uuid, porque no hay identidad autenticada (gate pendiente, igual que el claim `empresa_id`).
- Revisión visual en vivo + responsive de planta.
- **Próximo = F7.8 (UAT UI integral + Visual QA / Design System Compliance)** con autorización del CFO. No auto-avanzar.

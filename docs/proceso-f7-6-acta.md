# Acta de Entrega — F7.6 (Resultado de Proceso + versiones + PDF + emisión + envíos)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `b82ba20` · **Estado:** **F7.6 VALIDATED** (runtime + build; revisión visual en vivo pendiente; PDF: data validada + layout previsualizado, render jsPDF pixel-exacto no ejecutable en este entorno — §4). Sin merge, sin producción.

## 1. Qué se entregó

El **principal entregable informacional de Allegria Service hacia sus clientes**: seleccionar una o varias corridas cerradas y responder con precisión qué fruta se procesó, cuánto, qué resultado/packout tuvo, qué descarte y merma hubo, **qué versión exacta se informó, a quién se envió y qué documento recibió** — y que, una vez emitido, **la historia no cambia** aunque CURRENT evolucione. UI delgada sobre el motor F5 VALIDATED. **F1–F4 = verdad operacional; F5 = contrato de informe/versionamiento; F7.6 = revisar/consolidar/emitir/renderizar/distribuir.** La UI no crea una segunda verdad.

### Backend menor (`schema_proc_v7_6_f7_6.sql`, aditivo, no destructivo)
- **Read-models** (security_invoker → RLS por empresa): `proc_v_orden_informable` (órdenes cerradas/conciliadas + kg procesados/comerciales + packout + flag `informada`) y `proc_v_informe_listado` (informe + destinatario + versión vigente + estado + packout). La no-duplicación de fuente ya la garantiza `UNIQUE(version_id, tipo_fuente, ref_id)` de F5; el snapshot inmutable y la inmutabilidad de versión emitida son de F5 (no se tocan).

### UI (`src/proceso/ui/`)
- **Informes** (bandeja, 2 tabs): "Informes" (listado) + "Pendientes de generar" (órdenes cerradas no informadas, selección múltiple → generar informe con destinatario + observaciones → `crear_informe` + `generar_version`).
- **InformeDetalle**: informe + **lista de versiones** (v1/v2/… con estado y packout) · **snapshot de la versión seleccionada** con distinción **CURRENT vs SNAPSHOT** (emitida = "snapshot congelado, la historia no cambia") · resumen KPI (packout) · detalle por dimensión (etiquetas resueltas de maestros; **números 100% del snapshot**) · fuentes explícitas (→ orden) · destinatarios (contacto congelado) · envíos (estado real; generar/descargar PDF **no** marca 'enviado') · **Emitir** · **Descargar PDF** (desde el snapshot) · **Nueva versión** (órdenes + motivo obligatorio; v1 permanece).
- **PDF** (`procesoPdf.js`, neutral, sin branding Frisku): `buildResultadoPdfData(snapshot, meta)` (función pura, del snapshot) + `generarResultadoPdf` (jsPDF+autotable por CDN, mismo patrón operativo; sin dependencia npm). El PDF nace del SNAPSHOT, nunca de CURRENT.
- **Centro**: excepción "informe sin emitir" navega a la bandeja. App.jsx pestaña Resultados de Proceso.

## 2. Bounded context / Frisku ≠ Service
- Destinatarios resueltos de `proc_vinculo` (no Frisku, no `exp_*`). Foods puede ser cliente/destinatario vía identidad Core + vínculo Service (E2E8: informe Foods sin FK a `exp_*`).

## 3. Consolidación matemática (no promediar %)
- El backend F5 consolida `Σkg comerciales / Σkg procesados`. **E2E2 verificado: orden A 90% + orden B 70% → 72%** (7200/10000), **no** 80%. La UI muestra el packout del snapshot; no lo reinventa.

## 4. Validación runtime (PostgreSQL 16.14 aislado) — VALIDATED
- **Cadena v1→v7.6** con `ON_ERROR_STOP=1`: aplica **limpio** (12 migraciones).
- **E2E F7.6** (`proc_v7_6_f7_6_tests.sql`) — **TODOS PASARON ✓**: una orden (9800, packout 0,7959, fuentes) · **consolidado ponderado 72%** · **fuente duplicada rechazada** (UNIQUE) · **snapshot inmutable** tras cambio CURRENT (renombrar categoría/observación no altera números v1) · **nueva versión** (v2 nueva, v1 → 'reemplazada' al emitir v2, ambas consultables) · **destinatario snapshot congelado** (renombrar el vínculo no cambia `nombre_snapshot`) · **Foods intercompany** (0 FK a `exp_*`) · **sin despacho** (orden cerrada sin pallets se informa) · read-models.
- **Regresión F1–F7.5** (todas las suites): **TODAS PASARON ✓** (recepción, producción, pallets, despacho, F5 backend de informes intactos).
- **RLS/tenant (schema productivo, sin DEV_ONLY):** `anon` → **permission denied** en `proc_v_orden_informable`, `proc_v_informe_listado`, y en `proc_informe`/`_version`/`_fuente`/`_envio`. Sin fuga.
- **PDF (data):** `procesoPdf.test.mjs` **12/12 ✓** — el PDF nace del snapshot (números duros del snapshot), folio/version presentes, packout/porcentajes correctos, sin labels no inventa desde CURRENT.
- **Fixes realizados:** ninguno.

## 5. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (1,06 MB gzip). Dominio JS 43/43 + PDF data 12/12. Junction reversible removido; `build/`+log eliminados.
- **Revisión visual UI en vivo:** **no ejecutada** (requiere login + tenant con datos `proc_*` reales, no disponibles). Declarada honestamente pendiente.
- **Revisión visual PDF:** el **render jsPDF pixel-exacto no es ejecutable en este entorno** (jsPDF se carga por CDN en runtime, no es dependencia npm, y el panel bloquea scripts CDN por CSP; jsPDF no está en node_modules para render headless). Declarado honestamente. Como complemento se entregó una **vista del contenido/layout** generada desde la salida real de `buildResultadoPdfData` (datos DEV, etiquetada como no pixel-exacta). Recomendado: verificación local del PDF por Angelo (descargar desde la UI).

## 6. CURRENT vs SNAPSHOT
Explícito en UX: cada versión muestra su propio snapshot; una versión emitida se rotula "snapshot congelado, la historia no cambia". El PDF y los números salen del snapshot de esa versión; abrir v1 muestra v1 (no se rearma desde v2/CURRENT).

## 7. Frontera (no construido en F7.6)
Tarifario, servicios facturables, Base de Cobro = F7.7. El Resultado de Proceso de F7.6 es informacional; no factura.

## 8. Gaps / deuda
- **Etiquetas de dimensión:** el snapshot F5 guarda IDs de categoría/calibre/color (los **números** están congelados). La UI/PDF resuelve los **nombres** desde maestros CURRENT (labels de referencia). Si una categoría se renombra, v1 muestra el nombre nuevo (solo etiqueta; los kg/packout son inmutables). Mejorable enriqueciendo el snapshot con nombres (backend menor a F5) si se requiere label-perfect histórico.
- **Envío email real:** registrado como estado; el despacho efectivo de email depende de configuración (emailHelper). Generar PDF ≠ enviado.
- **PDF render** en este entorno (ver §5). Tenant `empresa_id` manual.

## 9. Aislamiento
Todo en `worktree-proc-fase1`. `src/App.jsx` = solo pestañas. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 10. Maestros / próximo
Correlativo de informe usa el backend F7.1 (tipo INF). Storage de PDF: bucket privado + URL firmada (patrón CURRENT; el pdf_path se registra en la versión). **Próximo = F7.7 (Tarifario + Servicios Facturables + Base de Cobro, motor F6)** tras visto bueno del CFO. No auto-avanzar.

# F7.0 — Plan de implementación UI (F7.1 → F7.8)

**Fecha:** 2026-08-13 · **HEAD:** `71be745`. Partición incremental de la UI operacional sobre el contrato F1–F6 VALIDATED. Cada sub-fase entrega pantallas funcionales sobre la capa `src/proceso/core` (ya testeada), UI delgada, sin duplicar reglas. Estructura objetivo: `src/proceso/ui/` modular (no monolito).

## Secuencia

### F7.1 — Shell del módulo + Centro de Operaciones + Configuración mínima ✅ ENTREGADA
- Montaje en `App.jsx` (tile `allegria_service` + `TABS_PERMISOS_CONFIG` + `if(moduloActivo)`), sub-shell propio (navegación por estado), consumo de `theme.js`.
- **Centro de Operaciones** sobre read-models materializados: `proc_fn_centro_operaciones` (F7-RM-CENTRO) + `proc_fn_excepciones` (F7-RM-EXCEPCIONES).
- **Configuración** data-driven de 13 maestros (incl. QC con severidad y vínculos) — CRUD REST + soft-delete.
- Backend menor: **correlativos concurrency-safe** (`proc_correlativo` + `proc_fn_siguiente_correlativo`) y **QC configurable por severidad** (`proc_fn_registrar_qc`) en `schema_proc_v7_f7_1.sql`.
- Componentes neutrales propios (`src/proceso/ui/components/base.jsx`), traductor de errores, estados loading/empty/error. Ver `docs/proceso-f7-1-acta.md`.

### F7.2 — Recepción + QC + Lotes ✅ ENTREGADA
- Recepción (cabecera REST, folio desde correlativo) → QC dinámico (`registrar_qc`) → Ingreso de lote (RPC atómica `ingresar_lote_ubicado`) con ubicación. Roles diferenciados desde `proc_vinculo`.
- **Gate QC → proceso enforceable** (`schema_proc_v7_2_f7_2.sql`): trigger en `proc_orden_insumo` + `proc_fn_lote_elegible`. QC rechazado / obligatorio no ejecutado bloquea consumo, preserva existencia.
- Read-models `proc_v_recepcion_listado` / `proc_v_lote_listado` (security_invoker, filtrables). UI Recepciones/Lotes + detalle/trazabilidad + QcPanel dinámico. Ver `docs/proceso-f7-2-acta.md`.

### F7.3 — Programa + Orden + Ejecución + Resultado + Conciliación ✅ ENTREGADA
- Programa (planificación, generar orden) · Órdenes (listado+conciliación) · Orden (mesa de control: acciones por máquina de estados, consumo N:M con selector de lotes elegibles/gate QC visible, resultado/descarte/merma, conciliación+packout, cierre decidido por backend).
- Backend menor `schema_proc_v7_3_f7_3.sql`: guard de orden terminal + read-models `proc_v_orden_listado` / `proc_v_lote_operacional` (security_invoker).
- Validado PG16: E2E (3 corridas, N:M, conciliación cuadra/no-cuadra, guard) + concurrencia + regresión F1-F7.2 + dominio 35/35 + build CI=true. Ver `docs/proceso-f7-3-acta.md`.

### F7.4 — PT + Pallets + Bodega + Repaletizaje ✅ VALIDATED
- Producto Terminado (materializar desde resultado, sin sobreasignación; PT pendiente; palletizar nuevo/mixto) · Bodega (inventario+filtros) · Detalle de Pallet (saldos+invariante, composición, **genealogía backwards/forwards**, holds, traslado, movimientos) · Repaletizaje N:M (origen→destino→balance).
- Backend menor `schema_proc_v7_4_f7_4.sql`: holds genéricos (`proc_fn_hold_pallet`/`liberar_hold` sobre `proc_hold`), read-models `proc_v_resultado_materializable`/`proc_v_pt_operacional`/`proc_v_pallet_bodega`, `proc_fn_pallet_genealogia`.
- Validado PG16.14: cadena v1→v7.4 limpia; E2E F7.4 (materializar/palletizar+invariante/mixto/traslado/hold/repaletizaje N:M+parcial+multilínea UAT-D-01/genealogía/RM); concurrencia 1 éxito/1 rechazo sin negativo; regresión F1-F7.3 OK; RLS anon-deny; dominio 35/35; build CI=true. Revisión visual en vivo pendiente. Ver `docs/proceso-f7-4-acta.md`.

### F7.5 — Despacho ✅ VALIDATED
- Despachos (listado) · Despacho (mesa: preparar→listo→confirmar salida/cancelar/reversar; carga con reserva=hold; líneas ligadas a movimiento; documentos; trazabilidad despacho→recepción). Salida física, NO venta/exportación.
- Backend menor `schema_proc_v7_5_f7_5.sql`: `proc_fn_cancelar_despacho` (libera reservas) + read-models `proc_v_despacho_listado`/`proc_v_despacho_linea`/`proc_v_pallet_hold`.
- Validado PG16.14: cadena v1→v7.5 limpia; E2E (reserva/cancelar, completo, parcial, segundo, exceso, doble confirmación, reversa, cliente≠destinatario, trazabilidad, RM); concurrencia despacho-vs-repaletizaje + dos-reservas (1 éxito/1 rechazo, sin negativo); regresión F1-F7.4 OK; RLS anon-deny; dominio 43/43; build CI=true. Revisión visual en vivo pendiente. Ver `docs/proceso-f7-5-acta.md`.

### F7.6 — Resultado de Proceso + PDF + versiones/envíos ✅ VALIDATED
- Informes (bandeja: informes + pendientes de generar) · InformeDetalle (versiones, snapshot CURRENT vs histórico, emitir, PDF desde snapshot, destinatarios congelados, envíos, nueva versión con motivo). PDF neutral `procesoPdf.js` (jsPDF CDN; data pura testeable).
- Backend menor `schema_proc_v7_6_f7_6.sql`: read-models `proc_v_orden_informable` + `proc_v_informe_listado` (no-duplicación/inmutabilidad ya en F5).
- Validado PG16.14: cadena v1→v7.6 limpia; E2E (una orden, consolidado ponderado 72%, fuente duplicada rechazada, snapshot inmutable, nueva versión v1→reemplazada, destinatario congelado, Foods intercompany, sin despacho, RM); regresión F1-F7.5 OK; RLS anon-deny; dominio 43/43 + PDF data 12/12; build CI=true. Render jsPDF pixel-exacto no ejecutable en el entorno (CDN/CSP); layout previsualizado. Ver `docs/proceso-f7-6-acta.md`.

### F7.6.1 — Arquitectura visual + estándar de filtros + normalización de nombres ✅ ENTREGADA
- Fuente canónica `src/proceso/ui/format.js` (normalización idempotente + dedup + sugerencia + formateadores es-CL; 28 tests). Prohibido `text-transform:capitalize`.
- Escritura: normalización + dedup + "¿quisiste decir…?" (sin auto-merge) en Configuración de maestros.
- `ProcFilters` estándar (chips + reset, server-side) en Recepciones/Lotes/Bodega/Órdenes/Despachos; `ProcDataTable` sticky; `ProcAuditInfo`/25 sitios `toLocale*` → formateadores canónicos (0 remanentes).
- 4 docs de estándar (visual-architecture, filter-standard, name-normalization-standard, ui-audit). Build CI=true OK; tests 83/83. Revisión visual en vivo pendiente. Ver `docs/proceso-f7-6-1-acta.md`. Sin backend nuevo; sin tocar ledger/RLS/bounded context.

### F7.7 — Tarifario + Servicios Facturables + Base de Cobro ✅ VALIDATED
- UI del motor F6: **Tarifario** (general/específica, vigente/futura/vencida, especificidad, crear/cerrar/anular, preview "Resolver tarifa") · **Servicios Facturables** (referencia humana, cantidad×tarifa=monto, snapshot, traza al hecho, generar desde orden / manual) · **Pendientes de Tarifa** (bandeja; nunca $0; revalorizar) · **Bases de Cobro** (crear folio correlativo) · **Detalle de Base** (líneas auditables, aprobar/enviar/cerrar, read-only si aprobada).
- Backend menor `schema_proc_v7_7_f7_7.sql` (aditivo, NO cambia F6): read-models `proc_v_tarifa_listado`/`proc_v_servicio_facturable`/`proc_v_base_cobro_listado`/`proc_v_base_cobro_linea`/`proc_v_orden_facturable` + `proc_fn_resolver_tarifa_detalle` (preview) + `proc_fn_revalorizar_servicio_pendiente` (rellena snapshot NULL).
- Validado PG16: cadena v1→v7.7 limpia; F7.7 E2E (T1-T10: especificidad, preview, referencia humana, pendiente≠$0, revalorizar, snapshot inmutable, base total/línea, multimoneda, orden facturable, base aprobada read-only) TODOS PASARON; regresión F1-F7.6 OK; RLS anon-deny en 5 vistas + RPC; 0 dependencia exp_*/frisku_*; JS 105/105; build CI=true. Auditorías §17 filtros / §19 normalización (detalles CURRENT normalizados; snapshot F5 intacto) / §20 vocabulario / §21 formatters (0 toLocale ad-hoc). Revisión visual en vivo pendiente. Ver `docs/proceso-f7-7-acta.md`.

### F7.8 — Certificación Integral (UAT + Visual QA + Design System + Filter Certification) ✅ FUNCTIONAL CERTIFIED · ⛔ VISUAL QA BLOCKED
- Gate de certificación de F1–F7.7 como UN producto (no features). UAT integral (33 pasos + 13 excepciones) mapeada a runtime; regresión F1–F7.7 (13/13); **Filter Certification** (acumulación AND a nivel de datos `proc_v7_8_filter_tests.sql` + helper puro `filtrosActivos` 8 tests + nav-contract); concurrencia consumo (carrera 2-sesiones, 1/1, sin negativo); RLS anon-deny 25/25 vistas + 0 deps exp_*/frisku_*; Design System compliance (0 duplicados/hardcode/capitalize); Visual QA estático (18 pantallas PASS). 4 defectos P2/P3 corregidos (0 P0/P1). JS 113/113; build CI=true.
- **VISUAL QA CERTIFIED = NO/BLOCKED**: revisión en vivo no ejecutable (login + RLS/anon + dev server concurrente); declarado honestamente. Docs: `proceso-f7-8-{acta,uat-matrix,visual-qa,filter-certification,design-system-compliance,defects}.md`.
- Para cerrar visual + UAT productiva: gate de identidad/claim `empresa_id` + maestros reales de Rancagua + recorrido del CFO. No auto-avanzar a F7.9/F8.

Se puede reordenar si el CURRENT lo justifica, pero F7.1 (shell + centro + config) debe ir primero porque habilita todo lo demás y la carga de maestros reales.

## Decisiones (clasificación §30)

**ESTRUCTURALES (requieren detenerse antes de F7.1): NINGUNA.** El discovery no encontró necesidad de cambiar ledger, SoT, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, tenant, RLS, conciliación, snapshot, tarifario, base de cobro ni bounded contexts. El contrato F1–F6 soporta la UI tal como está.

**BACKEND MENOR (read-model/RPC/índice no disruptivo; se materializan en su fase):**
- F7-RM-CENTRO / F7-RM-EXCEPCIONES (F7.1) · F7-RM-GENEALOGIA (F7.4) — vistas/RPC de lectura.
- F7-QC-01 (F7.2) — RPC/trigger de validación de rango QC.
- F7-COR-01 (F7.1/decisión) — RPC de correlativo concurrency-safe.

**UX (sin tocar contrato):**
- F7-PDF-01 — PDF desde snapshot en UI.
- Catálogo de errores, toasts, responsive de planta, componentes base.

**DECISIONES EJECUTIVAS del CFO (no microconsultas):**
1. **Correlativos/códigos:** ¿formato humano de folio y barcode? (habilita F7-COR-01). Recomendación: `TIPO-TEMP-NNNNNN` con secuencia por empresa/temporada.
2. **QC como gate:** ¿QC obligatorio bloquea el ingreso/proceso, o es informativo? (define alcance F7-QC-01).
3. **Barcode/QR:** ¿carga dinámica (CDN, patrón actual) o dependencia npm? (regla 8).
4. **Materiales de embalaje facturables:** ¿en alcance o diferido? (maestro clase D).
5. **Tipos de ubicación** recepción/andén dedicados (UAT-G-01): ¿se agregan al enum?

## Tests de arquitectura (§31) — verificados en el diseño

1. **¿Service opera con cero clientes de Frisku?** **SÍ.** Universo comercial = `proc_vinculo`; sin dependencia de `frisku_*`. Verificado en UAT escenario G.
2. **¿Service presta a Foods sin compartir `exp_*`?** **SÍ.** 0 FK `proc_*`→`exp_*` (UAT escenario H); Foods es cliente vía `proc_vinculo`.
3. **¿Foods podría cambiar de packing sin afectar Service?** **SÍ.** Service no referencia Foods salvo como vínculo cliente opcional; no hay `if cliente==Foods`.
4. **¿Otro procesador podría usar `proc_*`?** **SÍ.** Capability multi-tenant por `empresa_id`; Allegria Service es un tenant, no un hardcode.
5. **¿La UI puede reemplazarse sin cambiar ledger/SoT?** **SÍ.** UI delgada; invariantes en DB. Reemplazar React no toca `proc_movimiento`/vistas/RPC.
6. **¿Dos usuarios concurrentes siguen protegidos aunque la UI falle?** **SÍ.** FOR UPDATE + checks en RPC (UAT escenario L: doble consumo/doble despacho → 1 rechazo, sin negativo). La UI no participa de la protección.

Ninguno da NO → **no hay STOP-AND-REPORT**. Se puede avanzar a F7.1 tras las decisiones ejecutivas.

## Recomendación ejecutiva

Iniciar **F7.1** (shell + Centro de Operaciones + Configuración + carga de maestros reales de Rancagua), en paralelo con las 5 decisiones ejecutivas de arriba (ninguna bloquea el shell). El camino crítico real hacia una planta operando no es más motor: es **UI + datos maestros reales**. El backend F1–F6 ya soporta todo el flujo sin cambios estructurales.

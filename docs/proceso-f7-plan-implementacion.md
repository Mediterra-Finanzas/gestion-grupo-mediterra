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

### F7.4 — PT + Pallets + Bodega + Repaletizaje 🟡 CÓDIGO COMPLETO (runtime pendiente)
- Producto Terminado (materializar desde resultado, sin sobreasignación; PT pendiente; palletizar nuevo/mixto) · Bodega (inventario+filtros) · Detalle de Pallet (saldos+invariante, composición, **genealogía backwards/forwards**, holds, traslado, movimientos) · Repaletizaje N:M (origen→destino→balance).
- Backend menor `schema_proc_v7_4_f7_4.sql`: holds genéricos (`proc_fn_hold_pallet`/`liberar_hold` sobre `proc_hold`), read-models `proc_v_resultado_materializable`/`proc_v_pt_operacional`/`proc_v_pallet_bodega`, `proc_fn_pallet_genealogia`.
- **Build CI=true Compiled successfully + dominio 35/35.** Validación runtime (E2E `proc_v7_4_f7_4_tests.sql` + regresión) **pendiente**: el daemon de Docker no quedó disponible en la sesión. Ver `docs/proceso-f7-4-acta.md §3`.

### F7.5 — Despacho
- Crear → reservar → preparar/listo → confirmar (parcial/múltiple) → reversa. Todo por RPC; transiciones por trigger. Documentos a Storage.

### F7.6 — Resultado de Proceso + PDF + versiones/envíos
- Generar versión (RPC), revisar snapshot, emitir (RPC), **PDF desde snapshot** (F7-PDF-01), destinatarios, registrar envío. CURRENT vs SNAPSHOT explícito.

### F7.7 — Tarifario + Servicios Facturables + Base de Cobro
- Tarifario CRUD + preview `resolver_tarifa`. Generar servicios (RPC). **Bandeja Pendientes de Tarifa.** Base de cobro crear/agregar/aprobar (inmutable).

### F7.8 — UAT UI integral
- Repetir los journeys 1–10 end-to-end en UI, sobre datos reales de Rancagua cargados. Issue log UI. Criterio de aprobación análogo a la UAT backend.

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

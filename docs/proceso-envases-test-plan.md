# PROC-ENVASES-001 · Test plan + decisiones a elevar

Estado: DISEÑO. NO materializado. Este plan se ejecuta cuando se apruebe el modelo y se materialice (PG16 efímero + regresión + tests JS + build).

## Tests de arquitectura ENV-1..14 (B27)

| # | Escenario | Resultado esperado |
|---|---|---|
| ENV-1 | Cliente entrega 100 bins a Service | Movimiento `ingreso` 100; saldo custodia Service = 100 (owner=Cliente). |
| ENV-2 | Service devuelve 40 | Movimiento `devolucion` 40; saldo custodia Service = 60. |
| ENV-3 | Service devuelve otros 60 | Saldo = 0. |
| ENV-4 | Intentar devolver 70 cuando quedan 60 | **Rechazo** (saldo insuficiente); validación backend. |
| ENV-5 | Bins propiedad Productor, Cliente Service distinto | Owner=Productor aunque el contrato sea con la Exportadora/Cliente; saldo atribuido al Productor. |
| ENV-6 | Bins propiedad Service entregados a Productor | Saldo "por devolver a Service" a cargo del Productor (dirección inversa). |
| ENV-7 | Transferencia interna entre ubicaciones | Stock total del tipo/owner NO cambia; cambia solo la ubicación. |
| ENV-8 | Daño de 5 bins | Movimiento `dano` 5; saldo/estado auditable; NO se registra como devolución. |
| ENV-9 | Devolución independiente sin despacho de PT | Movimiento con `ref_tipo=manual`; no exige despacho de fruta. |
| ENV-10 | Mismo tipo de envase, distintos propietarios | Saldos separados por owner; nunca se mezclan. |
| ENV-11 | Dos movimientos concurrentes sobre el saldo final | 1 éxito / 1 rechazo (lock backend); nunca saldo negativo imposible. |
| ENV-12 | Cross-tenant | Acceso a envases de otra empresa → DENY (RLS). |
| ENV-13 | Aislamiento Frisku | 0 dependencia de `frisku_*`/`friskuBI`; ninguna lectura/escritura cruzada. |
| ENV-14 | Foods como Cliente Service | Representado vía `proc_vinculo`, sin `exp_*`; sin padrón paralelo. |

Además (regresión): el ledger de fruta (`proc_movimiento`), conciliación de masa, cierre, QC y Reporting Daily permanecen intactos tras introducir el ledger de envases.

## Decisiones a elevar ENV-D1..D10 (B29) — con recomendación

| ID | Decisión | Recomendación |
|---|---|---|
| **ENV-D1** | Control por cantidad vs serial individual | **Cantidad.** Discovery: 0 columnas serial/barcode en todo `proc_*`. Serializar solo si la planta usa barcode/RFID por unidad → elevar antes de diseñar. |
| **ENV-D2** | Ledger propio de envases | **Sí — `proc_envase_movimiento` append-only**, espejando `trg_block_*`/`trg_audit_*` del ledger de fruta. Saldo derivado, nunca tabla mutable. |
| **ENV-D3** | Propietario vs tenedor/custodio | **Dimensiones separadas.** Owner = `proc_vinculo`; holder derivado del ledger + ubicación. Service como owner: vínculo propio de rol `servicio` (preferido) o convención `owner IS NULL ⇒ Service` (a confirmar). |
| **ENV-D4** | Reutilizar `proc_ubicaciones` | **Reutilizar.** Agregar ubicaciones de envase (ej. "Bodega de envases", "Zona lavado") al maestro existente. No duplicar maestro de ubicación. |
| **ENV-D5** | Estados/condición necesarios | **Mínimo: DAÑO, PÉRDIDA, BAJA** como naturalezas del ledger. Estados extendidos (sucio/lavado/en uso) solo si la operación los pide; no sobre-diseñar. |
| **ENV-D6** | Movimiento independiente de despacho | **Sí.** `ref_tipo=manual` permite retiro/devolución de envases sin despacho de fruta (caso obligatorio B9). |
| **ENV-D7** | Política de saldo negativo | **Prohibido** para naturalezas que consumen saldo; backend lockea y rechaza. Ajustes explícitos (`ajuste_neg`) sí permiten corregir, auditados. |
| **ENV-D8** | Conciliación física ahora vs futuro | **Futuro.** El modelo permite un movimiento de `ajuste` auditable (sistema 30 vs conteo 28 → −2). No se implementa la capability de conciliación en v1. |
| **ENV-D9** | Integración futura con cobros por pérdida/daño | **No acoplar ahora.** Envases no facturables por defecto (B28). El ledger deja trazabilidad para un cobro futuro si se decide. |
| **ENV-D10** | Ubicación del módulo en navegación | **Entrada "Envases" bajo OPERACIÓN/LOGÍSTICA** con sub-tabs (Resumen/Movimientos/Saldos/Config). Evita inflar el sidebar. |

## Fases sugeridas de materialización (cuando se apruebe)

1. **Fase 1 — Catálogo + ledger + saldos**: `proc_tipo_envase`, `proc_envase_movimiento` (append-only, RLS, auditoría), vistas de saldo, maestro Tipos de Envase, pantalla Movimientos + Saldos + Registrar movimiento manual.
2. **Fase 2 — Integración Recepción/Despacho**: secciones opcionales de envases en Nueva Recepción y Despacho; devolución independiente.
3. **Fase 3 — Reportería + Centro + Conciliación**: reporte de envases, tiles en Centro, conciliación física con ajuste auditable; evaluación de compatibilidad con Reporting Daily.

## Gaps / preguntas abiertas para el CFO

- ENV-D1: ¿la planta usa envases serializados (barcode/RFID por unidad)? Si sí, cambia el modelo.
- ENV-D3: ¿Service como owner vía vínculo propio o convención NULL?
- ENV-D9: ¿pérdida/daño deriva en cobro a la contraparte? (define si envases entran a facturación).
- ¿Existe hoy control de envases en planilla/Excel a migrar (carga histórica de saldos iniciales)?

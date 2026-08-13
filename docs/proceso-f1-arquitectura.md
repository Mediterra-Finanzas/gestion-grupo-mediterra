# proc_* — Fase 1: Arquitectura y Fundaciones del Bounded Context

**Capability:** Servicio de Proceso de Fruta Fresca (`proc_*`) · tenant piloto **Allegria Service**
**Fecha:** 2026-08-13 · **Rama de trabajo (aislada):** `worktree-proc-fase1`
**Estado:** ✅ **F1 VALIDATED** (2026-08-13, runtime aislado — ver Acta). SQL **no aplicado a producción** (validado en Postgres efímero; lo aplica el admin a staging/prod tras aprobación). No toca `exp_*`, Frisku, ni la data productiva.
**Fuente:** [`allegria-service-f0-acta-entrega.md`](allegria-service-f0-acta-entrega.md) · [`allegria-service-f0-assessment.md`](allegria-service-f0-assessment.md)

> **⚠️ SUPERSEDED PARCIAL (2026-08-13):** los §6 (identidad) y §7 (inventario) de este documento describen el modelo ORIGINAL. Fueron **reconciliados** con las 17 precisiones ratificadas por el CFO. El modelo vigente está en la **Adenda de Reconciliación** al final + [`proceso-f1-reconciliacion.md`](proceso-f1-reconciliacion.md). Cambios: identidad `proc_partes` → `proc_vinculo` (XOR de FK reales); inventario `kg_disponible` mutable → ledger `proc_movimiento` (SoT) + `proc_hold` + vista; se retira el booleano `custodia`; calibres/colores propios.

> **Regla de Fase 1 (del CFO):** fundaciones correctas, no cantidad de pantallas. Entregable = modelo sólido + constraints + seguridad + estados + tenancy + tests + documentación, antes que diez pantallas sobre un modelo incorrecto.

---

## 1. Arquitectura `proc_*` — bounded context, naming, ownership

- **Bounded context propio**, paralelo a `exp_*` (no derivado). Namespace de tablas `proc_*`; código en `src/proceso/` (patrón `core/ · tabs/ · modales/ · exports/`, aún no creado — F1 es el contrato de datos).
- **Neutral a la capability:** ninguna tabla/columna hardcodea "Allegria Service". Todo scoped por `empresa_id`. Allegria Service es el primer tenant/operador, no el diseño.
- **Ownership:** `proc_*` posee sus registros operacionales; **no** reutiliza tablas `exp_*` ni escribe en otros dominios. Consume maestros corporativos (Core) por **código neutral** y librerías técnicas por reuso de **código** (no de tablas).
- **Prohibido:** flags `es_service`/`es_exportadora`, tablas híbridas, columnas con sentido para una sola empresa, reglas por `empresa_id` que cambien el significado de una entidad.

## 2. Tenant / Seguridad (security by design)

- `empresa_id UUID NOT NULL` en toda tabla operacional; índices por empresa. **Sin FK físico** todavía (excepción tipo EXP-TENANCY-001; el UUID viene del contexto de tenant, **no se hardcodea**). `empresa_id` de Allegria Service documentado en el Acta F0 (`5aa10886…`), leído de Core, no incrustado.
- **RLS desde el día 1** (`schema_proc_v1.sql`): `ENABLE`+`FORCE ROW LEVEL SECURITY`, política productiva `empresa_id = proc_current_empresa()` (lee claim JWT), `REVOKE ALL ... FROM anon`, `GRANT ... TO authenticated`. Deny-by-default.
- **DEV-ONLY separado:** política permisiva de desarrollo en `schema_proc_v1_DEV_ONLY_rls.sql` (archivo aparte, marcado, con rollback, **nunca** en prod/gate) — mientras Core no emite el claim `empresa_id` (EXP-SECURITY-001).
- **Auditoría** (`proc_audit_log` + trigger `proc_fn_audit` en todas las tablas de negocio), `created_by`/`updated_by`/`created_at`/`updated_at` (trigger touch), **soft-delete** `deleted_at` (nunca DELETE físico; Regla 9 / soft delete). Constraints de negocio (no-negativos, coherencia de fechas, kg_neto ≤ kg_bruto, kg_disponible ≤ kg_inicial).

## 3. Maestros propios de `proc_*` (no duplicar corporativos)

- **Propios (mínimos en F1):** `proc_empresa_config` (config de proceso por empresa: moneda de operación por código, unidad de masa, tolerancia de conciliación, flag temporada) y `proc_catalogo_activacion` (qué especies/variedades/unidades/calibres/embalajes corporativos están **activos** para esta empresa de proceso).
- **Corporativos (Core, consumidos por código neutral, NO creados aquí):** especies, variedades, unidades, monedas + TC (`src/currency`), ubicaciones geográficas, identidad de productor/predio. Se referencian por `*_codigo`/`*_ref`, sin FK cross-domain, vía adapter `CatalogoCorporativo` (RO).

## 4. Temporada operacional

- **Decisión F1:** se modela `proc_temporada` como entidad operacional propia con su **máquina de estados** (`planificada → activa → cerrada`; `anulada`), que **referencia** la temporada corporativa por **código** (`"2026/2027"`). Motivo: el proceso necesita estados/fechas operacionales por empresa que el maestro corporativo (solo calendario) no aporta.
- **Abierta (§9 D1):** si Core formaliza una temporada con estados operacionales, `proc_temporada` pasa a ser una relación por FK. Hoy: relación por código.

## 5. Planta / Packing (instalación física)

`proc_planta` soporta los tres requisitos:
- **Múltiples plantas** por empresa (`UNIQUE(empresa_id, codigo)`).
- **Packing de terceros** (`es_terceros` — regla 66).
- **Propietario ≠ operador ≠ tenant:** `propietario_parte_id` (dueño de la infraestructura) y `operador_parte_id` (quien opera físicamente) apuntan a `proc_partes`; el **tenant** (`empresa_id`) es el prestador que usa el sistema. Allegria Service puede operar dentro de infraestructura ajena sin que el modelo lo asuma como propio.

## 6. Relaciones de negocio (roles explícitos; no asumir que coinciden)

Se modela **una parte** (`proc_partes`) + sus **roles** (`proc_parte_roles`), en vez de duplicar entidades por rol. Roles soportados:
`cliente_servicio` · `mandante` (dueño de la fruta) · `productor` · `exportadora` · `operador` · `propietario_infra`.

- **Custodia ≠ propiedad (regla 67):** la recepción distingue `mandante_id` (dueño económico de la fruta) de `cliente_servicio_id` (quien contrata el servicio) y de `productor_id`/`predio_id` (origen/identidad). Ninguno se asume igual a otro.
- **Foods como cliente:** cuando Allegria Foods contrata el servicio, es una `proc_partes` con rol `cliente_servicio` (y/o `exportadora`), **sin** fusionar dominios (integración ⑤ por interfaz, no por tabla compartida).
- Identidad de **productor/predio** proviene de Core; `proc_partes.productor_ref` / `proc_predios` guardan la referencia neutral para trazabilidad SAG/CSG.

## 7. Modelo base de recepción / lote (raíz de trazabilidad)

- `proc_recepcion` es la **raíz de trazabilidad** (custodia, no compra): folio, fecha, temporada, planta, cliente_servicio, mandante, productor, predio, especie/variedad (código), kg bruto/neto, bins, `custodia` (default true), y **máquina de estados** `recibida → en_custodia → en_proceso → procesada → despachada` (+ `anulada`).
- `proc_lote` es la **unidad trazable** que el proceso consumirá (F3). Una recepción rinde **1..N lotes** (split por variedad/calibre/cámara). Lleva `kg_inicial`/`kg_disponible` (nunca negativo; se descuenta al consumir en F3) y estados `activo → en_proceso → consumido → cerrado` (+ `anulado`).
- **Decisión de cardinalidad (§9 D2):** Recepción 1:N Lote (no "lote = recepción"), para permitir split desde el origen conservando genealogía. La genealogía de consumo (lote → proceso, N:M kg/%) se modela en **F3** (`proc_proceso_insumos`), no aquí.

## 8. Auditoría y máquinas de estado base

- Auditoría: `proc_audit_log` (append-only) + trigger `proc_fn_audit` (insert/update/delete → `valor_ant`/`valor_nue` jsonb + usuario del claim). Acción `estado` reservada para transiciones explícitas de máquina de estado (registradas por la capa de aplicación en F1-b).
- Máquinas de estado base definidas por `CHECK` + (en F1-b) validación de transición en la capa DB/JS: **temporada**, **planta**, **recepción**, **lote**, **parte/planta** (activa/inactiva/archivada). Las transiciones válidas se documentan en F1-b junto a la capa de aplicación.

---

## 9. Decisiones abiertas (requieren definición antes de F1-b)

| # | Decisión | Recomendación | Severidad |
|---|---|---|---|
| D1 | Temporada: ¿relación por código a Core o FK cuando Core la formalice? | Por código ahora; FK cuando Core dé estados operacionales | IMPORTANTE |
| D2 | Cardinalidad Recepción↔Lote | **1:N** (recepción rinde varios lotes) | confirmada aquí; ratificar |
| D3 | ¿`proc_predios` propio o referencia pura a Core? | Propio con `productor_ref`/código neutral (trazabilidad SAG/CSG por empresa) | IMPORTANTE |
| D4 | Moneda de operación de Allegria Service | Padrón muestra USD (empresas) vs CLP (contab_empresas) — **confirmar USD** | BLOCKER para tarifario (F9) |
| D5 | ¿`proc_parte_roles` con vigencia (desde/hasta)? | Agregar vigencia en F1-b si un rol cambia en el tiempo | PUEDE DEFINIRSE DESPUÉS |
| D6 | FK físico `empresa_id` → Core | Pendiente de que Core ratifique padrón autoritativo (empresas vs contab_empresas) | heredada (EXP-TENANCY-001) |

## 10. Alcance F1 vs próximo (F1-b y F2+)

- **F1 (este entregable):** contrato de datos de fundaciones (10 tablas `proc_*`) + tenancy + RLS + auditoría + máquinas de estado (CHECK) + config + activación de catálogos + temporada + planta + partes/roles + predios + recepción/lote (raíz de trazabilidad). SQL **para revisión, no aplicado**.
- **F1-b (tras aprobar el contrato de columnas):** capa DB `src/proceso/core/procesoDB.js` con **gate `cargaOkRef` (Regla 9)**, CRUD scoped por `empresa_id`, validación de transiciones de estado, y **tests unitarios** de la lógica pura (conciliación/estados/tenancy) — el runner ya existe (`react-scripts test`).
- **F2+:** QC recepción, inventario pre-proceso, orden de proceso, consumo de lote (genealogía), resultado + conciliación de masa, PT, pallets, repaletizaje, ledger de movimientos, despacho, tarifario/servicios facturables, Resultado de Proceso, dashboard/reportes, integración ⑤ Foods↔Service.

---

## ACTA DE ENTREGA — proc_* FASE 1 (fundaciones, para revisión)

**Archivos creados (en worktree aislado `worktree-proc-fase1`):**
- `supabase/schema_proc_v1.sql` — 10 tablas `proc_*` (audit_log, empresa_config, catalogo_activacion, temporada, planta, partes, parte_roles, predios, recepcion, lote) + funciones (`proc_current_empresa`, `proc_current_user`, `proc_fn_touch`, `proc_fn_audit`) + triggers touch/audit + RLS productiva por empresa.
- `supabase/schema_proc_v1_DEV_ONLY_rls.sql` — política permisiva **DEV-ONLY** separada (con rollback).
- `docs/proceso-f1-arquitectura.md` — este documento.

**Declaraciones:**
- Data productiva modificada: **NO**. Migraciones ejecutadas: **NO**. SQL aplicado a la DB: **NO** (artefacto de diseño; lo aplica el admin tras revisión). Cambios de UI: **NO**. `exp_*`/Frisku tocados: **NO**. Escrituras a Supabase: **NO**.
- Aislamiento: trabajado en **git worktree exclusivo** (`worktree-proc-fase1`), por el incidente de concurrencia de Fase 0. No colisiona con `main`.
- Tenancy: `empresa_id UUID NOT NULL` sin FK físico (excepción aprobada), UUID **no hardcodeado**.
- Seguridad: RLS productiva por empresa desde el inicio; permisividad de desarrollo aislada en archivo DEV-ONLY.

**Validación:** validación **estática** del SQL (conteo de `CREATE TABLE`, balance de delimitadores `$$`, RLS/audit presentes). Ejecución contra DB y tests de la capa JS = **F1-b** (requiere visto bueno al contrato de columnas — los nombres son el contrato).

**Gate para F1-b:** aprobación del contrato de columnas + definición de D4 (moneda) y D1/D3. STOP-AND-REPORT si algo exige cambiar cardinalidades/tenancy/ownership/modelo económico. **No avanzar sin revisión.**

---

## ADENDA DE RECONCILIACIÓN — 2026-08-13 (17 precisiones del CFO)

Este worktree canónico (`55dc61a`) precedía a las 17 precisiones ratificadas. Reconciliación semántica controlada (matriz completa en [`proceso-f1-reconciliacion.md`](proceso-f1-reconciliacion.md)). Sin contradicción arquitectónica nueva: todo alinea al TARGET aprobado.

**Modelo de identidad (supersede §6):** se retiran `proc_partes` / `proc_parte_roles` (eran party master). La identidad corporativa vive en Core (`contab_empresas` grupo, `contab_auxiliares` terceros). `proc_vinculo` guarda **solo la relación operacional** (rol, código externo, contactos, condiciones, vigencia) y referencia la identidad por **XOR de FK reales** (`grupo_empresa_id` | `auxiliar_id` | modo `pendiente_alta_corporativa` con `nombre_provisional`), CHECK exactamente-uno. Productor/predio: identidad Core vía vínculo; `proc_predios` = trazabilidad operacional (CSG), no identidad duplicada.

> **Regla permanente Frisku ≠ Service:** `proc_*` **nunca** usa los maestros operacionales de Frisku (exportadores/clientes/etc.) como source of truth. Identidad puede ser corporativa compartida; la relación operacional NO se comparte — vive en `proc_vinculo`. Ver [`proceso-bounded-context-frisku.md`](proceso-bounded-context-frisku.md) (incluye la revisión read-only F1–F4: cero dependencia funcional de Frisku; solo `PROC-INFRA-001` = config Supabase infra neutral).

**Modelo de inventario (supersede §7):** la fuente de verdad del saldo físico es el **ledger `proc_movimiento`** (append-only: sin `updated_at`/`deleted_at`; UPDATE/DELETE bloqueados por trigger; corrección = reversa/contramovimiento con motivo/actor/referencia al original). Se **retira** `proc_lote.kg_disponible` mutable (era 2ª fuente de verdad). Holds (`proc_hold`: reserva/bloqueo) restringen disponibilidad **sin** mover masa física. Saldo por **vista `proc_v_lote_saldos`** (derivación, sin cache): `disponible = on_hand − bloqueado − reservado`, sin doble descuento. Descarte/merma nacen del **proceso** (F4), no descuentan el lote de MP. RPC transaccionales con `FOR UPDATE` + guardia no-negativo (`proc_fn_registrar_movimiento`/`_ingresar_lote`/`_registrar_consumo`/`_reversar_movimiento`).

**Custodia/propiedad:** se retira el booleano `custodia`. El hecho es `dueno_fruta_vinculo_id`; la custodia es la presencia en el inventario del operador.

**Calibres/colores:** `proc_calibre` / `proc_color` propios de `proc_*`, por especie, con `mapping_estandar` a estándares externos (no catálogo corporativo; Foods y Service no comparten).

**Seguridad:** RLS `FORCE` + `REVOKE anon` (conservado del canónico) + **GO-LIVE BLOCKER** explícito en el SQL. DEV-ONLY separado, extendido a las tablas nuevas.

**Ledger ≠ Auditoría:** `proc_movimiento` (kilos) y `proc_audit_log` (quién/qué) son distintos y ambos presentes.

---

## ACTA DE ENTREGA — proc_* FASE 1 (RECONCILIADA)

**Proyecto:** Allegria Service · **Bounded context:** `proc_*` · **Worktree:** `worktree-proc-fase1`.

**Alcance ejecutado:** reconciliación semántica (matriz de 30 puntos) del canónico `55dc61a` con las 17 precisiones + materialización del modelo reconciliado (schema + DEV-ONLY + capa de dominio/DB + tests).

**Archivos creados/modificados (solo rutas Service):**
- `supabase/schema_proc_v1.sql` — **modificado** (reconciliado): 14 tablas `proc_*` + vista `proc_v_lote_saldos` + 4 RPC transaccionales + funciones/triggers de auditoría, touch y bloqueo de ledger + RLS `FORCE`/`REVOKE anon` + GO-LIVE blocker.
- `supabase/schema_proc_v1_DEV_ONLY_rls.sql` — **modificado** (cubre tablas reconciliadas; ledger sólo SELECT/INSERT).
- `supabase/validation/proc_v1_tests.sql` — **nuevo** (9 tests negativos SQL; requiere schema aplicado).
- `src/proceso/core/procesoDomain.js` — **nuevo** (lógica pura: saldo derivado, XOR, consumo, reversa, holds, conciliación).
- `src/proceso/core/procesoDomain.test.mjs` — **nuevo** (27 asserts; **PASAN**).
- `src/proceso/core/procesoDB.js` — **nuevo** (capa DB relacional con gate Regla 9; RPC wrappers).
- `docs/proceso-f1-reconciliacion.md` — **nuevo** (matriz). `docs/proceso-f1-arquitectura.md` — **modificado** (esta adenda).

**Estado: ✅ VALIDATED (runtime aislado, 2026-08-13).**

**Validación runtime (Postgres 16 efímero en Docker, sin tocar producción; contenedores desmontados):**
- Schema `schema_proc_v1.sql` aplica **limpio** con `ON_ERROR_STOP=1` (stubs mínimos `contab_empresas`/`contab_auxiliares` + roles `anon`/`authenticated`).
- `schema_proc_v1_DEV_ONLY_rls.sql` aplica limpio.
- `proc_v1_tests.sql` (9 tests negativos): **TODOS PASARON** — XOR de identidad, kg≤0, neto>bruto, cantidad≤0, ledger UPDATE/DELETE bloqueados (append-only), consumo>disponible rechazado, saldo derivado del ledger correcto (disponible=7000 tras consumo de 3000/10000).
- **RLS productiva** (sin DEV-ONLY): `authenticated` sin claim → **0 filas** (deny-by-default); con claim empresa A → 1 fila; con claim empresa B → **0 filas** (aislamiento cross-tenant efectivo).
- **Tests de dominio (node)**: **27/27 PASAN**.

**Build:** no ejecutado en el worktree (aislado, sin `node_modules`; módulos aditivos aún no importados por la app). Sintaxis validada: `procesoDomain.js` OK, `procesoDB.js` OK (ESM).
**Schema:** DRAFT — **NO aplicado** a la DB. **Migraciones ejecutadas:** NO.
**Data modificada:** NO. **Escrituras a Supabase productiva:** NO (solo lectura del padrón en F0 para verificar `empresa_id`).
**Cross-project changes:** NINGUNO. No se tocó `exp_*`, Frisku, Osiris, Foods, ni `main`.
**Seguridad/RLS:** política productiva por empresa (`FORCE`, deny-by-default); DEV-ONLY separado; GO-LIVE blocker documentado.
**Deuda técnica:** EXP-TENANCY-001 (FK físico `empresa_id`, owner Core), EXP-SECURITY-001 (claim `empresa_id`, owner Core), PROC-INFRA-001 (`SUPA_KEY` referenciada de `friskuHelpers`; mover a config neutral compartido).
**Estado Git:** worktree `worktree-proc-fase1`; commit atómico exclusivo Service (formato `service:`).
**Recomendación F2:** QC + inventario pre-proceso + orden de proceso + consumo (genealogía `proc_proceso_insumos`) + resultado/conciliación, todo **extendiendo** el ledger (no reemplazándolo).

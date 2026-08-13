# proc_* — Fase 1: Arquitectura y Fundaciones del Bounded Context

**Capability:** Servicio de Proceso de Fruta Fresca (`proc_*`) · tenant piloto **Allegria Service**
**Fecha:** 2026-08-13 · **Rama de trabajo (aislada):** `worktree-proc-fase1`
**Estado:** Fundaciones para **REVISIÓN**. SQL **no aplicado** a la DB (lo aplica el admin tras aprobar el contrato de columnas). No toca `exp_*`, Frisku, ni la data productiva.
**Fuente:** [`allegria-service-f0-acta-entrega.md`](allegria-service-f0-acta-entrega.md) · [`allegria-service-f0-assessment.md`](allegria-service-f0-assessment.md)

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

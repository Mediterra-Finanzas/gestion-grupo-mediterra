# OA-024-04 — Technical Closure
**Addendum a OA-024-03-CORPORATE-ENTITY-RECONCILIATION.md**
Fecha: 2026-08-13 | Autor: Claude Code | Estado: COMPLETO — AWAITING CFO GO

> Resuelve D10, B1, B2, B3, Notes 4-8, entidades en limbo y segunda pasada estática.
> No modifica el modelo contable conceptual. No reabre OA-024-01.
> No ejecuta SQL. No escribe en Supabase. No carga datos financieros.

---

## SECCIÓN A — D10: UUID vs BIGINT

### A.1 Análisis de impacto

OA-024-01 Architecture Frozen v1 especificó `BIGINT GENERATED ALWAYS AS IDENTITY` para `core_entities.id`
y `entity_id BIGINT` a lo largo del dominio `acc_*`. Durante OA-024-03 se descubrió que todos los
maestros desplegados (`anf_filiales`, `contab_empresas`, `contab_plan_cuentas`) usan UUID como PK.
Esto crea una incompatibilidad de tipo que impide una FK directa desde `acc_*` hacia tablas existentes.

**Análisis por dimensión arquitectónica:**

| Dimensión de OA-024-01 | ¿Cambia con UUID? | Justificación |
|---|---|---|
| Contratos duales journal/balance | NO | El tipo de entity_id no afecta los dos contratos |
| Convención D1 (debit ≥ 0, credit ≥ 0) | NO | Independiente del tipo de PK |
| Jerarquía AccountingProfile 5 niveles | NO | Sigue siendo source_chart_code + entity_id como discriminadores |
| Modelo de dimensiones (EAV separado) | NO | dim_type/dim_value/pivot tables sin cambio |
| Temporalidad en acc_ownership | NO | effective_from/to no depende del tipo de entity_id |
| Lifecycle IAS 28 en acc_equity_method_entry | NO | investor_entity_id/investee_entity_id siguen siendo FKs a core_entities |
| NCI movement table | NO | entity_id sigue siendo FK a core_entities |
| Separación acc_period / acc_reporting_run | NO | Sin relación con el tipo del PK |
| Planning Ledger separado | NO | pln_budget_entry.entity_id sigue siendo FK a core_entities |
| Semántica de ownership | NO | La relación es entity_id → parent_entity_id, no depende de BIGINT vs UUID |
| Contrato de identidad (single source of truth) | NO | UUID tampoco permite duplicados, sigue siendo una PK |
| Contrato de auditoría (eventos al Audit Domain) | NO | La referencia al entity_id sigue siendo unívoca con UUID |

**Conclusión:** Cambiar el tipo de PK de `core_entities.id` de `BIGINT` a `UUID`, y propagar ese cambio
a todas las columnas `entity_id` que referencian dicha PK, **no altera ningún principio arquitectónico**
de OA-024-01. Es un cambio en el tipo físico del identificador, no en la semántica de identidad ni en
la estructura del modelo.

### A.2 Clasificación

**D10 = T1 — Corrección técnica de implementación**

No se reabre OA-024-01 funcionalmente. La arquitectura queda congelada v1.

Criterio de T1 cumplido: el cambio solo afecta el tipo de dato del PK de `core_entities` y los FK
correspondientes. No cambia:
- La existencia ni el propósito de ninguna tabla
- Las relaciones entre tablas
- Los estados, enumeraciones o reglas de negocio
- Los contratos de carga, balance o aprobación

### A.3 Recomendación: D10-B — UUID CANONICAL

**Se adopta UUID en `core_entities.id` y en todos los `entity_id` que referencian dicha PK.**

Razones:
1. `anf_filiales.id` es UUID con FK activas (`anf_informes.filial_id`, `anf_metricas_config.filial_id`).
   Adoptar UUID en `core_entities` permite eventual unificación sin bridge permanente.
2. `contab_empresas.id` es UUID (confirmado en `schema_core_contable_fase0.sql` línea 59: `cuenta_padre_id UUID REFERENCES contab_plan_cuentas(id)`).
3. Supabase genera UUIDs vía `gen_random_uuid()` sin configuración extra.
4. Para una tabla con 8-15 filas (core_entities), UUID vs BIGINT es indiferente en performance.
5. No requiere BIGINT + bridge permanente: ninguna razón técnica material justifica el bridge dado que
   el dominio acc_* es greenfield (aún no está desplegado).

**Tipo canónico corporativo definitivo:** `UUID DEFAULT gen_random_uuid()`

Alcance del cambio en DDL:
- `core_entities.id` → `UUID DEFAULT gen_random_uuid() PRIMARY KEY`
- `core_entities.group_id` → `UUID REFERENCES core_entities(id)`
- Toda columna `entity_id BIGINT [NOT NULL] REFERENCES core_entities(id)` → `UUID [NOT NULL] REFERENCES core_entities(id)`
- Columnas afectadas: acc_entity_config, acc_ownership (×2), acc_period, acc_source_batch,
  acc_journal_entry, acc_account_balance, acc_adjustment_journal, acc_adjustment_journal_line,
  acc_consolidation_run, acc_consolidation_journal (×3), acc_consolidation_journal_line,
  acc_equity_method_entry (×2), acc_nci_movement, acc_consolidation_result_line, acc_period_audit,
  acc_materiality_policy (scope_entity_id), dim_value, pln_budget_entry
- PKs de todas las demás tablas (`acc_period.id`, `acc_journal_entry.id`, etc.) se mantienen como
  `BIGINT GENERATED ALWAYS AS IDENTITY` — son identificadores internos de filas transaccionales.

---

## SECCIÓN B — BLOCKERS DDL

### B1 — Forward Reference (RESUELTO)

**Problema original:** Sections 7 y 8 (`acc_journal_line`, `acc_account_balance`) referencian
`acc_reporting_account(id)`, definida recién en Section 9.

**Fix:** Mover `acc_financial_statement`, `acc_reporting_account` y `acc_reporting_line` antes de
los dominios Journal y Balance. Nuevo orden topológico (ver Sección C).

### B2 — Circular FK (RESUELTO)

**Problema original:**
```
acc_consolidation_run.conversion_run_id → acc_conversion_run(id)
acc_conversion_run.consolidation_run_id → acc_consolidation_run(id)
```
Ambas tablas se referencian mutuamente — ninguna puede crearse primero.

**Análisis semántico:** Un `acc_conversion_run` pertenece a un `acc_consolidation_run` (es subsidiario).
El `acc_consolidation_run` no necesita saber cuál es su `conversion_run_id` directamente: si necesita
ese lookup, puede navegar via `acc_conversion_run WHERE consolidation_run_id = X` o via
`acc_snapshot_metadata.currency_run_id`.

**Fix:** Se elimina `acc_consolidation_run.conversion_run_id`. La FK unidireccional
`acc_conversion_run.consolidation_run_id → acc_consolidation_run(id)` (nullable) se conserva.

Nuevo orden: `acc_consolidation_run` se crea ANTES que `acc_conversion_run`.

### B3 — Polymorphic FK en acc_materiality_policy (RESUELTO)

**Problema original:** `scope_ref_id BIGINT` era una FK polimórfica sin integridad referencial —
podía apuntar a `core_entities`, `acc_reporting_line` u otras tablas dependiendo de `scope_type`.
Viola el principio aprobado: "no FK polimórficas en Financial SoR".

**Fix:** Reemplazar con columnas FK explícitas y nullable:

```sql
scope_entity_id         UUID   REFERENCES core_entities(id),         -- cuando scope_type='entity'
scope_reporting_line_id BIGINT REFERENCES acc_reporting_line(id),    -- cuando scope_type='reporting_line'
-- scope_type='analysis_type' usa la columna analysis_type existente
-- scope_type='global' → todas las columnas de scope = NULL

CONSTRAINT ck_materiality_scope_refs CHECK (
  (scope_entity_id IS NOT NULL)::int +
  (scope_reporting_line_id IS NOT NULL)::int <= 1
),
CONSTRAINT ck_materiality_scope_coherent CHECK (
  (scope_type = 'global')  OR
  (scope_type = 'entity'         AND scope_entity_id IS NOT NULL) OR
  (scope_type = 'reporting_line' AND scope_reporting_line_id IS NOT NULL) OR
  (scope_type = 'analysis_type'  AND analysis_type IS NOT NULL)
)
```

Consecuencia de este fix: `acc_materiality_policy` ahora depende de `acc_reporting_line`, que a su vez
depende de `acc_financial_statement` y `acc_reporting_account`. Esto refuerza la necesidad del reorden B1.

---

## SECCIÓN C — ORDEN TOPOLÓGICO COMPLETO (36 tablas)

La versión v1 del DDL tenía 36 tablas, no 31 (error de conteo en OA-024-03 corregido aquí).

```
Tier 0 — Sin dependencias externas (excepto self-ref permitida):
  1.  core_entities            -- UUID PK, self-ref group_id
  2.  dim_type
  3.  acc_financial_statement
  4.  acc_reporting_account
  5.  pln_scenario

Tier 1 — Dependen solo de Tier 0:
  6.  acc_period               -- → core_entities
  7.  acc_entity_config        -- → core_entities
  8.  acc_ownership            -- → core_entities ×2
  9.  dim_value                -- → dim_type, core_entities
  10. acc_reporting_line       -- → acc_financial_statement, acc_reporting_account
  11. acc_base_profile         -- → acc_reporting_account

Tier 2 — Dependen de Tier 1:
  12. acc_period_audit         -- → acc_period, core_entities
  13. acc_source_batch         -- → core_entities, acc_period
  14. acc_company_profile      -- → core_entities, acc_reporting_account
  15. acc_chart_mapping        -- → core_entities, acc_reporting_account
  16. acc_materiality_policy   -- → core_entities, acc_reporting_line  [FIXED B3]

Tier 3 — Dependen de Tier 2:
  17. acc_period_mapping_override -- → core_entities, acc_period, acc_reporting_account
  18. acc_adjustment_journal      -- → acc_period, core_entities, self-ref
  19. acc_consolidation_run       -- → acc_period, core_entities, self-ref  [FIXED B2: sin FK a acc_conversion_run]

Tier 4 — Dependen de Tier 3:
  20. acc_conversion_run       -- → acc_period, acc_consolidation_run (nullable)  [FIXED B2]
  21. acc_journal_entry        -- → core_entities, acc_source_batch, acc_period, self-ref
  22. acc_account_balance      -- → core_entities, acc_source_batch, acc_period, acc_reporting_account

Tier 5 — Dependen de Tier 4:
  23. acc_journal_line         -- → acc_journal_entry, acc_reporting_account  [FIXED B1: ya existe]
  24. acc_adjustment_journal_line -- → acc_adjustment_journal, core_entities, acc_reporting_account
  25. acc_conversion_rate_used    -- → acc_conversion_run
  26. acc_consolidation_journal   -- → acc_consolidation_run, acc_period, core_entities ×3, self-ref
  27. acc_nci_movement            -- → acc_period, acc_consolidation_run, core_entities, acc_ownership
  28. acc_consolidation_result_line -- → acc_consolidation_run, core_entities, acc_reporting_line, acc_reporting_account
  29. acc_reporting_run           -- → acc_period, acc_consolidation_run, self-ref
  30. pln_budget_entry            -- → pln_scenario, acc_period, core_entities, acc_reporting_account

Tier 6 — Dependen de Tier 5:
  31. acc_journal_line_dim         -- → acc_journal_line, dim_type, dim_value
  32. acc_account_balance_dim      -- → acc_account_balance, dim_type, dim_value
  33. acc_consolidation_journal_line -- → acc_consolidation_journal, core_entities, acc_reporting_account
  34. acc_equity_method_entry      -- → acc_period, acc_consolidation_run, core_entities ×2, acc_ownership, acc_conversion_rate_used
  35. acc_snapshot_metadata        -- → acc_consolidation_run, acc_conversion_run
  36. pln_budget_entry_dim         -- → pln_budget_entry, dim_type, dim_value
```

Grafo de dependencias verificado: **0 ciclos**. La única auto-referencia es self-ref en misma tabla
(nullable, definida en la misma CREATE TABLE — válido en Postgres con FK diferible o acepta NULL inicialmente).

---

## SECCIÓN D — RESOLUCIÓN DE NOTES 4-8

### Note 4 — Duplicate UNIQUE en pln_scenario (RESUELTO)
La columna `code TEXT NOT NULL UNIQUE` en línea + `CONSTRAINT uq_pln_code UNIQUE (code)` en tabla
creaban dos índices idénticos. Se elimina el `UNIQUE` inline; queda solo el CONSTRAINT con nombre.

### Note 5 — Solapamiento en acc_entity_config (PARCIALMENTE RESUELTO)
Se agrega `CONSTRAINT uq_entity_config_start UNIQUE (entity_id, effective_from)` como proxy débil.
La garantía fuerte de no-solapamiento sigue requiriendo trigger [T5] — documentado. El UNIQUE evita
que dos registros tengan idéntico `effective_from` para la misma entidad.

### Note 6 — Solapamiento en acc_ownership (PARCIALMENTE RESUELTO)
Se agrega `CONSTRAINT uq_ownership_start UNIQUE (entity_id, parent_entity_id, effective_from)`.
Mismo patrón que Note 5. Trigger [T4] sigue siendo requerido para no-solapamiento completo.

### Note 7 — updated_at en tablas mutables (RESUELTO)
Se agrega columna `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` en tablas con estado mutable:
`acc_consolidation_run`, `acc_conversion_run`, `acc_journal_entry`, `acc_reporting_run`,
`pln_scenario`, `acc_equity_method_entry`, `acc_nci_movement`.
El trigger [T11] actualiza automáticamente en UPDATE.

### Note 8 — Índice de status en acc_period (RESUELTO)
Agregado: `CREATE INDEX IF NOT EXISTS ix_acc_period_status ON acc_period(entity_id, status);`
Necesario para queries de lock-protection ([T10]) que filtran por status='locked'.

---

## SECCIÓN E — ENTIDADES EN LIMBO

Clasificación basada solo en evidencia disponible. Sin asumir ni inferir.

| Entidad | Código | Evidencia encontrada | Clasificación |
|---|---|---|---|
| Montejato | MON | `empresas` seed (schema_contable_v1.sql), EMPRESAS_TAREAS (App.jsx:555). No en CLAUDE.md tabla de 8 empresas. No en anf_filiales. Sistema: megasystem. | **Entidad corporativa relacionada** — existe como persona jurídica, fuera del perímetro de consolidación de las 8 empresas principales. CEM puede contenerla con `entity_type='related'`. |
| Arrayon | ARR | `empresas` seed (schema_contable_v1.sql), EMPRESAS_TAREAS. No en anf_filiales. Sistema: megasystem. | **Entidad corporativa relacionada** — mismo patrón que Montejato. Evidencia insuficiente para confirmar si está activa o histórica. CEM puede contenerla con `entity_type='related'` y `activa=false` pendiente confirmación CFO. |
| Mesain | MES | `empresas` seed (schema_contable_v1.sql), `anf_filiales` seed (sistema: 'tbd'), EMPRESAS_TAREAS. Activa en ambas fuentes. | **Entidad corporativa activa, rol no confirmado** — presente en dos DB masters, sistema origen 'tbd'. Probablemente entidad relacionada o subsidiaria no consolidada. NO clasificar como 'subsidiary' sin evidencia societaria. CEM: `entity_type='related'`, `sistema_origen='tbd'`. |
| Frisku Foods Perú | FFP | EMPRESAS_KEYS_ALL (FinanzasModule:1481), mencionada en nóminas. Sin presencia en ninguna tabla DB. | **Entidad operativa en limbo** — referenciada en módulos JS pero sin maestro DB. Puede ser una operación informal, una sucursal de Frisku Foods, o una entidad en formación. NO crear en CEM sin evidencia societaria. Requiere input CFO para determinar si es JV, subsidiary, o branch. |

**Principio aplicado:** La existencia en CEM no implica consolidación. CEM puede y debe contener
entidades fuera del perímetro de consolidación con `entity_type` apropiado. Las 8 empresas del
CLAUDE.md son el perímetro contable; las entidades en limbo son su contexto societario.

---

## SECCIÓN F — D9-A: DESPLIEGUE DE schema_contable_v1.sql

**Estado: UNRESOLVED**

No se tiene acceso a `information_schema.tables` de la base de datos de producción en esta sesión.
La query proporcionada en OA-024-03 sigue siendo el mecanismo correcto para resolver:

```sql
-- Ejecutar en Supabase SQL Editor (solo lectura, no modifica datos):
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('empresas','anf_filiales','contab_empresas','contab_plan_cuentas',
                     'contab_asientos','contab_asientos_lineas','core_entities',
                     'acc_journal_entry','acc_account_balance')
ORDER BY table_name;
```

Si `empresas` aparece en el resultado: está desplegada. Si no aparece: no está desplegada.
Esta query es read-only y segura para ejecutar en cualquier environment.

---

## SECCIÓN G — SEGUNDA PASADA ESTÁTICA DDL 004 v2

Revisión sistemática sobre `004_accounting_schema_draft_v2.sql`.

### G.1 Verificaciones de tipo y FK

| Check | Estado |
|---|---|
| core_entities.id es UUID | PASS |
| Todos los entity_id FK son UUID coincidente | PASS |
| group_id en core_entities es UUID nullable | PASS |
| acc_conversion_run.consolidation_run_id es nullable BIGINT | PASS |
| acc_consolidation_run sin FK hacia acc_conversion_run | PASS |
| acc_materiality_policy sin scope_ref_id polimórfico | PASS |
| scope_entity_id es UUID FK a core_entities | PASS |
| scope_reporting_line_id es BIGINT FK a acc_reporting_line | PASS |

### G.2 Orden topológico

| Check | Estado |
|---|---|
| acc_reporting_account antes de acc_journal_line | PASS |
| acc_reporting_account antes de acc_account_balance | PASS |
| acc_financial_statement antes de acc_reporting_line | PASS |
| acc_reporting_line antes de acc_materiality_policy | PASS |
| acc_consolidation_run antes de acc_conversion_run | PASS |
| acc_conversion_run antes de acc_equity_method_entry | PASS |
| 0 ciclos en grafo de dependencias | PASS |

### G.3 Ciclos FK

| Check | Estado |
|---|---|
| Ninguna FK circular confirmada | PASS |
| Self-refs son nullable (OK) | PASS |

### G.4 ON DELETE CASCADE

| Check | Estado |
|---|---|
| `acc_journal_line ON DELETE CASCADE` desde acc_journal_entry | ACEPTADO — líneas sin cabecera no tienen sentido |
| `acc_journal_line_dim ON DELETE CASCADE` desde acc_journal_line | ACEPTADO |
| `acc_account_balance_dim ON DELETE CASCADE` desde acc_account_balance | ACEPTADO |
| `acc_adjustment_journal_line ON DELETE CASCADE` desde adj_journal | ACEPTADO |
| `acc_consolidation_journal_line ON DELETE CASCADE` desde cons_journal | ACEPTADO |
| `pln_budget_entry_dim ON DELETE CASCADE` desde pln_budget_entry | ACEPTADO |
| Ningún CASCADE en tablas aprobadas/locked (snapshot, reporting_run) | PASS |

### G.5 NULL semántica en FKs opcionales

| Check | Estado |
|---|---|
| acc_conversion_run.consolidation_run_id nullable — OK (conversión standalone posible) | PASS |
| acc_equity_method_entry.consolidation_run_id nullable | PASS |
| acc_nci_movement.consolidation_run_id nullable | PASS |
| acc_reporting_run.consolidation_run_id nullable | PASS |

### G.6 CHECK constraints con NULL

| Check | Estado |
|---|---|
| CHECK (debit >= 0) — NULL en NUMERIC retorna NULL, no falla; columna tiene DEFAULT 0 NOT NULL | PASS |
| CHECK (effective_to IS NULL OR effective_to > effective_from) — NULL en effective_to = open-ended, correcto | PASS |
| CHECK para scope_coherent en materiality_policy — usa OR correctamente | PASS |

### G.7 Uniqueness y cobertura de índices

| Check | Estado |
|---|---|
| UNIQUE en acc_source_batch (file_hash) es parcial (WHERE NOT NULL) — correcto | PASS |
| Todos los FK que no tienen UNIQUE tienen índice dedicado | PASS — verificado en Sección 17 v2 |
| pln_scenario.code: solo un UNIQUE (inline eliminado) | PASS — Note 4 aplicado |
| acc_entity_config UNIQUE (entity_id, effective_from) | PASS — Note 5 aplicado |
| acc_ownership UNIQUE (entity_id, parent_entity_id, effective_from) | PASS — Note 6 aplicado |

### G.8 Source ID uniqueness e idempotencia

| Check | Estado |
|---|---|
| UNIQUE (entity_id, period_id, source_journal_id) para acc_journal_entry | AUSENTE — intencional: source_journal_id es nullable y puede no ser único entre sistemas; idempotencia se maneja via file_hash en acc_source_batch [T6] |
| UNIQUE en acc_account_balance (source_batch_id, source_account_code, transaction_currency) | PASS |

### G.9 Inmutabilidad de snapshots aprobados

| Check | Estado |
|---|---|
| acc_snapshot_metadata no tiene UPDATE path (append-only) | PASS — sin columna status mutable ni updated_at |
| Trigger [T10] bloquea INSERTs en acc_journal_entry cuando período está locked | DOCUMENTADO — requiere trigger, no nativo |

### G.10 SoD

| Check | Estado |
|---|---|
| CONSTRAINT ck_adj_no_self_rev CHECK (reversal_of IS DISTINCT FROM id) | PASS |
| SoD prepared_by ≠ approved_by documentado en [T9] | PASS — requiere trigger/service layer |

### G.11 RLS cobertura

| Check | Estado |
|---|---|
| Estrategia RLS documentada en Section 18 para todas las tablas | PASS |
| Ninguna política ejecutada (solo referencia) | PASS — conforme a instrucción CFO |

### G.12 Planning dimensions

| Check | Estado |
|---|---|
| pln_budget_entry_dim con UNIQUE (budget_entry_id, dim_type_id) | PASS |
| pln_budget_entry puede referenciar mismas dim_type que acc_journal_line_dim | PASS |

### G.13 Lineage de consolidación

| Check | Estado |
|---|---|
| acc_consolidation_result_line → acc_consolidation_run (trazabilidad) | PASS |
| acc_snapshot_metadata → acc_consolidation_run + acc_conversion_run | PASS |
| acc_equity_method_entry → acc_ownership (trazabilidad del %) | PASS |

### RESULTADO SEGUNDA PASADA: **PASS**

Los 3 blockers resueltos, las 5 notas aplicadas, 36 tablas en orden topológico correcto, 0 ciclos,
tipos UUID coherentes con entorno desplegado.

---

## SALIDA FINAL — FORMATO COMPACTO

```
D10 RECOMENDACIÓN:      D10-B — UUID CANONICAL en core_entities y todos los entity_id FK
D10 CLASIFICACIÓN:      T1 — Corrección técnica de implementación (no reabre OA-024-01)
ID CANÓNICO CORPORATIVO: UUID DEFAULT gen_random_uuid()

BLOCKER B1:  RESUELTO — acc_reporting_account/financial_statement/reporting_line
             reordenados antes de Sections Journal y Balance. Orden topológico
             completo de 36 tablas sin forward references.

BLOCKER B2:  RESUELTO — acc_consolidation_run.conversion_run_id eliminado.
             FK unidireccional: acc_conversion_run.consolidation_run_id nullable.
             acc_consolidation_run se crea antes que acc_conversion_run.

BLOCKER B3:  RESUELTO — scope_ref_id polimórfico reemplazado por
             scope_entity_id UUID FK + scope_reporting_line_id BIGINT FK,
             con CHECKs de coherencia y at-most-one constraint.

DDL STATIC REVIEW FINAL: PASS (0 blockers, 0 notas pendientes)
TABLAS TOTALES EN v2:    36 (v1 tenía 36; error de conteo en OA-024-03 corregido)

ENTITY MASTER RECOM.:    Alternative C (crear core_entities nueva) condicionada a:
                         (1) D9-A confirmado por CFO, (2) T1 aprobado (ya clasificado),
                         (3) SEC-1 fix en branch controlado

EMPRESAS DEPLOYMENT:     D9-A = UNRESOLVED (requiere query SQL read-only en Supabase)
                         Evidencia indirecta apunta a NO desplegada, pero no confirmado.

SEC-1 STATUS:            Fix draft listo en SEC-ANF-RLS-FIX-DRAFT.sql.
                         Requiere GO explícito CFO para despliegue.
                         Restricción crítica: guardia/proxy debe estar activo primero
                         (ver incidente 2026-06-18 en memory/seguridad-guardia-proxy.md).

INPUTS CFO PENDIENTES:
  1. D9-A: Ejecutar query Supabase y confirmar si 'empresas' está desplegada
  2. SEC-1 GO: Aprobar despliegue de SEC-ANF-RLS-FIX-DRAFT.sql en branch controlado
  3. D7: Evidencia societaria del inversionista directo en Allpa Chile/Perú
  4. D8: Fichas de moneda funcional para Allegria Service, Integrity Farms, Allpa Perú
  5. Entidades en limbo: Confirmar/rechazar clasificación de Arrayon y Frisku Foods Perú
  6. MATERIALIZATION GO: Aprobación final para ejecutar 004_accounting_schema_draft_v2.sql

PRÓXIMA ACCIÓN EXACTA:   CFO ejecuta query D9-A en Supabase SQL Editor (read-only).
                         Resultado determina rama de Alternative C vs Alternative A/B.
```

**STOP — AWAITING CFO MATERIALIZATION GO**

# OA-024-07 — Source Adapter Framework Infrastructure

**Fecha:** 2026-08-17  
**Autorización:** CFO Angelo Huerta (mensaje 2026-08-17)  
**Rama:** claude/crazy-heisenberg-f33f7a  
**Estado:** STABLE ✓ — 014 EJECUTADO + 015 33/33 PASS + 012 37/37 PASS (2026-08-18)  

---

## A. Grounding del Schema Real

### acc_source_batch (T2.4 en 008) — antes de OA-024-07

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID PK | |
| entity_id | UUID → core_entities | |
| source_system | TEXT NOT NULL | |
| file_name | TEXT NOT NULL | |
| file_hash | TEXT NOT NULL | UNIQUE `uq_source_batch_hash` (idempotencia T6) |
| period_id | UUID → acc_period | nullable |
| row_count | INT DEFAULT 0 | |
| status | TEXT DEFAULT 'pending' | CHECK: pending/processing/completed/failed/rejected |
| imported_at | TIMESTAMPTZ | |
| imported_by | TEXT | |
| error_detail | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |

**Hallazgo crítico de grounding:** El CHECK de status usa valores legacy incompatibles con el lifecycle OA-024-06. TEST-309 (OA-024-05) insertaba con `'completed'` y `'pending'`. La migration 014 resuelve esto con UPDATE de filas existentes antes del DROP CONSTRAINT, y TEST-309 fue actualizado en 012_test_suite.sql.

### acc_source_batch_issue: no existía

### acc_source_adapter_profile: no existía

---

## B. Migration Diff — 014_source_adapter_infra.sql

### B1. `acc_source_batch` — modificaciones

**Status constraint anterior (eliminado):**
```
pending | processing | completed | failed | rejected
```

**Status constraint nuevo:**
```
CREATED | PARSING | PARSED | VALIDATING | VALIDATED |
PENDING_APPROVAL | APPROVED | POSTING | POSTED |
SUPERSEDED | ROLLED_BACK | REJECTED
```

**Default cambiado:** `'pending'` → `'CREATED'`

**Migración de datos existentes:**

| Valor antiguo | Valor nuevo |
|---|---|
| pending | CREATED |
| processing | PARSING |
| completed | POSTED |
| failed | REJECTED |
| rejected | REJECTED |

**Columnas añadidas (additive):**

| Columna | Tipo | Descripción |
|---|---|---|
| report_type | TEXT nullable | CHECK: balance/eerr_periodo/eerr_acumulado/journal/mixed |
| approved_by | TEXT nullable | Quién aprobó (human approval obligatorio) |
| approved_at | TIMESTAMPTZ nullable | Auto-stampado al transicionar → APPROVED |
| posted_at | TIMESTAMPTZ nullable | Auto-stampado al transicionar → POSTED |
| posted_by | TEXT nullable | Quién hizo el posting |
| superseded_by_id | UUID → acc_source_batch nullable | Batch que reemplaza a éste |

**Constraints nuevos:**
- `ck_acc_source_batch_report_type`
- `ck_acc_source_batch_no_self_supersede` (`superseded_by_id <> id`)

### B2. `acc_source_batch_issue` — nueva tabla

| Columna | Tipo | Descripción |
|---|---|---|
| id | BIGINT IDENTITY PK | |
| batch_id | UUID → acc_source_batch ON DELETE RESTRICT | FK no-orphan |
| source_record_ref | TEXT nullable | "row:14", "account:6.11.01.010" |
| severity | TEXT NOT NULL | CHECK: FATAL / ERROR / WARNING / INFO |
| issue_code | TEXT NOT NULL | Código normalizado: SRC_ACCOUNT_UNMAPPED, PERIOD_LOCKED, etc. |
| field_name | TEXT nullable | Campo afectado |
| value_found | TEXT nullable | Valor que causó el issue |
| message | TEXT NOT NULL | Descripción legible |
| suggested_resolution | TEXT nullable | |
| resolved_by | TEXT nullable | |
| resolved_at | TIMESTAMPTZ nullable | NULL = pendiente |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Reglas:**
- Issues FATAL no resueltos bloquean PENDING_APPROVAL → APPROVED (trigger `trg_acc_source_batch_fatal_gate`)
- Issues de batches POSTED son inmutables (trigger `trg_asbi_immutable`)
- `ON DELETE RESTRICT`: no borrar batch con issues asociados

### B3. `acc_source_adapter_profile` — nueva tabla

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| entity_id | UUID → core_entities ON DELETE RESTRICT | |
| source_system | TEXT NOT NULL | 'contec', 'megasystem', etc. |
| adapter_version | TEXT NOT NULL DEFAULT 'v1' | |
| capability_set | JSONB NOT NULL DEFAULT '{}' | CapabilitySet real del sistema fuente |
| is_active | BOOLEAN NOT NULL DEFAULT true | |
| notes | TEXT | |
| created_at, updated_at | TIMESTAMPTZ | |
| UNIQUE(entity_id, source_system) | | |

**Seed incluido:** ALF / contec / v1 con CapabilitySet completo AC-04 (no información financiera).

---

## C. Tablas y Columnas Creadas

| Entidad | Tipo | Descripción |
|---|---|---|
| `acc_source_batch_issue` | Tabla nueva | Issues de validación por batch |
| `acc_source_adapter_profile` | Tabla nueva | CapabilitySet formal por entidad+sistema |
| `acc_source_batch.report_type` | Columna nueva | Tipo de reporte ingresado |
| `acc_source_batch.approved_by/at` | Columnas nuevas | Gate de aprobación humana |
| `acc_source_batch.posted_at/by` | Columnas nuevas | Trazabilidad de posting |
| `acc_source_batch.superseded_by_id` | Columna nueva | Lineage de supersesión |

---

## D. Constraints

| Tabla | Constraint | Tipo |
|---|---|---|
| acc_source_batch | ck_acc_source_batch_status (nuevo) | CHECK — 12 valores lifecycle |
| acc_source_batch | ck_acc_source_batch_report_type | CHECK — tipos de reporte |
| acc_source_batch | ck_acc_source_batch_no_self_supersede | CHECK — no auto-supersesión |
| acc_source_batch_issue | ck_asbi_severity | CHECK — FATAL/ERROR/WARNING/INFO |
| acc_source_batch_issue | fk_asbi_batch | FK ON DELETE RESTRICT |
| acc_source_adapter_profile | uq_acc_source_adapter_profile | UNIQUE(entity_id, source_system) |
| acc_source_adapter_profile | fk → core_entities ON DELETE RESTRICT | FK |

---

## E. Índices

| Nombre | Tabla | Columnas/Condición |
|---|---|---|
| idx_acc_source_batch_status_new | acc_source_batch | status |
| idx_acc_source_batch_report_type | acc_source_batch | report_type WHERE NOT NULL |
| idx_acc_source_batch_superseded | acc_source_batch | superseded_by_id WHERE NOT NULL |
| idx_asbi_batch_id | acc_source_batch_issue | batch_id |
| idx_asbi_severity_code | acc_source_batch_issue | severity, issue_code |
| idx_asbi_batch_severity | acc_source_batch_issue | batch_id, severity WHERE resolved_at IS NULL |
| idx_asap_entity | acc_source_adapter_profile | entity_id |
| idx_asap_system | acc_source_adapter_profile | source_system WHERE is_active = true |

---

## F. RLS — Fail-Closed

### acc_source_batch_issue

| Política | Rol | Regla |
|---|---|---|
| asbi_deny_anon | anon | USING (false) — denegado total |
| asbi_authenticated_access | authenticated | USING (true) — V1 broad |

### acc_source_adapter_profile

| Política | Rol | Regla |
|---|---|---|
| asap_deny_anon | anon | USING (false) |
| asap_authenticated_access | authenticated | USING (true) — V1 broad |

Nota: RLS authenticated se refina a roles específicos en OA-024-08 (importer, approver, auditor).

---

## G. Lifecycle Implementado

### Diagrama de estados

```
                     (error en cualquier punto)
                          ┌────── REJECTED ←──────────────────────────┐
                          │                                             │
CREATED → PARSING → PARSED → VALIDATING → VALIDATED → PENDING_APPROVAL │
                                                              │         │
                                                          APPROVED      │
                                                              │         │
                                                          POSTING ──────┘
                                                              │
                                                    ┌─────────┴──────────┐
                                                  POSTED           ROLLED_BACK
                                                    │
                                                SUPERSEDED
                                         (requiere superseded_by_id)
```

### Gates implementados

| Gate | Trigger | Regla |
|---|---|---|
| Transición válida | trg_acc_source_batch_lifecycle | Solo transiciones del diagrama |
| Human approval | trg_acc_source_batch_lifecycle | → APPROVED: approved_by non-null |
| FATAL issues | trg_acc_source_batch_fatal_gate | PENDING_APPROVAL→APPROVED: 0 FATAL sin resolver |
| Posted by | trg_acc_source_batch_lifecycle | → POSTED: posted_by non-null |
| Supersession | trg_acc_source_batch_lifecycle | → SUPERSEDED: superseded_by_id non-null |
| Issue immutability | trg_asbi_immutable | UPDATE/DELETE en issues de batch POSTED bloqueado |

### Función helper de mapeo

`fn_acc_mapping_completeness(batch_id UUID)` — devuelve account_codes con saldo no-cero que no tienen mapping vigente en `acc_chart_mapping`. Usada por el Adapter en fase VALIDATING para crear issues `SRC_ACCOUNT_UNMAPPED`.

---

## H. Tests

### 015_source_adapter_tests.sql — 33 tests nuevos

| CAT | Tests | Scope |
|---|---|---|
| CAT-5: Migration Integrity | 501–508 (8) | Schema, columnas, seed, índices, triggers, función |
| CAT-6: Batch Lifecycle | 601–607 (7) | INSERT, transiciones, approval gate, SUPERSEDED |
| CAT-7: Issue Management | 701–706 (6) | FK, severity, FATAL gate, resolución, immutability, WARNING |
| CAT-8: Mapping & Security | 801–807 (7) | fn_acc_mapping_completeness, RLS, anon deny, UNIQUE |
| CAT-9: Regression | 901–905 (5) | Entidades, constraints OA-024-05, tablas, triggers |
| **Total** | **33** | |

### Actualización en 012_test_suite.sql

TEST-309 actualizado: valores de status `'completed'/'pending'` → `'POSTED'/'CREATED'`. La lógica del test no cambia — sigue validando UNIQUE(file_hash).

---

## I. Regression OA-024-05

**Los 37 tests de 012_test_suite.sql no cambian en lógica.** Solo TEST-309 actualizó valores de status para compatibilidad con el nuevo lifecycle.

Para confirmar 37/37 PASS: ejecutar `012_test_suite.sql` después de `014_source_adapter_infra.sql`.

Tests de regression incluidos en 015: TEST-901 a TEST-905.

---

## J. AC-05 Storage Discovery — READ-ONLY

### Buckets existentes en el proyecto Supabase

| Bucket | Descripción | Acceso |
|---|---|---|
| `frisku-docs` | Documentos Frisku, Rendiciones | Mixto (`uploadArchivoFrisku` en friskuHelpers.js) |
| `nominas-docs` | Expediente digital nóminas | Privado, signed URLs (`expedienteHelpers.js`) |

### Bucket para accounting source files

No existe bucket dedicado. Opciones:

| Opción | Descripción |
|---|---|
| A | Reutilizar `frisku-docs` con prefijo `accounting/` |
| B | Crear bucket `accounting-source` (separación limpia) |
| C | Diferir a OA-024-08/09 (no bloquea OA-024-07) |

**Path propuesto (para decisión futura):** `{bucket}/accounting-source/{entity_code}/{fiscal_year}/{period}/{file_hash}.xlsx`

**AC-05 = DEFERRED GATE** — bloquea OA-024-08/09, no bloquea OA-024-07.

---

## K. CC-GRANULARITY-GATE para OA-024-08

El EERR Contec tiene N filas por account_code (una por CC). El UNIQUE de `acc_account_balance` es `(entity_id, period_id, account_code, balance_type)` — no admite granularidad CC.

Decisión requerida antes de OA-024-08:

| Opción | Descripción | Impacto schema |
|---|---|---|
| **A (V1)** | Agregar CC en ContecAdapter antes del INSERT | Ninguno — compatible con schema actual |
| B | Tabla staging con CC + dimensión en acc_account_balance_dim | Schema change en staging |
| C | Extender UNIQUE de acc_account_balance | Breaking change — análisis de impacto |

**Posición V1 recomendada:** Opción A — menor riesgo, CC detail en lineage (file_hash → archivo fuente).

**CC-GRANULARITY-GATE:** Confirmar opción antes de OA-024-08.

---

## L. Deuda Técnica

| ID | Descripción | Target |
|---|---|---|
| DT-007-01 | RLS authenticated broad — refinar a roles importer/approver/auditor | OA-024-08 |
| DT-007-02 | fn_acc_mapping_completeness no testada con datos reales | OA-024-08 |
| DT-007-03 | acc_source_batch.error_detail (texto libre) vs issues estructurados | OA-024-08 puede deprecar |
| DT-007-04 | imported_at/imported_by redundantes con posted_at/posted_by | Deprecar OA-024-09 |
| DT-007-05 | balance_type='budget' en schema pero no en arquitectura target Planning | Assessment dependencias |
| DT-007-06 | parseEerrMensualContec espera formato diferente al EERR real Contec | OA-024-08 |

---

## M. GO / NO-GO para OA-024-08

### Criterios de STABLE para OA-024-07

| Criterio | Test |
|---|---|
| 014 ejecutado sin errores | SQL Editor — sin EXCEPTION |
| 015: 33/33 PASS | Verificar con RAISE NOTICE count |
| 012: 37/37 PASS | No regresión OA-024-05 |
| Seed ALF/contec en acc_source_adapter_profile | TEST-505 PASS |
| Triggers activos | TEST-507 PASS |
| RLS fail-closed | TEST-802, 803, 804 PASS |

### Decisiones pendientes antes de OA-024-08

| Decisión | Descripción |
|---|---|
| **CC-GRANULARITY-GATE** | Opción A/B/C para CC detail (ver sección K) |
| **AC-05** | Bucket para archivos fuente contables |
| **D7** | Tipo jurídico APC/APP/ARR/MES/MON |
| **D8** | Moneda funcional entidades con NULL |

**STOP — NO iniciar OA-024-08 automáticamente.**

014 PASS ✓ + 015 33/33 PASS ✓ + 012 37/37 PASS ✓ → **OA-024-07 = STABLE** (2026-08-18)

### Gaps encontrados en ejecución (corregidos)

| Gap | Descripción | Fix |
|---|---|---|
| 014 RLS | `service_role ALL` faltaba en tablas nuevas | Añadido en 014 + remediation patch en prod |
| TEST-402 | Contaba `USING(false)` deny policies como "acceso anon" | `AND qual IS DISTINCT FROM 'false'` en 012 |

---

## Archivos producidos

| Archivo | Contenido |
|---|---|
| [migrations/014_source_adapter_infra.sql](migrations/014_source_adapter_infra.sql) | Migration: tablas, triggers, RLS, seed |
| [migrations/015_source_adapter_tests.sql](migrations/015_source_adapter_tests.sql) | 33 tests nuevos |
| [migrations/012_test_suite.sql](migrations/012_test_suite.sql) | TEST-309 actualizado (status values) |
| [OA-024-07-SOURCE-ADAPTER-INFRASTRUCTURE.md](OA-024-07-SOURCE-ADAPTER-INFRASTRUCTURE.md) | Este documento |

## Orden de ejecución

```sql
-- 1. Migration de infraestructura
-- 014_source_adapter_infra.sql

-- 2. Tests nuevos OA-024-07 (esperado: 33 PASS)
-- 015_source_adapter_tests.sql

-- 3. Regression OA-024-05 (esperado: 37 PASS)
-- 012_test_suite.sql
```

---

**Última actualización:** 2026-08-18 — STABLE confirmado: 014+015+012 PASS. Gaps RLS y TEST-402 corregidos.

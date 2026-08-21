# OA-024-05 — Etapa 0: Corporate Entity Master + Accounting Schema v2
## Estado: STABLE ✓ — 37/37 PASS · Rollback + Reproducibilidad confirmados (2026-08-14)

**Fecha inicio:** 2026-08-14  
**Autorización:** CFO Angelo Huerta (mensaje 3 de sesión OA-024-05)  
**Rama:** claude/crazy-heisenberg-f33f7a  

---

## Decisiones abieras (CFO input requerido)

| ID | Asunto | Estado |
|----|--------|--------|
| D7 | Estructura legal APC/APP/ARR/MES/MON | ABIERTO — evidencia externa requerida |
| D8 | Moneda funcional APC (conflicto ANF vs legacy) | ABIERTO — ficha técnica requerida |
| D8b | Moneda funcional ALS, INT, APP | ABIERTO — no confirmado |

---

## Archivos producidos

### Scripts de migración (en orden de ejecución)

| Archivo | Contenido | Estado |
|---------|-----------|--------|
| [005_preflight_check.sql](migrations/005_preflight_check.sql) | 9 queries read-only para SQL Editor | Ejecutado ✓ (D9-A resuelto) |
| [006_core_entities.sql](migrations/006_core_entities.sql) | core_entities + core_entity_external_refs + 11 seeds + 8 bridges ANF + RLS + T11 | Listo — espera 007 |
| [007_security_final_preflight.sql](migrations/007_security_final_preflight.sql) | pg_policies + FK catalog (2 queries SQL Editor) | **PENDIENTE — CFO debe ejecutar** |
| [008_accounting_tables_apply.sql](migrations/008_accounting_tables_apply.sql) | 36 tablas acc_*/pln_*/dim_* en orden topológico (Tier 0–6) + índices | Listo |
| [009_rls_all.sql](migrations/009_rls_all.sql) | RLS fail-closed en 35 tablas acc_*/pln_*/dim_* | Listo |
| [010_triggers_t1_t11.sql](migrations/010_triggers_t1_t11.sql) | T1–T11 triggers e invariantes contables | Listo |
| [011_technical_seeds.sql](migrations/011_technical_seeds.sql) | dim_type (8), pln_scenario (4), acc_financial_statement (4), acc_reporting_account (17) | Listo |
| [012_test_suite.sql](migrations/012_test_suite.sql) | 37 tests en 5 categorías (CAT-1 a CAT-5) | Listo |
| [013_rollback.sql](migrations/013_rollback.sql) | DROP inverso topológico + limpieza funciones | Listo |

### Documentos de diseño

| Archivo | Contenido |
|---------|-----------|
| [OA-024-01-CONTABILIDAD-FRP-DESIGN.md](OA-024-01-CONTABILIDAD-FRP-DESIGN.md) | Diseño original |
| [OA-024-01-CONTABILIDAD-FRP-DESIGN-R1.md](OA-024-01-CONTABILIDAD-FRP-DESIGN-R1.md) | Revisión 1 |
| [OA-024-01-CONTABILIDAD-FRP-DESIGN-R2-CLOSURE.md](OA-024-01-CONTABILIDAD-FRP-DESIGN-R2-CLOSURE.md) | Cierre de diseño |
| [OA-024-02-CORPORATE-ENTITY-PREFLIGHT.md](OA-024-02-CORPORATE-ENTITY-PREFLIGHT.md) | Preflight D9-A |
| [OA-024-03-CORPORATE-ENTITY-RECONCILIATION.md](OA-024-03-CORPORATE-ENTITY-RECONCILIATION.md) | Reconciliación entity masters |
| [OA-024-04-TECHNICAL-CLOSURE.md](OA-024-04-TECHNICAL-CLOSURE.md) | Fixes B1/B2/B3, UUIDs canónicos |
| [migrations/004_accounting_schema_draft_v2.sql](migrations/004_accounting_schema_draft_v2.sql) | Schema completo DRAFT (referencia, no ejecutar) |
| [migrations/SEC-ANF-RLS-FIX-DRAFT.sql](migrations/SEC-ANF-RLS-FIX-DRAFT.sql) | Fix RLS en tablas legacy ANF (pendiente GO) |

---

## Evidencia de DB (D9-A resuelto vía REST API)

| Tabla | Estado | Filas | UUIDs |
|-------|--------|-------|-------|
| `empresas` | DEPLOYED ✓ | 11 | Canónicos |
| `contab_empresas` | DEPLOYED ✓ | 11 | MISMOS que empresas |
| `anf_filiales` | DEPLOYED ✓ | 8 | DISTINTOS (bridge en 006) |
| `core_entities` | NOT DEPLOYED | — | A crear en 006 |
| `periodos` | DEPLOYED ✓ | 12 | FK → empresas.id |
| `contab_plan_cuentas` | DEPLOYED ✓ | 746 | FK → contab_empresas.id |
| `contab_homologacion` | DEPLOYED ✓ | 746 | FK → contab_empresas.id |

**Conclusión D9-A:** Escenario A confirmado. Los 11 UUIDs de `empresas` = `contab_empresas` = UUIDs que usará `core_entities`. No hay transformación UUID. La inserción en 006 es idempotente vía `ON CONFLICT DO NOTHING`.

---

## Diseño de core_entities (decisiones CFO)

### Principios aplicados
1. **Corporativamente neutro**: sin columnas de accounting, ownership, moneda
2. **entity_type = 'unresolved'** para APC/APP/ARR/MES/MON (D7 abierto)
3. **core_entity_external_refs** como mecanismo transversal de bridge (no columna ANF en core_entities)
4. **APP/ARR/MON**: sin bridge ANF (no existen en anf_filiales)
5. **D8**: functional_currency = NULL en acc_entity_config hasta ficha técnica

### Bridges ANF implementados (8 entidades)
| Código | ANF source_entity_id | Notas |
|--------|---------------------|-------|
| MED | 85f6a2d0-a8af-4b21-9983-e27377f7761c | — |
| ALF | 03b15fca-e99c-4f25-a289-821213084e82 | RUT 77.026.047-7 en core_entities |
| ALS | c022964f-f866-4998-aeaf-6e920706bb13 | — |
| APC | ca53a724-e738-4263-bad5-7db9bed25dcd | D8 conflict noted en metadata JSONB |
| FRI | e9bad766-549f-4db1-8e54-2609bbcaf9d9 | — |
| INT | b7e614a5-cf9e-4aa0-aa40-c59fe171bfe2 | — |
| MES | 1427c148-5446-44f3-8821-fd221d35a988 | entity_type='unresolved' (D7) |
| OSI | 333d8e35-39df-4f3c-99ba-28a3550756a6 | — |

---

## Accounting Schema v2 — Topología

```
Tier 0  dim_type | acc_financial_statement | pln_scenario | acc_reporting_account
         ↓
Tier 1  dim_value | acc_reporting_line | acc_base_profile | acc_period
        acc_entity_config | acc_ownership
         ↓
Tier 2  acc_materiality_policy | acc_company_profile | acc_chart_mapping
        acc_source_batch | acc_period_audit | acc_period_mapping_override
         ↓
Tier 3  acc_adjustment_journal | acc_consolidation_run | acc_conversion_run
         ↓
Tier 4  acc_journal_entry | acc_adjustment_journal_line | acc_conversion_rate_used
         ↓
Tier 5  acc_journal_line | acc_account_balance | acc_consolidation_journal
        acc_nci_movement | acc_equity_method_entry | acc_consolidation_result_line
        acc_reporting_run | pln_budget_entry
         ↓
Tier 6  acc_journal_line_dim | acc_account_balance_dim | acc_consolidation_journal_line
        acc_snapshot_metadata | pln_budget_entry_dim
```

**Fixes B1/B2/B3 confirmados en 008:**
- B1: acc_financial_statement y acc_reporting_account en Tier 0 (antes de journals)
- B2: acc_consolidation_run sin FK circular (parent_run_id eliminado)
- B3: scope_entity_id + scope_reporting_line_id en lugar de scope_ref_id polimórfico

---

## Invariantes T1–T11 (implementados en 010)

| Trigger | Tabla | Invariante |
|---------|-------|-----------|
| T1 | acc_journal_entry | Balance BEFORE UPDATE a 'posted' |
| T2 | acc_adjustment_journal | Balance BEFORE UPDATE a 'approved' |
| T3 | acc_consolidation_run | Balance journals BEFORE UPDATE a 'completed' |
| T4 | acc_ownership | Sin overlap temporal BEFORE INSERT/UPDATE |
| T5 | acc_entity_config | Sin overlap temporal BEFORE INSERT/UPDATE |
| T6 | acc_source_batch | UNIQUE(file_hash) — service layer idempotency |
| T7 | acc_equity_method_entry | IAS 28 opening+movements=closing BEFORE INSERT/UPDATE |
| T8 | acc_nci_movement | NCI opening+movements=closing BEFORE INSERT/UPDATE |
| T9 | acc_adjustment_journal | SoD prepared_by≠approved_by BEFORE INSERT/UPDATE |
| T10 | acc_journal_entry, acc_account_balance | Period lock BEFORE INSERT |
| T11 | 15 tablas mutables | updated_at = now() BEFORE UPDATE |

---

## Test Suite — 37 tests en 5 categorías

| Categoría | Tests | Cobertura |
|-----------|-------|-----------|
| CAT-1 Corporate Identity | 101–111 (11 tests) | 11 entidades, entity_type, bridges ANF, D7/D8 |
| CAT-2 Referential Integrity | 201–207 (7 tests) | PKs, FKs, B1/B2/B3, UNIQUE constraints |
| CAT-3 Accounting Invariants | 301–309 (9 tests) | T1/T4/T6/T7/T9/T10 behavioral |
| CAT-4 Security | 401–404 (4 tests) | RLS fail-closed, anon denegado, service_role ALL |
| CAT-5 Reproducibility | 501–506 (6 tests) | Seeds idempotentes, T11 updated_at |

---

## Secuencia de ejecución autorizada

```
PASO 1 — CFO: Ejecutar 007_security_final_preflight.sql en SQL Editor
         → Reportar resultados de Q1 (pg_policies) y Q2 (FK catalog)

PASO 2 — Si GO: Ejecutar en SQL Editor en este orden:
         006_core_entities.sql
         008_accounting_tables_apply.sql
         009_rls_all.sql
         010_triggers_t1_t11.sql
         011_technical_seeds.sql
         012_test_suite.sql       ← debe terminar "37 tests PASS"

PASO 3 — Test de reproducibilidad:
         013_rollback.sql         ← DROP todo
         Repetir PASO 2           ← debe reproducir sin errores

PASO 4 — Actualizar este acta con PASS/FAIL por sección
         OA-024-05 ETAPA 0 = STABLE si todo pasa
```

---

## Sección de resultados — 2026-08-14

### Corporate Entity Master
- [x] PASS — 11 entidades con UUIDs canónicos; entity_type correcto; MED=holding, 5 subsidiarias, 5 unresolved (D7)

### External References
- [x] PASS — 8 bridges ANF; UNIQUE bloqueó duplicado; APP/ARR/MON sin bridge (correcto)

### Accounting Schema (36 tablas)
- [x] PASS — 36 tablas acc_*/pln_*/dim_* en Tier 0–6; B1/B2/B3 confirmados; UNIQUE(file_hash) presente

### Constraints y Triggers (T1–T11)
- [x] PASS — T1 bloquea journal vacío y desbalanceado; T1 permite balanceado; T4 bloquea overlap; T7 IAS28 ok; T9 SoD ok; T10 period lock ok; T11 clock_timestamp() ok
- Fixes aplicados: TEST-305 (T2 antes de T9 — líneas balanceadas necesarias); TEST-506 (clock_timestamp() en lugar de now())

### RLS (fail-closed)
- [x] PASS — RLS habilitado en tablas críticas; anon sin políticas; service_role ALL

### Tests (37/37 PASS)
- [x] PASS — 37/37 en ejecución original; 37/37 en re-deploy post-rollback

### Rollback + Reproducibilidad
- [x] PASS — 013_rollback eliminó todos los artefactos; 6 tablas legacy intactas; re-deploy 006→012 reproducido sin errores

---

## Deuda técnica residual

1. **D7** — Estructura legal JV/associate para APC/APP y related para ARR/MES/MON: requiere evidencia externa (pacto de accionistas, carta directorio)
2. **D8** — Fichas de moneda funcional para ALS, INT, APP, APC: a completar en Etapa 1
3. **SEC-ANF** — RLS en tablas legacy anf_filiales/empresas/contab_empresas: borrador en SEC-ANF-RLS-FIX-DRAFT.sql, pendiente autorización CFO
4. **acc_company_profile** — Completar con datos reales por empresa una vez D8 resuelto
5. **ContecAdapter** — NO autorizado en esta etapa; a diseñar en OA-024-06
6. **ExcelAdapter** — NO autorizado en esta etapa

---

## Recomendación para OA-024-06

Una vez OA-024-05 Etapa 0 sea STABLE:

**OA-024-06 Etapa 1** debería enfocarse en:
1. Resolver D7 y D8 con evidencia externa del CFO
2. Diseñar ContecAdapter para ingesta desde Contec (ALF y ALS)
3. Poblar acc_entity_config y acc_base_profile con datos reales
4. Primeras entradas en acc_period para año fiscal 2025
5. Primer test de acc_account_balance vía source_batch desde Contec

**No iniciar Etapa 1 hasta que todos los 37 tests de Etapa 0 sean PASS y rollback/reproducibilidad sea confirmado.**

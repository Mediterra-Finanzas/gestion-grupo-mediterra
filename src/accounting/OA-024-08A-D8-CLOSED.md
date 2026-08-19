# OA-024-08A — D8-ALF CLOSED / AccountingProfile Preflight

**Fecha:** 2026-08-19
**Estado:** D8 CLOSED — F.1/F.2 READY TO EXECUTE — F.3 PENDING CFO MAPPING APPROVAL

---

## D8-ALF = CLOSED / USD

**Decisión CFO recibida 2026-08-19**: `functional_currency = 'USD'`

Evidencia completa documentada en OA-024-08A §D8-ALF ASSESSMENT (8 factores IAS 21, HIGH confidence).

`functional_currency` vive exclusivamente en `acc_entity_config` y `acc_base_profile`. No está hardcodeada en ningún archivo del dominio acc_* — cumple D6.

---

## F.1 / F.2 PREFLIGHT — RESULTADO

### Verificaciones realizadas (READ-ONLY)

| Check | Resultado | Estado |
|-------|-----------|--------|
| Tablas `acc_base_profile`, `acc_entity_config` existen (migration 008) | Confirmado | ✅ PASS |
| `acc_base_profile.entity_id` UNIQUE — ON CONFLICT (entity_id) DO NOTHING | Confirmado en T1.3 | ✅ PASS |
| `acc_entity_config` — sin UNIQUE en entity_id (temporal) → guard WHERE NOT EXISTS | Confirmado en T1.5 | ✅ PASS |
| `consol_method` CHECK válido para 'line_by_line' | Confirmado en T1.3+T1.5 | ✅ PASS |
| `effective_to IS NULL OR effective_to >= effective_from` — NULL pasa constraint | Confirmado en T1.5 | ✅ PASS |
| ALF UUID = `3df93d9d-cbc6-446f-b9a5-0a3840692fd8` en core_entities | Confirmado en Q1/OA-024-08A | ✅ PASS |
| 0 rows en acc_base_profile para ALF (estado limpio) | Confirmado Q3a 2026-08-19 | ✅ PASS |
| 0 rows en acc_entity_config para ALF (estado limpio) | Confirmado Q1 2026-08-19 | ✅ PASS |
| RLS: INSERT requiere postgres/service_role (SQL Editor lo permite) | RLS 009 confirmado | ✅ PASS |
| acc_chart_mapping UNIQUE (entity_id, local_account_code, effective_from) | Confirmado en T2.3 | ✅ PASS |
| 17 reporting accounts disponibles | Confirmado Q4 2026-08-19 | ✅ PASS |

**PREFLIGHT = PASS** — F.1 + F.2 pueden ejecutarse desde SQL Editor sin riesgo.

### Ruta de ejecución

El SQL Editor de Supabase Dashboard corre como `postgres` (bypasses RLS). Los INSERTs de F.1 y F.2 **no pueden ejecutarse desde la app** (anon key, sin INSERT policy para authenticated en estas tablas). Solo vía SQL Editor o Edge Function con service_role.

**Migration lista**: `src/accounting/migrations/018_alf_accounting_profile.sql`

---

## 4 MAPPINGS READY — TABLA DE DETALLE

Fuente: AC-04 (`OA-024-06-ACCOUNTING-SOURCE-ADAPTER-DESIGN-AC04-EVIDENCE.md`), archivos reales ALF.
Estos 4 códigos fueron observados directamente en los archivos Contec de ALF.

| # | source_account_code | source_account_name | base_classification | proposed_reporting_account_code | proposed_reporting_account_name | financial_statement | normal_balance | confidence | observed_amount | manual_review_required | reason |
|---|---------------------|---------------------|--------------------|---------------------------------|--------------------------------|--------------------|-----------------|----|---|---|---|
| 1 | `4.01.01.002` | VENTA CEREZAS FRESCAS EXPORTACION | ERI | `ING` | Ingresos de Actividades Ordinarias | ERI (Estado de Resultado) | credit | **HIGH** | Non-zero (no reproducido) | NO | Prefix 4.01.xx = ventas operacionales. Naturaleza Contec: INGRESOS / INGRESOS POR VENTA. ALF = exportadora, revenue en USD FOB. Sin ambigüedad. |
| 2 | `6.11.01.010` | SUELDOS Y SALARIOS | ERI | `GOPEX` | Gastos Operacionales | ERI | debit | **HIGH** | Non-zero (múltiples CC: ADMIN, OPERACIONES) | NO | Prefix 6.11.01 = gastos de personal. Naturaleza Contec: GASTOS DE ADM. Y VENTAS / GASTOS DE PERSONAL. Gasto operacional estándar. Aparece en ambos CC. Sin ambigüedad. |
| 3 | `6.11.07.290` | GASTOS BANCARIOS | ERI | `GOPEX` | Gastos Operacionales | ERI | debit | **MEDIUM** | Non-zero (CC: confirmado) | **YES** | Prefix 6.11.07 = gastos de gestión. Naturaleza Contec: GASTOS DE ADM. Y VENTAS (no EGRESOS NO OP) → confirma que Contec lo clasifica como operacional, no financiero. Sin embargo el nombre "gastos bancarios" puede incluir tanto comisiones (GOPEX correcto) como intereses (→ debería ser FIN). **Revisar si este código incluye intereses antes de confirmar.** Si son solo comisiones bancarias operativas → GOPEX confirmado. |
| 4 | `6.11.07.310` | SEGUROS | ERI | `GOPEX` | Gastos Operacionales | ERI | debit | **HIGH** | Non-zero (CC: COMEX) | NO | Prefix 6.11.07 = gastos de gestión. Naturaleza Contec: GASTOS DE ADM. Y VENTAS. Seguros = gasto operativo estándar (pólizas de carga, seguro de exportación). Sin ambigüedad. |

### Decisión semántica requerida para #3

> **Para `6.11.07.290` GASTOS BANCARIOS:**
> La naturaleza Contec (GASTOS DE ADM. Y VENTAS, no EGRESOS NO OP) indica que Contec lo trata como costo operativo → GOPEX es consistente.
> Si confirmas que este código contiene SOLO comisiones bancarias operativas (no intereses de deuda): GOPEX aprobado.
> Si mezcla intereses + comisiones: necesitaría dividirse en dos cuentas o reclasificarse a FIN para los intereses.
> La separación la resuelve el primer batch con `fn_acc_mapping_completeness`.

---

## COBERTURA REAL RESTANTE

### Estimado de cuentas totales ALF

| Archivo | Filas totales | Estimado leaf accounts (sin subtotales) |
|---------|---------------|----------------------------------------|
| Balance Foods.xlsx (ESF) | 366 | ~120–180 códigos 1.xx/2.xx/3.xx distintos |
| EERR Julio (ERI período) | 90 | ~55–65 códigos 4.xx–9.xx |
| EERR Acumulado (ERI YTD) | 175 | ~mismos códigos, diff amounts |
| **Total estimado** | — | **~175–245 leaf accounts únicos** |

### Cobertura actual

| Métrica | Valor |
|---------|-------|
| Cuentas en DB (`acc_chart_mapping` para ALF) | 0 |
| Cuentas READY para insertar (AC-04 observed) | 4 |
| Cobertura % post F.3 (si se aprueba) | ~1.6–2.3% |
| Cuentas pendientes por cargar | ~171–241 |

### Cómo se completa el mapping

El ciclo correcto (sin necesidad de Angelo extraer manualmente cuentas de Contec):

```
1. F.1 + F.2 ejecutados → ALF tiene functional_currency = USD en DB
2. F.3 aprobado → 4 cuentas insertadas
3. OA-024-09 autorizado → primer batch cargado (Balance Foods.xlsx)
4. fn_acc_mapping_completeness(batch_id) → lista exacta de cuentas con valor ≠ 0 sin mapping
5. Mapping Level 2 generado para esas cuentas → insert masivo
6. 0 cuentas unmapped materiales → PILOT ALF = READY
```

El Level 1 classifier cubre la totalidad del rango de prefijos. El gap es solo ejecución.

---

## CRITICAL PATH

```
CRITICAL PATH (secuencia serializada — cada paso depende del anterior)
══════════════════════════════════════════════════════════════════════
[DONE]  D8-ALF CONFIRMED = USD                     (2026-08-19, CFO)
[DONE]  018_alf_accounting_profile.sql READY        (2026-08-19)
[STEP]  F.1 + F.2: SQL Editor execution → PASS      ← STEP FOR ANGELO
        → acc_base_profile + acc_entity_config ALF populated
[HOLD]  F.3: 4 cuentas READY → espera CFO approval  ← revisar tabla arriba
        → acc_chart_mapping 4 rows inserted
[GATE]  PILOT ALF = READY (ver criterios en OA-024-08A §I)
        Requiere: F.1+F.2 done + F.3 approved + mappings completos (post batch)
[NEXT]  OA-024-09 — PostingPipeline UI
        (NO AUTORIZADO todavía — requiere CFO go-ahead explícito)

PARALLEL WORK (no bloquean critical path)
══════════════════════════════════════════
[TODO]  ACC_PERIOD seed para ALF (períodos 2026-01 a 2026-12)
        → migration independiente, no bloquea F.1/F.2
[TODO]  ALS + INT entity config (functional_currency — misma arquitectura que ALF)
        → pueden prepararse en paralelo; D8 para ALS/INT también pendiente
[TODO]  dim_value seeds (CC, TMP, ESP) para AGR layer
        → independiente de ALF pilot
[DONE]  AGR-ACCOUNTING preflight (assessment completo)
[DONE]  ALF-CONTEC-MAPPING-PROPOSAL-v1.csv (Level 1 framework)

BLOCKED (requieren acción CFO o autorización explícita)
══════════════════════════════════════════════════════
[BLOCK] OA-024-09 — no autorizado
[BLOCK] Cargar Balance Foods.xlsx / EERR reales en producción
[BLOCK] acc_account_balance posting
[BLOCK] D7 ownership (acc_ownership table) — OPEN, no bloquea ALF

DEFERRED
════════
[DEF]   EEFF desde acc_* (post-pilot + OA-024-09)
        → depende de posting pipeline
[DEF]   Réplica multiempresa (ALS, INT, etc.)
        → depende de OA-024-09 + D8 de cada entidad
[DEF]   AGR/Accounting integration (dim_value → journal_line)
        → post-piloto ALF
[DEF]   costo/ha reporting
        → post-AGR integration
```

---

## STEP FOR ANGELO

**Acción requerida: ejecutar F.1 + F.2 en Supabase SQL Editor.**

```
1. Abrir Supabase Dashboard
   URL: https://supabase.com/dashboard/project/bywovqayuzodbzwsriet

2. → SQL Editor

3. Copiar y pegar el BLOQUE 0 (verificación) de:
   src/accounting/migrations/018_alf_accounting_profile.sql
   → verificar que devuelve:
       core_entities: 1 row (Allegria Foods)
       acc_base_profile: 0 rows
       acc_entity_config: 0 rows
       reporting_accounts: 17

4. Copiar y pegar BLOQUE 1 (F.1 — acc_base_profile INSERT)
   → verificar que el POST-CHECK devuelve 1 row con functional_currency = 'USD'

5. Copiar y pegar BLOQUE 2 (F.2 — acc_entity_config INSERT)
   → verificar que el POST-CHECK devuelve 1 row con effective_from = '2026-01-01'

6. Copiar y pegar BLOQUE 4 (verificación final de AccountingProfile completo)
   → verificar que devuelve ALF con todos los campos USD correctos

Reportar el output del BLOQUE 4 para confirmar PASS.
```

**F.3 (4 mappings):** revisar la tabla de detalle arriba, confirmar o corregir `6.11.07.290 GASTOS BANCARIOS`, y responder si apruebas los 4. El SQL para F.3 está comentado en `018_alf_accounting_profile.sql` — se descomenta y ejecuta post-aprobación.

---

## PARALLEL WORK — Próximas migraciones preparables sin bloquear F.1/F.2

Los siguientes trabajos pueden prepararse en paralelo mientras Angelo ejecuta F.1/F.2:

| Trabajo | Migration # | Bloquea | Estado |
|---------|-------------|---------|--------|
| acc_period seed para ALF (12 períodos 2026) | 019 | Posting de OA-024-09 | Preparable ahora |
| D8 + entity_config para ALS (Allegria Service) | 020 | ALS pilot | Preparable (D8 ALS = CLP o USD?) |
| D8 + entity_config para INT (Integrity Farms) | 021 | INT pilot | Preparable |
| dim_value CC/TMP/ESP seeds | 022 | AGR journals | Preparable ahora |

Confirma si debo avanzar con alguno de estos en paralelo.

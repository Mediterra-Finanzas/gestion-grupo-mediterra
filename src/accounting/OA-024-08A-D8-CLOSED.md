# OA-024-08A — D8-ALF CLOSED / AccountingProfile PRODUCTION PASS

**Fecha:** 2026-08-19
**Estado:** D8 CLOSED — F.1 PASS — F.2 PASS — BLOQUE 4 PASS — **AccountingProfile ALF = COMPLETE EN PRODUCCIÓN** — F.3 HOLD

---

## PRODUCTION STATE — AccountingProfile ALF

| Bloque | Descripción | Tabla | Estado | Ejecutado |
|--------|-------------|-------|--------|-----------|
| BLOQUE 0 | Pre-check prereqs | SELECT-only | PASS | 2026-08-19 |
| BLOQUE 1 | F.1: acc_base_profile INSERT | `acc_base_profile` | **EJECUTADO EN PRODUCCIÓN** | 2026-08-19 |
| BLOQUE 2 | F.2: acc_entity_config INSERT | `acc_entity_config` | **EJECUTADO EN PRODUCCIÓN** | 2026-08-19 |
| BLOQUE 3 | F.3: acc_chart_mapping 4 cuentas | `acc_chart_mapping` | **HOLD — CFO APPROVAL REQUERIDO** | Pendiente |
| BLOQUE 4 | Verificación final AccountingProfile | SELECT JOIN | **PASS** | 2026-08-19 |

### Output BLOQUE 4 — Producción confirmado por CFO

```
legal_name                  = Allegria Foods
base_functional_currency    = USD
base_reporting_currency     = USD
base_consol_method          = line_by_line
is_ifrs                     = true
effective_from              = 2026-01-01
effective_to                = NULL
config_functional_currency  = USD
config_consol_method        = line_by_line
ownership_pct               = 100.0000
chart_mappings_active       = 0     ← correcto: F.3 aún HOLD
```

**Interpretación:** AccountingProfile ALF structuralmente completo. La única columna en 0 (`chart_mappings_active`) es el comportamiento esperado — F.3 no ha sido ejecutado.

---

## D8-ALF = CLOSED / USD

**Decisión CFO recibida 2026-08-19**: `functional_currency = 'USD'`

Evidencia completa documentada en OA-024-08A §D8-ALF ASSESSMENT (8 factores IAS 21, HIGH confidence).

`functional_currency` vive exclusivamente en `acc_entity_config` y `acc_base_profile`. No hardcodeada en ningún archivo del dominio acc_* — cumple D6.

---

## F.1 / F.2 PREFLIGHT — PASS COMPLETO

### Verificaciones realizadas (READ-ONLY, todas PASS)

| Check | Resultado | Estado |
|-------|-----------|--------|
| Tablas `acc_base_profile`, `acc_entity_config` existen (migration 008) | Confirmado | PASS |
| `acc_base_profile.entity_id` UNIQUE — ON CONFLICT DO NOTHING | Confirmado T1.3 | PASS |
| `acc_entity_config` — sin UNIQUE en entity_id → guard WHERE NOT EXISTS | Confirmado T1.5 | PASS |
| `consol_method` CHECK válido para 'line_by_line' | Confirmado T1.3+T1.5 | PASS |
| `effective_to IS NULL` — pasa constraint | Confirmado T1.5 | PASS |
| ALF UUID = `3df93d9d-cbc6-446f-b9a5-0a3840692fd8` en core_entities | Confirmado | PASS |
| 0 rows en acc_base_profile para ALF (estado limpio) | BLOQUE 0 | PASS |
| 0 rows en acc_entity_config para ALF (estado limpio) | BLOQUE 0 | PASS |
| RLS: INSERT requiere postgres (SQL Editor lo permite) | RLS 009 | PASS |
| acc_chart_mapping UNIQUE (entity_id, local_account_code, effective_from) | Confirmado T2.3 | PASS |
| 17 reporting accounts disponibles | BLOQUE 0 | PASS |
| **F.1 INSERT acc_base_profile ejecutado** | BLOQUE 1 + post-check | **PASS — 1 row** |
| **F.2 INSERT acc_entity_config ejecutado** | BLOQUE 2 + post-check | **PASS — 1 row** |
| **BLOQUE 4 AccountingProfile JOIN verificado** | BLOQUE 4 | **PASS — output correcto** |

---

## F.3 — 4 ACCOUNT REVIEW DETALLADO

Fuente: AC-04 (`OA-024-06-ACCOUNTING-SOURCE-ADAPTER-DESIGN-AC04-EVIDENCE.md`), archivos reales ALF.

### Tabla de decisión

| # | source_account_code | source_account_name | naturaleza_contec | clase_contec | CC observado | proposed_ra | normal_balance | confidence_v1 | evidence_analysis | confidence_v2 | manual_review_required | recommendation |
|---|---------------------|---------------------|-------------------|--------------|--------------|-------------|----------------|----------------|-------------------|----------------|------------------------|----------------|
| 1 | `4.01.01.002` | VENTA CEREZAS FRESCAS EXPORTACION | INGRESOS | INGRESOS POR VENTA | N/A (EERR) | **ING** | credit | HIGH | Prefix 4.01.xx = ventas operacionales. Naturaleza Contec = INGRESOS / INGRESOS POR VENTA. ALF = exportadora FOB USD. Sin ambigüedad posible. | **HIGH** | NO | **APROBAR** |
| 2 | `6.11.01.010` | SUELDOS Y SALARIOS | GASTOS DE ADM. Y VENTAS | GASTOS DE PERSONAL | ADMIN Y FINANZAS / OPERACIONES | **GOPEX** | debit | HIGH | Prefix 6.11.01 = personal. Naturaleza Contec = GASTOS DE ADM. Y VENTAS / GASTOS DE PERSONAL. Aparece en múltiples CC. Sin ambigüedad. | **HIGH** | NO | **APROBAR** |
| 3 | `6.11.07.290` | GASTOS BANCARIOS | GASTOS DE ADM. Y VENTAS | GASTOS DE GESTION | confirmado | **GOPEX** | debit | MEDIUM | **Argumento decisivo:** Contec lo clasifica bajo `GASTOS DE ADM. Y VENTAS` (no `EGRESOS NO OPERACIONALES`). En Contec Chile, los intereses bancarios van a EGRESOS NO OP (8.xx). Que Contec lo clasifique como GASTOS DE ADM. → indica comisiones/mantención operativa, no financiamiento. Prefix 6.11.07 = Gastos de Gestión. **Recomendación: GOPEX.** Si post-batch el monto parece alto → revisar si incluye intereses encadenados; en ese caso reclasificar esas líneas a FIN vía ajuste. | **MEDIUM-HIGH** | YES (post-batch verify) | **APROBAR COMO GOPEX — revisar en 1er batch** |
| 4 | `6.11.07.310` | SEGUROS | GASTOS DE ADM. Y VENTAS | GASTOS DE GESTION | COMEX | **GOPEX** | debit | HIGH | Prefix 6.11.07 = Gastos de Gestión. Naturaleza GASTOS ADM. Seguros = póliza de carga exportación, seguro de flete. Gasto operacional estándar. CC = COMEX confirma contexto operativo. | **HIGH** | NO | **APROBAR** |

### Posición en BLOQUE 3

El SQL de BLOQUE 3 ya está escrito en `src/accounting/migrations/018_alf_accounting_profile.sql`. Mapea las 4 cuentas a GOPEX/ING según la tabla anterior. El campo `notes` en cada INSERT documenta la ambigüedad de `6.11.07.290` para trazabilidad.

**Para ejecutar BLOQUE 3**: descomentar el bloque `/* ... */` en `018_alf_accounting_profile.sql` y ejecutar desde SQL Editor. Confirmar con post-check 4 rows.

---

## COBERTURA Y MATERIALIDAD

### Estimado de cuentas totales ALF

| Archivo | Filas totales | Estimado leaf accounts (sin subtotales) |
|---------|---------------|----------------------------------------|
| Balance Foods.xlsx (ESF) | 366 | ~120–180 códigos 1.xx/2.xx/3.xx distintos |
| EERR Julio (ERI período) | 90 | ~55–65 códigos 4.xx–9.xx |
| EERR Acumulado (ERI YTD) | 175 | ~mismos códigos, diff amounts |
| **Total estimado** | — | **~175–245 leaf accounts únicos** |

### Cobertura actual — post F.3 aprobado

| Métrica | Valor | Nota |
|---------|-------|------|
| Cuentas en `acc_chart_mapping` hoy | 0 | F.3 aún HOLD |
| Cuentas READY para insertar (F.3) | 4 | los 4 AC-04 observed |
| Cobertura % por cuenta post F.3 | ~1.6–2.3% | 4 / ~175–245 |
| Cuentas pendientes (estimado) | ~171–241 | emergen del primer batch |

### Cobertura por valor estimado (post F.3)

| Cuenta | Reporting Account | Peso en ERI | Estimado % valor cubierto |
|--------|------------------|-------------|--------------------------|
| `4.01.01.002` VENTA CEREZAS EXPORTACION | ING | 80–95% revenue ALF | **~80–95% de ingresos** |
| `6.11.01.010` SUELDOS Y SALARIOS | GOPEX | ~25–40% gastos op | **~25–40% de gastos** |
| `6.11.07.290` GASTOS BANCARIOS | GOPEX | <2% gastos op | <2% de gastos |
| `6.11.07.310` SEGUROS | GOPEX | ~2–5% gastos op | ~2–5% de gastos |

**Nota crítica:** el monto de ING cubierto es alto (~80–95%) porque `4.01.01.002` = principal fuente de revenue ALF. El mapa de gastos es incompleto (faltan costos de venta 5.xx, gastos 6.xx adicionales, EGRESOS NO OP 8.xx). La completitud real emerge del primer batch.

### Cómo se completa el mapping (sin extracción manual)

```
1. F.3 aprobado → 4 cuentas insertadas en acc_chart_mapping
2. OA-024-09 autorizado → primer batch: Balance Foods.xlsx cargado
3. fn_acc_mapping_completeness(batch_id) → lista exacta de cuentas con
   valor ≠ 0 sin mapping → REVIEW list para CFO
4. Level 1 classifier cubre automáticamente ~80% de esas cuentas
5. Ambigüedades (~20%) → CFO confirma cuenta por cuenta
6. 0 cuentas unmapped materiales → PILOT ALF = READY
```

---

## CRITICAL PATH — ACTUALIZADO POST-PRODUCCIÓN

```
CRITICAL PATH (secuencia serializada)
══════════════════════════════════════════════════════════════════════
[DONE]  D8-ALF CONFIRMED = USD                          (2026-08-19, CFO)
[DONE]  018_alf_accounting_profile.sql READY            (2026-08-19)
[DONE]  F.1: acc_base_profile INSERT ejecutado PROD     (2026-08-19, BLOQUE 1 PASS)
[DONE]  F.2: acc_entity_config INSERT ejecutado PROD    (2026-08-19, BLOQUE 2 PASS)
[DONE]  BLOQUE 4 AccountingProfile verificado PROD      (2026-08-19, PASS)
[HOLD]  F.3: 4 chart_mapping INSERTs                    ← STEP FOR ANGELO
        → aprobar tabla de mapping (ver §F.3 arriba)
        → ejecutar BLOQUE 3 en SQL Editor post-aprobación
[GATE]  PILOT ALF = READY (criteria en OA-024-08A §I)
        Requiere: F.3 done + primer batch loaded + mappings completos
[NEXT]  OA-024-09 — PostingPipeline UI
        (NO AUTORIZADO — requiere CFO go-ahead explícito separado)

PARALLEL WORK (no bloquean critical path)
══════════════════════════════════════════
[TODO]  019_alf_acc_period_seed.sql — 12 períodos 2026 para ALF
        → independiente de F.3, preparable ahora
[TODO]  D8 + entity_config para ALS (Allegria Service) — migration 020
[TODO]  D8 + entity_config para INT (Integrity Farms) — migration 021
[TODO]  dim_value seeds (CC/TMP/ESP) para AGR layer — migration 022
[DONE]  ALF-CONTEC-MAPPING-PROPOSAL-v1.csv (Level 1, 50 entries)
[DONE]  ALF-CONTEC-MAPPING-PROPOSAL-v2.csv (v2 con campos extendidos)
[DONE]  AGR-ACCOUNTING preflight completo

BLOCKED
══════════════════════════════════════════
[BLOCK] OA-024-09 — no autorizado
[BLOCK] Cargar Balance Foods.xlsx / EERR reales en producción
[BLOCK] acc_account_balance posting (requiere OA-024-09)

DEFERRED
════════
[DEF]   EEFF desde acc_* → post OA-024-09
[DEF]   Réplica multiempresa (ALS, INT, APC, APP) → post-piloto ALF
[DEF]   AGR integration (dim_value → journal_line)
[DEF]   D7 ownership → OPEN, no bloquea
```

---

## STEP FOR ANGELO — ACCIÓN REQUERIDA

**Estado:** F.1 + F.2 ejecutados y confirmados. AccountingProfile ALF = COMPLETE.

**Acción pendiente: aprobar F.3 mapping.**

Revisar la tabla de decisión §F.3 arriba, específicamente:

> **`6.11.07.290 GASTOS BANCARIOS`** — Contec lo clasifica como GASTOS DE ADM. Y VENTAS (no EGRESOS NO OP), lo que apunta a comisiones bancarias operativas (→ GOPEX). Si confirmas que no mezcla intereses: GOPEX ok.

Si apruebas los 4 mappings como propuestos:
1. Abrir SQL Editor: `https://supabase.com/dashboard/project/bywovqayuzodbzwsriet`
2. Abrir `src/accounting/migrations/018_alf_accounting_profile.sql`
3. Descomentar y copiar el BLOQUE 3 (entre `/*` y `*/`)
4. Pegar en SQL Editor → ejecutar
5. Verificar post-check: 4 rows en `acc_chart_mapping` para ALF
6. Reportar output

---

## CHANGELOG

| # | Fecha | Cambio |
|---|-------|--------|
| 1 | 2026-08-19 | Creación: D8-ALF CLOSED/USD, F.1/F.2 READY |
| 2 | 2026-08-19 | **BLOQUE 1 PASS** (F.1 acc_base_profile ejecutado producción) |
| 3 | 2026-08-19 | **BLOQUE 2 PASS** (F.2 acc_entity_config ejecutado producción) |
| 4 | 2026-08-19 | **BLOQUE 4 PASS** (AccountingProfile JOIN verificado producción) |
| 5 | 2026-08-19 | F.3 4-account review detallado con análisis evidence-based para `6.11.07.290` |
| 6 | 2026-08-19 | ALF-CONTEC-MAPPING-PROPOSAL-v2.csv generado |

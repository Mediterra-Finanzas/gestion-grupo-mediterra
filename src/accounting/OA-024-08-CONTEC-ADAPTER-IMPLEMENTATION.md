# OA-024-08 — ContecAdapter Implementation

**Fecha:** 2026-08-18  
**Autorización:** CFO Angelo Huerta — "OA-024-08 PREFLIGHT = APPROVED / READY"  
**Rama:** claude/crazy-heisenberg-f33f7a  
**Estado:** IMPLEMENTADO — pendiente ejecución 016 en Supabase + ejecución 017  
**Entidad piloto:** ALF (Allegria Foods)

---

## A. Schema Changes

### Tabla nueva: `acc_source_balance_detail`

Preserva el detalle granular de cada fila del archivo fuente Contec, incluyendo el eje Centro de Costo (EERR) que no cabe en `acc_account_balance` (UNIQUE por account/period, sin dimensión CC).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | BIGINT IDENTITY PK | |
| `batch_id` | UUID → acc_source_batch ON DELETE RESTRICT | FK con RESTRICT (no borrar batch con detail) |
| `source_row_ref` | TEXT NOT NULL | Fila exacta en el Excel: `"row:14"`, `"sheet:EERR:row:14"` |
| `source_report_type` | TEXT NOT NULL | `'balance'` / `'eerr_periodo'` / `'eerr_acumulado'` |
| `source_account_code` | TEXT NOT NULL | Código de cuenta del archivo fuente |
| `source_account_name` | TEXT | Nombre de cuenta del archivo fuente |
| `cost_center_code` | TEXT | EERR col F; NULL para Balance. Preservado exacto. |
| `nature` | TEXT | EERR col A (INGRESOS / GASTOS…); NULL para Balance |
| `class` | TEXT | EERR col B; NULL para Balance |
| `subclass` | TEXT | EERR col C; NULL para Balance |
| `actual_amount` | NUMERIC(18,2) | EERR col G (Real); NULL para Balance |
| `budget_amount` | NUMERIC(18,2) | EERR col H (Ppto) — NO se postea a acc_account_balance |
| `variance_amount` | NUMERIC(18,2) | EERR col I; NULL para Balance |
| `ytd_debit` | NUMERIC(18,2) | Balance col C (Debe YTD); NULL para EERR |
| `ytd_credit` | NUMERIC(18,2) | Balance col D (Haber YTD); NULL para EERR |
| `debit_balance` | NUMERIC(18,2) | Balance col G (inv_activo → debit_balance) |
| `credit_balance` | NUMERIC(18,2) | Balance col H (inv_pasivo → credit_balance) |
| `source_currency` | CHAR(3) NOT NULL DEFAULT 'USD' | D8 open; ALF = USD en V1 |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Append-only: sin updated_at intencional |

**Constraint:** `ck_asbd_report_type` — CHECK(source_report_type IN ('balance','eerr_periodo','eerr_acumulado'))

**Indexes:** idx_asbd_batch_id, idx_asbd_batch_account, idx_asbd_batch_cc (WHERE CC IS NOT NULL), idx_asbd_batch_report_type.

### Columnas nuevas en `acc_source_batch`

| Columna | Tipo | Descripción |
|---|---|---|
| `storage_bucket` | TEXT | CHECK IN ('accounting-source'); NULL hasta completar upload |
| `storage_path` | TEXT | Path completo en bucket: `{entity_uuid}/{year}/{period}/{batch_id}/{filename}` |
| `mime_type` | TEXT | Tipo MIME del archivo (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) |
| `file_size_bytes` | BIGINT | CHECK > 0; NULL hasta completar upload |

**Campos preexistentes reutilizados:**
- `file_name` → original_file_name (ya existía, TEXT NOT NULL desde 008)
- `file_hash` → SHA-256 de identidad (ya existía, TEXT UNIQUE desde 008)

### Archivos de migration

| Archivo | Estado |
|---|---|
| [`migrations/016_contec_adapter_infra.sql`](migrations/016_contec_adapter_infra.sql) | Creado — PENDIENTE EJECUCIÓN en Supabase |
| [`migrations/017_contec_adapter_tests.sql`](migrations/017_contec_adapter_tests.sql) | Creado — ejecutar DESPUÉS de 016 |

---

## B. Storage Implementation

**Decisión CFO (AC-05 CLOSED):** Bucket `accounting-source` — privado, signed URLs.

**Bucket a crear manualmente en Supabase Storage:**
- Nombre: `accounting-source`
- Tipo: PRIVATE
- Sin acceso público

**Path convention:**
```
{entity_uuid}/{fiscal_year}/{period_code}/{batch_id}/{original_filename}
```

Ejemplo ALF, enero 2026:
```
<alf-entity-uuid>/2026/2026-01/<batch-uuid>/Balance Foods.xlsx
```

**Inmutabilidad del path:** Una vez que el batch alcanza estado `POSTED`, los campos `storage_path` y `storage_bucket` son inmutables (no hay trigger DB que lo fuerce en V1 — es una convención de la capa de aplicación; en V2 se puede añadir trigger similar a `trg_asbi_immutable`).

**Identificación de archivo:** `file_hash` (SHA-256) previene re-upload del mismo archivo (`UNIQUE` constraint en acc_source_batch).

---

## C. ContecAdapter Structure

**Archivo:** [`src/accountingAdapters/ContecAdapter.js`](../accountingAdapters/ContecAdapter.js)

**Tipo:** Módulo de transformación puro — sin I/O, sin Supabase, sin imports de otros módulos de la app.

**Entrada:** filas del worksheet como array-of-arrays (compatible con xlsx-js-style / SheetJS).

**Salida:** objetos JS normalizados listos para INSERT en acc_source_balance_detail y acc_account_balance.

### Exports públicos

| Función/Constante | Descripción |
|---|---|
| `BALANCE_COL` | Mapa frozen: índices 0-based del Balance (10 cols, A-J) |
| `EERR_COL` | Mapa frozen: índices 0-based del EERR (9 cols, A-I) |
| `RECONCILIATION_TOLERANCE` | `0.01` — tolerancia aritmética para invariante de lineage |
| `REPORT_TYPES` | `{ BALANCE, EERR_PERIODO, EERR_ACUMULADO }` — constantes de tipo |
| `parseBalanceContec(rows)` | Parser ESF |
| `parseEerrContec(rows, sourceReportType)` | Parser EERR |
| `aggregateEerrToCanonical(sourceRows)` | CC → canónico (EERR) |
| `aggregateBalanceToCanonical(sourceRows)` | ESF → canónico |
| `validateAggregateInvariant(sourceRows, canonicalRows)` | Verifica lineage invariant |
| `deriveMonthlyFromYtd(currentRows, priorRows, opts)` | Derivación mensual desde YTD |
| `detectReportType(rows)` | Heurística de tipo por estructura |
| `buildMappingIssues(canonicalRows, mappingFn)` | Genera BatchIssueSpec[] para SRC_ACCOUNT_UNMAPPED |

---

## D. Balance Parser

**Función:** `parseBalanceContec(rows)` → `BalanceSourceRow[]`

**Formato Contec Balance (10 columnas, confirmado AC-04, Balance Foods.xlsx 366 filas):**

| Col | Idx | Campo | Descripción |
|---|---|---|---|
| A | 0 | CODE | Código de cuenta (`1.01.01.001`) o grupo (`1.00.00.000`) |
| B | 1 | NAME | Nombre de cuenta o grupo |
| C | 2 | DEBE_YTD | Movimientos Debe YTD (brutos acumulados) |
| D | 3 | HABER_YTD | Movimientos Haber YTD (brutos acumulados) |
| E | 4 | SALDO_D | Saldo deudor intermedio |
| F | 5 | SALDO_A | Saldo acreedor intermedio |
| G | 6 | INV_ACTIVO | Inventario Activo → **debit_balance** (columna principal) |
| H | 7 | INV_PASIVO | Inventario Pasivo → **credit_balance** (columna principal) |
| I | 8 | RES_PERDIDA | Resultado Pérdida (solo cuentas ER) |
| J | 9 | RES_GANANCIA | Resultado Ganancia (solo cuentas ER) |

**Filas filtradas (no ingresan a source detail):**
- Código vacío (cabeceras de sección)
- Código terminado en `.000` (filas de grupo/subtotal)
- Filas donde G=0 AND H=0 AND C=0 AND D=0 (sin actividad)

**Columnas leídas por parser V1:** G (debit_balance), H (credit_balance), C (ytd_debit), D (ytd_credit)  
**Columnas E, F, I, J:** reservadas para V2 / análisis específico

---

## E. EERR Parser

**Función:** `parseEerrContec(rows, sourceReportType)` → `EerrSourceRow[]`

**Formato Contec EERR (9 columnas, confirmado AC-04, dos archivos):**

| Col | Idx | Campo | Descripción |
|---|---|---|---|
| A | 0 | NATURALEZA | INGRESOS / GASTOS DE ADM. Y VENTAS / EGRESOS NO OPERACIONALES |
| B | 1 | CLASE | Subtítulo de clase o **marcador de subtotal** |
| C | 2 | SUBCLASE | Sub-clase de la cuenta |
| D | 3 | CODIGO | Código de cuenta (`6.11.01.010`) |
| E | 4 | NOMBRE | Nombre de cuenta (`SUELDOS Y SALARIOS`) |
| F | 5 | CC | Centro de Costo (`ADMINISTRACION Y FINANZAS`, `OPERACIONES`, etc.) |
| G | 6 | REAL | Monto real del período (o acumulado YTD) |
| H | 7 | PPTO | Presupuesto |
| I | 8 | VARIANZA | G − H |

**Filas filtradas:**
- Col B contiene: `'Total Sub Clase'`, `'Total Clase'`, `'Total Naturaleza'`, `'RESULTADO FINAL'`
- Col D vacío (fila de cabecera no detectada por subtotal)
- REAL = 0 AND PPTO = 0 (sin información)

**Retorna una fila por (account_code × cost_center)** — sin agregación. El parser preserva la granularidad CC completa.

**EERR Mensual manual (`parseEerrMensualContec` en anfParser.js):** Función diferente para un formato distinto (múltiples columnas de período, ensamblado manual). No relacionada con el parser nativo Contec de esta sección.

---

## F. Source Detail Model

Diseño de `acc_source_balance_detail` como tabla append-only de evidencia:

**Invariante de lineage (principal):**
```
SUM(actual_amount WHERE batch_id = X AND source_account_code = Y)
= acc_account_balance.net_balance WHERE source_batch_id = X AND account_code = Y
```
dentro de `RECONCILIATION_TOLERANCE = 0.01` en moneda fuente.

**Para Balance (ESF):** la relación es 1:1 (sin CC múltiple). `debit_balance` y `credit_balance` mapean directamente desde cols G y H.

**Para EERR:** N filas por account_code (una por CC). `actual_amount` en source; `net_balance` en canónico = SUM.

**Append-only:** Sin `updated_at`. Las filas de un batch `POSTED` son inmutables (no hay trigger en V1; la capa de aplicación debe respetar esto).

**Budget excluido del canonical:** `budget_amount` (EERR col H) se preserva en source detail para trazabilidad pero NO se postea a `acc_account_balance` (`balance_type='budget'` está en scope `pln_*`, fuera de OA-024-08).

---

## G. Aggregation Contract

### EERR — `aggregateEerrToCanonical(sourceRows)` → `CanonicalBalanceRow[]`

Agrupa por `source_account_code`, suma `actual_amount`. El resultado es el valor a postear en `acc_account_balance.net_balance`.

```
canonical.net_balance = SUM(sourceRow.actual_amount) para todas las filas del mismo account_code
```

**Nota de signos:** En el EERR Contec, gastos e ingresos aparecen como positivos. La distinción débito/crédito en acc_account_balance se resuelve por el tipo de cuenta en `acc_chart_mapping`, no en el adapter. En V1, `debit_balance = max(sum, 0)` y `credit_balance = max(-sum, 0)`.

### Balance — `aggregateBalanceToCanonical(sourceRows)` → `CanonicalBalanceRow[]`

Transform 1:1. `debit_balance = col G`, `credit_balance = col H`, `net_balance = G - H`.

### Validación post-aggregation

`validateAggregateInvariant(sourceRows, canonicalRows)` lanza `Error` detallado si alguna cuenta tiene `|source_sum - canonical.net_balance| > 0.01`. Se ejecuta antes de construir los issues de mapping.

---

## H. Mapping

**Función:** `buildMappingIssues(canonicalRows, mappingFn)` → `BatchIssueSpec[]`

- `mappingFn: (account_code: string) => boolean` — callback que consulta `acc_chart_mapping` para la entidad
- Solo genera issue si `|net_balance| >= RECONCILIATION_TOLERANCE` (saldo cero sin mapping no bloquea)
- Issue generado: `severity='ERROR'`, `issue_code='SRC_ACCOUNT_UNMAPPED'`
- Función del DB `fn_acc_mapping_completeness(batch_id)` (creada en 014) retorna las cuentas sin mapping para un batch — se puede usar como fuente de `mappingFn`

**Efecto:** Un issue `ERROR` no resuelto no bloquea el batch por sí solo (solo `FATAL` bloquea el gate `PENDING_APPROVAL → APPROVED`). Sin embargo, una cuenta sin mapping no puede posteen en `acc_account_balance` — el posting pipeline debe saltar/reportar esas cuentas. En V1, el batch no avanza a `POSTED` si hay cuentas no mapeadas con saldo.

---

## I. YTD / Monthly Derivation

**Contexto:** Contec genera EERR acumulado (YTD) nativo. El EERR mensual aislado es un formato ensamblado manualmente; no se exporta directamente.

**Función:** `deriveMonthlyFromYtd(currentRows, priorRows, opts)` → `EerrSourceRow[]`

**Fórmula:** `monthly = current_ytd - prior_ytd` por (account_code × cost_center_code)

**Caso especial enero:** `isJanuary = true` → `monthly = current_ytd` directamente (no hay acumulado del mes anterior en el mismo ejercicio).

**Guard fiscal year crossing:**
```javascript
if (!isJanuary && currentFiscalYear && priorFiscalYear && currentFiscalYear !== priorFiscalYear) {
  throw new Error(...)
}
```
Previene derivar restando diciembre de un ejercicio contra enero del siguiente (cruce de año fiscal).

**Clave de agregación prior:** `(source_account_code, cost_center_code)` — los CC deben coincidir entre períodos para que la derivación sea correcta.

**Campos añadidos en las rows derivadas:**
- `derived_from_ytd: true` — flag de trazabilidad
- `prior_ytd_amount: number` — acumulado del período prior (para auditoría)

---

## J. Validation / Reconciliation

### Pipeline de validación (antes de posting)

1. **Parse** — `parseBalanceContec` / `parseEerrContec` → `sourceRows[]`
2. **Aggregate** — `aggregateEerrToCanonical` / `aggregateBalanceToCanonical` → `canonicalRows[]`
3. **Invariant check** — `validateAggregateInvariant(sourceRows, canonicalRows)` — throws si diff > 0.01
4. **Mapping check** — `buildMappingIssues(canonicalRows, mappingFn)` → `issues[]`
5. **FATAL gate** — si hay issues FATAL sin resolver, `trg_acc_source_batch_fatal_gate` bloquea la transición `PENDING_APPROVAL → APPROVED`
6. **Human approval** — `approved_by` obligatorio para transicionar a `APPROVED`
7. **Posting** — INSERT en `acc_source_balance_detail` + INSERT/UPSERT en `acc_account_balance`

### Tolerancia matemática

`RECONCILIATION_TOLERANCE = 0.01` — aplica a diferencias de redondeo en moneda fuente (USD). Diferencias mayores indican bug en el parser o en la exportación Contec.

### Reconciliación Balance ESF

El Balance de Contec debe cuadrar internamente: `SUM(debit_balance) = SUM(credit_balance)` para cuentas del estado de situación financiera. Esta validación es responsabilidad del usuario al revisar el archivo fuente; el adapter no la impone (los saldos de cuentas ER en el Balance tienen estructura diferente).

---

## K. Security

### RLS en `acc_source_balance_detail`

| Política | Rol | Regla |
|---|---|---|
| `asbd_deny_anon` | anon | `USING (false)` — fail-closed |
| `asbd_authenticated_access` | authenticated | `USING (true)` — V1 broad |
| `asbd_service_role_all` | service_role | `USING (true) WITH CHECK (true)` |

### Bucket `accounting-source`

- Privado (sin acceso público)
- Acceso vía signed URLs (`supabase.storage.from('accounting-source').createSignedUrl(path, ttl)`)
- Solo roles autenticados con `service_role` o `authenticated` pueden generar URLs firmadas

### Pattern heredado

El patrón RLS authenticated broad (V1) es consistente con el resto del sistema contable (acc_account_balance, acc_period, etc.). La granularización a roles específicos (importer, approver, auditor por entidad) está marcada en `DT-007-01` para OA-024-09.

---

## L. Tests

### Suite: `017_contec_adapter_tests.sql` — 23 tests

**Fixtures: SINTÉTICOS exclusivamente. Sin datos financieros reales.**

| CAT | Tests | Scope |
|---|---|---|
| CAT-10: Schema integrity | 1001–1008 (8) | Tabla acc_source_balance_detail, columnas (19), FK, CHECK, storage cols (4), CHECK storage_bucket, indexes (4) |
| CAT-11: Constraints & RLS | 1101–1106 (6) | RLS habilitado, anon DENY, service_role ALL, ON DELETE RESTRICT, ck_asbd_report_type, ck_asb_storage_bucket |
| CAT-12: Lineage invariant | 1201–1205 (5) | 2 filas Balance insertadas, 3 CC EERR misma cuenta, SUM(CC)=canonical, campos storage correctos, limpieza residuos |
| CAT-13: Pilot ALF readiness | 1301–1304 (4) | core_entities ALF completa, profile ALF/contec existe, D8 funcional_currency (WARN si NULL), acc_chart_mapping ALF (WARN si vacío) |

**Nota CAT-13:** Los tests 1303 y 1304 emiten `RAISE NOTICE ... WARN` en vez de `RAISE EXCEPTION FAIL` — son gates de readiness para el piloto financiero real, no tests de schema. La suite no falla por ellos pero reporta el bloqueo.

---

## M. Regression

**OA-024-07 tests (`015_source_adapter_tests.sql`):** 33/33 PASS (2026-08-18).  
**OA-024-05 tests (`012_test_suite.sql`):** 37/37 PASS (2026-08-18).

### Backward compatibility ANF

- `parseEerrMensualContec` en `anfParser.js` — función diferente, formato diferente (multi-columna mensual, ensamblado manual). No modificada.
- `anf_saldos_esf`, `anf_movimientos_er` — tablas legacy, no modificadas.
- Reporting legacy ANF — no modificado.
- Tests ANF existentes (si los hay) — no afectados.

**Regla:** No modificar `anfParser.js` destructivamente. El ContecAdapter es un módulo nuevo, separado.

---

## N. Pilot ALF Readiness

### Estado actual (2026-08-18)

| Gate | Estado | Detalle |
|---|---|---|
| `core_entities` ALF | PASS | code='ALF', country='CL', tax_identifier presente |
| `acc_source_adapter_profile` ALF/contec | PASS | seed insertado en 014 con CapabilitySet AC-04 |
| `acc_chart_mapping` ALF | WARN | Verificar con TEST-1304 tras ejecutar 016 |
| D8 functional_currency ALF | WARN | Verificar con TEST-1303 tras ejecutar 016 |
| Bucket `accounting-source` | PENDIENTE | Crear manualmente en Supabase Storage |
| Migration 016 ejecutada | PENDIENTE | Ejecutar en SQL Editor |
| Tests 017 (23) PASS | PENDIENTE | Ejecutar después de 016 |

### Pasos para piloto financiero real (segundo GO)

Un segundo GO explícito del CFO es requerido antes de cargar `Balance Foods.xlsx` y los EERR reales. El reporte previo al segundo GO debe incluir:

```
PILOT ALF = READY / BLOCKED
- 017 tests: 23/23 PASS ✓
- D8 ALF: functional_currency = USD ✓ / NULL ✗
- acc_chart_mapping ALF: N cuentas mapeadas ✓ / 0 ✗
- Bucket accounting-source: creado ✓ / pendiente ✗
```

---

## O. Outstanding D7 / D8

### D7 — Tipo jurídico (SIGUE ABIERTO)

**Entidades con tipo ambiguo:** APC (Allpa Farms Chile), APP (Allpa Farms Perú), ARR, MES, MON.  
**Impacto OA-024-08:** Ninguno. ALF está confirmada como entidad de consolidación línea-a-línea.  
**Restricción:** No inferir tipo jurídico de `nci_pct` legacy. `core_entities` debe ser corporativamente neutro.

### D8 — Moneda funcional (SIGUE ABIERTO — no bloquea ALF)

**Entidades con functional_currency = NULL:** a confirmar por CFO.  
**ALF específicamente:** Si `capability_set->>'functional_currency'` en el profile ALF/contec es `'USD'`, el piloto ALF procede. Si es NULL, el posting queda bloqueado hasta resolución.  
**D8 NO bloquea OA-024-08 globalmente** — solo bloquea el piloto real de entidades específicas con NULL.  
**Restricción:** No migrar monedas automáticamente. No modificar OA-023 Currency Domain.

---

## P. GO / NO-GO Next Step

### Criterios de STABLE para OA-024-08

| Criterio | Método de verificación |
|---|---|
| 016 ejecutado sin errores | SQL Editor — sin EXCEPTION |
| 017: 23/23 PASS (incluye WARN en 1303/1304) | Verificar con RAISE NOTICE count |
| 012: 37/37 PASS (no regresión OA-024-05) | Sin RAISE EXCEPTION |
| 015: 33/33 PASS (no regresión OA-024-07) | Sin RAISE EXCEPTION |
| ContecAdapter.js compila sin error | `CI=true npm run build` |
| Bucket `accounting-source` creado | Supabase Storage → panel |

### Pendiente ejecución por CFO (actions en Supabase)

1. **Crear bucket** `accounting-source` (privado) en Supabase Storage
2. **Ejecutar** `016_contec_adapter_infra.sql` en SQL Editor
3. **Ejecutar** `017_contec_adapter_tests.sql` — confirmar 23/23 PASS + revisar WARN de 1303/1304
4. **Ejecutar** `015_source_adapter_tests.sql` — confirmar 33/33 PASS (no regresión)
5. **Ejecutar** `012_test_suite.sql` — confirmar 37/37 PASS (no regresión)

### GO para OA-024-09

**STOP — NO iniciar OA-024-09 automáticamente.**

Una vez OA-024-08 = STABLE y el CFO haya confirmado el reporte `PILOT ALF = READY / BLOCKED`, se puede abrir OA-024-09 (PostingPipeline + integración UI).

---

## Archivos producidos en OA-024-08

| Archivo | Descripción |
|---|---|
| [`migrations/016_contec_adapter_infra.sql`](migrations/016_contec_adapter_infra.sql) | Migration: acc_source_balance_detail + storage cols + RLS |
| [`migrations/017_contec_adapter_tests.sql`](migrations/017_contec_adapter_tests.sql) | 23 tests OA-024-08 (CAT-10 a CAT-13) |
| [`../accountingAdapters/ContecAdapter.js`](../accountingAdapters/ContecAdapter.js) | Adapter puro: parsers Balance+EERR, agregación, validación, derivación YTD, mapping issues |
| [`OA-024-08-PREFLIGHT-CONTEC-READINESS.md`](OA-024-08-PREFLIGHT-CONTEC-READINESS.md) | PREFLIGHT doc (sections A–M) — decisiones tomadas |
| [`OA-024-08-CONTEC-ADAPTER-IMPLEMENTATION.md`](OA-024-08-CONTEC-ADAPTER-IMPLEMENTATION.md) | Este documento |

---

**Última actualización:** 2026-08-18 — Implementación completa pendiente ejecución 016+017 en Supabase.

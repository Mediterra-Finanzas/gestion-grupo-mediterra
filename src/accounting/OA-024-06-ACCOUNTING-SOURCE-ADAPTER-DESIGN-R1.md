# OA-024-06 — Accounting Source Adapter Framework
## Design R1 — Addendum y cierre de OPEN DECISIONS

**Fecha:** 2026-08-14  
**Estado:** PENDING CFO GATE — AC-04 BLOCKED  
**Predecesor:** OA-024-06-R0 (base aprobada como punto de partida)  
**Rama:** claude/crazy-heisenberg-f33f7a

> **Cómo leer este documento:** R1 es un addendum. No repite las 35 secciones de R0.
> Donde R1 contradice R0, R1 manda. Las secciones no mencionadas aquí permanecen inalteradas.

---

## HALLAZGOS PREVIOS A R1 (grounding adicional)

### H1 — Schema real de `acc_account_balance` (008_accounting_tables_apply.sql L454-471)

El schema desplegado en Etapa 0 tiene:

```sql
acc_account_balance (
  debit_balance   NUMERIC(18,2) NOT NULL DEFAULT 0,  -- saldo deudor del balance
  credit_balance  NUMERIC(18,2) NOT NULL DEFAULT 0,  -- saldo acreedor
  net_balance     NUMERIC(18,2) NOT NULL DEFAULT 0,  -- debit_balance - credit_balance
  balance_type    TEXT          NOT NULL DEFAULT 'actual',
  -- CHECK ('actual', 'budget', 'forecast', 'prior_year')
)
```

**No existen** campos `opening_balance`, `closing_balance`, `period_debit`, `period_credit` en la tabla actual.

### H2 — Semántica de debit_balance / credit_balance

`debit_balance` y `credit_balance` en `acc_account_balance` representan los **lados del balance de comprobación** (trial balance columns), NO los movimientos brutos del período. Es la distinción contable clásica:

| Campo | Semántica | Fuente Contec |
|-------|-----------|---------------|
| `debit_balance` | Saldo deudor acumulado del período | `inventario_activo` |
| `credit_balance` | Saldo acreedor acumulado del período | `inventario_pasivo` |
| `net_balance` | debit_balance − credit_balance | `inventario_activo − inventario_pasivo` |

**Esto NO es lo mismo que:**
- `period_debit` = movimientos deudores brutos del período
- `period_credit` = movimientos acreedores brutos del período

La corrección de OD-001 de Angelo es matemáticamente correcta: no se pueden derivar movimientos brutos a partir de dos saldos netos consecutivos. La buena noticia es que la tabla ACTUAL ya evita el problema: almacena posición del balance, no flujos brutos.

### H3 — `balance_type='budget'` ya existe en el schema

El CHECK constraint actual permite `'actual', 'budget', 'forecast', 'prior_year'`. Esto contradice OD-004. R1 documenta la contradicción y establece la regla de V1.

### H4 — AC-04: fixtures SINTÉTICOS, no validados contra Excel real

```
src/anf/__fixtures__/allegria-contec-jun2026.js  → datos SINTÉTICOS (declarado explícitamente)
src/anf/__fixtures__/frisku-megasystem-jun2026.js → datos SINTÉTICOS (REAL_AGGREGATES solo valida totales Supabase)
```

`parsearInformeANF` no tiene tests unitarios porque "requiere un archivo File real (File API del browser). Se testará en integración (Fase 2)." No existe ningún Excel Contec real en el repo.

**Conclusión AC-04:** BLOCKED — REAL CONTEC SAMPLE REQUIRED.

---

## SECCIÓN 1 — OD-001 CORREGIDO Y CERRADO

### 1.1 Corrección matemática (aceptada)

A partir de dos saldos netos consecutivos (`closing_t-1`, `closing_t`) solo puede derivarse:

```
net_movement = closing_t - closing_t-1
```

Esta derivación **no puede descomponerse** en `gross_debits` vs `gross_credits` del período.  
Ejemplo:
```
closing_t-1 = 100, closing_t = 120 → net_movement = +20

Puede haber ocurrido:
  debit=20,   credit=0     → neto +20  ✓
  debit=1020, credit=1000  → neto +20  ✓
  (infinitas combinaciones)
```

**Regla permanente:** no fabricar `period_debit` / `period_credit` a partir de diferencia de saldos. El framework nunca hará esta inferencia.

### 1.2 Decisión CFO — Estrategia híbrida

#### Cuentas de ESF (Balance Sheet)

El export Contec entrega `inventario_activo` e `inventario_pasivo` como saldos del trial balance. El mapeo a `acc_account_balance` es directo:

```
debit_balance  = inventario_activo    (saldo deudor del trial balance)
credit_balance = inventario_pasivo   (saldo acreedor)
net_balance    = inventario_activo − inventario_pasivo
balance_type   = 'actual'
```

Estos son POSICIONES (saldo acumulado a la fecha de corte), no flujos brutos del período.

**Opening balance:**
- Primer período de carga: no existe registro anterior → `prior_net_balance = NULL` (derivado en query)
- Períodos posteriores: `opening_balance_derivado = net_balance de (entity, period_anterior, account_code, 'actual')`

**Net movement (solo para análisis — NUNCA almacenar como dato propio):**
```
net_movement = net_balance_T − net_balance_T-1
```
Esta derivación es válida para análisis de variación. No persiste en la tabla.

#### Cuentas de EERR (P&L — vía EERR MENSUAL)

Contec entrega el movimiento neto del mes por cuenta. El campo es `real_mes` o equivalente en el parser. Para cada mes disponible en el archivo:

```
Para cuentas de naturaleza acreedora (ingresos — prefijo 4.xx, 7.xx):
  debit_balance  = 0
  credit_balance = real_mes
  net_balance    = −real_mes   (negativo: la cuenta tiene saldo acreedor)

Para cuentas de naturaleza deudora (costos/gastos — prefijo 5.xx, 6.xx, 8.xx, 9.xx):
  debit_balance  = real_mes
  credit_balance = 0
  net_balance    = +real_mes   (positivo: la cuenta tiene saldo deudor)
```

Un archivo EERR MENSUAL genera N × M filas en `acc_account_balance` (N cuentas × M meses cubiertos), una fila por (entity, period_id, account_code).

**Nota:** El `real_mes` de EERR MENSUAL es el movimiento del período (no acumulado). Es semánticamente diferente al saldo acumulado del trial balance ESF. El campo `balance_type='actual'` aplica a ambos. La distinción la hace el account_code y su clasificación (ESF vs EERR), no un campo extra.

### 1.3 Campos del BalanceImportRecord — Versión corregida

Eliminar del diseño R0 los campos que no existen en Contec ni en el schema actual:

```javascript
// CORRECCIÓN R1 — BalanceImportRecord (Mode 2)
{
  source_account_code:  "1.01.01.001",   // código en el ERP origen
  account_name:         "Banco BICE CLP",

  // POSICIÓN DE TRIAL BALANCE (para ESF)
  trial_balance_debit:  150_000,         // inventario_activo de Contec
  trial_balance_credit: 0,               // inventario_pasivo de Contec
  // → net_balance = trial_balance_debit − trial_balance_credit (calculado al postear)

  // ACTIVIDAD MENSUAL (para EERR MENSUAL)
  period_net_amount:    null,            // real_mes del EERR MENSUAL (si aplica)
  // → se usa cuando trial_balance_debit/credit son NULL (cuentas ER por mes)

  // Una sola de las dos semánticas aplica por cuenta y tipo de reporte:
  // ESF:         trial_balance_debit + trial_balance_credit presentes; period_net_amount=null
  // EERR mensual: trial_balance_debit=null, credit=null; period_net_amount presente

  source_report_type:   "balance_sheet", // 'balance_sheet' | 'monthly_pnl' | 'ytd_pnl'
  transaction_currency: "CLP",           // ver Sección 9 (multicurrency)
  granularity_level:    "trial_balance", // 'trial_balance' | 'period_activity'

  // ELIMINADOS DE R0 (no existen en Contec ni en schema):
  // opening_balance:      ← no disponible en export Contec actual
  // period_debit:         ← fabricación → PROHIBIDO
  // period_credit:        ← fabricación → PROHIBIDO
  // closing_balance:      ← renombrado: trial_balance_debit/credit o period_net_amount
  // budget_period_debit:  ← eliminado (OD-004: pln_*)
  // budget_period_credit: ← eliminado
  // monthly_breakdown:    ← no en el registro individual; manejado por EERR MENSUAL
}
```

### 1.4 Posting a `acc_account_balance` — Mapeo completo

```sql
-- Para cuenta ESF (source_report_type='balance_sheet')
INSERT INTO acc_account_balance (
  entity_id, period_id, account_code, reporting_account_id,
  debit_balance, credit_balance, net_balance,
  currency, balance_type, source_batch_id
) VALUES (
  $entity_id,
  $period_id,            -- período de corte (mes del balance)
  $source_account_code,
  $resolved_reporting_account_id,   -- NULL si no hay mapping (ver Sección 12)
  $trial_balance_debit,             -- inventario_activo
  $trial_balance_credit,            -- inventario_pasivo
  $trial_balance_debit - $trial_balance_credit,  -- net_balance
  $currency,             -- de acc_entity_config.accounting_book_currency
  'actual',
  $batch_id
);

-- Para cuenta EERR mensual (source_report_type='monthly_pnl')
-- Un INSERT por mes presente en el archivo
INSERT INTO acc_account_balance (
  entity_id, period_id, account_code, reporting_account_id,
  debit_balance, credit_balance, net_balance,
  currency, balance_type, source_batch_id
) VALUES (
  $entity_id,
  $period_id_for_mes_N,           -- period_id del mes específico
  $source_account_code,
  $resolved_reporting_account_id,
  CASE WHEN $account_normal_balance = 'debit'  THEN $period_net_amount ELSE 0 END,
  CASE WHEN $account_normal_balance = 'credit' THEN $period_net_amount ELSE 0 END,
  CASE WHEN $account_normal_balance = 'debit'  THEN  $period_net_amount
       ELSE -$period_net_amount END,             -- neto con signo convencional
  $currency,
  'actual',
  $batch_id
);
```

**OD-001 = CLOSED.**

---

## SECCIÓN 2 — CapabilitySet CORREGIDO

El CapabilitySet debe expresar exclusivamente lo que la **fuente** provee, nunca lo que el framework puede derivar.

```javascript
// ContecAdapter — CapabilitySet corregido R1
capabilities() {
  return {
    // Granularidad
    granularity:           'trial_balance', // posición acumulada, NO asientos individuales
    journal_lines:         false,           // no entrega asientos
    document_reference:    false,           // no entrega N° comprobante
    counterparty:          false,           // no entrega RUT/nombre de tercero

    // Datos de posición (ESF — BALANCE sheet)
    trial_balance_debit:   true,            // inventario_activo
    trial_balance_credit:  true,            // inventario_pasivo

    // Datos de actividad (EERR — por cuenta y mes)
    period_net_activity:   true,            // real_mes en EERR MENSUAL
    ytd_cumulative:        true,            // real_ytd acumulado año calendario
    seasonal_breakdown:    true,            // desglose por meses de temporada (EERR TEMP)

    // Datos ausentes — NEVER declare as provided
    opening_balance:       false,           // R0 declaraba true — INCORRECTO
    period_debit_credit:   false,           // R0 declaraba true — INCORRECTO
    cost_centers:          false,           // no en export actual
    auxiliaries:           false,           // no
    transaction_currency:  false,           // no viene explícita por cuenta (ver Sección 9)

    // Budget — en el mismo archivo pero NO en el ledger contable
    budget_net_activity:   true,            // ppto_mes en EERR TEMP (→ pln_*, no acc_*)

    // Derived (declaradas explícitamente como DERIVED, no SOURCE-PROVIDED)
    derived: {
      net_movement_between_periods: true,   // = net_balance_T − net_balance_T-1
      // NUNCA: gross_debit_movement, gross_credit_movement
    }
  };
}
```

**Regla:** La UI que consuma CapabilitySet no debe ofrecer funciones basadas en valores `derived`. El drill-down a nivel de asiento no está disponible para ContecAdapter.

---

## SECCIÓN 3 — OD-002: ROLLBACK VÍA BATCH LIFECYCLE (CERRADO)

**Decisión:** `acc_account_balance` y `acc_journal_entry` permanecen inmutables. El estado lógico de cada registro se determina por el estado del `acc_source_batch` al que pertenece.

```sql
-- Query canónica: solo registros cuyo batch está POSTED
SELECT ab.*
FROM acc_account_balance ab
JOIN acc_source_batch sb ON sb.id = ab.source_batch_id
WHERE ab.entity_id = $entity_id
  AND ab.period_id = $period_id
  AND sb.status = 'POSTED';
```

**Rollback:** cuando `acc_source_batch.status` pasa a `'ROLLED_BACK'`:
- Los registros en `acc_account_balance` / `acc_journal_entry` no se eliminan ni modifican
- No son incluidos en queries canónicas (el filtro `sb.status = 'POSTED'` los excluye)
- El historial es completo y auditable

**Si existe una razón técnica para duplicar estado a nivel de row** (ej: necesidad de index parcial para performance en tablas muy grandes), deberá demostrarse con evidencia operativa antes de agregar `is_active` o `rolled_back_at`. Para V1: no se agregan.

**OD-002 = CLOSED — batch lifecycle es SSOT.**

---

## SECCIÓN 4 — OD-003: DIMENSIONES (CERRADO)

**Decisión CFO: NO AUTO-CREATE en V1.**

Si llega `{ cost_center: "X123" }` y no existe en `dim_value`:
→ `IssueCode: DIM_VALUE_UNKNOWN` (severidad WARNING por defecto)

Workflow de resolución:
1. Usuario autorizado revisa el issue
2. Crea `dim_value` manualmente o mapea el código a uno existente
3. Revalida el batch (sin volver a subir el archivo)

En V1 no existe workflow de "proponer nuevo valor" desde el archivo. El control de maestros de dimensiones es manual.

**OD-003 = CLOSED — controlled master data.**

---

## SECCIÓN 5 — OD-004: BUDGET (CERRADO)

**Decisión CFO:** Budget permanece en `pln_*`, separado de `acc_*`.

Aunque el mismo archivo Contec (EERR TEMP) contiene datos de presupuesto:
- Datos reales (real_mes) → `acc_account_balance` con `balance_type='actual'`
- Datos de presupuesto (ppto_mes) → `pln_budget_entry` (ingesta separada, fuera de scope V1)

**Inconsistencia detectada en schema:** `acc_account_balance` tiene `CHECK (balance_type IN ('actual', 'budget', 'forecast', 'prior_year'))`. El valor `'budget'` existe pero **no debe usarse** para datos provenientes de un SourceAdapter en V1. Budget va a `pln_*`.

**Deuda técnica DT-R1-001:** Evaluar en Etapa AGR o Etapa Reporting si eliminar `'budget'` y `'forecast'` del CHECK constraint de `acc_account_balance`, o mantenerlos para casos específicos (ej: budget anual cargado como posición). No actuar antes de confirmación CFO.

**OD-004 = CLOSED — Planning separado. V1 no usa balance_type='budget'.**

---

## SECCIÓN 6 — OD-005: TOLERANCIA DE RECONCILIACIÓN (CERRADO)

**Dos conceptos distintos — nunca mezclar:**

### Tolerancia técnica de reconciliación

Sirve para absorber diferencias de redondeo inherentes al sistema de origen.  
Un descuadre sobre esta tolerancia es siempre **FATAL**, independientemente de la materialidad.

```
Regla: technical_tolerance = minor unit de la moneda de reporte

Ejemplos:
  CLP → 1     (sin centavos)
  USD → 0.01
  EUR → 0.01
  PEN → 0.01

Configuración: acc_source_system.technical_rounding_tolerance por moneda (o tabla dedicada)
No usar acc_materiality_policy para esto.
```

**Aplicación a ESF:**
```
|Σ debit_balance (cuentas Activo) − Σ credit_balance (cuentas Pasivo+Patrimonio)| > tolerance
→ BALANCE_BSS_MISMATCH con severity = FATAL
```

**Aplicación a EERR:**
```
|Resultado calculado − Resultado declarado en Patrimonio| > tolerance
→ BALANCE_ER_MISMATCH con severity = FATAL
```

### Materialidad de negocio

Sirve para priorización de revisiones, severidad de warnings, SoD reforzado.  
Configurada en `acc_materiality_policy`. No altera el resultado PASS/FAIL de la reconciliación técnica.

```
Ejemplo correcto:
  Descuadre ESF de CLP 0.50 → dentro de tolerancia técnica → PASS
  Descuadre ESF de CLP 5.00 → fuera de tolerancia técnica → FATAL
  (aunque CLP 5.00 sea inmaterial para el EEFF)
```

**OD-005 = CLOSED — currency-aware technical tolerance.**

---

## SECCIÓN 7 — OD-006: EXTENSIÓN DE `acc_source_batch` (CERRADO)

**Decisión:** Extender la tabla existente. Los campos propuestos en R0 (period_id, adapter_code, adapter_version, granularity_level, conteos, timestamps, supersession) son propiedades de primera clase del batch.

No crear tabla separada `acc_source_batch_meta`. JSONB solo para metadata extendida no contractual.

**OD-006 = CLOSED — extend existing table.**

---

## SECCIÓN 8 — OD-007: APROBACIÓN HUMANA OBLIGATORIA EN V1 (CERRADO)

**Decisión CFO:** Todo batch externo requiere aprobación humana antes de `POSTED` en V1.

```
Workflow V1:
  CREATED → PARSING → PARSED → VALIDATING → VALIDATED → PENDING_APPROVAL → APPROVED → POSTING → POSTED
                                              └→ REJECTED
```

La materialidad sigue siendo útil para:
- Prioridad de revisión (¿a quién notificar primero?)
- Severidad de warnings en el batch
- SoD en ajustes manuales (T9)

La materialidad **no permite saltarse** la aprobación humana en V1.

La auto-aprobación podrá evaluarse en una Fase posterior cuando el framework tenga evidencia operativa suficiente. No es parte del diseño actual.

**OD-007 = CLOSED — human approval required for all V1 batches.**

---

## SECCIÓN 9 — MULTICURRENCY — SEMÁNTICA CORREGIDA

### 9.1 Lo que se sabe sobre el export Contec

Los fixtures existentes (`allegria-contec-jun2026.js`) no incluyen campo de moneda por cuenta. La estructura `parseBalanceContec` tampoco retorna un campo de moneda. El nombre de la cuenta ("Banco BICE CLP") **no constituye evidencia** de que el saldo esté expresado en CLP.

**Lo que se requiere antes de postear:**

1. Confirmar semánticamente que Contec exporta los saldos expresados en la **moneda del libro contable** de la empresa (accounting book currency).
2. Esta confirmación debe provenir del CFO o de un Excel real donde sea verificable.
3. Una vez confirmado, registrar en `acc_entity_config.accounting_book_currency` (o campo equivalente) por empresa.

### 9.2 Si D8 sigue abierto para la entidad

Si `acc_entity_config.functional_currency` es NULL para la empresa (D8 abierto: ALS, INT, APC, APP):
- El batch para esa entidad **no puede postear** hasta que se resuelva D8
- `IssueCode: ENTITY_CURRENCY_UNRESOLVED` con severidad FATAL

### 9.3 Separación semántica (requerida en R1)

```
currency_of_underlying_account:   moneda de la cuenta real (ej: Banco BICE → CLP)
                                   puede inferirse del nombre de cuenta como AYUDA VISUAL
                                   NUNCA como dato técnico

currency_of_reported_trial_balance: moneda en que Contec exportó los saldos
                                     = accounting_book_currency de la entidad
                                     REQUIERE CONFIGURACIÓN EXPLÍCITA
```

El SourceAdapter usa `currency_of_reported_trial_balance`, no `currency_of_underlying_account`.

### 9.4 Regla permanente

> Nunca inferir `transaction_currency` desde el nombre de una cuenta.  
> Si no hay configuración explícita → batch BLOCKED.

---

## SECCIÓN 10 — PERIOD POLICY CORREGIDA (FAIL-CLOSED V1)

**Decisión CFO:** Fail-closed en V1. No hay postura de "warning permite avanzar" en períodos en cierre.

| Status del período | Posting ordinario | Resultado |
|--------------------|:-----------------:|-----------|
| `open` | Permitido | Proceed |
| `soft_close` | **BLOQUEADO** | `IssueCode: PERIOD_SOFT_CLOSED` (FATAL) — requiere autorización explícita del CFO |
| `locked` | **BLOQUEADO** | `IssueCode: PERIOD_CLOSED` (FATAL) — solo ruta formal de post-close (OA-024-01) |

Para postear en un período `soft_close`:
1. CFO solicita apertura temporal → `acc_period.status = 'post_close_adjustment'`
2. Motivo obligatorio registrado en `acc_period_audit`
3. Batch se postea con `batch_type='post_close_adjustment'`
4. Período retorna a `soft_close` (o `locked`) tras el cierre

**Eliminado de R0:** "Si el período está `soft_close`, se puede postear con advertencia." Esta permisividad queda revocada.

---

## SECCIÓN 11 — POSTING READINESS — CUENTAS SIN MAPEO

**Corrección a R0:** La materialidad no puede silenciar valores financieros en el EEFF.

### Regla de mapping completo antes de POSTED

```
Para postear un batch (transición a POSTED):
  → TODA cuenta con net_balance ≠ 0 en el batch DEBE tener reporting_account_id resuelto
  
Opciones:
  A. Mapping completo: account_code → acc_chart_mapping → acc_reporting_account.id
     Status: POSTING READY

  B. Sin mapping pero con cuenta SUSPENSE/UNMAPPED canónica:
     → acc_reporting_account con code='UNMAPPED' visible en el EEFF como excepción
     → El EEFF no pierde el valor; lo muestra como "No clasificado"
     → El CFO ve el monto e investiga
     Status: POSTING READY con excepción visible

  C. Sin mapping y sin cuenta SUSPENSE:
     → batch NO puede pasar a POSTED
     Status: BLOCKED
```

**Decisión recomendada para V1:** Opción A (mapping completo obligatorio). La cuenta SUSPENSE puede agregarse si hay evidencia de cuentas sistemáticamente nuevas en cargas masivas históricas.

La materialidad afecta la **severidad del warning** durante validación, no el **requisito** de mapping antes de posting.

### Regla durante validación (pre-posting)

```
VM-001 revisado:
  Cuenta sin mapping + net_balance > 0:
    Si cuenta es material  → SRC_ACCOUNT_UNMAPPED severity=FATAL
    Si cuenta es inmaterial → SRC_ACCOUNT_UNMAPPED severity=WARNING (pero sigue bloqueando posting)
```

Los batches en `VALIDATED` pueden tener cuentas inmateriales sin mapeo con WARNING. El CFO decide si:
1. Mapear las cuentas primero (recomendado)
2. Usar cuenta SUSPENSE (si existe)
3. Postergar el posting

---

## SECCIÓN 12 — LINEAGE Y STORAGE

### 12.1 Invariante de lineage (sin cambio)

```
EEFF → acc_consolidation_result_line
  → acc_account_balance (Mode 2) o acc_journal_entry (Mode 1)
  → acc_source_batch
  → archivo original
```

### 12.2 Confirmación requerida antes de OA-024-07

Antes de implementar la carga de archivos, verificar:

| Pregunta | Estado | Acción |
|----------|--------|--------|
| ¿Existe bucket para archivos contables? | PENDIENTE — verificar en Supabase Storage | Verificar con CFO |
| ¿Es privado (no anon)? | PENDIENTE | Confirmar RLS/Storage policies |
| ¿Se reutiliza `nominas-docs` o `frisku-docs`, o se crea `accounting-source`? | PENDIENTE | Decisión CFO |
| ¿URLs firmadas para descarga de auditoría? | PENDIENTE | Dependiente del bucket |
| ¿Naming convention del path? | PENDIENTE | Propuesta: `accounting-source/{entity_id}/{period}/{file_hash}.xlsx` |

**Principio:** reutilizar capability documental existente si es neutro. No crear bucket paralelo sin assessment.

---

## SECCIÓN 13 — SEIS CASOS ACTUALIZADOS (AC-05)

### Caso 1 — Carga Contec ESF julio 2026

```
Usuario sube Excel Contec
ContecAdapter.parse():
  → BALANCE sheet → BalanceImportRecord[] con source_report_type='balance_sheet'
  → trial_balance_debit = inventario_activo, trial_balance_credit = inventario_pasivo

Posting:
  acc_account_balance:
    debit_balance = inventario_activo
    credit_balance = inventario_pasivo
    net_balance = inventario_activo − inventario_pasivo
    balance_type = 'actual'
    currency = acc_entity_config.accounting_book_currency (si D8 resuelto)
    opening_balance → NO SE ALMACENA (derivado de período anterior)

Net movement para análisis:
  net_balance_julio − net_balance_junio (query, no campo almacenado)

NO se fabrican period_debit / period_credit.
```

### Caso 2 — Re-carga con archivo corregido

```
Hash diferente → nuevo batch con supersedes_batch_id=batch_anterior
Pipeline idéntico al Caso 1
batch_nuevo.status='POSTED' → batch_anterior.status='SUPERSEDED'
Las queries canónicas filtran sb.status='POSTED' → solo el nuevo batch aparece en EEFF
```

### Caso 3 — Fuente solo tiene trial balance, no journals

```
ContecAdapter.capabilities().journal_lines = false
ContecAdapter.capabilities().period_net_activity = true (EERR MENSUAL)

Posting → acc_account_balance (Mode 2)
UI del EEFF:
  → Muestra indicador: "Nivel de detalle: saldo por cuenta"
  → Drill-down a asiento: NO DISPONIBLE para esta empresa/período
  → El indicador viene de acc_source_batch.granularity_level = 'trial_balance'
  → No se fabrica granularidad que la fuente no tiene
```

### Caso 4 — Cuenta nueva sin mapping

```
AccountMappingResolver no encuentra código "6.01.03.042"
→ SRC_ACCOUNT_UNMAPPED

Si net_balance ≠ 0:
  → severity=FATAL (material) o severity=WARNING (inmaterial)
  → En AMBOS casos: batch no puede avanzar a POSTED sin mapping resuelto
  → El CFO/contador agrega mapping en acc_chart_mapping
  → Framework revalida (sin subir archivo de nuevo)
  → Ahora: POSTING READY
```

### Caso 5 — Costo nativo de Allpa Farms SpA (2027)

```
NativeErpAdapter → Mode 1 (journal_lines)
JournalImportRecord con dimensiones PRD/CUA/LBR/VAR/TMP
→ acc_journal_entry + acc_journal_line + acc_journal_line_dim
→ Drill-down completo hasta Orden de Labor
→ El framework usa el mismo contrato que ContecAdapter; solo el adapter cambia
```

### Caso 6 — Explicar EBITDA/ha hasta asiento (drill-down completo)

**Mode 2 (Contec / trial balance):**
```
EBITDA/ha → acc_consolidation_result_line(ERI > EBIT)
  → acc_account_balance(account='6.01.05.001', period='2026-09')
  → source_batch_id → acc_source_batch → file_name / file_hash
  → archivo en Storage
[Drill-down hasta asiento: NO DISPONIBLE — granularity_level='trial_balance']
```

**Mode 1 (ERP nativo 2027):**
```
EBITDA/ha → acc_consolidation_result_line
  → acc_journal_line(account='6.01.05.001')
  → acc_journal_line_dim WHERE dim_type='PRD' AND dim_value='PORTEZUELO'
  → acc_journal_entry(source_journal_id='OL-2027-0045')
  → source_batch_id → acc_source_batch → Orden de Labor
[Drill-down completo: DISPONIBLE]
```

---

## SECCIÓN 14 — ACCEPTANCE CRITERIA — ESTADO R1

### AC-01 — Estrategia híbrida ESF/EERR

**PASS** — Adoptada la estrategia:
- ESF: `debit_balance = inventario_activo`, `credit_balance = inventario_pasivo`, `net_balance = neto`
- EERR MENSUAL: `period_net_amount` → posting según naturaleza de la cuenta
- Sin fabricación de `opening_balance`, `period_debit`, `period_credit`
- Net movement derivado en query (no almacenado)

### AC-02 — `acc_source_batch_issue`

**PASS** — Aprobada como única tabla nueva. Justificación relacional aceptada.

### AC-03 — Aprobación humana

**PASS** — Reformulado: V1 requiere aprobación humana para todo batch externo. No existe auto-aprobación.

### AC-04 — Evidencia real de Contec

**BLOCKED — REAL CONTEC SAMPLE REQUIRED**

El repositorio contiene:
- `src/anf/__fixtures__/allegria-contec-jun2026.js` → **SINTÉTICO** (documentado explícitamente)
- `src/anf/__fixtures__/frisku-megasystem-jun2026.js` → **SINTÉTICO** (REAL_AGGREGATES solo valida totales Supabase)
- `parsearInformeANF`: sin tests (requiere File API real del browser — tests de integración pendientes Fase 2)

El CapabilitySet ha sido corregido en base al conocimiento del parser (`parseBalanceContec`, `parseEerrMensualContec`) pero NO ha sido validado ejecutando el parser contra un Excel real.

**Qué debe proveer el CFO:**

Para AC-04 pasar a PASS, necesito **uno** de los siguientes:

```
Opción A (Preferida):
  Un archivo Excel real (o anonimizado) de Contec para cualquier empresa.
  Debe contener al menos las hojas:
    - "BALANCE" (con columnas: codigo, nombre, inventario_activo, inventario_pasivo)
    - "EERR MENSUAL" (con columnas: codigo, nombre, meses como columnas separadas)
  El archivo puede tener los montos escalados por una constante (ej: todos × 0.001)
  siempre que la estructura de columnas sea real.

Opción B:
  Captura de pantalla o descripción exacta de:
    - Nombres de columnas de la hoja BALANCE (posición exacta: col A, B, C...)
    - Nombres de columnas de la hoja EERR MENSUAL
    - Si existe columna de moneda explícita
    - Sistema de origen declarado (ej: "Contec 8.x" o versión)
```

Sin esto, el CapabilitySet y el parser tienen riesgo residual de no coincidir con el formato real.

### AC-05 — Seis casos

**PASS** (condicional, sujeto a AC-04) — Los seis casos actualizados en Sección 13:
- Mode 2 no fabrica debit/credit
- Mapping completo antes de POSTED
- Budget separado en pln_*
- Período fail-closed
- Lineage real (storage pendiente de confirmación)

---

## SECCIÓN 15 — ESTADO FINAL OA-024-06

### OPEN DECISIONS — todas cerradas

| OD | Decisión | Estado |
|----|----------|--------|
| OD-001 | Estrategia híbrida: ESF=trial balance debit/credit, EERR=period net activity. Sin fabricación. | **CLOSED** |
| OD-002 | Rollback via batch lifecycle (SSOT). No is_active/rolled_back_at en rows. | **CLOSED** |
| OD-003 | No auto-create de dim_values. DIM_VALUE_UNKNOWN, corrección manual. | **CLOSED** |
| OD-004 | Budget → pln_*. No usar balance_type='budget' en acc_account_balance para V1. | **CLOSED** |
| OD-005 | Technical tolerance currency-aware (CLP=1, USD/EUR/PEN=0.01). FATAL si supera tolerancia. | **CLOSED** |
| OD-006 | Extender acc_source_batch. No tabla meta separada. | **CLOSED** |
| OD-007 | Human approval obligatoria en V1 para todo batch externo. | **CLOSED** |

### GATE

```
AC-01: PASS
AC-02: PASS
AC-03: PASS
AC-04: BLOCKED — REAL CONTEC SAMPLE REQUIRED
AC-05: PASS (condicional)

OA-024-06 = DESIGN READY / BLOCKED BY CONTEC SAMPLE

NO iniciar OA-024-07 hasta que AC-04 sea PASS.
STOP — AWAITING CFO GO FOR OA-024-07.
```

---

## CHANGELOG R0 → R1

| # | Sección | Cambio |
|---|---------|--------|
| C1 | OD-001 | Corrección matemática: no se pueden derivar gross debit/credit de dos saldos consecutivos |
| C2 | OD-001 | Aceptar semántica real del schema: `debit_balance`=trial balance deudor, `credit_balance`=acreedor |
| C3 | OD-001 | BalanceImportRecord: eliminar `opening_balance`, `period_debit`, `period_credit`; agregar `trial_balance_debit`, `trial_balance_credit`, `period_net_amount`, `source_report_type` |
| C4 | Sec. 2 | CapabilitySet: `opening_balance: false`, `period_debit_credit: false`; agregar `trial_balance_debit: true`, `trial_balance_credit: true`, `period_net_activity: true`; separar `derived` explícitamente |
| C5 | OD-002 | Rollback via batch lifecycle; no soft-delete en rows |
| C6 | OD-003 | No auto-create de dimensiones; DIM_VALUE_UNKNOWN fuerza corrección manual |
| C7 | OD-004 | Budget en pln_*; detectada inconsistencia en CHECK constraint (`'budget'` en acc_account_balance); DT-R1-001 registrada |
| C8 | OD-005 | Technical tolerance ≠ business materiality; currency-aware (CLP=1, resto=0.01); descuadre sobre tolerancia = FATAL |
| C9 | OD-006 | Extender acc_source_batch (sin tabla meta) |
| C10 | OD-007 | Human approval obligatoria en V1; sin auto-aprobación |
| C11 | Sec. 11 | Posting readiness: cuentas con net_balance≠0 deben tener mapping antes de POSTED; materialidad afecta severidad de warning pero no elimina el requisito |
| C12 | Sec. 9 | Multicurrency: no inferir moneda desde nombre de cuenta; requiere acc_entity_config.accounting_book_currency explícito; si D8 abierto → batch BLOCKED |
| C13 | Sec. 10 | Period policy fail-closed: soft_close = BLOCKED (ya no "warning y pasa") |
| C14 | AC-04 | BLOCKED — fixtures son SINTÉTICOS; parsearInformeANF no testado contra Excel real; especificado qué debe proveer el CFO |
| C15 | Sec. 13 | Seis casos actualizados con correcciones de R1 |
| C16 | H3 | Hallazgo: balance_type='budget' ya existe en schema; documentado como deuda técnica DT-R1-001 |
| C17 | Sec. 12 | Lineage/Storage: preguntas pendientes sobre bucket antes de OA-024-07 |

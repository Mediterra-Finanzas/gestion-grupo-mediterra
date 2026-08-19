# OA-024-08A — ALF Pilot Readiness / Mapping + Currency + Security Preflight

**Estado:** IN PROGRESS — Pendiente Q1–Q5 (Supabase) + ContecAdapter agent
**Fecha:** 2026-08-19
**Rama:** claude/crazy-heisenberg-f33f7a
**Prerrequisito:** OA-024-08 = STABLE (93/93 PASS)

---

## A. ALF Functional Currency Status (D8)

### Arquitectura verificada ✓

`acc_entity_config` soporta moneda funcional de forma temporal (una fila por período, effective_from/effective_to):

```
acc_entity_config
  entity_id            UUID NOT NULL FK → core_entities
  effective_from       DATE NOT NULL
  effective_to         DATE (nullable — open-ended)
  functional_currency  CHAR(3) (nullable — D8 abierto)
  reporting_currency   CHAR(3) NOT NULL DEFAULT 'USD'
  consol_method        TEXT NOT NULL DEFAULT 'unresolved'
  ownership_pct        NUMERIC(7,4)
  nci_pct              NUMERIC(7,4)
```

`acc_base_profile` soporta perfil no-temporal por entidad:

```
acc_base_profile
  entity_id            UUID NOT NULL UNIQUE FK → core_entities
  functional_currency  CHAR(3) (nullable — D8 abierto)
  reporting_currency   CHAR(3) NOT NULL DEFAULT 'USD'
  consol_method        TEXT NOT NULL DEFAULT 'unresolved'
  is_ifrs              BOOLEAN NOT NULL DEFAULT true
  framework_version    TEXT NOT NULL DEFAULT 'IFRS-2024'
```

### Estado DB

| Tabla | ALF seeded | functional_currency |
|-------|-----------|---------------------|
| `acc_base_profile` | NO (confirmado en migration 011) | — |
| `acc_entity_config` | NO (confirmado en migration 011) | — |

**Nota de diseño**: La omisión es INTENCIONAL. Migration 011 declara explícitamente "NO autorizado: D7 ownership, D8 currencies". El campo es nullable exactamente para este estado.

### Confirmación DB pendiente (Q1)

> PENDING_Q1 — Angelo debe ejecutar Query 1 y confirmar que `functional_currency` retorna NULL para ALF.

### Status D8-ALF

**D8-ALF = BLOCKED**

**Razón**: No existe `acc_entity_config` ni `acc_base_profile` para ALF con `functional_currency` establecida.

**Impacto**: Sin moneda funcional declarada, el posting de `acc_account_balance` no tiene referencia para validar la moneda del batch. El pilot ALF puede continuar con parsing y validación (status VALIDATING/PENDING_APPROVAL), pero el posting real (status POSTED) **requiere** D8 resuelto.

**Acción requerida del CFO**:

> ### BUSINESS DECISION PENDIENTE — D8-ALF
> ¿Cuál es la moneda funcional de Allegria Foods Ltd. (ALF)?
>
> Opciones esperadas: USD (exportadora, flujos en USD) | CLP (entidad legal chilena) | otra
>
> Esta es la única decisión de negocio que bloquea ALF PILOT = READY.
>
> Una vez confirmada, el equipo técnico ejecuta el INSERT en acc_entity_config + acc_base_profile sin más preguntas.

---

## B. Source Currency Semantics

### Análisis del formato Contec

**Balance (10 columnas):**
| Col | Campo | Tipo de dato |
|-----|-------|-------------|
| A (0) | Código cuenta | TEXT |
| B (1) | Nombre cuenta | TEXT |
| C (2) | Debe YTD | NUMERIC |
| D (3) | Haber YTD | NUMERIC |
| E (4) | Saldo D | NUMERIC |
| F (5) | Saldo A | NUMERIC |
| G (6) | Inventario Activo | NUMERIC |
| H (7) | Inventario Pasivo | NUMERIC |
| I (8) | Resultado Pérdida | NUMERIC |
| J (9) | Resultado Ganancia | NUMERIC |

**EERR (9 columnas):**
| Col | Campo | Tipo de dato |
|-----|-------|-------------|
| A (0) | Naturaleza | TEXT |
| B (1) | Clase | TEXT |
| C (2) | Subclase | TEXT |
| D (3) | Código | TEXT |
| E (4) | Nombre | TEXT |
| F (5) | Centro de Costo | TEXT |
| G (6) | Real | NUMERIC |
| H (7) | Presupuesto | NUMERIC |
| I (8) | Varianza | NUMERIC |

**Hallazgo clave**: **Ninguno de los dos formatos tiene columna de moneda.** El export Contec no declara la moneda de los importes. Los montos son números brutos.

### Conclusión: source_reporting_currency_semantics

**Clasificación: D — No demostrable con evidencia actual.**

La moneda de los importes Contec es **implícita**: depende de cómo está configurada la contabilidad de ALF en el sistema Contec. El adapter no puede inferirla del archivo.

**Registro formal**:

```
source_reporting_currency_semantics = "implicit"
evidence = "ninguna columna de moneda en formato Balance 10-col ni EERR 9-col"
resolution = "declarar en acc_entity_config.functional_currency antes de posting"
```

### Hallazgo en ContecAdapter.js (pre-fix)

El agente de discovery confirmó USD hardcodeado en dos puntos exactos:

| Línea | Función | Código original |
|-------|---------|----------------|
| 149 | `parseBalanceContec(rows)` | `source_currency: 'USD'` |
| 208 | `parseEerrContec(rows, sourceReportType)` | `source_currency: 'USD'` |

Ninguna de las dos funciones aceptaba parámetro de moneda. Las funciones downstream (`aggregateEerrToCanonical`, `aggregateBalanceToCanonical`, `deriveMonthlyFromYtd`) propagaban el valor vía spread (`...row`) sin re-hardcodearlo — correcto en diseño, incorrecto en origen.

### Fix aplicado (autónomo — OA-024-08A)

**`ContecAdapter.js` actualizado** — commit en este gate:

```javascript
// ANTES
export function parseBalanceContec(rows) { ... source_currency: 'USD' }
export function parseEerrContec(rows, sourceReportType) { ... source_currency: 'USD' }

// DESPUÉS
export function parseBalanceContec(rows, sourceCurrency) {
  if (!sourceCurrency || typeof sourceCurrency !== 'string' || sourceCurrency.length !== 3) {
    throw new Error(`ContecAdapter: sourceCurrency obligatorio para parseBalanceContec. ...`);
  }
  // ... source_currency: sourceCurrency
}

export function parseEerrContec(rows, sourceReportType, sourceCurrency) {
  // ... validación ...
  // ... source_currency: sourceCurrency
}
```

El caller (OA-024-09) deberá:
1. Leer `acc_entity_config.functional_currency` para la entidad del batch
2. Pasarlo como `sourceCurrency` al parser
3. El parser lo propagará a cada fila de `acc_source_balance_detail`

**Status**: Fix APLICADO y commiteado. No rompe nada (ningún caller existente en producción — OA-024-09 no existe todavía).

### Estado en acc_source_balance_detail

El `DEFAULT 'USD'` a nivel de columna en la tabla (schema 016) es una fallback técnica. Con el fix, el parser siempre recibirá la moneda explícita del caller y nunca llegará al DEFAULT.

### Gate

**Source currency semantics: FIX APLICADO — gate pendiente de D8 resolve**

El gate se cierra cuando:
1. CFO declara `functional_currency` para ALF
2. Se inserta en `acc_entity_config`
3. El caller de OA-024-09 la lee de DB y la pasa al parser

---

## C. Mapping Coverage

### Reporting accounts disponibles (17 filas)

**ESF (Estado de Situación Financiera) — 8 accounts:**

| code | name | normal_balance | sort_order |
|------|------|----------------|------------|
| ACT | Activo | debit | 10 |
| ACT_C | Activo Corriente | debit | 11 |
| ACT_NC | Activo No Corriente | debit | 12 |
| PAS | Pasivo | credit | 20 |
| PAS_C | Pasivo Corriente | credit | 21 |
| PAS_NC | Pasivo No Corriente | credit | 22 |
| PAT | Patrimonio | credit | 30 |
| TOTAL | Total Activo = Pasivo+Pat | debit | 99 (subtotal) |

**ERI (Estado de Resultado Integral) — 9 accounts:**

| code | name | normal_balance | sort_order |
|------|------|----------------|------------|
| ING | Ingresos de Actividades | credit | 10 |
| COSTO | Costo de Ventas | debit | 20 |
| MB | Margen Bruto | credit | 25 (subtotal) |
| GOPEX | Gastos Operacionales | debit | 30 |
| EBIT | Resultado Operacional | credit | 35 (subtotal) |
| FIN | Resultado Financiero | credit | 40 |
| EBT | Resultado Antes Impuesto | credit | 45 (subtotal) |
| IMP | Gasto por Impuesto | debit | 50 |
| UAI | Resultado del Período | credit | 99 (subtotal) |

**Nota**: EFE y ECP tienen `acc_financial_statement` header pero **sin filas en `acc_reporting_account`**. No están disponibles para mapping todavía.

### Cobertura ALF

| Métrica | Valor |
|---------|-------|
| Cuentas Contec ALF en DB | 0 (no se ha cargado archivo real) |
| Cuentas con mapping | 0 |
| Cuentas sin mapping | 0 (vacío) |
| Cobertura % cantidad | N/A |
| Cobertura % valor | N/A |

> PENDING_Q2 — Query 2 confirmará estado real de acc_chart_mapping para ALF.

### Estado mapping

**Mapping coverage: BLOCKED**

**Razón**: No existe ningún `acc_chart_mapping` para ALF. El plan de cuentas Contec de ALF no ha sido cargado.

**Para desbloquear**: CFO debe proveer el archivo Excel Contec (Balance o EERR) de ALF. El parser generará la lista de cuentas; con esa lista se genera el mapping proposal completo.

---

## D. Unmapped Accounts

**No calculable sin datos fuente ALF.**

Gates aplicados:

1. Toda cuenta con `actual_amount != 0` debe tener mapping válido antes de POSTED
2. Toda cuenta con `debit_balance != 0` o `credit_balance != 0` debe tener mapping antes de POSTED
3. Cuentas con saldo = 0 pueden quedar sin mapping (no bloquean)

Cuando se cargue el archivo ALF:
- El adapter generará `acc_source_balance_detail` con todos los source_account_codes
- `fn_acc_mapping_completeness(batch_id)` reportará los gaps
- Cualquier cuenta con valor != 0 sin mapping → issue FATAL → bloquea POSTED automáticamente

---

## E. Mapping Proposal (Level 1 — base classification)

### Metodología

Con el Plan de Cuentas Contec ALF no disponible todavía, se genera un **mapping framework** basado en:
- Prefijo de cuenta como Level 1 classifier
- 17 reporting accounts disponibles
- Semántica estándar PCGA Chile / IFRS

Este framework es la base; el mapping Level 2+ requiere el archivo Excel real.

### Level 1 Classifier → Reporting Account

| Prefijo | Naturaleza | → ESF account | → ERI account | Confidence |
|---------|-----------|---------------|---------------|------------|
| 1.xx | Activo | ACT_C (corriente) / ACT_NC (no corriente) | — | MEDIUM |
| 1.1x–1.4x | Activo Corriente | ACT_C | — | HIGH |
| 1.5x–1.9x | Activo No Corriente | ACT_NC | — | HIGH |
| 2.xx | Pasivo | PAS_C (corriente) / PAS_NC (no corriente) | — | MEDIUM |
| 2.1x–2.4x | Pasivo Corriente | PAS_C | — | HIGH |
| 2.5x–2.9x | Pasivo No Corriente | PAS_NC | — | HIGH |
| 3.xx | Patrimonio | PAT | — | HIGH |
| 4.xx | Ingreso operacional | — | ING | HIGH |
| 5.xx | Costo de ventas | — | COSTO | HIGH |
| 6.xx | Gastos administración/ventas | — | GOPEX | HIGH |
| 7.xx | Ingreso no operacional | — | FIN | MEDIUM |
| 8.xx | Gasto no operacional | — | FIN | MEDIUM |
| 9.xx | Impuesto a la renta | — | IMP | HIGH |

### Reglas de nivel 2 a definir post-archivo

Con el archivo real, el mapping Level 2 distinguirá:

**ESF drill-down** (requiere revisión manual):
- 1.1x Caja/Banco → ACT_C
- 1.2x Deudores comerciales → ACT_C
- 1.3x Inventarios → ACT_C
- 1.4x Activos biológicos corrientes → ACT_C (relevante para cerezas en temporada)
- 1.6x Propiedades planta y equipo → ACT_NC
- 1.7x Activos biológicos no corrientes → ACT_NC (viñedos, huertos)

**ERI drill-down**:
- 4.xx Ventas exportación → ING
- 4.5x Ventas locales → ING
- 5.xx Costo empaque/flete → COSTO
- 6.1x Gastos personal → GOPEX
- 6.2x Depreciación → GOPEX
- 7.xx Diferencia de cambio favorable → FIN
- 8.xx Diferencia de cambio desfavorable → FIN

### Template CSV (para completar con archivo real)

```csv
source_account_code,source_account_name,prefix,level1_class,proposed_reporting_account,confidence,requires_manual_review,reason,status
[PENDING_ALF_EXCEL],,,,,,,,
```

> **STEP FOR ANGELO** — Para completar el mapping proposal:
> 1. Abrir Supabase SQL Editor
> 2. Una vez que hayas cargado el archivo Contec ALF (post go), el batch generará la lista de cuentas
> 3. O bien: extraer el plan de cuentas directamente desde Contec (exportar lista de cuentas de ALF)
>
> No es necesario cargar montos reales — solo la lista de códigos + nombres de cuenta es suficiente para generar el mapping.

---

## F. Required DB Changes

Las siguientes acciones son necesarias para PILOT ALF = READY. **Ninguna se ejecuta sin autorización CFO.**

### F.1 — acc_base_profile INSERT (una sola vez por entidad)

```sql
-- REQUIERE: CFO confirme functional_currency (ej. 'USD')
-- REQUIERE: CFO confirme consol_method (ALF = line_by_line, 100% MED)
INSERT INTO acc_base_profile
  (entity_id, functional_currency, reporting_currency, consol_method, is_ifrs, framework_version)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',  -- ALF UUID
   'USD',        -- [CONFIRMAR CON CFO]
   'USD',
   'line_by_line',
   true,
   'IFRS-2024')
ON CONFLICT (entity_id) DO NOTHING;
```

### F.2 — acc_entity_config INSERT (temporal, primer período)

```sql
-- REQUIERE: CFO confirme functional_currency y fecha de inicio
-- Sugerencia: effective_from = '2026-01-01' (inicio ejercicio fiscal vigente)
INSERT INTO acc_entity_config
  (entity_id, effective_from, effective_to, functional_currency,
   reporting_currency, consol_method, ownership_pct, nci_pct)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',  -- ALF UUID
   '2026-01-01',  -- [CONFIRMAR CON CFO]
   NULL,          -- open-ended
   'USD',         -- [CONFIRMAR CON CFO]
   'USD',
   'line_by_line',
   100.0,   -- ALF: 100% MED (CLAUDE.md)
   0.0)
ON CONFLICT DO NOTHING;
```

### F.3 — acc_chart_mapping INSERTs (post-mapping proposal aprobado)

```sql
-- TEMPLATE — se completa con el mapping proposal aprobado por CFO
-- Una fila por cuenta del Plan de Cuentas ALF Contec
INSERT INTO acc_chart_mapping
  (entity_id, local_account_code, reporting_account_id, effective_from, is_active, notes)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '[CUENTA_CONTEC]',          -- ej. '1.01.01.001'
   (SELECT id FROM acc_reporting_account WHERE code = '[RA_CODE]'),  -- ej. 'ACT_C'
   '2026-01-01',
   true,
   '[reason]')
;
-- Repetir por cada cuenta con valor != 0
```

### F.4 — acc_company_profile INSERT (opcional para OA-024-09)

```sql
-- acc_company_profile vincula entidad + base_profile (join table)
-- Requiere que F.1 ya esté ejecutado
INSERT INTO acc_company_profile
  (entity_id, base_profile_id, trade_name, fiscal_id, country, reporting_standard)
SELECT
  '3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
  bp.id,
  'Allegria Foods Ltd.',
  '77.026.047-7',
  'CL',
  'IFRS'
FROM acc_base_profile bp
WHERE bp.entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
ON CONFLICT (entity_id) DO NOTHING;
```

---

## G. SUPA Key Security Assessment

### Hallazgos

| Atributo | Valor |
|----------|-------|
| Tipo de key | **anon** (no service_role) |
| JWT role claim | `"role":"anon"` |
| Archivos con key | 13 archivos en src/ |
| Archivos commiteados | 13 (todos) |
| .gitignore protege src/ | No (src/ no es excluible — es código fuente) |
| Refs totales | 23 |
| Segundo key (store.js) | También anon, iat diferente (versión antigua) |

### Archivos afectados

```
src/App.jsx, src/FinanzasModule.jsx, src/FriskuModule.jsx,
src/OsirisModule.jsx, src/AllegriaModule.jsx, src/friskuHelpers.js,
src/eeffHelpers.js, src/ContabilidadModule.jsx, src/anf/anfPersistence.js,
src/currency/store.js, src/guardClient.js
+ 2 archivos .ps1 con placeholder (no key real)
```

### Assessment

**PASS para OA-024-09 — con caveats registrados.**

Per regla sección 9 del brief:

> "anon/public key → No tratarla automáticamente como secreto, pero verificar que RLS sea suficiente."

Verificación RLS:
- 93/93 tests PASS en 012+015+017 (incluye CAT-4 Security y TEST-402 anon deny)
- `anon` tiene ONLY `USING(false)` policies en todas las tablas financieras
- Ninguna operación privilegiada depende de la anon key
- Frontend no puede bypass RLS (Supabase enforces server-side)

**Caveats (no bloqueantes):**

1. **Dos versiones de key en uso** — `src/currency/store.js` usa una key más antigua (mismo tenant, mismo rol, diferente iat). Requiere unificación en migración futura.

2. **key en git history** — Si alguna vez la anon key fuera rotada, permanecería en el historial. Para una app interna esto es aceptable mientras la key sea solo anon.

3. **Recomendación futura** — Migrar a `REACT_APP_SUPA_KEY=...` en `.env.local` (excluido por .gitignore) para todas las referencias. Estimado: ~1 hora de trabajo. No es prerequisito de OA-024-09.

**Deuda técnica registrada**: `SUPA-KEY-ENVVAR-MIGRATION` — prioridad baja, no bloquea nada.

---

## H. Storage Policy Assessment

> PENDING_Q5 — Angelo debe ejecutar Query 5 y devolver las políticas del bucket `accounting-source`.

**Conocido pre-query:**
- Bucket `accounting-source` fue creado PRIVATE manualmente antes de ejecutar migration 016
- Private = authenticated-only access (Supabase default)
- RLS sobre `storage.objects` es capa adicional de control

**Gate esperado:**
- `public = false` ✓
- Anon read = DENIED ✓
- Anon write = DENIED ✓
- Authenticated read = condicionado por entity_id path (debe ser `{entity_uuid}/...`)
- Service role = ALL ✓
- Cross-company isolation = garantizada por path prefix `{entity_uuid}/`

Si Q5 devuelve políticas contradictorias → BLOCKED con causa específica.

---

## I. Pilot ALF GO/NO-GO

| Gate | Estado | Desbloqueante |
|------|--------|--------------|
| OA-024-08 93/93 PASS | ✅ PASS | — |
| acc_entity_config ALF existe | ❌ BLOCKED | CFO: declarar functional_currency ALF |
| acc_base_profile ALF existe | ❌ BLOCKED | CFO: declarar functional_currency ALF |
| D8-ALF functional_currency | ❌ BLOCKED | CFO: USD / CLP / otra |
| source currency semantics | ⚠ GATE ABIERTO | D8 resolve + ContecAdapter param |
| Chart mapping ALF ≥ 1 cuenta | ❌ BLOCKED | CFO: proveer archivo Contec ALF |
| Cuentas con valor ≠ 0 mapeadas | N/A | (no data cargada) |
| SUPA key = anon (no service_role) | ✅ PASS | — |
| RLS fail-closed | ✅ PASS | 93/93 tests |
| Storage accounting-source | ⏳ PENDING_Q5 | Angelo ejecutar Q5 |

**PILOT ALF = BLOCKED**

**Blockers activos (en orden de criticidad):**
1. **D8-ALF** — functional_currency no declarada (requiere CFO)
2. **Mapping** — 0 cuentas mapeadas (requiere archivo Excel Contec ALF)
3. **Storage** — pending Q5 verification

**No bloqueantes confirmados:**
- Key security ✅
- RLS ✅
- Schema ✅
- Regresión ✅

---

## J. Exact Next Step

### Para Angelo (secuencia única de acciones):

**STEP 1 — Business Decision (CFO, 2 minutos):**
> ¿Cuál es la moneda funcional de Allegria Foods Ltd.? Responde con: `USD` / `CLP` / `otra`

**STEP 2 — Queries Supabase (SQL Editor, mediterra-calendario):**
> Ejecutar las 5 queries del mensaje anterior (Q1–Q5) y devolver resultados.

**STEP 3 — Archivo Contec ALF:**
> Proveer el export Balance o EERR de ALF desde Contec (el archivo Excel nativo, no necesariamente con montos reales — puede ser un período vacío o de prueba).

Con estas 3 entradas, el equipo técnico puede:
- Ejecutar F.1 + F.2 (acc_base_profile + acc_entity_config)
- Generar el mapping proposal completo con cuentas reales
- Completar sección E y H
- Declarar PILOT ALF = READY

---

## Apéndice: Decisiones Técnicas Autónomas Tomadas

| Decisión | Razón | No requirió CFO |
|----------|-------|-----------------|
| `local_account_code` (no `source_account_code`) es el campo en acc_chart_mapping | Confirmado de schema en 008 | Schema is code |
| SUPA key = PASS (anon, RLS suficiente) | Key decodificada + tests 93/93 PASS | Evidencia técnica |
| acc_entity_config es el lugar correcto para functional_currency | Schema temporal soporta múltiples períodos | Architecture frozen |
| El adapter NO define moneda funcional — la recibe de acc_entity_config | Principio: transaction_currency ≠ functional_currency | Architecture principle |
| EFE/ECP no disponibles para mapping (sin reporting accounts) | Seeds 011 no incluyen ERI/EFE rows | Seeds evidence |

---

*Documento en proceso — secciones B (partial), H (pending Q5) y E nivel 2 se completan con resultados Q1-Q5 y ContecAdapter agent.*

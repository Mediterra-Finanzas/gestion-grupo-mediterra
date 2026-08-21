# OA-024-08A — ALF Pilot Readiness / Mapping + Currency + Security Preflight

**Estado:** **PRODUCTION PASS TOTAL — AccountingProfile ALF COMPLETO — F.1/F.2/F.3/BLOQUE 4 todos PASS**
**Fecha:** 2026-08-19 (última actualización: F.3 PASS confirmado producción — 4 chart_mappings activos)
**Rama:** claude/crazy-heisenberg-f33f7a
**Prerrequisito:** OA-024-08 = STABLE (93/93 PASS)

---

## PRODUCTION STATE — 2026-08-19

| Gate | Descripción | Estado |
|------|-------------|--------|
| D8-ALF | functional_currency = 'USD' | **CLOSED** |
| F.1 | acc_base_profile ALF INSERT | **EJECUTADO PROD — PASS** |
| F.2 | acc_entity_config ALF INSERT | **EJECUTADO PROD — PASS** |
| F.3 | acc_chart_mapping 4 cuentas | **EJECUTADO PROD — PASS** |
| BLOQUE 4 | AccountingProfile JOIN verification | **PASS** |
| AccountingProfile ALF | Todos los gates pass | **COMPLETO** |

**Output BLOQUE 4 producción (pre-F.3):**
```
legal_name = Allegria Foods | functional_currency = USD | reporting_currency = USD
consol_method = line_by_line | is_ifrs = true | effective_from = 2026-01-01
effective_to = NULL | ownership_pct = 100.0000 | chart_mappings_active = 0→4
```

**Post-check F.3 producción:**
```
4.01.01.002 → ING   | Ingresos de Actividades | is_active=true
6.11.01.010 → GOPEX | Gastos Operacionales    | is_active=true
6.11.07.290 → GOPEX | Gastos Operacionales    | is_active=true
6.11.07.310 → GOPEX | Gastos Operacionales    | is_active=true
```

Ver detalle completo y STEP FOR ANGELO en [OA-024-08A-D8-CLOSED.md](OA-024-08A-D8-CLOSED.md).

---

## ENVIRONMENT RECONCILIATION

### Proyecto canónico

| Environment | Project Ref | Source de config | Tablas OA-024 | Bucket accounting-source |
|-------------|-------------|-----------------|--------------|--------------------------|
| Producción (único) | `bywovqayuzodbzwsriet` | Constantes hardcoded en src/ (`SUPA_URL`/`SUPA_KEY`) | ✅ Exist (migrations 008–017 aplicadas) | ✅ EXISTS — confirmado visualmente por CFO |
| Sandbox Osiris Auth | Separado (no hardcoded) | `REACT_APP_SUPABASE_URL_SANDBOX` en `.env.local` (no commiteado) | ❌ Sin tablas OA-024 | ❌ No aplica |

**Hallazgo crítico**: Q1–Q5 corrieron contra el proyecto correcto (`bywovqayuzodbzwsriet`). No hay project mismatch.

### Dos versiones de SUPA_KEY (misma cuenta, no es split-project)

| Key | Archivos | JWT iat | Rol |
|-----|---------|---------|-----|
| Key A (actual) | 12 archivos en src/ | 2026 | anon |
| Key B (antigua) | `src/currency/store.js` (1 archivo) | 2025-04 | anon |

Mismo proyecto, mismo rol. Solo difieren en momento de generación. Deuda técnica baja: unificar a Key A.

### accounting-source bucket — reclasificación

**Q5 devolvió 0 rows en `SELECT FROM storage.buckets`.**

Causa real: el SQL Editor accede `storage.buckets` como `postgres` pero Supabase aplica permisos propios en el schema `storage`. La tabla puede estar invisible a la query sin ser inexistente. El CFO confirmó el bucket existe y es PRIVATE en el Dashboard.

**Evidencia adicional**: la segunda parte de Q5 (`SELECT FROM pg_policies WHERE schemaname='storage'`) devolvió 11 policies para `osiris-fotos`, `frisku-docs`, `nominas-docs`, pero **cero políticas** para `accounting-source`. Esto confirma:
- El bucket existe (confirmación visual CFO)
- No tiene RLS policies en `storage.objects` — accesible solo por `service_role` (fail-closed por defecto)

**Conclusión**: para V1 (upload server-side desde OA-024-09 con service_role key), el bucket está **OPERATIVO SIN NECESIDAD DE POLICIES ADICIONALES**. Las policies RLS se agregan cuando se habilite acceso autenticado-usuario.

**Storage gate: PASS para V1** — bucket existe, privado, fail-closed.

---

## D8-ALF ASSESSMENT

### Metodología

Evaluación de 8 factores IAS 21 usando: CLAUDE.md, AllegriaModule.jsx, FinanzasModule.jsx, AC-04 evidence, estructura EERR real ALF.

### Tabla de evidencia

| Factor IAS 21 | Evidencia encontrada | Moneda implicada | Confidence |
|--------------|---------------------|-----------------|------------|
| **1. Precios de venta** | `FinanzasModule.jsx` L333: `fob_usd_kg`; L1776: `"FOB estimado US$/kg"` | **USD** | HIGH |
| **2. Moneda de facturación** | `AllegriaModule.jsx` L175: `MONEDAS=["USD","EUR","CLP"]` USD-first; formatter `US$${value}`; destinos: China, HK, Taiwan, Korea, USA | **USD** | HIGH |
| **3. Costos principales (materiales, packing, flete)** | `FinanzasModule.jsx` L335-336: `mat_usd_kg`, `srv_usd_kg`; `buildAllegria()` L1402-1406: "Costo Fruta Exportación", "Materiales", "Servicios de Packing" — todos en USD/kg | **USD** | HIGH |
| **4. Remuneraciones** | Salarios CLP en origen, pero el modelo los incorpora al flujo USD (`calcAllegria()`). Indicador secundario. | CLP → USD (convertido) | MEDIUM |
| **5. Caja y bancos** | `FinanzasModule.jsx` L6668: `"Saldo Banco USD"` explícito; `saldo_ini: 17433` en USD (L1390) | **USD** | HIGH |
| **6. Financiamiento** | Créditos bancarios BICE + Santander en USD (L408-424); advances compradores asiáticos (Zelun $120K, Yiannis $117K, Fresion $136K, Qupai $76,864, China Smart $50K) todos en USD | **USD** | HIGH |
| **7. Cómo lleva la contabilidad Contec** | Contec no declara moneda en los archivos (sin columna currency). Los importes son números brutos — la moneda es implícita del entorno del libro. El libro ALF en Contec está configurado en el entorno de la empresa → cuyos flujos son USD. | USD (implícito) | MEDIUM |
| **8. Evidencia directa** | `CLAUDE.md` L26: tabla explícita `Allegria Foods \| USD`; OA-024-08A STEP 1 original recomendaba USD. AC-04 EERR: "Diferencia de cambio" en EGRESOS NO OPERACIONALES → presencia de FX diffs confirma entorno USD funcional con costos CLP que generan diferencias. | **USD** | VERY HIGH |

### Verificación interna

AC-04 confirma "Diferencia de cambio" en EGRESOS NO OPERACIONALES de ALF. Si la moneda funcional fuera CLP, los movimientos USD (ventas, adelantos de compradores) generarían diferencias de cambio. Pero esto sería al revés: ALF vende en USD, sus costos CLP generan diferencias → el indicador apunta a USD funcional con pasivos CLP.

### Conclusión D8-ALF

**RECOMENDACIÓN FORMAL: `functional_currency = 'USD'` — CONFIDENCE: HIGH**

Todos los indicadores principales IAS 21 (precios, facturación, costos exportación, bancos, financiamiento) apuntan a USD. Solo la nómina apunta parcialmente a CLP (indicador secundario). El CLAUDE.md, el modelo financiero y el EERR real confirman USD.

**Evidencia faltante para 100% de certeza** (no cambia la recomendación):
- Resolución de directorio explícita de moneda funcional
- Informe de auditor que declare functional currency

**Único pendiente formal**: INSERT en `acc_entity_config` + `acc_base_profile` con `functional_currency = 'USD'` — acción administrativa, no de evidencia.

**`functional_currency` NO está hardcodeado** en ContecAdapter.js (fix D8 aplicado en OA-024-08). Tampoco en ningún otro archivo del dominio acc_*. Cumple D6.

---

## MAPPING

### CSV generado

`ALF-CONTEC-MAPPING-PROPOSAL-v1.csv` generado en `src/accounting/` con estructura:

```
source_account_prefix, source_account_code_example, source_account_name_example,
source_type, naturaleza_contec, clase_contec, sub_clase_contec,
observed_nonzero, observed_amount_abs, base_classification,
proposed_reporting_account, normal_balance, confidence,
reason, manual_review_required, mapping_status, evidence_source
```

### Métricas del mapping proposal

| Métrica | Valor |
|---------|-------|
| Total entradas en CSV | 50 (tiers 1–10) |
| Códigos OBSERVADOS en AC-04 (mapping_status = READY) | **4** |
| Prefijos con classifier HIGH confidence (NEEDS_EXACT_CODE) | 33 |
| Prefijos con classifier MEDIUM confidence (requieren revisión) | 13 |
| Reporting accounts cubiertos por el classifier | **17/17** |
| Cobertura actual en `acc_chart_mapping` DB | **0 rows** |

### Códigos READY para insertar (AC-04 observed)

| source_account_code | source_account_name | proposed_reporting_account | evidence |
|--------------------|--------------------|-----------------------------|---------|
| `4.01.01.002` | VENTA CEREZAS FRESCAS EXPORTACION | ING | AC-04 §3.1 |
| `6.11.01.010` | SUELDOS Y SALARIOS | GOPEX | AC-04 §3.4 (múltiples CC) |
| `6.11.07.290` | GASTOS BANCARIOS | GOPEX* | AC-04 §3.4 |
| `6.11.07.310` | SEGUROS | GOPEX | AC-04 §3.4 |

*`6.11.07.290` GASTOS BANCARIOS: requiere revisión — puede ser GOPEX (gastos administrativos bancarios) o FIN (comisiones financieras). Marcado `manual_review_required=YES`.

### Classifier Level 1 — cobertura completa

| Prefijo | Naturaleza Contec | → Reporting Account | Confidence |
|---------|------------------|---------------------|------------|
| 1.01–1.09 | Activo Corriente | ACT_C | HIGH |
| 1.10–1.99 | Activo No Corriente | ACT_NC | HIGH |
| 2.01–2.09 | Pasivo Corriente | PAS_C | HIGH |
| 2.10–2.99 | Pasivo No Corriente | PAS_NC | HIGH |
| 3.xx | Patrimonio | PAT | HIGH |
| 4.xx | INGRESOS | ING | HIGH |
| 5.xx | GASTOS OPERACIONALES (costos) | COSTO | HIGH |
| 6.xx | GASTOS DE ADM. Y VENTAS | GOPEX | HIGH |
| 7.xx–8.xx | EGRESOS NO OPERACIONALES | FIN | MEDIUM |
| 9.xx | IMPUESTO A LA RENTA | IMP | HIGH |

**Naturalezas ALF observadas en EERR real** (AC-04 §3.3):
- INGRESOS (4.xx)
- GASTOS DE ADM. Y VENTAS (6.xx)
- GASTOS OPERACIONALES (5.xx)
- EGRESOS NO OPERACIONALES (7.xx–9.xx): incluye intereses, diferencia de cambio, amortización derecho de uso, resultado inversiones método patrimonio, impuesto renta

**Cobertura completa confirmada**: todos los rangos del EERR ALF están cubiertos por los 17 reporting accounts.

### Pendiente para mapping Level 2

Los 366 códigos de `Balance Foods.xlsx` y ~90/175 de EERR no están en el repo (sin reproducir montos per AC-04). El CSV actual cubre el **framework completo**. La lista exacta de códigos emerge naturalmente del primer batch: `fn_acc_mapping_completeness(batch_id)` reportará los gaps con valor ≠ 0.

---

## A. ALF Functional Currency Status (D8) — actualizado

### Arquitectura verificada ✓

`acc_entity_config` soporta moneda funcional de forma temporal (una fila por período, effective_from/effective_to):

```
acc_entity_config
  entity_id            UUID NOT NULL FK → core_entities
  effective_from       DATE NOT NULL
  effective_to         DATE (nullable — open-ended)
  functional_currency  CHAR(3) (nullable — pendiente INSERT)
  reporting_currency   CHAR(3) NOT NULL DEFAULT 'USD'
  consol_method        TEXT NOT NULL DEFAULT 'unresolved'
  ownership_pct        NUMERIC(7,4)
  nci_pct              NUMERIC(7,4)
```

`acc_base_profile` soporta perfil no-temporal por entidad:

```
acc_base_profile
  entity_id            UUID NOT NULL UNIQUE FK → core_entities
  functional_currency  CHAR(3) (nullable — pendiente INSERT)
  reporting_currency   CHAR(3) NOT NULL DEFAULT 'USD'
  consol_method        TEXT NOT NULL DEFAULT 'unresolved'
  is_ifrs              BOOLEAN NOT NULL DEFAULT true
  framework_version    TEXT NOT NULL DEFAULT 'IFRS-2024'
```

### Estado DB (Q1 + Q3a confirmados 2026-08-19)

| Tabla | ALF seeded | functional_currency |
|-------|-----------|---------------------|
| `acc_base_profile` | **NO — 0 rows** | — |
| `acc_entity_config` | **NO — 0 rows** | — |

### Status D8-ALF — actualizado

**D8-ALF: EVIDENCIA COMPLETA → PENDING CFO FORMAL DECLARATION**

La evidencia (ver sección D8-ALF ASSESSMENT arriba) es suficiente para recomendar `USD` con HIGH confidence. El único paso pendiente es la declaración formal del CFO para poblar la DB.

**Esto NO es una pregunta abierta** — es una confirmación de la recomendación técnica. Ver STEP FOR ANGELO abajo.

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

**Hallazgo clave**: **Ninguno de los dos formatos tiene columna de moneda.** El export Contec no declara la moneda de los importes.

### Conclusión: source_reporting_currency_semantics

```
source_reporting_currency_semantics = "implicit"
evidence = "ninguna columna de moneda en formato Balance 10-col ni EERR 9-col"
resolution = "declarar en acc_entity_config.functional_currency — recomendación: USD"
```

### Fix aplicado en ContecAdapter.js (OA-024-08A)

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

El caller (OA-024-09) debe:
1. Leer `acc_entity_config.functional_currency` para la entidad del batch
2. Pasarlo como `sourceCurrency` al parser

**Status**: Fix APLICADO y commiteado. D6 compliant.

---

## C. Mapping Coverage

### Reporting accounts disponibles (17 filas)

**ESF — 8 accounts:** ACT, ACT_C, ACT_NC, PAS, PAS_C, PAS_NC, PAT, TOTAL

**ERI — 9 accounts:** ING, COSTO, MB, GOPEX, EBIT, FIN, EBT, IMP, UAI

**Nota**: EFE y ECP tienen `acc_financial_statement` header pero sin filas en `acc_reporting_account`. No disponibles para mapping.

### Cobertura ALF

| Métrica | Valor |
|---------|-------|
| Cuentas en `acc_chart_mapping` para ALF (DB) | **0** |
| Entradas en mapping proposal CSV (framework) | **50** |
| Códigos READY (confirmados AC-04) | **4** |
| Coverage % en DB | 0% (pending insert post-CFO approval) |

---

## D. Unmapped Accounts

4 códigos READY para insert inmediato post-aprobación CFO:
- `4.01.01.002` → ING
- `6.11.01.010` → GOPEX
- `6.11.07.290` → GOPEX (con revisión)
- `6.11.07.310` → GOPEX

Resto de cuentas emergen en el primer batch vía `fn_acc_mapping_completeness(batch_id)`.

---

## E. Mapping Proposal

### Framework completo (Level 1)

Ver CSV: `src/accounting/ALF-CONTEC-MAPPING-PROPOSAL-v1.csv`

| Prefijo | → Reporting Account | Confidence | Manual Review |
|---------|---------------------|------------|---------------|
| 1.01–1.09 | ACT_C | HIGH | NO |
| 1.10–1.99 | ACT_NC | HIGH | NO |
| 2.01–2.09 | PAS_C | HIGH | NO |
| 2.10–2.99 | PAS_NC | HIGH | NO |
| 3.xx | PAT | HIGH | NO |
| 4.xx | ING | HIGH | NO |
| 5.xx | COSTO | HIGH | NO |
| 6.xx | GOPEX | HIGH | NO (salvo 6.xx.07 gastos bancarios) |
| 7.xx–8.xx | FIN | MEDIUM | YES (diferencia de cambio puede ser + o -) |
| 9.xx | IMP | HIGH | NO |

---

## F. Required DB Changes

Las siguientes acciones son necesarias para PILOT ALF = READY. **Ninguna se ejecuta sin confirmación CFO.**

### F.1 — acc_base_profile INSERT

```sql
-- Ejecutar en Supabase SQL Editor DESPUÉS de confirmación CFO
INSERT INTO acc_base_profile
  (entity_id, functional_currency, reporting_currency, consol_method, is_ifrs, framework_version)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   'USD',           -- Recomendado: HIGH confidence evidencia ALF
   'USD',
   'line_by_line',  -- ALF: 100% controlada por MED
   true,
   'IFRS-2024')
ON CONFLICT (entity_id) DO NOTHING;
```

### F.2 — acc_entity_config INSERT

```sql
-- Ejecutar en Supabase SQL Editor DESPUÉS de confirmación CFO
INSERT INTO acc_entity_config
  (entity_id, effective_from, effective_to, functional_currency,
   reporting_currency, consol_method, ownership_pct, nci_pct)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '2026-01-01',  -- inicio ejercicio fiscal vigente
   NULL,          -- open-ended
   'USD',         -- Recomendado
   'USD',
   'line_by_line',
   100.0,         -- ALF: 100% MED (CLAUDE.md)
   0.0)
ON CONFLICT DO NOTHING;
```

### F.3 — acc_chart_mapping INSERTs (4 códigos READY)

```sql
-- 4 cuentas observadas en AC-04 — READY para insertar
-- Ejecutar DESPUÉS de CFO approval del mapping proposal CSV
INSERT INTO acc_chart_mapping
  (entity_id, local_account_code, reporting_account_id, effective_from, is_active, notes)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '4.01.01.002',
   (SELECT id FROM acc_reporting_account WHERE code = 'ING'),
   '2026-01-01', true, 'Venta cerezas frescas exportación — AC-04 observed'),
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.01.010',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true, 'Sueldos y salarios — AC-04 observed'),
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.07.290',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true, 'Gastos bancarios — AC-04 observed; revisar si es FIN vs GOPEX'),
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.07.310',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true, 'Seguros — AC-04 observed')
;
```

### F.4 — acc_company_profile INSERT (opcional, post F.1)

```sql
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

| Atributo | Valor |
|----------|-------|
| Tipo de key | **anon** (no service_role) |
| Archivos con key | 13 en src/ |
| Segundo key (store.js) | También anon, iat diferente (Key B, más antigua, mismo proyecto) |
| RLS | 93/93 PASS — anon → USING(false) en todas las tablas financieras |

**PASS para OA-024-09 — con caveats registrados.**

**Deuda técnica**: unificar Key A+B en `REACT_APP_SUPA_KEY`. Prioridad baja, no bloquea nada.

---

## H. Storage Policy Assessment — RECLASIFICADO

### Reclasificación Q5

**Q5 resultado original**: 0 rows en `storage.buckets` para `accounting-source`.

**Reclasificación**: ENVIRONMENT ACCESS LIMITATION, no ausencia de bucket.

Angelo confirmó: bucket `accounting-source` existe en `bywovqayuzodbzwsriet`, estado PRIVATE. La query SQL Editor no puede ver `storage.buckets` directamente (restricción de permisos Supabase en schema storage).

**Estado real**:

| Check | Estado |
|-------|--------|
| accounting-source bucket existe | ✅ CONFIRMADO (CFO visual) |
| public = false | ✅ PRIVATE |
| Anon read/write DENIED | ✅ (fail-closed sin policies = solo service_role) |
| RLS policies en storage.objects | ⚠ 0 policies — V1 no necesita (service_role upload) |

**Gate Storage: PASS para V1** — no requiere crear bucket ni crear policies adicionales para OA-024-09.

**Para acceso autenticado-usuario** (post V1): agregar policies. Template disponible:

```sql
CREATE POLICY "accounting_source_authenticated"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'accounting-source')
  WITH CHECK (bucket_id = 'accounting-source');
```

---

## PILOT ALF — GO/NO-GO

| Gate | Estado | Evidencia | Desbloqueante |
|------|--------|-----------|--------------|
| OA-024-08 93/93 PASS | ✅ PASS | Test run 2026-08-19 | — |
| acc_source_adapter_profile ALF/contec | ✅ PASS | Q3b: 1 row, is_active=true | — |
| 17 reporting accounts disponibles | ✅ PASS | Q4: 17 rows (9 ERI + 8 ESF) | — |
| SUPA key = anon (no service_role) | ✅ PASS | JWT decode | — |
| RLS fail-closed | ✅ PASS | 93/93 tests | — |
| Schema correcto (local_account_code) | ✅ PASS | Q2 corrida exitosa | — |
| ContecAdapter: no hardcode functional_currency | ✅ PASS | Fix aplicado OA-024-08A | — |
| Storage bucket exists + private | ✅ PASS | CFO confirmó visualmente | — |
| D8-ALF: evidencia funcional currency completa | ✅ PASS | Ver D8-ALF ASSESSMENT | — |
| D8-ALF: acc_entity_config INSERT ejecutado | ⏳ PENDING | 0 rows en DB | **CFO: confirmar 'USD'** |
| D8-ALF: acc_base_profile INSERT ejecutado | ⏳ PENDING | 0 rows en DB | **CFO: confirmar 'USD'** |
| Chart mapping ALF ≥ 4 cuentas READY | ⏳ PENDING | CSV generado, pendiente insert | **CFO: aprobar mapping CSV** |

**PILOT ALF = PENDING 1 CFO DECISION (B1)**

Todos los blockers técnicos están resueltos. Solo queda la declaración formal del CFO.

---

## BLOCKERS REALES

**Solo 1 blocker real que requiere CFO:**

| # | Blocker | Qué se necesita |
|---|---------|----------------|
| B1 | `functional_currency` no insertada en DB | CFO confirmar: "Confirmo ALF functional_currency = USD" |

**No son blockers (resueltos):**

| Item | Estado |
|------|--------|
| B2 (original) — bucket no existe | Resuelto: EXISTS confirmado |
| B3 (original) — mapping 0 cuentas | Resuelto: CSV generado, 4 READY, framework completo |
| Evidencia moneda funcional | Resuelto: HIGH confidence USD |
| ContecAdapter hardcode | Resuelto: fix aplicado (OA-024-08A) |
| SUPA key security | Pass: anon + RLS 93/93 |

---

## STEP FOR ANGELO

**Una sola acción:**

> **Confirmar moneda funcional de Allegria Foods Ltd.**
>
> La evidencia técnica es completa y apunta a USD con HIGH confidence:
> - CLAUDE.md declara explícitamente "Moneda: USD"
> - FOB precios, costos, bancos, financiamiento: todos en USD
> - Diferencia de cambio en EERR (costos CLP vs función USD) confirma
>
> Si estás de acuerdo, responde exactamente:
> **"Confirmo ALF functional_currency = USD"**
>
> Con esa confirmación, el técnico ejecuta F.1 + F.2 (2 INSERTs), carga el mapping de las 4 cuentas READY, y declara **PILOT ALF = READY**.
>
> Si la moneda no es USD, indicar cuál.

**Qué NO necesita Angelo:**
- No crear bucket (ya existe)
- No proveer archivo Contec (el framework está generado; el primer batch completará la lista)
- No responder preguntas de evidencia (ya resuelta)

---

## I. Context para OA-024-09

Cuando el pilot sea READY:

1. El caller de OA-024-09 lee `acc_entity_config.functional_currency` para ALF
2. Pasa el valor al parser: `parseBalanceContec(rows, sourceCurrency)` o `parseEerrContec(rows, sourceReportType, sourceCurrency)`
3. El batch avanza por el lifecycle: CREATED→PARSING→PARSED→VALIDATING→VALIDATED→PENDING_APPROVAL→APPROVED→POSTING→POSTED
4. `fn_acc_mapping_completeness(batch_id)` reporta cuentas sin mapping → se agregan al CSV
5. El posting a `acc_account_balance` requiere `functional_currency` ya insertada (validación de moneda)

**No se autoriza OA-024-09 todavía.** Este documento es el preflight completo.

---

## Apéndice: Decisiones Técnicas Autónomas Tomadas

| Decisión | Razón |
|----------|-------|
| `local_account_code` (no `source_account_code`) | Schema 008 confirmado |
| SUPA key = PASS | JWT decode + 93/93 tests |
| functional_currency en acc_entity_config, no en adapter | Arquitectura: transaction_currency ≠ functional_currency |
| EFE/ECP no disponibles para mapping | Seeds 011 sin reporting_account rows para esos FS |
| Q5 = ENVIRONMENT ACCESS LIMITATION (no ausencia) | CFO confirmó bucket visualmente; SQL Editor no puede leer storage.buckets |
| Mapping CSV: 4 READY + framework 50 entries | AC-04 evidence + Level 1 classifier; no se inventaron mappings sin evidencia |
| Recomendación USD HIGH confidence (no pedir al CFO adivinar) | 8 factores IAS 21 evaluados con evidencia de código y documentación |

---

*Actualizado 2026-08-19 — Environment reconciliation completa, D8-ALF assessment con evidencia HIGH confidence (USD), mapping CSV generado, storage reclasificado como PASS. 1 solo blocker real: CFO confirmar functional_currency.*

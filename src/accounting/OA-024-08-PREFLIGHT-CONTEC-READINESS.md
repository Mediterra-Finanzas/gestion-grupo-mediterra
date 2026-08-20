# OA-024-08-PREFLIGHT — ContecAdapter Implementation Readiness

**Fecha:** 2026-08-18  
**Autorización:** CFO Angelo Huerta  
**Rama:** claude/crazy-heisenberg-f33f7a  
**Prerrequisito:** OA-024-07 STABLE ✓ (014+015+012 PASS)  
**Estado:** PREFLIGHT — discovery + decisiones de diseño. NO IMPLEMENTAR.

---

## A. CC Granularity Assessment

### Estructura real del EERR Contec

| Col | Campo | Observación |
|---|---|---|
| A | Naturaleza | Agrupador de primer nivel |
| B | Clase | Agrupador de segundo nivel |
| C | Sub-clase | Agrupador de tercer nivel |
| D | Código | `source_account_code` (ej. `6.11.01.010`) |
| E | Nombre | Descripción de la cuenta |
| F | CentroCosto | Dimensión analítica |
| G | Real | Monto período actual |
| H | Ppto | Monto presupuestado |
| I | Varianza | G − H (derivable, pero explícito en fuente) |

**Una misma cuenta (D) puede aparecer N veces**, una por cada CentroCosto (F) con actividad en el período.

Ejemplo:
```
6.11.01.010 | Sueldos | CC-100 | 150.000
6.11.01.010 | Sueldos | CC-200 |  80.000
6.11.01.010 | Sueldos | CC-300 |  45.000
```

El saldo total de la cuenta en el período = 275.000 (suma de los tres CC).

### Constraint actual que genera el gate

```sql
-- 008_accounting_tables_apply.sql — línea 467
CONSTRAINT uq_acc_account_balance UNIQUE (entity_id, period_id, account_code, balance_type)
```

→ Una sola fila por cuenta/período/tipo. Postear tres filas de la misma cuenta con CC distinto genera `unique_violation`.

### Estructura ya existente en el schema (hallazgo de grounding)

```sql
-- T6.2 ya creado en 008:
CREATE TABLE IF NOT EXISTS acc_account_balance_dim (
  id                 BIGINT NOT NULL REFERENCES acc_account_balance(id) ON DELETE CASCADE,
  dim_value_id       BIGINT NOT NULL REFERENCES dim_value(id) ON DELETE RESTRICT,
  CONSTRAINT uq_acc_balance_dim UNIQUE (account_balance_id, dim_value_id)
);
```

`acc_account_balance_dim` existe pero asocia una o varias etiquetas dimensionales a una fila de balance **ya agregada**. No resuelve la granularidad de detalle CC porque sería N tags sobre un saldo, no N saldos distintos.

---

## B. Recommended Option — C (Source Detail Separado)

**Recomendación: Opción C.**

### Justificación técnica

| Criterio | Opción A (agregar) | Opción B (extender UNIQUE) | **Opción C (detail separado)** |
|---|---|---|---|
| Integridad del ledger | ✓ | Riesgo duplicar saldos | ✓ |
| CC trazable sin recargar archivo | ✗ — CC descartado | ✓ | ✓ |
| Schema change en tablas core | Ninguno | Breaking change | Ninguno |
| Complejidad de consolidación | Baja | Alta | Baja |
| EEFF funciona en V1 | ✓ | Requiere refactor | ✓ |
| Drill-down CC futuro | Imposible sin archivo | En ledger | En staging |
| Reversibilidad | CC perdido = no reversible | Alto impacto | Completamente reversible |

**Opción A descartada:** viola el requisito de trazabilidad CC sin recargar el archivo. Descartado explícitamente por el CFO.

**Opción B descartada:** breaking change en `uq_acc_account_balance` propaga riesgos a consolidación, EEFF, y queries de reporting existentes. El beneficio (CC en ledger) no justifica el costo en V1.

**Opción C elegida:** el ledger canónico recibe un saldo agregado por cuenta. El detalle por CC se persiste en `acc_source_balance_detail`, enlazado permanentemente al `batch_id`. La cadena de trazabilidad queda completa:

```
cuenta → saldo canónico
       → batch_id → acc_source_balance_detail
                  → CC breakdown
                  → fila fuente (source_row_ref)
```

---

## C. Canonical Source Detail Contract

### Tabla nueva: `acc_source_balance_detail`

```sql
CREATE TABLE acc_source_balance_detail (
  id               BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id         UUID          NOT NULL
                     REFERENCES acc_source_batch(id) ON DELETE RESTRICT,
  source_row_ref   TEXT          NOT NULL,   -- "row:14", "sheet:Cuentas:row:14"
  account_code     TEXT          NOT NULL,   -- columna D del EERR
  account_name     TEXT,                     -- columna E
  naturaleza       TEXT,                     -- columna A
  clase            TEXT,                     -- columna B
  sub_clase        TEXT,                     -- columna C
  cost_center      TEXT,                     -- columna F (CentroCosto)
  real_amount      NUMERIC(18,2) NOT NULL DEFAULT 0,    -- columna G
  budget_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,    -- columna H
  variance_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,    -- columna I (G − H)
  currency         CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Índices de drill-down
CREATE INDEX idx_asbd_batch       ON acc_source_balance_detail(batch_id);
CREATE INDEX idx_asbd_account     ON acc_source_balance_detail(batch_id, account_code);
CREATE INDEX idx_asbd_cost_center ON acc_source_balance_detail(batch_id, cost_center);
```

**Cardinalidad esperada por batch EERR ALF:**

Si el EERR tiene M cuentas únicas y promedio de N CCs por cuenta:
- `acc_source_balance_detail`: M × N filas (fuente de verdad granular)
- `acc_account_balance`: M filas (saldo agregado, una por cuenta)

### Invariante de consistencia

```
SUM(real_amount) WHERE batch_id = X AND account_code = '6.11.01.010'
= acc_account_balance.net_balance WHERE source_batch_id = X AND account_code = '6.11.01.010'
```

El ContecAdapter debe verificar este invariante antes del posting.

### Inmutabilidad

`acc_source_balance_detail` es **append-only**. Una vez que el batch está POSTED, las filas de detalle no se modifican. La corrección pasa por un nuevo batch que supersede al anterior.

---

## D. Balance vs EERR Normalization

El EERR Contec tiene dos layouts con semántica distinta que el Adapter debe manejar explícitamente.

### EERR período (report_type = 'eerr_periodo')

- Fuente de actividad en el período (flujo)
- Columnas G/H/I = Real/Ppto/Varianza del **mes o período**
- Granularidad por CC: OBLIGATORIA para trazabilidad
- Modelo de posting:
  - `acc_source_balance_detail`: una fila por cuenta × CC
  - `acc_account_balance`: una fila por cuenta (SUM de CC), `balance_type = 'actual'`
  - `pln_budget_entry`: una fila por cuenta (SUM de CC), desde columna H

### Balance (report_type = 'balance')

- Saldo acumulado a fecha de corte (stock)
- Formato típico: columnas de débito YTD / crédito YTD / saldo neto
- Sin granularidad CC en los balances de ALF/Contec (a confirmar con Angelo)
- Modelo de posting:
  - `acc_account_balance`: una fila por cuenta, `balance_type = 'actual'`
  - No genera `acc_source_balance_detail` (no hay detalle CC en balance)

### Separación en el Adapter

```
parseContecFile(file)
  → detectReportType()   -- 'eerr_periodo' | 'balance'
  → if eerr_periodo:
      → parseEerrRows()        → List<SourceDetailRow>
      → aggregateByAccount()   → List<CanonicalBalance>
      → validateInvariant()
  → if balance:
      → parseBalanceRows()     → List<CanonicalBalance>
  → createIssues() para filas con errores
  → postDetail()              → INSERT INTO acc_source_balance_detail
  → postCanonical()           → INSERT INTO acc_account_balance
```

El `report_type` se registra en `acc_source_batch.report_type` (campo ya disponible desde OA-024-07).

---

## E. Storage Discovery

### Buckets existentes identificados en codebase

| Bucket | Módulo | Visibilidad | Acceso lectura | Propósito |
|---|---|---|---|---|
| `frisku-docs` | FriskuComercialModule, RendicionesModule | **PÚBLICO** | URL pública permanente | Docs Frisku, embarques, rendiciones de gasto |
| `nominas-docs` | FinanzasModule (Expediente Digital) | **PRIVADO** | Signed URL 1h (on-demand) | Respaldo documental nóminas |
| `osiris-fotos` | OsirisModule | **PÚBLICO** | URL pública permanente | Fotos informes técnicos, logo Osiris |

### Patrones de storage reales (desde discovery)

**`frisku-docs`** — bucket público, helper en `friskuHelpers.js`:
```javascript
// Upload directo
uploadArchivoFrisku(file, path) → URL pública absoluta o null
// Path patterns usados:
//   clientes/{clienteId}/{docId}/{timestamp}.{ext}
//   rendiciones/{rendId}/{gastoId}_{timestamp}.{ext}
//   embarques/{oeId}/comex/{docId}/{timestamp}.{ext}
```

**`nominas-docs`** — bucket privado, helper en `friskuHelpers.js` + `expedienteHelpers.js`:
```javascript
uploadDocNomina(file, path) → { ok, path, error }   // NUNCA URL pública
urlFirmadaNomina(path, 3600) → signedURL            // expira en 1h, no se persiste
// Path pattern: nominas/{slug_empresa}/{nomina_id}/{item_id}/{docId}_{filename}
```

**`osiris-fotos`** — bucket público, helpers locales en `OsirisModule.jsx`:
```javascript
uploadFoto(file, informeId) → URL pública
// Path: informes/{informeId}/{timestamp}_{random}.{ext}
```

**Arquitectura guard/proxy** (cuando `REACT_APP_USE_GUARD=true`):
- Upload vía signed upload URL generada por `/api/storage?op=upload-url` (browser no toca anon key)
- Read vía `/api/storage?op=sign` → signed URL temporal
- Delete vía `/api/storage?op=delete`

### Evaluación de reutilización

| Bucket | ¿Reutilizable para accounting? | Razón |
|---|---|---|
| `frisku-docs` | **NO** | PÚBLICO — URLs permanentes no son aceptables para evidencia financiera |
| `nominas-docs` | **NO** | Semánticamente HR/nóminas; ciclo de vida y permisos contables distintos |
| `osiris-fotos` | **NO** | PÚBLICO, Osiris-específico |

**Conclusión: se requiere bucket nuevo `accounting-source`.**

Justificación:
1. El único bucket privado existente (`nominas-docs`) es HR-específico — mezclar compromete la separación de dominio
2. `frisku-docs` es público — URLs permanentes exponen evidencia financiera a cualquier conocedor del path
3. Evidencia financiera corporativa: retención indefinida, acceso restringido a roles contables, ciclo de vida distinto al operativo
4. Naming `accounting-source` es corporativo-neutro: aplica a todas las entidades del grupo, no solo ALF

**Patrón a reutilizar de `nominas-docs`:** signed URL on-demand (TTL 1h), path inmutable post-posting, upload vía `service_role` nunca desde anon.

---

## F. Storage Recommendation

**Crear bucket: `accounting-source`**

| Atributo | Valor |
|---|---|
| Nombre | `accounting-source` |
| Visibilidad | Privado (no public) |
| Acceso | Solo signed URLs temporales (max 1h) |
| RLS Supabase Storage | `anon` = deny; `authenticated` = deny salvo roles contables |
| Retención | Indefinida (evidencia financiera) |
| File size limit | 50MB (EERR Excel típico < 5MB, headroom para ZIP futuros) |

### Política de acceso

```sql
-- Supabase Storage Policy
-- Solo authenticated con permiso financiero puede leer
-- Solo service_role puede escribir (via backend)
-- anon: deny total
```

El upload SIEMPRE pasa por backend (`service_role`), nunca directo desde browser con anon key. El frontend solo recibe signed URLs efímeras para descarga/preview.

---

## G. Source File Lineage Contract

### Path propuesto

```
accounting-source/
  {entity_uuid}/
    {fiscal_year}/
      {fiscal_month_iso}/          -- YYYY-MM
        {batch_uuid}/
          {original_filename}
```

Ejemplo ALF, EERR enero 2026, batch específico:
```
accounting-source/
  ccaa4e1c-a12b-4f3d-9e1c-8d5f7b2a4e6c/   ← entity_id de ALF
    2026/
      2026-01/
        3f8a1b2c-0d4e-5f6a-7b8c-9d0e1f2a3b4c/   ← batch_id
          EERR_ALF_2026-01_Contec.xlsx
```

**No incluir en el path:** nombre de la empresa en texto plano (usar UUID), datos de montos, RUT.

### Inmutabilidad del archivo

Una vez batch = POSTED:
- El archivo en storage NO se sobreescribe
- Corrección = nuevo archivo → nuevo hash → nuevo batch → supersede
- El path antiguo permanece (retención)

---

## H. Security / Storage Policy

### Matriz de acceso

| Rol | Bucket `accounting-source` | `acc_source_balance_detail` |
|---|---|---|
| `anon` | DENY | DENY (RLS USING false) |
| `authenticated` (general) | DENY | DENY |
| `authenticated` (importer) | WRITE (upload propio) | READ (propio batch) |
| `authenticated` (approver) | READ | READ |
| `authenticated` (auditor) | READ | READ |
| `service_role` | ALL | ALL |

Nota: roles `importer/approver/auditor` son targets de OA-024-08. En V1 se implementa `authenticated` broad (igual que otras tablas acc_*), con refinamiento a roles específicos en OA-024-09.

### Cross-company protection

El path en storage usa `entity_uuid` como prefijo. La RLS de storage (a implementar en OA-024-08) debe verificar que el usuario solo puede acceder a paths de entidades a las que tiene acceso. La columna `entity_id` en `acc_source_batch` es la fuente de verdad.

---

## I. Required Schema Changes

### Migration 016 (nueva — OA-024-08)

#### I.1 Tabla nueva: `acc_source_balance_detail`

```sql
CREATE TABLE acc_source_balance_detail (
  id             BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id       UUID          NOT NULL REFERENCES acc_source_batch(id) ON DELETE RESTRICT,
  source_row_ref TEXT          NOT NULL,
  account_code   TEXT          NOT NULL,
  account_name   TEXT,
  naturaleza     TEXT,
  clase          TEXT,
  sub_clase      TEXT,
  cost_center    TEXT,
  real_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
  budget_amount  NUMERIC(18,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  currency       CHAR(3)       NOT NULL DEFAULT 'USD',
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
```

RLS: `anon` DENY, `authenticated` broad (V1), `service_role` ALL.
Indexes: `batch_id`, `(batch_id, account_code)`, `(batch_id, cost_center)`.

#### I.2 Columnas nuevas en `acc_source_batch`

```sql
ALTER TABLE acc_source_batch
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT,    -- 'accounting-source'
  ADD COLUMN IF NOT EXISTS storage_path   TEXT,    -- path completo en bucket
  ADD COLUMN IF NOT EXISTS mime_type      TEXT,    -- 'application/vnd.openxmlformats...'
  ADD COLUMN IF NOT EXISTS file_size      BIGINT;  -- bytes
```

Nota: `file_hash` ya existe y cumple el rol de SHA-256.

#### I.3 Sin cambios en `acc_account_balance`

El UNIQUE `(entity_id, period_id, account_code, balance_type)` se mantiene sin modificar. El saldo que entra es la suma agregada del EERR, sin CC.

---

## J. Required Code Changes

### J.1 ContecAdapter (a crear en OA-024-08)

```
ContecAdapter
  ├── parseEerrMensualContec(file)   → List<SourceDetailRow>
  ├── aggregateToCanonical(rows)     → List<CanonicalBalance>  -- GROUP BY account_code
  ├── validateInvariant(detail, canonical)   -- SUM check
  ├── createBatchIssues(errors)      → List<BatchIssue>
  ├── postDetail(batch_id, rows)     → INSERT acc_source_balance_detail
  ├── postCanonical(batch_id, rows)  → INSERT acc_account_balance
  └── uploadToStorage(batch_id, file) → storage_path + acc_source_batch update
```

### J.2 parseEerrMensualContec — nota DT-007-06

La deuda técnica DT-007-06 (identificada en OA-024-07) indica que `parseEerrMensualContec` ya existe en `FinanzasModule.jsx` pero con formato que puede diferir del EERR real Contec. El ContecAdapter V1 debe escribir un parser limpio desde la evidencia real AC-04.

### J.3 Bucket creation (OA-024-08)

Crear bucket `accounting-source` en Supabase Storage (acción única, fuera de migration SQL).

---

## K. Pilot Entity Readiness — ALF

| Requisito | Estado | Detalle |
|---|---|---|
| `core_entities` tiene ALF | ✓ PASS | code='ALF', country='CL', con RUT |
| `acc_source_adapter_profile` ALF/contec | ✓ PASS | Seed en 014, capabilitySet AC-04 |
| D7 (entity_type) | No aplica a ALF | ALF = 'subsidiary' ✓ |
| D8 (functional currency) | VERIFICAR | ¿ALF tiene functional_currency en acc_source_adapter_profile? |
| acc_chart_mapping para ALF | VERIFICAR | ¿Existe mapeo cuenta Contec → acc_reporting_account? |
| acc_period open para ALF | VERIFICAR | ¿Existe un período open para el mes piloto? |
| acc_source_batch_issue = 0 | VERIFICAR | Post-016 migration |

### Verificación D8 para ALF

```sql
-- Ejecutar en SQL Editor antes de OA-024-08
SELECT p.capability_set->>'functional_currency' AS functional_currency,
       p.capability_set->>'reporting_currency'   AS reporting_currency
FROM acc_source_adapter_profile p
JOIN core_entities e ON e.id = p.entity_id
WHERE e.code = 'ALF' AND p.source_system = 'contec';
```

Si el resultado es NULL → D8 necesita resolverse para ALF antes del pilot.

### Verificación acc_chart_mapping

```sql
SELECT COUNT(*) FROM acc_chart_mapping
WHERE entity_id = (SELECT id FROM core_entities WHERE code = 'ALF');
```

Si 0 → el mapping debe construirse antes del primer posting real.

---

## L. Blockers

| ID | Blocker | Severidad | Resuelve en |
|---|---|---|---|
| BLK-08-01 | `acc_source_balance_detail` no existe aún | HARD | Migration 016 |
| BLK-08-02 | `acc_source_batch` sin campos storage | HARD | Migration 016 |
| BLK-08-03 | Bucket `accounting-source` no existe | HARD | Acción manual Supabase |
| BLK-08-04 | D8 functional_currency en ALF/contec profile | VERIFICAR | Si NULL → antes de pilot |
| BLK-08-05 | acc_chart_mapping vacío para ALF | VERIFICAR | Antes de posting real |
| BLK-08-06 | DT-007-06: parser EERR real Contec | HARD | ContecAdapter V1 |

**D7 y D8 globales permanecen OPEN — no bloquean ALF pilot** siempre que D8 de ALF específicamente esté resuelto.

---

## M. GO / NO-GO for OA-024-08 Implementation

### Criterios de READY

| Criterio | Estado |
|---|---|
| CC-GRANULARITY-GATE: Opción C elegida | ✓ DECIDIDO |
| Opción C no requiere cambio a acc_account_balance UNIQUE | ✓ CONFIRMADO |
| acc_source_balance_detail diseñada | ✓ DISEÑADA |
| Storage bucket recommendation: accounting-source | ✓ DECIDIDO |
| acc_source_batch fields adicionales identificados | ✓ DISEÑADOS |
| File immutability: nuevo batch para correcciones | ✓ CONFIRMADO |
| ALF como piloto: entity+profile exist | ✓ CONFIRMADO |
| D7/D8 globales: no bloquean este preflight | ✓ CONFIRMADO |
| D8 ALF específico: verificar antes de pilot | PENDIENTE VERIFICACIÓN |
| acc_chart_mapping ALF: verificar antes de pilot | PENDIENTE VERIFICACIÓN |

### Resultado del Preflight

```
CC-GRANULARITY-GATE = RESOLVED (Opción C)
AC-05 STORAGE GATE  = RESOLVED (bucket accounting-source, path contract)
D7                  = OPEN (no bloquea)
D8                  = OPEN (verificar ALF-specific antes de pilot)
```

**OA-024-08 PREFLIGHT = READY**

Condicionado a:
1. CFO GO explícito
2. Verificación D8/chart_mapping de ALF en Supabase antes del primer posting

---

## Orden de Ejecución OA-024-08 (cuando GO)

```
1. Crear bucket 'accounting-source' en Supabase Storage (acción manual)
2. Ejecutar migration 016 (acc_source_balance_detail + columnas acc_source_batch)
3. Ejecutar tests 016 (suite nueva)
4. Verificar D8 ALF + acc_chart_mapping ALF
5. Implementar ContecAdapter V1 (parseEerr + aggregate + postDetail + postCanonical)
6. Test piloto: EERR ALF enero 2026 (batch completo lifecycle hasta POSTED)
```

---

## Archivos producidos

| Archivo | Contenido |
|---|---|
| [OA-024-08-PREFLIGHT-CONTEC-READINESS.md](OA-024-08-PREFLIGHT-CONTEC-READINESS.md) | Este documento |

---

**STOP — NO INICIAR OA-024-08 SIN GO CFO.**

**Última actualización:** 2026-08-18 — Preflight inicial. CC-GATE y AC-05 resueltos.

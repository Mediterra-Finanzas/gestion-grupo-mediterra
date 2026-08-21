# OA-024-01-R1 — Arquitectura FRP / Dominio Contable
**Mediterra One — Financial Reporting Platform**
**Versión:** R1 (Architecture Review)
**Estado:** AWAITING CFO REVIEW — no autorizado para materialización
**Fecha:** 2026-08-13
**Predecesor:** OA-024-01 (aprobado como base de diseño, 2026-08-13)

---

## CHANGELOG R1

| # | Sección | Problema en R0 | Diseño R1 | Razón | Impacto |
|---|---|---|---|---|---|
| C1 | acc_entry | Una única tabla intentaba representar asiento, movimiento, saldo apertura, saldo cierre y detalle en JSONB simultáneamente | Dos contratos separados: `acc_journal_entry/line` (granularidad asiento) y `acc_account_balance` (granularidad saldo) | Una tabla polimórfica produce integridad ambigua: ¿qué valida el cuadre? ¿el saldo o el asiento? | **Alto** — cambia contrato central del dominio |
| C2 | SourceAdapter | No declaraba capabilities; la plataforma no sabía qué podía y qué no podía ofrecer | Cada adapter declara `CapabilitySet` explícito; la plataforma ajusta drill-down disponible según fuente | Sin declaration, el sistema prometía granularidad que no tenía | **Alto** — impacta UI y drill-down |
| C3 | Convención D1 | Postergada como "decisión entre natural y saldo" | Propuesta formal: `debit ≥ 0`, `credit ≥ 0`, `canonical_value = debit − credit`; presentation_sign separado por tipo de cuenta en reporting rule | Mezclar accounting sign y presentation sign genera errores silenciosos en el EEFF | **Alto** — afecta validaciones, cuadre y toda la capa de presentación |
| C4 | acc_elimination | Tabla plana: `cuenta_a + cuenta_b + monto` | `acc_consolidation_journal` + `acc_consolidation_journal_line` — journals balanceados con N líneas | Una eliminación puede requerir 4-6 cuentas (CxC, CxP, ingreso, costo, impuesto diferido, NCI). Un solo par es insuficiente | **Alto** — rediseño de eliminaciones |
| C5 | acc_adjustment | `cuenta + monto + es_debito` — columna única, sin balance | `acc_adjustment_journal` + `acc_adjustment_journal_line` con partida doble obligatoria y workflow Draft→Submitted→Reviewed→Approved→Posted→Reversed | Un ajuste multilinea sin balance no tiene integridad contable | **Alto** — rediseño de ajustes |
| C6 | IAS 21 / TC | Currency Domain correcto como source of truth, pero snapshot no congelaba exactamente qué tasa utilizó | Snapshot congela: `rate_id`, `rate_value_used`, `rate_date`, `rate_type`, `currency_pair`, `provider`, referencia a versión del Currency Domain | Sin esto un EEFF aprobado en 2026 no puede reproducirse exactamente en 2028 | **Alto** — reproducibilidad histórica |
| C7 | Moneda funcional | Asumida USD para todas las empresas por conveniencia | `functional_currency` proviene de `acc_entity_config` versionada con vigencia temporal; no hardcodeada | La moneda funcional es una decisión contable (IAS 21 párr. 9-14), no un default del sistema | **Medio** — afecta conversión y Allpa Perú especialmente |
| C8 | IAS 28 | Fórmula simple: `% × resultado` | Modelo full lifecycle: carrying_amount_open + result_increment + OCI + dividends + contributions +/- changes + impairment = carrying_amount_close; distinción YTD vs mensual | Una fórmula simple falla en escenarios de cambio de participación, aportes, OCI y acumulación YTD | **Alto** — rediseño IAS 28 |
| C9 | NCI | `% × (patrimonio + resultado)` sin demostrar ausencia de doble conteo | Movement table completa: NCI_open + result + OCI − dividends ± changes = NCI_close; separado balance (patrimonio) de P&L (resultado atribuible) | La fórmula simple es correcta solo en escenario estable. Cambios de participación, dividendos y OCI la rompen | **Alto** — rediseño NCI |
| C10 | Resultado del ejercicio | No definido: podía llegar del ERP y recalcularse desde P&L simultáneamente | Política formal: resultado calculado exclusivamente desde P&L canónico; el resultado que entrega el ERP en patrimonio es informacional y se reconcilia, no se suma | Sin política, el resultado aparece dos veces en el balance consolidado | **Alto** — evita doble conteo crítico |
| C11 | Snapshot | `acc_consolidation_snapshot.data JSONB` único contenedor de todo | `acc_consolidation_run` (header) + `acc_consolidation_result_line` (líneas relacionales) + `acc_snapshot_metadata` (TC congelado, mappings, hashes); JSONB solo para metadata extendida | Un JSON opaco no permite drill-down relacional ni auditoría sin parsear texto | **Alto** — rediseño snapshot |
| C12 | Accounting Profile | Un único nivel: `cuenta_origen → reporting_account` | Jerarquía explícita de 5 niveles: Source ERP → Base Profile → Company Profile → Account Override → Period Override; todos versionados con vigencia | Sin jerarquía de override, una reclasificación global fuerza a crear excepciones por empresa fuera del modelo | **Medio** — extiende mapping actual |
| C13 | Dimensiones | Hardcodeadas como columnas: `centro_costo`, `auxiliar` | Patrón EAV extensible: `dim_type` + `dim_value` + tabla pivot `acc_entry_dim`; dimensiones adicionales sin alterar schema | Cada vez que aparece una nueva dimensión (proyecto, campo, variedad) requería ALTER TABLE y migración | **Alto** — cambio arquitectónico de extensibilidad |
| C14 | Budget/Forecast | `acc_budget_entry` mezclado con dominio accounting | `pln_*` como Planning Ledger separado; comparte dimensiones canónicas pero NO comparte tablas con Accounting Ledger | Mezclar transacciones reales con planificación contamina el ledger contable | **Medio** — separación de dominios |
| C15 | Cierre de período | Un solo estado `approved` mezclaba cierre operativo con aprobación del reporte | Dos estados separados: `acc_period` (close operativo: open→soft_close→locked) y `acc_reporting_run` (aprobación del reporte: draft→submitted→approved); un período puede relanzar un nuevo reporting run sin reabrirse | Un período puede cerrarse operativamente (locked) y luego necesitar una versión corregida del reporte aprobado | **Medio** — separación de responsabilidades |
| C16 | Autorización CFO | PIN casero dentro del módulo contable | Usa sistema de identidad central (usuario autenticado + sesión + rol/capability + step-up MFA); no credenciales paralelas | Un PIN local no tiene auditoría corporativa, no es MFA y crea deuda de seguridad | **Bajo** (diseño) — crítico en implementación |
| C17 | Auditoría | `acc_audit_log` tabla local desconectada | Emitir eventos auditables al Audit Domain corporativo; si se requiere audit especializado contable, tiene relación FK al evento corporativo | Duplicar infraestructura de auditoría crea inconsistencias y doble mantenimiento | **Medio** — no duplicar |
| C18 | Multi-entidad | `acc_company` como catálogo nuevo; códigos MH/AF hardcodeados | `acc_company` referencia al maestro corporativo de entidades (foreign key, no duplicación); motor usa IDs, nunca strings hardcodeados | Dos maestros de empresas divergen inevitablemente | **Alto** — single source of truth |
| C19 | Ownership / % | Porcentajes hardcodeados (20% NCI, 50% Allpa Chile, etc.) | `acc_ownership` con modelo temporal: entity, parent, ownership_%, voting_%, consolidation_method, effective_from, effective_to | Un cambio de participación forzaría reescritura del motor | **Alto** — modelo temporal |
| C20 | Materialidad | Fórmula visual no configurable | `acc_materiality_policy` versionada: umbral absoluto, relativo, combinación, scope por empresa/línea/período/tipo de análisis | La materialidad sin configuración es subjetiva y no auditable | **Medio** — extensión del diseño |
| C21 | Management Performance | Drivers operacionales "future work" sin validar arquitectura | Validar que el diseño R1 permite conectar Financial Actuals + Operational Actuals; definir contrato de linkage | Si el FRP no puede conectar USD/kg o EBITDA/ha, necesita rediseño posterior costoso | **Medio** — validación arquitectónica |
| C22 | Riesgos | Matriz incompleta | Matriz actualizada con riesgos específicos de R1 incluyendo mezcla saldo/asiento, doble conteo resultado, IAS 28 YTD, ownership hardcoded, snapshot opaco | — | — |
| C23 | D1 | Postergada | Propuesta formal D1 en sección 23 | — | — |
| C24 | D5 | Postergada | Sistema diseñado para 5+ años; fecha de inicio de migración desacoplada de capacidad arquitectónica | — | — |

---

## 1. Arquitectura end-to-end R1

```
╔══════════════════════════════════════════════════════════════════════════╗
║  CAPA 1 — INGESTA                                                        ║
║                                                                          ║
║  Fuente ──▶ SourceAdapter (declara CapabilitySet)                       ║
║              │                                                           ║
║              ├──▶ acc_journal_entry + acc_journal_line  (si journal)    ║
║              └──▶ acc_account_balance                   (si trial bal.) ║
║                          │                                               ║
║                   acc_source_batch (lote, hash, estado)                 ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 2 — MAPPING Y VALIDACIÓN                                           ║
║                                                                          ║
║  AccountingProfile (5 niveles, versionado, vigencia)                    ║
║    Source ERP → Base Profile → Company Profile                          ║
║    → Account Override → Period Override                                  ║
║              │                                                           ║
║              ▼                                                           ║
║  acc_reporting_account → acc_reporting_line → acc_financial_statement   ║
║                          │                                               ║
║  Validación:             ├── Σ Debit = Σ Credit (nivel journal)         ║
║                          └── Asset = Liability + Equity (nivel balance)  ║
║                              Completitud por empresa/período             ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 3 — CONSOLIDACIÓN                                                  ║
║                                                                          ║
║  acc_ownership (temporal: %, método, vigencia)                          ║
║              │                                                           ║
║  acc_consolidation_run (header del proceso)                             ║
║    ├── Línea a línea (6 entidades controladas)                          ║
║    ├── Método patrimonio IAS 28 (Allpa Chile + Allpa Perú)             ║
║    ├── acc_consolidation_journal/line (eliminaciones IC)                ║
║    ├── acc_adjustment_journal/line (ajustes manuales aprobados)         ║
║    └── NCI: movement table (open + movs = close)                       ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 4 — CONVERSIÓN MULTIMONEDA (IAS 21)                               ║
║                                                                          ║
║  acc_conversion_run (snapshot de tasas congeladas)                      ║
║    ├── Consume: CurrencyDomain OA-023 (contrato, nunca duplica)        ║
║    └── Congela: rate_id, value, date, type, pair, provider, version     ║
║                                                                          ║
║  Distinción: current truth vs historical approved truth                  ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 5 — REPORTING / EEFF                                               ║
║                                                                          ║
║  acc_reporting_run (aprobación del reporte — separado del cierre)       ║
║  acc_consolidation_result_line (líneas relacionales, no JSON opaco)     ║
║  acc_snapshot_metadata (hashes, TC, mappings, reglas — inmutable)       ║
║                                                                          ║
║  Drill-down: Grupo → Empresa → Estado → Sección → Línea → Cuenta       ║
║              → Journal/Balance → Ajustes/Eliminaciones                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 6 — PLANNING LEDGER (dominio separado)                             ║
║                                                                          ║
║  pln_scenario + pln_budget_entry + pln_budget_version                   ║
║  Comparte: company, period, reporting_account, dimensions, currency     ║
║  NO comparte tablas con Accounting Ledger                                ║
╠══════════════════════════════════════════════════════════════════════════╣
║  CAPA 7 — MANAGEMENT PERFORMANCE (fase posterior)                        ║
║                                                                          ║
║  Financial Actuals × Operational Actuals (contrato de linkage pendiente)║
║  KPIs: costo/kg, EBITDA/ha, FCL, USD/ha, royalties, productividad       ║
╚══════════════════════════════════════════════════════════════════════════╝
```

---

## 2. Entidades R1

### 2.1 Ingesta y ledger

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_source_batch` | Lote de importación (renombrado, mismo rol) | Renombrado de acc_import_batch |
| `acc_journal_entry` | Header de asiento contable (nuevo) | **Nuevo** |
| `acc_journal_line` | Línea de asiento (nuevo) | **Nuevo** |
| `acc_account_balance` | Saldo mensual por cuenta cuando no hay asientos (nuevo) | **Nuevo** |
| `acc_entity_config` | Config versionada por entidad: moneda funcional, efectiva desde/hasta | **Nuevo** |
| `acc_ownership` | Participación temporal: entidad, parent, %, método, vigencia | **Nuevo** |

### 2.2 Mapping y perfil

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_base_profile` | Perfil base de reporting por plan de cuentas | **Nuevo** (jerarquía explícita) |
| `acc_company_profile` | Override del perfil para una empresa | **Nuevo** |
| `acc_chart_mapping` | Override por cuenta específica | Extendido con jerarquía |
| `acc_period_mapping_override` | Override temporal por período | **Nuevo** |
| `acc_reporting_account` | Cuenta canónica de reporting | Sin cambio |
| `acc_reporting_line` | Línea del EEFF | Sin cambio |
| `acc_financial_statement` | Catálogo de estados (Balance, P&L) | Sin cambio |

### 2.3 Dimensiones (nuevo patrón extensible)

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `dim_type` | Catálogo de tipos de dimensión | **Nuevo** |
| `dim_value` | Valores por tipo | **Nuevo** |
| `acc_entry_dim` | Pivot: liga línea de journal/balance con dimensiones | **Nuevo** |

### 2.4 Consolidación

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_consolidation_run` | Header del proceso de consolidación | Sin cambio (concepto) |
| `acc_consolidation_journal` | Journal de eliminación IC (header) | Reemplaza acc_elimination |
| `acc_consolidation_journal_line` | Líneas balanceadas del journal de eliminación | **Nuevo** |
| `acc_adjustment_journal` | Journal de ajuste manual (header) | Reemplaza acc_adjustment |
| `acc_adjustment_journal_line` | Líneas balanceadas del ajuste | **Nuevo** |
| `acc_equity_method_entry` | Movimientos IAS 28 por JV y período | **Nuevo** |
| `acc_nci_movement` | Movimientos NCI: apertura + movs = cierre | **Nuevo** |

### 2.5 Conversión y snapshot

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_conversion_run` | Proceso de conversión: tasas congeladas | **Nuevo** |
| `acc_conversion_rate_used` | TC exacta usada por par/período/run | **Nuevo** |
| `acc_consolidation_result_line` | Resultados relacionales del reporting run | Reemplaza data JSONB |
| `acc_snapshot_metadata` | Hashes, TC, mappings, reglas — inmutable | Reemplaza JSONB opaco |

### 2.6 Período y aprobación

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_period` | Estado contable del período: open→soft_close→locked | Renombrado de acc_period_lock |
| `acc_period_audit` | Historial de cambios de estado del período | Sin cambio |
| `acc_reporting_run` | Proceso de aprobación del reporte (separado del cierre) | **Nuevo** |

### 2.7 Planning Ledger (dominio separado)

| Entidad | Descripción |
|---|---|
| `pln_scenario` | Catálogo de escenarios: Budget-2026-v1, Forecast-Jul-2026 |
| `pln_budget_entry` | Valor por scenario + company + period + reporting_account + dims |
| `pln_budget_version` | Versión y estado de aprobación del presupuesto |

### 2.8 Configuración transversal

| Entidad | Descripción | Cambio vs R0 |
|---|---|---|
| `acc_materiality_policy` | Política de materialidad versionada por scope | **Nuevo** |
| — | No `acc_audit_log` propio — emite al Audit Domain corporativo | **Cambio** |

---

## 3. Contrato del modelo canónico R1

### 3.1 acc_journal_entry — header de asiento

```
id                      BIGINT PK
company_id              BIGINT FK → corporate entity master (no string hardcodeado)
source_system           TEXT                 -- 'contec'|'excel'|'erp_m1'|'manual'
source_journal_id       TEXT                 -- ID en el sistema origen
source_document_id      TEXT                 -- documento que origina el asiento
source_batch_id         BIGINT FK → acc_source_batch
posting_date            DATE NOT NULL        -- fecha de registro contable
document_date           DATE                 -- fecha del documento origen
period_id               BIGINT FK → acc_period
document_type           TEXT                 -- 'factura'|'nota_credito'|'diario'|etc
document_number         TEXT
description             TEXT
transaction_currency    TEXT                 -- ISO 4217 de las líneas
status                  TEXT                 -- 'draft'|'posted'|'reversed'
reversal_of             BIGINT FK → acc_journal_entry (para reversiones)
created_by              TEXT
created_at              TIMESTAMPTZ
metadata_source         JSONB                -- metadata no canónica del origen (SOLO metadata)
```

### 3.2 acc_journal_line — línea de asiento

```
id                      BIGINT PK
journal_entry_id        BIGINT FK → acc_journal_entry
line_number             INT
source_account_code     TEXT                 -- código en el ERP origen
account_id              BIGINT FK → acc_reporting_account (tras mapping)
debit                   NUMERIC(18,4) NOT NULL DEFAULT 0    -- siempre ≥ 0
credit                  NUMERIC(18,4) NOT NULL DEFAULT 0    -- siempre ≥ 0
transaction_currency    TEXT
functional_currency     TEXT                 -- viene de acc_entity_config
description             TEXT
source_line_id          TEXT                 -- referencia al origen
```

**Restricción de integridad:**
```
Para cada acc_journal_entry:
  SUM(debit) = SUM(credit)   dentro de tolerancia_cuadre configurada
```
Esta es la validación primaria. No sustituye por Asset = Liability + Equity.

### 3.3 acc_account_balance — saldo de cuenta (cuando no hay asientos)

```
id                      BIGINT PK
company_id              BIGINT FK → corporate entity master
period_id               BIGINT FK → acc_period
source_account_code     TEXT
account_id              BIGINT FK → acc_reporting_account (tras mapping)
transaction_currency    TEXT
opening_balance         NUMERIC(18,4)        -- saldo inicio del período
period_debit            NUMERIC(18,4)        -- movimiento débito del período
period_credit           NUMERIC(18,4)        -- movimiento crédito del período
closing_balance         NUMERIC(18,4) NOT NULL
source_batch_id         BIGINT FK → acc_source_batch
granularity_level       TEXT                 -- 'trial_balance'|'account_summary'
metadata_source         JSONB                -- metadata no canónica del origen
```

**Control de integridad cuando hay ambos period_debit y period_credit:**
```
opening_balance + (period_debit - period_credit) = closing_balance
```
Si la fuente no entrega period_debit/credit, se aceptan solo opening y closing; el movimiento queda como derived = closing - opening.

---

## 4. SourceAdapter — CapabilitySet

### 4.1 Declaración formal

Cada adapter decleta su `CapabilitySet` antes de procesar:

```javascript
class SourceAdapter {
  capabilities() {
    return {
      granularity:          'journal_lines' | 'trial_balance' | 'account_summary',
      opening_balance:      Boolean,   // entrega saldo apertura
      period_debit_credit:  Boolean,   // entrega movimientos del período
      cost_centers:         Boolean,
      auxiliaries:          Boolean,
      document_reference:   Boolean,
      transaction_currency: Boolean,
      functional_currency:  Boolean,
      counterparty:         Boolean,
      project_dimension:    Boolean,
    };
  }

  // Retorna acc_journal_entry[] O acc_account_balance[]
  // según this.capabilities().granularity
  parse(rawInput) { ... }
  validateRaw(lines) { ... }
  transform(lines, batchId) { ... }
}
```

### 4.2 Implicaciones por granularidad

| Capability | journal_lines | trial_balance |
|---|---|---|
| EEFF completo | Sí | Sí |
| Consolidación | Sí | Sí |
| Comparativos R/B/PY | Sí | Sí |
| Drill-down hasta cuenta | Sí | Sí |
| Drill-down documental (asiento) | Sí | **No disponible** |
| Flujo de efectivo (método directo) | Sí | **No disponible** |
| Flujo de efectivo (método indirecto) | Sí | Posible con limitaciones |
| Análisis de aging / antigüedad | Sí | **No disponible** |

La UI debe mostrar el nivel de granularidad disponible para cada empresa/período. Nunca inventar granularidad que la fuente no entrega.

### 4.3 Adapters planeados

| Adapter | Granularidad esperada | Estado | Bloqueante |
|---|---|---|---|
| `ContecAdapter` | **Desconocida** — depende de exportación real | No diseñable | B1 |
| `ExcelAdapter` | trial_balance (asumido) | Diseñable con caveats | B4 |
| `ManualAdapter` | journal_lines (siempre) | Implementable | Ninguno |
| `ErpMediterraOneAdapter` | journal_lines (objetivo) | Futuro | Mediterra One |

---

## 5. Convención contable canónica — D1 (Propuesta R1)

### 5.1 Propuesta formal

**Regla de registro:**
- `debit ≥ 0` siempre
- `credit ≥ 0` siempre
- `canonical_value = debit − credit`

No existe debit negativo ni credit negativo en el ledger. Un crédito se registra como credit > 0, debit = 0. Nunca como debit < 0.

**Ecuación de integridad primaria (nivel journal):**
```
∑ debit = ∑ credit   (dentro del mismo journal_entry)
```

**Ecuación de integridad secundaria (nivel trial balance mapeado):**
```
∑ canonical_value de cuentas de Activo
= ∑ canonical_value de cuentas de Pasivo
+ ∑ canonical_value de cuentas de Patrimonio
```

Esta segunda ecuación es una validación del AccountingProfile, no del ledger crudo.

### 5.2 Presentation sign — separado del accounting sign

El accounting sign registra hechos contables. El presentation sign determina cómo se muestra en el EEFF. **No están acoplados.**

| Tipo de cuenta | canonical_value | presentation_value | Notas |
|---|---|---|---|
| Activo | debit − credit | = canonical_value | Saldo normal = positivo |
| Pasivo | debit − credit | = −(canonical_value) | Saldo normal = negativo canónico → se muestra positivo |
| Patrimonio | debit − credit | = −(canonical_value) | Saldo normal = negativo canónico → se muestra positivo |
| Ingreso | debit − credit | = −(canonical_value) | Saldo normal = negativo canónico → se muestra positivo en P&L |
| Gasto / Costo | debit − credit | = canonical_value | Saldo normal = positivo |
| Resultado neto | Calculado desde P&L | Ver sección 10 | No se carga desde el balance |

El `presentation_sign` se define en `acc_reporting_line` como `+1` o `−1` multiplicado por el canonical_value. Nunca invierte el dato almacenado.

### 5.3 Ejemplos

**Ejemplo 1 — Venta de exportación:**
```
Asiento en acc_journal_line:
  CxC Comercial:  debit=100,000  credit=0      canonical_value = +100,000
  Ingreso ventas: debit=0        credit=100,000 canonical_value = −100,000

∑ debit = ∑ credit = 100,000 ✓

En EEFF:
  CxC en Activo:   presentation_value = +100,000 × (+1) =  +100,000  [activo positivo]
  Ingreso en P&L:  presentation_value = −100,000 × (−1) = +100,000  [ingreso positivo]
```

**Ejemplo 2 — Pasivo financiero:**
```
Asiento en acc_journal_line:
  Banco:           debit=500,000  credit=0      canonical_value = +500,000
  Deuda bancaria:  debit=0        credit=500,000 canonical_value = −500,000

En EEFF Balance:
  Caja:            presentation_value = +500,000 × (+1) = +500,000  [activo positivo]
  Deuda bancaria:  presentation_value = −500,000 × (−1) = +500,000  [pasivo positivo]
```

**Ecuación del balance:**
```
∑ Activos (presentation) = ∑ Pasivos (presentation) + ∑ Patrimonio (presentation)
500,000 = 500,000 ✓
```

Esta propuesta corresponde a la convención estándar del libro mayor de doble entrada. Requiere confirmación de Angelo antes de congelar.

---

## 6. acc_consolidation_journal / line — Eliminaciones IC R1

### 6.1 acc_consolidation_journal (header)

```
id                      BIGINT PK
consolidation_run_id    BIGINT FK → acc_consolidation_run
period_id               BIGINT FK → acc_period
group_id                BIGINT FK → corporate entity master (grupo)
journal_type            TEXT       -- 'intercompany_elimination'|'nci'|'ias28'|'reclassification'|'other'
elimination_type        TEXT       -- 'cxc_cxp'|'loans'|'current_accounts'|'sales_purchases'
                                   --  'services'|'mgmt_fee'|'dividends'|'unrealized_margin'
                                   --  'ppe_ic'|'deferred_tax_ic'|'other'
entity_origin_id        BIGINT FK → corporate entity master
entity_counterpart_id   BIGINT FK → corporate entity master
elimination_rule        TEXT       -- referencia a la regla aplicada
source                  TEXT       -- 'auto'|'manual'
prepared_by             TEXT
approved_by             TEXT
status                  TEXT       -- 'draft'|'submitted'|'approved'|'posted'|'reversed'
reversal_of             BIGINT FK → acc_consolidation_journal
evidence_ref            TEXT       -- referencia a documentación soporte
description             TEXT
created_at              TIMESTAMPTZ
```

### 6.2 acc_consolidation_journal_line (líneas balanceadas)

```
id                      BIGINT PK
consolidation_journal_id BIGINT FK
line_number             INT
entity_id               BIGINT FK → corporate entity master
reporting_account_id    BIGINT FK → acc_reporting_account
debit                   NUMERIC(18,4) NOT NULL DEFAULT 0
credit                  NUMERIC(18,4) NOT NULL DEFAULT 0
presentation_currency   TEXT
description             TEXT
```

**Restricción:** `∑ debit = ∑ credit` en cada `consolidation_journal_id`. Toda eliminación debe quedar contablemente balanceada o el sistema la rechaza.

### 6.3 Ejemplo — Eliminación CxC/CxP entre AF y MH

```
Allegria Foods tiene CxC con Mediterra Holding = 50,000 USD
Mediterra Holding tiene CxP con Allegria Foods = 50,000 USD

acc_consolidation_journal:
  elimination_type: 'cxc_cxp'
  entity_origin: Allegria Foods
  entity_counterpart: Mediterra Holding

acc_consolidation_journal_line:
  línea 1: entity=AF, account=CxC_Relacionadas, debit=0, credit=50,000  (elimina el activo)
  línea 2: entity=MH, account=CxP_Relacionadas, debit=50,000, credit=0  (elimina el pasivo)

∑ debit = ∑ credit = 50,000 ✓
```

---

## 7. acc_adjustment_journal / line — Ajustes manuales R1

### 7.1 acc_adjustment_journal (header)

```
id                      BIGINT PK
period_id               BIGINT FK → acc_period
entity_id               BIGINT FK → corporate entity master
adjustment_type         TEXT       -- 'reclassification'|'correction'|'consolidation'
                                   --  'opening'|'provision'|'accrual'|'other'
description             TEXT NOT NULL
affected_period         TEXT       -- si es retroactivo, indica período afectado
prepared_by             TEXT NOT NULL
submitted_by            TEXT
reviewed_by             TEXT
approved_by             TEXT        -- requiere rol CFO o equivalente
posted_by               TEXT
status                  TEXT        -- 'draft'|'submitted'|'reviewed'|'approved'|'posted'|'reversed'
reversal_of             BIGINT FK → acc_adjustment_journal
evidence_ref            TEXT
created_at              TIMESTAMPTZ
```

**Workflow maker-checker:**
- `prepared_by` ≠ `approved_by` (SoD obligatorio para ajustes > umbral de materialidad)
- `reviewed_by` opcional para ajustes menores; obligatorio para ajustes materiales

### 7.2 acc_adjustment_journal_line

```
id                      BIGINT PK
adjustment_journal_id   BIGINT FK
line_number             INT
entity_id               BIGINT FK
reporting_account_id    BIGINT FK → acc_reporting_account
debit                   NUMERIC(18,4) NOT NULL DEFAULT 0
credit                  NUMERIC(18,4) NOT NULL DEFAULT 0
presentation_currency   TEXT
description             TEXT
```

**Restricción:** `∑ debit = ∑ credit` por `adjustment_journal_id`. Un ajuste con una sola línea es inválido.

---

## 8. IAS 21 — Reproducibilidad de TC R1

### 8.1 acc_conversion_run

```
id                      BIGINT PK
consolidation_run_id    BIGINT FK → acc_consolidation_run
period_id               BIGINT FK → acc_period
presentation_currency   TEXT        -- 'USD'
status                  TEXT        -- 'draft'|'approved'
executed_at             TIMESTAMPTZ
executed_by             TEXT
```

### 8.2 acc_conversion_rate_used (tasas congeladas)

```
id                      BIGINT PK
conversion_run_id       BIGINT FK → acc_conversion_run
currency_pair           TEXT        -- 'USD-CLP', 'USD-PEN', etc.
rate_type               TEXT        -- 'closing'|'average'|'historical'
rate_value_used         NUMERIC(18,8) NOT NULL
rate_date               DATE NOT NULL
rate_source             TEXT        -- 'mindicador'|'frankfurter'|'manual'|'bcch'
currency_domain_ref     TEXT        -- referencia a la fila en currency_tc / maestro_tc
```

**Principio de reproducibilidad:**
Un `acc_consolidation_result_line` siempre referencia su `conversion_run_id`. Dado un snapshot aprobado de 2026, en 2028 se puede saber exactamente qué tasa se usó, de qué fuente y en qué fecha. Una corrección posterior en Currency Domain no altera el snapshot histórico aprobado.

**Distinción current truth vs historical approved truth:**
- `current truth` = tabla `maestro_tc` del Currency Domain OA-023, siempre actualizable
- `historical approved truth` = `acc_conversion_rate_used` ligado a un `acc_reporting_run.status = 'approved'`, inmutable

---

## 9. acc_entity_config — Moneda funcional versionada

```
id                      BIGINT PK
entity_id               BIGINT FK → corporate entity master
functional_currency     TEXT NOT NULL   -- ISO 4217
presentation_currency   TEXT NOT NULL
effective_from          TEXT NOT NULL   -- 'YYYY-MM'
effective_to            TEXT            -- NULL = abierto
changed_by              TEXT
change_reason           TEXT
created_at              TIMESTAMPTZ
```

El motor de conversión consulta `acc_entity_config` para el período que está procesando, no asume un valor fijo.

**Estado actual por empresa (requiere confirmación de Angelo):**

| Empresa | Moneda funcional | Moneda presentación | Estado |
|---|---|---|---|
| Mediterra Holding | USD | USD | Asumido — confirmar |
| Allegria Foods | USD | USD | Asumido — confirmar |
| Allegria Service | USD | USD | Asumido — confirmar |
| Frisku Foods | USD | USD | Asumido — confirmar |
| Osiris Plant | USD | USD | Asumido — confirmar |
| Integrity Farms | USD | USD | Asumido — confirmar |
| Allpa Farms Chile | USD | USD | Asumido — confirmar |
| Allpa Farms Perú | **DECISIÓN ABIERTA** | USD | ¿PEN o USD? Ver nota IAS 21 |

Allpa Perú: si la empresa opera, contrata y genera ingresos principalmente en PEN, la moneda funcional es PEN y aplica conversión completa IAS 21. Si opera en USD, es USD. Esta es una decisión contable que debe resolver el CFO, no el sistema.

---

## 10. IAS 28 — Full Lifecycle R1

### 10.1 acc_equity_method_entry — movimientos por JV y período

```
id                        BIGINT PK
period_id                 BIGINT FK → acc_period
investor_entity_id        BIGINT FK → corporate entity master   -- quien invierte
investee_entity_id        BIGINT FK → corporate entity master   -- la JV
ownership_id              BIGINT FK → acc_ownership             -- para reproducir el % histórico

-- Movimientos del período (todos en moneda de presentación)
carrying_amount_open      NUMERIC(18,4) NOT NULL
result_increment          NUMERIC(18,4)   -- % × resultado neto del período
oci_increment             NUMERIC(18,4)   -- % × OCI del período
dividends_received        NUMERIC(18,4)   -- con signo negativo (reduce valor)
contributions             NUMERIC(18,4)   -- aportes adicionales del período
disposals                 NUMERIC(18,4)   -- reducciones
ownership_change_effect   NUMERIC(18,4)   -- si cambió la participación
impairment                NUMERIC(18,4)   -- pérdidas por deterioro (negativo)
fx_translation_effect     NUMERIC(18,4)   -- si aplica conversión IAS 21
carrying_amount_close     NUMERIC(18,4) NOT NULL

-- Datos de entrada del período
investee_net_result_local     NUMERIC(18,4)  -- en moneda de la JV (antes de conversión)
investee_net_result_currency  TEXT
investee_result_rate_id       BIGINT FK → acc_conversion_rate_used  -- tasa congelada usada
investee_oci_local            NUMERIC(18,4)
investee_dividends_local      NUMERIC(18,4)

-- Granularidad del dato recibido
result_granularity        TEXT    -- 'monthly_incremental'|'ytd_cumulative'
ytd_prior_period_result   NUMERIC(18,4)  -- si es YTD: resultado acumulado hasta período anterior

-- Control
status                    TEXT    -- 'draft'|'approved'
approved_by               TEXT
created_at                TIMESTAMPTZ
```

### 10.2 Tratamiento YTD vs mensual incremental

Si la JV entrega resultados acumulados YTD (ej. enero a julio = 1,200):
```
result_increment_julio = YTD_julio − YTD_junio
                       = 1,200 − 1,000 = 200

El sistema deriva el incremental mensual. Nunca aplica el YTD directamente.
```

Restricción: `ytd_prior_period_result` es obligatorio cuando `result_granularity = 'ytd_cumulative'`.

### 10.3 Reconciliación

```
carrying_amount_close =
  carrying_amount_open
  + result_increment
  + oci_increment
  − dividends_received
  + contributions
  − disposals
  + ownership_change_effect
  − impairment
  + fx_translation_effect

Si la ecuación no cuadra → el sistema rechaza el registro.
```

---

## 11. NCI — Movement Table R1

### 11.1 acc_nci_movement — por entidad controlada y período

```
id                      BIGINT PK
period_id               BIGINT FK → acc_period
entity_id               BIGINT FK → corporate entity master   -- la controlada (AS, FF)
ownership_id            BIGINT FK → acc_ownership             -- reproduce % histórico

-- Balance NCI en patrimonio
nci_equity_open         NUMERIC(18,4) NOT NULL    -- NCI apertura en patrimonio
nci_result_share        NUMERIC(18,4)             -- % × resultado neto del período
nci_oci_share           NUMERIC(18,4)             -- % × OCI del período
nci_dividends           NUMERIC(18,4)             -- dividendos pagados a NCI (negativo)
nci_ownership_change    NUMERIC(18,4)             -- si cambió la participación
nci_other               NUMERIC(18,4)
nci_equity_close        NUMERIC(18,4) NOT NULL    -- NCI cierre en patrimonio

-- P&L: resultado atribuible a NCI
nci_pl_result           NUMERIC(18,4)             -- va al Estado de Resultados consolidado

-- Control
status                  TEXT
approved_by             TEXT
created_at              TIMESTAMPTZ
```

### 11.2 Ecuación de reconciliación

```
nci_equity_close =
  nci_equity_open
  + nci_result_share
  + nci_oci_share
  − nci_dividends
  + nci_ownership_change
  + nci_other

Si la ecuación no cuadra → rechazo.
```

### 11.3 Presentación en EEFF

**Balance consolidado — Patrimonio:**
```
Total Patrimonio Controladora
+ NCI (nci_equity_close de todas las entidades con NCI)
= Total Patrimonio Consolidado
```

**Estado de Resultados consolidado:**
```
Resultado Neto
  Atribuible a controladora = Resultado Neto − ∑ nci_pl_result
  Atribuible a NCI          = ∑ nci_pl_result
```

---

## 12. Resultado del ejercicio — Política formal

### 12.1 Problema a evitar

El ERP puede entregar en la cuenta de Resultado del Ejercicio (patrimonio) el mismo resultado que el P&L acumula desde las cuentas de ingreso/gasto. Si el sistema suma ambos, el resultado se duplica en el balance.

### 12.2 Política R1

**Regla canónica:**
```
El Resultado del Ejercicio en el balance consolidado se calcula EXCLUSIVAMENTE
desde el P&L canónico (suma de líneas de ingreso y gasto mapeadas).

El saldo de la cuenta "Resultado del Ejercicio" que venga del ERP en el balance
se mapea a una cuenta reporting de tipo 'resultado_erp_informacional'.
Esta cuenta NO se incluye en la suma del patrimonio consolidado.
Se usa únicamente para reconciliación y control.
```

**Reconciliación obligatoria:**
```
resultado_calculado_PL (desde cuentas de ingreso/gasto)
vs
resultado_erp_balance (cuenta resultado ejercicio del ERP)

Diferencia tolerable = ± tolerancia_cuadre configurada.
Si la diferencia excede la tolerancia → alerta de reconciliación, no error fatal.
```

### 12.3 Cierre anual y apertura

Al cerrar el ejercicio (diciembre):
```
1. resultado_calculado_PL se transfiere a Resultados Acumulados
   → acc_adjustment_journal de tipo 'cierre_anual' (balanceado: resultado→Resultados Acumulados)

2. Las cuentas de ingreso y gasto quedan en cero para el nuevo ejercicio
   → apertura del período enero con saldo cero en P&L

3. Resultados Acumulados apertura enero = Resultados Acumulados diciembre
                                         + resultado_calculado_PL de diciembre
```

---

## 13. Consolidation Run y Snapshot R1

### 13.1 acc_consolidation_run (header)

```
id                      BIGINT PK
period_id               BIGINT FK → acc_period
group_entity_id         BIGINT FK → corporate entity master
run_version             INT NOT NULL DEFAULT 1
status                  TEXT    -- 'draft'|'running'|'completed'|'approved'|'superseded'
run_type                TEXT    -- 'regular'|'restatement'|'interim'
executed_at             TIMESTAMPTZ
executed_by             TEXT
approved_at             TIMESTAMPTZ
approved_by             TEXT
superseded_by           BIGINT FK → acc_consolidation_run
conversion_run_id       BIGINT FK → acc_conversion_run
notes                   TEXT
```

### 13.2 acc_consolidation_result_line (relacional, no JSONB)

```
id                      BIGINT PK
consolidation_run_id    BIGINT FK → acc_consolidation_run
entity_id               BIGINT FK → corporate entity master  -- 'CONSOLIDADO' o empresa
reporting_line_id       BIGINT FK → acc_reporting_line
reporting_account_id    BIGINT FK → acc_reporting_account

-- Columnas de reconciliación (visibles en drill-down)
individual_value        NUMERIC(18,4)   -- suma de entidades antes de ajustes
eliminations_value      NUMERIC(18,4)   -- total eliminaciones IC aplicadas
adjustments_value       NUMERIC(18,4)   -- total ajustes manuales aplicados
ias28_value             NUMERIC(18,4)   -- aporte de equity method
nci_value               NUMERIC(18,4)   -- NCI (solo líneas de patrimonio y resultado)
consolidated_value      NUMERIC(18,4)   -- individual + eliminations + adjustments + ias28 + nci

presentation_currency   TEXT
```

**Drill-down disponible desde aquí:**
```
acc_consolidation_result_line
  → filtra por entity_id → entidades individuales
  → filtra por acc_journal_entry/acc_account_balance → fuente
  → filtra por acc_consolidation_journal_line → eliminaciones IC aplicadas
  → filtra por acc_adjustment_journal_line → ajustes aplicados
```

### 13.3 acc_snapshot_metadata (inmutable al aprobar)

```
id                      BIGINT PK
consolidation_run_id    BIGINT FK → acc_consolidation_run
-- Hashes de integridad
hash_input_entries      TEXT   -- SHA-256 de todos los acc_journal_entry/balance del período
hash_mappings_used      TEXT   -- SHA-256 del acc_chart_mapping vigente en el período
hash_ownership_used     TEXT   -- SHA-256 del acc_ownership vigente en el período
hash_result_lines       TEXT   -- SHA-256 del resultado final
-- Referencias congeladas
mapping_snapshot_ref    JSONB  -- copia de los mappings usados (por si el mapping cambia)
ownership_snapshot_ref  JSONB  -- copia de la estructura de propiedad usada
currency_run_id         BIGINT FK → acc_conversion_run
-- Metadata del proceso
rules_applied           JSONB  -- lista de reglas de eliminación aplicadas
total_eliminations      INT
total_adjustments       INT
validated_at            TIMESTAMPTZ
validated_by            TEXT
```

---

## 14. AccountingProfile — Jerarquía R1

### 14.1 Cinco niveles de override

```
Nivel 1: acc_base_profile
  Mapping por defecto para un plan de cuentas.
  Ejemplo: plan de cuentas Contec → cuentas canónicas base.

Nivel 2: acc_company_profile
  Override del perfil base para una empresa específica.
  Ejemplo: Allegria Service reclasifica ciertos costos de manera diferente a Allegria Foods.

Nivel 3: acc_chart_mapping
  Override por cuenta específica dentro de una empresa.
  Ejemplo: cuenta 410001 en Allegria Foods → "Comisión Arándanos" (no la categoría default de gastos).

Nivel 4: acc_period_mapping_override
  Override temporal por cuenta + empresa + período.
  Ejemplo: en 2026-07 la cuenta 210001 se reclasifica a Pasivo CP por vencimiento inminente.

Nivel 5: acc_batch_mapping_override
  Override puntual por batch de importación. Usado para correcciones excepcionales.
```

### 14.2 Resolución del mapping (algoritmo)

```
Para (empresa X, cuenta C, período P, batch B):
  1. Buscar acc_batch_mapping_override (B, X, C, P) → si existe, usar
  2. Buscar acc_period_mapping_override (X, C, P) → si existe, usar
  3. Buscar acc_chart_mapping (X, C) vigente en P → si existe, usar
  4. Buscar acc_company_profile (X, account_group de C) → si existe, usar
  5. Buscar acc_base_profile (plan_cuentas, C) → si existe, usar
  6. Sin mapping → alerta "cuenta sin clasificar", bloquea el período

Todos los niveles con vigencia temporal (effective_from / effective_to).
Un mapping histórico nunca se altera retroactivamente para períodos aprobados.
```

---

## 15. Dimensiones — Patrón extensible R1

### 15.1 Problema con columnas hardcodeadas

`centro_costo TEXT` y `auxiliar TEXT` en acc_journal_line son dimensiones fijas. Cuando aparezca `project`, `agricultural_field`, `variety`, `client_id`, etc., se necesita `ALTER TABLE` + migración. No es sostenible.

### 15.2 Solución: catálogo de dimensiones + tabla pivot

**dim_type** — catálogo de tipos de dimensión
```
id, code TEXT, name TEXT, description TEXT, active BOOLEAN
Ejemplos:
  'cost_center', 'Centro de Costo'
  'project', 'Proyecto'
  'agricultural_field', 'Campo Agrícola'
  'variety', 'Variedad/Especie'
  'client', 'Cliente'
  'counterparty', 'Contraparte'
  'business_unit', 'Unidad de Negocio'
```

**dim_value** — valores por tipo
```
id, dim_type_id, code TEXT, name TEXT, entity_id (opcional, si es específico de empresa)
active BOOLEAN, effective_from TEXT, effective_to TEXT
```

**acc_entry_dim** — tabla pivot
```
id
entry_type  TEXT    -- 'journal_line'|'account_balance'
entry_id    BIGINT  -- FK a acc_journal_line o acc_account_balance (según entry_type)
dim_type_id BIGINT FK → dim_type
dim_value_id BIGINT FK → dim_value
```

### 15.3 Agregar una nueva dimensión

No requiere ALTER TABLE. Solo:
1. Insertar nuevo registro en `dim_type`
2. Insertar valores en `dim_value`
3. El adapter declara `has_dimension('agricultural_field') = true` en su CapabilitySet
4. Los registros en `acc_entry_dim` se crean durante la transformación del adapter

---

## 16. acc_period vs acc_reporting_run — Cierre R1

### 16.1 Separación de estados

**acc_period** — estado del período contable
```
Estados: open → soft_close → locked
Significa: ¿Se pueden cargar nuevas entradas o ajustes?
locked = no más cargas sin override explícito del CFO
NO significa que el EEFF fue aprobado.
```

**acc_reporting_run** — proceso de aprobación del reporte
```
Estados: draft → submitted → approved [→ superseded]
Significa: ¿Está aprobado el EEFF de este período?
Un período locked puede tener múltiples reporting_run.
Ejemplo: el período 2026-06 está locked; el reporting_run_v1 fue aprobado;
luego se detectó un error en un mapping → se crea reporting_run_v2 sin reabrir el período.
```

### 16.2 Relación

```
acc_period (locked)
  └── acc_reporting_run v1 (approved) ← inmutable
  └── acc_reporting_run v2 (approved) ← corrección de mapping, nuevo snapshot
```

El `acc_period` nunca vuelve a `open` para generar una nueva versión del reporte. El período permanece locked; solo el reporting_run se vuelve a ejecutar con la corrección.

---

## 17. Ownership Temporal — acc_ownership R1

```
id                      BIGINT PK
entity_id               BIGINT FK → corporate entity master   -- entidad hija
parent_entity_id        BIGINT FK → corporate entity master   -- entidad padre
ownership_percentage    NUMERIC(7,4) NOT NULL   -- ej. 80.0000
voting_percentage       NUMERIC(7,4)            -- si difiere de ownership
consolidation_method    TEXT NOT NULL
  -- 'full_consolidation'|'equity_method'|'cost_method'|'held_for_sale'
effective_from          TEXT NOT NULL   -- 'YYYY-MM'
effective_to            TEXT            -- NULL = vigente
changed_by              TEXT
change_reason           TEXT
created_at              TIMESTAMPTZ
```

**Estado actual (sujeto a confirmación):**

| Entidad hija | Parent | Ownership % | Método | Effective from |
|---|---|---|---|---|
| Allegria Foods | Mediterra Holding | 100.00% | full_consolidation | DECISIÓN ABIERTA |
| Allegria Service | Mediterra Holding | 80.00% | full_consolidation | DECISIÓN ABIERTA |
| Frisku Foods | Mediterra Holding | 90.00% | full_consolidation | DECISIÓN ABIERTA |
| Osiris Plant | Mediterra Holding | 100.00% | full_consolidation | DECISIÓN ABIERTA |
| Integrity Farms | Mediterra Holding | 100.00% | full_consolidation | DECISIÓN ABIERTA |
| Allpa Farms Chile | Allegria Foods (o MH?) | 50.00% | equity_method | DECISIÓN ABIERTA |
| Allpa Farms Perú | Allegria Foods (o MH?) | 26.00% | equity_method | DECISIÓN ABIERTA |

**Nota:** ¿quién es el inversionista directo en Allpa Chile/Perú — Mediterra Holding o Allegria Foods? Esto afecta qué entidad registra el equity method en su balance individual. Es una decisión abierta (ver sección C — Decisiones).

---

## 18. acc_materiality_policy R1

```
id                      BIGINT PK
scope_type              TEXT    -- 'global'|'company'|'reporting_line'|'analysis_type'
scope_ref_id            BIGINT  -- FK al scope: company_id, reporting_line_id, etc.
analysis_type           TEXT    -- 'variance_actual_vs_budget'|'variance_actual_vs_py'
                                --  'elimination'|'adjustment'|'period_close'
absolute_threshold      NUMERIC(18,4)   -- umbral absoluto (en moneda presentación)
relative_threshold      NUMERIC(7,4)    -- umbral relativo (ej. 0.05 = 5%)
combination_rule        TEXT    -- 'either'|'both'   (¿superar uno O los dos?)
effective_from          TEXT
effective_to            TEXT
created_by              TEXT
created_at              TIMESTAMPTZ
```

La materialidad alimenta:
- Alertas automáticas en el dashboard del CFO
- Requerimiento de explicación de variación antes de aprobar el reporte
- Workflow de cierre (si hay variación material sin explicar, el período no puede avanzar a approved)

---

## 19. Planning Ledger R1 (dominio separado)

```
pln_scenario
  id, code ('B2026-v1'|'FC2026-07'), type ('budget'|'revised_budget'|'forecast'),
  fiscal_year INT, version INT, status ('draft'|'approved'|'locked'), description

pln_budget_entry
  id, scenario_id FK → pln_scenario
  period_id FK → acc_period   (comparte el catálogo de períodos)
  entity_id FK → corporate entity master
  reporting_account_id FK → acc_reporting_account
  value NUMERIC(18,4)
  presentation_currency TEXT
  -- dimensiones via pln_entry_dim (mismo patrón EAV)

pln_budget_version
  id, scenario_id, version INT, submitted_by, approved_by, status, created_at
```

**Separación estricta:** ninguna tabla `pln_*` se mezcla con tablas `acc_*` del ledger. Comparten solo catálogos de referencia (período, entidad, reporting_account).

---

## 20. Auditoría — Integración con Audit Domain corporativo

El dominio contable NO crea una tabla `acc_audit_log` propia. En cambio:

**Patrón de emisión de eventos:**
```javascript
// Dentro de cada operación contable significativa:
await corporateAuditDomain.emitEvent({
  domain:       'accounting',
  entity_type:  'acc_journal_entry',   // o la tabla correspondiente
  entity_id:    entry.id,
  operation:    'POST' | 'REVERSE' | 'APPROVE' | 'LOCK',
  changed_by:   userId,
  metadata:     { period, entity, amount_total, ... },
  timestamp:    now()
});
```

**Si por razones técnicas se requiere audit especializado contable** (ej. auditoría externa requiere log inmutable dentro del dominio), se puede crear `acc_domain_audit` con FK explícita al evento del audit corporativo:
```
id, corporate_audit_event_id FK, acc_entity_type, acc_entity_id, detail JSONB
```

No duplicar infraestructura sin justificación.

---

## 21. Management Performance — Validación arquitectónica R1

El FRP debe poder conectar Financial Actuals con Operational Actuals. El diseño R1 lo permite a través de:

**Contrato de linkage (diseño, no implementación):**
```
acc_consolidation_result_line  ←→  opr_actuals_entry (dominio operacional futuro)
  entity_id                         entity_id
  period_id                         period_id
  reporting_account_id              kpi_type_id

Análisis posibles:
  costo_por_kg        = acc_result('Costo Directo') / opr('kg_exportados')
  ebitda_por_ha       = acc_result('EBITDA') / opr('hectareas_activas')
  margen_por_FCL      = acc_result('Margen Bruto') / opr('contenedores_FCL')
  royalty_por_planta  = acc_result('Ingresos Royalty') / opr('plantas_certificadas')
```

El diseño de `acc_consolidation_result_line` con granularidad por `entity_id` + `period_id` + `reporting_account_id` + dimensiones es compatible con este linkage. No se requiere modificar el esquema contable para agregar KPIs operacionales.

---

## 22. Matriz de riesgos R1

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Contec entrega solo saldos, sin asientos | Alta | Alto — drill-down documental no disponible | `acc_account_balance` es el contrato para ese caso; declarar limitación en UI |
| R2 | **Mezcla saldo/asiento en misma carga** | Alta | Crítico — integridad del ledger | Contratos separados (`acc_journal_line` vs `acc_account_balance`); adapter debe declarar uno solo |
| R3 | **Doble conteo Resultado del Ejercicio** | Alta | Crítico — balance consolidado incorrecto | Política formal: resultado solo desde P&L; resultado_erp = informacional (sección 12) |
| R4 | **IAS 28 YTD vs mensual mal derivado** | Media | Crítico — resultado JV acumulado dos veces | Campo `result_granularity` + `ytd_prior_period_result` obligatorio (sección 10) |
| R5 | **NCI doble conteo** | Media | Alto — patrimonio y resultado consolidado incorrecto | Movement table con ecuación de reconciliación obligatoria (sección 11) |
| R6 | **Ownership porcentajes hardcodeados** | Alta | Alto — cambio de participación requiere reescribir motor | `acc_ownership` temporal (sección 17) |
| R7 | **Eliminaciones IC no balanceadas** | Media | Crítico — balance consolidado no cuadra | `∑ debit = ∑ credit` obligatorio en `acc_consolidation_journal` (sección 6) |
| R8 | **Ajustes manuales no balanceados** | Media | Crítico — balance consolidado no cuadra | Misma restricción en `acc_adjustment_journal` (sección 7) |
| R9 | **Snapshot financiero opaco en JSON** | Alta | Alto — drill-down imposible; auditoría externa rechaza | `acc_consolidation_result_line` relacional + `acc_snapshot_metadata` (sección 13) |
| R10 | **Pérdida de reproducibilidad de TC** | Media | Crítico — EEFF aprobados no reproducibles | `acc_conversion_rate_used` congela tasa exacta (sección 8) |
| R11 | **Duplicación de company master** | Alta | Medio — divergencia de datos entre dominios | `acc_company` = referencia FK al maestro corporativo (sección 18) |
| R12 | **Duplicación de audit domain** | Media | Medio — doble mantenimiento, inconsistencias | Emitir eventos al audit corporativo (sección 20) |
| R13 | **Moneda funcional asumida USD para todas las empresas** | Alta (para Allpa Perú) | Medio — conversión IAS 21 incorrecta | `acc_entity_config` versionada (sección 9) |
| R14 | **Dimensiones hardcodeadas** | Alta | Medio — ALTER TABLE en producción por cada nueva dimensión | Patrón EAV (sección 15) |
| R15 | Plan de cuentas heterogéneo entre empresas | Media | Medio — mapping complejo | Jerarquía de 5 niveles en AccountingProfile (sección 14) |
| R16 | USD-PEN no disponible históricamente en Currency Domain | Alta | Medio — Allpa Perú bloqueada para períodos históricos | Carga manual retroactiva en Maestros TC; campo `rate_source = 'manual'` congelado en snapshot |
| R17 | Contec COA con códigos no únicos entre empresas | Desconocida | Alto — mapping ambiguo | `plan_cuentas_origen` discrimina por empresa en el mapping; confirmar con B1 |

---

## 23. D1 — Propuesta formal (ver sección 5)

La propuesta formal está en la sección 5. Resumen:
- `debit ≥ 0`, `credit ≥ 0`, `canonical_value = debit − credit`
- `presentation_sign` en `acc_reporting_line` determina el signo de presentación en el EEFF
- Validación primaria: `∑ debit = ∑ credit` por asiento
- Validación secundaria: `Activo = Pasivo + Patrimonio` al nivel de trial balance mapeado
- **Requiere confirmación de Angelo antes de congelar**

---

## 24. D5 — Serie histórica desacoplada

El sistema está diseñado para soportar sin cambios arquitectónicos:
- Múltiples ejercicios fiscales sin limitación de cantidad
- Períodos hacia atrás sin restricción de fecha mínima (el campo `period_id` es FK a `acc_period`, sin fecha hardcodeada)
- Snapshots históricos sin expiración

**Capacidad arquitectónica:** ilimitada para efectos prácticos (5+ años con margen amplio).

**Alcance inicial de migración:** se decidirá por separado según disponibilidad de datos de Contec/Excel. El diseño no impone ni requiere esa decisión.

---

## ERD Conceptual R1

```
[Corporate Entity Master]
        │ 1:N (investor)          │ 1:N (investee)
        ▼                         ▼
[acc_ownership]─────────────────────────────────────────────
   entity_id, parent_id, %, method, effective_from/to

[acc_entity_config]
   entity_id, functional_currency, effective_from/to

[acc_period]
   period_id, periodo 'YYYY-MM', estado: open/soft_close/locked

        │
[acc_source_batch]
   entity_id, period_id, fuente, hash, estado

        │─────────────────────────┐
        ▼                         ▼
[acc_journal_entry]        [acc_account_balance]
   entity_id, period_id        entity_id, period_id
   posting_date                source_account_code
   status                      opening_balance
        │                       period_debit/credit
[acc_journal_line]              closing_balance
   journal_entry_id                  │
   source_account_code               │
   debit, credit                     │
   transaction_currency              │
        │                            │
        └──────────┬─────────────────┘
                   ▼ (via acc_entry_dim)
           [dim_type] + [dim_value]

                   ▼ (via AccountingProfile — 5 niveles)
[acc_base_profile] → [acc_company_profile] → [acc_chart_mapping]
→ [acc_period_mapping_override] → [acc_batch_mapping_override]

                   ▼
[acc_reporting_account] → [acc_reporting_line] → [acc_financial_statement]

═══════════════════════════════════════════════════════════════

[acc_consolidation_run]
   period_id, group_id, status, conversion_run_id
        │
        ├── [acc_consolidation_journal] ── [acc_consolidation_journal_line]
        │      (eliminaciones IC balanceadas)
        │
        ├── [acc_adjustment_journal] ── [acc_adjustment_journal_line]
        │      (ajustes manuales balanceados, workflow SoD)
        │
        ├── [acc_equity_method_entry]    (IAS 28 por JV y período)
        │
        ├── [acc_nci_movement]           (NCI movement table)
        │
        └── [acc_consolidation_result_line]  (resultados relacionales)
                │
                ├── entity_id → drill-down por empresa
                ├── reporting_account_id → drill-down por cuenta
                └── FK a journal/balance → drill-down documental

[acc_snapshot_metadata]
   consolidation_run_id, hashes, mapping_snapshot, ownership_snapshot

[acc_conversion_run] → [acc_conversion_rate_used]
   (tasas congeladas por pair, tipo, fecha, fuente)

═══════════════════════════════════════════════════════════════

[acc_reporting_run]  ←── separado de acc_period
   period_id, consolidation_run_id, status: draft/submitted/approved

[acc_materiality_policy]
   scope, thresholds, combination_rule, vigencia

═══════════════════════════════════════════════════════════════

Planning Ledger (dominio separado):
[pln_scenario] → [pln_budget_entry]
   Comparte: entity_id, period_id, reporting_account_id
   NO comparte tablas con acc_*
```

---

## A. Cambios estructurales R1 (resumen)

1. `acc_entry` → reemplazado por `acc_journal_entry/line` + `acc_account_balance` (dos contratos separados)
2. `acc_elimination` → reemplazado por `acc_consolidation_journal/line` (journals balanceados)
3. `acc_adjustment` → reemplazado por `acc_adjustment_journal/line` (partida doble + workflow SoD)
4. `acc_consolidation_snapshot.data JSONB` → reemplazado por `acc_consolidation_result_line` (relacional) + `acc_snapshot_metadata`
5. `moneda_funcional hardcodeada` → `acc_entity_config` versionada con vigencia
6. `porcentajes hardcodeados` → `acc_ownership` temporal
7. `dimensiones como columnas` → patrón EAV (`dim_type` + `dim_value` + `acc_entry_dim`)
8. `acc_company catálogo nuevo` → referencia FK al maestro corporativo (single source of truth)
9. `acc_audit_log local` → emisión de eventos al Audit Domain corporativo
10. `acc_period_lock (cierre + aprobación)` → separados en `acc_period` (cierre operativo) + `acc_reporting_run` (aprobación del reporte)
11. `acc_budget_entry mezclado` → Planning Ledger separado (`pln_*`)
12. `IAS 28 fórmula simple` → `acc_equity_method_entry` con full lifecycle + distinción YTD/mensual
13. `NCI fórmula simple` → `acc_nci_movement` con movement table reconciliada
14. `resultado ejercicio ambiguo` → política formal: solo desde P&L; resultado ERP = informacional

---

## B. Decisiones todavía abiertas

| ID | Decisión | Opciones conocidas | Impacto |
|---|---|---|---|
| **D1** | Convención débito/crédito | Propuesta en sección 5 — **requiere confirmación de Angelo** | Bloquea definición de validaciones y capa de presentación |
| **D2** | Granularidad de Contec (saldos vs asientos) | Desconocida — depende de B1 | Determina si se usa `acc_journal_line` o `acc_account_balance` para Allegria |
| **D3** | ¿Consolidación en tiempo real o trigger del CFO? | Tiempo real → costoso; Trigger → más controlado | Arquitectura del motor; recomendación: trigger del CFO para v1 |
| **D4** | ¿Motor de consolidación en Postgres (SQL) vs JS? | SQL → portable; JS → mantenible en el stack actual | Dónde vive la lógica |
| **D5** | ¿Desde qué período cargamos histórico inicial? | No decide la arquitectura — desacoplado (sección 24) | Solo el scope de la migración inicial |
| **D6** | ¿Cómo se autentica la aprobación del CFO? | Sistema central + step-up MFA (diseño en sección 16) | Requiere definir si existe MFA en el sistema central actualmente |
| **D7** | ¿Quién es el inversionista directo en Allpa Chile/Perú? | Mediterra Holding o Allegria Foods | Afecta qué entidad registra el equity method en su balance individual |
| **D8** | ¿Moneda funcional de Allpa Farms Perú? | PEN o USD (decisión contable, no técnica) | Afecta conversión IAS 21 completa vs simplificada |
| **D9** | ¿`acc_company` referencia a qué tabla del maestro corporativo? | Depende de si existe un maestro corporativo ya definido en Mediterra One | Necesario para implementar FK correcta |

---

## C. Información que necesito que entregues

**Para desbloquear la Etapa 1 (infraestructura base):**
- [ ] Confirmación de convención D1 (propuesta en sección 5)
- [ ] Confirmación de moneda funcional por empresa (especialmente Allpa Perú — D8)
- [ ] Confirmación de quién es el inversionista en Allpa Chile/Perú (D7)

**Para desbloquear los Adapters (Etapa 2):**
- [ ] **B1** — Exportación real de Contec (cualquier mes, Allegria Foods o Service)
- [ ] **B2** — Plan de cuentas de al menos una empresa (preferible Allegria Foods)
- [ ] **B4** — Template Excel de carga mensual

**Para desbloquear IAS 28 y NCI (Etapa 5–6):**
- [ ] **B5** — Datos de resultado por período de Allpa Chile y Allpa Perú (formato y granularidad)
- [ ] Confirmación: ¿los datos de Allpa vienen como resultado mensual o YTD acumulado?

**Para desbloquear el Ownership model:**
- [ ] Fecha de inicio de la estructura de propiedad (¿desde cuándo usar acc_ownership?)

---

## D. Qué queda bloqueado

| Componente | Bloqueante | Razón |
|---|---|---|
| `ContecAdapter` | B1 | Sin formato real de exportación, el adapter es especulativo |
| `acc_chart_mapping` poblado | B2 | Sin COA no hay mappings que crear |
| `ExcelAdapter` | B4 | Sin template, el adapter es especulativo |
| `acc_equity_method_entry` implementado | B5 + D7 + D8 | Sin datos de JVs ni decisiones contables |
| `acc_nci_movement` implementado | B5 | Sin estados financieros de entidades controladas con NCI |
| Moneda funcional en `acc_entity_config` | D8 | Allpa Perú sin definir |
| `acc_ownership` poblado | D7 + Fecha inicio | Sin confirmar estructura de propiedad |
| Integración Audit Domain | D9 + estado Mediterra One | Depende de qué existe en el corporativo |

**Lo que NO está bloqueado y puede avanzar una vez aprobado R1:**
- Definición formal del catálogo `acc_reporting_account` + `acc_reporting_line` + `acc_financial_statement`
- Estructura de `acc_period`, `acc_consolidation_run`, `acc_reporting_run`
- Catálogo `dim_type` con las dimensiones conocidas
- Catálogo `acc_materiality_policy`
- Catálogo `pln_scenario`
- Diseño de `acc_ownership` y `acc_entity_config` (estructura, no datos)

---

## E. Recomendación de siguiente etapa

**Secuencia sugerida post-aprobación de R1:**

**Etapa 0 — Prerequisitos (paralelo, no secuencial)**
1. Angelo confirma D1, D7, D8
2. Angelo entrega B1 (Contec export) para evaluar granularidad
3. Se define D9 (maestro corporativo de empresas)
4. Se implementa RLS en Supabase (prerequisito de seguridad para datos financieros)

**Etapa 1 — Catálogos base (no requiere B1/B2)**
Solo crear los catálogos que no dependen de los datos de Contec:
- `acc_period`, `acc_entity_config`, `acc_ownership`
- `acc_reporting_account`, `acc_reporting_line`, `acc_financial_statement`
- `dim_type`, catálogo inicial de dimensiones
- `acc_materiality_policy`, `pln_scenario`
- Migración `004_accounting_catalogs.sql` — solo catálogos, sin datos financieros

**Etapa 2** — Adapter + Ingesta (requiere B1 + B2)
**Etapa 3** — Consolidación (requiere Etapa 2 funcionando)
**Etapas 4-9** — Según roadmap R0 actualizado

---

## F. GO / NO-GO para materializar Etapa 1

**NO-GO para materializar Etapa 1 en estado actual.**

Razones:
1. D1 (convención débito/crédito) no confirmada — sin esto las validaciones de cuadre son inconsistentes
2. D9 (maestro corporativo de empresas) no definido — sin esto las FK son incorrectas
3. RLS de Supabase no implementado — dato financiero real no debe estar en base abierta a anon key

**GO parcial** para: redactar la migración `004` como documento de diseño (sin ejecutar), definir el catálogo de `acc_reporting_account` (chart of accounts canónico), y poblar `dim_type` con las dimensiones conocidas — todo como artefactos de diseño adicionales, sin crear tablas reales.

**GO completo** cuando:
- Angelo confirma D1, D7, D8, D9
- RLS implementado en Supabase
- Etapa 0 completada

---

*OA-024-01-R1 — AWAITING CFO REVIEW*
*OA-023-04 Currency: CERRADO / STABLE — no modificar*

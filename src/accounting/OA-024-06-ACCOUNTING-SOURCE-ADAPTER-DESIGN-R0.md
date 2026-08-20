# OA-024-06 — Accounting Source Adapter Framework
## Design R0 — Para revisión CFO

**Fecha:** 2026-08-14  
**Estado:** DISEÑO — no implementar  
**Predecesor aprobado:** OA-024-05 Etapa 0 STABLE (37/37 tests PASS)  
**Rama:** claude/crazy-heisenberg-f33f7a  
**Autor:** Claude Code (grounding: OA-024-01-R1, R2-CLOSURE, OA-024-04, anfParser.js, clasificador contable)

---

## PRINCIPIO FUNDAMENTAL

> Mediterra One no debe conocer semánticamente a Contec fuera del adapter.

El SourceAdapter Framework es el contrato de frontera entre cualquier sistema contable externo y el ledger canónico de Mediterra One. Contec es la primera implementación concreta. No la única ni la última.

---

## 1. Executive Summary

El sistema actual (`src/anf/anfParser.js`) ya contiene un parser funcional para archivos Excel de cierre mensual Contec y Megasystem. Este parser produce datos de nivel **balance de comprobación** (saldos por cuenta, sin detalle de asientos). Esta es la granularidad real disponible desde Contec.

OA-024-06 formaliza la arquitectura que conecta este parser (y cualquier fuente futura) con el ledger canónico `acc_*` materializado en Etapa 0.

**Hallazgos críticos del grounding:**

| Hallazgo | Impacto en diseño |
|----------|-------------------|
| `anfParser.js` ya existe y funciona | ContecAdapter es una formalización, no una creación desde cero |
| Contec exporta saldos, NO asientos | Mode 2 (Balance Ingestion) para Contec inicial |
| Contec exporta ESF mensual + EERR mensual + EERR temporada | La estructura de datos ya es conocida |
| `clasificarSeccionEsf()` y `clasificarGrupoEr()` ya clasifican por prefijo | AccountingProfile Nivel 1 (base) ya tiene lógica — debe formalizarse |
| `src/accounting/consolidation/index.js` usa porcentajes hardcodeados con TD-CONS-001 | La deuda técnica ya está documentada; acc_ownership resuelve esto |
| KNOWN_BUGs en Megasystem (3xxxx = ingresos vs patrimonio) comentados explícitamente | AccountingProfile Fase 3 ya identificada en el código |
| EEFFModule actualmente lee del dominio in-memory (`src/accounting/`) | La migración a `acc_account_balance` es el objetivo, no el estado actual |
| `calendario_data` no almacena los ANF — van a tablas separadas en Supabase | La separación de dominios ya existe parcialmente |

---

## 2. Scope / Non-Scope

### En scope (diseño)
- Arquitectura del SourceAdapter Framework
- Contrato del adapter (CapabilitySet, interface, ciclo de vida)
- Mode 1: Journal Ingestion (contrato formal, aun sin implementación)
- Mode 2: Balance Ingestion (contrato formal; ContecAdapter implementará esto)
- Lifecycle de `acc_source_batch`
- Estrategia de idempotencia
- Modelo de errores e issues
- Mapeo de cuentas (AccountingProfile: source → canonical → reporting)
- Mapeo de dimensiones
- Multimoneda en ingesta
- Integración período / cierre
- Validaciones y reconciliación
- Security / SoD
- Auditoría y lineage de datos
- Contratos de coexistencia ERP 2026 vs ERP 2027
- Extensibilidad AGR (Allpa Farms SpA / operaciones agrícolas)
- Contrato de salida para futuro EEFFModule

### No en scope (OA-024-06)
- Implementación de código
- Migraciones nuevas de tablas
- Cambios al EEFFModule
- Deploy en producción o staging
- Carga de datos financieros reales
- Edge Functions
- ContecAdapter ejecutable
- ExcelAdapter
- AGR capability

---

## 3. Current State

### 3.1 Lo que ya existe y funciona

```
src/anf/anfParser.js
├── parsearInformeANF(file, filial, anio, mes) → ParseResult
├── parseBalanceContec(ws)        → cuenta[] con saldos ESF
├── parseEerrMensualContec(ws)    → Map<codigo, {nombre, desglose{mes:{real}}}>
├── parseEerrTemp(ws, sistema)    → Map<codigo, {nombre, desglose{mes:{real,ppto}}}>
├── buildSaldosEsf(esf, esf_t1)  → registros para anf_saldos_esf
└── buildMovimientosEr(er_temp, er_mensual, mes, anio) → registros para anf_movimientos_er

src/accounting/classification/classifier.js
├── clasificarSeccionEsf(codigo)  → sección ESF (Activo Corriente, Pasivo, Patrimonio, etc.)
└── clasificarGrupoEr(codigo)     → grupo ER (Ingreso Operacional, Costo, Gasto, etc.)

src/accounting/
├── consolidation/index.js  → motor de consolidación (porcentajes hardcodeados — TD-CONS-001)
├── posting/index.js        → lógica de posteo in-memory
├── valuation/accountValue.js → convención de signos del EEFFModule
└── accounting.test.js      → 59 tests (pasando, congelan comportamiento actual)
```

### 3.2 Granularidad real disponible de Contec

El parser de Contec extrae estos campos por cuenta:

**ESF (Balance):**
```
codigo               — "1.01.01.001" (código con puntos, 4 niveles)
nombre               — "Banco BICE CLP"
inventario_activo    — saldo deudor del período (≥ 0)
inventario_pasivo    — saldo acreedor del período (≥ 0)
resultado_perdida    — 0 (no usado en balance)
resultado_ganancia   — 0 (no usado en balance)
sistema              — 'contec'
```

**EERR MENSUAL (por cuenta, por mes):**
```
codigo               — "4.01.01.001"
nombre               — "Ventas Export Cerezas"
grupo_er             — "Ingreso Operacional" (derivado del prefijo)
real_mes             — monto real del mes
real_ytd             — acumulado año calendario
ppto_mes             — presupuesto del mes (desde EERR TEMP)
desglose_cal         — {mes: {real}} para todos los meses del año
desglose_temp        — {mes: {real, ppto}} para meses de temporada
```

**Lo que Contec NO entrega en estos exports:**
- Número de comprobante contable
- Fecha individual de cada asiento
- Glosa de cada asiento
- Contrapartida de cada asiento
- Tipo de documento (factura, nota de crédito, etc.)
- RUT del tercero
- Centro de costo a nivel de asiento (solo a nivel de cuenta, si aplica)

**Conclusión: Contec (formato actual) = BALANCE-LEVEL SOURCE**. Mode 2 obligatorio para la implementación inicial.

### 3.3 Pipeline actual de datos ANF

```
Usuario sube Excel Contec
        ↓
anfParser.js → ParseResult
        ↓
buildSaldosEsf / buildMovimientosEr
        ↓
anf_saldos_esf  (Supabase)
anf_movimientos_er  (Supabase)
        ↓
src/accounting/* (in-memory JS)
        ↓
EEFFModule (React, solo display)
```

**El pipeline objetivo de OA-024-06:**

```
Usuario sube Excel Contec (o API, o ERP futuro)
        ↓
ContecAdapter (formaliza anfParser.js)
        ↓
Canonical Import Model (acc_source_batch + datos normalizados)
        ↓
Validation Pipeline
        ↓
Reconciliation
        ↓
acc_source_batch (POSTED)
acc_account_balance (Mode 2) / acc_journal_entry (Mode 1 futuro)
        ↓
acc_consolidation_run → acc_consolidation_result_line
        ↓
EEFFModule (lee del ledger canónico)
```

---

## 4. Target Architecture

### 4.1 Capas del SourceAdapter Framework

```
╔══════════════════════════════════════════════════════════════════╗
║  FRONTERA EXTERNA                                                ║
║  Excel Contec | Excel manual | API ERP | ERP Mediterra One      ║
╠══════════════════════════════════════════════════════════════════╣
║  LAYER 1 — INGESTA Y NORMALIZACIÓN                               ║
║                                                                  ║
║  SourceAdapter (interfaz)                                        ║
║    ├── ContecAdapter      (Mode 2 — balance, primer adapter)    ║
║    ├── ExcelAdapter       (Mode 2 — template estructurado)      ║
║    ├── ManualAdapter      (Mode 1 — asiento manual, ya posible) ║
║    └── NativeErpAdapter   (Mode 1 — Mediterra One 2027+)        ║
║                                                                  ║
║  Canonical Import Model:                                         ║
║    JournalImportRecord[]  o  BalanceImportRecord[]              ║
║                                                                  ║
║  acc_source_batch  (lote padre con lifecycle completo)          ║
╠══════════════════════════════════════════════════════════════════╣
║  LAYER 2 — MAPEO Y VALIDACIÓN                                    ║
║                                                                  ║
║  AccountMappingResolver  (jerarquía 5 niveles OA-024-01-R1)     ║
║  DimensionMappingResolver                                        ║
║  ValidationPipeline                                              ║
║  ReconciliationEngine                                            ║
║  IssueCollector  (acc_source_batch_issue — tabla propuesta)     ║
╠══════════════════════════════════════════════════════════════════╣
║  LAYER 3 — POSTING                                               ║
║                                                                  ║
║  Mode 1 → acc_journal_entry + acc_journal_line                  ║
║  Mode 2 → acc_account_balance                                   ║
║  (ambos) → dimensiones en pivot tables                          ║
╠══════════════════════════════════════════════════════════════════╣
║  LAYER 4 — CONSOLIDACIÓN / REPORTING (downstream — no en scope) ║
║  acc_consolidation_run → acc_consolidation_result_line          ║
╚══════════════════════════════════════════════════════════════════╝
```

---

## 5. SourceAdapter Contract

### 5.1 Interface formal (JavaScript — sin TypeScript)

```javascript
// Cada adapter implementa este contrato.
// El adapter es stateless: recibe input crudo, retorna CanonicalImportModel.

class SourceAdapter {
  // Identificación del adapter
  adapterCode()   { return 'contec_excel_v1'; }  // nunca cambiar retroactivamente
  adapterVersion() { return '1.0.0'; }

  // Capabilities que esta fuente puede proveer.
  // La plataforma ajusta validaciones y UI según esto.
  capabilities() {
    return {
      granularity:          'trial_balance',  // 'journal_lines' | 'trial_balance' | 'account_summary'
      opening_balance:      true,             // entrega saldo apertura
      period_debit_credit:  true,             // entrega movimientos del período
      closing_balance:      true,             // entrega saldo cierre
      cost_centers:         false,            // no en export actual de Contec
      auxiliaries:          false,            // no
      document_reference:   false,            // no
      transaction_currency: false,            // asume moneda funcional
      functional_currency:  false,            // viene de acc_entity_config
      counterparty:         false,            // no
      budget_data:          true,             // EERR TEMP contiene Ppto
      ytd_cumulative:       true,             // EERR MENSUAL tiene acumulados YTD
      seasonal_breakdown:   true,             // EERR TEMP tiene desglose temporada
    };
  }

  // Formatos de input aceptados.
  acceptedFormats() {
    return ['xlsx', 'xls'];
  }

  // Parsea el input crudo y retorna el modelo canónico de importación.
  // Puede lanzar AdapterParseError si el formato no es reconocido.
  // NO valida reglas de negocio — eso es responsabilidad del ValidationPipeline.
  async parse(rawInput, context) {
    // context = { entity, period, adapter_options }
    // rawInput = File | Buffer | API response
  }

  // Retorna metadatos para acc_source_batch sin procesar el contenido.
  // Útil para pre-flight (hash, tamaño, nombre).
  async extractBatchMetadata(rawInput) {
    return {
      file_name:    rawInput.name,
      file_size:    rawInput.size,
      file_hash:    await computeSHA256(rawInput),
      adapter_code: this.adapterCode(),
      adapter_version: this.adapterVersion(),
      capabilities: this.capabilities(),
    };
  }
}
```

### 5.2 Implicaciones por granularidad

| Capability | journal_lines | trial_balance |
|---|---|---|
| EEFF completo | Sí | Sí |
| Análisis varianza Real/Ppto | Sí | Sí (con Ppto por cuenta) |
| Drill-down hasta cuenta | Sí | Sí |
| Drill-down hasta asiento | **Sí** | **No disponible** |
| Flujo de efectivo método directo | **Sí** | **No** |
| Flujo de efectivo método indirecto | Sí | Posible con limitaciones |
| Aging / antigüedad por documento | **Sí** | **No** |
| Trazabilidad comprobante-a-EEFF | **Sí** | Solo hasta cuenta |

La UI del EEFFModule debe mostrar el `granularity_level` por empresa/período. Nunca ofrecer drill-down que la fuente no provee.

---

## 6. Canonical Import Model

### 6.1 Tipos canónicos de registro importado

```javascript
// MODE 1 — Journal Import Record (asiento completo)
{
  // Header de asiento
  source_journal_id:    "COMP-2026-001234",   // ID en sistema origen
  source_document_id:   "FAC-001234",          // documento que origina
  posting_date:         "2026-07-15",          // fecha contable
  document_date:        "2026-07-12",          // fecha del documento
  document_type:        "factura_proveedor",   // tipo estandarizado
  document_number:      "001234",
  description:          "Compra agroquímicos",
  transaction_currency: "CLP",

  // Líneas (partida doble)
  lines: [
    {
      source_line_id:       "COMP-2026-001234-L1",
      source_account_code:  "6.01.03.001",      // en el ERP origen
      description:          "Herbicidas",
      debit:                1500000,
      credit:               0,
      // Dimensiones (si el adapter las entrega)
      dimensions: {
        cost_center: "CAMPO-001",
        variety:     "SANT",                    // variedad Regina
        season:      "2026-2027",
      }
    },
    {
      source_line_id:       "COMP-2026-001234-L2",
      source_account_code:  "2.01.05.001",
      description:          "CxP Proveedor Agroquímicos",
      debit:                0,
      credit:               1500000,
    }
  ]
}

// MODE 2 — Balance Import Record (saldo por cuenta)
{
  source_account_code:    "1.01.01.001",      // en el ERP origen
  account_name:           "Banco BICE CLP",   // nombre en origen
  transaction_currency:   "CLP",              // asumida si no viene explícita
  opening_balance:        50000000,           // saldo inicio del período
  period_debit:           12000000,           // movimiento débito del período
  period_credit:          8000000,            // movimiento crédito del período
  closing_balance:        54000000,           // saldo cierre (validación: apertura+deb-cred=cierre)

  // Granularidad declarada
  granularity_level:      "trial_balance",    // 'trial_balance' | 'account_summary'

  // Budget si la fuente lo incluye (Contec: EERR TEMP)
  budget_period_debit:    10000000,
  budget_period_credit:   6000000,

  // Desglose mensual si la fuente lo incluye (Contec: EERR MENSUAL)
  monthly_breakdown: {
    "2026-01": { real_debit: 1000000, real_credit: 500000 },
    "2026-07": { real_debit: 12000000, real_credit: 8000000 },
  },

  // Dimensiones (si el adapter las entrega)
  dimensions: {}
}
```

---

## 7. Journal Ingestion (Mode 1)

### 7.1 Cuándo aplica

Mode 1 aplica cuando la fuente entrega comprobantes individuales con fecha, cuenta, debe, haber. En el contexto actual de Mediterra One, Mode 1 es el objetivo para:

- ManualAdapter (asientos manuales, ya posible con el schema Etapa 0)
- NativeErpAdapter (Mediterra One ERP, 2027+)
- Eventualmente: Contec si se obtiene acceso a la API del sistema (pendiente evaluación)

### 7.2 Pipeline Mode 1

```
JournalImportRecord[]
        ↓
[1] Validación técnica (campos obligatorios, tipos, fechas)
        ↓
[2] Deduplicación: ¿source_journal_id ya existe en este entity+period+adapter?
    Si sí → IdempotencyError (no procesar; ya posteado)
        ↓
[3] AccountMappingResolver: source_account_code → acc_reporting_account.id
    Si falta mapeo → IssueCode: SRC_ACCOUNT_UNMAPPED (severidad configurable)
        ↓
[4] DimensionMappingResolver: dimensions{} → dim_value.id (por tipo)
        ↓
[5] Balance check: Σ debit = Σ credit por journal_id (tolerancia ±0.01)
    Si no cuadra → IssueCode: ENTRY_UNBALANCED (severidad FATAL)
        ↓
[6] Period check: período vigente y con status='open'
    Si cerrado → IssueCode: PERIOD_CLOSED (severidad FATAL)
        ↓
[7] Reconciliation: Σ total_debit ≈ Σ total_credit del batch
        ↓
[8] CFO approval (si batch es material)
        ↓
[9] Posting: INSERT acc_journal_entry + acc_journal_line + dim pivot tables
        ↓
acc_source_batch.status = 'POSTED'
```

### 7.3 Posting a `acc_journal_entry`

```sql
-- Por cada JournalImportRecord
INSERT INTO acc_journal_entry (
  entity_id, source_system, source_journal_id, source_document_id,
  source_batch_id, posting_date, document_date, period_id,
  document_type, document_number, description,
  transaction_currency, status
) VALUES (
  $entity_id, 'contec_excel_v1', $source_journal_id, ...
  'draft'
);

-- Por cada línea
INSERT INTO acc_journal_line (
  journal_entry_id, line_number, source_account_code,
  account_id,  -- ya resuelto por AccountMappingResolver
  debit, credit, transaction_currency, description, source_line_id
) VALUES (...);

-- Dimensiones
INSERT INTO acc_journal_line_dim (journal_line_id, dim_type_id, dim_value_id)
VALUES (...);

-- Transición a posted (trigger T1 valida balance)
UPDATE acc_journal_entry SET status='posted' WHERE id=$journal_entry_id;
```

---

## 8. Balance Ingestion (Mode 2)

### 8.1 Por qué Mode 2 para Contec

El export Contec entrega `inventario_activo` e `inventario_pasivo` por cuenta — esto es el saldo neto del período, no el detalle de movimientos. Técnicamente corresponde a un balance de comprobación (trial balance):

```
Contec BALANCE sheet:
  codigo="1.01.01.001", inventario_activo=54,000,000, inventario_pasivo=0
  → saldo_neto = 54,000,000 (posición activa)

Equivalencia canónica:
  opening_balance = saldo del período anterior (no disponible en el export — derivado)
  period_debit    = inventario_activo (saldo deudor acumulado del período, no del movimiento)
  period_credit   = inventario_pasivo
  closing_balance = inventario_activo - inventario_pasivo
```

**AVISO:** El export Contec BALANCE entrega saldos acumulados del ejercicio/período, NO el movimiento del mes. La derivación del movimiento mensual requiere el balance del período anterior. Esto debe resolverse en la estrategia de carga histórica.

**AVISO 2:** Para el EERR MENSUAL de Contec, la estructura es diferente: entrega el valor del mes (movimiento del período) directamente por columna de mes. Esto sí es el incremento del período.

### 8.2 Pipeline Mode 2

```
BalanceImportRecord[]
        ↓
[1] Validación técnica
        ↓
[2] Idempotencia: ¿source_batch file_hash ya existe?
    Si sí → DUPLICATE_BATCH_ERROR (no procesar)
        ↓
[3] AccountMappingResolver: source_account_code → acc_reporting_account.id
    Sin mapeo → SRC_ACCOUNT_UNMAPPED
        ↓
[4] Balance check: opening + period_debit - period_credit = closing (±0.01)
    Si disponibles los tres valores; si solo hay closing → ACCEPTED_PARTIAL
        ↓
[5] Reconciliation:
    Σ closing_balance de cuentas ESF activo = Σ closing_balance de pasivo + patrimonio (±tolerancia)
    Σ closing_balance de ER = resultado del período
        ↓
[6] CFO approval
        ↓
[7] Posting: INSERT acc_account_balance
        ↓
acc_source_batch.status = 'POSTED'
```

### 8.3 Posting a `acc_account_balance`

```sql
INSERT INTO acc_account_balance (
  entity_id, period_id, source_account_code,
  account_id,        -- resuelto por AccountMappingResolver
  transaction_currency,
  opening_balance,   -- puede ser null si no viene del export
  period_debit,      -- período
  period_credit,
  closing_balance,   -- NOT NULL
  source_batch_id,
  granularity_level  -- 'trial_balance'
) VALUES (...);

-- Dimensiones de balance (si aplica)
INSERT INTO acc_account_balance_dim (account_balance_id, dim_type_id, dim_value_id)
VALUES (...);
```

### 8.4 OPEN DECISION — OD-001: Apertura y movimiento mensual en Contec

**Problema:** El export BALANCE de Contec entrega el saldo acumulado del período (inventario_activo/inventario_pasivo), no el movimiento del mes. Para poblar `period_debit/period_credit` de manera precisa, necesitamos el balance del mes anterior.

**Opciones:**
- **A** (recomendada): Cargar siempre dos archivos consecutivos — el sistema deriva el movimiento del período como `closing_balance - opening_balance`. Requiere que el usuario cargue en orden cronológico.
- **B**: Para el primer mes de carga histórica, aceptar `opening_balance = NULL` y `period_debit/credit = NULL`; solo `closing_balance` es obligatorio. El sistema marca `granularity_level='account_summary'`.
- **C**: Usar EERR MENSUAL de Contec como fuente del movimiento para cuentas de resultado, y solo BALANCE para cuentas de balance sheet.

**Esta decisión afecta a:** la estrategia de carga histórica y los campos obligatorios del BalanceImportRecord.  
**Requiere input CFO antes de implementar ContecAdapter.**

---

## 9. `acc_source_batch` — Lifecycle Completo

### 9.1 Estados del batch

```
CREATED          — objeto creado; archivo aún no procesado
        ↓
PARSING          — parser ejecutándose (anfParser.js o equivalente)
        ↓
PARSED           — parser terminó; datos en estructura canónica
        ↓
VALIDATING       — pipeline de validación corriendo
        ↓
VALIDATED        — validación completa; issues registrados; sin fatales
  └──(fatales)→ REJECTED          — issues fatales; no puede avanzar
        ↓
PENDING_APPROVAL — requiere aprobación CFO (si batch es material)
        ↓
APPROVED         — CFO aprobó (o aprobación automática si inmaterial)
        ↓
POSTING          — escribiendo a acc_journal_entry o acc_account_balance
        ↓
POSTED           — datos en el ledger; período actualizado
  └──(solicitud)→ SUPERSEDED      — reemplazado por un batch corregido
  └──(solicitud)→ ROLLED_BACK     — revertido manualmente
```

### 9.2 Campos del batch (completos)

```sql
-- Propuesta de campos adicionales sobre el schema actual
-- acc_source_batch ya tiene: id, entity_id, source_system, file_name, file_hash,
--                            row_count, status (existing schema from Etapa 0)
-- Campos a agregar en Etapa 1:

ALTER TABLE acc_source_batch ADD COLUMN IF NOT EXISTS
  period_id             BIGINT REFERENCES acc_period(id),
  adapter_code          TEXT,               -- 'contec_excel_v1'
  adapter_version       TEXT,               -- '1.0.0'
  granularity_level     TEXT,               -- 'journal_lines' | 'trial_balance'
  source_currency       TEXT,               -- moneda asumida del archivo
  file_size_bytes       BIGINT,
  
  -- Conteos para reconciliación
  source_record_count   INT,                -- filas en el archivo fuente
  accepted_record_count INT,                -- registros aceptados
  rejected_record_count INT,                -- registros con error
  total_debit           NUMERIC(18,4),      -- Σ debit de records aceptados
  total_credit          NUMERIC(18,4),      -- Σ credit
  net_balance           NUMERIC(18,4),      -- total_debit - total_credit
  
  -- Workflow
  uploaded_by           TEXT,
  validated_by          TEXT,
  approved_by           TEXT,
  posted_by             TEXT,
  uploaded_at           TIMESTAMPTZ,
  validated_at          TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  posted_at             TIMESTAMPTZ,
  
  -- Supersesión
  supersedes_batch_id   BIGINT REFERENCES acc_source_batch(id),
  superseded_by_batch_id BIGINT REFERENCES acc_source_batch(id),
  supersession_reason   TEXT,
  
  -- Budget (si la fuente lo incluye)
  budget_included       BOOLEAN DEFAULT FALSE;
```

**Nota:** Esta columna adicional es una propuesta para Etapa 1 — no ejecutar en Etapa 0.

### 9.3 Invariantes del lifecycle

1. Un batch en estado `POSTED` no puede volver a `VALIDATING` — debe crear un nuevo batch con `supersedes_batch_id` apuntando al anterior.
2. Solo un batch puede estar en estado `POSTED` para el mismo `(entity_id, period_id, source_system)` a la vez.
3. Un batch `REJECTED` libera el `file_hash` para reimport (puede subirse un archivo corregido con distinto hash).
4. Los estados `SUPERSEDED` y `ROLLED_BACK` son terminales — no puede avanzar desde ellos.

---

## 10. Idempotencia

### 10.1 Identificador primario de idempotencia

El `file_hash` (SHA-256 del archivo) en `acc_source_batch` ya tiene `UNIQUE CONSTRAINT uq_source_batch_hash` desde Etapa 0. Esto es el gate primario:

```sql
-- Ya existe en Etapa 0:
CONSTRAINT uq_source_batch_hash UNIQUE (file_hash)
```

Un archivo idéntico nunca puede generar dos batches diferentes. El sistema retorna: "Este archivo ya fue procesado en batch {id}, estado: {status}".

### 10.2 Casos de idempotencia y resolución

| Caso | Comportamiento |
|------|----------------|
| Mismo archivo subido dos veces | DUPLICATE_BATCH → retorna referencia al batch existente; no crea nuevo |
| Mismo período, archivo corregido (hash diferente) | Nuevo batch con `supersedes_batch_id` → al postear, el anterior pasa a `SUPERSEDED` |
| Mismo archivo, distinto período declarado | Error de validación — el período en el archivo debe coincidir con el declarado |
| Re-carga histórica de mismo empresa/período | Solo permitida con `supersedes_batch_id` explícito y aprobación CFO |
| Comprobante origen ya existe (Mode 1) | UNIQUE(entity_id, period_id, source_journal_id) bloquea duplicado; retorna aviso |
| Cuenta+período ya existe en balance (Mode 2) | UNIQUE(source_batch_id, source_account_code, transaction_currency) bloquea duplicado |

### 10.3 Identificadores de idempotencia para Mode 1 (journal)

```sql
-- Propuesta: constraint compuesto
CONSTRAINT uq_journal_source UNIQUE (entity_id, source_system, source_journal_id, period_id)
```

Cuando `source_journal_id` es NULL (asiento manual), la idempotencia recae en el `acc_source_batch.file_hash` más la posición en el archivo.

---

## 11. Versioning / Supersesión

### 11.1 Contrato de supersesión

Cuando un batch `POSTED` necesita ser reemplazado (ej: Contec re-exportó con 2 asientos corregidos):

```
1. Usuario crea nuevo batch con archivo corregido
2. Sistema detecta mismo entity+period+source_system → solicita confirmación supersesión
3. CFO confirma + documenta motivo
4. Sistema actualiza batch anterior: status='SUPERSEDED', superseded_by_batch_id=nuevo_id
5. Sistema postea nuevo batch
6. acc_account_balance / acc_journal_entry del batch anterior quedan con referencia al batch
   → No se eliminan; se marcan como superseded via batch FK
7. El motor de consolidación usa solo records de batches en estado POSTED (no SUPERSEDED)
```

### 11.2 Por qué no DELETE

Un batch posteado puede estar referenciado en:
- Un `acc_consolidation_run` aprobado
- Un `acc_reporting_run` aprobado
- `acc_snapshot_metadata` (hash del período)

Eliminar el batch destruye la trazabilidad histórica. La supersesión preserva el historial completo.

---

## 12. Rollback / Reprocessing

### 12.1 Rollback de un batch POSTED

```
Condición: Solo permitido si el acc_period asociado NO está en estado 'locked'.
Proceso:
  1. acc_source_batch.status → 'ROLLED_BACK'
  2. Marcar acc_account_balance/acc_journal_entry asociados como inactivos
     (no DELETE — soft invalidation via is_active=false o supersession flag)
  3. Generar evento de auditoría
  4. acc_period no retrocede automáticamente — el CFO decide si reabrirlo
```

**OPEN DECISION — OD-002:** ¿Agregamos `is_active BOOLEAN DEFAULT TRUE` a `acc_account_balance` y `acc_journal_entry` para soft-delete/rollback? Alternativa: campo `rolled_back_at TIMESTAMPTZ`, con el motor de queries filtrando `WHERE rolled_back_at IS NULL`.

### 12.2 Reprocessing

Cuando el batch tiene issues corregibles (ej: mapeo de cuenta añadido) sin cambiar el archivo fuente:

```
1. Corregir el mapping en AccountingProfile (acc_chart_mapping)
2. Crear nuevo batch con mismo archivo (mismo hash) → DUPLICATE_BATCH
   → Opción: "Revalidar batch {id} con mappings actualizados" (sin subir de nuevo)
3. El framework ejecuta el pipeline desde [3] AccountMappingResolver en adelante
4. Si ahora pasa → se aprueba y postea como nuevo estado del mismo batch
```

---

## 13. Account Mapping (AccountingProfile)

### 13.1 Relación entre niveles de cuenta

```
FUENTE (ERP origen)
  source_account_code = "6.01.03.001"    ← código en Contec
                ↓
CANONICAL ACCOUNT (plan de cuentas canónico)
  acc_chart_mapping: source_code → canonical_code
  canonical_code = "GASTO_AGR_INSUMOS"   ← código interno Mediterra One
                ↓
REPORTING ACCOUNT (EEFF)
  acc_reporting_account.code = "GOPEX"   ← línea de presentación
  acc_reporting_account.name = "Gastos Operacionales"
```

### 13.2 Jerarquía de resolución (AccountingProfile 5 niveles — OA-024-01-R1)

```
Para (empresa X, cuenta C, período P, batch B):

Nivel 5: acc_batch_mapping_override (B, X, C, P)       → prioridad máxima
Nivel 4: acc_period_mapping_override (X, C, P)          → override temporal
Nivel 3: acc_chart_mapping (X, C) vigente en P          → override empresa
Nivel 2: acc_company_profile (X, account_group de C)    → perfil empresa
Nivel 1: acc_base_profile (plan_cuentas, C)             → mapping base
Nivel 0: SIN MAPEO → IssueCode: SRC_ACCOUNT_UNMAPPED   → STOP (configurable)
```

### 13.3 Contec Base Profile

Para Contec, el clasificador existente en `classifier.js` ya implementa el Nivel 1 implícitamente:

```javascript
// classifier.js — clasificarSeccionEsf() y clasificarGrupoEr()
// Esto es el proto-acc_base_profile para plan de cuentas Contec
// Mapeo por prefijo numérico (primer segmento del código punteado)
//
// '1.xx.xx' → Activo
// '2.xx.xx' → Pasivo
// '3.xx.xx' → Patrimonio
// '4.xx.xx' → Ingreso Operacional
// '5.xx.xx' → Costo Operacional
// '6.xx.xx' → Gasto Operacional
// '7.xx.xx' → Ingreso No Operacional
// '8.xx.xx' → Gasto No Operacional
// '9.xx.xx' → Impuesto
```

El `acc_base_profile` para Contec formalizará esta lógica como datos en DB (no como código JS), con vigencia temporal y referencia al plan de cuentas.

### 13.4 Cuenta nueva sin mapping

```
Flujo:
  1. AccountMappingResolver no encuentra mapping para "6.01.03.042"
  2. Se genera IssueCode: SRC_ACCOUNT_UNMAPPED con severity configurable:
     - Si FATAL: batch no puede avanzar a POSTING
     - Si WARNING: avanza con la cuenta en "unmapped_accounts" del batch
  3. CFO o contador asigna el mapping en acc_chart_mapping
  4. Batch se revalida desde Nivel 3
  
Regla: una cuenta sin mapping en una línea MATERIAL (> umbral acc_materiality_policy)
       siempre es FATAL. Una cuenta inmaterial puede quedar como WARNING.
```

---

## 14. Dimension Mapping

### 14.1 Dimensiones ya seeded en Etapa 0

```sql
dim_type:
  'CC'  — Centro de Costo
  'PRY' — Proyecto
  'CTR' — Contrato
  'RGN' — Región
  'TMP' — Temporada (Jul–Jun)
  'ESP' — Especie (fruta)
  'MKT' — Mercado Destino
  'NMN' — Nómina
```

### 14.2 Dimensiones para AGR (a agregar en Etapa AGR — no en OA-024-06)

```sql
-- Solo declaración de intención — no ejecutar
INSERT INTO dim_type (code, label, description) VALUES
  ('PRD', 'Predio',       'Campo agrícola (ej: Portezuelo)'),
  ('CUA', 'Cuartel',      'División del predio'),
  ('LBR', 'Labor',        'Tipo de labor agrícola (poda, raleo, cosecha)'),
  ('OLB', 'Orden Labor',  'Orden de labor específica'),
  ('NSM', 'Insumo',       'Agroquímico, fertilizante u otro insumo'),
  ('VAR', 'Variedad',     'Variedad de fruta (Regina, Santina, etc.)'),
  ('TMP2','Temporada AGR','Temporada agrícola expandida con campos');
```

El modelo EAV permite agregar estas dimensiones sin ALTER TABLE en el ledger.

### 14.3 Resolución de dimensiones

```
Dimension en import record: { "cost_center": "CAMPO-001" }
        ↓
DimensionMappingResolver:
  1. Busca dim_type WHERE code='CC'
  2. Busca dim_value WHERE dim_type_id=$cc_type AND code='CAMPO-001'
  3. Si no existe → opción: crear dinámicamente (si allow_auto_create=true)
                   → o IssueCode: DIMENSION_VALUE_UNKNOWN
```

---

## 15. Multicurrency

### 15.1 Campos de moneda en el Canonical Import Model

El `BalanceImportRecord` y `JournalImportRecord` tienen `transaction_currency`. Si el adapter no entrega moneda explícitamente (caso del export Contec actual), se aplica la moneda funcional de la entidad desde `acc_entity_config`.

### 15.2 Regla de no-recálculo histórico

Si la fuente entrega `monto_moneda_funcional` ya convertido (ej: Allpa Perú convirtiendo de PEN a USD en el sistema origen), el adapter no recalcula. El valor de la fuente es el "functional_currency_amount" y se persiste tal cual en `acc_account_balance` con flag `fx_applied_by_source = TRUE`.

Cuando la fuente solo entrega moneda transaccional, el sistema aplica la tasa del Currency Domain (OA-023) según el par y fecha, y congela la tasa en `acc_conversion_rate_used` para reproducibilidad.

### 15.3 Pares de moneda en contexto actual

| Entidad | Moneda Transaccional | Moneda Funcional | FX Requerido |
|---------|---------------------|-----------------|--------------|
| Allegria Foods | CLP (costos) / USD (ventas) | USD (D8 resuelto) | USD-CLP |
| Allegria Service | CLP | UNRESOLVED (D8) | Pendiente |
| Allpa Farms Perú | PEN | UNRESOLVED (D8) | USD-PEN (manual en maestros_tc) |

El adapter entrega el monto en la moneda que el ERP origen tiene. La conversión a moneda funcional es responsabilidad del conversion_run (Layer 4, downstream).

---

## 16. Período / Integración con Cierre

### 16.1 Chequeo de período

El framework valida que el `acc_period` del batch esté en status `'open'` antes de postear. Si el período está `'soft_close'`, se puede postear con advertencia. Si está `'locked'`, el batch se rechaza con IssueCode: `PERIOD_CLOSED` (FATAL).

### 16.2 Carga tardía (período cerrado)

Si el CFO necesita cargar información de un período cerrado (ej: corrección de balance de un mes anterior):

```
Proceso:
  1. CFO solicita reapertura temporal → acc_period.status = 'post_close_adjustment'
     (transición registrada en acc_period_audit con motivo obligatorio)
  2. Batch se carga y postea como acc_account_balance
  3. El sistema genera alerta: "Período {P} reposteado — reconciliación de consolidación requerida"
  4. acc_period vuelve a 'locked' tras el cierre del adjustment
  5. acc_consolidation_run se re-ejecuta para ese período
```

---

## 17. Validation Pipeline

### 17.1 Etapas de validación

```
ETAPA 1 — TÉCNICA (antes de tocar el ledger)
  VT-001  Archivo legible (formato xlsx/xls o csv)
  VT-002  Estructura esperada presente (hojas BALANCE, EERR MENSUAL)
  VT-003  Columnas obligatorias no vacías
  VT-004  Tipos de datos coherentes (numéricos, fechas)
  VT-005  Encoding correcto
  VT-006  No hay filas completamente vacías en zona de datos
  VT-007  File hash no duplicado (UNIQUE constraint)

ETAPA 2 — CONTABLE (con contexto de entidad y período)
  VC-001  Entidad existe en core_entities y está activa
  VC-002  Período existe en acc_period y tiene status compatible
  VC-003  Moneda declarada existe en maestros TC
  VC-004  Saldos numéricos dentro de rango razonable (anti-overflow)
  VC-005  Balance check: opening + debit - credit = closing (Mode 2, cuando disponibles)
  VC-006  Balance de comprobación ESF cuadra: Activo = Pasivo + Patrimonio (tolerancia configurada)
  VC-007  Resultado del período (ER) reconcilia con Resultado en Patrimonio (si ambos disponibles)

ETAPA 3 — MAPPING
  VM-001  source_account_code tiene mapping en AccountingProfile (Niveles 1-5)
  VM-002  Cuentas sin mapear listan en issues (severidad según materialidad)
  VM-003  Mapping vigente para el período declarado (effective_from/to)
  VM-004  Dimensión declarada tiene valor en dim_value

ETAPA 4 — RECONCILIACIÓN
  VR-001  Σ closing_balance ESF Activo ≈ Σ ESF Pasivo + Patrimonio (±tolerancia)
  VR-002  Resultado del período en ER ≈ Resultado en Patrimonio (partida de resultados)
  VR-003  Si supersede un batch: comparar variaciones vs batch anterior
           Variaciones > umbral_materialidad → alerta
```

### 17.2 Severidades

| Severidad | Código | Comportamiento |
|-----------|--------|---------------|
| FATAL | F | El batch no puede avanzar a POSTING. Requiere corrección. |
| WARNING | W | El batch puede avanzar; CFO ve la advertencia y decide. |
| INFO | I | Solo informativo; no bloquea. |

---

## 18. Reconciliación

### 18.1 Reconciliación ESF (Balance Sheet)

```
Σ closing_balance de cuentas de Activo (accounts mapped to ESF > ACT_*)
= Σ closing_balance de cuentas de Pasivo (ESF > PAS_*) 
  + Σ closing_balance de cuentas de Patrimonio (ESF > PAT)
  + Resultado del Período (si incluido en Patrimonio)

Tolerancia: configurada en acc_materiality_policy para scope_type='analysis_type' = 'balance_check'
Acción si falla: WARNING o FATAL según configuración de empresa
```

### 18.2 Reconciliación ER (Income Statement)

```
Σ movimientos de cuentas de Ingreso (ERI > ING)
- Σ movimientos de cuentas de Costo (ERI > COSTO)
- Σ movimientos de cuentas de Gasto (ERI > GOPEX)
+ Σ Resultado Financiero (ERI > FIN)
- Σ Impuesto (ERI > IMP)
= Resultado del Período (ERI > UAI)

Acción si falla: WARNING (el resultado calculado vs declarado puede diferir por decimales)
```

---

## 19. Error Model

### 19.1 Taxonomía de códigos de error

```
SRC_*  — Errores de fuente (archivo / API)
  SRC_FILE_INVALID        F  El archivo no puede leerse o no tiene el formato esperado
  SRC_SHEET_MISSING       F  Hoja obligatoria no encontrada (ej: "BALANCE")
  SRC_ACCOUNT_UNMAPPED    F/W  source_account_code sin mapping en AccountingProfile
  SRC_DUPLICATE_BATCH     F  file_hash ya existe en acc_source_batch
  SRC_CURRENCY_UNKNOWN    F  Moneda no reconocida

ENTRY_*  — Errores de asiento (Mode 1)
  ENTRY_UNBALANCED        F  Σ debit ≠ Σ credit para journal_entry_id
  ENTRY_MISSING_LINES     F  Journal sin líneas
  ENTRY_DATE_INVALID      W  Fecha de documento futura o muy antigua

BALANCE_*  — Errores de saldo (Mode 2)
  BALANCE_EQUATION_FAIL   F  opening + debit - credit ≠ closing (>tolerancia)
  BALANCE_BSS_MISMATCH    W  ESF Activo ≠ Pasivo + Patrimonio (>tolerancia)
  BALANCE_ER_MISMATCH     W  Resultado ER ≠ Resultado en Patrimonio

PERIOD_*  — Errores de período
  PERIOD_CLOSED           F  acc_period.status = 'locked'
  PERIOD_NOT_FOUND        F  acc_period no existe para entity+fiscal_year+month
  PERIOD_MISMATCH         W  Fechas del archivo no coinciden con período declarado

DIM_*  — Errores de dimensión
  DIM_VALUE_UNKNOWN       W  Valor de dimensión no existe en dim_value
  DIM_TYPE_UNKNOWN        W  Tipo de dimensión no reconocido

MAP_*  — Errores de mapping
  MAP_EXPIRED             W  Mapping vigente hasta fecha pasada
  MAP_AMBIGUOUS           F  Dos mappings activos para misma cuenta+período

RECON_*  — Errores de reconciliación
  RECON_VARIATION_MATERIAL W/F  Variación vs batch anterior > umbral_materialidad
```

### 19.2 Tabla propuesta: `acc_source_batch_issue`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | BIGINT PK | |
| batch_id | BIGINT FK → acc_source_batch | Batch padre |
| source_record_ref | TEXT | Referencia a la fila/cuenta en el archivo origen |
| severity | TEXT | 'FATAL' \| 'WARNING' \| 'INFO' |
| issue_code | TEXT | Ver taxonomía |
| field_name | TEXT | Campo específico con el problema |
| value_found | TEXT | Valor que generó el issue |
| message | TEXT | Mensaje legible |
| suggested_resolution | TEXT | Cómo resolverlo |
| resolved_by | TEXT | Usuario que resolvió |
| resolved_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

### 19.3 Matriz de necesidad de `acc_source_batch_issue`

| Tabla | Existe | Necesaria | Motivo | Alternativa sin crearla |
|-------|--------|-----------|--------|------------------------|
| acc_source_batch_issue | No | **Sí** | Sin ella, los errores están en JSONB del batch sin trazabilidad relacional por issue | JSONB array en acc_source_batch.validation_issues — pero no permite resolución individual ni query por tipo de error |

**Recomendación:** Crear `acc_source_batch_issue` en Etapa 1. Es la única tabla nueva propuesta en OA-024-06.

---

## 20. Manual Correction Policy

### 20.1 Tipos de corrección y rutas

| Tipo | Qué es | Ruta correcta |
|------|--------|---------------|
| SOURCE ERROR | El ERP origen tiene datos incorrectos | Corregir en Contec → reimport con batch nuevo |
| MAPPING ERROR | El mapping source→canonical es incorrecto | Actualizar acc_chart_mapping → revalidar batch sin reimport |
| ACCOUNTING ADJUSTMENT | El hecho contable fue correcto pero requiere un ajuste posterior | `acc_adjustment_journal` con workflow SoD |

### 20.2 Lo que NO está permitido

- Editar manualmente un `acc_account_balance.closing_balance` fuera de un workflow de batch
- Cambiar el `file_hash` o cualquier campo de `acc_source_batch` en estado POSTED
- Crear `acc_journal_entry` directamente sin pasar por un adapter o el `ManualAdapter`

---

## 21. Security / SoD

### 21.1 Roles del lifecycle del batch

| Rol | Puede hacer |
|-----|-------------|
| Uploader | Crear batch, subir archivo |
| Validator | Ejecutar pipeline de validación, ver issues |
| Approver (CFO) | Aprobar batches materiales |
| Poster | Ejecutar el posting a acc_* (automatizable si batch inmaterial) |
| Reviewer (auditor) | Solo lectura: ver historial de batches, issues, lineage |

### 21.2 SoD en Mediterra One (empresa pequeña)

Para empresas del grupo con pocos usuarios:
- El mismo usuario puede ser Uploader, Validator y Poster para batches inmateriales
- Para batches materiales (> umbral acc_materiality_policy): el Uploader ≠ Approver
- En la práctica: Carol/Michelle sube y valida; Angelo aprueba si es material
- La trazabilidad completa se mantiene independientemente del nivel de SoD

### 21.3 Integración con acc_entity_config y acc_company_profile

Los perfiles de aprobación (¿quién puede aprobar un batch de esta empresa?) son configurables en `acc_company_profile`. Esto no está en scope de OA-024-06 pero debe dejarse el hook en el diseño.

---

## 22. Audit / Data Lineage

### 22.1 Drill-down completo requerido

Desde cualquier número del EEFF hasta el archivo origen:

```
EEFF → acc_consolidation_result_line
  → reporting_account_id → acc_reporting_account (línea del EEFF)
  → consolidation_run_id → acc_consolidation_run (run de consolidación)
  → entity_id + period_id → acc_account_balance (Mode 2) o acc_journal_line (Mode 1)
  → source_batch_id → acc_source_batch (batch de importación)
  → file_name + file_hash → archivo Excel original en Storage
  → (Mode 1 adicional) source_journal_id → comprobante en Contec
```

### 22.2 Invariante de lineage

**Regla:** Ningún valor en `acc_consolidation_result_line` puede originarse en datos que no tengan `source_batch_id` trazable. Ajustes manuales usan el `ManualAdapter` o `acc_adjustment_journal` (que tiene `prepared_by` y `approved_by`).

### 22.3 Inmutabilidad de snapshots

Una vez que `acc_reporting_run.status = 'approved'`, los datos referenciados en `acc_snapshot_metadata` (hashes de input, mapping, ownership) son inmutables. El sistema no permite modificar retroactivamente los archivos fuente de un run aprobado.

---

## 23. Coexistencia ERP 2026 vs ERP 2027

### 23.1 Contexto

```
2025–2026: Contec = accounting source; Mediterra One = reporting layer
2027+:     Mediterra One ERP = accounting source nativo
```

### 23.2 Diseño para coexistencia

El `source_system` en `acc_source_batch` y `acc_journal_entry` identifica el origen. Para datos nativos de Mediterra One:

```
source_system = 'mediterra_one_erp'
adapter_code  = 'native_erp_v1'
```

El NativeErpAdapter no parsea archivos — recibe los journals directamente del motor de contabilidad nativo. El contrato del adapter (CapabilitySet, parse, validate) sigue siendo el mismo. El data no pasa por Excel.

### 23.3 Sin importarse a sí mismo

El ERP nativo no necesita pasar por un `acc_source_batch` de archivo para persistir en `acc_journal_entry`. El `acc_source_batch` puede ser un registro sintético de tipo `'erp_native_period_close'` que actúa como unidad de control del período, no como representación de un archivo.

```javascript
// Ejemplo conceptual — no implementar todavía
class NativeErpAdapter extends SourceAdapter {
  capabilities() {
    return { granularity: 'journal_lines', ...all_true };
  }
  // No recibe archivo — recibe journals del motor
  async postJournalsDirect(journals, context) {
    // Crea acc_source_batch sintético de tipo 'period_close_native'
    // Postea journals directamente
  }
}
```

---

## 24. Allpa Farms SpA / AGR Extensibility

**Registrado como caso real:**

```
Empresa: Allpa Farms SpA
País: Chile | Predio: Portezuelo | Comuna: Santa Cruz
Cultivo: cerezas | Superficie: ~40 ha
```

### 24.1 Cómo el modelo contable soporta AGR sin contaminarse

El costo de una labor agrícola en Allpa Farms SpA llega al ledger como:

```sql
acc_journal_entry (posting_date='2026-09-15', entity_id=APC, description='Cosecha sector A')
  acc_journal_line (account='6.01.05.001', debit=8500000, credit=0)
    acc_journal_line_dim (dim_type='PRD', dim_value='PORTEZUELO')
    acc_journal_line_dim (dim_type='CUA', dim_value='SECTOR-A')
    acc_journal_line_dim (dim_type='LBR', dim_value='COSECHA-MANUAL')
    acc_journal_line_dim (dim_type='VAR', dim_value='REGINA')
    acc_journal_line_dim (dim_type='TMP', dim_value='2026-2027')
  acc_journal_line (account='2.01.05.001', debit=0, credit=8500000)
```

La cuenta de resultado (`acc_reporting_account`) en el EEFF es `COSTO_OPERACIONAL`. El drill-down desde EBITDA/ha requiere:

```
EBITDA del EEFF
  → acc_consolidation_result_line (entity=APC, period=2026-09, reporting_account=GOPEX)
  → acc_journal_line (account='6.01.05.001')
  → acc_journal_line_dim WHERE dim_type='PRD' AND dim_value='PORTEZUELO'
  → acc_journal_line_dim WHERE dim_type='LBR' AND dim_value='COSECHA-MANUAL'
  → fuente: acc_source_batch → archivo o Orden de Labor nativa
```

**Este drill-down ya es posible con el schema Etapa 0.** Solo requiere agregar los dim_type de AGR en la tabla `dim_type` (8 INSERT, sin ALTER TABLE).

### 24.2 Costo/ha desde EEFF

```
EBITDA/ha = EBITDA_APC / hectareas_activas_APC
```

El `hectareas_activas_APC` es un dato operacional (no contable). El linkage con el dominio operacional futuro (OPR) sigue el contrato de Management Performance de OA-024-01-R1:

```
acc_consolidation_result_line.entity_id + period_id + reporting_account_id
    ←→ opr_actuals_entry.entity_id + period_id + kpi_type_id
```

No requiere cambios al schema contable. AGR solo agrega dim_values.

---

## 25. Relación con `calendario_data`

**Principio:** Contabilidad ≠ `calendario_data`.

| Sistema | Storage | Razón |
|---------|---------|-------|
| Accounting Domain (`acc_*`) | Tablas relacionales Supabase | Schema relacional, integridad referencial, auditoría, IFRS |
| Finanzas/Flujo de Caja/Créditos | `calendario_data` JSON blob | Legacy; no migar sin proyecto específico |
| ANF actual (`anf_saldos_esf`, `anf_movimientos_er`) | Tablas ANF Supabase | Separado de `calendario_data`; coexiste con `acc_*` durante transición |

El SourceAdapter Framework escribe exclusivamente en `acc_*`. No lee ni escribe en `calendario_data`. La coexistencia de las tablas ANF con las tablas `acc_*` es temporal — durante la transición, ambas pueden tener datos del mismo período; el motor de reporting decide cuál leer según el estado de migración.

**Integración mínima requerida con la app actual:**

- La UI del EEFFModule necesita un selector: "Fuente: ANF (actual) | Contable (acc_*)". Esto es un cambio de UI — fuera de scope de OA-024-06.

---

## 26. Future EEFFModule Contract

El EEFFModule actual lee del dominio in-memory `src/accounting/`. El EEFFModule futuro debe leer del ledger canónico:

```javascript
// Contrato de lectura del futuro EEFFModule
async function fetchEeff(entity_id, period_id, reporting_run_id) {
  // Opción A: resultado del consolidation_run (si existe)
  const lines = await supabase
    .from('acc_consolidation_result_line')
    .select(`
      entity_id, period_id,
      reporting_account:acc_reporting_account(code, name, normal_balance, sort_order),
      reporting_line:acc_reporting_line(name, sort_order, presentation_sign),
      individual_value, eliminations_value, adjustments_value,
      ias28_value, nci_value, consolidated_value
    `)
    .eq('consolidation_run_id', reporting_run_id)
    .order('reporting_account.sort_order');

  // Opción B: si no hay consolidation_run, desde acc_account_balance directamente
  const balances = await supabase
    .from('acc_account_balance')
    .select('source_account_code, account_id, closing_balance, granularity_level')
    .eq('entity_id', entity_id)
    .eq('period_id', period_id)
    .eq('source_batch_id.status', 'POSTED');  // solo batches posteados

  return { lines, balances, granularity_level: lines?.[0]?.granularity_level };
}
```

El EEFFModule NO debe leer de:
- `anf_saldos_esf` (directamente)
- `src/accounting/` in-memory (una vez migrado)
- Archivos Contec directamente

---

## 27. Tablas existentes vs propuestas

| Tabla | Existe en Etapa 0 | Necesaria para Framework | Owner | Motivo | Alternativa |
|-------|:------------------:|:------------------------:|-------|--------|-------------|
| acc_source_batch | **Sí** | Sí (extender) | Layer 1 | Lote de control principal | — |
| acc_journal_entry | **Sí** | Sí (Mode 1) | Layer 3 | Destino de asientos | — |
| acc_journal_line | **Sí** | Sí (Mode 1) | Layer 3 | Líneas de asiento | — |
| acc_account_balance | **Sí** | Sí (Mode 2) | Layer 3 | Destino de saldos | — |
| acc_journal_line_dim | **Sí** | Sí | Layer 3 | Dimensiones de asientos | — |
| acc_account_balance_dim | **Sí** | Sí | Layer 3 | Dimensiones de saldos | — |
| acc_chart_mapping | **Sí** | Sí (mapping) | Layer 2 | Account mapping Nivel 3 | — |
| acc_base_profile | **Sí** | Sí (mapping) | Layer 2 | Account mapping Nivel 1 | — |
| acc_company_profile | **Sí** | Sí (mapping) | Layer 2 | Account mapping Nivel 2 | — |
| dim_type | **Sí** | Sí | Layer 2 | Catálogo de dimensiones | — |
| dim_value | **Sí** | Sí | Layer 2 | Valores de dimensiones | — |
| acc_period_mapping_override | **Sí** | Sí (mapping Nivel 4) | Layer 2 | Override temporal | — |
| **acc_source_batch_issue** | No | **Sí — propuesta** | Layer 2 | Tracking relacional de issues | JSONB array (pierde queryabilidad) |
| acc_source_system | No | No | — | — | source_system TEXT en acc_source_batch es suficiente |
| acc_source_mapping | No | No | — | — | AccountingProfile (acc_chart_mapping) lo cubre |
| acc_source_balance | No | No | — | — | acc_account_balance con granularity_level='trial_balance' cubre Mode 2 |
| acc_source_record | No | No | — | — | El archivo fuente en Storage + source_batch_id es suficiente para lineage |
| acc_dimension_mapping | No | No | — | — | dim_value con code=código_fuente es suficiente; si se requiere mapping explícito se evalúa en Etapa 2 |

**Total tablas nuevas propuestas en OA-024-06: 1** (`acc_source_batch_issue`).  
Todas las demás ya existen en Etapa 0.

---

## 28. APIs / Interfaces Conceptuales

### 28.1 Contrato del framework (service layer)

```javascript
// Funciones principales del SourceAdapter Framework (conceptual)

// 1. Crear batch (antes de parsear)
createBatch(entity_id, period_id, adapter_code, file_metadata)
  → acc_source_batch{id, status:'CREATED'}

// 2. Parsear y normalizar
parseBatch(batch_id, rawInput)
  → { batch_id, records: BalanceImportRecord[] | JournalImportRecord[], warnings }
  → batch.status → 'PARSED'

// 3. Validar y mapear
validateBatch(batch_id)
  → { batch_id, issues: Issue[], passed: Boolean }
  → acc_source_batch_issue[] (INSERT)
  → batch.status → 'VALIDATED' | 'REJECTED'

// 4. Aprobar (si material)
approveBatch(batch_id, approver_id)
  → batch.status → 'APPROVED'

// 5. Postear al ledger
postBatch(batch_id, poster_id)
  → acc_account_balance[] | acc_journal_entry[] (INSERT)
  → batch.status → 'POSTED'

// 6. Superseder
supersedeBatch(old_batch_id, new_batch_id, reason)
  → old_batch.status → 'SUPERSEDED'
  → acc_period: trigger re-consolidation

// 7. Rollback
rollbackBatch(batch_id, reason, cfо_id)
  → batch.status → 'ROLLED_BACK'
  → soft-invalidate related acc_account_balance
```

---

## 29. State Diagrams

### 29.1 acc_source_batch

```
CREATED → PARSING → PARSED → VALIDATING ─┬→ VALIDATED ─┬→ APPROVED → POSTING → POSTED
                                          └→ REJECTED   └(immaterial)         │
                                                                                ├→ SUPERSEDED
                                                                                └→ ROLLED_BACK
```

### 29.2 Flujo de aprobación por materialidad

```
batch.total_debit > materiality_threshold?
    Sí → status='PENDING_APPROVAL' → CFO aprueba → 'APPROVED'
    No → status='APPROVED' (automático) → continúa a posting
```

---

## 30. Sequence Diagrams

### 30.1 Caso 1: Carga Contec julio 2026 (modo balance)

```
Usuario → UI: Sube Excel Contec julio 2026
UI → Framework: createBatch(entity='ALF', period='2026-07', adapter='contec_excel_v1', file)
Framework → ContecAdapter: extractBatchMetadata(file) → {hash, size, name}
Framework → DB: INSERT acc_source_batch(status='CREATED', file_hash=...)
Framework → ContecAdapter: parse(file, context={entity='ALF', period='2026-07'})
  ContecAdapter → anfParser: parsearInformeANF(file, filial_ALF, 2026, 7)
  anfParser → ContecAdapter: {esf, esf_t1, er_mensual, er_temp, narrativas}
  ContecAdapter → Framework: BalanceImportRecord[] (normalizado)
Framework → DB: batch.status='PARSED'
Framework → ValidationPipeline: validateBatch(batch_id, records)
  ValidationPipeline: [VT-*] técnicas → PASS
  ValidationPipeline: [VC-006] ESF cuadra? → PASS
  ValidationPipeline: [VM-001] 3 cuentas sin mapping → 3 × SRC_ACCOUNT_UNMAPPED (WARNING)
  ValidationPipeline → DB: INSERT 3 acc_source_batch_issue (WARNING)
Framework → DB: batch.status='VALIDATED'
Framework → UI: {passed: true, issues: 3 WARNINGs, batch_id}
UI → CFO: "3 cuentas sin clasificar — ¿aprobar de todas formas?"
CFO → UI: Asigna mapping para 2 de 3 cuentas en acc_chart_mapping
CFO → Framework: "Revalidar batch"
Framework → ValidationPipeline: validateBatch(batch_id, records) [con nuevos mappings]
  → 1 WARNING restante (cuenta inmaterial)
CFO → Framework: approveBatch(batch_id, cfо_id='AH')
Framework → DB: batch.status='APPROVED'
Framework → DB: postBatch(batch_id, poster_id='CH')
  → INSERT acc_account_balance × N cuentas
  → batch.status='POSTED'
UI → CFO: "Julio 2026 ALF posteado. 1 cuenta inmaterial sin clasificar."
```

### 30.2 Caso 2: Re-carga con archivo corregido

```
Contec re-exportó julio con 2 comprobantes corregidos.
Usuario → UI: Sube nuevo Excel julio (contenido diferente → hash diferente)
Framework → DB: INSERT acc_source_batch(supersedes_batch_id=batch_anterior, status='CREATED')
... [mismo pipeline que Caso 1]
Framework → DB: batch_nuevo.status='POSTED'
             batch_anterior.status='SUPERSEDED', superseded_by_batch_id=batch_nuevo.id
Framework → acc_consolidation_run: invalidar run anterior → requiere nuevo run
```

### 30.3 Caso 5: Costo nativo de Allpa Farms SpA (2027)

```
Sistema AGR de Mediterra One genera Orden de Labor (cosecha)
AGR → NativeErpAdapter: postOrderLabor(orden)
NativeErpAdapter → Framework: createBatch(entity='APC', type='native_erp', synthetic=true)
NativeErpAdapter → Framework: parse(orden) → JournalImportRecord[] (Mode 1)
  [cuenta 6.01.05.001 + dimensiones PRD/CUA/LBR/VAR/TMP]
Framework → ValidationPipeline: [VC-*, VM-*, VR-*]
Framework → DB: postBatch → acc_journal_entry + acc_journal_line + dims
→ El costo aparece en ERI/GOPEX del EEFF de APC
→ Drill-down: EBITDA/ha → acc_journal_line → dim_value('SECTOR-A') → OL-2027-0045
```

---

## 31. Failure Scenarios

| Escenario | Detección | Comportamiento |
|-----------|-----------|---------------|
| Archivo Excel corrupto | VT-001 | FATAL — batch queda en REJECTED |
| Hoja BALANCE faltante | VT-002 | FATAL — anfParser lanza error conocido |
| ESF no cuadra (diferencia material) | VC-006 | FATAL (configurable) — batch no avanza |
| Cuenta nueva sin mapping | VM-001 | WARNING o FATAL según materialidad |
| Período cerrado | PERIOD_CLOSED | FATAL — requiere workflow de reapertura |
| Usuario duplica carga del mismo archivo | SRC_DUPLICATE_BATCH | FATAL — retorna referencia al batch existente |
| TC no disponible para conversión | (downstream) | El batch se postea; la conversion_run falla separadamente |
| Rollback de batch posteado | Manual CFO | Soft-invalidation; period no retrocede automáticamente |
| Archivo con encoding raro | VT-005 | WARNING + intento de conversión; FATAL si falla |

---

## 32. Open Decisions

| ID | Decisión | Opciones | Impacto | Propietario |
|----|----------|----------|---------|-------------|
| **OD-001** | Apertura y movimiento mensual en Contec (balance acumulado vs movimiento) | A: cargar pares consecutivos; B: aceptar solo closing; C: ESF+EERR separados | Afecta campos obligatorios del BalanceImportRecord | CFO |
| **OD-002** | Soft-delete en acc_account_balance y acc_journal_entry para rollback | is_active=false vs rolled_back_at TIMESTAMPTZ | Afecta queries del motor de consolidación | Architecture |
| **OD-003** | ¿El batch crea automáticamente dim_value nuevos o rechaza? | Auto-create (flexible, riesgo de proliferación) vs rechaza (controlado, más fricción) | Experiencia de usuario en carga inicial | CFO |
| **OD-004** | Budget en el mismo batch o batch separado | Mismo batch (EERR TEMP incluye ppto) vs batch de presupuesto separado | Complejidad del BalanceImportRecord y el acc_source_batch | Architecture |
| **OD-005** | Tolerancia de reconciliación ESF (balance check) | 0.01 USD fijo vs % del activo total | Diferencias de redondeo en exports Contec | CFO |
| **OD-006** | ¿Columnas adicionales en acc_source_batch o tabla separada acc_source_batch_meta? | Extender tabla existente (simple) vs tabla separada (más flexible) | Schema de Etapa 1 | Architecture |
| **OD-007** | Aprobación automática para batches inmateriales: ¿quién define "inmaterial" por empresa? | acc_materiality_policy global vs por empresa | Operativa de Carol/Michelle sin depender del CFO para cada carga | CFO |

---

## 33. Risks

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|----|--------|:------------:|:-------:|------------|
| R1 | Contec BALANCE no entrega apertura — derivación de movimiento incorrecta | Alta | Medio | OD-001: política de carga por pares |
| R2 | ESF de Contec no cuadra por diferencias de redondeo en el export | Media | Bajo | Tolerancia configurable en acc_materiality_policy |
| R3 | Cuentas sin mapeo bloquean la primera carga masiva histórica | Alta | Medio | SRC_ACCOUNT_UNMAPPED configurado como WARNING en carga inicial; CFO itera |
| R4 | EERR MENSUAL vs EERR TEMP tienen valores discrepantes para mismo mes | Media | Medio | Parser actual ya usa MENSUAL con prioridad sobre TEMP; mantener esta lógica |
| R5 | Contec codifica algunas cuentas de manera distinta entre empresas | Media | Alto | AccountingProfile Nivel 2 (company profile) y Nivel 3 (chart mapping por empresa) |
| R6 | El rollback de un batch posteado deja el período en estado inconsistente | Baja | Alto | OD-002: soft-invalidation + alerta de re-consolidación |
| R7 | NativeErpAdapter de 2027 requiere refactor de interfaz actual | Media | Medio | El contrato del adapter es abstracto; NativeErp solo necesita implementar CapabilitySet |
| R8 | acc_source_batch_issue genera demasiados registros en carga histórica masiva | Media | Bajo | Paginación y límite de issues por batch (ej: max 500 issues antes de REJECTED) |

---

## 34. Acceptance Criteria

Para declarar OA-024-06 APPROVED y habilitar el desarrollo de Etapa 1:

1. **AC-01** — CFO confirma que OD-001 (apertura Contec) está resuelto con opción A, B o C.
2. **AC-02** — CFO aprueba la creación de `acc_source_batch_issue` como única tabla nueva.
3. **AC-03** — CFO confirma la política de materialidad para aprobación automática (OD-007).
4. **AC-04** — El diseño de CapabilitySet es compatible con los datos reales que entrega Contec (requiere exportación de muestra — Blocker B1 de OA-024-01-R2-CLOSURE).
5. **AC-05** — Las 6 preguntas del mandate (Casos 1-6) tienen respuesta inequívoca en este documento.

---

## 35. Respuesta a las 6 preguntas del mandate

### Caso 1: "Subo un archivo Contec de Allpa Farms julio 2026"

```
→ createBatch(entity='APC', period='2026-07', adapter='contec_excel_v1')
→ ContecAdapter.parse() [usa anfParser.js internamente]
→ BalanceImportRecord[] × N cuentas
→ ValidationPipeline: técnica → contable → mapping → reconciliación
→ Issues (WARNINGs si cuentas sin mapeo)
→ CFO aprueba (o auto si inmaterial)
→ postBatch → INSERT acc_account_balance × N filas
→ Julio 2026 aparece disponible para consolidation_run
→ EEFFModule puede renderizar julio con datos de APC
```

### Caso 2: "Vuelvo a subir julio porque Contec cambió dos comprobantes"

```
→ El nuevo archivo tiene hash diferente
→ createBatch con supersedes_batch_id = batch_anterior
→ Mismo pipeline de parse → validate → approve → post
→ batch_nuevo.status = 'POSTED'
→ batch_anterior.status = 'SUPERSEDED'
→ Si había un acc_consolidation_run aprobado para julio → se invalida; requiere nuevo run
→ EEFFModule muestra julio con datos actualizados
```

### Caso 3: "El archivo solo tiene balance de comprobación, no journals"

```
→ ContecAdapter declara granularity='trial_balance' en CapabilitySet
→ Datos van a acc_account_balance (no acc_journal_entry)
→ granularity_level='trial_balance' persiste en cada registro
→ EEFFModule muestra datos de julio con ícono "📊 Datos de saldo — drill-down documental no disponible"
→ Flujo de efectivo método directo: NO DISPONIBLE para esta empresa/período
→ No se fabrica granularidad que la fuente no tiene
```

### Caso 4: "Una cuenta nueva de agroquímicos no tiene mapping"

```
→ ValidationPipeline Etapa 3: VM-001 → IssueCode: SRC_ACCOUNT_UNMAPPED
→ Severidad = FATAL si la cuenta es material (> umbral acc_materiality_policy)
→ Severidad = WARNING si es inmaterial
→ acc_source_batch_issue INSERT con: source_account_code, suggested_resolution='Agregar mapping en Contab. > Mappings'
→ El batch queda en VALIDATED pero no avanza a POSTING
→ CFO/contador agrega el mapping en acc_chart_mapping para la empresa
→ Framework revalida el batch (sin subir el archivo de nuevo)
→ STOP eliminado → batch avanza a POSTING
```

### Caso 5: "Un costo de Allpa Farms SpA en 2027 nace dentro de Mediterra One"

```
→ Sistema AGR genera Orden de Labor OL-2027-0045
→ NativeErpAdapter.postOrderLabor(orden) → JournalImportRecord (Mode 1)
→ acc_source_batch sintético: source_system='mediterra_one_erp', type='native_erp'
→ acc_journal_entry: entity=APC, source_journal_id='OL-2027-0045'
→ acc_journal_line: account='6.01.05.001', debit=8,500,000, dimensions={PRD:PORTEZUELO, LBR:COSECHA}
→ El costo aparece en ERI del EEFF de APC con plena trazabilidad
→ NO pasa por Contec, NO pasa por Excel, SÍ pasa por el mismo contrato del framework
```

### Caso 6: "Quiero explicar desde EBITDA/ha hasta la factura/asiento"

**Mode 1 (si la fuente tiene journals):**
```
EBITDA/ha = EBITDA_EEFF / hectáreas_activas (operacional)
          ↓
EBITDA_EEFF ← acc_consolidation_result_line(entity=APC, ERI > EBIT)
          ↓
Filtrar por dimensión: acc_journal_line_dim WHERE dim_type='PRD' AND dim_value='PORTEZUELO'
          ↓
acc_journal_line → acc_journal_entry(source_journal_id='COMP-2026-0892')
          ↓
acc_source_batch → file_name='Allpa_Sep_2026.xlsx' → archivo en Supabase Storage
          ↓
Si native (2027): acc_journal_entry → OL-2027-0045 en sistema AGR
```

**Mode 2 (si la fuente solo tiene trial balance):**
```
EBITDA/ha → acc_consolidation_result_line(ERI > EBIT)
          ↓
acc_account_balance(account='6.01.05.001', period='2026-09')
          ↓
acc_source_batch → file_name='Allpa_Sep_2026_Balance.xlsx'
[drill-down hasta asiento: NO DISPONIBLE — granularity='trial_balance']
```

**La arquitectura lo permite en Mode 1 y es honesta en Mode 2.**

---

## 36. Recommended Implementation Sequence

```
OA-024-06 DISEÑO ← estamos aquí (este documento)
        ↓
[Gate: CFO aprueba AC-01 a AC-05]
        ↓
OA-024-07 — Etapa 1: Infraestructura base del framework
  1. Migración de columnas adicionales en acc_source_batch
  2. CREATE TABLE acc_source_batch_issue
  3. Seed de acc_base_profile para plan de cuentas Contec
  4. Seed de dim_value iniciales para dimensiones conocidas
  5. Seed de acc_materiality_policy global
  6. Tests de las nuevas tablas (suite adicional a los 37 de Etapa 0)
        ↓
OA-024-08 — Etapa 2: ContecAdapter formal
  1. Refactorizar anfParser.js como ContecAdapter (CapabilitySet + parse + buildBalanceRecords)
  2. ValidationPipeline (VT-*, VC-*, VM-*, VR-*)
  3. AccountMappingResolver (5 niveles)
  4. postBatch Mode 2 → acc_account_balance
  5. Carga de un período piloto (julio 2026 ALF) en staging
        ↓
OA-024-09 — Etapa 3: UI de ingesta
  1. Tab "📥 Ingesta" en EEFFModule
  2. Upload + progress + issues display
  3. Aprobación CFO en-app
        ↓
OA-024-10 — Etapa 4: EEFFModule desde ledger canónico
  1. EEFFModule lee acc_account_balance (Mode 2) en lugar de anf_saldos_esf
  2. Selector: ANF (legacy) | Contable (acc_*)
  3. Drill-down hasta cuenta
```

---

## CHANGELOG R0

| # | Sección | Contenido |
|---|---------|-----------|
| C1 | Sec. 3 | Grounding en anfParser.js existente — ContecAdapter es una formalización, no una creación |
| C2 | Sec. 8.1 | Diagnóstico de granularidad real de Contec: balance-level, no journal-level |
| C3 | Sec. 27 | Solo 1 tabla nueva propuesta: acc_source_batch_issue |
| C4 | Sec. 24 | AGR/Allpa Farms SpA: el modelo de dimensiones ya soporta drill-down hasta cuartel/labor |
| C5 | Sec. 13.3 | Contec Base Profile: classifier.js ya implementa el Nivel 1 del AccountingProfile |
| C6 | Sec. 32 | 7 OPEN DECISIONS identificadas — OD-001 es la más urgente |
| C7 | Sec. 35 | 6 preguntas del mandate respondidas inequívocamente |
| C8 | Sec. 8.4 | OD-001 sobre apertura y movimiento mensual de Contec — requiere input CFO |

---

**STOP — NO implementar OA-024-07. NO modificar EEFFModule. NO crear migraciones.**  
**Esperar aprobación de Acceptance Criteria AC-01 a AC-05 del CFO.**

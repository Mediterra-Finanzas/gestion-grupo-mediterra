# OA-024-01 — Arquitectura FRP / Dominio Contable
**Mediterra One — Financial Reporting Platform**
**Estado:** BORRADOR — pendiente revisión y autorización del CFO antes de materializar
**Fecha:** 2026-08-13
**Autor:** Claude Code · Claude Sonnet 4.6

---

## STOP-AND-REPORT — Brechas bloqueantes

Antes de proceder a la sección de arquitectura, se identifican las siguientes brechas de información que **bloquean parcialmente** la implementación (no el diseño):

| ID | Brecha | Impacto | Qué se necesita |
|---|---|---|---|
| **B1** | Formato de exportación Contec desconocido | **ALTO** — sin esto el ContecAdapter no puede diseñarse en firme | Exportación real de Contec de Allegria Foods o Allegria Service (cualquier mes) |
| **B2** | Plan de cuentas (COA) de cada empresa no disponible | **ALTO** — sin COA no se puede construir acc_chart_mapping | Listado de cuentas con código y descripción de al menos Allegria Foods |
| **B3** | Granularidad de Contec: ¿saldos o asientos individuales? | **ALTO** — define si acc_entry es a nivel de asiento o saldo acumulado | Verificar con exportación real |
| **B4** | Template Excel de Angelo pendiente | **MEDIO** — necesario para validar ExcelAdapter | Template de carga mensual |
| **B5** | Datos Allpa Chile/Perú para IAS 28 | **MEDIO** — sin esto equity method no puede validarse | Resultado neto y patrimonio por período de ambas JVs |

**Decisión:** el diseño completo es viable. La implementación de `ContecAdapter`, `acc_chart_mapping` y el motor IAS 28 queda **bloqueada** hasta resolver B1–B3. El resto de la arquitectura puede avanzar.

Si los datos de Contec tienen menor granularidad que la requerida (ej. solo saldos sin movimientos del período), el drill-down completo no será posible con la fuente Contec — se reportará la brecha antes de adaptar el diseño a esa limitación.

---

## 1. Arquitectura end-to-end

```
╔══════════════════════════════════════════════════════════════════════╗
║  FUENTES EXTERNAS          INGESTA           MODELO CANÓNICO         ║
║                                                                      ║
║  Contec (Allegria) ──┐                                               ║
║  Excel (templates) ──┼──▶  SourceAdapter ──▶  acc_entry             ║
║  ERP Mediterra One ──┘         │                   │                 ║
║                                │                   ▼                 ║
║                         acc_import_batch    AccountingProfile        ║
║                                               + acc_chart_mapping    ║
║                                                   │                  ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─  ║
║                                ▼                   ▼                 ║
║  VALIDACIÓN            Cuadre Activo=Pasivo+Patrimonio               ║
║                        Completitud por empresa/período/cuenta        ║
║                                │                                     ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ║
║                                ▼                                     ║
║  CONSOLIDACIÓN         Línea a línea (6 empresas)                    ║
║                        Método patrimonio IAS 28 (2 JVs)             ║
║                        Eliminaciones intercompany (explícitas)       ║
║                        Ajustes manuales                              ║
║                                │                                     ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ║
║                                ▼                                     ║
║  CONVERSIÓN            IAS 21 multimoneda                            ║
║  MULTIMONEDA           ▲ consume CurrencyDomain OA-023 (contrato)   ║
║                                │                                     ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ║
║                                ▼                                     ║
║  EEFF                  Balance General                               ║
║                        Estado de Resultados                          ║
║                        (Flujo de Efectivo — fase posterior)          ║
║                                │                                     ║
║  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  ║
║                                ▼                                     ║
║  MANAGEMENT            Real vs Budget vs PY vs Forecast              ║
║  PERFORMANCE           Variaciones, tendencia, materialidad          ║
║                        Conexión con drivers operacionales            ║
╚══════════════════════════════════════════════════════════════════════╝
```

---

## 2. Entidades propuestas

| Entidad | Rol |
|---|---|
| `acc_import_batch` | Lote de importación — metadatos de cada carga |
| `acc_entry` | Línea contable canónica — tabla central del dominio |
| `acc_reporting_account` | Catálogo de cuentas del modelo de reporting |
| `acc_reporting_line` | Líneas del EEFF (estructura del estado) |
| `acc_chart_mapping` | Mapeo cuenta origen → cuenta reporting (versionado) |
| `acc_elimination` | Eliminaciones intercompany (explícitas, auditadas) |
| `acc_adjustment` | Ajustes manuales post-ingesta |
| `acc_budget_entry` | Presupuesto y forecast por período |
| `acc_period_lock` | Control de apertura/cierre/aprobación de períodos |
| `acc_period_lock_audit` | Historial de cambios en estado de período |
| `acc_consolidation_snapshot` | Snapshot inmutable post-consolidación aprobado |
| `acc_audit_log` | Log de auditoría de toda operación sobre el dominio |

---

## 3. Contrato del modelo contable canónico

### 3.1 acc_entry — tabla central

```sql
CREATE TABLE acc_entry (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Identificación
  empresa                TEXT NOT NULL,           -- código: MH, AF, AS, FF, OP, IF, APC, APP
  periodo                TEXT NOT NULL,           -- 'YYYY-MM'
  ejercicio              INT  NOT NULL,           -- YYYY

  -- Cuenta de origen (tal como viene del ERP)
  cuenta_origen          TEXT NOT NULL,
  desc_cuenta            TEXT,
  plan_cuentas_origen    TEXT NOT NULL,           -- 'contec_allegria'|'excel_v1'|'erp_m1'
  centro_costo           TEXT,                   -- nullable
  auxiliar               TEXT,                   -- nullable

  -- Moneda y valores
  moneda_transaccional   TEXT NOT NULL,           -- ISO 4217
  debito                 NUMERIC(18,4) NOT NULL DEFAULT 0,
  credito                NUMERIC(18,4) NOT NULL DEFAULT 0,
  saldo                  NUMERIC(18,4) NOT NULL, -- saldo final del período
  saldo_apertura         NUMERIC(18,4),          -- saldo al inicio del período (si disponible)
  movimientos_periodo    JSONB,                  -- detalle de asientos si la fuente lo entrega

  -- Trazabilidad de ingesta
  fuente                 TEXT NOT NULL,           -- 'contec'|'excel'|'erp_m1'|'manual'
  import_batch_id        BIGINT REFERENCES acc_import_batch(id),
  fecha_carga            TIMESTAMPTZ NOT NULL DEFAULT now(),
  cargado_por            TEXT NOT NULL,

  -- Versionamiento
  version                INT NOT NULL DEFAULT 1,
  reemplaza_a            BIGINT REFERENCES acc_entry(id), -- cadena de versiones

  -- Estado del ciclo de vida
  estado                 TEXT NOT NULL DEFAULT 'draft',
  -- 'draft'|'validated'|'approved'|'locked'

  -- Soft delete y auditoría
  activo                 BOOLEAN NOT NULL DEFAULT true,
  audit_metadata         JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotencia: mismo batch no puede cargar dos veces la misma cuenta
  CONSTRAINT uq_entry_batch_cuenta
    UNIQUE (import_batch_id, empresa, periodo, cuenta_origen, moneda_transaccional)
);
```

**Convención de signos (decisión abierta D1):** por definir con Angelo antes de implementar. Opciones:
- Convención natural: débito = activos/gastos; crédito = pasivos/patrimonio/ingresos
- Convención saldo: saldo positivo = activo/gasto; saldo negativo = pasivo/patrimonio/ingreso

La convención elegida debe documentarse en `plan_cuentas_origen` metadata y respetarse uniformemente en todos los adapters.

### 3.2 acc_import_batch

```sql
CREATE TABLE acc_import_batch (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa           TEXT NOT NULL,
  periodo           TEXT NOT NULL,               -- 'YYYY-MM'
  fuente            TEXT NOT NULL,
  archivo_nombre    TEXT,
  archivo_hash      TEXT,                        -- SHA-256 para detectar re-cargas idénticas
  total_cuentas     INT,
  total_debito      NUMERIC(18,4),
  total_credito     NUMERIC(18,4),
  estado            TEXT NOT NULL DEFAULT 'pending',
  -- 'pending'|'processing'|'validated'|'rejected'|'superseded'
  cargado_por       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas             TEXT,

  -- Si este batch reemplaza a otro (corrección)
  reemplaza_batch   BIGINT REFERENCES acc_import_batch(id)
);
```

---

## 4. Diseño SourceAdapter

### 4.1 Contrato del adapter

```javascript
// Interfaz que todos los adapters deben implementar

class SourceAdapter {
  // Retorna metadatos del adapter
  metadata() {
    return {
      nombre: String,           // 'ContecAdapter'
      version: String,          // '1.0.0'
      empresa: String,          // 'AF'
      plan_cuentas: String,     // 'contec_allegria'
      fuente: String,           // 'contec'
    };
  }

  // Parsea el input crudo (Buffer de Excel, JSON de API, etc.)
  // Retorna líneas en formato raw del origen
  parse(rawInput) { /* → RawLine[] */ }

  // Valida las líneas raw (sin transformar)
  // Retorna errores de formato, campos faltantes, etc.
  validateRaw(lines) { /* → ValidationResult */ }

  // Transforma líneas raw al modelo canónico acc_entry
  transform(lines, importBatchId) { /* → CanonicalEntry[] */ }

  // Calcula totales para verificación de integridad del batch
  totalesBatch(lines) { /* → { totalCuentas, totalDebito, totalCredito } */ }
}
```

### 4.2 Implementaciones planeadas

| Adapter | Estado | Bloqueante |
|---|---|---|
| `ContecAdapter` | **No implementable** | B1 (formato Contec desconocido) |
| `ExcelAdapter` | Diseño posible, implementación bloqueada | B4 (template pendiente) |
| `ManualAdapter` | Implementable | Ninguno |

### 4.3 ExcelAdapter — campos esperados en template

El template Excel de Angelo debe contener como mínimo estas columnas para que el adapter pueda operar:

| Campo requerido | Descripción |
|---|---|
| Empresa | Código o nombre de la empresa |
| Período | AAAA-MM |
| Código cuenta | Código en el plan de cuentas |
| Descripción cuenta | Nombre de la cuenta |
| Centro de costo | Opcional |
| Moneda | ISO 4217 |
| Débito | Monto débito del período |
| Crédito | Monto crédito del período |
| Saldo apertura | Saldo al inicio del período (si disponible) |
| Saldo cierre | Saldo al fin del período |

Si el template tiene menos campos, el drill-down quedará limitado al nivel que la fuente permita — esto debe declararse explícitamente en la UI.

---

## 5. Diseño AccountingProfile y Mapping

### 5.1 Arquitectura de capas

```
cuenta_origen (ERP nativo)
    └── acc_chart_mapping (versioned, con vigencia temporal)
            └── acc_reporting_account (cuenta canónica de reporting)
                    └── acc_reporting_line (línea en el EEFF)
                            └── acc_reporting_section (sección: Activo Corriente, etc.)
                                    └── acc_financial_statement (Balance / P&L)
```

### 5.2 acc_chart_mapping

```sql
CREATE TABLE acc_chart_mapping (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa               TEXT NOT NULL,
  plan_cuentas_origen   TEXT NOT NULL,
  cuenta_origen         TEXT NOT NULL,
  reporting_account_id  BIGINT NOT NULL REFERENCES acc_reporting_account(id),

  -- Vigencia temporal del mapping
  vigente_desde         TEXT NOT NULL,            -- 'YYYY-MM'
  vigente_hasta         TEXT,                     -- NULL = abierto

  -- Jerarquía de override
  nivel_override        TEXT NOT NULL DEFAULT 'empresa',
  -- 'global'|'empresa'|'cuenta_especifica'

  activo                BOOLEAN NOT NULL DEFAULT true,
  version               INT NOT NULL DEFAULT 1,
  creado_por            TEXT NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas                 TEXT
);
```

**Regla crítica:** una reclasificación con nueva vigencia no altera el mapping de períodos ya aprobados. El motor de reporting debe resolver el mapping vigente *para la fecha del período que está reportando*, no el mapping actual.

### 5.3 acc_reporting_account

Catálogo canónico de cuentas de reporting — independiente del ERP. Ejemplo parcial:

| Código | Nombre | Tipo | Estado |
|---|---|---|---|
| `1.1.01` | Caja y Equivalentes | activo_corriente | activo |
| `1.1.02` | Cuentas por Cobrar Comerciales | activo_corriente | activo |
| `2.1.01` | Cuentas por Pagar Comerciales | pasivo_corriente | activo |
| `3.1.01` | Capital | patrimonio | activo |
| `4.1.01` | Ingresos Operacionales | resultado_ingreso | activo |
| `5.1.01` | Costo de Ventas | resultado_costo | activo |

Este catálogo se define **antes** de cargar ningún dato, y luego se mapean las cuentas de cada ERP a él.

---

## 6. Versionamiento

### Principios

1. **Nunca DELETE** — soft delete (`activo = false`) o supersede
2. **Inmutabilidad aprobada** — períodos con estado `approved` no se modifican, se versiona el snapshot
3. **Cadena de reemplazos** — `acc_entry.reemplaza_a` forma cadena de versiones consultable
4. **Mapping temporal** — `acc_chart_mapping.vigente_desde/hasta` versiona el mapping sin tocar el histórico
5. **Batch idempotente** — un mismo archivo subido dos veces produce el mismo resultado (detectado por `archivo_hash`)

### Flujo de corrección de una carga

```
1. Usuario detecta error en carga del período 2026-07 de empresa AF
2. Crea nuevo acc_import_batch con reemplaza_batch = id_batch_erroneo
3. Las acc_entry nuevas tienen reemplaza_a = id_entry_errónea
4. El batch anterior pasa a estado 'superseded'
5. Las acc_entry anteriores pasan a activo = false
6. El sistema reporta usando solo acc_entry activas
7. Todo el historial permanece consultable en auditoría
```

---

## 7. Tratamiento histórico

- Las cargas históricas usan la misma pipeline que las cargas corrientes
- El adapter puede recibir `periodo = '2024-01'` sin problema
- Los períodos con `acc_period_lock.estado = 'locked'` o `'approved'` rechazan nuevas cargas sin override explícito de CFO
- Una corrección retroactiva a un período aprobado requiere:
  1. Unlock explícito con motivo (registrado en `acc_period_lock_audit`)
  2. Nueva carga con batch de corrección
  3. Nueva ejecución del motor de consolidación
  4. Re-aprobación del CFO
  5. Nueva versión del `acc_consolidation_snapshot`

---

## 8. Modelo de períodos

### acc_period_lock

```sql
CREATE TABLE acc_period_lock (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa        TEXT NOT NULL,                  -- o 'CONSOLIDADO' para el grupo
  periodo        TEXT NOT NULL,                  -- 'YYYY-MM'
  tipo_cierre    TEXT NOT NULL,                  -- 'mes'|'trimestre'|'anio'
  estado         TEXT NOT NULL DEFAULT 'open',
  -- 'open'|'soft_close'|'locked'|'approved'
  bloqueado_por  TEXT,
  bloqueado_en   TIMESTAMPTZ,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Flujo de cierre mensual

```
open
  │  CFO ordena cierre preliminar
  ▼
soft_close
  │  Validaciones de cuadre y completitud → deben pasar 100%
  │  Eliminaciones IC ingresadas y aprobadas
  │  Consolidación ejecutada → snapshot generado
  ▼
locked
  │  EEFF presentados al CFO → revisión
  │  CFO aprueba
  ▼
approved  ─────▶  acc_consolidation_snapshot (inmutable)
```

Un período `approved` solo puede reabrirse con acción explícita del CFO + registro en `acc_period_lock_audit`.

---

## 9. Modelo multiempresa

| Empresa | Código | Tipo | NCI | Moneda funcional |
|---|---|---|---|---|
| Mediterra Holding | MH | Línea a línea | — | USD |
| Allegria Foods | AF | Línea a línea | — | USD |
| Allegria Service | AS | Línea a línea | 20% | USD |
| Frisku Foods | FF | Línea a línea | 10% | USD |
| Osiris Plant Management | OP | Línea a línea | — | USD |
| Integrity Farms | IF | Línea a línea | — | USD |
| Allpa Farms Chile | APC | Equity method (50%) | — | USD |
| Allpa Farms Perú | APP | Equity method (26%) | — | PEN / USD presentación |

El catálogo de empresas vive en una tabla `acc_company` que es la referencia canónica para toda entidad del dominio contable. No hardcodear en código.

---

## 10. Modelo multimoneda (IAS 21)

### 10.1 Campos en acc_entry

```
moneda_transaccional   TEXT    -- como vino del ERP origen
moneda_funcional       TEXT    -- moneda funcional de la empresa (USD para todas)
moneda_presentacion    TEXT    -- USD para el grupo
```

### 10.2 Tasas de conversión por tipo de item

| Tipo de partida | Tasa a usar | Período de la tasa |
|---|---|---|
| Activos/pasivos monetarios (balance) | Tasa de cierre | Último día del período |
| Ingresos y gastos (P&L) | Tasa promedio | Promedio mensual del período |
| Patrimonio aportado | Tasa histórica | Fecha de la transacción original |
| Diferencia de conversión | Calculada | Residual → va a OCI |

### 10.3 Integración con Currency Domain OA-023

El dominio contable **NO almacena tasas de cambio propias**. Consume el Currency Domain a través de la siguiente función de contrato:

```javascript
// Contrato de consumo — el dominio contable llama esto, no accede directo a currency_tc
async function getExchangeRate(par, fecha, tipo = 'cierre') {
  // tipo: 'cierre'|'promedio_mes'|'historica'
  // Busca en maestro_tc (ya cargado en FriskuModule)
  // Si no encuentra → lanza error explícito, NUNCA silencia ni asume 1:1
}
```

Si el Currency Domain no tiene la tasa requerida para un período → la validación del período falla con mensaje claro. **Nunca asumir tasa = 1** ni usar tasa de otro período sin declararlo explícitamente.

El par USD-PEN para Allpa Perú debe cargarse manualmente en Maestros → Tipo de Cambio (frankfurter no cubre PEN). Esto ya está previsto en el diseño del Currency Domain.

---

## 11. Consolidación línea a línea

### 11.1 Algoritmo

```
Para cada empresa en {MH, AF, AS, FF, OP, IF}:
  acc_entry_empresa = acc_entry WHERE empresa = X AND periodo = P AND activo = true

Saldo consolidado por reporting_account =
  SUM(acc_entry_empresa para todas las empresas line-by-line)
  - SUM(acc_elimination WHERE periodo = P AND estado = 'aplicada')
  + SUM(acc_adjustment WHERE periodo = P AND estado = 'aprobado')
```

### 11.2 NCI (Non-Controlling Interest)

```
NCI Allegria Service =
  20% × (patrimonio AS + resultado del período AS)

NCI Frisku Foods =
  10% × (patrimonio FF + resultado del período FF)

NCI total = NCI_AS + NCI_FF

En el balance consolidado:
  Patrimonio atribuible a controladora = Total patrimonio - NCI total
```

---

## 12. IAS 28 — Método Patrimonio

### 12.1 Para Allpa Farms Chile (50%) y Allpa Farms Perú (26%)

Estas JVs **NO** se consolidan línea a línea. En el balance consolidado aparece una sola línea:

```
Inversiones en JVs (IAS 28)
```

### 12.2 Cálculo del valor de la inversión

```
Valor inversión inicio de período
+ % participación × Resultado neto del período (en moneda presentación)
+ % participación × OCI del período
- Dividendos recibidos en el período
= Valor inversión fin de período
```

Para Allpa Chile: participación = 50%
Para Allpa Perú: participación = 26%, resultado en PEN → convertir a USD usando tasa promedio del período

### 12.3 Datos requeridos de las JVs

Para cada período se necesita de las JVs (bloqueante B5):
- Resultado neto del período
- OCI del período (si existe)
- Dividendos declarados
- Moneda del estado financiero

Estos datos se cargarán como `acc_entry` con `fuente = 'excel'` y `empresa = 'APC'` o `'APP'`, pero marcados con un tipo especial de entrada para el motor IAS 28.

---

## 13. Eliminaciones intercompany

### 13.1 acc_elimination

```sql
CREATE TABLE acc_elimination (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo                  TEXT NOT NULL,
  empresa_origen           TEXT NOT NULL,
  empresa_contraparte      TEXT NOT NULL,

  -- Cuentas afectadas
  cuenta_origen_empresa    TEXT NOT NULL,          -- en empresa_origen
  cuenta_origen_contraparte TEXT NOT NULL,         -- en empresa_contraparte

  tipo_eliminacion         TEXT NOT NULL,
  -- 'cxc_cxp'|'prestamos'|'ctas_corrientes'|'ventas_compras'
  -- 'servicios'|'dividendos'|'mgmt_fee'|'otros'

  monto                    NUMERIC(18,4) NOT NULL,
  moneda                   TEXT NOT NULL,
  monto_usd                NUMERIC(18,4),          -- convertido a moneda de presentación

  -- Trazabilidad
  regla                    TEXT,                   -- referencia a la regla que genera esto
  fuente                   TEXT NOT NULL,          -- 'auto'|'manual'
  usuario                  TEXT NOT NULL,
  evidencia                TEXT,                   -- ref a documento soporte

  -- Estado
  estado                   TEXT NOT NULL DEFAULT 'draft',
  -- 'draft'|'aprobada'|'aplicada'|'revertida'
  aprobado_por             TEXT,
  consolidation_snapshot_id BIGINT REFERENCES acc_consolidation_snapshot(id),

  -- Auditoría
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  notas                    TEXT
);
```

### 13.2 Tipos de eliminación — catálogo inicial

| Tipo | Descripción | Par de cuentas afectadas |
|---|---|---|
| `cxc_cxp` | Cuentas por cobrar / pagar entre empresas del grupo | CxC ↔ CxP |
| `prestamos` | Préstamos intercompany | Préstamo activo ↔ Préstamo pasivo |
| `ctas_corrientes` | Cuentas corrientes con relacionadas | CC activo ↔ CC pasivo |
| `ventas_compras` | Ventas entre empresas del grupo | Ventas ↔ Costo de compras |
| `servicios` | Servicios prestados intercompany | Ingreso servicios ↔ Gasto servicios |
| `dividendos` | Dividendos intercompany | Ingreso dividendos ↔ Pasivo dividendos |
| `mgmt_fee` | Fee de administración Mediterra Holding | Ingreso fee ↔ Gasto administración |
| `otros` | Otros | Declarar explícitamente |

Cada eliminación es **explícita y auditada**. No hay eliminaciones ocultas en fórmulas de UI.

### 13.3 Visualización

En el EEFF consolidado se debe poder ver para cualquier línea:

```
Saldo individual (suma de empresas)
- Eliminaciones intercompany
+ Ajustes de consolidación
= Saldo consolidado
```

El usuario debe poder expandir cada línea y ver el detalle de las eliminaciones aplicadas.

---

## 14. Ajustes manuales

```sql
CREATE TABLE acc_adjustment (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo           TEXT NOT NULL,
  empresa           TEXT,                 -- NULL = ajuste de consolidación
  empresa_contraparte TEXT,               -- para reclasificaciones entre empresas

  -- Cuenta afectada
  reporting_account_id BIGINT REFERENCES acc_reporting_account(id),
  monto             NUMERIC(18,4) NOT NULL,
  moneda            TEXT NOT NULL,
  es_debito         BOOLEAN NOT NULL,

  tipo_ajuste       TEXT NOT NULL,
  -- 'reclasificacion'|'correccion'|'consolidacion'|'apertura'|'provision'

  -- Trazabilidad
  motivo            TEXT NOT NULL,
  periodo_afectado  TEXT,               -- para ajustes retroactivos
  evidencia         TEXT,
  creado_por        TEXT NOT NULL,

  -- Flujo de aprobación
  estado            TEXT NOT NULL DEFAULT 'draft',
  -- 'draft'|'aprobado'|'aplicado'|'revertido'
  aprobado_por      TEXT,              -- requiere rol CFO
  aprobado_en       TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Los ajustes manuales están separados de `acc_entry` para mantener trazabilidad clara: qué viene del ERP y qué es una decisión del CFO.

---

## 15. Cierre y bloqueo de períodos

### Checklist de cierre mensual (por empresa)

Antes de `soft_close`:
- [ ] Todas las cargas del período recibidas (acc_import_batch.estado = 'validated')
- [ ] Cuadre Activo = Pasivo + Patrimonio: Δ = 0
- [ ] Completitud: ninguna cuenta requerida faltante para el período
- [ ] Tasa de cambio de cierre disponible en Currency Domain

Antes de `locked`:
- [ ] Eliminaciones intercompany ingresadas y aprobadas
- [ ] Ajustes manuales aprobados por CFO
- [ ] Motor de consolidación ejecutado
- [ ] acc_consolidation_snapshot generado

Antes de `approved`:
- [ ] CFO revisó EEFF
- [ ] CFO aprueba explícitamente en la UI (click de aprobación con PIN)
- [ ] Snapshot marcado como inmutable

### acc_period_lock_audit

```sql
CREATE TABLE acc_period_lock_audit (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_lock_id BIGINT REFERENCES acc_period_lock(id),
  empresa      TEXT NOT NULL,
  periodo      TEXT NOT NULL,
  estado_desde TEXT NOT NULL,
  estado_hacia TEXT NOT NULL,
  usuario      TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 16. Auditabilidad

### 16.1 Principios

- Toda operación sobre las tablas del dominio contable genera registro en `acc_audit_log`
- Los campos que cambian se registran con valor anterior y posterior
- `usuario` y `timestamp` presentes en toda operación
- Ningún dato se borra físicamente (soft delete siempre)
- Los snapshots de consolidación aprobados son inmutables

### 16.2 acc_audit_log

```sql
CREATE TABLE acc_audit_log (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tabla            TEXT NOT NULL,
  registro_id      BIGINT NOT NULL,
  operacion        TEXT NOT NULL,       -- 'INSERT'|'UPDATE'|'SOFT_DELETE'
  campo_modificado TEXT,               -- NULL para INSERT (se registra el row completo)
  valor_anterior   JSONB,
  valor_nuevo      JSONB,
  usuario          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 16.3 Implementación

Opciones para captura del audit log:
1. **Triggers Postgres** — automático, más robusto, no depende del código JS
2. **Capa de servicio JS** — explícito, más visible, más frágil

Recomendación: triggers Postgres para las tablas críticas (`acc_entry`, `acc_consolidation_snapshot`, `acc_period_lock`). Capa de servicio para el resto.

---

## 17. Drill-down

### Jerarquía de navegación

```
Grupo consolidado (vista dashboard)
└── Empresa individual
    └── Estado financiero (Balance General / Estado de Resultados)
        └── Sección (ej. Activo Corriente)
            └── Línea reporting (ej. Cuentas por Cobrar Comerciales)
                └── Cuenta canónica (acc_reporting_account)
                    └── Cuenta origen por empresa (acc_entry.cuenta_origen)
                        └── Movimientos del período (acc_entry.movimientos_periodo)
                            si la fuente los entrega
```

### Filtros disponibles en cada nivel

- Período (selector mensual)
- Empresa (o "Consolidado")
- Moneda de presentación (USD o moneda transaccional)
- Versión (actual, histórica aprobada)
- Estado del período (draft / approved)
- Comparativo activo (Real / Budget / PY / Forecast)

### Limitación por fuente

Si Contec o Excel entregan solo saldos (sin movimientos del período), el drill-down se detiene en el nivel de `acc_entry.saldo`. Esto debe declararse en la UI con un indicador visual ("granularidad: saldo mensual").

---

## 18. Estructura de EEFF

### 18.1 Balance General

```
ACTIVO
  Activo Corriente
    Caja y Equivalentes de Caja
    Inversiones Financieras CP
    Cuentas por Cobrar Comerciales (neto)
    Cuentas por Cobrar a Relacionadas
    Inventarios
    Activos Biológicos CP
    Otros Activos Corrientes
  TOTAL ACTIVO CORRIENTE

  Activo No Corriente
    Propiedades, Planta y Equipo (neto)
    Activos Biológicos NC
    Inversiones en JVs (método patrimonio IAS 28)
    Activos Intangibles
    Otros Activos No Corrientes
  TOTAL ACTIVO NO CORRIENTE

TOTAL ACTIVO

PASIVO
  Pasivo Corriente
    Cuentas por Pagar Comerciales
    Cuentas por Pagar a Relacionadas
    Deuda Financiera CP
    Otros Pasivos Corrientes
  TOTAL PASIVO CORRIENTE

  Pasivo No Corriente
    Deuda Financiera LP
    Otros Pasivos No Corrientes
  TOTAL PASIVO NO CORRIENTE

TOTAL PASIVO

PATRIMONIO
  Capital
  Reservas
  Resultados Acumulados
  Resultado del Ejercicio
  Diferencias de Conversión (OCI)
  Participación Minoritaria (NCI)
TOTAL PATRIMONIO

CUADRE: TOTAL ACTIVO - TOTAL PASIVO - TOTAL PATRIMONIO = 0
```

### 18.2 Estado de Resultados

```
INGRESOS OPERACIONALES

COSTO DE VENTAS / COSTO DIRECTO

MARGEN BRUTO
Margen Bruto %

Gastos de Administración y Ventas
  Gastos de Personal
  Gastos de Administración
  Otros Gastos Operacionales

EBITDA
Margen EBITDA %

Depreciación y Amortización

EBIT (Resultado Operacional)
Margen EBIT %

Resultado Financiero
  Ingresos Financieros
  Gastos Financieros (intereses)
  Diferencia de Cambio Neta

Resultado en JVs (participación IAS 28)

RESULTADO ANTES DE IMPUESTOS

Impuesto a la Renta (corriente + diferido)

RESULTADO NETO
Margen Neto %

Atribuible a:
  Controladora
  Participación Minoritaria (NCI)
```

### 18.3 Flujo de Efectivo (fase posterior)

Método indirecto. Requiere datos de movimientos del período — a diseñar cuando esté disponible B3 (granularidad Contec).

---

## 19. Real / Budget / PY / Forecast

### 19.1 Dimensiones

| Dimensión | Código | Fuente |
|---|---|---|
| Real | `R` | `acc_entry` aprobadas |
| Presupuesto Original | `B0` | `acc_budget_entry` tipo='budget', versión inicial |
| Presupuesto Revisado | `BR` | `acc_budget_entry` tipo='revised_budget' |
| Año Anterior | `PY` | `acc_entry` período N-12 |
| Forecast | `FC` | `acc_budget_entry` tipo='forecast' (rolling) |

### 19.2 acc_budget_entry

Misma estructura que `acc_entry` pero con:

```sql
CREATE TABLE acc_budget_entry (
  -- Mismos campos de empresa, periodo, reporting_account, moneda, valor
  -- Diferencias:
  tipo_ppto          TEXT NOT NULL,    -- 'budget'|'revised_budget'|'forecast'
  version_ppto       TEXT NOT NULL,    -- 'B2026-v1'|'FC2026-07'
  periodo_carga      TEXT NOT NULL,    -- cuándo se cargó este presupuesto
  cargado_por        TEXT NOT NULL,
  activo             BOOLEAN DEFAULT true
  -- el presupuesto vigente se determina por version_ppto + activo
);
```

### 19.3 Comparativos y análisis

| Métrica | Fórmula |
|---|---|
| Variación R vs B0 ($) | Real - Budget |
| Variación R vs B0 (%) | (Real - Budget) / \|Budget\| × 100 |
| Variación R vs PY ($) | Real - PY |
| Variación R vs PY (%) | (Real - PY) / \|PY\| × 100 |
| Margen (%) | Resultado / Ingresos × 100 |
| Variación de margen (pp) | Margen actual - Margen comparativo |
| Materialidad | \|Variación\| / \|Base\| > umbral configurable por línea |

### 19.4 Drivers operacionales (fase Management Intelligence)

Conexión futura con:
- Kg exportados (Allegria, Allpa)
- FCL / Contenedores (Frisku)
- Hectáreas (Integrity, Allpa)
- Plantas / royalties (Osiris)

Esto permite calcular: costo/kg, margen/ha, USD/FCL, etc. No implementar en esta etapa — requiere modelo de datos operacionales por empresa.

---

## 20. Riesgos y decisiones abiertas

### Riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| R1 | Contec exporta solo saldos, sin asientos | Alta | Alto — drill-down limitado | Declarar limitación en UI, no adaptar arquitectura |
| R2 | Plan de cuentas muy heterogéneo entre empresas | Media | Medio — mapping complejo | Invertir en COA canónico antes de cualquier mapping |
| R3 | Tasa USD-PEN no disponible en Currency Domain para períodos históricos | Alta | Medio — bloquea Allpa Perú | Carga manual retroactiva en Maestros TC |
| R4 | Datos históricos Allpa Chile/Perú incompletos | Media | Medio — equity method parcial | Definir fecha de inicio de la serie con Angelo |
| R5 | Performance de consolidación con N empresas y 65 meses | Baja | Medio — si se calcula en tiempo real | Usar snapshots; recalcular solo períodos abiertos |
| R6 | Supabase anon key expuesta (RLS pendiente) | Alta | Alto — seguridad datos financieros | Implementar RLS antes de cargar datos reales al dominio contable |

### Decisiones abiertas

| ID | Decisión | Opciones | Impacto si no se decide |
|---|---|---|---|
| D1 | Convención débito/crédito en acc_entry | Natural vs Saldo | Bloquea definición de cuadre y validaciones |
| D2 | ¿Granularidad de ingesta: saldos vs asientos? | Depende de B1/B3 | Impacta drill-down y flujo de efectivo |
| D3 | ¿Consolidación en tiempo real vs por trigger del CFO? | Tiempo real → costoso; Trigger → más simple | Impacta arquitectura del motor |
| D4 | ¿Motor de consolidación en Postgres (SQL) vs JS? | SQL → más portable; JS → más mantenible | Impacta dónde vive la lógica |
| D5 | ¿Fecha de inicio de la serie histórica? | Ej. 2024-01 vs 2025-01 | Impacta scope de carga inicial |
| D6 | ¿Cómo se autoriza el cierre de período? | PIN CFO vs aprobación en UI | Impacta flujo de aprobación |

---

## 21. ERD Conceptual

```
                ┌─────────────────────┐
                │   acc_company       │
                │ codigo, nombre,     │
                │ tipo_consolidacion  │
                └──────────┬──────────┘
                           │ 1:N
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼──────┐  ┌──────▼───────┐  ┌────▼────────────┐
│acc_import_batch│  │acc_period_   │  │acc_budget_entry  │
│empresa, periodo│  │lock          │  │empresa, periodo  │
│fuente, estado  │  │estado cierre │  │tipo_ppto, version│
└────────┬───────┘  └──────────────┘  └─────────────────┘
         │ 1:N
┌────────▼───────────────────────────────┐
│               acc_entry                 │
│  empresa, periodo, cuenta_origen        │
│  debito, credito, saldo                 │
│  moneda_transaccional                   │
│  fuente, import_batch_id                │
│  estado, version, reemplaza_a          │
└────────┬───────────────────────────────┘
         │ N:1
┌────────▼───────────────────────────────┐
│           acc_chart_mapping            │
│  empresa, cuenta_origen                │
│  reporting_account_id                  │
│  vigente_desde, vigente_hasta          │
└────────┬───────────────────────────────┘
         │ N:1
┌────────▼───────────────────────────────┐
│         acc_reporting_account          │
│  codigo, nombre, tipo                  │
└────────┬───────────────────────────────┘
         │ N:1
┌────────▼───────────────────────────────┐
│          acc_reporting_line            │
│  nombre, seccion, estado_financiero    │
│  orden, nivel                          │
└────────────────────────────────────────┘

                    │ (paralelo)
┌───────────────────▼────────────────────┐
│           acc_elimination              │
│  empresa_origen, empresa_contraparte   │
│  tipo_eliminacion, monto, estado       │
└────────────────────────────────────────┘

┌───────────────────────────────────────┐
│          acc_adjustment               │
│  empresa, reporting_account_id        │
│  tipo_ajuste, monto, aprobado_por     │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│      acc_consolidation_snapshot       │
│  periodo, version, estado='approved'  │
│  data JSONB (inmutable)               │
└───────────────────────────────────────┘

┌───────────────────────────────────────┐
│           acc_audit_log               │
│  tabla, registro_id, operacion        │
│  campo, valor_anterior, valor_nuevo   │
│  usuario, created_at                  │
└───────────────────────────────────────┘
```

---

## 22. Roadmap de implementación

### Etapa 0 — Prerequisitos (NO iniciar sin resolver)
- [ ] **B1**: Angelo entrega exportación real de Contec (formato, campos, granularidad)
- [ ] **B2**: Angelo entrega plan de cuentas de Allegria Foods (mínimo)
- [ ] **D1**: Decidir convención débito/crédito
- [ ] **D5**: Decidir fecha de inicio de la serie histórica
- [ ] **RLS**: Implementar RLS en Supabase antes de cargar datos financieros reales

### Etapa 1 — Infraestructura base
- Migración `004_accounting_domain.sql`: tablas `acc_company`, `acc_import_batch`, `acc_entry`, `acc_reporting_account`, `acc_reporting_line`, `acc_period_lock`, `acc_audit_log`
- Triggers de auditoría en tablas críticas
- 21 assertions de validación (mismo patrón que migración 003 de Currency)

### Etapa 2 — SourceAdapter / Ingesta
- `ExcelAdapter` (una vez disponible B4)
- `ContecAdapter` (una vez disponible B1)
- Pipeline de carga: parse → validate → transform → batch
- UI de carga de archivo por empresa/período

### Etapa 3 — AccountingProfile / Mapping
- Tablas `acc_chart_mapping`
- UI de gestión del COA canónico y mapeos
- Una vez disponible B2 (COA de Allegria)

### Etapa 4 — Validaciones
- Motor de validación: cuadre Activo=Pasivo+Patrimonio
- Validación de completitud por empresa/período
- Integración con `acc_period_lock`

### Etapa 5 — Consolidación
- Motor línea a línea
- `acc_elimination` UI y motor
- `acc_adjustment` UI y flujo de aprobación CFO
- NCI (Allegria Service y Frisku)

### Etapa 6 — Multimoneda / IAS 21
- Integración con Currency Domain OA-023 via `getExchangeRate()`
- Conversión balance (cierre) vs P&L (promedio)
- OCI / diferencias de conversión
- IAS 28 para Allpa Chile y Allpa Perú (una vez disponible B5)

### Etapa 7 — EEFF / Display
- Balance General
- Estado de Resultados
- Drill-down empresa → línea → cuenta → movimiento

### Etapa 8 — Budget / Forecast / Comparativos
- `acc_budget_entry`
- UI de carga de presupuesto anual
- Comparativos Real vs B0 vs PY vs FC
- Variaciones y materialidad

### Etapa 9 — Management Performance & Decision Intelligence
- Drivers operacionales (kg, FCL, ha, etc.)
- Ratios y tendencias
- Excepciones y alertas
- Dashboard CFO

---

## Información requerida desde Contec / Excel

Para determinar si la arquitectura puede producir correctamente EEFF, consolidación, comparativos, drill-down y auditoría, se necesita con prioridad antes de implementar:

### Desde Contec (BLOQUEANTE)
1. **Muestra real de exportación** — cualquier mes de 2025 o 2026 de Allegria Foods o Allegria Service
2. **Preguntas críticas sobre esa exportación:**
   - ¿Exporta saldos acumulados o movimientos (asientos) del período?
   - ¿Qué campos incluye? (código cuenta, descripción, centro de costo, auxiliar, débito, crédito, saldo)
   - ¿En qué formato? (Excel, CSV, XML, API)
   - ¿Puede exportar múltiples empresas en un solo archivo o es uno por empresa?
   - ¿El código de cuenta es único o puede repetirse con distinto significado en distintas empresas?
   - ¿Incluye saldo de apertura?

3. **Plan de cuentas completo** — listado de todas las cuentas con código y descripción

### Desde Excel (no bloqueante inmediato)
1. Template de carga mensual que Angelo tiene previsto
2. Confirmación de qué entidades deben cargar datos via Excel (Holding, Osiris, Integrity Farms, etc.)

### Sobre Allpa Chile y Perú
1. ¿Tienen sistema contable propio?
2. ¿En qué formato están disponibles sus EEFF?
3. ¿Desde qué período están disponibles los datos?

---

## Restricciones activas (OA-023-04)

- OA-023 Currency Domain: **CERRADO / STABLE**
- No abrir F2-B
- No scheduler productivo
- No writes automáticos a `currency_tc`
- El dominio contable consume Currency Domain mediante contrato — no duplica lógica de TC

---

*Próximo paso: revisión de este documento por Angelo → autorización explícita para iniciar Etapa 1 → Etapa 0 (prerequisitos) debe completarse primero.*

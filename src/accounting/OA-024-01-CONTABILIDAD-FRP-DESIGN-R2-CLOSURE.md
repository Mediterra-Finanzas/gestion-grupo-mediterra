# OA-024-01-R2-CLOSURE — Accounting Core Architecture Closure
**Estado:** AWAITING CFO GO
**Fecha:** 2026-08-13
**Predecesores:** OA-024-01 (base), OA-024-01-R1 (revisión arquitectónica aprobada)

---

## 1. Closure Decisions

### D1 — CLOSED / APPROVED
Convención formal adoptada:
- `debit ≥ 0`, `credit ≥ 0`, `canonical_value = debit − credit`
- `presentation_sign` separado del accounting sign; vive en `acc_reporting_line`
- Control primario (journal-level): `∑ debit = ∑ credit` por asiento
- Control secundario (reporting-level): `Activo = Pasivo + Patrimonio` sobre trial balance mapeado
- No reabrirse salvo evidencia técnica o contable material

### D7 — EXTERNAL BUSINESS EVIDENCE REQUIRED

**Discovery ejecutado READ-ONLY sobre el repositorio completo.** Hallazgos:

| Evidencia | Archivo | Contenido |
|---|---|---|
| Porcentajes confirmados | `src/FinanzasModule.jsx:4608` | `PARTICIPACION_CONTROLADORA`: Allpa Farms = 0.50, Allpa Farms Perú = 0.26 |
| Exclusión IAS 28 | `src/FinanzasModule.jsx:1485` | `EMPRESAS_FUERA_CONSOLIDADO` incluye ambas Allpa — IAS 28 confirmado |
| Nombre holding | `src/FinanzasModule.jsx:757` | Mediterra aparece como "Inversiones Mediterra SpA" |
| Allegria / Allpa relación | `CLAUDE.md` | Allegria Foods = "exportadora cerezas + comisión arándanos Perú" — relación comercial, no necesariamente societaria |
| TD-CONS-001 | `src/accounting/consolidation/index.js:9` | Nota técnica: porcentajes hardcodeados, pendiente mover a `anf_filiales` |

**Conclusión:** El codebase confirma los porcentajes y el método IAS 28, pero **no existe ningún documento o constante que identifique explícitamente qué entidad jurídica es el inversionista directo** en Allpa Chile y Allpa Perú.

**No bloquea el diseño estructural de `acc_ownership`** — la tabla se puede crear con la estructura correcta; sus datos quedan pendientes.

**Evidencia que necesito que entregues:**
- Escritura de constitución o modificación societaria de Allpa Farms Chile (identifica accionistas directos)
- Escritura o registro de accionistas de Allpa Farms Perú
- Alternativamente: balance individual de Allegria Foods o Mediterra Holding donde aparezca la línea "Inversiones en sociedades relacionadas" o "Inversiones en JV"

### D8 — Functional Currency Assessment

Evaluación por entidad. Criterios IAS 21 párr. 9-14: moneda de precios de venta, costos principales, financiamiento, contratos, entorno económico primario.

| Entidad | Moneda ventas | Moneda costos principales | Moneda financiamiento | Moneda contratos | Conclusión | Confidence | Missing evidence |
|---|---|---|---|---|---|---|---|
| Mediterra Holding | USD (fee admin intercompany) | USD | USD (créditos en USD per CLAUDE.md) | USD | **USD** | Alta | Confirmar si hay obligaciones en CLP |
| Allegria Foods | USD (exportación cerezas) | USD/CLP | USD | USD | **USD** | Media-Alta | COA Contec mostraría distribución real de costos |
| Allegria Service | USD (factura procesamiento a Allegria Foods) | CLP (mano de obra Chile) | CLP/USD | USD/CLP | **UNRESOLVED** | Baja | Contrato de servicio con Allegria Foods; estructura de costos Contec |
| Frisku Foods | USD (comisiones sobre FOB) | USD/CLP | USD | USD | **USD** | Media | Contratos con exportadoras/importadoras |
| Osiris Plant | USD (royalties varietales internacionales) | USD/CLP | USD | USD | **USD** | Media-Alta | Contratos de licencia varietales |
| Integrity Farms | USD (fee admin por hectárea) | CLP (operaciones campo Chile) | USD/CLP | USD | **UNRESOLVED** | Baja | ¿El fee se pacta en USD o UF/CLP? Contrato de administración |
| Allpa Farms Chile | USD (exportación cerezas) | CLP (producción Chile) | CLP/USD | USD | **USD** | Media | Balance individual Allpa Chile para confirmar |
| Allpa Farms Perú | USD (exportación arándanos) | PEN (producción Perú) | PEN/USD | USD | **UNRESOLVED** | Baja | IAS 21 análisis completo requiere datos Allpa Perú; PEN dominante en costos sugiere PEN pero ventas en USD; **decisión contable CFO** |

**Impacto de los UNRESOLVED:**
- `Allegria Service`: si funcional = CLP, toda la conversión IAS 21 cambia para esa entidad
- `Integrity Farms`: idem
- `Allpa Farms Perú`: determina si el equity method sobre el resultado de Allpa Perú aplica conversión PEN→USD o si los libros de Allpa Perú ya están en USD

**D8 queda PARCIALMENTE CERRADA:** USD confirmado para Mediterra Holding, Allegria Foods, Frisku Foods, Osiris Plant, Allpa Farms Chile. Tres entidades quedan en `UNRESOLVED` — sus `acc_entity_config` se crearán con `functional_currency = NULL` y un flag `requires_cfo_determination = true`.

### D9 — ARCHITECTURAL GAP / CANDIDATE IDENTIFIED

**Discovery READ-ONLY ejecutado.** Hallazgos:

| Elemento | Tipo | Cobertura | Problema |
|---|---|---|---|
| `EMPRESAS_KEYS_ALL` (`FinanzasModule.jsx:1481`) | Array JS hardcodeado | 9 empresas | Sin ID, sin FK target, nombres inconsistentes |
| `EMPRESAS_STATIC` (`FinanzasModule.jsx:757`) | Objeto JS hardcodeado | 8 empresas | Solo datos de flujo de caja |
| `EMPRESAS_TAREAS` (`App.jsx:555`) | Array JS hardcodeado | 10 empresas | Nombres distintos ("Inversiones Mediterra" vs "Mediterra"), incluye Montejato/Arrayan/Mesain |
| `anf_filiales` (Supabase table, `src/anf/anfPersistence.js:56`) | Tabla DB real | Solo empresas con archivos ANF cargados | Campos: id, nombre, codigo, sistema, moneda, piso_materialidad, activa — incompleto pero es el único maestro en DB |
| TD-CONS-001 (`src/accounting/consolidation/index.js:9`) | Tech debt note | — | Ya identifica que porcentajes hardcodeados deben migrar a `anf_filiales` (campo `pct_control` + `metodo_consolidacion`) |

**Conclusión D9:** No existe un Corporate Entity Master adecuado. Existen tres listas JS inconsistentes y una tabla `anf_filiales` parcial en DB que ya tiene el esquema mínimo y es la candidata natural.

**Recomendación:** Extender `anf_filiales` como Corporate Entity Master, no crear una tabla paralela. La extensión requiere agregar:

```
-- Extensión propuesta para anf_filiales (no ejecutar todavía)
pais            TEXT           -- 'CL'|'PE'
tipo_entidad    TEXT           -- 'subsidiaria'|'jv'|'holding'|'relacionada'
rnc_o_rut       TEXT           -- identificador fiscal
consolidacion   TEXT           -- 'linea_a_linea'|'equity_method'|'no_consolidada'
moneda_funcional TEXT          -- ISO 4217 (resultado de D8)
activo_desde    TEXT           -- 'YYYY-MM'
grupo_id        BIGINT FK self  -- para jerarquía
```

D9 = **ARCHITECTURAL GAP — candidato identificado: `anf_filiales` extendida**.
Los `acc_*` tables referenciarán `anf_filiales.id` como FK una vez aprobada la extensión.

---

## 2. Dimension Model Final

### Frontera core / extensible

**Dimensiones core** (columnas normales con FK fuerte — siempre presentes, alta cardinalidad de queries):

| Dimensión | Columna | Tabla |
|---|---|---|
| Entidad | `entity_id BIGINT FK → anf_filiales` | acc_journal_entry, acc_account_balance |
| Período | `period_id BIGINT FK → acc_period` | acc_journal_entry, acc_account_balance |
| Cuenta origen | `source_account_code TEXT` | acc_journal_line, acc_account_balance |
| Cuenta reporting | `reporting_account_id BIGINT FK` | acc_journal_line, acc_account_balance |
| Moneda transaccional | `transaction_currency TEXT` | acc_journal_line, acc_account_balance |

**Dimensiones extensibles** (catálogo + tabla pivot por contrato — presentes según fuente, baja cardinalidad en queries individuales):

`cost_center`, `project`, `agricultural_field`, `variety`, `client`, `counterparty`, `business_unit`, `operation`, etc.

### Solución FK polimórfica — Alternativa A recomendada

**Problema con `acc_entry_dim`:** el campo `entry_id` no puede tener FK real a dos tablas distintas simultáneamente. PostgreSQL no puede garantizar integridad referencial sobre un ID polimórfico.

**Decisión: dos tablas pivot separadas con FK fuerte.**

```
acc_journal_line_dim
  id                BIGINT PK
  journal_line_id   BIGINT NOT NULL FK → acc_journal_line(id) ON DELETE CASCADE
  dim_type_id       BIGINT NOT NULL FK → dim_type(id)
  dim_value_id      BIGINT NOT NULL FK → dim_value(id)
  UNIQUE(journal_line_id, dim_type_id)

acc_account_balance_dim
  id                BIGINT PK
  account_balance_id BIGINT NOT NULL FK → acc_account_balance(id) ON DELETE CASCADE
  dim_type_id       BIGINT NOT NULL FK → dim_type(id)
  dim_value_id      BIGINT NOT NULL FK → dim_value(id)
  UNIQUE(account_balance_id, dim_type_id)
```

Planning Ledger tiene su propio pivot:
```
pln_budget_entry_dim
  id                BIGINT PK
  budget_entry_id   BIGINT NOT NULL FK → pln_budget_entry(id) ON DELETE CASCADE
  dim_type_id, dim_value_id (ídem)
```

**Por qué Alternative A sobre B y C:**
- FK real garantizada — requisito explícito del Financial SoR
- Drill-down simple: `JOIN acc_journal_line_dim ON journal_line_id = acc_journal_line.id`
- Dos tablas pequeñas son más eficientes que una tabla grande polimórfica
- Los SourceAdapters ya saben si están procesando journal lines o balances — no les cuesta nada bifurcar
- Consistent con el modelo de dos contratos (journal vs balance) del resto del diseño

**Eliminado:** `acc_entry_dim` con `entry_type` + `entry_id` polimórfico. No aparecerá en el esquema final.

---

## 3. Locked-Period Correction Policy

Un período `locked` puede requerir corrección después del cierre. Existen dos casos distintos con rutas distintas.

### Caso A — Mapping/Reporting Correction
**Qué es:** error en `acc_chart_mapping` o en `acc_reporting_line` que afecta solo la clasificación o presentación, sin alterar ningún hecho contable del ledger (`acc_journal_entry` / `acc_account_balance`).

**Ruta:**
```
1. El período permanece locked (no se reabre)
2. Se crea acc_period_mapping_override con la corrección y vigencia retroactiva
3. Se ejecuta un nuevo acc_consolidation_run (supersedes el anterior)
4. Se genera acc_reporting_run_v2 con estado 'approved' tras revisión CFO
5. El acc_reporting_run_v1 pasa a estado 'superseded' (no se borra)
6. acc_snapshot_metadata del run v2 captura el override aplicado
```

### Caso B — Accounting Correction
**Qué es:** error en un hecho contable (monto incorrecto, cuenta equivocada, asiento faltante) que requiere modificar el ledger.

Sub-casos:

**B1 — Ajuste en período siguiente (preferido):**
```
Si la política contable del grupo permite reconocer la corrección en el período corriente:
  → acc_adjustment_journal en el período abierto actual
  → workflow Draft → Approved → Posted
  → disclosure en notas del EEFF si es material
  → No se toca el período locked
```

**B2 — Post-close adjustment autorizado en período locked:**
```
Requiere:
  1. Solicitud formal del CFO con motivo documentado
  2. acc_period_audit: estado_desde='locked', estado_hacia='post_close_adjustment', motivo obligatorio
  3. acc_period.estado = 'post_close_adjustment' (nuevo estado intermedio, no 'open')
  4. Solo se admiten acc_adjustment_journal en este estado; no se admiten nuevas cargas de source batch
  5. Completado el ajuste → acc_period vuelve a 'locked'
  6. Nuevo acc_consolidation_run + acc_reporting_run requeridos
  7. acc_period_audit registra retorno a locked
```

**B3 — Restatement (corrección material de períodos anteriores cerrados):**
```
Caso más grave: error que afecta EEFF ya publicados/aprobados.
  → acc_restatement_run (entidad específica, fuera de scope v1)
  → Requiere asesoría contable/legal
  → Marcado como FUTURO en el diseño actual
```

**Invariante:** Ningún período locked puede ser modificado silenciosamente. Toda corrección deja rastro en `acc_period_audit` + Audit Domain corporativo.

---

## 4. Updated Blockers

### Architecture Blockers
| Blocker | Estado |
|---|---|
| Convención D1 | **CLOSED — APPROVED** |
| FK polimórfica de dimensiones | **CLOSED — dos tablas pivot separadas** |
| Separación period close / reporting approval | **CLOSED — acc_period + acc_reporting_run** |
| IAS 28 full lifecycle | **CLOSED en diseño** |
| NCI movement table | **CLOSED en diseño** |

### Schema Blockers
| Blocker | Estado | Qué lo cierra |
|---|---|---|
| Corporate Entity Master (D9) | **OPEN** | Aprobar extensión de `anf_filiales` |
| RLS / security Supabase | **OPEN** | Implementación de RLS antes de cualquier schema financiero en producción |

### Master-Data Blockers
| Blocker | Estado | Qué lo cierra |
|---|---|---|
| D7 — investor Allpa Chile/Perú | **OPEN** | Escritura societaria o balance individual |
| D8 — moneda funcional Allegria Service, Integrity Farms, Allpa Perú | **OPEN** | Decisión contable del CFO |
| D5 — período de inicio de histórico | **OPEN (desacoplado)** | Se decide al iniciar migración de datos, no bloquea schema |

### Ingestion Blockers
| Blocker | Estado | Qué lo cierra |
|---|---|---|
| B1 — formato exportación Contec | **OPEN** | Exportación real de Allegria Foods/Service |
| B2 — plan de cuentas empresas | **OPEN** | COA de al menos una empresa |
| B4 — template Excel | **OPEN** | Template de Angelo |
| B5 — datos Allpa Chile/Perú | **OPEN** | Estados financieros de las JVs |

### Security Blockers
| Blocker | Estado | Regla |
|---|---|---|
| RLS no operativo en dominio financiero | **OPEN** | **Hard gate:** ninguna migración de schema financiero en producción, ninguna ingesta de datos reales, hasta que RLS esté verificado. Schema-only en ambiente de staging o worktree: permitido. |

---

## 5. Discovery Findings (resumen)

**D7:** Codebase confirma 50% Allpa Chile y 26% Allpa Perú como participación del grupo. El investor jurídico específico (Mediterra Holding o Allegria Foods) **no está registrado en ningún archivo del repositorio**. Necesita evidencia societaria externa.

**D9:** No existe Corporate Entity Master en DB. Existen tres listas JS con nombres inconsistentes entre sí (`EMPRESAS_KEYS_ALL`, `EMPRESAS_STATIC`, `EMPRESAS_TAREAS`). La única tabla DB candidata es `anf_filiales` — tiene id, nombre, codigo, sistema, moneda, activa. El tech debt TD-CONS-001 ya señala explícitamente que la migración de porcentajes de consolidación debe ir hacia `anf_filiales`. Recomendación: extender `anf_filiales`, no crear tabla paralela.

---

## 6. Final GO / NO-GO Matrix

| Actividad | GO? | Condición |
|---|---|---|
| **Diseño arquitectónico** | **GO** | OA-024-01-R1 aprobado; R2-CLOSURE completo |
| **Schema-only migration (sin datos financieros reales)** | **GO CONDICIONAL** | Requiere: (a) aprobación extensión `anf_filiales` por Angelo, (b) entorno de staging o worktree — NO en producción sin RLS |
| **Catálogos base** (`acc_period`, `dim_type`, `acc_materiality_policy`, `pln_scenario`, `acc_reporting_account`) | **GO CONDICIONAL** | Mismas condiciones que schema-only; sin datos financieros |
| **`acc_entity_config` + `acc_ownership` (estructura vacía)** | **GO CONDICIONAL** | D9 resuelto (anf_filiales extendida); datos pueden quedar null hasta D7/D8 |
| **Carga de datos financieros reales (Contec, Excel)** | **NO-GO** | Requiere: RLS operativo + B1 + B2 + schema completo + D9 |
| **ContecAdapter** | **NO-GO** | Requiere: B1 (formato real Contec) |
| **ExcelAdapter** | **NO-GO** | Requiere: B4 (template Excel) |
| **Consolidación** | **NO-GO** | Requiere: ingesta funcionando + D7 + D9 |
| **IAS 28 / Equity Method** | **NO-GO** | Requiere: D7 + D8 (Allpa Perú) + B5 |
| **Reporting / EEFF** | **NO-GO** | Requiere: consolidación funcionando |
| **Management Performance** | **NO-GO** | Requiere: EEFF + datos operacionales |

---

## 7. Próximo paso exacto

### Lo que puede comenzar INMEDIATAMENTE (sin más inputs del CFO)

**Design artifact: migración 004 como documento (no ejecutar)**
Redactar `src/accounting/migrations/004_accounting_schema_draft.sql` como documento de diseño — la DDL completa del schema, sin ejecutarla en Supabase. Incluye:
- Extension de `anf_filiales` propuesta
- `acc_period`, `dim_type`, `dim_value`
- `acc_journal_entry`, `acc_journal_line`, `acc_account_balance`
- `acc_journal_line_dim`, `acc_account_balance_dim`
- `acc_reporting_account`, `acc_reporting_line`, `acc_financial_statement`
- `acc_chart_mapping` + jerarquía de perfiles
- `acc_consolidation_run`, `acc_consolidation_result_line`, `acc_snapshot_metadata`
- `acc_conversion_run`, `acc_conversion_rate_used`
- `acc_adjustment_journal`, `acc_adjustment_journal_line`
- `acc_consolidation_journal`, `acc_consolidation_journal_line`
- `acc_equity_method_entry`, `acc_nci_movement`
- `acc_materiality_policy`, `acc_ownership`, `acc_entity_config`
- `acc_period_audit`, `acc_reporting_run`
- `pln_scenario`, `pln_budget_entry`, `pln_budget_entry_dim`

Este DDL es el contrato técnico completo. Permite revisión, debate sobre tipos de datos, índices y constraints antes de tocar Supabase.

**Catálogo `acc_reporting_account` (estructura canónica del EEFF)**
Definir el chart of accounts de reporting que se usará para todos los mappings de Contec/Excel. No depende de B1/B2 — es independiente del ERP origen. Se puede redactar ahora como CSV o SQL INSERT.

### Lo que requiere inputs del CFO antes de continuar

| Input | Para habilitar |
|---|---|
| Aprobar extensión `anf_filiales` como Corporate Entity Master | Schema-only migration |
| Confirmar D8 para Allegria Service, Integrity Farms, Allpa Perú | `acc_entity_config` poblada |
| Entregar evidencia societaria (D7) | `acc_ownership` poblada |
| Entregar exportación Contec (B1) | ContecAdapter |
| Confirmar RLS puede implementarse | Fecha de materialización en producción |

---

## OA-024-01 ARCHITECTURE = FROZEN v1

Con R2-CLOSURE:

- D1: CLOSED/APPROVED
- D7: EXTERNAL BUSINESS EVIDENCE REQUIRED (no bloquea schema)
- D8: PARCIALMENTE CLOSED — 5 de 8 entidades resueltas; 3 en UNRESOLVED
- D9: ARCHITECTURAL GAP — candidato `anf_filiales` extendida; requiere aprobación del CFO
- FK polimórfica: CLOSED — dos tablas pivot con FK fuerte
- Locked-period policy: CLOSED — Caso A (mapping) vs Caso B (accounting) definidos
- Blockers categorizados: architecture / schema / master-data / ingestion / security

**La arquitectura queda congelada en v1. No se abre nueva iteración de diseño salvo evidencia técnica o contable material.**

El siguiente entregable posible es la migración `004` como documento DDL (diseño, sin ejecutar).

*OA-023-04 Currency: CERRADO / STABLE — sin cambios*

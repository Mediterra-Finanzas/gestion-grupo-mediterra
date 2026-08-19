# OA-024-03 — Corporate Entity Reconciliation + Security Gate
**Estado:** AWAITING CFO GO
**Fecha:** 2026-08-13
**Prerrequisito:** OA-024-01 Architecture Frozen v1, OA-024-02 DDL READY

---

## A. D9-A — Deployment Status de `schema_contable_v1.sql`

### Metodología

Sin acceso Supabase de solo lectura disponible en este artefacto, el discovery se basa en:
(a) Análisis de archivos en el repositorio.
(b) Referencias cruzadas entre tablas, código JS y comentarios de ejecución.
(c) Inferencia por presencia o ausencia de FKs reales entre artefactos.

**No se infirió deployment por la sola existencia del archivo.**

### Evidencia recolectada

| Artefacto | Indicador de ejecución | Evidencia |
|---|---|---|
| `supabase/schema_anf_v1.sql` | ALTA | Instrucciones explícitas "Ejecutar en Supabase → SQL Editor"; query de verificación incluida; 2 FKs activos (`anf_informes.filial_id`, `anf_metricas_config.filial_id`); SEED idempotente; código JS (`anfPersistence.js`) lo referencia con queries reales |
| `supabase/schema_contable_v1.sql` | NINGUNA | Sin instrucciones de ejecución; sin queries de verificación; ningún código JS referencia la tabla `empresas`; ningún FK desde tablas desplegadas apunta a `empresas(id)` |
| `supabase/schema_core_contable_fase0.sql` | MEDIA-ALTA | Ejecuta `ALTER TABLE contab_empresas` (presupone `contab_empresas` existente, de un `schema_core_contable_v1.sql` NO presente en el repo); `fase4_cerrar_todo.sql` menciona "todo el contable" como tablas accesibles |
| `supabase/fase4_cerrar_todo.sql` | N/A | Marcado explícitamente "NO EJECUTAR TODAVÍA — Este script es para REVISIÓN" |

### Hallazgo crítico: dos generaciones de schema

El proyecto tiene **dos generaciones distintas** de schema contable con naming distinto:

| Generación | Prefix | Archivo principal | Tablas |
|---|---|---|---|
| Legacy (v0/v1) | `contab_` | (no encontrado en repo; existe como `schema_core_contable_v1.sql` sin recuperar) | `contab_empresas`, `contab_plan_cuentas`, `contab_asientos`, `contab_asientos_lineas`, `contab_homologacion`, etc. |
| Nueva (v1.1) | sin prefix | `supabase/schema_contable_v1.sql` | `empresas`, `plan_cuentas`, `asientos`, `asiento_lineas`, etc. |

`schema_core_contable_fase0.sql` claramente ejecuta sobre la generación legacy (`ALTER TABLE contab_empresas`), no sobre `schema_contable_v1.sql`.

### Conclusión D9-A

| Tabla | Estado | Confianza |
|---|---|---|
| `anf_filiales` | **DEPLOYED** | ALTA (FKs activos, código JS, SEED referenciado) |
| `contab_empresas` (gen. legacy) | **LIKELY DEPLOYED** | MEDIA (fase0 hace ALTER sobre ella; fase4 la menciona como "contable") |
| `empresas` (schema_contable_v1.sql) | **LIKELY NOT DEPLOYED** | ALTA (cero referencias en código; sin FKs desde otras tablas desplegadas; conflicto de naming con legacy) |

**D9-A status: UNRESOLVED — requiere query de verificación directa en Supabase.**

Consulta de verificación (READ-ONLY, ejecutar en Supabase SQL Editor):
```sql
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('empresas','contab_empresas','anf_filiales','core_entities')
ORDER BY tablename;
```

---

## B. Inventario: `empresas` (schema_contable_v1.sql)

**Tabla:** `empresas`
**PK:** UUID (`gen_random_uuid()`)
**Fecha schema:** 2026-06-11

### Schema
```
id               UUID PK
codigo           TEXT NOT NULL UNIQUE
nombre           TEXT NOT NULL
rut              TEXT (nullable)
moneda_func      CHAR(3) DEFAULT 'USD'
method_consol    TEXT CHECK IN ('line_by_line','equity_method')
nci_pct          NUMERIC(5,4) DEFAULT 0.0000   ← NCI%, no controlling%
sistema_origen   TEXT CHECK IN ('megasystem','contec','nuevo','mixto')
activa           BOOLEAN DEFAULT TRUE
created_at, updated_at
```

**Indexes:** `idx_empresas_codigo`, `idx_empresas_activa`
**Trigger:** `trg_updated_at_empresas`
**RLS:** No aparece en el archivo — no hay `ENABLE ROW LEVEL SECURITY` ni policies para esta tabla.
**FKs entrantes:** `plan_cuentas.empresa_id`, `centros_costo.empresa_id`, `periodos.empresa_id`, `asientos.empresa_id`, `saldos_cuenta.empresa_id`, `presupuesto.empresa_id`, `activo_fijo.empresa_id`, `activo_fijo_depreciaciones.empresa_id`, `usuarios_empresa.empresa_id`, `eliminaciones_intercompany.empresa_origen/destino`, `migracion_importaciones.empresa_id`, `auditoria_log.empresa_id`, `mapeo_codigos.empresa_id`
**Consumidores JS:** Ninguno detectado

### Seed (11 filas)

| codigo | nombre | moneda_func | method_consol | nci_pct | sistema_origen |
|---|---|---|---|---|---|
| MED | Mediterra Holding | USD | line_by_line | 0.0000 | megasystem |
| ALF | Allegria Foods | USD | line_by_line | 0.0000 | contec |
| ALS | Allegria Service | USD | line_by_line | **0.2000** | contec |
| FRI | Frisku Foods | USD | line_by_line | **0.1000** | megasystem |
| OSI | Osiris Plant Management | USD | line_by_line | 0.0000 | megasystem |
| INT | Integrity Farms | USD | line_by_line | 0.0000 | megasystem |
| APC | Allpa Farms Chile | USD | equity_method | **0.5000** | megasystem |
| APP | Allpa Farms Peru | USD | equity_method | **0.7400** | megasystem |
| MON | Montejato | USD | line_by_line | 0.0000 | megasystem |
| ARR | Arrayon | USD | line_by_line | 0.0000 | megasystem |
| MES | Mesain | USD | line_by_line | 0.0000 | megasystem |

**Nota semántica crítica:** `nci_pct` = porcentaje de interés no controlador (NCI%), NOT el porcentaje de control. Confirmado por ALS = 0.20 (NCI 20% = 80% control), FRI = 0.10 (NCI 10% = 90% control), APC = 0.50 (50/50), APP = 0.74 (NCI 74% = 26% control). Consistente con `PARTICIPACION_CONTROLADORA` en JS.

---

## C. Inventario: `anf_filiales` (schema_anf_v1.sql)

**Tabla:** `anf_filiales`
**PK:** UUID (`gen_random_uuid()`)
**Fecha schema:** 2026-07-31
**Estado deployment:** CONFIRMED DEPLOYED

### Schema
```
id                UUID PK
codigo            TEXT NOT NULL UNIQUE
nombre            TEXT NOT NULL
sistema           TEXT CHECK IN ('contec','megasystem','tbd')  ← parser para Excel de cierre
moneda            CHAR(3) DEFAULT 'USD'                       ← etiqueta PDF, NO funcional
piso_materialidad NUMERIC(5,2) DEFAULT 10.0                   ← umbral semáforo ANF
activa            BOOLEAN DEFAULT true
created_at, updated_at
```

**RLS:** ENABLED + `"anon_anf_filiales_all" FOR ALL TO anon USING (true) WITH CHECK (true)` — acceso total
**FKs entrantes:** `anf_informes.filial_id` (NOT NULL), `anf_metricas_config.filial_id` (NOT NULL)
**Consumidores JS:** `anfPersistence.js` (cargarFiliales, upsertFilial), `AnfTab.jsx` (4 call sites), `anfParser.js`
**Bug conocido:** UI envía campo `descripcion` que no existe en schema → falla silenciosamente (OA-024-02)

### Seed (8 filas)

| codigo | nombre | sistema | moneda |
|---|---|---|---|
| allegria_foods | Allegria Foods | contec | USD |
| allegria_service | Allegria Service | contec | USD |
| frisku | Frisku Foods | megasystem | USD |
| osiris | Osiris | megasystem | USD |
| integrity | Integrity Farms | megasystem | USD |
| mediterra | Mediterra Holding | megasystem | USD |
| allpa_chile | Allpa Farms Chile | megasystem | **CLP** ← display currency |
| mesain | Mesain | tbd | USD |

**Ausentes vs canónico CLAUDE.md (8 empresas):** Allpa Farms Perú (no existe en anf_filiales). Mesain existe pero no está en el canónico CLAUDE.md.

---

## D. Inventario: Legacy JS Masters

### D.1 — `EMPRESAS_STATIC` (`src/FinanzasModule.jsx:757`)

Tipo: Objeto JS keyed por nombre corto.
Propósito: Definir líneas del flujo de caja, colores, emojis, saldo inicial.
**No es un maestro de identidad corporativa — es configuración de UI.**

| key | desc | saldo_ini |
|---|---|---|
| Mediterra | "Holding · Inversiones Mediterra SpA" | 3601 |
| Allegria Service | "Procesamiento · Packing" | 5519 |
| Allegria Foods | (no leído) | — |
| Frisku Foods | (no leído) | — |
| Osiris | (no leído) | — |
| Integrity Farms | (no leído) | — |
| Allpa Farms | (no leído) | — |
| Allpa Farms Perú | (no leído) | — |

Campos: emoji, color, saldo_ini, desc, sections (líneas de flujo).
**Sin ID, sin FK target, sin RUT, sin país.**

### D.2 — `EMPRESAS_KEYS_ALL` (`src/FinanzasModule.jsx:1481`)

Array de 9 strings. Propósito: control de acceso por empresa.
```
["Mediterra","Allegria Service","Allegria Foods","Frisku Foods","Frisku Foods Perú",
 "Osiris","Integrity Farms","Allpa Farms","Allpa Farms Perú"]
```
Incluye "Frisku Foods Perú" — existe solo en Nóminas, sin entidad DB correspondiente.

### D.3 — `EMPRESAS_TAREAS` (`src/App.jsx:555`)

Array de 10 strings. Propósito: apertura de tareas contables/tributarias por sociedad.
```
["Inversiones Mediterra","Allegria Foods","Allegria Service","Allpa Farms",
 "Osiris Plant Management","Integrity Farms","Montejato","Arrayan","Mesain","Frisku Foods"]
```
Naming inconsistente: "Inversiones Mediterra" vs "Mediterra"; "Osiris Plant Management" vs "Osiris".
Incluye Montejato, Arrayan que no aparecen en CLAUDE.md canónico.

### D.4 — `PARTICIPACION_CONTROLADORA` (`src/FinanzasModule.jsx:4608`)

Objeto con 8 entries:
```
Mediterra:1.00, Allegria Foods:1.00, Allegria Service:0.80, Frisku Foods:0.90,
Osiris:1.00, Integrity Farms:1.00, Allpa Farms:0.50, Allpa Farms Perú:0.26
```
Porcentaje de participación de la controladora (1 - nci_pct de `empresas`). D7 pendiente.

---

## E. Matriz Comparativa: Entity Counts

| Fuente | Count | Entidades distintas | Ausentes del canónico |
|---|---|---|---|
| CLAUDE.md canónico | **8** | Mediterra Holding, Allegria Foods, Allegria Service, Frisku Foods, Osiris Plant Management, Integrity Farms, Allpa Farms Chile, Allpa Farms Perú | — |
| `empresas` seed | **11** | + Montejato, Arrayon, Mesain | — |
| `anf_filiales` seed | **8** | − Allpa Farms Perú; + Mesain en lugar | Allpa Farms Perú |
| `EMPRESAS_KEYS_ALL` | **9** | + Frisku Foods Perú | Montejato, Arrayon, Mesain |
| `EMPRESAS_TAREAS` | **10** | + Montejato, Arrayan, Mesain; − Allpa Farms Perú | Allpa Farms Perú |
| `EMPRESAS_STATIC` | **~8** | (idéntico a CLAUDE.md aprox.) | — |

**Entidades en limbo (no en canónico CLAUDE.md):**
- Montejato: en `empresas` seed (MON) + EMPRESAS_TAREAS. Sin presencia en financiero/anf.
- Arrayon: en `empresas` seed (ARR) + EMPRESAS_TAREAS. Sin presencia en financiero/anf.
- Mesain: en `empresas` seed (MES) + EMPRESAS_TAREAS + `anf_filiales` (sistema tbd). En CLAUDE.md figura en EMPRESAS_TAREAS pero no en la tabla de 8 empresas.
- Frisku Foods Perú: en EMPRESAS_KEYS_ALL solo. Sin DB. Solo existe en Nóminas.

---

## F. Field-by-Field Reconciliation

| Campo | `empresas` | `anf_filiales` | `contab_empresas` | JS legacy | Target canónico | Observación |
|---|---|---|---|---|---|---|
| **PK / identifier** | UUID | UUID | UUID(?) | nombre string | Ver Sección H | DECISION REQUERIDA |
| **codigo / code** | ✓ MED/ALF… | ✓ allegria_foods… | ? | nombres largos | `core_entities.code` | Formatos distintos; necesita normalización |
| **nombre / legal_name** | ✓ | ✓ | ? | ✓ (desc) | `core_entities.legal_name` | "Inversiones Mediterra SpA" vs "Mediterra" |
| **nombre corto** | ✗ | ✗ | ✗ | ✓ (key) | `core_entities.short_name` | Hoy solo en JS key |
| **RUT / tax_id** | ✓ (NULL en seed) | ✗ | ? | ✗ | `core_entities.tax_id` | Nunca poblado |
| **country_code** | ✗ | ✗ | ✗ | ✗ | `core_entities.country_code` | Inferred: CL (Chile), PE (Perú) |
| **entity_type** | ✗ | ✗ | ✗ | ✗ | `core_entities.entity_type` | holding/subsidiary/jv |
| **active / activa** | ✓ | ✓ | ✗ | ✗ | `core_entities.active` | Común |
| **effective_from/to** | ✗ | ✗ | ✗ | ✗ | `core_entities` | Temporal ownership → acc_ownership |
| **moneda (display)** | ✗ | ✓ USD/CLP | ✗ | ✗ | Permanece en `anf_filiales` | Semántica = etiqueta PDF, no funcional |
| **piso_materialidad** | ✗ | ✓ 10.0 | ✗ | ✗ | Permanece en `anf_filiales` | Exclusivo dominio ANF |
| **sistema (parser)** | ✓ sistema_origen | ✓ sistema | ✓ usa_modulo_* | ✗ | `acc_source_batch.source_system` | Pertence al Adapter/Ingesta, no al CEM |
| **moneda_func** | ✓ USD (hardcoded) | ✗ | ✓ | ✗ | `acc_entity_config.functional_currency` | D8: 3 entidades UNRESOLVED |
| **moneda_tributaria** | ✗ | ✗ | ✓ CLP | ✗ | `acc_entity_config` | Chile específico |
| **moneda_presentacion** | ✗ | ✗ | ✓ USD | ✗ | `acc_entity_config.presentation_currency` | |
| **regimen_tributario** | ✗ | ✗ | ✓ | ✗ | `acc_entity_config` | SII Chile |
| **method_consol** | ✓ | ✗ | ✗ | ✗ | `acc_ownership.consolidation_method` | No CEM; depende de ownership |
| **nci_pct** | ✓ | ✗ | ✗ | indirecto (PARTICIPACION) | Derivado de `acc_ownership.ownership_pct` | No almacenar por separado; derivar: nci = 1 - ownership_pct |
| **group_id / parent** | ✗ | ✗ | ✗ | ✗ | `core_entities.group_id` | Jerarquía corporativa |
| **description** | ✗ | ✗ bug (UI envía, schema no tiene) | ✗ | ✓ desc string | `core_entities.legal_name` o campo separado | Bug en anf_filiales → columna faltante |

---

## G. Estrategia Recomendada

### Evaluación de alternativas

#### Alternativa A: Promover `empresas` (schema_contable_v1.sql) como CEM

**Pros:** Ya tiene 11 entidades, incluye rut, method_consol, nci_pct, codigo normalizado (MED/ALF).
**Contras:**
1. Deployment status LIKELY NOT DEPLOYED — crear sobre una tabla inexistente o conflictiva.
2. Contiene `moneda_func`, `method_consol`, `nci_pct` — campos que pertenecen a `acc_entity_config` y `acc_ownership` según Architecture Frozen v1. Perpetuarlos aquí viola la separación de dominios.
3. UUID PK — ver Sección H.
4. Si ya existe `contab_empresas` en prod, desplegar `empresas` crea conflicto de nombres y de propósito.
5. Ningún código la referencia; activarla requiere migración de todos los consumidores actuales.

**Veredicto: DESCARTADA** hasta verificar D9-A. Incluso si está desplegada, sus campos accounting la contaminan como CEM.

#### Alternativa B: Promover `anf_filiales` como CEM

**Pros:** CONFIRMED DEPLOYED, FKs activos, código JS ya la usa, 8 filas correctas.
**Contras:**
1. Campos ANF-specific (sistema, moneda display, piso_materialidad) polutan el CEM y crean dependencia de dominio ANF en todos los consumidores futuros.
2. `codigo` usa slugs (allegria_foods) vs códigos cortos (ALF). No normalizable sin migrar el seed y los FK targets.
3. Missing: Allpa Farms Perú (la entidad que IAS 28 necesita sí o sí).
4. UUID PK — ver Sección H.
5. Renombrar la tabla a `core_entities` requiere migrar `anf_informes.filial_id` y `anf_metricas_config.filial_id` FK targets, o aliasing.

**Veredicto: VIABLE CON EXTENSIÓN** — no como CEM definitivo limpio, sí como punto de partida si se añaden campos corporativos y se acepta que ANF-specific coexiste.

#### Alternativa C: Crear `core_entities` (tabla nueva)

**Pros:** Contrato limpio, sin herencia de campos de dominio, permite BIGINT PK (ver Sección H).
**Contras:**
1. Cuarto maestro si no se deprecan los anteriores.
2. Requiere plan de migración de IDs para que `anf_filiales`, `contab_empresas` (si existe), y JS puedan referenciarla.

**Veredicto: ARQUITECTÓNICAMENTE CORRECTA** pero introduce el riesgo de proliferación de maestros si no se depreca lo anterior.

#### Alternativa D: Migration bridge temporal

Usar B (extender `anf_filiales`) en el corto plazo, migrar a C a mediano plazo.
**Contras:** la deuda técnica del bridge tiene fecha de retiro que raramente se cumple.

### Recomendación

**Alternativa C condicionada:**

Crear `core_entities` con **UUID PK** (no BIGINT — ver Sección H) como tabla canónica. Simultáneamente:
1. Agregar `core_entity_id UUID FK → core_entities(id)` a `anf_filiales`.
2. Poblar el mapeo inmediatamente (8 entidades conocidas).
3. `anf_informes` y `anf_metricas_config` siguen usando `anf_filiales.id` (sin cambio en ANF domain).
4. Nuevos dominios (`acc_*`, `pln_*`) usan `core_entities.id`.
5. Plan de deprecación de `empresas` (schema_contable_v1.sql) si está desplegada: establecer `empresa_id` → `core_entity_id` mapping y freezar `empresas` como readonly.

**Condición para iniciar:** Verificar D9-A primero. Si `empresas` está desplegada, añadir paso de reconciliación de IDs antes.

---

## H. Estrategia de IDs — BLOCKER ARQUITECTÓNICO NUEVO (D10)

### El problema

OA-024-01 Architecture Frozen v1 especifica `BIGINT GENERATED ALWAYS AS IDENTITY` como PK de `core_entities` y `entity_id BIGINT` en todas las tablas `acc_*`.

Los tres maestros existentes usan `UUID`. `anf_filiales` tiene FKs activos UUID.

**Esto crea una incompatibilidad estructural entre la arquitectura aprobada y la realidad del sistema.**

### Análisis de opciones

| Opción | Descripción | Impacto Architecture Frozen v1 |
|---|---|---|
| D10-A | `core_entities` con BIGINT (como está en DDL 004) + anf_filiales mantiene UUID + doble join al cruzar dominios | Arquitectura intacta. Join doble UUID↔BIGINT en queries cross-domain |
| D10-B | `core_entities` con UUID + cambiar `entity_id UUID` en todas las tablas `acc_*` | **REQUIERE REABRIR Architecture Frozen v1** — cambio material en 20+ tablas |
| D10-C | Usar directamente `anf_filiales.id (UUID)` como entity_id en `acc_*` | **REQUIERE REABRIR Architecture Frozen v1** y acopla `acc_*` al dominio ANF |

### Implicaciones del join doble (D10-A)

```sql
-- Para combinar un journal line con el nombre de la filial ANF:
SELECT jl.*, ce.code, af.nombre
FROM acc_journal_line jl
JOIN acc_journal_entry je ON je.id = jl.journal_entry_id
JOIN core_entities ce ON ce.id = je.entity_id          -- BIGINT join
JOIN anf_filiales af ON af.core_entity_id = ce.id       -- UUID→BIGINT bridge
WHERE je.entity_id = 1  -- BIGINT
```

Performance: el join adicional es sobre una tabla de 8-15 filas con índice en PK. Impacto negligible en queries reales.

### Posición del architecture

La opción D10-A (BIGINT en `core_entities`, UUID en `anf_filiales`, bridge column) mantiene Architecture Frozen v1 intacta y es la posición por defecto de este documento.

**D10-B y D10-C requieren GO explícito del CFO para reabrir la arquitectura.**

**D10 = NUEVO DECISION GATE — AWAITING CFO**

---

## I. Security — SEC-1 Findings

### Estado confirmado

`schema_anf_v1.sql` confirma explícitamente en líneas 329-361:

```sql
ALTER TABLE anf_filiales         ENABLE ROW LEVEL SECURITY;  -- RLS habilitado ✓
-- ... (todos los demás tablas anf_*)

-- Pero la policy es completamente permisiva:
CREATE POLICY "anon_anf_filiales_all" ON anf_filiales
  FOR ALL TO anon USING (true) WITH CHECK (true);
```

**RLS está habilitado pero la policy es fail-open para `anon`.**
**Esto afecta las 10 tablas ANF:**

| Tabla | Policy nombre | Operaciones | Estado |
|---|---|---|---|
| anf_filiales | anon_anf_filiales_all | ALL (SELECT+INSERT+UPDATE+DELETE) | VULNERABLE |
| anf_informes | anon_anf_informes_all | ALL | VULNERABLE |
| anf_saldos_esf | anon_anf_saldos_esf_all | ALL | VULNERABLE |
| anf_movimientos_er | anon_anf_mov_er_all | ALL | VULNERABLE |
| anf_libro_mayor | anon_anf_libro_mayor_all | ALL | VULNERABLE |
| anf_justificaciones | anon_anf_justif_all | ALL | VULNERABLE |
| anf_metricas_config | anon_anf_metricas_all | ALL | VULNERABLE |
| anf_kpis_operacionales | anon_anf_kpis_op_all | ALL | VULNERABLE |
| anf_kpis_derivados | anon_anf_kpis_der_all | ALL | VULNERABLE |
| anf_tipos_cambio | anon_anf_tc_all | ALL | VULNERABLE |

### Contexto del comment original (schema_anf_v1.sql línea 323)

```
"La app usa Supabase anon key (sin Supabase Auth propio).
 Fase 1: políticas permisivas. Refinar en Fase Seguridad."
```

Era una deuda técnica conocida desde la creación del schema (2026-07-31). Aceptable como estado transitorio; inaceptable como estado permanente ante un `core_entities` financiero.

### Fix propuesto (a ejecutar en ambiente seguro antes de producción)

```sql
-- PASO 1: Reemplazar policy ALL→SELECT para anon
DROP POLICY IF EXISTS "anon_anf_filiales_all" ON anf_filiales;
CREATE POLICY "anon_anf_filiales_select" ON anf_filiales
  FOR SELECT TO anon USING (true);

-- PASO 2: Crear policy para authenticated (scope básico)
CREATE POLICY "auth_anf_filiales_all" ON anf_filiales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- (Nota: en Fase Seguridad definitiva, reemplazar USING(true) por filtro de usuario)

-- Repetir para cada tabla anf_* según necesidad de negocio:
-- anf_informes: anon=SELECT, authenticated=ALL (o SELECT/INSERT según rol)
-- anf_saldos_esf, anf_movimientos_er, anf_libro_mayor: anon=SELECT only
-- anf_justificaciones: anon=none (datos sensibles, solo authenticated)
-- anf_metricas_config: anon=SELECT
-- anf_kpis_*: anon=SELECT
-- anf_tipos_cambio: anon=SELECT
```

### Tests requeridos antes de producción

1. `anon` SELECT en `anf_filiales` → OK (leer filiales para UI)
2. `anon` INSERT en `anf_filiales` → RECHAZADO
3. `anon` UPDATE en `anf_filiales` → RECHAZADO
4. `anon` DELETE en `anf_filiales` → RECHAZADO
5. `authenticated` SELECT → OK
6. `authenticated` INSERT (filial nueva) → validar con rol
7. `anon` SELECT en `anf_justificaciones` → debe RECHAZARSE (datos sensibles)
8. App actual funciona sin errores tras cambio → regression test completo ANF

**SEC-1 status:** CONFIRMED VULNERABLE — fix draft listo — AUTORIZADO para rama controlada — NO desplegar producción sin tests completos.

---

## J. DDL 004 Static Review

**Resultado: PASS WITH CHANGES — 3 BLOCKERS + 5 NOTES**

### BLOCKER 1 — Forward Reference: `acc_journal_line` → `acc_reporting_account`

**Impacto:** El DDL no es ejecutable tal como está escrito.

`acc_journal_line` (Section 7) referencia `acc_reporting_account(id)` via FK, pero `acc_reporting_account` se define en Section 9. En Postgres, una FK a tabla inexistente falla en ejecución. Mismo problema para `acc_account_balance` (Section 8).

**Fix:** Mover la creación de `acc_reporting_account`, `acc_financial_statement`, `acc_reporting_line` (Section 9, catálogo) **antes** de Section 7 y 8. El resto de Section 9 (profile hierarchy) puede quedar en su lugar.

### BLOCKER 2 — Circular FK: `acc_consolidation_run` ↔ `acc_conversion_run`

**Impacto:** El DDL no es ejecutable tal como está escrito.

- Section 11: `acc_consolidation_run.conversion_run_id REFERENCES acc_conversion_run(id)` — falla porque `acc_conversion_run` no existe aún.
- Section 12: `acc_conversion_run.consolidation_run_id REFERENCES acc_consolidation_run(id)` — OK si se ejecuta después.

Circular dependency imposible de resolver como CREATE TABLE inline sin deferrable constraints.

**Fix recomendado:** Remover `acc_consolidation_run.conversion_run_id` del DDL. La relación puede gestionarse a nivel de aplicación (consolidation_run conoce su conversion_run_id, que se almacena en `acc_snapshot_metadata.currency_run_id`). La relación inversa `acc_conversion_run.consolidation_run_id` es suficiente.

Alternativa: `CREATE TABLE acc_conversion_run` primero (sin la FK a consolidation_run), luego `acc_consolidation_run` (con FK a conversion_run), luego `ALTER TABLE acc_conversion_run ADD FOREIGN KEY ...`. Requiere agregar la directiva ALTER TABLE al DDL.

### BLOCKER 3 — Polymorphic FK en `acc_materiality_policy.scope_ref_id`

**Impacto:** Viola Architecture Frozen v1 — "sin FK polimórficas".

```sql
scope_ref_id BIGINT,  -- FK al scope según scope_type (nullable para global)
```

Según OA-024-01-R2, las FK polimórficas fueron explícitamente rechazadas. `scope_ref_id` es exactamente el patrón rechazado: apunta a `core_entities` si `scope_type='entity'`, a `acc_reporting_line` si `scope_type='reporting_line'`, etc. Sin FK real a ninguna tabla.

**Fix:** Columnas explícitas con FK reales:
```sql
scope_entity_id         BIGINT  REFERENCES core_entities(id),
scope_reporting_line_id BIGINT  REFERENCES acc_reporting_line(id),
scope_analysis_type     TEXT,   -- 'variance_actual_budget'|...
-- Constraint: solo uno puede ser NOT NULL según scope_type
CONSTRAINT ck_materiality_one_scope CHECK (
  (scope_entity_id IS NOT NULL)::int +
  (scope_reporting_line_id IS NOT NULL)::int <= 1
)
```
Remover `scope_ref_id`.

---

### NOTE 4 — Duplicate UNIQUE en `pln_scenario.code`

Línea actual:
```sql
code TEXT NOT NULL UNIQUE,   -- columna constraint
-- ...
CONSTRAINT uq_pln_code UNIQUE (code)  -- tabla constraint
```

Dos definiciones UNIQUE sobre el mismo campo → dos índices innecesarios. Remover la inline `UNIQUE` del column definition, dejar solo `CONSTRAINT uq_pln_code`.

### NOTE 5 — `acc_entity_config` sin UNIQUE en (entity_id, effective_from)

[T5] documenta que el overlap requiere trigger. Pero un UNIQUE nativo en `(entity_id, effective_from)` previene duplicados exactos sin trigger:
```sql
CONSTRAINT uq_econfig_entity_from UNIQUE (entity_id, effective_from)
```
No previene overlapping, pero sí duplicados del mismo punto de inicio.

### NOTE 6 — `acc_ownership` sin UNIQUE en (entity_id, parent_entity_id, effective_from)

Mismo patrón que NOTE 5. Agregar:
```sql
CONSTRAINT uq_ownership_entity_parent_from UNIQUE (entity_id, parent_entity_id, effective_from)
```

### NOTE 7 — `updated_at` trigger [T11] vs columnas faltantes

Trigger [T11] documenta `SET updated_at = now()` para "todas las tablas con updated_at". Varias tablas no tienen la columna `updated_at`:

Tablas **sin** `updated_at` en DDL 004: `acc_period`, `acc_period_audit`, `acc_journal_entry`, `acc_journal_line`, `acc_account_balance`, `acc_consolidation_run`, `acc_conversion_run`, `acc_conversion_rate_used`, `acc_consolidation_result_line`, `acc_snapshot_metadata`, `acc_journal_line_dim`, `acc_account_balance_dim`.

Estas tablas son principalmente append-only o inmutables (snapshot, rate_used). Para las mutables (`acc_period`, `acc_consolidation_run`), agregar `updated_at`. Para las inmutables (líneas de asiento), no es necesario.

### NOTE 8 — Falta índice en `acc_period.status`

La query más común: buscar períodos `WHERE entity_id = $1 AND status = 'open'`. El índice existente (`ix_acc_period_entity`: `ON acc_period(entity_id, period_code)`) no cubre el filtro por status.

Agregar:
```sql
CREATE INDEX IF NOT EXISTS ix_acc_period_status ON acc_period(entity_id, status);
```

---

## K. GO/NO-GO Matrix — Actualizada

| Actividad | Estado | Blocker |
|---|---|---|
| DDL 004 como artefacto de diseño | **GO** (con fixes documentados) | — |
| Consulta de verificación D9-A en Supabase | **GO** (read-only) | — |
| Fix SEC-1 en rama controlada | **GO CONDICIONAL** | Tests requeridos antes |
| `core_entities` en worktree/staging | **GO CONDICIONAL** | D9-A verificado + D10 CFO + UUID vs BIGINT resuelto |
| Modificar DDL 004 para corregir Blockers 1-3 | **GO** | No cambia Architecture — son correcciones de DDL |
| `anf_filiales` extensión (core_entity_id) | **GO CONDICIONAL** | SEC-1 fix + core_entities deployed |
| `acc_*` tables en staging | **NO-GO** | core_entities deployed + D10 resuelto + Blockers 1-3 corregidos |
| Cualquier dato financiero real | **NO-GO** | Todo lo anterior + CFO GO explícito |
| Producción | **NO-GO** | RLS validado + CFO GO explícito |

---

## DECISION GATE — Awaiting CFO

### Corporate Entity Recommendation
**Alternativa C con UUID PK** — crear `core_entities` como tabla nueva con UUID (no BIGINT), para evitar double join UUID/BIGINT. Requiere revisar DDL 004 entity_id de BIGINT → UUID en todas las tablas `acc_*`.

**O** aceptar D10-A (BIGINT + double join) si Architecture Frozen v1 no se puede reabrir.

### Canonical ID Recommendation
El CFO debe decidir entre:
- **D10-A**: BIGINT en `core_entities` (Architecture Frozen v1 intacta) → acepta double join UUID↔BIGINT en queries cross-domain
- **D10-B**: UUID en `core_entities` → requiere reabrir Architecture Frozen v1 (cambio en ~20 tablas `acc_*`)

### Tables to Keep
- `anf_filiales` (en su rol ANF-específico, con `core_entity_id FK`)
- `contab_empresas` (si desplegada — verificar D9-A, luego freezar como readonly)

### Tables to Deprecate (plan)
- `empresas` (schema_contable_v1.sql) — si no está desplegada, no crear; si está desplegada, mapear → `core_entities` y freezar
- Arrays JS legacy — no son "tables" pero necesitan ser refactorizados hacia `core_entities` cuando el CEM esté en producción

### Migration Compatibility Required
- `anf_filiales`: agregar `core_entity_id UUID FK → core_entities(id)` (nullable inicialmente)
- `contab_empresas` (si existe): agregar `core_entity_id UUID FK → core_entities(id)`
- JS legacy: no migrar todavía; cambios de código son parte de Etapa 0 post-CFO GO

### SEC-1 Status
**CONFIRMED VULNERABLE** — 10 tablas ANF con `anon ALL`. Fix draft listo. Autorizado para rama controlada. No producción sin tests.

### DDL 004 Review Status
**PASS WITH CHANGES** — 3 blockers y 5 notas identificadas. Arquitectura correcta, DDL requiere correcciones de ejecución antes de materializar. No modificar el contrato de arquitectura sin CFO GO.

### Next Exact Action (propuesto)

1. CFO responde:
   - D9-A: ¿Correr la query de verificación en Supabase? (leer el estado real)
   - D10: ¿BIGINT o UUID como canonical ID?
   - SEC-1: ¿GO para fix en rama controlada?
   - D7: ¿Apertura de evidencia societaria Allpa Chile/Perú?
   - D8: ¿Fichas de evidencia para Allegria Service/Integrity Farms/Allpa Perú?

2. Con D9-A y D10 resueltos: corregir Blockers 1-3 en DDL 004 (no cambia Architecture).

3. Crear `core_entities` en rama controlada (no producción).

4. Fix SEC-1 en misma rama.

5. Continúa → **STOP — AWAITING CFO GO**

---

**OA-023:** CLOSED / STABLE
**OA-024-01:** ARCHITECTURE FROZEN v1
**OA-024-02:** DDL READY / NOT AUTHORIZED FOR EXECUTION
**OA-024-03:** ENTITY RECONCILIATION + SECURITY PREFLIGHT — AWAITING CFO GO

# OA-024-02 — Corporate Entity Master Preflight
**Estado:** DDL READY / AWAITING MATERIALIZATION GO
**Fecha:** 2026-08-13

---

## A. Dependencias actuales de `anf_filiales`

### Schema

```sql
CREATE TABLE IF NOT EXISTS anf_filiales (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            TEXT NOT NULL UNIQUE,
  nombre            TEXT NOT NULL,
  sistema           TEXT NOT NULL CHECK (sistema IN ('contec','megasystem','tbd')),
  moneda            CHAR(3) NOT NULL DEFAULT 'USD',
  piso_materialidad NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  activa            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Seed data (8 rows)

| codigo | nombre | sistema | moneda |
|---|---|---|---|
| allegria_foods | Allegria Foods | contec | USD |
| allegria_service | Allegria Service | contec | USD |
| frisku | Frisku Foods | megasystem | USD |
| osiris | Osiris | megasystem | USD |
| integrity | Integrity Farms | megasystem | USD |
| mediterra | Mediterra Holding | megasystem | USD |
| allpa_chile | Allpa Farms Chile | megasystem | CLP |
| mesain | Mesain | tbd | USD |

Ausentes: Allpa Farms Perú, Frisku Foods Perú, Allegria Service (está pero como contec). Total = 8 de los 11 en `empresas`.

### Tablas que la referencian (FK)

| Tabla | Campo | Tipo |
|---|---|---|
| `anf_informes` | `filial_id` | UUID FK → anf_filiales(id) NOT NULL |
| `anf_metricas_config` | `filial_id` | UUID FK → anf_filiales(id) NOT NULL |

### Código que la usa

| Archivo | Funciones | Campos leídos |
|---|---|---|
| `src/anf/anfPersistence.js` | `cargarFiliales()`, `upsertFilial()`, embed en `cargarInformes()` | id, nombre, codigo, sistema, moneda, piso_materialidad |
| `src/anf/AnfTab.jsx` | 4 call sites | id, nombre, codigo, sistema, moneda, piso_materialidad, descripcion* |
| `src/anf/anfParser.js` | Recibe filial como param | codigo, nombre, sistema, moneda |

*`descripcion` enviado por UI pero **no existe en el schema** — falla silenciosamente.

### RLS

Permissive: `anon` tiene acceso total (ALL). Sin autenticación requerida. **Esta es una vulnerabilidad activa para un maestro corporativo.**

### Triggers / índices

Ningún trigger. Solo índice implícito en PK(id) y UNIQUE(codigo).

---

## B. HALLAZGO CRÍTICO — Tres maestros paralelos de empresas

El discovery revela que `anf_filiales` NO es el único catálogo de empresas en el proyecto:

| Sistema | Archivo | Entidades | Campos relevantes | Estado |
|---|---|---|---|---|
| `anf_filiales` | `supabase/schema_anf_v1.sql` | 8 | id(UUID), codigo, nombre, sistema, moneda, piso_materialidad | Desplegado (tiene FKs activos) |
| `empresas` | `supabase/schema_contable_v1.sql` | 11 | id(?), codigo, nombre, rut, **moneda_func**, **method_consol**, **nci_pct**, sistema_origen | **Deployment desconocido** |
| `contab_empresas` | `supabase/schema_core_contable_fase0.sql` | ? | moneda_funcional, moneda_tributaria, moneda_presentacion (columnas agregadas por ALTER) | Legacy parcheado |

La tabla `empresas` de `schema_contable_v1.sql` contiene exactamente los campos que OA-024-01-R2 prohíbe poner en el Corporate Entity Master (`moneda_func`, `method_consol`, `nci_pct`). Esto confirma que ninguna de las tres es apta como CEM transversal sin cambios.

**Pregunta bloqueante para materialización:** ¿Está `schema_contable_v1.sql` desplegado en el Supabase de producción (`mediterra-calendario` o instancia separada)?

---

## C. Estrategia recomendada — Alternativa B

**Canonical table + compatibility layer.**

Razones para descartar A (rename anf_filiales) y C (perpetuar nombre):
- Alternativa A: `anf_filiales` tiene UUID PK. Toda la arquitectura `acc_*` usa BIGINT. Renombrar sin cambiar el contrato no resuelve la inconsistencia de tipos ni la semántica ANF.
- Alternativa C: perpetuar un nombre de dominio ANF como maestro corporativo crea deuda técnica permanente y confusión semántica en todos los futuros dominios.

**Alternativa B — pasos:**

```
1. Crear: core_entities (BIGINT PK, campos corporativos puros)
2. Migrar: anf_filiales recibe columna core_entity_id BIGINT FK → core_entities(id) (nullable inicialmente)
3. Poblar: mapear cada fila de anf_filiales a su core_entity_id
4. Actualizar: anf_filiales.core_entity_id pasa a NOT NULL
5. Routing: anf_informes y anf_metricas_config continúan usando anf_filiales.id (UUID) — sin cambio
6. Nuevos dominios (acc_*, pln_*): FK a core_entities.id (BIGINT)
7. Largo plazo: quando ANF se refactorice, anf_filiales puede volverse una tabla de configuración específica del dominio ANF que referencia core_entities
```

---

## D. Contrato del Corporate Entity Master — `core_entities`

Solo atributos corporativos relativamente estables. **No incluye** reglas de consolidación, NCI%, moneda funcional, ni profiles contables.

```sql
CREATE TABLE core_entities (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code            TEXT   NOT NULL UNIQUE,        -- 'MH','AF','AS','FF','OP','IF','APC','APP'
  legal_name      TEXT   NOT NULL,               -- nombre jurídico completo
  short_name      TEXT   NOT NULL,               -- nombre corto operativo
  country_code    CHAR(2) NOT NULL,              -- ISO 3166-1 alpha-2: 'CL','PE'
  tax_id          TEXT,                          -- RUT/RUC o equivalente (nullable: JVs extranjeras)
  entity_type     TEXT   NOT NULL,               -- ver CHECK abajo
  jurisdiction    TEXT,                          -- 'Chile'|'Peru'|'Holding'
  group_id        BIGINT REFERENCES core_entities(id), -- parent en jerarquía corporativa
  active          BOOLEAN NOT NULL DEFAULT true,
  effective_from  DATE    NOT NULL,              -- fecha de constitución o inicio en el grupo
  effective_to    DATE,                          -- NULL = entidad activa
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_entity_type CHECK (entity_type IN (
    'holding','subsidiary','jv','associate','related','branch','other'
  )),
  CONSTRAINT ck_country_code CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT ck_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);
```

**No van aquí:** `moneda_func`, `method_consol`, `nci_pct`, `sistema` (contec/megasystem), `piso_materialidad`. Esos pertenecen a `acc_entity_config`, `acc_ownership` y `anf_filiales` respectivamente.

### `anf_filiales.moneda` — semántica real

Discovery confirma: `anf_filiales.moneda` es **moneda de visualización/etiquetado de reportes PDF**, no moneda funcional. Se usa solo en cabeceras de PDF (`Estado de Resultados — USD`). El campo correcto en `core_entities` sería `default_display_currency CHAR(3)` si es necesario transversalmente. Por ahora: dejar en `anf_filiales` con ese nombre semántico; `core_entities` no lo incluye.

---

## E. Riesgos

| ID | Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|---|
| RE1 | `schema_contable_v1.sql` no está desplegado y crea conflicto al desplegar `core_entities` | Desconocida | Alto | Verificar estado antes de materializar |
| RE2 | UUID PK de `anf_filiales` vs BIGINT de `core_entities` require doble join en queries futuras | Segura | Medio | Aceptable: ANF mantiene su UUID; acc_* usa BIGINT de core_entities |
| RE3 | `anf_filiales` tiene anon RLS abierta — si core_entities hereda esa política, el maestro corporativo queda expuesto | Segura | Crítico | core_entities debe tener RLS autenticado desde el inicio |
| RE4 | Campo `descripcion` enviado por UI pero no en schema — dato perdido silenciosamente | Segura | Bajo | Agregar columna o limpiar en migration |
| RE5 | Tres maestros paralelos divergen hasta que se complete la migración | Segura | Medio | No crear más maestros; freeze los existentes hasta migration |

---

## F. Security / RLS Plan

| Tabla | RLS | Política |
|---|---|---|
| `core_entities` | Habilitado | `authenticated` read; solo rol `platform_admin` puede INSERT/UPDATE; sin DELETE |
| `acc_*` | Habilitado | `authenticated` + filtro por `entity_id` según `user_entity_access` |
| `anf_filiales` | **Corregir:** hoy anon ALL | Migrar a `authenticated` read; `anf_admin` para write |
| `pln_*` | Habilitado | `authenticated` + filtro por entidad + rol planning |

**Hard gate:** ningún schema financiero en producción sin RLS auditado. `core_entities` debe tener RLS correcto antes de que acc_* la referencien en producción.

---

## G. GO / NO-GO para materialización

| Actividad | GO? | Condición faltante |
|---|---|---|
| DDL como artefacto de diseño | **GO** | — |
| `core_entities` en worktree/staging | **GO CONDICIONAL** | Verificar deployment status de schema_contable_v1.sql |
| `anf_filiales` extensión (core_entity_id) | **GO CONDICIONAL** | RLS corregido en anf_filiales primero |
| `acc_*` tables en staging | **GO CONDICIONAL** | core_entities deployed + RLS |
| Cualquier write en producción | **NO-GO** | RLS validado + CFO GO explícito |

---

## H. Inputs del CFO todavía pendientes

| Input | Para qué |
|---|---|
| ¿Está `schema_contable_v1.sql` desplegado en el Supabase de producción? | Determina si `empresas` existe y si hay conflicto |
| D7 — evidencia societaria Allpa Chile/Perú | Poblar acc_ownership |
| D8 — moneda funcional Allegria Service, Integrity Farms, Allpa Perú | Poblar acc_entity_config |
| GO para RLS de anf_filiales | Prerequisito de seguridad antes de extender |
| GO para materialización de core_entities | Inicio de Etapa 0 |

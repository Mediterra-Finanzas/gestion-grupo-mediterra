# AGR–Accounting Integration Preflight

**Stream:** B (Paralelo — no bloquea ALF)
**Fecha:** 2026-08-19
**Estado:** ASSESSMENT ONLY — sin implementación

---

## 1. Objetivo

Evaluar qué se necesita para conectar operaciones agrícolas de Grupo Mediterra
con el dominio contable (acc_*) de modo que el flujo completo sea:

```
labor agrícola → orden de costo → journal entry → acc_account_balance
→ EEFF → costo/ha → EBITDA/ha → management reporting
```

---

## 2. Datos operacionales existentes

### 2.1 Módulos actuales en el sistema

| Módulo | Naturaleza | Datos agrícolas |
|--------|-----------|-----------------|
| `FinanzasModule.jsx` | Flujo de caja, créditos, saldos bancos | Ninguno |
| `AllegriaModule.jsx` | Exportación fruta fresca — clientes, embarques, liquidaciones | Especies/variedades (comercial) |
| `FriskuComercialModule.jsx` | Comisión importadores — programa, OE, packing | Especies (comercial) |
| `OsirisModule.jsx` | Royalties genéticos varietales | Ninguno |
| `ContabilidadModule.jsx` | Módulo contable en desarrollo (OA-024) | `cuartel_id` como dim CC |
| `App.jsx` | Autenticación, routing, tareas | Ninguno |

### 2.2 Conceptos agrícolas en código

| Concepto | Estado en código |
|----------|-----------------|
| `cuartel` (block/plot) | Existe en `ContabilidadModule.jsx` como dimensión centro de costo (CC) — mapea directo a `dim_value` tipo `CC` |
| Campo/predio | No existe en código |
| Labores | No existe en código |
| Insumos/materiales | No existe en código |
| Maquinaria | No existe en código |
| RRHH campo (jornales) | No existe en código |
| Temporada agrícola | No existe en código |
| Costo/ha | No existe en código |
| Cosecha (kg/cajas) | Existe en AllegriaModule/FriskuComercial como volumen comercial, no como dato de costos |

### 2.3 Dimensiones acc_* con relevancia agrícola

Tipos seeded en `dim_type` (migration 011):

| code | label | Relevancia AGR |
|------|-------|----------------|
| CC | Centro de Costo | Cuartel como CC ← implementado en ContabilidadModule |
| PRY | Proyecto | Temporada / proyecto de inversión |
| TMP | Temporada | Temporada agrícola (Jul-Jun) |
| ESP | Especie | Cereza / arándano / ciruela |
| CTR | Contrato | Contratos de producción |
| RGN | Región | Región geográfica del campo |
| MKT | Mercado | Mercado destino (comercial) |
| NMN | ? | Por confirmar |
| agr_field | Campo/predio | En comentarios de schema drafts 004; NO seeded |

**`agr_field` existe solo en comentarios** de `004_accounting_schema_draft.sql`. No está en `dim_type` de migration 011.

---

## 3. Entidades agrícolas relevantes

Según CLAUDE.md:

| Entidad | % | Actividad agrícola |
|---------|---|--------------------|
| Allegria Service (ALS) | 80% | Procesamiento cerezas/ciruelas Chile (maquila) |
| Integrity Farms (INT) | 100% | Fee admin campos por hectárea |
| Allpa Farms Chile (APC) | 50% JV | Producción cerezas |
| Allpa Farms Perú (APP) | 26% JV | Producción arándanos |

Entidades IAS 28 (APC, APP): el acc_* las gestiona vía `acc_equity_method_entry`, no línea a línea. Los costos agrícolas de APC/APP no se consolidan directamente.

Para el flujo AGR → Accounting, las entidades prioritarias son ALS e INT (línea a línea en scope).

---

## 4. Gap Assessment

### 4.1 Dimensiones (dim_*)

| Elemento | Estado | Gap |
|----------|--------|-----|
| CC (cuartel) | `dim_type` seeded; `dim_value` vacío | Cargar cuarteles por entidad (ALS, INT) |
| TMP (temporada) | `dim_type` seeded; `dim_value` vacío | Cargar temporadas Jul-Jun (2024-2025, 2025-2026) |
| ESP (especie) | `dim_type` seeded; `dim_value` vacío | Cargar: cereza, ciruela, arándano |
| agr_field (campo) | NO seeded en dim_type | Evaluar si Campo debe ser dim_value(CC) o tabla propia |
| PRY (proyecto) | `dim_type` seeded; `dim_value` vacío | Cargar proyectos por temporada (inversión de campo) |

**Estimado**: 1–2 seeds de migration para dim_value cubren CC/TMP/ESP básicos.

### 4.2 Chart of Accounts — cuentas agrícolas

Las cuentas agrícolas estándar esperadas en Contec Chile para ALS/INT:

| Clase | Rango | Naturaleza | Reporting account mapping |
|-------|-------|-----------|--------------------------|
| Activo biológico corriente (fruta en árbol) | 1.3x / 1.4x | ACT_C | ACT_C |
| Activo biológico no corriente (huerto/viñedo) | 1.6x / 1.7x | ACT_NC | ACT_NC |
| Maquinaria agrícola | 1.5x | ACT_NC | ACT_NC |
| Insumos (fertilizantes, fitosanitarios) | 5.1x | COSTO | COSTO |
| Jornales y contratistas | 5.2x / 6.1x | COSTO/GOPEX | COSTO/GOPEX |
| Depreciación activos agrícolas | 6.2x | GOPEX | GOPEX |
| Cosecha/embalaje | 5.3x | COSTO | COSTO |
| Fee admin campos (Integrity → holding) | 4.1x / 6.9x | ING/GOPEX | ING/GOPEX |

**Estas cuentas existirán en los archivos Contec de ALS e INT** y quedarán cubiertas por el mapping ESF/ERI de nivel 1 definido en OA-024-08A.

### 4.3 Modelo de costeo agrícola deseado

El CFO requiere llegar a `costo/ha` y `EBITDA/ha`. El modelo requiere:

```
Journal line (cost)
  + dim_value CC = cuartel
  + dim_value TMP = temporada
  + dim_value ESP = especie
→ acc_account_balance (por período, cuenta, entidad)
→ query: SUM(gasto) WHERE CC IN cuarteles_de_campo_X / ha_de_campo_X
→ = costo/ha para campo X, temporada Y, especie Z
```

El denominador (ha por campo) es un dato maestro externo (no en acc_*). Requiere una tabla propia o un campo en `dim_value.metadata`.

### 4.4 Flujo labor → costo → journal

El flujo futuro (OA-02x, no prioridad inmediata):

```
1. Orden de Labor (nueva tabla agr_labor_order)
   campos: cuartel_id, labor_type, fecha, ha_trabajadas, responsable
   
2. Insumo (nueva tabla agr_input_usage)
   campos: labor_order_id, insumo_id, cantidad, costo_unitario, moneda
   
3. Jornal (nueva tabla agr_timesheet)
   campos: labor_order_id, trabajador_id, horas, tarifa
   
4. Cierre de labor → generación automática de journal entry
   Debe: 5.xx (costo) | CC=cuartel | TMP=temporada
   Haber: 2.1x (provision) o 1.1x (caja)
   
5. Aprobación SoD → posted → acc_account_balance
```

Nada de esto existe. Estimado de alcance: OA-02x (post-piloto ALF).

---

## 5. Dimensiones acc_* que ya soportan AGR

Las siguientes capacidades del schema acc_* ya están disponibles para AGR **sin cambios**:

| Capacidad | Tabla/Mecanismo | Uso AGR |
|-----------|-----------------|---------|
| Centros de costo por journal line | `acc_journal_line.dim_values JSONB` | `{"CC": "cuartel_A1"}` |
| Dimensiones múltiples | `dim_type` + `dim_value` (tablas existentes) | CC + TMP + ESP por línea |
| Múltiples entidades | `core_entities` (ALS, INT ya existen) | Costos por entidad |
| Períodos mensuales | `acc_period` | Tracking mensual por temporada |
| Mapping cuenta → reporting | `acc_chart_mapping` | Cuentas agrícolas → ACT_C/COSTO/GOPEX |
| Equity method para JVs | `acc_equity_method_entry` | APC/APP (Allpa) |

---

## 6. Qué falta — por capa

### Capa 1: Datos maestros (requerido antes de AGR journals)

| Elemento | Acción | Blocker de |
|----------|--------|-----------|
| `dim_value` CC: cuarteles ALS/INT | Seed migration | acc_journal_line.dim_values |
| `dim_value` TMP: temporadas 2024-25, 2025-26 | Seed migration | análisis por temporada |
| `dim_value` ESP: cereza, ciruela, arándano | Seed migration | reporting por especie |
| Hectáreas por cuartel | Tabla o metadata en dim_value | costo/ha |
| Chart mapping ALS/INT | acc_chart_mapping rows | posting de ALS/INT |
| acc_entity_config ALS/INT | functional_currency, consol_method | posting de ALS/INT |

### Capa 2: Captura de operaciones (OA-02x, futuro)

- `agr_labor_order` — nueva tabla
- `agr_input_usage` — nueva tabla
- `agr_timesheet` — nueva tabla
- UI de captura de labores (campo → web/mobile)
- Integración con RRHH (si existe sistema separado)

### Capa 3: Reporting (post OA-024)

- `costo/ha` query/view
- `EBITDA/ha` derivado
- Comparación temporada vs temporada
- Dashboard management

---

## 7. Critical Path AGR

Para llegar a `labor → costo → journal → EEFF → costo/ha`:

```
1. ALF pilot READY (OA-024-08A)          ← en curso
2. Posting pipeline OA-024-09 (UI)       ← siguiente
3. ALS + INT chart mapping + entity config
4. dim_value seeds (CC=cuarteles, TMP, ESP)
5. Primer batch Contec ALS con cuentas agrícolas
6. Query: costo/ha por cuartel
7. Captura nativa de labores (nueva tabla) ← OA-02x
```

Los pasos 1–5 son incrementales sobre la arquitectura existente y no requieren nuevas tablas.
El paso 6 requiere denominator (ha) como dato maestro.
El paso 7 es un proyecto separado.

---

## 8. Decisiones pendientes (no bloquean ALF)

| ID | Pregunta | Impacto |
|----|----------|---------|
| AGR-D1 | ¿Es `campo` (predio) un dim_value CC de nivel superior al cuartel, o una tabla propia? | Modelo jerárquico de dimensiones |
| AGR-D2 | ¿Las hectáreas viven en `dim_value.metadata` JSONB o en tabla dedicada? | costo/ha calculation |
| AGR-D3 | ¿ALS (maquila) costea por ha procesada, kg procesado, o horas? | Base de asignación |
| AGR-D4 | ¿INT registra sus fees como ingreso (desde INT) o como egreso (desde otras entidades)? | journal entry dirección |

Estas decisiones se resuelven al momento de implementar la Capa 2 (OA-02x).

---

## 9. Resumen ejecutivo

**Lo que ya existe y funciona para AGR:**
- Schema acc_* con dim_values y journal_lines JSONB → soporta dimensiones agrícolas
- core_entities para ALS, INT (línea a línea), APC, APP (equity method)
- dim_type con CC, TMP, ESP, PRY disponibles
- acc_chart_mapping puede recibir cuentas agrícolas (insumos, jornales, activos biológicos)

**Lo que falta para el primer costo agrícola en journals:**
1. dim_value seeds (cuarteles, temporadas, especies) — ~1 migration
2. Chart mapping ALS + INT — ~1 migration por entidad
3. acc_entity_config ALS + INT — ~1 migration
4. Posting pipeline OA-024-09 (UI/API) — depende de ALF pilot

**Lo que falta para costo/ha y EBITDA/ha:**
1. Denominador (ha por cuartel) — decisión AGR-D2
2. Captura nativa de labores — proyecto OA-02x separado

**Estimado para "primer costo agrícola posteable":**
2–3 sprints post-ALF pilot, sin nueva arquitectura.

**Estimado para "captura nativa de labores":**
Sprint separado OA-02x, nuevo módulo, nueva UI.

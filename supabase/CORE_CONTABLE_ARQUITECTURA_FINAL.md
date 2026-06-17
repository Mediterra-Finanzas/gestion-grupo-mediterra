# Core Contable-Agrícola — Arquitectura Final (F1–F4)
**APP Mediterra · Versión 1.0 · Junio 2026**

---

## 1. Visión general

El Core Contable-Agrícola es un sistema contable integrado construido sobre Supabase (Postgres + PostgREST) y consumido por `ContabilidadModule.jsx` (React 18). Está diseñado específicamente para empresas frutícolas con centros de costo agrícolas (campo / sector / cuartel), libros paralelos tributario/IFRS, y centralización automática desde documentos tributarios electrónicos del SII.

El sistema corre **completamente en un único archivo JSX** (`src/ContabilidadModule.jsx`, ~6 000 líneas al cierre de F4) en coherencia con la arquitectura monolítica intencionada de la app, que prioriza velocidad de iteración sobre separación de módulos.

---

## 2. Fases implementadas

| Fase | Tab | Descripción | Commit |
|------|-----|-------------|--------|
| F1 | Plan de Cuentas | CRUD `contab_plan_cuentas` + wizard de importación (Contec / Megasystem / genérico) | `b0a1789` |
| F2 | Libro Diario | Gestión de asientos (borrador → mayorizado), entrada manual y carga masiva 4 pasos | `dec2d33` |
| F3 | Centralización SII | Staging RCV, lotes de compras/ventas, reglas por tipo de documento y por RUT, contab. automática | `c553e6c` |
| F4 | Informes y Analítica | Balance 8 col, Estado de Resultados, Costos CeCo con temporada agrícola, 5 ratios financieros, narrativa ejecutiva determinista | `d54ce4b` |

---

## 3. Modelo de datos — Tablas y vistas

### 3.1 Tablas principales

```
contab_empresas             Empresas del grupo (cada una con su propio plan de cuentas y libros)
contab_periodos             Control de períodos contables: abierto | cerrado | bloqueado
contab_plan_cuentas         Plan de cuentas por empresa; nivel 1 = agrupador, nivel 2 = mueve
contab_homologacion         Mapeo código externo (Contec / Megasystem / SII) → cuenta interna
contab_auxiliares           Auxiliares: proveedores, clientes, empleados, activos (clasificados)
contab_asientos             Cabecera de asiento: empresa, libro, período, glosa, estado, usuario
contab_asientos_lineas      Líneas de asiento: cuenta, debe, haber, cuartel_id, auxiliar_id, cuadrado
contab_reglas_centralizacion  Reglas por empresa y tipo_origen (lote_compras / lote_ventas / rut_overrides)
```

### 3.2 Tablas de documentos tributarios (staging SII)

```
doc_sii_staging             Documentos importados desde RCV: estado pendiente → centralizado | ignorado
doc_lotes                   Lote de centralización: agrupa N documentos → genera un asiento
doc_lotes_lineas            Asignación de cuenta contable por cada documento dentro del lote
```

### 3.3 Tablas de centros de costo agrícola

```
cc_campos                   Nivel 1 jerárquico: campo / fundo
cc_sectores                 Nivel 2: sector dentro del campo
cc_cuarteles                Nivel 3: cuartel (unidad mínima de CeCo); tiene especie, variedad, há
cc_distribuciones           Distribución porcentual de gastos generales entre cuarteles
cc_jerarquia                Vista desnormalizada campo → sector → cuartel (usada en F4 para selectores)
```

### 3.4 Tablas auxiliares de seguridad

```
rbac_usuarios_roles         Multi-tenancy: usuario ↔ empresa ↔ rol (admin / contador / readonly)
audit_log                   Log inmutable de todas las operaciones (INSERT / UPDATE / soft delete)
```

### 3.5 Vistas analíticas (solo lectura)

| Vista | Descripción | Filtros disponibles |
|-------|-------------|---------------------|
| `contab_saldos_acumulados` | Saldo total por cuenta desde todos los asientos mayorizados | `empresa_id`, `libro` |
| `contab_balance_8_columnas` | Saldo / Ajuste / Aj. Saldo / Balance / Resultado (JOIN con `contab_plan_cuentas WHERE mueve=true`) | `empresa_id`, `libro` |
| `contab_costos_cuartel` | Costos por campo / sector / cuartel / especie / variedad, con `anio` y `mes` | `empresa_id`, `anio`, `mes`, `campo_nombre`, `sector_nombre`, `cuartel_id` |

> **Importante:** `contab_saldos_acumulados` y `contab_balance_8_columnas` son vistas **acumulativas** (sin corte de período): agregan todos los asientos en estado `mayorizado`. El corte temporal en el Balance General es correcto contablemente; solo `contab_costos_cuartel` admite filtro de período porque incluye `anio` y `mes` de la cabecera del asiento.

---

## 4. Flujo de datos end-to-end

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ORIGEN EXTERNO                                                             │
│                                                                             │
│  ① Sistema ERP (Contec / Megasystem) ──→ Excel plan de cuentas            │
│  ② SII / RCV ──────────────────────────→ Excel RCV (compras/ventas)       │
│  ③ Contador ───────────────────────────→ Asiento manual en la app         │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  F1 — PLAN DE CUENTAS                                                       │
│                                                                             │
│  parsearPlanContec() / parsearPlanMegasystem() / parsearPlanGenerico()     │
│    → detecta formato por cabeceras de columnas                             │
│    → normaliza a {codigo, nombre, tipo, clasif_ifrs, nivel, mueve}         │
│    → upsert a contab_plan_cuentas (on_conflict=empresa_id,codigo)          │
│    → upsert a contab_homologacion (código externo → id interno)            │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  F2 — LIBRO DIARIO                                                          │
│                                                                             │
│  Asiento borrador                                                           │
│    → líneas: N filas {cuenta_id, debe, haber, cuartel_id, auxiliar_id}    │
│    → trigger trg_calc_cuadrado actualiza asientos.cuadrado = SUM(debe-haber)│
│    → validación en app: cuadrado = 0 antes de mayorizar                    │
│                                                                             │
│  Mayorización (fn_mayorizar_asiento)                                       │
│    → verifica período abierto (trg_bloqueo_periodo)                        │
│    → cambia estado: borrador → mayorizado                                  │
│    → impacta vistas contab_saldos_acumulados y contab_balance_8_columnas   │
│                                                                             │
│  Contra-asiento / Anulación                                                │
│    → crea asiento simétrico (debe↔haber invertidos)                        │
│    → estado del original → anulado                                         │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  F3 — CENTRALIZACIÓN SII                                                    │
│                                                                             │
│  Staging                                                                    │
│    parsearRCV(workbook) → detecta columnas flexibles → inserta a            │
│    doc_sii_staging (estado=pendiente)                                       │
│                                                                             │
│  Reglas de centralización (contab_reglas_centralizacion)                   │
│    tipo_origen = 'lote_compras' → cuentas: proveedores / IVA CF / gasto   │
│    tipo_origen = 'lote_ventas'  → cuentas: clientes / IVA débito / ingreso │
│    tipo_origen = 'rut_overrides' → overrides por RUT específico            │
│                                                                             │
│  Generación de asiento de lote (calcularAsientoLote)                       │
│    → agrupa documentos seleccionados                                        │
│    → signo = esNC ? -1 : 1  (Nota de crédito invierte Debe/Haber)         │
│    → genera asiento en contab_asientos + líneas en contab_asientos_lineas  │
│    → actualiza doc_sii_staging.estado → centralizado                        │
│    → actualiza doc_lotes.estado → centralizado, asiento_id = nuevo         │
└────────────────────────────┬────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  F4 — INFORMES Y ANALÍTICA                                                  │
│                                                                             │
│  Balance 8 columnas                                                         │
│    GET /contab_balance_8_columnas?empresa_id=eq.X&libro=eq.Y               │
│    → columnas: saldo_deudor / acreedor, ajuste_debe / haber,               │
│      saldo_aj_deudor / acreedor, balance_activo / pasivo,                  │
│      resultado_ingreso / egreso                                             │
│                                                                             │
│  Estado de Resultados                                                       │
│    → derivado del mismo query; filas con tipo IN ('I','E')                 │
│                                                                             │
│  Costos por CeCo (filtro temporal disponible)                              │
│    GET /contab_costos_cuartel?empresa_id=eq.X&[filtro]                     │
│    Mes:        &anio=eq.2026&mes=eq.5                                       │
│    Año:        &anio=eq.2026                                                │
│    Temporada:  &or=(and(anio.eq.2025,mes.gte.7),and(anio.eq.2026,mes.lte.6))│
│                                                                             │
│  Ratios (calculados client-side desde balanceData)                         │
│    ROA = utilidad / totalActivo × 100                                       │
│    ROE = utilidad / patrimonio × 100                                        │
│    Razón corriente = acCte / pCte        (usa clasif_ifrs para separar)    │
│    Prueba ácida    = acCte / pCte × 0.80 (aproximación sin inventarios)    │
│    Apalancamiento  = totalPasivo / patrimonio                              │
│                                                                             │
│  Narrativa ejecutiva (determinista, sin IA externa)                        │
│    → Lee ratios + costosPorCuartel                                         │
│    → Detecta desviaciones ordenadas por magnitud (liquidez, ROA, CeCo)    │
│    → Rellena plantilla de texto estructurada                               │
│    → Texto editable antes de exportar a .txt                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Triggers y funciones SQL clave

### 5.1 `trg_calc_cuadrado` (trigger AFTER INSERT/UPDATE/DELETE en `contab_asientos_lineas`)

```sql
-- Recalcula asientos.cuadrado = SUM(debe) - SUM(haber) de todas las líneas del asiento.
-- cuadrado = 0 → asiento cuadrado (válido para mayorizar).
-- cuadrado ≠ 0 → el validador en la app bloquea la mayorización.
-- NUNCA se inserta/actualiza cuadrado directamente desde la app.
```

### 5.2 `trg_bloqueo_periodo` (trigger BEFORE INSERT/UPDATE en `contab_asientos`)

```sql
-- Verifica que contab_periodos.estado = 'abierto' para la empresa + anio + mes.
-- Si el período está 'cerrado' o 'bloqueado' → RAISE EXCEPTION.
-- Impide contabilizar en períodos históricos sin autorización explícita.
```

### 5.3 `fn_mayorizar_asiento(p_asiento_id UUID, p_usuario_id UUID)`

```sql
-- 1. Verifica cuadrado = 0 en las líneas.
-- 2. Verifica período abierto.
-- 3. UPDATE contab_asientos SET estado = 'mayorizado', fecha_mayorizacion = NOW().
-- 4. INSERT en audit_log.
-- Las vistas contab_saldos_acumulados y contab_balance_8_columnas
-- se actualizan automáticamente al cambiar estado → 'mayorizado'.
```

### 5.4 `fn_soft_delete(p_tabla TEXT, p_id UUID, p_usuario_id UUID)`

```sql
-- Borrado lógico genérico: UPDATE SET deleted_at = NOW().
-- Registra en audit_log con datos_antes.
-- NUNCA se ejecuta DELETE físico en tablas contables.
-- Índices parciales (WHERE deleted_at IS NULL) mantienen performance.
```

### 5.5 `fn_mis_empresas()` (RLS helper)

```sql
-- Retorna UUIDs de empresas del usuario autenticado desde rbac_usuarios_roles.
-- Usada en todas las políticas RLS para multi-tenancy.
-- Security Definer → corre con privilegios del propietario, no del llamador.
```

---

## 6. Reglas de negocio críticas

### 6.1 Cuadre contable (invariante fundamental)

```
SUM(debe) = SUM(haber)  →  cuadrado = 0
```
El trigger `trg_calc_cuadrado` mantiene `contab_asientos.cuadrado` siempre actualizado. La app valida `cuadrado === 0` antes de permitir mayorizar. Esta validación ocurre en **dos capas** (SQL trigger + validación React) para garantizar integridad ante operaciones directas al API.

### 6.2 Inmutabilidad del asiento mayorizado

Un asiento en estado `mayorizado` **no puede editarse**. La única operación permitida es crear un **contra-asiento** (asiento de reversa con debe↔haber invertidos). El original queda con estado `anulado`. Esto garantiza trazabilidad de auditoría completa.

### 6.3 Control de períodos

La contabilización en un período cerrado o bloqueado es imposible a nivel de base de datos (trigger bloqueante), independiente de la interfaz. La app también valida el período antes de mostrar la opción de mayorizar, pero la capa SQL es la fuente autoritativa.

### 6.4 Nota de crédito (tipo_doc_sii = '61' o '56')

```javascript
const signo = esNC ? -1 : 1;
// Un lote de notas de crédito invierte Debe/Haber
// para que el efecto contable sea correcto (reducción de pasivo proveedor).
```

### 6.5 Temporada agrícola (Julio–Junio)

La consulta de costos por temporada usa sintaxis OR de PostgREST:
```
?or=(and(anio.eq.${tA-1},mes.gte.7),and(anio.eq.${tA},mes.lte.6))
```
Temporada `tA` = año de cierre (ej. `2026` = Jul 2025 – Jun 2026).

### 6.6 Libros paralelos (tributario / IFRS)

Cada asiento tiene un campo `libro` (`tributario` | `ifrs`). Las vistas filtran por `libro` para producir reportes de cada marco normativo de forma independiente. Un mismo evento económico puede tener dos asientos (uno por libro) con glosas y cuentas diferentes.

### 6.7 Soft delete obligatorio

Ninguna tabla contable admite `DELETE` físico. Toda eliminación usa `fn_soft_delete()` o `UPDATE SET deleted_at = NOW()` directamente. Los índices parciales `WHERE deleted_at IS NULL` garantizan que las consultas normales nunca vean registros eliminados sin penalidad de performance.

---

## 7. Arquitectura de la capa React

### 7.1 Componentes principales en `ContabilidadModule.jsx`

```
ContabilidadModule (componente raíz)
├── EmpresasTab               F1-base: CRUD de empresas contab_empresas
├── PlanCuentasTab            F1: Plan de cuentas + wizard importación
│   ├── parsearPlanContec()
│   ├── parsearPlanMegasystem()
│   └── parsearPlanGenerico()
├── LibroDiarioTab            F2: Asientos manuales y masivos
│   ├── VistaLista (listado + filtros)
│   ├── VistaEditor (editor línea a línea)
│   └── VistaMasivo (wizard 4 pasos)
├── CentralizacionSiiTab      F3: Staging SII + lotes + reglas
│   ├── VistaStaging
│   ├── VistaNuevoLote
│   ├── VistaHistorial
│   └── VistaReglas
│       ├── parsearRCV()
│       └── calcularAsientoLote()
├── InformesAnaliticaTab      F4: Reportes + Ratios + Narrativa
│   ├── Reportes EEFF
│   │   ├── Balance 8 columnas (contab_balance_8_columnas)
│   │   ├── Estado de Resultados (derivado del mismo query)
│   │   └── Costos por CeCo (contab_costos_cuartel)
│   ├── Ratios financieros (ROA, ROE, Corriente, Ácida, Apalancamiento)
│   └── Narrativa ejecutiva (generarNarrativa — determinista, sin IA externa)
├── AuxiliaresTab             Auxiliares: proveedores, clientes, empleados
├── CentrosCostoTab           CeCo: jerarquía campo → sector → cuartel
├── TiposDocumentoTab         Catálogo de tipos de documento SII
├── PeriodosTab               Apertura y cierre de períodos contables
└── MapeoCodosTab             Homologación de códigos externos → internos
```

### 7.2 Capa de acceso a datos (helpers compartidos)

```javascript
// Todos definidos al inicio del archivo, antes de los componentes:
supaFetch(path, opts)         // fetch base con headers SUPA_KEY
supaSelect(tabla, query)      // GET /tabla?query
supaInsert(tabla, body)       // POST /tabla
supaUpdate(tabla, id, body)   // PATCH /tabla?id=eq.uuid
supaUpsert(tabla, body, onConflict)  // POST con Prefer: resolution=merge-duplicates
```

### 7.3 Patrón anti-borrado (Regla 9 del CLAUDE.md)

Aplicado en `InformesAnaliticaTab` (y en todos los módulos con auto-save):

```javascript
const cargaOkRef = useRef(false);

async function loadBalance() {
  // ...
  try {
    const data = await supaSelect("contab_balance_8_columnas", q);
    setBalanceData(data || []);
    cargaOkRef.current = true;   // ← solo se marca true tras carga exitosa
  } catch (e) {
    setErrorBal("Error: " + e.message);
    throw e;                      // ← propaga el error, nunca devuelve {}
  }
}

// Cualquier guardado se bloquea si cargaOkRef.current === false
// Esto previene que un fallo de red deje el estado en [] y el auto-save
// sobreescriba la fila real de Supabase con datos vacíos.
```

---

## 8. Convenciones de nomenclatura SQL

| Prefijo | Dominio |
|---------|---------|
| `contab_` | Núcleo contable (asientos, plan, períodos, homologación, reglas) |
| `doc_` | Documentos tributarios SII (staging, lotes) |
| `cc_` | Centros de costo agrícola (campos, sectores, cuarteles) |
| `af_` | Activo fijo (categorías, activos — implementación futura) |
| `rem_` | Remuneraciones staging (períodos contab — implementación futura) |
| `rbac_` | Control de acceso (usuarios, roles) |
| `fn_` | Funciones PostgreSQL |
| `trg_` | Triggers PostgreSQL |
| `idx_` | Índices (parciales donde aplica `deleted_at IS NULL`) |
| `rls_` | Políticas Row Level Security |

---

## 9. Seguridad — patch v2

El archivo `schema_core_contable_v2_patch.sql` añade sobre el esquema base:

1. **Soft deletes** — columna `deleted_at TIMESTAMPTZ` en todas las tablas contables; índices parciales `WHERE deleted_at IS NULL` para mantener performance
2. **RLS multi-tenant** — políticas por tabla usando `fn_mis_empresas()` para que cada usuario solo acceda a sus empresas autorizadas
3. **Trigger de período** — bloqueo a nivel SQL de modificaciones a períodos cerrados/bloqueados
4. **Revalorización moneda extranjera** — función para ajuste mensual de cuentas en USD/EUR según TC histórico
5. **Parámetros IPC/UTM/UF** — tabla de indicadores económicos para corrección monetaria tributaria chilena
6. **CIF agrícola** — función de prorrateo de Costos Indirectos de Fabricación entre cuarteles según hectáreas o distribuciones manuales

---

## 10. Pendientes y hoja de ruta

| Prioridad | Ítem | Estado |
|-----------|------|--------|
| Alta | Ejecutar `schema_core_contable_v2_patch.sql` en Supabase (seguridad + RLS) | Pendiente |
| Alta | PR review y merge de rama `feat/expediente-nominas-fase0` → `main` | Pendiente |
| Media | Libro Mayor por cuenta (vista + UI) | Backlog |
| Media | Activo Fijo bicontable (alta, depreciación, baja) | Backlog |
| Media | Presupuesto anual por CeCo + análisis Real vs. Presupuesto | Backlog |
| Baja | Export Balance 8 columnas a Excel con formato SII (`xlsx-js-style`) | Backlog |
| Baja | Archivo Previred desde asientos de remuneraciones | Backlog |

---

## 11. Referencias

| Recurso | Ruta |
|---------|------|
| Esquema SQL base (v1) | `supabase/schema_core_contable_v1.sql` |
| Patch de seguridad (v2) | `supabase/schema_core_contable_v2_patch.sql` |
| Diseño de carpetas (propuesto) | `supabase/schema_core_contable_v1_ARQUITECTURA.md` |
| Módulo React | `src/ContabilidadModule.jsx` |
| Instrucciones del proyecto | `CLAUDE.md` |
| URL Supabase | `https://bywovqayuzodbzwsriet.supabase.co` |

---

*Documento generado al cierre de la Fase F4 (2026-06-17). Actualizar tras cada fase incremental.*

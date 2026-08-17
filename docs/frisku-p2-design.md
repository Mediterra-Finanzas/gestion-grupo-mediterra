# Frisku P2 — Diseño técnico (Qlik Functional Parity)

Base de código: `frisku-p2-dev` desde `origin/main @ 9789278` (incluye P1.9e + H1 +
prevención maestros + 1 commit Osiris ajeno, **no tocado**). Documento breve y ejecutable.
Principio: **Qlik = benchmark funcional; Frisku = identidad visual.** P2 **extiende** el
motor actual; no crea un segundo provider ni otra Reportería BI.

---

## 3.1 Estado actual (mapeado del código, no memoria)

**Motor (`src/friskuBI.js`, `FriskuBIProvider`):**
- `nav = { stack:[{}], idx:0 }`; `sel = nav.stack[nav.idx]` con forma **`{ dimKey: Set(valores) }`**.
- Historial: `canUndo/canRedo`, `undo/redo`, `commit(fn)` (empuja nuevo estado, `HIST_MAX=60`).
- Selección: `toggle`, `setOne`, `setMany`, `remove`, `clearDim`, `clearAll`.
- `applySel(selObj)` → restaura una selección desde `{dimKey:[valores]}` (para bookmarks/estados).
- Asociativo: `associativeValues(facts, sel, dimKey, metric)` → Selected/Possible/Alternative/Excluded.
- Set-analysis: `matchFacts(row, sel, exceptKey)`, `factsIgnoring(facts, sel, dimKey)`,
  `metricOverIgnoring`, `participacion`, `invertSelection`. **Todas puras y parametrizadas por `sel`** → sirven para A/B sin tocar la selección global.
- Expuesto: `facts, filtered, dims, metrics, metric, fmtMetric, sel, toggle, setOne, setMany, remove, clearDim, clearAll, associative, ignoring, chips, dataQuality, undo, redo, canUndo, canRedo, applySel`.
- **NO existe** concepto de lock ni de estados A/B en el provider.

**Workspace (`AnalysisWorkspace`):** estado local `preset` (libre/comercial/semanal/comp), `viz` (tabla/pivot/barras/dona/tendencia/drill), `panelOpen`, `propsEl` (portal PROPIEDADES), `full` (fullscreen), `exportReq` (`{type,n}` → `useExportTrigger`).

**Config por objeto (estado local de cada componente):**
- Tabla `StraightTableBI`: `dimSel[], medSel[], sortCol, sortDir, q, detQ, detSort`.
- Pivot `PivotTableBI`: `row1, row2, colDim, medKey, expanded(Set)`.
- Drill `DrillGroupsBI`: `grpKey, medKey, path[]`.
- Gráficos `TableroAsociativo`: `fuenteId, measureId, dim1, dim2, chart(vizChart), topN`.
- Presets curados: Comercial (`expE/expC/expS`), Semanal (`mk`), Comparativo (`actual, anterior`).

**Identidad de usuario:** `FriskuComercialModule({ usuarioActual, … })` → `usuarioActual?.nombre` estable y único por usuario. Clave de persistencia: `frisku_bi_bookmarks::<usuarioActual.nombre>`.

**Persistencia actual:** módulo usa `dbLoadGeneric/dbSaveGeneric` (Supabase `calendario_data`). **No usa localStorage**. Para bookmarks preferimos **localStorage** (aislado por usuario, sin tocar Supabase).

**Exportación:** helpers `fr_*` (Excel ExcelJS) + jsPDF/autoTable; contrato PDF `configureFriskuPdf` (H1); disparo unificado `useExportTrigger` (universo visible = exportado).

---

## 3.2 Bookmarks / vistas guardadas

**Esquema versionado (una vista):**
```
{ schema: 1, id, nombre, owner, creado, actualizado,
  hoja: "analisis",
  preset, viz, panelOpen,
  sel: { dimKey: [valores] },           // serializable (Sets → arrays)
  locked: [dimKey, …],                  // se llena cuando P2.2 exista (compat: [] si no)
  obj: {                                // config del objeto por tipo
    tabla:  { dimSel, medSel, sortCol, sortDir },
    pivot:  { row1, row2, colDim, medKey, expanded:[keys] },
    drill:  { grpKey, medKey, path:[{dimKey,value,label}] },
    grafico:{ fuenteId, measureId, dim1, dim2, chart, topN },
    comercial/semanal/comparativo: { … mínimos … }
  } }
```
- **Persistencia:** `localStorage` key `frisku_bi_bookmarks::<owner>` → array de vistas. Aislado por usuario; sin compartir en esta fase; sin Supabase.
- **Validación al recuperar:** descartar dims/medidas que ya no existan en `FRISKU_DIMS/FRISKU_METRICS` (campo inválido se ignora, el resto se restaura, aviso discreto "algún filtro/columna ya no existe"). Nunca romper el workspace.
- **Prevención de duplicados:** por `nombre` normalizado; renombrar/eliminar/actualizar por `id`.
- **Restauración ATÓMICA:** aplicar todo en un solo paso (sel + preset + viz + panel + obj-config), sin secuencia de estados parciales visibles.
- **Migración futura:** `schema` versionado; loader tolerante (defaults para campos nuevos).

**Mecanismo de captura/restauración de config de objeto (clave de diseño):**
Para no reescribir la arquitectura P1.9e, se usa un contrato ligero (mismo patrón que `useExportTrigger`):
- El workspace mantiene `objState` (config por viz) y un `restoreNonce`.
- Cada objeto acepta `initialConfig` (semilla de sus `useState`) y **re-siembra** al cambiar `restoreNonce` (remonta el objeto con `key` que incluye el nonce → re-inicializa desde la config guardada). Bajo modo normal (`restoreNonce` estable) el objeto conserva su estado como hoy (sin regresión).
- Para **capturar** al guardar, cada objeto reporta su config vigente vía callback `onConfig(cfg)` (como `panelEl`/`exportReq`), que el workspace guarda en `objState`.
Este patrón toca los objetos solo para (a) leer `initialConfig` en los `useState` y (b) reportar config; **no cambia su comportamiento normal** → cubierto por tests de no-regresión.

---

## 3.3 Lock selections (extensión del provider)

- **Representación:** `locked: Set(dimKey)` como parte del estado de navegación (`nav.stack[idx]` pasa a `{ sel, locked }` o se añade `lockedStack` paralelo con el mismo idx). **Decisión:** empaquetar `{sel, locked}` por entrada de historial → Back/Forward restauran ambos consistentemente (un solo historial).
- **Selección vs lock:** el lock marca un **campo** cuyo valor no se limpia con "Limpiar todo".
- `clearAll` → limpia solo campos **no** bloqueados; conserva los bloqueados.
- `clearDim(field)` sobre un campo bloqueado → **requiere desbloquear primero** (o acción explícita).
- Back/Forward → restauran `sel` + `locked` juntos (mismo `commit`).
- Cambiar visualización/preset → **no** altera locks.
- Bookmarks → `locked` se guarda/restaura (campo `locked[]` del esquema).
- Reemplazar el valor de un campo bloqueado → permitido (el lock fija el campo, no congela el valor); documentar en UI.
- **UI compacta:** chip en Selection Bar con 🔒 y acción desbloquear; toggle en el menú ⋯ del Filter Pane.

## 3.4 Alternate States / Comparador A-B (real, ≠ Comparativo fijo)

- **No** reemplaza el preset **Comparativo** fijo por temporada (se conserva).
- Dos estados **independientes** `A` y `B`, cada uno un `sel` (`{dimKey:Set}`) con la **misma semántica asociativa** (OR intra-dim, AND inter-dim; mismas dims/medidas). Se guardan como snapshots, **no** en el historial global.
- Cálculo: reutiliza `matchFacts`/`metric.calc` con `selA`/`selB` (funciones puras ya existentes) → **sin duplicar métricas ni motor**.
- Acciones: usar selección actual como A / como B; editar A/B (abre el estado como "selección activa" temporal); copiar A→B / B→A; swap; limpiar A/B.
- Resultado por métrica existente (Contenedores/FCL/Cajas/Kilos/Venta/Com.cliente/Com.Frisku/Clientes act./Exportadores act.): **A, B, Δ, Δ%**.
  - `Δ = A − B`. `Δ% = (A−B)/|B|×100` si `B≠0`; si `B=0`/sin datos → `—` (sin infinito), distinguiendo **cero real** de **`Sin datos suficientes`**.
  - count-distinct: recalculado sobre los hechos de cada estado (nunca suma subtotales).
  - financieras: mantener avisos de cobertura (`_nLiq`).
- **UX:** vive dentro del workspace (viz/preset "Comparar A/B" o panel), **sin** nueva navegación principal; deja claro qué filtros son de A y de B; no mezclar ambiguamente con la Selection Bar global (la barra global sigue rigiendo el universo base; A/B son sub-selecciones explícitas mostradas aparte).
- **Export** (Excel+PDF): definición de A, definición de B, métricas A/B, Δ, Δ%, fecha/hora, logo, avisos de cobertura; dataset = comparador visible.

## 3.5 Set helpers (solo lo necesario, sin parser)
Centralizar en `friskuBI.js` (o `friskuSets.js`): `metricEnEstado(facts, sel, metric)`, `dif(a,b)`, `difPct(a,b)`, `factsIgnoring` (ya existe), `factsKeeping(facts, sel, keepKeys)`, `participacion` (ya existe). **Sin** sintaxis Qlik ni parser. **No** cambiar resultados actuales: si alguna centralización alterara un número, STOP + antes/después.

## 3.6 No regresión (tests a garantizar)
Unitarios (motor/helpers, jest): asociativo (4 estados), OR/AND, multi-select, `applySel`, lock (clearAll conserva lock / clearDim respeta lock / undo-redo restauran lock), bookmark serialize→deserialize→validate (campo inexistente ignorado), A/B independencia + Δ/Δ% + B=0 + sin datos + count-distinct. Manual (runtime): universo visible = exportado; Tabla/Pivot/gráficos/Drill/presets/fullscreen sin pérdida; H1 Unicode intacto; P1.9e sin regresión.

---

## Gate P2.0 — evaluación de las 5 condiciones de seguridad
| Condición | ¿Se activa? |
|---|---|
| ¿Requiere cambios productivos de datos? | **NO** (bookmarks en localStorage; A/B y locks son estado en memoria) |
| ¿Requiere tocar otro bounded context? | **NO** (solo archivos Frisku) |
| ¿Cambia métricas existentes? | **NO** (reutiliza `metric.calc`; set helpers sin cambiar resultados) |
| ¿Requiere dependencia pesada? | **NO** (todo con lo existente; export con jsPDF/ExcelJS ya presentes) |
| ¿Ambigüedad financiera? | **NO** (Δ/Δ% definidos; B=0/sin datos explícitos; count-distinct recalculado; cobertura conservada) |

**Resultado del gate: SEGURO en las 5 condiciones.**

**Nota de riesgo (no-safety) para confirmación:** la restauración de config de objeto en bookmarks (§3.2) y el lock (§3.3) tocan el provider y los objetos P1.9e. Es **seguro** (no datos/métricas/contexto), pero conlleva **riesgo de regresión P1.9e** que yo **no puedo verificar en runtime** (login). Por eso se implementa con el patrón no-invasivo descrito + tests de no-regresión, y la validación runtime final queda del lado del CFO.

**Orden de implementación:** P2.1 Bookmarks → P2.2 Locks (evoluciona esquema de bookmark a `locked[]`) → P2.3 A/B. Cada uno: commit atómico, build + tests, sin merge.

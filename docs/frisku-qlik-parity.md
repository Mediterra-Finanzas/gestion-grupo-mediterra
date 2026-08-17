# Qlik Parity — matriz Qlik → Frisku Reportería BI

Base de código: `main @ 1eca9d3` (post **P1.9e** Unified Analysis Workspace + **H1** PDF
Unicode/typography). Fuente conceptual: `qlik-research-findings.md`.
Objetivo: que un usuario de Qlik pueda hacer en Frisku, como mínimo, los mismos flujos
analíticos relevantes del negocio — seleccionar → asociar → explorar → comparar →
profundizar → volver → exportar — de forma más clara e integrada con la operación.

**Estados de clasificación:** `IGUAL` · `EQUIVALENTE` · `PARCIAL` · `FALTA` · `NO APLICA`.
Se clasifica por **comportamiento real**, no por parecido visual. Un ítem PARCIAL/FALTA
**no puede desaparecer silenciosamente** en un refactor visual (regla de no-regresión).

Última revalidación: 2026-08-14, contra código (no memoria).

---

## 1. Arquitectura actual de Reportería BI

Reportería BI = **3 hojas** (consolidación P1.9e; antes eran 15):

| Hoja | Contenido |
|---|---|
| **📈 Resumen** | Dashboard ejecutivo (KPIs, réplica fija). Gated por `permResumen`. |
| **🔬 Análisis** | **Unified Analysis Workspace** — un solo instrumento BI (ver §2). |
| **📋 Reportes** | `ReportesTab`: 6 reportes BI con export Excel/PDF. Gated por `permReportes`. |

`SelectionBarBI` es **permanente** en toda Reportería BI (encima de las 3 hojas): una sola
selección global para todas las hojas y objetos.

## 2. Dentro de 🔬 Análisis (`AnalysisWorkspace`)

Un solo workspace, **no** pestañas por dimensión/gráfico. Componentes:

- **Selection Bar** (permanente, arriba, a nivel de Reportería BI): estado global inmutable
  al cambiar Preset/Visualización.
- **Toolbar** del workspace: `Preset` + `Visualización` + (derecha) controles **únicos**
  `⛶ Pantalla completa · ↓ Excel · ↓ PDF`.
- **Panel lateral** colapsable (◧ Panel):
  - **FILTROS** — Filter Pane asociativo (9 dimensiones, 4 estados, menú ⋯) común a todo el workspace.
  - **PROPIEDADES** — configuración del objeto activo (dims/medidas/orden, filas/columna/medida, fuente/medida/desglose/TopN, grupo de drill), portada al panel vía React portal.
- **Canvas** dominante (dimensionado al viewport; se expande al colapsar el panel).
- **Preset** (§4) y **Visualización** (§3), con **selección global persistente** al cambiar cualquiera.
- **export** y **fullscreen** unificados (§K/§O).

### 3. Visualizaciones (dentro de Análisis, preset Libre)
`▦ Tabla` · `⊞ Pivot` · `▮ Barras` · `◔ Dona` · `📈 Tendencia` · `⛏ Drill`.
(Barras/Dona/Tendencia reutilizan los renderers de `TableroAsociativo` — mismo motor,
sin duplicar métricas; el tipo de gráfico lo fija la Visualización.)

### 4. Presets
`Libre` (viz configurable) · `🤝 Comercial` · `📅 Semanal` · `📊 Comparativo`.
En presets curados, el selector Visualización se deshabilita (usan renderer propio);
Selection Bar, Filter Pane, export y fullscreen se comparten.

---

## 5. Matriz Qlik → Frisku (revalidada contra código P1.9e + H1)

### A. Motor asociativo
| Capacidad Qlik | Frisku (comportamiento real) | Estado |
|---|---|---|
| Selección global entre hojas/objetos | provider único `FriskuBIProvider`; una `sel` | IGUAL |
| SELECTED / POSSIBLE / ALTERNATIVE / EXCLUDED | 4 estados con color en `FilterFieldBI`; `associativeValues` (tests) | IGUAL |
| OR intra-dim / AND inter-dim | `matchFacts` (tests) | IGUAL |
| Multi-select | toggle en panel/tablas/gráficos | IGUAL |
| Clear field / clear all | menú ⋯ por campo + Limpiar todo | IGUAL |
| Back / Forward | undo/redo (60 estados) en el provider | IGUAL |
| Selección desde objetos | Tabla/Pivot/Barras/Dona/Drill togglean; **Tendencia** filtra por punto | EQUIVALENTE |
| Persistencia de selección al cambiar visualización | misma `sel` al cambiar viz/preset (verificado en hotfix) | IGUAL |
| Frecuencia / conteo por valor | nº al lado en el listbox | IGUAL |
| Seleccionar posibles / alternativos / excluidos / invertir | menú ⋯ del Filter Pane | IGUAL |

### B. Selection Bar
| Capacidad | Frisku | Estado |
|---|---|---|
| Selección global / chips por dim / quitar valor / quitar dim / clear all / Back-Forward | `SelectionBarBI` | IGUAL |
| Consistencia con Filter Pane | mismo motor; UI distinta (barra vs panel) | EQUIVALENTE |
| Persistencia entre Preset/Visualización | sí | IGUAL |

### C. Filter Pane
| Capacidad | Frisku | Estado |
|---|---|---|
| Múltiples dims / búsqueda / 4 estados / multi-select / acciones ⋯ / consistencia motor | `FilterFieldBI` en panel FILTROS | IGUAL |
| Densidad / usabilidad premium | funcional; refinamiento visual pendiente | EQUIVALENTE (afinamiento → V1) |

### D. Straight Table (▦ Tabla)
| Capacidad | Estado |
|---|---|
| Dims + medidas configurables, orden, búsqueda, selección desde celda, totales, **count-distinct correcto** (`metric.calc`), participación, scroll, sticky header/total, **detalle de contenedores + avisos calidad/cobertura** (fusión HojaBIDim), navegación `→ Ver embarque`, Excel, PDF, fullscreen | IGUAL |

### E. Pivot (⊞ Pivot)
| Capacidad | Estado |
|---|---|
| Filas jerárquicas × columna × medida, expandir/contraer, totales/subtotales, **count-distinct recalculado (no suma subtotales)**, selección desde dim/col, Excel, PDF, fullscreen | IGUAL |

### F. Gráficos (▮ Barras / ◔ Dona / 📈 Tendencia)
| Capacidad | Estado |
|---|---|
| Dimensión, medida, desglose, Top N, interacción, selección desde gráfico, participación, Excel(dataset)/PDF/fullscreen | IGUAL / EQUIVALENTE |
| Tooltips analíticos | `<title>` SVG básicos | PARCIAL |

### G. Drill-down (⛏ Drill)
| Capacidad | Estado |
|---|---|
| Grupos Comercial/Logístico/Mercado, jerarquías, breadcrumb propio, **drill local ≠ selección global**, "↥ Aplicar como selección", subir/bajar niveles, métricas correctas, export, fullscreen | IGUAL |

### H. Exploración self-service
| Capacidad | Estado |
|---|---|
| Dimensión × medida × visualización sin depender de reportes prearmados | IGUAL |
| Misma fuente de datos para TODOS los objetos | gráficos eligen fuente (liq/embarques/programa/PO); Tabla/Pivot/Drill usan la tabla de hechos de embarques | PARCIAL |

### I. Presets curados
| Capacidad | Estado |
|---|---|
| Comercial/Semanal/Comparativo dentro del mismo workspace; respetan Selection Bar, filtros globales, export, fullscreen, navegación, métricas | IGUAL |

### J. Set analysis / helpers
| Capacidad | Estado |
|---|---|
| Ignore field, denominadores, participación, count-distinct, universos de selección | `factsIgnoring/metricOverIgnoring/participacion` (tests) | IGUAL |
| Expresiones de conjunto arbitrarias in-línea (`sum({<Year={2024}>}…)`) | FALTA |

### K. Export
| Capacidad | Estado |
|---|---|
| Excel/PDF por objeto (Tabla/Pivot/Barras/Dona/Tendencia/Drill/Comercial/Semanal/Comparativo/Reportes/Packing List) desde controles **únicos** del workspace | IGUAL |
| **Lo exportado = exactamente el universo visible** (selección/preset/viz) | **IGUAL** — corregido (ver §7 stale export) |

### L. Bookmarks (P2.1 — implementado, pendiente validación runtime)
| Capacidad | Estado |
|---|---|
| Guardar / recuperar / nombrar / eliminar, por usuario, persistente | `friskuBookmarks.js` + control "★ Vistas" en el workspace; localStorage por `usuarioActual.nombre`; esquema versionado v2 tolerante | **EQUIVALENTE** |
| Restaura selección + preset + visualización + panel (atómico) | sí (`applySel` + estado del workspace en un render) | **EQUIVALENTE** |
| Restaura config intra-objeto (columnas Tabla / layout Pivot / nivel Drill / gráfico) | esquema reserva el campo `obj`; **pendiente P2.1b** (toca objetos P1.9e → validación runtime) | **PARCIAL** |
> localStorage por usuario (aislado, sin Supabase, sin compartir en esta fase). Tests: 29/29.

### M. Lock selections (P2.2 — implementado, pendiente validación runtime)
| Capacidad | Estado |
|---|---|
| Bloquear campo (no se limpia con «Limpiar todo») | historial `{sel, locked}`; chip 🔒/🔓 en la Selection Bar; reductores puros; bookmarks guardan/restauran locks | **EQUIVALENTE** |
| clearDim respeta lock · undo/redo restauran sel+lock · preset/viz no alteran locks | sí | **EQUIVALENTE** |
> Tests de reductores: 20/20.

### N. Alternate States / comparador A-B (P2.3 — implementado, pendiente validación runtime)
| Capacidad | Estado |
|---|---|
| Dos selecciones independientes A/B (reales) | preset "⇆ A/B": snapshots independientes de la barra global (fijar/swap/copiar/editar/limpiar); `friskuCompare.js` sobre `metric.calc` | **EQUIVALENTE** |
| A · B · Δ · Δ%; cero real vs "Sin datos suficientes"; count-distinct por estado; export Excel/PDF | sí; Δ% relativo a \|B\| (— si B=0) | **EQUIVALENTE** |
| Comparación por temporada (fija) | **Comparativo**: A/B de temporadas, respeta selección global salvo la dimensión temporada | **IGUAL** (se conserva, es complementario) |
> El comparador A/B (Alternate States) **no** reemplaza el Comparativo fijo por temporada. Tests: 17/17.

### O. Fullscreen
| Capacidad | Estado |
|---|---|
| Preserva selección / propiedades / preset / visualización / ruta de drill (FullscreenBI del objeto, sin remount) | IGUAL |

### Visual / Presentación
| Aspecto | Estado |
|---|---|
| Superficie de exploración unificada (workspace) vs dashboard genérico | IGUAL (P1.9e) |
| Identidad visual propia (no clon de Qlik) | IGUAL |
| **PDF Unicode/typography** (tildes/ñ/ü OK; Δ→Variación, →→>, emojis eliminados) | **IGUAL** — corregido (H1, §7) |
| Densidad/tipografía/tokens premium (Design System) | PARCIAL (→ V1) |

### NO APLICA
NPrinting / scheduling / distribución server-side / alertas server: **NO APLICA** (Frisku no los usa).

---

## 6. Correcciones registradas explícitamente
- **Stale export = CORREGIDO** (hotfix P1.9e-h1, `useExportTrigger` con latest-ref): el export consume el estado del render vigente → **el universo exportado = el visible**.
- **PDF Unicode/typography (H1) = CORREGIDO** (`src/pdfText.js` + `configureFriskuPdf`): tildes/ñ/ü/ö/ß intactas; `Δ`→`Variación`, `Δ%`→`Variación %`, `→`→`>`, emojis decorativos eliminados; sin mojibake. Sin fuente adicional (0 bytes al bundle).
- **Excel Unicode = SIN PROBLEMA** (ExcelJS es UTF-8 nativo; emojis/`Δ`/tildes correctos).
- **Bookmarks = IMPLEMENTADO (P2.1)** — UI "★ Vistas" + localStorage por usuario; pendiente validación runtime. Config intra-objeto → P2.1b.
- **Lock selections = IMPLEMENTADO (P2.2)** — chip 🔒 en Selection Bar; pendiente validación runtime.
- **Alternate States reales = IMPLEMENTADO (P2.3)** — preset "⇆ A/B"; pendiente validación runtime. **Comparativo fijo por temporada = se conserva** (complementario, ≠ Alternate States).

## 7. Brechas funcionales candidatas a P2 (ordenadas por prioridad)
1. ~~**Bookmarks**~~ — **HECHO (P2.1)**, salvo config intra-objeto (**P2.1b** pendiente: toca objetos P1.9e, requiere validación runtime).
2. ~~**Alternate States / comparador A-B reales**~~ — **HECHO (P2.3)**.
3. ~~**Lock de selecciones**~~ — **HECHO (P2.2)**.
4. **Uniformidad de fuente de datos entre todos los objetos** — hoy solo los gráficos eligen fuente; Tabla/Pivot/Drill usan embarques. **(P2.4, pendiente)**
5. **Tooltips analíticos** más ricos (hoy `<title>` básicos). **(P2.4, pendiente)**
6. (Menor) **Set-analysis con expresiones de conjunto arbitrarias.** Helpers necesarios ya centralizados en `friskuCompare.js` (`metricEnEstado`/`dif`/`difPct`) + `friskuBI.js` (`factsIgnoring`/`participacion`); un parser de expresiones sigue siendo **FALTA** (no prioritario).

**Estado P2:** P2.1/P2.2/P2.3 implementados en `frisku-p2-dev` (commits atómicos, build CI=true OK, 66 tests puros verdes), **detenido para validación runtime** del CFO antes de P2.4 (uniformidad de fuente + tooltips) y P2.1b (config intra-objeto en bookmarks). Cada sub-fase actualiza esta matriz y pasa no-regresión.

## 8. No regresiones P1.9e
La consolidación visual (15 → 3 hojas; objetos bajo un solo workspace) **redujo navegación, no potencia analítica**. Se conservaron todas las capacidades previas:
- Cada objeto conserva su configuración, selección, export y fullscreen.
- Los filtros se **unificaron** en el panel (Filter Pane común), sin perder los 4 estados ni las acciones ⋯.
- La **selección persiste** entre visualizaciones y presets (mismo `FriskuBIProvider`).
- **HojaBIDim** (detalle de contenedores + avisos calidad/cobertura) se **fusionó** en la Tabla — no se perdió.
- Cambió el **camino de acceso** (de pestañas a Preset+Visualización), no las capacidades.
Resultado: **0 regresiones** detectadas respecto al estado pre-P1.9e.

## 9. Principio permanente — Qlik como benchmark funcional / Frisku como identidad visual
Regla obligatoria: **Qlik = benchmark funcional; Frisku = identidad visual.** No se busca clon
visual de Qlik ni una versión simplificada. La consolidación visual y cualquier evolución de
Design System/UX **nunca** puede eliminar potencia analítica. Si una simplificación visual
implica perder una capacidad existente → **DETENERSE Y REPORTAR** antes de modificarla. Todo
ítem `PARCIAL`/`FALTA` de esta matriz debe permanecer registrado y no desaparecer en refactors.

---

## Historial
- **P0:** 4 estados asociativos, Selection Bar global, Back/Forward, multi-select, frecuencia.
- **P1:** Straight Table configurable, Pivot, Drill groups + breadcrumb, Explorador, Filter Pane (4 estados + acciones ⋯), set helpers, export/fullscreen por objeto, participación/ignoring. Tests de motor.
- **P1.9e:** Unified Analysis Workspace (Resumen/Análisis/Reportes; Preset + Visualización; panel FILTROS/PROPIEDADES; canvas; export/⛶ unificados) + hotfix **stale export**.
- **H1:** PDF Unicode/typography.

# Qlik Parity — matriz Qlik → Frisku Reportería BI

Base: `qlik-research-findings.md` (docs oficiales help.qlik.com ya citados) +
estado del código tras P0. Objetivo: que un usuario de Qlik reconozca en Frisku
cómo seleccionar → asociar → explorar → comparar → profundizar → volver → exportar.

Estados: IGUAL · SIMILAR · PARCIAL · FALTA. (Tras P0 = commits `e47f2db`, `d225785`.)

## Selección asociativa (núcleo)
| Capacidad Qlik | Comportamiento Qlik | Frisku (post-P0) | Estado | Acción |
|---|---|---|---|---|
| Selección global entre hojas | una selección para toda la app | provider único `friskuBI`, compartido | IGUAL | — |
| Multi-select (OR intra-dim) | varios valores por campo | toggle en filtros/gráficos/rankings | IGUAL | — |
| AND entre dimensiones | intersección entre campos | `matchFacts` | IGUAL (test) | — |
| **SELECTED** (verde) | valor elegido | ☑ verde | IGUAL | — |
| **POSSIBLE** (blanco) | compatible, sin selección propia | ☐ neutro | IGUAL | — |
| **ALTERNATIVE** (gris claro) | compatible pero el campo tiene selección | ☐ gris claro, sección propia | IGUAL (nuevo P0) | — |
| **EXCLUDED** (gris oscuro) | incompatible por otro campo | ☐ gris oscuro tachado | IGUAL | — |
| Frecuencia por valor | recuento por valor | nº de registros al lado | SIMILAR | — |
| Cambiar selección sin limpiar | reabrir y elegir otro | dropdown propio | IGUAL | — |
| Buscar dentro del filtro | search en el listbox | search en FiltroMultiBI | IGUAL | — |
| **Selections bar** | barra global con selecciones | `SelectionBarBI` (agrupada por dim) | IGUAL (nuevo P0) | — |
| **Back / Forward** | historial de selecciones | undo/redo en el provider (60 estados) | IGUAL (nuevo P0) | — |
| Clear all / clear field | limpiar todo / un campo | Limpiar todo / ✕ por dim | IGUAL | — |
| Select possible/all | seleccionar posibles | "Sel. compatibles" en el filtro | SIMILAR | — |
| Select excluded / invert | seleccionar excluidos / invertir | acciones ⋯ en Filter Pane (posibles/alternativos/excluidos/invertir) | IGUAL (nuevo P1.8) | — |
| **Lock selección** | bloquear un campo | — | FALTA | P2 (evaluar) |
| **Filter pane** persistente multi-dim | panel lateral con varios listboxes | Filter Pane colapsable "🔎 Filtros" (9 dims, 4 estados, ⋯) | IGUAL (nuevo P1.8) | — |
| **Alternate states** (A/B) | comparar 2 selecciones | Comparativo por temporada (fijo) | PARCIAL | P2 (Comparador A/B) |
| **Bookmarks** / vistas guardadas | guardar selección+vista | `applySel` listo en motor; sin UI | PARCIAL | P2 |

## Exploración y análisis
| Capacidad Qlik | Frisku | Estado | Acción |
|---|---|---|---|
| Click en gráfico → selección | barras/dona/pipeline/ranking togglean | IGUAL | — |
| Selección uniforme en objetos | mayoría togglea; tendencia/tabla sí | SIMILAR | revisar uniformidad P1 |
| Drill-down agregado→detalle | fila→filtra todo→detalle→registro | SIMILAR | — |
| **Drill-down groups** (jerarquía que avanza de nivel) | hoja "⛏ Drill": Comercial/Logístico/Mercado, ruta local | IGUAL (nuevo P1.6) | — |
| Breadcrumb de drill (≠ selecciones) | breadcrump propio, separado de la Barra; "↥ Aplicar como selección" | IGUAL (nuevo P1.6) | — |
| **Straight table** configurable (dims/medidas, ordenar, buscar, columnas) | hoja "▦ Tabla": ⚙ columnas, orden, búsqueda, % participación | IGUAL (P1.3) | — |
| **Pivot table** (filas/cols/medida, expandir) | hoja "⊞ Pivot": 2 filas jerárquicas × 1 col × medida, expandir/totales | IGUAL (nuevo P1.5) | — |
| Set analysis (mantener/ignorar dim, % del universo) | helpers `factsIgnoring/metricOverIgnoring/participacion/invertSelection` (con tests) | IGUAL (nuevo P1.15) | — |
| Export por objeto | Tabla/Pivot/Explorador exportan Excel/PDF propios | IGUAL (P1.4/P1.7) | — |
| Fullscreen de objeto | Tabla/Pivot/Explorador con ⛶ (FullscreenBI) | IGUAL (nuevo P1.4/P1.7) | — |
| Tooltips analíticos | `<title>` básicos en SVG | SIMILAR | mejorar P1 |
| Sheet navigation | tabs de hojas | SIMILAR | — |

## Visual
| Aspecto | Frisku | Estado |
|---|---|---|
| Superficie de exploración vs dashboard | mezcla KPI cards + tablas | PARCIAL (densificar P1) |
| Filtros bien definidos | sí (listbox 4 estados) | IGUAL |
| Tablas protagonistas | sí en hojas de dimensión | SIMILAR |
| Branding propio (no copiar Qlik) | identidad Frisku, semántica de color adaptada | IGUAL |

## Resumen de brechas (qué falta para "sentirse Qlik")
- **P1 (análisis): COMPLETO.** Straight table configurable; Pivot table; drill-down
  groups + breadcrumb de drill; helpers de set-analysis; export/fullscreen por objeto;
  Filter Pane persistente con acciones de campo (posibles/alternativos/excluidos/invertir).
- **P2 (comparación, pendiente):** Comparador A/B (alternate states); Bookmarks (UI, el
  motor ya tiene `applySel`); Lock de selecciones.

## Hecho en P0
4 estados asociativos (selected/possible/alternative/excluded) con color · historial
back/forward · Selections bar global · multi-select uniforme · acción "seleccionar
compatibles" · frecuencia · tests de semántica asociativa.

## Hecho en P1 (esta intervención)
Catálogo central único (`FRISKU_DIMS`/`FRISKU_METRICS`) · **Straight Table** (⚙ columnas,
orden, búsqueda, % participación, export, ⛶) · **Pivot** controlada (2 filas jerárquicas ×
1 columna × medida, expandir/contraer/totales, count-distinct con `metric.calc`) · **Drill
groups** (Comercial/Logístico/Mercado) con ruta local y breadcrumb propio (drill ≠ selección)
· **Explorador** analysis mode con ⛶ pantalla completa · **Filter Pane** persistente (9 dims,
4 estados, menú ⋯ posibles/alternativos/excluidos/invertir/limpiar) · **set helpers**
(`factsIgnoring/metricOverIgnoring/participacion/invertSelection`). Tests 22/22.
Un solo motor (`FriskuBIProvider`), una sola selección, mismas métricas en todas las hojas.

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
| Select excluded / invert | seleccionar excluidos / invertir | — | FALTA | P1 (acciones en menú del filtro) |
| **Lock selección** | bloquear un campo | — | FALTA | P0-restante (evaluar) |
| **Filter pane** persistente multi-dim | panel lateral con varios listboxes | filtros por dropdown (listbox por dim) | PARCIAL | P1 (drawer/pane expandible) |
| **Alternate states** (A/B) | comparar 2 selecciones | Comparativo por temporada (fijo) | PARCIAL | P2 (Comparador A/B) |
| **Bookmarks** / vistas guardadas | guardar selección+vista | `applySel` listo en motor; sin UI | PARCIAL | P2 |

## Exploración y análisis
| Capacidad Qlik | Frisku | Estado | Acción |
|---|---|---|---|
| Click en gráfico → selección | barras/dona/pipeline/ranking togglean | IGUAL | — |
| Selección uniforme en objetos | mayoría togglea; tendencia/tabla sí | SIMILAR | revisar uniformidad P1 |
| Drill-down agregado→detalle | fila→filtra todo→detalle→registro | SIMILAR | — |
| **Drill-down groups** (jerarquía que avanza de nivel) | perspectivas + "Agrupar por" (manual) | PARCIAL | P1 (grupos DRILL_LOGISTICA/COMERCIAL) |
| Breadcrumb de drill (≠ selecciones) | no separado | FALTA | P1 |
| **Straight table** configurable (dims/medidas, ordenar, buscar, columnas) | tabla ordenable+buscable; columnas fijas | PARCIAL | P1 (elegir columnas/medidas) |
| **Pivot table** (filas/cols/medida, expandir) | — | FALTA | P1 (pivote controlada) |
| Set analysis (mantener/ignorar dim, % del universo) | `avgCommissionPct` etc.; sin helper general | PARCIAL | P1 (helpers set) |
| Export por objeto | export por hoja (Excel/PDF) | PARCIAL | P1 (export por tabla/pivot) |
| Fullscreen de objeto | — | FALTA | P2 |
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
- **P0 restante:** Lock de selecciones; select excluded/invert.
- **P1 (análisis):** Straight table con columnas/medidas configurables; **Pivot table**; drill-down groups reales + breadcrumb de drill; helpers de set-analysis; export por objeto; uniformar selección en todos los gráficos; Filter Pane persistente (drawer).
- **P2 (comparación):** Comparador A/B (alternate states); Bookmarks (UI, motor ya tiene `applySel`); fullscreen de objetos.

## Hecho en P0 (esta intervención)
4 estados asociativos (selected/possible/alternative/excluded) con color · historial
back/forward · Selections bar global · multi-select uniforme · acción "seleccionar
compatibles" · frecuencia · tests de semántica asociativa (8/8).

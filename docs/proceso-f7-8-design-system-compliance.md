# F7.8 — Design System Compliance

Auditoría de reutilización del sistema de diseño de Allegria Service. Fuente única: `theme.js` → `estilos.js` (tokens `C`, `TONO`, `sp`) → `components/base.jsx` (componentes) + `format.js` (presentación).

## Tokens
| Token | Definido en | Uso | Hardcode fuera de token |
|---|---|---|---|
| Colores | `theme.js` vía `C.*` | todas las pantallas | **0 hex crudos** en `pages/` |
| Tonos semánticos | `TONO` (neutral/info/primary/success/warning/danger/purple) | badges/cards | consistente |
| Spacing | `sp` (`C.sp`) | márgenes/padding | consistente |
| Tipografía | `C.font` + tamaños inline consistentes | — | sin fuentes externas |

## Componentes compartidos (base.jsx) — reutilización
`ProcButton` (primary/ghost/danger), `ProcStatusBadge`, `ProcCard`, `ProcPageHeader`, `ProcKpiCard`, `ProcLoadingState`, `ProcEmptyState`, `ProcErrorState`, `ProcDataTable` (sticky), `ProcExceptionList`, `ProcModal`, `ProcField`, `inputStyle`, `ProcConfirmAction`, `ProcAuditInfo`, `ProcToast`, **`ProcFilters`**.

| Elemento | Componente estándar | Duplicados locales |
|---|---|---|
| Botones | `ProcButton` | 0 |
| Tablas | `ProcDataTable` | **0** (`grep <table` = 0 en pages) |
| Filtros | `ProcFilters` | **0** (16 usos; 0 selects de filtro sueltos) |
| Badges/estados | `ProcStatusBadge` + `badgeDe` (37 estados) | 0 |
| Modales | `ProcModal` | 0 |
| Campos | `ProcField` + `inputStyle` | 0 |
| Empty/Loading/Error | `ProcEmptyState`/`ProcLoadingState`/`ProcErrorState` | 0 |
| Formateo | `format.js` (`formatNum/Kg/Pct/Moneda/Tarifa/Fecha/FechaLarga/FechaHora`) | **0 `toLocale`/`toFixed` ad-hoc** |
| Normalización | `normalizarNombre`/`claveNormalizada`/`sonMismaEntidad`/`sugerenciaCercana` | fuente única |

## Consolidaciones hechas en F7.8 (acotadas y seguras)
- **Chips de filtro:** lógica extraída de `ProcFilters` a helper puro `filtrosActivos` (testeable, 8 tests). Sin cambio de comportamiento.
- **Formatters:** 3 `toFixed` de porcentaje (InformeDetalle, Informes, Orden) → `formatPct`. `procesoPdf.js` → `formatNum`/`formatFechaHora`.
- **Normalización de nombres:** dropdowns/pickers y columnas restantes ruteados a `normalizarNombre` (Despachos, Informes listado, NuevaRecepcion VSelect, Programa, InformeDetalle picker). Excepción intencional: snapshot emitido de InformeDetalle y editor de Configuración (muestra el dato fuente).

## No se introdujo deuda visual (§23)
0 componentes locales nuevos duplicando estándar. Las 4 pantallas F7.7 (Tarifario/Servicios/Bases/Detalle) usan exclusivamente `ProcFilters`/`ProcDataTable`/`ProcModal`/`ProcField`/`ProcStatusBadge`/`format.js` desde su creación.

## No se hizo refactor masivo (§22)
Solo consolidaciones acotadas y seguras arriba. No se reescribieron componentes ni se cambió `theme.js`.

## Veredicto
**Design System Compliance: PASS.** Un solo lenguaje visual; sin estilos duplicados; sin hardcode de color; sin formatters/filtros/tablas paralelos.

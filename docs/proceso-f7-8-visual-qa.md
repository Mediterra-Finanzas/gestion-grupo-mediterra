# F7.8 — Visual QA (Allegria Service)

## Estado global: VISUAL LIVE BLOCKED · VISUAL QA CERTIFIED = **NO**

**Intento real de revisión en vivo:** evaluado y **bloqueado** por tres razones concretas, no por omisión:
1. **Login:** la app exige email + PIN; no dispongo del PIN.
2. **Datos `proc_*`:** el módulo está tras RLS que **deniega `anon`** (confirmado en F7.8: 25/25 vistas + tablas base deniegan anon) y la app se conecta con la anon key. Aún autenticado por email/PIN, los read-models `proc_*` responderían *permission denied* hasta que se wire el claim `empresa_id` (gate de identidad pendiente, documentado). Sin ese claim no hay pantalla con datos que revisar.
3. **Dev server concurrente:** ya hay un servidor de otra sesión corriendo en esta carpeta; levantar un segundo arriesga conflicto de puerto/estado. No se levantó para no interferir.

Por tanto: la fase se declara **FUNCTIONAL CERTIFIED** (backend + regresión + filtros + RLS + build), pero **NO VISUAL QA CERTIFIED**. No se sustituyó la revisión en vivo por capturas estáticas inventadas.

Lo que **sí** se puede certificar sin navegador es la **arquitectura visual estática** (código): estructura, tokens, componentes compartidos, consistencia. Eso es lo que evalúa esta tabla.

## Evaluación estática por pantalla

Criterios: NAV (navegación clara), JER (jerarquía), DEN (densidad), TAB (tabla estándar), FIL (filtros estándar), EST (estados badge+texto), ACC (acciones diferenciadas), RSP (responsive code), CON (consistencia). Fuente única de estilo: `theme.js`→`estilos.js`; componentes en `components/base.jsx`.

| Pantalla | NAV | JER | DEN | TAB | FIL | EST | ACC | RSP | CON | Veredicto |
|---|---|---|---|---|---|---|---|---|---|---|
| Centro de Operaciones | ✓ | ✓ | ✓ | KPI+excepciones | — | ✓ | ✓ | grid auto-fill | ✓ | PASS (estático) |
| Configuración | ✓ | ✓ | ✓ | ✓ sticky | data-driven | badge severidad | ✓ | ✓ | ✓ | PASS |
| Recepciones | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | ✓ | ✓ | ✓ | PASS |
| Nueva Recepción | ✓ | ✓ | ✓ | QcPanel | — | ✓ | ✓ | flex | ✓ | PASS |
| Detalle Recepción | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | grid | ✓ | PASS |
| Lotes / Detalle Lote | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | ✓ | ✓ | ✓ | PASS |
| Programa | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | PASS |
| Órdenes | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | ✓ | ✓ | ✓ | PASS |
| Orden (mesa de control) | ✓ | ✓ | alta | ✓ | — | ✓ | por máquina de estados | ✓ | ✓ | PASS |
| Producto Terminado | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | PASS |
| Bodega / Detalle Pallet | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | ✓ | ✓ | ✓ | PASS |
| Repaletizaje | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | PASS |
| Despachos / Detalle | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | ✓ | ✓ | ✓ | PASS |
| Informes / Detalle | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | PASS |
| Tarifario | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | badge vigencia/especificidad | crear/cerrar/anular/preview | ✓ | ✓ | PASS |
| Servicios Facturables | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | generar/manual/detalle | ✓ | ✓ | PASS |
| Pendientes de Tarifa | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | revalorizar | ✓ | ✓ | PASS |
| Bases de Cobro / Detalle | ✓ | ✓ | ✓ | ✓ sticky | ProcFilters | ✓ | aprobar/enviar/cerrar; read-only si aprobada | ✓ | ✓ | PASS |

Todas las tablas usan `ProcDataTable` (0 `<table>` crudo), encabezado **sticky**, sin UUID visibles, con empty/loading/error state. Todos los filtros usan `ProcFilters`. 0 colores hex fuera de tokens `C.*`. 0 `text-transform: capitalize`.

## Benchmark "software operacional premium" (§21)
| Criterio referencia | Estado (estático) |
|---|---|
| Sidebar persistente | ✓ (`ProcShell`, grupos por área, item activo resaltado) |
| Header compacto (context bar tenant/planta/temporada/fecha, sticky) | ✓ |
| Navegación evidente | ✓ (nav por estado + resaltado + NAV_DE_PAGE para detalles) |
| Alto aprovechamiento horizontal | ✓ (maxWidth 1240, tablas overflow-x) |
| KPIs compactos | ✓ (`ProcKpiCard`) |
| Bordes sobrios / baja ornamentación | ✓ (tokens border/shadow) |
| Jerarquía tipográfica | ✓ (tamaños/peso consistentes) |
| Tablas densas y claras | ✓ (padding 8-9px, numéricas a la derecha, badges) |
| Filtros visibles y profesionales | ✓ (chips + reset) |
| Excepciones-first | ✓ (Centro) |

**Nota honesta:** todo lo anterior es evaluación de código, no de pixel renderizado. La conformidad real de densidad/legibilidad/responsive contra la referencia del CFO exige la revisión en vivo, que queda pendiente. Ningún criterio se marca "CERTIFIED", solo "PASS estático".

## Responsive (§15) — evaluación de código
`ProcShell` tiene `useEsMovil(900)`: <900px colapsa el sidebar a un `<select>` de navegación; tablas en contenedor `overflow-x: auto`; grids `repeat(auto-fit/fill, minmax(...))`. No verificado en viewport real (BLOCKED). Riesgo bajo por construcción; certificación real pendiente de UI-live en 1440/1280/1024/768.

## Conclusión
- **VISUAL LIVE:** BLOCKED (login + RLS/anon + server concurrente).
- **Arquitectura visual estática:** PASS en las 18 pantallas.
- **VISUAL QA CERTIFIED:** **NO** — requiere ejecutar la app con datos. Recomendado: Angelo abre Allegria Service autenticado en un entorno con tenant `proc_*` y valida las pantallas contra esta tabla.

# Revisión UX/UI y accesibilidad — Gestión Grupo Mediterra

Fecha: 2026-10-06 · Revisor: subagente de diseño (solo lectura del repo) · Build revisado: `http://127.0.0.1:4173` (HEAD `a81b572`) con el Supabase falso de `scripts/e2e`.

**Cómo leer las marcas de evidencia**
- **[N]** = lo verifiqué en el navegador: captura en `cap/` o medición DOM en `cap/metricas.json`.
- **[C]** = lo inferí del código (archivo:línea). No lo verifiqué en pantalla.
- **[W]** = viene de una referencia web. Casi todos los sitios de diseño (carbondesignsystem.com, polaris, primer.style, atlassian.design, design-system.service.gov.uk, mercury.com, docs.stripe.com, odoo.com, cubesoftware.com) dieron **EGRESS_BLOCKED** por la red. Lo que cito sale de los extractos que devolvió WebSearch, no de leer la página completa. Lo marco así para no inventar contenido.

Límites de la prueba:
- Los datos son estáticos (`EMPRESAS_STATIC`), sin saldos reales salvo un saldo USD de Allegria Foods de 17.433.
- Contabilidad lee la tabla `empresas`, que el Supabase falso no emula. Con el fake sin cambios, el módulo se cae (`TypeError: l.map is not a function`) y deja la **pantalla en blanco**. Para capturarlo le agregué un stub de 4 empresas en mi script; el repo no se tocó.
- Nota posterior (agente principal): ese caso ya quedó corregido en el commit `e26cce2` (ErrorBoundaryModulo) y se verificó en el navegador sobre el build nuevo.

Capturas (3 tamaños: 1440×900, 1024×768, 390×844) tomadas en la sesión de revisión; no se versionan en el repo:
- `hub-*`, `fin-dashboard-*`, `flujo-consol-mes-*`, `flujo-consol-mes-scroll-*`, `flujo-consol-semana-*`
- `flujo-allpa-mes-*`, `flujo-allpa-semana-*`, `saldos-*`, `tareas-*`, `tareas-mensual-*`, `frisku-resumen-*`, `contabilidad-*`
- Extras: `flujo-allpa-hscroll-1440.png` y `flujo-allpa-expandido-scroll-1440.png`
- Scripts: `captura.mjs`, `kb.mjs`, `exp.mjs`, `con.mjs`

---

## 1. Hallazgos priorizados

### ALTA

**A1. El flujo semanal muestra filas que no suman el Flujo Neto de la semana [N]**
- Dónde: Allpa Farms, vista Semanal, Apr-26 (`cap/flujo-allpa-semana-1440.png`).
- Las líneas tienen todo el mes en S14 y "—" en S15–S17:
  - Egresos op. $39.939 + Costos fijos $99.678 + Impuestos $600 = $140.217
- El Flujo Neto, en cambio, reparte el mes en partes iguales:
  - S14 = S15 = S16 = S17 = −$35.054 (≈ 140.217 / 4)
  - La celda Σ Apr-26 sí muestra −$140.217.
- Un CFO que lee la fila S14 no puede cuadrar: arriba suman −140.217 y abajo dice −35.054.
- No investigué la causa: puede ser una regla de presentación de líneas base sin semanas. Falta decidir con Angelo qué debe verse. Toca la lógica mensual vs. semanal de CLAUDE.md, así que no hay que "arreglarlo" sin confirmarlo.

**A2. El mismo KPI da cifras distintas en dos pantallas sin decir el perímetro [N]**

| KPI | Dashboard (`cap/fin-dashboard-1440.png`) | Flujo Empresas › Consolidado (`cap/flujo-consol-mes-1440.png`) |
|---|---|---|
| Saldo final Jun-31 | −$6.448.787 | −$8.377.600 |
| Mínimo acumulado | −$7.276.213 ("65M") | −$8.377.600 |
| Saldo inicial | $17.433 (Saldo Banco Chile) | $200.173 |

- El Dashboard lista 5 empresas en "Ingresos proyectados" y el consolidado dice "6 empresas".
- Ninguna de las dos pantallas declara qué incluye: empresas, % de participación, escenario.
- La cabecera dice "64 meses" y el KPI "65M".
- En una app donde Angelo valida números, cada KPI necesita la etiqueta del perímetro ("Consolidado 6 sociedades · Allpa al 50/26% · Escenario Base").

**A3. Las tablas del flujo no se pueden usar con teclado [N]**
- Medí en Flujo › Mediterra mensual: 0 elementos enfocables dentro de la tabla y 138 elementos clicables (`cursor:pointer`) que son `td`, `div` o `span` (`kb.mjs`). En la vista semanal son 498.
- Dos acciones son solo con mouse: editar un valor proyectado ("Haz click en cualquier valor…", `FinanzasModule.jsx:7396`) y expandir o colapsar categorías (▶).
- Con Tab se salta de "Ingresar Real" al contenedor y de ahí a la miga de pan.
- Ningún botón expansible tiene `aria-expanded` (0 medidos).
- Incumple WCAG 2.1.1 (Teclado) y 4.1.2 (Nombre, función, valor).

**A4. Contraste insuficiente justo en las filas que más importan [N medido + C]**

Calculé los ratios WCAG con los hex de `src/theme.js` y los estilos inline.

| Uso | Par de colores | Ratio | Mínimo |
|---|---|---|---|
| Etiqueta "FLUJO NETO" (`FinanzasModule.jsx:7256-7258`, `color:C.accentL`) | #D4A574 sobre blanco | **2,23** | 4,5 |
| Aviso "Haz click…" (`:7394`) | #D4A574 sobre su tinte | **2,10** | 4,5 |
| Egresos no operacionales (`CAT_COLOR`, `FinanzasModule.jsx:1700`) | #fca5a5 sobre blanco | **1,90** (1,63 sobre bg2) | 4,5 |
| Ingresos no operacionales | #34d399 | **1,92** | 4,5 |
| Costos fijos | #f87171 sobre rowAlt | **2,46** | 4,5 |
| muted2 (subtítulos) | #8a97a8 sobre blanco | 2,97 | 4,5 |
| muted2 sobre bg | | 2,34 | 4,5 |
| warning sobre blanco | #d97706 | 3,19 | 4,5 |
| warning sobre warningBg | | 2,86 | 4,5 |
| Borde de inputs | #c5cedb sobre blanco | 1,59 | 3 (WCAG 1.4.11) |
| Zebra | rowAlt #eef2f8 vs card | 1,12 | prácticamente invisible |

- Lo visible en pantalla: en `cap/flujo-allpa-mes-1440.png` las cifras de "Egresos no operacionales" ($245.273) casi no se leen.
- `src/ux/tokens.js` ya documenta este problema (`TINTAS_PROHIBIDAS_COMO_TEXTO`), pero solo lo usa Osiris.

**A5. Cifras de 8–10 px en las tablas financieras [N]**
- Tamaño de fuente medido en los `td` del flujo, en los tres tamaños de pantalla (no se adapta):
  - Allpa mensual: 150 celdas a 9 px, 28 a 10 px, 22 a 11 px.
  - Semanal: 360 celdas a 9 px.
  - Consolidado: 152 a 10 px y 19 a 9 px.
- Cabeceras de mes a 8 px.
- En el resto del código hay 271 `fontSize:9`, 55 `fontSize:8` y 32 tamaños de 7–7,5 px [C, grep].
- El gráfico SVG escala sus etiquetas con el ancho: el eje Y llega a unos 20 px, más grande que los KPI (`cap/fin-dashboard-1440.png`). La jerarquía queda invertida.

**A6. Al hacer scroll se pierde la cabecera de meses en tablas largas (doble scroll) [N]**
- Una categoría expandida de Allpa Farms tiene 89 filas.
- La tabla vive en un contenedor `max-height:720px; overflow-y:auto` con `thead` sticky (`FinanzasModule.jsx:4685`, `:6412`).
- Si el usuario hace scroll con la página (lo natural) y no dentro de la tabla, la cabecera queda fuera de la vista (`thead top = −158px`) y se ven filas sin saber de qué mes son (`cap/flujo-allpa-expandido-scroll-1440.png`).
- En la vista sin expandir el contenedor mide 318/316 px, así que no hay scroll interno y el sticky nunca se activa.
- La primera columna fija sí funciona (10/10 celdas sticky, `cap/flujo-allpa-hscroll-1440.png`).

**A7. Un error en un módulo deja la pantalla en blanco [N en el build servido]**
- Contabilidad sin la tabla `empresas` termina en blanco. `AppErrorBoundary` envolvía solo el hub.
- El mensaje de esa misma boundary usa texto `#e6edf3` sobre `C.bg #dfe5ee` (contraste **1,07**) y afirma "Tu trabajo está guardado" sin comprobarlo (`App.jsx` HEAD, líneas 23-48).
- El árbol de trabajo trae `ErrorBoundaryModulo.jsx`, que corrige las dos cosas (sin commit). Hay que verificar después del build.

### MEDIA

**M1. Formato numérico y de fechas mezclado en_US / es_CL [N + C]**

| Pantalla | Formato |
|---|---|
| Flujo, Dashboard | "$39,939" con coma, `$$`, `FinanzasModule.jsx:1673`, `toLocaleString("en-US")` |
| Saldos Bancos | "$17.433 USD" con punto |
| Meses | Inglés (`MN` en `:27`: Jan/Apr/Aug) |

- En Chile la coma es el separador decimal: "$39,939" se puede leer como 39 con decimales. Hay que unificar en `es-CL` con un único formateador.
- Las tablas muestran los egresos en positivo (en rojo) y el flujo neto con "−$". Conviene que el signo sea explícito y consistente; color y signo deben decir lo mismo (WCAG 1.4.1, no depender solo del color).

**M2. Navegación: cada módulo resuelve el regreso a su manera [N]**

| Módulo | Volver al hub | Pestañas |
|---|---|---|
| Finanzas | "Mediterra ›" en una tarjeta azul flotante con borde redondeado | Píldoras |
| Tareas | "Mediterra › Seguimiento de Tareas" en una barra a todo el ancho | Subrayadas |
| Frisku | Botón "← Mediterra" a la derecha | Subrayadas |
| Contabilidad | Botón "← Inicio" a la izquierda | Subrayadas |

- Cambiar de empresa en Flujo funciona bien (una fila de 10 chips), pero Mediterra no tiene un selector de sociedad global ni búsqueda.
- Para pasar de Flujo de Allpa a Tareas de Allpa hay que volver al hub (2–3 clics).
- El hub tiene 7 tiles gigantes sin un solo dato de negocio (`cap/hub-1440.png`). En 390 px solo cabe 1,3 tiles (`cap/hub-390.png`).

**M3. La jerarquía de alertas está diluida [N]**
- En el hub, el aviso "Respaldo automático temporalmente suspendido" sale en amarillo con un ícono de 1 px, que se ve como un punto (`cap/hub-1440.png`).
- "29 vencidas" de Tareas solo aparece dentro del módulo; el hub no lo muestra.
- Frisku pinta "0 clientes activos" en verde, "24 especies" en naranja y "0 pendientes" en verde (`cap/frisku-resumen-1440.png`). El color no representa ningún estado.
- En Flujo el gráfico ocupa más espacio que la tabla, y la tabla es la herramienta principal.

**M4. Formularios sin nombre accesible [N]**
- Saldos Bancos: 110 de 110 inputs sin `label`/`aria-label`. Solo se identifican por su posición en la fila banco/moneda.
- Tareas: 30 botones de semáforo sin nombre (círculos vacíos). El estado se comunica solo con color.
- Hay 223 atributos `aria-` en todo `src` y casi todos están en Osiris (`src/ux/`) [C].
- No hay ningún `h1`, ningún landmark (`main`/`nav`) ni regiones `aria-live` en Finanzas, Hub ni Tareas (0 medidos).

**M5. El foco existe, pero es el del navegador [N]**
- En el hub, Tab recorre los botones con `outline:auto 1px`, el outline nativo (`cap/hub-foco-1440.png`).
- En inputs, `index.css` pone `outline:none` y un anillo `rgba(30,39,97,0.18)`, que sobre blanco queda bajo 3:1 (WCAG 2.4.11/1.4.11). Hay 75 `outline` inline en Finanzas [C].

**M6. Consistencia visual [C + N]**
- **Paletas:** 8 objetos `C` (uno por módulo).
  - 6 derivan de `theme.js`, pero renombran tokens de forma contradictoria: `accent` es `primary` en Finanzas, `danger` en Frisku/Allegria e `info` en EEFF.
  - Contabilidad tiene paleta propia (`ContabilidadModule.jsx:57`, primary `#4f6ff0`, no es el navy de marca) y App la envuelve en fondo oscuro `#0f1117` (`App.jsx:3805`).
  - `src/ux/tokens.js` es una novena capa.
  - Hay 184 hex distintos en los `.jsx`.
- **Tipografía:** más de 25 tamaños de fuente distintos (7; 7,5; 8; 8,5; 9; 9,5; 10; 10,5; 11; 11,5; 12; 12,5; 13; 14; 15; 16; 17; 18; 19; 20; 22; 24; 28; 30; 32 px).
- **Emojis como íconos:** más de 1.800 en Finanzas y más de 1.300 en Frisku, uno en cada pestaña y chip. Cada sistema operativo los dibuja distinto, el lector de pantalla los lee ("gráfico de barras Dashboard") y en el hub aparecen duplicados ("📋 📋 Seguimiento Tareas" en el nombre accesible).

**M7. Responsive: en móvil hay contenido recortado sin scroll [N]**
- Saldos 390: el contenedor mide 563 px en un viewport de 390 y la página no hace scroll horizontal. Las tarjetas quedan cortadas a la derecha; "Total Chile" no se ve (`cap/saldos-390.png`).
- Flujo 390: antes de la primera cifra hay unos 750 px de chips y botones (`cap/flujo-allpa-mes-390.png`).
- Tareas 390: la tabla solo muestra Tarea y Responsable (`cap/tareas-390.png`).
- Botones de menos de 24 px en desktop: 7–8 en Flujo y 20 en Tareas (WCAG 2.5.8).

**M8. Estados de guardado inconsistentes [N + C]**
- Frisku muestra "● Sincronizado" en la cabecera. Finanzas no muestra nada, aunque dice "Los cambios se guardan automáticamente".
- Los mensajes de guardado son toasts temporales de 2 s ("✅ Guardado" / "⚠️ Error", `FinanzasModule.jsx:12719-12810`).
- Un error dice "Error al guardar — ver consola" (`:12903`), lo que no sirve al usuario.

### BAJA

- **B1.** Hay etiquetas casi duplicadas en los datos: "Combustibles y Lubricantes" y "Combustibles Y Lubricantes" (`cap/flujo-allpa-expandido-scroll-1440.png`). Es un tema de datos, no de UI, pero confunde.
- **B2.** "Saldo Banco (USD) · sin saldo registrado" aparece en la tabla mientras la cabecera dice "Saldo banco USD $1.828 saldo base" (`cap/flujo-allpa-mes-1440.png`). Son dos fuentes y no se entiende cuál manda.
- **B3.** El footer del hub (`© 2026…`) usa texto gris tenue con letter-spacing, por debajo de 3:1.
- **B4.** Hay buenas bases que conviene mantener [N/C]:
  - `tabular-nums` global (`index.css:106`) y alineación a la derecha (119/119 celdas numéricas).
  - Primera columna sticky.
  - Bordes que separan temporadas.
  - Celdas Σ del mes destacadas en la vista semanal.
  - Hover de fila y estado vacío explícito en Frisku ("Sin embarques con ETD futura").

---

## 2. Referencias (patrones concretos, no interfaces completas)

Todas las URL las obtuve vía WebSearch. Las páginas oficiales de diseño no cargaron por red; lo que sigue se apoya en los extractos de búsqueda.

| Referencia | Patrón para Mediterra | Por qué |
|---|---|---|
| IBM Carbon Data Table — https://www.carbondesignsystem.com/building-blocks/core/components/data-table/guidelines | 5 densidades de fila: xs 24, sm 32, md 40 (default), lg 48, xl 64 px. Números y su cabecera alineados a la derecha (`columnAlign:end`). | Flujo Empresas debería tener un selector de densidad "Compacta 24 / Normal 32" en vez de bajar la fuente a 9 px. La densidad se gana con alto de fila, no con tamaño de letra. |
| Shopify Polaris IndexTable — https://polaris-react.shopify.com/components/tables/index-table y PR https://github.com/Shopify/polaris/pull/7130 | Celdas numéricas y títulos a la derecha con estilo numérico. La columna sticky se calcula dinámicamente y deja de ser sticky si no cabe; prop `condensed` bajo 490 px. | Resuelve M7: en 390 px la primera columna del flujo (unos 250 px) se come la pantalla. Conviene una versión condensada (concepto truncado de 120 px o tarjeta por mes). |
| GOV.UK / Analysis Function — https://design-system.service.gov.uk/components/table · https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-tables/ | Columna de números a comparar alineada a la derecha. `caption` de la tabla con tamaño de encabezado. | Hoy hay 0 `caption` y 0 `scope` en las tablas. Un `<caption>` "Flujo de caja Allpa Farms · USD · Escenario Base" resuelve accesibilidad y el perímetro de A2. |
| Atlassian Dynamic Table — https://atlassian.design/components/table · Forge https://developer.atlassian.com/platform/forge/ui-kit/components/dynamic-table/ | Props estándar `emptyView` e `isLoading` (spinner sobre la página actual). | Estados de carga/vacío como parte del componente de tabla, no ad hoc por pantalla (M8). |
| Patrón carga/error/vacío (Australian Agriculture DS) — https://design-system.agriculture.gov.au/patterns/loading-error-empty-states | Tres estados diseñados juntos. | Base para el "no se pudo comprobar" que ya existe en conciliación de anticipos: generalizarlo. |
| Stripe Dashboard — https://docs.stripe.com/stripe-apps/patterns · https://stripe.com/blog/changelog | Filtros como chips mapeados a las preguntas del usuario (fecha, cliente, estado, monto), columnas configurables, vistas exportables. | Los chips de empresa y temporada del flujo ya van en esa línea. Falta mostrar el estado de los filtros activos y guardar la vista (empresa + temporada + mes/semana) por usuario. |
| Linear (Cmd+K) — https://www.setproduct.com/blog/command-palette-ui-design-guide · https://blakecrosley.com/guides/design/linear | Paleta de comandos: input con foco, recientes primero, flechas + Enter, `aria-activedescendant`, el atajo visible enseña la tecla. | Resuelve M2: "Allpa Farms flujo", "F29 Frisku", "Saldos BCI" en 2 teclas. `src/ux/BusquedaGlobal.jsx` ya implementa el combobox ARIA para Osiris; se puede reutilizar. |
| Odoo 18 — https://www.odoo.com/odoo-18-release-notes · https://www.odoo.com/documentation/18.0/applications/general/multi_company.html | Selector de compañía rápido con atajo (Alt+Shift+U) y dashboards ligados a una o varias compañías. | Un selector de sociedad persistente en la barra superior, que se mantiene al cambiar de módulo. |
| Brex Home e Inbox — https://www.brex.com/product-announcements/new-task-overview-page · https://www.brex.com/support/home-page | Inbox de tareas ordenado por urgencia, con descripción clara y botón de acción; home con saldos y atajos. | El hub debería mostrar "29 tareas vencidas", "Respaldo suspendido" y "Saldo mínimo proyectado" con su acción, en vez de 7 tiles decorativos. |
| Xero Cash Flow Manager — https://cfotech.in/story/xero-cash-flow-manager-projects-short-term-cash-moves · https://www.xero.com/us/accounting-software/analytics/cash-flow/ | Vistas de gráfico, tabla y calendario sobre la misma proyección de 7–180 días. | La vista semanal debería tener una variante "próximas 13 semanas" (horizonte de tesorería) en vez de 260 columnas. |
| Mercury — https://mercury.com/blog/may-2025-product-updates | Gráficos que se actualizan con los filtros de la tabla. | El gráfico del flujo debería reflejar la fila o categoría seleccionada, no siempre el saldo total. |
| NetSuite Redwood — https://www.houseblend.io/articles/netsuite-redwood-experience-interface-evolution | Portlets colapsables y un portlet de recordatorios en el dashboard. | Gráfico colapsable para darle la altura a la tabla (M3). |
| Notion Database Views — https://www.notion.com/help/views-filters-and-sorts | "Freeze up to column", agrupación anidada colapsable y vistas guardadas. | Agrupación categoría › línea › sublínea con estado de expansión recordado. |
| Pigment / Mosaic (FP&A) — https://www.pigment.com/platform · https://www.cfoshortlist.com/vendors/mosaic | Escenarios y drill-down a transacción. | Ya existe "Modelo: Base (original) / Nuevo escenario": hay que mostrar siempre el escenario activo en el título de tabla y KPI. Los extractos no detallan cómo es la grilla, así que no afirmo más. |

---

## 3. Dos direcciones visuales

### Dirección 1 — "Libro mayor" (sobria, densa, de herramienta)
- **Principios:** la tabla es la protagonista; color solo para el estado; un único acento de marca; cero decoración en las pantallas de trabajo.
- **Paleta:**

| Rol | Hex |
|---|---|
| Fondo app | `#F4F6F9` |
| Panel | `#FFFFFF` |
| Texto | `#18212F` |
| Texto 2 | `#4A5868` (7,3:1) |
| Bordes | `#D5DCE5`; borde de input `#8794A6` (≥3:1) |
| Marca | navy `#1E2761` |
| Negativo | `#B42318` (5,9:1) |
| Positivo | `#17663A` (6,6:1) |
| Advertencia (texto) | `#92400E` (7:1) sobre `#FEF3C7` |
| Dorado `#D4A574` | Solo como filete o borde, nunca como texto |

- **Tipografía:** Inter con `tabular-nums`. Escala de 5 pasos: 11 / 12 / 13 / 15 / 20. Cifras de tabla a 12 px como mínimo (11 en densidad compacta), cabeceras a 11 px semibold.
- **Densidad:** filas de 28 px (compacta) o 34 px (normal), seleccionable por usuario.
- **Navegación:** riel lateral izquierdo de 56/220 px con módulos; barra superior con selector de sociedad + Cmd+K + estado de guardado.

### Dirección 2 — "Tablero agrícola" (cálida, de marca, ejecutiva)
- **Principios:** primera pantalla narrativa ("¿cómo vamos? / ¿qué decido?"); cada empresa con su color de identidad; tarjetas grandes; tono de temporada.
- **Paleta:**

| Rol | Hex |
|---|---|
| Fondo | arena `#F7F3EC` |
| Panel | `#FFFFFF` |
| Texto | `#2A2520` |
| Marca | navy `#1E2761` + dorado `#B8864B` (oscurecido para 3:1 en elementos grandes) |
| Por empresa | Allegria cereza `#9F1239`, Osiris verde `#166534`, Frisku azul `#0E5A8A`, Allpa violeta `#5B21B6`, Integrity trigo `#854D0E` |

- **Tipografía:** titulares en serif humanista (Source Serif 4), datos en Inter. Escala 12 / 14 / 16 / 22 / 32.
- **Densidad:** media (filas de 40 px), con más aire.
- **Navegación:** hub con tarjetas por empresa que muestran KPI y alertas; pestañas superiores dentro de cada módulo.

### Recomendación: Dirección 1, con dos préstamos de la 2
Prefiero la Dirección 1 por estas razones:
- El trabajo diario de Angelo y su equipo es validar cifras en tablas de 64 meses × 90 filas y marcar tareas. La Dirección 1 ataca directo A3–A6 y M6.
- Reduce paletas y tamaños en vez de sumar. Además ya es casi lo que `src/ux/tokens.js` empezó a formalizar.

De la Dirección 2 tomaría:
- (a) el color de identidad por empresa, pero solo en un filete de 3 px y en el chip de sociedad;
- (b) el hub narrativo con KPI y alertas.

La serif y la densidad baja no sirven para el Flujo.

---

## 4. Requisitos concretos para un prototipo de Hub + Flujo Empresas

### Hub
1. Barra superior fija con: selector de **sociedad/perímetro** (Consolidado, 8 sociedades, Allpa con % visible), búsqueda/comandos (Cmd/Ctrl+K, combobox ARIA reutilizando `src/ux/BusquedaGlobal.jsx`), **indicador de guardado** con 3 estados (Guardado hh:mm / Guardando… / No guardado — reintentar) en `role="status"`, y menú de usuario (PIN, Salir; Permisos, Respaldo y Restaurar dentro de un menú "Administración").
2. Fila de 4 KPI con pregunta y perímetro explícitos. Ejemplo: "Saldo caja hoy — Consolidado 6 soc. · USD · al 15-09-2026". Sale de la misma función que usa el Consolidado: un número, una fuente (resuelve A2).
3. Bandeja "Requiere tu atención", ordenada por severidad, con verbo + motivo + destino. Ejemplos: "29 tareas vencidas → Ver", "Respaldo automático suspendido → Revisar", "Mínimo proyectado −8,38 MM en Jun-31 → Abrir flujo", "Valores manuales sin categoría (n) → Resolver". Severidad con ícono **y** texto, no solo color.
4. Accesos a módulos como lista o tarjetas compactas (≤ 96 px de alto) con su contador. A 390 px deben verse 4 o más sin scroll.
5. Landmarks `header`/`nav`/`main`, un `h1` por pantalla y orden de Tab lógico.

### Flujo Empresas
6. Título de tabla como `<caption>` visible: "Flujo de caja · Allpa Farms · USD · Escenario Base · Mensual". Cambia con cada filtro.
7. Barra de filtros en una sola fila (que se pliega en "Filtros (3)" bajo 700 px): Sociedad, Escenario, Granularidad Mes/Semana/13 semanas, Temporadas, Densidad, Exportar. Los filtros activos van como chips removibles.
8. Una sola zona de scroll: la tabla ocupa `calc(100vh − cabecera)` con scroll interno X/Y, la página no hace scroll mientras el cursor está en la tabla, y la cabecera de meses + temporadas y la primera columna quedan siempre sticky (resuelve A6).
9. Tipografía de cifras ≥ 12 px (11 en compacta), cabecera de mes ≥ 11 px, `tabular-nums`, todo alineado a la derecha incluida la cabecera. Formato único `es-CL`: `−39.939` con signo menos real U+2212 o paréntesis (a elegir con Angelo), y meses en español (Abr-26).
10. Signo y color coherentes: egresos con signo negativo o en una sección "Egresos" donde la cabecera lo diga. Paleta de categoría con un mínimo de 4,5:1 (sustituir `#fca5a5`, `#34d399`, `#f87171`, `#D4A574` como texto). Zebra de 1,2:1 o más, o separadores de fila de 3:1 como mínimo.
11. Jerarquía de filas: categoría en semibold con fondo tenue, subtotal con borde superior, **Flujo Neto** y **Saldo acumulado** en negrita y con contraste 7:1 o más, y temporada separada con un borde de 2 px (que ya existe).
12. Teclado:
    - Navegación tipo grid (`role="grid"`, roving tabindex): flechas entre celdas, Enter/F2 para editar, Esc para cancelar, Tab sale de la grilla.
    - Filas expandibles como `button` con `aria-expanded`.
    - Celda editable indicada con ícono o subrayado + `aria-label` "Electricidad, egr_fijo, Abr-26, 5.200 USD, editable".
    - Foco visible de 2 px a 3:1 o más.
13. Estados por celda o línea: override manual (marca + tooltip con usuario y fecha), valor calculado (cursiva, solo lectura, como la regla mensual/semanal vigente), vencido o no comprobable. Leyenda fija bajo la tabla.
14. Vista semanal: Σ del mes siempre visible y **cuadre explícito**. Si una línea no tiene semanas, mostrar "mensual sin desglose" en vez de cargar todo en S1, o decidir con Angelo la regla de presentación (A1). Opción "Próximas 13 semanas" como horizonte de tesorería.
15. Gráfico colapsable, de 160 px de alto por defecto, con etiquetas de eje de 11–12 px fijas (que no escalen con el ancho). Refleja la fila seleccionada.
16. Estados globales: skeleton de tabla al cargar; error con causa y acción ("No se pudo leer Supabase — Reintentar"; nunca "ver consola"); vacío con explicación ("Sin líneas en esta categoría — Agregar línea").
17. Responsive:
    - 1024: igual que desktop, con primera columna de 200 px.
    - 390: primera columna de 120 px con truncado + tooltip, cabecera de filtros plegada, alternativa "tarjeta por mes" (KPI del mes + categorías).
    - Sin recortes sin scroll (M7).
    - Objetivos táctiles ≥ 24 px (44 px en móvil).
18. Íconos: reemplazar emojis de pestañas y chips por un set SVG monocromo (inline, sin nueva dependencia npm; regla 8 de CLAUDE.md) con `aria-hidden`. El emoji se puede quedar solo como identidad de empresa en el chip.
19. Tokens: un solo `theme.js` ampliado con `ink.*` (texto sobre cada fondo), `densidad.*` y la escala tipográfica de 5 pasos. Los módulos no renombran `accent`. Hay que extender el test de pares de contraste (`PARES_CONTRASTE` en `src/ux/tokens.js`) a Finanzas.
20. No tocar la lógica: el prototipo es solo de presentación y debe leer los mismos `getProy(cat,label,idx)`, `flujoArr` y `buildEmpresasConOverrides`, sin alterar la regla mensual vs. semanal ni la identidad `cat::etiqueta`.

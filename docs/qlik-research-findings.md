# FASE 1 — Investigación Qlik Sense + FASE 2 — Cruce con Frisku

> **Regla de trazabilidad.** No tengo acceso al Qlik real de Frisku. Todo lo de abajo
> es investigación sobre cómo opera Qlik Sense *en general*, con su URL de fuente
> oficial. Al llevarlo al dashboard de Frisku, cada patrón queda marcado:
> - **VERIFICADO-FRISKU** — viene de `docs/frisku-qlik-audit.md` (Parte B) o de datos
>   reales en Supabase.
> - **HIPOTESIS-QLIK** — cómo Qlik suele operar / cómo se arma típicamente un dashboard
>   COMEX; es hipótesis experta hasta ver el Qlik real. Lleva su URL fuente.
>
> Fuentes priorizadas: `help.qlik.com` (oficial). `community.qlik.com` solo como apoyo.

---

## 1. Motor asociativo — selección cruzada (verde/blanco/gris)

**Hallazgo (Qlik oficial).** El filtro/objeto en Qlik colorea cada valor según su estado
frente a la selección actual. Hay **cinco estados**:

| Estado | Color | Significado |
|---|---|---|
| Seleccionado | Verde (✓) | Valores que el usuario eligió activamente |
| Posible | Blanco | Valores asociados a la selección → siguen disponibles |
| Alternativo | Gris claro | Excluidos por una selección en *el mismo campo*; volverían a ser posibles si cambia esa selección |
| Excluido | Gris oscuro | Incompatibles con la selección actual (en otros campos) |
| Seleccionado-excluido | Gris oscuro (✓) | Estaban seleccionados pero una selección posterior los dejó en conflicto |

Las selecciones son **globales**: aplican a todas las hojas de la app y todos los objetos
se recalculan al instante, antes incluso de confirmar. Seleccionar "2012" filtra los meses
de otros trimestres y actualiza todos los gráficos asociados.
Fuentes: [Selection states — Qlik Cloud](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/selection-states.htm) · [The associative selection model](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Selections/associative-selection-model.htm)

**Implicación para nuestra SPA React (HIPOTESIS-QLIK de diseño).**
- El estado de selección debe vivir **una sola vez por hoja** (un objeto `sel = {campo: Set(valores)}`),
  no por gráfico. Cada gráfico lee del mismo estado. Esto ya está implementado en el
  `TableroAsociativo` actual (VERIFICADO-FRISKU).
- Para pintar "posible vs excluido" de un campo hay que calcular las filas que cumplen la
  selección de **todos los otros** campos (dejando libre el propio). Ya lo hace
  `matchRow(row, except)` en el tablero actual.
- Falta respecto a Qlik: distinguir **alternativo (gris claro)** de **excluido (gris oscuro)**.
  Hoy agrupamos ambos como "excluido/tachado". Es un refinamiento opcional; documentarlo como
  brecha.

---

## 2. Set Analysis — subconjuntos fijos dentro de una expresión

**Hallazgo (Qlik oficial).** Set Analysis define un conjunto de datos **distinto** al de la
selección actual, dentro de una función de agregación. Sintaxis: se encierra en llaves,
ej. `Sum( {$<Year={2009}>} Sales )`. Componentes: **identificadores** (`$` = selección actual,
`1` = todo el dataset sin filtrar), **operadores** (unión/intersección/exclusión de conjuntos)
y **modificadores** (`<Campo={valores}>` que fuerzan/ignoran una selección).
Fuentes: [Set analysis and set expressions](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/ChartFunctions/SetAnalysis/set-analysis-expressions.htm) · [Syntax for set expressions](https://help.qlik.com/en-US/sense/May2023/Subsystems/Hub/Content/Sense_Hub/ChartFunctions/SetAnalysis/syntax-for-sets.htm)

**Traducción conceptual a SQL/agregación (no replicar la sintaxis Qlik).**
- `Sum({$<Year={2009}>} Sales)` ≈ `SUM(Sales) WHERE ...selección actual... AND Year=2009`,
  es decir: **tomar el filtro global y sobrescribir/forzar una condición** en esa medida puntual.
- `Sum({1} Sales)` ≈ `SUM(Sales)` **ignorando** el filtro global (total absoluto) → útil para
  denominadores tipo "% del total".
- Uso típico en Frisku (HIPOTESIS-QLIK): comparativos **temporada actual vs temporada anterior**
  en el mismo KPI (una medida con `{<Temporada={actual}>}` y otra con `{<Temporada={anterior}>}`),
  o "% que representa este cliente sobre el total del grupo" (numerador filtrado / denominador `{1}`).
- En React: se resuelve calculando una medida sobre `filteredRows` y otra sobre un subconjunto
  con una condición sobrescrita, o sobre `todasLasFilas` para el "total absoluto".

---

## 3. Tipos de visualización (dashboards COMEX / logística)

**Hallazgo (Qlik oficial).** Tipos nativos relevantes: **KPI** (una o dos cifras centrales con
etiqueta, colores condicionales), **tabla pivote** (dimensiones y medidas como filas/columnas,
análisis multidimensional), **gráfico de barras** (comparación entre categorías), **mapa**
(combina datos geoespaciales con una medida). Cada tipo tiene un propósito; se elige según qué
se quiere explorar.
Fuentes: [Choosing the right visualization](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Visualizations/creating-visualization.htm) · [When to use what type of visualization](https://help.qlik.com/en-US/sense/November2017/Subsystems/Hub/Content/Visualizations/when-to-use-what-type-of-visualization.htm)

**Composición típica de un tablero COMEX de fruta (HIPOTESIS-QLIK — patrón de negocio, no de una
página Qlik específica).**
- Fila de **KPI cards**: N° contenedores, cajas, venta destino, comisión devengada, % comisión.
- **Tabla pivote**: especie × cliente (o exportador) con la medida elegida.
- **Ranking / Pareto** de clientes o exportadores (barras ordenadas desc; los pocos que hacen el
  80%): en Qlik es un gráfico de barras ordenado, no un tipo aparte.
- **Mapa de rutas origen→destino**: requiere lat/long o nombres de puerto geocodificables.
- **Gráfico de tránsito ETD→ETA**: línea de tiempo / barras por semana de zarpe o llegada.
- Estos dos últimos son los que **hoy no tenemos** (ni componente de mapa ni eje de calendario
  ETD/ETA). Ver cruce FASE 2.

---

## 4. Patrones de reportería (export on-demand vs plantilla programada)

**Hallazgo (Qlik oficial).**
- **Export on-demand** (nativo, sin add-ons): el usuario descarga los **datos** de un objeto como
  `.xlsx`, o descarga hoja/objeto como **PDF/imagen**. Es puntual, disparado a mano, y **respeta la
  selección activa**.
  Fuentes: [Downloading and printing (overview)](https://help.qlik.com/en-US/sense/May2024/Subsystems/Hub/Content/Sense_Hub/Printing/exporting-overview.htm) · [Downloading data from a visualization](https://help.qlik.com/en-US/sense/May2025/Subsystems/Hub/Content/Sense_Hub/DataExport/export-data.htm)
- **Reporte con plantilla programado**: es **NPrinting** (o Qlik Cloud Reporting), un producto
  aparte. Genera reportes "pixel-perfect" en Excel, PixelPerfect(PDF), HTML, Word, PowerPoint,
  con distribución/scheduling.
  Fuentes: [Report output formats — NPrinting](https://help.qlik.com/en-US/nprinting/May2023/Content/NPrinting/DistributionSchedulesAutomation/Report-output-formats.htm) · [On-Demand reporting control — NPrinting](https://help.qlik.com/en-US/nprinting/May2022/Content/NPrinting/On-Demand/On-Demand-Qlik-Sense.htm)

**Decisión para Frisku (VERIFICADO — confirmado por Angelo).** Frisku **no tiene** NPrinting ni
Qlik Cloud Reporting. Por lo tanto solo replicamos el **export on-demand con marca**: botón en
pantalla → Excel y PDF con logo Frisku, encabezado (título + fecha/hora + filtros aplicados) y,
en PDF, pie de página. Nada de scheduling ni distribución.

---

## 5. Patrones de filtrado y drill-down

**Hallazgo (Qlik oficial).**
- **Filter pane**: cada dimensión muestra barritas al pie con los 4 estados (verde/blanco/gris
  claro/gris oscuro); el detalle de lo seleccionado se ve en la **selections bar** (barra
  persistente arriba de la hoja).
  Fuente: [Filter pane](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Visualizations/FilterPane/filter-pane.htm)
- **Drill-down groups**: cuando varios campos forman una jerarquía natural, se agrupan; el gráfico
  usa el primer campo con más de un valor posible y, al seleccionar, baja al siguiente nivel.
  Fuente: [Drill-down groups](https://help.qlik.com/en-US/cloud-services/Subsystems/Hub/Content/Sense_Hub/Dimensions/drill-down-groups.htm)

**Llevado a Frisku (HIPOTESIS-QLIK de diseño).**
- Barra de selección persistente + panel de filtros por dimensión: **ya implementado**
  (breadcrumb de selecciones + listboxes) en el tablero actual (VERIFICADO-FRISKU).
- Jerarquía de drill-down natural para COMEX: **país destino → puerto destino → contenedor**, o
  **temporada → semana ETD → contenedor**. Hoy no hay drill-down jerárquico (se filtra plano por
  cada dimensión). Es una brecha a implementar si el Qlik real lo usa.

---

## 6. Librería de PDF con maquetación controlada (decisión de app, no de Qlik)

No es un tema Qlik sino de nuestra SPA. Evaluación:
- **jsPDF + jspdf-autotable** (client-side) — **ya es dependencia del repo** y ya genera los PDF de
  reportes y del tablero con logo, encabezado y tablas maquetadas (`pl_loadJsPDF`, `fr_logoPDF`).
  Control de layout vía autotable (no "imprimir pantalla"). **VERIFICADO-FRISKU.**
- Alternativas descartadas por ahora: `pdfmake` (otra dependencia, layout declarativo, redundante
  con lo que ya hacemos), `@react-pdf/renderer` (potente pero pesa y duplica stack), generación
  server-side (no hay backend propio; todo es SPA + Supabase).
- **Recomendación:** mantener **jsPDF + autotable**. Es estable, ya integrado, cumple "reporte
  formal, no captura", y evita sumar dependencias (regla del proyecto). Para gráficos dentro del
  PDF, rasterizar el SVG del gráfico a imagen y embeberlo, o redibujar la tabla de datos.

---

# FASE 2 — Cruce de cada hallazgo contra `frisku_embarques` (campos reales)

Dimensiones ya disponibles en la tabla de hechos (VERIFICADO-FRISKU, ver `frisku-qlik-audit.md` B2):
contenedor (`numeroContenedor`), especie (`especieCodigo`), exportador (`exportadoraId`),
cliente (`clienteId`), origen (`origen`), destino (`destino`), **ETD (`fechaDespacho`)**,
**ETA (`fechaETA`)**, naviera/aerolínea (`navieraAerolinea`), calibre/formato
(`calibrePorFormato`/`cajasPorFormato`), estado, temporada, vía.

| # | Hallazgo FASE 1 | Estado en Frisku | Acción |
|---|---|---|---|
| 1 | Selección asociativa verde/blanco/gris global por hoja | **Implementable ya** — existe en `TableroAsociativo` | Reusar el mismo patrón de estado en cada hoja fija |
| 1b | Distinguir alternativo (gris claro) vs excluido (gris oscuro) | Parcial — hoy ambos = "tachado" | Requiere definición de negocio (¿aporta valor?) → preguntar a Angelo |
| 2 | Set Analysis: comparativo temporada vs temporada | **Implementable ya** — `temporada` existe | Medida doble (temp actual / temp anterior) por agregación |
| 2b | "% del total del grupo" (denominador sin filtro) | **Implementable ya** | Numerador sobre filtro / denominador sobre todas las filas |
| 3 | KPI cards, tabla pivote, ranking/Pareto, barras | **Implementable ya** — todos los campos existen | Construir en las hojas fijas |
| 3b | Mapa de rutas origen→destino | **Requiere campo nuevo** — `origen`/`destino` son texto, sin lat/long | Definir geocoding (maestro de puertos con coordenadas) → preguntar a Angelo |
| 3c | Gráfico de tránsito por ETD/ETA (calendario) | **Requiere ajuste** — ETD/ETA existen pero el BI agrupa por fecha de liquidación | Agregar ETD/ETA como dimensión de calendario en la fuente Embarques |
| 4 | Export on-demand Excel/PDF con marca, respeta filtros | **Implementable ya** — helpers `fr_*` con logo | Reusar en cada hoja |
| 5 | Filter pane + selections bar persistente | **Implementable ya** | Reusar |
| 5b | Drill-down jerárquico (país→puerto→contenedor / temporada→semana ETD→contenedor) | **Requiere definición** — los campos existen pero no la jerarquía | Confirmar jerarquías reales con Angelo |

**Leyenda:** *Implementable ya* = con campos y código actuales · *Requiere campo nuevo* = falta dato
en el modelo · *Requiere definición de negocio* = decisión de Angelo antes de construir.

---

## Pendiente para pasar a FASE 3
- Aprobación de este documento por Angelo.
- Confirmar las 3 dudas de negocio marcadas arriba: (1b) alternativo vs excluido, (3b) geocoding de
  puertos para el mapa, (5b) jerarquías de drill-down. No bloquean la primera hoja (Resumen
  ejecutivo), que usa KPIs ya verificados.

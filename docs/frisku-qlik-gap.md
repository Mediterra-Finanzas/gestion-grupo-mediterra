# Gap Analysis — Frisku Reportería BI vs Qlik (uso real)

Evaluación técnica tras bloques 1–10 + cierre de calidad. Base: `qlik-research-findings.md`,
`frisku-qlik-audit.md` y el código actual. **No** se compara contra todo Qlik-producto, sino
contra las capacidades que Frisku usa.

## Evidencia de volumen (define qué es brecha de datos vs de software)
Por los contadores de los tabs: **~65 embarques**, **~106 semanas de programa**, **~16 contratos**,
**~3 liquidaciones**. Consecuencia: la data **logística/operacional existe**; la data **financiera
(comisión/venta) vive en liquidaciones y está casi vacía**. Esto es una **brecha de DATOS**, no del motor.

## A. Matriz Qlik (uso real) vs Frisku

| Capacidad | Qlik | Frisku | Estado | Brecha | Prio |
|---|---|---|---|---|---|
| Selección global entre hojas | sí | provider único (bi.sel) | ✅ | — | — |
| Multi-selección (OR intra-dim) | sí | motor sí; UI solo en Explorador (listbox/gráfico) | 🟡 | hojas de dimensión son single-select | Media |
| AND entre dimensiones | sí | matchFacts AND entre dims | ✅ | — | — |
| Valores posibles (asociativo) | sí | `associative().possible` en filtros de todas las hojas | ✅ | — | — |
| Excluidos/alternativos visibles (gris) | sí | solo Explorador (tachado); hojas ocultan excluidos | 🟡 | no se ven excluidos en hojas de dim | Baja |
| Cambio directo de selección sin limpiar | sí | SelectBuscable propio | ✅ | — | — |
| Limpiar individual / todo | sí | chip × / Limpiar | ✅ | — | — |
| Persistencia entre hojas | sí | provider global | ✅ | — | — |
| Click gráfico → selección | sí | Explorador + Resumen (barras/dona/pipeline) | ✅ | hojas de dim: clic en fila (no gráfico) | Baja |
| Agrupar por dimensión | sí | "Agrupar por" en hojas + Explorador | ✅ | — | — |
| Cambio de perspectiva | sí | Programa (4) + hojas (Agrupar por) | ✅ | — | — |
| Drill-down agregado→detalle | sí | fila→filtra todo→Detalle contenedores | ✅ | — | — |
| Navegación entre dimensiones | sí | selección cruzada + Agrupar por | ✅ | — | — |
| **Métrica contenedores** | sí | ✅ (OE no cancel.) | ✅ | — | — |
| **FCL** | sí | ✅ (marítimo no cancel.) | ✅ | — | — |
| **Cajas** | sí | ✅ | ✅ | — | — |
| **Kilos** | sí | ✅ con ⚠ parcial si falta pesoNeto | 🟡 | depende de maestro de formatos | Media |
| **Venta destino USD** | sí | ✅ fórmula única | ✅ (motor) | **sin datos** (liquidaciones ~3) | Alta (datos) |
| **Comisión cliente USD** | sí | ✅ con TC real de liq.; ⚠ no convertibles | 🟡 | sin datos + validar TC | Alta (datos) |
| **Comisión Frisku USD** | sí | ✅ fórmula única | ✅ (motor) | **sin datos** | Alta (datos) |
| **%/porcentajes** | sí | ✅ % Frisku s/venta | ✅ | — | — |
| Clientes/Exportadores/Especies/Mercados activos | sí | ✅ métricas + hojas | ✅ | — | — |
| **Variedad** | sí (probable) | 🔴 no es dimensión (vive en Packing List 1:N) | 🔴 | requiere explotar PL | Media |
| Comparativo temporada vs temporada | sí | ✅ hoja Comparativo (año-1, tolerante a huecos) | 🟡 | **poca historia cargada** | Alta (datos) |
| Variación abs / % | sí | ✅ | ✅ | — | — |
| Evolución temporal (serie) | sí | 🟡 por temporada (barras); semanal parcial | 🟡 | no hay línea temporal por semana en hojas | Media |
| Tabla: ordenar/buscar/agrupar/filtrar/totales | sí | ✅ (ordenar/agrupar/filtrar/part%); búsqueda en filtros | 🟡 | sin buscador de texto dentro de la tabla de grupos | Baja |
| Export Excel | sí | ✅ todas las hojas + logo + filtros | ✅ | — | — |
| Export PDF | sí | ✅ todas las hojas + logo + filtros | ✅ | — | — |
| Export detalle fuente | sí | ✅ (detalle contenedores en hojas; Packing List en embarque) | ✅ | — | — |
| Trazabilidad KPI→registros | sí | ✅ Detalle→Ver embarque→Liquidación | ✅ | — | — |
| BI → Ver Embarque / Liquidación | (limitado en Qlik externo) | ✅ ventaja de estar integrado | ✅ | — | — |
| Documentos integrados | (no en Qlik) | ✅ biblioteca transversal | ✅ | — | — |
| Mapa origen→destino | según app Qlik | ⚪ excluido por decisión (sin geo) | ⚪ | maestro de puertos con coord. | Baja |
| Volumen grande | sí (motor in-memory) | 🟡 client-side, data chica | 🟡 | reescala a SQL/RPC a futuro | Baja hoy |

## B. Totalmente cubiertas (✅)
Selección global/persistente, asociativo posible, AND entre dims, drill-down agregado→detalle→registro,
perspectivas/agrupación, métricas de contenedor/FCL/cajas/%/entidades, comparativo (mecánica), export
Excel/PDF con filtros y logo, trazabilidad a embarque/liquidación, documentos integrados (esto último es
una ventaja que Qlik externo no tiene).

## C. Parcialmente cubiertas (🟡)
- **Multi-selección**: el motor la soporta (Sets, OR intra-dim / AND entre dims) pero la **UI de las hojas
  de dimensión es single-select** (reemplaza). Multi-select real solo en el Explorador (listbox + clic gráfico).
- **Excluidos/alternativos visibles**: solo en el Explorador (tachado); las hojas ocultan lo excluido.
- **Kilos**: correctos pero dependientes de `pesoNeto` en el maestro de formatos (se advierte ⚠ parcial).
- **Comparativo/venta/comisión**: mecánica lista, pero **sin datos históricos financieros** suficientes.
- **Evolución semanal** (serie temporal fina): parcial.

## D. Faltantes (🔴)
- **Variedad como dimensión BI** (vive en líneas del Packing List, 1:N; no agregada para no promediar mal).
- Nada más crítico a nivel de motor.

## E. Ya NO justifican usar Qlik (cubierto en Frisku)
- Ranking y participación por **cliente / exportador / especie / mercado** (contenedores, cajas, FCL).
- **Programa** por closure/especie/cliente/exportador con presupuesto/real/avance.
- **Pipeline** de embarques por estado; documental por embarque.
- Export **Excel/PDF** con filtros aplicados de cualquiera de esas vistas.
- **Trazabilidad** de un agregado hasta el embarque/liquidación y sus documentos (mejor que Qlik externo).
- **Comparativo temporada** a nivel logístico (contenedores/cajas/FCL/kilos) — cuando haya ≥2 temporadas con datos.

## F. Todavía necesitamos Qlik para
- **Análisis financiero de comisión/venta con historia real** — porque en Frisku las **liquidaciones casi
  no están cargadas** (brecha de datos, no de software).
- **Análisis por Variedad** (si Qlik hoy lo usa) — falta la dimensión.
- **Series temporales finas / evolución semanal** si el Qlik las usa intensivamente.
- Cualquier hoja/medida del Qlik real **que no esté en el inventario** (Parte A del audit sigue sin capturas
  del Qlik → hipótesis; si existen hojas que no conocemos, son brecha desconocida).

## G. Brecha de datos vs de software
- **DATOS (bloqueante para migrar lo financiero):** liquidaciones ~3, historia de temporadas escasa →
  comisión/venta/comparativo financiero salen vacíos o triviales. Requiere **carga histórica (Fase 7)**.
- **SOFTWARE:** variedad (dimensión), multi-select en hojas, excluidos visibles en hojas, serie semanal,
  mapa. Ninguno bloquea el uso operacional/logístico.

## H. Máx. 5 desarrollos prioritarios restantes
1. **Carga histórica de liquidaciones y temporadas** (Fase 7) — sin esto no se puede migrar lo financiero. *(datos)*
2. **Variedad como dimensión** explotando el Packing List a grano pallet (1:N, sin promediar). *(software)*
3. **Multi-selección en las hojas de dimensión** (usar toggle en vez de setOne + mostrar excluidos). *(software, chico)*
4. **Validación numérica** contra un export de control de Qlik (tabla I). *(proceso)*
5. **Serie temporal semanal** (línea por semana ETD) si Qlik la usa. *(software, condicionado a confirmarlo)*

## I. Reconciliación manual (completar con un export de Qlik del mismo período)
| Selección | Métrica | Qlik | Frisku | Diferencia |
|---|---|---:|---:|---:|
| Temporada 2026-2027 | Contenedores | | | |
| Temporada 2026-2027 | FCL | | | |
| Temporada 2026-2027 | Cajas | | | |
| Temporada 2026-2027 | Kilos | | | |
| Especie = (una) | Contenedores | | | |
| Especie = (una) | Cajas | | | |
| Cliente = (uno) | Contenedores | | | |
| Cliente = (uno) | Comisión Frisku USD | | | |
| Exportador = (uno) | FCL | | | |
| Total temporada | Venta destino USD | | | |

(Frisku: Reportería BI → hoja correspondiente, aplicar la selección, leer el KPI/columna.)

## J. Recomendación de migración
Migrar **por dominio**, no por usuario:
- **Ya migrable (operacional/logístico):** análisis de embarques, programa, contenedores/FCL/cajas, ranking
  por cliente/exportador/especie/mercado, pipeline, documental. Estos datos existen.
- **No migrar aún (financiero):** comisión/venta/comparativo financiero, hasta cargar liquidaciones históricas
  y pasar la reconciliación (tabla I).
- Empezar con usuarios **operacionales/comerciales** en modo paralelo (Frisku + Qlik) una temporada, validando
  cifras; mover a los usuarios **financieros** solo tras la carga histórica y la reconciliación.

## Conclusión (evidencia, sin diplomacia)
**Opción 3, condicionada:** el **motor BI de Frisku ya puede reemplazar el uso operacional/logístico actual
de Qlik** (selección asociativa, drill-down, perspectivas, export, trazabilidad, documentos), **sujeto a**
la reconciliación numérica (tabla I). **NO** puede reemplazar todavía el **uso financiero** (comisión/venta/
comparativo con historia) — pero el bloqueo es de **DATOS** (liquidaciones e histórico sin cargar), **no del
software**. Con la carga histórica (Fase 7) + variedad + validación numérica, la sustitución pasa a ser total
para el alcance real de Frisku.

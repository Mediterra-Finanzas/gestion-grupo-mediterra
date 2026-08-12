# Motor BI Frisku — arquitectura (breve)

Código: `src/friskuBI.js`. Consumido hoy por la hoja **Resumen ejecutivo**
(`ResumenEjecutivo` en `FriskuComercialModule.jsx`).

## Capas
```
DATOS (frisku_embarques + frisku_liquidaciones + maestros)
  → MODELO ANALÍTICO   buildFriskuFacts() → 1 fila = 1 contenedor/OE
  → MOTOR DE FILTROS   FriskuBIProvider (contexto React, selección compartida)
  → MÉTRICAS           FRISKU_METRICS (definición única)
  → HOJAS BI           (Resumen, y las siguientes)
```
El `FriskuBIProvider` envuelve el módulo Frisku, así la selección **persiste al
cambiar de hoja**. Cualquier hoja usa `useFriskuBI()`.

## Métricas (UNA MÉTRICA → UNA DEFINICIÓN) — `FRISKU_METRICS`
| key | definición |
|---|---|
| `containers` | N° de OE no canceladas (1 OE = 1 contenedor) |
| `boxes` | Σ cajas por formato |
| `kilograms` | Σ (cajas × peso neto/caja del formato, maestro tiposEmbalaje) |
| `destinationSalesUSD` | Σ venta destino USD de las liquidaciones de la OE |
| `clientCommissionUSD` | Σ comisión que el cliente cobra a la exportadora (USD) |
| `friskuCommissionUSD` | Σ comisión Frisku (USD) — participación de Frisku |
| `avgCommissionPct` | comisión Frisku / venta destino × 100 |
| `activeClients` / `activeExporters` | distintos, sobre OE no canceladas |

Primitivas en USD (`mComFriskuUSD`, `mVentaUSD`, `mFobUSD`, `mComClienteUSD`)
tienen **una sola definición** en `friskuBI.js`.

- `mComClienteUSD`: la liquidación NO guarda la comisión cliente en USD; para
  monedas ≠ USD se aplica el mismo factor FX que ya tiene la comisión Frisku
  (`fUSD/f`). Derivación documentada; revisar si aparece un TC propio.

## Dimensiones (`FRISKU_DIMS`) — verificadas, no inventadas
temporada, año ETD, semana ETD (ISO, de `fechaDespacho`), especie, exportador,
cliente, mercado, país destino, puerto origen (`origen`), puerto destino
(`destino`), tipo embarque, shipping line (`navieraAerolinea`), estado.

- **variedad** NO es dimensión a nivel contenedor (vive en líneas del Packing
  List; un contenedor puede tener varias). Queda como FALTA hasta explotar el PL.

## Motor de filtros (asociativo)
`matchFacts(row, sel, except)` + `associativeValues(facts, sel, dim)` → valores
posibles/excluidos por dimensión (estado asociativo tipo Qlik). Selección =
`{ dim: Set(valores) }`. Helpers del provider: `toggle/setOne/remove/clearDim/
clearAll`, `filtered`, `associative(dim)`, `chips`.

## Pendientes reales
- Migrar `TableroAsociativo` (Tablero BI) y `ReportesTab` para que usen
  `friskuBI` en vez de sus fórmulas locales (hoy siguen con `comUSD/ventaUSD`
  duplicadas). No urgente: funcionan; es dedupe.
- Drill-down agregado→detalle (tabla de registros) — siguiente hoja.
- Comparación entre temporadas (medida actual vs anterior + variación).
- Variedad como dimensión (requiere explotar Packing List).
- Mapa origen→destino (requiere geocoding de puertos; no inventar coordenadas).

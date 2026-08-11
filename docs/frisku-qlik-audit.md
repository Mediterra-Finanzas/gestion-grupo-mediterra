# FASE 0 — Auditoría Réplica Qlik Sense · Frisku Foods

Estado: **BORRADOR PARCIAL**. Documento de inventario previo a escribir código, según el prompt de réplica del dashboard Qlik.

> **Lo que falta para completar esta FASE 0** (insumos que solo Angelo puede entregar; sin ellos lo demás es interpretación, no réplica):
> 1. Capturas de cada hoja del Qlik con los filtros por defecto activos.
> 2. El `.QVF` o, en su defecto, el script de carga + una foto del Data Model Viewer.
> 3. Las expresiones de cada medida tal como aparecen en el editor de medidas de Qlik.
> 4. Un export real (Excel/PDF) de cada hoja, como archivo de control para comparar celda a celda.
>
> Las secciones marcadas **[PENDIENTE — requiere Qlik]** no se pueden llenar sin esos insumos y **no deben inventarse**.

---

## Parte A — Lado Qlik (a completar con los insumos)

### A1. Inventario de hojas/pestañas
**[PENDIENTE — requiere Qlik]**
Tabla a llenar por hoja: `Nombre | Propósito | Público objetivo`.

### A2. Visualizaciones por hoja
**[PENDIENTE — requiere Qlik]**
Por cada objeto: `Hoja | Tipo (KPI box / tabla pivote / barras / líneas / mapa…) | Dimensiones | Medidas`.

### A3. Expresiones de las medidas clave
**[PENDIENTE — requiere Qlik]**
Copiar la expresión literal del editor de Qlik y traducirla a negocio. Ejemplo de formato:
`% comisión efectiva = Sum(ComisionDevengada) / Sum(VentaDestino)`

### A4. Filtros / selecciones del Qlik
**[PENDIENTE — requiere Qlik]**
Por cada selector: `Campo | Única o múltiple | Valor por defecto`.

### A5. Exportadores del Qlik (archivos de control)
**[PENDIENTE — requiere Qlik]**
Por cada export: `Hoja/vista | Formato | Respeta filtros (S/N) | Columnas exactas y orden | Formato de números/fechas`.

---

## Parte B — Lado app "Gestión Grupo Mediterra" (verificable en el código, sí completable hoy)

Fuente: `src/FriskuComercialModule.jsx`, `src/FriskuModule.jsx` (maestros), `src/friskuHelpers.js`. Persistencia en Supabase, tabla `calendario_data` (`id`, `value` JSON, `updated_at`); cada dataset es una fila.

### B1. ¿Los datos de Frisku ya están en Supabase?
**Sí.** No hay que definir ingesta nueva para replicar; el dato ya vive en el modelo comercial. Filas relevantes:

| id (fila `calendario_data`) | Contenido | Rol en el modelo BI |
|---|---|---|
| `frisku_embarques` | Órdenes de embarque (OE) | **Tabla de hechos central, granularidad contenedor/embarque** |
| `frisku_liquidaciones` | Liquidaciones (comisión ya en USD) | Hechos de comisión/venta, se unen a la OE por `oeId` |
| `frisku_programa` | Programa semanal (plan) | Hechos de plan (FCL/cajas/pallets programados) |
| `frisku_contratos` | Business Closures | Cabecera comercial; da especie/cliente/exportadora/temporada al programa |
| `frisku_clientes` | Clientes/importadores | **Maestra** (nombre, mercado, país, modelo de comisión) |
| `frisku_exportadoras` | Exportadoras | **Maestra** (nombre, especies, certificaciones) |
| PO (dentro de liquidaciones/`pos`) | Notas de cobro | Hechos de cobranza/aging |
| `maestro_especies` | Catálogo de especies | Maestra (código→nombre/ícono) |
| `maestro_mercados`, `maestro_paises`, `maestro_puertos`, `maestro_tc`, … | Catálogos | Maestras de apoyo |

### B2. Tabla de hechos central — granularidad contenedor/embarque
La OE (`frisku_embarques`) **ya es** la tabla de hechos a nivel contenedor. Campos por OE:

| Campo | Significado | Dimensión del prompt |
|---|---|---|
| `id`, `numero` | Identificador de la OE | Contenedor (unidad mínima) |
| `numeroContenedor` | N° de contenedor / vuelo | **Contenedor** |
| `especieCodigo` | Especie (→ `maestro_especies`) | **Especie** |
| `exportadoraId` | Exportadora (→ `frisku_exportadoras`) | **Exportador** |
| `clienteId` | Cliente/importador (→ `frisku_clientes`) | **Cliente / Importador** |
| `origen` | Puerto/lugar de embarque | **Origen** |
| `destino` | Puerto/lugar de llegada | **Destino** |
| `fechaDespacho` | **ETD** (zarpe estimado) | **ETD** |
| `fechaETA` | **ETA** (llegada estimada) | **ETA** |
| `tipoEmbarque` | marítimo / aéreo | Vía |
| `estado` | borrador / confirmado / despachado / cancelado | Estado |
| `temporada` | Temporada agrícola | Temporada |
| `navieraAerolinea` | Naviera / aerolínea | Naviera |
| `cajasPorFormato`, `calibrePorFormato` | Cajas y calibre por formato | Medidas de volumen |
| `packingList`, `carpetaComex` | Docs operativos | (no dimensional) |

**Relaciones (joins):**
- `liquidacion.oeId → embarque.id` (una OE puede tener 1+ liquidaciones).
- `embarque.clienteId → cliente.id`; `cliente.mercadoCodigo → maestro_mercados`; `cliente.paisCodigo → maestro_paises`.
- `embarque.exportadoraId → exportadora.id`.
- `embarque.especieCodigo → maestro_especies.codigo`.
- `programa.closureId → contrato.id`; el contrato aporta especie/cliente/exportadora/temporada al plan.

**Granularidad de cada tabla:** embarques = 1 fila/OE (contenedor); liquidaciones = 1 fila/liquidación (se une a OE); programa = 1 fila/semana; contratos = 1 fila/closure; clientes/exportadoras/especies = maestras.

Las dimensiones especie/exportador/cliente/origen/destino/ETD/ETA **no vienen todas planas**: origen, destino, ETD, ETA, contenedor y especieCodigo viven en la OE; el nombre de especie, el mercado/país del cliente y el nombre de la exportadora viven en **maestras separadas** y se resuelven por lookup.

### B3. Medidas ya implementadas (app) y su expresión
En el explorador BI actual (`TableroAsociativo`), por fuente:

- **Comisión Frisku (USD)** = `Σ (monedaBase==="USD" ? montoComisionFrisku : montoComisionFriskuUSD)` sobre liquidaciones.
- **Venta destino (USD)** = `Σ (ventaTotalUSD ?? ventaTotal si USD)`.
- **FOB (USD)** = `Σ (fobUSD ?? fob si USD)`.
- **% comisión s/FOB** = `Σcomisión / ΣFOB × 100`.
- **Precio USD/caja** = `Σventa / Σcajas`.
- **Cajas** = `Σ cajasVendidas` (liq) / `Σ cajasPorFormato` (OE).
- **Contenedores (FCL)** = conteo de OE marítimas no canceladas (1 OE = 1 contenedor).
- **FCL/cajas/pallets programados** = `Σ contenedoresFCL / cajasPorFormato / pallets` del programa.
- **Comisión PO / Aging** = `Σ totalComisionUSD` por bucket 0–30/31–60/61–90/>90 días desde emisión.

Modelo de comisión (negocio): `% Frisku efectivo s/FOB = (cliente% × frisku%) / 100` (`friskuHelpers.js → calcularComisionFrisku`).

### B4. Exportadores actuales de la app
- **Tab 📈 Reportes** (`ReportesTab`): 6 reportes, cada uno con **Excel (ExcelJS, con logo Frisku)** + **PDF (jsPDF/autoTable, con logo)**. Respetan los filtros temp/estado/exportadora/cliente/especie. Helpers `fr_*`.
- **Tab 🧭 Tablero BI** (`TableroAsociativo`): Excel + PDF de la vista actual (KPIs + tabla/pivote), respeta las selecciones asociativas.
- **Packing List**: PDF (jsPDF) + Excel (SpreadsheetML XML manual, no ExcelJS).

### B5. Brechas entre Qlik y la app actual
- **Infra que NO hay que duplicar:** ya existe fact table a nivel contenedor, modelo asociativo (listboxes verde/posible/excluido), 4 fuentes, export Excel/PDF con logo, y filtros compartidos por hoja. Gráficos hechos con **SVG/CSS propio, sin librería** (no recharts): mantener eso salvo que la réplica exija un tipo de gráfico que no tengamos (ej. mapa geográfico, líneas multi-serie densas).
- **Brechas probables a confirmar con el Qlik:**
  - ¿El Qlik mide a nivel contenedor por ETD/ETA (calendarios de zarpe/llegada)? Hoy el BI usa el mes de la fecha de liquidación, no ETD/ETA de la OE. **Si el Qlik pivotea por ETD/ETA, hay que añadir esas dimensiones de fecha a la fuente Embarques.**
  - ¿Hay hojas con mapa (origen→destino)? No tenemos componente de mapa.
  - ¿Medidas set-analysis (comparaciones temporada vs temporada, YTD, etc.) que aún no replicamos?
  - Formato exacto de columnas/números/fechas de los exports de control: pendiente de comparar celda a celda.

---

## Criterio para pasar a FASE 1
No avanzar hasta que Angelo (1) entregue los 4 insumos del Qlik de la Parte A y (2) apruebe este documento ya completo.

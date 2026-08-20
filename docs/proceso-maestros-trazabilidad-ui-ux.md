# PROC-MAESTROS-TRAZABILIDAD-001 — UI / UX (diseño, no implementado)

**Estado:** diseño. Dirección visual ratificada: **software operacional premium** (sobrio, limpio, denso, navegación persistente, tablas excelentes, filtros profesionales). Reutiliza el design system F7.6.1/F7.8 (`ProcFilters`, `ProcDataTable` sticky, `format.js`, `normalizarNombre`). No convertir Nueva Recepción en un formulario interminable.

## 1. Principio de captura
El caso frecuente es **single-origin** (una recepción = un productor/predio/variedad); el caso importante es **carga mixta** (varios lotes de distinto origen). La UX debe hacer el caso simple rapidísimo y el mixto posible sin re-teclear todo.

## 2. Nueva Recepción — layout propuesto

```
┌────────────────────────────────────────────────────────────────┐
│ Nueva Recepción                                   [Cancelar][Guardar]│
├────────────────────────────────────────────────────────────────┤
│ CABECERA (evento físico)                                          │
│  Cliente del servicio [ Exportadora Los Andes SpA ▾]  (comercial) │
│  Planta [Rancagua ▾]  Fecha [__]  Guía [__]  Transportista [__]   │
│  Patente [__]                                                     │
├────────────────────────────────────────────────────────────────┤
│ LOTES / ORIGEN AGRÍCOLA                         [+ Agregar lote]  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Lote 1                                    kg neto [ 4.000 ]│   │
│  │  Productor [Agrícola Las Nieves SpA ▾]                    │   │
│  │  Predio   [Fundo Santa Elena ▾]  (solo predios de ese prod)│  │
│  │  Cuartel  [C-01 ▾]               (solo cuarteles de ese predio)│
│  │  Especie  [Cereza ▾]  Variedad [Santina ▾] (variedades de Cereza)│
│  │  Lote productor (código cosecha) [__]                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Lote 2   [⧉ copiar origen de Lote 1]      kg neto [ 3.000 ]│   │
│  │  … (prefill con el origen del lote anterior; cambiar lo que difiera)│
│  └──────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────┤
│ Total lotes: 2 · Total kg: 7.000                                 │
└────────────────────────────────────────────────────────────────┘
```

- **Selección en cascada** (dependiente del contexto): `Productor → Predio → Cuartel` (cada nivel filtra el siguiente); `Especie → Variedad` (variedad filtrada por especie). Los dropdowns **muestran el universo válido al abrir** (no obligan a escribir primero; escribir filtra la lista) — contrato F7.8 §7.
- **Copy-down / “Agregar lote”**: el nuevo lote hereda el origen del anterior como default → carga mixta rápida cambiando sólo lo que difiere.
- **Prefill single-origin**: si sólo hay un lote, la cabecera puede tomar su origen como default (conveniencia); la autoridad sigue siendo el lote.
- **Normalización visible**: los nombres se muestran normalizados (`agrícola las nieves spa` → `Agrícola Las Nieves SpA`); al crear un maestro nuevo, sugerencia de duplicado no destructiva (F7.6.1).

## 3. Detalle de Recepción / Detalle de Lote
Patrón de detalle consistente (F7.8 §10): **Header** (folio + estado + acciones) · **Resumen** · **Origen agrícola** (bloque jerárquico Productor › Predio › Cuartel › Especie › Variedad, con CSG cuando exista, marcando "no informado" en históricos) · **Trazabilidad** (link a genealogía) · **Auditoría**. El Cliente del servicio se muestra como bloque **comercial** separado del bloque de origen.

## 4. Configuración (maestros nuevos, data-driven)
Agregar al patrón `MaestroEditor` de F7.1 (mismo componente, un descriptor por maestro):
- **Especies** (código, nombre, activo).
- **Variedades** (especie [select], código, nombre) — el form filtra variedad por especie.
- **Predios** (productor [select], código, nombre, CSG, comuna, región, superficie).
- **Cuarteles** (predio [select], código, nombre, especie/variedad [select cascada], superficie).
- **Productores**: se editan como vínculo (rol productor) + campos RUT/CSG.
- **Relación Cliente↔Productor**: editor N:M (por cliente, chips de productores asociados; agregar/quitar). Reutiliza normalización + dedup.

## 5. Genealogía (visual)
Vista de árbol/breadcrumb bidireccional: hacia atrás desde un pallet/despacho muestra los orígenes (uno por lote componente, pallet mixto → varios); hacia adelante desde un cuartel muestra lotes→órdenes→PT→pallets→despachos. Los valores de origen salen del `origen_snapshot` (histórico), con etiqueta si difiere del maestro CURRENT.

## 6. Filtros (nuevas dimensiones)
`ProcFilters` gana: Cliente, Productor, Predio, Cuartel, Especie, Variedad, Temporada (+ los existentes estado/QC). **Acumulativos AND**, chips activos, reset explícito, server-side, sin dataset stale — contrato F7.6.1/F7.8. En cascada: elegir Especie acota Variedad; elegir Predio acota Cuartel.

## 7. Anti-patrones a evitar
- ❌ 6 dropdowns planos sin jerarquía ni filtrado contextual.
- ❌ Mostrar todas las variedades sin filtrar por especie.
- ❌ Obligar a re-teclear el origen por cada lote de una carga mixta.
- ❌ `text-transform: capitalize` para ocultar datos sucios (usar `normalizarNombre`).
- ❌ Formulario de recepción de una sola columna kilométrico.

## 7-bis. Dimensión comercial: estado contractual en Nueva Recepción (addendum)
Al elegir **Cliente del servicio** en la cabecera, mostrar de inmediato (sin ir a Configuración) el estado contractual como **badge + texto + acción**:
```
Cliente [ Exportadora Los Andes SpA ▾]   ✅ Contrato vigente hasta 31-03-2027   [Ver ficha / contrato]
Cliente [ Agrícola El Molino SpA    ▾]   ⚠ Sin contrato firmado vigente        [Ver ficha / contrato]
Cliente [ Cliente X                 ▾]   ⛔ Contrato vencido (política: bloqueante)   [Ver ficha]
```
- Nivel según `politica_contrato` del cliente (info/advertencia/bloqueante). La **recepción física nunca se bloquea**; si la política es bloqueante, el bloqueo aplica al **avance** (programar/procesar/facturar), reflejado en Programa/Orden.
- **Ficha Cliente** (secciones Resumen/Contrato/Productores/Tarifario/Operación/Documentos/Auditoría) y **editor de Contratos** (versiones + documento privado) viven en Configuración/Comercial. Detalle en `proceso-cliente-contrato-target.md` §14–§15.
- **Centro de Operaciones**: excepción accionable "Clientes sin contrato vigente" / "Recepciones con alerta contractual". No color-only.

## 8. Responsive (planta)
Cascada y repeater de lotes deben funcionar en tablet de planta (768–1024): los bloques de lote colapsan a una columna; los dropdowns siguen filtrando; el botón "Agregar lote" y "Guardar" siempre visibles (sticky footer). Contrato responsive F7.8 §11.

# Estándar de Filtros — Allegria Service (F7.6.1)

**Ámbito:** todas las pantallas de listado de `proc_*`. Componente único: `ProcFilters` en `src/proceso/ui/components/base.jsx`.

## 1. Principio

Los filtros deben **comportarse igual en todas las pantallas**. Antes de F7.6.1 cada listado dibujaba su propia barra (input + selects sueltos) con anchos y textos distintos. Ahora hay un solo componente y un solo comportamiento.

## 2. Contrato de `ProcFilters`

```jsx
<ProcFilters
  busqueda={texto} onBusqueda={setTexto} placeholder="Buscar…"
  filtros={[
    { key, label, valor, onChange, opciones:[{v,l}], reset? },
    …
  ]}
  onReset={() => { /* limpia todo */ }}
  acciones={<…botones opcionales…>} />
```

- **Buscador** (opcional): input con ícono, `flex` que ocupa el ancho disponible.
- **Selects** (0..n): cada filtro con su `label`, `valor` controlado y `opciones`. La opción "vacía" (`v:""`) representa "sin filtro".
- **Chips de filtros activos:** debajo de la barra se listan los filtros con valor ≠ vacío/"todos", con el `label` y el valor legible. Click en un chip **quita ese filtro**.
- **Reset explícito:** el botón "Limpiar filtros" aparece **solo** cuando hay algo aplicado (búsqueda o algún select activo) y ejecuta `onReset`.

## 3. Comportamiento uniforme

1. **Estado visible.** Lo aplicado siempre se ve como chips; el usuario nunca queda con un filtro "oculto" que no recuerda haber puesto.
2. **Reset explícito.** Un solo gesto limpia todo. Cada chip limpia lo suyo.
3. **Server-side donde el volumen lo exige.** Los filtros que acotan cardinalidad (estado, QC, planta, temporada) viajan a PostgREST como `&campo=eq.valor` sobre el read-model (`proc_v_*`). No se descarga toda la historia al navegador. El buscador de texto libre filtra en cliente sobre la página ya acotada (folio/cliente/productor/especie).
4. **Persistencia de contexto.** Los filtros que nacen de una navegación (ej. "ver órdenes conciliadas" desde el Centro) se inicializan desde `vista.params` (`filtroEstado`, `filtroQc`), de modo que abrir una excepción deja el listado ya filtrado.
5. **Consistencia visual.** Mismo alto, mismo espaciado, mismos colores en toda pantalla, porque es el mismo componente.

## 4. Pantallas migradas en F7.6.1

| Pantalla | Buscador | Selects server-side |
|---|---|---|
| Recepciones | folio/cliente/productor | estado, QC |
| Lotes | código/cliente/productor | QC |
| Bodega | código/cliente/ubicación | estado |
| Órdenes | — | estado |
| Despachos | — | estado |

Informes usa su propia bandeja de 2 tabs (selección múltiple para generar); no es un listado filtrable estándar y se deja como excepción documentada.

## 5. Regla permanente

Toda pantalla de listado nueva usa `ProcFilters`. No se dibujan inputs/selects de filtro sueltos. Si un filtro necesita comportamiento que el componente no cubre, se extiende `ProcFilters` (no se crea una barra paralela).

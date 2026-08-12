# Variedad en Frisku BI — modelo de incorporación (preparación, NO implementado)

Estado: **diseño**. No implementar todavía como dimensión (no fabricar un promedio
o una duplicación incorrecta). Este documento fija cómo se incorporará cuando se decida.

## El problema
La **variedad** no existe a nivel de la OE/contenedor: un embarque puede llevar **varias
variedades** (una cereza en Santina + Lapins en el mismo contenedor). La variedad vive en
las **líneas del Packing List** (`oe.packingList.pallets[]`, campo `variedad`, junto con
`formato`, `calibre`, `cajas`, `pesoNetoKg`). Por eso hoy `friskuBI.FRISKU_DIMS` NO la
incluye (marcado 🔴 en el gap analysis).

## Modelo objetivo — dos tablas de hechos relacionadas
```
FACT EMBARQUE (actual)                 FACT PACKING LIST (nuevo, cuando se implemente)
 1 fila = 1 OE / contenedor            N filas por OE = 1 por línea/pallet
 friskuBI.buildFriskuFacts()           friskuBI.buildPLFacts()  ← a crear
 dims: temporada, especie, cliente,    dims: + variedad, formato, calibre, pallet
       exportador, mercado, vía, …     medidas: cajas, kilos (peso neto real del PL)
 medidas FINANCIERAS: venta,           medidas FINANCIERAS: NO (viven en el embarque)
   comisión cliente, comisión Frisku
        │  relación 1:N por OE/contenedor (oeId / numeroContenedor)
        └───────────────────────────────────►
```

## Regla crítica (financiera)
**NO** repartir `venta`, `comisión cliente` ni `comisión Frisku` por variedad. Esas métricas
se calculan **a nivel de embarque** (desde las liquidaciones) y **no** deben multiplicarse ni
prorratearse por línea de Packing List, porque:
- se duplicarían al hacer join 1:N (una comisión de la OE aparecería en cada variedad), y
- no existe una regla de negocio que asigne comisión por variedad.

Solo se reparte si en el futuro se define **explícitamente** una regla (p. ej. prorrateo por
cajas o kilos de la variedad); hasta entonces, las hojas por variedad muestran **cajas/kilos**
(que sí son aditivas a nivel de línea) y dejan las financieras **a nivel de embarque**.

## Cómo se incorporaría (pasos, sin hacerlos ahora)
1. `buildPLFacts({embarques, ...})` en `friskuBI.js`: explota `packingList.pallets[]` →
   1 fila por línea con `oeId`, `numeroContenedor`, `variedad`, `formato`, `calibre`, `cajas`,
   `kilos` (usa `pesoNetoKg` real del PL, no el peso teórico del formato).
2. Métricas de VOLUMEN sobre PL facts (cajas/kilos por variedad). NADA financiero.
3. Hoja BI "Variedad" que usa PL facts para volumen y **enlaza** al embarque (para lo
   financiero se navega a la OE). Filtros globales siguen aplicando por OE (join por oeId).
4. Marcar en `FRISKU_METRICS`/catálogo cualquier medida que dependa del join OE↔PL como
   `MULTI-TABLA`, para no mezclar granularidades por accidente.

## Por qué esperar
El Packing List hoy tiene poca carga (pocas OEs con pallets detallados). Implementar la
dimensión ahora daría hojas vacías o sesgadas. Se incorpora cuando (a) haya PLs cargados y
(b) se confirme si alguna métrica debe prorratearse. Mientras tanto, el resto del BI no se
bloquea (gap analysis, sección 8).

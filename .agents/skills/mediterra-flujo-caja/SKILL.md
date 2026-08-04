---
name: mediterra-flujo-caja
description: >
  Reglas de cálculo del flujo de caja de FinanzasModule.jsx en la app Gestión
  Grupo Mediterra: lógica mensual-vs-semanal para AddedLines/SubLines, subtotales
  de categoría, sublines de Préstamos (fuente única = módulo Créditos), y
  verificación de cuadre aritmético. Úsalo SIEMPRE que toques cálculos del flujo:
  flujoArr, sumAddedLinesMes, sumAddedLinesSemana, empresasConOverrides,
  Consolidado, subtotales, celdas mensuales/semanales, cuotas de créditos.
  Triggers: flujo de caja, mensual vs semanal, AddedLines, SubLines, subtotal,
  Préstamos, cuota, crédito, consolidado, cuadre, descuadre, flujo neto,
  MESES_65, EMPRESAS_STATIC, vals["5_0"].
---

# Cálculos del flujo de caja (FinanzasModule.jsx)

Módulo más complejo y sensible de la app. Angelo SIEMPRE valida los números
antes de aceptar. Muestra el cálculo aritmético en cada cambio financiero.

## Lógica mensual-vs-semanal (acordada May-26, NO romper)

Cada celda de AddedLine/SubLine puede tener:
- Valor **mensual**: `vals[5]` (mes idx 5).
- Valores **semanales**: `vals["5_0"] … vals["5_3"]` (4 semanas del mes).

Regla:
- **Si hay semanas cargadas → la suma de semanas manda** (el mensual se ignora).
- **Si NO hay semanas → usa el valor mensual** (retrocompatibilidad).
- La celda mensual en la UI NO es editable cuando hay semanas: muestra la suma
  calculada en cursiva. Para editar, ir a la vista semanal.

Implementado en:
- `flujoArr` (useMemo en FlujoEmpresa)
- `sumAddedLinesMes()` y `sumAddedLinesSemana()`
- `empresasConOverrides` en Consolidado (~línea 3099)
- Render de celda mensual de AddedLines (~línea 5256)

Si necesitas cambiar el cálculo, hay logs de debug históricos comentados que
ayudan a diagnosticar. Reactívalos temporalmente, muestra a Angelo, y límpialos.

## Sublines de "Préstamos" — caso especial (fuente única de verdad)

Líneas con `formula:true` y "Préstamos" en el label:
- Las cuotas se calculan automáticamente desde `creditosData` (módulo Créditos).
- `proy[i]` ya incluye las cuotas mensuales.
- `calcPrestamosSemanasEmpresa()` → cuotas por semana exacta.
- `calcPrestamosDesglose()` → sublines visibles por acreedor.
- Una sola fuente de verdad: NO duplicar el cálculo; mantener consistencia con
  el módulo Créditos.
- Nota: los montos de `creditosData` están en **USD** (no CLP).

## Bug histórico arreglado (NO volver a romper)

El subtotal de categoría DEBE **incluir** las sublines de líneas con "Préstamos".
La exclusión `!l.label.includes("Préstamos")` fue removida del cálculo de
subtotales — no volver a ponerla. Con ella el Flujo Neto descuadraba.

## Estructura base

- 65 meses de proyección (`MESES_65`).
- Líneas base desde `EMPRESAS_STATIC` por empresa.
- `addedLines[seccion]` = líneas agregadas por el usuario.
- `subLines[lineLabel]` = sub-items de líneas con `subLines:true`.
- 6 categorías: `ing_op`, `ing_nop`, `egr_var`, `egr_fijo`, `egr_nop`, `imp`.

## Checklist de cuadre antes de cerrar cualquier cambio

- [ ] Suma de semanas = celda mensual mostrada (cuando hay semanas).
- [ ] Subtotal de categoría incluye sublines de Préstamos.
- [ ] Flujo Neto = ingresos − egresos cuadra por mes y en el consolidado.
- [ ] Cuotas del flujo coinciden con el módulo Créditos (misma fuente).
- [ ] Mostrar a Angelo el cálculo aritmético del before/after antes de dar por listo.
- [ ] Verificar build con `CI=true` (los warnings escalan a error).

---
name: mediterra-analisis-kpi
description: >
  Marco de análisis financiero, KPIs y toma de decisiones para el CFO de Grupo
  Mediterra: variance Real vs Presupuesto vs Año Anterior (EEFF), KPIs de grupo
  (Dashboard), distinción año fiscal vs temporada agrícola, y cómo presentar
  números para decisión (siempre mostrar el cálculo, verificar cuadre). Úsalo
  cuando hagas análisis financiero, construyas KPIs/dashboards, compares
  escenarios, o prepares insumos para toma de decisiones/directorio. Triggers:
  análisis financiero, KPI, dashboard, variance, varianza, Real vs Ppto, año
  anterior, escenario, what-if, toma de decisiones, directorio, board, EBITDA,
  margen, EEFF, presupuesto.
---

# Análisis financiero, KPIs y decisiones — CFO Mediterra

## Principios (estilo de trabajo con Angelo)

- **Siempre mostrar el cálculo aritmético.** Angelo valida los números antes de
  aceptar cualquier cambio o conclusión financiera. Nunca entregues un total sin
  el desglose que lo produce.
- **Verificar cuadre** (ver `mediterra-flujo-caja` y `mediterra-consolidacion-ifrs`).
- **Conciso.** Sin inflar. Si el número habla, no lo adornes.
- Para informes de directorio, aplicar reglas del skill `humanizer` y de
  `cfo-board-reporting` (ya disponibles).

## Dos calendarios — no confundir

- **Año fiscal**: Enero–Diciembre (EEFF, impuestos, presupuesto anual).
- **Temporada agrícola**: Julio–Junio (flujos de caja operativos, presupuestos
  operativos, análisis comercial de cerezas/arándanos). Un análisis operativo
  suele leerse mejor en base temporada; uno contable/fiscal en base año.

## Análisis de variance (módulo EEFF)

El EEFF compara tres columnas: **Real vs Presupuesto vs Año Anterior**.
- Reportar variance en monto Y en %; señalar el driver, no solo la cifra.
- Distinguir variance de precio vs volumen vs mix cuando aplique (grupo agrícola:
  kg exportados, precio FOB, comisión).

## KPIs de grupo (Dashboard)

- KPIs a nivel grupo se calculan sobre el consolidado IFRS (ver
  `mediterra-consolidacion-ifrs`): Allpa Chile/Perú entran por patrimonio, no
  línea a línea. No inflar un KPI de grupo con ingresos de las JV.
- KPIs por empresa reflejan su negocio propio (comisión, royalty, fee admin,
  % s/venta) — cada modelo de ingreso es distinto por sociedad.

## Escenarios / what-if

- Existen escenarios paralelos del flujo (snapshot en fila `finanzas_esc_<id>`,
  original intacto, selector "Modelo" en Flujo). Para comparar decisiones, usar
  un escenario, no editar el modelo base.

## Antes de cerrar un análisis

- [ ] Mostré el cálculo, no solo el resultado.
- [ ] Base correcta (año fiscal vs temporada) según el tipo de análisis.
- [ ] KPIs de grupo sobre consolidado IFRS correcto.
- [ ] Variance con driver identificado, no solo la cifra.
- [ ] Cuadre verificado y presentado a Angelo.

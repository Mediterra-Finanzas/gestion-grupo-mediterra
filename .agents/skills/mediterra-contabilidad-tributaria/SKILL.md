---
name: mediterra-contabilidad-tributaria
description: >
  Marco contable y tributario chileno de Grupo Mediterra: obligaciones SII
  (F29 IVA + PPM mensual, F50, Renta anual F22), cierre contable + EEFF, análisis
  de cuenta, y el seguimiento por empresa del módulo de Tareas. Úsalo cuando
  construyas o analices features de contabilidad, impuestos, cierre, o el
  calendario tributario. Triggers: tributaria, impuestos, SII, F29, F50, F22,
  IVA, PPM, renta, retención, cierre contable, EEFF, análisis de cuenta,
  contabilidad, provisión, débito fiscal, crédito fiscal.
---

# Contabilidad y tributaria — Grupo Mediterra (Chile)

Grupo agrícola chileno. Cumplimiento vía SII. Angelo (CFO) valida los números.

## Año fiscal vs temporada

- **Año contable/fiscal**: Enero–Diciembre.
- **Temporada operativa/agrícola**: Julio–Junio (afecta flujos, presupuestos
  operativos, análisis comercial). NO confundir los dos calendarios al analizar.

## Obligaciones tributarias recurrentes (por empresa)

El módulo Seguimiento Tareas ya rastrea estas por sociedad (constante
`EMPRESAS_TAREAS`, 10 sociedades), con semáforo doble y apertura por empresa:

- **F29** — declaración mensual de IVA (débito − crédito fiscal) + PPM (pago
  provisional mensual de renta). En Tareas: `m14` = hacer F29, `m17` = pago F29.
- **F50** — declaración mensual de impuestos adicionales / retenciones (ej.
  remesas al exterior, impuesto adicional). Relevante por operaciones cross-border
  (Perú, exportaciones).
- **Cierre + EEFF** (`m13`) y **Análisis de cuenta** (`m19`) — mensual por empresa.
- **Renta anual (F22)** — abril. Integrity cobra su fee admin de campos en abril
  de cada año.

> No hardcodear fechas de vencimiento SII sin verificar el calendario vigente:
> varían (ej. F29 al 12 o 20 del mes siguiente según facturador electrónico).
> Ante duda, referir al calendario SII, no asumir.

## Cierre y EEFF

- El módulo EEFF carga balance + P&L con análisis comparativo **Real vs
  Presupuesto vs Año Anterior** (ver `mediterra-analisis-kpi`).
- Base IFRS a nivel grupo; cumplimiento tributario chileno a nivel entidad.
  Los dos no siempre coinciden (diferencias temporarias): no mezclar la base
  contable IFRS con la base tributaria SII.

## Antes de cerrar

- [ ] Distinguí año fiscal (Ene-Dic) de temporada (Jul-Jun) correctamente.
- [ ] Cifras tributarias por entidad; consolidado es base IFRS (ver
      `mediterra-consolidacion-ifrs`).
- [ ] No inventé fechas SII; referí al calendario vigente si aplica.
- [ ] Mostrar el cálculo aritmético a Angelo.

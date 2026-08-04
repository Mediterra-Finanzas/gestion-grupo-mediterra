---
name: mediterra-tesoreria
description: >
  Tesorería de Grupo Mediterra: saldos bancos, créditos (cuotas, renovaciones,
  crédito de socio), liquidez/cobertura, y conversión multimoneda USD/CLP/PEN vía
  triangulación por USD. Úsalo cuando construyas o analices posición de caja,
  bancos, deuda financiera, o conversiones de moneda. Complementa
  mediterra-flujo-caja (que cubre la mecánica de cálculo del flujo). Triggers:
  tesorería, saldos bancos, liquidez, cobertura, crédito, cuota, renovación,
  amortización, crédito de socio, multimoneda, tipo de cambio, USD CLP PEN,
  triangulación, mindicador, frankfurter.
---

# Tesorería — Grupo Mediterra

## Saldos y bancos

- Sub-tab "Saldos Bancos" en FinanzasModule: saldos por banco/cuenta.
- La posición de caja alimenta el flujo proyectado (65 meses, `MESES_65`).

## Créditos (fuente única de verdad = módulo Créditos)

- `creditosData` es la fuente única. Los montos están en **USD** (no CLP).
- Las cuotas del flujo salen de aquí: NO recalcular por separado
  (ver `mediterra-flujo-caja`, sección Préstamos).
- Existe subvista "Saldo por Mes" con toggle a CLP y TC editable.
- **Crédito de Socio**: tipo `socio` en `creditos_data`, amortización geométrica
  Actual/365 (`creditoSocio.js`). Tratamiento distinto a un crédito bancario.
- Renovaciones y cuotas se mantienen consistentes con el sub-tab Créditos.

## Multimoneda (conversión vía USD)

Moneda funcional del grupo: USD. Monedas operativas: CLP, PEN.

- La conversión **triangula por USD**: p. ej. soles → `PEN→USD→CLP`. Helper
  `convertir()` usa `buscarTC` de `friskuHelpers.js`, con par inverso cuando falta.
- **Fuentes de TC** (sub-tab Maestros → Tipo de Cambio):
  - `mindicador.cl` — pares `?-CLP` (Banco Central Chile, oficial). Dólar y euro.
  - `api.frankfurter.app` — cross-rates global (BCE). Cubre monedas mayores.
  - **PEN NO lo cubren las APIs gratis** → el par `USD-PEN` se carga **manual**
    en Maestros. Montos en PEN sin TC se marcan ⚠ y se excluyen del total.
  - Entradas con `fuente:"manual"` NO se sobrescriben por la API (preservan
    overrides del CFO).

## Antes de cerrar

- [ ] Cuotas de deuda vienen de `creditosData` (una sola fuente).
- [ ] Montos de créditos tratados como USD.
- [ ] Conversiones triangulan por USD; par PEN existe o el monto se marca ⚠.
- [ ] Crédito de socio usa su amortización propia (Actual/365), no la bancaria.
- [ ] Mostrar el cuadre a Angelo.

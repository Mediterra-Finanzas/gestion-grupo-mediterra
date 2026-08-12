# D. Regression Test Suite — Osiris (Fase 0)

Red de seguridad que **congela el comportamiento económico actual** con las funciones reales del módulo.

## Cómo correr
```bash
CI=true TZ="America/Santiago" npx react-scripts test --watchAll=false --testPathPattern="osiris/economic"
```
(TZ fijada por robustez; los asserts usan fechas de mitad de mes para no depender de ella.)

## Archivos
| Archivo | Contenido |
|---|---|
| `src/osiris/economic/fixtures.js` | Fixtures sintéticas deterministas (sin data real). Incluye `buildOcsByContrato` que replica el useMemo del componente. |
| `src/osiris/economic/osirisEngine.regression.test.js` | Caracterización por rama (CF, RP×3, RC legacy/cohortes, TP, obtentor, IQ espejo). |
| `src/osiris/economic/osirisEngine.invariants.test.js` | Invariantes (no NaN, no negativos, `montoCobro=montoFact×pct`, ids únicos, pureza, no-mutación, Prueba sin RC). |

## Habilitador (cambio NO funcional)
Se añadió un bloque `export { ... }` al final de `src/OsirisModule.jsx` que expone funciones puras **ya existentes** (`pct`, `whtLabel`, `temporadasEntre`, `temporadaDeFecha`, `ocLigadaAContrato`, las 4 `derivar*`, `calcMontoObtentor`, `calcularDeudaObtentor`, `ingresoMatchRegla`, etc.). No altera el `export default`, la persistencia ni la lógica. Reversible.

## Resultado (última corrida)
```
Test Suites: 6 passed, 6 total        (4 preexistentes + 2 Osiris)
Tests:       276 passed, 276 total     (244 preexistentes + 32 Osiris)
```
Build de producción (`CI=true react-scripts build`): **OK** (compila con el export añadido).

## Qué cubre (mapa a los Golden Cases E)
- **Royalty Planta:** las 3 ramas (despacho / factura / cuotas), plantas, US$/planta, WHT, estado, override (unicidad de id).
- **Royalty Comercial:** ha, cohortes, temporada, fecha plantación, inflación (1er/2°/n años), país, mes cobro, **Comercial vs Prueba**, WHT, blending de cohortes.
- **Fee Entrada:** monto, país, WHT, exclusión "Sin Contract Fee".
- **Obtentores:** `participacionIngresos` (%, usd_planta), WHT, bruto/neto, y el **hallazgo** de match por `ct.especie`.
- **Reconciliación IQ:** 70%/10%/neto 63% (espejo de la lógica inline, congelada; la función real no se toca).
- **WHT** Chile vs Perú/México reproducible.

## Alcance / limitaciones
- Las funciones **inline en componentes** (IQ real, Dashboard, Resumen, PagoObtentores UI) se caracterizan por espejo/fixtures, no por import directo, para respetar la restricción de no tocar esos componentes en Fase 0. Su extracción testeable queda propuesta para Fase 1/3.
- Los tests **no** leen ni escriben producción; son funciones puras sobre fixtures.

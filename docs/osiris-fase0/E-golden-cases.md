# E. Golden Cases — Osiris (Fase 0)

Casos representativos con **expected values verificados ejecutando las funciones reales** (no inventados). Fixtures deterministas en `src/osiris/economic/fixtures.js`; asserts en `osirisEngine.regression.test.js`. Fechas explícitas → resultados independientes de la fecha de ejecución.

> Los casos NO usan data productiva real (por confidencialidad). Son sintéticos pero ejercitan cada rama del código productivo. La validación sobre la data real se hace vía el Data Integrity Manifest (conteos/hash), no reproduciendo cifras de clientes reales en el repo.

| # | Caso | Entrada | Resultado congelado |
|---|---|---|---|
| 1 | RP simple (legacy cuotas) | 2.000 plantas, US$1,5/planta, Perú, cuotas 50/50 | 2 filas de 1.000 plantas; fact 1.500 c/u; **cobro 1.275** (×0,85) |
| 2 | RP con OC + factura | OC 500 plantas, US$2, Chile, factura pagada | 1 fila; fact 1.000; **cobro 1.000**; pctCuota 100; pagado=true |
| 3 | RP con despacho (modelo OC) | despacho 300 plantas, US$1, Perú | 1 fila; brutoTeorico 300; **cobro 255** (×0,85) |
| 4 | RP override | (merge por id en componente) | override prevalece; sin duplicar id |
| 5 | RC primer año | 10 ha, US$1.000/ha, Chile, temp 2026/2027 | fact 10.000; factor 1,0; **cobro 10.000** |
| 6 | RC segundo año | idem, temp 2027/2028, inflación 5% | factor **1,05**; fact **10.500** |
| 7 | RC con inflación | (incluido en #6) | `(1+infl)^idx` compuesto |
| 8 | RC múltiples cohortes | A=20 ha desde 2026/27; B=10 ha desde 2027/28; infl 10% | temp1: **20.000** (20 ha); temp2: **32.000** (A 22.000 + B 10.000; blended 1.066,67/ha) |
| 9 | Plantación Comercial | 10 ha comercial | aporta ha cobrables al RC |
| 10 | Plantación Prueba/Trial | 5–99 ha Prueba | **0** ha cobrables (excluida del RC) |
| 11 | Fee Entrada | Chile 30.000 / Perú 20.000 | Chile neto 30.000 (WHT 0); Perú **neto 17.000** (WHT 15) |
| 12 | Participación obtentor (comodín) | regla contract_fee 70% wht 10% sobre 30.000 pagado | **bruto 21.000, WHT 2.100, neto 18.900** |
| 12b | Participación scopeada por especie | regla royalty_planta "Cereza" 70% | **0** si no hay `ct.especie` (hallazgo); 1.400 si `ctData` la aporta |
| 12c | Participación por planta | tipoCalculo usd_planta 0,5 × 1.000 plantas | **500** (ignora montoFact) |
| 13 | Reconciliación IQ | factura 1.000 | IQ **700** → WHT **70** → neto **630** (63%) |
| 14 | WHT Chile | pct("Chile") | **1,00** |
| 15 | WHT Perú/México | pct("Peru"/"Mexico") | **0,85** |
| 16 | Fee Vivero | OC vivero fee_usd_planta | circuito aparte (no en obtentor/IQ) — documentado, sin nuevo cálculo |
| 17 | OC parcialmente despachada | despacho < cantidad OC | RP sobre lo despachado (rama OC-despacho) |
| 18 | Contrato multi-plantación/variedad | 2 plantaciones | 2 filas Total Pedidos; RP/RC agregan por contrato |

## Hallazgos de caracterización (comportamiento actual, NO corregido en Fase 0)
1. **Obtentor especie-scopeado no matchea** (#12b): compara contra `ct.especie` inexistente → solo reglas comodín funcionan. → `G-risk-register` (ALTA).
2. **`temporadaDeFecha` sensible a timezone** en bordes de mes (medianoche UTC cae al día anterior en TZ Chile). Los asserts usan fechas de mitad de mes para robustez. → `G-risk-register` (MEDIA).
3. **`temporadasEntre` sin término** = 11 temporadas (a1..a1+10), no 10.
4. **IQ 70/10 hardcodeado** en paralelo a `participacionIngresos` data-driven → doble fuente de verdad (#13). → `F` y `G` (CRÍTICA).

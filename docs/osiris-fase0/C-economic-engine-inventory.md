# C. Economic Engine Inventory — Osiris (Fase 0)

Inventario de la lógica económica **actual** de `src/OsirisModule.jsx`. Congelada por la suite de regresión (ver `D-regression-tests.md`). Referencias de línea al commit `ea89b06`.

## Principio arquitectónico
El **contrato es la fuente de verdad**. Las tablas de royalties/fees se **derivan** por función y se fusionan con *overrides* manuales por `id` (patrón `_fromContract` / `_hasOverride`). No hay tabla de ingresos "independiente".

## Helpers base

| Función | Línea | Qué hace (actual) |
|---|---|---|
| `pct(pais)` | 124 | Factor neto tras WHT cliente: **1.00** si país contiene "chile"; **0.85** en el resto (incl. país vacío/desconocido). |
| `whtLabel(pais)` | 129 | `null` Chile; `"WHT 15%"` resto. |
| `resolveEstadoCF(r)` | 252 | Devuelve `r.estadoCF` (6 estados) o mapea `pagado?→"pagado":"porCobrar"`. |
| `calcCobros(total,info)` | 310 | Cobros parciales de una fila. |
| `temporadaActual()` | 4609 | Temporada Jul–Jun de hoy. **Depende de la fecha de ejecución.** |
| `temporadaDeFecha(f)` | 4614 | Temporada Jul–Jun de una fecha. **Sensible a timezone en bordes** (ver G-riesgos). |
| `temporadasEntre(ini,fin)` | 4622 | Serie inclusiva de temporadas; horizonte **11** (a1..a1+10) si no hay término. |
| `RC_MES_DEFAULT_POR_PAIS` | 4602 | Perú→Mayo, Chile→Abril, México→Julio. |
| `RP_CUOTAS_DEFAULT` | 4639 | 50% firma / 50% plantación. |
| `ESTADOS_CF` | 242 | `porCobrar, facturado, cobradoParcial, pagado, enDisputa, anulado`. |

## Derivaciones (fuente de verdad → filas de ingreso)

### `derivarContractFeeDesdeContratos(ctData)` — L6635
- Filtra contratos con `tipoContractFee && !== "Sin Contract Fee"`.
- `montoUSD = ct.montoContractFee`; `montoNeto = montoUSD × pct(pais)`; `whtPct = pct===1?0:15`.
- 1 fila por contrato. Row: `{id:"cf_<ctId>", ctId, cliente, pais, montoUSD, montoNeto, whtPct, detalle, fechaContrato, pagado, fechaPago, nFact, _fromContract}`.

### `derivarRoyaltyPlantaDesdeContratos(ctData, ocsByCt)` — L6655
`valorPorPlanta = ct.valorRoyaltyPlanta||1`, `totPlantas = Σ plantaciones.nPlantas`. **3 ramas mutuamente excluyentes (early return):**
1. **OC-despacho** (`modeloIngresos==="oc"` y sin `rpPlantaCuotas`): itera `ocsByCt[ct.id]`; evento = cada despacho (`nPlantas=cantidad_despachada`) o la OC completa. `brutoTeorico = nPlantas×valorPorPlanta`; `montoCobro = base × pct`. Campos extra: `brutoTeorico, montoFacturado, _fromOC, _ocId`.
2. **Facturas** (`facturasRP.length>0`): por factura, `montoAuto = Σ plantasDeOC×valorPorPlanta`, `montoFact = montoFacturado||montoAuto`, `pctCuota = montoFact/(totPlantas×valorPorPlanta)×100`, `montoCobro = montoFact×pct`. `_fromFactura`.
3. **Cuotas % legacy** (`rpPlantaCuotas`||default): `plantasCuota = totPlantas×(pct%/100)`, `montoCuota = plantasCuota×valorPorPlanta`, `montoCobro = montoCuota×pct(pais)`.
- Row común: `{id, ctId, cuotaId, cliente, pais, nPlantas, usdPlanta, descripcionCuota, pctCuota, montoFact, montoCobro, whtPct, fechaEvento, pagado, fechaPago, nFact, _fromContract}`.

### `derivarRoyaltyComercialDesdeContratos(ctData, ocsByCt)` — L6785
`valorPorHa = ct.valorRoyaltyComercial` (skip si 0). `inflPct = royaltyInflacion ? rcInflacionPct : 0`. `mesCobro = ct.rcMesCobro || RC_MES_DEFAULT_POR_PAIS[pais] || "Abril"`; `trimCobro = floor(mesIdx/3)+1`. **2 ramas:**
1. **Bloques/cohortes** (`modeloIngresos==="oc"` o hay `rcCohortes` con ha>0): cohortes `{tempInicio→ha}` (declaradas o desde despachos comerciales; **Prueba excluida**). Por cohorte y temporada: `factor = (1+inflPct/100)^idx` (idx = años desde el inicio de **esa** cohorte). Se **mezclan** cohortes por temporada de cobro: `valorPorHaInfl = Σmonto/Σha`. `montoCobro = monto × pct`. Extra: `haDeriv, haNuevas, cohortesNuevas, _fromOC`.
2. **Legacy** (`haTotal = Σ hectareas` excluyendo Prueba): `inicioTemp = ct.rcInicioTemporada||temporadaActual()`; por temporada `factorInfl = (1+inflPct/100)^tempIdx`; `montoFact = haTotal×valorPorHa×factorInfl`; `montoCobro = montoFact×pct`.
- Row: `{id:"rc_<ctId>_<temp>", ctId, temporada, cliente, pais, haTotal, valorPorHa, inflPct, factorInfl, valorPorHaInfl, montoFact, montoCobro, whtPct, mesCobro, trimCobro, añoCobro, pagado, fechaPago, nFact}`.

### `derivarTotalPedidosDesdeContratos(ctData)` — L6922
1 fila por plantación. Sin aritmética. `{id:"tp_<ctId>_<pId>", ctId, plantacionId, cliente, pais, especie, variedad, nPlantas, hectareas, fechaPlantacion, sublicenciatario, estado, _fromContract}`.

### `ocLigadaAContrato(oc, ct)` — L7064
Enlace OC-vivero ↔ contrato en 3 niveles: `oc.contrato_id===ct.id` → `oc.cliente_id===ct.clienteId` → nombre normalizado.

## Obligación al obtentor / genetista

### `ingresoMatchRegla(regla, especie, variedad)` — L2955
Match si `regla.especie`/`variedad` están en blanco (comodín) o igualan (case-insensitive).

### `calcMontoObtentor(regla, montoFact, nPlantas, ha)` — L2964
Data-driven por `regla.tipoCalculo`: `porcentaje`→`montoFact×valor/100`; `usd_planta`→`nPlantas×valor`; `usd_ha`→`ha×valor`; else 0. **No hay % hardcodeado.**

### `calcularDeudaObtentor(obt, ctData, feData, rpData, rcData)` — L2972
Por cada tipo (`contract_fee`/`royalty_planta`/`royalty_comercial`), procesa solo ingresos **pagados**. **Clave (hallazgo):** el match de especie/variedad se hace contra `ctMap[r.ctId] = {especie: ct.especie, variedad: ct.variedad}` (L2977-2978) — pero **los contratos NO tienen `ct.especie` de nivel superior** (la especie vive en `plantaciones[]`). Por eso **toda regla scopeada por especie no matchea**; solo funcionan las reglas comodín. `wht = deuda × regla.wht/100`. Totales: `deudaBruta`, `whtTotal`, `netoAPagar = bruto − wht`. Base = **bruto facturado** (`montoUSD`/`montoFact`), no el neto WHT cliente.

## Reconciliación IQ (inline, NO exportada) — L3437+
- Constantes hardcodeadas: `PCT_IQ = 0.70` (L3438), `PCT_WHT = 0.10` (L3439).
- `iq = montoFact × 0.70`; `wht = iq × 0.10`; `neto = iq − wht` (= 0.63×montoFact). Sobre **bruto** facturado.
- Alimentan: Royalty Planta + Fee Entrada + Royalty Comercial. **Fee Vivero excluido.**
- Solo `facturados` cuentan como base firme; separa pagados (real) vs pendientes (proyección).
- **Doble fuente de verdad** con `participacionIngresos`: si "IQ" existe como obtentor, su obligación se calcula distinto según la pantalla.

## Fee Vivero (circuito aparte)
Modelado dentro de la OC del vivero (`fee_usd_planta`→`fee_total_usd`) y a nivel de variedad autorizada (`fee_usd`/`fee_pct`). La tabla `feeViveros` está vacía en producción. **No pasa por `PagoObtentores` ni por IQ.** El genetista no participa (100% Osiris) — regla objetivo aún no implementada como tal.

## Funciones inline en componentes (requieren extracción en Fase 1 para test directo)
`ReconciliacionIQ` (3437), `DashboardAnalitico` (3864), `Resumen` (4234), `PagoObtentores` (3059), y la construcción `ocsByContrato` (useMemo, ~10272, replicada en `fixtures.buildOcsByContrato`). Hoy caracterizadas por espejo/fixtures; no se tocan en Fase 0.

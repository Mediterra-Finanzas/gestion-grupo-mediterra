# Tipo de cambio en Saldos Bancos — diagnóstico y propuesta

Estado: **propuesta, sin implementar**. No se cambió la fuente ni la lógica. Requiere aprobación de Angelo.

## 1. Cálculo actual (código en `src/FinanzasModule.jsx`)

| Paso | Dónde | Qué hace |
|---|---|---|
| Obtener TC | `fetchFX()` L8701 | `GET https://open.er-api.com/v6/latest/USD` al abrir la pestaña. Guarda `fx.clp = 1/rates.CLP`, ídem EUR/PEN. Si falla → `null` y `fxError=true`. |
| Guardar saldo | L8795-8805 | Por cada cuenta **editada**: `{monto, fecha, usd: fx ? monto×fx[moneda] : null}`. El `usd` queda **congelado** con el TC del momento del guardado, no con el de la fecha del saldo. |
| Total en pantalla | `totalesEmpresa` L8811 | Con TC en vivo, **recalcula todo** con el TC de hoy. Sin TC, usa el `usd` guardado. Sin TC y sin `usd` guardado: si la cuenta es CLP/EUR/PEN **no suma** (comentario L8828). |
| Saldo inicial del flujo, Dashboard, Reporte semanal, Consolidado | L4362, L4403, L5263, L5980, L7557 | Usan **solo** el `usd` guardado. Nunca el TC en vivo. Si `usd` es `null`, la cuenta suma 0, sin aviso. |
| `maestro_tc` | `friskuHelpers.buscarTC()` | **No se usa** en Saldos Bancos. Lo usan Frisku y Rendiciones (mindicador = dólar observado del Banco Central; frankfurter = BCE; manual). |

`open.er-api.com` no aparece documentado en CLAUDE.md/AGENTS.md: es un agregador de mercado, no el dólar observado.

## 2. Riesgos, con números (datos ficticios)

Allegria Foods: BICE US$17.433 y una cuenta en CLP de $95.000.000.

- El saldo se guardó con un TC de 925,40 → `usd` guardado = 95.000.000 / 925,40 = **US$102.658,31**.
- Hoy la API da 940,12 → la pantalla Saldos Bancos calcula 95.000.000 / 940,12 = **US$101.050,93**.

| Vista | Cálculo | Caja total |
|---|---|---|
| Saldos Bancos (TC en vivo) | 17.433 + 101.050,93 | **US$118.483,93** |
| Flujo / Dashboard / Reporte (usd guardado) | 17.433 + 102.658,31 | **US$120.091,31** |
| Diferencia para la misma fecha de saldo | | **US$1.607,38** |
| Si se guardó con la API caída (`usd = null`) | 17.433 + 0 | **US$17.433** (faltan US$101 mil, sin aviso en el flujo) |

1. **Dos cifras de caja para un mismo saldo**: según la pestaña, cambian con cada apertura.
2. **Omisión silenciosa**: una cuenta guardada sin TC desaparece del saldo inicial del flujo y del reporte semanal. En Saldos Bancos solo se muestra un "⚠️ sin paridad" pequeño.
3. **TC fuera de fecha**: el TC aplicado es el del día en que alguien guardó, no el de la fecha del saldo.
4. **Fuente no oficial y distinta del resto de la app** (Frisku y Rendiciones usan `maestro_tc`).
5. Detalle: `toUSD` devuelve `monto × 0` si la API responde pero falta la moneda, así que la cuenta suma 0 en vez de quedar como "sin TC".

## 3. Propuesta (para aprobar)

1. **Una sola fuente**: `buscarTC(moneda, "USD", fechaDelSaldo, maestro_tc)` con el dólar observado (mindicador) para CLP, el BCE (frankfurter) para EUR, y PEN manual o SBS cargado en Maestros → Tipo de Cambio. `open.er-api.com` se retira o queda solo como referencia visual "mercado hoy".
2. **TC de la fecha del saldo**, no de hoy. Se guarda junto al saldo: `{usd, tc, tcFecha, tcFuente}`, así cada cifra es auditable.
3. **Misma cifra en todas las vistas**: Saldos Bancos, Flujo, Dashboard y Reporte leen el mismo `usd` guardado. Si se quiere ver "a TC de hoy", se muestra como columna aparte, con su rótulo.
4. **Nunca omitir en silencio**: las cuentas sin TC se excluyen del total, pero el total se marca **"parcial"** e indica cuánto y qué cuentas faltan (ej. "excluye 1 cuenta CLP $95.000.000 sin TC al 15-09-2026"). Mismo aviso en el flujo y en el Excel.
5. **Migración de saldos ya guardados**: se mantiene el `usd` histórico tal cual (ya se informó). Solo se marca `tcFuente:"open.er-api (histórico)"` cuando no hay TC registrado. Recalcular el histórico requiere tu decisión aparte.

Decisiones que necesito de Angelo:
- (a) ¿Dólar observado del día del saldo o del día hábil anterior?
- (b) ¿Fuente para PEN: carga manual o SBS?
- (c) ¿Recalcular o no los saldos históricos con la fuente nueva?

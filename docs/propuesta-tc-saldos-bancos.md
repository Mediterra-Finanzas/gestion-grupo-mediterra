# Tipo de cambio de los saldos bancarios — diagnóstico y política propuesta

Estado: **implementada en la rama `claude/fervent-bell-uu6ae8` (oct-2026), sin publicar.** No se recalcularon históricos ni se reescribió `rec.usd` en bloque. Ver sección 0. Todas las líneas citadas son de `src/FinanzasModule.jsx` en la rama `claude/fervent-bell-uu6ae8`.

## 0. Implementación (política maestro_tc_v1)

Código: `src/tc/conversionSaldos.js` (puro). Pruebas aisladas: `src/__tests__/conversionSaldos.test.js` y `scripts/e2e/tc-politica.mjs` (14/14, navegador con hora de Chile, Supabase falso).

| Tema | Regla |
|---|---|
| Fuente | `maestro_tc` y nada más. open.er-api queda en Saldos Bancos como "referencia mercado hoy, no se usa en cálculos". |
| Fecha | TC de la **fecha del saldo**; si falta, la última cotización anterior con hasta **5 días hábiles** (lun–vie; los feriados no se descuentan, el límite es más estricto). Más antigua → **sin paridad**. |
| Pares | CLP: `USD-CLP` (mindicador). EUR: `EUR-USD` (BCE) y, si no hay, `USD-EUR`. PEN: `USD-PEN` **solo con fuente manual**. Sin triangulación. |
| Saldo nuevo | Se guarda con `usd, tc, tcPar, tcOp, tcFecha, tcFuente, tcDiasHabiles, tcPolitica:"maestro_tc_v1"`. Sin cotización: `usd:null, tcEstado:"sin_tc", tcMotivo`. |
| Saldo histórico | Registro **sin `tcPolitica`**: se respeta su `usd` y se rotula "TC histórico (fuente y fecha no registradas)". `usd` null, o 0 con monto → sin paridad. Pasa a la política solo cuando alguien vuelve a guardar **ese** saldo. |
| Lectura | `leerUsdSaldo` + `saldosVigentes` son la única lectura: Saldos Bancos, Flujo Empresas, Dashboard, Consolidado (incl. semanas), Reporte Semanal (pantalla y PDF) y Excel individual y consolidado. |
| Visible | TC, par, fecha y fuente: tiles y cada cuenta en Saldos Bancos (con vista previa "al guardar"), detalle desplegable del saldo en Flujo/Consolidado/Dashboard, PDF del Reporte y nota al pie del Excel. |

Efecto en cifras: Flujo, Dashboard, Consolidado y Excel **no cambian** con datos históricos (ya leían `rec.usd`). Cambian Saldos Bancos (antes convertía en vivo con open.er-api) y el Reporte Semanal (antes 950 / 3,75 fijos y EUR omitido). Ver la comparación antes/después del informe.

### Diferencia 117.433 vs 17.433 (reproducida)

Mismo saldo: Allegria Foods BICE USD 17.433 + BICE CLP 95.000.000 guardado con `usd: null`.

| Pantalla | Cálculo antes | US$ |
|---|---|---|
| Reporte Semanal | 17.433 + 95.000.000 / **950 (fijo)** = 17.433 + 100.000 | **117.433** |
| Dashboard / Flujo / Consolidado / Excel | 17.433 + (CLP sin `usd` guardado → **0**) | **17.433** |

Era de **cálculo**, no de redacción: dos criterios para el mismo saldo. Ninguno era correcto (uno usaba un TC inventado, el otro contaba 0 sin avisarlo). Ahora las dos pantallas dan 17.433 · **INCOMPLETO** con la cuenta CLP nombrada; al volver a guardarla con TC (p. ej. 925,40 del 15-09) ambas dan 17.433 + 102.658,31 = 120.091,31.

## 1. Hoy hay tres criterios distintos para el mismo saldo

| # | Criterio | Dónde | TC usado |
|---|---|---|---|
| A | **En vivo** | Saldos Bancos, total por empresa (`totalesEmpresa`, L8884) y detalle (`porEmpresa`, L9142) | `open.er-api.com` (agregador de mercado) **del momento de abrir la pestaña**, no de la fecha del saldo. Si falla, usa el `usd` guardado. |
| B | **Guardado** (`rec.usd`) | Todo lo que consume el saldo fuera de esa pestaña (sección 2) | El TC de A **en el momento en que alguien guardó**, congelado. Si la API estaba caída, se guarda `usd: null`. |
| C | **Fijo** | Reporte Semanal, saldo por moneda (`reporte_calcSaldosPorMoneda`, L9577) | CLP: `params.tcUSDtoCLP` o, por defecto, **950** fijo (L9559). PEN: **3,75** fijo (L9560). **Las cuentas EUR se omiten por completo** (no hay rama `eur`). |

`maestro_tc` (mindicador.cl = dólar observado del BCCh; frankfurter = BCE; carga manual) **no se usa** en ninguno de los tres. Sí lo usan Frisku y Rendiciones.

### Ejemplo (datos ficticios): un mismo saldo, tres cifras de caja

Allegria Foods al 15-09-2026: BICE US$17.433 y una cuenta CLP de $95.000.000.

| Vista | Cálculo | Caja US$ |
|---|---|---|
| A · Saldos Bancos (API hoy: 940,12) | 17.433 + 95.000.000 / 940,12 = 17.433 + 101.050,93 | **118.483,93** |
| B · Flujo, Dashboard, Consolidado, Excel (guardado con 925,40) | 17.433 + 95.000.000 / 925,40 = 17.433 + 102.658,31 | **120.091,31** |
| C · Reporte Semanal (fijo 950) | 17.433 + 95.000.000 / 950 = 17.433 + 100.000,00 | **117.433,00** |

La diferencia máxima es 120.091,31 − 117.433,00 = **2.658,31**, para un mismo saldo bancario.

## 2. Todos los lugares que consumen `rec.usd` (criterio B)

| Línea | Función | Pantalla o salida | Si `usd` es `null` |
|---|---|---|---|
| L4365 | `getSaldoBancoParaSemana` | Consolidado: saldo banco por columna (mes/semana) | La cuenta suma **0** |
| L4406 | `getSaldoBancoInicial` | Consolidado (saldo inicial por empresa, L4606); Dashboard (`cajaGrupoBase`, L7577); **Excel individual** (saldo inicial, L13197) | La cuenta suma **0**. Si **ninguna** cuenta tiene valor, cae al `saldo_ini` estático. |
| L5278 | `getSaldoBancoUSD` | Reporte Semanal: saldo inicial por empresa (L9621, L9728) | La cuenta suma **0** |
| L5995 | `saldoBancoUSD` (useMemo en `FlujoEmpresa`) | Flujo Empresas: saldo inicial y Saldo acumulado de la empresa | La cuenta suma **0** |
| L7623 | `saldoDeEmpresas` (Dashboard) | KPI "Saldo bancos Chile / Allpa Perú" | La cuenta suma **0** |
| L8895 | `totalesEmpresa` (Saldos Bancos) | Total por empresa cuando la API falla | Si es CLP/EUR/PEN, **no suma**; el aviso es un "⚠️ sin paridad" pequeño |
| L9142 | `porEmpresa` (Saldos Bancos) | Detalle por cuenta cuando la API falla | Muestra vacío |

En ninguno de estos lugares el total se marca como **incompleto**. Además, los filtros de fecha no son uniformes: `getSaldoBancoInicial` acepta saldos con fecha futura, mientras `getSaldoBancoUSD`, `saldoBancoUSD` y `saldoDeEmpresas` los descartan.

Otros detalles:
- `toUSD` devuelve `monto × 0` cuando la API responde pero falta la moneda: la cuenta queda en 0 y no aparece como "sin TC".
- `PanelBancosNomina` (L14510) muestra cada moneda por separado y no convierte. No tiene este problema.

## 2b. Ya implementado sin cambiar cifras (oct-2026)

Mientras la política sigue pendiente, una cuenta sin paridad ya no pasa inadvertida. **Ninguna cifra cambió** (E2E `scripts/e2e/sin-paridad.mjs`: mismos valores en el build anterior y en el nuevo):

| Dónde | Qué se ve |
|---|---|
| Saldos Bancos | Celda "⚠ sin paridad" en la cuenta; "incompleto: N cuentas" en la empresa; "INCOMPLETO" en el total consolidado y "· incompleto" en el total grupo. |
| Flujo Empresas | Aviso sobre la tabla con cada cuenta (banco, moneda, monto, fecha, motivo). |
| Dashboard y Consolidado | KPI de saldo marcado "· INCOMPLETO" y aviso con el detalle. |
| Reporte Semanal | KPI "Saldo Bancos Grupo · INCOMPLETO", aviso en pantalla y nota en el PDF; las cuentas EUR (antes omitidas en silencio) aparecen como "sin conversión, no suma". |
| Excel individual y consolidado | Nota en el subtítulo y al pie (`textoSinParidad`). |

Detección (`cuentasSinParidad`): saldo vigente no-USD con `usd` null, o con `usd` 0 y monto distinto de 0. Este segundo caso salía de `toUSD`, que devolvía `monto × 0` cuando la fuente no traía la moneda; ahora devuelve `null`, así que los saldos nuevos quedan marcados en lugar de guardarse como 0.

Sigue pendiente lo que exige la política: cuál TC usar, recalcular o no, y el criterio C del Reporte (950 / 3,75 fijos).

## 2c. Recomendación concreta

1. **Fuente única `maestro_tc`**: dólar observado del BCCh (mindicador) para CLP, BCE (frankfurter) para EUR y `USD-PEN` de la **SBS** cargado a mano para PEN.
2. **TC del día del saldo**, con hasta 5 días hábiles hacia atrás; si no hay, la cuenta queda sin paridad (ya visible, sección 2b).
3. **No recalcular históricos**: se marcan "TC histórico (open.er-api, fecha no registrada)". Si más adelante decides recalcular, primero se muestra la diferencia cuenta por cuenta.
4. **`open.er-api.com` queda solo como referencia** "mercado hoy", fuera de los cálculos.
5. El Reporte Semanal deja los TC fijos (950 / 3,75) y lee el mismo `usd` guardado.

Motivo: el dólar observado es la referencia contable en Chile para los EEFF, y usar el TC de la fecha del saldo hace que la cifra sea reproducible y auditable.

## 3. Política propuesta

| Tema | Propuesta |
|---|---|
| **Fecha** | El TC **vigente en la fecha del saldo** (la fecha de la cuenta), no el de hoy ni el del momento del guardado. Si ese día no hay dato (fin de semana o feriado), se usa el último anterior, hasta un máximo de **5 días hábiles**. Si es más antiguo, la cuenta queda **sin TC**. |
| **Fuente** | Una sola: `maestro_tc` mediante `buscarTC()`. `open.er-api.com` deja de usarse en cálculos; puede quedar solo como columna "mercado hoy (referencia)". |
| **Pares** | **USD**: 1. **CLP**: `USD-CLP`, dólar observado (mindicador). **EUR**: `EUR-USD` del BCE (frankfurter) o triangulado con `EUR-CLP` / `USD-CLP` (mindicador). **PEN**: `USD-PEN` cargado a mano (SBS o BCRP), porque frankfurter no lo publica. Cualquier otra moneda queda sin TC. |
| **Registro** | Junto al saldo se guarda `{ usd, tc, tcPar, tcFecha, tcFuente }`. Cada cifra en US$ se puede auditar. |
| **Una sola cifra** | Saldos Bancos, Flujo, Dashboard, Consolidado, Excel y Reporte Semanal leen el mismo `usd` guardado. El Reporte deja de usar 950 y 3,75 fijos, y deja de omitir EUR. |
| **Sin paridad** | La cuenta **no cuenta como 0**: queda fuera del total y el total se rotula **"Parcial"**, con lo excluido explícito (moneda, monto y fecha). El mismo aviso aparece en el flujo, el Dashboard, el Reporte y el Excel (nota al pie). |
| **Históricos** | No se recalculan automáticamente. Los saldos ya guardados conservan su `usd` y se muestran como "TC histórico (open.er-api, fecha no registrada)". Si decides recalcularlos, primero se muestra la diferencia cuenta por cuenta y luego se aplica con trazabilidad. |

### Ejemplos con la política propuesta (TC ficticios)

Cuentas al 15-09-2026: USD 17.433 · CLP 95.000.000 · EUR 50.000 · PEN 380.000.
TC: observado 925,40 CLP/USD · EUR-USD 1,0850 · USD-PEN 3,7500.

| Cuenta | Cálculo | US$ |
|---|---|---|
| USD | 17.433 × 1 | 17.433,00 |
| CLP | 95.000.000 / 925,40 | 102.658,31 |
| EUR | 50.000 × 1,0850 | 54.250,00 |
| PEN | 380.000 / 3,7500 | 101.333,33 |
| **Total (completo)** | | **275.674,64** |

Si falta el TC USD-PEN del 15-09 (y el último tiene más de 5 días hábiles):

| | US$ |
|---|---|
| USD + CLP + EUR = 17.433,00 + 102.658,31 + 54.250,00 | **174.341,31 · Parcial** |
| Excluido | PEN 380.000 (sin TC al 15-09-2026) |

Hoy, en cambio, esa misma situación muestra 174.341,31 en el Flujo **sin aviso** (PEN suma 0). El Reporte Semanal, mientras tanto, muestra PEN a 3,75 y omite EUR.

## 4. Decisiones que necesito

1. ¿TC **del día del saldo** (con tolerancia de 5 días hábiles), o del día hábil anterior?
2. Fuente de PEN: ¿carga manual SBS, BCRP u otra?
3. ¿Se recalculan los históricos? Mi recomendación: no, y marcarlos como históricos.
4. ¿`open.er-api.com` se retira o queda como referencia visible "mercado hoy"?

Con esas respuestas, la implementación toca `SaldosBancos` (guardado), las 7 funciones de la sección 2 (lectura y marca de "parcial") y `reporte_calcSaldosPorMoneda`. Cada cambio de cifras va con su test de cuadre.

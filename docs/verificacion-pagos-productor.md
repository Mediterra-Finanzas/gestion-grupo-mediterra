# Comprobación de los compromisos con Don Alberto

**Actualizado el 05/10/2026 con la corrección de Angelo.** Los US$679.000 **no
son pagos ejecutados**:

| Grupo | Importes | Suma | Qué es |
|---|---|---:|---|
| Con pagaré | 255.000 + 89.890 + 17.110 | **362.000** | compromiso documentado, ejecución por confirmar |
| No ejecutados | 119.000 + 119.000 + 79.000 | **317.000** | anticipos futuros, fechas por confirmar |

El **saldo de apertura documentado queda retirado**: estaba pensado para un
total de pagos históricos sin detalle, y acá no hay pagos confirmados ni falta
el detalle. Si la cartola confirma los US$362.000, cada importe entra como
realización con su fecha real, que es más trazable que cualquier total de
apertura.

## El principio que ordena todo esto

- **Evidencia de compromiso** (pagaré, contrato): justifica una **cuota**. Dice
  cuánto hay que pagar.
- **Evidencia de movimiento** (cartola, comprobante): justifica una
  **realización**. Es lo único que convierte el compromiso en pago.

Un pagaré no promueve una cuota a pago, por mucho que esté firmado.

## Comprobación 1 — ¿salieron los US$362.000 de la cuenta?

Es la única pregunta que puede convertir esos tres compromisos en pagos. En la
cartola de la cuenta que corresponda:

| # | Importe US$ | ¿Salió? | Fecha del cargo | Cuenta | Comprobante |
|---|---:|---|---|---|---|
| 1 | 255.000 | | | | |
| 2 | 89.890 | | | | |
| 3 | 17.110 | | | | |

Si alguno salió por un monto distinto del comprometido, anotar el monto real:
la realización se registra por lo que efectivamente se movió, y la diferencia
contra la cuota queda a la vista. Si uno salió en dos partes, anotar las dos.

Los otros tres (119.000, 119.000, 79.000) **no se consultan en la cartola**:
están declarados como no ejecutados.

## Comprobación 2 — ¿hay algo ya cargado en el sistema?

Para no duplicar al cargar. No pude ejecutarla: la política de red de este
entorno rechaza el host de Supabase (403 a CONNECT a
`bywovqayuzodbzwsriet.supabase.co`). Para habilitarlo: menú del entorno cloud
de la sesión → *Edit* → **Network access**, con ese host en *Allowed domains*
conservando la lista de gestores de paquetes
(https://code.claude.com/docs/en/cloud-environments#network-access).

Mientras tanto, en **Finanzas → Flujo Empresas → Allegria Foods → Parámetros →
Temporada 2026-2027 → Cerezas**, columna **Pagos al productor**, revisar los
cuatro lugares donde puede estar algo ya cargado:

1. **Estimaciones** (filas de anticipo con US$/kg) y sus movimientos.
2. **Programas por contraparte** → tarjeta de Don Alberto, si existe → cuotas y
   sus movimientos.
3. **Montos informados sin fecha verificada** en esa tarjeta.
4. **Movimientos pendientes de conciliación** (la bandeja).

También los **programas archivados**: un movimiento de un programa archivado
sigue descontando.

| # | Importe US$ | ¿Aparece? | ¿Dónde? | Fecha que muestra | Monto exacto |
|---|---:|---|---|---|---|
| 1 | 255.000 | | | | |
| 2 | 89.890 | | | | |
| 3 | 17.110 | | | | |
| 4 | 119.000 | | | | |
| 5 | 119.000 | | | | |
| 6 | 79.000 | | | | |

Dos criterios: si un importe aparece dos veces se anotan las dos, sin suponer
duplicado; y un monto parecido pero distinto es un movimiento distinto hasta
que la cartola diga lo contrario.

## Efecto en el flujo, medido con el modelo

Base del productor US$2.150.500 (tu cifra declarada), liquidación en Mar-27,
mes de corte Oct-26, realizado **cero** porque nada está confirmado como
pagado:

| Opción de carga | Proyección | Total proyectado | Contra el compromiso |
|---|---|---:|---:|
| **(a)** seis cuotas sin fecha, reservadas (comportamiento por defecto) | Mar-27: 1.471.500 | **1.471.500** | **−679.000** |
| **(b)** sin fecha, decidido "se paga en la liquidación" | Mar-27: 2.150.500 | 2.150.500 | 0 |
| **(c)** con meses estimados | Nov-26 362.000 · Dec-26 119.000 · Jan-27 119.000 · Feb-27 79.000 · Mar-27 1.471.500 | 2.150.500 | 0 |

La opción (a) deja US$679.000 **fuera de la proyección**: el compromiso se ve
como *pendiente de calendarizar*, pero la caja proyectada sale mejor de lo que
corresponde. Recomendado: **(b)** mientras no haya fechas, y pasar a **(c)**
cuando lleguen.

Si después la cartola confirma uno de los US$362.000, ese monto pasa de
pendiente a realizado: deja de proyectarse en su mes y sigue descontando de la
liquidación. El total no cambia; cambia el mes.

## Qué falta para cargar

1. La cartola de los tres importes con pagaré (comprobación 1).
2. La revisión de lo ya cargado (comprobación 2).
3. Tu decisión entre (a), (b) y (c).
4. Las fechas, cuando existan, para pasar a (c).


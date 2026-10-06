# Propuesta de carga — Allegria Foods, Cerezas 2026-2027

**SIMULACIÓN EN COPIA AISLADA. Ningún dato real fue leído ni escrito.**

> ⚠ **La columna «antes» NO es el flujo actual de producción.** Es una base
> sintética: la temporada con los parámetros informados y **cero
> estimaciones cargadas**. Producción sí tiene estimaciones, así que esta
> columna no sirve para aprobar nada. Se reemplaza por los valores reales
> cuando lleguen las capturas y el Excel, y recién entonces las diferencias
> son presentables para aprobación.

## Parámetros usados

Referencia **declarada** por el CFO, todavía **no contrastada** con el Excel
de producción:

- kilos 850.000 · FOB US$4.5/kg · descuento exportadora 6%
- materiales US$0.5/kg · servicios US$1.2/kg
- venta cliente = 850.000 × 4.5 = **3.825.000**
- retorno neto productor = 4.5 × 0.94 − 0.5 − 1.2 = **US$2.53/kg** → 2.150.500

## Efecto mensual sobre la base sintética

| Mes | Anticipo Cerezas (base sintética) | con la propuesta | Δ ingreso | Δ costo |
|---|---:|---:|---:|---:|
| Sep-26 | 0 | 138.000 | +138.000 | +0 |
| Nov-26 | 0 | 459.920 | +459.920 | +0 |
| Dec-26 | 0 | 537.450 | +537.450 | +0 |
| Jan-27 | 0 | 311.450 | +311.450 | +0 |
| Mar-27 | 3.825.000 | 1.616.300 | -2.208.700 | +0 |
| Apr-27 | 0 | 0 | +0 | -317.000 |

Suma de los deltas de ingreso: **-761.880** (= lo ya cobrado, que está en el banco y deja de proyectarse)
Suma de los deltas de costo: **-317.000** (= los 317.000 reservados sin fecha, que salen del saldo al productor)

## Lado CLIENTE

- Base (presupuesto de venta): **3.825.000**
- Anticipos ya cobrados: **761.880**
- Anticipos pendientes: **1.446.820**
- · vencidos antes del corte: **138.000**
- · dentro del horizonte: **1.308.820**
- · sin fecha: **0**
- Liquidación residual (Mar-27): **1.616.300**
- Total calendarizado: **3.063.120**
- Proyectado sobre fechas ESTIMADAS, no pactadas: **1.308.820**
- Con fecha contractual vencida: **138.000**
- Excedente real: **0**
- Exceso de compromisos: **0**

## Lado PRODUCTOR (Don Alberto)

- Base (retorno presupuestario): **2.150.500**
- Pagos ya efectuados: **0**
- Anticipos pendientes CON fecha: **0**
- Pendiente de calendarizar (sin fecha): **317.000**
- · reservados, no proyectables: **317.000**
- Saldo al productor (Apr-27): **1.833.500**

Los **317.000** confirmados y no ejecutados van como cuotas vigentes **sin
fecha**: bajan el saldo al productor de 2.150.500 a 1.833.500 y quedan
declarados como calendario incompleto. No se les inventó mes, así que no se
proyectan en ninguno. Los **362.000** con pagaré van como **antecedentes**:
se ven, no cuentan como realizado y no proyectan hasta que la cartola
confirme su fecha real.

## Conciliación bancaria de los cobros confirmados — PENDIENTE

Que un cobro esté confirmado no prueba que esté incluido en los saldos
bancarios que el flujo usa como punto de partida. Sin los saldos cargados,
el modelo no puede comprobarlo y lo dice:

| Fecha | US$ | Estado contra los saldos |
|---|---:|---|
| 2026-07-15 | 362.000 | NO SE PUEDE COMPROBAR (sin saldos cargados) |
| 2026-08-24 | 39.980 | NO SE PUEDE COMPROBAR (sin saldos cargados) |
| 2026-09-16 | 197.980 | NO SE PUEDE COMPROBAR (sin saldos cargados) |
| 2026-09-24 | 161.920 | NO SE PUEDE COMPROBAR (sin saldos cargados) |

Total sin comprobar: **761.880**. Se resuelve con la fecha de
saldo de cada cuenta bancaria: un cobro posterior a la fecha de saldo de su
cuenta **no** está incluido y se contaría dos veces.

## Cómo asociar un cobro confirmado a una estimación existente

Medido en la copia aislada, sobre una estimación de 362.000 y un cobro de
362.000:

| Forma de registrarlo | Realizado | Pendiente | Liquidación | Saldo económico |
|---|---:|---:|---:|---:|
| Estimación sola, sin cobrar | 0 | 362.000 | 3.463.000 | 3.825.000 |
| Cobro en cuota histórica, sin asociar | 362.000 | 362.000 | 3.101.000 | 3.463.000 |
| Cobro en cuota histórica, «sustituyendo» | 362.000 | 362.000 | 3.101.000 | 3.463.000 |
| **Cobro registrado EN la estimación** | 362.000 | **0** | **3.463.000** | 3.463.000 |

Tres conclusiones para la carga:

1. **El saldo económico no se mueve** por asociar el cobro: 3.463.000 en los
   tres casos en que el cobro está registrado. El dinero se cuenta una sola
   vez siempre.
2. **Una cuota histórica NO sustituye** (es borrador por diseño). Declarar la
   sustitución ahí no cambia nada; la pantalla tampoco la ofrece.
3. **Si no se asocia, queda un pendiente fantasma**: 362.000 ya cobrados que
   la estimación sigue proyectando, con la liquidación 362.000 más baja. El
   total cuadra igual contra el presupuesto; lo que está mal es **el mes** en
   que se proyecta la caja. Por eso, cuando las capturas muestren una
   estimación que un cobro cubría, el cobro se registra **sobre esa
   estimación**, no como cuota histórica.

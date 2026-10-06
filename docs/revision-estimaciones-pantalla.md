# Guía de revisión en pantalla — qué copiar antes de cargar nada

Objetivo: saber qué hay cargado hoy, para declarar qué estimación reemplaza
cada cuota y no proyectar dos veces el mismo compromiso. **Solo mirar y
copiar.** No cambies ni guardes nada.

## Ruta exacta

Misma ruta antes y después de publicar; lo que cambia es cuánto se ve al
final de ella.

1. Entrar a la app y abrir **Finanzas**.
2. Pestaña **Flujo Empresas**.
3. En el selector de empresa, elegir **Allegria Foods**.
4. Sub-pestaña **⚡ Parámetros** (al lado de *📈 Flujo de Caja*).
5. Botón **Temporada 2026-2027**.
6. Bajar a la fruta **Cerezas**. Ahí están las dos columnas:
   **📥 Cobros al cliente** (izquierda) y **📤 Pagos al productor** (derecha).

### Qué se puede revisar HOY, en producción

Producción está en `9d90ed2`, que **ya tiene** las estimaciones con
movimientos: cada fila de *Anticipos (US$/kg por mes)* muestra **Acordado**,
**Cobrado** o **Pagado**, **Pendiente**, la casilla de cierre, la etiqueta
*sin mes: no se proyecta, se liquida al final* y el aviso de pendiente
vencido. Con eso se completa la **Tabla A** entera y el punto 1 de la
**Tabla C**.

### Qué aparece SOLO después de publicar

Producción **no tiene** el panel *Programas comerciales por contraparte*: el
archivo no existe en `main`. Hasta que se publique `eed095f` no existen en
pantalla, y no hay nada que revisar ahí:

- la **Tabla B** completa (programas, cuotas, históricos, archivados),
- los puntos **2, 3 y 4** de la Tabla C (movimientos de una cuota, montos
  informados sin fecha verificada, bandeja de conciliación),
- la **Tabla D** completa (resumen por lado),
- la fecha estimada de caja con su motivo, y el vencimiento contractual.

Conclusión práctica: la Tabla A se levanta ahora; el resto, después del
deploy. No conviene esperar a tener todo para empezar, porque la Tabla A es la
que dice qué estimación reemplaza cada cuota.

Si hay más temporadas cargadas (2025-2026, 2027-2028), repetir para cada una:
lo que se cargue en una temporada no afecta a otra, pero hay que saber qué
existe.

## Tabla A — Estimaciones (las filas de anticipo de siempre)

Son las filas con mes y US$/kg, **sin contraparte**. En cada una, desplegar
para ver sus movimientos.

| Temporada | Lado (cliente/productor) | Mes | US$/kg | Acordado | Realizado | Pendiente | ¿Dice "sin mes: se liquida al final"? |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

De dónde sale cada dato en pantalla:

- **Mes** y **US$/kg**: los dos campos editables de la fila.
- **Acordado**: la cifra que la fila muestra como *Acordado*.
- **Realizado**: la que dice *Cobrado* o *Pagado*.
- **Pendiente**: la que dice *Pendiente*.
- La última columna: si la fila lleva la etiqueta de que no tiene mes. Eso
  cambia el tratamiento, así que hay que anotarlo.

## Tabla B — Programas y cuotas ya cargados

Panel **Programas comerciales por contraparte**, en cualquiera de las dos
columnas. Si no hay ninguno, anotarlo así y la tabla queda vacía.

| Temporada | Lado | Contraparte | Kilos del programa | Cuota: fecha prevista | Mes de flujo | Modalidad | Monto o US$/kg | Estado | Total acordado | Imputado | Pendiente | ¿Sustituye alguna estimación y por cuánto? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |

Anotar también, por programa: si está marcado **fuera de presupuesto**, su
**presupuesto asignado** y su **importe definitivo** si los tiene.

Y revisar el enlace al pie de cada columna, **«N programa(s) archivado(s)»**:
un movimiento de un programa archivado sigue descontando, así que si hay
archivados hay que anotar su contraparte y el monto que muestran.

## Tabla C — ¿Los movimientos históricos ya están registrados?

Un mismo cobro o pago puede estar en cuatro lugares distintos. Para cada
importe que creamos tener (los de WLH, el de SNF, los de Don Alberto),
buscarlo en los cuatro:

| Importe US$ | ¿Movimiento de una estimación? | ¿Movimiento de una cuota? | ¿Monto informado sin fecha? | ¿Bandeja de conciliación? | Fecha que muestra |
|---|---|---|---|---|---|
| 599.960 (WLH, los tres) | | | | | |
| 362.000 | | | | | |
| 39.980 | | | | | |
| 197.980 | | | | | |
| 161.920 (SNF) | | | | | |
| 255.000 (Don Alberto) | | | | | |
| 89.890 | | | | | |
| 17.110 | | | | | |
| 119.000 | | | | | |
| 119.000 | | | | | |
| 79.000 | | | | | |

Dónde mirar cada uno:

1. **Movimientos de una estimación**: desplegar la fila del anticipo; los
   movimientos aparecen con fecha, monto y nota.
2. **Movimientos de una cuota**: dentro de la tarjeta de la contraparte, cada
   cuota lista los suyos.
3. **Montos informados sin fecha**: bloque *Montos informados sin fecha
   verificada* de la tarjeta.
4. **Bandeja de conciliación**: al final de cada columna, *Movimientos
   pendientes de conciliación*.

Dos criterios para que la respuesta sirva: si un importe aparece **dos veces**,
anotar las dos ubicaciones sin suponer que una es duplicado; y un monto
**parecido pero distinto** (119.500 contra 119.000) es un movimiento distinto
hasta que la cartola diga lo contrario.

### El estado de Don Alberto no es uniforme

Los US$679.000 son dos cosas distintas y la tabla tiene que distinguirlas:

- **US$362.000** (255.000 + 89.890 + 17.110): hay pagaré y la **ejecución está
  por confirmar**. Buscarlos en los cuatro lugares es precisamente para saber
  si alguien ya los registró.
- **US$317.000** (119.000 + 119.000 + 79.000): **confirmados como no
  ejecutados**. Si aparecen registrados como movimiento, es un error de carga
  que hay que anotar, no un dato.

Que la app muestre *realizado cero* para esta contraparte es el estado del
registro, no una conclusión comercial: significa que todavía no hay un
movimiento con fecha verificada cargado, no que no se haya pagado nada.

## Tabla D — Lo que el panel ya declara

Del resumen de cada lado, copiar las cifras tal como se ven. Sirve para armar
el antes/después sin tener que recalcular nada:

| Lado | Venta o retorno de presupuesto | Realizado | Pendientes (con fecha) | Pendiente de calendarizar | Liquidación (y su mes) | Excedente real | Exceso de compromisos |
|---|---|---|---|---|---|---|---|
| Cliente | | | | | | | |
| Productor | | | | | | | |

## Qué hago con esto

Con las tablas A a D preparo:

1. La **tabla de sustituciones**: cuota por cuota, cuánto consume de cada
   estimación, y el saldo que le queda a cada estimación.
2. El **antes/después del flujo**: mes a mes, la línea *Anticipo Cerezas* y
   *Costo Fruta Exportación* como están hoy y como quedarían, con la
   diferencia explícita.

Las dos para tu revisión, antes de cargar nada.

## Condición del residual del cliente

El residual de **US$1.616.300** no es un dato independiente: sale de restar al
presupuesto de US$3.825.000 lo realizado y lo calendarizado. Vale **solo si**
se cumplen las dos cosas a la vez:

1. los calendarios de WLH, SNF y TUNGSHING están **completos** (ninguna cuota
   pactada quedó sin cargar), y
2. cada cuota **sustituye correctamente** la estimación anterior que
   corresponde, por el monto que corresponde.

Si falta una cuota, el residual queda alto. Si una cuota no sustituye la
estimación que ya cubría ese compromiso, el mismo monto se proyecta dos veces
y el residual queda bajo. Por eso la Tabla A se levanta antes de cargar: es la
que permite declarar la sustitución en vez de adivinarla.

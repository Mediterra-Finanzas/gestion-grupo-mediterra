# Guía de revisión en pantalla — qué copiar antes de cargar nada

Objetivo: saber qué hay cargado hoy, para declarar qué estimación reemplaza
cada cuota y no proyectar dos veces el mismo compromiso. **Solo mirar y
copiar.** No cambies ni guardes nada.

## Ruta exacta

1. Entrar a la app y abrir **Finanzas**.
2. Pestaña **Flujo Empresas**.
3. En el selector de empresa, elegir **Allegria Foods**.
4. Sub-pestaña **Parámetros** (al lado de *Flujo de Caja*).
5. Botón **Temporada 2026-2027**.
6. Bajar a la fruta **Cerezas**. Ahí están las dos columnas:
   **Cobros al cliente** (izquierda) y **Pagos al productor** (derecha).

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

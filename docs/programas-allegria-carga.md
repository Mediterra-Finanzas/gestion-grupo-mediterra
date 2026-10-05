# Liquidación con anticipos de Allegria Foods — guía de carga

Preview. Nada se migra solo a producción y la carga gradual no cambia ninguna
proyección hasta que pongas una cuota en vigencia.

Dónde: **Finanzas → Flujo Empresas → Allegria Foods → Parámetros → Temporada →
Cerezas**.

## Cómo calcula

Por lado, y los dos lados son independientes:

```
Cliente    → base = kg × FOB
Productor  → base = kg × MAX(0, FOB × (1 − desc. exportadora%) − materiales/kg − servicios/kg)

base             = liquidación definitiva si la cargaste, si no el presupuesto
(−) realizado      todos los cobros o pagos reales aplicados
(−) pendientes     anticipos futuros con mes (estimaciones + cuotas vigentes)
= liquidación final proyectada

saldo total pendiente = pendientes + liquidación
```

Cobrar un pendiente lo pasa a realizado por el mismo monto: la liquidación no
se mueve y nada se descuenta dos veces.

Materiales y servicios se descuentan del precio del productor **y** se pagan
aparte en sus propias líneas del flujo. El descuento de exportadora se queda en
Allegria: no es salida de caja.

## Orden de carga

### 1. Estimación, antes de conocer el calendario

Columna **Cobros al cliente** o **Pagos al productor** → `+ Agregar anticipo`:
mes y US$/kg sobre los kilos de la fruta. Es lo que ya existía y sigue igual.
Sin contraparte, para proyectar caja mientras no hay acuerdo.

### 2. Incorporar un cliente o un productor

Panel **Programas comerciales por contraparte** → `+ Agregar cliente` /
`+ Agregar productor`. Se pueden agregar en cualquier momento de la temporada.

- **Kilos del programa**: los comprometidos con esa contraparte. Se usan para
  calcular las cuotas en US$/kg. No son los de la fruta.
- **Precio del programa**: informativo. No alimenta el flujo.
- **Fuera de presupuesto**: márcalo si la operación no está en el presupuesto.
  Entonces no proyecta ni reduce la liquidación de las demás, y sus movimientos
  reales se muestran aparte con la pregunta de cómo incorporarla.

### 3. Cargar el calendario

`+ Agregar cuota al calendario`, una por línea del acuerdo:

| Campo | Qué va |
|---|---|
| Fecha prevista | la del acuerdo |
| Mes de flujo | el mes en que se proyecta. Vacío: no se proyecta y se cobra o paga en la liquidación |
| Modalidad | `US$/kg × kilos del programa`, `monto fijo en USD`, o `por confirmar` |
| Estado | `borrador` (no proyecta ni sustituye) o `vigente` |
| Pendiente que reemplaza estimación | cuánto de cada estimación consume esta cuota |

`Por confirmar` conserva el importe del calendario como referencia y lo marca
como no contractual: no se convierte en tarifa ni se proyecta.

**Sustitución parcial**: una estimación puede ser consumida por varias cuotas y
quedar con saldo. El disponible es su pendiente, o sea su acordado menos lo ya
cobrado y menos lo ya sustituido. Si escribes más que eso, la app avisa, pide
confirmación y marca la **sobre-sustitución** para resolver a mano: no la
recorta sola. Una estimación con el pendiente trasladado a liquidación no se
puede sustituir.

### 4. Registrar cobros y pagos reales

`+ Registrar cobro recibido` / `+ Registrar pago efectuado` en la cuota: fecha
real, monto en USD y referencia. Al guardar, la app pregunta:

> ¿Este cobro estaba **incluido** en el total acordado de la cuota, o es
> **adicional** al acuerdo?

y muestra el efecto antes de confirmar:

- **Incluido**: el total acordado no cambia y el pendiente de la cuota baja.
- **Adicional**: el total acordado sube y el pendiente se conserva.

Imputar nunca modifica el acuerdo por su cuenta. La tarifa o el monto pactados
quedan intactos; lo adicional se anota aparte.

Si todavía no sabes a qué operación corresponde el movimiento:
`+ Registrar cobro sin operación identificada`. Queda en la bandeja de
conciliación, visible, **sin descontar de ninguna liquidación**.

### 5. Asociar un movimiento ya registrado

`Asociar movimiento existente` en la cuota: elige el cobro que está en una
estimación y la app lo **mueve**, conservando id, fecha, monto, usuario e
historial. No se vuelve a registrar. La estimación de origen **no reabre** ese
monto, ni al mover ni al revertir después.

### 6. Liquidación definitiva

`+ Cargar liquidación definitiva` cuando tengas los kilos y el precio reales.
Reemplaza la base presupuestada de ese lado en el flujo y conserva el
presupuesto para mostrar la variación. Mientras no la cargues, la cifra se
rotula *proyectada*: el presupuesto no es deuda en firme.

## Qué no se borra

- Un programa con movimientos o sustituciones no se elimina: se **archiva con
  motivo**. Sus cuotas dejan de proyectar y de sustituir, la estimación
  recupera su pendiente, y los cobros o pagos registrados siguen descontando.
- Una realización no se edita ni se borra: se **anula con motivo**. Ahí sí deja
  de contar en el realizado y la estimación de origen recupera su capacidad.
- Volver una cuota a borrador no resucita como pendiente la parte ya cobrada.

## Cómo leer el resumen de cada lado

```
Venta (o retorno) de presupuesto / definitiva      ← base
  variación contra presupuesto                      (solo si hay definitiva)
Anticipos ya cobrados / pagados                     ← realizado
Saldo económico pendiente                           = base − realizado
  Anticipos pendientes
    · vencidos, antes del corte                     NO entran al acumulado
    · dentro del horizonte
    · después del horizonte                         no tienen columna en el flujo
    · sin fecha, pendientes de calendarizar
  Liquidación (mes)                                 con su ubicación temporal
    · compensaciones aplicadas que la reducen
  Total calendarizado
  Pendiente de calendarizar
Excedente real                                      lo único que puede ser deuda
Exceso de compromisos del calendario                aviso, no obligación
```

Las cuatro cubetas de fecha son excluyentes: ningún monto aparece dos veces ni
desaparece. El **excedente real** es lo cobrado o pagado por sobre la base; el
**exceso de compromisos** es el calendario pasándose, que no crea ninguna
obligación. Son dos números distintos y nunca se suman.

## Registros antiguos sin fecha

Si tienes anticipos sin mes cargados de antes, aparece un aviso con su monto.
Hoy esos montos están dentro de la liquidación, que es el tratamiento que la
app venía dando, y **no cambia hasta que decidas**, uno por uno:

- *sigue acordado sin fecha*: sale de la liquidación y queda pendiente de
  calendarizar. La caja proyectada del mes de liquidación baja en ese monto.
- *trasladar a liquidación*: queda como está hoy, pero ya declarado.

La decisión se guarda con tu usuario, la fecha y el historial si cambias de
opinión. Un anticipo nuevo sin fecha no se confunde con uno antiguo.

## Saldos a favor

Cuando una contraparte queda con **excedente real**, el bloque *Saldos a favor*
permite reconocerlo. `+ Reconocer saldo` pide contraparte, monto y respaldo. Sin
respaldo queda **provisional**: visible, sin afirmar que sea exigible. Con
liquidación definitiva individual o documento, queda **reconocido**.

Cada saldo muestra cuatro cifras distintas:

```
reconocido   el monto del excedente
resuelto     movimientos ya ejecutados + compensaciones aplicadas
programado   cuotas agendadas sin ejecutar + compensaciones reservadas
pendiente    reconocido − resuelto        ← programar NO lo extingue
disponible   pendiente − programado
```

Acciones:

- **Recuperar del productor / Devolver al cliente**: agenda monto y mes. El
  flujo lo proyecta en *Recuperación de anticipos a productores* (entrada) o
  *Devolución de anticipos a clientes* (salida). Al registrar el movimiento
  real, deja de proyectarse y pasa a *resuelto*.
- **Compensar**: queda **reservada**, ocupando disponible y sin mover nada.
  Al aplicarla contra una operación destino con saldo, reduce ese cobro o pago
  una sola vez, sin movimiento bancario. Si el destino solo absorbe parte, el
  remanente queda visible.
- **Aplazar**: cambia el mes de una cuota agendada, con motivo y sin duplicarla.
- **Anular**: libera la reserva. Una aplicación ya ejecutada no se anula desde
  ahí: se corrige anulando su movimiento, con motivo.

Las dos líneas nuevas del flujo son movimientos de caja y están marcadas como
**no venta** y **no costo de fruta**: no son ventas nuevas ni modifican ningún
anticipo histórico.

## Presupuesto asignado por operación

En la tarjeta de cada contraparte puedes asignarle una porción del presupuesto.
Se **sugiere** desde kilos × precio, pero la confirmas tú. El panel muestra
presupuesto global, asignado y remanente. Si la suma supera el presupuesto, la
app pregunta si es una **ampliación** o prefieres **reasignar**: no recorta ni
amplía sola.

Asignar saca a la operación del bloque **entera**: su presupuesto, sus
movimientos y sus pendientes. Con `importe definitivo` cargado, esa operación
liquida con su propia base y su variación queda a la vista. Las posiciones no
se netean entre contrapartes: si una cobró de más y otra debe, se ven las dos.

## Qué revisar

El pendiente vencido es el que quedó programado en un mes anterior al mes en
curso: se proyecta antes del corte y **no entra al saldo acumulado**. No es
flujo futuro y hay que reprogramarlo o registrarlo a mano.

## Comprobar el Excel contra el flujo

`📥 Excel` → hoja **Parametros**: las estimaciones con acordado / realizado /
sustituido / pendiente, un bloque por contraparte con sus cuotas, y la fila de
liquidación `MAX(0, base − descuentos)`. El realizado y lo sustituido van como
constantes, nunca como fórmula: son históricos.

Mes a mes, la fila *Anticipo Cerezas* del flujo tiene que ser la suma de los
pendientes de ese mes, y en el mes de liquidación sumar la liquidación. Igual
para *Costo Fruta Exportación* del lado productor.

## Verificación automática

```bash
node src/programas.test.mjs                                   # modelo puro (135)
CI=true npx react-scripts test --watchAll=false               # suite completa
VIDEO=1 OUT_DIR=/tmp/e2e node scripts/e2e/programas-allegria.mjs   # navegador + Excel real + video
OUT_DIR=/tmp/reg node scripts/e2e/regresion-empresas.mjs      # las demás empresas
```

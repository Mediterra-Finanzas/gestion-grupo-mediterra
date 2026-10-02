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

## Qué revisar

El resumen de cada lado trae, en este orden: total estimado o definitivo,
variación contra presupuesto, realizado, saldo total pendiente, anticipos
pendientes, de ellos los **vencidos (fuera del acumulado)**, y la liquidación
final proyectada. Más los avisos de excedente, sobre-sustitución, movimientos
sin conciliar y operaciones fuera de presupuesto.

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
node src/programas.test.mjs                                   # modelo puro (76)
CI=true npx react-scripts test --testPathPattern programas --watchAll=false
OUT_DIR=/tmp/e2e-programas node scripts/e2e/programas-allegria.mjs   # navegador + Excel real
```

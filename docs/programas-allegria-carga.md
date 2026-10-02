# Programas comerciales de Allegria Foods — guía de carga

Preview. Nada de lo que cargues acá se migra solo a producción, y la carga
gradual no cambia ninguna proyección hasta que actives un programa.

Dónde: **Finanzas → Flujo Empresas → Allegria Foods → Parámetros → Temporada →
Cerezas**, al final del panel: *Programas comerciales por contraparte*.

## Lo que cambia respecto de hoy

Hoy las filas de "Cobros al cliente" y "Pagos al productor" son una
**estimación de la temporada**: una tarifa US$/kg aplicada a los kilos de
presupuesto de la fruta. Siguen ahí y siguen rigiendo.

Lo nuevo es una capa aparte: un **programa por contraparte**, con sus propios
kilos, su propio precio y su propio calendario de anticipos. Los kg y el FOB de
arriba quedan como **presupuesto**, no como base de ningún acuerdo.

Las dos listas, clientes y productores, son independientes: cada una tiene su
propia asignación de kilos contra el presupuesto, y registrar un cobro no
registra ningún pago.

## Orden de carga

### 1. Crear el programa

`+ Agregar programa` en la columna que corresponda. Escribe la contraparte y
despliega la tarjeta con la flecha.

| Campo | Qué va |
|---|---|
| Kilos del programa | Los kilos comprometidos **con esa contraparte**. No los del presupuesto. |
| Precio | `US$/kg` (lo normal) o `Monto total USD` si el acuerdo es por suma cerrada. |
| Mes liquidación / Mes saldo | Cuándo se cobra o paga el saldo de **ese** programa. |

Una contraparte puede tener más de un programa: crea uno por acuerdo.

Si todavía no tienes los kilos o el precio, déjalos vacíos. Quedan como
**falta**, nunca como cero, y el programa no se puede activar hasta
completarlos. Eso es intencional.

### 2. Cargar el calendario de anticipos

`+ Agregar anticipo al calendario`, una fila por línea del calendario:

- **Fecha prevista**: la del acuerdo.
- **Mes de flujo**: el mes en que lo proyecta la caja. Si lo dejas vacío, ese
  anticipo no se proyecta y se cobra o paga en la liquidación.
- **Modalidad**, explícita:
  - `US$/kg × kilos del programa` — carga la tarifa.
  - `Monto fijo en USD` — carga el importe.
  - `Por confirmar` — el importe del calendario queda a la vista como
    referencia, marcado como **no contractual**. No se convierte en tarifa ni
    se proyecta, y bloquea la activación hasta que definas cuál de las dos es.

Que el calendario esté en dólares no define la modalidad: un importe en USD
puede venir de una tarifa por kilo. Si no lo sabes, déjalo en *Por confirmar*.

### 3. Registrar los cobros y pagos reales

`+ Registrar cobro recibido` / `+ Registrar pago efectuado`, sobre la línea del
calendario a la que corresponde. Fecha real del movimiento, monto fijo en USD y
referencia de cartola. Varios movimientos parciales sobre la misma línea: sin
problema.

- Lo registrado es **histórico**: cambiar kilos o tarifas después mueve el
  acordado y el pendiente, nunca lo ya cobrado o pagado.
- Corregir no es editar ni borrar: se **anula con motivo** (queda en el
  historial) y se registra el movimiento correcto.
- Lo ya cobrado deja de proyectarse en la caja futura y **sigue descontando**
  de la liquidación del programa.

### 4. Montos informados sin fecha

`+ Anotar monto informado sin fecha` guarda el importe como **antecedente**:
queda a la vista, no cuenta como cobrado ni pagado, no descuenta nada y no se
proyecta. Cuando aparezca la cartola, `completar con fecha` lo convierte en
movimiento sobre la línea que elijas. Es para no perder el dato sin inventar
una fecha.

### 5. Activar

Mientras el programa esté **registrado**, el flujo sigue con la estimación de
la temporada: la carga gradual no mueve ningún número.

`Activar en el cálculo` solo funciona si el programa está completo y si los
programas activos de ese lado no se pasan del presupuesto, ni en kilos ni en
monto. El presupuesto es el techo del lado: los programas redistribuyen ese
total, no se suman encima.

Antes de activar, revisa **ver cuadre antes/después**: muestra mes a mes lo que
proyecta hoy la estimación y lo que proyectarían los programas activos más el
presupuesto que no quedó en ninguno. La diferencia esperada es exactamente lo
que ya cobraste o pagaste, que sale del flujo futuro.

Desde el primer programa activo, ese lado deja de usar las filas estimadas: se
conservan, quedan marcadas como reemplazadas y vuelven a regir si desactivas
todos los programas.

## Ejemplo (sintético)

Programa de cliente, 200.000 kg a US$3,20 → venta 640.000.
Calendario: un anticipo de US$0,50/kg en Nov-26 → acordado 100.000.
Cobro registrado el 01/08 por 40.000.

```
Acordado 100.000 · Cobrado 40.000 · Pendiente 60.000
Liquidación del programa = 640.000 − (40.000 + 60.000) = 540.000
Flujo: Nov-26 60.000 · Mar-27 540.000 + presupuesto sin programa
```

Una línea del calendario que ya se cobró completa queda con pendiente 0 y su
importe sigue descontado de la liquidación. Una línea cuya fecha pasó y no se
cobró **no** se da por cobrada: queda marcada para reprogramar a mano.

## Qué mira el Excel

Con un lado activo, la hoja *Parametros* trae un bloque por contraparte
(kilos, precio, total, cada anticipo con acordado / realizado / pendiente, y la
liquidación del programa) más una fila de **presupuesto sin programa**. El
realizado va como constante, nunca como fórmula: es histórico. El lado que
siga con la estimación se exporta como hasta ahora.

## Lo que no hace

- No vincula un cobro de cliente con un pago a productor, aunque coincidan los
  montos. Son calendarios independientes.
- No deduce tarifas dividiendo un importe recibido por los kilos de la fruta.
- No completa un dato faltante con cero.
- No toca Allpa Chile, Allpa Perú, Allegria Service ni ninguna otra empresa.

## Verificación

```bash
node src/programas.test.mjs                                   # modelo puro (42)
CI=true npx react-scripts test --testPathPattern programas --watchAll=false
OUT_DIR=/tmp/e2e-programas node scripts/e2e/programas-allegria.mjs   # navegador + Excel real
```

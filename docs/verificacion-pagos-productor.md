# Comprobación previa y saldo de apertura — pagos a Don Alberto

Autorizaste la revisión de solo lectura. **No pude ejecutarla**: la política de
red de este entorno rechaza el host de Supabase (403 a CONNECT a
`bywovqayuzodbzwsriet.supabase.co`). No es tu permiso, es el entorno. Para
habilitarlo: en el menú del entorno cloud de la sesión, *Edit* → **Network
access**, con el host agregado en *Allowed domains* conservando la lista de
gestores de paquetes. Pasos:
https://code.claude.com/docs/en/cloud-environments#network-access

Mientras no esté habilitado, esta es la comprobación para que la haga el
equipo. **Solo mirar. No cargar ni modificar nada.**

## Dónde mirar

**Finanzas → Flujo Empresas → Allegria Foods → Parámetros → Temporada
2026-2027 → Cerezas**, columna **Pagos al productor**. Hay cuatro lugares
distintos donde un pago puede estar ya registrado:

1. **Estimaciones** (las filas de anticipo con US$/kg): desplegar cada una y
   mirar sus movimientos registrados, con fecha y monto.
2. **Programas por contraparte** → tarjeta de Don Alberto, si existe → cada
   cuota del calendario, y dentro de la cuota, sus movimientos.
3. **Montos informados sin fecha verificada**, en la misma tarjeta: lo que ya
   se haya cargado como informado.
4. **Movimientos pendientes de conciliación** (la bandeja, al final de la
   columna): movimientos con fecha, sin operación asignada.

Conviene además mirar los **programas archivados** (el enlace al pie de la
columna): un movimiento de un programa archivado sigue descontando.

## Qué anotar, importe por importe

| # | Importe US$ | ¿Aparece? | ¿Dónde (estimación / cuota / informado / bandeja)? | Fecha que muestra | Monto exacto que muestra |
|---|---:|---|---|---|---|
| 1 | 255.000 | | | | |
| 2 | 89.890 | | | | |
| 3 | 17.110 | | | | |
| 4 | 119.000 | | | | |
| 5 | 119.000 | | | | |
| 6 | 79.000 | | | | |

Dos precisiones para que la respuesta sirva:

- Si un importe aparece **dos veces**, anotar las dos, con su ubicación. No
  asumir que una es duplicado: puede haber dos pagos del mismo monto.
- Si aparece un monto **parecido pero no igual** (por ejemplo 119.500 en vez de
  119.000), anotarlo como *parecido*, no como coincidencia. Un monto distinto
  es un movimiento distinto hasta que la cartola diga lo contrario.
- Anotar también cualquier movimiento al productor que **no** esté en la lista
  de seis: puede ser uno de estos con otro importe, o uno adicional.

## Importe neto del saldo de apertura

El saldo de apertura solo debe incorporar lo que **no** esté ya registrado:

```
neto a incorporar = 679.000 − Σ (importes de los seis que ya estén
                                 registrados como movimiento vigente)
```

Un importe que figure como **informado sin fecha** no está registrado como
movimiento: no descuenta hoy, así que **sí** entra en el neto (y ese
antecedente se marca como cubierto por el saldo de apertura, para que no se
convierta después por segunda vez).

Un importe que figure en la **bandeja de conciliación** tampoco descuenta hoy,
pero sí es un movimiento real ya registrado: **no** entra en el neto. Se aplica
a la operación cuando se sepa cuál, y mientras tanto el saldo de apertura no lo
duplica.

## Efecto en el flujo

Con tus cifras declaradas para el productor (costo total US$2.150.500 y
US$679.000 informados como pagados; si siguen vigentes y corresponden al mismo
alcance):

```
Liquidación proyectada hoy          = 2.150.500 − (lo ya registrado)
Liquidación después de incorporar   = 2.150.500 − 679.000 = 1.471.500
Mejora de la caja proyectada        = el neto a incorporar
```

El destino final es el mismo (US$1.471.500) cualquiera sea el resultado de la
comprobación. Lo que cambia es **cuánto falta por incorporar**:

| Resultado de la comprobación | Neto a incorporar | Liquidación hoy | Liquidación después |
|---|---:|---:|---:|
| Ninguno de los seis está registrado | 679.000 | 2.150.500 | 1.471.500 |
| Solo el de 255.000 está registrado | 424.000 | 1.895.500 | 1.471.500 |
| Los de 119.000 + 119.000 están registrados | 441.000 | 1.912.500 | 1.471.500 |
| Los seis están registrados | **0** | 1.471.500 | 1.471.500 · **no se carga nada** |

Mes afectado: **uno solo**, el que esté configurado como mes de liquidación
del productor de la temporada (`mes_saldo_productor`; no lo leí de producción,
hay que confirmarlo en pantalla). El resto de los meses no se mueve, porque un
pago histórico no se proyecta. El saldo acumulado del horizonte mejora
exactamente en el neto, desde ese mes en adelante.

Dos resguardos del modelo que aplican acá:

- Si el descuento superara el costo total, la liquidación no queda negativa:
  queda en 0 y el exceso se muestra como **excedente real**, que es un saldo a
  favor a reconocer, no una liquidación negativa.
- Si Don Alberto no tiene **presupuesto asignado**, el descuento recae en la
  liquidación del **bloque presupuestario**; con presupuesto asignado, en su
  propia posición. El monto total es el mismo; cambia a quién se le atribuye.
  Para que quede atribuido a él, hay que asignarle presupuesto primero.

## Qué falta para poder cargarlo

1. La tabla de comprobación de arriba, completa.
2. El **documento** que respalda el total: cartola consolidada, acta o
   confirmación escrita del productor por los US$679.000.
3. Tu visto bueno al neto que resulte.

Sin el punto 1 el neto no se puede calcular, y sin el punto 2 el saldo queda
**provisional**: visible, sin afirmar que sea exigible.

## Cómo evita duplicar cuando aparezca el detalle

El saldo de apertura lleva su propio contador:

```
pendiente por identificar = monto documentado − Σ movimientos ya imputados contra él
```

Cada movimiento que se recupere se registra **contra** el saldo de apertura, y
ese contador baja por el mismo monto. El descuento total de la liquidación no
se mueve: lo que cambia es cuánto del total está identificado. Si lo
identificado superara lo documentado, el exceso **no se recorta**: se marca para
resolver a mano. El saldo de apertura no se borra nunca: queda con su
documento, su usuario, su historial y el detalle que lo fue consumiendo.

**Nada de esto está implementado todavía.** El mecanismo está diseñado; la
implementación queda pendiente de tu revisión del neto.

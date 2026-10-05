# Propuesta de carga y pendientes comerciales — Allegria Foods

Nada de esto está cargado. La rama es `claude/vigilant-cray-uf21ws`, sin merge
y sin despliegue, y la preview comparte Supabase con producción: ahí solo
lectura y descargas.

## Lo que bloquea, primero

Nada bloquea la funcionalidad. Lo que falta son **datos**, y los dos pendientes
de datos (la naturaleza del calendario de WLH y las fechas de Don Alberto) ya
tienen dónde vivir sin inventar nada:

- WLH necesita **una** decisión tuya, abajo, con su efecto numérico.
- Don Alberto se carga completo **sin fechas**, como montos informados.

## 1. WLH — cómo cargarlo

Dos cosas distintas, cargadas por separado:

| Qué | Monto | Cómo se carga | Qué hace en el flujo |
|---|---|---|---|
| Tres cobros identificados de WLH | US$599.960 | realizaciones con su fecha real | ya en caja: no se proyectan y descuentan de la liquidación |
| Calendario informado, sin confirmar | 3 × US$160.000 = US$480.000 | tres cuotas en **borrador** (Nov-26 / Dec-26 / Jan-27) | borrador **no proyecta** ni sustituye nada hasta que lo pases a vigente |

Cargarlo así deja el calendario escrito y visible sin afirmar que es un
compromiso vigente, y sin tocar ni un mes de la proyección actual.

### La pregunta

**¿Las tres cuotas de US$160.000 son dinero adicional a los US$599.960 ya
recibidos, o describen cobros que ya ocurrieron?**

Suponiendo la base de WLH sin cambios (su presupuesto asignado o su importe
definitivo), el efecto es de **oportunidad de caja**, no de total:

| Alternativa | Qué hago | Nov-26 | Dec-26 | Jan-27 | Mes de liquidación | Descuento total de su liquidación |
|---|---|---|---|---|---|---|
| **A · ya ocurrieron** | las tres cuotas quedan en borrador o marcadas cumplidas | 0 | 0 | 0 | base − 599.960 | US$599.960 |
| **B · son adicionales** | las tres cuotas pasan a vigentes | +160.000 | +160.000 | +160.000 | base − 1.079.960 | US$1.079.960 |

Diferencia entre A y B: **US$480.000 de cobros que se adelantan** desde el mes
de liquidación a Nov-26/Dec-26/Jan-27. El total cobrado a WLH en el horizonte
es el mismo en las dos, salvo que en B el descuento (US$1.079.960) supere su
base: en ese caso la liquidación queda en 0 y el exceso se muestra como
**excedente real** (posible saldo a favor de Allegria) o como **exceso de
compromisos del calendario**, según si el dinero ya se movió o solo está
programado. Nunca se netea contra otra contraparte.

No puedo responderla por ti: ningún dato del sistema distingue las dos
alternativas, y la igualdad de montos (480.000 vs 599.960 no coinciden) no
prueba nada en ninguna dirección.

## 2. Don Alberto — seis pagos informados, US$679.000

Se cargan **ahora**, completos, como *montos informados sin fecha verificada*
en el programa del productor. Un monto informado:

- no cuenta como pagado,
- no se proyecta en ningún mes,
- no descuenta de ninguna liquidación,
- no se declara conciliado con bancos,
- y queda separado de los pagos futuros del calendario.

| # | Monto US$ | Falta para convertirlo en pago |
|---|---|---|
| 1 | 255.000 | fecha real · respaldo (cartola o comprobante) · si estaba incluido en una cuota acordada o es adicional |
| 2 | 89.890 | fecha real · respaldo · a qué operación corresponde |
| 3 | 17.110 | fecha real · respaldo · a qué operación corresponde |
| 4 | 119.000 | fecha real · respaldo · a qué operación corresponde |
| 5 | 119.000 | fecha real · respaldo · si es un segundo pago distinto del #4 o el mismo informado dos veces |
| 6 | 79.000 | fecha real · respaldo · a qué operación corresponde |
| | **679.000** | |

Dos observaciones, sin asumir nada: 89.890 + 17.110 = **107.000** exactos, lo
que suele indicar un pago dividido o un ajuste; y los dos de 119.000 son
idénticos, que es justamente el caso donde un duplicado se confunde con dos
pagos reales. Las dos cosas se resuelven con la cartola, no por deducción.

Cuando aparezca la fecha de uno, se convierte con un clic:

- **con la cuota conocida** → se imputa a esa cuota y recién ahí cuenta como
  pagado y descuenta de la liquidación;
- **sin saber la operación** → sale a la bandeja de conciliación, que sigue sin
  descontar de ninguna liquidación.

En los dos casos el monto informado **no se borra**: queda marcado como
convertido, apuntando a dónde fue, así nunca se registra dos veces. Un monto
informado equivocado se anula con motivo.

Verificado en navegador: cargar los informados no mueve ningún mes del flujo,
y convertir uno a la bandeja tampoco.

## 3. Kilos y tarifas — las dos modalidades ya funcionan

- **US$/kg × kilos del programa**: la tarifa se multiplica por los kilos de
  *ese* programa, nunca por los 850.000 kg del presupuesto de la fruta.
- **Monto fijo en USD**: la cuota vale lo pactado, sin kilos de por medio.
- **Por confirmar**: guarda el importe del calendario como referencia, marcado
  como no contractual. No se convierte en tarifa ni se proyecta.

Si falta la tarifa o faltan los kilos, la cuota queda con **pendiente
indeterminado** y la pantalla dice qué falta. Nunca se asume 0, y nunca se
deduce una tarifa dividiendo un monto recibido por los kilos.

## 4. Cerima, GFP, Ideal Fruits — programas sin anticipos

Soportado tal cual: un programa puede existir con kilos y precio y **sin
ninguna cuota**. Su parte se cobra en la liquidación. La pantalla lo dice
explícitamente en la tarjeta ("Sin cuotas. El programa puede existir así").

Cuando alguno pida un anticipo, se le agrega la cuota en ese momento: el
programa conserva su historial, su presupuesto asignado y sus movimientos, y
la cuota nueva proyecta desde el mes que le pongas.

## 5. Ficha — Allpa Farms Perú

**Qué existe hoy** (`calcAllpaPeruIngresos`, parámetros `paramsAP[año]`):

```
ingreso del mes = kgMes[mes] × precioKg
anticipo        = + monto en su mes, y − el mismo monto repartido entre los
                  OTROS meses de producción del año, proporcional a su ingreso
```

O sea: el anticipo **adelanta** caja y se recupera solo, sin liquidación contra
la cual descontar, y el total del año no cambia. Abr-May-Jun 2026 van en cero.
Costos de cosecha y packing son US$/kg × kilos (`ratesKg`).

**Qué del modelo nuevo sirve**: la trazabilidad de movimientos reales
(realizado fijo en USD, anulación con motivo, nunca borrado), los montos
informados sin fecha, y las cuatro cubetas de fecha.

**Qué impide aplicarlo directo**: Perú no tiene las dos contrapartes del modelo
(cliente que compra y productor al que se le paga retorno). Allpa Perú es
**productora**: vende su propia fruta. No hay FOB de exportadora, ni descuento
de exportadora, ni retorno neto al productor, ni liquidación final contra la
cual descontar anticipos. Y entra por **método patrimonio** (26%), no línea a
línea.

**Qué decisión hace falta**: si los anticipos de Perú son un adelanto de su
propia venta (recuperación automática, como está hoy) o un financiamiento con
calendario de devolución propio. Son dos modelos distintos y hoy está el
primero. Esta revisión **no** autoriza cambios en Perú.

## 6. Ficha — Allegria Service

**Qué existe hoy** (`calcAllegriaService`, parámetros
`paramsAS[temporada][cerezas|ciruelas]`):

```
kg_mes: { mes de proceso: { kg, mes_cobro } }
ingreso = kg × usd_kg, proyectado en mes_cobro
          (si no hay mes_cobro, en el mismo mes de proceso)
```

Es un servicio de maquila: ingreso por kilo procesado, cobrado en el mes que
corresponda. **No hay** anticipos, ni FOB, ni productor, ni liquidación final.
La diferencia entre mes de proceso y mes de cobro ya captura el desfase de
caja, que es lo único parecido a un anticipo que hoy tiene.

**Qué del modelo nuevo sirve**: si alguna vez cobra anticipos de servicio, el
bloque de programas por contraparte aplica casi completo cambiando la base
(kg procesados × tarifa de servicio, en vez de kg × FOB).

**Qué impide aplicarlo directo**: no está confirmado que Allegria Service cobre
anticipos. Mientras no exista ese hecho comercial, agregarle el modelo es
funcionalidad sin uso y una pantalla más que mantener.

**Qué decisión hace falta**: ¿cobra anticipos de servicio a sus clientes de
proceso? Si la respuesta es no, queda cerrado. Esta revisión **no** autoriza
cambios en Allegria Service.

## 7. Tabla única de pendientes

| Pendiente | Acción concreta | Responsable | Información que falta | ¿Bloquea esta entrega? |
|---|---|---|---|---|
| Naturaleza del calendario WLH | responder A o B (sección 1) | **Angelo** | si los 3 × 160.000 son adicionales a los 599.960 | No. Se carga en borrador: no proyecta hasta que decidas |
| Fechas de los seis pagos de Don Alberto | buscar cartolas y completar uno por uno | **Angelo** (con el equipo) | fecha real y respaldo de cada uno de los 6 | No. Se cargan hoy como montos informados |
| 89.890 + 17.110 = 107.000 | confirmar si es un pago dividido | **Angelo** | cartola | No |
| Los dos de 119.000 | confirmar si son dos pagos o un duplicado informado | **Angelo** | cartola | No |
| Calendario del productor (Don Alberto) | cargar cuotas cuando existan fechas pactadas | **Angelo** | fechas y modalidad acordadas | No |
| Kilos y tarifas por programa | cargar los que estén acordados | **Angelo** | kilos y US$/kg por contraparte | No. Lo que falta queda marcado, nunca en 0 |
| Cerima, GFP, Ideal Fruits | crear los tres programas sin cuotas | **Claude**, cuando autorices la carga | nombres exactos y kilos si los hay | No |
| Costos de ciruelas sin línea de flujo | decidir imputación contable y conectar `cost/mat/srv` de ciruelas | **Angelo** decide · **Claude** implementa | a qué líneas del flujo van | No. Está avisado en pantalla |
| Anticipos de Allpa Perú | decidir adelanto propio vs financiamiento con devolución | **Angelo** | criterio | No. Fuera del alcance autorizado |
| Anticipos de Allegria Service | confirmar si existen | **Angelo** | hecho comercial | No. Fuera del alcance autorizado |
| Merge a `main` y despliegue | ejecutar | **Angelo** autoriza · **Claude** ejecuta | tu visto bueno | — |

## Qué pasa si cargas todo esto

Con WLH en borrador y Don Alberto como informados, **la proyección no cambia en
ningún mes** respecto de hoy. Eso está verificado con el flujo real y con el
Excel recalculado, no por inspección: los montos informados aparecen en la hoja
Parametros como constante rotulada "no descuenta · no conciliado" y no entran en
ninguna fórmula de descuento de la liquidación.

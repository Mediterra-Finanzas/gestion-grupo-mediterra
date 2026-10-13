# Propuesta de carga y pendientes comerciales — Allegria Foods

Nada de esto está cargado. La rama es `claude/vigilant-cray-uf21ws`, sin merge
y sin despliegue, y la preview comparte Supabase con producción: ahí solo
lectura y descargas.

## Los tres bloques, separados

**A · Funcionalidad técnica, lista para publicar.** Programas por contraparte,
posiciones individuales, saldos a favor con origen y compensación, cubetas de
fecha, montos informados sin fecha, pantalla, flujo y Excel. Verificada sobre
el commit final (ver "Verificación"). No depende de ninguna respuesta
comercial.

**B · Datos reales pendientes.** El calendario de WLH quedó **definido**
(05/10) y listo para cargar; de Don Alberto falta la decisión de tratamiento y
la cartola de los US$362.000; faltan kilos y tarifas por contraparte y los
programas de Cerima, GFP e Ideal Fruits. Nada de esto está cargado.

**C · Fuera de alcance.** Allpa Farms Perú y Allegria Service: fichas al final,
sin cambios de código. Los costos de ciruelas sin línea de flujo siguen
pendientes de tu decisión contable.

Las definiciones comerciales **no bloquean** nada del bloque A. Tener WLH
definido tampoco autoriza por sí mismo la carga: va con el resto, cuando
revises esta propuesta actualizada.

## 1. Cuadre del lado cliente

### Corrección de lo que entregué antes

Los **US$2.745.040** que presenté eran el residual de la base global
considerando **solo WLH**, no la liquidación final de Allegria. Dicho mal, daba
a entender que era la cifra de cierre del lado cliente. No lo es: es lo que
queda de la base después de WLH y nada más.

Faltaba además el cobro de **SNF: US$161.920 del 24/09/2026**, que reemplaza el
importe antes informado de US$169.000 (no es otro cobro).

### Residual con lo definido hasta hoy

```
base presupuesto                3.825.000
(−) WLH realizado                 599.960
(−) WLH futuro                    480.000
(−) SNF realizado                 161.920
= residual                      2.583.120   ← antes de otros anticipos futuros o ajustes
```

Verificado ejecutando el modelo: realizado US$761.880, futuro US$480.000,
residual **US$2.583.120**. Es un residual intermedio, no una liquidación final:
faltan los calendarios de SNF y TUNGSHING.

### Cuadre completo, con todo el calendario cargado

Si se cargan los tres calendarios comerciales completos (los que entregaste),
el modelo da esto, con mes de corte Oct-26:

| Contraparte | Realizado | Futuro con fecha | Detalle del futuro |
|---|---:|---:|---|
| WLH | 599.960 | 480.000 | Nov-26, Dec-26, Jan-27 · 160.000 cada uno |
| SNF | 161.920 | 415.420 | Nov-26 161.920 · Dec-26 69.250 + 115.000 · Jan-27 69.250 |
| TUNGSHING | 0 | 551.400 | **Sep-26 138.000 (VENCIDO)** · Nov-26 138.000 · Dec-26 82.800 + 110.400 · Jan-27 82.200 |
| **Total** | **761.880** | **1.446.820** | |

```
base 3.825.000 − realizado 761.880 − futuro 1.446.820 = liquidación 1.616.300
realizado 761.880 + proyectado 3.063.120 = 3.825.000   ← la base, exacta

del futuro con fecha:  vencido antes del corte   138.000  (TUNGSHING)
                       dentro del horizonte    1.308.820
```

Proyección mes a mes: **Sep-26 138.000 (vencido, antes del corte)** ·
Nov-26 459.920 · Dec-26 537.450 · Jan-27 311.450 · Mar-27 1.616.300
(liquidación). La identidad cierra contra la base: **nada se cuenta dos veces y
nada desaparece**.

### TUNGSHING: los US$138.000 van vencidos, no trasladados

Estaban previstos para el **29/09/2026** y no se recibieron. No hay traslado
confirmado a octubre, así que **se carga con su mes contractual (Sep-26)** y la
app lo muestra **vencido**: se proyecta antes del corte, queda listado como tal
y **no entra al saldo acumulado**. Nadie lo mueve solo; se reprograma cuando
confirmes una fecha nueva.

Lo que ese cuadre **no** afirma: que ese cobro vaya a ocurrir, y que cada
contraparte quepa en lo que debe (falta la base individual de cada una).

### Estimaciones que todavía permanecen — el riesgo de contar dos veces

Las filas actuales de anticipos (`anticipos_cliente`) son **estimaciones sin
contraparte**. Si se cargan los calendarios **sin declarar qué estimación
reemplaza cada cuota**, el mismo compromiso se proyecta dos veces: una por la
estimación y otra por la cuota.

El mecanismo existe y es explícito: cada cuota declara **cuánto** de cada
estimación consume (*pendiente que reemplaza estimación*). La app avisa y marca
la **sobre-sustitución** si se declara más de lo disponible, y no la recorta
sola.

Lo que falta para llenarlo es la lista de estimaciones hoy cargadas, que no
pude leer (la red del entorno bloquea Supabase). La guía con la ruta exacta en
pantalla y los datos a copiar está en
**`docs/revision-estimaciones-pantalla.md`**.

Con esas tablas armo la de sustituciones, que tiene esta forma:

| Estimación (lado · mes · US$/kg) | Acordado | Realizado | Disponible | Cuota que la reemplaza | Monto que consume | Saldo que le queda |
|---|---:|---:|---:|---|---:|---:|
| | | | | | | |

Y el antes/después del flujo, mes a mes:

| Mes | Anticipo Cerezas hoy | Anticipo Cerezas después | Δ | Costo Fruta hoy | Costo Fruta después | Δ |
|---|---:|---:|---:|---:|---:|---:|
| | | | | | | |

**Hasta que esas tablas estén llenas, cargar calendarios es riesgoso.** El
orden correcto es: leer las estimaciones vigentes, declarar la sustitución
cuota por cuota, revisar el antes/después, y recién entonces activar las
cuotas.

### Advertencia que se conserva

La liquidación individual de **WLH no está validada**: sin kilos ni precio
propios, su realizado y su calendario descuentan del bloque, y no se puede
comprobar si los US$1.079.960 caben en lo que WLH debe. Medido: con una base
individual de US$900.000 aparecería un **exceso de compromisos de US$179.960**.
La falta de base individual **no impide** preparar el calendario global; sí
impide dar por validada la liquidación de WLH.

## 1b. Registro de los cobros históricos — ahora explícito

El mecanismo de cuota contenedora quedó implementado con marca propia:
`historico: true`.

| Requisito | Cómo se cumple |
|---|---|
| Identificarse como registro de anticipos históricos | Se rotula **«registro de anticipos históricos»** en pantalla y **«Anticipos históricos (ya en caja · no proyecta)»** en el Excel. No tiene selector de estado, ni mes de flujo, ni modalidad editable |
| No aparentar un acuerdo pendiente | Se dibuja aparte, con borde punteado y la leyenda *no es un acuerdo pendiente · no proyecta · no se puede activar*. No muestra acordado ni pendiente |
| No poder activarse accidentalmente | `normalizarCuota` lo **fuerza a borrador siempre**. Probado forzando `estado:"vigente"` y `monto:599.960` en el dato: la proyección no cambia en ningún mes |
| Guardar los tres movimientos una sola vez | Probado: realizado US$599.960 exacto, un movimiento por fecha |
| Conservar las fechas | Probado: 2026-07-15, 2026-08-24, 2026-09-16 |
| No alterar las cuotas futuras | Probado: las tres de US$160.000 siguen proyectando en sus meses |

Pruebas: modelo (167)-(173) y `integracionSaldos.test.js` → *«registro de
anticipos históricos»* (3 pruebas, incluida la del Excel).

## 2. Don Alberto — compromisos, no pagos

| Grupo | Importes | Suma | Estado declarado |
|---|---|---:|---|
| Con pagaré | 255.000 + 89.890 + 17.110 | **362.000** | compromiso documentado · **ejecución por confirmar** |
| No ejecutados | 119.000 + 119.000 + 79.000 | **317.000** | confirmados como **no ejecutados** |

### Lo que no se puede declarar todavía

El realizado de Don Alberto es **cero en el estado de carga propuesto**, y eso
es provisional, no una conclusión: mientras no se vea la cartola, no se sabe si
los US$362.000 salieron de la cuenta. **No se descarta incorporar pagos
históricos**: si la cartola los confirma, cada importe entra como realización
con su fecha real y deja de proyectarse en su mes. El saldo de apertura no
aplica con los datos de hoy (hay detalle y no hay pagos confirmados), pero
vuelve a la mesa si alguna vez aparece un total documentado sin detalle.

Las dos evidencias no se mezclan: el **pagaré** justifica una cuota (cuánto hay
que pagar); la **cartola** justifica una realización (que se pagó). Un pagaré
no promueve una cuota a pago.

### Los vencimientos de los pagarés sirven de calendario

Si los pagarés establecen fechas de pago, **esas fechas son el calendario** de
las tres cuotas: se cargan como mes de flujo y dejan de ser "sin fecha".

Si ya vencieron sin pagarse, la app los muestra **vencidos** y exige
reprogramación explícita.

**Los vencimientos de Don Alberto no los conozco.** El ejemplo que sigue usa
meses **sintéticos** (Aug-26 y Sep-26) solo para mostrar el comportamiento del
modelo con corte Oct-26. No son sus fechas reales y no deben citarse como
tales:

```
vencido antes del corte ....... 344.890   (255.000 Aug-26 + 89.890 Sep-26)
dentro del horizonte .......... 17.110
liquidación ................... 1.788.500
caja en el horizonte .......... 1.805.610  ← el vencido NO entra al acumulado
```

El vencido se proyecta antes del corte, queda listado como tal y no se llama
flujo futuro. Nadie lo mueve solo: se reprograma a mano.

### Sin fechas: la proyección queda incompleta, y se dice

**Retiro la recomendación anterior.** No corresponde trasladar los US$679.000 a
la liquidación de marzo: eso solo vale si efectivamente se acordó pagar ahí, y
no está acordado.

El tratamiento por defecto es dejarlos **sin calendarizar**, con el compromiso
visible al lado del flujo y la advertencia explícita:

| | |
|---|---:|
| Compromiso total con el productor | 2.150.500 |
| Proyectado en el horizonte | **1.471.500** |
| **Sin calendarizar: la proyección está incompleta por** | **679.000** |

Si hace falta un **escenario provisional de caja**, la cuota admite una
**estimación de caja** que guarda las dos fechas por separado:

| Se guarda | Dónde |
|---|---|
| Fecha contractual original | `fecha_prevista` y el mes contractual en `mes` |
| Mes estimado de caja | `estimacion_caja.mes` |
| Motivo de la estimación | `estimacion_caja.motivo` (obligatorio) |
| Usuario y fecha del registro | `estimacion_caja.usuario` · `estimacion_caja.ts` |
| Estimaciones anteriores | `estimacion_caja.historial[]` |

La proyección usa el mes estimado; la fecha contractual **no se modifica**. Y
lo más importante: **un compromiso vencido sigue vencido**. La pantalla muestra
«vencida {mes contractual}» junto a «caja estimada {mes}», el resumen del lado
informa *compromisos con fecha contractual vencida* aparte de las cubetas, y el
Excel rotula la fila con las dos fechas y el motivo. Quitar la estimación
devuelve la cuota a su mes contractual y deja el rastro de la que se retiró.

Para una cuota **sin fecha pactada**, la casilla «mes estimado» marca que ese
mes es un supuesto nuestro: ahí no hay dos fechas que preservar.

Las tres opciones, medidas:

| Opción | Proyección | Total | Incompletitud declarada |
|---|---|---:|---:|
| **Por defecto** · sin calendarizar | Mar-27: 1.471.500 | 1.471.500 | **679.000**, a la vista |
| **Escenario provisional** · estimación de caja con motivo | sus meses estimados + Mar-27 1.471.500 | 2.150.500 | 0, con las dos fechas y el motivo guardados |
| **Acordar pagar en la liquidación** | Mar-27: 2.150.500 | 2.150.500 | 0 |

Las tres cifras de arriba usan tu costo total declarado de US$2.150.500 y
**realizado cero**: ninguno de los US$679.000 está confirmado como pagado.

La tercera **solo** si lo acuerdas con el productor; no es un default ni un
atajo para que cuadre la caja.

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

## 6b. Informe de brechas técnicas — qué prueba acredita cada punto

| # | Brecha | Estado | Prueba que lo acredita |
|---|---|---|---|
| 1 | La compensación selecciona una operación real y obtiene su saldo automáticamente | **Resuelto** | `src/__tests__/compensacionConcurrencia.test.js` → *«el destino se elige de una lista derivada del modelo, con su saldo ya calculado»*: el destino sale de `destinosCompensacion(resumen)` con `absorbe = 40.000` calculado del cuadre, y la operación de origen no se ofrece como destino de sí misma. En pantalla el destino es un `<select>` alimentado por esa lista (`ProgramasComerciales.jsx`, `destinoSel`); no hay campo de monto del destino |
| 2 | Valida el saldo al guardar, evita doble aplicación, incluido conflicto entre sesiones | **Resuelto** | Validación: `programas.test.mjs` (163)-(166) — aplicar dos veces lanza, destino sin saldo lanza, y sin el saldo del destino lanza («no se escribe a mano»). Revalidación en el momento de aplicar: `aplicarReserva` recalcula `destinosCompensacion` y pasa `d.absorbe`. Conflicto entre sesiones: `compensacionConcurrencia.test.js` → dos instancias del contrato real de persistencia cargan la misma versión; la segunda recibe `motivo: "conflicto"`, el servidor conserva una sola aplicación por 10.000, el aviso de pantalla dice «No se guardó», y volver a aplicar sobre el estado fresco lanza |
| 3 | El reconocimiento de un excedente queda vinculado a su origen y no se duplica | **Resuelto** | `programas.test.mjs` (134)-(139): `reconocerDesdePosicion` graba `origen.tipo = "liquidacion_individual"` con programa, base y realizado; reconocer dos veces el mismo excedente lanza; sin monto reconoce exactamente el resto. En navegador: *«la operación con excedente aparece como origen»*, *«el saldo nace con su origen trazado»*, *«no queda excedente por reconocer dos veces»* |
| 4 | Detecta cambios posteriores que afecten un saldo ya reconocido | **Resuelto** | `programas.test.mjs` (140)-(141): al corregir la liquidación el excedente baja y `inconsistenciasSaldos` lo detecta nombrando lo ya movido, sin borrarlo. En pantalla se lista arriba del bloque (`inconsistencias` en `SaldosFavorBloque`) |
| 5 | `presupuesto_asignado` e `importe_definitivo` cargados desde pantalla, guardados y sobrevivientes a la recarga | **Resuelto** | `scripts/e2e/programas-allegria.mjs`: se escriben en los campos reales (`ponerCampoEn`), se verifica la variación en pantalla, luego *«el presupuesto asignado y el importe definitivo quedaron guardados»* (lee la fila del Supabase aislado) y, tras recargar, *«tras recargar, el presupuesto asignado sigue en pantalla (100.000)»*, *«y el importe definitivo también (8.000)»*, *«con su variación recalculada (-92.000)»* |
| 6 | La sección completa de saldos a favor del Excel, recalculada y comparada | **Resuelto** | `src/__tests__/saldosExcelRecalc.test.js` (14 pruebas, `RECALC=1`): seis escenarios — reconocido sin aplicaciones, recuperación programada, recuperación ejecutada, compensación reservada, compensación aplicada, y devolución aplazada con una anulada. Se borran los valores en caché, LibreOffice recalcula, y se comparan reconocido/resuelto/programado/pendiente/disponible de cada saldo, la columna de cada aplicación, los rótulos de estado, y las dos líneas del flujo mes a mes contra `calcAllegria` |
| 7 | Los formularios reemplazaron los prompts del navegador | **Resuelto en esta pantalla** | `grep -c "window.prompt" src/ProgramasComerciales.jsx` → **0**. Se convirtieron a formularios en línea: archivar un programa con motivo, anular un movimiento con motivo (panel de programas) y anular un movimiento de una estimación (`FinanzasModule.jsx`). **Limitación**: quedan `window.prompt` en otras pantallas del módulo (créditos, escenarios, nóminas), fuera del alcance de esta entrega. Los `window.confirm` se conservan a propósito: son los que muestran el efecto numérico antes de confirmar |
| 8 | Los permisos de solo lectura tienen pruebas propias | **Resuelto** | `src/__tests__/integracionSaldos.test.js` → `describe('solo lectura')`: con permiso de edición los 15 controles están; en solo lectura ninguno existe; y las cifras sí se ven. La lista incluye los controles nuevos (`+ Registrar monto informado sin fecha`, `completar con su fecha`, `Archivar`) |

## 7. Los cuatro datos que faltan

Agrupados, sin nada más:

| # | Dato | Para qué | Si falta |
|---|---|---|---|
| 1 | ¿Se transfirieron los primeros **US$362.000** de Don Alberto? | convertir los tres compromisos con pagaré en realizaciones, con su fecha | siguen como cuotas; el realizado queda en cero y no se afirma que se pagó |
| 2 | **Fechas de vencimiento de los pagarés** | calendarizar esas tres cuotas; si ya vencieron, mostrarlas vencidas y reprogramarlas | quedan sin calendarizar y la proyección se declara incompleta |
| 3 | **Fechas previstas de los US$317.000** no ejecutados | calendarizar las otras tres cuotas | igual que arriba |
| 4 | **Base comercial individual de WLH** (kilos y precio, o presupuesto asignado) | validar su liquidación individual y que el control de exceso funcione | el calendario global se puede preparar igual, con la advertencia de que su liquidación no está validada |

Dos pendientes operativos que no son datos comerciales y que condicionan la
carga: la lista de **estimaciones hoy cargadas** (para declarar qué reemplaza
cada cuota y no contar dos veces) y la revisión de que ninguna cuota ya exista.
Las dos requieren leer el sistema; la red del entorno me lo impide, así que las
hace el equipo en pantalla o se habilita el host.

## 8. Tabla de pendientes del proyecto

| Pendiente | Acción | Responsable | ¿Bloquea? |
|---|---|---|---|
| Los cuatro datos de la sección 7 | entregarlos | **Angelo** / equipo | No bloquean la publicación; sí la carga |
| Lista de estimaciones vigentes y sustituciones | leer en pantalla y declarar cuota por cuota | **Angelo** / equipo · **Claude** completa | Sí para cargar calendarios sin duplicar |
| Kilos y tarifas del resto de contrapartes | cargar los acordados | **Angelo** | No |
| Cerima, GFP, Ideal Fruits | crear los tres programas sin cuotas | **Claude**, al autorizar la carga | No |
| Costos de ciruelas sin línea de flujo | decidir imputación y conectar | **Angelo** decide · **Claude** implementa | No |
| Allpa Perú y Allegria Service | decidir / confirmar | **Angelo** | No. Fuera de alcance |
| Merge y despliegue | `docs/publicacion-allegria.md` | **Angelo** autoriza · **Claude** ejecuta | — |

## Qué pasa si cargas todo esto

**Lado cliente**, con los tres calendarios completos: realizado US$761.880,
futuro con fecha US$1.446.820, residual US$1.616.300, y la identidad cierra
contra la base de US$3.825.000. La proyección cambia respecto de hoy en Oct-26,
Nov-26, Dec-26 y Jan-27. Requiere antes declarar las sustituciones de
estimaciones.

**Lado productor**: con el tratamiento por defecto, los US$679.000 quedan sin
calendarizar y el flujo proyecta US$1.471.500, con la incompletitud de
US$679.000 declarada en pantalla.

Tres cosas que seguirán sin poder afirmarse: que los US$362.000 con pagaré
salieron de la cuenta, que los US$1.079.960 de WLH caben en lo que WLH debe, y
que el US$138.000 de TUNGSHING de Oct-26 se vaya a cobrar (está declarado como
no llegado: cargado con esa fecha quedaría vencido).

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

## 1. WLH — definido

Confirmado por Angelo el 05/10/2026:

- Los US$599.960 recibidos **corresponden a esta campaña**.
- Las tres cuotas de US$160.000 (30/11/2026, 15/12/2026, 10/01/2027) **siguen
  pendientes**.
- Son **adicionales** a lo recibido: realizado US$599.960 + calendario futuro
  US$480.000 = **US$1.079.960** de anticipos realizados y previstos.

Los cobros históricos **no** se cruzan contra las tres cuotas futuras: ninguna
queda marcada como cumplida por ellos.

### Cómo se carga

| Qué | Cómo |
|---|---|
| 15/07/2026 · US$362.000 | realización, con su fecha real y monto fijo |
| 24/08/2026 · US$39.980 | realización |
| 16/09/2026 · US$197.980 | realización |
| 30/11/2026 · US$160.000 | cuota **vigente**, mes de flujo Nov-26 |
| 15/12/2026 · US$160.000 | cuota **vigente**, mes de flujo Dec-26 |
| 10/01/2027 · US$160.000 | cuota **vigente**, mes de flujo Jan-27 |

Las tres realizaciones van en una cuota contenedora en **borrador y sin mes**:
así el realizado descuenta (la plata ya está en caja) sin que esa cuota
proyecte nada ni toque el calendario futuro. Modalidad *por confirmar*: no se
inventa tarifa ni kilos.

### Lo que la app muestra con esas cifras

Verificado ejecutando el modelo (`resumenLado` / `movimientosLado`), con el
presupuesto global del lado cliente en US$3.825.000 y mes de corte Oct-26:

```
realizado ................ 599.960
pendiente con fecha ...... 480.000   → Nov-26, Dec-26 y Jan-27, 160.000 cada uno
liquidación .............. 2.745.040  (= 3.825.000 − 1.079.960)
excedente real ........... 0
exceso de compromisos .... 0
```

### La advertencia que se mantiene

WLH **no tiene base individual**: sin presupuesto asignado ni importe
definitivo propio, su realizado y su calendario descuentan del **bloque
presupuestario**, no de una liquidación suya. Dicho de otro modo: no se puede
afirmar que los US$1.079.960 caben dentro de lo que WLH debe, porque no está
cargado cuánto debe.

El efecto de esa falta, medido con el modelo:

| Base individual de WLH | Liquidación | Excedente real | Exceso de compromisos |
|---|---:|---:|---:|
| sin base (cae al bloque) | 2.745.040 | 0 | 0 |
| US$1.500.000 | 2.745.040 | 0 | 0 |
| US$900.000 | 2.925.000 | 0 | **179.960** |

Con una base de US$900.000, los compromisos se pasan en US$179.960 y la app lo
muestra como **exceso de compromisos** (aviso del calendario), no como deuda:
lo realizado, US$599.960, todavía cabe en esa base. Mientras no cargues kilos y
precio de WLH, ese control no puede funcionar.

## 2. Don Alberto — corregido: no son pagos ejecutados

Corrección de Angelo del 05/10/2026, que cambia el tratamiento por completo:

| Grupo | Importes | Suma | Qué es | Evidencia |
|---|---|---:|---|---|
| Con pagaré | 255.000 + 89.890 + 17.110 | **362.000** | compromiso documentado | **pagaré** — evidencia de compromiso, NO de pago |
| No ejecutados | 119.000 + 119.000 + 79.000 | **317.000** | anticipos futuros | ninguna; fechas por confirmar |
| | | **679.000** | | |

255.000 + 89.890 + 17.110 = 362.000 · 119.000 + 119.000 + 79.000 = 317.000 ·
362.000 + 317.000 = 679.000

### Las dos evidencias no se mezclan

- **Evidencia de compromiso** (pagaré, contrato, acuerdo escrito): justifica una
  **cuota del calendario**. Dice cuánto se debe pagar, no que se haya pagado.
- **Evidencia de movimiento** (cartola, comprobante de transferencia): justifica
  una **realización**. Es lo único que convierte un compromiso en pago.

Un pagaré **nunca** promueve una cuota a realización. Falta confirmar en la
cartola si los US$362.000 salieron efectivamente de la cuenta.

### Qué se cae de la propuesta anterior

El **saldo de apertura documentado** queda **retirado**. Estaba diseñado para un
total de pagos históricos sin detalle, y acá no hay tal cosa: nada está
confirmado como pagado, y del detalle sí tenemos los seis importes. Si la
cartola confirma los US$362.000, cada uno entra como realización con su fecha
real, que es el camino normal y más trazable. El saldo de apertura no se usa.

La cifra US$1.471.500 sobrevive, pero **cambia de significado**: ya no es "lo
que queda después de pagar 679.000", sino "lo que queda en la liquidación
después de los 679.000 de anticipos **comprometidos y no pagados**".

### Cómo se carga

Los seis van como **cuotas del programa de Don Alberto**, todas vigentes, con
realizado en **cero**:

| Cuota | Monto | Respaldo | Mes de flujo |
|---|---:|---|---|
| 1 | 255.000 | pagaré | por confirmar |
| 2 | 89.890 | pagaré | por confirmar |
| 3 | 17.110 | pagaré | por confirmar |
| 4 | 119.000 | — | por confirmar |
| 5 | 119.000 | — | por confirmar |
| 6 | 79.000 | — | por confirmar |

### La decisión que falta, con su efecto medido

Sin fechas, hay tres formas de tratarlos y **no dan el mismo flujo**. Medido
con el modelo, base del productor US$2.150.500 y liquidación en Mar-27:

| Opción | Proyección | Total proyectado | Contra el compromiso |
|---|---|---:|---:|
| **(a)** sin fecha, reservado (lo que hace por defecto un registro nuevo) | Mar-27: 1.471.500 | **1.471.500** | **−679.000** |
| **(b)** sin fecha, decidido "se paga en la liquidación" | Mar-27: 2.150.500 | 2.150.500 | 0 |
| **(c)** con meses estimados cargados | Nov-26 362.000 · Dec-26 119.000 · Jan-27 119.000 · Feb-27 79.000 · Mar-27 1.471.500 | 2.150.500 | 0 |

**Lo incómodo**: la opción (a), que es el comportamiento por defecto, deja
US$679.000 **fuera de la proyección**. El compromiso queda visible como
*pendiente de calendarizar*, pero la caja proyectada sale US$679.000 mejor de
lo que corresponde. Es exactamente el riesgo inverso al que te advertí cuando
estos importes se trataban como pagos informados.

Recomiendo **(b)** mientras no haya fechas: no subestima la salida, concentra
el pago en el mes de liquidación y la decisión queda registrada con tu usuario
y la fecha. Al llegar las fechas reales se pasa a **(c)**, cuota por cuota, y
cada mes queda en su lugar. La opción (a) solo si prefieres que el flujo
muestre únicamente lo calendarizado, asumiendo el aviso.

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

## 7. Tabla única de pendientes

| Pendiente | Acción concreta | Responsable | Información que falta | ¿Bloquea esta entrega? |
|---|---|---|---|---|
| ~~Conciliación del calendario de WLH~~ | **resuelto** 05/10: realizado 599.960 + futuro 480.000, adicionales | — | — | No |
| Base individual de WLH | cargar kilos y precio, o presupuesto asignado | **Angelo** | kilos y US$/kg de WLH | No, pero sin eso el control de exceso no funciona |
| Confirmar si los US$362.000 con pagaré salieron de la cuenta | revisar cartola de los tres importes | **Angelo** (con el equipo) | fechas y comprobantes de salida | No. Hasta entonces son cuotas, no pagos |
| Fechas de las seis cuotas de Don Alberto | confirmar el calendario pactado | **Angelo** | fecha de cada cuota | No, pero obliga a elegir la opción (a), (b) o (c) |
| Decisión del tratamiento sin fecha | elegir (a), (b) o (c) de la sección 2 | **Angelo** | tu decisión | No. Recomendado: (b) |
| Verificar que ninguna de las seis cuotas ya esté cargada | revisar en pantalla antes de cargar | **Angelo** / **Claude** con red habilitada | estado actual de la fila `finanzas` | No, pero condiciona la carga |
| ~~Saldo de apertura documentado~~ | **retirado**: no hay pagos históricos que incorporar | — | — | No |
| Kilos y tarifas por contraparte | cargar los acordados | **Angelo** | kilos y US$/kg (o monto fijo) por programa | No. Lo que falta queda marcado, nunca en 0 |
| Cerima, GFP, Ideal Fruits | crear los tres programas sin cuotas | **Claude**, cuando autorices la carga | nombres exactos y kilos si los hay | No |
| Costos de ciruelas sin línea de flujo | decidir imputación contable y conectar | **Angelo** decide · **Claude** implementa | a qué líneas del flujo van | No. Avisado en pantalla |
| Anticipos de Allpa Perú | decidir adelanto propio vs financiamiento | **Angelo** | criterio | No. Fuera de alcance |
| Anticipos de Allegria Service | confirmar si existen | **Angelo** | hecho comercial | No. Fuera de alcance |
| Merge a `main` y despliegue | ejecutar el procedimiento de `docs/publicacion-allegria.md` | **Angelo** autoriza · **Claude** ejecuta | tu visto bueno | — |

## Qué pasa si cargas todo esto

Lado cliente: WLH suma US$599.960 de realizado y US$480.000 de pendiente con
fecha; la liquidación del bloque baja a US$2.745.040. La proyección **cambia**
respecto de hoy: aparecen 160.000 en Nov-26, Dec-26 y Jan-27.

Lado productor: con la opción (b), los US$679.000 quedan dentro de la
liquidación de Mar-27 y el total proyectado es US$2.150.500. Con la opción (a),
el total proyectado sería US$1.471.500 y habría US$679.000 fuera de la
proyección.

Dos cosas que siguen sin poder afirmarse: que los US$1.079.960 de WLH caben en
lo que WLH debe (falta su base individual), y que los US$362.000 con pagaré
salieron de la cuenta (falta la cartola).

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

**B · Datos reales pendientes de conciliación.** El calendario de WLH, los seis
pagos de Don Alberto, los kilos y tarifas por contraparte, y los programas de
Cerima, GFP e Ideal Fruits. Nada de esto está cargado y nada se carga sin tu
revisión de esta propuesta.

**C · Fuera de alcance.** Allpa Farms Perú y Allegria Service: fichas al final,
sin cambios de código. Los costos de ciruelas sin línea de flujo siguen
pendientes de tu decisión contable.

La respuesta de WLH **no bloquea** nada del bloque A, y tampoco autoriza cargar
el resto de los datos.

## 1. WLH — conciliación pendiente, no una disyuntiva

Los dos conjuntos de datos, uno al lado del otro. Son seis hechos distintos,
no dos alternativas:

| Movimientos recibidos (contraparte confirmada: WLH) | | Calendario previsto de WLH | |
|---|---:|---|---:|
| 15/07/2026 | 362.000 | 30/11/2026 | 160.000 |
| 24/08/2026 | 39.980 | 15/12/2026 | 160.000 |
| 16/09/2026 | 197.980 | 10/01/2027 | 160.000 |
| **Total recibido** | **599.960** | **Total previsto** | **480.000** |

Los montos no se corresponden uno a uno con ninguna combinación de las cuotas,
así que la relación entre las dos columnas no se puede deducir de los importes.
Puede haber cumplimiento parcial, sustitución de una cuota por otra, una
reformulación del calendario, o cobros que no pertenecen a este calendario.

### Lo que necesito confirmado, cuota por cuota

| Cuota prevista | Monto | ¿Sigue pendiente? | ¿Cubierta o reemplazada por cuál movimiento? |
|---|---:|---|---|
| 30/11/2026 | 160.000 | | |
| 15/12/2026 | 160.000 | | |
| 10/01/2027 | 160.000 | | |

Y, en el otro sentido, de cada movimiento recibido: si corresponde a una cuota
de este calendario, a una operación anterior, o queda por identificar.

### Mientras no esté resuelto

- Las tres cuotas se cargan en **borrador**: no proyectan ni sustituyen nada.
  **La proyección NO incluye esos US$480.000.**
- Los tres movimientos se cargan con su fecha real y su monto fijo. Descuentan
  de la liquidación, porque esa plata ya está en la caja, pero **no** marcan
  ninguna cuota como cumplida.
- La caja futura de WLH **no está validada**: su calendario está en
  conciliación y su pendiente real es desconocido hasta que confirmes la tabla
  de arriba.

Dos cosas que no voy a hacer con estos datos: deducir tarifas US$/kg dividiendo
los montos recibidos por kilos, y asignarle kilos desde el presupuesto global.

## 2. Don Alberto — seis pagos informados, US$679.000

255.000 + 89.890 + 17.110 + 119.000 + 119.000 + 79.000 = **679.000**

Fueron informados como **pagos realizados**. No afirmo que haya duplicados ni
pagos divididos: la coincidencia de importes no prueba nada y no la uso como
hipótesis.

### Antes de cargarlos: verificar si ya existen

**Pendiente, y no lo pude hacer yo**: la lectura de datos de producción está
bloqueada por la política de este entorno. La verificación es esta, y la puede
hacer el equipo en pantalla, o yo si me autorizas la lectura:

En **Allegria Foods → Parámetros → Temporada → Cerezas**, lado *Pagos al
productor*, revisar si alguno de los seis importes ya figura como realización
de una estimación o de una cuota, o en la bandeja de conciliación. Un importe
que ya exista **no se vuelve a cargar**: se completa el que está.

### Lista de conciliación

| # | Monto US$ | Fecha | Respaldo | Operación | ¿Ya existe en el sistema? |
|---|---:|---|---|---|---|
| 1 | 255.000 | por recuperar | por recuperar | por identificar | por verificar |
| 2 | 89.890 | por recuperar | por recuperar | por identificar | por verificar |
| 3 | 17.110 | por recuperar | por recuperar | por identificar | por verificar |
| 4 | 119.000 | por recuperar | por recuperar | por identificar | por verificar |
| 5 | 119.000 | por recuperar | por recuperar | por identificar | por verificar |
| 6 | 79.000 | por recuperar | por recuperar | por identificar | por verificar |
| | **679.000** | | | | |

### Lo incómodo de guardarlos como antecedentes

Un antecedente **no descuenta del flujo**. Eso es correcto en cuanto a no
inventar fechas, pero tiene un costo que hay que decir: mientras los seis estén
como informados, **la proyección sobrestima los pagos futuros al productor en
hasta US$679.000**, porque la liquidación sigue mostrando como pendiente plata
que ya salió. La pantalla muestra el total informado justo al lado, pero el
número del flujo es el alto. No es un error de cálculo: es información
incompleta, y se corrige completando la aplicación de cada movimiento.

### Opción a decidir: saldo de apertura documentado

Si quieres que esos pagos descuenten **antes** de recuperar las fechas, la vía
es un saldo de apertura documentado: un único registro por contraparte,
respaldado por un documento (cartola consolidada, acta, confirmación del
productor), con el monto total pagado y sin fecha por movimiento.

Cómo evita duplicar cuando aparezca el detalle:

1. El saldo de apertura lleva su propio contador: `pendiente de identificar` =
   monto documentado − Σ movimientos ya identificados contra él.
2. Cada movimiento que se recupere se registra **contra** ese saldo, igual que
   una cuota sustituye a una estimación: al entrar, el pendiente de identificar
   baja por el mismo monto. El descuento total de la liquidación no se mueve.
3. Si la suma de lo identificado supera lo documentado, **no se recorta**: se
   marca el exceso para resolverlo a mano, como ya se hace con la
   sobre-sustitución.
4. El saldo de apertura no se borra: queda con su documento, su usuario y su
   historial, y con el detalle que lo fue consumiendo.

Efecto numérico de adoptarlo, con los datos informados: la liquidación
proyectada del productor baja US$679.000 en el mes de liquidación desde el
momento de la carga, en vez de bajar recién al completar los seis movimientos.
El total pagado al productor no cambia en ningún escenario; cambia **cuándo**
el flujo lo reconoce.

**No está implementado.** Lo dejo presentado para que decidas.

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
| Conciliación del calendario de WLH | completar la tabla cuota por cuota de la sección 1 | **Angelo** | si cada cuota sigue pendiente, fue cubierta o fue reemplazada, y a qué corresponde cada movimiento recibido | No. Las cuotas van en borrador y los US$480.000 no se proyectan |
| Verificar si los pagos de Don Alberto ya existen | revisar en pantalla los seis importes antes de cargarlos, o autorizarme la lectura de producción | **Angelo** / **Claude** con autorización | estado actual de la fila `finanzas` | No, pero condiciona la carga: un importe que ya exista no se vuelve a cargar |
| Fechas y respaldos de los seis pagos | recuperar cartolas y completar uno por uno | **Angelo** (con el equipo) | fecha real y respaldo de cada movimiento | No. Se cargan como informados, con el aviso de sobrestimación |
| Saldo de apertura documentado | decidir si se adopta, con el efecto de la sección 2 | **Angelo** decide · **Claude** implementa | tu decisión y el documento de respaldo | No. Presentado, no implementado |
| Kilos y tarifas por contraparte | cargar los acordados | **Angelo** | kilos y US$/kg (o monto fijo) por programa | No. Lo que falta queda marcado como pendiente, nunca en 0 |
| Cerima, GFP, Ideal Fruits | crear los tres programas sin cuotas | **Claude**, cuando autorices la carga | nombres exactos y kilos si los hay | No |
| Costos de ciruelas sin línea de flujo | decidir imputación contable y conectar `cost/mat/srv` | **Angelo** decide · **Claude** implementa | a qué líneas del flujo van | No. Avisado en pantalla |
| Anticipos de Allpa Perú | decidir adelanto propio vs financiamiento con devolución | **Angelo** | criterio | No. Fuera de alcance |
| Anticipos de Allegria Service | confirmar si existen | **Angelo** | hecho comercial | No. Fuera de alcance |
| Merge a `main` y despliegue | ejecutar | **Angelo** autoriza · **Claude** ejecuta | tu visto bueno | — |

## Qué pasa si cargas todo esto

Con WLH en borrador y Don Alberto como informados, la proyección **no cambia en
ningún mes** respecto de hoy. Verificado con el flujo real y con el Excel
recalculado, no por inspección. Las dos consecuencias que hay que tener a la
vista: la caja futura de WLH no está validada (su calendario está en
conciliación) y la del productor está sobrestimada en hasta US$679.000 hasta
completar la aplicación de esos pagos.

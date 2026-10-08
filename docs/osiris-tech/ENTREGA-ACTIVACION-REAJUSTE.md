# Entrega B · Activación del reajuste

Permite **activar explícitamente** el reajuste de un contrato, con fecha de referencia
respaldada y vista previa fila por fila. Ningún contrato queda activado por esta entrega.

| | |
|---|---|
| **Candidato** | `osiris/activacion-reajuste` |
| **Versión de recuperación** | `osiris/recuperacion-compatible` |
| **Base de ambas** | `9d90ed2c4efcba953957ab324717754d5d267ad7` (= `main` publicado) |
| Diferencia entre las dos | **una línea**: `ACTIVACIONES_NUEVAS_HABILITADAS` |

---

## 1 · Las reglas que el paquete sostiene

| | |
|---|---|
| **Confirmar ≠ activar** | Un antecedente confirmado no aplica nada. La activación es una acción aparte, por contrato |
| **La activación exige** | Fecha de referencia + respaldo + regla de fecha declarada + respaldo de esa regla. Falta una, no aplica |
| **Cuatro fechas distintas** | Aniversario contractual, período del servicio, emisión y pago. Cuál determina la tasa **hay que declararlo y respaldarlo**: el sistema no lo supone |
| **Sello de términos** | Al activar se sella porcentaje, fecha y regla. Editarlos después **no recalcula**: manda lo sellado, queda "modificación pendiente" y la edición se bloquea |
| **Filas protegidas** | Cualquier antecedente de factura o pago (`nFact`, `pagado`, `fechaPago`, `montoFacturado`, parcialidades) protege la fila. No se recalcula |
| **Aniversario dentro del período** | **Bloquea** la aplicación. Se muestran tres escenarios marcados como no confirmados, que **no** alimentan totales ni exportaciones |
| **Configuración antigua** | Si opera, la nueva **no** se declara activa: estado de conflicto, importes intactos, sin sustitución silenciosa |
| **Desactivar** | Operación económica propia: permiso + vista previa del impacto + confirmación explícita + motivo. Guarda rastro |

## 2 · El caso sintético y sus números

41,97 ha × US$3.000. Activación al 2 %, anclada el 2026-07-01 por inicio del período del
servicio. Todas las fechas son sintéticas.

| Temporada | Base | Con reajuste | Diferencia |
|---|---|---|---|
| 2026/2027 | 125.910,00 | 125.910,00 | 0,00 |
| 2027/2028 | 125.910,00 | 128.428,20 | 2.518,20 |
| 2028/2029 | 125.910,00 | **130.996,76** | 5.086,76 |
| 2029/2030 | 125.910,00 | 133.616,70 | 7.706,70 |
| 2030/2031 | 125.910,00 | 136.289,03 | 10.379,03 |
| **Total** | **629.550,00** | **655.240,69** | **25.690,69** |

**La cifra de 2028/2029 es 130.996,76.** Reemplaza al 131.000,96 que informé antes, que era
una estimación hecha a mano y estaba mal. El valor correcto es el que mide el motor.

## 2 bis · Lo que encontró la revisión independiente

La primera versión de este paquete fue **bloqueada** por una revisión independiente que leyó el
diff completo contra la base. Tres bloqueantes y cinco graves. Queda escrito porque explica por
qué el paquete cambió y qué clase de defecto hay que buscar la próxima vez.

| | Qué era | Cómo quedó |
|---|---|---|
| **H1** | `puedeDesactivar` y `previsualizarDesactivacion` se usaban **sin importar**. Activar reventaba el render y dejaba el contrato con el reajuste persistido y la pantalla inaccesible, sin camino de vuelta. El build no lo veía: el archivo empieza con `/* eslint-disable */` | Importadas, y una prueba compara lo exportado por el módulo contra el bloque de import |
| **H2** | El reajuste se aplicaba **solo en la rama cohortes/OC**. La rama legacy —por la que van los contratos sin cohortes, **Olmos incluido**— no pasaba por él: habría dicho `· ACTIVO` sin mover un centavo | Las dos ramas aplican, con prueba de integración que ejercita legacy |
| **H3** | La vista previa partía de filas que **ya tenían el reajuste** y lo componía otra vez. El importe que se mostraba al desactivar no era el real | La base se recalcula con la activación apagada. Hay prueba de que lo que promete la previa es lo que guarda el motor |
| **H4** | `activar()` no comprobaba permiso: vivía solo en el `disabled` | Permiso dentro de la acción, más confirmación explícita. También en reactivar |
| **H5** | Reactivar borraba el rastro anterior | Historial de eventos que reactivar no pisa |
| **H6** | El autor salía de `window.__usuarioOsiris`, que **nadie asigna**; y el audit se trunca a 200 caracteres, antes del sello | Identidad desde `usuarioActual`. **Sin identidad válida la acción no se ejecuta**. El historial guarda el sello completo |
| **H7** | En la versión de recuperación el botón Desactivar **nunca se mostraba**: el aviso lo tapaba | Reordenado. Una activación existente no queda atrapada |
| **H8** | La tabla mostraba 41,97 há × $3.000 y un total distinto, sin explicar el hueco | Muestra `base + ajuste = total` con el factor |

La parte que la revisión encontró sólida fue el modelo puro: aritmética compuesta, redondeo,
bordes de aniversario, protección por antecedentes, sello y separación confirmar/activar. **Los
ocho defectos estaban en el cableado al motor y en la pantalla**, que era la capa sin pruebas.

## 2 ter · Lo que encontró la SEGUNDA revisión

Corregidos los ocho, una segunda revisión independiente verificó las correcciones y volvió a
**bloquear**: los ocho estaban atendidos, pero *la reescritura del bloque de acciones había
introducido tres defectos nuevos*, dos de ellos en el mecanismo de control que H4/H5/H6 venían a
instalar. Vale la pena que quede escrito: corregir un bloque entero es, por sí mismo, una fuente
de defectos.

| | Lo que estaba mal | Cómo quedó |
|---|---|---|
| **R1** | Dos líneas de **texto JSX** volvieron a llevar la secuencia `·` escrita literal, que ahí no se decodifica. Es la misma línea del sello que un commit anterior ya había corregido | Carácter real. Y un control automático que lo detecta: una regla que mira los nodos de texto JSX |
| **R2** | La vista previa se calculaba sobre el contrato **todavía sin activar**, y `reajusteDeFila` corta en su primera línea si no hay activación: los cuatro números del diálogo salían en **cero**. El CFO confirmaba "diferencia US$ 0,00" cuando se iban a mover 25.690,69, y ese cero se guardaba como impacto confirmado | La previa evalúa sobre una copia activada. La evaluación plana y la hipótesis quedaron separadas, porque la previa de *desactivar* necesita el contrato apagado de verdad |
| **R3** | Reactivar desde la pantalla arrastraba la `fecha` de la activación anterior, así que el evento quedaba fechado **antes de la desactivación que lo precede** | La pantalla pasa solo los términos declarados; la fecha del evento la pone la acción |

Las tres venían de lo mismo: **ninguna prueba reproducía la forma de los argumentos que la
pantalla realmente pasa**. Las pruebas llamaban a `activar()` con una fixture prolija; la
pantalla le pasaba un spread del registro anterior. Las pruebas nuevas de R2 y R3 arman los
argumentos como los arma la pantalla, que es lo que había que probar desde el principio.

R2 apareció además en el navegador antes que en la revisión: la tabla de vista previa mostraba
"—" en todas las temporadas. Lo atribuí a que faltaba cargar la fecha. Estaba mirando el defecto
sin reconocerlo.

## 2 quater · Lo que encontraron la TERCERA revisión y el navegador

La tercera revisión verificó R1–R3 y confirmó los tres. Pero encontró que **R3 no tenía
control de regresión**: la prueba replicaba los argumentos de la pantalla en vez de mirar la
pantalla, así que al reponer el spread en el sitio de llamada la suite quedaba en verde,
31 de 31. Una versión anterior de esta acta afirmaba lo contrario; queda corregido. Ahora hay
una regla que mira **el sitio de llamada real** y falla si el spread vuelve.

La revisión en navegador, en paralelo, encontró un defecto que ninguna prueba veía:

| | Lo que estaba mal | Cómo quedó |
|---|---|---|
| **R4** | Con el reajuste **activado** y **$647.533,99** en pantalla, el encabezado seguía diciendo *"Estos montos no llevan reajuste (…) Conectarlo requiere una activación explícita, que no está hecha"*. El aviso es de la entrega A y nunca contempló que la activación pudiera existir. Estaba en cinco lugares, incluidos la columna del Excel y el marcador de la lista | `reajusteOperativoConActivacion` mira primero la activación. Los cinco lugares la usan, y una regla impide volver al aviso ciego |
| **R5** | A un usuario de **solo lectura** se le mostraba el diálogo de confirmación económica y recién después se le decía que no tenía permiso | Se comprueba el permiso antes de preguntar. La guarda dentro de la acción, que es la que vale, no se tocó |
| **R6** | Al `¿Confirmas?` de desactivar le faltaba el signo de apertura | Corregido |
| **N2** | La regla de escapes solo miraba texto JSX. En los **atributos** JSX los escapes tampoco se decodifican, así que tenía un punto ciego | Mira texto y atributos, y cubre `\uXXXX`, `\xNN`, `\n`, `\t`, `\r` |
| **N3** | Un describe se llamaba *"sin activar, nada se mueve"*, pero desde R2 ese caso da cero por otra razón: le faltan fecha y respaldo | Renombrado y re-encuadrado, con la razón escrita |

R4 merece subrayarse: **ninguna prueba lo iba a encontrar**, porque las pruebas comprueban el
motor y el defecto era que la pantalla llamaba a la función equivocada. Lo encontró mirar la
pantalla después de activar.

### La cuarta revisión, y un defecto que cometí al corregir R4

| | Lo que estaba mal | Cómo quedó |
|---|---|---|
| **R7 / D3** | Con **todas** las temporadas protegidas por factura o pago, ningún importe lleva el ajuste y el total es el de la base, pero el aviso seguía diciendo "Estos montos YA llevan el reajuste". Es el mismo error que R4, cometido al corregirlo: un aviso que afirma algo sobre los importes sin mirar los importes | El aviso recibe el detalle de filas y dice cuántas lo llevan y cuántas quedaron en su base. Donde no tiene ese detalle, no afirma nada sobre los importes |
| **D1** | Con el reajuste activado, el mismo texto aparecía dos veces en pantalla: en verde en el bloque de Royalty Comercial y en **ámbar de advertencia** en el de Facturación. Solo uno de los cinco sitios había recibido el estilo condicional | Los dos usan el mismo criterio |
| **D2** | Un reajuste del **0 %** pasaba la validación como confirmado, se podía activar, y la pantalla mostraba "+0%/año" en verde con el aviso diciendo que se aplicaba. Se llega por accidente: el campo hacía `parseFloat(valor) \|\| 0`, así que una entrada vacía o inválida se guardaba como 0 | Corregido **en el origen**: el campo guarda lo escrito y el modelo separa tres estados — sin definir, inválido y cero expreso. Un 0 escrito a propósito **sigue siendo un dato** y no se reinterpreta; lo que se impide es activarlo, porque no mueve ningún importe |
| **D4** | `C.okBg` y `C.okTxt` **no existen** en la paleta. Funcionaban por el valor de respaldo, pero estaban fuera del tema | `C.successBg` y `C.success`, que son los tokens reales |
| **N3** | El acta decía que un `describe` se había renombrado. No se había renombrado: cambié el nombre del `test` de adentro y dejé el título engañoso del bloque | Renombrado de verdad |
| **D7** | Import muerto de `reajusteOperativo`, y el `prompt` hermano del confirm de R6 seguía sin el signo de apertura | Corregidos |
| **D6** | La regla de escapes incluía `\n`, `\t` y `\r`, que dan falsos positivos sobre literales legítimos: una ruta de Windows en un `title`, una expresión regular mostrada como texto | Acotada a `\uXXXX` y `\xNN`, que es la clase real del defecto |

**Lo que hay que decir con todas las letras sobre las pruebas de R4.** La revisión revirtió las siete
llamadas de la pantalla a la función vieja y **las cinco pruebas de R4 siguieron pasando**: prueban
la función, no la pantalla. Es el mismo patrón que apareció con R3.

Eso se cerró: `src/osiris/pantallaReajuste.test.js` **renderiza la pantalla real**, hace clic y lee
el DOM. Sus contraprobas reponen cada llamada anterior y las cuatro hacen fallar la prueba, **sin
que la regla de linter intervenga**. El linter quedó como complemento, no como sustituto.

**Puntos ciegos conocidos de las dos reglas**, que la revisión midió y quedan declarados:

- `sin-spread-al-activar` mira el segundo argumento **sólo si es un objeto literal**. Pasar el
  spread por una variable intermedia, o por `Object.assign`, no se detecta.
- `aviso-con-activacion` compara el nombre de la función llamada. Una llamada por alias local o
  a través del objeto del módulo no se detecta.

Ninguna de las dos formas se usa hoy en el archivo. Quedan escritas para que nadie confunda el
control con una garantía.

**Dos cosas que quedan sin tocar, por estar fuera del alcance:**

### Lo que encontró la revisión sobre el arreglo de D-N1

El arreglo de D-N1 cerró el callejón sin salida, pero **abrió un camino peor**, y hubo que
corregirlo dos veces.

**Primer error.** La guarda pasó a mirar `estadoActivacion().activo`. Un contrato **en conflicto
con la configuración antigua** tiene la activación registrada y `activo === false` —el motor usa
la antigua—, así que la guarda no cortaba, y `puedeEditarTerminos` tampoco bloquea ese estado.
Por ahí se podía **sobrescribir el sello** con un diálogo que anunciaba "US$ 0.00". El daño era
**diferido**: aparecía el día que se retirara la configuración antigua.

| | |
|---|---|
| Con el sello original | US$ 655.240,69 |
| Con el sello resellado | US$ 644.861,66 |
| **Diferencia diferida** | **−US$ 10.379,03**, confirmada como "US$ 0,00" |

**Segundo error.** Se intentó afinar permitiendo el resello cuando el sello previo fuera
"inservible". Tampoco corresponde: que un sello esté incompleto **no autoriza a sustituirlo en
silencio**. Completarlo puede cambiar el efecto económico presente o futuro, y este paquete no
tiene un flujo autorizado para eso.

**Lo que quedó.** Si ya hay un registro, `activar()` no lo toca: ni para resellarlo ni para
completarlo. El registro y su historial se conservan, y la acción explica por qué no procede. La
pantalla deja de ofrecer "Activar" sobre un registro existente y ofrece **retirarlo**, que es una
operación económica con su vista previa, su motivo y su confirmación.

**Retirar conserva todo.** Términos, sello e historial quedan, más la constancia de la baja. Y en
un contrato en conflicto la pantalla lo dice antes de pedir el motivo: *"Retirar este registro NO
cambia los importes. La configuración antigua sigue OPERANDO y es la que produce los importes
actuales. Desactivar el registro nuevo no la quita."* La vista previa refleja ese resultado real:
cero filas bajan.

> La retirada de la configuración antigua es **exclusivamente una prueba sintética**, no una
> operación productiva autorizada.

**La prueba reproduce la secuencia completa**, en un bloque que corre en las dos versiones:
conflicto → intento de editar y activar → retirada sintética de la configuración antigua. Se
comprueba que el sello original se conserva y que **no aparece** la diferencia diferida de
US$ 10.379,03.

### Riesgos residuales

- **`activar()` acepta estados que no aplican nada** (conflicto con la configuración antigua,
  regla sin declarar, regla sin respaldo): devuelve `ok:true`, sella términos y escribe un
  evento con impacto 0, aunque el motor después no aplique nada. **Corregido**: `activar()` exige
  los cuatro términos y valida la regla de fecha, y un registro existente no se toca. Lo que sí
  es preexistente es que `puedeEditarTerminos` no bloquea el estado de conflicto; hoy eso no
  permite resellar nada, porque la guarda lo impide. Pero deja un sello y una entrada de bitácora de
  una activación que no aplica. Conviene resolverlo antes de habilitar activaciones
  productivas.
- **El ida y vuelta de la recuperación se afirma de un solo lado.** `TABLA_EDITADO` solo se
  comprueba en la rama de recuperación. Hoy vale por construcción —`OsirisModule.jsx` es
  idéntico y la bandera no entra al cálculo—, pero si las ramas divergen deja de ser un ida y
  vuelta.

**Una observación que la revisión dejó anotada y no se cambió.** `reajusteDeTemporada` recibe
`ct.rcMesCobro` crudo, no el mes ya resuelto (`ct.rcMesCobro || RC_MES_DEFAULT_POR_PAIS[país] ||
"Abril"`), así que un contrato peruano o mexicano sin mes explícito ve "Abril" dentro del
reajuste. **Hoy no tiene efecto económico**: ese mes solo alimenta la fecha estimada de cobro,
que no es ninguna de las cuatro reglas de fecha. Queda dicho, no corregido: tocarlo es cambiar
una entrada del motor sin necesidad demostrada.

### Lo que encontró la OCTAVA revisión

Veredicto: **no aprobar**. Las cuatro guardas B-1 a B-4 resistieron cada una de las pruebas de
sorteo —control deshabilitado, evento sintético salteando el `disabled`, y la secuencia
desactivar → editar → reactivar—, pero **una quinta vía de cambio económico seguía abierta, con
el mismo importe y la misma forma**.

| # | Lo que estaba mal | Cómo quedó |
|---|---|---|
| **D-1** (bloqueante) | La cláusula que respalda el reajuste se trató como dato documental. No lo es: `faltantesReajuste` la exige, así que vaciarla deja el antecedente en *pendiente*, `estadoActivacion` pasa a no activable y el sello deja de aplicar. **655.240,69 → 629.550, −25.690,69**, los mismos que destildar "Confirmado", con el control habilitado, sin aviso, sin previa, sin confirmación y sin historial. En un contrato en conflicto el efecto quedaba **diferido** al retirar la antigua | `referencia` entra en `TERMINOS_BLOQUEABLES` y el control lleva la misma condición que los demás términos |
| **D-2** | `puedeEditarTerminos` miraba la **vigencia** del registro, no su existencia. Tras retirar quedaba en `true` y reabría los cuatro campos sellados: editarlos y reactivar resellaba otros términos. Medido: sello `{2, 2026-07-01, inicioPeriodoServicio}` → `{2, 2024-07-01, emision}`, 655.240,69 → 629.550. Cada paso pedía confirmación, así que no era silencioso, pero es la vía desactivar → editar → reactivar que no está autorizada | Mira la existencia, igual que las guardas de la pantalla. Reactivar con los términos conservados sigue siendo posible: `activar()` no consulta esta función |
| **D-3** | El aviso del porcentaje no positivo leía la **configuración de hoy** y se adelantaba a `reajusteOperativo`. Con la antigua operando al 5 %/año anunciaba *"0 % registrado: sin efecto de reajuste"* sobre un total de **695.732,23** que sí llevaba reajuste; con sello 2 % y configuración editada a −2 % anunciaba "0 % registrado" mientras el sello aplicaba 2 % | Lee el **sello** y cede el aviso cuando la antigua opera. No mueve importes: la función es de presentación |
| **D-4** | El aviso de `upR` decía *"Para cambiarlos hay que retirar el registro con la accion controlada"*. Es falso —la guarda mira la existencia— y contradecía a sus dos mensajes hermanos, que dicen lo correcto | Reescrito, en la misma línea que `MOT_ANTIGUA` y `MOT_BASE` |
| **D-5** | El mismo aviso nombraba tres campos de los ocho que bloquea | Los nombra todos |
| **D-6** | `indice`, `fuente`, `fechaBase` y `desde` estaban en la lista pero sus controles llevaban sólo `disabled={!can}`: se escribía y se perdía lo tecleado | La misma condición que el resto |
| **D-7** | El control de T3 era **cegable**: su máquina de estados salía del helper sólo en una línea que matcheara `^\s*upd\(r\.id,`, así que prefijar el write con `return ` —idéntico en semántica— lo dejaba "dentro del helper" por el resto del bloque. Con eso ciego, un `upd(r.id,"reajuste",{...})` directo en el control del Tipo —**un bypass real de B-1**— pasaba la prueba | Recorta el cuerpo del helper por **balance de llaves**. Contraprueba: con esa inyección exacta, ahora falla |
| **D-8** | El escape del barrido daba por "alta" cualquier línea con `campo="…"`, incluido un `<Campo campo="valorRoyaltyComercial" r={r}/>`, que escribe con `upd(r.id,campo,v)` **sin guarda**. Latente, no abierto | El escape exige `setF`, que es lo que de verdad distingue el formulario de alta |
| **D-9 / D-10** | Un bloque de comentario duplicado; y un comentario que decía "EXISTE" donde el código mira la marca | Corregidos |

**La cobertura que faltaba, dicha sin adornos.** La revisión midió que `selloCompleto` con
`pct > 0` **no tenía red económica**: revertirla rompía una sola aserción de redacción. El caso
que sí mueve plata —un sello deflacionario de −2 %, que contra la base `9d90ed2` son
**+24.683,38** (604.866,62 → 629.550)— no estaba cubierto en ningún sentido. Un sello así
`activar()` no lo puede crear (rechaza `pct ≤ 0`, y eso ya era así antes del paquete) y en el
snapshot congelado hay **0 casos**: sólo puede venir de datos heredados o editados a mano. Ahora
está pinchado en las dos versiones.

**Por qué el barrido no cazó D-1.** El barrido comprueba **qué función escribe** `reajuste`
—siempre `upR`—, no **qué campos protege** esa función. `referencia` pasaba por `upR`, así que
quedaba verde: cerrado por ruta, abierto por campo. Las pruebas que ahora lo pinchan son de
pantalla y miden el importe.

**Consecuencia del diseño que conviene dejar escrita.** En cuanto EXISTE un registro —incluso
retirado— los ocho términos del antecedente, la base por hectárea y la configuración antigua
quedan bloqueados de forma permanente. `desactivar()` no los libera, que es lo autorizado, y
este paquete no trae ningún flujo que lo haga. Si un contrato con reajuste activado renegocia su
US$/há, **hoy no hay manera de corregirlo dentro de la aplicación**: hace falta el flujo de
modificación económica, que es una entrega aparte.

**Lo que la revisión confirmó que no se rompió.** Sin registro, los siete controles siguen
abiertos y escriben: tipo, confirmado, porcentaje, "Sujeto a Inflación", cláusula, valor por
hectárea y % de inflación anual. Con registro vigente, los datos operativos siguen editables y
mueven el importe (41,97 → 50 ha: 655.240,69 → 780.606,02). No se bloquearon hectáreas ni
despachos.

**Dos cosas que quedaron fuera, declaradas.** `fechaTermino` lo escribe `Campo` sin guarda y
acota la serie de cohortes, así que con un registro vigente mueve el total sin previa —**idéntico
en la base, no es regresión**— y la revisión lo dejó como camino de código, no comprobado en
pantalla. Y las dos fallas conocidas del repositorio (`paramsFrutaAnticipos`,
`FriskuSharePointBuscador`) están fuera de `src/osiris/`: no las observó.

## 3 · Recuperación

**Estado: compatible y probada en local; pendiente de despliegue y certificación.** No está
resuelta.

**Lo que se descubrió primero.** Volver a `9d90ed2` devuelve 125.910 en las cinco temporadas:
eso no es recuperación segura, es **incompatibilidad económica**. Un rollback borraría los
US$ 25.690,69 aplicados, y desactivar un reajuste es una operación económica propia, no el
efecto silencioso de volver atrás. Esa prueba se conserva **invertida, como contraprueba**:
detecta que una versión sin soporte cambia los importes y falla si alguien reintroduce la
incompatibilidad.

**La versión compatible**, verificada:

| | |
|---|---|
| Importes idénticos al candidato | Las cinco temporadas al centavo, total 655.240,69 |
| Conserva activación, respaldo y cambios posteriores | Sí, y el sello gobierna igual que en el candidato |
| Editar allá y volver al candidato | 125.910 / 128.428,20 / 162.208,76 / 165.452,94 / 168.762, reproducidos al centavo, sin pérdida y con el reajuste aplicado |
| Bloquea nuevas **en la acción** | `activar()` devuelve `ok:false` y **no escribe nada**; no es un botón oculto |
| No atrapa las existentes | Se pueden desactivar, con las mismas exigencias |

La comparación usa `fixturesReajuste.js`, **idéntico en las dos ramas**: una diferencia de
importes solo puede venir del código.

## 4 · Orden de despliegue propuesto

Ninguno de estos pasos está autorizado todavía.

| Paso | Qué se despliega | Qué habilita | Recuperación de ESE paso |
|---|---|---|---|
| **1** | **Versión de recuperación** (`osiris/recuperacion-compatible`) | Nada nuevo: el motor sabe leer activaciones, pero no se puede crear ninguna. Los importes no cambian, porque no hay activaciones en los datos | Volver al deployment de `9d90ed2`. Es seguro **solo mientras no exista ninguna activación**, y en este paso no puede existir |
| **2** | **Certificar** ese deployment en vivo: que calcula igual y que rechaza crear activaciones | — | Igual que el paso 1 |
| **3** | **Candidato** (`osiris/activacion-reajuste`) | Se pueden crear activaciones | Volver al deployment del paso 1, **ya certificado**: conserva el cálculo de lo activado |
| **4** | Activar un contrato concreto, con autorización propia | Ese contrato reajusta | Desactivar, que es una operación económica con su propia vista previa y confirmación |

**La regla que ordena todo esto:** no se habilitan activaciones productivas (paso 3) hasta que
el paso 2 esté hecho y autorizado. Sin un deployment de recuperación compatible y certificado,
cualquier rollback sería una pérdida económica silenciosa.

## 5 · Impacto medido sobre la copia de los 23 contratos reales

**Delta cero.** Nada del paquete mueve un importe mientras no haya una activación, y hoy no hay
ninguna.

| | |
|---|---|
| Contratos con activación | **0** |
| Estado de los 23 | `noActivable`: ninguno tiene el antecedente confirmado |
| Filas de royalty comercial | 57 |
| **Importe bruto calculado por el motor** | US$ 13.504.590 |
| **Importe neto calculado por el motor** | US$ 11.478.901,50 |
| Contratos con términos bloqueados | 0 |
| Mutación al evaluar la cartera | Ninguna |

**Sobre esas dos cifras.** Son **importes brutos y netos que calcula el motor** a partir de los
contratos y sus cohortes. **No son facturación emitida ni cobros acreditados**: el motor no sabe
nada de eso. Lo único que acreditan es que el paquete no cambia lo que el motor produce.

### Las tres temporadas con antecedentes, descritas aparte

Quedan identificadas porque estarían protegidas el día que se active algo en esos contratos. Cada
una tiene un antecedente distinto, y conviene no mezclarlos:

| Contrato | Temporada | Antecedentes registrados |
|---|---|---|
| Agroextiende | 2024/2025 | Número de factura 112 y fecha de pago 2026-08-04. **No** tiene marca de pagada |
| Agrícola San Clemente Limitada | 2025/2026 | Número de factura 75, marcada como pagada, fecha de pago 2025-06-26 |
| Agrícola San Clemente Limitada | 2026/2027 | Número de factura 123, marcada como pagada, fecha de pago 2026-06-02 |

Lo que el sistema registra es eso: un número, una marca y una fecha cargados por alguien. **No
es una conciliación contra la contabilidad ni contra el banco**, y este paquete no la hace. Para
el mecanismo alcanza con que exista el antecedente: la fila no se recalcula.

## 6 · Pendientes para activar Olmos

No se activa y no se declara listo. Lo que falta, en orden:

1. **La fecha del primer pago de royalty comercial, con su respaldo.** Es lo único que fija el
   aniversario según Annexure D 1.2.5, p.24 (2 % anual desde un año después de ese pago).
2. **La regla que relaciona las fechas**, declarada y respaldada: cuál de las cuatro determina
   la tasa aplicable. Es independiente del punto 1.
3. **La decisión sobre el aniversario dentro del período del servicio.** Con un ancla a mitad
   de año, el aniversario cae dentro de **todas** las temporadas, no de una. Mientras no se
   decida, la aplicación queda bloqueada para ese contrato.
4. **Revisar períodos y filas afectadas** antes de autorizar, como pediste.
5. **El deployment de recuperación certificado** (paso 2 de arriba).

Los puntos 1 y 3 son distintos y no se mezclan: el primer pago **establece** el aniversario;
cómo se aplica al período correspondiente es la regla pendiente.

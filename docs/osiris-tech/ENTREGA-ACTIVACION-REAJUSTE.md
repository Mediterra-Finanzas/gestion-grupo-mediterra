# Entrega B · Activación del reajuste

Permite **activar explícitamente** el reajuste de un contrato, con fecha de referencia
respaldada y vista previa fila por fila. Ningún contrato queda activado por esta entrega.

| | |
|---|---|
| **Candidato** | `osiris/activacion-reajuste` |
| **Versión de recuperación** | `osiris/recuperacion-compatible` |
| **Base de ambas** | `c9c579206bcb613bdc5aad61d01480ee01f5760a` (`origin/main` vigente al 2026-10-08) |
| Diferencia entre las dos | **una línea**: `ACTIVACIONES_NUEVAS_HABILITADAS` |

---

## 0 · Límites de esta entrega, a la vista

Tres cosas que esta entrega **no** hace, y conviene leer antes que cualquier otra sección. Las
tres están medidas y desarrolladas más abajo; acá quedan juntas para que no haya que buscarlas.

**1 · Las reglas "emisión" y "pago" no son activables.** De las cuatro reglas de fecha, dos
resuelven su fecha desde un campo editable del cobro, y para esas la activación exige la fecha
**y** su respaldo. Una `fechaEst` sola es una estimación, no la fecha efectiva de emisión; y el
respaldo de una emisión es su antecedente de facturación, que por la Regla 4 protege la fila y la
saca del recálculo. Las dos condiciones se excluyen, así que `activar()` rechaza siempre esas dos
reglas, diciendo temporada por temporada qué falta. Medido por fuerza bruta: de las **128** combinaciones posibles de los siete campos de antecedente,
**ninguna** produce una fecha sellable, y de los **256** intentos de activar (128 × las dos reglas
por fila) **ninguno** es aceptado.
Las dos reglas deterministas (`inicioPeriodoServicio`, `finPeriodoServicio`) funcionan normalmente.
Impacto sobre datos reales: **cero** — el snapshot no tiene ninguna activación ni ninguna regla
declarada. Si el grupo necesita anclar a la emisión real, hace falta una fecha efectiva de emisión
con respaldo propio, distinta de la estimada: es diseño de otra entrega.

**2 · La protección conservada no congela hectáreas ni períodos.** Lo que conserva es la
protección de la Regla 4 cuando se vacía o se corrige un antecedente de cobro: el importe no
vuelve al recálculo por eso. No toca nada más. Siguen moviendo importes, por decisión expresa y con
cifra medida sobre el caso de 41,97 há × US$ 3.000 al 2 %:

| Palanca | Efecto |
|---|---|
| `rcCohortes` 41,97 → 50 há | 655.240,69 → **780.606,02** (+125.365,33) |
| `fechaTermino` 2031-06-30 → 2033-06-30 (5 → 7 filas) | 655.240,69 → **936.050,61** (+280.809,92) |
| `haCobrar` 41,97 → 30 há sobre una fila protegida | 647.533,99 → **611.623,99** (−35.910,00) |

Las tres son datos operativos y quedan editables. `haCobrar` merece el subrayado: baja una fila
protegida sin tocar la protección, porque es un override de hectáreas y la Regla 4 nunca lo cubrió.

**3 · Levantar la protección requiere una entrega aparte.** Nada de este paquete la quita: ninguna
escritura la pierde, ni una que la borre a propósito, y no hay función ni control que lo haga. Eso
es deliberado — devolver una fila protegida al recálculo mueve importes y necesita su propio flujo,
con vista previa y confirmación. Hoy, si una fila quedó protegida y la protección ya no
corresponde, **no hay manera de corregirlo dentro de la aplicación**. Lo mismo vale para los ocho
términos del antecedente y la base por hectárea de un contrato con registro de activación: quedan
bloqueados mientras el registro exista, incluso retirado.


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

### D-11 · La fecha que manda queda sellada, fila por fila

Lo encontró la novena revisión y lo verifiqué de forma independiente. **El sello guardaba la
regla, no la fecha a la que esa regla resuelve.** Dos de las cuatro reglas leen su fecha de un
campo del cobro que se edita todos los días:

| Regla | De dónde sale su fecha | ¿Campo editable? |
|---|---|---|
| `inicioPeriodoServicio` | `limitesTemporada(temporada).desde` | **No**: función del rótulo "2026/2027" |
| `finPeriodoServicio` | `limitesTemporada(temporada).hasta` | **No**: lo mismo |
| `emision` | `rcPagos[temporada].fechaEst` | **Sí** |
| `pago` | `rcPagos[temporada].fechaPago` | **Sí** |

La reproducción, medida de punta a punta sobre el caso sintético de 41,97 há × US$ 3.000 al 2 %:

| Paso | Resultado |
|---|---|
| Vista previa al activar con regla "emisión", sin `fechaEst` cargada | 0 filas cambian, **diferencia aplicada 0** |
| `activar()` con esa previa | **aceptaba**: sello `{2, 2026-07-01, emision}`, historial con **impacto confirmado 0**, total 629.550 |
| Alguien carga después las fechas estimadas de factura | total **655.240,69**, **+25.690,69** |
| Mover una sola fecha a 2099 | total **1.050.741,67** |
| | el sello intacto, el historial con un solo evento |

`estadoActivacion().activo` era `true` en los dos estados: no se apagaba el sello, se movía el
ancla. Por eso ninguna de las guardas B-1 a B-4 lo veía — vigilan lo que **apaga** el registro.
No existe en la base `9d90ed2`, así que **lo introdujo este paquete**; y estaba latente, porque
sin ninguna activación real nadie podía dispararlo.

**Lo que se implementó (A + C, autorizado).**

**A · El sello guarda la fecha concreta de cada fila.** Para las dos reglas por fila, el sello
lleva `fechasPorFila: {temporada: {fecha, origen, respaldo}}`. El motor calcula con esa fecha y
**no vuelve a leer el campo**: editar `fechaEst` o `fechaPago` después no mueve el reajuste
confirmado. La vista previa muestra la fecha sellada y su procedencia en la columna de estado, y
la simulación sella con el mismo contexto de filas que la acción, así que previa y acción no
pueden discrepar por construcción.

**Una fila sin fecha sellada queda PENDIENTE de aplicación**, no aplicada: una temporada que
aparece después —una cohorte nueva, o una activación heredada que selló la regla y no las
fechas— no incorpora un efecto que nadie confirmó. El aviso la nombra como pendiente, no como
"protegida por factura", que es otra cosa.

**C · La acción rechaza lo que no puede sellar.** Si la regla declarada depende de una fecha de
la fila y ninguna fila tiene una fecha sellable, `activar()` rechaza y dice, temporada por
temporada, qué falta. No se registra nada. Y si la acción no recibe las filas, tampoco sella la
regla sola: rechaza.

**La consecuencia que hay que leer completa, porque es una decisión pendiente.** Para la regla
"emisión" hacen falta dos cosas: la fecha y su respaldo. Una `fechaEst` sola es una
**estimación**, y no se la trata como fecha efectiva de emisión. El respaldo de una emisión es
su antecedente de facturación — y la Regla 4 no recalcula las filas con antecedentes. Las dos
condiciones son hoy mutuamente excluyentes, así que **la regla "emisión" no tiene ninguna
aplicación alcanzable**: con fecha sin respaldo se rechaza por estimación, y con respaldo se
rechaza por Regla 4. Con "pago" es más directo todavía: `fechaPago` **es** un antecedente de
cobro. El mecanismo de sellado queda implementado y probado, y el motor respeta un sello que
traiga fechas; lo que no hay es un camino por el que la acción las produzca.

Esto **no se resolvió inventando un respaldo que no existe**. Si el grupo necesita una regla
anclada a la emisión real, hace falta una fecha efectiva de emisión con su propio respaldo,
distinta de la estimada, y eso es diseño de otra entrega. Queda planteado, no implementado.

La décima revisión confirmó esta lectura por fuerza bruta y la extendió a "pago": `fechaEst` no
figura en `antecedentesDeCobro()`, así que el respaldo sólo puede venir de `nFact`, `pagado`,
`fechaPago`, `montoFacturado` o una parcialidad, y cualquiera de los cinco dispara la Regla 4.

**Las dos reglas deterministas no se tocaron**, y conviene decir por qué: su fecha sale de
`limitesTemporada`, que es una función del rótulo de la temporada, no de un campo editable. No
hay dependencia de dato mutable que sellar. Sus importes no se mueven: el caso conocido sigue
dando 655.240,69.

**Lo que sigue abierto y declarado, igual que antes.** El conjunto de filas depende de
`rcCohortes` y de `fechaTermino`, que son datos operativos y siguen editables por decisión
expresa: 41,97 → 50 há lleva el total de 655.240,69 a 780.606,02. Eso no cambió con esta
corrección y no está en su alcance.

**Contrapruebas, cada una restaurada con hash idéntico:**

| | Qué se revirtió | Pruebas que caen |
|---|---|---|
| **CP-A** | el motor vuelve a leer el campo mutable en vez del sello | **4** |
| **CP-C** | la acción deja de rechazar lo que no puede sellar | **6** |
| **CP-A2** | la fila sin fecha sellada vuelve a tomar el ajuste sola | **7** |
| **CP-D6** | las cuatro condiciones `disabled` de D-6 | **4** (cobertura de interfaz, ver abajo) |

#### Pérdida de capacidad, dicha como tal

No es sólo una consecuencia: **las reglas "emisión" y "pago" pasaron de activables a imposibles
de activar.** Antes de esta corrección se podían sellar (y ahí estaba el defecto); ahora
`activar()` las rechaza siempre, porque ninguna fila puede cumplir a la vez las dos condiciones
que la regla exige. La décima revisión lo midió por fuerza bruta: **0 de 256 combinaciones** de
los siete campos de antecedente producen una fecha sellable, y **0 de 128 intentos** de activar
con una regla por fila son aceptados.

**Impacto sobre datos reales: cero.** El snapshot congelado tiene **0 activaciones**
(`reajusteActivacion/activado`), **0 reglas de fecha** declaradas y **0 campos de sello**. No hay
ninguna activación real que esta corrección apague, y no hay ningún contrato que quede sin poder
activarse por una regla que ya hubiera elegido.

La dirección del cambio es fail-safe: lo que no se puede sellar, no se activa. Pero el mecanismo
de sellado por fila **sólo se ejercita hoy contra un estado que el propio sistema no puede
producir** —las pruebas del motor construyen el sello a mano—, así que si una entrega futura
agrega una fecha efectiva de emisión con su propio respaldo, ese camino correrá por primera vez
sin haber sido recorrido de punta a punta. Queda anotado como riesgo de la entrega siguiente, no
de ésta.

#### Lo que sigue abierto, con cifras

Medido sobre el caso de 41,97 há × US$ 3.000 al 2 % con la activación vigente (655.240,69):

| Palanca | Efecto medido | Estado |
|---|---|---|
| `rcCohortes` 41,97 → 50 há | 655.240,69 → **780.606,02** (+125.365,33) | abierta, operativa, declarada por decisión expresa |
| `fechaTermino` 2031-06-30 → 2033-06-30 (5 → 7 filas) | 655.240,69 → **936.050,61** (+280.809,92) | abierta; preexistente, idéntica en la base |
| Borrar el `nFact` de una fila protegida | 647.533,99 → **655.240,69** (+7.706,70 en 2029/2030; la revisión midió +10.379,03 en otra temporada) | **cerrada** por D-12: la protección queda conservada |
| `valorRoyaltyComercial` 3.000 → 3.300 | movería a **720.764,77** (+65.524,08) | **cerrada** en la pantalla por B-4: con un registro no hay campo editable y `upProtegido` rechaza. La cifra es la magnitud que la guarda impide, no un camino abierto |

La tercera era un mecanismo distinto del de D-11 —no mueve el ancla, **quita la protección de la
Regla 4**— y quedó **cerrada en D-12**, por autorización expresa. Ver esa sección.

#### Qué está y qué no está respaldado por pruebas

El sello **sí** protege lo que sella, y hay red para cada cosa: editar `reajuste.pct` a 20 deja
el total en 655.240,69 y marca modificación pendiente; mover el campo `fechaReferencia` a 2020 no
lo mueve; cambiar el campo `reglaFecha` a "emisión" después de activar con una determinista
tampoco (la regla sellada sigue siendo la original).

Dos cosas que **no** están respaldadas, y conviene que se lean acá y no en otro informe:

1. **La afirmación "previa y acción no pueden discrepar" descansa en lectura de código para el
   camino por fila, no en una prueba que pueda fallar.** La décima revisión reemplazó
   `comoSiSeActivara(ct, contexto)` por `comoSiSeActivara(ct, undefined)` y las 26 suites
   quedaron en verde: **contraprueba CP-D = 0**. No es que falte la prueba: hoy no puede fallar,
   porque sin camino alcanzable las dos ramas producen el mismo `{}`. La prueba que antes
   respaldaba la afirmación era tautológica —comparaba `sellarTerminos` con la función que
   `sellarTerminos` llama— y se reemplazó por dos que sí pueden fallar: una compara fila por fila
   lo que anuncia la previa con lo que el motor calcula después de activar de verdad, con la
   regla determinista, que es la alcanzable; la otra comprueba que las temporadas que la previa
   marca pendientes son exactamente las que la acción nombra como faltantes. La primera cae si
   la previa simula un sello distinto del que sella la acción (medido: cae junto con otras seis).
2. **Las pruebas del modelo que se adaptaron perdieron poder discriminante sobre la propiedad
   corregida.** El helper `SELLANDO` les pasa la misma fecha dos veces —como antecedente y como
   fecha sellada—, así que ya no distinguen si el motor lee el sello o el campo. Medido: con el
   motor revertido a leer el campo, de todo `reajusteAplicado.test.js` falla **una sola** prueba,
   y es la nueva. Lo que sostiene la propiedad son las tres de `integracionReajuste`, que son las
   que caen en CP-A. Ninguna aserción de valor se bajó: los importes, los períodos, el bloqueo
   por aniversario y los tres escenarios siguen exigiendo lo mismo.


**D-6 queda separado a propósito.** El bloqueo económico de los ocho términos lo sostiene `upR`,
que rechaza por lista y avisa; revertir esas cuatro condiciones `disabled` no abre ningún agujero
de importes, y la revisión lo midió. Lo que vuelve sin ellas es el defecto de interfaz: el campo
se deja escribir y se pierde lo tecleado. La cobertura nueva es de interfaz y está rotulada así.


### D-12 · La protección de la Regla 4 no se pierde al vaciar un campo

Autorizado después del cierre de D-11. Es **otro mecanismo**: no mueve el ancla, quita la
protección. `antecedentesDeCobro` se evaluaba en vivo sobre `rcPagos`, así que borrar el número
de factura de una fila protegida la devolvía al recálculo y le aplicaba el reajuste sin vista
previa ni confirmación.

Medido: con la factura cargada **647.533,99**; borrándola **655.240,69**; **+7.706,70** en
2029/2030 sobre el caso de 41,97 há × US$ 3.000 al 2 %.

**Lo que se implementó.** Si una edición dejaría la fila sin antecedentes, lo que tenía queda
**conservado** en `rcPagos[temporada].proteccion` —con los motivos y la fecha en que se
retiraron— y sigue protegiéndola. El campo se edita igual: corregir un número de factura es
tarea normal y no se bloqueó nada operativo. Lo que no pasa es que el importe vuelva al
recálculo por eso. Levantar la protección es una operación económica con su propio flujo, que
**no está en este paquete**: nada de lo que hay acá la quita, y hay una prueba de comportamiento
que lo comprueba: trece ediciones distintas sobre una fila conservada, y ninguna la quita ni
mueve el importe (ver R-1 a R-3 más abajo).

**Cubre los cinco antecedentes, no una lista de campos.** La conservación compara el *antes*
contra el *después* con la misma función que usa la Regla 4, así que alcanza a `nFact`, `pagado`,
`fechaPago`, `montoFacturado` y las parcialidades, y a cualquiera que se agregue a esa función en
el futuro. Cada uno tiene su prueba.

**La secuencia completa, probada de punta a punta en pantalla:** fila protegida → borrar el
número de factura con el control real → el campo queda editado, la fila conserva la protección y
el total no se mueve → serializar y recargar → el importe sigue intacto, los motivos conservados
y la fila se sigue mostrando como protegida. También con "pagado" destildado, y corrigiendo el
número por otro (ahí no hay nada que conservar: el antecedente sigue vivo).

Dos detalles del encuadre de esa prueba, porque sin ellos no probaría nada: el `nFact` sólo es
editable en las temporadas **vivas** —en las futuras se muestra como texto—, así que la temporada
se descubre del DOM en vez de fijarse a mano, y la prueba sigue valiendo cuando el calendario
avance; y la fecha de referencia va en 2023 para que la temporada viva ya tenga períodos
cumplidos, porque con la fixture de 2026 el ajuste de la primera temporada es cero y borrar su
factura no movería nada.

### El diálogo de activación

Parte del cierre de D-11, no una mejora posterior. Con la fecha que la regla exige ausente, la
pantalla preguntaba *"Diferencia que se aplica: US$ 0.00 · ¿Confirmas?"* y **recién después** la
acción rechazaba. Eso es pedirle al usuario que acepte un cero causado por información ausente.

Ahora el bloqueo ocurre **antes** de ofrecer cualquier confirmación: un aviso con las temporadas
pendientes y el motivo de cada una, y no se pregunta nada. La comprobación vive en una sola
función (`bloqueoPorFechasSelladas`), que usan la pantalla y la acción, así que el texto no puede
divergir y la acción sigue comprobándolo por su cuenta. Con una regla alcanzable el diálogo
pregunta como siempre, con la diferencia real.

**Y la celda lo dice por lo que es.** Una fila protegida por un antecedente que ya se retiró no
"tiene factura o pago": tiene la protección conservada. La vista previa las distingue, porque
describir algo que no está es la misma clase de defecto que los avisos que se corrigieron antes.
Lo encontré en el navegador, después de la corrección: el importe estaba bien y el rótulo no.

**Contrapruebas, cada una restaurada con hash idéntico:**

| | Qué se revirtió | Pruebas que caen |
|---|---|---|
| **CP-H** | la protección conservada deja de contar en la Regla 4 | **10** |
| **CP-K** | la celda vuelve a decir siempre "tiene factura o pago" | **1** |
| **CP-I** | la pantalla deja de conservar la protección al escribir | **3** |
| **CP-J** | el diálogo vuelve a preguntar antes de rechazar | **1** |

#### Lo que la undécima revisión encontró del propio arreglo

Aprobó D-12 y el diálogo, con una **regresión que yo introduje** y cuatro hallazgos. Las tres
primeras quedaron corregidas; las dos últimas se declaran.

**R-1 · La bitácora de ediciones de cobros quedaba truncada. Corregido.** `upd` audita cada
cambio con `JSON.stringify(...).slice(0, 200)`. Al guardar el párrafo explicativo **dentro de
cada fila**, la protección conservada se comía esa ventana: la revisión midió 29 caracteres para
una fila con factura viva, **275** para una conservada y **823** con tres. El párrafo salió de la
fila a una constante exportada (`MOTIVO_PROTECCION_CONSERVADA`); la fila guarda sólo
`{motivos, desde}`. (La constante quedó sin usar en ese commit y se corrigió después: ver la
pasada corta más abajo.) Medido ahora: la conservación agrega **menos de
90 caracteres** por fila. Lo que **no** se afirma: un `rcPagos` con varias temporadas conservadas
sigue pasándose de 200. Eso es la deuda del audit, anterior a esto; lo que este arreglo evita es
agravarla fila por fila. La prueba lo pincha en los dos sentidos.

**R-2 · La pantalla no decía que la protección era conservada. Corregido** —lo había visto yo en
el navegador y ya estaba a medias; con el pedido de la revisión la celda ahora nombra también la
fecha: *"protegida: antecedentes retirados el AAAA-MM-DD · protección conservada"*. Con el
antecedente vivo dice lo de siempre.

**R-3 · La marca conservada no se limpiaba al volver el antecedente. Corregido.** Corregir el
número después de borrarlo dejaba dos motivos para una sola fila (`"número de factura 1000"` y
`"proteccion conservada: número de factura 999…"`). Ahora el conservado se informa **cuando es la
razón** (`soloPorConservada`), no además de la viva. El registro se conserva igual: si el vivo se
retira otra vez, vuelve a ser la razón, y hay prueba de las dos transiciones. Sin efecto
económico en ningún caso: la fila estaba protegida por cualquiera de los dos.

**R-4 · La protección es falsificable por dato, no por pantalla. Declarado, no cerrado.**
`antecedentesDeCobro({proteccion:{motivos:["inventado"]}})` protege la fila. No hay ruta de
interfaz que lo escriba, y cualquiera que pueda editar el JSON del contrato ya podía poner un
`nFact` falso, así que el riesgo no cambia con esto. Lo que sí es cierto es que el estado nuevo no
trae atadura de identidad —ni autor, ni firma, ni correlativo— mientras el resto del paquete sí es
exigente con la identidad en las operaciones económicas. Atarlo es diseño de otra entrega.

**R-5 · Quedan tres rutas que preguntan antes de validar. Declaradas, no cerradas.** Son la misma
clase que el diálogo que se acaba de corregir, y la revisión midió que son **idénticas en los dos
commits**, o sea preexistentes:

| Ruta | Qué hace hoy |
|---|---|
| Términos de la activación incompletos | pregunta *"Diferencia que se aplica: US$ 0.00 · ¿Confirmas?"* y recién después avisa que faltan los términos |
| Configuración antigua **operando** | pregunta lo mismo y después aplica el rechazo B-2. Es justo el caso que anunciaba US$ 0,00 con un impacto diferido de −10.379,03 |
| Todas las filas protegidas | pregunta *"Protegidas por factura o pago: 5 · Diferencia: US$ 0.00"* y **la activación se registra**, con impacto confirmado 0 |

`bloqueoPorFechasSelladas` cubre sólo la vía de las fechas por fila, que es la que estaba
autorizada. Las tres de arriba no se tocaron para no ampliar el alcance sin autorización, y la
tercera es la que más conviene mirar, porque ahí sí se escribe un registro.

**Dos límites que la revisión midió y conviene tener a mano**, los dos sin cambio entre commits:
`haCobrar` baja una fila protegida (41,97 → 30 há: **647.533,99 → 611.623,99**, −35.910,00)
porque es un override de hectáreas y la Regla 4 nunca cubrió eso —la protección queda intacta—; y
el patrón de escritura de `rcPagos` es el *last-write-wins* de siempre, así que dos ediciones de
temporadas distintas sin re-render intermedio podrían pisarse. Ninguno lo introduce este paquete.

**Y una prueba que la revisión desarmó, con razón.** La que decía *"nada de este paquete levanta
la protección"* era un grep de nombres exportados: un `limpiarProteccion` habría pasado. La
reemplazó una que mide comportamiento —trece ediciones distintas sobre una fila conservada, y
ninguna la quita ni mueve el importe— y el grep quedó como complemento, no como la red. La frase
del acta estaba sobrevendida y queda corregida acá.

**Contrapruebas de estas tres correcciones**, cada una restaurada con hash idéntico: devolver el
párrafo a la fila, informar el conservado siempre, y hacer que una edición quite la protección
→ caen **4** pruebas entre las dos suites.


#### Y lo que encontró la pasada corta sobre esas correcciones

Aprobó el delta y midió tres cosas que el acta decía y no eran así. Ninguna económica; las tres
corregidas.

**La constante era código muerto.** `MOTIVO_PROTECCION_CONSERVADA` existía y no la mostraba
nadie, mientras el comentario y esta acta decían que la mostraban "la pantalla y el modelo". Es
la única frase que le explica al operador por qué no puede devolver la fila al cálculo. Ahora la
muestra la celda de estado como ayuda (`title`) cuando la protección es la conservada, y hay una
prueba que lee ese atributo. El comentario del código quedó corregido también.

**El registro se congelaba en el primer retiro.** Medido por la revisión: borrar la factura 999
el 2026-10-09, corregirla a 1000, y borrarla otra vez el 2026-11-20 dejaba la pantalla afirmando
*"antecedentes retirados el 2026-10-09"* y el registro nombrando la **999**, cuando lo último
retirado fue la **1000** el **2026-11-20**. La causa: la decisión miraba `despues.hay`, y la
propia conservada ya lo hacía verdadero. Ahora mira si había un antecedente **vivo** y dejó de
haberlo: los motivos se acumulan sin repetir y la fecha es la del último retiro. Una edición que
no retira nada no mueve la fecha. Las dos transiciones tienen prueba, y la de "insistir no apila"
—que afirmaba lo contrario y pasaba porque usaba una forma que la pantalla no produce— quedó
reescrita con la forma real (`{...antes, campo: valor}`, que es lo que hace `updRcPago`).

De paso, esa reescritura **sanea las filas heredadas**: una fila escrita antes, con el párrafo
adentro, queda limpia al pasar por la conservación. Y se agregó una garantía que la revisión
había encontrado por accidente y convenía volver explícita: **ninguna escritura pierde un
registro ya conservado**, ni siquiera una que lo borre a propósito. No hay control de pantalla que
lo escriba, pero la garantía es del modelo, no de que el control no exista.

**El diálogo de confirmación atribuía facturas que no estaban.** Decía *"Protegidas por factura o
pago: N"* contando filas cuya protección es la conservada. El resumen de la pantalla dice
"protegidas" sin atribuir razón, y ahí estaba bien; el texto que el usuario **confirma**, no.
Ahora dice *"Protegidas (factura, pago o protección conservada): N"*.

**Y una red que faltaba.** La revisión midió que romper `soloPorConservada` dejaba la suite de
pantalla en verde: el caso "antecedente vivo **y** registro conservado a la vez" —donde la celda
debe nombrar el vivo— sólo lo cazaba una prueba de modelo. Ahora tiene su prueba de pantalla.

**Contrapruebas de estas cuatro**, cada archivo restaurado con hash idéntico: perder el registro
conservado, volver a decidir con `despues.hay`, quitar la ayuda de la celda y volver al texto
viejo del diálogo → cae **una prueba por cada una**.

**Corrección a lo que esta acta decía de las contrapruebas anteriores.** Declaraba que las tres
de la ronda previa sumaban 4 pruebas caídas. Eso era el resultado de revertirlas **juntas**; la
revisión revirtió la conservación sola y midió **11**. No estaba exagerada —subdeclaraba la red,
que es el lado conservador— pero estaba mal descrita, y así no se reproduce. Queda dicho: tres
reversiones simultáneas, 4 caídas; la conservación sola, 11.


#### Y lo que trajo el arreglo del registro

La pasada siguiente aprobó esas tres correcciones y encontró dos consecuencias del propio arreglo
más un texto que seguía atribuyendo facturas. Las tres corregidas.

**El acumulado crecía sin tope, y R-1 volvía por otra vía.** Cada valor distinto retirado sobre la
misma fila agregaba un motivo y nada los recortaba. Medido por la revisión: a los **seis** retiros
el `rcPagos` de una sola fila llegaba a **218 caracteres** —por encima de los 200 que audita la
bitácora, que es el defecto que R-1 había cerrado— y con 21 motivos el rótulo de la celda medía
**540 caracteres** en un `td` de `fontSize:9`. Ahora el acumulado tiene tope
(`MAX_MOTIVOS_CONSERVADOS = 5`): se conservan los últimos y el resto se cuenta
(*"N retiros anteriores"*), sin duplicar el conteo al seguir acumulando. Medido: con 21 retiros la
fila entra en los 200 y el rótulo queda bajo 180 caracteres, y la fila sigue protegida.

**Un antecedente retirado mientras quedaba otro vivo no se registraba nunca.** Secuencia medida:
`{nFact:"999", pagado:true}` → borrar la factura → destildar pagado dejaba el registro diciendo
sólo *"marcada como pagada"*, **sin la 999**. La protección estaba intacta; lo que faltaba era el
antecedente en el registro que existe justamente para dejar constancia de lo que la fila tuvo. La
causa: sólo se evaluaba el retiro en la edición en que la fila se quedaba sin ningún antecedente
vivo. Ahora se registra lo que **desaparece** en cada edición, aunque queden otros.

Y con eso apareció la decisión de fondo: **la comparación es por clase de antecedente, no por
valor.** Corregir el número de factura de 999 a 1000 no retira nada —sigue habiendo factura—;
borrarlo sí. Si se comparara por valor, cada corrección de un número quedaría registrada como un
retiro y el acumulado crecería con el trabajo normal de la oficina. Las cinco clases son `nFact`,
`pagado`, `fechaPago`, `montoFacturado` y las parcialidades.

**Un texto más que atribuía facturas.** El diálogo ya estaba corregido, pero el **aviso operativo**
seguía diciendo *"N quedan en su valor base por tener factura o pago registrado"* contando también
las filas cuya protección es la conservada. Ahora el resumen cuenta las dos cosas aparte
(`filasProtegidasConservadas`) y el aviso dice *"N con factura, pago o protección conservada (M por
antecedentes ya retirados)"*. Cuando ninguna es conservada, dice lo de siempre.

**Y el rótulo dejó de aplicar una fecha a toda la lista.** Decía *"(retirado el AAAA-MM-DD)"*
después de enumerar varios motivos retirados en fechas distintas. Ahora dice *"(último retiro
el …)"*, que es lo que la fecha guardada significa. Guardar una fecha por motivo queda sin hacer, y
se declara: para lo que el registro tiene que probar —que la fila tuvo antecedentes y cuándo fue el
último retiro— alcanza con esto.

**Lo que el registro deja de contar, medido.** Dos pérdidas de detalle, las dos por diseño:

- Pasados cinco retiros, los valores más viejos dejan de constar y sólo se cuentan. Con 21
  retiros, los primeros 17 figuran como *"17 retiros anteriores"*. Es la decisión frente a reabrir
  R-1, y el registro deja de ser la lista completa de lo que la fila tuvo.
- En parcialidades el motivo lleva la cantidad, y la que queda registrada es la del paso anterior
  al retiro, no la mayor que la fila tuvo: 3 → 1 → 0 registra *"1 parcialidad(es) con datos"*. Es
  el costo de no registrar un retiro en cada cambio de cantidad.

Las dos están medidas en prueba, con el importe intacto (647.533,99), igual que el caso de un
registro reducido a sólo el contador —sigue protegiendo y se rotula bien, y el contador no se
confunde con un antecedente vivo— y el adversario de un número de factura que imita el texto del
contador, que no infla el conteo.

**Y los dos últimos textos.** El aviso desglosa ahora *"(M por antecedentes ya retirados)"* también
en la rama "algunas temporadas llevan el reajuste", que es la más frecuente y antes informaba
menos que la otra. Y el tooltip del `+N%/año` en el listado de contratos, que describía el criterio
sin la protección conservada, ya la nombra.

**Contrapruebas de estas tres**, cada una restaurada con parche inverso explícito y la suite verde
después: quitar el tope (caen 3), comparar por valor en vez de por clase (2), y que el aviso vuelva
a atribuir factura (1) → **6** en total. Una versión anterior de esta acta declaró 5, que era el
resultado de revertirlas juntas; queda corregido, y así se reproduce.


**Lo que no se amplió, por instrucción expresa:** cohortes y fecha de término. Sus efectos quedan
documentados como límites del cálculo, con cifra, en la sección anterior.


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

## 4 · Secuencia de publicación y certificación

Ninguno de estos pasos está autorizado todavía. El orden no es una preferencia: sin un deployment
de recuperación compatible y **certificado**, volver atrás desde el candidato dejaría al motor sin
saber leer las activaciones que existan, y eso es pérdida económica silenciosa.

La secuencia son **dos publicaciones**, no una, y la segunda se construye **sobre la primera**,
porque el primer merge cambia `main`.

| | Paso 1 · recuperación compatible | Paso 2 · candidato |
|---|---|---|
| **Identificador** | el de la solicitud de autorización del paso 1 | el de la solicitud del paso 2 |
| **Rama** | `osiris/recuperacion-compatible` | `osiris/publicacion-paso2` |
| **Base** | `c9c579206bcb613bdc5aad61d01480ee01f5760a` (`origin/main`) | el resultado del paso 1 |
| **Forma del merge** | fast-forward: el resultado de `main` **es** ese SHA | un commit sobre ese `main` |
| **Diff** | 15 archivos, +8.047 / −37 | **una línea de producto** (la bandera) + el gateo de un bloque de prueba |
| **Qué habilita** | nada nuevo: el motor sabe leer activaciones selladas, pero no se puede crear ninguna | se pueden crear activaciones |
| **Volver atrás** | redeploy del deployment productivo anterior | redeploy del deployment del paso 1, ya certificado |

Los identificadores exactos van en la solicitud de autorización y no en esta tabla, a propósito:
escribirlos acá cambiaría el commit que los contiene. Lo que esta acta fija son las ramas, las
bases y la forma de cada merge.

El paso 2 es de una línea **porque** el paso 1 ya publicó todo lo demás. El código de producto del
paso 2 es byte a byte idéntico al del paso 1 salvo esa línea, y al del candidato que se revisó de
forma independiente: los mismos blobs de `OsirisModule.jsx`, `reajusteAplicado.js` y
`condicionesConfigurables.js`. Por eso la evidencia del candidato revisado vale para el paso 2 sin
repetirla.

### Certificación del paso 1, antes de habilitar el paso 2

**Con casos sintéticos aislados y lectura de producción. Ningún contrato real se activa para
probar.**

1. **El SHA servido.** El marcador de build de la cabecera de Finanzas y el deployment de
   Production tienen que coincidir con el identificador autorizado del paso 1.
2. **Lectura de producción.** Los importes de los contratos reales, iguales a la medición
   registrada en la sección 5: 23 contratos, 57 filas de royalty comercial, delta cero. Es una
   consulta, no una escritura.
3. **En el entorno aislado, sobre contratos sintéticos.** Que la creación de activaciones queda
   rechazada dentro de la acción, y que el motor calcula igual que el candidato una activación
   **ya sellada**. Lo segundo exige un paso de preparación de datos: con la bandera en `false` la
   aplicación no puede producir una activación, así que se siembra en el entorno aislado un
   contrato sintético con su `reajusteActivacion` y su `sello` ya armados, igual que hacen las
   pruebas del motor. Sin esa siembra, esta comprobación no es ejecutable.

Las tres pruebas de compatibilidad de `versionRecuperacion.test.js` —importes idénticos,
activación conservada, ida y vuelta sin pérdida— corren en **las dos** versiones, así que siguen
midiendo después del paso 2. Sólo el cuarto bloque, el que mide que la recuperación no deja crear,
queda sensible a la versión.

### Las activaciones reales no son parte de esta publicación

Quedan fuera y necesitan su propia autorización, contrato por contrato, con vista previa fila por
fila y confirmación de la diferencia medida contra el importe actual.

**Y desactivar no es volver atrás.** Son dos cosas distintas y conviene no mezclarlas: volver atrás
es redesplegar un deployment anterior, que no toca los datos; **desactivar es una operación
económica** sobre un contrato, que cambia sus importes, pide motivo y confirmación, y deja
historial. Una no sustituye a la otra.

**Condición pendiente antes de poner en uso las activaciones reales.** La fila `osiris` de
`calendario_data` tiene un escritor antiguo: `src/App.jsx` la reescribe **completa** en el camino
de migración de `main.osirisData`, con `resolution=merge-duplicates` y sin lock optimista, en cada
carga en que `main` traiga `osirisData`. Es preexistente —idéntico en la base, en `origin/main` y
en el candidato, y ninguno de los commits de los otros carriles lo toca— y hoy está dormido:
`main.osirisData` **no existe** en producción, comprobado por lectura, y la migración limpia esa
clave después de copiarla. Pero si volviera a existir —por una sesión vieja, o por una restauración
de respaldo— sobrescribiría las activaciones con lo que hubiera ahí, sin versión ni confirmación.
Queda registrado como condición: antes de la primera activación real se comprueba por lectura que
`main.osirisData` sigue sin existir, y si existe se resuelve antes.

### Lo que hay que mirar al desplegar, y no es de Osiris

`origin/main` avanzó **98 commits** desde la base en que se construyó este paquete, todos de otros
carriles: Finanzas, Nóminas, Créditos, Saldos y Tareas. El paquete se integró sobre esa base y el
solape de archivos es **cero** —ninguno de los 13 archivos que toca Osiris fue tocado por esos 98
commits, y el merge no tuvo conflictos—. Los 98 **ya están desplegados**: Production sirve
`c9c5792`, que los contiene a todos.

Tres cosas más que tocan a otros carriles:

- **`CLAUDE.md` es el único archivo compartido que este paquete modifica** (la regla 10 de revisión
  independiente, y la corrección de la línea que decía "sin tests activos"). Otros carriles también
  escriben ahí; la regla se agregó al final de la lista, sin tocar las nueve anteriores, para que un
  merge paralelo no choque.
- **El deployment de producción sale de `origin/main`, pero no es el único deployment.** Empujar una
  rama que monta `App.jsx` crea un Preview que es la aplicación **en vivo contra producción**: si se
  quiere un deployment de prueba sin exponerlo, hay que crearlo con el paso de build ignorado y
  desplegar por SHA, no empujando la rama sin más.
- Lo que sigue abierto y es del grupo, no de Osiris, es la clave anónima y el RLS pendiente sobre
  `calendario_data`.

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

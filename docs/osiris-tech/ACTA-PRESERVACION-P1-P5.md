# Acta de entrega · Preservación P1–P5 (Osiris)

Fecha: 2026-09-23. Entrega **local**: sin push, sin merge, sin despliegue y sin cambios en
producción. Producción solo se consultó en lectura.

## 1 · Qué se pidió

Implementar y probar en una rama local y un entorno aislado las cinco correcciones de
preservación acordadas (P1–P5), con estas condiciones del CFO: el editor por fila respeta los
permisos existentes y no marca pagos solo; regenerar sugerencias conserva lo registrado y nada
ambiguo se vuelve obligación sin confirmación; la baja conserva el registro y la pantalla advierte
que su efecto económico sigue pendiente; se prueba con dos sesiones concurrentes; y las pruebas con
escritura se hacen solo en aislamiento.

## 2 · Base y SHA

| | |
|---|---|
| Base revalidada | `origin/main` = `3048c8c` (avanzó desde `94b09367` por dos fast-forward de Frisku) |
| Rama candidata | `osiris/preservacion-p1p5` |
| SHA del candidato | `5561255` |
| Commits | `77e0d85` helpers + pruebas · `7e1c29a` cableado + concurrencia/impacto · `7b5f958` guarda de borrado · `5561255` servidor de revisión |
| Rama de revisión (NO se integra) | `prueba/preservacion-revision` = `a970eac`, un commit que solo cambia el destino a `127.0.0.1:3070` |
| Diff contra la base | 8 archivos, +1.601 / −22 |

## 3 · Qué se entrega

- `src/osiris/preservacion.js` — las cinco reglas como funciones puras, sin React, sin red y sin
  ninguna regla económica.
- Cableado acotado en `src/OsirisModule.jsx` (248 líneas tocadas, ningún otro módulo).
- `src/osiris/preservacion.test.js` (30 pruebas sintéticas), `concurrencia.test.js` (5) e
  `impacto.test.js` (3, solo con copia de datos reales).
- `scripts/osiris/servidor-revision.mjs` — servidor de revisión aislado; no entra al bundle.
- `docs/osiris-tech/REVISION-DOCUMENTAL-5-CONTRATOS.md` — revisión de los cinco contratos.

## 4 · Qué hace cada corrección

| | Antes | Ahora |
|---|---|---|
| P1 | "Sugerir desde despachos" reemplazaba todas las tandas | Fusiona: conserva las existentes, agrega las nuevas y deja en revisión (sin efecto) las dudosas. Una tanda con factura, fecha o estado tampoco se puede borrar |
| P2 | El botón eliminaba la plantación de la lista | "Baja": conserva la fila, pide motivo, guarda historial, permite reactivar y avisa que no suspende el royalty |
| P3 | Las filas de Royalty Planta nacidas de las OC no tenían editor y `rpPagos` no tenía escritor | Tabla propia con factura, fecha y estado por fila, con el mismo permiso del módulo |
| P4 | Una fecha de pago con estado "por cobrar" pasaba inadvertida | Se marca "revisar"; el estado solo cambia por confirmación de una persona y queda con autor y fecha |
| P5 | Una orden sin contrato declarado calzaba con todos los contratos del cliente | Si el cliente tiene más de un contrato, la orden queda pendiente de asignación, visible y con su valor |

## 5 · Pruebas sintéticas (sin datos reales)

38 pruebas propias, todas verdes: 30 de las reglas, 5 de concurrencia y recarga, y 3 de impacto
que se omiten cuando no hay copia de datos. Ninguna depende de un contrato, cliente o cantidad
concreta.

**Suite completa del repositorio**: `Tests: 949 passed, 1 failed, 3 skipped (953)`. La única falla
es `src/__tests__/paramsFrutaAnticipos.test.js`, preexistente y del carril Finanzas/anticipos; el
candidato no toca ese carril (diff vacío en `src/anticipos.js`, `src/FinanzasModule.jsx` y
`src/__tests__/`). Los 3 omitidos son las mediciones de impacto, que necesitan la copia de datos.
La suite de regresión del motor económico de Osiris (`osirisEngine.regression` e `invariants`) pasa.

## 6 · Concurrencia y recarga

Servidor simulado que respeta la condición de versión de PostgREST; cada sesión es una copia
independiente del módulo, con su propia versión cargada.

| Prueba | Resultado |
|---|---|
| B guarda y después A (que cargó antes) intenta guardar | A recibe conflicto, el servidor registra **una sola** escritura y lo de B queda intacto |
| A conserva lo suyo, recarga y lo reaplica sobre lo de B | Ambos cambios conviven; nada se perdió |
| Guardar sin una carga exitosa previa | Bloqueado (`sin_carga`), cero escrituras |
| Dos sesiones que editan filas distintas recargando entre medio | Las dos ediciones sobreviven |
| Ida y vuelta de `rpPagos`, baja de plantación y sugerencias en revisión | Idénticos tras releer |

## 7 · Revisión local en entorno aislado

Base PostgreSQL local desechable `preserva_p1p5` (contenedor `aislado-pg`) sembrada con una **copia
de los datos reales** leída en solo lectura (23 contratos, 71 órdenes, 142 plantaciones), más el
trigger de producción `guard_main_no_user_shrink`. PostgREST local en 3068 y servidor de revisión en
3070. El bundle servido **no contiene ninguna referencia a producción** (0 coincidencias de
`bywovqayuzodbzwsriet`; 11 al destino local).

| Qué se probó | Resultado observado |
|---|---|
| P1 · Sugerir desde despachos (Agroextiende) | "Se conservan 8 tandas ya registradas (8 con factura, fecha de pago o estado). Se agregan 4 nuevas. 2 quedan EN REVISIÓN". Las 9 facturas de la pantalla, iguales antes y después |
| P1 · Aceptar / descartar una sugerencia | Aceptar suma una tanda; descartar la retira; las registradas no se tocan |
| P1 · Borrar una tanda con factura | Rechazado con aviso; 8 tandas antes y 8 después |
| P2 · Baja (Giddings) | Pide motivo con el aviso, conserva la fila, ofrece reactivar, y los totales no se mueven: 2.870 plantas y US$2.870 antes y después |
| P3 · Filas derivadas de OC (Cerro Prieto) | 11 filas con editor propio; escribir factura y fecha **no** cambió el estado |
| P4 · Confirmación | Tras confirmar, la fila queda "Pagado", desaparece la marca "revisar" y muestra "confirmó Revisor Sintetico" |
| Persistencia tras recarga | Releído desde la base: `rpPagos` con autor y fecha, y la baja con motivo y usuario |
| P5 · Segundo contrato del mismo cliente | Las 11 órdenes pasan a "pendientes de asignación" con sus plantas y su valor; no se atribuyen a ninguno de los dos |
| Permisos (usuario de solo lectura) | Sin botones de Baja, Reactivar, Agregar plantación, "+ Tanda" ni "Sugerir"; los 10 campos de la tabla, deshabilitados |

## 8 · Impacto medido antes / después

Sobre copia de los datos reales de hoy (23 contratos, 71 órdenes):

| | Antes | Después |
|---|---|---|
| Atribuciones de órdenes | 71 | 71 |
| Órdenes pendientes | — | 0 |
| Órdenes atribuidas a dos o más contratos | 0 | 0 |
| Plantaciones / plantas | 142 / 5.524.192 | 142 / 5.524.192 |

**Ningún importe cambia con los datos de hoy.** El defecto de doble atribución es latente.

Con el segundo contrato creado en el entorno aislado (24 contratos), la diferencia aparece y se
mide: antes 82 atribuciones (11 órdenes contadas dos veces, **15.440 plantas duplicadas**), ahora 60
atribuidas y 11 pendientes. Es el impacto que tendría la corrección el día que exista un segundo
contrato de un cliente.

En P1 la conservación sí cambia el resultado hoy: el botón anterior habría reemplazado **23 tandas**
(28 filas del conjunto tienen número de factura), y ahora se conservan todas, se agregan 20 nuevas y
3 quedan en revisión.

## 9 · Un defecto que encontró la propia revisión

La primera versión del cableado permitía borrar una tanda con factura sin ningún aviso: el cambio se
había perdido antes del commit. Lo detectó la prueba en el navegador, no la suite. Corregido en
`7b5f958`, reconstruido y vuelto a verificar.

## 10 · Lo que no se tocó

Reglas económicas, importes, contratos, retenciones, país de ningún cliente, el cupo de plantas de
Agroberries, la inflación y el mes de facturación. Ningún dato productivo. Las dudas documentales
siguen abiertas y registradas en `REVISION-DOCUMENTAL-5-CONTRATOS.md`.

**Pendiente de conciliación**: cualquier importe de Agroberries afectado por el cupo de 30.000
plantas sin royalty queda identificado como pendiente, no como validado. Dejar el cálculo actual
intacto no equivale a haberlo validado.

## 11 · Estado y qué falta

El candidato está listo para que lo revises. No se integra ni se despliega sin tu autorización
expresa. Quedan fuera, por decisión tuya: el reajuste de Dole (asunto independiente del anexo de
Huarmey), el anexo de extensión de Huarmey, y las cinco dudas documentales abiertas.

---

# Cierre de las tres comprobaciones pedidas (2026-09-23, tarde)

## A · Concurrencia con dos sesiones reales del navegador

Dos pestañas contra el mismo PostgREST aislado, ambas con el contrato Agroextiende abierto y la
misma versión cargada. Sesión A cambia el N° de factura de la primera tanda; sesión B, el de la
segunda.

| Momento | Qué pasó |
|---|---|
| A guarda (autoguardado) | `PATCH …updated_at=eq.14:54:40` → escribe. Indicador "Guardado" |
| B guarda (autoguardado) | `PATCH` con la **misma versión vieja** → PostgREST no encuentra fila, no escribe. Indicador **"NO se guardó · conflicto"** y aviso: *"Otra persona guardó cambios en Osiris después de que abriste esta pantalla. Para no borrar su trabajo, lo tuyo NO se guardó…"* |
| B conserva lo pendiente | `B-CONC` sigue en pantalla; B todavía ve el valor viejo de la fila de A, porque no recargó |
| B, segundo intento (edita otra fila y pulsa "Guardar ahora") | Tampoco escribe; el aviso sigue visible y ambos cambios pendientes (`B-CONC`, `B-SEGUNDO`) siguen en pantalla |
| Estado real en la base | `A-CONC` presente; `B-CONC` y `B-SEGUNDO` **ausentes** |

Las únicas escrituras que acompañan a cada intento son a la fila `audit_log`, no a `osiris`.
La recuperación (B recarga, ve lo de A y reaplica lo suyo) está cubierta por la prueba automatizada
de concurrencia; no se repitió a mano.

## B · Sugerencias sin duplicación

| Requisito | Resultado observado |
|---|---|
| Nada se incorpora sin confirmación | Cancelar el diálogo deja todo igual: 12 tandas y 2 en revisión antes y después. Las sugerencias nuevas se agregan solo al aceptar un diálogo que dice cuántas son |
| Las ambiguas quedan separadas y no computables | El total en pantalla, 1.275.150 plantas, es exactamente la suma de las cuotas activas; las 100.000 plantas en revisión no entran |
| Repetir no duplica | Tres pulsaciones seguidas: cuotas 8 → 12 → 12 → 12; en revisión 2 → 2 → 2. Desde la segunda, el aviso dice "0 nuevas · 2 ya estaban esperando revisión y no se repiten" |
| Facturas, pagos y estados intactos | 9 facturas en pantalla antes y después de las tres pasadas |

Esto exigió una corrección: antes la lista de revisión se anexaba sin comparar y la misma sugerencia
ambigua se apilaba en cada pulsación. Corregido en `9470856`, con tres pruebas nuevas (33 en el
archivo de reglas).

**Matiz para tu decisión**: una sugerencia **sin parecido** con ninguna cuota pasa a ser cuota activa
al aceptar el diálogo, que declara cuántas se agregan. Las **ambiguas** nunca se activan salvo que se
pulse "Agregar como tanda" en cada una. Si prefieres confirmación una por una también para las
nuevas, es un cambio pequeño, pero hoy no está así.

## C · Vuelta al código anterior conservando los datos

Se construyó el código anterior (`3048c8c`, con el destino apuntado al mismo entorno aislado) y se
sirvió contra **la misma base**, que contenía los tres campos nuevos: baja de plantación con
historial, `rpPagos` con autor y fecha, y sugerencias en revisión.

| Comprobación con la versión anterior | Resultado |
|---|---|
| Abre los contratos y las plantaciones con campos nuevos | Sin errores; misma lista, mismos totales (2.870 plantas, US$2.870) |
| Guarda una edición propia | "Guardado", y su cambio queda en la base |
| ¿Se pierden los campos nuevos al guardar? | **No.** Tras el guardado siguen presentes la baja con su historial, `rpPagos` con `confirmadoPor`, y las sugerencias en revisión |

Es decir: volver atrás **no destruye** lo que haya creado esta versión. Lo que sí se pierde al volver
es el **comportamiento**: reaparece el botón que borra la plantación de verdad, "Sugerir desde
despachos" vuelve a reemplazar las tandas, desaparecen la marca "revisar" y el editor de las filas
derivadas de OC (sus datos quedan en la base, pero sin pantalla donde verlos), y las órdenes ambiguas
vuelven a atribuirse a todos los contratos del cliente.

Procedimiento de vuelta: desplegar el commit anterior (`3048c8c`) desde el panel de Vercel. No hay
migración que revertir ni dato que borrar.

---

# Corrección del desplegable de estado (rama aparte, sin publicar)

| | |
|---|---|
| Rama | `osiris/fix-desplegable-estado` |
| SHA | `594c033` |
| Base | `origin/main` = `74a5d34` (lo publicado hoy) |
| Diff | 3 archivos: `src/OsirisModule.jsx` (componente `BadgeEstadoCF`), `src/osiris/menuEstado.js` y su archivo de pruebas |
| Estado | **local, sin push ni despliegue** |

## El defecto

`.osiris-root td, .osiris-root th { overflow: hidden }` en `index.css` recorta el menú, que se
dibujaba dentro de la celda. Medido en el navegador aislado: el código anterior `3048c8c` ocultaba
**205 px de 208**; lo publicado hoy, 193 de 208. Es anterior a la entrega de hoy; lo que cambió es
que la marca "revisar" lleva a usar ese menú.

## La corrección

El menú se posiciona respecto de la ventana (`position:fixed`), con la geometría en una función pura
(`src/osiris/menuEstado.js`): se abre hacia arriba si no cabe abajo, se recorta contra los cuatro
bordes, se vuelve desplazable en ventanas muy bajas, sigue al botón al desplazar y se cierra si su
fila deja de estar a la vista. No toca la regla global de `index.css` ni ninguna regla económica.

Dos defectos de la propia corrección salieron en la revisión y están arreglados: el borde inferior
podía quedar fuera de la ventana, y el menú se quedaba flotando cuando su fila se iba de la pantalla.

## Pruebas

10 de geometría, sintéticas. Suite completa: **962 aprobadas, 1 falla, 3 omitidas** — la falla sigue
siendo `paramsFrutaAnticipos`, preexistente y del carril Finanzas/anticipos. Build `CI=true` en verde.

## Revisión en el navegador aislado

| Comprobación | Resultado |
|---|---|
| Menú completo y utilizable | Las 6 opciones visibles, 212 px, enteramente dentro de la ventana; el punto central del menú responde al clic |
| Cerca del borde de pantalla | Con ventana de 1024×420, las 5 filas abren bien: las tres de arriba hacia abajo, las dos últimas hacia arriba. Ninguna se sale |
| Al desplazar la tabla | El menú sigue al botón; cuando la fila sale de la pantalla, el menú se cierra |
| Abrir o cerrar no modifica datos | Valores de las 6 filas idénticos antes y después de abrir y de cerrar |
| Seleccionar cambia solo su fila | Se marcó "Pagado" en una tanda **sintética** creada para la prueba ("PRUEBA SINTETICA — no es un cobro real", 10 plantas). Las cinco filas con datos quedaron idénticas, campo por campo |
| Persiste tras recargar | Tras F5, la sintética sigue "Pagado" y las cinco conservan factura (36, 36, 36, 36, 86), fechas de pago y plantas |
| Usuario de solo lectura | 0 badges clicables, el menú no abre, sin "+ Tanda", sin "Sugerir", sin borrar, los campos deshabilitados |
| Contract Fee | Sigue funcionando: abre las 6 opciones, entero en pantalla, cierra al hacer clic fuera y no cambia el estado al abrir |

Detalle observado: la fila sintética quedó "Pagado" sin factura ni fecha y el sistema la marcó
**revisar**. Es la otra mitad de P4 funcionando: marcar pagado sin respaldo también se señala.

**Limitación de la prueba**: en este entorno automatizado un desplazamiento hecho por programa no
emite el evento `scroll` del navegador, así que el seguimiento y el cierre se comprobaron emitiendo
ese mismo evento. Con la rueda del ratón, en un navegador normal, el evento lo emite el propio
navegador. Conviene que el CFO lo confirme con un scroll real cuando pruebe.

---

# Pedidos de Nicolás · anexo de eliminación, tipo Pruebas y asignación de órdenes

| | |
|---|---|
| Rama | `osiris/nicolas-anexos-pruebas` |
| Base | `origin/main` = `583ec9f` |
| Estado | **local, sin push ni despliegue** |
| Archivos | `src/OsirisModule.jsx`, `src/osiris/anexosPlantas.js` + pruebas, `src/osiris/impactoNicolas.test.js`, dos documentos |

## Qué hace, y qué no

| Pedido | Qué hace | Qué NO hace |
|---|---|---|
| Anexo de eliminación de plantas | Tipo nuevo en el catálogo, agregado desde el código sin tocar los datos guardados. El anexo lleva documento, fecha de efecto, plantas declaradas, observación y las plantaciones afectadas marcadas una por una, con historial de vínculos. En Plantaciones se avisa cuántas bajas siguen sin anexo | No cambia ningún royalty. No suspende ningún cálculo |
| Tipo de contrato "Pruebas" | Se puede elegir, y la ficha avisa que sus condiciones económicas **no están confirmadas** | No aplica exenciones, no cambia ningún cálculo, no convierte ningún contrato existente |
| Contratos comerciales y de pruebas separados | Desde el panel de pendientes se asigna una orden a un contrato, con confirmación y registro de quién la asignó | No reasigna nada solo. La orden conserva despachos, facturas y cuotas |

Además, preservación: un anexo con documento o con plantaciones vinculadas ya no se borra, se
**retira** y conserva su documento y su historial.

## Pruebas

- 21 de las reglas nuevas, sintéticas.
- 3 de concurrencia y recarga: dos sesiones, una registra el anexo y la otra asigna la orden; la
  segunda recibe conflicto y no pisa a la primera; tras recargar, ambas cosas conviven; los campos
  nuevos sobreviven al viaje de ida y vuelta.
- Suite completa: **986 aprobadas, 1 falla, 9 omitidas**. La falla sigue siendo
  `paramsFrutaAnticipos`, preexistente, del carril Finanzas/anticipos. Las 9 omitidas son las dos
  tandas de medición de impacto, que corren aparte con una copia de datos.
- Build `CI=true` en verde.

## Impacto antes / después, sobre copia de los datos reales

| Escenario | Royalty planta | Royalty comercial | Filas RP |
|---|---|---|---|
| Línea base | 5.751.215 | 13.504.590 | 53 |
| Marcando **todos** los contratos como "Pruebas" | 5.751.215 | 13.504.590 | 53 |
| Con un anexo de eliminación en los 13 contratos con plantaciones | 5.751.215 | 13.504.590 | 53 |
| Asignando explícitamente las 25 órdenes sin contrato declarado | 5.751.215 | 13.504.590 | 53 |

**Ninguno de los tres mueve un importe.** Limitación de la medición: el contract fee sale en 0 en
este arnés, así que esa línea no prueba nada sobre el fee; los tres cambios tampoco tocan su lógica.

Estado actual de los datos: 0 contratos con anexo de eliminación, 0 bajas documentadas.

## Revisión en el entorno aislado

| Comprobación | Resultado |
|---|---|
| Tipo "Pruebas" en el selector | Aparece junto a Licencia, Exclusiva y No Exclusiva. Al elegirlo sale el aviso de condiciones no confirmadas |
| Tipo de anexo nuevo | "Eliminación de plantas" aparece al final del catálogo guardado, sin desplazar los 8 anteriores |
| Campos del anexo | Fecha de efecto, plantas declaradas, observación y las plantaciones con casilla; el contador pasó de "0 de 2" a "2 de 2" |
| Aviso del anexo | "No cambia el royalty: el efecto económico está pendiente de definición contractual" |
| Totales tras registrar el anexo | 2.870 plantas y US$2.870, idénticos |
| Aviso de documentación | Pasó a "todas las bajas tienen un anexo de eliminación vinculado (1 anexo, 2.870 plantas declaradas)" |
| Asignación de una orden | Con dos contratos del mismo cliente, el panel mostró 11 pendientes y un selector por fila con los dos contratos (uno "· Licencia", otro "· Pruebas"). Al asignar una, quedaron 10 |
| Persistencia | Leído de la base: la orden quedó con su contrato, 1 entrada de historial y sus 500 plantas; el anexo con documento, 2 plantaciones y 2 entradas de historial; el tipo "Pruebas" guardado |

## Coordinación

Allegria Service confirmó que su rama de integración **no toca** `OsirisModule.jsx` ni `src/osiris/*`
(toca App.jsx, api/pin-login.js, supabase/ y src/proc/). Frisku y Mediterra One siguen en local. Main
permanece en `583ec9f`: este paquete no está autorizado a publicar.

## Revisión visual del candidato (entorno aislado, 2026-09-23)

Sobre la copia real aislada, con el usuario de prueba. **Los importes que aparecen son resultados
calculados por el motor, no facturas emitidas ni cobros confirmados.**

### 1 · Registrar el anexo y vincular plantaciones
Tipo "Eliminación de plantas" al final del catálogo guardado, sin desplazar los 8 anteriores. Se
cargó documento, fecha de efecto 15-01-2026, 2.870 plantas declaradas y observación, y se marcaron
las dos plantaciones: el contador pasó de "0 de 2" a "2 de 2". El indicador quedó en *"todas las
bajas tienen un anexo de eliminación activo y con documento (1 de 1 anexo, 2.870 plantas
declaradas)"*. El resultado calculado no se movió: 2.870 plantas × US$1 = US$2.870.

### 2 · Retirar el anexo
El botón de eliminar detectó que el anexo tiene documento y plantaciones vinculadas y pidió motivo:
*"No se elimina: queda retirado, conservando el documento y el historial"*. Leído de la base: el
anexo sigue ahí con `activo=false`, `estadoRegistro=retirado`, documento conservado, sus 2
plantaciones, 3 entradas de historial (`vinculo → vinculo → retiro (cargado por error en la
revisión)`) y la fecha de efecto.

El indicador cambió a *"1 baja(s) sin respaldo. Hay 1 anexo(s) retirado(s), que no respaldan"*. Los
resultados calculados no se movieron.

**Criterio ajustado en esta revisión**: una baja se da por respaldada solo con un anexo **activo y
con documento**. Un vínculo por sí solo no alcanza, y la pantalla lo dice aparte ("vinculadas a un
anexo sin documento adjunto"). Tres pruebas nuevas cubren los tres estados.

### 3 · Contrato de pruebas y asignación de una orden
Se creó un segundo contrato para Agrícola Cerro Prieto S.A. con tipo **Pruebas**. El panel mostró
11 órdenes pendientes de asignación, cada una con un selector que ofrece los dos contratos del
cliente ("· Licencia" y "· Pruebas"). Al asignar la primera quedaron 10. En la base: la orden con su
contrato, 1 entrada de historial y sus 500 plantas; las otras 10 sin tocar.

### Permisos
Con el usuario de solo lectura: ve el anexo y el panel de pendientes, y tiene **0 campos
habilitados, 0 selectores de asignación**, sin "Agregar anexo" ni "Eliminar".

### Recuperación con el código anterior
Se sirvió el código anterior (`3048c8c`) contra la misma base con todos los campos nuevos. Guardó su
propia edición y **no perdió nada**: el anexo retirado con documento, vínculos e historial; el tipo
"Pruebas"; la orden asignada con su historial; los 24 contratos.

### Observación menor
Un anexo creado desde el botón "+ Agregar anexo" no registra el evento inicial de alta en su
historial (sí quedan los vínculos y el retiro). No afecta a la preservación; se puede completar en
una pasada futura.

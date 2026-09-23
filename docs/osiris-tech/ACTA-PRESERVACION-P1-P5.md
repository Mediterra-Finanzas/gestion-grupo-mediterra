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

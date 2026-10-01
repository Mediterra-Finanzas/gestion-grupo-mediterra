# Entrega · Registro de condiciones del contrato

Guarda lo que cada contrato pactó y nombra lo que falta. **No aplica ningún efecto económico**:
ninguna tasa, ningún beneficio, ningún reajuste. Ningún importe cambia.

- **Rama:** `osiris/registro-condiciones`
- **Candidato:** la punta de la rama `osiris/registro-condiciones` (el SHA va en el mensaje al pedir la ventana; esta acta no se cita a sí misma)
- **Código de aplicación:** `cf5d2b4a17467a5f40d75b807d9440805bff3d81` — lo que vino después son
  el acta y una prueba de impacto; `src/OsirisModule.jsx` y `src/osiris/condicionesConfigurables.js`
  no cambiaron desde ahí
- **Base:** `8a1605502a3880451333d3aaa244e519c7ddc3ed`
- **Diff:** 9 archivos, 1.594 inserciones, 1 supresión. `condicionesConfigurables.js`
  (nuevo, +367), `OsirisModule.jsx` (+164, −1), cinco de prueba, y dos actas
  (esta y el registro de ventanas, que se incorporó acá)

---

## 1 · Qué podrá hacer el usuario

En la ficha del contrato, pestaña Facturación:

**Beneficio del contract fee**
- Declarar si el fee cubre royalty por planta, cuántas plantas y con qué cláusula.
- Declarar si el cupo es **solo de este contrato o compartido**, y con cuáles.
- Declarar el **consumo previo**, o marcar que **no se conoce**.
- Ver el saldo del cupo cuando hay datos para calcularlo, y **pendiente** cuando no los hay.

**Reajuste del royalty comercial**
- Declarar el tipo: sin reajuste, porcentaje o índice.
- Si es porcentaje: el valor. Si es índice: cuál, de qué fuente y con qué fecha base.
- Desde cuándo rige y la cláusula que lo respalda.
- Ver una **simulación** de cómo evolucionaría el valor, cuando están todos los parámetros.

**Territorio contractual**
- Campo propio, separado del país del cliente. Si no está declarado se muestra pendiente y
  **nunca se copia del país**.

**Lista de antecedentes faltantes**
- Cada bloque muestra su estado —no declarado, pendiente, confirmado— y **la lista exacta de lo
  que le falta**. Hoy esa lista no existe en ninguna parte.

## 2 · Las cuatro cosas que quedan explícitas en pantalla

Encabezando el bloque, antes de cualquier campo:

> **Esto es un registro de antecedentes. No aplica nada.**
> · **"Sin declarar" no significa "no existe"**: significa que nadie lo cargó todavía.
> · **Un consumo desconocido no es cero.** Si no se sabe cuánto se consumió, se marca desconocido
>   y el saldo queda pendiente.
> · **Registrar o confirmar un antecedente no habilita su aplicación** ni constituye validación
>   tributaria.
> · **La simulación no modifica ningún valor** y solo calcula cuando tiene todos los parámetros:
>   no inventa índices, fechas ni periodicidades.

Cada bloque lleva además el rótulo de los tres verbos: *Guarda configuración · no aplica al
cálculo real*.

## 3 · Qué NO entra en este paquete

| | |
|---|---|
| **Reino Unido** | No se agrega al campo de país. La lista queda exactamente como está |
| **El país de Agroberries** | No se toca |
| **Redefinir el campo "país"** | No se redefine como territorio. Conserva su funcionamiento y su dependencia actual con el cálculo, hasta resolver su significado por separado |
| **Aplicar el beneficio o el reajuste** | No hay interruptor, igual que hoy |
| **Validar una tasa** | Sigue bloqueado por la compuerta publicada |

## 4 · Consolidación: una sola fuente para la retención

`condicionesConfigurables.js` traía su propia `resolverRetencion` con una tabla de países, de
cuando la retención todavía se deducía del país. Ahora **delega en el modelo publicado**
(`retencion.js`), igual que el resto de la aplicación.

**Comprobado que la tasa no cambia.** `consolidacionRetencion.test.js` compara contra un oráculo
que reproduce la implementación anterior, para los nueve países posibles:

| | |
|---|---|
| La tasa resuelta coincide con la del modelo publicado | sí, para los 9 |
| Y coincide con la que daba la implementación anterior | sí, para los 9 |
| Chile 0 %, el resto 15 % | sí |
| Ya no hay una segunda tabla de países que decida tasas | `PAISES_CON_TRATAMIENTO` queda como referencia documental |

**Lo que la consolidación sí corrige, y hay que decirlo:** la versión anterior daba por
*definitivo* cualquier país con tratamiento conocido. El modelo publicado distingue "lo que el
motor aplica" de "lo que está validado", y manda ese. **La tasa es la misma**; lo que cambia es
que un 15 % sin respaldo ya no se llama definitivo.

**Un hallazgo del camino:** el campo `retencionPct` —del diseño anterior— no lo escribe ninguna
pantalla, no lo lee nada después de consolidar, y **no existe en ningún contrato de producción**
(0 de 23, leído en solo lectura). Se conserva si estuviera cargado, pero no decide ninguna tasa.

## 5 · Pruebas

`registroCondiciones.test.js`, **25 pruebas** en los cuatro ejes pedidos:

| Eje | Qué fija |
|---|---|
| **"Sin declarar" ≠ "no existe"** | El cupo sin declarar es `null`, nunca 0; "no declarado" y "sin reajuste" son estados distintos; el territorio sin declarar no se copia del país |
| **Desconocido ≠ cero** | Sin consumo previo declarado, el disponible es `null` y no el cupo entero; declarar cero **sí** es declarar; en un cupo compartido, si a un contrato del grupo le falta el historial, el consumo y el disponible quedan **indeterminados** (ni 0 ni el cupo íntegro) |
| **Registrar no habilita** | Con todo confirmado y sin faltantes, la retención **sigue sin validar** y el neto sigue no definitivo |
| **La simulación no inventa** | Sin porcentaje no calcula y dice por qué; por índice no proyecta y pide la serie publicada; con todo, calcula y no toca el contrato ni el valor base |
| **Preservación** | Factura, pago, plantaciones y la propuesta de retención quedan intactas; un contrato sin los campos nuevos se lee sin romperse |
| **Permisos** | Las funciones del modelo son de lectura y no mutan el contrato; el modelo no expone ninguna función que escriba; **y las dos funciones de la pantalla que escriben el registro comprueban el permiso**, con una prueba que además exige que ningún control del bloque llame a `upd` directo |
| **Concurrencia** | Dos campos del mismo bloque conviven; escribir el reajuste no toca el beneficio; la fusión por campo conserva lo que escribió la otra edición; escribir el registro no pisa una propuesta de retención |
| **Impacto económico** | La tasa y el factor del motor son **idénticos** con y sin registro; declarar un beneficio no cambia el valor por planta ni por hectárea; confirmar el reajuste no modifica el valor base |

Más `consolidacionRetencion.test.js` (7), `condicionesConfigurables` (25), `acoplamiento`,
`retencion` (80) y la regresión del motor de la Fase 0 (23).

**Corrección.** Una versión anterior de esta acta listó `impactoCondiciones` entre las suites
“verdes”. No lo estaba: es una de las cuatro suites que **solo corren con una copia de datos
reales** (`OSIRIS_SNAPSHOT`) y en la corrida normal aparecen como saltadas. Ver §5 ter.

**Suite completa sobre el candidato: 1.349 pasan, 24 saltadas, 1 falla** (`paramsFrutaAnticipos`,
atada a la fecha del carril de anticipos, que falla igual en la base sin este cambio). Build `CI=true` del commit exacto `cf5d2b4`:
`Compiled successfully`.

## 5 bis · Lo que encontró la revisión en navegador aislado

La comprobación en aislamiento con el usuario de solo lectura encontró **un defecto del propio
paquete**, que quedó corregido en `cf5d2b4` antes de pedir autorización.

**Qué pasaba.** El resto de la ficha usa el componente `<Cell>`, que cuando el permiso es "ver"
**no renderiza ningún input**: muestra texto. El bloque nuevo, en cambio, renderizaba los
controles con `disabled={!can}` y el `onChange` conectado. Un `disabled` frena al usuario, pero
no al evento: un evento sintético alcanzaba el handler, cambiaba el estado y el auto-guardado lo
escribía. Lo reproduje con el usuario `OT Ver`: el cupo pasó de 30.000 a 999 en la base aislada.

**Qué se corrigió.** La comprobación del permiso pasa a la función que escribe (`upB`/`upR`), no
al control. Dos pruebas de regresión: que la guarda existe, y que ningún control del bloque
escribe por fuera de esas dos funciones.

**Alcance honesto de esto.** No era explotable por la vía normal de la pantalla —el control está
deshabilitado— y no afecta a ningún campo preexistente, que siguen protegidos por `<Cell>`. Pero
era más débil que el patrón de la ficha, y el paquete no debía publicarse así. **Esto no cierra
ni toca el P0 conocido**: la base sigue aceptando escrituras de cualquiera que tenga la anon key,
y eso se resuelve en el carril de seguridad, no acá.


## 5 ter · Las 24 pruebas saltadas: cuáles son y cuáles corresponden a este paquete

Las 24 son exactamente las de las cuatro suites de impacto, que no corren sin una copia de datos
reales (`OSIRIS_SNAPSHOT`). No son pruebas rotas ni deshabilitadas: son las que miden el efecto
sobre la cartera real.

| Suite | Pruebas | ¿Es el impacto de ESTE paquete? | Estado |
|---|---|---|---|
| `impactoCondiciones.test.js` | 6 | **Sí** — beneficio del fee, reajuste y territorio | **Ejecutada contra la copia real: 6/6 verdes** |
| `impactoRetencion.test.js` | 9 | No — mide el paquete de retención ya publicado (`2a3af93`) | Evidencia vigente. `retencion.js` **no está en el diff** de este candidato, así que la medición anterior sigue valiendo. No se repite |
| `impactoNicolas.test.js` | 6 | No — carril de labores, sin publicar | Fuera de alcance |
| `impacto.test.js` | 3 | No — carril de preservación P1–P5 | Fuera de alcance |

### Lo que encontró ejecutar las 6

Una de ellas **falló la primera vez**, y vale decir por qué: afirmaba que al cambiar un contrato
a Reino Unido la retención quedaba `pendiente` con `pct: null`. Eso era el diseño **anterior** de
`resolverRetencion`, con su tabla de países propia. Al consolidar contra el modelo publicado
(§4) la semántica cambió, y la nueva es la correcta: devolver `null` diría “pendiente” mientras
el motor cobra 15 %. Ahora dice **el número que se aplica y que no está validado**
(`estado: "heredada"`, `pct: 15`, `validado: false`). Se actualizó la prueba, no el código, y el
comentario deja escrito el porqué.

Esta prueba estaba desalineada **desde la consolidación** y no se veía porque la suite se salta
sin la copia de datos. Es justamente lo que esta revisión tenía que destapar.

### El impacto medido sobre los 23 contratos reales

| | Hoy | Con beneficio declarado | Con reajuste confirmado | Con territorio |
|---|---|---|---|---|
| Royalty planta facturado | US$ 5.751.215 | 5.751.215 | 5.751.215 | 5.751.215 |
| Royalty planta neto | US$ 4.888.532,75 | 4.888.532,75 | 4.888.532,75 | 4.888.532,75 |
| Royalty comercial facturado | US$ 13.504.590 | 13.504.590 | 13.504.590 | 13.504.590 |
| Royalty comercial neto | US$ 11.478.901,50 | 11.478.901,50 | 11.478.901,50 | 11.478.901,50 |
| Filas | 110 | 110 | 110 | 110 |

**Delta cero en las cuatro columnas.** Y el estado de partida de la cartera: 0 contratos con
beneficio declarado, 0 con retención pendiente, 23 con territorio sin declarar, y 18 con el
reajuste en **pendiente** (marcados sujetos a inflación sin reajuste declarado) contra 5 que no
lo declaran. Esos 18 son un dato para vos, no algo que este paquete resuelva.

## 6 · Recuperación

Volver atrás es revertir el commit. **No se pierde ningún dato**: lo registrado vive en campos
propios del contrato (`beneficioFee`, `reajuste`, `territorio`) que el código anterior no lee pero
tampoco borra, igual que pasó con las propuestas de retención. Lo que vuelve es la falta de
pantalla para verlos y cargarlos.

Ningún importe cambia al volver, porque ninguno cambió al publicar.

## 7 · Evidencia en navegador aislado

Candidato `cf5d2b4` compilado contra el PostgREST aislado (copia de los 23 contratos reales,
nunca producción), servido en `127.0.0.1:3070`. La copia de revisión se arma en un worktree
desechable `--detach` sobre el commit exacto, y se descarta: el worktree del candidato no se
toca (`0 cambios`).

| Comprobación | Resultado |
|---|---|
| **Guardar y recargar** | Declarado cupo 30.000, alcance compartido con Agrícola Huarmey, cláusula, reajuste 2 % desde 2027-01-01 con su cláusula, y territorio "Peru y Ecuador". Guardado, recargada la página: los tres bloques vuelven con sus valores |
| **Cupo compartido sin historial** | En pantalla: *"Entregas registradas hoy: 603.260 plantas (del grupo completo). El consumo y el saldo disponible quedan indeterminados: ni cero ni el cupo íntegro."* Ni 0 ni cupo entero disponible |
| **Solo lectura no escribe** | Con `OT Ver`: 36 controles, los 36 deshabilitados, sin botón Eliminar. Forzando eventos sintéticos sobre el cupo, el checkbox y la cláusula: **nada cambió en el servidor**, `updated_at` intacto. (Antes de `cf5d2b4` esto sí escribía — ver §5 bis) |
| **Sesión desactualizada** | Otra sesión escribe la fila; la sesión abierta edita el cupo a 31.000 y guarda → **"⚠️ NO se guardó · conflicto"**. En el servidor queda 30.000 y la escritura de la otra sesión intacta |
| **Recuperación con la versión anterior** | Servida la base `8a16055` (sin el campo Territorio en pantalla), editada la ciudad y guardada. `territorio`, `beneficioFee` y `reajuste` **sobreviven íntegros**. Al volver al candidato se muestran de nuevo |
| **Los importes no se mueven** | Mismos números con y sin registro, en dos pantallas: hub (*Por cobrar $5.578.534 · 142 pedidos · 53 filas de royalty*) y Reportes/BI (41 importes, idénticos uno a uno: $19.945.805, $17.057.434, $16.940.185, …) |

Los datos de prueba escritos en la copia aislada se restauraron al terminar. **Producción no se
tocó en ningún momento de esta revisión**: ni lectura ni escritura.

## 8 · La ventana de publicación

### Estado verificado al pedirla (solo lectura)

| | |
|---|---|
| Candidato | Punta de `osiris/registro-condiciones`. **Reemplaza a `5323738`**: medir las 6 pruebas de impacto obligó a alinear una de ellas (§5 ter). El código de pantalla y de modelo no cambió |
| Base | `8a1605502a3880451333d3aaa244e519c7ddc3ed`, ancestro directo del candidato (5 commits por delante) |
| `origin/main` ahora | `8a1605502a3880451333d3aaa244e519c7ddc3ed` — **no se movió**: la base sigue siendo el main publicado |
| Producción en vivo | `gestion-grupo-mediterra.vercel.app` sirve `main.933069fe.js`, el mismo bundle que el deployment vigente |
| ¿Producción corresponde a `8a16055`? | Sí, por contenido. El bundle en vivo **tiene** lo ya publicado (“NO OPERATIVA”, “Registrar una tasa”, “sin validar”) y **no tiene** nada de T3 (0 coincidencias de “Esto es un registro de antecedentes”, “Territorio contractual”, “El contract fee cubre royalty”, “indeterminados”) |
| Despliegues en curso | Ninguno. Sin `Building`, `Queued`, `Error` ni `Canceled` pendientes |

Un compilado local de `8a16055` da `main.7123b5d7.js`, distinto del hash en vivo. **Eso no
significa que produccción tenga otro commit**: el hash de CRA depende del entorno de build
(variables, versión de Node, sourcemaps) y Vercel no compila con el mismo. Por eso la
correspondencia se comprueba por contenido, como arriba, y no por el nombre del archivo.

### Deployment de recuperación

Si algo sale mal, se vuelve promoviendo este deployment, que es el que está sirviendo producción
ahora mismo:

| | |
|---|---|
| **ID** | `dpl_5nzrn9EzMdoLKf1rdrRQ6c8ZFdCT` |
| URL | `https://gestion-grupo-mediterra-pn5s5eztk-mediterra-finanzas-projects.vercel.app` |
| Creado | 2026-10-01 14:29 (hora de Chile) |
| Estado | ● Ready · Production |
| Aliases que tiene hoy | `gestion-grupo-mediterra.vercel.app`, `calendario-mediterra-2026.vercel.app`, `gestion-grupo-mediterra-git-main-…` |

Volver atrás no necesita revertir el commit: alcanza con promover ese deployment. El commit se
revierte después, con calma. **Ningún dato se pierde al volver**, porque lo registrado vive en
campos propios del contrato que el código anterior no lee pero tampoco borra, y **ningún importe
cambia**, porque ninguno cambió al publicar.

### Quiénes deben confirmar

Las sesiones activas al preparar este candidato: **Allegria Service**, **Mediterra One** y
**Rendición de gastos**. Acuerdo vigente a declarar: Rendición de gastos pidió no ser consultada
paquete por paquete. **Frisku no tiene sesión activa.**

Avisar no es tener confirmación. Si al momento de publicar falta alguna respuesta requerida,
pido la excepción **antes** del push, nunca después.

### Secuencia

1. Pedir la ventana a las tres sesiones y esperar respuesta.
2. Revalidar que `origin/main` sigue en `8a16055` y que no entró ningún despliegue.
3. Merge de `osiris/registro-condiciones` → `main` y push.
4. Esperar el deployment y comprobar que el bundle servido contiene el bloque del registro.
5. Registrar el nuevo deployment ID junto al de recuperación.

## 9 · Autorización que se necesita

> `AUTORIZO MERGE osiris/registro-condiciones → main`, push y despliegue del paquete exacto
> <SHA de la punta, el del mensaje que pide la ventana> sobre la base exacta
> `8a1605502a3880451333d3aaa244e519c7ddc3ed`.

El registro de ventanas ya quedó **incorporado** a esta rama (commit `95af8b5`), así que no
necesita una ventana propia.

La ventana, el deployment de recuperación y quiénes deben confirmar están en §8.

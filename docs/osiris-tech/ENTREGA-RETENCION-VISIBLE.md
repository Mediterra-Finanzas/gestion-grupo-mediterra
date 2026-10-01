# Entrega · Retención visible y registro de propuestas

**Lo que esta entrega NO hace: desacoplar la retención del país.** Mientras un contrato no pase
por la transición —y en esta entrega ningún contrato puede pasar— **el país sigue
determinando la tasa**. Lo que cambia es que eso se ve, se dice, y se puede registrar aparte la
tasa que correspondería.

Paquete independiente. **No activa ninguna tasa, beneficio ni reajuste**, y no mueve ningún
importe. No incluye las condiciones configurables (beneficio del fee, reajuste, territorio) ni el
cálculo de enganche al motor: esos siguen en local y van por su cuenta.

- **Rama:** `osiris/retencion-visible`
- **Base:** `aa40f07`
- **Archivos:** `src/osiris/retencion.js` (nuevo), `src/OsirisModule.jsx`, y dos archivos de prueba

---

## 1 · El problema que hace visible

Hoy la retención no es un dato: se deduce del país del cliente con una sola regla
(`pct(pais)`: Chile 1,00, el resto 0,85). Eso tiene dos consecuencias que se ven en pantalla:

- **Corregir una identificación mueve plata.** Si alguien corrige el país de un cliente porque
  estaba mal escrito, el neto de ese contrato cambia. El país es a la vez dato de identificación
  y parámetro tributario, y **esta entrega no cambia eso**: lo hace visible y lo avisa antes.
- **Nada distingue un neto respaldado de uno supuesto.** Los 23 contratos muestran su neto con
  la misma apariencia, y ninguno tiene respaldo documental cargado. El 15 % genérico es lo que se
  viene aplicando, no una tasa validada contra un convenio.

## 2 · Qué podrá hacer el usuario

| | |
|---|---|
| **Ver qué tasa se aplica y de dónde sale** | Cada fila de Royalty/Planta y Royalty Comercial muestra su tasa con su procedencia: *por país*, *heredado* o *validado*. Antes decía "WHT 15%" fijo en siete lugares |
| **Saber qué netos no están respaldados** | Las tablas y los archivos que se descargan dicen cuántas filas tienen el neto sin validar y por qué |
| **Registrar la tasa que corresponde, con su respaldo** | En la ficha del contrato se puede proponer una tasa indicando el documento que la respalda, quién la propone y cuándo. Queda guardada y **no entra al cálculo** |
| **Que avise antes de mover un neto** | Cambiar el país de un contrato muestra el efecto con los números (*"mueve la retención de 15 % a 0 % y con ella el neto"*) y pide confirmación. El cambio queda registrado con quién, cuándo y de qué a qué |
| **Ver la distinción en pantalla** | Se dice explícitamente que el país del cliente y la retención son dos cosas distintas, y que hasta ahora la segunda se deducía del primero |

## 3 · Qué sigue bloqueado, y por qué

| Operación | Estado | Por qué |
|---|---|---|
| **Validar una tasa** | Bloqueada, con el motivo en pantalla y el botón deshabilitado | Una tasa validada no sobrevive a una vuelta atrás: el código anterior la ignoraría y recalcularía por país. Se habilita cuando exista un despliegue de recuperación que lea el campo, **de forma explícita y autorizada** |
| **Aplicar la transición a un contrato** | No existe control en la pantalla | Es la operación que convierte un contrato en "migrado". Deliberadamente no se puede hacer desde la interfaz en esta entrega |
| **Cambiar el país de un contrato ya migrado** | Bloqueada | Mismo motivo que validar. Hoy no hay contratos migrados, así que no se alcanza |
| **Beneficio del fee, reajuste, territorio** | Fuera de este paquete | Son T3, y dependen de decisiones contractuales que siguen abiertas |

Las decisiones pendientes (A1 a A7) bloquean **solo** lo que depende de ellas: ninguna bloquea
esta entrega. La que más se le acerca es A6 —quién puede validar una tasa—, y aun así no la
bloquea: con la compuerta puesta no se valida nada, y el texto de pantalla dice expresamente que
la regla propuesta (administrador o CFO) **no es un permiso existente del sistema**.

## 4 · Dos cosas distintas que no hay que confundir

**(a) Publicar esta entrega no cambia ningún importe actual.** Los 23 contratos siguen con el
mismo neto el día después que el día antes. Nadie tiene que revisar cifras por esta publicación.

**(b) Cambiar el país de un contrato SÍ puede modificar su neto.** Eso pasa hoy en producción y
sigue pasando con esta entrega, porque el país sigue determinando la tasa mientras no haya
transición. Lo que agrega esta entrega es que **deja de pasar en silencio**: antes de aplicar el
cambio se muestra el efecto con los valores, y hay que confirmarlo.

Verificado en aislamiento sobre un contrato sin transición, cambiando Perú por Chile:

> Este contrato todavía calcula la retención por país. Cambiarlo de "Peru" a "Chile" mueve la
> retención de 15 % a 0 % y con ella el neto de este contrato. No es solo una corrección de
> identificación.

Al confirmar, queda registrado en el contrato:

```json
{ "de": "Peru", "a": "Chile", "pctAntes": 15, "pctDespues": 0,
  "movioElNeto": true, "usuario": "Revisor Sintetico", "fecha": "2026-10-01" }
```

Hoy ese cambio no deja ningún rastro.

## 5 · Medición: ningún importe se mueve por publicar

Medido contra el snapshot real de producción (23 contratos, leído en solo lectura), con
`impactoRetencion.test.js`, **9 pruebas**:

| Qué se midió | Resultado |
|---|---|
| Hoy ningún contrato pasó por la transición y ningún neto está validado | confirmado: 0 migrados |
| La transición NO mueve ningún importe | 0 diferencias |
| La transición no toca facturas, pagos ni antecedentes | 0 filas alteradas |
| Después de la transición, cambiar el país ya no mueve el neto | confirmado |
| Sin la transición, cambiar el país SÍ lo mueve | confirmado: es lo que se corrige |
| Una propuesta no mueve nada; validada sí, y solo ese contrato | confirmado |
| Todas las filas quedan marcadas como no validadas | confirmado |
| Qué calcularía el código anterior en cada escenario | medido |

Los 23 contratos siguen calculando exactamente igual que hoy, porque mientras un contrato no pase
por la transición `pctPorPaisLegado` devuelve lo mismo que devolvía `pct(pais)`.

**Suite:** `retencion.test.js` 80, `impactoRetencion.test.js` 9 con el snapshot real, regresión del
motor de la Fase 0 23. Suite completa: **1.282 pasan, 18 saltadas, 1 falla**, y esa falla es
`paramsFrutaAnticipos`, la prueba atada a la fecha del carril de anticipos, que falla igual en la
base sin este cambio. Build `CI=true`: `Compiled successfully`.

## 6 · Comprobación en aislamiento de este paquete

Entorno aislado propio (Postgres local + PostgREST 3068 + servidor de revisión 3070), con el
bundle **de este candidato** y la copia sintética de los 23 contratos. Registro del servidor:
**0 llamadas a producción**. El entorno quedó restaurado a su estado previo (23 contratos, 0
migrados, 0 con historial de país).

| # | Qué se probó | Resultado |
|---|---|---|
| 1 | **Un editor guarda una propuesta sin alterar importes** | Guardado: `pct 10`, respaldo "CDI Peru-Reino Unido, art. 12", `propuestaPor: OT Editar`, `propuestaEl: 2026-10-01`. Importes antes y después: por cobrar `$5.578.534`, suma de netos de Royalty/Planta `4.888.532,77` (53 filas) y de Royalty Comercial `11.478.901,50` (57 filas). **Idénticos** |
| 2 | **Solo lectura no puede** | Con la pestaña en "ver": ve la propuesta, pero 0 controles editables en la ficha y 0 botones de retención. La propuesta queda intacta byte a byte |
| 3 | **Validar: bloqueado en la acción** | Con usuario administrador el botón aparece **deshabilitado**; forzando su `onClick` desde la consola, salta el aviso con el motivo y el contrato **sigue en `sinTransicion`**. No es solo apariencia |
| 4 | **Migrar: no hay control** | Ningún botón de transición / migrar / congelar en la ficha. `aplicarTransicion` se importa pero no se usa en ninguna parte de la pantalla |
| 5 | **Cambiar el país de un contrato migrado: bloqueado en la acción** | Sobre un contrato sembrado como `heredado_sin_validar`: **no se pregunta**, sale el aviso con el motivo, el país **no cambia** y no se escribe historial |

### Volver a la versión anterior y seguir trabajando

No alcanza con que la propuesta quede guardada antes de usar la versión anterior: hay que
comprobar que **sobrevive a una edición hecha con esa versión**. Probado con el bundle de
`aa40f07` (la base) apuntando a la misma copia:

1. Con la versión anterior, la propuesta **no se ve** (ese código no la conoce), como estaba previsto.
2. Se editó y guardó un campo del mismo contrato (Ciudad). La edición se guardó.
3. La propuesta quedó **idéntica**: `pct 10`, su respaldo, su autor y su fecha. También sobrevivió
   el historial de cambio de país.
4. Al volver al candidato, la propuesta se muestra de nuevo y la edición hecha con la versión
   anterior sigue ahí.

## 7 · Cómo se recupera la versión anterior de forma segura

**Hoy, con este paquete recién publicado: la vuelta atrás es segura y no mueve ningún importe.**

El riesgo de la vuelta atrás existe solo sobre contratos **migrados**: el código anterior ignora
`retencionTributaria` y recalcula por país. Con 0 contratos migrados no hay nada que ignorar. Y no
pueden aparecer migrados mientras esté esta versión, porque las dos operaciones que los crean
—aplicar la transición y validar— no están disponibles: la primera no tiene control, la segunda
está bloqueada por la compuerta.

| | |
|---|---|
| Qué se pierde al volver | Las propuestas de tasa que se hubieran cargado quedan guardadas en el contrato pero dejan de verse, porque el código anterior no las lee. No se borran |
| Qué NO se pierde | Ningún importe, ninguna factura, ningún pago. El cálculo vuelve a ser el mismo que ya es hoy |
| Qué vuelve | La pantalla deja de decir qué netos están validados y vuelve el "WHT 15 %" fijo |
| Cómo se hace | Vercel → **gestion-grupo-mediterra** → **Deployments** → el despliegue de `aa40f07` → **Promote to Production** |

**Antes de habilitar la validación** —que es lo que cambia este análisis— hay que comprobar que
existe un despliegue de recuperación que sí lee el campo, identificarlo por su ID y verificarlo
contra la versión corriendo. Eso es un paso aparte, explícito y autorizado. Tener cero contratos
migrados hoy no sustituye ese requisito: dice que esta publicación es segura, no que las
operaciones futuras lo sean.

## 9 · Corrección posterior a la publicación (2026-10-01)

**Lo que este acta afirmaba de más.** En la sección 2 y en el mensaje del commit dije que las
propuestas se mostraban con la etiqueta **NO OPERATIVA** y el texto "es un antecedente guardado:
no se aplica a ningún importe". **Eso no entró en lo publicado.** Escribí ese cambio y lo probé
en aislamiento, pero lo perdí antes de commitear: al restaurar las URLs del bundle de revisión
con `git checkout -- src/` revertí también esa edición, que todavía no estaba guardada.

**Lo que sí quedó publicado sobre la propuesta:**

> **Propuesta sin validar: 10 %** · propuesta por … el … Respaldo: … **No entra al cálculo**
> mientras no la valide un usuario autorizado.

Es correcto y dice que no se aplica. Lo que falta es el énfasis acordado: la etiqueta, la frase
sobre con qué tasa sigue calculando el motor, y el aviso en el formulario de que registrar una
tasa no la aplica.

**Nada de lo publicado es incorrecto ni activa nada.** Validar sigue bloqueado, no hay control de
transición y los importes no se movieron. Es una diferencia de énfasis en el texto, no de
comportamiento. Se corrige en el paquete `osiris/propuesta-no-operativa`, que solo cambia esos
tres textos y este apartado.

**Lección operativa, para que no se repita:** commitear el cambio **antes** de armar el bundle de
revisión. El `git checkout -- src/` que restaura las URLs se lleva por delante cualquier edición
sin commitear.

## 8 · Autorización que se necesita

> `AUTORIZO MERGE osiris/retencion-visible → main`, push y despliegue del paquete exacto
> <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `aa40f07`.

**Antes de desplegar, además de revalidar base y Production:**

1. **Revalidar que siguen siendo cero los contratos migrados** en producción, en solo lectura.
   Es la condición de la que depende que la vuelta atrás no mueva importes. Si alguno apareciera
   migrado, esta entrega se detiene y se vuelve a presentar.
2. **Registrar el deployment de recuperación** con su ID, antes del push.

**A6 sigue pendiente y esta entrega no la resuelve ni la presupone.** El texto en pantalla dice
que validar "requiere un usuario autorizado (administrador o CFO)", y eso es una **regla
propuesta**: no existe como permiso en el sistema y **no autoriza a nadie** a validar tasas, entre
otras cosas porque validar está bloqueado. La decisión hace falta antes de levantar la compuerta,
no antes de publicar esto.

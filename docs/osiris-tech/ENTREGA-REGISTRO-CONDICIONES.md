# Entrega · Registro de condiciones del contrato

Guarda lo que cada contrato pactó y nombra lo que falta. **No aplica ningún efecto económico**:
ninguna tasa, ningún beneficio, ningún reajuste. Ningún importe cambia.

- **Rama:** `osiris/registro-condiciones`
- **Base:** `8a16055`
- **Archivos:** `condicionesConfigurables.js` (nuevo), `OsirisModule.jsx`, y cuatro de prueba

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

`registroCondiciones.test.js`, **22 pruebas** en los cuatro ejes pedidos:

| Eje | Qué fija |
|---|---|
| **"Sin declarar" ≠ "no existe"** | El cupo sin declarar es `null`, nunca 0; "no declarado" y "sin reajuste" son estados distintos; el territorio sin declarar no se copia del país |
| **Desconocido ≠ cero** | Sin consumo previo declarado, el disponible es `null` y no el cupo entero; declarar cero **sí** es declarar; en un cupo compartido, si a un contrato del grupo le falta el historial, no se suma |
| **Registrar no habilita** | Con todo confirmado y sin faltantes, la retención **sigue sin validar** y el neto sigue no definitivo |
| **La simulación no inventa** | Sin porcentaje no calcula y dice por qué; por índice no proyecta y pide la serie publicada; con todo, calcula y no toca el contrato ni el valor base |
| **Preservación** | Factura, pago, plantaciones y la propuesta de retención quedan intactas; un contrato sin los campos nuevos se lee sin romperse |
| **Permisos** | Todas las funciones del modelo son de lectura y no mutan el contrato; el modelo no expone ninguna función que escriba —todo lo que escribe pasa por la pantalla, que ya respeta el permiso de la pestaña |
| **Concurrencia** | Dos campos del mismo bloque conviven; escribir el reajuste no toca el beneficio; la fusión por campo conserva lo que escribió la otra edición; escribir el registro no pisa una propuesta de retención |
| **Impacto económico** | La tasa y el factor del motor son **idénticos** con y sin registro; declarar un beneficio no cambia el valor por planta ni por hectárea; confirmar el reajuste no modifica el valor base |

Más `consolidacionRetencion.test.js` (7), y las suites que ya existían y siguen verdes:
`condicionesConfigurables` (25), `acoplamiento`, `impactoCondiciones`, `retencion` (80) y la
regresión del motor de la Fase 0 (23).

**Suite completa: 1.346 pasan, 24 saltadas, 1 falla.** La que falla es `paramsFrutaAnticipos`, la
prueba atada a la fecha del carril de anticipos, que falla igual en la base sin este cambio. Build
`CI=true`: `Compiled successfully`.

## 6 · Recuperación

Volver atrás es revertir el commit. **No se pierde ningún dato**: lo registrado vive en campos
propios del contrato (`beneficioFee`, `reajuste`, `territorio`) que el código anterior no lee pero
tampoco borra, igual que pasó con las propuestas de retención. Lo que vuelve es la falta de
pantalla para verlos y cargarlos.

Ningún importe cambia al volver, porque ninguno cambió al publicar.

## 7 · Autorización que se necesita

> `AUTORIZO MERGE osiris/registro-condiciones → main`, push y despliegue del paquete exacto
> <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `8a16055`.

**Propongo incluir también el registro de ventanas** (`osiris/registro-ventanas`), que quedó sin
publicar por no gastar una ventana solo en documentación. Si estás de acuerdo, lo integro a esta
rama y el candidato pasa a incluir los dos; si preferís que vaya aparte, lo dejo donde está.

**Quiénes deben confirmar la ventana**, según las sesiones activas al preparar este candidato:
Allegria Service, Mediterra One y Rendición de gastos. Acuerdo vigente a declarar: Rendición de
gastos pidió no ser consultada paquete por paquete. Frisku no tiene sesión activa. Si al momento
de publicar falta alguna respuesta requerida, pido la excepción antes del push.

# Entrega · La retención deja de deducirse del país y se puede ver

Paquete independiente. **No activa ninguna tasa, beneficio ni reajuste**, y no mueve ningún
importe. No incluye las condiciones configurables (beneficio del fee, reajuste, territorio) ni el
cálculo de enganche al motor: esos siguen en local y van por su cuenta.

- **Rama:** `osiris/retencion-visible`
- **Base:** `aa40f07`
- **Archivos:** `src/osiris/retencion.js` (nuevo), `src/OsirisModule.jsx`, y dos archivos de prueba

---

## 1 · El problema que resuelve

Hoy la retención no es un dato: se deduce del país del cliente con una sola regla
(`pct(pais)`: Chile 1,00, el resto 0,85). Eso tiene dos consecuencias que se ven en pantalla:

- **Corregir una identificación mueve plata.** Si alguien corrige el país de un cliente porque
  estaba mal escrito, el neto de ese contrato cambia solo. El país es a la vez dato de
  identificación y parámetro tributario.
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

## 4 · Qué NO cambia: ningún importe

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

## 5 · Cómo se recupera la versión anterior de forma segura

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

## 6 · Autorización que se necesita

> `AUTORIZO MERGE osiris/retencion-visible → main`, push y despliegue del paquete exacto
> <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `aa40f07`.

Y una decisión que **no** bloquea esta entrega pero sí la siguiente: **A6, quién queda autorizado
a validar una tasa de retención**. Sin esa respuesta la compuerta se puede levantar igual, pero no
habría regla sobre quién la usa.

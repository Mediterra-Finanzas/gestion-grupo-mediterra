# Entrega · El alcance por variedad no desaparece al renombrarla

Corrige una funcionalidad **ya publicada**: el alcance evaluado por variedad. Paquete
independiente: no incluye respuestas por labor ni nada del paquete económico o tributario.

- **Rama:** `osiris/alcance-variedad-preservado`
- **Base:** `3c490b5` (`origin/main` al 2026-10-01)
- **Archivos:** `src/osiris/informeAlcance.js` y `src/OsirisModule.jsx`, 118 líneas agregadas, 0 modificadas

---

## 1 · El defecto

El alcance de cada variedad se guarda indexado por el **nombre** de la variedad. Si esa variedad
deja de estar en el informe —se corrige su grafía en el maestro, o se desmarca— el alcance sigue
guardado bajo el nombre anterior y **deja de verse en toda la aplicación**: no lo hereda la
variedad nueva, no aparece en ningún listado, no sale en el PDF.

El dato no se pierde en disco, pero se pierde para quien usa la aplicación, que a efectos
prácticos es lo mismo. Está en producción desde que se publicó el alcance por variedad.

Reproducido: informe con Biloxi (12 ha) y Ventura (8 ha); se corrige "Biloxi" por "Biloxy";
`alcanceVariedades["Biloxi"]` sigue ahí con sus 12 ha y la pantalla no lo muestra en ninguna parte.

## 2 · Qué podrá hacer el usuario

- **Ver el dato conservado.** Si una variedad con alcance cargado ya no está en el informe,
  aparece un aviso con su nombre y su valor: *«Biloxi» ya no está en el informe, y tenía alcance
  cargado: 12 ha. Se conserva tal cual.*
- **Recuperarlo.** Junto al aviso puede elegir una variedad del informe y pulsar Reasignar. El
  alcance se mueve con su misma unidad; no se convierte nada.
- **Que no le pisen un dato sin avisar.** Si la variedad de destino ya tiene alcance cargado, no
  se reemplaza: se pide confirmación diciendo qué valor hay y cuál lo reemplazaría.

Lo que el sistema **no** hace: no adivina a qué variedad corresponde, no reasigna solo, no
convierte entre hectáreas y plantas, y no borra el dato de origen hasta que la reasignación se
confirma.

## 3 · Qué no cambia

El alcance de las variedades vigentes se lee y se escribe exactamente igual que hoy. Los informes
con el campo histórico global siguen mostrándolo como histórico global. Un informe sin
`alcanceVariedades` no se rompe ni gana nada inventado.

## 4 · Pruebas

`alcanceVariedadPreservado.test.js`, **14 pruebas**:

| Qué fija | |
|---|---|
| El dato sigue en el informe: nunca se borró | sí |
| La variedad nueva no lo hereda sola | sí |
| Se lista con su valor y su motivo (antes quedaba invisible) | sí |
| Una variedad vigente no se lista como ausente | sí |
| Una variedad ausente sin alcance cargado no genera ruido | sí |
| Reasignar lo devuelve a la vista con su misma unidad | sí |
| Leer el informe no mueve nada: hay que pedirlo | sí |
| Un destino con dato no se pisa sin confirmar | sí |
| Confirmando, se reemplaza y queda dicho qué se reemplazó | sí |
| Origen igual a destino, u origen sin alcance, no hacen nada | sí |
| Desmarcar y volver a marcar la misma variedad la recupera sola | sí |
| Las variedades vigentes se leen igual que antes | sí |
| Un informe sin el campo no se rompe | sí |
| El histórico global sigue siendo histórico global | sí |

Suite completa: **1.202 pasan, 9 saltadas, 1 falla**. La que falla es
`paramsFrutaAnticipos`, que **también falla en `origin/main` sin este cambio**: espera
"reprogramar a Sep-26" y la aplicación dice "Oct-26" porque el mes calendario cambió. Es una
prueba dependiente de la fecha, del carril de anticipos, ajena a esta entrega.

Build `CI=true`: `Compiled successfully`.

## 5 · Recuperación

Dos archivos, 118 líneas agregadas y ninguna modificada: el código existente no se tocó. Volver
atrás es revertir el commit.

**Qué pasa si se vuelve atrás:** no se pierde ningún dato —los alcances reasignados quedan donde
quedaron, porque la reasignación escribe en el mismo campo de siempre— pero **vuelve el defecto**:
un alcance cuya variedad ya no está en el informe deja otra vez de verse, y no habrá forma de
recuperarlo desde la pantalla.

## 6 · Autorización que se necesita

> `AUTORIZO MERGE osiris/alcance-variedad-preservado → main`, push y despliegue del paquete
> exacto <SHA de la punta de la rama, indicado al pedir la ventana> sobre la base exacta `3c490b5`.

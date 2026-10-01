# Recorrido · País de constitución del cliente

Para qué sirve, dónde está y cómo se usa. Cinco minutos.

---

## Qué es, en una frase

Un campo nuevo para dejar registrado **dónde está constituida legalmente cada sociedad**, separado
del campo "País" que ya existía. Es un antecedente: se declara, se respalda y queda. **No cambia
ningún importe, no determina ninguna retención y no activa nada.**

## Por qué hacía falta

Hoy hay un solo campo de país por cliente, y el motor deduce de él la retención. Eso obliga a
usarlo para dos cosas distintas: identificar al cliente y decidir su tratamiento tributario.
Cuando no coinciden, corregir la identificación movería el cálculo. Por eso **Agroberries
Limited** —domicilio en Canary Wharf, Londres— figura como Perú, y así sigue.

Ahora el dato legal tiene su propio lugar, sin tocar el que calcula.

---

## Dónde está

1. Entrá a **Osiris Plant Management**.
2. Abrí **📜 Contratos Exportadores-Productores**.
3. Arriba, en la barra de botones, apretá **👥 Clientes**.

Vas a ver el Maestro de Clientes con una columna nueva: **País constitución**. Hoy todos dicen
*sin declarar*, porque nadie cargó ninguno todavía.

## El aviso de arriba de la tabla

Sobre la tabla aparece una franja amarilla con los clientes cuyo **domicilio menciona otro país
que el cargado** y que todavía no declararon su constitución. Hoy son cinco:

| Cliente | Domicilio | País cargado |
|---|---|---|
| Agroberries Limited | Canary Wharf, Londres | Peru |
| AGV Innovation & Varieties LLC | Los Angeles | Peru |
| Carsol Genetics BV | Vlaardingen | Peru |
| Integrity Farms SpA | Santiago | Peru |
| Agrícola San Clemente Limitada | Chile | Peru |

**Es un indicio documental para revisar, no una conclusión.** La aplicación no completa ninguno:
lo tiene que cargar una persona con el documento a la vista. A medida que los vayas declarando,
el aviso se achica solo.

## Cómo declarar uno

1. En la fila del cliente, apretá el **✏️** de la derecha.
2. Bajá hasta el bloque **"Pais de constitucion · antecedente"**. Está debajo de los datos de la
   empresa y arriba de los campos/predios.
3. En **País de constitución**, elegí del desplegable. Son 20 países e **incluye Reino Unido**.
4. En **Respaldo documental**, escribí de dónde sale. Por ejemplo
   *"Certificate of Incorporation 13571937"* o *"estatutos, cláusula 1"*.
5. Apretá **💾 Guardar**.
6. Apretá **💾 Guardar ahora** arriba a la derecha para mandarlo al servidor.

Si lo declarado no coincide con el campo "País", aparece una nota gris explicando que son dos
datos distintos y que **no cambia ningún importe**. Es informativa: no hay nada que corregir.

Para retirar una declaración, volvé al mismo desplegable y elegí **— Sin declarar —**.

---

## Lo que NO hace, y conviene tener claro

| | |
|---|---|
| **No toca el campo "País"** | Sigue exactamente como estaba, con sus cinco opciones. Reino Unido no se agregó ahí |
| **No toca Agroberries** | Ni su país ni nada suyo. Queda para cuando vos decidas declararlo |
| **No determina retenciones** | El motor sigue calculando como hasta hoy. Declarar un país de constitución no mueve ningún neto |
| **No completa a nadie solo** | Ni desde el país, ni desde la dirección, ni desde la ciudad |
| **No se guarda por contrato** | Vive en el cliente. Declararlo una vez alcanza a todos sus contratos, así que no pueden existir dos respuestas distintas para la misma sociedad |

**"Sin declarar" no significa "no existe"**: significa que nadie lo cargó todavía.

## Permisos

Quien tenga la pestaña de Contratos en *ver* no llega al Maestro de Clientes: el botón **👥
Clientes** no le aparece. El campo nuevo solo lo edita quien ya podía editar clientes.

## Si dos personas editan a la vez

Si alguien más guardó mientras vos tenías la pantalla abierta, al guardar vas a ver
**"⚠️ NO se guardó · conflicto"**. No se pisa nada: recargá la página y volvé a cargar tu cambio.

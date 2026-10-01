# Entrega · País de constitución del cliente

Un campo nuevo para registrar dónde está constituida cada sociedad. **No toca el campo "país"
que ya existe, no toca el territorio y no entra en ningún cálculo.** Ningún importe cambia.

- **Rama:** `osiris/pais-constitucion`
- **Base:** `70c29032cb3d6fc07fe55315a25ab5f427c1ce89` (= `main` con T3 ya publicado)
- **Candidato:** la punta de la rama; el SHA va en el mensaje al pedir la ventana
- **Integrado sobre la base nueva**, no reconstruido: rebase limpio salvo un conflicto trivial
  (los dos paquetes agregan un bloque de `import` en el mismo lugar), resuelto conservando los dos

---

## 1 · El problema que resuelve

Hoy hay **un solo** campo de país por cliente, y el motor deduce de él la retención. Eso obliga a
usarlo para dos cosas que no son la misma:

| | |
|---|---|
| Dónde está **constituida** la sociedad | Dato legal, sale de su documentación |
| Qué **tratamiento tributario** le corresponde al contrato | Hoy se deduce del campo anterior |

Cuando no coinciden, corregir la identificación mueve el neto. Por eso **Agroberries Limited**
—domicilio en Canary Wharf, Londres, TAX ID 13571937— figura como Perú: cambiarlo tendría
consecuencias económicas que nadie decidió.

Este paquete separa el dato legal sin tocar el que calcula.

## 2 · Qué podrá hacer el usuario

En **Contratos Exp-Prod → 👥 Clientes**, al crear o editar un cliente, un bloque propio:

- **País de constitución**, de un catálogo propio que **sí incluye Reino Unido** (20 países).
- **Respaldo documental** de esa declaración.
- La lista muestra la columna "País constitución", con **sin declarar** cuando nadie lo cargó.

Y un aviso sobre la tabla: qué clientes tienen un domicilio que menciona otro país que el
cargado y todavía no declararon su constitución. Sobre los datos reales de hoy son **cinco**:

| Cliente | Domicilio | País cargado |
|---|---|---|
| Agroberries Limited | Canary Wharf, Londres | Peru |
| AGV Innovation & Varieties LLC | Los Angeles | Peru |
| Carsol Genetics BV | Vlaardingen | Peru |
| Integrity Farms SpA | Santiago | Peru |
| Agrícola San Clemente Limitada | Chile | Peru |

**Es un indicio documental, no una conclusión.** La aplicación no completa ninguno.

## 3 · Las cuatro condiciones que pediste, una por una

| Condición | Cómo se cumple |
|---|---|
| **Sin intervenir el país actual, el territorio ni los cálculos** | El módulo nuevo no lee, no escribe y no propone el campo `pais`. Una prueba **congela la lista** del campo país en `["Peru","Mexico","Chile","Corea","España"]` y exige que **no** contenga Reino Unido |
| **Sin completar automáticamente clientes existentes ni cambiar Agroberries** | Ningún cliente arranca con valor. Una dirección en Londres produce un aviso para revisar, nunca una declaración. Comprobado en aislamiento: tras la prueba, Agroberries sigue con `pais: "Peru"` y **sin** país de constitución |
| **Identificación clara de cada campo** | Son dos bloques distintos, con el texto en pantalla: *"Es otro dato que el campo País de arriba, que es el de identificación y el que el motor usa hoy para la retención. Declararlo acá no cambia ningún importe, no valida ninguna tasa y no toca el campo País."* Si los dos difieren, se informa y se dice explícitamente que no cambia importes |
| **Fuente canónica del cliente, sin copias contradictorias por contrato** | El campo vive en el **cliente**. Un contrato lo resuelve por `clienteId` y **no guarda copia**. Declararlo una vez alcanza a todos los contratos de esa sociedad. Si el contrato no tiene cliente, el estado es "sin cliente asociado": **no** se cae al país del contrato |

## 4 · Un hallazgo, dicho con precisión

El selector del campo "País" del Maestro de Clientes **ya tiene hoy** una opción *"➕ Agregar
país…"*: cualquiera con permiso de edición puede escribir "Reino Unido" ahí a mano. Este paquete
no agrega esa puerta ni la cierra; la deja como está.

**Corrección de una afirmación anterior.** Dije que hacerlo "cambiaría el cálculo de retención de
los contratos de ese cliente". Eso es más fuerte de lo que el código sostiene. Lo que sí se puede
afirmar, leído del código:

| | |
|---|---|
| **El motor lee el país del CONTRATO, no el del cliente** | `estadoRetencion(ct)` usa `ct.pais`. El país del cliente se copia al contrato **solo al seleccionarlo** al crear o cargar el registro (`onSelect`). Editar el maestro después **no** reescribe los contratos existentes |
| **La regla de hoy es binaria** | `pctPorPaisLegado` devuelve 0 % si el texto contiene "chile", y 15 % en cualquier otro caso. De Perú a Reino Unido el porcentaje **no se mueve**: 15 % → 15 %. De Chile a Reino Unido sí: 0 % → 15 % |
| **Depende también del estado del contrato** | Para un contrato ya migrado y con tasa validada, cambiar el país no mueve el neto: lo frena la compuerta publicada. Hoy hay **0 contratos migrados**, así que todos calculan por país |
| **En la ficha del contrato no se puede escribir un país nuevo** | Ese campo usa la lista cerrada `PAISES`, sin opción de agregar |

Resumiendo sin exagerar: escribir "Reino Unido" en el maestro de clientes **no mueve ningún
importe de los contratos que ya existen**. Podría afectar a un registro **nuevo** creado después
seleccionando ese cliente, y solo cuando el país anterior era Chile. Sigue siendo una puerta que
conviene mirar, pero no es la que yo describí.

## 5 · Pruebas

`paisConstitucion.test.js`, **37 pruebas**:

| Grupo | Qué fija |
|---|---|
| Campo nuevo | Sin declarar es `pendiente`, nunca el país del cliente; declarar es puro y no muta; retirar la declaración no inventa un país; guarda respaldo, autor y fecha |
| Reino Unido | Está en el catálogo nuevo; la lista del campo `país` queda **congelada** y sin Reino Unido; los dos catálogos son independientes |
| Fuente canónica | El contrato lo resuelve por su cliente; declararlo alcanza a todos sus contratos; no escribe nada en el contrato; sin cliente no adivina desde el país del contrato |
| No se completa solo | Una dirección en Londres **no** declara Reino Unido, pero sí lo señala; no molesta cuando coincide o ya está declarado; sin dirección no hay indicio y eso no es conclusión |
| Divergencia | Se informa con la frase "no cambia ningún importe"; avisar no modifica el país; Perú/Peru no es divergencia |
| Antecedentes faltantes | Falta el país, falta el respaldo, o no falta nada |
| **Impacto económico** | Para los 5 países posibles, declarar Reino Unido **no mueve** la retención ni el factor; el neto sigue en 0,85 USD/planta y $2.550/há; un cliente con y otro sin el campo dan el mismo contrato |
| Preservación | Un cliente viejo se lee sin romperse; declarar conserva todo lo demás; tolera el campo guardado como texto plano |

**Suite completa: 1.318 pasan, 18 saltadas, 1 falla** — `paramsFrutaAnticipos`, atada a la fecha
del carril de anticipos, que falla igual en la base `8a16055` sin este cambio. Build `CI=true`:
`Compiled successfully`.

## 6 · Comprobado en navegador aislado

Candidato `0b548fb` compilado contra el PostgREST aislado (copia de los 25 clientes y 23
contratos reales), servido en `127.0.0.1:3070`. Producción no se tocó.

| | |
|---|---|
| El aviso detecta los 5 casos | Sí, con los nombres, y dice que es indicio y que nada se completa solo |
| El selector del campo "País" sigue con 5 opciones | Sí: Chile, Corea, España, Mexico, Peru. **Sin Reino Unido** |
| El selector nuevo tiene su catálogo | Sí, 20 países con Reino Unido |
| Declarar y guardar | Carsol Genetics BV → Países Bajos con respaldo. Persiste |
| El `pais` del cliente no se movió | Carsol sigue en `Peru` |
| Agroberries | **No se tocó**: sin país de constitución y `pais: "Peru"` |
| Ningún contrato guardó copia | 0 de 23 |
| Los importes | Idénticos: hub *$5.578.534 · 142 · 53*, y los 41 importes de Reportes/BI uno a uno |
| El aviso se achica al declarar | Declarado AGV, el aviso pasa de 5 clientes a 4. No queda pegado |

### Solo lectura y concurrencia

| | |
|---|---|
| **Solo lectura no escribe** | Con `OT Ver` el botón **“▾ Clientes” ni siquiera existe**: el maestro, y con él el campo nuevo, es inalcanzable. En la ficha de un contrato hay **0 controles**. `updated_at` del servidor, idéntico antes y después de navegar. Es más fuerte que en T3: acá los controles no se renderizan, no es que estén deshabilitados |
| **Sesión desactualizada** | Con la pantalla abierta, otra sesión escribe la fila; la sesión abierta declara un país de constitución y guarda → **“⚠️ NO se guardó · conflicto”**. En el servidor queda la escritura de la otra sesión intacta y el país declarado **no** se escribió |

**Un detalle del primer intento, que conviene dejar escrito.** La primera vez construí mal la
prueba: hice la escritura externa **antes** de entrar al módulo, y al entrar el módulo releyó la
fila, así que la sesión nunca estuvo desactualizada. El guardado dijo “Guardado”, y correctamente:
las dos escrituras quedaron, ninguna se perdió. Rehecha con la pantalla ya abierta, la compuerta
disparó. No era un defecto de la aplicación, era un defecto de mi prueba.

Los datos de prueba se restauraron: la copia aislada volvió a su línea base (`b8aa3eb9…`).

## 7 · Recuperación

Volver atrás es revertir el commit. Lo declarado vive en `cliente.paisConstitucion`, un campo
que el código anterior no lee pero tampoco borra. No se pierde nada y ningún importe cambia al
volver, porque ninguno cambió al publicar.

## 8 · Qué NO entra

| | |
|---|---|
| Reino Unido en el campo "País" | No. Esa lista queda como está, con una prueba que lo exige |
| El país de Agroberries | No se toca |
| Redefinir el campo "país" | No. Conserva su significado y su dependencia actual con el cálculo |
| Mostrarlo en la ficha del contrato | No en esta entrega: ahí trabaja T3 y no quiero cruzar los dos paquetes. Se agrega después, cuando uno de los dos esté publicado |
| Usarlo para decidir una retención | No. Eso requiere la decisión tributaria y la compuerta, que siguen pendientes |

## 9 · La integración sobre el main con T3

T3 se publicó primero (`8a16055` → `70c2903`). Este paquete se integró encima. Se verificó lo
que la integración podía romper, sin repetir lo que seguía siendo válido:

| | |
|---|---|
| **El conflicto** | Uno solo, en los `import` del tope. Los dos bloques conviven |
| **El bloque de T3 sigue íntegro** | Presentes en el archivo integrado: el encabezado del registro, "Territorio contractual", el cupo del contract fee, el saldo "indeterminados", y la guarda de permisos `if(!can) return` que corrigió `cf5d2b4` |
| **`PAISES` sigue congelado** | `["Peru","Mexico","Chile","Corea","España"]`, con su prueba |
| **Las suites del área** | `paisConstitucion`, `registroCondiciones`, `condicionesConfigurables`, `consolidacionRetencion`, `acoplamiento` y `retencion`: **184 pruebas verdes** |
| **El diff contra el main publicado** | Solo lo de este paquete más dos actas. `OsirisModule.jsx` +87/−6, sin tocar ninguna línea de T3 |

No se repitieron las comprobaciones en navegador de T3 ni las mediciones de impacto de retención:
siguen valiendo, y la integración no toca ese código.

## 10 · Estado y secuencia

Local, sin push ni despliegue. T3 ya está publicado y este candidato está integrado sobre esa
base, a la espera de tu autorización.

**Suite completa: 1.386 pasan, 24 saltadas, 1 falla** — `paramsFrutaAnticipos`, atada a la fecha del
carril de anticipos, que falla igual en `main` sin este cambio. Build `CI=true`:
`Compiled successfully`.

Este paquete arrastra además dos commits de documentación que no quise publicar en una ventana
propia: el cierre de la ventana 6 en el registro de ventanas, y la aclaración en el acta de T3 de
que la medición acredita que los cálculos no cambian pero **no** acredita las facturas emitidas
ni lo cobrado.

**Qué no autoriza este paquete**, aunque el catálogo permita registrar Reino Unido: no habilita
completar Agroberries, no determina su retención, y no activa beneficios, reajustes, transición
ni validación tributaria.

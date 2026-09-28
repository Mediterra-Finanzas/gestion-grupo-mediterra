# Acta de entrega · Informes técnicos (pedidos de Nicolás Fuenzalida)

2026-09-24. Entrega **local y aislada**: sin push, sin merge, sin despliegue, sin cambios
productivos y **sin ningún envío de correo real**. Paquete separado del tributario.

## 1 · Base y SHA

| | |
|---|---|
| Base observada | `origin/main` = `fac6cd0` al momento de ramificar (main sigue avanzando con Frisku) |
| Rama candidata | `osiris/informes-tecnicos` = **`a4527fc`** |
| Rama de revisión (NO se integra) | `prueba/informes-revision`, un commit que solo cambia el destino a `127.0.0.1:3070` |
| Build `CI=true` | compila |
| Suite | 1.101 pasan · 9 saltadas · 2 fallos **heredados de la base**, ninguno de este paquete |

Los dos fallos heredados: `paramsFrutaAnticipos` (anterior, ajeno a Osiris) y `secHf1`, que empezó a
fallar en `origin/main` porque los archivos de prueba nuevos de Frisku
(`friskuSharePointClient.test.js`, `api/frisku-sp.test.mjs`, `api/_friskuSpAuth.test.mjs`) traen
literales que el guardia SEC-HF1 prohíbe. No es de este paquete ni del tributario; queda avisado
para el carril Frisku.

## 2 · Reparto del trabajo

Tres agentes en paralelo, cada uno con **archivos propios y nuevos**; nadie tocó `OsirisModule.jsx`
ni ningún archivo compartido. La integración la hice yo, solo, después.

| Agente | Archivos | Pruebas |
|---|---|---|
| Catálogo fenológico | `src/osiris/fenologia.js` + test | 44 |
| Encabezado y alcance | `src/osiris/informeAlcance.js` + test | 27 |
| Cuerpo del correo | `src/osiris/correoInforme.js` + test | 25 |

96 pruebas nuevas, todas en verde.

## 3 · Lo entregado

### Excel de estados y labores
Catálogo de **8 estados** y **60 labores** tomado de la hoja "Hoja1" (la que trae los juegos de
opciones), con cinco tipos de respuesta: opción única, número, cuadro de macronutrientes,
observación + recomendación y comentario.

**Se preserva todo lo existente**: los valores guardados que no están en el catálogo nuevo se
conservan marcados como `legacy` y la pantalla avisa *«Valor histórico "X": no está en el catálogo
nuevo y se conserva tal cual»*. De las 10 labores culturales antiguas, 8 no tienen equivalente en el
Excel y se rescatan igual. Nada se renombra ni se borra.

### Informe
- **Encabezado**: densidad de plantación **con su unidad**, sistema productivo y sustrato.
- **Variedades**: selección múltiple. El campo `variedad` de siempre se sigue escribiendo con la
  primera, para que los informes ya emitidos y el PDF antiguo no cambien.
- **Alcance evaluado**: en hectáreas o en número de plantas, **siempre con la unidad**. Si falta el
  valor o la unidad dice "sin definir", nunca cero.
- **Dato histórico**: los informes con "Superficie evaluada (há)" conservan ese valor como alcance
  **válido en hectáreas**, con su procedencia a la vista, en pantalla y en el PDF. No se declara
  indefinido por ser antiguo, no se reparte por variedad y no se convierte a plantas. Cambiarle el
  significado (otra unidad, otro valor) pide confirmación explícita.
- **Sin conversión**: no hay ninguna función que pase de hectáreas a plantas ni al revés, ni siquiera
  teniendo la densidad. Hay tres pruebas que lo demuestran.
- **"Fenología" → "Estado fenológico predominante"** en la pestaña, en la pantalla y en el PDF. Las
  claves internas (`fenologia`, `fenologiaEstado`) no cambian.

### Correo
La frase va en el cuerpo, **exacta**, verificada carácter por carácter contra el texto del CFO
(137 caracteres, coincidencia exacta):

> Tomar todas las recomendaciones realizadas como una guía, la decisión de utilizarlas queda
> totalmente bajo su criterio y responsabilidad.

Aparece una sola vez, con link y sin link, y el asunto y el resto del cuerpo quedan como estaban.

## 4 · Revisión en el entorno aislado

Copia de los datos reales, servida en 3070. Todas las escrituras se revirtieron al terminar.

| Comprobación | Resultado |
|---|---|
| Etiqueta de la sección | "C. Estado fenológico predominante" en pantalla y en el PDF |
| Estados del Excel en el selector | Los 8, de Establecimiento a Poda |
| Selección múltiple | "Seleccionadas: T11-719, MegaEarly, MegaCrisp" (T11-719 es el valor histórico, conservado) |
| Alcance | "8.400 plantas", con la unidad explícita |
| Densidad | "3.333 plantas/ha" |
| Sin conversión | Con densidad cargada, el alcance sigue siendo 8.400 plantas: no se convirtió a hectáreas |
| Guardado y recarga | Tras recargar: variedades, alcance y densidad intactos |
| PDF | Encabezado con "Especie / Variedades", "Alcance evaluado", "Densidad de plantación", "Sistema productivo" y "Sustrato" |
| Correo | Vista previa con la frase y las tres variedades, **cero llamadas de red** (intercepté `fetch`: lista vacía) |
| Correo, ruta de envío real | El cuerpo que arma el envío lleva la frase exacta, una vez. **Acredita el contenido del cuerpo, no la entrega**: el transporte estaba interceptado y no salió ningún correo |
| Permisos (solo lectura) | 36 campos visibles, **0 editables** (solo el buscador), sin botón de Email ni de Aprobar |
| Concurrencia | La sesión con versión vieja fue **rechazada** ("NO se guardó · conflicto"); en la base quedó el cambio de la primera |

## 5 · Un defecto que encontró la propia revisión

Al marcar una variedad no se guardaba nada. La causa: dos `updInf` seguidos parten del mismo estado
y el segundo pisa al primero. Corregido con una sola escritura (`a4527fc`) y verificado en pantalla.

## 6 · Definiciones que faltan (solo lo que el Excel no trae)

**Del Excel (13)**, las que más pesan:
1. Las dos hojas no coinciden: 9 estados en "Manejos por estado" contra 8 en "Hoja1", y 20 labores
   existen solo en la primera (Deshoje, Ajuste de carga, Control de Botrytis, Malla / sombreo,
   Amarre / tutoreo, Personal de cosecha, Manejo evergreen…). **Cuál gobierna.**
2. "Polinización / colmenas" aparece con cuadro de macronutrientes en los estados 4 y 5, que parece
   copiado de Fertilización.
3. N/P/K/Ca/Mg solo se enumeran en Establecimiento: si aplica el mismo juego en el resto.
4. CE, frecuencia de pasadas y número de tocones no traen unidad.
5. Biometría solo dice "Comentarios", sin campos.
6. "Uniformidad establecimiento" tiene como única opción "Comentarios (Segregación de plantas por
   vigor)".

**Del encabezado**:
7. Unidad oficial de la densidad de plantación (¿plantas/ha?). **No bloquea**: hoy la unidad se
   escribe a mano y, si falta, el campo dice "sin definir".
8. ¿El alcance evaluado es por informe o por variedad? **Bloquea**: el número se imprime en el
   informe del cliente.

**Cerrado por el CFO el 2026-09-24**: el campo antiguo "Superficie evaluada (há)" es un dato
**válido en hectáreas** y así se conserva, con su procedencia. Ya no figura como pendiente. No se
reparte por variedad ni se convierte a plantas; cambiarle el significado sí pide confirmación.

**Opciones que no vienen en el Excel**: sistema productivo y sustrato quedan como texto libre hasta
que definas sus listas. No inventé ninguna.

## 7 · Lo que no se hizo

- No se envió ningún correo: solo vista previa.
- No se rediseñó la sección de labores: el Excel queda incorporado como catálogo y los estados ya
  están en uso; enganchar las respuestas tipadas de cada labor es un paso aparte.
- No se convirtió ninguna unidad.
- No se tocó el paquete tributario ni ninguna otra empresa.

---

## 8 · Estado al 2026-09-24 (segunda revisión)

Las 18 decisiones quedaron agrupadas en **cuatro bloques** para revisar con Nicolás, con el detalle
completo como anexo: ver `DECISIONES-INFORME-NICOLAS.md`. De los cuatro, **bloquean publicar**:

1. **Catálogo de estados** — el selector ya está en pantalla; si el listado cambia después, los
   informes emitidos quedan con un estado que dejó de existir.
2. **Alcance por informe o por variedad** — el número se imprime en el informe del cliente.

**No bloquean**: las unidades (CE, pasadas, tocones) y los campos dudosos del Excel, porque son
respuestas de labores que todavía no se muestran en pantalla, no se calculan y no se rellenan con
supuestos.

Sobre la prueba del correo: acredita que **el cuerpo contiene la frase**. No acredita la entrega: el
transporte estaba interceptado y no se envió ningún correo.

Siguiente paso acordado: revisión con Nicolás, cierre del catálogo y recién ahí el candidato
definitivo.

---

## 9 · Candidato definitivo (2026-09-25 / revisión 2026-09-28)

Con las respuestas de Nicolás, los dos bloques que bloqueaban publicar quedaron cerrados y el
candidato se completó:

| Decisión de Nicolás | Qué se implementó |
|---|---|
| "Lo que vale es la hoja 1, la otra no la consideres" | Catálogo = 8 estados de Hoja1, Floración y Cuaja en uno. Las 19 labores de la otra hoja quedan fuera, listadas por nombre. Lo guardado en informes antiguos se conserva |
| "Por variedad… se registre la superficie de cada una" | Una fila por variedad marcada, cada una con su valor y su unidad. Sin sumas entre unidades, sin conversión, sin reparto |
| "El estado fenológico que sea el mismo para todas las seleccionadas" | Uno solo por informe. La pantalla lo dice: "Uno solo por informe: el mismo para todas las variedades seleccionadas" |

### Revisión en el entorno aislado (rearmado)

El entorno aislado se cayó con la sesión anterior. Se rearmó **sin tocar producción**: Postgres y
PostgREST nuevos, la fila `osiris` sembrada desde la copia ya tomada el 2026-09-24 y `main` con
solo los dos usuarios sintéticos de prueba.

| Comprobación | Resultado |
|---|---|
| Alcance por variedad, unidades distintas | T11-719: **4 ha** · MegaEarly: **8.400 plantas**. No se sumó ni se convirtió |
| Falta una variedad | "Falta declarar: MegaEarly. No se convierte de há a plantas ni al revés." |
| Guardado y recarga | Tras recargar, ambos valores intactos |
| Estado fenológico | Nota visible: uno solo por informe, común a las variedades marcadas |
| PDF | "Alcance evaluado — T11-719: 4 ha · MegaEarly: 8.400 plantas" |

### Lo que sigue abierto (no bloquea)

Unidades de CE, frecuencia de pasadas y número de tocones, y los campos dudosos de Hoja1
(polinización con macronutrientes, macronutrientes por estado, Biometría, "Uniformidad
establecimiento", fecha obligatoria). Son respuestas de labores que **todavía no se muestran**: se
cierran cuando se cableen las respuestas por labor, que es un incremento aparte.

---

## 10 · Solicitud de publicación (2026-09-28)

`origin/main` se movió dos veces durante la preparación (9 commits de Frisku y Rendiciones). La
integración se rehizo **en local** contra la base vigente y se repitieron las pruebas.

### Identificadores

| | |
|---|---|
| **Paquete a autorizar** | la punta de `osiris/informes-integrado` (el commit de esta acta, solo documentación) |
| Código (último commit que toca `src/`) | `add4ece177368275ad091bc55bbb09484bd5ed53` |
| Merge de integración | `7d2bd43341f3407e0379fc3125760d0f01fd948c` |
| Base exacta | `origin/main` = `13465b4`, revalidada al cerrar |
| Production | desplegada desde `13465b4`, estado `success`, 2026-09-28 12:03 UTC |
| **Deployment de recuperación** | **`6709387105`** — `13465b4`, Production, success |
| Rama de revisión (NO se integra) | `prueba/informes-int-revision` |

### Diff completo contra `13465b4`

9 archivos, +2.858 / −33. Fuera de `src/osiris/`, `src/OsirisModule.jsx` y `docs/osiris-tech/`
no se toca **ningún** archivo.

```
docs/osiris-tech/ACTA-INFORMES-TECNICOS.md       260 +
docs/osiris-tech/DECISIONES-INFORME-NICOLAS.md   174 +
src/OsirisModule.jsx                             161 +-
src/osiris/correoInforme.js                      131 +
src/osiris/correoInforme.test.js                 238 +
src/osiris/fenologia.js                          653 +
src/osiris/fenologia.test.js                     398 +
src/osiris/informeAlcance.js                     462 +
src/osiris/informeAlcance.test.js                414 +
```

### Se conservan los demás carriles

Los 9 commits que `origin/main` sumó desde la base anterior están presentes en el paquete
(`13465b4`, `55d455e`, `2931c8c`, `ae886fa`, `7b21e2d`, `651471d`, `fed24fd`, `8c3bc7f`,
`fad4809`: siete de Frisku SharePoint y dos de Rendiciones), y sus archivos quedan **idénticos**
a `origin/main`.

### Pruebas sobre la integración

| | Base sola (`ae886fa`) | Paquete integrado sobre `13465b4` |
|---|---|---|
| Pasan | 1.005 | **1.123** |
| Fallan | 2 | **2** |
| Saltadas | 9 | 9 |

Las dos fallas son las mismas en los dos lados, comprobadas contra la base actual:
`paramsFrutaAnticipos` (anterior y ajena a Osiris) y `secHf1` (la rompieron los archivos de prueba
nuevos de Frisku en `origin/main`).

**Un tercer fallo que NO es tal**: en la corrida con paralelismo completo apareció además
`FriskuSharePointBuscador` (155 s). Corrido solo sobre el paquete integrado pasa 7/7 en 9 s, y la
corrida completa con `--maxWorkers=2` da exactamente las 2 fallas de siempre. Es un timeout por
carga de la máquina, no una regresión: el paquete agrega 4 suites y la corrida en paralelo se pasa
del tiempo. Queda declarado igual.

### Comprobaciones de cierre

| Comprobación | Resultado |
|---|---|
| Informe histórico con dos variedades | Muestra **12,5 ha del informe completo**, con su procedencia. Las dos variedades quedan "sin definir": **no se repartió** |
| Desmarcar y volver a marcar una variedad | MegaEarly vuelve con sus **8.400 plantas**. Nada se pierde en silencio (3 pruebas propias lo fijan) |
| Recuperación con el código anterior | Se sirvió `ae886fa` contra la misma base. Escribió lo suyo (país de un contrato, con `updated_at` nuevo) y **conservó** `variedades`, `alcanceVariedades` y `superficie`. Ojo: los conserva, **no los usa**: sigue mostrando una sola variedad y la superficie global |
| ¿Vale para `13465b4`? | Sí. Entre `ae886fa` y `13465b4` solo cambian `FriskuSharePointBuscador`, `friskuSharePointClient` y `RendicionesModule`: ningún archivo de Osiris ni de la ruta de guardado de la fila `osiris`. La prueba de recuperación se mantiene válida sin repetirla |
| Correo | La prueba acredita **el contenido del cuerpo**, no la entrega. No se envió ningún correo |

### Alcance de esta entrega

Entran: catálogo de estados de Hoja1, encabezado ampliado, variedades múltiples, alcance por
variedad con unidad explícita, etiqueta "Estado fenológico predominante" y la frase en el cuerpo del
correo.

**No entran las respuestas específicas por labor.** El Excel está incorporado como catálogo de
estados y labores, pero los campos y opciones de cada labor no están cableados en pantalla: el
Excel **no** está implementado completo.

---

## 11 · Reintegración sobre la base nueva (2026-09-28, tarde)

La autorización anterior (paquete `8f4e2a7` sobre `13465b4`) quedó sin efecto: el push estaba
bloqueado por el clasificador de permisos de la sesión y, con prioridad del CFO, Frisku publicó
antes un hotfix productivo de Liquidaciones. La base cambió.

### Qué cambió en la base

`13465b4` → **`8e7a078`**, un commit: *fix(frisku): liquidaciones no guardaban por duplicado OE
legado (grandfathering)*. Tres archivos, todos de Frisku:
`src/friskuLiquidacionesLogic.js`, su prueba, y `src/__tests__/friskuHelpers.dbSaveGeneric.test.js`
(solo la prueba; `friskuHelpers.js` no se tocó).

### Qué integración hizo falta

Merge local del mismo alcance sobre la base nueva, sin conflictos y sin agregar nada. El diff del
paquete contra `8e7a078` sigue siendo **9 archivos, +2.862 / −33**, todos de `src/osiris/`,
`src/OsirisModule.jsx` y `docs/osiris-tech/`.

### Evidencia anterior que sigue valiendo

`OsirisModule.jsx` no usa `dbSaveGeneric`, `friskuHelpers` ni `friskuLiquidacionesLogic`, y el
hotfix no toca ningún archivo de Osiris ni la ruta de guardado de la fila `osiris`. Por eso se
conservan sin repetir:

- La revisión visual en aislado: alcance por variedad con unidades distintas, histórico global sin
  repartir, desmarcar y volver a marcar sin perder el dato, persistencia tras recargar, permisos,
  concurrencia y el PDF.
- La comprobación del cuerpo del correo con la frase exacta (acredita contenido, no entrega).
- La prueba de recuperación con el código anterior: conserva `variedades`, `alcanceVariedades` y
  `superficie`, y **no los muestra**.

### Comprobaciones sobre la base nueva

| | Base sola (`8e7a078`) | Paquete integrado |
|---|---|---|
| Pasan | 1.025 | **1.134** |
| Fallan | 2 | **2** |
| Saltadas | 9 | 9 |

Build `CI=true`: `Compiled successfully`. Las dos fallas son las mismas a ambos lados:
`paramsFrutaAnticipos` y `secHf1` (esta última, según el carril Frisku, son PINs sintéticos en
archivos `.test` fuera de `/__tests__/`, que es lo único que excluye el guardia; queda como
follow-up de ese carril). Con `--maxWorkers=2` no reaparece el timeout de
`FriskuSharePointBuscador`, que en la corrida con paralelismo completo era un falso positivo por
carga.

### Identificadores para la autorización nueva

| | |
|---|---|
| **Paquete** | la punta de `osiris/informes-integrado` |
| Merge de integración | `d17cc7a6578fc9b79954d40fe75ca8947667313d` |
| Código (último commit que toca `src/`) | `add4ece177368275ad091bc55bbb09484bd5ed53` |
| **Base** | `origin/main` = `8e7a0788c22d1d0d92e3e0d15183d8f4af8598a4` |
| Production | desplegada desde `8e7a078`, `success`, 2026-09-28 13:23 UTC |
| **Deployment de recuperación** | **`6710975029`** |

La autorización anterior no cubre este par. Alcance idéntico al aprobado: no se agregó nada y el
paquete tributario sigue fuera.

**Salvedad**: Frisku avisó que su hotfix está desplegado pero **falta la prueba real de Carolina**.
Si de ahí sale un commit más, la base vuelve a moverse y hay que rehacer esta integración.

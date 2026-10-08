# Evidencia de la entrega B · cómo reproducirla

Dos clases de evidencia, con reglas distintas.

## 1 · Regresiones: fixtures sintéticos, en el repositorio

Todo lo que fija comportamiento usa datos **sintéticos**, versionados en
`src/osiris/fixturesReajuste.js`. No hay un solo dato real en las pruebas, y las fechas son
inventadas. Cualquiera reproduce estas cifras sin acceso a nada:

```bash
CI=true npx react-scripts test --watchAll=false \
  --testMatch "**/src/osiris/{reajusteAplicado,recuperacionReajuste,selloYAcciones,integracionReajuste}.test.js" \
  --testPathIgnorePatterns "/node_modules/" "/build/"
```

> El `--testPathIgnorePatterns` no es cosmético: sin él jest recorre el directorio `build/` de
> 16 MB y la corrida pasa de segundos a media hora.

El caso sintético es 41,97 ha × US$3.000, reajuste al 2 % anclado el 2026-07-01 por inicio del
período del servicio:

| Temporada | Base | Con reajuste | Diferencia |
|---|---|---|---|
| 2026/2027 | 125.910,00 | 125.910,00 | 0,00 |
| 2027/2028 | 125.910,00 | 128.428,20 | 2.518,20 |
| 2028/2029 | 125.910,00 | 130.996,76 | 5.086,76 |
| 2029/2030 | 125.910,00 | 133.616,70 | 7.706,70 |
| 2030/2031 | 125.910,00 | 136.289,03 | 10.379,03 |
| **Total** | **629.550,00** | **655.240,69** | **25.690,69** |

**Sobre el 130.996,76.** Reemplaza al 131.000,96 que informé en un reporte anterior, que era una
estimación hecha a mano. Y corrijo la explicación que di entonces: **no hay "redondeo por
cohorte"**. El motor compone con `Math.pow` desde la base original y redondea una sola vez al
final, sin arrastre. 125.910 × 1,02² = 130.996,764 → 130.996,76.

## 2 · Copia de datos reales: identificada, no subida

Los datos reales **no se suben al repositorio**. Lo que queda acá es su identificación, para que
otro pueda verificar que midió sobre lo mismo.

| | |
|---|---|
| Procedencia | Copia de la fila `osiris` de producción, tomada en solo lectura el 2026-10-01 y guardada en el entorno aislado de revisión |
| Archivo | `snapshot-osiris.json`, en el directorio de evidencia de la sesión (fuera del repositorio) |
| Tamaño | 251.573 bytes |
| **SHA-256** | `63da6475039b13cd7686ab379d958e6133c5812da61c66f9c9a6875fe42606b9` |
| Contenido | 23 contratos, 2 viveros |

**Comando:**

```bash
CI=true OSIRIS_SNAPSHOT=<ruta>/snapshot-osiris.json \
  npx react-scripts test --watchAll=false \
  --testMatch "**/src/osiris/impactoActivacion.test.js" \
  --testPathIgnorePatterns "/node_modules/" "/build/"
```

Sin `OSIRIS_SNAPSHOT` la suite **se saltea entera** (`1 skipped, 8 skipped`). Eso no es un fallo:
es que la evidencia sobre datos reales no se puede reproducir sin los datos.

**Resultados obtenidos sobre ese snapshot:**

| | |
|---|---|
| Contratos | 23 |
| Con activación | **0** |
| Estado de los 23 | `noActivable` |
| Filas de royalty comercial | 57 |
| Importe **bruto calculado por el motor** | US$ 13.504.590 |
| Importe **neto calculado por el motor** | US$ 11.478.901,50 |
| Contratos con términos bloqueados | 0 |
| Delta al evaluar la activación de cada uno | **cero** |

Esas dos cifras son lo que **calcula el motor**. No son facturación emitida ni cobros
acreditados: el motor no sabe nada de eso.

**Qué acredita este snapshot, y qué no.** Los 23 contratos **no tienen ninguna activación**. Lo
que estas 38 pruebas acreditan es **impacto cero sobre esos datos**: el paquete no mueve un peso
en lo que hay hoy. Lo que **no** demuestran es que una activación válida conserve sus importes,
porque no hay ninguna que medir. Esa afirmación se apoya en los **casos sintéticos sellados**,
comparados entre candidato y recuperación: `describe("Una activación sellada calcula lo mismo en
las dos versiones")` en `pantallaReajuste.test.js`, con las cinco temporadas contra importes
escritos y el total en 655.240,69. Es un describe plano, así que corre en las dos ramas con el
mismo `OsirisModule.jsx`.

### Las tres temporadas con antecedentes

| Contrato | Temporada | Antecedentes registrados |
|---|---|---|
| Agroextiende | 2024/2025 | Factura 112 y fecha de pago 2026-08-04. **No** tiene marca de pagada |
| Agrícola San Clemente Limitada | 2025/2026 | Factura 75, marcada como pagada, pago 2025-06-26 |
| Agrícola San Clemente Limitada | 2026/2027 | Factura 123, marcada como pagada, pago 2026-06-02 |

Un número, una marca y una fecha cargados por alguien **no son una conciliación** contra
contabilidad ni contra el banco. Para el mecanismo alcanza con que el antecedente exista: la
fila no se recalcula.

### Un snapshot que sí está en el repositorio

`audit/osiris-snapshot-2026-05-29/raw-osiris.json` (12 contratos) sirve para comprobar el
delta-cero sin acceso a nada. Da otras cifras —12 contratos, 11 filas, 5.421.240 bruto y
4.608.054 neto— y el delta sigue siendo cero. **No reemplaza al de 23**: es más viejo y más
chico, y se nombra para que nadie confunda una medición con la otra.

## 1 bis · La prueba de pantalla, que es la que faltaba

Dos veces seguidas pasó lo mismo: se revirtió un arreglo en la pantalla y la suite siguió
verde, porque las pruebas ejercitaban la **función** corregida y no el **sitio que la llama**.
`src/osiris/pantallaReajuste.test.js` renderiza la pantalla real (`ControlContratos`, exportado
para esto), hace clic y lee el DOM. Las reglas de linter miran el texto del código; esta prueba
ejecuta el código. Son cosas distintas y hacen falta las dos.

```bash
MSYS_NO_PATHCONV=1 CI=true npx react-scripts test --watchAll=false \
  --testMatch "**/src/osiris/pantallaReajuste.test.js" \
  --testPathIgnorePatterns "/node_modules/" "/build/"
```

**Contraprueba, que es lo que le da valor.** Se repone cada defecto y se comprueba que la
prueba falla. Los archivos se restauran y se verifica el hash. En la última corrida:

| Archivo | SHA-256, antes y después |
|---|---|
| `src/OsirisModule.jsx` | `beaf56e3d9c045cc61096d0522d0830ce137543057ed1c22510a468c4645d603` |
| `src/osiris/reajusteAplicado.js` | `2b7aba3e4f64c79984d42479c0c96d94634dd8f52b69526323a7cd92e9d254c4` |

> Una versión anterior de este documento publicaba un md5 que **no correspondía a ningún
> commit**: era el del archivo en el momento de una corrida previa, y el archivo cambió después.
> Es justamente el dato que sostiene "el archivo se restauró", así que queda corregido.

| Reversión | Resultado |
|---|---|
| Volver al aviso que ignora la activación (R4) | **2 fallan** |
| Quitarle el detalle de filas al aviso (R7) | **2 fallan** |
| Reponer el spread en `activarReajuste` (R3) | **1 falla** |
| Calcular la previa sobre las filas ya ajustadas (H3) | **1 falla** |
| Campo del porcentaje de vuelta a `parseFloat(valor) \|\| 0` | **2 fallan** |
| `upA` sin la guarda del sello | **1 falla** |
| `activar()` sin exigir los términos | **1 falla** |
| La guarda mirando la bandera cruda en vez del estado | **1 falla** |
| La columna Diferencia escondiendo las bajas | **pasa: sin red** |

Todas fallan **sin que la regla de linter intervenga**. La última no: hoy no existe un camino
que produzca una diferencia negativa, así que el cambio de la columna es **defensivo y no tiene
prueba de render**. Lo que sí queda fijado es la semántica del modelo.

**Una advertencia sobre las contrapruebas mismas.** La cuarta, en su primera versión, pasaba —y
parecía decir que el control no servía—. El planteo estaba mal: reponer las filas ajustadas es
el defecto H3, y lo estaba probando sobre un contrato **sin activar**, donde las dos listas de
filas son idénticas por definición, así que la reversión no cambiaba nada. Corregida, se prueba
sobre el contrato activado. Una contraprueba que no reproduce las condiciones del defecto da un
falso tranquilizador igual que una prueba mal escrita.

## 2 bis · Revisión en navegador, entorno aislado

La capa de pantalla no tiene pruebas, así que se verifica a mano sobre el **bundle del
candidato final**, en un entorno que no toca producción.

**Cómo se arma.** Copia desechable del commit exacto (`git worktree --detach`), en la que se
reemplaza el destino productivo por `http://127.0.0.1:3070`. Se comprueba que el bundle quede
con **cero** referencias a producción antes de servirlo. La copia se descarta después; no se
retira la configuración con restauraciones masivas.

**Contra qué se prueba.** Postgres + PostgREST locales en contenedores, con una copia de la
fila `osiris` más un contrato sintético `ct_sintetico_b`: 41,97 há × US$3.000, reajuste 2 %
confirmado desde 2026-07-01, y la temporada 2029/2030 con factura 999 pagada, para que haya
una fila protegida. Usuarios sintéticos con permisos distintos (`@prueba.invalid`).

**Las cifras objetivo se calculan antes, con el motor**, para que la pantalla tenga contra qué
compararse: total base 629.550, con reajuste **647.533,99**, y la previa debe anunciar
3 filas que cambian, 1 protegida y **US$ 17.983,99**.

### Lo comprobado en el candidato

| | Resultado |
|---|---|
| Vista previa en pantalla | 3 cambian · 1 protegida · 0 bloqueadas · $17.983,99 |
| Diálogo que se confirma | los mismos cuatro números |
| Cálculo efectivo | Fact total **$647.533,99** |
| Desglose por fila | `base $125.910 + ajuste $5.086,76 (x1.0404)` |
| Fila protegida 2029/2030 | **$125.910**, intacta, con su factura |
| Historial guardado | `impacto US$ 17.983,99`, autor real, fecha de hoy |
| Negarse en la confirmación | no cambia nada |
| Persistencia tras recargar | se reconstruye idéntico |
| Desactivar | vuelve a $629.550, con los dos eventos en el historial |
| Reactivar | tercer evento fechado hoy, después de la baja |
| Permisos | invocando el manejador de React **salteando el `disabled`**, la acción responde "Sin permiso de edicion en esta pestana" y no escribe. Vale para activar y para desactivar |
| Concurrencia | otra sesión escribe la fila → "⚠️ NO se guardó · conflicto". **El reintento también se rechaza** y la escritura ajena queda intacta |

La prueba de permisos se hace salteando el `disabled` a propósito: deshabilitar un control no
desconecta su manejador. Ese fue el agujero de T3, y es la razón por la que la guarda tiene
que estar dentro de la acción.

### Lo comprobado en la recuperación

Mismo contrato, ya activado. Calcula **$647.533,99**, idéntico. Conserva activación, sello e
historial. Ofrece **Desactivar** —que era H7— y al desactivar no atrapa nada: fecha, respaldo,
regla y sello quedan guardados, así que el candidato puede reactivar. Después de desactivar no
hay botón de activar y el aviso explica por qué. La concurrencia se comporta igual.

**Lo que el navegador NO pudo comprobar allá:** que `activar()` rechace *dentro* de la acción.
La interfaz de la recuperación no expone ningún camino que la alcance, así que eso lo sostienen
las pruebas de versión, no el navegador.

### Recorrido final, sobre los bundles de los candidatos definitivos

Candidato `main.0ae5d87c.js` (138c7f4) y recuperación `main.942751e7.js` (b4ec5d6), ambos con
**cero** referencias a producción.

| Comprobación | Candidato | Recuperación |
|---|---|---|
| Importes con activación vigente | $647.533,99 | $647.533,99, idéntico |
| Tres columnas separadas | base $125.910 · actual $128.428,2 · propuesto $128.428,2 | igual |
| Diferencia con los mismos términos | **$0** | **$0** |
| Fila protegida 2029/2030 | base $125.910 · actual $125.910 · propuesto — | igual |
| Aviso | "3 temporada(s) … llevan el reajuste, y 1 quedan en su valor base" | igual |
| Desactivar | pide motivo y confirmación, baja **US$ 17.983,99**, vuelve a $629.550 | igual, y **sí está disponible** (H7) |
| Tras desactivar, sello y respaldo | conservados | conservados: el candidato puede reactivar |
| Activar | diálogo con 3 cambian · 1 protegida · **US$ 17983.99**; previa sin activar muestra actual $125.910 y propuesto $128.428,2 | **no se ofrece**, y el aviso explica que esta versión no permite crear nuevas |
| Solo lectura | botón deshabilitado **y** la acción rechaza al invocar el manejador salteando el `disabled` | igual |
| Conflicto entre sesiones | "⚠️ NO se guardó · conflicto"; **el reintento también se rechaza** y la escritura ajena queda intacta | igual |

La prueba de permisos se hace a propósito salteando el `disabled`: deshabilitar un control no
desconecta su manejador. Ese fue el agujero de T3.

El entorno aislado quedó restaurado: 24 contratos, sin marcas de prueba.

### Recorrido de cierre, sobre los bundles definitivos

Candidato `main.82b848d8.js` (e900a40) y recuperación `main.dcd24572.js` (1c3f16d), ambos con
**cero** referencias a producción.

| Comprobación | Candidato | Recuperación |
|---|---|---|
| Activación vigente | $647.533,99 | $647.533,99, idéntico |
| Tres columnas | base $125.910 · actual $128.428,2 · propuesto $128.428,2 · dif — | igual |
| Fila protegida 2029/2030 | base $125.910 · actual $125.910 · propuesto — | igual |
| Aviso | "3 temporada(s) … llevan el reajuste, y 1 quedan en su valor base" | igual |
| Retirar | motivo + confirmación, baja US$ 17.983,99, vuelve a $629.550 | igual, y **sí disponible** |
| Activar de nuevo | previa anuncia +2.518,20 / +5.086,76 / +10.379,03 y el diálogo **US$ 17983.99**; aplica exactamente eso | **no se ofrece** |
| Solo lectura | botón deshabilitado **y** la acción rechaza al invocar el manejador salteando el `disabled` | igual |
| Conflicto entre sesiones | "⚠️ NO se guardó · conflicto"; **el reintento también se rechaza**; la escritura ajena intacta | igual |

### El caso de conflicto, en las dos versiones

Con la configuración antigua al 5 %/año sembrada sobre el mismo contrato:

| | |
|---|---|
| Estado | "EN CONFLICTO con la configuracion antigua" |
| Importe | **$695.732,23** — el que produce la configuración antigua |
| Botones | **solo Desactivar**. "Activar" no se ofrece sobre un registro existente |
| Panel | explica que la antigua está OPERANDO y que la activación nueva "queda registrada pero **no activa**" |
| Diálogo al retirar | *"Retirar este registro NO cambia los importes. La configuracion antigua (5 %/año) sigue OPERANDO y es la que produce los importes actuales. Desactivar el registro nuevo no la quita. El registro, sus terminos y su historial se conservan, con constancia de la baja."* |
| Importe después | **$695.732,23**, sin mover un peso |

> La retirada de la configuración antigua es **exclusivamente una prueba sintética**. No es una
> operación productiva autorizada.

El entorno aislado quedó restaurado: 24 contratos, sin claves de prueba.

### Lo que esta revisión encontró y las pruebas no

**R4.** Con el reajuste activado y $647.533,99 en pantalla, el encabezado seguía afirmando que
los montos no llevaban reajuste y que la activación no estaba hecha. Ninguna prueba lo iba a
ver: el motor estaba bien, la pantalla llamaba a la función equivocada.

## 2 ter · El sello es lo único que habilita cálculo

La corrección de fondo del cierre. `estadoActivacion` construía los términos vigentes **desde el
sello si existía, y si no desde los campos vivos**. Ese "si no" era la raíz del defecto crítico:
con la marca puesta y los campos llenos, el motor aplicaba sin que ninguna acción hubiera
sellado nada.

Ahora hay una sola condición: **un sello completo**, que solo produce `activar()`.

| Caso | El registro | ¿Habilita cálculo? |
|---|---|---|
| Sello completo | se conserva | **sí** |
| Sin sello, con los cuatro términos cargados | se conserva | **no** |
| Sello a medias (sin fecha, sin regla, regla inválida, sin porcentaje) | se conserva | **no** |
| Marca no booleana (`1`, `"true"`, `{}`) | se conserva | **no** |

Nada se normaliza ni se migra: preservar y bloquear son dos cosas distintas, y se hacen las dos.

**Un registro marcado sin sello NO es un estado imposible.** Lo afirmé y era falso: la revisión
demostró que se producía desde la pantalla, completando a mano los campos de un registro
atascado. Por eso se conserva como **caso negativo de regresión**
(`describe("Un registro marcado sin sello no aplica")`, plano, en las dos versiones), aunque los
casos de activación válida se construyan ahora llamando a la acción.

**Consecuencia sobre la previa**, que costó dos intentos entender: la simulación tiene que
**construir el sello que `activar()` produciría**. Conservar el anterior hacía que previa y
acción calcularan distinto; borrarlo sin reemplazo hace que la previa anuncie cero siempre,
ahora que el motor exige sello. Sellar igual que la acción es lo único que las mantiene diciendo
lo mismo por construcción. La simulación **no escribe nada**: ni la marca, ni el sello, ni un
evento de historial, y hay una prueba que lo comprueba.

## 2 quater · Las cinco contrapruebas de la octava ronda

Cada guarda nueva se revirtió en el árbol y se midió qué cae. Después se restauró el archivo y
se comprobó que el sha256 volviera a ser el mismo, para que no quede duda de que el árbol que
se entrega es el que se probó.

| # | Lo que se revirtió | Pruebas que caen | Qué miden |
|---|---|---|---|
| **CP-D1** | `"referencia"` fuera de `TERMINOS_BLOQUEABLES` | **4** | la lista; el control deshabilitado y el total que no se mueve; tras retirar; en conflicto |
| **CP-D2** | `puedeEditarTerminos` otra vez por vigencia | **2** | el modelo lo niega tras retirar; y los cuatro campos del panel no guardan nada |
| **CP-D3** | el aviso del 0 % leyendo la configuración de hoy y adelantándose | **3** | con la antigua al 5 %/año; sello 2 % / configuración −2 %; sello −2 % |
| **CP-D8** | el escape `campo="…"` del barrido, con un `<Campo campo="valorRoyaltyComercial" r={r}/>` sin guarda inyectado | **1** | la base sólo se escribe desde `upProtegido` |
| **CP-sello** | `selloCompleto` sin exigir `pct > 0` | **3** | el sello a medias; el aviso del 0 %; y el sello −2 %, que es la red económica que faltaba |
| **CP-T3** | prefijar el write de `upR` con `return ` **y** meter un `upd(r.id,"reajuste",{...})` directo en el control del Tipo | **1** | el control de T3, que antes de endurecerlo pasaba con esa inyección exacta |

Comandos, tal cual:

```bash
MSYS_NO_PATHCONV=1 CI=true npx react-scripts test --watchAll=false \
  --testMatch "**/src/osiris/*.test.js" \
  --testPathIgnorePatterns "/node_modules/" "/build/"

MSYS_NO_PATHCONV=1 CI=true OSIRIS_SNAPSHOT=<ruta del snapshot> \
  npx react-scripts test --watchAll=false \
  --testMatch "**/src/osiris/impacto*.test.js" \
  --testPathIgnorePatterns "/node_modules/" "/build/"
```

El `--testMatch` explícito y el `--testPathIgnorePatterns` no son adorno: sin el primero, en un
worktree el patrón por defecto resuelve con separadores mezclados y encuentra 0 pruebas; sin el
segundo, jest recorre el `build/` de 16 MB.

## 3 · Lo que las pruebas NO cubren

- **Render de React.** No hay pruebas de componente. Los defectos H1, H3, H7 y H8 de la primera
  revisión independiente, y R1 a R3 de la segunda, estaban todos en esa capa. Lo que la cubre hoy
  es la revisión en navegador aislado, que es manual y queda registrada en el acta de la entrega.
- **Dos controles de código sobre `OsirisModule.jsx`**, que sí son automáticos. Corrigen una
  versión anterior de este documento, donde describí el control de imports con más alcance del
  que tenía: comparaba cadenas, así que dejaba pasar los imports **con alias** —justo donde viven
  `activarReajuste`, `desactivarReajuste` y `reajusteActivadoDeFila`— y las constantes, que no se
  usan en posición de llamada. La segunda revisión lo demostró retirando `activar as
  activarReajuste` del bloque de import: la prueba pasó en verde con una referencia indefinida en
  el archivo.

  Lo que hay ahora, en `src/osiris/integracionReajuste.test.js`:

  | Control | Qué cubre | Qué NO cubre |
  |---|---|---|
  | `no-undef` real | **cualquier** referencia indefinida del archivo entero, con alias y constantes incluidas | otros archivos; errores que no sean referencias libres |
  | escapes en JSX | `\uXXXX`, `\xNN`, `\n`, `\t` y `\r` escritas en **texto** JSX **y en atributos** JSX, donde no se decodifican y se imprimen literales | las mismas secuencias dentro de cadenas o template literals de una expresión, donde sí se decodifican y son correctas |
  | sin spread al activar | que la pantalla no le pase un spread del registro anterior a `activarReajuste`, que era R3 | cualquier otra forma de arrastrar un campo viejo |
  | aviso con activación | que la pantalla no llame al aviso que ignora la activación, que era R4 | que el texto del aviso sea el correcto; eso lo comprueban las pruebas de R4 |

  La segunda y la cuarta son reglas sobre el **sitio de llamada real**, no réplicas de lo que
  la pantalla hace. Esa distinción importa: la primera prueba de R3 replicaba los argumentos
  en vez de mirar la pantalla, y la tercera revisión demostró que reponer el spread dejaba la
  suite en verde.

  Las dos corren un linter **en memoria**, sobre ese único archivo y con esas dos reglas. No
  tocan la configuración de lint del proyecto. Van con `noInlineConfig`, porque si no el
  `/* eslint-disable */` de la cabecera del archivo las apagaría — que es exactamente la razón
  por la que el build no vio H1. Y cada una tiene su contraprueba: una prueba retira un import y
  otra reintroduce un escape, para que se note si el control deja de controlar.

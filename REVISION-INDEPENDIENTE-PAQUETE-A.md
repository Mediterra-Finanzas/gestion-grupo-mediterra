# Revisión independiente del paquete A, y qué se hizo con cada hallazgo

Revisión de sólo lectura sobre el commit `e6f0d2e0` (padre `1bc5c447`, el código que sirve
Production), con alcance limitado al diff. Sin auditoría general del módulo.

**Resultado de fondo:** ninguna fuga económica, ninguna escritura de datos, ningún identificador
inexistente, ningún hook mal ubicado. Las cinco restricciones que te comprometí se respetan.

**Pero encontró seis cosas reales**, cuatro de ellas en mi propio trabajo de presentación y de
calidad de pruebas. Las corregí todas. Ninguna movía un número de producción.

---

## H1 · Las tres cifras del panel no sumaban ninguno de los totales que el propio panel citaba

**Era el hallazgo más importante, y era el mismo defecto que el paquete viene a denunciar.**

Las tres tarjetas suman 18.677.992,05. El texto del recuadro citaba 5.311.342,05 (la cabecera) y
19.493.523,00 (el bruto de las tres líneas). El 18,68 M no aparecía en ninguna parte, así que quien
sumara las tres tarjetas obtenía una cifra inexistente. La diferencia son exactamente los 815.530,95
de retención: las tarjetas llevan royalty planta neto, el bruto lo lleva bruto.

**Corregido.** El panel ahora declara la suma de los tres y su base, y el puente va en dos tramos
encadenados que sí cierran:

```
   5.311.342,05   total de cabecera
+ 13.366.650,00   royalty comercial omitido          (universo)
= 18.677.992,05   suma de los tres conceptos         <- antes no se declaraba
+    815.530,95   retención de royalty planta        (base)
= 19.493.523,00   pendiente bruto de las tres líneas
```

Y la base queda escrita en pantalla: *royalty planta en NETO de retención; contract fee, fee vivero
y royalty comercial en BRUTO*. Mezclar bases sin decirlo era justo lo que el paquete critica del
indicador de cabecera.

## H2 · Reimplementé el factor de retención en vez de usar el de producción

`paqueteA.js` calculaba `1 − retPct/100` por su cuenta. Producción usa `factorNetoFila`, que **cae
al país** cuando la fila no trae estado de retención (Chile 0%, el resto 15%). Hoy coinciden porque
las 51 filas del corte son todas derivadas y traen `retPct`. Pero `rpData` admite filas manuales
antiguas: una sola, de un país distinto de Chile y sin `retPct`, habría hecho que la cabecera
mostrara un número y el panel otro, bajo la frase "el indicador de la cabecera muestra…".

**Corregido.** `paqueteA.js` importa `factorNetoFila` de `src/osiris/retencion.js`. Ahora los dos
números son el mismo **por construcción**, no por los datos de hoy. Hay una prueba nueva que
verifica las cuatro ramas: 15% por país, 0% para Chile, 15% sin país, y el estado sellado en la
fila ganándole al país.

## H3 · La conciliación descartaba en silencio las filas sin contrato, y el aviso las contaba igual

El aviso decía *"N plantas registradas en 142 plantaciones"* usando el total de filas, mientras el
numerador sólo sumaba las filas ligadas a un contrato. Numerador filtrado, denominador sin filtrar.
Hoy no se ve porque el corte no tiene filas sueltas, pero con una sola la misma pantalla habría
mostrado dos "plantas registradas" distintas sin explicar por qué.

**Corregido.** El aviso usa los denominadores correctos, y si hay filas fuera de la conciliación
aparece una advertencia que las nombra y aclara que los indicadores sí las cuentan. Hay prueba de
comportamiento y prueba de render para ese caso.

## H4 · El control "cuadra" era una identidad algebraica: no podía fallar

Comparaba `Σ(bᵢ−aᵢ)` con `Σbᵢ−Σaᵢ` sobre las mismas filas. Siempre verdadero. Y aun así la pantalla
imprimía "la suma de las filas cuadra con el total" sobre esa base, que es peor que no tener
control: da confianza sin verificar nada.

**Corregido.** El control ahora verifica lo único que importa: que **lo conciliado más lo excluido
reconstruya el total que muestran los indicadores**. Eso sí puede fallar, y hay una prueba que lo
hace fallar a propósito para demostrarlo.

## H5 · Cinco aserciones más que no podían fallar

Además de la que yo ya había encontrado. La peor: *"el puente cierra"* comparaba
`igualBrutoTresLineas` con la suma de sus propios sumandos, que es literalmente su definición. El
puente no estaba probado.

**Corregido.** Las cifras esperadas se calculan a mano desde los datos de la fixture (3.000 brutos ·
2.550 netos · 450 de retención · 60.000 de fee · 70.000 de comercial), y en la prueba de evidencia
se recalculan aparte desde el corte en vez de pedírselas al módulo.

## H6 · La prueba de invariantes imprimía 15 y afirmaba 6, ninguno económico

Calculaba royalty planta neto, contract fee bruto, royalty comercial total, fee de OC y los estados
de las órdenes, los imprimía, y no los afirmaba. El mensaje del commit decía "con invariantes
económicos". **Era un listado, no una guardia, y la frase del commit era una exageración mía.**

Agravante que también señaló: los dos puntos de comparación "antes" estaban reimplementados con la
fórmula del paquete en vez de la de producción, así que la comparación era autorreferencial justo
donde estaba la divergencia de H2.

**Corregido.** Los 15 invariantes se afirman en bloque con un `toEqual` exacto, y el "antes" se
calcula con `factorNetoFila` y con la expresión literal de `totPend`.

---

## Menores, también corregidos

| Qué | Estado |
|---|---|
| `expect(new Date("2024-01-01").getFullYear()).toBe(2023)` **fallaba corriendo en UTC** (el revisor lo reprodujo: 1 failed con `TZ=UTC`). Habría roto cualquier corrida en CI | corregido: la prueba ahora afirma la *relación* con el huso, no un huso concreto. Verificado con `TZ=UTC`: 37/37 |
| La ruta del corte era la de una sesión concreta, así que nadie más podía reproducir la evidencia | corregido: `CORTE_OSIRIS=/ruta/al/archivo` la sobrescribe. El archivo sigue sin versionarse porque tiene datos de clientes |
| Las cabeceras del CSV decían "Fecha Pedido" y "Año Entrega" mientras los valores ya venían de la plantación | corregido: "Fecha pedido o plantación" y "Año" |
| El comentario del export decía "para renderizarlo en prueba" y no había tal prueba | ya estaba resuelto en el commit siguiente (`d528701c`), que el revisor no tenía. Son 8 pruebas de render |

## Lo que el revisor no pudo verificar, y cómo quedó

| Qué | Cómo quedó |
|---|---|
| No corrió el build | corrido aparte: `CI=true`, **exit 0, Compiled successfully** |
| No vio el JSX en runtime | cubierto por 8 pruebas de render que montan el componente de verdad con `@testing-library`. **No se levantó el dev server a propósito: en este repositorio hacerlo escribe contra producción** |
| H2 y H3 confirmados por lectura, no reproducidos (el corte no tiene filas manuales) | ambos tienen ahora prueba de comportamiento que los reproduce con filas sintéticas |

---

## Estado final del paquete

| | |
|---|---|
| Pruebas del paquete A | **52** · 37 de comportamiento + 7 de evidencia + 8 de render |
| Suite completa de Osiris | **en verde**, incluidas las de regresión e invariantes del motor económico |
| Build con `CI=true` | **exit 0** |
| Cifras de producción movidas | **ninguna** |
| Datos, estados o marcas de pago modificados | **ninguno** |

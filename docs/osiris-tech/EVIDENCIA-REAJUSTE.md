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
  | escapes en texto JSX | secuencias `\uXXXX` escritas en **texto** JSX, que no se decodifican y se imprimen literales | las mismas secuencias dentro de cadenas o template literals, donde sí se decodifican y son correctas |

  Las dos corren un linter **en memoria**, sobre ese único archivo y con esas dos reglas. No
  tocan la configuración de lint del proyecto. Van con `noInlineConfig`, porque si no el
  `/* eslint-disable */` de la cabecera del archivo las apagaría — que es exactamente la razón
  por la que el build no vio H1. Y cada una tiene su contraprueba: una prueba retira un import y
  otra reintroduce un escape, para que se note si el control deja de controlar.

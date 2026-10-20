# Plan de cierre · 26 de octubre

Estado al 2026-10-20. Candidato local `e6f0d2e0` en la rama `fix/osiris-paquete-a`.
**Sin push y sin despliegue**, como corresponde a la autorización.

---

## 0 · Un hallazgo que cambia la ruta de integración

Antes de cualquier plan: **producción sirve código de Osiris que `main` no tiene.**

| | Fecha | Líneas de `OsirisModule.jsx` | `src/osiris/preservacion.js` |
|---|---|---:|---|
| `1bc5c447` (lo que sirve Production) | 2026-10-15 | 16.109 | sí |
| `main` (`a599f47e`) | 2026-08-26 | 14.596 | **no** |

`main` está dos meses atrás en el área de Osiris y le faltan unas 15.800 líneas que producción sí
tiene, incluido `preservacion.js`, del que depende la atribución de órdenes de compra a contratos.

Por eso el paquete A está construido **sobre `1bc5c447`**, no sobre `main`: es el único árbol donde
las cifras de antes/después son comparables con lo que ves en pantalla.

**Consecuencia para el 26:** publicar el paquete A es un paso; reconciliar `main` con lo que sirve
producción es otro, más grande, y no es parte de este paquete. Hay que decidir cuál de los dos se
hace primero. Mi recomendación: publicar sobre la línea que ya está en producción y dejar la
reconciliación de `main` como trabajo propio, porque mezclarlos arriesga el cierre.

---

## 1 · Cierre técnico — lo que podemos entregar

### Entregable

El paquete A completo: `e6f0d2e0`, 5 correcciones, 1 archivo nuevo de lógica pura
(`src/osiris/paqueteA.js`), 2 archivos de prueba, 1 archivo modificado (`src/OsirisModule.jsx`).

### Lo que cambia en pantalla

| Cifra | Antes | Después |
|---|---:|---:|
| Plantas imputadas a 2023 | 414.840 | **255.190** |
| Plantas imputadas a 2024 | 235.174 | **394.824** |
| Σ hectáreas en Total Pedidos | 0,00 | **407,05** |
| Columna Entrega | "undefined Tundefined" | la fecha de plantación |
| Filtro Año | un solo valor vacío | los 5 años reales + "Sin fecha" |

### Lo que se agrega sin cambiar ninguna cifra existente

- Los tres indicadores de Plantas con su universo en el rótulo, y la conciliación de las 226.001
  plantas desplegable por contrato, con sus 15 filas y la suma cuadrada.
- El cobro de OC separado en declarado por estado (1.569.847,95) · documento registrado (50.600,00)
  · pago verificado (0,00), con el detalle de qué respalda cada uno.
- El pendiente separado en cobranza registrada (2.719.242,60) · calculado pendiente (4.769.799,45) ·
  proyección futura (11.188.950,00, toda ella con horizonte supuesto). Los tres suman 18.677.992,05,
  que es un número propio y queda declarado como tal, con su base. El puente va en dos tramos:
  cabecera 5.311.342,05 + comercial omitido 13.366.650,00 = 18.677.992,05, más retención 815.530,95
  = 19.493.523,00 en base bruta.

### Lo que NO se mueve, y está fijado por prueba

| Invariante | Valor |
|---|---:|
| Plantas registradas | 5.524.192 |
| Plantas marcadas pagadas | 313.320 |
| Plantas no marcadas pagadas | 5.436.873 |
| Royalty planta bruto pendiente | 5.436.873,00 |
| Royalty planta neto pendiente | 4.621.342,05 |
| Contract fee bruto pendiente | 690.000,00 |
| Royalty comercial total | 13.504.590,00 |
| Fee total de OC | 2.053.297,95 |
| Total de cabecera del hub | 5.311.342,05 |
| "Cobrado" de OC (ahora "declarado por estado") | 1.569.847,95 |
| Tandas marcadas pagadas | 5 |
| OC en "Pagada total" | 63 |
| OC anuladas | 0 |

La prueba de invariantes **no fija** la distribución por año, la suma de hectáreas, las opciones del
filtro ni los rótulos, porque son precisamente lo que el paquete corrige.

### Pruebas

- 37 pruebas de comportamiento con datos sintéticos (`src/osiris/paqueteA.test.js`), reproducibles
  en cualquier máquina y en cualquier huso horario (verificadas con `TZ=UTC`).
- 8 pruebas de render (`src/osiris/paqueteA.render.test.js`) que montan el componente de verdad: el
  archivo tiene `/* eslint-disable */`, así que el build no detecta una variable inexistente en el JSX.
- 7 pruebas de evidencia antes/después contra el corte de producción
  (`src/osiris/paqueteA.evidencia.test.js`), incluida la verificación del `sha256` del corte. Si el
  archivo del corte no está en la máquina, se saltan en vez de fallar: **el corte tiene datos de
  clientes y no se sube al repositorio.**

### Lo que falta para publicar

Una sola cosa: **tu autorización de merge con la frase literal**, y después el despliegue.

La revisión independiente del diff ya se hizo y encontró seis cosas reales, todas corregidas. Están
en `REVISION-INDEPENDIENTE-PAQUETE-A.md`. El build con `CI=true` da exit 0.

---

## 2 · Datos que deben validar los responsables

Las cinco fichas están en `PAQUETE-B-FICHAS-CONCILIACION.md`. Resumen de qué falta, de quién y para
cuándo:

| Ficha | Quién entrega | Qué | Cuándo lo necesitamos | Si no llega |
|---|---|---|---|---|
| **B1** Prosembra 600.000 | Nicolás (plantación) + Milagros (facturas) | 6 facturas con comprobante, OC `OLIVOS-CL-2024-01` original, registro de plantación 2025-26 | **viernes 23**, para alcanzar el 26 | el contrato queda marcado como no conciliado y su cifra no se usa en ningún tablero |
| **B2** OC repetida | Milagros | OC `AGROEX-CL-2024-04` original | viernes 23 | se deja el registro y se declara el sesgo posible: +25.000 plantas, +US$11.250 |
| **B3** 33 contradictorios | Milagros + Lorena (banco) | comprobante de pago de cada uno | **no alcanza para el 26** | quedan visibles como contradictorios, sin resolver. Es lo correcto: 33 conciliaciones bancarias no se hacen en 4 días |
| **B4** TEST PERU | Angelo | decisión | miércoles 21 | se deja y se declara el sesgo: +US$30.000 en contract fee, 23 contratos en vez de 22 |
| **B5** 19 sin fecha de término | Nicolás + Angelo | los 19 contratos, plazo y renovaciones | **no alcanza para el 26** | la proyección sigue rotulada como supuesta, que es lo que el paquete A ya hace |

**En los cinco casos, si el documento no llega, la consecuencia es declarar el sesgo, no ajustar el
número.** Eso es decisión tomada, no pendiente.

### Lo que sí es decisión tuya antes del 26

| Decisión | Por qué no puede esperar |
|---|---|
| B4: qué hacer con TEST PERU | ensucia un total que se va a publicar |
| Si el paquete A se publica sobre la línea de producción o se espera a reconciliar `main` | define la ruta de despliegue |
| Si se publica el paquete A con B3 y B5 abiertas | mi recomendación es sí: el paquete A **muestra** esas contradicciones en vez de esconderlas, así que publicarlo mejora la situación aunque los datos sigan sucios |

---

## 3 · Capacidades que siguen pendientes

Ninguna de estas se cierra el 26, y lo digo ahora para que no quede como sorpresa.

| Capacidad | Estado | Qué falta |
|---|---|---|
| **Conexión con el flujo de caja** | no existe | la proyección de Osiris en el flujo está tecleada en tres capas dentro de Finanzas (US$7.700.000 escritos en el código fuente + `params_osiris` + override manual de celda). El paquete C es el inventario; la conexión necesita antes la fuente única y el horizonte por contrato |
| **Respaldo documental del cobro** | no existe | no hay tabla de facturas ni vínculo factura→OC→tanda. Hay **0 cuotas de pago** cargadas en todo el sistema y **1 sola factura con importe**. Mientras no exista, "cobrado" seguirá siendo una declaración |
| **Estructura de líneas en la OC** | no existe | 69 registros de OC bajo 36 números; 29 OC cobran US$494.146,50 sin desglose por variedad. Sin cabecera y líneas no se puede cuadrar una orden contra su factura ni detectar una duplicación |
| **Participación del obtentor** | dos motores | uno por reglas y uno con 70%/10% fijo; el primero está bloqueado por campos que no existen. Hay que elegir uno |
| **Decisiones contractuales** | abiertas | anuladas, bajas, plantaciones de prueba, año de prueba, sublicenciatario, horizonte del royalty comercial, retención por país |
| **Reconciliación de `main` con producción** | abierta | ver sección 0 |

---

## 4 · Lo que el 26 significa y lo que no

**El 26 se puede cerrar el cierre técnico**: las pantallas dejan de afirmar cosas que no sostienen.
Eso es real y es entregable.

**El 26 no cierra la gestión de caja desde Osiris.** Para gestionar caja con información conciliada
hacen falta tres cosas que no dependen de código: la fuente única de cantidad, el horizonte por
contrato y la evidencia de cobro. Dos de las tres (B3 y B5) no alcanzan a resolverse en cuatro días,
y la tercera es diseño.

Dicho de otro modo: el 26 entregamos **pantallas que dicen la verdad sobre datos que todavía no
están conciliados**. Es un avance y conviene publicarlo, porque hoy las pantallas presentan como
cobranza lo que es una etiqueta y como deuda lo que es un supuesto. Pero no es lo mismo que poder
proyectar caja desde Osiris, y no conviene presentarlo así en el directorio.

---

## 5 · Carriles que siguen aparte

- **UAT del entorno de pruebas de Osiris** y **DEC-01** siguen su propio plazo. Este paquete no los
  toca ni depende de ellos.
- Los arreglos exclusivos del entorno de pruebas siguen separados del paquete productivo de labores.

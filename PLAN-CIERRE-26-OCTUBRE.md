# Plan de cierre · 26 de octubre

Estado al 2026-10-20. Candidato local `e6f0d2e0` en la rama `fix/osiris-paquete-a`.
**Sin push y sin despliegue**, como corresponde a la autorización.

---

## 0 · Me equivoqué: NO hay discrepancia entre main y Production

Dije que producción servía código que `main` no tenía. **Es falso.** Comparé contra la rama
**local** `main`, que lleva congelada desde agosto, en vez de contra `origin/main`.

### Lo verificado, con su procedencia

Verificación del 2026-10-20 16:52 UTC.

| Qué | Valor |
|---|---|
| Carpeta | `C:\Users\angel\Documents\Proyectos\gestion-grupo-mediterra` |
| Repositorio remoto | `https://github.com/Mediterra-Finanzas/gestion-grupo-mediterra.git` (`origin`) |
| Rama del checkout | `deploy-allpa` |
| HEAD del checkout | `ffda87c2eb2cb5ee7cb879e5d5924a17f545d9a5` |
| `origin/main` tras `git fetch` | **`1bc5c447748e97adda3c37ee9ca38029e7695a69`** · 2026-10-15 15:50:15 UTC |
| `main` **local** | `a599f47ea91eee697ccbd93df604581411be11d2` · 2026-08-26 14:08:28 −4 |
| Distancia de `main` local | **370 commits atrás** y 140 adelante de `origin/main` |

### El SHA que sirve el dominio productivo

| Qué | Valor |
|---|---|
| Dominio | `https://gestion-grupo-mediterra.vercel.app` |
| Bundle servido | `/static/js/main.466070a8.js` · 5.494.568 bytes · `sha256 78ad738aa2387b2e80be6ddd531101c0b00fcdb9a2ca17304d8e999d5036ff70` |
| `REACT_APP_VERCEL_GIT_COMMIT_SHA` incrustado | **`1bc5c447748e97adda3c37ee9ca38029e7695a69`** |
| `REACT_APP_VERCEL_TARGET_ENV` incrustado | `production` |
| `REACT_APP_VERCEL_GIT_PREVIOUS_SHA` incrustado | `778a397cdffeb28352dc19ff39bb44df25638dd0` |
| Cabeceras de la respuesta | `X-Vercel-Cache: HIT` · `Age: 368534` (≈ 4,27 días ⇒ en caché desde ≈ 2026-10-16 10:30 UTC) |

**El método:** el proyecto de Vercel tiene habilitado exponer sus variables de sistema, así que
llegan con prefijo `REACT_APP_` y Create React App las incrusta literalmente en el paquete. El SHA
no se infiere: está escrito en el bundle que sirve el dominio. La CLI de Vercel no se usó; `gh` no
está instalado en este equipo, así que la API de despliegues de GitHub no estuvo disponible y la
verificación se hizo contra el bundle, que es evidencia más directa.

### Contraste con los despliegues anteriores de este carril

`origin/main`, primer padre, los últimos del carril:

| SHA | Fecha UTC | Asunto |
|---|---|---|
| **`1bc5c447`** | 2026-10-15 15:50 | release: Créditos + correcciones de la vista semanal sobre producción (778a397) ← **servido hoy** |
| `d9611add` | 2026-10-15 13:34 | release: producción = 778a397 + Créditos; retira de main los 14 cambios no publicados |
| `e9c77895` | 2026-10-15 13:10 | fix(creditos): saldosAlCorte no cuenta como capital el interés capitalizado |
| `778a397c` | 2026-10-13 13:14 | ← **despliegue anterior**, según el propio bundle |

`778a397c` es el predecesor directo de `1bc5c447` en la rama, con 30 commits entre ambos. La cadena
es consistente: lo que sirve producción es la punta de `origin/main`, y el despliegue previo fue el
commit anterior de la misma rama.

### Por qué aparecía una base de agosto

La rama **local** `main` de este checkout dejó de moverse el 2026-08-26, cuando otro carril
mergeó ahí el trabajo de Allegria Foods C3-B **localmente y sin empujarlo**. Desde entonces nadie
corrió `git pull` sobre `main` en esta carpeta, así que la referencia quedó en ese punto mientras
`origin/main` avanzó 370 commits. Los 140 commits "adelante" son exactamente ese trabajo sin
publicar.

Mi error fue leer `main` en vez de `origin/main` y presentar la diferencia como deriva de
producción. **No reconcilié ni sobrescribí nada**, y no corresponde hacerlo desde este carril: esos
140 commits son de otro, y decidir qué pasa con ellos no es parte del paquete A.

### Consecuencia para el paquete A

La ruta de integración es la normal. El candidato está construido **exactamente sobre
`origin/main`**, que es el SHA que sirve producción. No hay nada que reconciliar antes de publicar.

---

## 0.bis · Identificación del candidato

| Qué | Valor |
|---|---|
| Rama | `fix/osiris-paquete-a` |
| SHA del candidato | **`624f5e6a2714338af6ccccbc3c33f43cb8505a41`** |
| Base exacta | **`1bc5c447748e97adda3c37ee9ca38029e7695a69`** |
| La base es | `origin/main` **y** el SHA que sirve producción |
| Commits | 5 |
| Estado | local, **sin push, sin merge, sin despliegue** |

Los cinco commits:

| SHA | Qué |
|---|---|
| `e6f0d2e0c51a4b78d474998abcea2418408fa5b9` | paquete A: las cinco correcciones |
| `a2596500a3f4e459dbb16b7057e4b2f21f361b24` | fichas B, inventario C y plan de cierre |
| `d528701ceab0d4679f0ef458a1ab7cccbb39fe09` | pruebas de render del JSX nuevo |
| `97bf703d8f8b24fdceec5a9dd4abac56073df915` | correcciones tras la revisión independiente |
| `624f5e6a2714338af6ccccbc3c33f43cb8505a41` | rótulos de cobranza |

Diff contra la base: **5 archivos de código y prueba**, más los documentos.

```
src/OsirisModule.jsx                    (modificado)
src/osiris/paqueteA.js                  (nuevo, logica pura)
src/osiris/paqueteA.test.js             (nuevo, 38 pruebas)
src/osiris/paqueteA.evidencia.test.js   (nuevo, 7 pruebas)
src/osiris/paqueteA.render.test.js      (nuevo, 8 pruebas)
```

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

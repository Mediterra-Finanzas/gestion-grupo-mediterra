# Paquete B · Fichas de conciliación

Para **Nicolás**, **Milagros** y **Lorena**.

Base: corte de producción del 2026-10-20 11:58 UTC (`sha256 48085f5b…`, 250.420 bytes), sobre
`1bc5c447748e97adda3c37ee9ca38029e7695a69` = `origin/main` = el SHA que sirve Production.

**Ningún registro real fue modificado para preparar estas fichas.** Cada una se cierra con un
documento. Lo que el sistema no tiene cargado **no se declara inexistente**: puede existir en papel.

Cada ficha lista los registros uno por uno, con su número de factura y su fecha, para que cada
persona pueda trabajar sobre una lista concreta y no sobre un total.

---

## B1 · Prosembra — 600.000 plantas entre la orden de compra y lo plantado

**Nicolás** (qué se plantó en terreno) con **Milagros** (qué se facturó).

### Registros

Plantaciones registradas, 3 filas, **955.705** plantas:

| Plantas | Fecha plantación | Estado | Variedad |
|---:|---|---|---|
| 66.710 | 2025-11-26 | Plantado | MegaEarly |
| 555.640 | 2025-11-26 | Plantado | MegaGem |
| 333.355 | 2026-02-09 | Plantado | MegaCrisp |

Tandas facturables, 6 filas, **1.555.705** plantas:

| Plantas | Factura | Fecha evento | Fecha de pago registrada |
|---:|---|---|---|
| 182.688 | **93** | 2025-11-11 | 2025-11-18 |
| 422.776 | **95** | 2026-01-06 | 2026-01-26 |
| 298.944 | **97** | 2026-02-05 | 2026-03-03 |
| 222.559 | **103** | 2026-03-09 | 2026-03-30 |
| 233.708 | **120** | 2026-04-09 | 2026-05-04 |
| 195.030 | **122** | 2026-05-08 | *(sin fecha registrada)* |

Órdenes de compra atribuidas al contrato:

| OC | Plantas | Fecha | Estado | Fee USD | Despachos |
|---|---:|---|---|---:|---:|
| `OLIVOS-CL-2024-01` | **1.555.705** | 2024-12-03 | Pagada total | 700.067,25 | 0 |
| `OLIVOS-CL-2025-01` | 333.355 | 2025-01-31 | Pagada total | 150.009,75 | 0 |
| `OC-MIG-1` | 955.705 | 2026-06-19 | — | 0,00 | 3 (suman 955.705) |

### El hecho que ordena lo demás

**La suma de las seis tandas es exactamente la cantidad de `OLIVOS-CL-2024-01`: 1.555.705.** Las
tandas se dimensionaron contra esa orden, no contra el registro de plantación, y se fraccionaron en
seis facturas. Cinco de las seis tienen fecha de pago registrada.

No se está facturando algo inexistente. Lo que falta cuadrar es el otro lado: las órdenes del
contrato suman 1.889.060 plantas y el registro de plantación tiene 955.705.

### Qué tiene que aportar cada uno

**Milagros** — las seis facturas y su comprobante de pago:
`93` · `95` · `97` · `103` · `120` · `122`. De la 122, además, si se emitió y si se cobró.

**Milagros** — la orden `OLIVOS-CL-2024-01` original firmada, con su cantidad y su fecha, y si
`OLIVOS-CL-2025-01` (333.355) es la misma plantación de MegaCrisp del 2026-02-09 u otra distinta.

**Nicolás** — el registro de plantación en terreno de la temporada 2025-26 de Prosembra: cuántas
plantas de cada variedad se plantaron y en qué fecha. Son tres fechas a confirmar: 2025-11-26 (dos
variedades) y 2026-02-09.

### Decisión pendiente

Cuál de los dos lados está incompleto: faltan plantaciones por cargar, o la orden quedó
sobredimensionada. Es el contrato que explica 600.000 de las 226.001 plantas de diferencia global.

---

## B2 · Un número de orden repetido, y una repetición exacta

**Milagros.**

### Corrección de lo que dije antes

Lo planteé como "una OC duplicada". El patrón es más amplio y en su mayoría **no** es duplicación:
el sistema guarda cada **línea** de una orden como un registro de OC aparte que comparte el número.
Por eso un número repetido es normal y una duplicación real es invisible.

De 69 registros de OC hay **36 números distintos**. Nueve números se repiten, cubriendo 42 registros:

| Número de OC | Registros | Variedades distintas | Cantidades distintas | Lectura |
|---|---:|---:|---:|---|
| `AGROEX-CL-2024-03` | 8 | 8 | 1 | 8 líneas, una por variedad |
| `FSFNDO-2023-01` | 6 | 6 | 1 | 6 líneas |
| `GOURME-CL-2025-01` | 7 | 7 | 2 | 7 líneas |
| `CPRIET-2023-01` | 5 | 5 | 2 | 5 líneas, 2 ubicaciones |
| `FRUSAN-CL-2024-01` | 5 | 5 | 2 | 5 líneas, **2 contratos distintos** |
| `AGROEX-CL-2024-04` | 4 | 2 | 2 | 3 líneas **+ 1 repetición exacta** |
| `OC-MIG-1` | 3 | 3 | 3 | número genérico de migración, **3 contratos distintos** |
| `IQP2022-006` | 2 | 2 | 1 | 2 líneas |
| `2025-2705` | 2 | 2 | 2 | 2 líneas |

### El único caso de repetición exacta

Un solo grupo coincide en número, variedad, cantidad, ubicación y fecha a la vez:

| id interno | Número | Variedad | Plantas | Fecha | Fee USD |
|---|---|---|---:|---|---:|
| `oc_1780607608114` | AGROEX-CL-2024-04 | MegaCrisp | 25.000 | 2024-08-02 | 11.250,00 |
| `oc_1780607674450` | AGROEX-CL-2024-04 | MegaCrisp | 25.000 | 2024-08-02 | 11.250,00 |

Los identificadores internos difieren en unos 66 segundos, compatible con una doble carga manual.
**Si fuera duplicación**, hoy suma 25.000 plantas y US$11.250 de más. Si fueran dos líneas legítimas
de la misma variedad, no sobra nada.

### Qué tiene que aportar

**Milagros** — la orden `AGROEX-CL-2024-04` original: si tenía una o dos líneas de 25.000 MegaCrisp.
Y por qué `FRUSAN-CL-2024-01` y `OC-MIG-1` cubren varios contratos con un mismo número.

### Decisión pendiente

Si se elimina uno de los dos registros de 25.000. **No se elimina por parecido.** Y, aparte, si la
orden de compra debe pasar a tener cabecera y líneas — eso es diseño, va al paquete C.

---

## B3 · Los 33 registros que se contradicen a sí mismos

**Milagros** (facturas) con **Lorena** (conciliación bancaria).

Ninguno se marca ni se desmarca automáticamente. El paquete A los muestra; resolverlos es documental.

### B3.1 · Royalty planta — 18 tandas, 2.708.226 plantas

Cada una tiene número de factura **y** fecha de pago registrada, con la marca `pagado` en false.
**Lista completa, para conciliar una por una:**

| # | Cliente | Factura | Fecha evento | Fecha de pago registrada | Plantas |
|---:|---|---|---|---|---:|
| 1 | Agroextiende | **47** | 2024-12-02 | 2024-12-23 | 50.600 |
| 2 | Agroextiende | **66** | 2025-03-07 | 2025-05-07 | 50.000 |
| 3 | Agroextiende | **66** | 2025-03-07 | 2025-05-07 | 37.500 |
| 4 | Agroextiende | **73** | 2025-06-02 | 2025-06-09 | 87.500 |
| 5 | Agroextiende | **74** | 2025-06-09 | 2025-06-23 | 87.501 |
| 6 | Agroextiende | **77** | 2025-06-24 | 2025-07-02 | 87.700 |
| 7 | Agroextiende | **109** | 2026-03-10 | 2026-03-31 | 105.840 |
| 8 | Agroextiende | **121** | 2026-04-09 | 2026-08-27 | 48.509 |
| 9 | Agrícola Huarmey | **96** | 2026-01-20 | 2026-02-16 | 285.405 |
| 10 | Corp. Agrícola Olmos | **87** | 2025-10-19 | 2025-11-12 | 57.811 |
| 11 | Corp. Agrícola Olmos | **91** | 2025-11-05 | 2025-11-12 | 190.950 |
| 12 | Pura Berries | **68** | 2025-05-05 | 2025-06-09 | 7.500 |
| 13 | Pura Berries | **92** | 2025-11-05 | 2025-11-17 | 250.735 |
| 14 | Prosembra | **93** | 2025-11-11 | 2025-11-18 | 182.688 |
| 15 | Prosembra | **95** | 2026-01-06 | 2026-01-26 | 422.776 |
| 16 | Prosembra | **97** | 2026-02-05 | 2026-03-03 | 298.944 |
| 17 | Prosembra | **103** | 2026-03-09 | 2026-03-30 | 222.559 |
| 18 | Prosembra | **120** | 2026-04-09 | 2026-05-04 | 233.708 |

Tres cosas que salen de la lista y acortan el trabajo:

- **Son 16 facturas distintas, no 18.** La factura `66` cubre dos tandas (50.000 + 37.500 = 87.500):
  un solo documento cierra las filas 2 y 3.
- **La factura `47` de Agroextiende, 50.600 plantas, coincide con la única factura cargada en una
  orden de compra** (`AGROEX-2024-01`, F-47, US$50.600, pagada el 2024-12-23). A US$1 por planta las
  dos cifras coinciden. Es la fila con más respaldo de las 18: puede ser la primera en cerrarse.
- Las cinco filas de Prosembra son las mismas de la ficha B1. Se concilian juntas.
- **La fila 8** (factura 121, Agroextiende) tiene fecha de pago 2026-08-27 contra un evento del
  2026-04-09: cuatro meses y medio. Conviene revisarla aparte.

### B3.2 · Contract fee — 14 contratos, US$420.000

El contrato guarda `contractFeeNFact`, `contractFeeEstado`, `contractFeePagado` y
`contractFeeFechaPago`. La pantalla de Ingresos **no lee ninguno**: arma el contract fee desde una
fila guardada aparte (`feeEntrada`), y en todo el corte **existe una sola fila guardada** — la de
Agroextiende, con `pagado=false`. Para los otros 22 contratos no hay fila, así que el valor por
omisión es "no pagado". De ahí salen los US$690.000.

| Cliente | Factura | Fecha de pago declarada |
|---|---|---|
| Agroextiende | 43 | 2024-09-25 |
| Danper Trujillo | 11 | 2022-07-13 |
| **Integrity Farms** | **102** | **(sin fecha registrada)** |
| Frunatural | 111 | 2026-03-30 |
| Agrícola Huarmey | 3 | 2023-01-30 |
| Giddings Berries Perú | 5 | 2022-05-06 |
| Corp. Agrícola Olmos | 16 | 2022-08-12 |
| **Mailand Farms** | **9** | **(sin fecha registrada)** |
| Agrícola San Clemente | 7 | 2022-04-28 |
| Agrícola Cerro Prieto | 8 | 2022-08-23 |
| Agroberries | 12 | 2022-07-11 |
| AGV Innovation & Varieties | 21 | 2023-03-15 |
| **Dole Perú** | **71** | **(sin fecha registrada)** |
| Agrícola Don Ricardo | 15 | 2022-09-08 |

Tres de los 14 se declaran pagados **sin fecha de pago registrada**: facturas **102**, **9** y **71**,
US$90.000. Y un caso aparte de los 14: **Prosembra tiene la factura 48 emitida con estado
"porCobrar"** — facturado y no cobrado — que la pantalla también cuenta simplemente como pendiente
sin mostrar que ya hay factura.

**Once de los 14 tienen fecha de pago de 2022 y 2023.** Son los más fáciles de cerrar: una cartola
del año cierra varios. Sugiero empezar por ahí y no por los recientes.

### B3.3 · Royalty comercial — 1 temporada, US$240.000

Agroextiende, temporada 2024/2025, factura **112**, fecha de pago registrada 2026-08-04, con un
override manual de 80 há a cobrar. Sin marcar como pagado.

### Qué tiene que aportar cada uno

**Milagros** — las 16 facturas de B3.1 y las 14 de B3.2, con su comprobante.
**Lorena** — la cartola de los meses de pago. Para B3.2, once de catorce caen en 2022-2023: dos o
tres cartolas anuales cubren casi todo.

### Decisión pendiente

Caso por caso. Lo que **no** corresponde es resolverlo por regla: ni "si tiene fecha de pago está
pagado" ni "si no está marcado no está pagado". Las dos reglas producen cifras falsas.

---

## B4 · "TEST PERU" — registro pendiente de validación

**Angelo.** Queda señalado, **no se elimina ni se excluye en silencio.**

### Qué es

| | |
|---|---|
| Contrato | `ct_1781092278705` |
| Razón social | TEST PERU |
| País | Peru |
| Fecha de contrato | 2024-01-10 |
| Contract fee | US$30.000, tipo "Sin Devolución", `contractFeePagado` en false |
| Plantaciones | 1 fila, **0 plantas y 0 há**, variedad MegaEarly, sin fecha de plantación |
| Tandas de royalty planta | 2 filas, **0 plantas** cada una (50% y 50%) |
| Royalty comercial | US$3.000/há, pero 0 há ⇒ aporta 0 |
| Órdenes de compra | ninguna |

### Su efecto, separado del resto

| Cifra publicada | Efecto de TEST PERU |
|---|---|
| Contract fee bruto pendiente (US$690.000) | **+US$30.000** |
| Conteo de contratos (23) | **+1** |
| Filas de plantación (142) | **+1**, con 0 plantas |
| Filas de tanda/despacho (51) | **+2**, con 0 plantas |
| Contratos sin fecha de término (19) | **+1** |
| Plantas registradas (5.524.192) | **0** |
| Plantas facturables (5.750.193) | **0** |
| Hectáreas (407,05) | **0** |
| Royalty planta pendiente | **0** |
| Royalty comercial (13.504.590) | **0** |
| Conciliación de los 226.001 | **0** (queda fuera por no tener filas con cantidad) |

Es decir: **su único efecto monetario son US$30.000 en el contract fee pendiente.** En todo lo
demás infla conteos de filas, no importes.

### Decisión pendiente

Si se elimina, si se marca como no productivo, o si se deja y se declara el sesgo. Hoy no existe una
marca de "registro de prueba" a nivel de contrato — sí existe `tipoPlantacion = "Prueba"` a nivel de
plantación, pero no de contrato. Crear esa marca es desarrollo, no dato.

---

## B5 · 19 contratos sin fecha de término

**Nicolás** con **Angelo.**

Cuando falta `fechaTermino`, el royalty comercial proyecta **11 temporadas** por un tope escrito en
el código (`fin = a1 + 10`), no por el contrato. Lista completa:

| # | Cliente | País | Fecha de contrato |
|---:|---|---|---|
| 1 | Carsol Genetics BV | Peru | 2022-06-23 |
| 2 | Mailand Farms SA de CV | Mexico | 2023-05-04 |
| 3 | Agrícola San Clemente Limitada | Peru | 2023-09-06 |
| 4 | TEST PERU *(ver B4)* | Peru | 2024-01-10 |
| 5 | Agroberries Limited | Peru | 2024-01-17 |
| 6 | Sociedad Agricola La Selva | Chile | 2024-05-30 |
| 7 | Agroextiende | Peru | 2024-10-09 |
| 8 | Hector Esquivel | Peru | 2024-11-11 |
| 9 | Prosembra S.A.C. | Peru | 2025-01-06 |
| 10 | Pura Berries S.A.C. | Peru | 2025-02-10 |
| 11 | Dole Perú SLR | Peru | 2025-05-19 |
| 12 | Diamond Bridge S.A.C | Peru | 2025-07-07 |
| 13 | Agrícola Huarmey SAC | Peru | 2025-09-08 |
| 14 | Gourmet Blueberries Perú SAC | Peru | 2025-10-02 |
| 15 | Corporación Agrícola Olmos S.A | Peru | 2025-11-17 |
| 16 | Danper Trujillo SAC | Peru | 2025-11-30 |
| 17 | Integrity Farms SpA | Peru | 2026-01-14 |
| 18 | Frunatural S de RL de CV | Mexico | 2026-03-16 |
| 19 | Corporación Agrolatina S.A.C. | Peru | 2026-03-20 |

Los 19 tienen royalty comercial de US$3.000/há, el mismo valor.

De los US$13.366.650 de royalty comercial pendiente:

| Concepto | Monto USD |
|---|---:|
| Temporadas ya iniciadas (2024/25 a 2026/27) | 2.177.700,00 |
| Temporadas futuras | 11.188.950,00 |
| de ellas, con horizonte supuesto por el código | **11.188.950,00** |

**Toda** la proyección futura descansa en ese supuesto.

### Qué tiene que aportar

**Nicolás** — de cada uno de los 19: el plazo del contrato y si tiene renovación automática. No hace
falta el contrato completo: basta la cláusula de vigencia. **Son 19 cláusulas, no 19 contratos.**

Sugiero el orden por antigüedad: los seis primeros de la tabla son de 2022-2024 y son los que más
temporadas proyectan de más si el plazo real es más corto.

### Relacionado, misma conversación

**36 órdenes de compra tienen fecha anterior al `fechaContrato` de su contrato.** Antes de llamarlo
error hay que definir qué es `fechaContrato`: la fecha del contrato original o la de la última
renovación. Si es la segunda, las 36 son normales. **Esa definición es una sola decisión y resuelve
las 36.**

### Decisión pendiente

El horizonte real por contrato. Mientras no esté, los US$11.188.950 no son cartera, y el paquete A
ya los muestra rotulados así.

---

## Resumen operativo

| Ficha | Quién | Qué documento, concretamente | Cuántos |
|---|---|---|---|
| B1 Prosembra | Milagros + Nicolás | facturas 93, 95, 97, 103, 120, 122 + OC `OLIVOS-CL-2024-01` + plantación 2025-26 | 6 facturas, 1 OC, 3 fechas de terreno |
| B2 OC repetida | Milagros | OC `AGROEX-CL-2024-04` original | 1 documento |
| B3.1 tandas | Milagros + Lorena | 16 facturas distintas (la 66 cubre dos filas) + cartolas | 16 facturas |
| B3.2 contract fee | Milagros + Lorena | 14 facturas, 11 de ellas de 2022-2023 | 14 facturas, ~3 cartolas anuales |
| B3.3 royalty comercial | Milagros + Lorena | factura 112 + cartola de agosto 2026 | 1 factura |
| B4 TEST PERU | Angelo | ninguno: es una decisión | — |
| B5 vigencias | Nicolás | la cláusula de vigencia de 19 contratos | 19 cláusulas |

**Si un documento no llega, la consecuencia es declarar el sesgo, no ajustar el número.**

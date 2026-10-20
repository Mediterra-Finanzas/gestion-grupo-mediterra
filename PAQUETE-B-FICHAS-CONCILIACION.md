# Paquete B · Fichas de conciliación

Para **Nicolás**, **Milagros** y **Lorena**.

Base: corte de producción del 2026-10-20 11:58 UTC (`sha256 48085f5b…`, 250.420 bytes), sobre el
código que sirve Production, `1bc5c447`.

**Ningún registro real fue modificado para preparar estas fichas, y ninguna se resuelve cambiando
datos desde el sistema.** Cada una se cierra con un documento. Donde no hay documento, la decisión
es del CFO, no del sistema.

Plazo para observaciones: **lunes 20 de octubre**. Lo que no llegue queda como decisión pendiente en
el cierre del 26.

---

## B1 · Prosembra — 600.000 plantas entre la orden de compra y lo plantado

**Responsable propuesto:** Nicolás (qué se plantó en terreno) con Milagros (qué se facturó).

### Lo que dice el sistema

Plantaciones registradas, 3 filas, **955.705** plantas:

| Plantas | Fecha plantación | Estado | Variedad |
|---:|---|---|---|
| 66.710 | 2025-11-26 | Plantado | MegaEarly |
| 555.640 | 2025-11-26 | Plantado | MegaGem |
| 333.355 | 2026-02-09 | Plantado | MegaCrisp |

Tandas facturables, 6 filas, **1.555.705** plantas:

| Plantas | Factura | Fecha evento | Fecha pago |
|---:|---|---|---|
| 182.688 | 93 | 2025-11-11 | 2025-11-18 |
| 422.776 | 95 | 2026-01-06 | 2026-01-26 |
| 298.944 | 97 | 2026-02-05 | 2026-03-03 |
| 222.559 | 103 | 2026-03-09 | 2026-03-30 |
| 233.708 | 120 | 2026-04-09 | 2026-05-04 |
| 195.030 | 122 | 2026-05-08 | *(sin fecha)* |

Órdenes de compra atribuidas al contrato:

| OC | Plantas | Fecha | Estado | Fee USD | Despachos |
|---|---:|---|---|---:|---:|
| `OLIVOS-CL-2024-01` | **1.555.705** | 2024-12-03 | Pagada total | 700.067,25 | 0 |
| `OLIVOS-CL-2025-01` | 333.355 | 2025-01-31 | Pagada total | 150.009,75 | 0 |
| `OC-MIG-1` | 955.705 | 2026-06-19 | — | 0,00 | 3 (suman 955.705) |

### El hecho que ordena todo lo demás

**La suma de las seis tandas es exactamente la cantidad de `OLIVOS-CL-2024-01`: 1.555.705.** Las
tandas se dimensionaron contra esa orden de compra, no contra el registro de plantación, y se
fraccionaron en seis facturas. Cinco de las seis tienen fecha de pago.

Por lo tanto **no se está facturando algo inexistente**. Lo que falta cuadrar es el otro lado: las
órdenes de compra del contrato suman 1.889.060 plantas y el registro de plantación tiene 955.705.

### Documentos que hacen falta

1. Las seis facturas (93, 95, 97, 103, 120, 122) con su comprobante de pago.
2. La orden de compra `OLIVOS-CL-2024-01` original, firmada.
3. El registro de plantación en terreno de la temporada 2025-26 de Prosembra.
4. Si `OLIVOS-CL-2025-01` (333.355) corresponde a la misma plantación de MegaCrisp del 2026-02-09 o
   a otra distinta.

### Decisión pendiente

Cuál de los dos lados está incompleto: falta cargar plantaciones, o la orden de compra quedó
sobredimensionada. **Mientras no se resuelva, ninguna cifra de este contrato es confiable en ningún
tablero**, y es el contrato que explica 600.000 de las 226.001 plantas de diferencia global.

---

## B2 · Un número de orden de compra repetido, y una repetición exacta

**Responsable propuesto:** Milagros.

### Corrección de lo que dije antes

Lo planteé como "una OC duplicada". Mirándolo bien, el patrón es más amplio y en su mayoría
**no** es duplicación: el sistema guarda cada **línea** de una orden como un registro de OC aparte
que comparte el número. Por eso un número repetido es normal y una duplicación real es invisible.

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

Los identificadores internos difieren en unos 66 segundos, lo que es compatible con una doble carga
manual. **Si fuera duplicación**, hoy suma 25.000 plantas y US$11.250 de más. Si fueran dos líneas
legítimas de la misma variedad, no sobra nada.

### Documentos que hacen falta

1. La orden `AGROEX-CL-2024-04` original, para saber si tenía una o dos líneas de 25.000 MegaCrisp.
2. `FRUSAN-CL-2024-01` y `OC-MIG-1`: por qué un mismo número cubre varios contratos.

### Decisión pendiente

Dos, y la segunda importa más que la primera:

1. Si se elimina uno de los dos registros de 25.000. **No se elimina por parecido.**
2. Si la orden de compra debe pasar a tener cabecera y líneas. Mientras una orden sean N registros
   sueltos que comparten un número, no hay forma de detectar una duplicación ni de cuadrar una
   orden contra su factura. Eso no es paquete B: es diseño, y va al paquete C.

---

## B3 · Los 33 registros que se contradicen a sí mismos

**Responsable propuesto:** Milagros, con Lorena para la conciliación bancaria.

Ninguno de estos registros se marca ni se desmarca automáticamente. Lo que el paquete A hace es
mostrarlos; resolverlos es documental.

### B3.1 · Royalty planta — 18 tandas, 2.708.226 plantas

Tienen número de factura **y** fecha de pago, con la marca `pagado` en false.

| Contrato | Tandas |
|---|---:|
| Agroextiende | 8 |
| Prosembra | 5 |
| Corporación Agrícola Olmos | 2 |
| Pura Berries | 2 |
| Agrícola Huarmey | 1 |

### B3.2 · Contract fee — 14 contratos, US$420.000

El contrato guarda `contractFeeNFact`, `contractFeeEstado`, `contractFeePagado` y
`contractFeeFechaPago`. La pantalla de Ingresos **no lee ninguno de esos campos**: arma el contract
fee desde una fila guardada aparte (`feeEntrada`), y en todo el corte de producción **existe una
sola fila guardada**, la de Agroextiende, con `pagado=false`. Para los otros 22 contratos no hay
fila, así que el valor por omisión es "no pagado". De ahí salen los US$690.000.

Los 14 contratos que declaran el fee pagado, con su factura:

| Cliente | Factura | Fecha de pago declarada |
|---|---|---|
| Agroextiende | 43 | 2024-09-25 |
| Danper Trujillo | 11 | 2022-07-13 |
| **Integrity Farms** | **102** | **(sin fecha)** |
| Frunatural | 111 | 2026-03-30 |
| Agrícola Huarmey | 3 | 2023-01-30 |
| Giddings Berries Perú | 5 | 2022-05-06 |
| Corp. Agrícola Olmos | 16 | 2022-08-12 |
| **Mailand Farms** | **9** | **(sin fecha)** |
| Agrícola San Clemente | 7 | 2022-04-28 |
| Agrícola Cerro Prieto | 8 | 2022-08-23 |
| Agroberries | 12 | 2022-07-11 |
| AGV Innovation & Varieties | 21 | 2023-03-15 |
| **Dole Perú** | **71** | **(sin fecha)** |
| Agrícola Don Ricardo | 15 | 2022-09-08 |

Tres de los 14 se declaran pagados **sin fecha de pago** (facturas 102, 9 y 71, US$90.000). Y un
caso más, aparte de los 14: **Prosembra tiene factura 48 emitida con estado "porCobrar"**, o sea
facturado y no cobrado, que la pantalla también cuenta simplemente como pendiente sin mostrar que
ya hay factura.

Son los US$420.000 de los US$690.000 que hoy aparecen como contract fee pendiente.

### B3.3 · Royalty comercial — 1 temporada, US$240.000

Factura 112 con fecha de pago, sin marcar.

### Documentos que hacen falta

Comprobante de pago o cartola bancaria por cada uno de los 33.

### Decisión pendiente

Caso por caso. Lo que **no** corresponde es resolverlo por regla: ni "si tiene fecha de pago está
pagado" ni "si no está marcado no está pagado". Las dos reglas producen cifras falsas.

---

## B4 · "TEST PERU" en producción

**Responsable propuesto:** Angelo.

### Lo que dice el sistema

Contrato `ct_1781092278705`, razón social "TEST PERU", 1 plantación con 0 plantas, con
US$30.000 de contract fee que entran al total de la pantalla.

### Efecto hoy

Ensucia el total bruto de contract fee y el conteo de contratos (23 incluye éste).

### Decisión pendiente

Si se elimina o se marca como no productivo. Hace falta una marca de "registro de prueba" que hoy
no existe a nivel de contrato — existe `tipoPlantacion = "Prueba"` a nivel de plantación, pero no
de contrato.

---

## B5 · 19 contratos sin fecha de término

**Responsable propuesto:** Nicolás con Angelo.

### Lo que dice el sistema

**19 de 23** contratos no tienen `fechaTermino`. Cuando falta, el royalty comercial proyecta
**11 temporadas** por un tope escrito en el código (`fin = a1 + 10`), no por el contrato.

De los US$13.366.650 de royalty comercial pendiente:

| Concepto | Monto USD |
|---|---:|
| Temporadas ya iniciadas (2024/25 a 2026/27) | 2.177.700,00 |
| Temporadas futuras | 11.188.950,00 |
| de ellas, con horizonte supuesto por el código | **11.188.950,00** |

Es decir: **toda** la proyección futura de royalty comercial descansa en ese supuesto.

### Relacionado, misma conversación

**36 órdenes de compra tienen fecha anterior al `fechaContrato` de su contrato.** Antes de llamarlo
error hay que definir qué es `fechaContrato`: la fecha del contrato original o la de la última
renovación. Si es la segunda, las 36 son normales.

### Documentos que hacen falta

Los 19 contratos, para su plazo y sus renovaciones.

### Decisión pendiente

El horizonte real por contrato. Mientras no esté, los US$11.188.950 **no son cartera**: son una
proyección con un supuesto uniforme, y el paquete A los muestra rotulados así.

---

## Resumen para la reunión

| Ficha | Quién | Qué se necesita | Si no llega el 20 |
|---|---|---|---|
| B1 Prosembra | Nicolás + Milagros | 6 facturas, OC original, registro de plantación 2025-26 | el contrato queda marcado como no conciliado en el cierre |
| B2 OC repetida | Milagros | la OC `AGROEX-CL-2024-04` original | se deja el registro y se declara el sesgo posible (+25.000 plantas, +US$11.250) |
| B3 33 contradictorios | Milagros + Lorena | comprobantes de pago | quedan visibles como contradictorios, sin resolver |
| B4 TEST PERU | Angelo | decisión | se deja y se declara el sesgo (+US$30.000) |
| B5 19 sin término | Nicolás + Angelo | los contratos | la proyección sigue rotulada como supuesta |

En los cinco casos, si el documento no llega, **la consecuencia es declarar el sesgo, no ajustar el
número.**

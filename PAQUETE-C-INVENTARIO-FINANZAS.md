# Paquete C · Inventario para conectar Osiris con el flujo de caja

**Nada de esto está implementado y la conexión no se hace en este paquete.** Es el inventario que
pediste: qué está cargado a mano hoy, y qué hay que resolver antes de conectar para no contar dos
veces.

Verificado sobre `1bc5c447` (lo que sirve Production) y el corte de datos del 2026-10-20.

---

## 1 · Osiris no alimenta el flujo. Hoy el flujo tiene su propia versión de Osiris

Esto es lo primero que hay que decir con claridad: **la proyección de ingresos de Osiris que ve el
flujo de caja no sale del módulo Osiris.** Está tecleada en tres capas distintas dentro de Finanzas,
y las tres conviven.

### Capa 1 — valores escritos en el código fuente

`FinanzasModule.jsx`, `EMPRESAS_STATIC["Osiris"]`, sección Ingresos Operacionales:

| Línea | Valor base |
|---|---|
| Cuentas por Cobrar | todo en cero |
| Fee Vivero | todo en cero |
| Royalty Comercial | todo en cero |
| **Royalty por Planta** | **arreglo escrito a mano en el código** |

El arreglo de Royalty por Planta tiene cinco cobros: 1.100.000 · 2.200.000 · 1.100.000 · 2.200.000 ·
1.100.000, repartidos en cinco meses, y ceros en los 41 meses siguientes. **US$7.700.000 escritos en
el archivo fuente.** Cambiarlos requiere editar código y desplegar.

### Capa 2 — `params_osiris`, dentro de la fila `finanzas` de Supabase

Por temporada, tres listas de cobros: `royaltyPlanta`, `royaltyComercial`, `feeVivero`. Cada cobro
es un triple `{mes_cobro, cantidad, tarifa}` tecleado en pantalla. El comentario del propio código
lo dice: *"temporal, hasta que vengan del módulo Osiris"*. Por omisión las tres listas están vacías.

### Capa 3 — override manual de celda

Desde la temporada 2026-27 en adelante, el CFO puede editar cualquier celda del flujo y ese valor
**prevalece sobre las dos capas anteriores**.

### Cómo se combinan hoy

No se suman: se reemplazan en cascada.

```
hasta temporada 26-27   →  manda el arreglo del código fuente
desde temporada 27-28   →  manda params_osiris (aunque esté en cero)
desde temporada 26-27   →  un override manual de celda le gana a las dos
```

**Hoy no hay doble conteo**, porque cada tramo tiene un único dueño. El riesgo aparece al conectar:
una cuarta capa derivada de Osiris tiene que entrar en esta cascada, no al lado de ella.

### Y una cosa más, que no es menor

El **Royalty IQ** (el costo del obtentor, 70% de royalty comercial más royalty planta, con desfase
trimestral, desde la temporada 27-28) se calcula **sobre estas líneas tecleadas**. Si cambia la
proyección de ingresos, cambia automáticamente el costo. Cualquier conexión mueve las dos cosas a
la vez.

---

## 2 · Las cargas manuales que existen dentro de Osiris

Además de las tres capas de Finanzas, dentro del propio módulo Osiris hay números que se teclean y
que no se derivan de nada:

| # | Dónde | Qué se teclea | Qué sostiene | Evidencia en el corte |
|---|---|---|---|---|
| 1 | `rpPlantaCuotas[].nPlantas` | las plantas de cada tanda facturable, aparte de plantaciones y despachos | la facturación de royalty planta | Prosembra: 6 tandas por 1.555.705 contra 3 plantaciones por 955.705 |
| 2 | `rcPagos[temporada].haCobrar` | override de hectáreas a cobrar | el monto de royalty comercial de esa temporada | San Clemente: 16,5 há en 2025/26 y 29,48 há en 2026/27, escritas a mano |
| 3 | `oc.cantidad_plantas` y `oc.fee_usd_planta` | cabecera de OC sin estructura de líneas | el fee de la OC | **29 de 69 OC no tienen línea alguna** y aun así cobran: **US$494.146,50 sin desglose por variedad** |
| 4 | `oc.estado_oc` | el estado que el sistema convierte en cobro | US$1.569.847,95 "cobrados" | 63 OC en "Pagada total", **0 cuotas de pago cargadas** |
| 5 | `ct.contractFee*` | factura, estado y fecha de pago del contract fee | nada: la pantalla no los lee | 14 contratos declaran pagado, la pantalla cuenta 0 |
| 6 | `feeEntrada` | la fila que sí lee la pantalla de contract fee | los US$690.000 pendientes | **1 sola fila guardada en toda la producción** |

---

## 3 · Lo que hay que resolver antes de conectar

### 3.1 · Elegir una fuente única por concepto físico

La misma cantidad de plantas está declarada de cinco maneras distintas en el mismo corte:

| Fuente | Plantas |
|---|---:|
| Plantaciones registradas en contratos | 5.524.192 |
| Tandas facturables (`rpPlantaCuotas`) | 3.523.261 |
| Cabeceras de OC (`cantidad_plantas`) | 5.734.209 |
| Líneas de OC (`items`) | 3.464.781 |

La diferencia entre cabeceras (5.734.209) y líneas (3.464.781) son esas 29 OC sin desglose.

| Despachos (`despachos`) | 2.995.738 |

Conectar el flujo a cualquiera de ellas sin declarar cuál es la autoritativa produce una proyección
que nadie puede reconciliar. **Esta decisión es previa a cualquier línea de código.**

### 3.2 · Resolver el solapamiento legacy / OC

La derivación de royalty planta tiene tres ramas mutuamente excluyentes, y el orden importa: si un
contrato tiene tandas cargadas, las tandas apagan la rama de despachos.

Hoy eso evita el doble conteo. Pero hay **3 contratos** donde la misma cantidad existe a la vez como
plantación registrada y como despacho de una OC migrada:

| Contrato | Plantado | Despachos migrados | Tandas que hoy apagan la otra rama |
|---|---:|---:|---:|
| Prosembra | 955.705 | 955.705 | 6 |
| Agrícola Huarmey | 602.550 | 590.590 | 2 |
| Corp. Agrícola Olmos | 278.363 | 278.363 | 2 |

Son **1.824.658 plantas** declaradas dos veces por vías distintas. Basta vaciar las tandas de uno de
esos contratos para que empiece a facturar por los dos lados. Es un doble conteo latente, a un clic
de distancia, y no hay nada en el código que lo impida.

Me corrijo: antes dije 2.995.738 plantas y 6 contratos. 2.995.738 es el total de despachos del
sistema; el solape real son 1.824.658 en 3 contratos.

### 3.3 · Separar cobranza de proyección antes de que el flujo las herede

El flujo de caja necesita fechas de cobro. Royalty comercial hoy proyecta así:

| Concepto | Monto USD |
|---|---:|
| Temporadas ya iniciadas (2024/25 a 2026/27) | 2.177.700,00 |
| Temporadas futuras | 11.188.950,00 |
| de ellas, con horizonte supuesto por el código | 11.188.950,00 |

Los US$11.188.950 salen de `fin = a1 + 10` — once temporadas por omisión — en los **19 de 23**
contratos sin fecha de término. Si eso entra al flujo tal cual, el flujo hereda el supuesto y lo
presenta como caja.

### 3.4 · Decidir base bruta o neta, y una sola

El indicador de cabecera de Osiris hoy suma royalty planta **neto** de retención (US$4.621.342,05)
y contract fee **bruto** (US$690.000) en el mismo total. El flujo de caja necesita una de las dos
bases, consistente, y además necesita saber dónde cae la retención como pago a la autoridad.

### 3.5 · Dar estructura de líneas a la orden de compra

Hoy una orden de compra son N registros sueltos que comparten un número: 69 registros bajo 36
números. Sin cabecera y líneas no hay forma de cuadrar una orden contra su factura, ni de detectar
una duplicación. Esto bloquea la conciliación que el flujo va a necesitar.

### 3.6 · Apagar la carga manual sólo cuando la derivada esté validada

Y nunca las dos a la vez. Mientras convivan, el flujo suma dos veces o ninguna según cómo se
conecte. El orden que propongo:

1. Decidir la fuente única (3.1) y el horizonte por contrato (3.3).
2. Conciliar el paquete B, para que la fuente elegida tenga datos confiables.
3. Derivar en Osiris una proyección de cobros con fecha, base declarada y origen trazable.
4. Mostrarla **al lado** de la capa manual en el flujo, sin reemplazarla, hasta que cuadren.
5. Recién entonces apagar la capa manual, tramo por tramo, con el Royalty IQ recalculándose.

---

## 4 · Lo que falta y no es decisión mía

| Qué falta | Quién lo decide |
|---|---|
| Cuál es la fuente autoritativa de plantas | Angelo con Nicolás |
| El horizonte de royalty comercial por contrato | Angelo con Nicolás (ficha B5) |
| Base bruta o neta en el flujo | Angelo |
| Si la OC pasa a cabecera + líneas | Angelo (es desarrollo, no dato) |
| Qué significa "cobrado" y con qué evidencia | Angelo con Lorena |

**Ninguna de estas cinco se cierra el 26 de octubre**, y el flujo de caja de Osiris depende de las
cinco.

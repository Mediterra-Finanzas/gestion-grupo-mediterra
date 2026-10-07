# Propuesta de carga — Allegria Foods · Cerezas 2026-2027

Inventario tomado de las capturas y del Excel exportado. Simulación en copia aislada.

| Mes | Anticipo Cerezas ANTES | DESPUÉS | Δ | Costo Fruta Exportación ANTES | DESPUÉS | Δ |
|---|---:|---:|---:|---:|---:|---:|
| Sep-26 | 0 | 138.000 | +138.000 | 0 | 0 | +0 |
| Nov-26 | 374.000 | 459.920 | +85.920 | 0 | 0 | +0 |
| Dec-26 | 374.000 | 537.450 | +163.450 | 450.500 | 450.500 | +0 |
| Jan-27 | 0 | 311.450 | +311.450 | 0 | 0 | +0 |
| Mar-27 | 3.077.000 | 1.616.300 | -1.460.700 | 1.700.000 | 1.383.000 | -317.000 |

## Lado CLIENTE

- Base: **3.825.000** · Saldo económico pendiente: **3.063.120**
- Realizado: **761.880**
- Pendientes con fecha: **1.446.820** (vencidos 138.000, horizonte 1.308.820)
- Pendiente de calendarizar (sin fecha): **0**
- Liquidación (Mar-27): **1.616.300**
- Proyectado sobre fechas estimadas: **1.308.820** · contractual vencido: **138.000**

## Lado PRODUCTOR

- Base: **2.150.500** · Saldo económico pendiente: **2.150.500**
- Realizado: **0**
- Pendientes con fecha: **450.500** (vencidos 0, horizonte 450.500)
- Pendiente de calendarizar (sin fecha): **317.000**
- Liquidación (Mar-27): **1.383.000**
- Proyectado sobre fechas estimadas: **0** · contractual vencido: **0**

## Qué estaba subestimado

**El total presupuestado de venta NO estaba subestimado**: sigue siendo
**3.825.000** (850.000 kg × 4,5), igual antes y después. Lo que estaba
subestimado son **los anticipos y su distribución en el tiempo**: las
estimaciones cargadas suman 960.500 acordados (212.500 + 374.000 + 374.000)
contra 2.208.700 de movimientos y compromisos reales (761.880 cobrados +
1.446.820 pendientes), y los meses en que caen no coinciden. Lo que cambia
es cuánta caja se adelanta a la liquidación y en qué mes, no el total de la
temporada.

## Conciliación por cuenta — PRESUNCIÓN, no comprobación

**Comprobados contra cartola: 0 de 4.**

| Fecha | US$ | Rótulo de la app | Qué significa aquí |
|---|---:|---|---|
| 2026-07-15 | 362.000 | «ya incluida en los saldos cargados» | presunción por fecha, sin verificar |
| 2026-08-24 | 39.980 | «ya incluida en los saldos cargados» | presunción por fecha, sin verificar |
| 2026-09-16 | 197.980 | «ya incluida en los saldos cargados» | presunción por fecha, sin verificar |
| 2026-09-24 | 161.920 | «ya incluida en los saldos cargados» | presunción por fecha, sin verificar |

El rótulo «ya incluida» que muestra la pantalla **no es una comprobación**.
La app solo compara la fecha del cobro con la fecha de corte más antigua
entre las cuentas cargadas (25/09/2026) y, al ser anterior, la presume
incluida. No sabe en qué cuenta entró el dinero, ni en qué moneda, ni si esa
cuenta estaba conciliada a esa fecha.

**No se puede concluir que no haya subestimación de caja.** Mientras no se
verifique, por cada movimiento, la cuenta que lo recibió y su cartola, los
cuatro siguen sin comprobar y el riesgo queda abierto.

## Diferencia pendiente de explicar

El Excel arranca Oct-26 con saldo inicial **148.112** y la pantalla de Saldos
Bancos muestra **147.970** para Allegria Foods: **142 USD** de diferencia.
Queda registrada como **pendiente de explicar**. No se le atribuye causa: no
hay evidencia de a qué se debe.

## Lado productor — tres bolsas separadas, sin mezclar

| Bolsa | US$ | Estado | Tratamiento |
|---|---:|---|---|
| Don Alberto, confirmados NO ejecutados | 317.000 | compromiso firme, **sin fecha** | cuotas vigentes sin mes · reservados, no proyectan |
| Don Alberto, ejecución POR CONFIRMAR | 362.000 | informado, sin fecha verificada | antecedentes · no cuentan como realizado, no proyectan |
| Estimaciones de anticipo vigentes | P1 450.500 (Dec-26) | abierta | proyecta en su mes |
| | P2 178.500 (Nov-26) | cerrada | pasa a liquidación, no proyecta |
| | P3 0 (Sep-26) | abierta | sin efecto |

Las tres bolsas son independientes. Nada pasa de una a otra por parecido de
monto ni por coincidir el mes.

### Lo que falta decidir, con su efecto

¿P1 (450.500 en Dec-26) incluye los 317.000 de Don Alberto? Y si los incluye,
¿el remanente de 133.500 sigue siendo un compromiso estimado?

| Respuesta | Dec-26 costo | Liquidación Mar-27 | Por pagar |
|---|---:|---:|---:|
| **A** · P1 no es de Don Alberto | 450.500 | 1.383.000 | 2.150.500 |
| **B** · P1 los incluye · remanente 133.500 sigue vigente | 133.500 | 1.700.000 | 2.150.500 |
| **C** · P1 los incluye · remanente ya no es compromiso | 0 | 1.833.500 | 2.150.500 |

El saldo por pagar es 2.150.500 en las tres: lo que cambia es **en qué mes**
se proyecta la caja, no cuánto se debe. Los 317.000 quedan sin fecha en las
tres, y los 362.000 siguen como antecedentes en las tres.

# Osiris · Notas de crédito y anulaciones — reglas, controles y capacidad

**Capacidad preparada en staging. No concedida a ninguna persona. Sin cambios en
producción ni en saldos históricos.**

Incorpora las decisiones del 2026-09-10: separación entre quien registra y quien
aprueba, sin autoaprobación; la anulación queda visible y trazable; la nota de
crédito se vincula a su factura con respaldo documental.

---

## Punto de partida medido

En la fila `osiris` de producción no existe ningún registro de nota de crédito,
anulación, cobro parcial, comprobante ni conciliación. No hay historia que migrar.

## Qué quedó preparado en staging

| Objeto | Qué hace |
|---|---|
| `osi_ajuste` | un ajuste por fila: contrato, concepto, factura, tipo, documento, respaldo, moneda, monto, fecha, motivo, quién registró |
| `osi_ajuste_evento` | historial append-only: `registrado`, `aprobado` o `rechazado`, con actor, fecha y motivo |
| `osi_ajuste_estado` | vista con el estado vigente de cada ajuste |
| `osi_ajuste_registrar(...)` | exige la capacidad `osiris.ajuste.registrar` |
| `osi_ajuste_resolver(...)` | exige `osiris.ajuste.aprobar` y que el actor NO sea quien registró |

Las dos capacidades usan el modelo IAM existente (`iam_rol_capability` +
`proc_has_capability`). **No se agregaron a ningún rol.** Tablas y vista sin acceso
directo para `anon` ni `authenticated`; solo por las funciones.

## Controles, probados — 14/14

Todas las pruebas corrieron dentro de una transacción que se revirtió. Residuos
medidos después: 0 usuarios de prueba, 0 asignaciones de rol, **0 asignaciones de
`osiris.ajuste.*` a cualquier rol**, 0 ajustes.

| # | Caso | Resultado |
|---|---|---|
| 1 | registra quien tiene la capacidad | registrado |
| 2 | quien registra intenta aprobar | rechazado: `sin_capacidad_aprobar` |
| 3 | sin capacidad intenta registrar | rechazado: `sin_capacidad_registrar` |
| 4 | **un rol con ambas capacidades aprueba lo que registró** | **rechazado: `autoaprobacion_prohibida`** |
| 5 | aprobador distinto aprueba | aprobado |
| 6 | segunda resolución del mismo ajuste | rechazado: `ajuste_ya_resuelto` (índice único, resiste carreras) |
| 7 | rechazo sin motivo | rechazado: `motivo_obligatorio` |
| 8 | nota de crédito sin respaldo documental | rechazado por restricción |
| 9 | anulación sin motivo suficiente | rechazado por restricción |
| 10 | corrección de un ajuste errado | nuevo ajuste que lo revierte, vinculado |
| 11 | editar un ajuste | rechazado: append-only |
| 12 | borrar el historial | rechazado: append-only |
| 13 | insert directo a la tabla como `authenticated` | rechazado: sin permiso |
| 14 | estado visible de los tres ajustes | aprobado, registrado, registrado — ninguno oculto |

## Reglas

1. **Una anulación nunca borra.** La factura y su historia siguen; el ajuste de
   anulación queda con motivo, actor y fecha, visible con su estado.
2. **Una nota de crédito se vincula a su factura** (`factura_ref`) y exige respaldo
   documental: ruta y SHA-256.
3. **Quien registra no aprueba**, tampoco si su rol tiene ambas capacidades.
4. **Una sola resolución por ajuste.**
5. **Inmutable.** Un ajuste errado se compensa con otro que lo cite (`revierte_a`).
6. **Moneda de tres letras, monto positivo, fecha del documento.**
7. **Un contrato en conflicto no debe recibir ajustes** hasta conciliarse. Esta
   regla vive en la aplicación (bloqueo de la fila en conciliación); no está en la base.

## Lo que no está resuelto

| Pendiente | Por qué |
|---|---|
| Saldo no negativo | la base de staging no tiene las facturas; se valida en la aplicación con `saldoDe()` y queda como control a llevar al servidor cuando las facturas tengan tabla |
| Quién recibe cada capacidad | decisión tuya y del carril de identidad; no se concede por defecto |
| Dónde se guarda el PDF | Osiris no usa Storage hoy; entra en el alcance del incidente de adjuntos, que coordina PLATFORM SECURITY |
| Captura en la aplicación | la pantalla de registro y aprobación no está construida |
| Producción | nada de esto existe en producción |

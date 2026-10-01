# Aplicar en producción la conciliación aprobada: propuesta para decidir antes del merge

> **Estado: PROPUESTA, no implementada.** No hay autorización de escritura en producción.
> Este documento define cómo se aplicaría el resultado exportado desde la vista previa
> local (`conciliacion_creditos_<fecha>.json`) **sin sobrescribir** pagos ni otros
> cambios registrados en producción después de descargar el respaldo.

## El riesgo que hay que evitar

Entre la descarga del respaldo y la aplicación pasan días: en producción se siguen registrando pagos, nóminas y valores manuales.

- Si se restaura el respaldo conciliado, aunque sea solo la fila `finanzas`, **se borra todo lo ocurrido después**.
- La app ya tiene un botón **"📤 Restaurar"** que hace exactamente eso, reemplazando todas las filas. **No debe usarse para esto.**

## Principio

Aplicar **operaciones**, no filas. Cada operación del archivo exportado se reaplica sobre los datos **vigentes** de producción, leídos en el momento de aplicar. Antes de aplicar se comprueba que el dato que toca siga igual que en el respaldo (su valor "antes").

## Procedimiento propuesto

1. **Requisitos:**
   - merge aprobado;
   - resultado JSON revisado y aprobado por el CFO;
   - un **💾 Respaldo nuevo** de producción del mismo día, como punto de retorno.
2. **Lectura fresca** de las filas involucradas (`finanzas`, `nominas_*`, `maestro_tc`), con su `updated_at`.
3. **Ensayo (no escribe nada).** Cada operación se clasifica en:

   | Clase | Significado | Qué se hace |
   |---|---|---|
   | **Aplicable** | el dato está igual que en el respaldo | se aplica |
   | **Ya aplicada** | el id ya existe igual en producción, por ejemplo un reintento | se omite (idempotente) |
   | **Conflicto** | el dato cambió en producción después del respaldo, o hay un posible duplicado | **no** se aplica; se informa con ambos valores para que decidas |
   | **No encontrada** | el crédito, pago o línea ya no existe o la huella no es única | no se aplica; se informa |

4. **Informe del ensayo:** operaciones por clase, más **todo lo registrado en producción después de la fecha del respaldo** en los créditos afectados (pagos, conciliaciones, valores manuales). Lo aprueba el CFO.
5. **Aplicación:**
   - Solo las operaciones aplicables y aprobadas, en **una escritura por fila**, condicionada a que el `updated_at` siga siendo el leído en el paso 2. Es el contrato de persistencia que ya usa la app.
   - Si alguien guardó entretanto, la escritura se rechaza y se vuelve al paso 2.
   - Nada queda a medias.
6. **Verificación posterior:**
   - re-lectura de producción;
   - la conciliación por acreedor debe dar el mismo estado que en la vista previa local, salvo lo informado como conflicto;
   - comparación pantalla–Excel.
7. **Registro de auditoría:** archivo aplicado, SHA-256, operaciones aplicadas, omitidas y en conflicto, usuario y fecha.

## Reglas por operación

| Operación | Aplicable si… | Conflicto si… |
|---|---|---|
| `agregar_pago` | el crédito se identifica y no existe un pago con ese id | en producción, desde el respaldo, ya hay un pago **vigente** en la **misma cuota** (`vencKey`) que pueda ser el mismo abono (posible duplicado). Hay que decidir |
| `anular_pago` | el pago existe y sigue **vigente** | el pago fue modificado o tiene anotaciones nuevas (si ya está anulado: ya aplicada) |
| `agregar_conciliacion` (impaga) | la cuota sigue sin pagos vigentes | en producción se registró un pago para esa cuota después del respaldo |
| `agregar_saldo_informado`, `agregar_cobertura`, `agregar_resolucion_credito` | no existe ese id | se registró otra decisión para la misma empresa, línea y mes |
| `cambiar_campo` (desglose, condiciones, `control_desde`…) | el valor actual es **igual** al "antes" | el valor actual difiere del "antes" |
| `cambiar_valor_manual` / `retirar_valor_manual` | el valor manual actual es igual al "antes" | cambió |
| `cambiar_config_creditos` | la configuración actual es igual a la del respaldo | cambió |
| `agregar_tc` | no existe ese par y fecha, o es igual | existe con otro valor (un valor **manual** en producción prevalece) |
| `QUITADO_*` | **nunca** | siempre se informa: la app no borra, es una alerta |
| `agregar_historial` | junto con las operaciones de su crédito | — |

## Identidad del crédito

- Si en producción el crédito tiene `uid`, se usa ese.
- Si no lo tiene (registros antiguos), se busca por la **huella**: n, empresa, acreedor, moneda, monto, vencimiento, cuota y tipo. Debe haber **un solo** crédito que calce; si hay cero o varios, es "no encontrada".
- Al aplicar la primera operación sobre un crédito antiguo, se le fija el **uid exportado** (`cr-<n>-<posición>`). Así las claves de cuota de los pagos (`uid@fecha`) coinciden, aunque la posición en la lista haya cambiado.

## Decisiones pendientes

1. **Quién y cómo aplica:**
   - Opción A: una pantalla "Aplicar conciliación" en Créditos, que se activa con el merge y solo puede usar el CFO.
   - Opción B: un script asistido que se ejecuta con tu supervisión.
   - Ambas usarían el mismo motor de ensayo y aplicación.
2. **Plazo máximo** entre el respaldo y la aplicación. Propuesta: 7 días. Si se excede, se recomienda volver a descargar el respaldo y repetir la conciliación, porque crecen los conflictos.
3. **Conflictos de posible duplicado:** ¿los resuelves uno a uno (propuesto) o con un criterio general?

Nada de esto se implementa ni se ejecuta sin tu aprobación explícita.

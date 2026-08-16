# PROC-REPORTING-DAILY-001 — Informe Diario de Operación · Contrato de integración

**Estado: RESERVADO — NO implementado.** Este documento fija el contrato para que la
capability pueda materializarse **después de T10e sin rediseñar la Ficha Cliente ni el
modelo de datos de T10d**. No crea scheduler ni envía emails. Sin merge/deploy/producción.

## 1. Objetivo
Enviar automáticamente, **todos los días**, un email con el resumen de operación de
Allegria Service. Como mínimo, **por CLIENTE**:
- Kg recibidos del día
- Kg procesados del día

## 2. Separación fundamental (D-report-1)
El diseño DEBE separar dos conceptos que hoy la Ficha Cliente ya trata como distintos:
- **Cliente reportado** = la entidad cuya operación se resume (fila del informe).
- **Destinatarios del email** = a quién se le envía (pueden ser internos y/o externos, y
  distintos del cliente reportado).

Un informe diario puede reportar N clientes y enviarse a M destinatarios que no coinciden
con esos clientes. Nunca derivar el destinatario del "cliente reportado".

## 3. Fuente de los kilos (D-report-2) — SoT, no frontend
Los kg **provienen del ledger / SoT operacional**, NUNCA de sumas recreadas en el frontend:
- **Kg recibidos del día**: movimientos de entrada de recepción del ledger
  (`proc_movimiento` con `tipo_movimiento='recepcion'`, `naturaleza='entrada'`,
  `objeto_tipo='lote'`) agrupados por `proc_recepcion.cliente_servicio_vinculo_id` y fecha
  operacional. Es la misma fuente que la conciliación de masa T10c-MASA.
- **Kg procesados del día**: Σ de consumo a órdenes (`proc_orden_insumo` / movimientos de
  consumo) agrupados por `proc_orden_proceso.cliente_servicio_vinculo_id` y fecha. Es la
  misma base que F6 usa para valorizar (kg PROCESADOS, no recibidos).

Recomendación: un **read-model** `proc_v_reporte_diario_operacion(empresa_id, fecha,
cliente_vinculo_id, cliente, kg_recibido, kg_procesado)` (security_invoker, RLS por tenant)
que agregue desde el ledger. La capability lee de ahí; no recalcula en React.

## 4. Fecha operacional (D-report-3)
El informe se define por **fecha operacional** (no `created_at`). Debe incluir el **total
general** además del desglose por cliente.

## 5. Configuración (D-report-4) — NADA hardcodeado
Estructura de configuración persistida (tabla nueva, ej. `proc_reporte_config` +
`proc_reporte_destinatario`), tenant-scoped, RLS estricta:
- destinatarios configurables (uno o varios emails; internos y/o externos) — **separados del
  cliente reportado** (§2).
- hora de envío configurable.
- activar/desactivar (flag por configuración).
- opcional: filtros (planta/temporada), formato.

## 6. Ejecución y entrega (D-report-5)
- **scheduler server-side** (NO client-side; la app corre como anon en el browser). Opciones
  a evaluar en su fase: cron de Supabase/pg_cron, función Edge, o job externo. El envío de
  email reutiliza `emailHelper` (infra neutral) como el resto del sistema.
- **preview** del informe antes de enviar.
- **envío manual** (además del automático).
- **snapshot** del informe enviado (inmutable, como el patrón F5/F7.6): se guarda lo que se
  envió, no se recalcula después.
- **historial de envíos** con estado `pendiente|enviado|error` (patrón `proc_informe_envio`).
- **retry** de envíos con error.
- **idempotencia**: no enviar dos veces el mismo informe diario por una ejecución accidental
  (clave única por `empresa_id + fecha_operacional + configuración`; una ejecución repetida
  para la misma fecha no genera un segundo envío).

## 7. Qué NO cambia de T10d (garantía de no-rediseño)
- La **Ficha Cliente** (`proc_cliente_ficha`) y el read-model `proc_v_cliente_servicio` NO
  requieren cambios para soportar reporting: el cliente reportado se identifica por
  `cliente_servicio_vinculo_id`, ya presente en recepción y orden.
- El **destinatario** es un concepto propio del reporting (§2), NO un campo de la ficha.
- Los kg salen del ledger (§3), independientes de la UI de Ficha.

Por lo tanto, PROC-REPORTING-DAILY-001 es **aditivo** sobre lo ya construido y no obliga a
tocar T10d. Si en su materialización apareciera una necesidad estructural no contemplada
aquí (p. ej. identidad de destinatarios externos que no existan como vínculo), corresponde
**STOP-AND-REPORT** antes de inventar arquitectura.

## 8. Secuencia
Se implementa **después de T10e**. No antes. Este documento sólo fija el contrato.

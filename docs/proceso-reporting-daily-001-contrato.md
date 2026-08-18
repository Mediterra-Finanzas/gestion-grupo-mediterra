# PROC-REPORTING-DAILY-001 — Informe Diario de Operación · Contrato + Materialización

**Estado (2026-08-18): MATERIALIZADO — REPORTING ENGINE VALIDATED + ALERTAS CABLEADAS.**
`AUTOMATIC SCHEDULER = BLOCKED (PROC-REPORTING-SCHEDULER-GAP — decisión de plataforma server-side)` · `EMAIL PROVIDER E2E = BLOCKED (server-side, no ejercitable en dev)` · `MANUAL SEND = PREPARED` · `ALERTAS (§13) = MATERIALIZADO` (colector `proc_fn_informe_diario_alertas` congelado en el snapshot cuando `incluir_alertas`, renderizado en email HTML/texto y preview).
Regresión 2026-08-18 tras T10C (fecha operacional) + PROC-ENVASES-001: SQL A–R TODOS PASARON, JS reportingEmail/dominio/listado verdes, REP-30 (envases NO altera kg del informe — usa `proc_movimiento`, no `proc_envase_movimiento`) confirmado. Build `Compiled successfully`.
El contrato original de integración se conserva íntegro más abajo (§1–§8). Sin merge/deploy/producción.

---

## MATERIALIZACIÓN (schema_proc_reporting_daily_v1.sql + UI + tests)

**Arquitectura.** Aditivo sobre F2 (ledger) + F7.3 (orden) + T6–T8 (cliente); no toca esas tablas.
Tres tablas tenant-scoped con RLS estricta + read-model + motor de ejecución.

**Fuentes de kg (SoT, nunca frontend).** `proc_fn_informe_diario_operacion(empresa, fecha, planta?, cliente?, tz)`:
- **Kg recibidos** = `SUM(proc_movimiento.cantidad)` con `ref_tipo='recepcion' AND objeto_tipo='lote' AND naturaleza='entrada'`, unido a `proc_recepcion` para el `cliente_servicio_vinculo_id`.
- **Kg procesados** = `SUM(proc_orden_insumo.kg)` (consumo real), unido a su movimiento de consumo (fecha) y a la orden para el cliente. NUNCA kg programados/estimados/frontend.
- Agrupa por **CLIENTE del servicio** (un cliente consolida N productores/predios/cuarteles/especies). Recepciones/órdenes sin cliente caen en la fila `(sin cliente asignado)` para no ocultar kg.

**Fecha operacional / timezone.** El corte diario es `(proc_movimiento.fecha AT TIME ZONE tz)::date = p_fecha`. `tz` sale de `proc_reporte_config.timezone` (default `America/Santiago`), NO del navegador. Test N prueba que 02:00Z cae el día previo en Santiago y el mismo día en UTC (determinístico).

**Configuración** (`proc_reporte_config`, tenant-scoped, nada hardcodeado): activo, planta (null=todas), timezone, hora_envio, enviar_sin_movimiento (default false), incluir_alertas, alcance (`general`|`cliente`) + `alcance_cliente_vinculo_id`, asunto_prefijo.

**Destinatarios** (`proc_reporte_destinatario`, separados del cliente reportado): nombre, email, tipo (`interno`|`externo`), activo, ligados a una config. **Cliente reportado ≠ destinatario**: el `alcance` de la config define QUÉ datos salen; el destinatario define A QUIÉN. Un externo atado a una config `alcance='cliente'` sólo recibe ese cliente (aislamiento resuelto en backend — test I).

**Motor + snapshot + idempotencia.** `proc_fn_reporte_generar_ejecucion(empresa, config, fecha, actor)`: usa el MISMO read-model que el preview, congela `snapshot` jsonb + `destinatarios_snapshot` + totales, e inserta una `proc_reporte_ejecucion`. **Idempotente** por índice único `(empresa, config, fecha_operacional)` + `ON CONFLICT DO NOTHING` (carrera → devuelve la existente). Segunda llamada devuelve la MISMA ejecución (test L). Snapshot **inmutable** por trigger `proc_fn_reporte_ejec_guard` (bloquea mutar snapshot/totales/fecha/destinatarios) — los informes históricos no se recalculan (test H).

**Estados.** `pendiente | procesando | enviado | error | omitido`. Sin movimiento + política `no enviar` → `omitido` (auditable, test F). `enviado` SÓLO vía `proc_fn_reporte_marcar_enviado(proveedor, message_id)` con confirmación real (no se fabrica). `proc_fn_reporte_marcar_error(error)` + `proc_fn_reporte_reintentar` (error→pendiente, reusa snapshot, no recalcula). Intentos acumulan (tests G, P).

**Preview.** `previewInformeDiario` llama al mismo `proc_fn_informe_diario_operacion` read-only; el dataset del preview == el del envío (test Q).

**Envío manual (PREPARED).** UI "Enviar ahora" → `generar_ejecucion` (idempotente) → arma el email con `construirEmailInformeDiario` (snapshot, formatters canónicos) → `enviarEmail` (infra neutral `emailHelper`, Vercel `/api/send-email` + fallback EmailJS) → registra el resultado real (`marcar_enviado` con message_id, o `marcar_error`). Indica si crea nueva / reintenta / ya enviado (idempotencia). **No marca enviado sin proveedor real.**

**Scheduler (BLOCKED — PROC-REPORTING-SCHEDULER-GAP).** El corte diario automático necesita ejecución server-side (Vercel Cron / pg_cron / Edge) + configuración de deploy + secretos productivos, que este entorno no provee (no hay `vercel.json` con `crons`, no se despliega). El motor (`generar_ejecucion`) queda listo para que ese job lo invoque por cada config activa; **no se inventa ni simula** el scheduler.

**Email provider (BLOCKED para validación E2E).** `emailHelper`/`/api/send-email` existe como infra neutral pero sólo corre en el entorno desplegado; el envío real no es ejercitable en PG16/dev, así que la transición a `enviado` no se valida end-to-end aquí (queda `error`/`pendiente` reintentable).

**RLS/tenant.** Las 3 tablas: `ENABLE+FORCE`, policy `empresa_id=proc_current_empresa()`, `REVOKE anon`, `GRANT authenticated`. Vista `proc_v_reporte_ejecucion` `security_invoker`. Gate: anon DENY (tablas+vista+RPC), tenant A/B aislados, cross-tenant DENY (tests S, T).

**Bounded-context.** Cero dependencia a `frisku_*`/`friskuBI`/`exp_*`/`osi_*`. Foods puede ser cliente Service sólo vía `proc_vinculo` (test J). `emailHelper` es infra corporativa neutral (no acopla a otro contexto).

**Tests.** `proc_reporting_daily_tests.sql` A–R (funcional, PG16) + gate RLS S,T. JS `reportingEmail.test.mjs` 16/16 (armado del email desde snapshot, sin UUID visible, escape HTML, alertas, empty state).

**Regresión / build.** Cadena limpia F1–F7.7 + T1–T9 + T10c-QC + T10c-MASA + T10d + T10e + reporting → **29/29 suites VERDE**, sin exclusiones. JS dominio/format/PDF/reporting PASS. `CI=true npm run build` → Compiled successfully.

**Gaps reales.** (1) Scheduler automático (server-side) — GAP declarado. (2) Envío real de email — depende del entorno desplegado. (3) `incluir_alertas` deja el flag y el builder de email acepta `alertas`, pero la recolección de alertas operacionales para adjuntarlas se cablea cuando el scheduler/servicio server-side las provea (read-models CURRENT ya existen). (4) Revisión visual/live pendiente (Visual QA final).

---

## CONTRATO ORIGINAL DE INTEGRACIÓN (histórico, T10d — conservado)

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

# PROC-REPORTING-DAILY-001 · Runbook de despliegue del scheduler (Vercel Cron)

**Estado**: `SCHEDULER CODE = VALIDATED` · `PRODUCTION EMAIL E2E = PENDIENTE (gate de deploy)`.
No desplegado. Este runbook documenta cómo activarlo y verificarlo en Preview/Production.

## Arquitectura

- **Cron**: `vercel.json` → `{ path: "/api/proc-reporting-daily-cron", schedule: "0 23 * * *" }` (una vez al día, 23:00 UTC). Plan **Vercel Hobby** (confirmado): 1 ejecución diaria.
- **Endpoint** `api/proc-reporting-daily-cron.js` (server-side, service_role): autentica el cron, busca
  configs activas, evalúa "due" por `hora_envio`/`timezone`, genera la ejecución **idempotente**
  (`proc_fn_reporte_generar_ejecucion`), envía el email (`enviarCorreo` de `api/send-email.js`) y marca
  `enviado`/`error`. Una config que falla no frena las demás. No contiene lógica de negocio.
- **Motor de negocio**: `proc_fn_*` (kg, alertas, snapshot, idempotencia) — NO cambia.

## Variables de entorno (Vercel → Settings → Environment Variables)

| Variable | Uso | Entornos |
|---|---|---|
| `CRON_SECRET` | Autenticación del cron (`Authorization: Bearer <CRON_SECRET>`). **Fail-closed**: sin ella, 401. | Production (+ Preview para probar) |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso server-side a Supabase (bypassa RLS para iterar tenants). Ya usada por `api/_auth.js`. | Production, Preview |
| `SMTP_ALLEGRIA_USER` / `SMTP_ALLEGRIA_PASS` | Cuenta SMTP M365 de Allegria (envío real). Fallback a `SMTP_MEDITERRA_*`. | Production, Preview |

**Nunca** commitear secretos ni imprimirlos en logs. Vercel inyecta `CRON_SECRET` automáticamente en el
header `Authorization` de sus invocaciones Cron.

## Plan Vercel — convención Hobby (CURRENT: gestion-grupo-mediterra / mediterra-finanzas)

El proyecto está en **Hobby** → **un solo disparo diario**. Diseño adaptado:

- **Cron**: `"0 23 * * *"` (23:00 UTC). Vercel Cron se expresa en **UTC**; la lógica operacional sigue en
  **America/Santiago**. 23:00 UTC = **19:00 Santiago (invierno UTC-4)** / **20:00 (verano UTC-3)** → la tarde,
  con el día operacional de hoy ya completo. El informe cubre `fecha operacional = hoy` (Santiago).
- **`hora_envio` (gobierna el negocio, gate "no antes de")**: en Hobby el envío real ocurre en el único disparo
  diario (~19:00–20:00 Santiago). Para que la config siempre quede "due" en ese disparo (ambas estaciones DST),
  configurar **`hora_envio ≤ 19:00` (recomendado `18:00`)**. Si se pone una hora posterior a ~19:00, el disparo
  de ese día no la enviaría (quedaría para el siguiente disparo diario). No se finge precisión por minuto.
- **Múltiples horarios/día o precisión horaria**: requieren plan **Pro** → volver a `"0 * * * *"` (cada hora),
  con lo que cualquier `hora_envio` se respeta. Es el único cambio necesario para migrar a Pro.
- Verificar plan: Vercel → Project (gestion-grupo-mediterra) → Settings / Crons.

## Cómo verificar

1. **Deploy Preview** con las env vars puestas también en Preview.
2. **Trigger manual seguro** (simula el cron):
   ```bash
   curl -i -X POST "https://<preview-url>/api/proc-reporting-daily-cron" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
   Respuesta esperada: `200 { ok:true, procesadas, enviadas, errores, omitidas }`.
   Sin/incorrecto el secret → `401 { error:"unauthorized" }`.
3. **E2E real** (§11/§21): en Preview con `SMTP_ALLEGRIA_*` válidas, poner una config con un destinatario DEV
   controlado y `hora_envio` ya pasada → el trigger manual envía a esa dirección y la ejecución pasa a `enviado`
   con `message_id` real. Confirmar recepción del correo. **No declarar E2E VALIDATED sin este envío real.**
4. **Cron programado**: Vercel → Project → Crons muestra la última ejecución y su resultado.

## Logs

Vercel → Project → Logs (filtrar `reporting-cron`). El endpoint loguea `config=<8 chars> fecha=<op> estado=<x> ms=<n>`
y errores sanitizados. **No** loguea secretos ni el cuerpo del email.

## Operación

- **Desactivar temporalmente**: en la UI (Reportes Automáticos) poner la config en `activo=false` → el cron la salta.
- **Desactivar el cron entero**: quitar el bloque `crons` de `vercel.json` y redeploy (o borrar `vercel.json` si solo tenía eso).
- **Rollback**: revertir el commit del scheduler (`git revert <sha>`); el motor Reporting Daily y el envío manual siguen intactos (el scheduler es aditivo).
- **Reintento de una ejecución en error**: manual desde la UI (Historial → Reintentar). El cron V1 **no** auto-reintenta (evita loops); vuelve a intentar recién al día siguiente sobre una nueva ejecución.

## Idempotencia / concurrencia

Índice único `(empresa_id, config_id, fecha_operacional)` en `proc_reporte_ejecucion` + `ON CONFLICT DO NOTHING`
→ aunque el cron corra varias veces tras la `hora_envio`, o dos invocaciones se solapen, hay **una sola ejecución
lógica** y **un solo email** (el cron solo envía cuando la ejecución está `pendiente`; una ya `enviado`/`error` no se reenvía).

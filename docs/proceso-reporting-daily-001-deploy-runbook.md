# PROC-REPORTING-DAILY-001 · Runbook de despliegue del scheduler (Vercel Cron)

**Estado**: `SCHEDULER CODE = VALIDATED` · `PRODUCTION EMAIL E2E = PENDIENTE (gate de deploy)`.
No desplegado. Este runbook documenta cómo activarlo y verificarlo en Preview/Production.

## Arquitectura

- **Cron**: `vercel.json` → `{ path: "/api/proc-reporting-daily-cron", schedule: "0 * * * *" }` (cada hora).
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

## Plan Vercel — frecuencia real

- **Pro/Enterprise**: soporta cron sub-diario → `"0 * * * *"` (cada hora) funciona; cualquier `hora_envio` se respeta.
- **Hobby**: los Cron Jobs corren **una vez al día**. Si el proyecto está en Hobby, cambiar el schedule a una
  expresión diaria (ej. `"0 13 * * *"` = ~09:00–10:00 Chile) y asegurar que `hora_envio` de las configs sea
  **anterior** a esa hora. NO fingir precisión por minuto. Para múltiples horarios de envío por día se requiere Pro.
- Verificar el plan: Vercel → Project → Settings → (plan) o el dashboard de Crons.

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

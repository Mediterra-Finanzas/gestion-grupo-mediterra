# R3-S5 — CERTIFICACIÓN E2E REAL (PREPARADO, NO EJECUTAR)

Requiere lo que NO se puede probar localmente sin Supabase CLI: emisión GoTrue asimétrica real +
gateway Kong. Se corre contra staging en un **Preview de Vercel** apuntando a staging, con el bridge
DEV_ONLY aún activo. Producción `bywovqayuzodbzwsriet` = HANDS-OFF. NADA de esto se ejecuta en S4.

## ENV del Preview (server-only; NO configurar todavía; nunca REACT_APP_* para secretos)
- `SUPABASE_URL` = https://nlvfjpwiecgrosjnwwik.supabase.co  (staging)
- `SUPABASE_SERVICE_ROLE_KEY` = <service_role de staging>   (server-only)
- `SUPABASE_ANON_KEY` = <anon de staging>
- `SESSION_SECRET` = <ya existe>
- **`PROC_THROTTLE_SECRET`** = <secreto dedicado NUEVO, server-only, ≥32 bytes aleatorios> — nunca browser/REACT_APP_*/logs/repo/DB/HTTP
- Client: `REACT_APP_PROC_AUTH=true` (activa el gate); `REACT_APP_SUPA_URL`/`REACT_APP_SUPA_KEY` = staging
- (Los valores reales los pega el CFO en Vercel; yo no los veo.)

## Preflight de deployment (READ-ONLY, antes de activar el Preview)
- Confirmar ref `nlvfjpwiecgrosjnwwik` (NO `bywovqayuzodbzwsriet`).
- IAM post-R2 + S1 (binding) + S2 (helpers) + S3 (throttle) presentes (reusar validaciones ya PASS).
- Bridge DEV_ONLY activo.

## Matriz E2E (a certificar con GoTrue/Kong reales)
- T11-01 Angelo login (email+PIN) → **access_token real** (firma asimétrica, verificable por JWKS staging).
- T11-02 JWT: `role=authenticated`, `sub=auth.users.id` de Angelo, `aud` correcto, `exp` corto.
- T11-03 binding: `iam_usuario.auth_user_id` de Angelo poblado en 1er login (backfill 0→1).
- T11-04 `proc_whoami` (o request PROC) → `role=authenticated`, actor IAM = iam_usuario.id de Angelo, empresa=ALS.
- T11-05 Angelo single-membership → entra a ALS **sin selector**.
- T11-06 Carol login válido → **403 sin token** (sin membership).
- T11-07 empresa arbitraria / cross-tenant → DENY (RLS + re-validación).
- **T11-08 Kong forwarding: confirmar que `X-Proc-Empresa` llega a `request.headers`** en PostgREST tras el gateway (única incógnita no cubierta localmente; PostgREST local ya lo reenvía).
- T11-09 rate-limit real: N intentos con PIN malo → 429; reset tras éxito; la DB solo ve claves opacas.
- T11-10 token expirado → re-auth controlado (sin loop); logout limpia sesión PROC.
- T11-11 auditoría: mutación PROC estampa actor = iam_usuario.id real.
- T11-12 service_role ausente del browser/network (solo apikey anon + Bearer access_token).
- T11-13 anon sigue operativo SOLO por el bridge DEV_ONLY (no es criterio de PASS).
- T11-14 otros módulos / login global Mediterra sin regresión; feature flag OFF = baseline.

## Evidencia positiva requerida (no basta "la pantalla funciona")
Network del browser (Bearer = access_token GoTrue real, apikey anon), decodificación header+payload del JWT
(sin la firma/secreto), y fila de auditoría con el actor IAM. Marcar Kong `X-Proc-Empresa` explícitamente.

## Rollback
`REACT_APP_PROC_AUTH=false` → browser vuelve a anon (baseline). Endpoint inerte. Sin cambios de RLS
(el cutover de anon es R4). Bridge DEV_ONLY intacto. Sin tocar otros módulos/proyectos/prod.

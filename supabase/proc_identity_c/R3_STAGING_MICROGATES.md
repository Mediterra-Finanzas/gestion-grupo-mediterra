# R3 — Micro-gates de STAGING (PREPARADOS, NO EJECUTAR)

Target: gestion-mediterra-staging / `nlvfjpwiecgrosjnwwik`. Producción `bywovqayuzodbzwsriet` = HANDS-OFF.
Estándar obligatorio (post-incidente de target): cada script mutante = **preflight fingerprint estructural
fail-closed + transacción (BEGIN/COMMIT) + una pantalla a la vez**. GUARD ABORT = HARD STOP: nunca continuar
manualmente tras un guard fallido. Uno por uno; yo no ejecuto SQL remoto.

## R3-S0 — Preflight staging (READ-ONLY)
Reusar `iam_staging/00_preflight_staging_hardened.sql` (ya probado) + añadir checks de etapa R3:
verifica ALS exacto, proc_* baseline, bridge DEV_ONLY presente, iam_* PRESENTE (post-R2), y que
`iam_usuario.auth_user_id` / `proc_auth_throttle` / funciones v2 **aún no** existan (estado pre-R3).
Aborta si el target no es inequívocamente staging. Salida esperada: `R3 PRE-STATE OK`.

## R3-S1 — Migration binding IAM↔Auth (transaccional + guard)
`ALTER TABLE iam_usuario ADD COLUMN IF NOT EXISTS auth_user_id uuid;` + índice único parcial
`ux_iam_usuario_auth_user_id`. Aditivo, nullable, 1:1, reversible. POST-check: columna e índice presentes,
sin backfill (bootstrap lo hace el endpoint por email en el primer login). Guard embebido = staging.

## R3-S2 — Helpers/RLS Option C (transaccional + guard)
Aplicar `proc_rls_resolution_v2.sql`: `proc_current_auth_user/iam_user/empresa/user` (SECURITY DEFINER,
search_path fijo). NO cambia el contrato de las policies proc_* (siguen `empresa_id = proc_current_empresa()`).
POST-check: las 4 funciones existen, son SECURITY DEFINER, y un smoke con claims/headers simulados
reproduce AUTH-C. **No** cortar el bridge DEV_ONLY (eso es R4).

## R3-S3 — Rate-limit persistence (transaccional + guard)
Aplicar `proc_auth_throttle.sql` (tabla deny-browser + `proc_fn_auth_attempt`/`proc_fn_auth_reset`).
POST-check: tabla con RLS FORCE + REVOKE anon/authenticated; funciones SECURITY DEFINER; smoke t,t,t,t,f.

## R3-S4 — Endpoint/deploy checklist (NO deploy este flujo)
ENV server-only en Vercel (Preview del branch, NO prod): `SUPABASE_URL`=staging, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_ANON_KEY`. Client: `REACT_APP_PROC_AUTH` permanece **OFF** hasta certificar. Verificar que
`api/proc-token.js` + `api/_supaAdmin.js` despliegan como función. Rollback = flag OFF.

## R3-S5 — E2E certification (rehearsal real contra staging)
Ejecutar la matriz R3-E2E contra el endpoint desplegado en Preview apuntando a staging:
mint real (generate_link+verify → access_token asimétrico), `proc_whoami` (role=authenticated, sub,
empresa), Angelo→ALS auto, Carol→403, cross-tenant DENY, revocación inmediata, **verificar que el gateway
(Kong) reenvía `X-Proc-Empresa`** (única incógnita no cubierta localmente; si Kong lo filtra, activar el
fallback documentado abajo). service_role ausente del browser/network.

## R3-S6 — Rollback
Flag `REACT_APP_PROC_AUTH=false` → browser vuelve a anon (baseline). Funciones v2 revertibles a v1;
`auth_user_id` nullable queda inerte; `proc_auth_throttle` inerte; bridge DEV_ONLY intacto. Sin cambios
destructivos IAM; sin impacto a Osiris/otros módulos/prod.

## Fallback si Kong filtra X-Proc-Empresa (multiempresa)
Alternativa request/token-scoped sin mutable global: mintear un access_token distinto **por empresa
seleccionada** incluyendo la empresa como claim vía el único mecanismo disponible sin hook — un
`GET /auth/v1/user`-refresh con `app_metadata` fijada por request es inseguro (global) → NO. En su lugar,
usar un **segundo endpoint PROC** que emita un token de sesión con la empresa embebida por un
short-lived signed context server-side validado en RLS por request. (Solo aplica a multiempresa; los 6 de
ALS son single-membership y NO usan header.) Detallar en el turno de multiempresa.

# PROC Auth Migration — PIN legacy → Supabase Auth password (Opción A)
Diseño técnico. LOCAL, sin implementar. 2026-09-01. Worktree `proc-fase1` (rama `iam-identity-prod-001`).

Principio rector: **cambiar solo el frente de credencial** (cómo se verifica quién eres). IAM (`auth.users`↔`iam_usuario`), membership (empresa/tenant) y AUTHZ (roles/capabilities) quedan **intactos**: ya derivan del `sub` del JWT, y el `sub` es el mismo `auth.users.id` tanto si la sesión se mintea (hoy) como si viene de `signInWithPassword` (objetivo).

---

## 1. SECURITY P0 PORT PLAN (SEC-HF1 → iam-identity-prod-001)
- **Leak:** 6 PIN literales en `src/App.jsx:504-509` (`WORKERS_BASE`) + en el bundle/sourcemap de esta rama. Fix existe en `deploy-allpa` commit `8895b5a`.
- **Archivos afectados (5):** `src/App.jsx` (3 hunks: import + quitar literales + costura de preservación en el merge), `src/data/credencialPreservada.js` (nuevo, helper que preserva el `pin` guardado en `main` para que el autosave no lo borre), `src/data/__tests__/secHf1.test.js` (171 L de tests), `scripts/sec-hf1-login-cifrado.mjs` (verificación), `docs/SEC-HF1-ACTA.md`.
- **Diff conceptual:** eliminar `pin:"…"` de los 6; NO dejar `pin:""` (borraría el PIN de `main`); en el merge, `...credencialPreservada(saved)` reinyecta la credencial ya guardada.
- **Dependencias:** ninguna externa; el helper es autónomo.
- **Portabilidad atómica:** **SÍ.** `git apply --check` del commit completo = exit 0 (hunks con offset +1). merge-base = `50994c8` = base exacta del fix. Vía = `git cherry-pick 8895b5a` (trae también ACTA+script+tests).
- **Riesgo de regresión:** **BAJO.** Solo retira literales + agrega costura probada; contexto idéntico. Único cambio de comportamiento: se pierde el fallback plano para usuarios sin `cred_h` — mitigado porque los 6 tienen credencial cifrada vigente (commit certificó "login cifrado 6/6", 478/478 tests).
- **Tests necesarios:** los que trae (secHf1.test.js) + `scripts/sec-hf1-login-cifrado.mjs` + build `CI=true` (0 literales en artefacto) + smoke de login de los 6.
- **No sustituye rotación:** los bundles ya publicados y el historial conservan los valores → **rotar los 6 PIN** es tarea aparte (los 6 son de finanzas/legacy, no de los 5 ALS nuevos).

## 2. TARGET AUTH ARCHITECTURE
```
email + password
  → supabase.auth.signInWithPassword (GoTrue, con ANON key)     [NUEVO frente]
  → JWT authenticated (sub = auth.users.id, ES256)
  → X-Proc-Empresa (sin cambio)
  → resolvers Option C: proc_current_auth_user → proc_current_iam_user
       (iam_usuario.auth_user_id = sub) → proc_current_empresa (re-valida membership)
  → RLS tenant + AUTHZ (proc_has_capability / proc_effective_caps)   [SIN CAMBIO]
  → PROC
```
Invariantes: contraseña **solo** en GoTrue (nunca en iam_usuario/calendario_data/proc_*/localStorage/repo/logs). Binding 1:1 intacto. Membership = autoridad de tenant. AUTHZ = autoridad de rol. No se relaja ningún control (RLS, tenant re-val, fail-closed, SoD).

## 3. MIGRATION PHASES
| Fase | Objetivo | Precondiciones | Archivos | Mutaciones remotas | Tests | Rollback | Gate PASS | DATA LOSS / DRIFT | No tocar |
|---|---|---|---|---|---|---|---|---|---|
| **0** | Cerrar P0 PIN literales | build verde base | cherry-pick `8895b5a` (5 arch.) | ninguna | secHf1 + script + build 0-literales | `git revert` | 0 literales en bundle; login 6/6; 478/478 | 0 / solo código | datos `main`/`pins` |
| **1** | Login password detrás de flag | Fase 0 | `procAuth.js`, `ProcLoginGate.jsx`, `procesoDB.js` (+flag env) | ninguna | unit login password (flag ON) + regresión PIN (flag OFF) | flip flag OFF | ambos paths compilan; flag OFF = comportamiento actual | 0 / código | api/proc-token.js (aún vive) |
| **2** | Certificar 1 ALS real en staging | Fase 1 + flag ON en staging + `config.toml` (SMTP) | ninguno nuevo | ninguna (usa temp pwd admin, staging-only) | E2E: signInWithPassword → iam → membership → tenant → caps | flip flag OFF | 1 usuario entra y resuelve empresa+caps | 0 / 0 | passwords de los 5 (no cambiar) |
| **3** | Certificar los 6 ALS | Fase 2 PASS | igual | ninguna | E2E los 6 (5 ALS + Angelo) | flip flag OFF | 6/6 login + tenant + caps | 0 / 0 | idem |
| **4** | Activar change + forgot/recovery | Fase 3 PASS + SMTP real | pantalla cambio pwd, forgot, recovery callback | `config.toml` redirect+SMTP (deploy) | E2E change/forgot/reset/recovery | revert UI + flag | change/forgot/reset OK sin tocar iam/roles | 0 / config auth | iam_usuario/membership/roles |
| **5** | Retirar PIN como credencial de PROC | Fase 4 PASS en prod | flag ON estable | `proc-token.js`, `procAuth.js` (quitar path PIN) | regresión: PROC no usa PIN; finanzas sí | re-habilitar path (git) | PROC 100% password; PIN muerto en PROC | 0 / código + posible revoke grant `identity_lookup` | fila `pins` (la usa finanzas) |
| **6** | Contención PIN legacy | Fase 5 | — | ninguna | — | — | PIN solo en módulos legacy no-PROC | 0 / 0 | `pins`, App.jsx finanzas |

## 4. FILE IMPACT MATRIX
| Archivo | Cambio | Fase | Riesgo |
|---|---|---|---|
| `src/App.jsx` | quitar literales + costura SEC-HF1 | 0 | bajo |
| `src/data/credencialPreservada.js` | nuevo (SEC-HF1) | 0 | nulo |
| `src/proceso/core/procAuth.js` | signInWithPassword + sesión/refresh; quitar fetchProcToken en Fase 5 | 1,5 | medio |
| `src/proceso/ui/.../ProcLoginGate.jsx` | campo password + link "olvidé mi contraseña" | 1,4 | medio |
| `src/proceso/core/procesoDB.js` | tomar access_token de la nueva sesión (headers igual) | 1 | bajo |
| pantallas nuevas: CambiarPassword, ForgotPassword, RecoveryCallback | nuevas | 4 | medio |
| `supabase/config.toml` | versionar `[auth]` site_url/redirect/SMTP (hoy NO existe) | 4 | medio (email deliverability) |
| `api/proc-token.js`, `api/_supaAdmin.js (mintSession)` | reducir → retirar | 5 | medio |
| flag `REACT_APP_PROC_AUTH_MODE` (pin\|password) | nuevo env | 1 | bajo |

## 5. RPC / API IMPACT MATRIX
| Pieza | Hoy | Objetivo | Decisión |
|---|---|---|---|
| `api/proc-token.js` (Vercel) | valida PIN + mintea sesión | innecesaria para login password | **NO borrar ya**: reducir en F1 (solo path legacy tras flag OFF, para rollback), **retirar en F5** |
| `mintSession` (`_supaAdmin.js`) | genera sesión magiclink+verify | GoTrue emite sesión directo | retirar con proc-token (F5) |
| `proc_fn_identity_lookup` (RPC) | lee `cred_h` del blob `pins` | no se usa en password | mantener durante F1-F4 (rollback); **retirar/`REVOKE` en F5** (reduce blast radius R5-MIN) |
| throttle `proc_fn_auth_attempt` (HMAC) | rate-limit del endpoint PIN | GoTrue tiene su propio rate-limit | **preservar control**: configurar rate-limit/CAPTCHA de GoTrue en `config.toml`; no dejar el login sin throttle |
| `X-Proc-Empresa` | tenant header re-validado | igual | **sin cambio** |
| RLS proc_* | key = proc_current_empresa/iam_user | igual (mismo `sub`) | **sin cambio** |
| R3-S6 revocación same-JWT (membership) | resolvers re-chequean membership por request → fail-closed | igual | **sin cambio** (la desactivación de membership sigue cortando en el próximo request) |
| Revocación de SESIÓN (token/refresh) | hoy token in-memory efímero | con refresh_token la sesión vive más | **nuevo**: F5/baja usa `admin signOut`/ban en GoTrue |

## 6. TEST MATRIX
- **Unit:** secHf1 (F0); flag routing pin/password; procAuth session/refresh/expiry; headers procesoDB.
- **Integración (staging, DB real):** signInWithPassword → resolvers → membership → tenant → `proc_effective_caps`; cross-tenant DENY; membership inactiva → next request DENY (R3-S6); AUTHZ P0 (reusar `authz_coverage_test.sh`).
- **E2E flujos A-G:** login, primer-acceso (invite/recovery set), change, forgot→reset, logout(+revoke), refresh, baja(fail-closed).
- **Regresión legacy (flag OFF):** login PIN finanzas intacto; los 478 tests; build `CI=true`.
- **Seguridad:** 0 literales en bundle; sin password/token en localStorage (salvo persistSession documentado); sin `detail` leak; service_role no en bundle.

## 7. ROLLBACK PLAN
- **Código:** feature flag `REACT_APP_PROC_AUTH_MODE=pin` restaura el login PIN sin tocar datos; y `git revert` de cada fase.
- **auth.users (5 creados):** additivos e inertes; no requieren rollback (no rompen el path PIN).
- **config.toml:** reversible por deploy.
- **RPC/endpoint:** F5 es la única que retira piezas; su rollback = re-habilitar `proc-token.js` + `identity_lookup` (código/grant), sin pérdida de datos.
- **Regla:** ninguna fase borra datos; DATA LOSS=0 en todas.

## 8. CUTOVER PLAN
1. F0-F1 en dev/preview (flag OFF por defecto en prod).
2. F2-F3 en **staging** con flag ON usando las temp passwords admin (staging-only, tester las conoce; **sin** involucrar a los empleados).
3. F4 con SMTP real en staging → certificar change/forgot/recovery.
4. Producción: desplegar con flag OFF; activar flag ON por entorno; **los usuarios de producción fijan su propia clave** vía `resetPasswordForEmail`/invitación (el admin nunca la ve). Las temp de staging **no** viajan a producción.
5. F5 retira PIN de PROC una vez estable.

## 9. LEGACY PIN CONTAINMENT PLAN
- El PIN sobrevive **solo** para módulos NO-PROC (tareas/finanzas/contabilidad/osiris en `App.jsx`), con su blob `pins`.
- PROC deja de leer `pins` en F5 (retiro de `identity_lookup`/`proc-token`).
- Frontera documentada: `pins` = credencial legacy de finanzas; PROC = 100% Supabase Auth password.
- Rotación de los 6 PIN de finanzas = tarea SEC aparte (no bloquea PROC).

## 10. PROD BLOCKERS
- **P0:** portar SEC-HF1 (F0) antes de cualquier deploy desde esta rama; rotar 6 PIN de finanzas.
- **P1:** `config.toml` con SMTP **real** (el email por defecto de Supabase es rate-limited/spam → recovery poco fiable en M365); cerrar leak `detail` (`proc-token.js:126`); preservar throttle (rate-limit/CAPTCHA GoTrue); revocación de sesión server-side en baja/logout (F5).
- **P2:** decidir persistSession (in-memory vs localStorage) y documentarlo; versionar redirect URLs; retiro ordenado de mintSession.

## 11. RECOMMENDED EXECUTION ORDER
0 (SEC-HF1 port + verify) → 1 (flag + password login, dev) → 2 (1 ALS staging) → 3 (6 ALS staging) → 4 (change/forgot/recovery + SMTP) → prod cutover con self-service → 5 (retiro PIN de PROC) → 6 (contención). Cada fase con su gate PASS/FAIL antes de la siguiente. Micro-gate humano en toda mutación remota.

**AUTH PASSWORD MIGRATION DESIGN READY = YES** (diseño completo; P0 con port atómico verificado; fases con rollback y DATA LOSS=0). Implementación NO iniciada.

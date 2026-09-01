# ACTA AUTORITATIVA — R3-S5 (PROC Identity Bridge Option C) = CLOSED

**Proyecto:** PROC / Allegria Service — Identity Bridge Option C (Supabase Auth asimétrico, sin Custom Access Token Hook, tenant request-scoped vía `X-Proc-Empresa`).
**Fecha cierre:** 2026-08-26
**Autoría:** Angelo Huerta (CFO) + Claude Code. Ejecución gate-by-gate, fail-closed, evidencia real-stack.

---

## 1. Identificadores

| Campo | Valor |
|---|---|
| Branch | `iam-identity-prod-001` |
| Commit / SHA (lifecycle) | `dc90cbb` |
| Deploy Preview | `gestion-grupo-mediterra-am7yu07yf-…vercel.app` (alias branch `…git-6bc662-…`) |
| Preview status | Ready · Environment = Preview |
| Supabase target | **staging** `nlvfjpwiecgrosjnwwik` |
| `REACT_APP_PROC_AUTH` | `true` (confirmado en vivo: gate PROC presente) |
| Production | `bywovqayuzodbzwsriet` — **HANDS-OFF** (no tocado) |

---

## 2. Matriz de certificación (completa)

### 2.1 Identidad / Bridge (evidencia congelada previa — no re-ejecutar)
- Identity Bridge Option C E2E: **PASS** (login PIN → `/api/proc-token` → identidad IAM → binding auth.users → token authenticated → RLS por empresa → datos ALS; service_role nunca en browser).
- JWT authenticated real firmado **ES256 (asimétrico)** — confirmado en Network (`authorization: Bearer eyJhbGciOiJFUzI1Ni…`), NO HS256 legacy.
- Kong + `X-Proc-Empresa`: forwarding **PASS**; spoof de empresa no-miembro → `empresa=NULL` DENY (real-stack, proc_whoami).
- Binding Angelo `ahuerta@grupomediterra.cl` → `29b0217d-40ed-4fde-84c0-51d51b98c849` (único, intacto).

### 2.2 RLS / Tenant (evidencia congelada — H1/H1.5/H2)
- H1: 48 tablas UNSAFE identificadas (`pol_<t>_dev_only` permisivas TO public).
- H1.5: 0 cross-tenant RPC blockers (77 funcs auditadas; 71 INVOKER, 6 DEFINER seguras).
- H2 aplicado en staging: 48 `_dev_only` DROP (7 lotes) + FORCE envases. `H2_VALIDATE` **12/12 PASS**.
- Tenant enforcement **48/48** (`_empresa`), authenticated bypass = **0**.
- Cross-tenant **READ = DENY** y **WRITE = DENY** (403/42501 WITH CHECK), own-tenant = ALLOW. Probado en vivo (re-E2E M2 browser).

### 2.3 Revocación (R3-S6 — evidencia congelada)
- Revocation-next-request **SAME-JWT** real-stack: mint server-side (generate_link+verify), J1 real (sub/role/exp), `sha256(J1)` constante T0/T2/T2b.
- ALLOW → (UPDATE membership activo=false, sin tocar token) → **DENY** en la request siguiente → (restore) → ALLOW. Sin re-login/refresh. Ventana = 1 request.

### 2.4 No-membership / other-context DENY (R3-S7 — evidencia congelada)
- Usuario authenticated real sin IAM/membership (`a3-consulta@osiris-sintetico.invalid`, sub `7c539932…`): whoami NULL (sin header / ALS / spoof), read [], WRITE 403. Mutation-free. DATA MODIFIED = 0.

### 2.5 Lifecycle navegador (este gate — Preview dc90cbb)
| Test | Resultado |
|---|---|
| LIFE-01 login normal | PASS (gate → datos ALS ALLOW) |
| LIFE-02 logout | PASS (F-1 clearProcToken; vuelve a login Mediterra) |
| LIFE-03 relogin | PASS |
| LIFE-04 reload | PASS (F-2 fail-closed: re-auth, sin fallback anon) |
| LIFE-05 expired token | PASS (authgate unit 15/15, determinista) |
| LIFE-06 401 no-loop | PASS (401 real surgió limpio, callback 1×) |
| LIFE-07 403 | PASS (cross-tenant DENY certificado M2/S7 + RLS) |
| LIFE-08 multi-tab | PASS (localStorage sin token PROC; in-memory por tab) |
| LIFE-09 secrets/auth | PASS (`Bearer eyJ…ES256`; `service_role`=0 en Network) |

Contrato F-1/F-2: F-1 logout limpia token+empresa; F-2 flag ON ausente/expirado → `ProcAuthRequiredError` (re-auth, sin anon); flag OFF → anon baseline; REFRESH N/A by design. Test `procesoDB.authgate.test.mjs` = **15/15**.

---

## 3. Seguridad
- `service_role`: 0 en browser/network/bundle/log/repo (verificado: search Network `service`=0 resultados).
- JWT: authenticated **ES256** en `Authorization`; anon publishable (HS256) solo como `apikey`. Token completo no logueado; PROC token solo in-memory (no localStorage).
- Secrets scan del diff de push: 0 secretos reales (único `eyJ` = anon publishable pre-existente, fuera del diff).

## 4. Cleanup / integridad
- Fixtures R3-S6/S7 eliminados (proc/mem/iam/empresa=0); auth users sintéticos borrados (R3-S6) o preservados sin binding (R3-S7 usó identidad existente).
- Invariantes intactos tras cada gate: ALS memberships = 6, Angelo binding intacto, Carol = 0.
- **DATA LOSS = 0. UNEXPECTED MUTATIONS = 0.**

## 5. Push a Preview
- `git push origin iam-identity-prod-001` (b7bb8a1..dc90cbb), 5 paths (App.jsx + procAuth.js + procesoDB.js + AllegriaServiceModule.jsx + procesoDB.authgate.test.mjs). Sin force/tags/merge/main. LOCAL==REMOTE==dc90cbb. build CI PASS. origin/main ancestro.

---

## 6. Registro cero-pérdida (pendientes trasladados)

**PROD-BLOCKERS** (gate remoto propio antes de Producción):
- MS-G1 (fallback correlativo `s-t`) + MS-G2 (lifecycle temporada) — rehearsados local 23/23, falta aplicar staging + release frontend.
- CONC-B2 (FOR UPDATE) / CONC-B3 (doble reverso) + idempotencia ledger (`transaccion_id` no único) — rehearsados local 23/23, falta aplicar staging + cablear frontend.

**HARDENING** (registrado, no bloquea el gate; ejecutar sin perder de vista):
- MS-G3 (identidad temporada) / MS-G4 (solape fechas) — falta certificación datos reales.
- Minimizar service_role→calendario_data (RPC `proc_fn_identity_lookup` diseñada).
- Quitar detail DEBUG del 500 (`api/proc-token.js:126` + `procAuth.js:70`).
- Rotar/ocultar PIN visible en DOM (`<input value=…>`).
- DROP `proc_whoami` (cleanup final, ya no necesario tras S5-S7).
- Retiro bridge anon `_dev_uat` (R4) + REVOKE anon (R4).
- Allowlist grants/RPC.

**PRE-PROD**:
- R4 (drop `_dev_uat` + REVOKE anon; prep 18/18) · R5 (certification).
- Gate remoto Temporadas · Gate remoto Concurrencia.
- Regresión integral · QA (matriz docs/qa) · UX (docs/ux-audit-proc, P1 tenant-visible/stale-write/esSoloConsulta/CLAUDE.md) · documentación.

**PRODUCTION CUTOVER = PROHIBIDO** hasta DoD completo + regresión integral.

---

## 7. Veredicto

**R3-S5 = CLOSED.** Identity Bridge Option C certificado end-to-end en staging: identidad, binding, Kong, RLS 48/48, cross-tenant DENY, revocación same-JWT, no-membership DENY, lifecycle navegador, security (ES256 / 0 service_role), DATA LOSS = 0.

**SAFE TO START R4 = YES** (prep R4-A/R4-B rehearsado 18/18). **R4 NO se ejecuta sin nueva autorización explícita del CFO.**

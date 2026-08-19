# PROC-STAGING — Acta de Migración (§20)

> **Estado**: ✅ **STAGING DB VALIDATED = YES** (materializado y certificado en staging el 2026-08-19).
> Ejecución remota realizada por el CFO en el SQL Editor de `gestion-mediterra-staging`, gate por gate,
> con Claude entregando cada script y validando cada output.

## Identidad de la migración
- **Fecha ejecución (remota)**: 2026-08-19
- **Target project**: gestion-mediterra-staging
- **Project ref**: `nlvfjpwiecgrosjnwwik`  ·  URL `https://nlvfjpwiecgrosjnwwik.supabase.co` (confirmado en la URL del SQL Editor)
- **Producción (PROHIBIDA)**: mediterra-calendario `bywovqayuzodbzwsriet` — HANDS-OFF (no tocada).
- **Manifest**: `docs/proc-staging-manifest.md`
- **Branch / HEAD**: `worktree-proc-fase1` / ver commit del acta

## Secuencia de ejecución (SQL Editor, en orden; cada paso gated)
| Paso | Archivo a pegar | Resultado esperado | Resultado real |
|---|---|---|---|
| 0 | `supabase/staging/00_preflight_readonly.sql` | proc_tablas=0, contab_tablas=0, roles/extensión OK, calendario_data=true | 〈…〉 |
| G | `supabase/_staging_target_guard.sql` | `GUARD OK` | 〈…〉 |
| P0 | `supabase/schema_core_identity_v1.sql` | crea contab_empresas + contab_auxiliares | 〈…〉 |
| P1 | `supabase/seed_core_identity_als.sql` | ALS upsert | 〈…〉 |
| Gate | `supabase/staging/20_gate_core.sql` | `GATE CORE OK: CORE-01..06 PASS` | 〈…〉 |
| P2 | `〈bundle_P2_proc.sql〉` (33 migraciones) | sin ERROR | 〈…〉 |
| Val P2 | `supabase/staging/40_validate_p2.sql` | 61 / 34 / 70 · RLS 0 sin · 0 huérfanos | 〈…〉 |
| P3 | `〈bundle_P3_bridge_DEV_ONLY.sql〉` (bridge UAT) | sin ERROR | 〈…〉 |
| P4 | `supabase/seed_proc_DEV_UAT.sql` | seed sintético | 〈…〉 |
| Val UAT | `supabase/staging/50_validate_uat.sql` | 15/15 cubierto=t · bounded ok · calendario intacta | 〈…〉 |

## Baseline (preflight, §2)
| Métrica | Valor |
|---|---|
| db | postgres |
| tablas public (antes) | **43** |
| proc_tablas (antes) | **0** |
| contab_tablas (antes) | **0** |
| calendario_data existe / filas (antes) | true / **2** |
| gen_random_uuid disponible | true |
| roles anon/authenticated/service_role | presentes |
| extensiones | uuid-ossp, pgcrypto |

## Conteos finales (§9) — staging == certificación local
| Métrica | Local certificado | **Staging real** |
|---|---|---|
| proc_tablas | 61 | **61** ✓ |
| proc_vistas | 34 | **34** ✓ |
| proc_fn_* | 70 | **70** ✓ |
| proc_triggers | 123 | **123** ✓ |
| tablas proc_* sin RLS | 0 | **0** ✓ |
| FK proc_* fuera de proc_*/contab_* | 0 | **0** ✓ |
| proc_vinculo huérfanos (empresa \| aux) | 0 \| 0 | **0 \| 0** ✓ |
| triggers append-only en proc_movimiento | 3 | **3** ✓ |
| GATE CORE (CORE-01..06) | PASS | **PASS** ✓ |
| total tablas public (después) | — | **106** (43 baseline + 61 proc + 2 contab) ✓ |

## Bridge UAT (§10, §13)
- Aplicado: sí (P3). Archivos DEV_ONLY reversibles. **No** es postura productiva.
- Postura canónica proc_* = RLS estricta `empresa_id=proc_current_empresa()`; el bridge solo ABRE acceso anon para la UI de UAT en staging.

## Seed UAT (§11/§12) — cobertura certificada local (15/15)
recepción multi-lote (4) · predios (2) · cuarteles (3) · contratos (4) · órdenes (2) · **consumo N:M (2)** · resultado/merma/descarte (2) · tarifas (2) · tipos de envase 3 (BIN/TOTE/REJILLA) · **movimientos de envase (4: Service 65 + dañado 5 + terceros 30 + TOTE 40)** · pallets (3) · repaletizaje (1) · despacho (1) · **reporting config (1, incluir_alertas)** · **reporting destinatario (1, DEV `dev.uat@example.invalid` NO real)**.

## calendario_data (§15) — control antes/después
| | filas |
|---|---|
| Antes (preflight) | **2** |
| Después (val UAT) | **2** — coinciden ✓ (intacta) |
- Ninguna migración proc_* referencia `calendario_data` (verificado estáticamente: 0 archivos la mencionan; y no fue DROP/TRUNCATE/DELETE).

## Bounded context (§16)
- FK de proc_* fuera de proc_*/contab_* = **0** ✓. proc_* no depende de ningún otro contexto.
- Desglose de tablas public en staging (compartido): proc **61**, contab **2**, frisku **0**, exp **0**, **osi 41** (pre-existentes de la migración relacional de Osiris T2, staged por ese esfuerzo aparte; proc_* NO las creó ni referencia), resto **2** (incl. calendario_data).
- Foods representable solo por `proc_vinculo` (vínculo "Allegria Foods" presente en el seed).

## Regresión (§14)
- Certificación local (Docker PG16) sobre DB limpia con Core REAL: cadena P0→P4 aplica limpia; gate CORE-01..06 PASS; CHECK canónicos rechazan inválidos; 0 FK huérfanas; JS scheduler 20/20; reportingEmail 19/19.
- **Staging (2026-08-19)**: GATE CORE PASS; validate P2 = 61/34/70/123, RLS 0-sin, 0 FK externas, 0 huérfanos, ledger 3; validate UAT cobertura **15/15**; calendario_data 2→2. (Baterías SQL exhaustivas proc y E2E de email quedan fuera de esta fase por decisión CFO §24.)

## Seed UAT (§11/§12) — cobertura en staging: 15/15 ✓
recepción (4) · predios (2) · cuarteles (3) · contratos (4) · órdenes (2) · consumo N:M (2) · resultado/merma/descarte (2) · tarifas (2) · tipos de envase (3) · movimientos de envase (4) · pallets (3) · repaletizaje (1) · despacho (1) · reporting config (1) · reporting destinatario (1).

## api/_auth.js (§18)
Aplicado tras STAGING VALIDATED: `const SUPA_URL = process.env.SUPABASE_URL || "<fallback productivo>"`. Preview→staging, Production→fallback CURRENT (sin cambio de comportamiento). No se tocó `api/informe.js` (Osiris). Syntax-check Node OK. Commit atómico.

## Gaps / pendientes (post-fase, requieren autorización)
- Vercel Preview vars: a configurar por el CFO (§19), no tocadas — ver reporte.
- Email E2E / Scheduler cron real / T11 / Visual QA / regresión SQL exhaustiva contra staging: fuera de alcance de esta fase (§24).

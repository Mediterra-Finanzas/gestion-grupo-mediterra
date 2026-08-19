# PROC-STAGING — Acta de Migración (§20)

> **Estado**: PAQUETE CERTIFICADO LOCALMENTE · **EJECUCIÓN REMOTA PENDIENTE DEL CFO**.
> Este entorno no tiene canal autenticado a Supabase (sin `supabase` CLI, sin `psql`, sin credenciales,
> y prohibido manejar secretos). La materialización remota la ejecuta el CFO en el SQL Editor de
> `gestion-mediterra-staging`. Las secciones con `〈…〉` las completa el CFO con el output real.

## Identidad de la migración
- **Fecha ejecución (remota)**: 〈AAAA-MM-DD〉
- **Target project**: gestion-mediterra-staging
- **Project ref**: `nlvfjpwiecgrosjnwwik`  ·  URL `https://nlvfjpwiecgrosjnwwik.supabase.co`
- **Producción (PROHIBIDA)**: mediterra-calendario `bywovqayuzodbzwsriet` — HANDS-OFF.
- **Manifest**: `docs/proc-staging-manifest.md`
- **Branch / HEAD**: `worktree-proc-fase1` / 〈HEAD al ejecutar〉

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

## Baseline (preflight, §2) — completar
| Métrica | Valor |
|---|---|
| tablas public (antes) | 〈…〉 |
| proc_tablas (antes) | 〈esperado 0〉 |
| contab_tablas (antes) | 〈esperado 0〉 |
| calendario_data filas (antes) | 〈anotar para comparar§15〉 |

## Conteos finales (§9) — certificado local (a confirmar en staging)
| Métrica | Local certificado | Staging real |
|---|---|---|
| proc_tablas | **61** | 〈…〉 |
| proc_vistas | **34** | 〈…〉 |
| proc_fn_* | **70** | 〈…〉 |
| proc_triggers | 123 | 〈…〉 |
| proc_indices | 142 | 〈…〉 |
| tablas proc_* sin RLS | **0** | 〈…〉 |
| FK proc_* fuera de proc_*/contab_* | **0 (vacío)** | 〈…〉 |
| proc_vinculo huérfanos (empresa \| aux) | **0 \| 0** | 〈…〉 |
| triggers append-only en proc_movimiento | 3 | 〈…〉 |

## Bridge UAT (§10, §13)
- Aplicado: sí (P3). Archivos DEV_ONLY reversibles. **No** es postura productiva.
- Postura canónica proc_* = RLS estricta `empresa_id=proc_current_empresa()`; el bridge solo ABRE acceso anon para la UI de UAT en staging.

## Seed UAT (§11/§12) — cobertura certificada local (15/15)
recepción multi-lote (4) · predios (2) · cuarteles (3) · contratos (4) · órdenes (2) · **consumo N:M (2)** · resultado/merma/descarte (2) · tarifas (2) · tipos de envase 3 (BIN/TOTE/REJILLA) · **movimientos de envase (4: Service 65 + dañado 5 + terceros 30 + TOTE 40)** · pallets (3) · repaletizaje (1) · despacho (1) · **reporting config (1, incluir_alertas)** · **reporting destinatario (1, DEV `dev.uat@example.invalid` NO real)**.

## calendario_data (§15) — control antes/después
| | filas |
|---|---|
| Antes (preflight) | 〈…〉 |
| Después (val UAT) | 〈…〉 — deben coincidir |
- Ninguna migración proc_* referencia `calendario_data` (verificado estáticamente: 0 archivos la mencionan).

## Bounded context (§16)
FK de proc_* solo hacia proc_*/contab_* (0 externas). 0 tablas de frisku_/friskuBI/exp_/osi_. Foods representable solo por `proc_vinculo` (vínculo "Allegria Foods" presente en el seed).

## Regresión (§14)
Certificación local (Docker PG16) sobre DB limpia con Core REAL: cadena P0→P4 aplica limpia; gate CORE-01..06 PASS; CHECK canónicos rechazan inválidos; 0 FK huérfanas; JS scheduler 20/20; reportingEmail 19/19. Regresión completa contra STAGING: 〈correr baterías proc SQL tras materializar〉.

## Gaps / pendientes
- Ejecución remota: pendiente del CFO (blocker de canal, no de contenido).
- `api/_auth.js` env-drive: **diferido** hasta STAGING DB VALIDATED (§18).
- Vercel Preview vars: a configurar por el CFO (§19), no tocadas.
- Email E2E / Scheduler cron / T11 / Visual QA: fuera de alcance de esta fase.

# PROC-STAGING — Manifest de materialización (STAGING dedicado)

**Destino**: `gestion-mediterra-staging` · ref `nlvfjpwiecgrosjnwwik`.
**Prohibido**: `mediterra-calendario` · ref `bywovqayuzodbzwsriet` (producción, HANDS-OFF).
**Estado**: artefactos creados + validados localmente (Docker `proc_uat` con Core REAL, no stubs). **SQL remoto NO ejecutado.**

Orden estricto. Cada bloque asume el anterior aplicado. Ejecutar el **guard primero**; si aborta, detener todo.

## GUARD (siempre primero)
| # | Archivo | Qué hace | Reversible |
|---|---|---|---|
| G | `supabase/_staging_target_guard.sql` | Fail-closed: ABORT si contab_empresas poblada (=producción) o proc_* ya existe. | n/a (solo lee) |

## P0 — Core Identity (prerequisito de proc_*)
| # | Archivo | Objetos que crea |
|---|---|---|
| P0.1 | `supabase/schema_core_identity_v1.sql` | `contab_empresas`, `contab_auxiliares` (+ índices, RLS, policies observadas). Idempotente (IF NOT EXISTS). |

## P1 — Seed Core del tenant ALS
| # | Archivo | Qué hace |
|---|---|---|
| P1.1 | `supabase/seed_core_identity_als.sql` | UPSERT fila ALS (`5aa10886-…cd49`, ALS, CLP, dual). No toca otros tenants. |

## P2 — Cadena proc_* PRODUCTIVA (RLS estricta incluida en cada archivo)
Orden por versión/fase (idéntico al validado 29/29 en dev). **No** incluye archivos `*_DEV_ONLY_*`.

| # | Archivo |
|---|---|
| P2.01 | `schema_proc_v1.sql` |
| P2.02 | `schema_proc_v2_f2.sql` |
| P2.03 | `schema_proc_v3_f3.sql` |
| P2.04 | `schema_proc_v4_f4.sql` |
| P2.05 | `schema_proc_v5_f5.sql` |
| P2.06 | `schema_proc_v6_f6.sql` |
| P2.07 | `schema_proc_v7_f7_1.sql` |
| P2.08 | `schema_proc_v7_2_f7_2.sql` |
| P2.09 | `schema_proc_v7_3_f7_3.sql` |
| P2.10 | `schema_proc_v7_4_f7_4.sql` |
| P2.11 | `schema_proc_v7_5_f7_5.sql` |
| P2.12 | `schema_proc_v7_6_f7_6.sql` |
| P2.13 | `schema_proc_v7_7_f7_7.sql` |
| P2.14 | `schema_proc_v8_t1_especie_variedad.sql` |
| P2.15 | `schema_proc_v8_t2_origen_agricola.sql` |
| P2.16 | `schema_proc_v8_t3_cliente_productor.sql` |
| P2.17 | `schema_proc_v8_t4_lote_origen.sql` |
| P2.18 | `schema_proc_v8_t5_integridad_backfill.sql` |
| P2.19 | `schema_proc_v8_t5b_integridad_cutover.sql` |
| P2.20 | `schema_proc_v8_t6_cliente_ficha.sql` |
| P2.21 | `schema_proc_v8_t7_contrato.sql` |
| P2.22 | `schema_proc_v8_t8_gates_contractuales.sql` |
| P2.23 | `schema_proc_v8_t9_readmodels_genealogia.sql` |
| P2.24 | `schema_proc_v8_t10c_qc_lote.sql` |
| P2.25 | `schema_proc_v8_t10c_masa.sql` |
| P2.26 | `schema_proc_v8_t10d.sql` |
| P2.27 | `schema_proc_v8_t10e.sql` |
| P2.28 | `schema_proc_v9_t10c_fecha_operacional.sql` |
| P2.29 | `schema_proc_v10_envases_e1_tipo.sql` |
| P2.30 | `schema_proc_v10_envases_e2_ledger.sql` |
| P2.31 | `schema_proc_v10_envases_e3_saldos.sql` |
| P2.32 | `schema_proc_reporting_daily_v1.sql` |
| P2.33 | `schema_proc_reporting_daily_v2_alertas.sql` |

## P3 — Bridge UAT (TEMPORAL, DEV/STAGING, reversible) — SOLO si se quiere ejercitar la UI anon en staging
Abre acceso `anon` a proc_* para UAT (la app corre como anon en el browser). **NO es seguridad real.** Reversible (revoca). Archivo separado, nunca se presenta como contrato productivo.

| # | Archivo |
|---|---|
| P3.01 | `schema_proc_v1_DEV_ONLY_rls.sql` |
| P3.02 | `schema_proc_v2_f2_DEV_ONLY_rls.sql` |
| P3.03 | `schema_proc_v3_f3_DEV_ONLY_rls.sql` |
| P3.04 | `schema_proc_v4_f4_DEV_ONLY_rls.sql` |
| P3.05 | `schema_proc_v5_f5_DEV_ONLY_rls.sql` |
| P3.06 | `schema_proc_v6_f6_DEV_ONLY_rls.sql` |
| P3.07 | `schema_proc_v7_f7_1_DEV_ONLY_rls.sql` |
| P3.08 | `schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql` (bridge visual consolidado t-phase/envases/reporting) |

> **Nota P3**: el bridge Core (anon → contab_auxiliares, que en producción NO tiene policy anon) debe ir en un archivo bridge separado si la UI lo necesita; hoy la UI proc_* no lee contab_auxiliares directamente por anon (lo resuelve el backend/seed). Si en UAT aparece un 401 sobre contab_*, se añade un `_core_DEV_ONLY_rls.sql` reversible, nunca al contrato P0.

## P4 — Seed UAT sintético (DEV/STAGING, datos ficticios)
| # | Archivo |
|---|---|
| P4.01 | `seed_proc_DEV_UAT.sql` (incluye auxiliares/vínculos sintéticos ALS para UAT) |

---

### Objetos que se crearían en STAGING (resumen)
- **P0**: 2 tablas Core (`contab_empresas`, `contab_auxiliares`) + 6 índices + RLS/policies.
- **P2**: esquema operacional proc_* completo (tablas ledger/recepción/orden/lote/contrato/QC/envases/reporting + funciones RPC + vistas `security_invoker` + triggers append-only + RLS estricta por tenant). Ver conteo exacto en el reporte de validación local.
- **P3** (opcional UAT): GRANTs/policies anon reversibles.
- **P1/P4**: filas de datos (ALS real + sintéticos UAT). No DDL.

### Fuera de alcance (NO se toca)
`calendario_data` y sus filas de negocio; `frisku_*`; `exp_*`; `osi_*`; cualquier objeto que no sea Core mínimo o proc_*. Sin `DROP`/`TRUNCATE`/`DELETE`.

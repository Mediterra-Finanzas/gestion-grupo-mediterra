# Runbook remoto — Concurrencia v2 + Temporadas v2 (STAGING nlvfjpwiecgrosjnwwik)

Read-only preparado. NO ejecutado. Producción HANDS-OFF. Pegar cada archivo entero en SQL Editor de STAGING, uno a la vez, en el orden. Cada script = un `BEGIN…COMMIT` con preflight fail-closed + POST-check en transacción (falla → rollback total, nada parcial).

**Tripwire anti-producción (confirmado):** Temporadas exige tenant ALS en UUID `5aa10886-2a76-4a9e-9bc3-303fb776cd49` (solo staging; prod difiere) → GUARD ABORT. Concurrencia usa fingerprint dual (staging: proc_*≥30 + ALS exacto + calendario_data.main / rehearsal: marcador + ausencia calendario_data); prod nunca pasa ninguno. Nunca usa current_database(). Confirmar además que la barra de Supabase diga `nlvfjpwiecgrosjnwwik` antes de pegar.

## SET A — CONCURRENCIA (orden 50 → 60 → 70)
- **A1 `concurrency_v2/50_ledger_idempotencia_schema.sql`**: agrega `idempotency_key` + 2 índices UNIQUE parciales. Preflight aborta si ya hay dups. Postcheck: 1 columna + 2 índices. Rollback `99_rollback.sql`. Self-contained. Smoke: 2 inserts con misma idempotency_key → 2º unique_violation.
- **A2 `60_registrar_movimiento_fix.sql`**: registrar_movimiento con FOR UPDATE en lote **+ PT + pallet** (antes solo lote → oversell). Preflight exige A1 (columna). Postcheck: `pronargs=16, count=1`. **Depende de A1.**
- **A3 `70_reversar_fix.sql`**: reversar idempotente + backstop unique. Preflight exige A1 (índice). **DEPENDE TAMBIÉN de A2** (llama a la firma 16-arg) — el preflight NO lo verifica; aplicar A2 antes o las reversas fallan en runtime.
- Rollback total Set A = `99_rollback.sql` (revierte 70+60+50). Smoke set: `90_harness_concurrency.sql` PART 1 (self-contained, ROLLBACK) → `[P1] PASS`.

## SET B — TEMPORADAS (orden 30 → 20 → 40; SIN G1)
- **B1 `temporadas_v2/30_ms_g3_identidad_temporada.sql`**: normaliza `temporada_codigo`, materializa códigos huérfanos como `cerrada`, reetiqueta `s-t`/vacío → `HIST-SIN-TEMP` (auditado), agrega FK compuesta. Único paso no-puramente-aditivo. Rollback inline `:234-253` (backfill reversible vía proc_audit_log). Self-contained.
- **B2 `20_ms_g2_lifecycle_enforce.sql`**: guard BEFORE INSERT (no escribir en cerrada/anulada) + índice "una activa" + tabla reapertura_permiso + RPC reabrir (DEFINER, auditado). Preflight aborta si ya hay >1 activa. **Caveat integrador:** `proc_temporada_reapertura_permiso` va SIN RLS productiva + RPC DEFINER — agregar policy por empresa + REVOKE anon antes de tratarla productiva. Correr tras 30.
- **B3 `40_ms_g4_solape_exclude.sql`**: EXCLUDE gist anti-solape de rangos de fecha por empresa (+ btree_gist). Preflight aborta y lista pares solapados. Self-contained.

## MS-G1 — NO correr remoto todavía
`10_ms_g1_correlativo_temporada_enforce.sql` endurece el correlativo server-side, pero **7 create-paths del frontend siguen mandando `"s-t"`** → si G1 entra, esos flujos fallan al crear. Deben ir en el mismo release. Archivos a corregir (reemplazar `temporada||"s-t"` por temporada validada del catálogo, patrón `NuevaRecepcion.jsx`/`temporadaDeFecha`): `Ordenes.jsx:42`, `Programa.jsx:42,64`, `Despachos.jsx:54`, `BasesCobro.jsx:50-52`, `ProductoTerminado.jsx:63-64`, `Repaletizaje.jsx:65-66`, **`Informes.jsx:50-51`** (7º path, omitido en el README original). Preferido: centralizar `resolverTemporada(fecha)` en `useServiceContext`/`ServiceProvider`. Aceptación: grep `'s-t'` en `src/proceso/ui/pages/` = 0.

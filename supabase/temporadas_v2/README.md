# Temporadas v2 — drafts SQL (DISEÑO, NO EJECUTADOS)

Capability "Temporadas v2": endurece integridad de temporada en `proc_*`. Cierra los 4 gaps
de `docs/proc-multiseason-hardening.md`. **Ningún script fue ejecutado.** Todos son drafts
para revisión + rehearsal local (Docker) antes de tocar STAGING.

## Reglas de este carril
- Solo archivos NUEVOS en `supabase/temporadas_v2/` + `docs/temporadas-v2-frontend-plan.md`.
- NO SQL remoto, NO Supabase, NO deploy/push/merge/commit (los hace el integrador).
- Cada script mutante: `BEGIN/COMMIT` + preflight fail-closed embebido + POST-check + rollback
  documentado + nota de rehearsal. GUARD ABORT = HARD STOP.

## Fingerprint de destino (idéntico en los 4 scripts)
Aborta salvo que TODO se cumpla (STAGING `nlvfjpwiecgrosjnwwik`):
1. baseline `proc_temporada` + `proc_correlativo` + `proc_movimiento` presentes,
2. `calendario_data` con fila `id='main'`,
3. tenant ALS con UUID `5aa10886-2a76-4a9e-9bc3-303fb776cd49` y `codigo='ALS'`.

El UUID exacto de ALS solo existe en STAGING; su ausencia sugiere PRODUCCIÓN
(`bywovqayuzodbzwsriet`, HANDS-OFF) → HARD STOP. Ref canónico: `00_preflight_guard.sql`.

## Archivos y orden de aplicación
| # | Archivo | Gap | Qué resuelve |
|---|---|---|---|
| 00 | `00_preflight_guard.sql` | — | Guard canónico (referencia; no muta). |
| 10 | `10_ms_g1_correlativo_temporada_enforce.sql` | GAP-1 (C) | `proc_fn_siguiente_correlativo` rechaza `s-t`/vacío/inexistente; valida contra catálogo `activa`/`planificada`. |
| 20 | `20_ms_g2_lifecycle_enforce.sql` | GAP-2 (C) | trigger BEFORE INSERT (no escribir en temporada `cerrada`/`anulada`) + índice único parcial "una activa por empresa" + RPC de reapertura con permiso + auditoría. |
| 30 | `30_ms_g3_identidad_temporada.sql` | GAP-3 (B) | FK lógica `(empresa_id,temporada_codigo)`→`proc_temporada`; backfill que materializa histórico y reetiqueta `s-t`→sentinela (nunca borra); agrega columna a orden/programa. |
| 40 | `40_ms_g4_solape_exclude.sql` | GAP-4 (B) | `EXCLUDE USING gist` (btree_gist): sin rangos de fecha solapados por empresa. |

**Orden recomendado:** 10 → 30 → 20 → 40.
Racional: 30 materializa/normaliza el catálogo y limpia `s-t` **antes** de que 20 imponga el
lifecycle y 40 la no-superposición; 10 es independiente pero conviene primero para cerrar la
emisión de folios inválidos. Cada uno es reejecutable (idempotente) y revertible por separado.

## Dependencia de frontend (NO incluida aquí)
MS-G1 obliga a cambiar 6 create-paths (`Ordenes/Programa/Despachos/BasesCobro/
ProductoTerminado/Repaletizaje`) para derivar temporada obligatoria y dejar de emitir `'s-t'`.
Ese cambio lo aplica el integrador siguiendo `docs/temporadas-v2-frontend-plan.md`.
**Backend MS-G1 y frontend van en el mismo release** (si no, esos flujos fallan al crear).

## Rehearsal (Docker local, NUNCA staging/prod)
Cada script trae su "NOTA DE REHEARSAL". Flujo general:
1. Postgres 15 en Docker; cargar `schema_core_identity_v1` + `schema_proc_v1..v7_f7_1`.
2. Seed mínimo para el guard: ALS (UUID exacto, codigo ALS) + `calendario_data(id='main')`
   + al menos una `proc_temporada` `activa`.
3. Ejecutar el script; confirmar `GUARD OK` + `POST-CHECK OK`.
4. Probar los casos negativos de la nota; revertir con el bloque ROLLBACK del propio archivo.

### Harness automatizado (ejecutado 2026-08-25) — `rehearsal/`
Rehearsal LOCAL reproducible contra Docker `proc_uat`, DB efímera de nombre único
(`ms_reh` / `ms_reh_g34`), con schema MÍNIMO FIEL (nombres/tipos de columna exactos del
baseline; se siembra el fingerprint STAGING a propósito para pasar el guard en local).
Cada probe compara ANTES (reproduce el gap) vs DESPUÉS (fix lo cierra) + rollback + reapply.

| Script | Cubre | Resultado |
|---|---|---|
| `rehearsal/run_rehearsal.sh`  | MS-G1 + MS-G2 (BEFORE/AFTER/ROLLBACK/REAPPLY) | **23/23 PASS** |
| `rehearsal/smoke_g3_g4.sh`    | MS-G3 + MS-G4 (apply + enforcement nuclear)   | **9/9 PASS** |

Archivos: `00_min_baseline.sql` (schema+seed), `10/11/12` (G1 before/after/rollback),
`20/21` (G2 before/after). Correr: `bash rehearsal/run_rehearsal.sh` (crea y DROP la DB).

**Bug encontrado y corregido por el rehearsal (30_ms_g3):** el backfill de
`proc_orden_proceso/proc_programa_proceso` usaba `UPDATE ... SET x=c.codigo FROM LATERAL(...) c`
donde el LATERAL referenciaba la tabla objetivo del UPDATE → Postgres lo rechaza
(`invalid reference to FROM-clause entry for table "o"`). Se cambió a subconsulta escalar
correlacionada (misma lógica; el guard `count()=1` del WHERE garantiza unicidad). Fix marcado
inline con comentario `FIX (rehearsal MS-G3, 2026-08-25)`.

## RLS pendiente (para el integrador)
- `20_*` crea `proc_temporada_reapertura_permiso` **sin** política RLS productiva (solo el objeto).
  Aplicar la política por `empresa_id = proc_current_empresa()` + `REVOKE anon` como el resto de
  `proc_*` (ver el bloque RLS de `schema_proc_v1.sql`) antes de considerar productivo.
- El RPC `proc_fn_reabrir_temporada` es `SECURITY DEFINER`: en STAGING corre como `postgres`
  (superusuario, bypass RLS). Confirmar el owner/`search_path` al desplegar.

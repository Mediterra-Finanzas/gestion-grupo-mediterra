# R5 — Plan de certificación del cierre del bridge anon (post R4)

Estado: DISEÑO (no ejecutado en remoto). Target: staging **nlvfjpwiecgrosjnwwik**. Producción HANDS-OFF.
Precondición: R4-A (drop `_dev_uat`) + R4-B (revoke anon) aplicados en staging, con la app corriendo
100% authenticated (`REACT_APP_PROC_AUTH=true` + token Option C vivo).

Objetivo de R5: **probar E2E que `anon` ya no puede leer ni escribir `proc_*`, y que `authenticated`
con membership sí puede — sin regresión** (tenant enforcement intacto, app legada intacta).

---

## Matriz de certificación (fail-closed)

| # | Actor | Operación | Objeto | Esperado POST-R4 | Prueba |
|---|-------|-----------|--------|------------------|--------|
| R5-01 | anon (anon key) | SELECT | `proc_recepcion` | **401 / permission denied** | REST `GET /rest/v1/proc_recepcion` con `apikey=anon` |
| R5-02 | anon | INSERT | `proc_lote` | **401 / permission denied** | REST POST con anon key |
| R5-03 | anon | SELECT | `proc_v_*` (cualquier read-model) | **401 / permission denied** | REST GET vista |
| R5-04 | anon | EXECUTE | `proc_fn_*` (RPC operacional) | **401 / permission denied** | REST `POST /rest/v1/rpc/...` |
| R5-05 | anon | SELECT | `proc_tipo_movimiento` (catálogo global) | **401 / permission denied** | REST GET |
| R5-06 | authenticated + X-Proc-Empresa=ALS (membership) | SELECT | `proc_recepcion` | **ALLOW, solo filas ALS** | login Option C real → GET con Bearer token + header |
| R5-07 | authenticated ALS | INSERT empresa=ALS | `proc_lote` | **ALLOW (1 fila)** | POST con token |
| R5-08 | authenticated ALS | INSERT empresa=B (ajena) | `proc_lote` | **DENY (WITH CHECK)** | POST con token |
| R5-09 | authenticated header=B (sin membership B) | SELECT | `proc_recepcion` | **0 filas (RLS filtra)** | GET token + header B |
| R5-10 | authenticated ALS | EXECUTE | `proc_fn_*` operacional | **ALLOW** | rpc con token |
| R5-11 | authenticated sin membership (Carol) | SELECT | `proc_lote` | **0 filas** | login Carol → GET |
| R5-12 | anon (anon key) | SELECT/UPSERT | `calendario_data` | **ALLOW (NO-REGRESIÓN app legada)** | REST con anon key |
| R5-13 | — | inventario | schema | **0 policies `pol_%_dev_uat`** | SQL `SELECT count(*) FROM pg_policies WHERE policyname LIKE 'pol\_%\_dev\_uat'` |
| R5-14 | — | inventario | grants | **0 grants anon en `proc_*`/`proc_v_*`/`proc_fn_*`** | SQL sobre `information_schema.role_*_grants` |
| R5-15 | — | inventario | grants | **grants `authenticated` sobre `proc_*` sin cambio vs baseline pre-R4** | SQL diff |
| R5-16 | — | inventario | función | **`proc_whoami()` eliminada** (tras R5-CLEANUP) | SQL `pg_proc` |

Regla de aprobación: **16/16 en verde**. Cualquier R5-01..05 que devuelva datos = STOP (bridge no cerrado).
Cualquier R5-06/07/10/12 en DENY = STOP (regresión: se rompió authenticated o la app legada).

## Insumos reutilizables (no rediseñar)

- **Fixture authenticated real**: reutilizar `R3-S5-C-M2_apply.sql` / `M2_validate.sql` / `M3_rollback.sql`
  (crea auth.users sintético + membership + prueba SELECT/INSERT bajo contexto A y B). La misma matriz
  4-celdas {SELECT,INSERT}×{ALLOW A, DENY B} sirve para R5-06..09.
- **Prueba de revocación en vivo**: `R3-S6_browser.js` (T0 ALLOW → `R3-S6_revoke.sql` → T2 DENY sin nuevo token).
- **Deny-browser anon**: el navegador con anon key contra `proc_*` ya no debe cargar datos (equivalente
  a AUTH-C-14 del harness local).
- **Teardown**: `R3-S6_cleanup.sql` + borrar auth.users sintético desde Dashboard (no por SQL).

## Secuencia sugerida (micro-gates, una pantalla a la vez)

1. **R5-PRE**: snapshot inventario (policies `_dev_uat`, grants anon proc_*, grants authenticated proc_*,
   grants anon calendario_data). Guardar como baseline.
2. **R5-INV** (R5-13..15): correr post-R4 → confirmar 0 `_dev_uat`, 0 anon proc_*, authenticated y
   calendario_data intactos.
3. **R5-ANON** (R5-01..05, R5-12): REST con anon key → proc_* DENY, calendario_data ALLOW.
4. **R5-AUTH** (R5-06..11): login Option C real (fixture M2) → tenant ALLOW/DENY según matriz.
5. **R5-CLEANUP**: `R5-CLEANUP_drop_whoami.sql` → R5-16.
6. **R5-TEARDOWN**: cleanup fixture + auth.users (Dashboard).

## Rollback si R5 falla

- Si R5-06/07/10/12 caen (authenticated o app legada rota): `R4-B_rollback` (re-grant anon) y/o
  `R4-A_rollback.sql` (re-crear `_dev_uat`) → vuelve al estado bridge, app operativa, diagnosticar.
- El estado intermedio (R4-A aplicado, R4-B no) es seguro para authenticated pero deja anon con grant
  sin policy (RLS filtra) — no dejar staging ahí más de lo necesario; R4-A+R4-B son inseparables.

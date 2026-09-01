# RLS-HARDEN-PROC — H1 / H1.5 / H2-DESIGN (read-only, sin ejecución)

Estado: H1 CERRADO · H1.5 CERRADO (0 blockers) · H2 = DISEÑADO (no ejecutado). Target: staging nlvfjpwiecgrosjnwwik. Producción HANDS-OFF.

## H1 (mapa, autoritativo staging)
- proc_objetos=96, tablas base=62, RLS enabled=62, **FORCE=59** (3 sin FORCE: proc_tipo_envase, proc_envase_movimiento, proc_tipo_movimiento).
- policies_total=170, dev_policies=109, USING true=110, WITH CHECK true=109.
- **48 tablas UNSAFE** = tienen `pol_<t>_DEV_ONLY` PERMISSIVE `TO public USING(true) WITH CHECK(true)` que OR-ea la `_empresa` → bypass a authenticated. (+1 flagged benigna: proc_tipo_movimiento `_cat`.)
- 61 `_DEV_UAT {anon}` = bridge (R4). Tenant lineage: 60 DIRECT (empresa_id) · 1 GLOBAL · 0 INDIRECT · 0 UNKNOWN · ~34 vistas security_invoker.

## H1.5 (audit RPC — VERDICTO: SEGURO retirar las 48)
- 77 funciones proc_* (staging): **6 SECURITY DEFINER** (proc_current_empresa/iam_user/user resolvers + proc_fn_auth_attempt/reset throttle + proc_whoami; search_path fijo 6/6, todas seguras) · **71 SECURITY INVOKER** (todos los RPC de negocio).
- **0 cross-tenant blockers.** Los RPC INVOKER corren con RLS del caller → `p_empresa_id` nunca elude RLS; write ajeno → WITH CHECK deny; read ajeno → RLS filtra → NOT FOUND fail-closed. ~40 usan p_empresa directo pero neutralizados por INVOKER+RLS.
- Auth helpers server-authoritative, membership revalidada por request, header malformado fail-closed.
- **Dependencia crítica:** `proc_current_empresa()` tiene 2 defs (v1 INVOKER trust-claim vs v2 DEFINER revalida-membership); gana la última aplicada. v2 confirmada vigente (secdef=true + prueba whoami). H2 debe garantizar v2 en el orden de deploy.

## H2 DESIGN (por lotes, fail-closed, reversible)

### H2-A — DROP de las 48 `_DEV_ONLY` (núcleo, cierra el bypass a authenticated)
7 lotes (F1..F6 + F7.1), cada uno una transacción independiente:
```
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY[ ...tablas del lote... ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_DEV_ONLY ON %1$s;', t);
  END LOOP; END $$;
```
Preserva `pol_<t>_empresa` (estricta) y `pol_<t>_DEV_UAT {anon}` (bridge). Nombres/orígenes:
- F1(13): schema_proc_v1_DEV_ONLY_rls.sql:21-23 · F2(14): v2_f2_DEV_ONLY_rls.sql:10-13 · F3(7): v3_f3:8-9 · F4(3): v4_f4:8 · F5(5): v5_f5:8 · F6(5): v6_f6:8 · F7.1(1): v7_f7_1:8.

**REVOKE anon → NO en H2, va a R4.** Motivo: en Postgres los grants no se atribuyen a su origen; un `REVOKE ALL FROM anon` borraría tanto lo del `_DEV_ONLY` como lo del `_DEV_UAT` (bridge), dejando staging inconsistente y adelantando R4. H2-A = solo los 48 DROP (eso cierra la vuln a authenticated). El REVOKE anon global es R4.

### H2-B — 3 tablas sin FORCE
- **proc_tipo_envase** (v10 e1:28,35): `FORCE ROW LEVEL SECURITY` + `REVOKE ALL FROM anon` (grant anon = anomalía del propio schema v10, no del bridge).
- **proc_envase_movimiento** (v10 e2:53,57): `FORCE` + `REVOKE ALL FROM anon` (queda authenticated SELECT,INSERT; trigger append-only intacto).
- **proc_tipo_movimiento** (v1:549-553): **NO forzar** (catálogo global read-only, ya endurecido: anon revocado, policy `_cat USING(true)` intencional). FORCE sería cosmético.

### H2-D — Vistas
18 vistas `proc_v_*` con `security_invoker=on` → heredan el RLS de base tras H2, sin acción. Sin vistas DEFINER/owner-bypass. Los `GRANT SELECT TO anon` sobre vistas vienen solo del bridge → R4.

### H2-F — Re-E2E con fixture M2 (prueba flip a DENY)
Re-usar R3-S5-C-M2_apply/validate/M3_rollback (no rediseñar). Matriz antes/después 4 celdas: {SELECT B, INSERT B} × {H1=ALLOW, H2=DENY} bajo contexto A; simetría con contexto B; anti-regresión tenant propio (SELECT A sigue =1). Teardown M3 + borrar auth.users sintético.

### Gate por lotes (estructura fail-closed)
- **Guard destino H2** (NO el _staging_target_guard clean-staging, que aborta si proc_* existe): fingerprint `to_regclass('public.proc_recepcion') NOT NULL` + bridge anon ≥1 (proc_* debe existir). Ref esperado nlvfjpwiecgrosjnwwik.
- **Preflight por lote:** por cada tabla, confirmar que `pol_<t>_empresa` EXISTE antes de dropear su `_DEV_ONLY` (nunca dejar una tabla sin policy estricta) + contar `_DEV_UAT` para verificar POST.
- **POST-check por lote:** 0 `_DEV_ONLY` restantes; `_empresa` intacta (qual/with_check = empresa_id=proc_current_empresa()); `_DEV_UAT` intacto.
- **Rollback:** re-CREATE `pol_<t>_DEV_ONLY USING(true) WITH CHECK(true)` (post-commit) o ROLLBACK de la transacción del lote.
- **Orden:** F1→F7.1 (sin dependencia entre lotes; se puede detener entre lotes; todo estado intermedio es seguro para authenticated).
- **REHEARSAL local (Docker) 1:1** con c_local_test_setup.sql: reproducir _empresa + _DEV_ONLY + _DEV_UAT sobre proc_lote, correr ataque cross-tenant (ALLOW), aplicar DROP, re-correr (DENY), verificar _DEV_UAT intacto, ensayar rollback (ALLOW de nuevo).

## PRECONDICIÓN (viva, no la toca H2)
`REACT_APP_PROC_AUTH=true` + token authenticated deben seguir activos al DROP. Sin ellos → `proc_current_empresa()=NULL` → la `_empresa` estricta niega TODO → app-muerta. Confirmado activo (login real Opción C funciona).

## Acoples a decidir antes de correr H2
1. REVOKE anon (48) → ceder a R4 (recomendado). H2 = solo 48 DROP.
2. H2-B v10: FORCE + REVOKE anon en las 2 envases; tipo_movimiento no forzar.
3. Precondición flag auth viva al momento del DROP.

## No incluido en H2 (registro)
- R4: retiro de `_DEV_UAT {anon}` + REVOKE anon global + grants anon de vistas.
- CONC (gate propio): CONC-B2 (registrar_movimiento pallet/PT sin FOR UPDATE), CONC-B3 (reversar doble), idempotencia ledger (UNIQUE(empresa_id,transaccion_id) + ON CONFLICT).
- proc_whoami cleanup (DROP tras cerrar R3-S5).

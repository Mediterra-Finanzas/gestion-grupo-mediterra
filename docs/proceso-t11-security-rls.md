# T11 — Seguridad / RLS / Tenant

**Alcance:** RLS productiva estricta desde F1 hasta PROC-REPORTING-DAILY-001, verificada en
PG16 contra el schema **productivo (sin DEV_ONLY)**.

## Sweep anon-DENY (consolidado)
`t11_rls_sweep.sql` recorre **todas** las tablas `proc_*` con el rol `anon` y verifica que cada
SELECT sea denegado:
- **Resultado: anon DENY en 59/59 tablas proc_*** (0 fugas).
- Vistas nuevas (`proc_v_reporte_ejecucion`, `proc_v_cliente_servicio`, `proc_v_recepcion_conciliacion`,
  `proc_v_qc_recepcion_resumen`) → `security_invoker` → heredan la RLS de las tablas base → anon DENY.
- RPC del motor de reporting (`proc_fn_reporte_generar_ejecucion`) → anon DENY (grant sólo a authenticated).

## Aislamiento por tenant
| Verificación | Resultado |
|---|---|
| authenticated tenant A → sólo datos de A (ficha, reporte_config, empresa_config) | **PASS** |
| authenticated tenant B → sólo datos de B; NO ve ficha de A | **PASS** |
| cross-tenant SELECT | **DENY** |
| cross-tenant INSERT (WITH CHECK) — ficha/config/reporte | **DENY** |
| cross-tenant motor de reporting (config de otro tenant) | **DENY** (no encontrada) |

Gates específicos previos siguen verdes: QC (T-1..NEG-2), MASA (S), T10d (TRLS-1..7),
Reporting (S,T). Ver los tests por-fase.

## Patrón RLS (uniforme, todas las tablas nuevas)
`ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` + policy
`empresa_id = proc_current_empresa()` (USING + WITH CHECK) + `REVOKE ALL ... FROM anon` +
`GRANT SELECT,INSERT,UPDATE,DELETE ... TO authenticated`. Vistas de lectura: `security_invoker=on`.

## RPC / SECURITY DEFINER / search_path
- Las funciones proc_* son **SECURITY INVOKER** (default plpgsql/sql) → heredan la RLS del caller;
  NO hay bypass accidental. El `p_empresa` recibido NO es autoridad de seguridad: la RLS filtra por
  `proc_current_empresa()` (claim del JWT), de modo que un `p_empresa` ajeno no expone datos.
- **0 funciones SECURITY DEFINER** en la superficie de reporting/T10 (verificado: el schema no
  declara `SECURITY DEFINER`). No aplica endurecimiento de `search_path` porque no hay DEFINER.
- Grants mínimos: sólo `authenticated`; `anon` revocado.

## Identidad productiva — gap abierto
`CORE-IDENTITY-TENANCY-001` permanece **ABIERTO**. La app autentica client-side y opera como
`anon`; el claim `empresa_id` no se emite hoy, por lo que la RLS estricta deniega a la app real
salvo mediante el bridge DEV/UAT (**DEV_ONLY**, no productivo). El bridge **NO resuelve** la
identidad productiva. `PRODUCTION IDENTITY = BLOCKED`.

## Bounded-context (aislamiento)
Ver `proceso-t11-defects.md` §bounded-context. Cero dependencia funcional/estructural a
`frisku_*`, `friskuBI`, `exp_*`, `osi_*`. Foods sólo como Cliente Service vía `proc_vinculo`.
Catálogos Especie/Variedad propios de Service.

## Estados de seguridad
`RLS/TENANT (alcance comprobable) = PASS` · `PRODUCTION IDENTITY = BLOCKED (CORE-IDENTITY-TENANCY-001)`.

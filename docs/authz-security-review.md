# AUTHZ — Security Review + Coverage Matrix (Allegria Service `proc_*`)

Fecha: 2026-08-31. Alcance: capa AUTHZ `supabase/authz_v1/01..07`. Estado: LOCAL, no desplegado.
Base: audit full-schema autoritativo (62 tablas `proc_*`) + test de integración `rehearsal/authz_coverage_test.sh` (21/21 PASS contra el esquema real en Docker).

## 1. Conteo autoritativo de superficies de escritura

| categoría | n | detalle |
|---|---:|---|
| Tablas `proc_*` canónicas | 62 | (excluye copias rehearsal/test = DEAD) |
| **WRITE PATHS TOTAL** | **60** | 62 − `proc_tipo_movimiento` (read-only) − `proc_temporada_reapertura_permiso` (deny-browser, no client-writable) |
| **PROTECTED** | **49** | 03 (21) + 07 hijas (13) + 07 config escritura (23) − solapes. Ver desglose |
| **TENANT-ONLY (restante)** | **8** | ledger/log de baja superficie (justificado abajo) |
| **READ-ONLY** | **1** | `proc_tipo_movimiento` |
| DEAD/NO-RUNTIME | 0 | (harnesses no desplegados) |

Desglose PROTECTED tras `07`:
- **21** tablas operacionales primarias (03): recepcion/lotes/qc/proceso/inventario/repaletizaje/despacho/tarifas/contratos/reporting/temporada — SELECT `<dom>.ver` + escritura write-cap.
- **6** con transición elevada (04): orden_proceso, despacho, temporada, tarifa, base_cobro, cliente_contrato.
- **+1** transición elevada nueva (07): `proc_informe_version` (emisión → `reporting.enviar`).
- **13** hijas/detalle (07 §2): resultado_descarte/merma, informe_version/fuente/destinatario/envio, base_cobro_linea, pallet_linea, repaletizaje_origen/destino, despacho_doc, cliente_ficha, envase_movimiento — heredan la capability del agregado padre.
- **23** catálogos/config (07 §3): escritura gateada (SELECT abierto al tenant para no romper la app).

## 2. P0 / P1 / CONFIG

- **P0 UNPROTECTED = 0.** Los 3 P0 del audit quedaron cerrados y probados:
  1. `proc_resultado_descarte` → `proceso.ejecutar` (03-style). Test: produccion ALLOW, comercial DENY.
  2. `proc_resultado_merma` → `proceso.ejecutar`. Test: produccion ALLOW, sin-rol DENY.
  3. `proc_informe_version` (emisión) → `reporting.enviar` (RLS write-cap + trigger `estado→emitida/reemplazada`). Test: comercial ALLOW, produccion DENY (0 filas / trigger).
- **P1 UNPROTECTED = 0 tras 07.** Las hijas con bypass directo latente (base_cobro_linea, pallet_linea, repaletizaje_*, informe_fuente/destinatario/envio, despacho_doc, cliente_ficha, envase_movimiento) ahora exigen la capability del agregado padre en su propia RLS → se elimina el bypass PostgREST directo, además del path RPC ya gateado.
- **CONFIG UNPROTECTED = 0 (escritura).** Clase B (14, reglas/tarifas/trazabilidad) → `config.administrar` (solo PROC_ADMIN). Clase A (9, catálogos operacionales) → `config.editar` (PROC_JEFE_PLANTA + PROC_ADMIN). La LECTURA queda tenant-only por diseño (los dropdowns deben funcionar para todo rol) — decisión explícita, no un gap.

### Tenant-only restante (8) — justificación de diferir a POST-GO-LIVE
- `proc_reporte_ejecucion` (log de ejecución de reportes; escrito por el motor/service; trigger-guard presente).
- `proc_correlativo` (folios; escrito por RPC `siguiente_correlativo` en muchos flujos operacionales — gatear su escritura rompería la asignación de folios; hardening = pasar el RPC a SECURITY DEFINER y revocar escritura directa; follow-up dedicado).
- `proc_audit_log` (append-only, escrito por triggers; integridad ya por trigger `block_ledger_mutation`).
- Restantes: tablas de bajo volumen / no material. **Ninguna permite modificación material/financiera/operacional directa desde el cliente** (esas están todas en PROTECTED). Se listan como P2 hardening.

## 3. Review de escalación de privilegios (server-authoritative)

| vector | control | evidencia |
|---|---|---|
| UI se auto-otorga permisos | La UI NO es autoridad: `caps`/`hasCap` solo reflejan; toda decisión es RLS/trigger/RPC server-side | `useServiceContext.jsx:26-43`; test bypass directo DENY |
| Bypass por PostgREST directo (sin pasar por RPC) | RLS `WITH CHECK` capability AND tenant en cada tabla mutable | 03/07; test "comercial NO escribe resultado_descarte" DENY |
| Bypass por RPC INVOKER | El RPC corre bajo el caller; su UPDATE/INSERT dispara la misma RLS + triggers | 04/07; test "produccion NO emite informe_version" DENY |
| Cross-tenant (forjar `X-Proc-Empresa`) | `proc_current_empresa()` re-valida; RLS exige `empresa_id=proc_current_empresa()` | test "admin forja otra empresa" DENY |
| Auto-escalación (asignarse un rol) | `iam_fn_asignar_rol` exige `usuarios.administrar` + mismo tenant + membership del target; audita actor | `02:52-71`; foundation 28/28 |
| SoD (editar = aprobar) | `tarifas.editar` ≠ `tarifas.aprobar`; `config.editar` ≠ `config.administrar`; jefe ≠ admin-usuarios | test "comercial edita tarifa ALLOW / jefe NO especie DENY" |
| Revocación tardía | `activo=false` → next-request sin caps (STABLE, re-evalúa por statement) | test "revoca jefe → DENY" |
| Identidad nula / sin rol / sin membership | fail-closed: `proc_has_capability` retorna false si iam_user/empresa NULL o sin rol activo | test "sin-rol DENY" |
| Definer no defeat | `proc_has_capability` resuelve identidad por JWT (`proc_current_iam_user`), no por rol SQL | `02:9-22` |
| PUBLIC/anon en funciones authz | `REVOKE PUBLIC, anon` en todas; GRANT solo authenticated+service_role | `02:23,36,47,70,86` |

Residual conocido (documentado, no bloqueante P0): `proc_correlativo`/`proc_reporte_ejecucion`/`proc_audit_log` tenant-only (P2 hardening arriba).

## 4. Tests

- **Integración full-schema (este incremento):** `authz_coverage_test.sh` = **21/21 PASS** contra el esquema real `proc_*` (Docker), DATA LOSS=0 (todo ROLLBACK). Cubre: hijos vía agregado, bypass directo de hijo, catálogo autorizado/no autorizado, cross-tenant, viewer no configura, operador no administra, comercial no toca config de planta, sin-rol/sin-membership, revocación next-request, lectura abierta, regresión 03/04.
- **Previos (2026-08-30):** foundation 28/28, dominio 12/12, transiciones 10/10 (harnesses de sesión previa). **Total acumulado = 71.**

## 5. Rollback

Cada archivo (03/04/07) trae rollback inline. `07` restaura las 27+ tablas a tenant-only y quita el trigger nuevo. Aditivo e idempotente. No destruye datos.

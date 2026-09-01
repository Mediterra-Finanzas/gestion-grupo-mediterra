# AUTHZ Allegria Service (PROC) — Assessment + Diseño objetivo

Fecha: 2026-08-30. Estado: **ASSESSMENT (B1) cerrado + DISEÑO (B2) + PLAN (B3)**. No ejecutado remoto. Producción HANDS-OFF.

## B1 — Assessment (read-only, 3 auditorías)

**Modelo actual = MEMBERSHIP-ONLY.** Solo existen `iam_usuario` + `iam_usuario_empresa`. No hay `iam_rol`, `iam_permiso`, `iam_capability`, ni bridge. No hay `has_role/has_permission/can_*/authorize`.

Enforcement real (servidor):
- RLS uniforme en cada `proc_*`: `USING/WITH CHECK (empresa_id = proc_current_empresa())` (`schema_proc_v1.sql:518-554`). Solo aislamiento por tenant.
- Grants blanket `SELECT,INSERT,UPDATE,DELETE TO authenticated` en tablas mutables.
- RPCs de estado (`proc_fn_cambiar_estado_orden/despacho`, INVOKER): validan **legalidad de transición + concurrencia optimista**, NO el rol del actor. Reciben `p_actor` pero nunca lo verifican.
- Aprobaciones/emisión (`proc_fn_aprobar_base`, `proc_fn_emitir_version`): validan **estado**, no actor. `autorizado_por` es dato, no gate.
- **Única excepción con gate real por usuario:** `proc_fn_reabrir_temporada` (SECURITY DEFINER) consulta `proc_temporada_reapertura_permiso(empresa,usuario,activo)` — la única operación no implicada por la sola membership.

Frontend/API:
- UI: `puedeEditar(tab)` = binario `editar`/`sin_acceso` por pestaña de navegación; el propio código lo declara **"reflejo, NO seguridad"** (`useServiceContext.jsx:30-34`, `AllegriaServiceModule.jsx:4-6`). `esAdmin` → todo.
- Capa RPC (`procesoDB.js`): solo adjunta `apikey`+`Bearer`+`X-Proc-Empresa`. Sin lógica de permiso por operación.
- No hay pantalla "Administración → Usuarios y permisos".

Auditoría:
- `proc_audit_log` (trigger genérico, before/after, actor) cubre datos PROC.
- Los grants de membership (`iam_usuario_empresa`) **no tienen auditoría** (solo `created_at/updated_at`, sin `granted_by`/before-after). Solo `proc_temporada_reapertura_permiso` audita quién otorgó.

**VEREDICTO: TODOS LOS MIEMBROS ALS PUEDEN HACER TODO = YES.** Cualquier authenticated con `empresa_id`=ALS tiene CRUD total sobre todo `proc_*` y maneja todas las máquinas de estado. **PROD-BLOCKER AUTHZ = YES.** Sin SoD/maker-checker en ninguna aprobación.

## B2 — Diseño objetivo (mínimo prod-correcto, reconciliado con la arquitectura existente)

Cadena: **usuario → membership empresa (ya existe) → rol(es) → capabilities → operación.** Roles = paquetes de capabilities. Se REUTILIZA todo lo existente (iam_usuario/iam_usuario_empresa, resolvers v2, RLS por tenant, `puedeEditar` como capa cosmética) y se AGREGA una capa de capabilities server-authoritative.

Tablas nuevas (IAM, server-only deny-browser como iam_*):
- `iam_capability(codigo pk, dominio, descripcion)` — catálogo (ej. `recepcion.crear`, `proceso.reabrir`, `tarifas.aprobar`, `usuarios.administrar`).
- `iam_rol(codigo pk, nombre, descripcion)` — PROC_ADMIN / PROC_JEFE_PLANTA / PROC_RECEPCION / PROC_CALIDAD / PROC_PRODUCCION / PROC_BODEGA / PROC_DESPACHO / PROC_COMERCIAL / PROC_REPORTING / PROC_VIEWER.
- `iam_rol_capability(rol, capability)` — bridge N:M.
- `iam_usuario_empresa_rol(usuario_id, empresa_id, rol, activo, otorgado_por, created_at)` — asignación de roles POR TENANT (tenant-aware: un rol en ALS no da permisos en otra empresa).
- `iam_usuario_empresa_cap_override(usuario_id, empresa_id, capability, efecto grant|deny, otorgado_por, motivo)` — excepciones por usuario.
- `iam_authz_audit(actor_id, target_usuario_id, empresa_id, tipo rol|cap, valor, accion grant|revoke, antes jsonb, despues jsonb, motivo, created_at)` — cubre el gap de auditoría de grants.

Función de enforcement (autoridad):
- `proc_has_capability(p_cap text) RETURNS boolean` — SECURITY DEFINER, search_path fijo: resuelve `proc_current_iam_user()` + `proc_current_empresa()` → capabilities efectivas (caps de sus roles en esa empresa ∪ overrides grant, menos overrides deny) → ¿contiene `p_cap`? Sin identidad/empresa/cap → **false (fail-closed)**. Revocación efecto next-request (se re-evalúa por request, igual que el resolver de tenant).
- `proc_effective_caps() RETURNS setof text` — para que el frontend hidrate `puedeEditar` desde las capabilities REALES (deja de ser adivinanza).

Wiring del enforcement (la autoridad va al servidor, no a la UI):
- **Mutaciones vía RPC de estado** (proceso/despacho/temporada/aprobaciones): agregar `IF NOT proc_has_capability('<dominio.op>') THEN RAISE EXCEPTION 'no_autorizado' USING errcode='42501'; END IF;` al inicio de cada RPC. Es el punto más limpio (ya son el cuello de botella de esas operaciones).
- **CRUD directo por tabla** (recepción/lotes/QC/inventario/tarifas/contratos/reporting): dividir las policies RLS de escritura por capability — `FOR INSERT/UPDATE/DELETE ... WITH CHECK (empresa_id=proc_current_empresa() AND proc_has_capability('<dominio.op>'))`, dejando `FOR SELECT` con capability de lectura (`<dominio>.ver`). Mantiene el tenant + agrega la capability.
- **SELECT**: gate por `<dominio>.ver` (VIEWER lee, no muta).
- La UI sigue con `puedeEditar` pero alimentado por `proc_effective_caps()` (cosmético; el DENY real es server-side aunque invoquen la RPC directo desde DevTools).

SoD (separaciones a enforcar como capabilities distintas):
- `tarifas.editar` vs `tarifas.aprobar` (ejecutar ≠ aprobar).
- `temporada.cerrar` vs `temporada.reabrir` (generalizar el gate ya existente de reapertura al modelo).
- `inventario.ajustar` vs `inventario.ajustar.aprobar` (ajustar ≠ autorizar ajuste).
- `contratos.editar` vs `contratos.aprobar`.
- `usuarios.administrar` separado de toda capability operativa.

Admin desde la app:
- Pantalla **Administración → Usuarios y permisos** (gate `usuarios.administrar`): lista usuario·empresa·estado·roles·capabilities·overrides·historial; asignar/revocar rol y override; toda acción pasa por RPC server-side que verifica `usuarios.administrar` y escribe `iam_authz_audit`.

## B3 — Plan de materialización local (autorizado LOCAL; no remoto)

Objetos a construir (mínimo prod-safe, sin mega-plataforma):
- SQL: 6 tablas IAM + seed de 10 roles y ~40 capabilities + `proc_has_capability` + `proc_effective_caps` + RPCs de admin (`iam_fn_asignar_rol`, `iam_fn_override`, con audit) + retrofit de policies RLS por dominio + guards en RPCs de estado.
- Frontend: hidratar `useServiceContext` desde `proc_effective_caps`; pantalla admin usuarios/permisos (draft).
- Tests locales (Docker + node): la matriz de tests authz obligatoria (viewer no muta, recepción no reabre proceso, producción no edita tarifas, bodega no administra usuarios, sin-capability → DENY server-side directo, sin-membership → DENY, cross-tenant → DENY, revocación next-request, override, audit trail, DATA LOSS=0).

Riesgo: el retrofit toca la superficie RLS/RPC de ~12 dominios — es el trabajo grande; se hace por dominio con no-regresión (cada dominio: agregar capability sin romper el tenant existente).

Estimación (local, prod-correcto):
- Schema + capabilities + enforcement helper + seed + audit + admin RPCs: ~6-8 h.
- Retrofit enforcement por dominio (12 dominios × policies/RPC) + tests por dominio: ~10-14 h.
- Admin UI (usuarios/permisos) draft + hidratación UI: ~4-6 h.
- E2E local + reconciliación + no-regresión integral: ~3-5 h.
- **Total local prod-safe: ~23-33 h.** A piloto de equipo (con deploy staging + smoke authz): +~4-6 h. A Producción (merge + prod migration + QA/seguridad final): +~6-10 h.

## B3.1 MATERIALIZADO (local) — decisión de simplificación + evidencia

**Decisión: 4 tablas (no 6).** Se difiere `cap_override` por usuario a POST-GO-LIVE (los roles cubren el go-live) y el AUDIT de grants REUTILIZA `proc_audit_log` via trigger (no tabla nueva). Sin perder auditabilidad/SoD/extensibilidad/tenant/revocación. Tablas: `iam_capability`, `iam_rol`, `iam_rol_capability`, `iam_usuario_empresa_rol`. Archivos: `supabase/authz_v1/01_schema_authz.sql` (4 tablas + 47 capabilities + 10 roles + matriz + trigger audit) + `02_engine_authz.sql` (`proc_has_capability`/`proc_effective_caps`/`proc_require_capability` + `iam_fn_asignar_rol`/`iam_fn_revocar_rol`).

**Rehearsal E2E local = 28/28 PASS** (`authz_rehearsal.sh`): capabilities por rol (viewer/recep/prod/bodega/comer/admin/norole), enforcement RLS `capability AND tenant` incl. bypass directo DENY, sin-membership/cross-tenant DENY, admin RPC con anti-escalación (norole no se auto-otorga admin) + cross-tenant DENY, SoD (comercial edita tarifa pero NO aprueba), revocación next-request (t→f), audit con actor+before/after en grant vía RPC committed, DATA LOSS=0.

## MUST-HAVE (antes de prod) vs POST-GO-LIVE vs REUTILIZABLE

- **REUTILIZABLE (ya existe):** iam_usuario, iam_usuario_empresa, resolvers Option C, tenant RLS, proc_audit_log, `puedeEditar` (cosmético), patrón `proc_temporada_reapertura_permiso`.
- **MUST-HAVE (prod-safe):** roles/caps persistentes ✅, asignación por usuario+empresa ✅, enforcement server-side ✅(motor+demo; falta retrofit 12 dominios), revocación next-request ✅, tenant isolation ✅, SoD mínimo ✅(caps separadas; falta cablear en RPCs), audit de grants ✅, bootstrap seguro de admins (script + estrategia), admin UI usable (Administración→Usuarios y permisos), tests pos+neg+bypass ✅(motor). 
- **POST-GO-LIVE:** overrides por usuario, workflows de aprobación sofisticados, constructor visual de roles, IAM corporativo genérico multi-empresa.

## Bootstrap (cutover authz, fail-closed sin dejar a nadie afuera)

1. Deploy schema authz (aditivo, SIN enforcement todavía). 2. Seed capabilities/roles/matriz (idempotente). 3. **Bootstrap seed**: asignar roles iniciales a los usuarios ALS conocidos vía script one-time auditado — CRÍTICO: asignar `PROC_ADMIN` al/los admin designados ANTES de activar enforcement. 4. Validar `proc_effective_caps()` por usuario sembrado. 5. Activar enforcement (agregar predicados capability a RLS de escritura + `proc_require_capability` en RPCs de estado) = el flip fail-closed, solo tras provisionar admins+operadores. 6. Certificar (smoke authz). **Reversible** (quitar predicados → vuelve a membership-only; tablas aditivas). Staging primero; Producción con gate separado.

## Trabajo B3 restante (no construido este turno)

Retrofit enforcement por dominio (RLS write-policy splits + `proc_require_capability` en cada RPC de estado, 12 dominios), admin UI (Administración→Usuarios y permisos, sin UUIDs como UX primaria), hidratación de `puedeEditar` desde `proc_effective_caps`, script de bootstrap seed, matriz de tests por dominio + build. **Estimación restante ~18-26 h** (foundation ~5-7 h ya hecha del total ~23-33 h).

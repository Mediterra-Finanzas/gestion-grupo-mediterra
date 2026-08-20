# Acta de Entrega — F7.1 (Shell + Centro de Operaciones + Configuración base)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `59609ca` · **Estado:** VALIDATED (backend + build; revisión visual en vivo pendiente por Angelo — ver §5) · Sin merge, sin producción.

## 1. Qué se entregó

Primera capa de UI operacional productiva de Allegria Service: **shell del módulo + Centro de Operaciones + Configuración de maestros**, montada en Mediterra One como tile propio, sobre el contrato backend F1–F6 (UI delgada, backend autoridad). Más el **backend menor** autorizado: correlativos concurrency-safe, QC configurable por severidad, y read-models del Centro.

### Backend menor (`schema_proc_v7_f7_1.sql`, aditivo, no destructivo)
- **Correlativos humanos** (`proc_correlativo` + `proc_fn_siguiente_correlativo`): formato `TIPO-TEMP-NNNNNN`, scoped por (empresa, temporada, tipo), **concurrency-safe** vía `INSERT … ON CONFLICT DO UPDATE … RETURNING` (sin `MAX()+1`). UUID sigue siendo PK técnica; el correlativo es identificador humano. Prefijo configurable por tipo.
- **QC configurable** (`ALTER proc_qc_parametro ADD severidad` + `proc_fn_registrar_qc`): cada parámetro es `informativo | advertencia | bloqueante`. El resultado del QC es **enforceable en backend** (bloqueante fuera de rango → `rechazado`; advertencia → `condicional`; informativo → no bloquea). La UI pre-valida con el espejo `evaluarQC`, pero la autoridad es la RPC.
- **Read-models del Centro** (`proc_fn_centro_operaciones` jsonb + `proc_fn_excepciones` setof): agregados del día por (empresa, planta?, temporada?, fecha), solo lectura, RLS aplica, sin cache ni 2ª SoT.
- RLS producción de `proc_correlativo`: FORCE + REVOKE anon + policy por `proc_current_empresa()`; DEV_ONLY separado.

### UI (`src/proceso/ui/`, modular — no monolito)
- `AllegriaServiceModule.jsx` (entry) → `ServiceProvider` + `ProcShell`.
- `layout/ProcShell.jsx`: navegación por estado (7 áreas), barra de contexto operacional (tenant/planta/temporada/fecha), responsive (sidebar → select en móvil). Solo **Centro** y **Configuración** funcionales; el resto muestra estado honesto "próxima fase" (F7.2+), sin mocks.
- `pages/CentroOperaciones.jsx`: consume `centroOperaciones` + `excepciones` (read-models). KPIs de Recepción/Producción/PT/Despacho + lista de excepciones accionables. Estados loading/error/empty reales.
- `pages/Configuracion.jsx`: editor **data-driven** de 13 maestros (plantas, temporadas, ubicaciones, líneas, calibres, colores, categorías, condiciones, motivos descarte/merma, tipos de servicio, **QC con severidad**, **vínculos**). Un descriptor por maestro (no 13 pantallas). Soft-delete (nunca borrado físico).
- `components/base.jsx`: componentes neutrales (Button, StatusBadge, Card, PageHeader, KpiCard, DataTable, ExceptionList, Modal, Field, ConfirmAction, EmptyState, ErrorState, LoadingState, AuditInfo, Toast).
- `hooks/useServiceContext.jsx`: contexto de filtros + toasts + permisos por pestaña (reflejo, no seguridad).
- Consume `src/proceso/core` (F1–F6 + F7): `procesoF7Domain.js` (validadores espejo, badges, traductor de errores) + `procesoF7DB.js` (correlativos, QC, read-models, CRUD genérico de maestros).

## 2. Decisiones ejecutivas aplicadas (D-F7-01..05)
- **Correlativos:** `TIPO-TEMP-NNNNNN` concurrency-safe en backend (no React, no MAX()+1). ✓
- **QC configurable:** severidad por parámetro/especie, gate enforceable backend (no hardcode de cereza). ✓
- **Barcode/QR:** contrato de código/correlativo preparado; **sin** dependencia nueva (se implementa impresión/escaneo en F7.4/F7.5). ✓
- **Materiales:** diferidos, en backlog, sin subsistema nuevo. ✓
- **Ubicaciones:** tipo por catálogo/select (camara/zona/ubicacion/patio); layout real es dato, no código. Se mantiene la distinción tipo vs instancia. ✓

## 3. Bounded context / Frisku ≠ Service
- El universo de contrapartes de Service viene de `proc_vinculo` (Configuración → Vínculos), **no** de Frisku/`friskuBI`/maestros Frisku. Foods puede ser cliente vía vínculo, sin `if cliente==Foods`. Cero import de dominio Frisku/Foods/`exp_*` en `src/proceso/`.

## 4. Validación runtime (PostgreSQL 16 aislado)
- Aplicación limpia stub + `schema_proc_v1..v7` — sin errores.
- **F7.1 tests** (`proc_v7_f7_1_tests.sql`): correlativos (formato + incremento + por tipo + prefijo), QC severidad (aprobado/condicional/rechazado + obligatorio faltante), read-models (centro + excepciones) — TODOS PASARON ✓.
- **Concurrencia correlativo:** 20 llamadas concurrentes (10+10) → 20 códigos distintos, sin colisión ✓.
- **Regresión F1–F6** (`proc_v1..v6_tests`): TODAS PASARON ✓ (F7.1 no rompe nada).
- **RLS producción:** rol `anon` → permission denied en `proc_correlativo` (tabla y RPC) ✓.
- **Dominio JS F7** (`procesoF7Domain.test.mjs`): 20/20 ✓.

## 5. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (warnings escalados a error). El módulo nuevo + el wiring de `App.jsx` (17 inserciones, 0 borrados) integran sin errores de compilación. `main.js` 1.03 MB gzip. node_modules del main enlazado por junction reversible (removido tras el build); `build/` (gitignored) eliminado.
- **Revisión visual — ejecutada parcialmente + honestamente declarada:** se entregó una **vista de diseño estática** del Centro de Operaciones (render fiel de los componentes con datos ilustrativos, claramente etiquetada como no-producción). La **revisión visual en la app en vivo NO se ejecutó** en este entorno porque requiere login autenticado (email+PIN) contra Supabase de producción y un tenant con datos `proc_*` reales, ninguno disponible/permitido acá. **Recomendado:** pasada visual local por Angelo (`npm start` → login → tile "Allegria Service" → Centro/Configuración), verificando jerarquía, overflow, responsive, estados loading/empty/error, legibilidad y densidad operacional.

## 6. Permisos / seguridad
- Permiso por pestaña reflejado desde App.jsx (`centro`, `config`); `config` default `sin_acceso` para no-admin (solo admin edita maestros). **La seguridad efectiva sigue en RLS/RPC** (Production Gate: claim `empresa_id` autenticado, pendiente). La UI no oculta como mecanismo de seguridad.

## 7. Gaps / deuda
- **Tenant en F7.1:** el `empresa_id` se ingresa manual en la barra (dev), a la espera del claim autenticado (Production Gate). Documentado; no se hardcodea Allegria Service.
- **PROC-INFRA-001:** `procesoDB.js` aún importa SUPA config de `friskuHelpers` (infra neutral); mover a `src/shared` en su momento.
- **F7-QC-01:** wiring del gate QC al consumo (bloquear proceso si `rechazado`) se completa en F7.2; la determinación autoritativa ya existe (`proc_fn_registrar_qc`).
- **Read-models de excepciones:** cubren lo verificable hoy; se ampliarán con el flujo F7.2+.

## 8. Aislamiento
Todo en `worktree-proc-fase1`. Cambios en `src/App.jsx` = solo el contrato de montaje del tile (import + `MODULOS_DISPONIBLES` + `TABS_PERMISOS_CONFIG` + `if(moduloActivo)`). No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 9. Próximo paso
F7.2 (Recepción + QC + Lotes) tras visto bueno del CFO. No auto-avanzar.

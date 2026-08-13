# Acta de Entrega — F7.2 (Recepción + QC + Lotes — flujo operacional real)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `9e21f9b` · **Estado:** VALIDATED (backend + E2E + build; revisión visual en vivo pendiente por Angelo — ver §5) · Sin merge, sin producción.

## 1. Qué se entregó

El **primer flujo operacional real** de Allegria Service: un camión llega con fruta → recepción con roles diferenciados → QC dinámico con severidad → creación de lote con ubicación → ledger de entrada → existencia trazable, **habilitada o bloqueada para proceso según QC**. QC determina **elegibilidad, no existencia**.

### Backend menor (`schema_proc_v7_2_f7_2.sql`, aditivo, no destructivo)
- **Gate QC → proceso (enforceable en backend):** `proc_fn_qc_gate_consumo` (trigger BEFORE INSERT en `proc_orden_insumo`) + `proc_fn_lote_elegible`. Un lote con **QC rechazado** o **QC obligatorio no ejecutado** NO puede consumirse (cualquier vía de consumo pasa por el trigger; no reescribe la RPC de F2). Data-driven: la obligatoriedad viene de `proc_qc_parametro.obligatorio` por especie. La fruta **existe físicamente** (saldo intacto); solo se bloquea la elegibilidad.
- **Read-models de listado** (security_invoker → RLS por empresa): `proc_v_recepcion_listado` y `proc_v_lote_listado` con nombres de participantes (JOIN `proc_vinculo`), QC y saldos (desde `proc_v_lote_saldos`, SoT). Filtrables/paginables por PostgREST (`?planta_id=eq.&estado=eq.&limit=&offset=`).

### UI (`src/proceso/ui/`)
- **Recepciones** (listado con filtros server-side + búsqueda) → **Nueva recepción** (cabecera + participantes desde `proc_vinculo` por rol + pesos con `kg_neto = bruto − tara` prevalidado → crea recepción con **folio desde backend**; luego **QC dinámico** + creación de lote(s) con ubicación vía **RPC atómica** `ingresar_lote_ubicado`) → **Detalle de recepción** (cabecera/participantes/pesos/QC/lotes/movimientos/auditoría).
- **Lotes** (listado "¿qué fruta tengo antes del proceso?" con saldos físico/reservado/bloqueado/libre desde vista) → **Detalle de lote** (trazabilidad: recepción origen → lote → saldos → **elegibilidad gate QC** → movimientos → órdenes futuras F7.3).
- **QcPanel** dinámico: parámetros por especie desde `proc_qc_parametro` (NO hardcode de firmeza/brix); severidad informativo/advertencia/bloqueante con color + texto + badge; preview con `evaluarQC`; resultado autoritativo por `registrar_qc`.
- **Centro de Operaciones** actualizado: acciones "+ Nueva recepción" / "Lotes disponibles", KPIs y excepciones navegables (QC rechazado → detalle recepción).
- Navegación interna por estado (`vista`/`ir` en el contexto). Traductor de errores extendido (gate QC, ubicación, kg). Montaje: pestañas `recepciones`/`lotes` en `TABS_PERMISOS_CONFIG`.

## 2. Bounded context / Frisku ≠ Service
- Participantes (cliente/productor/dueño/exportadora/transportista) se cargan **solo de `proc_vinculo`** por rol; cero consulta a Frisku/`friskuBI`/`exp_*`/maestros Foods. Foods sería un vínculo cliente más (sin `if cliente==Foods`). Roles conceptualmente separados (no se asume cliente=productor=dueño).

## 3. Ledger = SoT
- La UI **no crea stock paralelo**: el lote nace por `ingresar_lote_ubicado` (lote + movimiento de entrada + ubicación, atómico). Los saldos se **leen** de `proc_v_lote_saldos`/`proc_v_lote_listado`; nunca se calculan en React ni se guarda `kg_disponible` mutable.

## 4. Validación runtime (PostgreSQL 16 aislado)
- Aplicación limpia `schema_proc_v1..v7_f7_1 + v7_2_f7_2`.
- **E2E F7.2** (`proc_v7_2_f7_2_tests.sql`) — TODOS PASARON ✓:
  - **A** QC ok → lote 10.000 → saldo físico 10.000 → **consumible**.
  - **B** QC **rechazado** → lote existe (saldo 8.000) pero **NO consumible** (trigger `check_violation`); tras el bloqueo, saldo 8.000 e insumos 0 (existencia intacta).
  - **C** QC **obligatorio no ejecutado** → **NO consumible**.
  - **D** especie sin QC obligatorio → **consumible** sin QC.
  - Negativos: kg≤0 rechazado; ubicación inexistente → FK violation.
  - Read-models: recepción con nombres/QC/lotes correctos; lote con saldo/QC correctos.
- **Regresión F1–F7.1** (`proc_v1..v6 + v7_f7_1`): TODAS PASARON ✓ (el gate no rompe F2 — sin QC obligatorio, elegible).
- **RLS:** `anon` → permission denied en `proc_v_recepcion_listado` y `proc_v_lote_listado` (security_invoker + RLS base).
- **Dominio JS F7** (`procesoF7Domain.test.mjs`): 26/26 ✓ (incluye pesos + gate QC).

## 5. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (warnings→error). node_modules por junction reversible (removido), `build/` eliminado.
- **Revisión visual en vivo:** **no ejecutada** en este entorno (requiere login autenticado email+PIN contra Supabase de producción + tenant con datos `proc_*` reales, no disponibles/permitidos). Declarado honestamente pendiente. **Recomendado:** pasada local por Angelo — Centro → Nueva Recepción → QC → Recepciones → Lotes → Detalle → verificar overflow/responsive/modales/tablas/estados/badges/errores/loading/empty/jerarquía/legibilidad.

## 6. Permisos
- Pestañas `centro`/`recepciones`/`lotes` (default `editar` para operar) + `config` (default `sin_acceso`, solo admin). Diferenciación por rol reflejada en UI; **seguridad efectiva = RLS/RPC** (Production Gate: claim `empresa_id`, pendiente). Roles de negocio (recepción/calidad/producción) aún no materializados como roles backend → gap documentado.

## 7. Gaps / deuda
- Roles de negocio granulares no materializados en backend (hoy admin/consulta + permiso por pestaña). — documentado.
- Adjuntos físicos de documentos de recepción (guía/DT) no modelados en F1–F7 → diferido (hay `documentos` jsonb en `proc_recepcion` para metadatos; storage físico = fase posterior).
- Tenant `empresa_id` manual en barra (a la espera del claim autenticado).
- Edición/anulación de recepción: la cancelación usa estado `anulada` (no borrado físico); anular con stock ya consumido exige reversa — **no** implementado en F7.2 (se aborda con el flujo de reversa cuando aplique). Sin cambios estructurales.

## 8. Aislamiento
Todo en `worktree-proc-fase1`. `src/App.jsx` = solo pestañas de permisos del módulo. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 9. Maestros reales requeridos (checklist para UAT productiva)
Ver `docs/proceso-f7-maestros-operacionales.md` (A/B/C/D). Bloqueantes para operar recepción real en Rancagua: **plantas, ubicaciones (activas, por planta), vínculos (clientes/productores/dueños/exportadoras/transportistas), especies/variedades usadas, parámetros QC por especie (con severidad/obligatorio), temporada activa**. No se inventan; los provee Allegria Service en Configuración.

## 10. Próximo paso
F7.3 (Programa + Orden + Ejecución + Resultado + Conciliación) tras visto bueno del CFO. No auto-avanzar.

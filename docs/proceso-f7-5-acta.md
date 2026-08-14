# Acta de Entrega — F7.5 (Despacho: preparación + reserva + carga + salida física)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `587a005` · **Estado:** **F7.5 VALIDATED** (runtime + build; revisión visual en vivo pendiente — §4). Sin merge, sin producción.

## 1. Qué se entregó

El flujo de **despacho como salida física de producto bajo custodia de Allegria Service** (NO venta / exportación / shipment / BL / factura). El usuario puede responder: qué pallets se reservaron, cuáles salieron, cuánto salió, cuánto quedó, desde qué ubicación, hacia quién, bajo qué documento, y reconstruir el despacho hasta la recepción/productor originales. UI delgada sobre el motor F4 VALIDATED. **Ledger = SoT de la salida física; reserva = `proc_hold` (no cambia físico).** Sin `exp_*`, sin Frisku, sin lógica especial de Foods.

### Backend menor (`schema_proc_v7_5_f7_5.sql`, aditivo, no destructivo)
- **`proc_fn_cancelar_despacho`**: cancelar un despacho **no confirmado** (borrador/preparando/listo/cargando) **libera sus reservas** (holds) + estado `cancelado`. F4 solo tenía `reversar_despacho` (desde 'despachado', restituye físico); cancelar previo dejaba holds colgados. Distingue cancelación previa vs reversa de salida confirmada (§21).
- **Read-models** (security_invoker → RLS por empresa): `proc_v_despacho_listado` (cliente/destinatario/transportista + totales pallets/cajas/kg de líneas confirmadas + docs), `proc_v_despacho_linea` (línea + código pallet + ubicación origen), `proc_v_pallet_hold` (holds con folio de despacho → "reservado para DES-…").

### UI (`src/proceso/ui/`)
- **Despachos** (listado con filtros por estado + nuevo: cliente≠destinatario desde `proc_vinculo`).
- **Despacho** (mesa): cabecera + **acciones por máquina de estados** (Preparar→Marcar listo→Confirmar salida→Cancelar/Reversar) · transporte/destinatario editables antes de confirmar · **Carga** (agregar pallet = `reservar_pallet`/hold; quitar = `liberar_reserva`; solo saldo libre; el bloqueado/exceso lo rechaza el backend) · **Confirmar salida** (`confirmar_despacho`, salida ledger + línea ligada a movimiento) · **Líneas confirmadas** (navegan al pallet → trazabilidad) · **Documentos** (guía/interno/referencia) · **Reversa** (restituye stock, línea 'reversada', conserva historia) · **Cancelación** (libera reservas) · auditoría.
- **Centro**: KPIs de despacho (preparados/cargando/despachados hoy) navegan al listado filtrado.

## 2. Bounded context / principio
- `proc_despacho` = salida física. No reutiliza `exp_shipments`, no depende de Foods, no crea stock paralelo. Destinatario resuelto de `proc_vinculo` (puede no ser exportadora). Cliente ≠ destinatario ≠ productor ≠ dueño ≠ exportadora ≠ transportista, todos separados.

## 3. Validación runtime (PostgreSQL 16.14 aislado) — VALIDATED
- **Cadena v1→v7.5** con `ON_ERROR_STOP=1`: aplica **limpio** (11 migraciones).
- **E2E F7.5** (`proc_v7_5_f7_5_tests.sql`) — **TODOS PASARON ✓**: reserva (500 → físico 500/reserv 300/libre 200) + **cancelar libera** (reserv 0/libre 500, estado cancelado) · despacho **completo** (500 → físico 0, 1 línea) · **parcial** (500→300, queda 200, identidad intacta) · **segundo despacho** (200→0, suma 500) · **exceso** (501>500 rechazado, sin cambio) · **doble confirmación** (2ª rechazada) · **reversa** (físico restituido 500, línea 'reversada', historia preservada) · cliente≠destinatario · trazabilidad despacho→recepción · read-models.
- **Concurrencia real** (2 sesiones psql simultáneas):
  - **Despacho vs repaletizaje** sobre el mismo pallet (500): despacho gana, repaletizaje **rechazado** ("reducción 500 excede composición activa 0"); src=0, 1 línea de despacho, 0 repaletizajes. **Un solo consumo, sin negativo.**
  - **Dos reservas** del mismo saldo (500): 1 éxito / 1 rechazo ("reserva 500 excede disponible 0"); reservado=500. **0 saldos negativos.**
  - Traslado vs despacho: serializados por `FOR UPDATE` sobre el pallet (mismo mecanismo); consistente.
- **Regresión F1–F7.4** (`proc_v1..v6 + v7_f7_1..v7_4` tests): **TODAS PASARON ✓** (F3 repaletizaje, F4 despacho original, F7.4 holds/bodega intactos).
- **RLS/tenant (schema productivo, sin DEV_ONLY):** `anon` → **permission denied** en `proc_v_despacho_listado`, `proc_v_despacho_linea`, `proc_v_pallet_hold` y `proc_fn_cancelar_despacho` (proc_despacho). Sin fuga.
- **Fixes realizados:** ninguno (no apareció defecto del backend).

## 4. Build y revisión visual
- **Build:** `CI=true npm run build` → **Compiled successfully** (warnings→error; 1.05 MB gzip). El módulo F7.5 (2 páginas + wiring) integra sin errores. Dominio JS **43/43** (incl. despacho). node_modules por junction reversible (removido); `build/`+log eliminados.
- **Revisión visual en vivo:** **no ejecutada** — el flujo amplio Recepción→Producción→Pallet→Despacho requiere login autenticado (email+PIN) + tenant con datos `proc_*` reales, no disponibles/permitidos en este entorno. Declarado honestamente pendiente; no se sustituye por preview estático. Recomendado: pasada local por Angelo del flujo completo end-to-end.

## 5. Frontera (no construido en F7.5)
Resultado de Proceso PDF, tarifario, Base de Cobro, factura legal, CxC = F7.6+. El despacho confirmado de F7.5 es el hecho físico que la facturación futura referenciará.

## 6. Gaps / deuda
- Reconstrucción de la "carga" (reservas planificadas) tras recargar la página: la lista local se pierde; las reservas (holds) persisten y el backend las libera al confirmar/cancelar. Mejorable reconstruyendo desde `proc_v_pallet_hold`.
- Pesos de camión/báscula (`peso_cargado`/`peso_bascula`) existen en el modelo pero no se capturan en F7.5 (confirmar con planta si se usan).
- Barcode/QR: input compatible con scanner-como-teclado; sin dependencia.
- Tenant `empresa_id` manual (claim autenticado pendiente).

## 7. Aislamiento
Todo en `worktree-proc-fase1`. `src/App.jsx` = solo pestañas de permisos. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`/otros worktrees. Schema DRAFT no aplicado a producción, sin merge.

## 8. Maestros reales requeridos (equipo de planta)
Transportistas reales, tipos de documento de salida, destinos/destinatarios, ubicaciones de despacho, proceso real de carga, si pesan camión/pallet al salir, documentos usados, responsables, reglas de reserva, horarios/cutoffs. Se cargan en Configuración; no se inventan.

## 9. Próximo paso
F7.6 (Resultado de Proceso al cliente + emisión/PDF/envíos) tras visto bueno del CFO. No auto-avanzar.

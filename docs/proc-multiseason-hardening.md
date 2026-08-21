# PROC Multi-temporada — Hardening (DISEÑO, NO IMPLEMENTADO)

Auditoría R3-D: el modelo **soporta multi-temporada** (crear/configurar desde la app, sin código).
Cuatro gaps de integridad, dos de ellos **blockers pre-Producción (C)**. Tocan contratos operativos
(correlativos, escritura por temporada) → capability aparte, NO en R3, NO parche/dropdown. Aquí el diseño.

## GAP-1 (C, blocker) — Fallback `"s-t"` persiste operaciones SIN temporada autoritativa
- **Dónde:** 6 create paths — `Ordenes.jsx:42`, `Programa.jsx:42,64`, `Despachos.jsx:54`, `BasesCobro.jsx:50`, `ProductoTerminado.jsx:63-64`, `Repaletizaje.jsx:65-66`. Recepción/Lote ya lo prohíben.
- **Evidencia (local):** `proc_fn_siguiente_correlativo(emp,'s-t','ORD')` → `ORD--000001`, `ORD--000002` (folio **sin temporada**, contador **compartido**). Dos operaciones de temporadas distintas dejadas en "Toda temporada" colapsan en un solo contador y pierden trazabilidad de temporada.
- **Riesgo:** datos operativos sin temporada; correlativos que mezclan temporadas; imposible reportar/segregar por temporada. Viola el invariante "ninguna entidad crítica sin temporada autoritativa".
- **Corrección (diseño):**
  1. Server: `proc_fn_siguiente_correlativo` **rechaza** `p_temporada` que no exista como `proc_temporada` activa/planificada del empresa (validar contra el catálogo, no aceptar texto libre; prohibir `'s-t'` y vacío).
  2. Frontend: en los 6 paths, derivar temporada obligatoria (patrón `temporadaDeFecha` de Recepción) o exigir selección explícita antes de crear; nunca emitir `'s-t'`.
  3. Migración: reportar/relabelizar operaciones históricas `'s-t'` (no borrar) — ver GAP-2 histórico.

## GAP-2 (C, blocker) — Lifecycle de temporada NO se enforcea
- **Dónde:** `proc_temporada.estado` existe (planificada/activa/cerrada/anulada) pero **ningún trigger/constraint** lo aplica. Confirmado por ausencia: grep `proc_temporada` + estado/guard = 0 hits.
- **Riesgo:** se pueden crear recepciones/movimientos/despachos en una temporada `cerrada`; no hay límite de una sola `activa` por empresa.
- **Corrección (diseño):**
  1. Guard de escritura: trigger `BEFORE INSERT` en entidades operativas (recepción, movimiento, despacho, PT, pallet…) que rechace si la temporada objetivo está `cerrada`/`anulada`.
  2. Constraint/índice parcial: máximo una temporada `activa` por empresa (`UNIQUE(empresa_id) WHERE estado='activa'`).
  3. Reapertura: solo vía RPC con permiso especial + `proc_audit_log` (actor+timestamp+motivo); nunca PATCH directo.

## GAP-3 (B, hardening) — Identidad de temporada partida (FK vs texto)
- `proc_recepcion.temporada_id` es FK; el resto usa `temporada_codigo` texto **sin FK**. Un typo forkea temporada fantasma.
- **Corrección (diseño):** normalizar — o bien FK `temporada_id` en todas, o un CHECK/foreign-key lógico que valide `temporada_codigo` contra `proc_temporada(empresa,codigo)`. Backfill preservando datos.

## GAP-4 (B, hardening) — Sin guard de solape de fechas
- El catálogo permite rangos `fecha_inicio/fecha_fin` solapados; `temporadaDeFecha` lanza `'multiple'` en runtime.
- **Corrección (diseño):** constraint de exclusión (`EXCLUDE USING gist`) por empresa sobre el rango de fechas para impedir solapes al crear/editar.

## Preservación histórica (B4 del pedido)
Cerrar temporada = **cambio de estado**, nunca borrar/archivar destructivo. Recepción/lote/proceso/genealogía/
pallets/despacho/movimientos/documentos/auditoría se conservan íntegros (ya es así: ledger append-only,
snapshots inmutables). El cierre solo debe **bloquear nuevas escrituras**, no tocar lo existente.

## Clasificación y secuencia
- Blockers pre-Producción: **GAP-1, GAP-2** (C). Hardening: **GAP-3, GAP-4** (B).
- NO son R3 ni blocker estructural del Identity Bridge. Se abordan en una capability "Temporadas v2"
  con micro-gates propios (guard fail-closed + transacción), tras autorización.

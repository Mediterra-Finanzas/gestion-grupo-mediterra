# proc_* F1 — Matriz de reconciliación (canónico `55dc61a` vs borrador no canónico)

**Fecha:** 2026-08-13 · **Worktree canónico:** `worktree-proc-fase1` @ `55dc61a`
**Fuentes comparadas:**
- **Canónico:** `supabase/schema_proc_v1.sql` (315 L, 10 tablas), `docs/proceso-f1-arquitectura.md`, `schema_proc_v1_DEV_ONLY_rls.sql`.
- **Borrador no canónico (solo comparación, en `main` untracked):** `supabase/schema_proc_v1.sql` (710 L), `docs/allegria-service-f1-diseno.md`.

**Jerarquía de autoridad aplicada:** (1) decisiones arquitectónicas aprobadas [17 precisiones ratificadas] > (2) worktree canónico > (3) borrador auxiliar. El borrador **no** es fuente de verdad por ser más grande.

**Hallazgo raíz:** el canónico precede a las 17 precisiones ratificadas; su **modelo de identidad** (`proc_partes` como party master) y su **modelo de inventario** (`kg_disponible` mutable en el lote, sin ledger) **conflictúan con el TARGET aprobado**. Se reconcilian portando desde el borrador **solo** esos elementos, conservando lo que el canónico ya hace bien.

## Matriz (30 puntos)

| # | Decisión / capability | Canónico `55dc61a` | Borrador 710 L | Acción |
|---|---|---|---|---|
| 1 | Bounded context independiente `proc_*` | YA CUMPLE | YA CUMPLE | Mantener canónico |
| 2 | `src/proceso/` | Documentado (sin crear) | Documentado | Crear capa DB ahora (F1) |
| 3 | Cero dependencia de `exp_*` | YA CUMPLE | YA CUMPLE | Mantener |
| 4 | Identidad corporativa vs relación operacional | **CONFLICTO** (`proc_partes` = party master: nombre/tax_id) | YA CUMPLE | **Portar** `proc_vinculo`; retirar `proc_partes`/`proc_parte_roles` |
| 5 | `proc_vinculos` | FALTA | YA CUMPLE | **Portar** |
| 6 | Referencia empresa grupo vs tercero | FALTA (`productor_ref` texto libre) | YA CUMPLE (`grupo_empresa_id`/`auxiliar_id`) | **Portar** |
| 7 | Integridad referencial / XOR | FALTA | YA CUMPLE (FK reales + CHECK exactamente-uno) | **Portar** |
| 8 | Productor/predio corporativo | PARCIAL (`proc_predios` propio + `productor_ref`) | PARCIAL | Reconciliar: `proc_predios` = dato operacional (CSG) que referencia vínculo productor; identidad NO duplicada |
| 9 | Calibres/colores propios + mapping | **CONFLICTO** (calibre = catálogo corporativo activado) | YA CUMPLE (`proc_calibre`/`proc_color` por especie + mapping) | **Portar** tablas propias |
| 10 | Operador/planta/propietario separados | YA CUMPLE (`es_terceros`, propietario/operador) | YA CUMPLE | Mantener canónico (retarget FK→vínculo) |
| 11 | Temporada operacional | YA CUMPLE (estados + fechas) | CUMPLE (más simple) | **Mantener canónico** (mejor) |
| 12 | Ledger como source of truth | **CONFLICTO** (`kg_disponible` mutable) | YA CUMPLE (`proc_movimiento` SoT) | **Portar** ledger; quitar `kg_disponible` mutable |
| 13 | Ledger desde F1 | FALTA (difiere a F2+) | YA CUMPLE | **Portar** (ratificado #6) |
| 14 | Append-only | N/A (sin ledger) | YA CUMPLE (sin updated/deleted + trigger bloqueo) | **Portar** |
| 15 | Reversas / contramovimientos | FALTA | YA CUMPLE (`es_reversa` + RPC) | **Portar** |
| 16 | Holds separados | FALTA | YA CUMPLE (`proc_hold`) | **Portar** |
| 17 | Físico vs reservado/bloqueado/libre | FALTA | YA CUMPLE (vista) | **Portar** |
| 18 | Sin doble descuento | **CONFLICTO** (`kg_disponible` descuenta) | YA CUMPLE (físicos vs holds; descarte en proceso) | **Portar** modelo |
| 19 | Saldo cache solo proyección | **CONFLICTO** (`kg_disponible` persistido) | YA CUMPLE (vista, sin cache) | **Portar** vista |
| 20 | Descarte/merma posterior a consumo MP | N/A (F3) | Documentado (proceso, no lote) | Documentar; se materializa en F4 |
| 21 | Propiedad vs custodia | PARCIAL (`mandante_id` ✓ + `custodia` boolean ✗) | YA CUMPLE (sin booleano) | Quitar booleano; mantener `mandante`/`dueno_fruta` |
| 22 | Auditoría distinta del ledger | PARCIAL (audit sí, ledger no) | YA CUMPLE | Mantener audit + **portar** ledger |
| 23 | RPC / transacciones críticas | FALTA | YA CUMPLE (RPC consumo/reversa) | **Portar** |
| 24 | Concurrencia | PARCIAL (constraints) | YA CUMPLE (`FOR UPDATE` en RPC) | **Portar** |
| 25 | Tenant isolation | YA CUMPLE | YA CUMPLE | Mantener |
| 26 | RLS | YA CUMPLE (**`FORCE` + `REVOKE anon`**, más estricto) | CUMPLE (sin FORCE) | **Mantener canónico** (mejora) |
| 27 | DEV-ONLY separado | YA CUMPLE (archivo + rollback) | Documentado | **Mantener canónico**; extender a tablas nuevas |
| 28 | GO-LIVE blocker | PARCIAL (RLS deny, sin bloque explícito) | YA CUMPLE (bloque explícito) | **Portar** nota explícita |
| 29 | Tests de dominio | FALTA (F1-b) | Planificado | **Implementar ahora** |
| 30 | Tests SQL negativos | FALTA | Planificado | **Implementar ahora** |

## Resumen de acciones (dentro del worktree canónico, edición controlada)

**Se PORTAN del borrador (mejoras válidas ausentes/conflictivas en el canónico):** modelo de identidad `proc_vinculo` con XOR de FK reales (#4-#7) → reemplaza `proc_partes`/`proc_parte_roles`; ledger `proc_movimiento` append-only + `proc_hold` + vista `proc_v_lote_saldos` + RPC transaccionales (#12-#19, #22-#24); tablas propias `proc_calibre`/`proc_color` con mapping (#9); eliminación del booleano `custodia` (#21); nota explícita GO-LIVE (#28).

**Se CONSERVA del canónico (mejor o correcto):** RLS `FORCE`+`REVOKE anon` (#26); `proc_catalogo_activacion` para especie/variedad/unidad (#3); `proc_temporada` con estados+fechas (#11); `proc_planta` operador/propietario separados (#10); `proc_predios` como trazabilidad operacional (#8); `proc_audit_log`+trigger (#22); naming singular (`proc_recepcion`, `proc_lote`, …).

**Se QUITA:** `proc_partes`, `proc_parte_roles` (party master), `proc_lote.kg_disponible` mutable, `proc_recepcion.custodia` boolean.

**No hay contradicción arquitectónica NUEVA:** toda la reconciliación aplica decisiones ya ratificadas por el CFO (17 precisiones). No cambia bounded context, ownership, source of truth, modelo de identidad, modelo de inventario, seguridad ni tenancy respecto del TARGET aprobado — los **alinea** al TARGET. Por tanto se continúa F1 sin nueva parada (per instrucción #12).

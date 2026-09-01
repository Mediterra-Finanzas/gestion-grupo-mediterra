# concurrency_v2 — Hardening de concurrencia Class-B (DISEÑO + DRAFT LOCAL)

**Estado:** DRAFT. NADA de esto se ha ejecutado. NO ejecutar SQL remoto, NO deploy, NO merge.
Carril B (aislado). El integrador (Angelo/Claude en el carril de integración) decide cuándo y cómo aplicar.

**Producción `bywovqayuzodbzwsriet` = HANDS-OFF.** Target de validación = STAGING
`gestion-mediterra-staging` (ref `nlvfjpwiecgrosjnwwik`). Todos los scripts mutantes llevan
preflight embebido fail-closed que ABORTA si el destino no huele a staging con `proc_*` presente.

---

## El problema (Class-B: last-write-wins destructivo)

La auditoría de concurrencia dice: `proc_*` es relacional, el ledger es append-only y las RPC
transaccionales usan `FOR UPDATE` → **0 Class-D / 0 Class-C**. El hueco que queda es **Class-B**:

Los cambios de estado y edición de maestros se hacen con un **PATCH REST directo** desde el cliente
(`procUpdate` en `src/proceso/core/procesoDB.js`), sin control de concurrencia optimista:

```
procUpdate("proc_orden_proceso", "?id=eq.<id>&empresa_id=eq.<e>", { estado: "anulado" })
```

Superficies Class-B (todas ruteadas por `procUpdate`):

| Función (procesoF7DB.js)   | Tabla                   | Trigger estado-máquina           |
|----------------------------|-------------------------|----------------------------------|
| `actualizarMaestro` ~L38   | (genérico maestros)     | — (CRUD de campos)               |
| `cambiarEstadoOrden` ~L109 | `proc_orden_proceso`    | `trg_orden_transicion` (v2_f2)   |
| `cambiarEstadoDespacho`~L195| `proc_despacho`        | `trg_desp_transicion` (v4_f4)    |
| `cambiarEstadoTarifa` ~L232| `proc_tarifa`           | **NINGUNO** (hueco)              |
| `cambiarEstadoBase` ~L267  | `proc_base_cobro`       | `trg_base_guard` (v6_f6)         |
| `cambiarEstadoContrato`~L315| `proc_cliente_contrato`| `trg_contrato_guard` (v8_t7)     |

### Por qué el trigger de estado-máquina NO alcanza a cerrar Class-B

Los triggers validan `OLD.estado → NEW.estado` contra la fila **actual** de la DB. Eso evita
transiciones *ilegales*, pero **no** evita la **decisión stale**:

- Usuario A y Usuario B abren la orden en `borrador`.
- A hace `borrador → en_proceso`. Commit. La fila ahora está en `en_proceso`.
- B, que vio `borrador`, decide `anular` y manda `{estado:'anulado'}`.
- El trigger evalúa `OLD.estado='en_proceso'` (¡el valor real, ya cambiado!) → `en_proceso → anulado`
  es una transición **legal** → **B anula la orden que A acababa de arrancar**, sin ver el cambio de A.

Peor aún, el caso **no-op silencioso**: si B manda `{estado:'en_proceso'}` y A ya la dejó ahí,
el trigger ve `NEW.estado = OLD.estado` → `RETURN NEW` (no-op permitido) → PostgREST responde 200
y B cree que "ganó", cuando en realidad su intención se perdió sin traza.

En edición de maestros (`actualizarMaestro`) no hay ni siquiera estado-máquina: es last-write-wins
puro. B pisa el campo de A sin aviso.

**Invariante que restauramos:** DB/servidor autoritativo; ningún cambio válido se pierde en silencio;
los conflictos son visibles y reconciliables. **Nunca** last-write-wins destructivo.

---

## La solución (dos capas)

**Capa 1 — Optimistic concurrency en TODO PATCH Class-B (procUpdate).**
Cada PATCH lleva el token de la versión que el cliente leyó (`&<col>=eq.<token>`). Si otro escribió
primero, el token ya no coincide → **0 filas afectadas** → se trata como **CONFLICT**, nunca como éxito.
El token ya existe hoy: `trg_touch` bumpea `updated_at := now()` en cada UPDATE de toda tabla `proc_*`.
Ver `10_optimistic_token.sql` para el token entero monotónico (más robusto que el timestamp).

**Capa 2 — RPC + `FOR UPDATE` para las transiciones de alto impacto** (`cambiarEstadoOrden`,
`cambiarEstadoDespacho`). La RPC re-lee el estado con `FOR UPDATE` (serializa), valida la transición
**desde el estado ACTUAL bloqueado** (no el stale del cliente) y **rechaza si el estado cambió** desde
que el cliente lo leyó. Devuelve el nuevo token. Esto elimina el no-op silencioso y da un error de
conflicto limpio y accionable, además de la defensa que ya dan los triggers.

---

## Archivos (orden de integración sugerido)

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 1 | `10_optimistic_token.sql` | (Opcional pero recomendado) Agrega `row_version bigint` monotónico + `proc_fn_bump_version` a las 6 superficies Class-B. Token robusto e inmune al formateo de timestamp. Aditivo y reversible. Si se prefiere cero-migración, saltarlo y usar `updated_at` (ver README §Token). |
| 2 | `40_trg_tarifa_guard.sql` | Crea el trigger de estado-máquina faltante para `proc_tarifa` (`trg_tarifa_guard`). Cierra el hueco de `cambiarEstadoTarifa`. |
| 3 | `20_rpc_cambiar_estado_orden.sql` | RPC `proc_fn_cambiar_estado_orden` (FOR UPDATE + validación desde estado real + guardia optimista + token de salida). |
| 4 | `30_rpc_cambiar_estado_despacho.sql` | RPC `proc_fn_cambiar_estado_despacho` (idem para despacho). |
| 5 | `90_harness_concurrency.sql` | Harness de prueba: (a) dos editores de la misma fila → el 2° recibe CONFLICT; (b) dos transiciones válidas desde el mismo estado → una gana, la otra detecta stale. Incluye variante lógica (1 sesión) y variante 2-sesiones (psql). |
| — | `../../docs/concurrency-v2-frontend-plan.md` | Cambio de contrato de `procUpdate` + wrappers de conflicto + UX de reconciliación. Lo aplica el integrador en frontend. |

Cada `.sql` mutante: **una transacción** `BEGIN…COMMIT` + **preflight fail-closed** (fingerprint
staging) + mutación **aditiva/idempotente** + **post-check** + nota de **rollback**. Ninguno se ejecuta acá.

---

## Token de concurrencia: `row_version` vs `updated_at`

- **`updated_at` (cero migración):** ya rota vía `trg_touch` en cada UPDATE. Sirve hoy sin tocar el
  esquema. Riesgo: el token es un `timestamptz` que viaja como ISO-8601; hay que reenviar **exactamente**
  el string que PostgREST devolvió (misma precisión de microsegundos, mismo offset), o el `eq.` falla
  espuriamente. Manejable, pero frágil.
- **`row_version bigint` (recomendado):** entero monotónico, sin ambigüedad de formato ni zona horaria,
  trivial de comparar y de mostrar en logs/harness. Migración aditiva (`ADD COLUMN … DEFAULT 1 NOT NULL`,
  metadata-only en PG11+). Es el token que usan los RPC y el harness de este set.

Recomendación: aplicar `10_optimistic_token.sql` y usar `row_version`. Si el integrador quiere validar
la Capa 1 sin migrar, el plan de frontend documenta cómo hacerlo con `updated_at`.

---

## Capa 3 — Hardening del LEDGER append-only (`proc_movimiento`) — CONC-B2 / CONC-B3 / idempotencia

Set separado del Class-B de arriba (que cubre PATCH de estado/maestros). Este cierra tres huecos de
concurrencia en el ledger físico `proc_movimiento` (schema_proc_v1) y sus RPC transaccionales.
**Rehearsado LOCAL a 23/23 PASS** (ver abajo). NO ejecutado en staging/prod.

| # | Archivo | Qué resuelve |
|---|---------|--------------|
| 5 | `50_ledger_idempotencia_schema.sql` | Esquema: `idempotency_key text` (aditiva, NULL=sin dedupe) + `ux_proc_mov_idem` (UNIQUE parcial, retry-safe) + `ux_proc_mov_reversa_unica` (UNIQUE parcial: 1 reversa por movimiento). Pre-check **fail-closed** que aborta si ya hay duplicados históricos. |
| 6 | `60_registrar_movimiento_fix.sql` | **CONC-B2**: `proc_fn_registrar_movimiento` ahora toma `FOR UPDATE` para lote **y PT y pallet** (antes solo lote → lost-update/sobreventa en PT/pallet). + idempotencia opt-in vía `idempotency_key` (corto-circuito bajo lock + `ON CONFLICT DO NOTHING` backstop). Firma 15→16 args (nuevo `p_idempotency_key` DEFAULT NULL; call-sites intactos). |
| 7 | `70_reversar_fix.sql` | **CONC-B3**: `proc_fn_reversar_movimiento` con `FOR UPDATE` del original + corto-circuito idempotente (si ya fue reversado, devuelve la reversa existente) + backstop `ux_proc_mov_reversa_unica`. |
| 9 | `99_rollback.sql` | Reversa completa de 50/60/70 (restaura funciones originales, dropea índices y columna). No destructivo. |
| — | `rehearsal/00_bootstrap_conc_reh.sql` | Banco de pruebas mínimo y fiel (subset de `proc_movimiento` + funciones **originales buggy** para la fase ANTES). Crea el marcador `_conc_rehearsal_ok`. |
| — | `rehearsal/run_rehearsal.sh` | Orquestador (corre DENTRO de Docker `proc_uat`, DB aislada `conc_reh`): ANTES(bug)→apply→DESPUÉS(fix)→rollback→re-apply→DROP. 2 sesiones psql vía FIFO para concurrencia determinista. Imprime X/Y PASS. |

### Decisión clave (hallazgo del carril): por qué NO `UNIQUE(transaccion_id)`

`transaccion_id` **agrupa N filas** de un mismo evento lógico: `proc_fn_confirmar_despacho` (v4_f4) y
`proc_fn_repaletizar` (v3_f3) emiten varias filas de ledger bajo UN `transaccion_id` interno, y el
**mismo pallet puede aparecer 2+ veces como `salida`** en un despacho/repaletizaje (loop por línea).
Un `UNIQUE(transaccion_id)` —o `UNIQUE(tx,objeto,naturaleza)`— rechazaría operaciones legítimas.
Por eso se adopta una **`idempotency_key` explícita y opt-in** (NULL = comportamiento actual intacto;
los loops no la setean). El test **D6** del rehearsal es la guarda de no-regresión de esto.

### Preflight dual (fail-closed)

Cada script mutante corre en STAGING (fingerprint `proc_*`≥30 + ALS + `calendario_data.main`) **o** en
REHEARSAL (`SET conc.rehearsal='1'` + marcador `_conc_rehearsal_ok` + **ausencia** de `calendario_data`).
El modo rehearsal **no puede** tocar prod/staging (ambos tienen `calendario_data` → abort inmediato).

### Cómo rehearsar (LOCAL, sin tocar remoto)

```bash
docker cp supabase/concurrency_v2 proc_uat:/tmp/cv2
MSYS_NO_PATHCONV=1 docker exec -e PGUSER=postgres proc_uat bash /tmp/cv2/rehearsal/run_rehearsal.sh
# → RESULTADO REHEARSAL: PASS=23 FAIL=0 ; conc_reh se DROPea al final.
```

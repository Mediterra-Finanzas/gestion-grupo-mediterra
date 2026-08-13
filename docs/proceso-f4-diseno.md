# proc_* — F4: Diseño (Despacho y salida física) — VALIDATED

**Capability:** `proc_*` · tenant piloto Allegria Service · **Worktree:** `worktree-proc-fase1`
**Base:** F1+F2+F3 VALIDATED · **Fecha:** 2026-08-13 · Incremental. No toca `exp_*`/Frisku/Osiris/Foods/`main`.

> **Despacho ≠ exportación (Regla 1).** `proc_despacho` = salida física desde la operación de Allegria Service. El destinatario puede ser Foods, otra exportadora, productor, otra planta, CD, cliente externo. **No** depende de `exp_shipments` ni de COMEX. F4 **no** incorpora venta/FOB/booking/contenedor/BL/liquidación/CxC/facturación (Regla 20 → fases siguientes).

## 1. Decisiones flagged (resueltas por las reglas; sin fork nuevo)

- **Granularidad de despacho:** `proc_despacho_linea` a nivel **(pallet, PT)** con cantidades absolutas (cajas/kg) — preserva genealogía (Regla 10), consistente con el motor N:M de repaletizaje F3. Soporta **despacho parcial** de pallet (Regla 4).
- **Reserva/hold:** se reutiliza **`proc_hold`** existente (`objeto_tipo='pallet'`, `tipo='reserva'`) — no se crea un segundo sistema (Regla 6). Reservar reduce **disponible**, no físico; confirmar salida reduce físico.
- **Ownership:** F4 es de Service. Destinatario físico ≠ cliente del servicio ≠ dueño de la fruta ≠ exportadora ≠ transportista — todos por `proc_vinculo` con su rol (Regla 2).

## 2. Entidades F4

| Tabla | Propósito | Claves / FK |
|---|---|---|
| `proc_despacho` | Cabecera de salida física | `empresa_id`,`folio`, `planta_origen_id`, `cliente_servicio_vinculo_id`, `dueno_fruta_vinculo_id?`, `exportadora_vinculo_id?`, **`destinatario_vinculo_id`** (recibe físicamente), `destino_texto`, `transportista_vinculo_id?`, `vehiculo_patente`, `conductor`, `fecha_prevista`, `fecha_efectiva`, `peso_cargado?`,`peso_bascula?` (Regla 13), `correlacion_externa?` (Regla 17), `estado`, `observaciones` |
| `proc_despacho_linea` | Qué salió (pallet+PT), bajo qué documento | `despacho_id`,`pallet_id`,`pt_id`, `cajas`,`kg`, `ubicacion_origen_id`, **`movimiento_id`** (ledger salida, obligatorio), `estado` |
| `proc_despacho_doc` | Documentación (Regla 11) | `despacho_id`,`tipo`,`folio`,`archivo_path`,`fecha`,`version` (storage privado; sin SII) |

**Ledger F4:** tipo `despacho` (ya sembrado en F1). Salida física = `naturaleza='salida'`, `objeto_tipo='pallet'`, `ubicacion_origen_id = pallet.ubicacion_id` (Regla 9). Reversa por el mecanismo de contramovimiento (Regla 14).

## 3. SoT y reserva (Reglas 5, 6, 16)

- **Ledger = SoT físico.** La confirmación crea, atómicamente: movimiento de salida **+** `proc_despacho_linea` (con su `movimiento_id`) **+** liberación del `proc_hold` de reserva. Nunca línea sin movimiento, ni movimiento sin referencia, ni despacho > disponible, ni doble despacho del mismo saldo.
- **Disponible del pallet** = físico (ledger) − holds activos (reserva/bloqueo). Vista `proc_v_pallet_saldos` extendida con `reservado`/`bloqueado`/`disponible`.
- **Invariante 16:** por construcción, cada `proc_despacho_linea` referencia su `movimiento_id`; `Σ líneas.kg = Σ movimientos de salida` del despacho (vista `proc_v_despacho_conciliacion`). **No** hay `kg_despachado` mutable.

## 4. Estados (Regla 7) y estado del pallet (Regla 8)

- Despacho: `borrador → preparando → listo → cargando → despachado`; `cancelado`. `despachado` no editable (trigger). Cancelar antes de salida libera reservas. Corrección post-salida = reversa formal. No borrado físico.
- **Pallet:** su estado deriva del saldo (F3), **no** se marca `despachado` por participar en un despacho. Si salió parcial, conserva saldo y sigue operable; queda `agotado` solo cuando su físico llega a 0 (Regla 8).

## 5. Trazabilidad (Regla 10) y concurrencia (Regla 15)

- Cadena completa: `recepción → lote → orden → resultado → PT → pallet → repaletizaje(s) → pallet final → despacho → destinatario`, y su inversa, vía FKs (los repaletizajes intermedios no rompen la cadena: `despacho_linea.pt_id` sigue anclando a resultado/orden/lote/recepción).
- Concurrencia por `FOR UPDATE` en el pallet dentro de las RPC (reservar/confirmar/reversar), validación de disponible en la misma transacción. Doble confirmación bloqueada por la máquina de estados.

## 6. RPC F4 (atómicas)

`proc_fn_crear_despacho` · `proc_fn_reservar_pallet` (crea hold reserva) · `proc_fn_liberar_reserva` · `proc_fn_confirmar_despacho` (líneas jsonb: salida ledger + línea + libera reserva, por pallet+pt) · `proc_fn_reversar_despacho` (contramovimiento que restituye físico, conserva documento e historia).

## 7. Frontera F5 (Regla 20)

F4 termina al saber **qué salió, cuánto, desde dónde, cuándo y hacia quién**. No determina cuánto cobrar: Resultado de Proceso al cliente y servicios facturables/tarifario = fase(s) siguiente(s).

---

## ACTA DE ENTREGA — proc_* FASE 4 (VALIDATED)

**Proyecto:** Allegria Service · **Bounded context:** `proc_*` · **Worktree:** `worktree-proc-fase1` · **Base:** F1+F2+F3 VALIDATED.
**Estado: ✅ VALIDATED (runtime aislado, 2026-08-13).** Incremental. Ninguna decisión estructural nueva (granularidad/reserva/ownership determinadas por las reglas).

**Archivos (solo rutas Service):**
- `supabase/schema_proc_v4_f4.sql` — **nuevo** (incremental): 3 tablas (despacho, despacho_linea, despacho_doc) + `proc_v_pallet_saldos` extendida (holds→disponible) + `proc_v_despacho_conciliacion` + máquina de estados del despacho (trigger) + 5 RPC (crear_despacho, reservar_pallet, liberar_reserva, confirmar_despacho [líneas jsonb], reversar_despacho) + RLS FORCE/REVOKE anon. Reutiliza `proc_hold` (reserva) y el tipo de movimiento `despacho`.
- `supabase/schema_proc_v4_f4_DEV_ONLY_rls.sql` — **nuevo**.
- `supabase/validation/proc_v4_f4_tests.sql` — **nuevo** (E2E Regla 19 + negativos Regla 18).
- `src/proceso/core/procesoF4Domain.js` + `.test.mjs` — **nuevo**. `procesoF4DB.js` — **nuevo** (gate Regla 9).
- `docs/proceso-f4-diseno.md` — **modificado** (esta Acta).

**Reglas 1-20 materializadas:** despacho ≠ exportación (destinatario cualquiera; no usa `exp_shipments`); cliente ≠ destinatario ≠ dueño fruta ≠ exportadora ≠ transportista (todos `proc_vinculo`); cabecera+líneas estructuradas (no JSONB opaco); **despacho parcial** de pallet (pallet conserva identidad y saldo); ledger = SoT (confirmación crea salida + línea + libera reserva, atómico; nunca uno sin otro; no > disponible; no doble despacho); reserva = `proc_hold` (reduce libre, no físico; confirmar reduce físico); máquina de estados (`despachado` no editable, cancelar libera reservas, corrección = reversa formal, no borrado); estado del pallet derivado del saldo (no auto-`despachado`); salida por ubicación del pallet (Regla 9); trazabilidad extendida recepción→…→pallet→despacho→destinatario; documentación asociada (storage privado, sin SII); transporte mínimo; pesaje separado del saldo; reversa restituye stock y preserva historia; concurrencia por `FOR UPDATE`; invariante Σ líneas = Σ movimientos (sin `kg_despachado` mutable); correlación externa para integración futura Foods↔Service (sin escritura directa).

**Validación runtime (Postgres 16 efímero, sin tocar producción; teardown):**
- F1+F2+F3+F4 aplican limpios; **F1+F2+F3 regresión OK**.
- F4 E2E (Regla 19): recepción→proceso→resultado→PT→pallets→repaletizaje → **reservar P4** (reduce libre a 0, físico 3000 intacto) → **liberar** (restaura) → **despacho completo P4** (físico→0, agotado, despachado) → **despacho parcial P3** (2000 de 3800 → saldo 1800, parcialmente_consumido) → conciliación líneas=movimientos → genealogía a resultado → **reversa** (P3 restituido a 3800, despacho cancelado). **PASÓ.**
- F4 negativos (**todos rechazados**): reserva > disponible, despacho > disponible, editar despacho despachado, doble confirmación.
- RLS productiva F4: sin claim → 0; tenant A → 1; cross-tenant B → 0.
- Dominio (node): F1 27 + F2 28 + F3 + F4 (todas pasan).

**Bug cazado y corregido en validación:** el trigger de estados dejaba editar campos de un despacho `despachado` sin cambiar estado; endurecido a "solo →cancelado por reversa".

**Build:** no ejecutado (worktree aislado, aditivo); sintaxis JS OK (ESM).
**Schema:** DRAFT — **NO aplicado a producción**. Migraciones: NO. Data: NO. Cross-project: NINGUNO (no toca `exp_*`/Frisku/Osiris/Foods/`main`; efímeros propios desmontados; contenedores `exp_pg2`/`osiris_t2b1_pg` de otras sesiones intactos).
**Deuda:** EXP-TENANCY-001, EXP-SECURITY-001 (Core); PROC-INFRA-001.
**Frontera F5 (Regla 20):** Resultado de Proceso al cliente + servicios facturables/tarifario — fase(s) siguiente(s).

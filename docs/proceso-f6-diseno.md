# proc_* — F6: Diseño (Tarifario + Servicios Facturables + Base de Cobro) — VALIDATED

**Capability:** `proc_*` · tenant piloto Allegria Service · **Worktree:** `worktree-proc-fase1`
**Base:** F1-F5 VALIDATED · **Fecha:** 2026-08-13 · Incremental. No toca Frisku/`exp_*`/Foods/Osiris/`main`.

> **F6 responde:** ¿qué debe cobrar Allegria Service por los servicios prestados, por qué cantidades, a qué tarifa, en qué moneda, desde qué hechos operacionales? **NO** emite factura legal, ni CxC, ni contabilidad, ni pagos, ni integración `exp_*`. Cuatro capas de SoT: **operación física (F1-F4)** → **información emitida (F5)** → **tarifario contractual (F6)** → **facturación/ERP (futuro)**. El servicio facturable nace de **hecho operacional real + regla tarifaria aplicable**; no crea una segunda verdad operacional.

## 1. Decisión estructural (única; resuelta con patrón ratificado)

**Referencia del hecho facturable (punto 9):** NO FK polimórfica falsa. Se usa el **patrón XOR de FK reales** ya ratificado en `proc_vinculo`: `proc_servicio_facturable` lleva columnas FK **reales** nullable por tipo de origen (`orden_id`→`proc_orden_proceso`, `repaletizaje_id`→`proc_repaletizaje`, `pallet_id`→`proc_pallet`) + `origen_tipo` + CHECK (`manual` → ninguna; automático → exactamente una que coincide con `origen_tipo`). Integridad referencial real y verificable. **No es un fork nuevo** (aplica el patrón aprobado).

## 2. Entidades F6

| Tabla | Propósito | Claves / notas |
|---|---|---|
| `proc_tipo_servicio` | Maestro de servicios (del backlog F2) | `empresa_id`,`codigo`,`nombre`,`unidad_default`,`activo`. proceso/selección/embalaje/frío/almacenamiento/repaletizaje/pallet/materiales/inspección/especial/otros |
| `proc_tarifa` | Tarifa versionable por vigencia | `empresa_id`, `tipo_servicio_id`, `cliente_vinculo_id?` (null=general), `temporada_codigo?`, `especie_codigo?`, `unidad`, `tarifa NUMERIC`, `moneda`, `vigencia_desde/hasta`, `prioridad`, `condiciones jsonb`, `estado`. **No hardcode**; cliente desde `proc_vinculo` (regla Frisku≠Service) |
| `proc_servicio_facturable` | Línea facturable (hecho + regla) | origen XOR (§1), `tipo_servicio_id`, `cliente_vinculo_id`, `cantidad`, `unidad`, **snapshot de tarifa** (`tarifa_id`,`tarifa_aplicada`,`moneda`,`vigencia_usada`), `subtotal`, `estado`, `es_manual`,`motivo?`,`autorizado_por?`, `fecha_hecho`, **`clave_idempotencia` UNIQUE** |
| `proc_base_cobro` | Agrupación (aún NO factura) | `empresa_id`,`folio`,`cliente_vinculo_id`,`temporada?`,`periodo_desde/hasta`,`moneda`,`estado`,`total` |
| `proc_base_cobro_linea` | Servicios incluidos en la base | `base_cobro_id`,`servicio_facturable_id`; UNIQUE (un servicio en una sola base) |

## 3. Reglas materializadas

- **kg procesado, no recibido (punto 16):** cantidad de `proceso` = Σ `proc_orden_insumo.kg` de la orden **cerrada/conciliada** (9.800, no 10.000).
- **Tarifa por vigencia (punto 4) + snapshot (punto 5):** la tarifa se resuelve por la **fecha del hecho**; al valorizar se **congela** (`tarifa_id`/`tarifa_aplicada`/`moneda`/`unidad`/`vigencia_usada`). Cambiar el tarifario después NO altera la línea histórica.
- **Prioridad determinística (punto 13):** resolución por especificidad (cliente > temporada > especie) + `prioridad`, nunca "primera fila". `proc_fn_resolver_tarifa`.
- **Idempotencia (punto 10):** `clave_idempotencia` UNIQUE (origen+servicio+regla) → no doble cobro del mismo hecho/servicio.
- **Falta tarifa (punto 12):** sin tarifa válida → `estado='pendiente_tarifa'` (visible como excepción); nunca cero/genérica silenciosa.
- **Automático vs manual (punto 11):** línea manual exige `motivo` + `autorizado_por`; no es la forma normal de corregir el motor.
- **Multimoneda (punto 14):** la línea conserva la **moneda contractual**; no auto-convierte a CLP. Moneda funcional/TC = snapshot financiero **diferido** (no requerido en F6).
- **Base de cobro (puntos 20-22):** header+líneas; `aprobada` **inmutable** (corrección = reversa/nota/nueva base). Estados servicio {generado, pendiente_tarifa, valorizado, revisado, facturable, anulado}; base {borrador, en_revision, aprobada, enviada_a_facturacion, cerrada, anulada}.
- **Trazabilidad económica (punto 23):** base → línea → servicio → tarifa + origen (orden/repaletizaje/pallet) → hecho operacional. Responde "¿por qué USD 2.940?" (9.800 kg × 0,30).
- **Intercompany Foods (punto 24):** Foods como cliente de Service = un tercero (hecho → tarifa intercompany → servicio → base). Vía `proc_vinculo`, sin escribir `exp_*`.
- **Revenue ≠ costo (punto 25):** F6 construye revenue/base de cobro; costo interno/margen = BI/Management Performance posterior.

## 4. Diferido explícito (documentado)

- **Almacenamiento/frío avanzado (punto 18):** el modelo prepara `tipo_servicio` + unidades `pallet_dia`/`kg_dia`/`camara_dia` + `monto_fijo`, pero el **motor temporal de billing** (permanencia por período, días de gracia) se **difiere** — en F6 el almacenamiento se factura como línea **manual** con cantidad calculada fuera del motor. Se materializa cuando la operación lo requiera.
- **Materiales facturables (punto 19):** `proc_materiales` no está materializado (backlog); en F6 el material facturable = línea **manual** (con distinción de origen de suministro en el motivo). El origen FK de material se añade cuando se materialice `proc_materiales`.

## 5. Precisión y seguridad

`NUMERIC(14,3)` kg/cantidad, `NUMERIC(14,4)` tarifa, `NUMERIC(14,2)` montos; redondeo monetario a 2 decimales (`round(...,2)`); nunca float JS. Tablas F6: `empresa_id` + RLS `FORCE` deny-by-default + `REVOKE anon` + DEV-ONLY; `created_by/updated_by/timestamps/deleted_at`; auditoría; inmutabilidad de base aprobada por trigger.

## 6. Frontera F6 → UAT (punto 30-31)

F6 termina al saber **qué cobrar, por qué cantidades, a qué tarifa, en qué moneda, desde qué hechos**. NO emite factura legal. **Tras F6 VALIDATED → UAT integral operacional+comercial sobre F1-F6** (no avanzar a F7/dashboards/costos/ERP/UI hasta la UAT).

---

# Acta de Entrega — F6 (Tarifario + Servicios Facturables + Base de Cobro)

**Fecha:** 2026-08-13 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **Estado:** VALIDATED · **Sin merge, sin producción.**

## 1. Qué se entregó
Motor de **ingresos por servicios prestados** de Allegria Service: "¿qué debe cobrar la planta por el servicio que hizo?". Responde qué cobrar, por qué cantidades, a qué tarifa, en qué moneda y **desde qué hechos operacionales**. NO es factura legal, NO es CxC, NO es contabilidad, NO toca `exp_*`/Foods.

- **Tarifario versionable** (`proc_tarifa`): tarifa por tipo de servicio, con vigencia (`vigencia_desde/hasta`) y especificidad opcional (cliente / temporada / especie). Resolución **determinística** vía `proc_fn_resolver_tarifa` (cliente > temporada > especie > prioridad > vigencia más reciente).
- **Servicios facturables** (`proc_servicio_facturable`): el hecho a cobrar. Origen por **FK real XOR** (orden de proceso / repaletizaje / pallet / manual) — sin FK polimórfica falsa. **Snapshot de tarifa** congelado en el servicio (cambiar el tarifario maestro NO altera lo ya valorizado).
- **Base de cobro** (`proc_base_cobro` + `_linea`): agrupa servicios valorizados por cliente/período/moneda; estados con inmutabilidad al aprobar.

## 2. Decisiones ratificadas materializadas (31 puntos)
- **Cantidad = kg PROCESADOS**, no recibidos (punto 16): `proc_fn_generar_servicio_proceso` deriva `cantidad = Σ proc_orden_insumo.kg`. Verificado 9.800 (no 10.000).
- **Falta tarifa ⇒ `pendiente_tarifa`** con subtotal NULL (punto 12), nunca cero silencioso.
- **Idempotencia** (punto 9): `clave_idempotencia` UNIQUE `origen:ref:srv:tipo` bloquea doble cobro del mismo hecho+servicio.
- **Manual exige motivo + autorización** (punto 11): rechazado sin ellos.
- **Multimoneda preservada** (punto 14): moneda en tarifa/servicio/base; sin conversión forzada.
- **Precisión NUMERIC** (punto 15): kg `(14,3)`, tarifa `(14,4)`, montos `(14,2)`, redondeo a 2 decimales; sin floats.
- **Base aprobada inmutable** (puntos 20-21): trigger bloquea edición de base y de servicios ligados a base aprobada.
- **Revenue ≠ costo** (punto 24): solo lo que Service cobra; no incluye su costo interno.
- **Identidad vía `proc_vinculo`** (Regla Frisku≠Service): cliente del servicio = contraparte operacional propia, no maestro Frisku/`exp_*`.

## 3. Validación runtime (PostgreSQL 16 aislado, Docker efímero)
- **Aplicación limpia** stub + `schema_proc_v1..v6` (6 fases) — sin errores.
- **Regresión F1-F5**: `proc_v1..v5` tests — TODOS PASARON ✓ (F6 no rompe nada previo).
- **F6 E2E + negativos** (`proc_v6_f6_tests.sql`) — TODOS PASARON ✓:
  - E2E: proceso 10.000→9.800 kg → servicio valorizado 9.800 × 0,30 = **2.940 USD** → base agregada/aprobada total 2.940.
  - Resolución determinística: tarifa cliente-específica (0,30) gana sobre general (0,25).
  - Snapshot: cambiar tarifa maestra a 0,99 NO altera el servicio (sigue 0,30/2.940).
  - Negativos: doble cobro rechazado (N1); manual sin motivo/autorización rechazado (N2); base aprobada no editable (N3); servicio en base aprobada no editable (N4); sin tarifa → `pendiente_tarifa`/NULL (E3).
- **Dominio JS** (`procesoF6Domain.test.mjs`): **16 pasaron, 0 fallaron** — subtotal, resolución por vigencia/especificidad, idempotencia, estados de base, manual.
- **Seguridad/tenancy**: tablas F6 con `rowsecurity` + `forcerowsecurity` = true. Contra schema de producción (sin DEV_ONLY), rol `anon` → **permission denied** en SELECT e INSERT (deny-by-default, `REVOKE anon`). DEV_ONLY_rls aplica y es permisivo solo para staging.
- **Sintaxis JS**: `procesoF6Domain.js`, `procesoF6DB.js` — `node --check` OK.

## 4. Archivos
- `docs/proceso-f6-diseno.md` (este) · `supabase/schema_proc_v6_f6.sql` · `supabase/schema_proc_v6_f6_DEV_ONLY_rls.sql` · `supabase/validation/proc_v6_f6_tests.sql` · `src/proceso/core/procesoF6Domain.js` · `procesoF6Domain.test.mjs` · `procesoF6DB.js`.

## 5. Aislamiento
Todo en `worktree-proc-fase1`. No se tocó Frisku / `exp_*` / Allegria Foods / Osiris / `main`. Schema DRAFT: **no aplicado a Supabase producción, no merge**.

## 6. Frontera — próximo gate
F6 cierra el alcance F1-F6. **Antes de F7 (dashboards/costos/UI/ERP): UAT integral operacional+comercial sobre F1-F6** (punto 31). No auto-avanzar.

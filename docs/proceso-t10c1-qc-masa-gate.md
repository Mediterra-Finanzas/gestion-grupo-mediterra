# T10c.1 — Gate QC granularidad + Conciliación de masa (discovery / propuesta)

**Estado:** discovery-only. **No SQL, no frontend, no materialización.** HEAD `a8abf55`. Evidencia del schema CURRENT (PG16). **Resultado: ambos resolubles con backend MENOR/aditivo — NO hay STRUCTURAL GAP** (§O). Espera autorización para materializar.

---

## A. Hallazgo 1 — QC en recepciones multi-lote/multi-especie

> **ESTADO: MATERIALIZADO / VALIDATED (T10c-QC)** — `schema_proc_v8_t10c_qc_lote.sql` + `proc_v8_t10c_qc_tests.sql`. Gate PG16 verde: QC-1..5, gate de consumo por lote (ERRCODE `check_violation`), fallback header (`lote_id IS NULL`), especie del **lote** (no del header), negativos (lote de otra recepción, duplicado activo), upsert idempotente, resumen read-model. Regresión F1/F7.7/F7.8 + T1–T9 verde. RLS/tenant verde (anon DENY tabla+vista, aislamiento A/B, cross-tenant WITH CHECK). Especie de evaluación = `proc_lote.especie_codigo`: bug estructural corregido. **Nota de regresión:** los tests legacy F7.2–F7.6 fallan por `fk_proc_lote_variedad` (FK del cutover **T5b** que exige catálogo especie/variedad); falla **idéntica con y sin T10c-QC** → gap de fixture pre-existente, **ortogonal a QC** (la semántica QC-original queda re-cubierta verde por el sub-test fallback-header + la ruta compat 4-arg).

### A.1 CURRENT (evidencia)
| Pregunta (§A) | Hallazgo |
|---|---|
| ¿`proc_qc_recepcion` ligado solo a recepción? | **Sí.** FK `recepcion_id`; **`UNIQUE(empresa_id, recepcion_id)`** → **un solo QC por recepción**. No hay `lote_id`. |
| ¿Puede asociarse QC a un `lote_id` hoy? | **No** (no existe la columna). |
| ¿Parámetros QC por especie? | **Sí** (`proc_qc_parametro.especie_codigo`). |
| ¿El gate sabe qué QC corresponde al Lote? | **No exactamente.** `proc_fn_lote_elegible(lote)` resuelve el **único** QC de la recepción del lote, y chequea obligatorios con **`proc_recepcion.especie_codigo` (especie del HEADER)**, no con `proc_lote.especie_codigo`. |
| ¿Qué ocurre en recepción multi-especie hoy? | (a) los N lotes comparten **un mismo veredicto** de QC (recepción); un `rechazado` contamina **todos** los lotes, un `aprobado` habilita **todos**. (b) Los obligatorios se evalúan contra la especie del header → un lote de **otra** especie (ej. Ciruela en recepción con header Cereza) se valida contra los parámetros equivocados. |

**Conclusión:** correcto para recepción homogénea (1 especie); **incorrecto** para el nuevo modelo multi-lote/multi-especie. El gate ya recibe el lote, pero resuelve a nivel recepción + especie de cabecera.

### A.2 Alternativas (§C)
- **A — QC por Recepción (CURRENT):** solo válida si toda recepción es homogénea. Choca con multi-origen/multi-especie. **Descartada.**
- **B — QC por Lote puro:** cada lote su QC; recepción muestra resumen. Correcto, pero pierde la metadata de inspección común si existiera.
- **C — Header + detalle por Lote (recomendada):** `proc_qc_recepcion` admite QC a nivel recepción (legacy/header, `lote_id` NULL) **y** a nivel lote (`lote_id` seteado). La **autoridad de elegibilidad es el Lote**; si no hay QC de lote, cae al de recepción (compat).

### A.3 Recomendación: **Opción C**, aditiva
- `ALTER proc_qc_recepcion ADD lote_id uuid NULL REFERENCES proc_lote(id)`. Reemplazar el UNIQUE por: uno por recepción cuando `lote_id IS NULL` + uno por `(recepcion_id, lote_id)` cuando está seteado (índices únicos parciales).
- `proc_fn_lote_elegible`: **(1)** buscar QC del **lote** (`lote_id=p_lote`) primero; fallback al de recepción (`lote_id IS NULL`). **(2)** usar `proc_lote.especie_codigo` (no la del header) para el chequeo de obligatorios. Corrige el bug multi-especie.
- El gate (`trg` sobre `proc_orden_insumo` → `proc_fn_qc_gate_consumo`) **no cambia** (ya llama a `lote_elegible`).
- `registrar_qc` acepta `lote_id` opcional. La UI de QC pasa a ser por lote (inline en Detalle Recepción / Detalle Lote); la cabecera muestra el agregado (N aprobado/advertencia/rechazado).

### A.4 Impacto QC (matriz §L)
| Dimensión | CURRENT | TARGET (Opción C) |
|---|---|---|
| Schema | `proc_qc_recepcion(recepcion_id)` UNIQUE recepción | + `lote_id` NULL + índices únicos parciales (aditivo) |
| Gate consumo | `lote_elegible` usa QC de recepción + especie header | usa QC de **lote** (fallback recepción) + especie **del lote** |
| Elegibilidad | veredicto único por recepción | por lote; lotes independientes |
| UI | QcPanel a nivel recepción | QcPanel por lote + resumen en cabecera (no duplica SoT) |
| Migración | — | aditiva; QC históricos (lote_id NULL) siguen aplicando por fallback; **no** se fabrica asociación a lotes |
| Estructural | — | **NO** (QC = gate/metadata, no toca ledger/genealogía/ownership/RLS/bounded context) |

### A.5 Tests conceptuales (§M) — cómo los soporta la Opción C
- **QC-1** Cereza aprobada / Ciruela rechazada → QC por lote: lote Cereza consumible, lote Ciruela no. ✅
- **QC-2** Dos lotes Cereza, uno aprobado/uno rechazado (inspeccionados por separado) → posible con QC por lote. ✅
- **QC-3** QC rechazado no elimina existencia física (la fruta existe; solo el gate bloquea el consumo). ✅ (invariante F7.2 intacta)
- **QC-4** Modificar parámetros posteriormente no altera el resultado histórico → el `resultado` guardado es inmutable a la edición de parámetros (ya es así; los valores/veredicto quedan en la fila QC). ✅
- **QC-5** Lote con QC obligatorio no ejecutado → no consumible (obligatorio por la **especie del lote**). ✅

---

## B. Hallazgo 2 — Conciliación de masa (recepción vs Σ lotes)

> **ESTADO: MATERIALIZADO / VALIDATED (T10c-MASA)** — `schema_proc_v8_t10c_masa.sql` + `proc_v8_t10c_masa_tests.sql`. `tolerancia_recepcion_pct` dedicada (default 0.50, independiente de `tolerancia_masa_pct`); recepción se crea en **`borrador`**; RPC `proc_fn_cerrar_recepcion` suma Σ kg desde el **ledger** (movimientos de entrada `ref_tipo='recepcion'`), compara con `kg_neto` ± tolerancia, y transiciona `borrador → recibida` (o RECHAZA con mensaje humano). Read-model `proc_v_recepcion_conciliacion` (security_invoker). **Sin enforcement por INSERT de lote; sin "forzar cierre".** Gate PG16 verde: MASS-1..9 (exacto, faltante/exceso fuera de tolerancia, dentro de tolerancia, sin lotes, legacy `recibida` intacta, doble cierre) + **concurrencia real** (2 sesiones paralelas → 1 gana, la otra rechaza vía `FOR UPDATE`) + RLS/tenant (anon DENY vista+RPC, aislamiento A/B, cross-tenant cerrar bloqueado). UI: Nueva Recepción crea borrador + bloque de conciliación + "Finalizar recepción"; RecepcionDetalle finaliza borradores. Build `CI=true` OK; dominio JS 96/96.

### B.1 CURRENT (evidencia)
- `proc_recepcion.kg_neto NUMERIC NOT NULL CHECK (>0)`; cada lote aporta kg por su movimiento de entrada (ledger).
- **NO existe enforcement** de `Σ kg lotes` vs `kg_neto` en ningún punto (ingreso ni cierre). La conciliación de T10c es **solo preview UI**.
- **Tolerancia:** `proc_empresa_config.tolerancia_masa_pct` existe pero se usa para la **conciliación de ORDEN** (F7.3), no de recepción.
- **Estados de recepción:** `{borrador, recibida, en_proceso, procesada, despachada, anulada}` (default `recibida`). Hay `borrador` (captura) pero la UI de T10c crea directo en `recibida`. **No hay estado explícito "conciliada".**

### B.2 Recomendación: conciliación en el CIERRE, aditiva (§I/§J/§K)
- **No** enforcement por INSERT (mientras se agregan lotes). El chequeo ocurre en una **transición formal de cierre**.
- **Estado:** crear la recepción en **`borrador`** durante la captura (permite kg pendientes). Una acción "Finalizar/cerrar recepción" transiciona `borrador → recibida` y valida la masa. (Reutiliza el estado existente; no agrega estado nuevo, o se puede añadir `conciliada` si se prefiere explicitar.)
- **Invariante:** `abs(kg_neto − Σ kg_lotes) <= kg_neto * (tolerancia_recepcion_pct/100)`.
- **Tolerancia:** recomiendo `tolerancia_recepcion_pct` **dedicada** en `proc_empresa_config` (báscula/bins/peso informado vs oficial pueden diferir del proceso), con default (ej. 0.5%). Alternativa: reutilizar `tolerancia_masa_pct` (menos preciso).
- **RPC:** `proc_fn_cerrar_recepcion(empresa, recepcion, actor)` — computa `Σ` desde el **ledger** (movimientos entrada del lote), compara con `kg_neto`, aplica tolerancia; bloquea el cierre si pendiente/exceso fuera de tolerancia (salvo `ajuste` documentado). No toca el ledger; solo lee + transiciona estado.
- **Exceso (§K):** visible en UI; cierre rechazado salvo ajuste formal.

### B.3 Impacto masa (matriz §L)
| Dimensión | CURRENT | TARGET |
|---|---|---|
| Estado recepción | crea `recibida` directo | crea `borrador` (captura) → `recibida`/`conciliada` al cerrar |
| Tolerancia | solo orden (`tolerancia_masa_pct`) | + `tolerancia_recepcion_pct` (o reuso) |
| Enforcement | ninguno (preview UI) | `proc_fn_cerrar_recepcion` valida en el cierre |
| UI | preview pendiente/exceso (T10c) | + acción "Finalizar recepción" con validación; motivo si se rechaza |
| Migración | — | aditiva; recepciones `recibida` existentes no se re-concilian retroactivamente |
| Estructural | — | **NO** (lee ledger, transiciona estado; no cambia SoT/genealogía/ownership/RLS) |

### B.4 Tests conceptuales (§N)
- **MASS-1** neto 9.000 / lotes 9.000 → cierre PASS. ✅
- **MASS-2** neto 9.000 / lotes 8.500 en captura (`borrador`) → permitido, 500 pendientes (no se bloquea al agregar). ✅
- **MASS-3** neto 9.000 / lotes 8.500, intenta cerrar → rechazo si 500 > tolerancia. ✅
- **MASS-4** neto 9.000 / lotes 9.500 → exceso visible; cierre rechazado salvo ajuste. ✅
- **MASS-5** diferencia dentro de tolerancia → cierre permitido. ✅

---

## C. Gate final (§O)
Ninguno de los dos toca ledger SoT, origen del lote, genealogía, ownership, tenancy/RLS ni bounded contexts. Ambos son **backend menor/aditivo + UI**. **NO STRUCTURAL GAP.**

**Propuesta de materialización (cuando autorices):**
- **T10c-QC:** `proc_qc_recepcion + lote_id` (índices únicos parciales) · `lote_elegible` por lote + especie del lote (fallback recepción) · `registrar_qc(lote_id?)` · UI QC por lote + resumen. Tests QC-1..5 + regresión F7.2/gate.
- **T10c-MASA:** `tolerancia_recepcion_pct` · `proc_fn_cerrar_recepcion` (Σ ledger vs kg_neto ± tolerancia) · recepción crea `borrador` → cierre valida · UI "Finalizar recepción". Tests MASS-1..5 + regresión.

Cada uno como fase aditiva con su gate (PG16 + regresión + RLS). **No implementado.**

## D. Secuencia posterior (§P) — sin cambios
Tras este gate: **T10d** Ficha Cliente+Contrato → **T10e** alertas/gates/filtros restantes → **PROC-REPORTING-DAILY-001** (reservado, no implementar aún) → **T11** UAT → Visual QA final.

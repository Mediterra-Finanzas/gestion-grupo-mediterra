# F7.8 — Addendum · Gate de Trazabilidad Agrícola / Origen de Fruta (Discovery)

**Fecha:** 2026-08-14 · **Worktree:** `worktree-proc-fase1` · **HEAD:** `3ec0bed` · **Naturaleza:** discovery-first, sin modificar schema. **Resultado: `CASO C — STRUCTURAL GAP` (§17). STOP-AND-REPORT.**

Este gate tiene **prioridad sobre `VISUAL QA CERTIFIED = SÍ`**. No se certifica visualmente Recepción/Lotes/Producción sobre un modelo de trazagricultura incompleto. La revisión visual queda **en pausa** hasta resolver esta decisión estructural.

---

## 0. Veredicto
El modelo CURRENT **no** representa correctamente la cadena `Cliente → Productor → Predio → Cuartel → Especie → Variedad` sin hacks. Faltan entidades y relaciones estructurales (Cuartel, catálogo Especie→Variedad, relación Cliente↔Productor, granularidad de origen por lote). **No se modificó nada.** Se documenta el gap y el trade-off para tu decisión.

## 1. Matriz de discovery (§14) — evidencia del schema

| Concepto | Existe CURRENT | Tabla | Granularidad | Relación | GAP | Impacto |
|---|---|---|---|---|---|---|
| **Cliente del servicio** | ✅ | `proc_vinculo` (rol `cliente_servicio`) | por vínculo | plano | — (correcto: dimensión comercial separada del origen) | — |
| **Productor** | ✅ | `proc_vinculo` (rol `productor`) | por vínculo | plano | **sin CSG SAG explícito** (solo `codigo_externo` genérico); **sin relación a cliente** | trazabilidad export + no se pueden listar "los productores de un cliente" |
| **Predio / Huerto** | ✅ parcial | `proc_predios` (`productor_vinculo_id`, codigo, nombre, pais, region) | 1 productor : N predios | **FK productor ✓**; `proc_recepcion.predio_id → proc_predios` ✓ | **no está en la UI de Configuración**; **sin CSG de predio**; sin comuna/superficie | no administrable; trazabilidad export incompleta |
| **Cuartel** | ❌ | — (ninguna tabla `proc_*`; `cc_cuarteles` es de contabilidad, otro bounded context) | — | — | **NO EXISTE** | ⛔ trigger estructural §17 |
| **Especie** | ❌ (código libre) | — (`especie_codigo` texto en 12 tablas) | texto libre | ninguna | **no es catálogo** | combinaciones inválidas, sin integridad |
| **Variedad** | ❌ (código libre) | — (`variedad_codigo` texto) | texto libre | **sin relación a Especie** | **no es catálogo; sin integridad Especie→Variedad** | la UI no puede filtrar variedades por especie |
| **Cliente ↔ Productor** | ❌ | — (no hay tabla puente) | — | — | **relación inexistente** | no se puede modelar "los productores de un cliente" ni multi-cliente por productor |
| **Recepción** | ✅ | `proc_recepcion` | 1 recepción | FKs: cliente/dueño/productor/exportadora/transportista + `predio_id` + `lote_productor` (texto) + `variedad_codigo` (texto) | **origen (productor/predio) vive en la CABECERA**, no por lote | cargas mixtas no representables |
| **Lote** | ✅ | `proc_lote` (`recepcion_id`, `especie_codigo`, `variedad_codigo`) | 1 recepción : N lotes | FK solo a recepción | **el lote hereda productor/predio de la recepción; no tiene origen propio** (solo especie/variedad texto) | ⛔ no preserva origen inequívoco en cargas mixtas |

## 2. Cadena de trazabilidad CURRENT (real)
```
proc_vinculo(cliente_servicio)  ─┐  (dimensión comercial)
                                 │
proc_recepcion ──FK── proc_predios ──FK── proc_vinculo(productor)
      │  (predio_id, productor_vinculo_id: en la CABECERA)
      │  especie_codigo/variedad_codigo/lote_productor = TEXTO libre
      └── proc_lote (recepcion_id; especie/variedad texto propios)
              └── orden → resultado → PT → pallet → despacho  (genealogía OK)
```
**Cuartel: ausente.** **Especie/Variedad: sin catálogo.** **Cliente↔Productor: sin relación.** El origen agrícola se congela a nivel de **cabecera de recepción**, no por lote ni por cuartel.

## 3. Snapshot / historia (§8) — trade-off
- `variedad_codigo`, `especie_codigo`, `lote_productor` = **texto** → quedan congelados tal cual se escribieron (snapshot de facto, pero sin normalización ni integridad).
- `productor_vinculo_id`, `predio_id` = **FK a maestro** → si mañana cambia el nombre del productor/predio o su CSG, la recepción histórica **muestra el valor CURRENT**, no el de la fecha del hecho. El **CSG no se guarda en absoluto**.
- **Trade-off a decidir (no lo resuelvo):** para trazabilidad export histórica correcta, la recepción debería **snapshotear** nombre+CSG de productor/predio/cuartel al momento del ingreso (además de la FK), como ya se hace con destinatarios en F5/F7.6. Es decisión estructural.

## 4. Test de escenario (§15) — ¿CURRENT lo representa sin hacks?
| Escenario | CURRENT |
|---|---|
| Cliente: Exportadora Los Andes SpA | ✅ vínculo |
| Productor: Agrícola Las Nieves SpA | ✅ vínculo |
| Predio: Fundo Santa Elena | ✅ `proc_predios` (ligado al productor) |
| Cuarteles C-01 Santina, C-02 Regina | ❌ **no hay cuartel; variedad es texto sin catálogo** |
| Recepción → lotes trazables **hasta el cuartel** | ❌ imposible (sin cuartel; origen a nivel cabecera) |
| Mismo productor → otro cliente de maquila | ⚠️ solo implícito por recepción; **sin relación gestionada** |
| Mismo cliente → varios productores | ⚠️ solo implícito por recepción; **sin relación gestionada** |
| Carga mixta (varios productores/predios en una recepción) | ❌ no representable (un solo productor/predio por recepción) |

## 5. Frisku Isolation Test (§16)
**CERO dependencia funcional de Frisku.** Cliente/productor/predio se resuelven de `proc_vinculo`/`proc_predios` (no `frisku_*`/`friskuBI`/exportadores Frisku). Especie/variedad son texto libre en `proc_*`, **no** referencian `maestro_especies` de Frisku (blob en `calendario_data`). Confirmado en F7.8: **0 dependencias `proc_*`→`exp_*`/`frisku_*`** (pg_depend + view_table_usage). Infra neutral compartida (Supabase) declarada, no es dependencia de negocio.

## 6. Decisión de gate (§17) → **CASO C — STRUCTURAL GAP**
Se cumplen múltiples disparadores estructurales del §17:
- **Falta Cuartel** (entidad inexistente). ⛔
- **Lote no puede preservar origen** inequívoco en cargas mixtas (origen en cabecera de recepción). ⛔
- **Especie→Variedad sin catálogo/integridad** (texto libre). ⛔
- **Cliente↔Productor sin relación** (no colapsados —bien— pero sin vínculo gestionado). ⛔
- **Predio sin ownership completo** (existe la FK a productor, pero sin CSG ni administración UI). ⚠️

→ **STOP-AND-REPORT. No se modifica schema.** No se certifica visualmente Recepción/Lotes/Producción hasta resolver esto.

## 7. Modelo TARGET propuesto (para tu autorización — NO materializado)
```
proc_vinculo(cliente_servicio)
proc_vinculo(productor)  ── + csg_sag, rut
   └─ proc_cliente_productor   (N:M: qué productores procesa cada cliente)   [NUEVO]
   └─ proc_predios  ── + csg_sag, comuna, superficie_ha                       [AMPLIAR + exponer en UI]
        └─ proc_cuartel  (predio_id, codigo, superficie, especie, variedad)   [NUEVO]
proc_especie (codigo, nombre)                                                 [NUEVO catálogo]
   └─ proc_variedad (especie_codigo, codigo, nombre)                          [NUEVO catálogo]
proc_recepcion / proc_lote:
   - origen por LOTE (no solo cabecera) para cargas mixtas: lote → cuartel    [ESTRUCTURAL]
   - SNAPSHOT de nombre+CSG de productor/predio/cuartel al ingreso            [ESTRUCTURAL]
UI: selección contextual en cascada (Cliente→Productor→Predio→Cuartel; Especie→Variedad)
```
Registrar como **`PROC-MAESTROS-TRAZABILIDAD-001`** (estructural, fase propia). Debe respetar la normalización F7.6.1 (clave canónica + dedup + sugerencia no destructiva) en todos los maestros nuevos; snapshots emitidos previos **no** se retro-normalizan.

## 8. Impacto en F7.8 Visual QA
`VISUAL QA CERTIFIED` permanece **NO**. La revisión visual de las 23 pantallas queda **en pausa** para Recepción/Lotes/Producción/Trazabilidad hasta decidir §7 (las pantallas Comercial/Bodega/Despacho no dependen de este gap y podrían revisarse, si autorizas revisión parcial). El puente DEV/UAT (F7.8.1-D) sigue válido y reutilizable para la revisión una vez resuelto el modelo.

## 9. Cierre
**CASO C. STOP.** Espero tu decisión: (a) autorizar el diseño de `PROC-MAESTROS-TRAZABILIDAD-001` como fase estructural propia; (b) alcance (¿incluye Cuartel y origen-por-lote, o versión mínima Predio+Variedad+relación primero?); (c) si querés que igual avancemos la revisión visual de las pantallas NO afectadas mientras tanto. No materializo nada sin tu autorización.

# ACTA DE RECONCILIACIÓN — R4-A (retiro bridge anon `_dev_uat`), lotes 1–7 ejecutados sin acta

**Proyecto:** PROC / Allegria Service — RLS-HARDEN-PROC, carril R4 (retiro del bridge anon DEV/UAT).
**Fecha del acta:** 2026-08-26
**Naturaleza:** acta **de reconciliación de registro**, no de entrega. Documenta una ejecución que ya
ocurrió y para la cual no se levantó acta en su momento. **Ninguna mutación fue realizada al redactarla.**
**Autoría:** Angelo Huerta (CFO) + Claude Code (sesión de reconciliación).

---

## 1. Identificadores

| Campo | Valor |
|---|---|
| Branch | `iam-identity-prod-001` |
| Worktree | `.claude/worktrees/proc-fase1` |
| Supabase target | **staging** `nlvfjpwiecgrosjnwwik` |
| Production | `bywovqayuzodbzwsriet` — **HANDS-OFF** (no tocado en ningún momento) |
| Scripts | `supabase/r4_r5_prep/R4-A_LOTE1..8.sql`, `R4-A_GLOBAL_VALIDATE.sql`, `R4-A_rollback.sql` |
| Estado del directorio | `supabase/r4_r5_prep/` **untracked** en git (no commiteado) |
| Rehearsal previo | local Docker `proc_uat`, base `r4_reh` — **18/18 PASS** (ver `R4-R5_security_notes.md` §5) |

---

## 2. Motivo del acta

La sesión del 2026-08-26 (tarde) abrió con la premisa "R4 no ejecutado; autorizado solo el LOTE 1".
El `GLOBAL_VALIDATE` PRE corrido como micro-gate devolvió `dev_uat_schema_total = 13` contra las
**61** esperadas por el mapa autoritativo H1. El desvío gatilló **HARD STOP** antes de ejecutar nada.

El diagnóstico posterior (read-only) determinó que **el desvío no es una anomalía de la base: es el
estado correcto tras una ejecución previa de R4-A lotes 1–7 que no quedó registrada en acta.**

---

## 3. Evidencia A — baseline medido (`R4-A_GLOBAL_VALIDATE.sql`, read-only)

| Columna | Medido | Esperado pre-R4 | Lectura |
|---|---|---|---|
| `dev_uat_schema_total` | **13** | 61 | desvío → origen del hallazgo |
| `empresa_pol_total` | 60 | 60 | OK — estrictas tenant intactas |
| `catalogo_global_cat` | 1 | 1 | OK — catálogo global intacto |
| `dev_only_total` | 0 | 0 | OK — H2-A sigue firme |
| `anon_grants_proc` | 278 | > 0 | pendiente de R4-B |
| `anon_exec_fn` | 70 | > 0 | pendiente de R4-B |
| `auth_grants_proc` | 278 | 278 | OK — invariante preservado |
| `anon_calendario` | 3 | 3 | OK — app legada no tocada |
| `als_memberships` | 6 | 6 | OK — supuesto R3-S5 |
| `angelo_binding` | `29b0217d-40ed-4fde-84c0-51d51b98c849` | `29b0217d-…` | OK — binding correcto |
| `whoami_exists` | 1 | 1 | OK — capability de certificación viva |

Diez de once invariantes cuadran exactamente. El único movimiento es el conteo de `_dev_uat`.

---

## 4. Evidencia B — desglose de las 13 `_dev_uat` supervivientes (read-only)

Las 13 son **todas del LOTE 8** (v8/v9/v10/reporting/temporadas), ninguna del LOTE 1:

`proc_tipo_movimiento`, `proc_tipo_envase`, `proc_envase_movimiento`, `proc_especie`, `proc_variedad`,
`proc_cuartel`, `proc_cliente_productor`, `proc_cliente_ficha`, `proc_tipo_documento_contractual`,
`proc_cliente_contrato`, `proc_reporte_config`, `proc_reporte_destinatario`, `proc_reporte_ejecucion`

Las 13 son `PERMISSIVE` · `ALL` · `{anon}` — bridge anon **efectivo** sobre esas tablas.
`proc_tablas_total = 62` (corte de staging íntegro).

---

## 5. Evidencia C — reconstrucción de la ejecución

El LOTE 8 declara en su propio encabezado `Entrada esperada: dev_uat schema = 13`, que es exactamente
el estado medido hoy. Los encabezados de los lotes 5, 6 y 7 declaran 24, 19 y 14 respectivamente. La
escalera reconstruida cierra al dígito contra los tamaños de lote (13·14·7·3·5·5·1·14):

```
61 (H1) --LOTE1 -13--> 48 --LOTE2 -14--> 34 --LOTE3 -7--> 27 --LOTE4 -3--> 24
        --LOTE5  -5--> 19 --LOTE6  -5--> 14 --LOTE7 -1--> 13   (= estado actual)
```

Timestamps de archivo (mtime, 2026-08-26), consistentes con "crear el lote → ejecutarlo → crear el siguiente":

| Archivo | mtime | "Entrada esperada" declarada |
|---|---|---|
| `R4-A_LOTE1.sql` | 16:10 | — |
| `R4-A_LOTE2.sql` | 16:44 | — |
| `R4-A_LOTE3.sql` | 16:53 | — |
| `R4-A_LOTE4.sql` | 16:59 | — |
| `R4-A_LOTE5.sql` | 17:04 | **24** |
| `R4-A_LOTE6.sql` | 17:04 | **19** |
| `R4-A_LOTE7.sql` | 17:04 | **14** |
| `R4-A_LOTE8.sql` | 17:05 | **13** |
| `R4-A_GLOBAL_VALIDATE.sql` | 17:09 | — |
| `R4-B_PREFLIGHT.sql` | 17:10 | — |

Refuerzo: `R4-A_LOTE8.sql` incorpora refinamientos ausentes en los lotes 1–4 (`to_regclass` por tabla;
exigir policy estricta solo si la tabla tiene `_dev_uat`) — refinamientos que solo se escriben tras haber
corrido los lotes anteriores contra la base real.

**Conclusión:** R4-A **lotes 1 a 7 fueron ejecutados contra staging `nlvfjpwiecgrosjnwwik`** en la ventana
aproximada **16:10–17:05 del 2026-08-26**, retirando **48** policies `pol_<t>_dev_uat`. La ejecución se
detuvo antes del LOTE 8. No se levantó acta.

**Corroborado del lado del servidor con `pg_stat_statements` — ver §12.**

---

## 6. Descartes de la investigación (por qué no fue otra cosa)

| Sospecha | Descarte |
|---|---|
| `H2-A_drop_dev_only.sql` retiró `_dev_uat` | No: preserva `_dev_uat` explícitamente y **aborta** si el conteo cambia (`IF v_uat_post<>v_uat_pre THEN RAISE EXCEPTION`) |
| `R3-S6_revoke/restore.sql` | No: solo `UPDATE iam_usuario_empresa SET activo` sobre una fila fixture; no tocan policies |
| Otro script del repo | Único otro `DROP POLICY … _DEV_UAT` está en `schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql`, y es el `DROP IF EXISTS` interno del propio bridge + su bloque ROLLBACK (comentado) |
| Staging reconstruido / corte distinto | No: `proc_tablas_total = 62`, `empresa_pol_total = 60`, `catalogo_global_cat = 1` — inventario íntegro |

---

## 7. Confirmación de D1 (delta 61 vs 62)

El LOTE 8 tiene **14** tablas en allowlist; solo **13** tuvieron `_dev_uat`. La ausente es
**`proc_temporada_reapertura_permiso`**.

**Causa — corregida el 2026-08-27 con evidencia directa.** La primera redacción de este acta atribuyó
el delta a "tabla existente que se materializó después del último run del bridge y por eso no recibió
`_dev_uat`", siguiendo la hipótesis de `R4-R5_security_notes.md` §1. **Es incorrecto.** La verificación
nominal read-only sobre las 14 tablas del lote arrojó:

```
proc_temporada_reapertura_permiso | existe = FALSE | tiene_dev_uat = 0 | estrictas = 0
```

**La tabla no existe en staging.** Coincide con el comentario que la sesión anterior dejó dentro del
propio `R4-A_LOTE8.sql` (`FIX 2026-08-26: saltar tabla inexistente … DROP POLICY IF EXISTS no cubre
tabla faltante -> 42P01`), y explica por qué ese lote incorporó el salto por `to_regclass`: sin él, el
lote habría abortado con `42P01` sobre una tabla ausente.

**D1 queda CERRADO:** el bridge creó `_dev_uat` sobre **61** tablas porque en staging existían 61 de las
62 de la allowlist. El conteo dinámico (no hardcodear 61) demostró ser la decisión correcta, y el salto
por `to_regclass` del LOTE 8 era necesario, no defensivo de más.

**Ítem abierto derivado (no bloqueante para R4-A, sí a revisar antes de R4-B):** `pg_tables` reporta
**62** tablas `proc_*` en staging, pero la allowlist de 62 incluye una que no existe allí. Por
aritmética, staging tiene **al menos una tabla `proc_*` fuera de la allowlist R4**. No quedó bridge
residual (el conteo de `_dev_uat` en todo el schema es 0), pero R4-B revoca grants **por allowlist**:
una tabla no listada conservaría sus grants `anon`. Debe inventariarse antes de ejecutar R4-B.

---

## 8. Estado actual de staging

Staging está en el estado intermedio **"A sin B"** desde ~17:04 del 2026-08-26:

- **49 de 62 tablas** (48 de lotes 1–7 + `proc_temporada_reapertura_permiso`): policy anon retirada,
  **grants anon aún vigentes** (`anon_grants_proc = 278`, `anon_exec_fn = 70`). Sin exposición de datos:
  anon tiene grant pero ninguna policy que lo autorice → RLS filtra fail-closed.
- **13 tablas (LOTE 8)**: bridge anon **abierto y efectivo** (`PERMISSIVE FOR ALL TO anon USING(true)`)
  sobre catálogos, ficha y contratos de cliente-productor, y configuración de reportes.
- Enforcement tenant para `authenticated`: **intacto** (60 `_empresa` + 1 `_cat`).
- App legada (`calendario_data`): **no tocada** (`anon_calendario = 3`).

`R4-R5_security_notes.md` §2 advierte no dejar staging reposando en este estado: A quita la policy,
B quita el grant, y son inseparables para el cierre.

---

## 9. Autorizaciones — estado

| Ítem | Estado |
|---|---|
| LOTE 1 | **Autorización ANULADA por el CFO.** Ya ejecutado en la ventana 16:10–17:05; re-ejecutarlo sería no-op verde (`0 dropeadas / 0 restantes`) y produciría un cierre falso |
| Lotes 2–7 | Ejecutados sin acta — reconciliados por este documento |
| **LOTE 8** | **NO autorizado.** Pendiente de autorización explícita y nueva del CFO |
| R4-B (`REVOKE anon`) | NO autorizado. Blocker **B1** vivo: exige app 100% `authenticated` (`REACT_APP_PROC_AUTH=true`) y cero paths anon residuales en `src/proceso/**` |
| R5 (certificación 16 celdas) | NO iniciada |
| Producción `bywovqayuzodbzwsriet` | **HANDS-OFF** — sin contacto |

---

## 10. Brecha de gobernanza y acción correctiva

**Brecha:** se ejecutaron 7 mutaciones de seguridad contra staging sin acta, sin evidencia numérica
congelada por lote y sin registro del `NOTICE` fail-closed de cada uno. El estado quedó correcto, pero
la sesión siguiente abrió con una premisa falsa ("R4 no ejecutado") y estuvo a un paso de certificar en
verde un LOTE 1 sin efecto. Lo que evitó el cierre falso fue el micro-gate `GLOBAL_VALIDATE` PRE, no
el script: el propio `R4-A_LOTE1.sql` habría reportado OK.

**Correctivo inmediato (este acta):** reconstrucción documentada del estado, con evidencia.

**Correctivo de proceso, obligatorio a partir de ahora:**
1. Toda ejecución contra staging cierra con acta, aunque sea de un solo lote.
2. Todo lote mutante se envuelve entre `GLOBAL_VALIDATE` PRE y POST, y ambos outputs se pegan al acta.
   Es la única evidencia numérica disponible: **el SQL Editor de Supabase no muestra `RAISE NOTICE`**,
   de modo que el "OK" del script no es observable por esa vía.
3. Ningún lote se ejecuta sin autorización explícita y nominal del CFO **para ese lote**.

**Confirmación con fuente del servidor:** ejecutada vía `pg_stat_statements` (read-only) — ver §12.
Queda como vía abierta, no ejercida, si en el futuro se requiere el timestamp exacto:
- Dashboard → proyecto `nlvfjpwiecgrosjnwwik` → **SQL Editor** → historial de queries recientes
  (ventana 16:00–17:30 del 2026-08-26).
- Dashboard → **Logs** → **Postgres Logs**, mismo rango, buscando `DROP POLICY` / `R4 ABORT lote`.

---

## 11. Veredicto

**Base: SANA.** Inventario íntegro (62 tablas), enforcement tenant intacto (60 `_empresa` + 1 `_cat`),
`_dev_only` en 0, app legada no tocada, supuestos R3-S5 vigentes (ALS=6, binding Angelo, `whoami`).
Ninguna pérdida de datos; R4-A solo mueve policies.

**Registro: RECONCILIADO Y CERRADO.** La reconstrucción de §5 (artefactos locales + aritmética de
estado) queda corroborada por evidencia del servidor en §12. El hecho decisivo —**el LOTE 8 no se
ejecutó**— está confirmado de forma directa y no inferida.

**R4-A: INCOMPLETO** — 48 de 61 `_dev_uat` retiradas; **quedan 13 (LOTE 8)** con bridge anon efectivo.

**Próximo gate:** `R4-A_LOTE8.sql` (13 policies; entrada esperada `dev_uat_schema_total = 13`, salida
esperada `= 0`), **a la espera de autorización explícita del CFO**. Rollback disponible:
`R4-A_rollback.sql` (sub-array del lote 8).

---

## 12. Evidencia D — corroboración del servidor (`pg_stat_statements`, read-only)

Consulta ejecutada en el SQL Editor de staging el 2026-08-26, filtrando por `dev_uat` / `R4 ABORT lote` /
`DROP POLICY` sobre `extensions.pg_stat_statements`, con el texto recortado a 240 caracteres.

### 12.1 Hecho decisivo — el LOTE 8 NO se ejecutó

- **No existe** en `pg_stat_statements` ningún bloque `DO $b$` con el array del LOTE 8
  (`proc_tipo_movimiento`, `proc_tipo_envase`, … `proc_temporada_reapertura_permiso`).
- **Sí existe**, con `calls = 2`, su gate de validación read-only: `WITH l8(tbl) AS (VALUES ($1)…($14))`.

Es decir: el LOTE 8 fue **preparado y validado dos veces, pero nunca ejecutado**. Evidencia directa,
consistente con las 13 `_dev_uat` que siguen vivas.

### 12.2 Lotes R4-A confirmados como ejecutados

Los bloques `DO $b$` de R4-A se distinguen de los de H2-A por su firma de variables
(`v_uat_pre / v_uat_post / v_dropped / v_estrictas` en R4-A, frente a
`n := array_length(tbls,1) / v_dev / v_emp` en H2-A). Con esa firma visible en los 240 caracteres:

| Lote | Firma R4-A visible | `calls` |
|---|---|---|
| LOTE 4 (`proc_despacho`, `proc_despacho_linea`, `proc_despacho_doc`) | sí | 1 |
| LOTE 5 (`proc_informe*`) | sí | 1 |
| LOTE 6 (`proc_tipo_servicio` … `proc_base_cobro_linea`) | sí | 1 |

### 12.3 Alcance y límite de la evidencia (declarado, no omitido)

- Los arrays de los **lotes 1, 2 y 3** aparecen en `pg_stat_statements`, pero el recorte a 240
  caracteres corta antes de la firma de variables, y **H2-A usa arrays idénticos** para esas mismas
  tablas. Por texto solo, esas tres entradas no distinguen R4-A de H2-A.
- El bloque de **LOTE 7** (`proc_correlativo`) no aparece entre las 50 filas devueltas; la consulta tenía
  `LIMIT 50` y `pg_stat_statements` es un buffer con desalojo, de modo que la ausencia no es prueba
  de no-ejecución.
- Lo que cierra esos tres casos no es el texto sino la **aritmética de estado**: con `empresa_pol_total`
  intacto en 60 y `dev_uat_schema_total = 13`, las 48 `_dev_uat` faltantes corresponden exactamente y
  sin otra combinación posible a los lotes 1–7. Descartado además que las retirara H2-A (§6).
- `DROP POLICY` sobre `osi_*` y `acc_*` en el output: ruido de otros carriles (Osiris, Accounting), ajeno
  a R4. Sin impacto sobre `proc_*`.

### 12.4 Trazas colaterales confirmadas

- `SELECT … AS dev_uat_schema_total` con `calls = 1`: el `GLOBAL_VALIDATE` PRE de esta sesión.
- `R4-0 PREFLIGHT READ-ONLY`, `WITH the48 AS (…)`, `tablas_lote1/2/4/5`, `l123`, `l1234`, `l12`:
  la batería de gates read-only por lote que acompañó la ejecución 16:10–17:05.
- Bloques `DO $$` de los `schema_proc_*_DEV_ONLY_rls.sql` y del bridge `visual_uat`: origen histórico
  del bridge, coherente con el inventario de H1.

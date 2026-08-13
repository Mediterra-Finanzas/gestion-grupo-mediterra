# proc_* — F5: Diseño (Resultado de Proceso al cliente) — para revisión

**Capability:** `proc_*` · tenant piloto Allegria Service · **Worktree:** `worktree-proc-fase1`
**Base:** F1+F2+F3+F4 VALIDATED · **Fecha:** 2026-08-13 · **Estado:** ✅ **F5 VALIDATED** (DF5-1..6 ratificadas; ver Acta al final).

> Aplica la regla permanente [`proceso-bounded-context-frisku.md`](proceso-bounded-context-frisku.md): **destinatarios y contrapartes del informe salen de `proc_vinculo`**, nunca de Frisku. Incremental sobre F1-F4; el ledger y los hechos F1-F4 siguen siendo la SoT (el informe **lee y consolida**, no recalcula).

## 1. Propuesta de alcance (decisión abierta)

El frontera F4 dejó F5 como **Resultado de Proceso al cliente** y/o **servicios facturables/tarifario** ("o ambos en fases separadas").

**Recomendación:** **F5 = Resultado de Proceso al cliente** (el entregable operacional: qué resultó del proceso, informado al mandante). **Servicios facturables + tarifario = F6** (fase separada, ya que introduce el eje económico/facturación). Así F5 cierra el ciclo operacional-informativo y F6 el económico.

## 2. Qué es el Resultado de Proceso (§26-28 del brief)

Informe **versionado** que Allegria Service emite al **productor / exportadora / cliente contratante** (según rol vía `proc_vinculo`), con: cabecera (operador, temporada, planta, productor, exportadora, cliente, especie/variedad, lote/s, fecha proceso, kg recibidos/procesados) · distribución de resultado (categoría/calibre/color/formato → kg + %) · resumen (kg procesados, kg comerciales, **packout**, kg descarte + %, kg merma + %) · gráficos (cuando aporten) · observaciones · firma/responsable. **Consolidable** por productor/lote a través de varias corridas (un lote puede procesarse en más de un día/corrida).

## 3. Entidades F5 (incremental; el informe deriva de F1-F4, no recalcula)

| Tabla | Propósito | Claves / FK |
|---|---|---|
| `proc_informe` | Cabecera del Resultado de Proceso | `empresa_id`, `folio`, `temporada_codigo`, `planta_id`, **`destinatario_vinculo_id`** (rol cliente_servicio/dueno_fruta/exportadora/productor — vía `proc_vinculo`), `alcance` (jsonb: qué órdenes/lotes/productor/período cubre), `estado ∈ {borrador,emitido,enviado,anulado}`, `version_actual` |
| `proc_informe_version` | **Versionado** (nunca regenerar en silencio) | `informe_id`, `version`, `snapshot jsonb` (datos congelados al emitir), `pdf_path` (bucket privado), `motivo`, `generado_por`, `generado_at` |
| `proc_informe_envio` | Historial de envíos (§27) | `informe_id`, `version`, `destinatario_vinculo_id`, `canal ∈ {descarga,email}`, `destino_email?`, `enviado_por`, `enviado_at`, `estado` |

**Derivación (SoT = F1-F4):** el informe consolida por productor/lote/período leyendo `proc_recepcion → proc_lote → proc_orden_insumo → proc_orden_proceso → proc_resultado(+descarte+merma) → proc_producto_terminado/pallet → proc_despacho` (packout = Σ resultado.kg / Σ consumo.kg; genealogía ya existe). **No** se recalcula ni duplica ningún hecho.

**Versionado (§26):** al emitir se **congela un snapshot** (los números al momento de emitir). Si los datos cambian después, se crea **nueva versión** (conserva la anterior + usuario + timestamp + motivo). Nunca se regenera silenciosamente un informe histórico con datos posteriores.

## 4. Decisiones abiertas (gate F5)

| # | Decisión | Recomendación |
|---|---|---|
| DF5-1 | Alcance F5 | **Solo Resultado de Proceso**; tarifario/facturable = F6. **Confirmar** |
| DF5-2 | SoT del informe | Deriva/consolida de F1-F4 (no recalcula) + **snapshot versionado** al emitir. **Confirmar** |
| DF5-3 | Destinatarios | Desde `proc_vinculo` (rol), **no Frisku** (regla permanente). **Confirmar** |
| DF5-4 | Consolidación | Por productor/lote a través de varias corridas (informe acumulado correcto). **Confirmar** |
| DF5-5 | Envío | Preparar historial + PDF en bucket privado + URL firmada. **Despacho de email real** = reusar infra neutral existente (`emailHelper`) o diferir a paso gated; **sin servicios externos improvisados**. **Confirmar enfoque** |
| DF5-6 | PDF | jsPDF/autoTable (neutral, ya en uso) con logo; almacenar en bucket privado. **Confirmar** |

## 5. Seguridad / tenancy / tests (heredado)

Tablas F5: `empresa_id` + RLS `FORCE` deny-by-default + `REVOKE anon` + DEV-ONLY separado; `created_by/updated_by/timestamps/deleted_at`; auditoría; append-only donde aplique (envíos/versiones conservan historia). Tests: versionado no pisa versión previa; informe deriva números coherentes con F1-F4; destinatario proviene de `proc_vinculo`; consolidación multi-corrida; tenant aísla; validación runtime en Postgres efímero (patrón F1-F4).

## 6. Gate F5 (diseño → SQL)

No se materializa SQL F5 hasta ratificar §1 (alcance) y §4 (DF5-1..6). Con eso: migración incremental + capa dominio/DB + tests + E2E (informe consolidado + versión + envío) + runtime aislado + regresión F1-F4 + RLS + Acta F5 + commit `service:`. STOP-AND-REPORT solo ante cambio estructural de bounded context / SoT / identidad / seguridad / tenancy.

---

## ACTA DE ENTREGA — proc_* FASE 5 (VALIDATED)

**Proyecto:** Allegria Service · **Bounded context:** `proc_*` · **Worktree:** `worktree-proc-fase1` · **Base:** F1-F4 VALIDATED.
**Estado: ✅ VALIDATED (runtime aislado, 2026-08-13).** Incremental. Alcance = Resultado de Proceso; tarifario/facturable = F6.

**Archivos (solo rutas Service):**
- `supabase/schema_proc_v5_f5.sql` — **nuevo** (incremental): 5 tablas (`proc_informe` + `_version` + `_fuente` + `_destinatario` + `_envio`) + trigger de inmutabilidad de versión emitida + 6 RPC (crear_informe, generar_version [consolida + valida órdenes cerradas/conciliadas + fuentes sin duplicar], agregar_destinatario [snapshot de contacto], emitir_version [reemplaza la emitida anterior], registrar_envio [pendiente]) + RLS FORCE/REVOKE anon.
- `supabase/schema_proc_v5_f5_DEV_ONLY_rls.sql` — **nuevo**.
- `supabase/validation/proc_v5_f5_tests.sql` — **nuevo** (E2E Regla 17 + negativos Regla 16).
- `src/proceso/core/procesoF5Domain.js` + `.test.mjs` — **nuevo** (consolidación ponderada, estados, envío). `procesoF5DB.js` — **nuevo** (gate Regla 9).
- `docs/proceso-f5-diseno.md` — **modificado** (esta Acta).

**Precisiones DF5-1..6 materializadas:** alcance solo Resultado de Proceso (F6=tarifario); informe **deriva** de F1-F4, no recalcula; **snapshot estructurado inmutable** al emitir (identificacion/resumen/detalle/adicional, no solo PDF); **fuentes explícitas** por versión (`proc_informe_fuente`) sin duplicar órdenes; **consolidación matemática** (Σ kg comerciales / Σ kg procesados, no promedio de %); destinatarios desde `proc_vinculo` (regla Frisku≠Service) con **snapshot de contacto congelado**; versión emitida inmutable → corrección = nueva versión (la anterior → `reemplazada`, permanece consultable); estados de envío (`pendiente`/`enviado`/`error`/`reintentado`/`cancelado`), **no 'enviado' por generar PDF**; PDF = representación (no SoT); emisión **no exige despacho** (Resultado ≠ despacho: basta orden cerrada/conciliada); folio operacional (RP-…, no UUID visible); Resultado ≠ inventario (F1-F4 = autoridad).

**Email:** `emailHelper` evaluado = **infra neutral** (`src/emailHelper.js`, "usado por todos los módulos", sin imports, param `modulo`). Utilizable vía interfaz neutral; el **despacho real de email queda gated a la capa UI** (envíos en `pendiente` en F5). Sin nueva deuda. PDF (jsPDF/autoTable) = UI-side, `pdf_path` en bucket privado + URL firmada.

**Validación runtime (Postgres 16 efímero, sin tocar producción; teardown):**
- F1-F5 aplican limpios; **F1-F4 regresión OK**.
- F5 E2E (Regla 17): 2 órdenes (Lote procesado en 2 corridas) → informe → **versión 1 con consolidación ponderada packout 0.72 (7200/10000, NO 0.80 promedio)** → fuentes=2 → destinatario (email snapshot `x@export.cl`) → emitir (pdf_path) → envío `pendiente` → editar dato maestro CURRENT → **snapshot v1 intacto** → versión 2 → v1 `reemplazada` con snapshot inalterado + ambas trazables. **PASÓ.**
- F5 negativos (**todos rechazados**): orden no cerrada, fuente duplicada, editar versión emitida.
- RLS productiva F5: sin claim → 0; tenant A → 1; cross-tenant B → 0.
- Dominio (node): F1 27 + F2 28 + F3 + F4 + F5 18 (todas pasan).

**Build:** no ejecutado (worktree aislado, aditivo); sintaxis JS OK (ESM).
**Schema:** DRAFT — **NO aplicado a producción**. Migraciones: NO. Data: NO. Cross-project: NINGUNO (no toca Frisku/`exp_*`/Foods/Osiris/`main`; efímeros propios desmontados).
**Deuda:** EXP-TENANCY-001, EXP-SECURITY-001 (Core); PROC-INFRA-001 (SUPA config).
**Frontera F6 (Regla 18):** Tarifario + Servicios Facturables + Base de Cobro (eje económico), reservado.

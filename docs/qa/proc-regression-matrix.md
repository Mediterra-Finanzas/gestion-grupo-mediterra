# PROC / Allegria Service — Matriz de Regresión Integral (QA)

**Carril:** 5 — QA / Regresión Integral (READ-ONLY + doc). **Fecha:** 2026-08-25.
**Worktree:** `worktree-proc-fase1`. **Naturaleza:** inventario de cobertura de pruebas por área; no ejecuta SQL remoto, no muta producto.

Este documento **se construye ahora, no al final del proyecto**: mapea cada área funcional/seguridad de PROC a los casos que deben probarse, el tipo de prueba, la evidencia ya certificada reutilizable (para NO re-probar) y el gap abierto. Prioridad P0 (impide producción segura) / P1 (operación correcta) / P2 (hardening registrable).

---

## Resumen ejecutivo

**Áreas cubiertas:** 23.

**Estado global de cobertura:**
- **CERRADAS con evidencia certificada (reusar, no re-probar):** 12 áreas — auth (Option C), tenant isolation, RLS, recepción, lotes, QC, proceso, conciliación de masa, producto terminado, pallets/repaletizaje, despachos, reporting daily (motor+snapshot).
- **PARCIALES (núcleo con evidencia + gap identificado):** 6 áreas — temporadas, concurrencia, inventario/saldos, informes (envío), comercial/tarifas, permisos/RBAC.
- **GAP dominante (poca o nula prueba automatizada):** 5 áreas — Centro de Operaciones (UI), reporting UI, manejo de errores (UI), reload, multi-tab.

**Conteo de gaps:** **P0 = 4** · **P1 = 9** · **P2 = 8**.

### Gaps P0 (bloquean producción segura) — lista corta

1. **Identidad productiva no desplegada (`CORE-IDENTITY-TENANCY-001`).** Auth Option C está certificado E2E-lógico y validado en STAGING (`nlvfjpwiecgrosjnwwik`), pero **NO desplegado a producción** (`REACT_APP_PROC_AUTH=OFF`). La app real sigue corriendo como `anon`; hasta el flip, la RLS estricta no protege a la app real y el único acceso vivo es vía bridge DEV_ONLY. Toda la seguridad de tenant depende de cerrar este gap. Master blocker.
2. **Concurrencia Class-B (last-write-wins destructivo) sin cerrar en el producto.** Los cambios de estado (orden/despacho/tarifa/base/contrato) y edición de maestros usan `procUpdate` PATCH REST sin control optimista. Diseño y drafts SQL (`concurrency_v2/`) + plan frontend existen, pero **nada aplicado en `src/` ni desplegado**. El harness `90_harness_concurrency.sql` no se ha corrido en staging. Riesgo de pérdida silenciosa de decisiones concurrentes.
3. **Temporadas — blockers de integridad GAP-1 / GAP-2 sin implementar.** Fallback `'s-t'` persiste operaciones sin temporada autoritativa (6 create-paths) y el lifecycle de temporada (cerrada/anulada, una activa por empresa) no se enforcea. Drafts `temporadas_v2/` en diseño; **no aplicados**. Clasificados C (blocker pre-Producción) en `proc-multiseason-hardening.md`.
4. **Bypass a `authenticated` abierto (48 políticas `_DEV_ONLY`).** En staging las 48 políticas permisivas `USING(true)` OR-ean la política estricta `_empresa` → un `authenticated` de cualquier tenant podría cruzar. H2-A (DROP de las 48) está **diseñado y con rehearsal local, no ejecutado**. Hasta correr H2, el tenant enforcement real en staging no está cerrado (aunque H2_VALIDATE ya está escrito para certificarlo).

> Nota: P0-1 y P0-4 son dos caras del mismo trabajo de identidad/RLS. P0-1 habilita el canal authenticated; P0-4 retira el bypass que hoy lo neutraliza. Ambos deben cerrarse antes del GO-LIVE productivo de `proc_*`.

---

## Leyenda

- **Tipo de prueba:** `SQL` = suite PG16 en `supabase/validation/` · `JS` = test node de dominio · `E2E` = test de endpoint/flujo · `RLS` = gate de seguridad SQL · `HARNESS` = script de concurrencia · `MANUAL/BROWSER` = requiere app corriendo · `EST` = inspección estática.
- **Estado evidencia:** `CERRADA` (certificada, reusar) · `PARCIAL` (núcleo probado, gap abierto) · `GAP` (sin prueba hoy).

---

## Matriz por área

### A. Autenticación (Option C — login PIN → JWT authenticated)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| PIN correcto → token; PIN malo → 401; sin hash / plano legacy → 401; `_h` string-JSON parse + malformado fail-closed; sin membership → 403; identidad_no_provisionada → 403; binding_conflicto → 403 (fail-closed); binding bootstrap patch; multiempresa sin/ con/ con-arbitraria selección; rate-limit → 429; sub = auth.users.id | E2E | **CERRADA** — `api/proc-token.optionc.test.mjs` (20 checks), `procAuth.optionc.test.mjs` (20), `proc-token.s4.test.mjs` (15), `_iamToken.test.mjs` (12), `_procThrottle.test.mjs` (17), `_supaAdmin.test.mjs` (15), `proc-token.wiring.test.mjs` (4). findUserByEmail fail-closed cubierto. | Todo lógico contra mocks GoTrue/DB. Falta E2E real contra staging desplegado (R3-S5). | — (lógica); P0 (deploy) |
| Deploy productivo del endpoint + flip `REACT_APP_PROC_AUTH=ON` | MANUAL | **GAP / BLOCKED** — R3-S4/S5 preparados, no ejecutados. | Endpoint no desplegado a prod; app real sigue anon. | **P0** |

### B. Aislamiento de tenant

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| authenticated tenant A → solo datos de A; tenant B → solo B, no ve ficha de A; cross-tenant SELECT DENY; cross-tenant INSERT (WITH CHECK) DENY; cross-tenant motor reporting DENY | RLS | **CERRADA** — `proceso-t11-security-rls.md` (aislamiento A/B PASS, cross SELECT/INSERT DENY). H2_VALIDATE tenant enforced 48/48. Fixture flip ALLOW→DENY R3-S5-C M2/M3. IAM staging R1+R2 (6 memberships ALS, Carol DENY) — memoria `iam-identity-staging-closed`. | Enforcement real depende de H2-A ejecutado (bypass 48) y de identidad prod desplegada. | — (probado); ver P0-4 |
| `p_empresa` ajeno en RPC INVOKER no expone datos ajenos | RLS/EST | **CERRADA** — H1.5 audit: 71 RPC INVOKER, 0 cross-tenant blockers; write ajeno → WITH CHECK deny; read ajeno → RLS filtra → NOT FOUND. | — | — |

### C. RLS (row-level security de `proc_*`)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| anon DENY en todas las tablas; vistas `security_invoker` heredan RLS; motor reporting RPC anon DENY; patrón uniforme ENABLE+FORCE+policy `empresa_id=proc_current_empresa()`+REVOKE anon | RLS | **CERRADA** — `proceso-t11-security-rls.md`: **anon DENY 59/59 tablas**, 0 fugas; vistas invoker DENY. `proceso-f7-8-1` control inverso: anon DENY 25/25 vistas en cadena productiva limpia. | — | — |
| 0 RPC de negocio SECURITY DEFINER; 6 helpers DEFINER con search_path fijo seguros | EST | **CERRADA** — H1.5: 6 DEFINER (resolvers identidad + throttle + whoami) seguros 6/6; 71 INVOKER. | — | — |
| DROP de 48 `_DEV_ONLY` (cierra bypass authenticated); FORCE en 2 tablas envases (H2-B) | RLS | **GAP** — H2-A/H2-B **diseñados + rehearsal local 1:1**, no ejecutados en staging. `H2_VALIDATE.sql` listo para certificar post-DROP. R4 (REVOKE anon bridge) pendiente. | 48 políticas permisivas vivas en staging; 3 tablas sin FORCE (`proc_tipo_envase`, `proc_envase_movimiento` P1; `proc_tipo_movimiento` benigna P2). | **P0** (bypass) / P2 (FORCE envases) |

### D. Temporadas (multi-temporada + integridad)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Crear/configurar temporada desde la app sin hardcode; `temporadaDeFecha` clasifica; correlativo con temporada compactada | JS/SQL | **CERRADA (soporte base)** — `procesoF7Domain.test.mjs` (`temporadaDeFecha`, `compactarTemporada`, `formatearCorrelativo`). Auditoría R3-D: multi-temporada soportado. | — | — |
| GAP-1: rechazar `'s-t'`/vacío/temporada inexistente en `proc_fn_siguiente_correlativo`; 6 create-paths derivan temporada obligatoria | SQL/JS | **GAP** — `temporadas_v2/10_ms_g1_*` diseñado, no aplicado; frontend `temporadas-v2-frontend-plan.md` no aplicado. | Folios sin temporada, contador compartido; blocker C. | **P0** |
| GAP-2: lifecycle enforce (no escribir en cerrada/anulada; una activa por empresa; reapertura vía RPC+auditoría) | SQL | **GAP** — `20_ms_g2_lifecycle_enforce.sql` diseñado, no aplicado; RLS de `proc_temporada_reapertura_permiso` pendiente. | Sin enforcement de estado de temporada; blocker C. | **P0** |
| GAP-3: FK lógica `(empresa_id,temporada_codigo)`; GAP-4: EXCLUDE gist anti-solape | SQL | **GAP** — `30_*`/`40_*` diseñados, no aplicados. | Identidad de temporada partida (FK vs texto); solapes de fecha (`temporadaDeFecha` → 'multiple' runtime). | P1 |

### E. Concurrencia

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Consumo doble sobre mismo saldo (FOR UPDATE, 1 éxito/1 rechazo); doble cierre recepción; repaletizaje vs saldo; reserva/despacho mismo pallet; idempotencia base e Informe Diario (unique + ON CONFLICT) | SQL | **CERRADA** — `proceso-t11-regression-report.md` §Concurrencia crítica: 6 puntos PASS. Ledger append-only, RPC transaccionales con FOR UPDATE. | — | — |
| Class-B: PATCH estado (orden/despacho/tarifa/base/contrato) + edición maestros con optimistic concurrency (token/row_version); 2 editores misma fila → 2º CONFLICT; no-op silencioso eliminado | HARNESS/JS | **GAP** — `concurrency_v2/` (5 drafts SQL) + `concurrency-v2-frontend-plan.md` en DISEÑO. **Nada aplicado en `src/`**; harness `90_*` no corrido en staging. `cambiarEstadoTarifa` sin trigger estado-máquina. | Last-write-wins destructivo vivo en 6 superficies `procUpdate`. | **P0** |
| CONC-B2: `registrar_movimiento` pallet/PT sin FOR UPDATE; CONC-B3: reversar doble; idempotencia ledger UNIQUE(empresa_id,transaccion_id)+ON CONFLICT | HARNESS | **GAP** — registrados en `RLS-HARDEN §No incluido`; gate propio pendiente. | Sin prueba. | P2 |
| Aislamiento de sesión token por tab (in-memory, no localStorage) | JS | **CERRADA** — `procesoDB.authgate.test.mjs` check 10 (token/empresa aislable por tab). | Ver Multi-tab (V). | — |

### F. Recepción

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Borrador → multi-lote → snapshot origen inmutable → movimientos → ubicación; recepción multi-lote obligatoria (3 lotes, 3 orígenes independientes, cliente comercial único, sin duplicación); `calcularNeto`, `validarPesos` | SQL/JS | **CERRADA** — `proc_t11_uat_integral` (pasos 11–15 + bloque multi-lote PASS), `proc_v8_t2/t4` (origen agrícola, lote-origen), `procesoF7Domain` (`calcularNeto`, `validarPesos`). Visual QA en `proceso-recepcion-visual-qa.md`. | Happy-path browser real (LIVE-BLOCKED por identidad). | P1 (browser) |

### G. Lotes

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Lote con origen agrícola (predio/cuartel/especie/variedad); especie del lote determina obligatorios QC; existencia física del rechazado permanece; saldos por lote; `resumenKgLotes`, `loteSinOrigen`, `evaluarOrigenLote` | SQL/JS | **CERRADA** — `proc_v8_t1/t4/t5/t5b` (integridad backfill+cutover), `proc_v_lote_saldos`, `procesoF7Domain` (helpers de lote). | Browser (LIVE-BLOCKED). | P1 (browser) |

### H. QC (control de calidad)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Severidad bloqueante/advertencia/informativo → rechazado/condicional/aprobado; obligatorio faltante → rechazado; QC por lote independiente; resumen mixto; consumir lote rechazado → check_violation | SQL/JS | **CERRADA** — `procesoF7Domain` (`evaluarQC`, `qcPorLote`, `resumenQcRecepcion`, `textoQcCabecera`), `proc_v8_t10c_qc_tests` (T-1..NEG-2), `proceso-t10c1-qc-masa-gate.md`, UAT QC mixto PASS. | — | — |

### I. Proceso (orden de proceso)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Programa → orden → gate contractual → iniciar → consumir → resultado/descarte/merma → conciliar → cerrar; gate QC bloquea lote rechazado; `accionesOrden`, `packout`, `ordenTerminal`; transición estado (trg_orden_transicion) | SQL/JS | **CERRADA** — UAT pasos 20–28 PASS, `procesoF2/F3Domain` (consumo+genealogía atómico), `procesoF7Domain` (`accionesOrden`, `packout`). | Browser (LIVE-BLOCKED). | P1 (browser) |

### J. Conciliación de masa

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Exacto / faltante / exceso / tolerancia / legacy / doble-cierre; Σentrada = neto; `resumenConciliacion`, `faltaParaCerrar` | SQL/JS | **CERRADA** — `proc_v8_t10c_masa_tests`, `proceso-t10c1-qc-masa-gate.md`, `procesoF7Domain` (`resumenConciliacion`). Doble cierre FOR UPDATE PASS. | — | — |

### K. Producto terminado (PT)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Materializar PT → formato → `totalKg`; genealogía PT→lote→recepción→origen end-to-end | SQL/JS | **CERRADA** — UAT pasos 29 + T9/`proc_v8_t9_readmodels_genealogia`, `procesoF7Domain` (`totalKg`). | Browser (LIVE-BLOCKED). | P1 (browser) |

### L. Pallets y repaletizaje

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Palletizar → trasladar → hold → repaletizar; balance Σorigen=Σdestino vs saldo; `resumenOrigenes`, `copiarOrigen` | SQL/JS | **CERRADA** — regresión F7.4 (repaletizaje balance), UAT pasos 30–33, `procesoF4Domain` (20/20). | Browser (LIVE-BLOCKED); CONC-B2 pallet sin FOR UPDATE (ver E-P2). | P1 (browser) |

### M. Inventario / saldos

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Saldos por lote/pallet consistentes tras movimientos; ledger append-only (bloqueo UPDATE/DELETE); vistas de saldo `security_invoker` | SQL | **CERRADA (invariante)** — F1/F2 ledger append-only verde, `proc_v_lote_saldos`/vistas. | Reconciliación de saldo bajo concurrencia Class-B (edición maestros/movimiento) no probada en UI; ver E. | P1 |

### N. Despachos

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Crear → reservar (hold) → despachar (confirmación atómica) → ledger; mismo pallet doble despacho; `accionesDespacho`, `puedeConfirmarDespacho`, `orquestarConfirmarDespacho`, `vistaDespachos`, `despachoTerminal`; transición (trg_desp_transicion) | SQL/JS | **CERRADA** — regresión F7.5 (hold+confirmación atómica), UAT pasos 34–37, `procesoF5Domain` (18/18), `procesoF7Domain` (orquestación despacho). | Cambio estado despacho Class-B (ver E, RPC `cambiar_estado_despacho` diseñado no aplicado). Browser LIVE-BLOCKED. | P0 (via E) / P1 (browser) |

### O. Informes (resultado de proceso + versionado)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Emitir versión → snapshot histórico inmutable → consolidado; PDF de informe | SQL/JS | **CERRADA** — regresión F7.6 (snapshot inmutable, consolidado 72%), UAT 38–40, `ui/procesoPdf.test.mjs` (12/12). | Browser (LIVE-BLOCKED). | P1 (browser) |

### P. Reporting (Informe Diario — motor + envío email)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Preview → ejecución manual → snapshot/historial; idempotencia unique(empresa,config,fecha)+ON CONFLICT; motor `proc_fn_reporte_generar_ejecucion` anon DENY; construcción del email (plantilla/alertas) | SQL/JS | **CERRADA (motor)** — `proc_reporting_daily_tests`, UAT 46–48, `core/reportingEmail.test.mjs` (19 checks), contrato `proceso-reporting-daily-001-contrato.md`. Scheduler `_reportingScheduler.test.mjs`. | — | — |
| Envío real de email (proveedor) + cron desplegado | MANUAL | **GAP / BLOCKED** — envío real LIVE-BLOCKED (proveedor); runbook `proceso-reporting-daily-001-deploy-runbook.md` no ejecutado. | Sin verificación de entrega real ni del cron en Vercel. | P1 |

### Q. Comercial / tarifas / bases de cobro

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Tarifa snapshot inmutable, especificidad y vigencia; servicio → pendiente_tarifa → base → aprobar → inmutable; `montoServicio`, `especificidadTarifa`, `vigenciaTarifa`, `baseEditable`, `accionesBase`, `servicioAgregableABase`, `totalesPorMoneda`; contrato versionado (cargar≠firmar), `transicionesContrato`, `alertaContractual` | SQL/JS | **CERRADA** — regresión F6/F7.7, UAT 41–45, `procesoF6Domain` (16/16), `procesoF7Domain` (tarifa/base/contrato), `proc_v8_t7/t8` (contrato + gates). | `cambiarEstadoTarifa` sin trigger estado-máquina (Class-B, ver E). Browser LIVE-BLOCKED. | P0 (via E) / P1 (browser) |

### R. Excepciones / manejo de errores

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Traductor de errores (stock lote, conciliación, permiso, fallback); `traducirError`, `badgeDe` tono | JS | **CERRADA (lógica)** — `procesoF7Domain` (`traducirError`, `badgeDe`). | Estados de error en la UI (red caída, 401/403/409, token expirado) no probados a nivel de pantalla; anti-borrado (Regla 9: `cargaOkRef`) no verificado en `proc_*` UI. | P1 |

### S. Permisos / RBAC

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Angelo→ALS auto; Carol→DENY (403); sin membership → 403; 6 memberships ALS single-membership; deny-browser iam_* (grants=0); throttle server-only | E2E/RLS | **CERRADA** — `iam-identity-staging-closed` (Carol DENY, 6 memberships, deny-browser vivo), Option C E2E (403 sin membership), H2_VALIDATE checks 08/09. | RBAC de acciones/roles dentro del módulo (quién puede aprobar base, cerrar orden, editar tarifa) — matriz de permisos por rol NO definida ni probada (STOP registrado en `foods-p1-security-baseline`: matriz RBAC pendiente CFO). | **P1** |
| Kong reenvía `X-Proc-Empresa` (multiempresa) | MANUAL | **GAP** — R3-S5 incógnita no cubierta local; fallback documentado. ALS single-membership no usa header hoy. | Multiempresa no certificado. | P2 |

### T. Centro de Operaciones (UI)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Dashboard de operaciones agrega recepciones/órdenes/despachos/alertas; navegación cruzada; refresco de datos | MANUAL/BROWSER | **GAP** — 0 tests. `CentroOperaciones.jsx` sin cobertura JS ni E2E. | Sin prueba automatizada ni browser certificado (LIVE-BLOCKED por identidad). | P1 |

### U. Reload (recarga / persistencia de sesión)

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Recarga de página conserva/recupera sesión; token in-memory se re-obtiene; anti-borrado (`cargaOkRef`) evita sobrescribir con defaults tras fallo de carga | JS/BROWSER | **PARCIAL** — token in-memory por-tab probado (authgate 10). | Comportamiento de reload real (token in-memory se pierde al recargar → re-login) no verificado en browser; gate anti-borrado Regla 9 no verificado en pantallas `proc_*`. | P1 |

### V. Multi-tab

| Casos | Tipo | Evidencia reutilizable / estado | Gap | Prio |
|---|---|---|---|---|
| Dos tabs con sesiones/empresas distintas aisladas; edición concurrente misma entidad en 2 tabs → conflicto visible (no pérdida silenciosa) | JS/BROWSER | **PARCIAL** — aislamiento de token/empresa por tab probado (authgate 10, in-memory no localStorage). | Edición concurrente cross-tab = mismo gap Class-B (E). Sin E2E browser de 2 tabs. | P0 (via E) / P1 (browser) |

---

## Notas de reutilización (NO re-probar)

Evidencia certificada que este carril declara **CERRADA** y reutilizable tal cual:

- **Auth Option C E2E-lógico:** `api/proc-token.optionc.test.mjs` (20), `procAuth.optionc.test.mjs` (20), `proc-token.s4.test.mjs` (15), `_iamToken.test.mjs` (12), `_procThrottle.test.mjs` (17), `_supaAdmin.test.mjs` (15), `proc-token.wiring.test.mjs` (4). findUserByEmail fail-closed incluido.
- **F-1/F-2 authgate 15/15:** `src/proceso/core/procesoDB.authgate.test.mjs` (logout limpia token, fail-closed sin fallback anon con flag ON, aislamiento por tab).
- **Tenant / RLS:** anon DENY 59/59 (`proceso-t11-security-rls.md`), cross-tenant READ/WRITE DENY, own-tenant A/B ALLOW, H2_VALIDATE tenant enforced 48/48, matriz RLS local, control inverso 25/25 vistas anon DENY, fixture flip ALLOW→DENY M2/M3.
- **IAM staging R1+R2:** materializado y validado en `nlvfjpwiecgrosjnwwik` (memoria `iam-identity-staging-closed`): 6 memberships ALS, Carol DENY, deny-browser vivo.
- **Regresión SQL 30/30** (`proceso-t11-regression-report.md`) + **UAT integral 48 pasos** (`proceso-t11-uat-matrix.md`).
- **Dominio JS:** procesoDomain 27, F2 28, F3 18, F4 20, F5 18, F6 16, **F7 126**, format 31, procesoPdf 12, reportingEmail 16/19.

## Trabajo de QA pendiente (no cubierto por reutilización)

1. **P0** — Ejecutar H2-A/H2-B en staging + `H2_VALIDATE.sql` (cerrar bypass 48 + certificar tenant 48/48 en vivo). Luego R3-S5 E2E real (Kong, whoami, revocación) y flip identidad a prod.
2. **P0** — Aplicar + validar `concurrency_v2/` (harness `90_*` en staging) e integrar contrato optimista de `procUpdate` en `src/`; añadir tests JS de conflicto.
3. **P0** — Implementar + validar `temporadas_v2/` (GAP-1/GAP-2) con sus casos negativos; alinear los 6 create-paths del frontend.
4. **P1** — Suite browser (Visual UAT) de happy-paths F–Q contra backend con RLS real (hoy LIVE-BLOCKED): recepción, proceso, despacho, tarifas, Centro de Operaciones, reporting UI, estados de error, reload, multi-tab.
5. **P1** — Matriz RBAC por rol de acciones dentro del módulo (aprobar/cerrar/editar) — definir y probar (pendiente CFO).
6. **P1** — Envío real de Informe Diario + cron desplegado (runbook).
7. **P2** — CONC-B2/B3 + idempotencia ledger; FORCE RLS envases (H2-B); Kong `X-Proc-Empresa` multiempresa.

# T11 — Reporte de regresión completa

**Cadena aplicada** (`ON_ERROR_STOP=1`, PG16 efímero, ERR=0):
F1–F7.7 · T1–T9 · T10c-QC · T10c-MASA · T10d · T10e · PROC-REPORTING-DAILY-001.

**Objetivo: FULL REGRESSION GREEN, sin exclusiones.** Se ejecutaron TODAS las suites de
`supabase/validation/` (excepto los scripts UAT manuales `proc_uat_*` que requieren seed/JWT
propios), incluyendo la nueva suite integral T11.

## Resultado: **30/30 VERDE**
| Suite | Resultado |
|---|---|
| proc_v1_tests | PASS |
| proc_v2_f2_tests | PASS |
| proc_v3_f3_tests | PASS |
| proc_v4_f4_tests | PASS |
| proc_v5_f5_tests | PASS |
| proc_v6_f6_tests | PASS |
| proc_v7_f7_1_tests | PASS |
| proc_v7_2_f7_2_tests | PASS |
| proc_v7_3_f7_3_tests | PASS |
| proc_v7_4_f7_4_tests | PASS |
| proc_v7_5_f7_5_tests | PASS |
| proc_v7_6_f7_6_tests | PASS |
| proc_v7_7_f7_7_tests | PASS |
| proc_v7_8_filter_tests | PASS |
| proc_v8_t1_tests | PASS |
| proc_v8_t2_tests | PASS |
| proc_v8_t3_tests | PASS |
| proc_v8_t4_tests | PASS |
| proc_v8_t5_tests | PASS |
| proc_v8_t5b_tests | PASS |
| proc_v8_t6_tests | PASS |
| proc_v8_t7_tests | PASS |
| proc_v8_t8_tests | PASS |
| proc_v8_t9_tests | PASS |
| proc_v8_t10c_qc_tests | PASS |
| proc_v8_t10c_masa_tests | PASS |
| proc_v8_t10d_tests | PASS |
| proc_v8_t10e_tests | PASS |
| proc_reporting_daily_tests | PASS |
| proc_t11_uat_integral | PASS |

## Invariantes revalidadas (subrayadas por T11)
- **Ledger** append-only (bloqueo UPDATE/DELETE): F1/F2 verde.
- **Recepción** + QC por lote + especie del lote: F7.2 + T10c-QC verde.
- **Conciliación de masa**: T10c-MASA verde (exacto/faltante/exceso/tolerancia/legacy/doble-cierre).
- **Consumo** (movimiento+genealogía atómico, saldo, QC gate): F2/F7.3 verde.
- **Genealogía** end-to-end (pallet→...→lote→recepción→origen): T9 + UAT verde.
- **Contratos** versionados (máquina de estados, cargar≠firmar): T7/T10d verde.
- **Tarifario/servicios/bases** (snapshot inmutable, pendiente_tarifa, base aprobada inmutable): F6/F7.7 verde.
- **Filtros** (AND acumulativo, sin dataset fantasma): F7.8 + `proc_v7_8_filter_tests` verde.

## Concurrencia crítica (revalidada)
| Punto | Suite | Mecanismo | Resultado |
|---|---|---|---|
| Consumo (doble consumo mismo saldo) | F7.2/F7.3/F7.8 | FOR UPDATE, 1 éxito / 1 rechazo | PASS |
| Cierre de recepción (doble cierre) | T10c-MASA | FOR UPDATE re-lee estado | PASS |
| Repaletizaje (vs saldo) | F7.4 | balance Σorigen=Σdestino, saldo | PASS |
| Reserva/Despacho (mismo pallet) | F7.5 | hold + confirmación atómica | PASS |
| Idempotencia comercial (base) | F6/F7.7 | estado aprobado inmutable | PASS |
| Idempotencia Informe Diario | reporting L + UAT | unique (empresa,config,fecha) + ON CONFLICT | PASS |

## Tests JS
| Suite | Resultado |
|---|---|
| procesoDomain | 27/27 |
| procesoF2Domain | 28/28 |
| procesoF3Domain | 18/18 |
| procesoF4Domain | 20/20 |
| procesoF5Domain | 18/18 |
| procesoF6Domain | 16/16 |
| procesoF7Domain | 126/126 |
| ui/format | 31/31 |
| ui/procesoPdf | 12/12 |
| core/reportingEmail | 16/16 |

## Build
`CI=true npm run build` → **Compiled successfully**.

## Nota de exclusión (honesta)
Los scripts `proc_uat_A_C/D_F/G_K/L_setup` y `proc_uat_f1_f6` son escenarios UAT manuales
de fases previas que dependen de seed/JWT específicos (no son suites automáticas de regresión).
No se ejecutan en el barrido automático; su cobertura funcional está subsumida por las suites
por-fase + `proc_t11_uat_integral`. No hay exclusión de ninguna suite de regresión automática.

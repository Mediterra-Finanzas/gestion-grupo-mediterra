# T11 — Matriz UAT integral de Allegria Service

**Alcance:** certificación del producto F1 → T10e + PROC-REPORTING-DAILY-001 como un solo
sistema. HEAD `d007a61` (+ commit T11). **Sin nuevas features** (solo un fix P2 de UUID visible).

## Entorno y dataset
| Ítem | Valor |
|---|---|
| Entorno | PostgreSQL 16 efímero (Docker), aislado. **Productivo sin DEV_ONLY** para RLS; superuser para funcional. |
| Empresa UAT | uuid aleatorio por corrida, marcada `Planta UAT Rancagua` / clientes `... UAT` |
| Planta | `Planta UAT Rancagua` (+ 2ª planta en test M) |
| Timezone | `America/Santiago` (default), + `UTC` en test N |
| Dataset | `proc_t11_uat_integral.sql`: Cliente A (contrato vigente), B (vencido), C (bloqueante), Foods (vía `proc_vinculo`), Productor A **compartido** por A y B, 2 predios, 3 cuarteles, Cereza+Ciruela, variedades, QC informativo/condicional/bloqueante, tarifa vigente + Cliente C sin tarifa, contrato versionado, recepción multi-lote, PT/pallet/despacho, servicio facturable, base de cobro, config Informe Diario. **Todo DEV/UAT.** Cero dependencia Frisku/Foods `exp_*`. |

Leyenda evidencia: **SQL** = validación PG16 · **JS** = test node · **BUILD** = compilación · **EST** = inspección estática · **RLS** = gate de seguridad · **LIVE-BLOCKED** = requiere app corriendo (identidad anon vs RLS estricta; bridge DEV/UAT es DEV_ONLY).

## Flujo integral punta a punta (pasos 1–48)
| Bloque (pasos) | Evidencia | Resultado |
|---|---|---|
| Maestros → Cliente → Ficha → Productores → Predio → Cuartel → Especie → Variedad (1–8) | SQL `proc_t11_uat_integral` (dataset) + `proc_v8_t1..t3/t10d` | **PASS** |
| Contrato + estado contractual (9–10) | SQL: A=ok, B=vencido no-vigente, C=bloqueante | **PASS** |
| Recepción borrador → multi-lote → snapshot origen → movimientos → ubicación (11–15) | SQL: 3 lotes, 3 orígenes independientes, snapshot inmutable | **PASS** |
| QC por lote → resumen mixto (16–17) | SQL: aprobado/condicional/rechazado independientes, resumen 3 | **PASS** |
| Conciliación de masa → finalizar recepción (18–19) | SQL: 9000=9000 cuadra → recibida | **PASS** |
| Programa → Orden → gate contractual → iniciar → consumir → resultado/descarte/merma → conciliar → cerrar (20–28) | SQL: consumo real 4000, gate QC bloquea L3, conciliación cuadra | **PASS** |
| PT → palletizar → trasladar → hold → repaletizar (29–33) | SQL UAT (materializar/palletizar/despacho) + regresión F7.4 | **PASS** |
| Despacho → reservar → despachar → ledger (34–37) | SQL UAT (crear/listo/confirmar) + regresión F7.5 | **PASS** |
| Resultado de Proceso → emitir versión → snapshot histórico (38–40) | Regresión F7.6 (snapshot inmutable, consolidado 72%) | **PASS** |
| Servicio facturable → pendiente tarifa → base → aprobar → inmutable (41–45) | SQL UAT (servicio+base aprobada inmutable) + regresión F6/F7.7 | **PASS** |
| Informe Diario: preview → ejecución manual preparada → snapshot/historial (46–48) | SQL UAT (A=9000/4000, idempotente) + reporting A–R | **PASS** (envío real = BLOCKED proveedor) |

## Recepción multi-lote OBLIGATORIA
| Aserción | Evidencia | Resultado |
|---|---|---|
| L1 Prod A / Predio A / C-01 / Cereza / Santina / 4000 | SQL | **PASS** |
| L2 Prod A / Predio A / C-02 / Cereza / Regina / 3000 | SQL | **PASS** |
| L3 Prod B / Predio B / N-04 / Ciruela / D'Agen / 2000 | SQL | **PASS** |
| Σ 9000 = neto 9000 → conciliación PASS | SQL | **PASS** |
| 3 snapshots de origen independientes | SQL (3 cuarteles distintos) | **PASS** |
| Cliente comercial único (A) | SQL | **PASS** |
| Sin duplicación artificial de recepciones | SQL (1 recepción, 3 lotes) | **PASS** |

## QC por lote mixto
| Aserción | Evidencia | Resultado |
|---|---|---|
| L1 Cereza aprobado (consumible) | SQL | **PASS** |
| L2 Cereza condicional (elegible) | SQL | **PASS** |
| L3 Ciruela rechazado (no consumible) | SQL (consumir L3 → check_violation) | **PASS** |
| Especie del LOTE determina obligatorios (L3=PLU) | SQL | **PASS** |
| Existencia física del rechazado permanece (2000 kg) | SQL `proc_v_lote_saldos` | **PASS** |
| Fallback QC header legacy | SQL `proc_v8_t10c_qc` (C20) | **PASS** |
| Resumen QC mixto | SQL `proc_v_qc_recepcion_resumen` | **PASS** |

## Conciliación de masa (escenarios)
| Escenario | Evidencia | Resultado |
|---|---|---|
| Igualdad exacta | SQL UAT + MASS-1 | **PASS** |
| Captura incompleta en borrador | MASS-2 | **PASS** |
| Faltante fuera de tolerancia (rechazo) | MASS-3 | **PASS** |
| Exceso fuera de tolerancia (rechazo) | MASS-4 | **PASS** |
| Diferencia dentro de tolerancia | MASS-5 | **PASS** |
| Doble cierre concurrente (1 gana) | MASS concurrencia (FOR UPDATE) | **PASS** |
| Recepción legacy ya recibida intacta | MASS-8 | **PASS** |
| Sin "Forzar cierre"; backend decide | EST (no existe el control) | **PASS** |

## Contratos / gates
| Caso | Evidencia | Resultado |
|---|---|---|
| sin ficha / sin contrato / borrador / pendiente firma / vigente / vencido / reemplazado / doc sin firma | SQL `proc_v8_t10d` (C1–C9) | **PASS** |
| política informativa / advertencia / bloqueante | SQL C10–C12 | **PASS** |
| recepción física SIEMPRE registrable | SQL UAT (C recepción=habilitada) | **PASS** |
| avance bloqueado por backend + motivo humano | SQL UAT (C proceso=false, motivo) | **PASS** |
| contrato ≠ tarifario (controles independientes) | SQL F7.7 + UAT | **PASS** |

## Excepciones (mínimas requeridas)
| Excepción | Evidencia | Resultado |
|---|---|---|
| QC rechazado / QC obligatorio pendiente | SQL F7.2/UAT | **PASS** |
| consumo > saldo | SQL F2 | **PASS** |
| conciliación de orden descuadrada | SQL F7.3 | **PASS** |
| recepción sin conciliar | SQL MASA | **PASS** |
| pallet sin saldo / hold > libre / repaletizaje > saldo / despacho > disponible / doble despacho / reversa | SQL F7.4/F7.5 | **PASS** |
| informe corregido nueva versión | SQL F7.6 | **PASS** |
| falta tarifa (pendiente_tarifa, no $0) | SQL F7.7 | **PASS** |
| base aprobada no editable | SQL UAT + F7.7 | **PASS** |
| idempotencia informe diario | SQL UAT + reporting L | **PASS** |
| cliente bloqueado contractualmente | SQL UAT | **PASS** |
| snapshot origen inmutable / contrato histórico inmutable | SQL UAT + T4/T7 | **PASS** |

## Reporting engine (revalidación sobre dataset UAT)
| Aserción | Evidencia | Resultado |
|---|---|---|
| A: 9000 recibidos / 4000 procesados (consumo real) | SQL UAT | **PASS** |
| dos productores consolidan bajo cliente | reporting B | **PASS** |
| dos clientes no se mezclan | reporting C | **PASS** |
| proceso parcial = consumo real | reporting D | **PASS** |
| recepción hoy/proceso mañana separados | reporting E | **PASS** |
| timezone determinístico | reporting N | **PASS** |
| sin movimiento respeta política | reporting F | **PASS** |
| snapshot histórico no cambia | reporting H | **PASS** |
| alcance A excluye B | reporting I | **PASS** |
| Foods vía proc_vinculo | reporting J + UAT | **PASS** |
| idempotencia | reporting L + UAT | **PASS** |
| dos plantas no se mezclan | reporting M | **PASS** |
| destinatario inactivo excluido | reporting O | **PASS** |
| preview coincide con ejecución | reporting Q | **PASS** |
| error/retry auditable | reporting G/P | **PASS** |
| cross-tenant / anon | reporting S/T (RLS) | **PASS** |

## Estados de reporting (sin cambio)
`REPORTING ENGINE = VALIDATED` · `MANUAL SEND = PREPARED` · `AUTOMATIC SCHEDULER = BLOCKED` · `EMAIL PROVIDER = BLOCKED`. No se simuló proveedor ni scheduler.

## Filtros y navegación
Ver `proceso-t11-filter-certification.md`. Certificación por **inspección estática + tests JS** (`filtrosActivos` 8/8, `proc_v7_8_filter_tests`). Recorrido **LIVE-BLOCKED** (app corre como anon; RLS estricta deniega; el bridge DEV/UAT es DEV_ONLY). No se declara revisión live.

## Trazabilidad
Ver `proceso-t11-traceability-report.md` (bidireccional, sin heurísticas, snapshot como autoridad).

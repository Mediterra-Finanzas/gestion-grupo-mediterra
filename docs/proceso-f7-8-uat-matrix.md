# F7.8 — Matriz UAT Integral (Allegria Service F1–F7.7)

**Fecha:** 2026-08-14 · **Entorno:** PostgreSQL 16 aislado (Docker efímero), cadena v1→v7.7 aplicada limpia, `ON_ERROR_STOP=1`. **Datos:** DEV/UAT aislados (no producción, sin seeds a prod). **UI-live:** ver `proceso-f7-8-visual-qa.md` (VISUAL LIVE BLOCKED).

Regla: PASS solo con evidencia. Los pasos con lógica de servidor se certifican por la suite runtime que los ejerce; los de interacción pura de UI (click-through) quedan **BLOCKED** por falta de login/datos reales, no marcados PASS.

## A. Journey happy-path punta a punta (§17)

| # | Paso | Evidencia | Resultado |
|---|---|---|---|
| 1 | Configurar maestros mínimos | Configuración data-driven 13 maestros (incl. tipo_servicio); seeds en suites | PASS (backend) |
| 2-4 | Recepción + participantes + pesos | `proc_v6/v7_7 tests` crean recepción (neto=bruto−tara); `proc_v7_2` participantes de proc_vinculo | PASS (backend) |
| 5 | QC | `proc_v7_2` gate QC (aprobado/condicional/rechazado) | PASS (backend) |
| 6-7 | Crear lote + ubicación | `ingresar_lote_ubicado` atómico (lote+movimiento+ubicación) | PASS (backend) |
| 8 | Verificar ledger | `proc_movimiento` entrada; `proc_v_lote_saldos` | PASS (backend) |
| 9-10 | Programa → generar orden | `proc_v7_3` programa/orden | PASS (backend) |
| 11-12 | Iniciar orden + consumir lote | `consumir_lote_en_orden` (movimiento+genealogía atómico) | PASS (backend) |
| 13-15 | Resultado + descarte + merma | `proc_v6/v7_7` (7800/1700/300) | PASS (backend) |
| 16-17 | Conciliar + cerrar | `conciliar_orden`; cuadre enforced | PASS (backend) |
| 18 | Materializar PT | `proc_v7_4` (sin sobreasignación) | PASS (backend) |
| 19-20 | Palletizar + trasladar | `proc_v7_4` invariante Σlíneas=físico | PASS (backend) |
| 21-22 | Hold/reserva + repaletizar | `proc_v7_4` (hold≤disponible; repaletizaje N:M, UAT-D-01) | PASS (backend) |
| 23-25 | Preparar/reservar/despachar | `proc_v7_5` (reserva=hold; confirmar=salida ledger) | PASS (backend) |
| 26 | Verificar ledger post-despacho | `proc_v7_5` líneas ligadas a movimiento | PASS (backend) |
| 27-29 | Resultado de Proceso + emitir + snapshot | `proc_v7_6` (snapshot inmutable, consolidación 72%) | PASS (backend) |
| 30 | Generar servicio facturable | `proc_v6/v7_7` (kg procesados 9800) | PASS (backend) |
| 31 | Resolver tarifa | `proc_v7_7` T2 (gana específica 0,30; general 0,25 sin cliente) | PASS (backend) |
| 32-33 | Base de cobro + aprobar | `proc_v6/v7_7` (total 2940; aprobada inmutable) | PASS (backend) |

**Trazabilidad completa:** Recepción→Lote→Orden→Resultado→PT→Pallet→Repaletizaje→Despacho (`pallet_genealogia`, F7.4) y Orden/hecho→Servicio Facturable→Base (`proc_v_servicio_facturable.referencia`, F7.7 T3/T7). PASS (backend).

## B. Journey de excepciones (§18)

| Escenario | Evidencia | Resultado |
|---|---|---|
| QC rechazado (existe, no consumible) | `proc_v7_2` | PASS |
| QC obligatorio pendiente | `proc_v7_2` | PASS |
| Consumo > disponible | `proc_v7_3` + **carrera 2-sesiones F7.8** (1 éxito/1 rechazo, saldo 4000, sin negativo) | PASS |
| Conciliación descuadrada | `proc_v7_3` (diff>tolerancia rechaza) | PASS |
| Pallet sin saldo / hold > libre | `proc_v7_4` | PASS |
| Repaletizaje > saldo | `proc_v7_4` (multilínea UAT-D-01, sin kg<0) | PASS (código unchanged desde F7.4 VALIDATED) |
| Despacho > disponible / doble despacho / reversa | `proc_v7_5` (exceso rechazado; doble confirmación rechazada; reversa restituye) | PASS (código unchanged desde F7.5 VALIDATED) |
| Informe corregido / nueva versión | `proc_v7_6` (v1→reemplazada; snapshot v1 intacto) | PASS |
| Falta tarifa → pendiente_tarifa (no $0) | `proc_v7_7` T4/T5 | PASS |
| Base aprobada editable → rechazada | `proc_v6` + `proc_v7_7` T10 | PASS |
| Duplicidad / idempotencia | `proc_v6` (misma orden+servicio no duplica) | PASS |
| Concurrencia crítica (consumo) | **carrera 2-sesiones F7.8** | PASS |
| Concurrencia (repaletizaje, reserva/despacho) | F7.4 (`587a005`) / F7.5 (`b82ba20`) — código **byte-idéntico**, no tocado en F7.6→F7.8 | PASS (validado-unchanged) |

## C. Filtros

Certificación de acumulación (AND, no reemplazo) a nivel de datos: `proc_v7_8_filter_tests.sql` (F1–F7). Detalle por pantalla en `proceso-f7-8-filter-certification.md`. **Click-through en vivo: BLOCKED** (sin UI-live).

## D. Regresión

Las 13 suites F1–F7.7 corren limpias en la cadena v1→v7.7 (`ON_ERROR_STOP=1`). Ninguna regresión.

## Cobertura declarada honestamente
- **Con datos DEV/UAT aislados:** todo lo anterior (backend punta a punta + concurrencia + filtros + RLS).
- **Con datos reales de Rancagua:** nada (no hay maestros productivos cargados; no se aplicó seed a producción).
- **No pudo probarse:** interacción UI en vivo (login/datos), pixel de PDF (jsPDF CDN/CSP). Ver Visual QA.

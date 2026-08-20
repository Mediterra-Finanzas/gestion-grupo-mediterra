# T11 — Acta de UAT integral de Allegria Service

**Gate:** UAT integral del producto completo F1 → T10e + PROC-REPORTING-DAILY-001.
**No es una fase funcional nueva.** Solo se corrigió un defecto P2 real (UUID visible).

## Estado final
| Componente | Estado |
|---|---|
| **FUNCTIONAL UAT** | **VALIDATED** |
| VISUAL QA | **READY** (no certificada) |
| PRODUCTION IDENTITY | **BLOCKED** (CORE-IDENTITY-TENANCY-001) |
| AUTOMATIC SCHEDULER | **BLOCKED** (PROC-REPORTING-SCHEDULER-GAP) |
| EMAIL E2E | **BLOCKED** (proveedor server-side no ejercitable) |
| REPORTING ENGINE | **VALIDATED** · MANUAL SEND **PREPARED** |

## Criterios de FUNCTIONAL UAT = VALIDATED (todos cumplidos)
- [x] flujo punta a punta (48 pasos) — SQL UAT integral + regresión
- [x] trazabilidad agrícola (bidireccional, snapshot autoridad)
- [x] contratos / gates (recepción siempre registrable; avance bloqueado por backend)
- [x] QC por lote (aprobado/condicional/rechazado independientes; especie del lote; fallback)
- [x] conciliación de masa (exacto/faltante/exceso/tolerancia/legacy/doble-cierre)
- [x] genealogía (pallet ↔ lote ↔ recepción ↔ origen)
- [x] comercial (servicio facturable, base aprobada inmutable, pendiente_tarifa)
- [x] reporting engine (kg del ledger, por cliente, timezone, idempotencia, snapshot)
- [x] filtros (AND acumulativo, chips, reset) — JS/SQL
- [x] navegación (rutas + contexto desde Centro; 0 UUID visibles tras fix)
- [x] **0 P0 / 0 P1 abiertos**
- [x] regresión completa **30/30 VERDE** sin exclusiones
- [x] RLS/tenant dentro del alcance comprobable (anon DENY 59 tablas + aislamiento A/B)
- [x] tests JS (dominio/format/PDF/reporting) PASS
- [x] build `CI=true` **Compiled successfully**
- [x] bounded contexts limpios (0 deps frisku/exp/osi)

## Entorno
PG16 efímero aislado; schema productivo para RLS (sin DEV_ONLY); dataset DEV/UAT marcado.
No producción, no deploy, no credenciales productivas.

## Evidencia (dónde)
- `supabase/validation/proc_t11_uat_integral.sql` — flujo integral + casos obligatorios.
- Regresión 30/30 — `proceso-t11-regression-report.md`.
- Filtros/navegación — `proceso-t11-filter-certification.md`.
- Trazabilidad — `proceso-t11-traceability-report.md`.
- Seguridad/RLS — `proceso-t11-security-rls.md`.
- Defectos — `proceso-t11-defects.md`.
- Matriz completa — `proceso-t11-uat-matrix.md`.

## Gaps registrados (no cerrados por T11, por límite de entorno/alcance)
1. **CORE-IDENTITY-TENANCY-001** (identidad productiva / claim `empresa_id`) — ABIERTO.
2. **PROC-REPORTING-SCHEDULER-GAP** (scheduler server-side) — ABIERTO.
3. **EMAIL E2E** (proveedor `/api/send-email` sólo en entorno desplegado) — BLOCKED.
4. **VISUAL QA final** (recorrido live con identidad) — READY, no certificada.

## Lo que NO se declara
Producción lista · Visual QA certificada · scheduler validado · email E2E validado ·
identidad productiva resuelta. Ninguno se declara.

## Correcciones aplicadas en T11
- **T11-P2-01** UUID visible en `Repaletizaje.jsx` → ordinal humano (solo display). Sin cambios
  en ledger/genealogía/ownership/snapshots/contrato/identidad/bounded-context.

## STOP
No se inicia Visual QA final, CORE-IDENTITY-TENANCY-001, scheduler/email productivo, merge,
deploy, producción ni fase nueva. A la espera de autorización del CFO.

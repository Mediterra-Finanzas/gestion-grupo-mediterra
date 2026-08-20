# Acta de Entrega — F7.8 (Certificación Integral: UAT + Visual QA + Design System + Filter Certification)

**Fecha:** 2026-08-14 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **HEAD inicial:** `b3c2fc4`.

## Estado de certificación (§36 — dos estados separados)
- **FUNCTIONAL CERTIFIED: SÍ.** UAT backend punta a punta, regresión F1–F7.7, filtros, concurrencia, RLS/tenant, bounded context y build: todo pasa. 0 P0 / 0 P1 abiertos.
- **VISUAL QA CERTIFIED: NO / BLOCKED.** La revisión visual en vivo no es ejecutable (login + RLS que deniega anon + dev server concurrente). No se sustituyó por capturas inventadas.

F7.8 **no agregó features**: tomó F1–F7.7 y lo verificó como un solo producto, corrigiendo 4 defectos P2/P3.

## 1. Naturaleza
Gate de certificación integral. Objetivo: demostrar que **Allegria Service funciona como un solo producto** — operacionalmente correcto, auditable, trazable, con filtros confiables y presentación consistente. No se declara "listo" por compilar.

## 2. Qué se verificó (con evidencia)
- **UAT integral** (`proceso-f7-8-uat-matrix.md`): journey de 33 pasos + 13 escenarios de excepción, mapeados a las suites runtime que los ejercen. Trazabilidad Recepción→…→Despacho y hecho→Servicio→Base.
- **Regresión F1–F7.7:** 13 suites en cadena v1→v7.7 (`ON_ERROR_STOP=1`) — **TODAS PASARON**.
- **Filter Certification** (`proceso-f7-8-filter-certification.md`): acumulación AND a nivel de datos (`proc_v7_8_filter_tests.sql`, F1–F7) + lógica de chips/reset (`filtrosActivos`, 8 tests) + mapeo filtro→query + filtro→navigation contract (1 fix). Export parity: N/A (no hay export; documentado).
- **Concurrencia crítica:** carrera real 2-sesiones en **consumo** (1 éxito / 1 rechazo / saldo 4000, sin negativo). Repaletizaje y reserva/despacho: código byte-idéntico a F7.4/F7.5 VALIDATED, no tocado.
- **RLS/tenant:** `anon` denegado en **25/25 vistas** `proc_v_*` + tablas base F6/F7. Cross-tenant → 0.
- **Bounded context:** **0** dependencias `proc_*`→`exp_*`/`frisku_*` (pg_depend + view_table_usage). Frisku/`friskuBI`/`exp_*` ausentes.
- **Design System** (`proceso-f7-8-design-system-compliance.md`): un solo lenguaje visual; 0 tablas/filtros/botones/formatters duplicados; 0 hex fuera de token; 0 `capitalize`.
- **Visual QA estático** (`proceso-f7-8-visual-qa.md`): 18 pantallas PASS estático contra el benchmark premium. VISUAL LIVE BLOCKED declarado.

## 3. Defectos (`proceso-f7-8-defects.md`)
4 corregidos (D-01/D-04 P2, D-02/D-03 P3): porcentajes ad-hoc→`formatPct`; `procesoPdf` a `format.js`; normalización en dropdowns/pickers/columnas restantes; nav-contract "Bases por aprobar". **0 P0 / 0 P1.** 7 GAPs diferidos documentados (auth, visual-live, datos reales, PDF pixel, export, responsive-live, etiqueta histórica) — ninguno P0/P1.

## 4. Nombres / vocabulario / formatters (§35, §20, §12)
- **Normalización:** escaneo final → **0 inconsistencias de casing conocidas en UI CURRENT**. Excepciones intencionales: snapshot emitido (InformeDetalle) inmutable; editor de Configuración muestra el dato fuente (no display-normalizado). Sin mutación de datos históricos ni de nombres legales.
- **Vocabulario:** términos canónicos consistentes; minúsculas = prosa (correcto), no etiquetas divergentes.
- **Formatters:** **0 `toLocaleString`/`toFixed` ad-hoc** en `src/proceso/ui` (incl. `procesoPdf.js`).

## 5. Tests + build
- JS **113/113** (dominio 70 + format 31 + PDF 12).
- `CI=true npm run build` → **Compiled successfully** (1,08 MB gzip). Junction reversible removido; `build/`/logs/contenedor propio eliminados; scratchpad de validación temporal.

## 6. Aislamiento / frontera
Todo en `worktree-proc-fase1` (HEAD `b3c2fc4` + este commit). Backend menor solo aditivo (1 test de filtros nuevo; helper puro; fixes de display). **No** se tocó modelo F6, ledger, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, snapshots, XOR, multimoneda, tenancy/RLS ni bounded contexts → **sin `F7-STRUCTURAL-GAP`**. No se tocó Frisku/`frisku_*`/`friskuBI`/Foods/`exp_*`/Osiris/`main`. Sin merge, sin deploy, sin producción.

## 7. Criterio de cierre (§36)
| Criterio | Estado |
|---|---|
| UAT integral | PASS (backend + concurrencia) |
| Regresión completa | PASS (13/13) |
| Filtros certificados | PASS (acumulación + chips + contract) |
| Navegación contextual | PASS (1 fix) |
| Sin dataset stale | PASS (F6/reset) |
| Nombres consistentes | PASS |
| Vocabulario consistente | PASS |
| Formatters centralizados | PASS |
| Tablas estándar | PASS |
| Responsive operacional | PASS estático / live pendiente |
| RLS/tenant | PASS (25/25) |
| Bounded contexts limpios | PASS (0 deps) |
| Build | PASS |
| Sin P0/P1 abiertos | PASS |
| **Revisión visual en vivo** | **BLOCKED** |

→ **FUNCTIONAL CERTIFIED = SÍ · VISUAL QA CERTIFIED = NO/BLOCKED.**

## 8. Recomendación
Para levantar VISUAL QA CERTIFIED y la UAT productiva se requiere: (a) resolver el gate de identidad/claim `empresa_id` para que la app lea `proc_*`; (b) cargar maestros reales de Rancagua; (c) que Angelo recorra las 18 pantallas contra la tabla de Visual QA. Recién entonces corresponde evaluar merge/deploy. **No auto-avanzar.**

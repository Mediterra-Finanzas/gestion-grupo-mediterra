# T11 — Defectos y hallazgos

Clasificación: **P0** integridad/imposibilidad de operar · **P1** defecto funcional importante ·
**P2** UX/visual relevante · **P3** polish. Regla T11: corregir P0/P1; P2 sólo si acotado, seguro
y necesario; documentar P3.

## P0 — 0 abiertos
Ninguno. Integridad de ledger/genealogía/masa/QC/contratos/comercial verificada (regresión 30/30).

## P1 — 0 abiertos
Ninguno. Flujo punta a punta, trazabilidad, gates y reporting pasan.

## P2 — 1 encontrado / 1 corregido
| ID | Descripción | Estado |
|---|---|---|
| T11-P2-01 | `Repaletizaje.jsx` mostraba un fragmento de UUID (`PT {pt_id.slice(0,6)}`) en el dropdown de líneas de origen → violaba "0 UUID visibles". | **CORREGIDO** — reemplazado por un ordinal humano por pallet (`ítem N`), sólo display; la lógica (value con `pt_id` real) queda intacta. Build OK. |

## P3 — documentados (no corregidos)
| ID | Descripción | Nota |
|---|---|---|
| T11-P3-01 | La etiqueta de línea de repaletizaje usa un ordinal (`ítem N`) en vez del código humano del PT (no hay código humano de PT cargado en esa vista). | Mejora futura: cargar `codigo/barcode` del PT en la composición para etiqueta plenamente semántica. No bloquea UAT. |
| T11-P3-02 | `incluir_alertas` del Informe Diario: flag + builder de email aceptan `alertas`, pero la recolección de alertas operacionales para adjuntarlas se cablea cuando exista el servicio server-side (read-models CURRENT ya disponibles). | Depende del scheduler (GAP). |

## Auditoría estática de UI (normalización / formatters / UUID)
| Chequeo | Resultado |
|---|---|
| `text-transform: capitalize` en código | 0 (solo mención en comentario de `format.js`) |
| `toLocaleString` / `toFixed` ad-hoc (fuera de `format.js`) | 0 |
| UUID visibles (`*_id.slice(0,N)`) en pantallas | 1 encontrado → **corregido** (T11-P2-01); 0 restantes |
| Normalización de nombres (`normalizarNombre`) | aplicada en display; RUT/CSG/códigos/folios/siglas/snapshots **no** normalizados (correcto) |

## Bounded-context audit
| Chequeo | Resultado |
|---|---|
| deps a `frisku_*` / `friskuBI` | 0 |
| deps estructurales a `exp_*` | 0 (solo un comentario "sin exp_*" en un test) |
| deps a `osi_*` / Osiris | 0 |
| Foods como Cliente Service | sólo vía `proc_vinculo` (test J) |
| Catálogos Especie/Variedad | propios de Service (`proc_especie`/`proc_variedad`) |
| `emailHelper` | infra corporativa neutral (usada por todos los módulos), no acopla a otro contexto |

## Gaps abiertos (no defectos — límites de entorno/alcance)
- `AUTOMATIC SCHEDULER = BLOCKED` (PROC-REPORTING-SCHEDULER-GAP): server-side/deploy no disponible.
- `EMAIL PROVIDER / EMAIL E2E = BLOCKED`: `/api/send-email` sólo corre en entorno desplegado.
- `PRODUCTION IDENTITY = BLOCKED` (CORE-IDENTITY-TENANCY-001): claim `empresa_id` no emitido.
- `VISUAL QA = READY` (no certificada): recorrido live requiere app corriendo con identidad.

Ningún hallazgo exigió tocar ledger, genealogía, ownership, snapshots, contrato versionado,
identidad/tenancy transversal ni bounded contexts → **no hay T11-STRUCTURAL-GAP**.

# F7.8 — Certificación de Filtros

**Método:** (1) acumulación server-side certificada a nivel de datos (`proc_v7_8_filter_tests.sql`, F1–F7, PASS); (2) lógica de chips/reset certificada con helper puro testeable `filtrosActivos` (8 tests en `procesoF7Domain.test.mjs`); (3) mapeo filtro→query verificado por código; (4) **click-through en vivo: BLOCKED** (sin login/datos reales — ver Visual QA).

## Garantías certificadas
- **Acumulación (AND):** `&a=eq.x&b=eq.y` → `WHERE a=x AND b=y`. Probado: cliente=C1 (3) → +estado=valorizado (2) → +moneda=USD (1). Añadir un filtro **estrecha**, no reemplaza (F2/F3).
- **Sin dataset fantasma:** combinación sin match → 0 filas (F5b). 
- **Reset restaura:** sin filtros → dataset completo del tenant (F6). Aislamiento de tenant: otra empresa → 0 (F7).
- **Chips = filtros activos:** `filtrosActivos` cuenta solo valores ≠ vacío/"todos"; `"todos"` no genera chip; robusto ante `null`. Reset visible solo si hay activos.

## Matriz por pantalla

Leyenda: SS=server-side (`&campo=eq.`), CL=cliente (texto). Individual/Combinado/Search+/Reset/Chip = **certificado por `filtrosActivos` + acumulación de datos**. No-results/Dataset-stale = certificados a nivel de datos (F5b/F6). Paginación: `limit` server-side (sin paginado incremental — no aplica scroll infinito). Export parity: N/A (estas pantallas no exportan; ver nota).

| Pantalla | Filtros | Individual | Combinado | Search+ | Reset | Chip remove | No-results | Stale | Paginación | Export | Resultado |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Recepciones | estado(SS), qc(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 200 | N/A | CERT |
| Lotes | qc(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 300 | N/A | CERT |
| Bodega | estado(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 400 | N/A | CERT |
| Órdenes | estado(SS) | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | limit 300 | N/A | CERT |
| Despachos | estado(SS) | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | limit 300 | N/A | CERT |
| Tarifario | servicio(SS), vigencia(SS), moneda(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | N/A | CERT |
| Servicios Facturables | estado(SS), origen(SS), moneda(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 400 | N/A | CERT |
| Pendientes de Tarifa | origen(SS), moneda(SS), texto(CL) + estado fijo `pendiente_tarifa` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 400 | N/A | CERT |
| Bases de Cobro | estado(SS), moneda(SS), texto(CL) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | limit 300 | N/A | CERT |

**BLOCKED (no CERT completo hasta UI-live):** la ejecución de clicks A–J reales (cambiar filtro tras búsqueda, navegar y volver, quitar un chip individual con el mouse) requiere la app corriendo con datos. La **lógica** que gobierna esos gestos está cubierta por `filtrosActivos` + acumulación de datos; falta la confirmación visual del gesto.

## Filtro → Navigation Contract (§6)
| Origen | Destino | Filtro aplicado | Estado |
|---|---|---|---|
| Centro · QC | Recepciones | `filtroQc` (nav item QC → rechazado) | Verificado por código (Recepciones lee `vista.params.filtroQc`) |
| Centro · Órdenes en proceso | Órdenes | `filtroEstado=en_proceso` | Verificado (Ordenes lee `vista.params.filtroEstado`) |
| Centro · Pend. conciliación | Órdenes | `filtroEstado=pendiente_conciliacion` | Verificado |
| Centro · Pendientes de tarifa | Servicios (soloPendientes) | estado fijo pendiente_tarifa | Verificado (page dedicada) |
| Centro · Bases por aprobar | Bases de Cobro | sin preset (conteo=borrador+en_revision; el select es single-value) | **Corregido en F7.8** (antes navegaba solo a `borrador`, incoherente con el conteo) |
| Despachos · Preparación/Historial | Despachos | `filtroEstado=listo` / `despachado` | Verificado |

## Export parity (§7)
Ninguna de las 9 pantallas de listado de Allegria Service exporta a archivo (a diferencia de Frisku Reportes). **No se inventó exportación en F7.8** (fuera de alcance; no requerida para UAT). Si en el futuro se agrega export, el estándar obligatorio es: exportar exactamente el dataset filtrado visible (contrato heredado del incidente del otro bounded context). Documentado como GAP diferido, no defecto.

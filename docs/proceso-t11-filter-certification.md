# T11 — Certificación de filtros y navegación

**Método.** Los filtros de Allegria Service usan un componente único `ProcFilters` +
el helper puro `filtrosActivos` (lógica de chips/acumulación/reset). La certificación es por:
- **JS**: `procesoF7Domain.test.mjs` (bloque `filtrosActivos`, 8 aserciones) — AND acumulativo,
  chips activos, reset, sin chip fantasma.
- **SQL**: `proc_v7_8_filter_tests.sql` — acumulación AND server-side F1–F7 (cliente→+estado→+moneda
  estrecha sin reemplazar), sin dataset fantasma, reset, cross-tenant 0.
- **EST**: inspección del cableado por pantalla.
- **LIVE-BLOCKED**: el recorrido con clicks reales requiere la app corriendo con identidad
  autenticada; hoy la app corre como `anon` y la RLS estricta de proc_* deniega. El bridge
  DEV/UAT que permitiría la revisión visual es DEV_ONLY. **No se declara revisión live.**

## Contrato de filtros (verificado)
`A + B + C = A AND B AND C`. Un filtro nunca limpia otro no dependiente. Chips activos,
remover chip individual, reset explícito, cero resultados claro, server-side, sin dataset stale.

## Listados con filtros (cableado ProcFilters verificado por inspección)
| Pantalla | Filtros | Evidencia |
|---|---|---|
| Recepciones | cliente/estado/QC/búsqueda + (situación contractual, conciliación en detalle) | EST + F7.8 |
| Lotes | cliente/productor/predio/cuartel/especie/variedad/estado/QC (T10e server-side) | EST + T10e |
| Programa | estado/temporada | EST |
| Órdenes | estado/cliente/conciliación | EST + F7.8 |
| Producto Terminado | estado/formato | EST |
| Bodega/Pallets | estado/ubicación | EST + F7.8 |
| Despachos | estado/cliente | EST + F7.8 |
| Informes | estado | EST |
| Clientes Service | cliente/estado contractual/política/ficha | EST + T10d |
| Contratos (en Ficha) | histórico por versión | EST |
| Tarifario | especificidad/vigencia | EST + F7.7 |
| Servicios Facturables | estado/origen | EST + F7.7 |
| Pendientes de Tarifa | estado=pendiente_tarifa | EST + F7.7 |
| Bases de Cobro | estado/cliente | EST + F7.7 |
| Historial Informe Diario | estado/fecha | EST (ReporteDiario) |

## Contexto preaplicado desde Centro (navegación contextual)
Verificado en código (`CentroOperaciones.jsx` → `ir(destino, {filtro})`):
| Centro → | Destino con contexto | Evidencia |
|---|---|---|
| Recepciones/QC | recepciones (filtroQc) / recepcion_detalle | EST |
| Órdenes en proceso / pend. conciliación | ordenes (filtroEstado) | EST |
| Pallets bloqueados | bodega | EST |
| Informe sin emitir | informes | EST |
| Clientes con situación contractual | cliente_ficha (por cliente) | EST (T10d) |
| Pendientes de tarifa | pendientes | EST (T10e/F7.7) |
| Bases por aprobar | bases | EST (F7.8 nav-contract) |

## Navegación end-to-end (registro en ProcShell)
Rutas registradas y con `← Volver` / contexto (`vista/ir`): centro, recepciones, recepcion_detalle,
lote_detalle, programa, ordenes, orden, pt, bodega, pallet_detalle, repaletizaje, despachos,
despacho, informes, informe_detalle, tarifario, servicios, pendientes, bases, base_cobro_detalle,
**clientes, cliente_ficha, reportes_diario**. Sin UUID en labels (ver defectos: 1 hallazgo P2 corregido).

## Estado
Filtros y navegación: **CERTIFICADO por inspección estática + JS/SQL**. Recorrido con clicks
reales: **LIVE-BLOCKED** (identidad/RLS). Ver `proceso-t11-security-rls.md` y VISUAL QA = READY.

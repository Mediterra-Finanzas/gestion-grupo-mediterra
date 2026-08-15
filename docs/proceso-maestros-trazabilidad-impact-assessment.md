# PROC-MAESTROS-TRAZABILIDAD-001 — Impact Assessment F1–F7.8

**Estado:** diseño. Objetivo: qué cambia y qué NO en todo lo construido. Principio rector: **aditivo** (columnas nullable, RPC con params opcionales, read-models con columnas nuevas). El ledger físico (`proc_movimiento`) y la máquina de estados NO cambian.

## Matriz por componente

| Componente | CURRENT | Cambio requerido | Compatibilidad | Migración | Regresión |
|---|---|---|---|---|---|
| **F1 Recepción** (`proc_recepcion`) | origen en cabecera (productor/predio/variedad/especie) | origen de cabecera pasa a **default/prefill**, no autoridad; sin borrar columnas | Aditivo (no rompe) | Ninguna (columnas quedan) | Suite F1 intacta |
| **F1 Ledger** (`proc_movimiento`) | objeto_tipo/id, temporada, sin origen | **NINGUNO** (origen vive en el Lote) | 100% | Ninguna | Intacta |
| **F2 Lote** (`proc_lote`) | recepcion_id + especie/variedad texto | **+ FKs productor/predio/cuartel + especie/variedad→FK + `origen_snapshot jsonb`** | Aditivo (nullable) | Backfill FK desde cabecera; snapshot histórico "no informado" donde falte | Requiere re-test F2 |
| **F2 Consumo** (`proc_orden_insumo`) | orden_id, lote_id, kg, movimiento_id | **NINGUNO** (ya liga lote_id → el origen viaja con el lote) | 100% | Ninguna | Intacta |
| **F2 `ingresar_lote_ubicado`** | crea lote+movimiento+ubicación | **+ params origen + construir `origen_snapshot`** | Params opcionales → backward compatible | Ninguna | Re-test |
| **F3 Orden/Resultado** | especie/variedad texto en orden/PT | `especie_codigo`→FK (opcional al inicio) | Aditivo | Seed catálogo antes de FK | Re-test si se activa FK |
| **F3 PT/Pallet** (`proc_producto_terminado`, `proc_pallet_linea`) | genealogía por pt_id/orden_id | **NINGUNO** estructural (origen se resuelve vía lote) | 100% | Ninguna | Intacta |
| **F4 Despacho** | pallet/hold/movimiento | **NINGUNO** | 100% | Ninguna | Intacta |
| **F5 Resultado de Proceso** (`proc_informe_version.snapshot`) | snapshot packout, sin origen | Opcional: enriquecer snapshot con dimensiones de origen (no requerido) | Aditivo/opcional | Ninguna | Intacta; enriquecimiento futuro |
| **F6 Tarifario/Base de Cobro** | tarifa por especie_codigo (texto, opcional) | Opcional: `especie_codigo`→FK; sin impacto funcional | Aditivo | Ninguna | Intacta |
| **F7.1 Centro** | KPIs/excepciones | Ninguno obligatorio; opcional KPIs por dimensión | Aditivo | Ninguna | Intacta |
| **F7.2 Recepción/QC/Lotes UI** | selección plana | **UI cascada** (cliente→productor→predio→cuartel; especie→variedad) + captura por lote | Aditivo UI | Ninguna | Re-test UI |
| **F7.2 QC** (`proc_qc_parametro`) | lookup por especie_codigo texto | `especie_codigo`→FK (integridad) | Aditivo | Seed catálogo | Re-test gate QC |
| **F7.3 Producción** | orden/conciliación | Ninguno estructural | 100% | Ninguna | Intacta |
| **F7.4 PT/Bodega/Genealogía** (`pallet_genealogia`) | devuelve productor CURRENT vía recepción | **Extender**: origen desde `origen_snapshot` del lote + predio/cuartel/especie/variedad | Aditivo a la salida jsonb | Ninguna | Re-test genealogía |
| **F7.5 Despacho UI** | listado/detalle | Ninguno obligatorio | 100% | Ninguna | Intacta |
| **F7.6 Informes UI** | snapshot inmutable | Ninguno (opcional mostrar origen) | Aditivo | Ninguna | Intacta |
| **F7.6.1 Normalización** | `normalizarNombre`/`claveNormalizada` | **Reutilizar** en maestros nuevos + normalización propia de códigos oficiales | Sin cambio al helper | Ninguna | Extiende tests |
| **F7.7 Comercial** | tarifa/servicio/base | Ninguno | 100% | Ninguna | Intacta |
| **F7.8 Certificación** | 13 suites + filtros + RLS | **Re-correr** + nuevas suites de trazabilidad; filtros por nuevas dimensiones | Aditivo | Ninguna | Regresión completa obligatoria |
| **read-models `proc_v_recepcion_listado`/`proc_v_lote_listado`/`proc_v_lote_operacional`** | cliente/productor de cabecera | **Agregar** columnas predio/cuartel/especie/variedad (del lote) | Aditivo (columnas nuevas) | Ninguna | Re-test |
| **read-models F7.7** (`proc_v_servicio_facturable`, etc.) | sin origen | Ninguno | 100% | Ninguna | Intacta |
| **Filtros (ProcFilters)** | estado/qc/moneda/etc. | **Agregar** cliente/productor/predio/cuartel/especie/variedad/temporada acumulativos | Aditivo | Ninguna | Re-test filtros F7.8 |
| **UAT data (`seed_proc_DEV_UAT.sql`)** | especie/variedad texto | Extender con especies/variedades/cuarteles/relaciones | DEV only | N/A | N/A |

## Componentes con MAYOR cuidado (§F énfasis CFO)
- **`proc_recepcion`**: no perder el flujo single-origin (prefill). El origen deja de ser autoridad pero sigue siendo conveniencia.
- **`proc_lote`**: cambio central. Debe seguir cumpliendo el invariante Σ (ledger = SoT) — el origen es metadata del lote, no afecta saldos.
- **`proc_movimiento`** / **`proc_orden_insumo`**: **no se tocan** — la genealogía y el ledger permanecen; el origen viaja adjunto al lote que ya está enlazado.
- **Genealogía**: cambia solo la RESOLUCIÓN (agrega dimensiones desde el snapshot del lote); la topología (pallet→PT→orden→insumo→lote→recepción) es idéntica.
- **Snapshots**: el nuevo `origen_snapshot` del lote es análogo al snapshot F5; F5 no se toca.
- **Informes F5**: números congelados intactos; el origen es enriquecimiento opcional futuro, no un cambio del contrato F5.

## Qué NO cambia (garantías)
- Ledger `proc_movimiento`, invariante Σ líneas = saldo, máquina de estados de orden/despacho, snapshot F5 emitido, tarifario/base de cobro F6, RLS estricta productiva, bounded context (0 Frisku/`exp_*`), identidad/auth (gap aparte).

## Riesgos
1. **Integridad especie→FK**: activar la FK sobre tablas con `especie_codigo` texto histórico puede rechazar códigos huérfanos. Mitigación: seed del catálogo desde `DISTINCT especie_codigo` antes de la FK (§migración).
2. **Backfill de origen histórico**: lotes viejos no tienen cuartel/CSG. Mitigación: `origen_snapshot` con campos "no informado" (no fabricar).
3. **UI cascada vs recepción rápida**: riesgo de formulario pesado. Mitigación: copy-down/defaults por lote (§ui-ux).
4. **Volumen de la regresión**: obligatorio re-correr las 13 suites + nuevas antes de re-certificar.

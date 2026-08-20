# T11 — Reporte de trazabilidad (agrícola + comercial)

**Principio:** el origen es autoridad del **snapshot** del lote (`origen_snapshot`, congelado e
inmutable al ingreso). NUNCA se sustituye por maestros CURRENT ni se usa heurística. Evidencia
SQL en `proc_t11_uat_integral.sql` sobre la recepción multi-lote obligatoria.

## Dos dimensiones ortogonales
- **Comercial:** Cliente del Servicio → Ficha → Contrato → Recepciones / Órdenes / Servicios / Bases.
- **Agrícola:** Productor → Predio → Cuartel → Especie → Variedad → Lote → Orden → Resultado → PT → Pallet → Repaletizaje → Despacho.

El **contrato pertenece al cliente**, nunca al productor. Un cliente consolida múltiples
productores/predios/cuarteles/especies/variedades (test B/UAT: Productor A compartido por Cliente A y B).

## Genealogía BIDIRECCIONAL (verificada)
| Sentido | Ruta | Evidencia (UAT) |
|---|---|---|
| **Origen → Despacho** | Lote L1 (origen C-01/Prod A/Predio A) → Orden ORD-UAT-1 (consumo 4000) → Resultado → PT → Pallet PAL-UAT-1 → Despacho DES-UAT-1 | `proc_v_lote_origen(L1).cuartel = 'C-01'` + cadena de consumo/PT/pallet/despacho existente | **PASS** |
| **Despacho → Origen** | `proc_fn_pallet_genealogia(PAL-UAT-1)` reconstruye backward hasta el lote L1 | genealogía contiene `L1` | **PASS** |

## Snapshot de origen INMUTABLE
- Al ingreso, `proc_fn_ingresar_lote_ubicado` congela `origen_snapshot` (productor/predio/cuartel/
  especie/variedad con CSG/RUT/comuna). Trigger guard bloquea mutaciones.
- **Prueba UAT:** se renombra el cuartel CURRENT (`C-01`→`C-01-RENOMBRADO`); el snapshot del lote
  **permanece `C-01`**. El read-model `proc_v_lote_origen` prioriza el snapshot. **PASS.**

## Recepción multi-lote obligatoria (trazabilidad)
Una recepción física, tres lotes de orígenes independientes, un solo cliente comercial:
| Lote | Productor | Predio | Cuartel | Especie | Variedad | kg |
|---|---|---|---|---|---|---|
| L1 | Prod A UAT | Predio A | C-01 | Cereza | Santina | 4000 |
| L2 | Prod A UAT | Predio A | C-02 | Cereza | Regina | 3000 |
| L3 | Prod B UAT | Predio B | N-04 | Ciruela | D'Agen | 2000 |

- 3 snapshots de cuartel distintos (verificado). Cliente comercial único (A). Sin duplicación
  de recepciones (1 recepción / 3 lotes). Conciliación 9000=9000 PASS.

## Continuidad de datos (un dataset a través de todas las etapas)
El UAT integral NO reinicia entre etapas: el mismo lote L1 fluye recepción → QC → consumo →
resultado → PT → pallet → despacho, y el mismo cliente A aparece en el Informe Diario con
9000 recibidos / 4000 procesados (consumo real). Esto certifica que los módulos operan como
**un solo producto**, no como piezas aisladas.

## Reglas respetadas
- Sin heurísticas. Snapshot = autoridad histórica. Cliente ≠ productor. Especie del LOTE determina
  parámetros QC obligatorios (L3=Ciruela evaluado contra parámetros PLU). QC rechazado conserva
  existencia física. Genealogía relacional (no cache).

# Megasystem — Source Adapter Track

## Estado
**Discovery — no bloqueante para OA-024-09**
Primera tarea: cuando Angelo confirme qué empresas usan Megasystem y envíe muestra de exportación.

---

## Preguntas abiertas (requieren CFO)

| # | Pregunta | Impacto |
|---|---|---|
| 1 | ¿Qué empresas del grupo usan Megasystem? | scope del adapter |
| 2 | ¿Qué módulos están activos? (GL, CC, auxiliares) | capability set |
| 3 | ¿Cuál es el formato de exportación disponible? (XLS, CSV, XML, API) | parser design |
| 4 | ¿El Balance exportado es trial balance (débito/crédito) o saldo neto? | mapeo de columnas |
| 5 | ¿El EERR exportado es por período o acumulado? | report_type |
| 6 | ¿Existen centros de costo en los reportes? | granularidad CC |
| 7 | ¿Hay plan de cuentas exportable? | chart mapping |
| 8 | ¿Los identificadores de cuenta son estables entre períodos? | lineage reliability |
| 9 | ¿Periodicidad de cierre? (mensual, trimestral) | frecuencia de ingesta |
| 10 | ¿Hay dimensiones agrícolas nativas? (campo, cuartel, especie) | agricultural extension |

---

## Arquitectura objetivo

```
Megasystem Export (XLS/CSV)
       ↓
MegasystemAdapter.js     ← mismo patrón que ContecAdapter.js
  parseBalanceMegasystem()
  parseEerrMegasystem()
  aggregateToCanonical()
  validateAggregateInvariant()
  detectReportType()
  buildMappingIssues()
       ↓
PostingPipeline.js       ← SIN CAMBIOS — misma interfaz
  runPreflight()
  runIngest()
  approveAndPost()
       ↓
fn_acc_post_batch()      ← SIN CAMBIOS — agnostic al source
       ↓
acc_* tables             ← SIN CAMBIOS
```

**Principio:** el PostingPipeline es agnóstico al source. Solo cambia el adapter.

---

## Requerimientos mínimos para iniciar MegasystemAdapter

1. Muestra real de exportación Balance (un mes)
2. Muestra real de exportación EERR (un mes)
3. Mapa de columnas del archivo

No implementar basado en supuestos. Esperar muestras reales.

---

## NO hacer

- Lógica específica de Megasystem dentro de PostingPipeline.js
- Tabla separada fuera del modelo acc_*
- Segunda contabilidad paralela
- Importar antes de tener mappings chart completos para la entidad

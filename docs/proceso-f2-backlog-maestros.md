# proc_* — Backlog F2+ : maestros propios diseñados (preservados de la reconciliación)

**Fecha:** 2026-08-13 · **Worktree:** `worktree-proc-fase1`
**Origen:** contenido único detectado en el borrador no canónico de `main` durante la verificación de no-pérdida previa a su eliminación. Estos maestros son **propios de `proc_*`** (② dominio Service) y estaban en el diseño F1 §3, pero pertenecen a **fases F2+** (no los requiere la raíz F1: recepción/lote/ledger). Se preservan aquí como **backlog** para no perder el diseño; **NO** se agregan al schema F1 (disciplina de alcance: fundaciones, no front-loading).

> Cuando la fase que los necesita los materialice, seguirán el patrón F1 estándar: `id UUID PK`, `empresa_id UUID NOT NULL`, `created_by/updated_by`, `created_at/updated_at` (trigger touch), `deleted_at` (soft-delete), `UNIQUE(empresa_id, codigo)`, RLS `FORCE` por empresa + `REVOKE anon`, trigger de auditoría, y DEV-ONLY separado. Son proc-owned; NO duplican maestros corporativos.

| Maestro | Fase que lo necesita | Columnas clave (además del patrón estándar) |
|---|---|---|
| `proc_ubicaciones` | **F2** (inventario pre-proceso) | `planta_id` FK, `parent_id` self-FK (planta→zona→ubicación), `codigo`, `nombre`, `tipo ∈ {camara,zona,ubicacion,patio}`, `activa`. Reemplaza el `proc_lote.ubicacion` textual de F1 |
| `proc_condiciones` | **F2** (QC recepción) | `codigo`, `nombre`, `ambito ∈ {recepcion,qc,proceso}` |
| `proc_lineas_proceso` | **F3** (orden de proceso) | `planta_id` FK, `codigo`, `nombre`, `activa` |
| `proc_categorias_calidad` | **F4** (resultado de proceso) | `codigo`, `nombre`, `es_comercial` (exportable/nacional vs descarte/desecho), `orden` |
| `proc_motivos_descarte` | **F4** (resultado) | `codigo`, `nombre` |
| `proc_motivos_merma` | **F4** (resultado) | `codigo`, `nombre` |
| `proc_materiales` | **F4/F5** (materiales de embalaje) | `codigo`, `nombre`, `categoria`, `unidad`, `origen_suministro ∈ {operador,cliente,packing_tercero}`, `costo_ref`, `stock_minimo`, `activo` |
| `proc_tipos_servicio` | **F9** (tarifario / servicios facturables) | `codigo`, `nombre`, `unidad ∈ {kg,caja,pallet,hora,servicio,bin}`, `activo` |

## Nota de identidad — `contab_auxiliares` CURRENT vs TARGET (preservada del borrador §6)

- **CURRENT:** `contab_auxiliares` está scoped por `empresa_id` → es un **maestro contable por empresa**, no aún una identidad canónica única del Grupo. Riesgo: un mismo productor podría existir varias veces (auxiliar de Foods, de Service, uso contable) como "personas" distintas.
- **TARGET (owner Core, no bloquea F1/F2):** identidad canónica única de contraparte, reutilizable por múltiples empresas y bounded contexts.
- **Regla para `proc_*`:** `proc_vinculo` referencia la identidad por su `id` corporativo (sin copiarla). Cuando Core normalice a un maestro canónico, la migración será **re-apuntar la referencia**, no de-duplicar datos. `proc_*` **no** se acopla estructuralmente a la duplicidad actual.

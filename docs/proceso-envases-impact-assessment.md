# PROC-ENVASES-001 · Impact Assessment (B28)

Estado: DISEÑO. NO materializado. Determina qué cambia y qué NO al introducir el control de envases.
Principio rector: **aditivo**. El control de envases es un ledger paralelo; no altera la semántica física del ledger de fruta ni la conciliación de masa.

| Área | ¿Cambia? | Detalle |
|---|---|---|
| **`proc_movimiento` (ledger fruta)** | **NO** | Los envases usan `proc_envase_movimiento` propio. Nunca se suma un bin como kg. Conciliación de masa, saldos de lote y genealogía quedan intactos. |
| **Recepción** | Aditivo, opcional | Nueva sección "Envases recibidos" (tipo/cantidad/propietario) → genera movimientos de envase con `ref_tipo=recepcion`. Si no hay envases, no aparece. La creación de recepción y su fecha operacional (T10C) no cambian. |
| **Lotes** | **NO** | El origen agrícola, snapshot y QC del lote no dependen de envases. |
| **Bodega / Pallets** | **NO** (v1) | Pallets de PT siguen su propio inventario. Un "pallet retornable" como envase se modela en el ledger de envases, separado del pallet de producto. |
| **Despacho** | Aditivo, opcional | Sección "Envases entregados/devueltos" en el despacho (`ref_tipo=despacho`) **y** operación independiente "Movimiento de envases" sin despacho de fruta. El despacho de PT no cambia. |
| **Cliente Service / Productor / Exportadora** | Reutiliza identidad | Owner y contraparte vía `proc_vinculo` (roles existentes: cliente_servicio, productor, exportadora, transportista). No se crea padrón nuevo. Foods como Cliente Service = un `proc_vinculo`, nunca `exp_*`. |
| **Configuración** | Aditivo | Nuevo maestro "Tipos de Envase" (mismo patrón data-driven que Tipos de Documento Contractual). Ubicaciones de envase se agregan al maestro de ubicaciones existente (reuso). |
| **Centro de Operaciones** | Futuro, no ahora (B20) | El modelo deja lugar para tiles: envases pendientes de devolución, saldo vencido, diferencias de conciliación, dañados. No se agregan en este bloque. |
| **Reporting Daily (PROC-REPORTING-DAILY-001)** | Compatible, no ahora (B24) | El informe diario NO incorpora envases en su primera versión. El ledger de envases con `fecha` operacional (misma tz canónica America/Santiago) permite agregar después "movimientos de envases del día" o "saldos críticos" sin rediseñar la capability. No se retrasa Reporting Daily por envases. |
| **Contabilidad / cobro** | No asumir (B28) | Los envases **no son facturables por defecto**. Pérdida/daño podría derivar en cobro futuro (ENV-D9), pero es decisión separada; el modelo lo permite sin acoplarlo. |
| **Tenancy / RLS** | Nace estricto | `proc_envase_*` tenant-scoped, RLS `empresa_id=proc_current_empresa()`, anon DENY, auditado — igual que el resto de `proc_*`. |
| **Concurrencia** | Nuevo requisito | Salidas que exigen saldo requieren lock/validación backend (B26). No afecta otros módulos. |

## Dependencias estructurales reales (bloqueantes) — ninguna

No hay dependencia estructural que obligue a materializar envases antes de cerrar Visual QA o Reporting Daily. Es una capability aditiva e independiente.

## Riesgos a vigilar

1. **No contaminar el ledger de fruta**: la tentación de reusar `proc_movimiento` con `objeto_tipo='envase'` rompería la invariante Σ movimientos = kg físico. Rechazado por diseño (ledger propio).
2. **Dirección del saldo (B16)**: "nos deben" vs "les debemos" son posiciones distintas; un modelo que colapse owner/holder en un solo signo dará saldos incorrectos.
3. **Owner vs holder (B3)**: modelar propiedad y ubicación como lo mismo produciría respuestas erróneas a "¿de quién son?" vs "¿quién los tiene?".
4. **Serialización latente (ENV-D1)**: si aparece requerimiento de barcode por unidad después, migrar de cantidad a serial es estructural — por eso se eleva antes, no se asume.

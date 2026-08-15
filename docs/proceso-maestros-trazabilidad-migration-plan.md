# PROC-MAESTROS-TRAZABILIDAD-001 — Plan de Migración (diseño)

**Estado:** diseño. Principio: **aditivo, sin destruir datos CURRENT, sin fabricar historia**. Cada paso es reversible y validable en Postgres efímero antes de cualquier aplicación. NO se materializa hasta autorización.

## Estrategia general
- Todas las columnas nuevas son **NULLABLE** al inicio → no rompen inserts CURRENT.
- Las FK de integridad (especie/variedad) se activan **después** de sembrar el catálogo desde los valores existentes.
- El origen histórico desconocido queda **explícitamente "no informado"**, nunca inventado.
- Cada fase: aplica → corre regresión F1–F7.8 + nuevas suites → RLS anon-deny → sigue.

## Fases (orden de aplicación)

### Fase 1 — Catálogos y maestros (sin tocar Lote)
1. `proc_especie` (crear) + seed desde `SELECT DISTINCT especie_codigo` de recepción/lote/orden/PT (mapear a nombre conocido: CHE→Cereza, PLU→Ciruela, ARA→Arándano…; los no reconocidos entran con nombre = código y flag "revisar").
2. `proc_variedad` (crear, FK→especie) + seed desde `DISTINCT (especie_codigo, variedad_codigo)`. Variedades con especie no mapeable → cuarentena (no se insertan con FK inválida; se listan para revisión manual).
3. `proc_predios`: `ALTER ADD` csg_sag, comuna, superficie_ha, activo (default true).
4. `proc_vinculo`: `ALTER ADD` rut, csg_sag (nullable).
5. `proc_cliente_productor` (crear, N:M).
6. `proc_cuartel` (crear, FK→predio/especie/variedad).
7. RLS estricta + policies en las tablas nuevas; grants a `authenticated`; `REVOKE anon`.
8. **Sin backfill de relaciones cliente↔productor**: se poblan desde la operación / carga manual (no se infieren de recepciones históricas para no crear relaciones falsas; opcional: sugerencia derivada de recepciones como borrador, NO como verdad).

### Fase 2 — Origen en el Lote (cambio central)
1. `proc_lote`: `ALTER ADD` productor_vinculo_id, predio_id, cuartel_id (FK, nullable); `origen_snapshot jsonb` (nullable). Convertir especie_codigo/variedad_codigo en FK **diferido** (validar antes).
2. `proc_fn_ingresar_lote_ubicado`: nueva firma con params de origen opcionales; construye `origen_snapshot` desde los maestros al momento del ingreso. Sin params → comportamiento CURRENT (compat).
3. **Backfill de lotes existentes** (no destructivo):
   - `productor_vinculo_id`, `predio_id` ← copiar desde la **cabecera de su recepción** (`proc_recepcion.productor_vinculo_id`, `predio_id`) donde exista.
   - `especie_codigo`/`variedad_codigo` ← ya están en el lote (texto) → mapear a FK si el catálogo los tiene; si no, dejar el texto + flag y NO forzar FK aún.
   - `cuartel_id` ← **NULL** (no existía; no se fabrica).
   - `origen_snapshot` ← construir desde los maestros CURRENT + marcar `"cuartel": "no informado"`, `"csg_*": null` donde falte, y `"origen_reconstruido": true, "reconstruido_at": <fecha migración>` para señalar que es reconstrucción, no captura al ingreso.

### Fase 3 — Integridad especie/variedad (activar FKs)
Una vez el catálogo cubre todos los códigos vivos: activar FK `especie_codigo`→`proc_especie` y `variedad_codigo`→`proc_variedad` en lote/recepción/orden/PT/programa/calibre/color/qc_parametro/cuartel. Si quedan huérfanos → NO activar la FK en esa tabla; reportar los códigos a limpiar. Integridad en backend (no solo UI).

### Fase 4 — Genealogía + read-models + filtros
1. `proc_fn_pallet_genealogia`: resolver origen desde `origen_snapshot` del lote (fallback a FK CURRENT si snapshot null en lotes viejos).
2. Read-models: `proc_v_recepcion_listado`/`proc_v_lote_listado`/`proc_v_lote_operacional` + columnas predio/cuartel/especie/variedad. Nuevos read-models de origen si hacen falta para filtros/reportes.
3. Filtros server-side por las nuevas dimensiones (contrato F7.6.1/F7.8).

### Fase 5 — UI (cascada) + seed DEV
UI de Nueva Recepción / Detalle / Configuración (cuartel, especie, variedad, predio, cliente↔productor) + cascada. Extender `seed_proc_DEV_UAT.sql`.

## Tratamiento de registros históricos (G)
| Caso histórico | Tratamiento |
|---|---|
| Especie/variedad texto | Mapear a catálogo donde coincida (por código); si no, mantener texto + flag "revisar", sin romper |
| Productor/predio en cabecera | Copiar al lote como FK CURRENT (mejor esfuerzo) |
| Cuartel inexistente | `origen_snapshot.cuartel = "no informado"` — **nunca fabricar** |
| CSG desconocido | `null` en snapshot; se completa a futuro sólo por captura real |
| Relación cliente↔productor histórica | No se infiere como verdad; opcionalmente se ofrece como sugerencia/borrador |

**Regla dura:** el `origen_snapshot` reconstruido lleva `"origen_reconstruido": true` para distinguir lo capturado-al-ingreso de lo reconstruido-en-migración. Auditoría honesta.

## Reversibilidad
- Fases 1–2: `DROP` de tablas nuevas + `ALTER DROP COLUMN` de las columnas nuevas (nullable, sin datos productivos si se revierte pronto) → vuelve a CURRENT. Documentar bloque ROLLBACK por fase.
- FK de integridad (Fase 3): `DROP CONSTRAINT` restaura el texto libre.
- Genealogía/read-models (Fase 4): `CREATE OR REPLACE` a la versión previa.

## Compatibilidad con DEV/UAT bridge (F7.8.1-D)
El bridge `schema_proc_f7_8_1_DEV_ONLY_visual_uat.sql` es dinámico (loop sobre `proc_%`) → cubre automáticamente las tablas nuevas para la revisión visual local, sin cambios. El seed DEV se extiende en Fase 5.

## Gate de validación por fase (obligatorio antes de avanzar)
Cadena v1→v7.7 + fase N en Postgres efímero, `ON_ERROR_STOP=1`; regresión 13 suites + nuevas suites de trazabilidad; RLS anon-deny sobre tablas/vistas nuevas; 0 deps `exp_*`/`frisku_*`; build CI=true. Ninguna fase avanza con regresión roja.

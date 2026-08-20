# T10 — UI de Trazabilidad Agrícola + Ficha/Contrato (progreso)

Consume el backend T1–T9 VALIDATED (`schema_proc_v8_*`). Dirección visual F7.6.1 (premium operacional). Commits atómicos por sub-bloque.

## T10a — Capa DB (`82f047e`) ✅
Wrappers en `procesoF7DB.js`/`procesoF2DB.js`: loaders de cascada, read-models (`proc_v_lote_origen`, `proc_v_cliente_contractual`), gates (`estadoContractualCliente`, `clienteHabilitadoParaOperar`), genealogía extendida, ficha/contrato, `ingresarLoteUbicado` con origen. Build OK.

## T10b — Configuración / Maestros con cascada ✅ VALIDATED
### MaestroEditor extendido (API genérica reusable, sin hacks por tabla)
Nuevo tipo de campo **`ref`**: `{ tabla, value, label, filter?, dep?, depMatch? }`.
- **Opciones dinámicas** desde el maestro fuente (cargado una vez por tabla); `filter` acota (ej. rol); `label` puede ser función (normaliza nombre + "· CSG").
- **Cascada** vía `dep`/`depMatch`: el select hijo se filtra por el valor del padre y queda **disabled** hasta tener contexto (con hint "Elegí primero …").
- **Limpieza de dependencias**: al cambiar un padre se limpia SOLO el/los hijos incompatibles (recursivo), no campos ajenos.
- **Campos `virtual`** (ej. `_productor` en Cuartel): sólo-UI para filtrar la cascada, **no se guardan** en el payload.
- **Columnas ref** resueltas a label (nunca UUID crudo) vía `labelRef`.
- **Filtros** por maestro (`ProcFilters`): búsqueda + selects ref, acumulativos, chips, reset.

### Maestros expuestos
| Maestro | Cascada | Filtros |
|---|---|---|
| **Especies** | — | búsqueda |
| **Variedades** | Especie → Variedad | búsqueda, Especie |
| **Predios / Huertos** | Productor → Predio | búsqueda, Productor |
| **Cuarteles** | Productor→Predio; Especie→Variedad | búsqueda, Predio, Especie |
| **Cliente ↔ Productor** | — (N:M) | búsqueda, Cliente, Productor |

Normalización F7.6.1: nombres → `normalizarNombre`; **códigos/CSG/RUT no** se pasan por Title Case. Dedup por clave normalizada + sugerencia no destructiva. Integridad Especie→Variedad / Predio→Productor la impone el backend (T1/T2).

### Helpers puros (testeables)
`opcionesRef`, `limpiarDependencias`, `labelRef` en `procesoF7Domain.js`.

### Verificación
- Dominio JS **80/80** (incluye 10 tests de cascada: opciones filtradas por especie, sin-dep→vacío, filtro por rol, cambiar especie limpia variedad, no toca ajenos, labelRef resuelve). Cubre §15 H/I/L/M + lógica de D-G/J-K.
- Integridad backend (§15 C: variedad de especie incorrecta → rechazo) = T1/T5b (ya validado en PG16).
- **Build `CI=true` → Compiled successfully.**

## T10c — Nueva Recepción multi-lote + cascada + alerta contractual ✅ VALIDATED (build/unit; live pendiente)
### Nueva Recepción (reescrita)
- **Dos bloques**: A) Recepción (cliente del servicio, transportista/patente/guía, pesos bruto/tara/neto, especie principal para QC) · B) **Lotes / origen agrícola por lote**.
- **Multi-lote**: 1 recepción → N lotes; cada lote con cascada **Productor→Predio→Cuartel** y **Especie→Variedad** + kg + ubicación inicial. Secuencia atómica preservada: crear recepción (correlativo backend) → cada lote por RPC `ingresar_lote_ubicado` (lote + `origen_snapshot` + movimiento + ubicación). Fallo parcial: los lotes ingresados persisten; reintento no duplica (correlativo nuevo). El snapshot lo genera el **backend** (T4), no React.
- **Cascada Cliente→Productor**: al elegir cliente, los productores relacionados (`proc_cliente_productor`) van primero (marcados "· relacionado"); se mantiene flexibilidad (todos disponibles).
- **Cuartel autocompleta** especie/variedad default (ayuda; la historia se congela en el snapshot).
- **Alerta contractual** inmediata al elegir cliente (`estado_contractual_cliente` T8): badge (tono por nivel) + texto + explicación. **Regla CFO**: "Registrar recepción" **NUNCA se deshabilita** aunque el nivel sea bloqueante (la fruta física siempre se registra; el gate afecta el avance).
- **Preview de masas**: peso neto vs Σ kg de lotes → pendiente por asignar / exceso (preview UX; sin constraint nueva). **Resumen**: N lotes / productores / predios / cuarteles / kg.
### Detalle Recepción
- Cabecera comercial/logística + **alerta contractual** del cliente + tabla **Lotes/orígenes** (Productor/Predio/Cuartel/Especie/Variedad/Ubicación/Estado — multi-origen evidente). Merge origen (`proc_v_lote_origen`) + estado (raw).
### Detalle Lote
- Sección **"Origen agrícola (registrado al ingreso)"**: Cliente (comercial, separado) · Productor+CSG · Predio+CSG · Cuartel · Especie · Variedad — desde `proc_v_lote_origen` + `origen_snapshot`. Marca **"origen reconstruido"** si aplica (§24). Snapshot = default (histórico inmutable).
### Filtros
- Lotes: filtro **Especie** (client-side sobre el listado) + QC + búsqueda. Predio/Cuartel filtros server-side quedan para cuando el listado use `proc_v_lote_origen` (gap documentado).
### Helpers + tests
- `resumenKgLotes`/`resumenOrigenes`/`tonoContractual`/`copiarOrigen` puros. **Dominio 96/96** (incluye §27 H/I/J/K/L/M/C). **Build CI=true OK.** Solo frontend.
- **Gap**: revisión live no ejecutada (requiere re-provisionar el stack DEV con schema T1-T9 + reseed); se hará en Visual QA final (§54).

## T10c.1 — Gate QC granularidad + Conciliación de masa ✅ VALIDATED (backend PG16)
Ver `docs/proceso-t10c1-qc-masa-gate.md`. Dos bloques aditivos:
- **T10c-QC** (`c17eb62`): QC por lote (`proc_qc_recepcion.lote_id`), elegibilidad por lote con fallback header y **especie del lote** (corrige bug multi-especie); `registrar_qc(p_lote?)` compat 4-arg; read-model resumen. Gate PG16 + RLS verde.
- **T10c-MASA**: recepción en `borrador` → `proc_fn_cerrar_recepcion` concilia Σ kg (ledger) vs `kg_neto` ± `tolerancia_recepcion_pct` → `recibida`; sin forzar cierre. Read-model `proc_v_recepcion_conciliacion`. UI: Nueva Recepción + RecepcionDetalle con bloque de conciliación y "Finalizar recepción". MASS-1..9 + concurrencia + RLS verde; build OK.

## T10d — Ficha Cliente Service + Contrato + gate + QC por lote UI ✅ VALIDATED (backend PG16 + build)
Read-model `schema_proc_v8_t10d.sql`: `proc_v_cliente_servicio` (vínculo cliente + ficha + estado contractual backend + contrato vigente + agregados n_contratos/n_vigentes/n_pendiente_firma/n_vencidos), security_invoker.
- **Ficha Cliente** (`Clientes.jsx` listado + `ClienteFicha.jsx`): identidad (Core), relación Service (ficha CRUD), contratos versionados (historial completo, badges por estado, transiciones espejo del guard T7, firmar→vigente), alerta contractual principal (icono+badge+texto+acción, no solo color), trazabilidad comercial (productores/recepciones/órdenes/servicios/bases). Cliente≠productor. Normalización F7.6.1. Filtros ProcFilters acumulativos (cliente/estado contractual/política/ficha).
- **Documento**: `procStorage.js` bucket privado `proc-docs` + signed URL temporal (nunca URL pública); solo se persiste `documento_path`; versiones históricas se conservan. Cargar documento ≠ firmar (estado inicial borrador/pendiente_firma; vigencia sólo con firma).
- **Gate contractual** (backend autoridad `proc_fn_cliente_habilitado_para_operar`): Orden (bloquea avance a `en_proceso` con mensaje humano) + Programa (bloquea generar orden) + Centro ("Clientes con situación contractual", prioriza bloqueante>vencido>pendiente firma>advertencia). Recepción física SIEMPRE registrable.
- **QC por lote UI** (deuda T10c.1 cerrada): `QcPanel` acepta `loteId` y registra `registrar_qc(p_lote)`; `RecepcionDetalle` muestra QC por lote (tabla) + editor por lote + fallback header. Helper puro `qcPorLote`.
- **Fixtures legacy F7.2-F7.6**: siembran catálogo especie/variedad (FK cutover T5b) — **no relajan el FK**; regresión completa vuelve VERDE sin exclusiones.
- Verificación: dominio JS **120/120**; build `CI=true` OK; PG16 regresión completa (27/27) + T10d C1-C16/C19/C20 + RLS/tenant (anon DENY vista+ficha+contrato, aislamiento A/B, cross-tenant). Contrato de integración `proceso-reporting-daily-001-contrato.md` (reservado).

## T10e — Cierre operacional UI + filtros + alertas + prep UAT ✅ VALIDATED (backend PG16 + build)
Read-model `schema_proc_v8_t10e.sql` (aditivo/correctivo, security_invoker):
- **Corrige defecto de T10c-QC**: `proc_v_lote_listado` y `proc_v_recepcion_listado` unían `proc_qc_recepcion` por recepción sin `lote_id` → **multiplicaban filas** con QC por lote + header y el `qc_resultado` quedaba ambiguo. Se resuelve el QC por LOTE (propio → fallback header) vía LATERAL (`IS NOT DISTINCT FROM`, nunca NULL). Una sola fila por lote / por recepción.
- **proc_v_lote_listado** ahora expone origen a nivel LOTE (productor/predio/cuartel snapshot-aware) + ids filtrables (`cliente_vinculo_id`, `productor_vinculo_id`, `predio_id`, `cuartel_id`) + `origen_reconstruido`.
- **proc_v_recepcion_listado** agrega `cliente_servicio_vinculo_id`, resumen QC por lote (`qc_aprobados/rechazados/condicional/con_qc/qc_mixto` — conteos, sin veredicto global inventado), `masa_dentro_tolerancia` (T10c-MASA) y `nivel_contractual` (T8).
- **Lotes** (`Lotes.jsx`): 8 filtros **server-side** acumulativos (cliente/productor/predio/cuartel/especie/variedad/estado/QC) + búsqueda; opciones desde maestros. **Recepciones** (`Recepciones.jsx`): filtros cliente/estado/situación contractual/conciliación masa/QC + columnas resumen QC por lote y masa. **RecepcionDetalle**: resumen QC ejecutivo (total/aprobados/rechazados/condicional/pendientes + "QC mixto"). Helper puro `resumenQcRecepcion`.
- **UUIDs visibles eliminados** (E15): InformeDetalle (fuente → "Ver orden →"), Orden (fallback lote → "—"), PalletDetalle (PT → barcode vía `cargarPtCodigos`). **0 `capitalize`, 0 `toLocale/toFixed` ad-hoc** (removido el último en `resumenConciliacion`).
- **Storage runbook** `proceso-storage-proc-docs-runbook.md` (provisión bucket privado `proc-docs`).
- Verificación: dominio JS **126/126**, format 31/31, PDF 12/12; build `CI=true`; PG16 regresión **28/28** (F1-F7.7 + T1-T9 + QC + MASA + T10d + T10e) + test T10e (no-multiplicación, QC por lote, origen a nivel lote, filtros, nivel contractual) + RLS anon-deny en vistas modificadas.

**VISUAL QA READY** (revisión live pendiente de sesión con datos). PROC-REPORTING-DAILY-001 sigue reservado e intacto.

Luego: PROC-REPORTING-DAILY-001; T11 UAT integral; retomar Visual QA (hoy NO).

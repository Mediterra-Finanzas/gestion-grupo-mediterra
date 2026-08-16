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

## Pendiente de T10
- **T10d** Ficha Cliente + Contrato (pantallas) + estados de documento + alertas/gates transversales.
- **T10e** filtros/read-models restantes (predio/cuartel server-side).
- **QC por lote en UI** (QcPanel por lote + resumen en cabecera): el backend ya lo soporta (`registrar_qc(p_lote)`); la UI actual aún registra QC a nivel header (compat). Pendiente para T10d/e.

Luego: PROC-REPORTING-DAILY-001; T11 UAT integral; retomar Visual QA (hoy NO).

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

## Pendiente de T10
- **T10c** Nueva Recepción multi-lote + cascada de origen + alerta contractual.
- **T10d** Detalle Recepción / Lote (origen snapshot vs CURRENT) + genealogía visual.
- **T10e** Ficha Cliente + Contrato (pantallas) + estados de documento.
- **T10f** Alertas/gates en Recepción/Programa/Orden/Centro.
- **T10g** Filtros nuevos en listados operacionales.

Luego: PROC-REPORTING-DAILY-001; T11 UAT integral; retomar Visual QA (hoy NO).

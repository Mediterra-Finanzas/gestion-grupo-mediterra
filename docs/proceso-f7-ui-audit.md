# Auditoría UI — Allegria Service (F7.6.1)

Inventario del estado de consistencia visual/datos tras la fase. Honesto sobre lo cubierto y la deuda restante.

## 1. Normalización de nombres

| Ítem | Estado |
|---|---|
| Función canónica única (`normalizarNombre`) | ✅ `format.js`, 28 tests |
| Dedup por clave normalizada en escritura | ✅ Configuración (maestros) bloquea duplicados |
| Sugerencia "¿quisiste decir…?" (sin auto-merge) | ✅ Configuración, confirm no destructivo |
| Display normalizado en listados | ✅ Recepciones, Lotes, Bodega, Órdenes, Despachos (cliente/productor/destinatario) |
| Display normalizado en pantallas de detalle | ⚠ deuda — los detalles muestran el nombre tal cual del vínculo (ya normalizado en origen si se guardó post-F7.6.1) |
| `text-transform: capitalize` en CSS | ✅ 0 ocurrencias |
| `nombre_legal` vs `nombre_display` | 📋 propuesto, NO migrado (decisión de arquitectura) |
| Snapshot histórico F5 | ✅ intacto, no se retro-normaliza |

## 2. Filtros

| Ítem | Estado |
|---|---|
| Componente estándar `ProcFilters` | ✅ base.jsx |
| Chips de filtros activos + reset explícito | ✅ |
| Server-side sobre read-models | ✅ estado/QC/planta viajan a PostgREST |
| Migración de listados | ✅ Recepciones, Lotes, Bodega, Órdenes, Despachos |
| Informes (bandeja de 2 tabs, selección múltiple) | ➖ excepción documentada (no es listado filtrable) |

## 3. Formateadores

| Ítem | Estado |
|---|---|
| Helpers canónicos (`formatKg/Num/Pct/Moneda/Fecha/FechaLarga/FechaHora`) | ✅ format.js |
| `toLocaleDateString`/`toLocaleString`/kg inline en `pages/` | ✅ **0 remanentes** (25 sitios migrados en 11 pantallas + 5 listados) |
| `ProcAuditInfo` con `formatFechaHora` | ✅ |
| Convención es-CL (miles `.`, decimal `,`, null → `—`) | ✅ uniforme |

## 4. Arquitectura visual

| Ítem | Estado |
|---|---|
| Sidebar persistente + context-bar | ✅ (previo, se mantiene) |
| Tabla con encabezado sticky | ✅ `ProcDataTable` |
| Excepciones-first (Centro) | ✅ (previo) |
| Paleta sobria por tokens (theme.js) | ✅ |
| Componentes compartidos sin dominio | ✅ base.jsx neutral |

## 5. Verificación

- **Tests JS:** format 28/28 · dominio 43/43 · PDF data 12/12 = **83/83** ✅
- **Build:** `CI=true npm run build` → **Compiled successfully** (1,06 MB gzip) ✅
- **Revisión visual en vivo:** **no ejecutada** — requiere login a la app + un tenant con datos `proc_*` reales, no disponible en este entorno. Declarada honestamente pendiente (no se sustituye por preview estático; la fase no se cierra visualmente solo por build). Recomendado: Angelo abre Allegria Service y valida sidebar/tablas/filtros/nombres en Recepciones, Lotes, Bodega, Órdenes y Despachos.

## 6. Deuda priorizada (próximas iteraciones)

1. Aplicar `normalizarNombre` en pantallas de **detalle** (Despacho, Orden, PalletDetalle, RecepcionDetalle, LoteDetalle, InformeDetalle) donde se muestran nombres de tercero.
2. Revisión **responsive** de planta (tablet) pantalla por pantalla.
3. Migración de datos existentes: correr `normalizarNombre` sobre maestros ya cargados (script one-off) para limpiar históricos, no solo nuevos.
4. Decisión `nombre_legal` / `nombre_display` si se requiere razón social formal en documentos.

## 7. Frontera respetada

Sin cambios en ledger, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, tenancy/RLS, tarifario, snapshot histórico ni bounded context. Todo en `worktree-proc-fase1`. Sin merge, sin deploy, sin producción. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`.

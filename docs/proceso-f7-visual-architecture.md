# Arquitectura Visual — Allegria Service (F7.6.1)

**Ámbito:** capa de presentación de `proc_*` (`src/proceso/ui/`). No cambia lógica operacional F1–F7.6 (ledger, ownership, genealogía, RLS, tarifario, snapshot histórico intactos). Solo estilos, componentes compartidos y consistencia de datos visibles.

## 1. Dirección de diseño: software operacional premium

Sobrio, denso, profesional. Prioriza claridad y velocidad de lectura para una planta operando, no adornos. Referencias mentales: consolas de operación (no dashboards de marketing).

- **Sidebar persistente** + **header/context-bar compacto** (empresa/planta/temporada/fecha).
- **Alta densidad con jerarquía clara**: tablas legibles, tipografía consistente, números alineados a la derecha.
- **Excepciones primero**: el Centro de Operaciones muestra lo que requiere atención antes que lo que está bien.
- **Paleta sobria** (`theme.js`): primario `#1E2761`, acento `#D4A574`, tonos semánticos (success/warning/danger/info) para estados y severidades.

## 2. Capas de la UI

```
theme.js  (tokens: color, tipografía, sombra, espacio)
   └─ estilos.js  (C, TONO, sp — consumidos por todo componente)
        └─ components/base.jsx  (presentacionales, sin dominio)
        └─ format.js            (normalización + formateo canónico)
             └─ pages/*.jsx      (pantallas: UI delgada sobre core/procesoF7DB + read-models)
```

- **UI delgada.** Toda invariante vive en la DB (ledger SoT, genealogía, conciliación, RLS, tenant). React no crea una segunda verdad; lee `proc_v_*` y llama RPC.
- **Componentes neutrales.** `base.jsx` no conoce Frisku ni `exp_*`. Los terceros (cliente/productor/destinatario) vienen de `proc_vinculo`.

## 3. Componentes compartidos (base.jsx)

`ProcButton, ProcStatusBadge, ProcCard, ProcPageHeader, ProcKpiCard, ProcLoadingState, ProcEmptyState, ProcErrorState, ProcDataTable, ProcExceptionList, ProcModal, ProcField, ProcConfirmAction, ProcAuditInfo, ProcToast` y **nuevos en F7.6.1**: `ProcFilters` (barra de filtros estándar).

### Cambios visuales F7.6.1
- **Tabla premium:** `ProcDataTable` con **encabezado sticky** (`position: sticky; top: 0`) — el header no se pierde al hacer scroll en listados largos; fondo propio para no transparentar filas debajo.
- **Filtros unificados:** `ProcFilters` (ver `proceso-f7-filter-standard.md`).
- **Auditoría con formato canónico:** `ProcAuditInfo` usa `formatFechaHora` (dd-mm-yyyy HH:MM) en vez de `toLocaleString` inconsistente.

## 4. Formateadores canónicos (format.js)

Un solo lugar para presentar datos (los números conservan precisión; solo cambia la presentación):

| Helper | Salida | Uso |
|---|---|---|
| `formatNum(n, dec)` | `125.400` | cantidades, cajas, kg sin unidad |
| `formatKg(n)` | `9.800,5 kg` | pesos con unidad |
| `formatPct(fraccion, dec)` | `79,6%` | packout, coberturas |
| `formatMoneda(n, mon)` | `USD 1.250,00` | montos |
| `formatFecha(d)` | `14-08-2026` | fechas en tablas |
| `formatFechaLarga(d)` | `14 ago 2026` | encabezados |
| `formatFechaHora(d)` | `14-08-2026 10:30` | auditoría |

Convención Chile: separador de miles `.`, decimal `,`. Nulls → `—`. Se reemplazó el `toLocaleDateString`/`toLocaleString`/formato de kg inline disperso por estos helpers en las pantallas migradas.

## 5. Navegación

Por estado (`vista.page` + `ir(page, params)` en `useServiceContext`), no por router de URL. `ProcShell` enruta. Las excepciones del Centro navegan con `params` que preconfiguran filtros del listado destino.

## 6. Qué NO se tocó (frontera dura F7.6.1)

Ledger `proc_movimiento`, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, tenancy/RLS, tarifario, snapshot histórico F5, bounded context. Sin merge, sin deploy, sin producción.

## 7. Deuda visual / próximo

- Migrar formateadores e íconos de estado al 100% de las pantallas de detalle (esta fase cubrió los listados de alto tráfico + componentes base).
- Revisión responsive de planta (tablet) por pantalla.
- Verificación visual en vivo pendiente (requiere login + tenant con datos `proc_*` reales) — ver Acta F7.6.1 §revisión visual.

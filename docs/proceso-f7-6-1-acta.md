# Acta de Entrega — F7.6.1 (Arquitectura visual + estándar de filtros + normalización de nombres)

**Fecha:** 2026-08-14 · **Capability:** `proc_*` · **Tenant piloto:** Allegria Service · **Worktree:** `worktree-proc-fase1` · **Estado:** **F7.6.1 ENTREGADA** (tests + build; revisión visual en vivo pendiente — §5). Sin merge, sin producción.

## 1. Qué se entregó

Arquitectura visual y de datos visibles para dejar Allegria Service como **software operacional premium** consistente y escalable, con reglas **permanentes** para nombres, filtros y presentación. No cambia lógica operacional F1–F7.6.

**4 documentos de estándar:**
- `docs/proceso-f7-name-normalization-standard.md` — normalización canónica de nombres.
- `docs/proceso-f7-filter-standard.md` — comportamiento único de filtros.
- `docs/proceso-f7-visual-architecture.md` — capas, componentes, dirección de diseño.
- `docs/proceso-f7-ui-audit.md` — inventario del estado + deuda.

## 2. Cambios de código

### Nuevo: `src/proceso/ui/format.js` (+ `format.test.mjs`, 28/28)
Fuente **única, idempotente, testeable, centralizada**:
- `normalizarNombre` — Title Case con acrónimos/sufijos legales (SpA, S.A., SAC, GmbH, Ltda., …), conectores en minúscula, guiones/apóstrofes internos, **preserva acentos**, no corrige ortografía.
- `claveNormalizada` / `sonMismaEntidad` — dedup case/acento/puntuación-insensible.
- `sugerenciaCercana` — Levenshtein + solapamiento de tokens; solo advierte, **nunca auto-merge**.
- Formateadores es-CL: `formatNum/Kg/Pct/Moneda/Fecha/FechaLarga/FechaHora` (miles `.`, decimal `,`, null → `—`).

### Escritura (Configuración de maestros)
- `normalizarNombre` aplicado al guardar sobre `nombre`/`nombre_provisional`/`razon_social`.
- **Dedup:** coincidencia exacta de clave normalizada contra activos → se bloquea.
- **Sugerencia:** cercano → confirm no destructivo (guarda como distinto solo si el operador acepta).

### Componentes base
- **`ProcFilters`** (nuevo): buscador + selects + chips activos + reset explícito; server-side.
- **`ProcDataTable`**: encabezado **sticky**.
- **`ProcAuditInfo`**: `formatFechaHora`.

### Pantallas
- **Filtros migrados** a `ProcFilters`: Recepciones, Lotes, Bodega, Órdenes, Despachos.
- **Nombres normalizados** en columnas de cliente/productor/destinatario de esos 5 listados.
- **Formateadores canónicos:** 25 sitios de `toLocale*`/kg inline reemplazados en 11 pantallas → **0 remanentes** en `pages/`.

## 3. Reglas permanentes establecidas
1. Una sola función de normalización. 2. Prohibido `text-transform: capitalize`. 3. Normalizar en escritura, respaldo en display. 4. Dedup por clave, no literal. 5. Sugerir, nunca auto-fusionar. 6. Snapshots históricos inmutables. 7. Nuevos acrónimos → mapa + test. 8. Todo listado nuevo usa `ProcFilters`. 9. Toda presentación de dato pasa por `format.js`.

## 4. Verificación
- **Tests:** format 28/28 · dominio 43/43 · PDF data 12/12 = **83/83** ✅
- **Build:** `CI=true npm run build` → **Compiled successfully** (1,06 MB gzip) ✅. Junction reversible removido; `build/` eliminado.

## 5. Revisión visual
**No ejecutada en vivo** (requiere login + tenant con datos `proc_*` reales, no disponibles en este entorno). Declarada honestamente pendiente; **no se sustituye por preview estático**. Recomendado: Angelo abre Allegria Service y valida sidebar, tablas (sticky), filtros (chips/reset) y nombres normalizados en Recepciones, Lotes, Bodega, Órdenes y Despachos.

## 6. Frontera (no tocado)
Ledger `proc_movimiento`, `proc_pallet_linea`, genealogía, ownership, `proc_vinculo`, tenancy/RLS, tarifario, snapshot histórico F5, bounded context. Sin backend nuevo (solo frontend). Sin merge, sin deploy. No se tocó Frisku/`frisku_*`/Foods/`exp_*`/Osiris/`main`/otros worktrees.

## 7. Deuda / próximo
Normalización en pantallas de detalle · responsive de planta · script one-off para normalizar maestros históricos ya cargados · decisión `nombre_legal`/`nombre_display`. **Próximo = F7.7 (Tarifario + Servicios Facturables + Base de Cobro, motor F6)** solo con visto bueno del CFO. No auto-avanzar.

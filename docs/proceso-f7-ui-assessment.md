# F7.0 — Assessment del frontend CURRENT (para la UI de Allegria Service)

**Fecha:** 2026-08-13 · **HEAD:** `71be745`. Inventario del frontend actual de Mediterra One y su reutilizabilidad técnica para un módulo operacional nuevo de `proc_*`. Reutilizar **patrón/UI neutral** ≠ compartir dominio.

## 1. Shell y contrato de montaje (`App.jsx`)

- **Sin router.** Navegación por estado: `moduloActivo`/`setModuloActivo` + `sessionStorage('mediterra_modulo')`. No hay deep-linking ni back/forward del browser. Un módulo operacional grande debe gestionar su propia sub-navegación por estado.
- **Login email + PIN:** `src/pinHash.js`; PINs en fila Supabase dedicada `id="pins"` (ver [[pins-fila-dedicada]]); reseteo con código provisorio.
- **Hub de módulos:** `MODULOS_DISPONIBLES` (`App.jsx:413`) — tiles `{id,label,sublabel,icon,color,bg,grad}`. Se filtra por `modulosPermitidos`.
- **Contrato de montaje** (dónde se engancha Allegria Service): tile en `MODULOS_DISPONIBLES` (`:413`) + pestañas en `TABS_PERMISOS_CONFIG` (`:645`) + un `if (moduloActivo==="allegria_service") return <...>` en `:3612`, recibiendo `usuarioActual={usuarioFresco}`, `esAdmin`, `esSoloConsulta`, `tabPermisos={getTabPermisosModulo(usuario,"allegria_service")}`, `usuarios`, `onBack`, `onLogout`.
- **Permisos (autoridad en App.jsx, no en módulos):** niveles `editar/ver/sin_acceso`; `getTabPerm`/`getTabPermisosModulo` resuelven `usuario.tab_permisos[modulo][tabId]`. **Ojo:** el contrato de props **no es uniforme** — la mayoría de módulos reciben `esSoloConsulta` + `tabPermisos` y derivan editabilidad por pestaña (no un `canEdit` global). El módulo nuevo debe seguir ese patrón (permiso por pestaña), y **la seguridad efectiva sigue en RLS/RPC**, no en estas props.

## 2. Componentes reutilizables — hay poco compartido, mucho duplicado

**No existe librería de componentes.** Cada módulo redefine su objeto de colores `C`, y sus propios `Card/Btn/Modal/Badge/Field` inline (firmas divergentes). Única pieza 100% neutral y segura: **`src/theme.js`** (tokens `primary #1E2761`, `accent #D4A574`, success/danger/warning/info, spacing, radius, focusRing, font Inter).

- **Reutilizar tal cual:** `theme.js` (consumir tokens directo, no redefinir `C`), y como base neutral los **`Btn`/`Modal`/`Field` de `RendicionesModule.jsx`** (los más limpios, con `kind` primary/success/danger/ghost y `useEsMovil` responsive).
- **Toasts/spinners/empty states:** no existen como componentes; hoy se usa `alert()` + JSX inline. El módulo nuevo debería introducir un patrón propio mínimo (toast + estados de carga/vacío) reutilizable dentro de `proc_*`.
- **Tabs internos / filtros:** cada módulo los hace a mano. Conviene un pequeño set interno del módulo (Tabs, Toolbar de filtros) sin sacarlo a global todavía.

## 3. Persistencia — el módulo nuevo ya tiene su capa correcta

Coexisten dos patrones:

- **Legado "blob" (`calendario_data`):** `dbLoadGeneric/dbSaveGeneric` en `friskuHelpers.js`, `useAutoSave` redefinido inline por módulo, `cargaOkRef` (Regla 9). **NO usar para Allegria Service.**
- **Relacional `proc_*` (correcto):** `src/proceso/core/procesoDB.js` — `procSelect/procInsert/procUpdate/procRpc` (PostgREST + RPC), todas propagan error (Regla 9). Gate anti-borrado **formalizado** en `crearGateCarga()` → `{marcarOk, estaOk, guardar(fn)}` (mejor que el `cargaOkRef` inline legado). Loaders por entidad ya listos; saldos desde vistas SQL. **Esta es la capa que la UI de Service consume.**
- **Deuda `PROC-INFRA-001`:** `procesoDB.js` importa `SUPA_URL/SUPA_KEY` de `friskuHelpers`. No arrastrar dominio Frisku; mover config a un neutral (`src/shared`) en su momento (no bloquea F7).

## 4. Export Excel/PDF

- `xlsx-js-style` es dep npm real (Excel con estilos). **jsPDF/autotable/ExcelJS/JSZip se cargan por `<script>` CDN en runtime** (`fr_loadExcelJS`, `pl_loadJsPDF`) — no están en el bundle → riesgo offline/CSP.
- `fr_sheetTabla` / `fr_descargarWB` / loaders son **casi neutrales**, pero viven dentro de `FriskuComercialModule` y traen logo/título Frisku. Para Service: extraer un helper de export neutral (logo/color como parámetro) o replicar el patrón con branding propio. El PDF del Resultado de Proceso (F7-PDF-01) usa este mismo camino.

## 5. Responsive

Desktop-first con **capa mobile real**: `App.jsx` inyecta CSS global (selectores de atributo) que colapsa grids a 1 columna <768px, hace tablas scrollables, modales full-width, inputs 16px anti-zoom. **Se hereda gratis** si el módulo usa inline styles con los patrones que ese CSS matchea (grids `gridTemplateColumns`, `flex+gap`, modales `position:fixed`+`maxWidth`). Hook `useEsMovil(bp)` de Rendiciones = patrón limpio para pantallas tablet/scan de planta.

## 6. Acoplamientos de dominio a NO arrastrar

- `EMPRESAS_KEYS_ALL` (exportada de `FinanzasModule`) y `EMPRESAS_TAREAS` (`App.jsx:555`) — **dos listas de empresas divergentes**; ninguna es maestro neutral. Service usa `proc_vinculo`/plantas propias.
- `calcularComisionFrisku`/`resolverPorcentajesComision` y `friskuBI.js` — dominio comercial Frisku.
- `friskuHelpers.js` **mezcla infra neutral (SUPA, storage, formateo, TC) con dominio Frisku (comisión)** en el mismo archivo → al importar "helpers neutrales" se arrastra dominio. Tomar solo lo neutral, idealmente reubicado.
- `*EstadoBadge`/`BadgePago/BadgeFact` — el `Badge` base es neutral; los `*Estado*` traen enums de otros dominios (nómina/factura/rendición). Service define sus propios estados (orden/despacho/base/informe).
- **No usar el patrón blob `calendario_data`.**

## 7. Deuda / riesgos para un módulo grande nuevo

- **`/* eslint-disable */` universal**; sin linter efectivo (pero `CI=true` escala warnings a error en build → barrera de compilación).
- **Archivos monolíticos** (Osiris 1 MB, Finanzas 960 KB, FriskuComercial 602 KB). **Recomendación explícita para Service: NO repetir el monolito.** Estructurar el módulo en carpeta `src/proceso/ui/` con subcomponentes por sección (Recepción, Producción, Bodega, Despacho, Comercial, Config) sobre la capa `core` ya testeada. Cultura sana existente: **lógica en `core/*.js` testeada, UI delgada encima** (los `proceso/core/*.test.mjs` F1–F6 lo demuestran).
- **Sin router / sin TypeScript / sin tests de UI** (sí fuerte cultura de tests de dominio). Contratos de props implícitos y divergentes.
- **Secretos:** `SUPA_KEY` anon hardcodeada/duplicada; RLS de producción es **GO-LIVE BLOCKER** (Production Gate: claim `empresa_id` autenticado). La UI no debe asumir seguridad; la da RLS/RPC.
- **Deps UI por CDN** (PDF/Excel) — considerar al diseñar export/barcode; no agregar deps npm sin permiso (regla 8).

## 8. Conclusión

El frontend actual aporta: **paleta (`theme.js`), patrón de permisos por pestaña, CSS responsive heredable, componentes base copiables (Rendiciones), y helpers de export parametrizables.** No aporta una librería de componentes ni router; el módulo nuevo los resuelve internamente. Lo más valioso ya está construido y aislado: **la capa `src/proceso/core` (F1–F6, testeada) es el bounded context limpio que la UI consume.** El mayor riesgo a evitar es replicar el monolito; la mitigación es una estructura modular `src/proceso/ui/` sobre `core`, UI delgada, sin arrastrar dominio Frisku/Foods.

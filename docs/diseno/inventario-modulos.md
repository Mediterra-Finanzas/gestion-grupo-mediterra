# Inventario de módulos y pantallas (rama de diseño, base main 0b86538)

Relevado leyendo el código (09-10). **«177» no eran módulos**: eran comprobaciones automáticas
del recorrido `modulos-movil.mjs`. Los archivos auxiliares (helpers, adaptadores, persistencia,
pruebas) no se cuentan.

## Totales

- **7 módulos de negocio**: Tareas, Osiris, Finanzas, Allegria Foods, Frisku Comercial,
  Contabilidad, Allegria Service.
- **Submódulos embebidos**: Rendiciones, EEFF + Análisis financiero (ANF), Nóminas, Reporte
  Semanal, Créditos, Programas comerciales (Allegria Foods, dentro de Parámetros de Finanzas),
  Frisku Maestros (17 catálogos).
- **≈ 69 pantallas de primer nivel** (Tareas 7 · Osiris 8 · Finanzas 9 · Allegria 10 ·
  Frisku 8 · Contabilidad 10 · Allegria Service 17) y **≈ 135 de segundo nivel**, más ≈ 20 vistas
  de tercer nivel (vistas del Consolidado, mensual/semanal del flujo, vistas de ANF, etc.).
- El inicio y la navegación (`src/diseno/`) son la carcasa, no un módulo.

## Por módulo

| Módulo | Pantallas de primer nivel (selector) | Permiso por pestaña | Contenido dominante | Gráficos | Impresión / exportación |
|---|---|---|---|---|---|
| **Tareas** (`App.jsx`) | diaria, semanal, quincenal, mensual, puntual, anual, config (`tab`) | sí (puntual sin clave) | tablas por persona y semana, formulario de configuración, 3 modales | — | — |
| **Osiris** (`OsirisModule.jsx`, 15.700 L) | hub; ingresos (10 subpestañas), contratos (9 secciones), obtentores (asistente + 7), viveros (asistente + 5), op. técnica (4), reportes (5), tareas (en construcción) (`subApp`) | sí (5 claves) | tablas anchas editables, asistentes, KPIs | barras con `div` (9–20 px) | PDF (jsPDF CDN), XLSX propio, informe de visita con `@media print` |
| **Finanzas** (`FinanzasModule.jsx`, 20.600 L) | dashboard, flujo (consolidado 5 vistas · intercompany · 8 empresas × flujo/parámetros), saldos bancos, créditos (5 vistas), nóminas (lista + detalle con aprobación), reporte semanal (4), auditoría, EEFF (4 vistas + ANF 3), rendiciones (5) (`tab`) | sí (auditoría solo admin; dashboard y reporte exigen acceso completo) | flujo de 63–65 meses, aprobaciones, formularios de parámetros, KPIs | **SVG `LineChart` con ejes de 6–7 unidades**; waterfall con `div`; rendiciones con `div` | `window.print` (A3, tablas a 7 px), nómina con `@media print`, Excel (xlsx-js-style), PDF (jsPDF CDN), CSV |
| **Allegria Foods** (`AllegriaModule.jsx`) | hub; clientes, productores (5), programa (3), recepción (3), stock, materiales (4), embarques (4), liquidaciones (4 + 2), dashboard (marcador) (`subApp`) | **no: recibe `tabPermisos` y no lo usa; solo rol** | tablas y formularios | — | — |
| **Frisku Comercial** (`FriskuComercialModule.jsx`, 11.000 L + `FriskuModule.jsx`) | resumen, documentos, contratos, programa (5 perspectivas), embarques (lista/tarjetas + detalle COMEX), liquidaciones (5 vistas + PO), BI (3 hojas, 6 reportes), maestros (17) (`tab`) | sí, **pero las claves leídas no coinciden con la configuración** (resumen/documentos/reportes/bi no configurables; dashboard/clientes/exportadoras sin pestaña) | tarjetas, tablas, formularios grandes | SVG con etiquetas de 9–12 px | ExcelJS CDN (≈ 20 rutas), PDF, CSV en maestros |
| **Contabilidad** (`ContabilidadModule.jsx`) | empresas, plan de cuentas (3), libro diario (3), centralización SII (4), auxiliares, centros de costo, tipos doc, períodos, mapeo, informes (3 + 3 reportes) (`tabActiva`) | **no** (solo `canEdit` y `esCFO`) | CRUD, árbol de cuentas, tablas | — | XLSX |
| **Allegria Service** (`proceso/ui/*`) | 17 páginas (26 entradas de menú en 7 grupos) + 9 detalles (`vista.page`) | **menú sin filtrar**; las páginas consultan `puedeEditar` | tablas `ProcDataTable`, KPIs, formularios | — | PDF (`procesoPdf.js`) |

## Primitivas visuales que ya existen (se conectan al sistema, no se reescriben)

- Finanzas: `Card`, `SectionTitle`, `KPI`, `Btn`, `Pill`, `CampoCr`, `BadgeEstado`.
- Rendiciones: `Btn`, `Badge`, `EstadoBadge`, `Field`, `Modal`, `ChartCard`, `Seg`.
- EEFF / ANF: `Btn`, `LineaTotal`, `Badge`, `Semaforo`, `TarjetaKpi`.
- Osiris: `Th`, `Cell`, `Badge*`, `BarraFiltros`, `Breadcrumb`, `NavBar`, `ModalForm`, `guardadoChip`.
- Allegria: `NavBar`, `Card`, `KPI`.
- Frisku: `Card`, `Seccion`, `SelectBuscable`; Maestros: `Card`, `TablaMaestro`.
- Contabilidad: `Btn`, `Modal`, `Badge`, `SearchInput`, `SelectInput`, `Field`, `TableWrapper/Th/Td/Tr`, `LoadingRow/EmptyRow/ErrorMsg/SuccessMsg`.
- Allegria Service: `ProcButton`, `ProcCard`, `ProcPageHeader`, `ProcKpiCard`, `ProcLoading/Empty/ErrorState`, `ProcDataTable`, `ProcModal`, `ProcField`, `ProcFilters`, `ProcToast` (es el módulo más cercano al sistema).

## Hallazgos de permisos (no se cambian en la rama de diseño)

Se informan para decisión; la rama de diseño no toca permisos.

1. **Allegria Foods ignora la configuración de pestañas** (`tabPermisos` sin uso; acceso por rol).
2. **Frisku Comercial: desfase de claves** entre lo que el código lee y lo que la pantalla de
   permisos permite configurar; las claves ausentes valen «editar» por omisión.
3. **Allegria Service: el menú no se filtra**; las páginas sí consultan `puedeEditar`.
4. **Contabilidad sin permisos por pestaña.**
5. Finanzas: la clave `params` existe en la configuración y no corresponde a ninguna pestaña.

La navegación nueva muestra lo que cada módulo efectivamente permite, así que hereda estas brechas;
corregirlas es un cambio de permisos (rama funcional, con aprobación).

## Impresión

`index.css` y `public/index.html` no tenían `@media print`; cada módulo inyecta el suyo (Finanzas
×2, Osiris, ANF). El sistema agrega uno que **oculta la navegación** al imprimir
(`src/diseno/sistema.css`). Las exportaciones Excel/PDF se generan desde datos, no desde la
pantalla: el cambio visual no las afecta (a verificar por módulo al tocarlo).

# UX / Deuda / Documentación — Auditoría del módulo Allegria Service (proc_*)

**Carril 6 — READ-ONLY (análisis estático de código, sin dev server).**
Alcance: `src/proceso/ui/**` + integración en `src/App.jsx`. Fecha: 2026-08-25.

Complementa (no duplica) los docs existentes: `proceso-f7-ui-audit.md`,
`proceso-f7-8-visual-qa.md`, `proceso-f7-8-design-system-compliance.md`,
`proceso-recepcion-visual-qa.md`. Foco aquí: **hallazgos accionables de UX operacional
real, deuda funcional/técnica y gaps de documentación**, con `archivo:línea` y
recomendación ANTES→DESPUÉS.

## Contexto de estado (base sana)
El módulo está bien estructurado: shell + páginas delgadas sobre `core/proceso*`,
paleta centralizada (`theme.js` → `estilos.js`), librería de componentes compartida
(`components/base.jsx` con `ProcLoadingState/ProcErrorState/ProcEmptyState`), y
manejo de errores traducibles (`traducirError`). Los estados loading/error/empty
están cubiertos de forma **consistente** en las 27 páginas (~10 usos c/u). Regla 9
(anti-borrado) respetada en la capa de datos (`procesoDB.js` propaga errores, gate
de carga presente). No hay TODO/FIXME sueltos ni datos mock inventados.

Lo que sigue son las brechas.

---

## P0 — Bloqueantes de UX para operación real

Ninguno estrictamente "pantalla en blanco". Los tres candidatos más fuertes se
clasifican P1 porque el backend (RLS) es la autoridad real y degrada de forma
segura; pero uno de ellos (tenant no visible) es límite P0/P1 para operación
multiempresa y debería resolverse antes de Producción.

---

## P1 — Alta prioridad

### P1-1 · El tenant (empresa) activo NO es visible en el shell tras el login
`layout/ProcShell.jsx:85-111` (`BarraContexto`) y `:199` (solo muestra `usuario.nombre`).
`layout/ProcLoginGate.jsx:57-61` (memberships con `{codigo,nombre}`) →
`AllegriaServiceModule.jsx:33-36` solo retiene el `empresa_id` (UUID) vía `onReady`.

Tras autenticarse, el operador NO ve en ninguna parte con qué empresa está
trabajando. La `BarraContexto` muestra planta / temporada / fecha, pero nunca el
nombre/código del tenant. Para single-membership no hay ningún indicador; para
multi-membership el nombre aparece solo un instante en el selector de login y luego
se pierde. En un sistema multiempresa, registrar una recepción/despacho contra el
tenant equivocado es un problema de integridad de datos, y el usuario no tiene
confirmación visual del contexto.

- ANTES: header = `usuario.nombre` + Volver + Salir. Empresa = UUID en memoria, invisible.
- DESPUÉS: mostrar un chip/badge de empresa activa (código — nombre) en la
  `BarraContexto` o junto al nombre de usuario. El `ProcLoginGate` ya tiene
  `{codigo,nombre}` de la membership elegida; propagarlos por el contexto
  (`ServiceProvider` → `empresaLabel`) en vez de descartarlos en `onReady`.

### P1-2 · `esSoloConsulta` se pasa al módulo pero nunca se usa (rol consulta no reflejado)
`AllegriaServiceModule.jsx:14` recibe `esSoloConsulta` — nunca se lee.
`App.jsx:3698` lo pasa. La autorización de UI vive en
`hooks/useServiceContext.jsx:30-34`: `permisoDe` = `esAdmin ? "editar" : tabPermisos[tab] || "sin_acceso"`.

El rol "consulta" (global) no se refleja en el reflejo de permisos del módulo. Si
un usuario de rol consulta tuviera el tab `allegria_service` configurado como
`editar`, la UI le mostraría botones de edición (que luego RLS puede rechazar).
No es hueco de seguridad (RLS es autoridad), pero es UX confusa: ver acciones que
fallan. Además es un prop muerto que sugiere una intención no implementada.

- ANTES: `esSoloConsulta` ignorado; consulta puede ver acciones de escritura.
- DESPUÉS: en `ServiceProvider`, forzar `permisoDe → "ver"` (nunca "editar") cuando
  `esSoloConsulta(usuario)` sea true, con prioridad sobre `esAdmin`/`tabPermisos`.
  O bien eliminar el prop si la decisión es que RLS baste (dejar constancia).

### P1-3 · Concurrencia: sin detección ni mensaje de "escritura obsoleta" (lost-update silencioso)
`core/procesoDB.js:56-64` (`procUpdate` = PATCH plano, last-write-wins) y
`core/procesoF7Domain.js:97-114` (`REGLAS_ERROR` no cubre 409/conflict/stale).

Los PATCH de campos (ej. `Despacho.jsx:66 guardarCampo`, `ClienteFicha`, `BaseCobroDetalle`)
son last-write-wins sin `If-Match`/versión. Si dos operadores editan el mismo
despacho/base/recepción, el segundo pisa al primero sin aviso. `traducirError` no
tiene regla para 409 ni para conflicto de versión, así que aunque el backend lo
rechazara, el mensaje sería el técnico crudo. Esto choca con el invariante
transversal Mediterra One "no lost-updates silenciosos" (memoria
`mediterra-multiuser-concurrency`). El doc `proc-multiseason-concurrency-audit`
lo clasifica como Class-B LWW aceptado hoy, pero la UX no comunica nada.

- ANTES: segundo guardado pisa el primero; sin feedback.
- DESPUÉS: (mín.) agregar regla en `REGLAS_ERROR` para 409/`conflict`/`stale` →
  "Otro usuario modificó este registro. Recargá para ver los cambios antes de
  guardar." (ideal) optimistic concurrency por `updated_at` en los PATCH de
  detalle, como ya existe en Foods exp_* (memoria `exportadora-ola-c3`).

### P1-4 · `CLAUDE.md` raíz no menciona el módulo Allegria Service / capability proc_*
`CLAUDE.md` (raíz) — la sección "Archivos principales" lista Finanzas, Osiris,
Allegria, Frisku, Rendiciones… pero **no** `AllegriaServiceModule` ni `src/proceso/**`.

Un dev nuevo (o Claude en otra sesión) leyendo el contexto principal no sabría que
existe el módulo operacional de maquila, su bounded context proc_*, ni el gate de
identidad. Toda la documentación viva está en `docs/proceso-*` (muy completa) pero
desconectada del índice principal.

- DESPUÉS: agregar a `CLAUDE.md` un bullet de `AllegriaServiceModule.jsx` +
  `src/proceso/**` (shell, páginas, core F1–F7, Identity Bridge Opción C, flags
  `REACT_APP_PROC_AUTH`/`REACT_APP_PROC_DEV_*`) y la persistencia relacional proc_*
  (a diferencia del blob `calendario_data`).

---

## P2 — Media prioridad

### P2-1 · Mensaje de "sin permiso" inconsistente entre pantallas
Solo `Envases.jsx:229` muestra un estado explícito ("Sin permiso — No tenés permiso
para registrar movimientos de envases"). El resto **oculta silenciosamente** el
botón de creación sin explicar por qué:
`Recepciones.jsx:87`, `Despachos.jsx:78`, `Ordenes.jsx:69`, `BasesCobro.jsx`,
`Informes.jsx`, etc. (patrón `puedeEditar(...) ? <ProcButton/> : null`).

Un usuario de solo lectura ve una lista sin acciones y no sabe si es un bug o falta
de permiso.

- ANTES: `acciones={puede ? <ProcButton>+ Nuevo</ProcButton> : null}`.
- DESPUÉS: cuando no hay permiso, mostrar una nota discreta consistente ("Solo
  lectura — no tenés permiso de edición en esta sección"), reutilizando el patrón
  de `Envases`/`Despacho.jsx:107` (que ya muestra "solo lectura" en estado terminal).

### P2-2 · Accesibilidad por teclado ~inexistente; `focusRing` definido pero nunca usado
`theme.js:66` define `focusRing` — **0 usos** en `src/proceso`. Toda la navegación
usa `<div onClick>` no enfocables: sidebar (`ProcShell.jsx:176`), `ProcKpiCard`
(`base.jsx:60-71`), filas de excepción (`base.jsx:133`), chips de filtro
(`base.jsx:243`), filas de cliente (`CentroOperaciones.jsx:153`). Único `onKeyDown`
en todo el módulo: `ProcLoginGate.jsx:82`. Sin `role`, `tabIndex` ni `aria-*`.

Operarios de planta con teclado (o lectores de pantalla) no pueden navegar KPIs,
excepciones ni el menú. Es deuda de accesibilidad, no bloqueante para mouse.

- DESPUÉS: convertir los `div onClick` accionables en `<button>` (o `role="button"
  tabIndex={0} onKeyDown`), y aplicar `boxShadow: C.focusRing` en `:focus-visible`
  (requiere una clase CSS en `index.css`, ya que los estilos inline no soportan
  `:focus`). Priorizar sidebar + KPIs + excepciones.

### P2-3 · Temporada por defecto = "Toda temporada" (mezcla temporadas en pantallas operativas)
`layout/ProcShell.jsx:104-107` — el select de temporada arranca en `""` (null →
"Toda temporada"). Las pantallas operativas (Lotes, Bodega, Órdenes, Despachos)
consultan sin filtro de temporada por defecto.

Un sistema operacional suele querer la temporada abierta/actual como default, no
todas mezcladas. Riesgo de que el operador vea/actúe sobre datos de temporadas
pasadas sin notarlo.

- DESPUÉS: al cargar temporadas (`BarraContexto`), preseleccionar la temporada
  vigente por fecha (ya existe `temporadaDeFecha` en `procesoF7Domain`); dejar
  "Toda temporada" como opción explícita.

### P2-4 · Multi-membership: no se puede cambiar de empresa sin cerrar sesión
`AllegriaServiceModule.jsx:33-36` resuelve `empresaResuelta` una sola vez en el
login gate. `BarraContexto` permite cambiar planta/temporada/fecha pero **no**
empresa (el input de tenant en `ProcShell.jsx:97-99` solo aparece con
`REACT_APP_PROC_DEV_TENANT === "true"`, DEV).

Un operador con acceso a varias empresas debe salir y volver a entrar para cambiar
de tenant.

- DESPUÉS: exponer un selector de empresa en el header cuando la sesión tenga N
  memberships (reusar la lista del gate), que re-pida token para la nueva empresa.

### P2-5 · Modo baseline (flag OFF sin dev tenant) deja el módulo inutilizable
`core/procAuth.js:15` (`procAuthActivo` = `REACT_APP_PROC_AUTH==="true"`) +
`ProcShell.jsx:97` (input de tenant solo si `REACT_APP_PROC_DEV_TENANT==="true"`).

Si se despliega con `REACT_APP_PROC_AUTH` OFF y sin el flag dev de tenant,
`empEfectiva` queda `null` → `CentroOperaciones.jsx:78` muestra permanentemente
"Seleccioná un tenant y una planta" sin ningún control para hacerlo. Es una
combinación de config, pero no hay salvaguarda ni mensaje que lo explique.

- DESPUÉS: si `!authOn && !empInicial && !devTenant`, mostrar un estado claro
  ("Configuración incompleta: falta habilitar el login de Allegria Service") en
  vez de un empty state operativo que sugiere una acción imposible.

### P2-6 · Código muerto / comentarios obsoletos en el shell
- `ProcShell.jsx:182` — badge `i.fase` en el sidebar: ningún ítem de `NAV` tiene
  `fase`, nunca renderiza. Dead code.
- `ProcShell.jsx:4-5` (comentario de cabecera) y `pages/ProximaFase.jsx` — el
  comentario dice "el resto muestra estado próxima fase honesto", pero **todos** los
  ítems de `NAV` ya están cableados a páginas reales (verificado contra el `switch`
  de `render()`), así que `ProximaFase` solo actúa como fallback defensivo. El
  comentario induce a error sobre el estado real (todo implementado).

- DESPUÉS: quitar el badge `i.fase`; actualizar el comentario de cabecera a la
  realidad (flujo completo Recepción→Despacho + Comercial ya presentes;
  `ProximaFase` = fallback defensivo).

### P2-7 · Colores hardcodeados en `ProcButton` (fuera de tokens)
`components/base.jsx:14-16` — `accent: fg "#3a2a12"`, `success/danger: fg "#fff"`.
El resto del módulo cumple "sin colores hardcoded" (`theme.js` como fuente única).
Pequeña inconsistencia; romperá el día que exista dark mode.

- DESPUÉS: mover esos fg a tokens (`C.primaryText`, un `C.accentText`) en `theme.js`.

### P2-8 · Selectores de contexto sin etiqueta visible
`ProcShell.jsx:100-108` — planta/temporada/fecha son `<select>`/`<input date>` sin
`<label>`; el único hint es el texto de la opción por defecto. El input de fecha no
tiene ninguna pista de para qué sirve (solo lo usan Centro y ReporteDiario). En
mobile (header con `flexWrap`) esto es más confuso.

- DESPUÉS: agregar micro-labels o `title`/`aria-label` a cada control de contexto.

---

## Responsive (estado)
Correcto a nivel básico: `useEsMovil(900)` colapsa el sidebar a un `<select>`
(`ProcShell.jsx:165-169`), header con `flexWrap`, tablas con `overflowX:auto`
(`base.jsx:100`), grids `auto-fill minmax` en KPIs. Sin media queries CSS (todo por
JS/inline), coherente con el resto de la app. Sin hallazgos de ruptura; ver P2-8
para el header en mobile.

## Consistencia de paleta/tipografía (estado)
Muy buena. Fuente única `theme.js`; `estilos.js` no redefine colores; fuente `Inter`
vía token `C.font`; escala de espaciado `sp` y radios centralizados. Sin dark mode
(documentado como futuro en `theme.js:5-8`) — informativo, no hallazgo. Única fuga:
P2-7.

## Documentación (estado y gaps)
Cobertura **fuerte** en `docs/proceso-*` (actas F7.1–F7.8, ui-audit, visual-qa,
design-system-compliance, filter-standard, name-normalization, multiseason-hardening).
Gaps:
1. **P1-4**: el `CLAUDE.md` raíz no referencia el módulo (índice principal desconectado).
2. Visual QA **nunca se ejecutó en vivo** (bloqueado por login/RLS/PIN, documentado
   honestamente en `proceso-f7-8-visual-qa.md`). Sigue pendiente una pasada real en
   navegador con datos — informativo, fuera del alcance read-only de este carril.
3. Comentarios de código desactualizados: P2-6.

---

## Resumen de conteo
- **P0:** 0 (dos P1 rozan P0 para operación multiempresa: P1-1, P1-3).
- **P1:** 4 — tenant invisible, `esSoloConsulta` sin usar, concurrencia LWW silenciosa, CLAUDE.md sin el módulo.
- **P2:** 8 — permiso sin mensaje, accesibilidad teclado, temporada default, cambio de empresa in-shell, modo baseline inutilizable, código muerto shell, colores hardcodeados, labels de contexto.

Todos los hallazgos son de UX/deuda/documentación. **No** se detectaron pantallas en
blanco por estados no manejados ni violaciones de la Regla 9 en la capa de datos.

# Primera entrega Osiris · integración sobre la base vigente (2026-09-22)

> Rebase posterior: Production y `origin/main` avanzaron durante la preparación a `f39699c09ea0c61e919361c8b73dfc3766b161bc` (Finanzas: campos numéricos; e2e). Sin archivos en común con el paquete. La base vigente del candidato es `f39699c`.

**Rama:** `osiris/entrega1-inicio-ejecutivo` (local, sin push). **Base:** `origin/main` =
Production = `36b2700ff6e382b46a6c9a2ebc3056d058074a2c` (`dpl_3uaQYG3nDGfjPhyz1qMdKnAGiYAC`), que incluye
`3d916be` (Allegria Service, incidente de Tareas) y los avances de Flujo de Caja y Allegria.
Alcance: solo la pestaña Inicio ejecutivo y alertas internas, de solo lectura. Sin transición de
usuarios, sin versiones de recuperación, sin hotfix de Tareas y **sin el commit de destino por entorno**
en `OsirisModule.jsx` (esas líneas las cambia otra rama, `sec/staging-als-preview-isolation`; para la
prueba aislada se usó una rama desechable `prueba/entrega1-revision`).

Diff contra la base: 24 archivos, **+4724 / −0**. Solo agrega: `src/ux/*` (nuevo),
`src/data/osirisCanonical.js` (nuevo; la vista usa solo `blobCounts`), pruebas, documentos y 3 bloques en
`src/OsirisModule.jsx` (import, pestaña condicionada a `REACT_APP_OSIRIS_UX_PREVIEW==="1"` y render
de solo lectura). No modifica ni borra nada de la base.

---

# Candidato Osiris · pestaña Inicio ejecutivo y alertas internas

**Rama:** `osiris/pestana-inicio-ejecutivo` (local, sin push). **Base:** `origin/main` `27b423b`.
**Estado (2026-09-21):** rama SOLO VISUAL separada del candidato `osiris/candidato-diseno-alertas`
(que queda como evidencia, sin cambios). Alcance congelado: pestaña "Inicio ejecutivo" y alertas
internas de Osiris. Sin funcionalidades nuevas ni cambios económicos.

**Qué contiene:** los commits de diseño y alertas (`13ae76b`, `7216136`, `4d65a9a`, `52afafe`,
`f94bcf2`, `edf7436`) y la documentación (`256e4b3`, `644dcff`), por cherry-pick `-x`.

**Qué NO contiene (vive en `fix/usuarios-transicion`):** la corrección de permisos
(PROD-INCIDENT-01 + transición de usuarios con espejo en `main`) y los cambios de destino por
entorno de `persistContract` (parcial de `253961a`) y de `App.jsx` `PROD_URL` (parcial de
`1d797e4`). Las secciones de abajo que mencionan esos commits describen el paquete integrado
(`osiris/candidato-integrado-v2`), no esta rama. `f94bcf2` (destino por entorno en
`OsirisModule.jsx`) sí está aquí: sin variables el destino es el productivo actual.

---

## Qué entrega esta primera versión

- Inicio ejecutivo de Osiris (vista previa), montado en `OsirisModule` detrás de
  `REACT_APP_OSIRIS_UX_PREVIEW=1` y del permiso de Royalties. Solo lectura.
- Capa visual `src/ux`: navegación, buscador, tarjetas de indicadores, tabla densa, ficha 360.
- Alertas internas en pantalla (`PanelAlertas`): firma, vigencia, tarifas, mes de facturación
  del royalty comercial, plantaciones, Anexo 1, participación y PBR de obtentores, viveros,
  y discrepancia del pago del contract fee entre Contratos y Fee Entrada.
- Tres estados de carga en el panel: cargando (no afirma nada), error de carga (lo declara) y
  carga exitosa sin pendientes (recién ahí "No hay nada pendiente de decisión").
- Alertas con dato ausente declaran "Información insuficiente: …" en su texto.

## Qué NO incluye

- **Esta primera entrega NO incluye los tableros completos de facturación y cobranza
  solicitados.** Siguen en el plan: dependen de la conciliación de Fee Entrada (13 cobros)
  que está pendiente por decisión del CFO.
- Ninguna cifra económica derivada: sin "Ingreso devengado", sin "Contract fee por cobrar",
  sin montos en las alertas de fee.
- Fee Entrada (escrituras y fuente única), cambios económicos, validación de inflación E-05 y
  correos reales (`avisoCobranza.js`).

## Límite registrado · lectura de Fee Entrada

La discrepancia se calcula en `feeEntradaDeContrato()` (`src/ux/selectores.js`), solo lectura y
sin montos. Replica la búsqueda de la pestaña Fee Entrada (`feData` en `OsirisModule.jsx`: por
`ctId`, `id` y `fe_<id>`; sin fila se muestra "no pagado"). No importa ni modifica el módulo.
Si esa búsqueda cambia (por ejemplo, la rama `osiris/fee-entrada-fuente-unica`), el selector
tiene que seguirla.

## Commits de otros carriles incluidos · coordinación con sus dueños

Estos commits NO son de diseño ni alertas. Se incluyen solo para que un build de prueba pueda
apuntar a un destino no productivo. Sin variables de entorno el destino sigue siendo el
productivo. Quedan pendientes de coordinación con sus dueños antes de cualquier integración.

| Commit en esta rama | Origen | Archivo | Carril |
|---|---|---|---|
| `fix(persistencia): el destino sale del entorno del build (parcial de 253961a)` | `respaldo/candidato-produccion` `253961a` | `src/persistencia/persistContract.js` (+ `qa-persistencia-destino.test.js`) | F0 (F0-PROD-RC) |
| `fix(app): el detector de nuevo deploy sale del entorno del build (parcial de 1d797e4)` | `respaldo/candidato-produccion` `1d797e4` | `src/App.jsx` (`PROD_URL`) | App / SEC-ENV |

Del commit `253961a` no se trajo lo del programa de respaldos (`backupGenerador.js`, scripts,
documentos de cobertura). De `1d797e4` no se trajo `COBERTURA-RESPALDO.md`.

## Destino por entorno en `OsirisModule.jsx` (commit `f94bcf2`)

La corrección de SEC-ENV-001-CLIENT (`src/config/env.js`, `1f16527`) no es aplicable acotada:
es fail-closed, usa otras variables y viene en un commit de 52 archivos. Para poder ejercer la
prueba integrada se aplicó en `OsirisModule.jsx:11-12` y `:4744-4745` el mismo patrón ya
construido en `persistContract` (`process.env.REACT_APP_SUPA_URL || <valor productivo>`). Sin
variable el valor es el productivo: el bundle sin variables tiene los mismos hosts que
`origin/main` (11 referencias a `bywovqayuzodbzwsriet`, 15 a `vercel.app`). Queda para
coordinación con el carril SEC-ENV. Siguen fijos, fuera del panel: `OsirisModule.jsx:5401`
(logo del informe), `FinanzasModule.jsx:76`, `AllegriaModule.jsx:19`, `ContabilidadModule.jsx:6`,
`anf/anfPersistence.js:6`, `currency/store.js:11`, `eeffHelpers.js:5`, `FriskuModule.jsx:18`.

## Paquete para autorización productiva

**Código:** rama `osiris/candidato-diseno-alertas`, base `origin/main` `27b423b` (vigente al
2026-09-16), commit de código `edf7436`. 27 archivos, +4706/−8. Fuera de `src/ux`, pruebas y
documentos cambian solo `src/OsirisModule.jsx` (+10 montaje detrás de bandera, 4 constantes de
destino), `src/App.jsx` (`PROD_URL` por entorno) y `src/persistencia/persistContract.js`.

**Pruebas.**
- 22 suites, 704/704. Motor de Fase 0: 32/32. Los 29 bloques económicos de `OsirisModule` iguales.
- Build `CI=true` sin variables: compila; mismos hosts productivos que `origin/main`.
- Tres estados del panel (pruebas de render y prueba integrada): cargando no afirma nada; error de
  carga declara que las alertas no se evaluaron; "No hay nada pendiente de decisión" solo con
  carga exitosa.

**Prueba integrada (2026-09-16, bandera activa).** Entorno: copia local de staging, lote
`auto-2026-09-16` en PostgreSQL y PostgREST locales, con la tabla y sus dos triggers de staging;
CSP `connect-src 'self'`; buzón local. No fue staging mismo: staging tiene RLS sin políticas en
`calendario_data` (la clave pública no ve filas) y la fila `osiris` solo se escribe por RPC.

| Tramo | Resultado |
|---|---|
| Login (recuperación por buzón local y reingreso con PIN) | entra |
| Usuario sin módulo Osiris | no ve Osiris |
| Usuario de Osiris sin permiso de Royalties | la vista dice "Sin acceso a esta vista"; no muestra alertas |
| Navegación hub → Ingresos → Inicio ejecutivo | monta la vista previa; 83 alertas (4 críticas, 35 altas, 44 informativas) |
| Buscador y ficha 360 | abre ficha; "Marcado pagado en el contrato", "Contrato vs Fee Entrada: Discrepan: pendiente de conciliación"; sin "devengando" |
| Entrar al panel y abrir la ficha | 0 filas modificadas (hash de todas las filas antes y después) |
| Carga en curso | "Cargando datos… por ahora no se afirma nada" |
| Carga fallida | "No se pudieron cargar los datos. Las alertas no se evaluaron: esto NO significa que no haya pendientes." "Guardar ahora" bloqueado: 0 escrituras intentadas, 0 filas cambiadas |
| Guardado existente de Osiris | con la guarda de staging activa: rechazado (401) y la app avisa "NO se guardó", cambios en pantalla; sin la guarda (como producción): PATCH condicionado a `updated_at` → 200, contenido idéntico |
| Aislamiento | 151 solicitudes servidas por el origen aislado; 79 REST, todas a PostgREST local; 0 intentos a producción y 0 a staging |

Observaciones fuera del alcance del candidato (comportamiento existente):
- El encabezado de Ingresos muestra "POR COBRAR" con valores por defecto mientras la carga falla,
  y el hub muestra conteos y "✓ Guardado" antes de terminar la carga.
- Un usuario sin permiso de Royalties sigue viendo la tarjeta y el encabezado de Ingresos.
- Una escritura de `main` desde una sesión con estado en memoria sobrescribió un cambio de permisos
  hecho fuera de la sesión (patrón del incidente PROD-INCIDENT-01).
- El canal realtime arma la URL `wss://http//…` (bloqueado por CSP en la prueba).

**Revisión visual.** `http://127.0.0.1:3065` (solo en esta computadora; configuración
`osiris-candidato-aislado` de `.claude/launch.json`). Entrar con "¿Olvidaste tu PIN?": el código
llega al buzón local de la prueba. Osiris → Ingresos Osiris → "🧭 Inicio ejecutivo (vista previa)".

**Configuración de la bandera.** `REACT_APP_OSIRIS_UX_PREVIEW=1` en Vercel, proyecto productivo,
entorno Production. Es de build: se aplica con un deploy nuevo. Antes del deploy, comprobar que
Production NO define `REACT_APP_SUPA_URL`, `REACT_APP_SUPA_KEY` ni `REACT_APP_PROD_URL` (si
existieran, cambiarían el destino). La vista queda visible para todo usuario con permiso de
Royalties distinto de `sin_acceso`, sin filtro por usuario.

**Desactivar la bandera.** Quitar la variable (o dejarla distinta de `1`) y desplegar: la pestaña
desaparece y la vista no se renderiza. El código del panel sí queda en el bundle (medido 2026-09-22), inactivo sin la bandera. No toca datos: la vista es de solo lectura
y no hay migraciones ni cambios de esquema.

**Rollback de código.** Sin tocar datos: en Vercel, Instant Rollback al deployment productivo
anterior; en Git, `git revert -m 1 <merge>` sobre `main` y deploy. El candidato no escribe datos
nuevos ni cambia el formato de las filas; el guardado existente de Osiris no cambió.

**Fuera de esta entrega.** Fee Entrada, cambios económicos, inflación E-05 y correos reales. Esta
primera entrega aún no incluye los tableros completos de facturación y cobranza solicitados;
siguen en el plan.

## Salida a producción · bloqueos propios de este candidato

1. Autorización del CFO sobre este paquete (merge `AUTORIZO MERGE osiris/candidato-diseno-alertas → main`,
   bandera y deploy).
2. Coordinación con los dueños de F0 (`persistContract`), App/SEC-ENV (`App.jsx`, `OsirisModule.jsx`
   destino por entorno).
3. Revisión del CFO de los textos de alertas, de la regla de dato insuficiente y de la discrepancia
   con Fee Entrada (la alerta repite la búsqueda de filas de la pestaña; si esa búsqueda cambia,
   queda desalineada).
4. La prueba integrada se hizo sobre la copia local de staging, no sobre staging mismo (RLS sin
   políticas y guarda RPC de `osiris` en staging).

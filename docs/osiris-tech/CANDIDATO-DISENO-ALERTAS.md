# Candidato Osiris · diseño y alertas internas

**Rama:** `osiris/candidato-diseno-alertas` (local, sin push). **Base:** `origin/main` `27b423b`
(verificado con `git fetch` el 2026-09-16: sin cambios nuevos en `main`).
**Estado:** candidato local. No integrado a `main`, no desplegado, sin prueba integrada.

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

## Pendiente del carril SEC-ENV (no implementado aquí)

`OsirisModule.jsx` sigue con destino fijo, y es el que carga los datos del panel:

- `src/OsirisModule.jsx:11-12` `SUPA_URL`/`SUPA_KEY` → `dbLoadOsiris` (L38) y `dbSaveOsiris` (L92-118).
- `src/OsirisModule.jsx:4744-4745` `SUPA_URL_OSIRIS`/`SUPA_KEY_OSIRIS` → fotos de informes (Storage).
- `src/OsirisModule.jsx:5401` logo del informe HTML.

La única corrección existente es `src/config/env.js` del carril SEC-ENV-001-CLIENT (commit
`1f16527`, rama `sec/staging-als-preview-isolation`, también en `fix/als-*`, `fix/rc-test-infra`).
No es aplicable acotada: es fail-closed (sin variables la app no arranca, lo que cambia el
comportamiento productivo actual), usa otras variables (`REACT_APP_SUPABASE_URL`,
`REACT_APP_SUPABASE_ANON_KEY`, `REACT_APP_APP_ENV`) y viene en un commit de 52 archivos con
ALS, API y F0. Otros módulos con destino fijo, fuera del panel: `FinanzasModule.jsx:76`,
`AllegriaModule.jsx:19`, `ContabilidadModule.jsx:6`, `anf/anfPersistence.js:6`,
`currency/store.js:11`, `eeffHelpers.js:5`, `FriskuModule.jsx:18`.

## Salida a producción · bloqueos propios de este candidato

1. Merge solo con `AUTORIZO MERGE osiris/candidato-diseno-alertas → main`.
2. Prueba integrada (navegación, permisos, carga, cero escrituras, alertas contra la planilla,
   concurrencia) sin ejecutar; con `OsirisModule.jsx:11` fijo, un build aislado no carga Osiris.
3. Activar `REACT_APP_OSIRIS_UX_PREVIEW=1` en Vercel Production es un cambio de configuración
   con autorización propia.
4. Coordinar con los dueños de F0 y App/SEC-ENV los dos commits de la tabla anterior.
5. Revisión del CFO de los textos de alertas y de la discrepancia con Fee Entrada.

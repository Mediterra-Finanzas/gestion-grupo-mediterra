# Integración del diseño en la aplicación real — coordinación

**Rama:** `osiris/integracion-ux-app`, desde `origin/main` (`27b423b`).
**Estado:** preparada, **no integrada ni probada en la aplicación**. No afecta
producción: no se empuja a `main` ni se despliega.

El harness de revisión (`runtime/staging-respaldo`) se conserva tal como está.
Esta rama es otra cosa: el paso de montar los componentes dentro de la
aplicación, donde navegación, permisos, carga, guardado y alertas tienen que
funcionar juntos.

---

## Qué trae la rama

- `src/ux/` completo (riel, inicio ejecutivo, tablas, ficha, bandeja de cobertura).
- `src/data/osirisCanonical.js` y las suites `qa-ux-*`, `qa-cobertura-contratos`, `qa-cobranza`.
- **`src/index.js` sin cambios**: monta `App` como hoy. El recorte que impide
  montar la app existe solo en la rama del runtime de pruebas.
- Montaje detrás de una bandera de build (`REACT_APP_OSIRIS_UX_PREVIEW=1`). Sin la
  bandera la vista no aparece ni se renderiza; el bundle no es idéntico byte a byte (el rótulo queda como texto muerto).

## Dueños y ramas que tocan los mismos archivos

Todas las ramas activas son de Angelo Huerta, repartidas por carril. Las que
modifican `src/OsirisModule.jsx` o `src/App.jsx` sin estar en `main`:

| Rama | Última actividad | Osiris | App |
|---|---|---|---|
| `sec/staging-als-preview-isolation` | 2026-09-09 | sí | sí |
| `fix/als-despacho-reservas` | 2026-09-09 | sí | sí |
| `fix/data-safety-loadgate` | 2026-09-09 | — | sí |
| `osiris/fee-entrada-fuente-unica` | 2026-09-10 | sí | — |
| `osiris-a3-carril-d-readiness` | 2026-08-24 | sí | sí |
| `osiris-a3-paridad-economica` | 2026-08-24 | sí | sí |
| `osiris-diseno-responsive` | 2026-08-24 | sí | sí |
| `feat/tech-00b-f1-staging` | 2026-08-24 | sí | sí |
| `feat/tech-00b-carril-b-r03` | 2026-08-21 | sí | sí |
| `osiris-a3-carril-d-detectores` | 2026-08-21 | sí | sí |
| `feat/tech-00b-carril-b-seguridad-documental` | 2026-08-21 | sí | — |

**Regla de coordinación:** esta rama no se integra mientras
`osiris/fee-entrada-fuente-unica` y los carriles de seguridad del 09-09 no
definan orden. El montaje toca el mismo bloque de sub-pestañas que Fee Entrada.

## Requisito previo para probar en la aplicación

La aplicación trae la URL de producción incrustada en sus constantes. Levantar
el servidor de desarrollo de esta rama **escribe en producción** (ocurrió el
2026-09-09). Por eso esta rama **no se ejecuta localmente** hasta que la app lea
su destino desde el entorno y falle cerrada sin él (trabajo SEC-ENV-001-CLIENT,
en otra rama). Sin ese requisito, la prueba integrada no se puede hacer sin riesgo.

## Prueba integrada pendiente (todas juntas, contra staging)

| Área | Qué se comprueba |
|---|---|
| Navegación | la sub-pestaña aparece solo con la bandera; ida y vuelta al hub sin perder estado |
| Permisos | `tabPermisos.royalties = "sin_acceso"` oculta la vista; consulta ve sin acciones |
| Carga | la vista no se muestra antes de `osirisCargaOk`; un fallo de carga no la deja vacía |
| Guardado | la vista no escribe: cero llamadas a `dbSaveOsiris` originadas en ella |
| Alertas | conflicto, sin responsable y cobertura coinciden con la planilla de conciliación |
| Concurrencia | una escritura de otra sesión aparece sin recargar y no se pierde |

## Por qué esta rama no se empuja

Vercel crea un Preview por cada rama empujada del proyecto productivo. Esta rama monta la aplicación completa, que trae la URL de producción incrustada: su Preview sería una aplicación viva escribiendo en producción. Queda local hasta que la aplicación lea su destino desde el entorno.

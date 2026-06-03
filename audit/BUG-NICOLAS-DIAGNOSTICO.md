# BUG — Nicolás Fuenzalida ve "Solo lectura" en Osiris pese a permiso "Editar"

**Fecha:** 2026-06-03
**Branch:** `fix/osiris-permisos-contratos-prodexp`
**Estado:** SOLO DIAGNÓSTICO. Sin código modificado.

---

## TL;DR

La hipótesis de **mismatch de key es incorrecta**: el panel guarda y la página leen con la **misma key** (`contratos`). El bug real es que el rol de Nicolás es **`gerente_tecnico`**, y la lógica de edición de `OsirisModule` **no incluye `gerente_tecnico`** entre los roles que pueden editar (`esEditorOAdmin`). Por eso, aunque su permiso de pestaña sea `"editar"`, queda en "Solo ver". Afecta a **las 5 pestañas** de Osiris, no solo Contratos.

---

## 1. Key que GUARDA el panel de permisos

`src/App.jsx:491` — definición de la pestaña (módulo `osiris`):
```js
{id:"contratos",  label:"📄 Contratos Prod-Exp"},
```
Se persiste en `usuario.tab_permisos.osiris.contratos` con valor `"editar" | "ver" | "sin_acceso"`.

App.jsx pasa los permisos a OsirisModule vía `getTabPermisosModulo` (`src/App.jsx:2620`):
```js
tabPermisos={getTabPermisosModulo(usuarioFresco,"osiris")}
```
`getTabPermisosModulo` (`App.jsx:546-558`) devuelve `{ contratos, obtentores, viveros, opTecnica, royalties }` con las **mismas keys** de `TABS_PERMISOS_CONFIG`.

## 2. Key que LEE la página "Contratos Exp-Prod"

`src/OsirisModule.jsx:8028`:
```js
const permContratos = tabPermisos?.contratos || "editar";
```

## 3. ¿Coinciden las keys?

**SÍ, coinciden** (`contratos` == `contratos`). La hipótesis principal (mismatch de key) queda **descartada**. Además, verificado en producción (read-only):
- `usuarios[Nicolás].rol = "gerente_tecnico"`
- `usuarios[Nicolás].tab_permisos.osiris = { contratos:"editar", obtentores:"editar", viveros:"editar", opTecnica:"editar", royalties:"editar" }`

O sea: el permiso `"editar"` SÍ está guardado y SÍ llega a la página. El problema es otro.

## 4. Causa raíz real — el gate de rol excluye `gerente_tecnico`

`src/OsirisModule.jsx:8024-8025`:
```js
const rolActual = usuarioActual?.rol || "editor";
const esEditorOAdmin = rolActual === "editor" || rolActual === "admin";   // ← NO incluye gerente_tecnico
```

`src/OsirisModule.jsx:8037-8038` (gate de edición de Contratos):
```js
const canContratos = !esConsulta && esEditorOAdmin &&
  (rolActual === "admin" || permContratos === "editar");
```

Para Nicolás (`rolActual = "gerente_tecnico"`): `esEditorOAdmin = false` → `canContratos = false`, **sin importar** que `permContratos === "editar"`.

Banner (`src/OsirisModule.jsx:8217`): se muestra cuando `canVerContratos && !canContratos`. Como `canVerContratos = permContratos !== "sin_acceso"` = `true` y `canContratos = false`, aparece exactamente "Modo solo lectura — Tienes permiso de 'Solo ver' en Contratos".

### Inconsistencia de fondo
`App.jsx:539` (en `getTabPerm`) SÍ trata a `gerente_tecnico` como editor pleno de Osiris:
```js
if(usuario.rol === "gerente_tecnico" && modulo === "osiris") return "editar";
```
Es decir, el modelo de permisos de la app considera a `gerente_tecnico` como editor de Osiris, pero `OsirisModule` (su gate interno) **no**. Esa discrepancia es el bug.

> Nota: el usuario reportó "rol Editor", pero la data real es `gerente_tecnico`. El panel pudo mostrarle una etiqueta que interpretó como "Editor"; en BD el rol es `gerente_tecnico`. Esto no cambia el fix.

## 5. ¿Afecta otras pestañas? — SÍ, las 5

Todos los gates de edición de OsirisModule dependen del mismo `esEditorOAdmin`:

| Pestaña | Variable | Línea |
|---|---|---|
| Contratos Prod-Exp | `canContratos` | `OsirisModule.jsx:8037` |
| Royalties / Fee | `canIngresos` | `8039` |
| Contratos Obtentores | `canObtentores` | `8041` |
| Contratos Viveros | `canViveros` | `8043` |
| Operación Técnica | vía `can = canIngresos` (`8045`) → `puedeEditar` (`4568`) | `8045 / 4568` |

→ Un `gerente_tecnico` queda en "Solo ver" en **todas**. Por lo tanto **un solo fix las arregla todas**.

## 6. Fix propuesto (sin aplicar aún)

**Opción recomendada — incluir `gerente_tecnico` en el gate de edición** (`OsirisModule.jsx:8025`):
```js
const esEditorOAdmin = rolActual === "editor" || rolActual === "admin" || rolActual === "gerente_tecnico";
```
- **Una línea**, arregla las 5 pestañas.
- Queda **consistente** con `App.jsx:539` (que ya trata a `gerente_tecnico` como editor de Osiris).
- Sigue respetando el permiso por pestaña: para `gerente_tecnico`, `canContratos` evalúa `permContratos === "editar"`, así que si una pestaña estuviera en `"ver"`/`"sin_acceso"` seguiría restringida (granularidad intacta). En el caso de Nicolás (todo `"editar"`) → podrá editar.

**Opciones descartadas:**
- *Cambiar el rol de Nicolás a `editor`*: workaround de datos, no arregla a otros `gerente_tecnico`, deja la inconsistencia viva. No recomendado como fix.
- *Tratar `gerente_tecnico` como `admin` (acceso total que ignora el permiso por pestaña)*: rompe la granularidad por pestaña. No recomendado.

## 7. Validación sugerida (post-fix, en su momento)

- Con flag/datos actuales: entrar como `gerente_tecnico` con `contratos:"editar"` → debe poder editar (sin banner).
- `gerente_tecnico` con una pestaña en `"ver"` → esa pestaña sigue en "Solo ver" (granularidad).
- `editor`/`admin`/`consulta` → comportamiento sin cambios.

---

**No escribí código. Espero tu revisión para decidir si aplico el fix de la sección 6.**

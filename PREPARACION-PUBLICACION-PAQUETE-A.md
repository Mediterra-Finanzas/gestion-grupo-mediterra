# Preparación de publicación · paquete A

Verificado el **2026-10-20**, en sólo lectura. **Sin push, sin merge, sin despliegue.**

---

## 1 · El deployment productivo que corresponde a la base

| Qué | Valor |
|---|---|
| **ID del deployment** | `dpl_3TRTPYdWsXGEKR6fND1e44ahfShL` |
| **URL del deployment** | `https://gestion-grupo-mediterra-jwojqnjhx-mediterra-finanzas-projects.vercel.app` |
| URL de la rama | `https://gestion-grupo-mediterra-git-main-mediterra-finanzas-projects.vercel.app` |
| Dominio productivo | `https://gestion-grupo-mediterra.vercel.app` |
| Proyecto | `prj_GRHo6YxcvdyUIrDmYI6dL3vQaIJ0` · `Mediterra-Finanzas/gestion-grupo-mediterra` |
| Entorno | `production` |
| Commit | `1bc5c447748e97adda3c37ee9ca38029e7695a69`, rama `main` |
| Commit anterior | `778a397cdffeb28352dc19ff39bb44df25638dd0` |

### Confirmación de que el dominio apunta a ese deployment

El dominio `gestion-grupo-mediterra.vercel.app` responde **HTTP 200** y entrega
`/static/js/main.466070a8.js`, `sha256 78ad738aa2387b2e80be6ddd531101c0b00fcdb9a2ca17304d8e999d5036ff70`.

Ese mismo archivo trae incrustado, en texto, lo que él es:

```
REACT_APP_VERCEL_DEPLOYMENT_ID       dpl_3TRTPYdWsXGEKR6fND1e44ahfShL
REACT_APP_VERCEL_URL                 gestion-grupo-mediterra-jwojqnjhx-mediterra-finanzas-projects.vercel.app
REACT_APP_VERCEL_PROJECT_PRODUCTION_URL  gestion-grupo-mediterra.vercel.app
REACT_APP_VERCEL_ENV                 production
REACT_APP_VERCEL_TARGET_ENV          production
REACT_APP_VERCEL_GIT_COMMIT_REF      main
REACT_APP_VERCEL_GIT_COMMIT_SHA      1bc5c447748e97adda3c37ee9ca38029e7695a69
```

La cadena cierra sobre sí misma: el dominio sirve el artefacto, y el artefacto declara su
deployment, su proyecto, su dominio productivo y su commit. No hay inferencia por fecha ni por alias.

**Las dos URL del deployment devuelven HTTP 302**, no 404: redirigen a `vercel.com/sso-api`. Es la
protección de despliegues de Vercel, no una ruta equivocada. Por eso la confirmación se hizo contra
el artefacto y no comparando dos respuestas.

Nota de método: `gh` no está instalado en este equipo y la CLI de Vercel no se usó. Toda la
identificación sale del artefacto que el dominio entrega.

## 2 · Revalidación de `origin/main`

`git fetch origin --prune` corrido de nuevo justo antes de este documento.

| | |
|---|---|
| `origin/main` | `1bc5c447748e97adda3c37ee9ca38029e7695a69` |
| Fecha | 2026-10-15 15:50:15 UTC |
| ¿Sigue siendo la base del candidato? | **Sí** |
| ¿Cambió algo desde la verificación anterior? | **No.** Ninguna comprobación queda afectada |

Nada se ha publicado en `main` en los cinco días desde ese commit. La rama local `main` sigue
congelada en `a599f47e` del 26 de agosto, **sin tocar**, igual que el trabajo de los otros carriles.

## 3 · Ventana con los carriles activos

El candidato avanza sobre `origin/main` por **avance directo (fast-forward)**: no genera commit de
merge.

Carriles con trabajo local sin publicar que tocan `src/OsirisModule.jsx`, simulados contra el
candidato con `git merge-tree` (simulación, no se escribió nada):

| Carril | Commits sobre `origin/main` | ¿Choca con el paquete A? | Conflictos propios contra `origin/main` |
|---|---:|---|---:|
| `osiris/labores-publicable` | 34 | **no** | 0 |
| `cand/als-integrada` | 48 | **no** | — |
| `osiris/entorno-prueba` | 45 | sólo `.gitignore` | 1 |
| `sec/proc-authz-f5f6` | 113 | no | 6 |
| `cert/rc-2-ui` | 70 | no | 6 |

Dos cosas que conviene leer juntas:

- **`src/OsirisModule.jsx` no entra en conflicto con ningún carril.** En los cinco casos se mezcla
  solo. El paquete A toca zonas que nadie más está tocando.
- **Los conflictos de `sec/proc-authz-f5f6` y `cert/rc-2-ui` ya existen contra `origin/main`**, en
  `App.jsx`, `FinanzasModule.jsx`, `AllegriaModule.jsx`, `persistContract.js` y `AGENTS.md`. El
  paquete A **no agrega ninguno**: son deuda de esos carriles, no de esta ventana.

**El carril a coordinar es `osiris/labores-publicable`**, porque comparte módulo y comparte la fecha
del 26. Mezclan limpio, así que el orden es indiferente desde el punto de vista técnico; lo que hay
que decidir es cuál se publica primero para que el segundo revalide sobre la base nueva.

La ventana está libre: ningún carril bloquea al paquete A y el paquete A no bloquea a ninguno.

## 4 · Autorización exacta

Cuando decidas publicar, la frase es:

```
AUTORIZO MERGE fix/osiris-paquete-a → main
```

| | |
|---|---|
| **Candidato** | `43b882121cf5fd1f272ebaf5d38ff26d4c6ae204` |
| **Rama** | `fix/osiris-paquete-a` |
| **Base** | `1bc5c447748e97adda3c37ee9ca38029e7695a69` |
| La base es | `origin/main` **y** el commit del deployment productivo vigente |
| Forma del merge | avance directo, sin commit de merge |
| **Retorno** | `1bc5c447748e97adda3c37ee9ca38029e7695a69` — deployment `dpl_3TRTPYdWsXGEKR6fND1e44ahfShL` |

### Sobre el retorno

El punto de retorno es el deployment que está vivo ahora, así que es un estado conocido y probado en
producción, no una reconstrucción.

**Deja de ser válido si otro carril publica en `main` entre esta verificación y el merge.** En ese
caso el retorno pasa a ser lo que esté vivo en ese momento y hay que volver a identificarlo: la
comprobación afectada sería la sección 1 completa, que tarda dos peticiones.

Las comprobaciones de este documento valen mientras `origin/main` siga en `1bc5c447`. Si cambia,
avísame y las repito antes de publicar.

### Qué NO autoriza esta preparación

- No autoriza el push ni el despliegue: eso es tuyo y va aparte.
- El paquete corrige **cómo se interpretan las pantallas**. La conciliación de datos (paquete B) y
  la conexión con Finanzas (paquete C) siguen pendientes.
- **TEST PERU permanece visible y sin modificaciones** hasta tu decisión. El paquete lo hace
  visible; no lo elimina, no lo excluye y no cambia ninguno de sus valores.

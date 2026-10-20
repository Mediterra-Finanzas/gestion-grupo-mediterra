# Verificación: main vs Production

Hecha el **2026-10-20 16:52 UTC**, en sólo lectura. Dos peticiones HTTP GET al dominio productivo
(la página y su paquete JavaScript) y un `git fetch`. **Ninguna escritura, a nada.**

---

## Lo que afirmé antes, y era falso

> «Producción sirve código de Osiris que `main` no tiene. `main` está dos meses atrás y le faltan
> ~15.800 líneas, incluido `preservacion.js`.»

**Falso.** Comparé contra la rama **local** `main` en vez de `origin/main`. `origin/main` es
exactamente el SHA que sirve producción.

---

## 1 · Identificación del checkout

| Qué | Valor |
|---|---|
| Carpeta | `C:\Users\angel\Documents\Proyectos\gestion-grupo-mediterra` |
| Repositorio remoto (`origin`) | `https://github.com/Mediterra-Finanzas/gestion-grupo-mediterra.git` |
| Rama del checkout | `deploy-allpa` |
| HEAD del checkout | `ffda87c2eb2cb5ee7cb879e5d5924a17f545d9a5` |

## 2 · Las dos referencias de `main`

`git fetch origin --prune` corrido antes de comparar (el fetch previo era de las 08:56 del mismo
día; el fetch no cambió `origin/main`).

| Referencia | SHA completo | Fecha del commit |
|---|---|---|
| **`origin/main`** | `1bc5c447748e97adda3c37ee9ca38029e7695a69` | 2026-10-15 15:50:15 +0000 |
| `main` (local) | `a599f47ea91eee697ccbd93df604581411be11d2` | 2026-08-26 14:08:28 −0400 |

```
git rev-list --count main..origin/main   ->  370   (main local esta ATRAS)
git rev-list --count origin/main..main   ->  140   (main local esta ADELANTE)
```

Son ramas divergentes: la local no es un subconjunto ni un superconjunto de la remota.

## 3 · El SHA que sirve el dominio productivo

```
GET https://gestion-grupo-mediterra.vercel.app/
GET https://gestion-grupo-mediterra.vercel.app/static/js/main.466070a8.js
```

| Qué | Valor |
|---|---|
| Dominio | `https://gestion-grupo-mediterra.vercel.app` |
| Bundle referenciado por el HTML | `/static/js/main.466070a8.js` |
| Tamaño del bundle | 5.494.568 bytes |
| `sha256` del bundle servido | `78ad738aa2387b2e80be6ddd531101c0b00fcdb9a2ca17304d8e999d5036ff70` |
| `ETag` del HTML | `"7f84b6163dd055bf1f069d2de86baa1e"` |
| `X-Vercel-Cache` | `HIT` |
| `Age` | `368534` s ≈ 4,27 días ⇒ en caché desde ≈ 2026-10-16 10:30 UTC |
| `X-Vercel-Id` | `gru1::l4g8p-1792515139418-2241094307ab` |

Variables que el bundle trae incrustadas, literales:

| Variable | Valor |
|---|---|
| `REACT_APP_VERCEL_GIT_COMMIT_SHA` | **`1bc5c447748e97adda3c37ee9ca38029e7695a69`** |
| `REACT_APP_VERCEL_TARGET_ENV` | `production` |
| `REACT_APP_VERCEL_GIT_PREVIOUS_SHA` | `778a397cdffeb28352dc19ff39bb44df25638dd0` |
| `REACT_APP_VERCEL_GIT_REPO_SLUG` | `gestion-grupo-mediterra` |
| `REACT_APP_VERCEL_GIT_REPO_ID` | `1204865378` |

### Por qué este método y no otro

- **`gh` no está instalado** en este equipo, así que la API de despliegues de GitHub no estuvo
  disponible en esta sesión.
- **La CLI de Vercel no se usó**, por la razón ya documentada en este proyecto: no da el SHA servido
  de forma confiable.
- El bundle sí: el proyecto de Vercel tiene habilitado exponer sus variables de sistema, llegan con
  prefijo `REACT_APP_` y Create React App las sustituye **en el texto** del paquete compilado. El
  SHA no se infiere de una fecha ni de un alias: está escrito en el archivo que el dominio entrega.

### Nota de seguridad

El bundle también trae la clave anónima de Supabase incrustada, que es el P0 ya conocido de este
proyecto. No se transcribe acá.

## 4 · Contraste con los despliegues anteriores de este carril

`origin/main`, primer padre:

| SHA | Fecha UTC | Asunto |
|---|---|---|
| **`1bc5c447748e97adda3c37ee9ca38029e7695a69`** | 2026-10-15 15:50 | release: Créditos + correcciones de la vista semanal sobre producción (778a397) — **servido hoy** |
| `d9611add1acd70a70da9d960af91a38d557dc37f` | 2026-10-15 13:34 | release: producción = 778a397 + Créditos; retira de main los 14 cambios no publicados |
| `e9c77895cda284f13207c49bd48648d1b2b546ab` | 2026-10-15 13:10 | fix(creditos): saldosAlCorte no cuenta como capital el interés capitalizado antes de su fecha |
| `61b96399bd5ea84bf3fd22d98e8d99e53885c94c` | 2026-10-15 12:40 | docs(impacto): la tarjeta afectada es el Timeline de Pagos por Acreedor |
| `778a397cdffeb28352dc19ff39bb44df25638dd0` | 2026-10-13 13:14 | Merge … into osiris/publicacion-paso2 — **despliegue anterior, según el bundle** |

```
git merge-base --is-ancestor 778a397c 1bc5c447   ->  si
git rev-list --count 778a397c..1bc5c447          ->  30
```

La cadena cierra: lo servido es la punta de `origin/main`, y el despliegue previo que el propio
bundle declara es el commit anterior de la misma rama, 30 commits atrás.

## 5 · Por qué aparecía una base de agosto

La rama **local** `main` de este checkout dejó de moverse el **2026-08-26**, cuando otro carril
mergeó ahí el trabajo de Allegria Foods C3-B **localmente y sin empujarlo** (consta como decisión de
ese carril: merge local, sin push, sin despliegue). Desde entonces nadie corrió `git pull` sobre
`main` en esta carpeta, así que la referencia quedó congelada mientras `origin/main` avanzó 370
commits. Los 140 commits "adelante" son exactamente ese trabajo sin publicar.

Leí `main` en vez de `origin/main` y presenté la diferencia como deriva de producción.

## 6 · Qué NO se hizo

- **No se reconcilió ni se sobrescribió `main`.** Esos 140 commits son de otro carril y decidir qué
  pasa con ellos no es parte del paquete A.
- No se tocó ningún dato, ni en producción ni en ninguna otra base.
- No se desplegó nada.

## 7 · Consecuencia

El candidato está construido **exactamente sobre `origin/main`**, que es el SHA que sirve
producción. La ruta de integración es la normal y no hay nada que reconciliar antes de publicar.

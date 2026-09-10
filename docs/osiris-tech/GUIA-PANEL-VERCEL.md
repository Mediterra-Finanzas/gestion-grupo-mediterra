# Guía de panel — proyecto de Vercel para el runtime de staging

Única guía. Todo lo que dependía de mí ya está hecho; esto es lo que solo se
puede hacer desde el panel, porque no tengo credenciales de Vercel (sin CLI, sin
`.vercel/`, sin token en ningún `.env*.local`).

---

## Por qué hace falta un proyecto aparte

De la documentación de Vercel (Cron Jobs, 2026-08-11):

> "To trigger a cron job, Vercel makes an HTTP GET request to your project's
> **production deployment URL**."

Los cron corren **solo contra el deployment de Producción de un proyecto**. Un
Preview publica la función y nadie la llama. Por eso el runtime de pruebas es un
**segundo proyecto**, cuya Producción apunta a Supabase staging. Así el cron se
dispara de verdad y el proyecto productivo no se toca en ningún momento.

```
Proyecto de Vercel            Rama de producción              Supabase
─────────────────────────────────────────────────────────────────────────────
(el actual)                   main                            bywovqayuzodbzwsriet   ← intacto
mediterra-respaldo-staging    runtime/staging-respaldo        nlvfjpwiecgrosjnwwik   ← nuevo
```

---

## Datos para copiar

| Campo | Valor |
|---|---|
| Nombre del proyecto | `mediterra-respaldo-staging` |
| Repositorio | `Mediterra-Finanzas/gestion-grupo-mediterra` |
| **Production Branch** | `runtime/staging-respaldo` |
| Framework | Create React App (se detecta solo) |
| Root Directory | la raíz, sin cambios |
| Build Command | el que trae el proyecto |

La rama ya está lista y empujada. Trae su propio `vercel.json` con **un solo
cron**, el del respaldo, y sin las funciones de los otros carriles.

---

## Pasos

**1.** Vercel → Add New → Project → importar `gestion-grupo-mediterra`.
Nombre: `mediterra-respaldo-staging`.

**2.** Settings → Git → **Production Branch** = `runtime/staging-respaldo`.
Esto es lo que hace que sus deployments cuenten como Producción **de este
proyecto** y por lo tanto que el cron los llame. No afecta a `main`.

**3.** Settings → Environment Variables, alcance **Production**. Solo nombres;
los valores los pegas tú por el canal autorizado, no pasan por el chat.

| Variable | De dónde sale |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase de staging |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `sb_secret_` de staging |
| `CRON_SECRET` | el que ya está en `.env.osiris-staging.local` |
| `BACKUP_ENCRYPTION_KEY_A` | el de staging |
| `BACKUP_ENCRYPTION_KEY_B` | el de staging |
| `BACKUP_KID_A` | `A-stg-82a046f3` |
| `BACKUP_KID_B` | `B-stg-ef5ee1f5` |
| `RESPALDO_BUCKET` | `respaldo-osiris-staging` |
| `RESPALDO_AVISO_TO` | destinatarios **sintéticos**, separados por coma |
| `SMTP_MEDITERRA_USER` | la misma cuenta que usa el informe diario |
| `SMTP_MEDITERRA_PASS` | idem |
| `REACT_APP_UX_SOLO` | `1` |
| `REACT_APP_UX_SUPABASE_URL` | URL de staging |
| `REACT_APP_UX_SUPABASE_ANON_KEY` | clave publicable de staging |

**`RESPALDO_PERMITIR_PRODUCCION` no se define.** Sin ella el handler se niega a
correr contra `bywovqayuzodbzwsriet`, aunque alguien pegue la URL equivocada.

**`REACT_APP_UX_SOLO` sin definir** deja la pantalla en un aviso y no monta
nada: falla cerrado en los dos sentidos.

**4.** Deploy. Cuando termine: Settings → **Cron Jobs**. Debe figurar
`/api/osiris-respaldo-cron` con `0 7 * * *`. Si no aparece, el deployment no es
de la rama de producción del proyecto (paso 2).

**5.** En esa misma pantalla, botón **Run**. Esa es la prueba del tramo completo
disparado por la plataforma.

**6.** Pásame la URL de producción del proyecto. Con eso activo el respaldo del
disparo desde la base, media hora después:

```sql
select cron.schedule('respaldo-osiris-staging-http', '30 7 * * *',
  $$select public.respaldo_disparar('https://<dominio>/api/osiris-respaldo-cron', '<CRON_SECRET>')$$);
```

La función y la extensión `http` ya están creadas en staging. Si Vercel pierde
la corrida, la base la recupera; si no la perdió, la segunda llamada es
idempotente.

---

## Que ni el frontend ni el backend llegan a producción — verificado

No basta con configurar variables: la referencia productiva viaja **incrustada
en el código** de 19 archivos. Lo que se verificó sobre esta rama:

**Frontend.** `src/index.js` no importa `App`. Recorriendo el grafo de imports
desde el punto de entrada: **18 módulos alcanzables, cero URLs de Supabase**.
Sobre el bundle compilado con `CI=true`: **cero URLs de Supabase**, y la única
aparición de `bywovqayuzodbzwsriet` es el guardia del propio harness, que se
niega a leer si le apuntan ahí.

**Backend.** `api/` queda en cuatro archivos: `osiris-respaldo-cron.js`,
`send-email.js`, `_reportingScheduler.js` y su test. Se retiraron `login.js`,
`informe.js`, `storage.js`, `_auth.js`, `db/` y el endpoint viejo
`osiris-backup.js`. La única aparición de la referencia productiva en `api/` es
`REF_PRODUCCION` del guardia fail-closed.

**Cron.** Un solo cron. El del informe diario de Allegria Service no viaja: ni
su entrada en `vercel.json` ni su función.

Todo esto lo cuida `qa-runtime-staging.test.js`, **11/11**, que falla si alguien
vuelve a meter la aplicación, una función ajena o un cron de otro carril.

---

## Qué queda demostrado después de estos pasos

| Tramo | Hoy | Después |
|---|---|---|
| Reserva atómica del lote | EJERCIDO | idem |
| snapshot → cifrado A/B → subida → READY → verificación | EJERCIDO en proceso | idem |
| Evidencia incompleta y reintento tras resolver identidad | EJERCIDO, 22/22 | idem |
| **Disparo del programador sobre el tramo entero** | **NO EJERCIDO** | EJERCIDO |
| **Entrega SMTP real del aviso** | **NO EJERCIDO** | EJERCIDO |
| URL compartible del diseño | solo `localhost` | EJERCIDO |

`AUTOMATIZACIÓN COMPLETA` sigue en **NO EJERCIDA** hasta que el programador
dispare el flujo entero, termine en READY y el resultado se descargue y restaure.

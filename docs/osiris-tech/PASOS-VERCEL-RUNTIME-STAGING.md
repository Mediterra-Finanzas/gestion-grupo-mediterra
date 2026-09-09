# Runtime de pruebas en Vercel — pasos en el panel

Los necesito porque no tengo credenciales de Vercel: no hay CLI instalado, no hay
`.vercel/` en el repositorio y no hay token en ningún `.env*.local`.

---

## Por qué un Preview no alcanza

De la documentación de Vercel (Cron Jobs, actualizada 2026-08-11):

> "To trigger a cron job, Vercel makes an HTTP GET request to your project's
> **production deployment URL**."

Los cron corren **solo contra el deployment de Producción de un proyecto**. Un
Preview publica la función, pero nadie la llama sola. Tu observación era exacta.

Otras tres cosas de la misma documentación que ya están consideradas en el código:

- **La zona horaria del cron siempre es UTC.** Por eso el horario se declara en UTC.
- **Hobby dispara una vez al día y en cualquier minuto de la hora indicada.** Pro
  dispara dentro del minuto. Si el proyecto nuevo queda en Hobby, `0 7 * * *`
  puede caer entre las 07:00 y las 07:59 UTC.
- **La entrega es best-effort: puede faltar una corrida y puede repetirse.** Por
  eso la unicidad la resuelve la clave primaria y no un `if` en el handler.

## La forma que no toca producción

**Un segundo proyecto de Vercel**, cuyo entorno de Producción apunta a Supabase
staging. Así el cron corre de verdad, y las variables del proyecto productivo no
se tocan en ningún momento.

```
Proyecto de Vercel            Entorno        Supabase
──────────────────────────────────────────────────────────────
mediterra-calendario          Production     bywovqayuzodbzwsriet   ← intacto
mediterra-respaldo-staging    Production     nlvfjpwiecgrosjnwwik   ← nuevo
```

---

## Pasos

**1 · Crear el proyecto**
Vercel → Add New → Project → importar el mismo repositorio de GitHub.
Nombre: `mediterra-respaldo-staging`.
En **Root Directory** dejá la raíz. Framework: Create React App (lo detecta solo).

**2 · Fijar la rama de producción del proyecto nuevo**
Settings → Git → **Production Branch** = `respaldo/candidato-produccion`.
Esto es lo que hace que los deployments de esa rama sean "Production" **de este
proyecto**, y por lo tanto que el cron los llame. No afecta a `main` ni al
proyecto productivo.

**3 · Variables de entorno** (Settings → Environment Variables, alcance **Production**)

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase de staging |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `sb_secret_` de staging |
| `CRON_SECRET` | el mismo que ya está en `.env.osiris-staging.local` |
| `BACKUP_ENCRYPTION_KEY_A` | el de staging |
| `BACKUP_ENCRYPTION_KEY_B` | el de staging |
| `BACKUP_KID_A` | `A-stg-82a046f3` |
| `BACKUP_KID_B` | `B-stg-ef5ee1f5` |
| `RESPALDO_BUCKET` | `respaldo-osiris-staging` |
| `RESPALDO_AVISO_TO` | destinatarios sintéticos, separados por coma |
| `SMTP_MEDITERRA_USER` / `SMTP_MEDITERRA_PASS` | las mismas que usa el informe diario |
| `REACT_APP_UX_SUPABASE_URL` | URL de staging (para el harness `?ux=1`) |
| `REACT_APP_UX_SUPABASE_ANON_KEY` | clave publicable de staging |

**`RESPALDO_PERMITIR_PRODUCCION` no se define.** Sin ella el handler se niega a
correr contra `bywovqayuzodbzwsriet`, así que aunque alguien pegue por error la
URL productiva, no escribe nada.

Los valores están en `.env.osiris-staging.local`, gitignored. Los pegás vos: no
pasan por este chat.

**4 · Renombrar el `vercel.json`**
En la rama, `vercel.staging.json` tiene el cron. Antes del primer deploy hay que
copiarlo sobre `vercel.json` **solo en esa rama**, o el proyecto nuevo heredaría
el cron del informe diario de Allegria Service y lo dispararía dos veces.
Ese cambio lo hago yo cuando me digas; lo dejé aparte a propósito para que no
viaje sin querer a `main`.

**5 · Desplegar y verificar el cron**
Deployments → esperar el primero de la rama de producción → Settings → **Cron Jobs**.
Ahí tiene que figurar `/api/osiris-respaldo-cron` con `0 7 * * *`.
Si no aparece, el `vercel.json` no llegó (paso 4).

**6 · Disparar una vez sin esperar a mañana**
En la misma pantalla de Cron Jobs, el botón **Run** ejecuta el job a demanda.
Es la prueba del tramo completo con disparo de la plataforma.

**7 · Pasarme la URL de producción del proyecto nuevo**
Con eso activo el respaldo del disparo desde la base:

```sql
select cron.schedule('respaldo-osiris-staging-http', '30 7 * * *',
  $$select public.respaldo_disparar('https://<dominio>/api/osiris-respaldo-cron', '<CRON_SECRET>')$$);
```

Media hora después del cron de Vercel: si Vercel perdió la corrida, la base la
recupera; si no la perdió, la segunda llamada es idempotente y no duplica nada.
La función ya está creada en staging y la extensión `http` instalada.

---

## Lo que queda demostrado con esto

| Tramo | Hoy | Después de estos pasos |
|---|---|---|
| Reserva atómica del lote | EJERCIDO (pg_cron, 3 corridas) | idem |
| snapshot → cifrado A/B → subida → READY → verificación | EJERCIDO en proceso, 14/14 | idem |
| **Disparo por el programador del tramo completo** | **NO EJERCIDO** | EJERCIDO |
| **Entrega SMTP real del aviso** | **NO EJERCIDO** | EJERCIDO |
| Preview del diseño con URL compartible | solo `localhost` | EJERCIDO |

## Lo que NO se toca

- El proyecto productivo de Vercel: ninguna variable, ningún setting, ningún deploy.
- Supabase producción: el guardia del handler lo impide por diseño.
- `main`: el `vercel.json` con el cron del respaldo vive solo en la rama del respaldo.

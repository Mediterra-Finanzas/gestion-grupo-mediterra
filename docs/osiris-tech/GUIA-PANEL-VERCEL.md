# Guía de panel — runtime de pruebas contra staging

Única guía. Reemplaza la anterior y corrige tres cosas:

1. El proyecto se crea **sin desplegar `main`**. La versión anterior importaba el
   repositorio y pulsaba Deploy, que construye `main`, y corregía la rama después.
2. El primer deployment sale de un **commit exacto de `runtime/staging-respaldo`**,
   y ese **SHA se confirma antes de ejecutar cualquier función**.
3. Las variables se revisaron contra el código. El correo usa `SMTP_OSIRIS_*`,
   no `SMTP_MEDITERRA_*`: con la guía anterior, B4 habría fallado.

---

## Por qué no se usa "Import → Deploy"

Al importar un repositorio, Vercel fija como Production Branch `main` (o `master`,
o la rama por defecto) y el botón **Deploy** construye esa rama. En este
repositorio `main` monta la aplicación con la URL productiva incrustada y trae
funciones y crons de otros carriles. Ese primer deployment sería una aplicación
viva contra producción.

Por eso el proyecto se crea vacío, se bloquea todo build que no sea la rama del
runtime y recién después se conecta Git.

| Dato | Valor |
|---|---|
| Proyecto | `mediterra-respaldo-staging` |
| Repositorio | `Mediterra-Finanzas/gestion-grupo-mediterra` |
| Rama de producción | `runtime/staging-respaldo` |
| Commit a desplegar | el SHA completo que te entrego al cerrar (es la punta de `origin/runtime/staging-respaldo`) |

---

## Parte A · Crear el proyecto sin desplegar

**A1 · Crear el proyecto vacío.** En tu terminal, con tu sesión de Vercel. Inicias
sesión tú; yo no uso credenciales de Vercel.

```bash
npx vercel@latest login
```

```bash
npx vercel@latest project add mediterra-respaldo-staging
```

`project add` crea el proyecto sin repositorio y sin deployments. Si tu cuenta
tiene más de un equipo, agrega `--scope <equipo>` con el equipo del proyecto
productivo. Comprobación: vercel.com → `mediterra-respaldo-staging` →
**Deployments** está vacío.

**A2 · Bloquear cualquier build ajeno, antes de conectar Git.** Proyecto →
**Settings** → **Build and Deployment**:

- **Framework Preset**: Create React App.
- **Node.js Version**: 24.x. La rama también lo fija con `engines` en `package.json`,
  que tiene prioridad sobre este selector.
- **Ignored Build Step** → **Custom** → pega esta línea → **Save**:

```bash
[ "$VERCEL_GIT_COMMIT_REF" != "runtime/staging-respaldo" ]
```

Vercel cancela el build cuando el comando termina con código 0. Para cualquier
otra rama la comparación es verdadera (0) y el build se cancela. Para
`runtime/staging-respaldo` es falsa (1) y construye. Un push a `main` o a otra
rama nunca construye en este proyecto, incluso antes de fijar la rama de
producción.

Luego **Settings** → **Cron Jobs** → **Disable**, si la opción aparece antes del
primer deployment. Así ninguna función corre antes de confirmar el SHA en A7. Si
no aparece, haz A6 y A7 el mismo día entre las 05:00 y las 22:00 de Chile, lejos
del horario del cron.

**A3 · Variables.** **Settings** → **Environment Variables**. Marca solo
**Production**. Confirma que esté activada la opción de exponer las **System
Environment Variables**: con ellas el handler registra qué commit corrió.

| Variable en Vercel | Quién la lee | De dónde sale el valor |
|---|---|---|
| `SUPABASE_URL` | handler | `OSIRIS_STAGING_SUPABASE_URL` en `.env.osiris-staging.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | handler | `OSIRIS_STAGING_SUPABASE_SECRET_KEY` (clave `sb_secret_`, la misma de las pruebas locales) |
| `CRON_SECRET` | handler (`cronAutorizado`) | `CRON_SECRET` |
| `BACKUP_ENCRYPTION_KEY_A` · `BACKUP_ENCRYPTION_KEY_B` | handler | mismos nombres |
| `BACKUP_KID_A` · `BACKUP_KID_B` | handler | mismos nombres |
| `RESPALDO_BUCKET` | handler | `respaldo-osiris-staging` (bucket privado) |
| `RESPALDO_AVISO_TO` | handler, alarma | destinatarios sintéticos separados por coma; **no está en el archivo, lo defines tú** |
| `RESPALDO_CORREO_PRUEBA` | handler | `si` |
| `CORREO_PRUEBA_PERMITIDOS` | handler | el buzón de prueba que designes; **no está en el archivo** |
| `SMTP_OSIRIS_USER` · `SMTP_OSIRIS_PASS` | `api/send-email.js`, cuenta del módulo `osiris` | los del proyecto productivo (Settings → Environment Variables); **no están en el archivo local** |
| `REACT_APP_UX_SOLO` | build del frontend | `1` |
| `REACT_APP_UX_SUPABASE_URL` | build del frontend (harness) | `OSIRIS_STAGING_SUPABASE_URL` |
| `REACT_APP_UX_SUPABASE_ANON_KEY` | build del frontend (harness) | `OSIRIS_STAGING_SUPABASE_PUBLISHABLE_KEY` |

Los valores los pegas tú; no pasan por el chat ni por el repositorio.

**Por qué `SMTP_OSIRIS_*`.** El aviso y el correo de prueba llaman a
`send-email.js` con `modulo: "osiris"`. Esa función toma `SMTP_OSIRIS_USER` y
`SMTP_OSIRIS_PASS`. Si faltan, responde "Cuenta SMTP no configurada para: osiris"
y **no** usa la cuenta de mediterra como respaldo.

**No se definen:**
- `RESPALDO_PERMITIR_PRODUCCION`. Sin ella el handler se niega a correr contra el
  proyecto productivo.
- `RESPALDO_MODO_IDENTIDAD`. En staging vale el defecto, `boveda`. `legacy` es solo para un
  origen sin bóveda `sec_*` y exige la decisión de identidad; ver
  `docs/osiris-tech/COBERTURA-RESPALDO.md`.
- `SMTP_MEDITERRA_*`, `SMTP_ALLEGRIA_*`, `SMTP_FRISKU_*`. Este flujo no las lee.
- `OSIRIS_STAGING_DATABASE_URL`, `SEC_BACKEND_DSN`. Son solo para scripts locales;
  nunca van a Vercel.

**Variables de sistema.** Las pone Vercel; no se crean.
- En el handler: `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_ENV` y
  `VERCEL_DEPLOYMENT_ID`.
- En el build: `REACT_APP_VERCEL_GIT_COMMIT_SHA`, que queda en
  `<meta name="commit-sha">` de la página.
- Con la exposición activada, Vercel define `CI=1` en el build y los warnings de CRA
  pasan a error. La rama compila con `CI=true`.

**Faltantes:** ninguna variable que el código lee queda sin origen. Tres valores no
existen en el archivo local y los defines tú: `RESPALDO_AVISO_TO`,
`CORREO_PRUEBA_PERMITIDOS` y el par `SMTP_OSIRIS_*`.

**A4 · Conectar Git.** **Settings** → **Git** → **Connect Git Repository** →
GitHub → `Mediterra-Finanzas/gestion-grupo-mediterra` → **Connect**.
Comprobación: **Deployments** sigue vacío. Si aparece alguno, debe decir
**Canceled** por el Ignored Build Step. Si hay uno **Building** o **Ready**,
detente y avísame.

**A5 · Fijar la rama de producción.** **Settings** → **Environments** →
**Production** → **Branch Tracking** → `runtime/staging-respaldo` → **Save**.

**A6 · Primer deployment, desde el commit exacto.** **Deployments** → **Create
Deployment** → pega el **SHA completo** que te entrego, no el nombre de la rama →
**Create Deployment**. Si Vercel pregunta a qué rama pertenece el commit, elige
`runtime/staging-respaldo`. Espera **Ready**.

**A7 · Confirmar el SHA antes de ejecutar funciones.** En el deployment:

1. **Environment** dice Production.
2. **Source** muestra la rama `runtime/staging-respaldo` y un commit cuyos 7
   primeros caracteres son los del SHA entregado.
3. **Settings** → **Cron Jobs** muestra solo `/api/osiris-respaldo-cron` con
   `0 7 * * *`.
4. Pásame el dominio de producción (**Settings** → **Domains**). Compruebo desde
   fuera, sin ejecutar ninguna función, que la página publicada lleva el mismo SHA.

Si algo no coincide, no pulses Run y avísame.

**A8 · Activar el cron.** Solo después de A7: **Settings** → **Cron Jobs** →
**Enable**, si lo desactivaste en A2.

---

## Cómo llega el runtime a la base de datos

El runtime **no abre conexiones PostgreSQL** ni necesita una cadena de conexión.
Todo va por HTTPS a PostgREST con `SUPABASE_SERVICE_ROLE_KEY`.

| Paso | Llamada | Qué garantiza |
|---|---|---|
| Reserva del lote | `POST /rest/v1/rpc/respaldo_reservar` | inserción atómica por clave primaria: dos invocaciones concurrentes no crean dos lotes; retoma FAILED, INCOMPLETO o CREATING vencido con el testigo `intento` |
| Snapshot | `POST /rest/v1/rpc/respaldo_snapshot` | función SQL `STABLE` de una sola sentencia; PostgREST la ejecuta en una transacción y todas las filas salen de la misma instantánea (`tomado_at`) |
| Identidades | `POST /rest/v1/rpc/respaldo_identidades` | solo pares hash → identity_id |
| Publicación y estado | `rpc/respaldo_publicar`, `rpc/respaldo_marcar`, `respaldo_lote` | publicar exige el mismo `intento` |
| Registro de invocación | `POST /rest/v1/respaldo_invocacion` | append-only por trigger; guarda commit, rama y entorno |

Permisos medidos en staging el 2026-09-10: `EXECUTE` de reservar, snapshot,
identidades, publicar y marcar solo para `service_role`; `anon` y `authenticated`
no tienen ninguno.

Requisitos previos en staging:
- `sql/respaldo/invocacion-despliegue.sql` (columnas del deployment). **Aplicado el
  2026-09-10.**
- `sql/respaldo/snapshot-consistente.sql` (identidades dentro del mismo snapshot). **No
  aplicado todavía.** Sin él, el handler preparado detiene la corrida con "snapshot sin
  identidades". Se aplica y se prueba con `prueba-snapshot-consistencia.mjs` antes de
  pedir el deployment.

La cadena `OSIRIS_STAGING_DATABASE_URL` (Supabase → **Connect** → **Session
pooler**, usuario `postgres`) vive solo en `.env.osiris-staging.local`, que está
excluido de git. La usan los scripts locales para DDL y verificación. No va a Vercel.

---

## Parte B · Comprobación, en estados que no se combinan

Cada invocación queda registrada en staging con su commit, en una tabla que no se
puede modificar ni borrar. **Ningún estado se deduce de otro**, y un estado
observado con un commit distinto del confirmado en A7 no cuenta.

**Qué se atribuye al runtime remoto.** Solo las invocaciones que llegan con
`deployment_id` y `vercel_env`, que pone Vercel. Las pruebas corridas desde una
computadora (tramo completo, restauración aplicada, login real aislado) quedan con esas
columnas vacías y **no cuentan** para B1–B4, aunque terminen en READY.
`verificar-runtime-remoto.mjs` informa las dos cantidades por separado.

**B3 no cierra la recuperación.** Con el lote remoto se corren después, como estados
propios, la restauración aplicada (`scripts/respaldo/restauracion-aplicada.mjs`) y el login
real contra lo restaurado (`scripts/respaldo/aislado/`).

El horario `0 7 * * *` es UTC. Desde el 2026-09-07 Chile está en UTC−3: el cron
corre entre las **04:00 y las 04:59 de Chile**.

### B1 · Run manual

1. Fuera de la franja 04:00–04:59 de Chile: **Settings** → **Cron Jobs** →
   `/api/osiris-respaldo-cron` → **Run**.
2. Espera un minuto y abre **View Logs**. Debe verse una respuesta `200`.
3. Avísame "Run hecho". Corro `verificar-runtime-remoto.mjs --sha=<SHA>` y te
   informo el estado 1 y el commit que efectivamente corrió.

Un Run exitoso **no** demuestra el disparo automático.

### B2 · Disparo automático por horario

1. **No pulses Run entre 04:00 y 04:59 de Chile** del día siguiente: una ejecución
   manual en esa franja no se distingue de la automática.
2. Después de las 05:00, avísame. Busco una invocación de Vercel dentro de la franja,
   con el mismo SHA, que haya terminado en READY.

### B3 · Descarga, descifrado y reconstrucción en memoria del lote remoto

No requiere nada tuyo. Descargo el lote que creó el runtime remoto, verifico los
SHA registrados, lo descifro con las claves A y B y lo reconstruyo en memoria.

Esto **no** es la restauración aplicada. Escribir el lote en un destino aislado y
verificar usuarios, permisos, relaciones y login desde lo escrito es otro paso,
con su propio resultado (`scripts/respaldo/restauracion-aplicada.mjs`).

### B4 · Entrega real del correo de prueba

1. Con `RESPALDO_CORREO_PRUEBA=si`, cada invocación envía un correo de prueba solo
   a `CORREO_PRUEBA_PERMITIDOS`.
2. Después del Run de B1, revisa ese buzón. Asunto:
   `Osiris · correo de prueba del respaldo`.
3. Avísame "correo recibido" o "no llegó". Informo dos cosas por separado:
   aceptado por SMTP (lo veo yo) y recibido (solo lo confirmas tú).

---

## Estado al corte

| Estado | Hoy |
|---|---|
| B1 · Run manual | NO OBSERVADO |
| B2 · Disparo automático | NO OBSERVADO |
| B3 · Reconstrucción en memoria del lote remoto | NO OBSERVADO |
| B4 · Correo aceptado / recibido | NO OBSERVADO / NO OBSERVADO |

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA** hasta observar B2 y B3.

# Pruebas reales main/pins: Vercel Preview + Supabase staging (configuración propuesta)

> **Estado: PREPARACIÓN, nada creado ni desplegado.** Crear o modificar staging, desplegar la Preview y enviar correos reales requieren autorización de Angelo (§7). La Preview nunca se conecta a producción y no se copian credenciales ni datos reales.

Rama: `claude/seguridad-main-pins`. Análisis hecho sobre el código, sin llamadas de red.
**Actualización:** el candado de la §2a ya está implementado en la rama (ver "Candado anti-producción").
Etiquetas: [Seguro] = leído en el código · [Probable] = inferido con buena base · [Suponiendo] = falta confirmarlo.

**Conclusión corta**
- El servidor (`/api/auth/*`, `/api/datos/*`) se puede aislar con variables de entorno.
- `api/frisku-sp.js` y `api/storage.js` usan ahora la misma regla que `_auth.js` (candado). `api/informe.js` sigue leyendo producción (solo lectura pública): T10 se hace en la etapa 2.
- **Actualización (aislamiento del navegador):** con las variables de build de la §2b.1, login, login fallido, recuperación, cambio de PIN obligatorio, hub, reseteo desde Permisos y "Salir" (también como admin y en lunes) ya no contactan producción. Lo prueba `scripts/e2e/aislamiento-interfaz.mjs` (§2b.2). Los módulos de negocio siguen con URL fija: no se abren en la Preview.
- Staging = **proyecto Supabase DEDICADO** (decisión tomada; su creación aún no está autorizada).
- Las pruebas HTTP (curl/scripts) siguen siendo la base; la interfaz las complementa (§2b.2).

---

## 1. Proyecto staging y objetos necesarios

### 1.1 Lo que ya existe en el repositorio
| Dato | Fuente |
|---|---|
| Staging = `gestion-mediterra-staging`, ref `nlvfjpwiecgrosjnwwik`; producción = ref `bywovqayuzodbzwsriet` | [Seguro] `supabase/_staging_target_guard.sql:5-6`, `scripts/test-persistencia-staging.mjs:8` |
| `_auth.js` espera `SUPABASE_URL` = staging en la Preview | [Seguro] `api/_auth.js:18-20` |
| El staging es **compartido**: lo usan proc/contab (`supabase/staging/*.sql`), las pruebas de persistencia (`tests/persistencia-staging/rt.mjs`, que hace DELETE de filas de prueba en `calendario_data`) y el piloto Osiris (`.claude/worktrees/osiris-piloto2/.env.osiris-staging.local`) | [Seguro] |
| No se sabe si `calendario_data` existe hoy en staging, ni con qué políticas (`20_gate_core.sql:77-80` solo avisa) | [Suponiendo] |
| osiris-auth corre hoy en otro proyecto, el **sandbox** `ipsjsfkmmryzoavyasrx` | [Seguro] `audit/E1.5-FASE1-EJECUTADO.md:5` |

**Riesgo del staging compartido** [Probable]: las fases A/B/C cierran `pins`, `usuarios` y `main` a anon en TODO el proyecto, y las guardas exigen la foto exacta de las 5 políticas. Si otro trabajo cambió esas políticas, las guardas abortan (`verificacion.sql` diría DESCONOCIDO). Y después de aplicar las fases, las pruebas de persistencia que escriben con anon quedarían rotas.
**Recomendación:** un proyecto Supabase NUEVO y dedicado (por ejemplo `mediterra-seg-staging`) o, si se usa el existente, coordinar una ventana y dejar la reversión preparada. **Lo decide Angelo.**

### 1.2 Orden de aplicación en staging (SQL Editor del proyecto staging; nunca en producción)
| # | Objeto | Archivo / origen |
|---|---|---|
| 0 | Confirmar el destino: ref en la barra y en la connection string ≠ `bywovqayuzodbzwsriet`; `select current_database()` y una lectura de `pg_roles` (roles `anon`, `authenticated`, `service_role` presentes) | `supabase/staging/00_preflight_readonly.sql` (adaptado: solo la parte de roles y tablas) |
| 1 | `public.calendario_data (id text pk, value jsonb not null, updated_at timestamptz default now())` + `grant all … to anon, authenticated, service_role` + RLS + las 5 políticas con nombre y texto EXACTOS (`cd_anon_auth_delete/insert/select/update`, `cd_service_all`) | Copiar el bloque SQL de `scripts/seguridad-main-pins/entorno.mjs:91-100`. **No** crear roles: Supabase ya los tiene. Si la tabla ya existe: no se toca hasta comparar con `verificacion.sql` |
| 2 | Triggers de producción `cd_scrub_main_credentials` + `guard_main_no_user_shrink` | `scripts/seguridad-main-pins/produccion_triggers_existentes.sql` |
| 3 | Rate limit: tabla `frisku_sp_ratelimit` + RPC `frisku_sp_rl_consumir`/`_limpiar` (solo `service_role`) | `api/sql/frisku_sp_ratelimit.sql` |
| 4 | (Opcional, igual que en la prueba local) `alter role anon set statement_timeout='3s'; alter role authenticated set statement_timeout='8s'` | `entorno.mjs:104`. Supabase ya trae valores parecidos [Probable] |
| 5 | Lecturas M1–M5 | `supabase/seguridad_main_pins/consultas_previas.sql` |
| 6 | `verificacion.sql` → debe decir **HOY** | `supabase/seguridad_main_pins/verificacion.sql` |
| 7 | Datos sintéticos: filas `usuarios`, `pins` y `main` (§4) | INSERT a mano o generado por script local |
| 8 | `fase0_admins.sql` + alta de 2 admins sintéticos | `supabase/seguridad_main_pins/fase0_admins.sql` (plantilla al final) |
| 9 | (Solo para T12) `user_osiris_accounts` con RLS y sin políticas, más 1 usuario en `auth.users` con correo sintético | No hay DDL en el repositorio: se creó a mano en el sandbox (`audit/E1.5-FASE1-EJECUTADO.md:13-15`) |
| 10 | Pruebas T1–T13 (estado HOY) → `faseA` → `verificacion` → `faseB` → `verificacion` → re-pruebas → `faseC` → `verificacion` (T14) | `supabase/seguridad_main_pins/fase{A,B,C}_*.sql` |
| 11 | Al final, de forma opcional: `reversion.sql` por secciones (prueba la reversión) o borrar el proyecto dedicado | `supabase/seguridad_main_pins/reversion.sql` |

---

## 2. Aislamiento (lo crítico)

### 2a. Servidor: cada archivo de `api/`
| Archivo | Variables que lee | Origen de la URL de Supabase | ¿Toca producción en la Preview? |
|---|---|---|---|
| `_auth.js` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` | `process.env.SUPABASE_URL \|\| "https://bywovqayuzodbzwsriet…"` (`:20`) | **SÍ, si falta `SUPABASE_URL`: cae a producción** [Seguro] |
| `_segServidor.js` | `AUTH_INACTIVIDAD_MIN`, `AUTH_RL_IP_MAX`, `AUTH_RL_ID_MAX`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_RATELIMIT_SECRET` (`:125,164-174`) | `A.SUPA_URL` de `_auth.js` (también el rate limit `:172`) | Igual que `_auth.js` |
| `_reglasLogin.js` | `AUTH_CREDENCIALES_DESDE` (`:79`) | — | No |
| `auth/[op].js` | `OSIRIS_VERIFICAR_SECRETO` (`:144`) + todo lo de `_segServidor` | `_auth.js` | Igual que `_auth.js`. El correo va por `send-email.js` |
| `datos/[fila].js` | lo de `_segServidor` | `_auth.js` | Igual que `_auth.js` |
| `send-email.js` | `SMTP_{OSIRIS,ALLEGRIA,FRISKU,MEDITERRA}_{USER,PASS}`; host fijo `smtp.office365.com:587`; `DESTINOS_PERMITIDOS`, `CORREO_DESTINOS_PERMITIDOS` (vía `_destinos.js`) | — | Fuera de producción solo envía a `CORREO_DESTINOS_PERMITIDOS` (sin la variable no envía nada) y solo si `smtp.office365.com` está en `DESTINOS_PERMITIDOS` |
| `_destinos.js` (nuevo) | `VERCEL_ENV`, `DESTINOS_PERMITIDOS`, `CORREO_DESTINOS_PERMITIDOS` | — | Lista de salidas. Activa solo con `VERCEL_ENV` ≠ `production` y (`VERCEL_ENV` o `DESTINOS_PERMITIDOS` definidas). En producción no hace nada. Rechaza siempre los hosts de producción. Log `[destino-no-autorizado]` sin contenido. Prueba: `node api/_destinos.test.mjs` |
| `frisku-sp.js` | `SUPABASE_SERVICE_ROLE_KEY`, `FRISKU_SP_RATELIMIT_SECRET`, `FRISKU_SP_SESSION_SECRET`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `FRISKU_SP_DRIVE_ID`, `FRISKU_SP_ALLOWED_ORIGINS`, `FRISKU_SP_ALLOWED_HOSTS` (`:234,264-275`) | **Fija en producción** (`:225`), para leer `usuarios`/`pins` y para su propio rate limit. Su `limiteLogin` usa `_segServidor` (staging) | **SÍ.** Sin `FRISKU_SP_ALLOWED_ORIGINS`/`HOSTS` responde 403 antes de cualquier fetch (`:136-137`) [Seguro] |
| `informe.js` | ninguna; llave **anon de producción fija** (`:5-6`) | **Fija en producción** | **SÍ, solo lectura**: Storage público `osiris-fotos` y la fila `osiris` completa (`:30-43`) |
| `storage.js` | `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` | **Fija en producción** (`:18`) | Mandaría la llave de servicio de staging a producción (rechazo 401) [Probable]. No llamarlo |
| `proc-reporting-daily-cron.js` | `CRON_SECRET` + `_auth.js` + SMTP `allegria` | `_auth.js` | Los crons de `vercel.json` corren solo en el despliegue de producción [Probable]. Sin `CRON_SECRET` responde 401 |
| `login.js`, `db/[...path].js` | — | — | 410 fijo |
| `_friskuSp*.js`, `_reportingScheduler.js` | reciben su configuración del llamador | — | — |

**Combinaciones peligrosas ANTES del candado** [Seguro por código] (las dos quedan bloqueadas por el candado; ver abajo):
1. Llave de servicio de PRODUCCIÓN en el ámbito Preview, sin `SUPABASE_URL` → la Preview leía y escribía `pins`, `usuarios` y `main` de producción.
2. Sin `SUPABASE_URL` pero con la llave de staging → peticiones a producción con una llave que producción rechaza. No escribía, pero mandaba un secreto de staging a producción.

En Vercel, una variable creada para "All Environments" también llega a la Preview [Probable]. **Lo primero es revisar P7** (nombres y ámbitos, sin valores).

**Variables que DEBEN existir con ámbito Preview** (idealmente limitadas a la rama `claude/seguridad-main-pins`): `SUPABASE_URL` (staging), `SUPABASE_SERVICE_ROLE_KEY` (staging), `SESSION_SECRET`, `AUTH_RATELIMIT_SECRET`, `OSIRIS_VERIFICAR_SECRETO` (todos nuevos), `SMTP_MEDITERRA_USER`/`_PASS` (casilla de prueba), `REACT_APP_AUTH_SERVER=true`, `REACT_APP_SUPA_URL`/`REACT_APP_SUPA_KEY` (staging, §2b). Opcionales: `AUTH_CREDENCIALES_DESDE` (solo para T7), `AUTH_RL_*`, `AUTH_INACTIVIDAD_MIN`.

**Variables que NO deben existir en el ámbito Preview:**
- Cualquier valor de producción de `SUPABASE_SERVICE_ROLE_KEY`.
- `SMTP_OSIRIS_*`, `SMTP_ALLEGRIA_*`, `SMTP_FRISKU_*` y el `SMTP_MEDITERRA_*` real.
- `CRON_SECRET`.
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `FRISKU_SP_DRIVE_ID` y cualquier `FRISKU_SP_*` con valores de producción (para T11, solo valores nuevos de prueba).
- `REACT_APP_EMAILJS_*`: si el SMTP falla, el navegador reintenta con EmailJS (`App.jsx:446-475`).
- `REACT_APP_USE_GUARD`.
- `REACT_APP_AUTH_DUAL`, `REACT_APP_OSIRIS_AUTH_URL`, `REACT_APP_SUPABASE_URL_SANDBOX`/`_ANON_KEY_SANDBOX`.

**Candado anti-producción (implementado en la rama, aviso por la regla 1 de CLAUDE.md):**
- `api/_auth.js` → `urlSupabase()`: usa `SUPABASE_URL` si existe. Si no existe, cae a la URL de producción **solo** con `VERCEL_ENV="production"` o fuera de Vercel.
- En una Preview o en desarrollo sin `SUPABASE_URL` no hay URL → `faltanSecretos()` → **503**. Nunca habla con producción, aunque por error tenga una llave.
- `frisku-sp.js` y `storage.js` usan la misma función.
- El valor en producción no cambia. Prueba: `node api/_auth.test.mjs` (5/5).
- `informe.js` no se tocó: lee con la llave pública lo que ya es público, sin escribir.
- La combinación peligrosa 1 queda bloqueada por código, pero **igual hay que revisar P7**: una llave de producción en el ámbito Preview sigue siendo un secreto expuesto donde no corresponde.

### 2b. Navegador
- [Seguro] Con `REACT_APP_AUTH_SERVER=true`, `main`, `usuarios` y `pins` van por `/api/*` (`App.jsx:144,175,252,273`). El sondeo de 30 s reemplaza al WebSocket (`:2580-2605`) y no hay presencia.
- [Seguro] `App.jsx` (`:120,123`), `friskuHelpers.js:12-13` y `persistencia/persistContract.js:49-51` aceptan `REACT_APP_SUPA_URL`/`KEY` al compilar. Usar esas variables NO cambia constantes: es el mecanismo "DEV/UAT override" que ya existe.
- [Seguro] Tienen la URL fija y NO se redirigen: `FinanzasModule.jsx:218`, `AllegriaModule.jsx:19`, `OsirisModule.jsx:66,4945`, `FriskuModule.jsx:18`, `ContabilidadModule.jsx:6`, `eeffHelpers.js:5`, `anf/anfPersistence.js:6`, `currency/store.js:11`.

**Peticiones a producción ANTES de abrir un módulo**, con el valor por defecto (sin `REACT_APP_SUPA_URL`):
| Momento | Petición | ¿Escribe? | Cita |
|---|---|---|---|
| Login correcto (+5 s). El login fallido NO escribe: `auditLog` descarta los eventos sin usuario salvo `"login"` (corregido tras la prueba en navegador) | GET `audit_log` y luego POST upsert de **todo** `audit_log` con el evento agregado | **SÍ.** Además, si el GET falla, escribe `[]` + el evento: **borra la auditoría de la base a la que apunte** | `App.jsx:330-373` |
| Logout o cierre por inactividad | lo mismo (`auditFlush`) | **SÍ** | `:3052-3056,3081` |
| Login de un usuario con `rol:"admin"` (+5 s) | GET de **todas** las filas de `calendario_data` salvo `backup_*`/`pins`/`usuarios`/`main` (finanzas, nóminas…) con la llave anon. Después, correo resumen a **ahuerta@grupomediterra.cl** (dirección real) | Lectura masiva + correo real. El efecto **no** depende de `BACKUP_AUTOMATICO_SUSPENDIDO` | `:2709-2780` |
| Admin, los lunes | Alertas de tareas a los responsables. El padrón se fusiona con `WORKERS_BASE`, que tiene correos reales de empleados (`:598-605,2272-2280`) | Correo real a empleados | `:2840-2873` |
| Cada 30 s | GET `https://gestion-grupo-mediterra.vercel.app/` (detector de versión nueva) | No (lectura del sitio público) | `:2102-2137` |
| Botones 💾 Respaldo y 📤 Restaurar (admin, manuales) | Lectura masiva / **upsert** de filas | Restaurar **escribe** | `:1658,1729` |

**Conclusión** [Seguro]: abrir la Preview en el navegador con la configuración por defecto NO está aislado. Un solo login (aunque falle) escribe en `audit_log` de producción.

Con las variables de la §2b.1, `audit_log` y la lectura masiva van a staging y el detector de versión al mismo origen [Seguro, probado en navegador, §2b.2]. Los correos a direcciones reales (respaldo, alertas de los lunes) los rechaza `CORREO_DESTINOS_PERMITIDOS`. Queda: todos los módulos de negocio siguen apuntando a producción (no abrirlos).

**Método que mantiene el aislamiento:**
1. **Vercel Deployment Protection** (Vercel Authentication o contraseña) en la Preview. Los scripts pasan con el header `x-vercel-protection-bypass` (Protection Bypass for Automation) [Probable].
2. T1–T8, T10–T13 **solo por HTTP** (curl o scripts Node) contra `/api/auth/*` y `/api/datos/*`. Nunca se carga la interfaz.
3. La interfaz solo para T9, con estas condiciones:
   - build con `REACT_APP_SUPA_URL`/`KEY` de staging;
   - usuario sintético **no admin** con `modulos:["tareas"]`;
   - no abrir ningún módulo;
   - bloquear `*.bywovqayuzodbzwsriet.supabase.co` en DevTools (Network request blocking) o con una extensión, y revisar la pestaña Network.
4. Nunca usar la Preview con cuentas reales.

### 2b.1 Navegador aislado: variables de build (ámbito Preview)
| Variable | Valor | Efecto |
|---|---|---|
| `REACT_APP_AUTH_SERVER` | `true` | main/usuarios/pins por `/api/*`; sin WebSocket |
| `REACT_APP_SUPA_URL` / `REACT_APP_SUPA_KEY` | URL y llave **anon** de staging | `audit_log` (login/salida), lectura del respaldo diario del admin. Comprobado: todas las llamadas del shell (`App.jsx`) usan `SUPA_URL`/`SUPA_KEY` |
| `REACT_APP_URL_VERSION` | `.` (mismo origen) | El detector de versión deja de pedir `gestion-grupo-mediterra.vercel.app` cada 30 s |
| `REACT_APP_EMAILJS_DESACTIVADO` | `true` (opcional) | El respaldo EmailJS ya queda apagado con solo definir `REACT_APP_SUPA_URL`; esta variable lo deja explícito |

Cambios en el código (sin variables = igual que hoy):
- EmailJS (`App.jsx`, `emailHelper.js`) no se usa si `REACT_APP_SUPA_URL` está definida o con `REACT_APP_EMAILJS_DESACTIVADO=true`. Tampoco se intenta si faltan las llaves `REACT_APP_EMAILJS_*` ni si el servidor respondió `destino_no_autorizado`. **Ojo:** `emailHelper.js` y el correo de bienvenida tenían llaves EmailJS **fijas en el código**: sin este cambio, un 403 del servidor hacía que el navegador reenviara el mismo correo por EmailJS, saltándose la lista.
- Los correos del navegador (respaldo diario a Angelo, alertas de los lunes, bienvenida) van a `/api/send-email` de la Preview y los filtra `CORREO_DESTINOS_PERMITIDOS`. **Hallazgo:** el padrón se completa con `WORKERS_BASE` por nombre, así que un usuario sintético con nombre real (ej. "Pablo Duran") recibe el correo REAL del empleado. La lista lo rechaza; igual, usar nombres que no existan en `WORKERS_BASE`.
- Sin service workers y sin WebSocket en modo servidor (comprobado). Google Fonts (`public/index.html`) sigue saliendo a `fonts.googleapis.com`: es un tercero público, no producción, y no lleva datos.

### 2b.2 Detector de salidas (prueba local, sin red)
`POSTGREST_BIN=… OUT_DIR=… node scripts/e2e/aislamiento-interfaz.mjs`
- Arma el build con las variables de la §2b.1 (URL local fija `127.0.0.1:54329` y llave marcador; un proxy local la cambia por la llave anon del entorno, que cambia en cada corrida).
- Registra y bloquea antes de salir: cada petición HTTP (`context.route` + `on('request')`), cada WebSocket (`routeWebSocket` + `on('websocket')`), service workers, las salidas `fetch` de los handlers del servidor y cada correo (transporte SMTP simulado; los códigos del servidor pasan por el envío real con la lista).
- Recorre la interfaz: login fallido, login de editor, Salir, "¿Olvidaste tu PIN?" con el código del correo y cambio de PIN obligatorio, Salir, login de ADMIN con la fecha del navegador en un lunes (respaldo diario + alertas), Permisos → Resetear PIN, Salir.
- Falla si algo va a un host distinto del origen de la app o del Supabase local, o si un correo enviado no está en la lista.
- Control positivo: fetch, beacon, imagen y WebSocket a hosts `.invalid`, correo a una dirección no permitida y una salida del servidor a otro host deben aparecer como detectados.
- Resultado (2 corridas): todo OK; 0 salidas no autorizadas en el recorrido; los correos a `@grupomediterra.cl` (respaldo, resumen y alerta del lunes) respondieron 403 sin enviarse.

### 2b.3 Variables de la Preview (solo nombres) y secretos
- Servidor: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `AUTH_RATELIMIT_SECRET`, `OSIRIS_VERIFICAR_SECRETO`, `SMTP_MEDITERRA_USER`/`_PASS`, `DESTINOS_PERMITIDOS` (host de staging + `smtp.office365.com`), `CORREO_DESTINOS_PERMITIDOS` (casillas de prueba o `@dominio-de-prueba`).
- Navegador (se compilan): `REACT_APP_AUTH_SERVER`, `REACT_APP_SUPA_URL`, `REACT_APP_SUPA_KEY` (anon de staging), `REACT_APP_URL_VERSION`; opcional `REACT_APP_EMAILJS_DESACTIVADO`.
- Los valores se cargan directamente en el panel de Vercel (Settings → Environment Variables, ámbito Preview y rama) y en el de Supabase staging. **Nunca se pegan en el chat**, en el repositorio ni en documentos. Las `REACT_APP_*` quedan dentro del JavaScript público: solo la llave **anon**, jamás la de servicio.

### 2c. Edge functions
- **osiris-auth** [Seguro] (`supabase/functions/osiris-auth/index.ts:23-29`):
  - Variables automáticas: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (plan B: `SANDBOX_SERVICE_KEY`).
  - Variables propias: `PROD_APP_URL`, `OSIRIS_VERIFICAR_SECRETO`, `ALLOWED_ORIGINS`.
  - Recomendación: desplegar una copia en el proyecto **staging** con `PROD_APP_URL` = URL de la Preview, `OSIRIS_VERIFICAR_SECRETO` = el mismo valor nuevo de la Preview y `ALLOWED_ORIGINS` = origen de la Preview.
  - **No tocar** la del sandbox `ipsjsfkmmryzoavyasrx`, que podría estar en uso (P8).
  - Choque con la protección [Probable]: la función llama `${PROD_APP_URL}/api/auth/verificar` sin el header de bypass. Opciones:
    - (i) abrir la protección solo durante T12;
    - (ii) poner el bypass como parámetro de consulta dentro de `PROD_APP_URL` [Suponiendo, truco sin probar];
    - (iii) probar `/api/auth/verificar` directo con curl y header `x-mediterra-secreto`, y dar la lógica de la función por cubierta con la prueba local.
- **frisku-sp**: dejarla **sin configurar** en la Preview. Sin `FRISKU_SP_ALLOWED_ORIGINS` responde **403** `origen_no_permitido` (no 503) sin ninguna petición de red.
  - Con el candado, `frisku-sp.js` lee `SUPABASE_URL` (staging). T11 se puede ejecutar en la Preview configurando **solo** el login de Frisku SharePoint con valores nuevos de prueba: `FRISKU_SP_SESSION_SECRET`, `FRISKU_SP_RATELIMIT_SECRET`, `FRISKU_SP_ALLOWED_ORIGINS` y `FRISKU_SP_ALLOWED_HOSTS` (origen y host de la Preview). Las variables de Azure no se configuran: el login no las usa y las operaciones de SharePoint responderán con error.

### 2d. Correo
- [Seguro] `send-email.js` usa nodemailer con **host fijo `smtp.office365.com:587`** y `tls.rejectUnauthorized:false`. Un servicio SMTP de prueba (Mailtrap u otro) **no sirve sin cambiar código**.
- Propuesta:
  - una **casilla M365 dedicada a pruebas** (por ejemplo `pruebas-seguridad@<dominio>`), con SMTP AUTH habilitado y contraseña propia, que se revoca al terminar. Solo se carga `SMTP_MEDITERRA_USER`/`PASS` en el ámbito Preview;
  - destinatarios: solo casillas designadas para pruebas (los correos de los usuarios sintéticos).
- El texto del código lleva el enlace de producción fijo (`_segServidor.js:186`). Hay que avisar a quienes prueban que **no lo abran**.
- **Relay** [Seguro]: `/api/send-email` queda abierto en la URL de la Preview (CORS `*`, sin autenticación, cualquier destinatario y HTML; `send-email.js:46-70`). Hay que activar Deployment Protection y borrar la Preview, o al menos rotar la contraseña de la casilla de prueba, al terminar.

---

## 3. Variables (solo nombres; ámbito: **Preview**, rama `claude/seguridad-main-pins`)
| Nombre | Para qué | Fuente | ≠ producción |
|---|---|---|---|
| `SUPABASE_URL` | Apunta `_auth`/`_segServidor` a staging | Panel de staging (URL) | Sí (en producción no existe) |
| `SUPABASE_SERVICE_ROLE_KEY` | E/S del servidor + RPC | Panel de staging (preferir la `service_role` JWT clásica; con `sb_secret_` el header Bearer puede fallar [Suponiendo]) | **Sí** |
| `SESSION_SECRET` | Firma de la cookie | Aleatorio nuevo (≥32 bytes) | **Sí** |
| `AUTH_RATELIMIT_SECRET` | Buckets HMAC del contador | Aleatorio nuevo | **Sí** |
| `OSIRIS_VERIFICAR_SECRETO` | `/api/auth/verificar` (T12) | Aleatorio nuevo; el mismo valor en osiris-auth de staging | **Sí** |
| `SMTP_MEDITERRA_USER` / `SMTP_MEDITERRA_PASS` | Códigos de recuperar y reseteo | Casilla M365 de prueba | **Sí** |
| `REACT_APP_AUTH_SERVER` | `true`: cliente en modo servidor (se compila) | Fijo `true` | — |
| `REACT_APP_SUPA_URL` / `REACT_APP_SUPA_KEY` | `audit_log`, respaldo y Frisku hacia staging en la interfaz | Panel de staging (URL + **anon**) | **Sí** |
| `REACT_APP_URL_VERSION` | Detector de versión al mismo origen | Fijo `.` | — |
| `DESTINOS_PERMITIDOS` | Hosts de salida del servidor fuera de producción | Host de staging + `smtp.office365.com` | Sí (en producción no se usa) |
| `CORREO_DESTINOS_PERMITIDOS` | Destinatarios permitidos fuera de producción (sin ella no se envía nada) | Casillas de prueba | Sí (en producción no se usa) |
| `AUTH_CREDENCIALES_DESDE` | Solo para T7 (fecha ISO), y quitarla después | Fecha de la prueba | — |
| `AUTH_RL_IP_MAX`, `AUTH_RL_ID_MAX`, `AUTH_INACTIVIDAD_MIN` | Dejarlas sin definir: se prueban los valores por defecto (30 / 8 / 30) | — | — |
| **osiris-auth (staging):** `PROD_APP_URL`, `OSIRIS_VERIFICAR_SECRETO`, `ALLOWED_ORIGINS` | T12 | URL de la Preview / el mismo aleatorio / origen de la Preview | **Sí** |

---

## 4. Datos de prueba (sintéticos; no se copia ninguna fila de producción)
Nombres que no existen en `WORKERS_BASE`; correos en casillas de prueba (alias `+` del buzón de prueba si el dominio los acepta [Suponiendo]).

| Usuario | Rol / estado | `pins` |
|---|---|---|
| T-Admin1 | `rol:"admin"`, en `seg_administradores` | `_h` vigente (pol `6dig`, fecha de hoy) |
| T-Admin2 | `rol:"admin"`, en `seg_administradores` | `_h` vigente |
| T-Editor | editor, `modulos:["tareas"]` (T2, T8, T9) | `_h` vigente |
| T-Celular | editor con `_tel` (ej. `569…` ficticio) | `_h` vigente + `_tel` |
| T-Desactivado | `desactivado:true` | `_h` vigente |
| T-SinH | sin `_h` (solo entra por recuperar o reseteo) | — |
| T-Vencido | `_h` con `fecha` hace 70 días | (debe cambiar el PIN) |
| T-Politica | `_h` sin `pol` | (debe cambiar el PIN) |
| T-Admin-solo-rol | `rol:"admin"` en el padrón pero NO en `seg_administradores` (prueba que el rol no da admin) | `_h` vigente |

- Hash: `node -e` con `require('./api/_reglasLogin.js').hashPin('<6 dígitos>')`. Al objeto devuelto se le agrega `pol:"6dig"` y `fecha` y se guarda `JSON.stringify(cred)` en `pins["<Nombre>_h"]`, como en `evaluarCambioPin` (`_reglasLogin.js:237-241`). Se corre en local, sin red.
- Los PIN de prueba se entregan aparte; nunca van al repositorio.
- `main` mínima: `{estados:{},comentarios:{},tareasConfig:{},…,usuarios:[espejo]}`.
- La fila `usuarios` **debe existir antes**: si falta, el primer admin que entra por la interfaz la siembra con los empleados reales de `WORKERS_BASE` (`App.jsx:2361`).
- Nada de producción: ni filas, ni hashes, ni padrón, ni llaves.

---

## 5. T1–T14: método
| # | Método | ¿Correo real? |
|---|---|---|
| T1 | curl | No |
| T2 | curl/script (9 logins con PIN incorrecto) | No |
| T3 | script en 2 máquinas o IP distintas, simultáneo, mismo correo | No |
| T4 | curl `recuperar` → leer el código en la casilla → `login` + `cambiar-pin` → reintentar el código (debe fallar) | **Sí** |
| T5 | curl `admin-reset-pin` (Admin1→Editor, Admin2→Admin1) + `sesion` con la cookie anterior → 401 | **Sí** (avisa al reseteado) |
| T6 | SQL Editor de staging (bloque de `servidor.md:127-133`) + curl | No |
| T7 | Agregar `AUTH_CREDENCIALES_DESDE` + volver a desplegar la Preview → curl login (`debe_recuperar`) → recuperar | **Sí** |
| T8 | script con cookie guardada: cambiar el PIN y reenviar; esperar 31 min y reenviar | No |
| T9 | **Navegador** Chrome/Edge (salvaguardas §2b, usuario no admin) | No |
| T10 | curl con id inyectado. **Ojo: lee producción** (Storage público + fila `osiris`, solo lectura). Recomendación: no correrla en la Preview y hacerla en la etapa 2 | No |
| T11 | curl a `/api/frisku-sp` `{op:"login"}` con origen permitido, después de 8 fallos en `/api/auth/login` → 429 (§2c) | No |
| T12 | curl a `/api/auth/verificar` con el secreto; osiris-auth de staging solo si se resuelve la protección (§2c) | No |
| T13 | (a) revocar EXECUTE de la RPC a `service_role` en staging → login 503 → restaurar; (b) quitar `SESSION_SECRET` del ámbito Preview, volver a desplegar → 503, y reponer | No |
| T14 | SQL Editor de staging (§1.2, pasos 5-10) + curl anon a `/rest/v1/calendario_data?id=in.(pins,usuarios)` contra **staging** → 0 filas tras B | No |

---

## 6. Comprobaciones previas obligatorias (antes de cualquier prueba)
1. Vercel → Settings → Environment Variables (solo nombres y ámbitos): ninguna variable de producción alcanza el ámbito Preview (lista de §2a). Existen `SUPABASE_URL` y la llave de staging en el ámbito Preview.
2. Despliegue de la Preview: confirmar que el commit es el de la rama y que Deployment Protection está activa (un curl sin bypass debe dar 401/redirección de Vercel).
3. Producción, solo lectura en el SQL Editor de producción: `select id, updated_at from calendario_data where id in ('pins','usuarios','main','audit_log')`. Guardar el resultado (**antes**).
4. Staging: `select id, updated_at from calendario_data` y `verificacion.sql` = HOY.
5. Prueba de destino:
   - `GET /api/datos/roster` sin sesión debe dar 401;
   - `POST /api/auth/login` con T-Editor debe dar 200 → `GET /api/auth/sesion` devuelve **el usuario sintético**. Eso prueba que lee staging, porque el usuario no existe en producción;
   - después, `updated_at` de `usuarios`/`pins` en staging cambió o no según corresponda, y en producción **no** cambió.
6. Después de cada sesión de pruebas: repetir el paso 3 (**después**) y comparar. Cualquier diferencia en `pins`/`usuarios`/`main`/`audit_log` atribuible a la prueba = detener todo.
7. Correo: enviar 1 código de prueba solo a una casilla de prueba y revisar el remitente (casilla de prueba, no una real).

---

## 7. Lo que Angelo debe autorizar y entregar
**Autorizaciones [AUT]:**
1. Usar el staging existente `nlvfjpwiecgrosjnwwik` (compartido) o crear uno dedicado.
2. Crear y modificar objetos en staging (§1.2), incluidas las fases 0/A/B/C y, si se quiere, la reversión.
3. Crear y cambiar variables de entorno con ámbito Preview (limitadas a la rama) y desplegar la Preview de `claude/seguridad-main-pins`.
4. Activar Deployment Protection en la Preview y generar el bypass para automatización.
5. Desplegar osiris-auth en staging (T12) y, si corresponde, abrir la protección durante T12.
6. Enviar correos reales a casillas de prueba (T4, T5, T7).
7. Volver a desplegar la Preview para T7 y T13b.
8. Visto bueno al candado anti-producción ya implementado: toca las constantes `SUPA_URL` del servidor (regla 1), aunque el valor en producción no cambia.

**Información que debe entregar:**
- ref, URL y llaves (anon + service_role) de staging, o del nuevo proyecto;
- equipo y proyecto de Vercel, con acceso de quien despliega;
- P7: lista de variables actuales con su ámbito;
- casilla M365 de prueba (con SMTP AUTH habilitado) y casillas destinatarias;
- confirmar que staging no tiene copias de datos de producción;
- P8: estado de osiris-auth en el sandbox.

**Al terminar:**
- borrar la Preview, o dejarla protegida;
- rotar o borrar todos los secretos de prueba y la contraseña de la casilla;
- quitar `AUTH_CREDENCIALES_DESDE`;
- revertir o borrar staging según lo decidido.

# Plan de pruebas en staging: main/pins, D4 y aislamiento

> **Código bajo prueba:** commit `cb8b364` (rama `claude/seguridad-main-pins`). Los commits posteriores solo agregan documentación.
> **Estado:** plan, nada ejecutado.
> **Requiere [AUT] antes de empezar:** crear el staging dedicado, la Preview y enviar correos a destinatarios definidos.
> Producción, permisos, triggers y merge siguen fuera.
>
> Configuración detallada: `docs/seguridad-preview-staging.md`.

## Alcance

**Dentro del alcance:**
- login, sesión y salida en el servidor;
- límite de intentos (D4) y recuperación con el código de 12 caracteres;
- reseteo del administrador;
- fases SQL D/0/A/B/C con su verificación y reversión;
- aislamiento de la Preview (servidor, navegador y correo).

**Fuera del alcance:**
- **Osiris dual** (`REACT_APP_AUTH_DUAL`, función en el sandbox): no está activa hoy. `osiris-auth` no se despliega y `OSIRIS_VERIFICAR_SECRETO` no se carga, así que `/api/auth/verificar` debe responder 503.
- **Frisku SharePoint:** solo se prueba su login (T11), sin las variables de Azure.
- **Módulos de negocio:** no se abren en la Preview, porque su URL de producción está fija en el código.

## Criterio global de aprobación (todos obligatorios)

1. **Cero contacto con producción:**
   - el `updated_at` de `pins`, `usuarios`, `main` y `audit_log` en producción, leído antes y después de cada sesión de pruebas, es idéntico;
   - el registro de red del navegador no muestra el host de producción.
2. **Cero salidas fuera de la lista:**
   - el navegador solo llega al origen de la Preview, al Supabase de staging y a Google Fonts;
   - el servidor solo llega a staging y a `smtp.office365.com`;
   - los correos solo salen a `CORREO_DESTINOS_PERMITIDOS`.
3. **Cada prueba de la tabla cumple su resultado esperado.**

**Una prueba fallida detiene la sesión.** Si la falla es un bloqueante, se corrige en la rama y se repite desde la fase afectada. No se aprueba por mayoría.

## S0. Preparación (sin pruebas)

| # | Paso | Responsable | Comprobación |
|---|---|---|---|
| S0.1 | Crear el proyecto Supabase dedicado | Dueño de la organización Supabase | La ref ≠ `bywovqayuzodbzwsriet`. No contiene datos de producción |
| S0.2 | Aplicar en staging, en orden: tabla `calendario_data` con las 5 políticas y permisos de producción; triggers existentes; `frisku_sp_ratelimit.sql`; `seg_intentos.sql` | Quien tenga acceso al SQL Editor de staging (o yo, si se me da acceso solo a staging) | `verificacion.sql` → **HOY** |
| S0.3 | Cargar datos sintéticos generados en local: 9 usuarios de prueba y 2 admins en `seg_administradores`. Nombres que **no** existan en el padrón real | Ídem | Ninguna fila ni hash de producción |
| S0.4 | Variables de la Preview (solo en el entorno Preview y solo para esta rama), cargadas **directo en el panel de Vercel** | Admin del proyecto Vercel | Ninguna variable de producción en ese entorno (P7). `VERCEL_ENV` llega a las funciones (P12) |
| S0.5 | Activar Deployment Protection en la Preview | Admin de Vercel | Sin acceso autorizado: 401 o redirección |
| S0.6 | Casilla M365 de prueba como remitente. Su contraseña se carga directo en Vercel | Admin de M365 | Envío de prueba solo a una casilla de la lista |

## S1. Aislamiento (antes de cualquier otra prueba)

| # | Prueba | Aprobada si |
|---|---|---|
| A1 | Desplegar una Preview **sin** `SUPABASE_URL` y llamar `GET /api/auth/sesion` y `POST /api/auth/login` | 503, sin conexión a ninguna base |
| A2 | Con `SUPABASE_URL` apuntando a staging: login de un usuario sintético → `GET /api/auth/sesion` | Devuelve el usuario sintético (no existe en producción) |
| A3 | `/api/send-email` a una dirección fuera de la lista | 403 `destino_no_autorizado`; nada enviado |
| A4 | Lectura de solo lectura del `updated_at` de producción, antes y después de A1–A3 | Idéntico |

## S2. Servidor por HTTP (estado HOY de staging)

| # | Prueba | Aprobada si |
|---|---|---|
| T1 | `GET /api/auth/sesion` sin cookie | 401 |
| T2 | 6 PIN incorrectos desde una IP; luego el PIN correcto desde otra IP | 5 × 401; el 6º → 429 con `Retry-After` ≈ 60 s (luego 120…, tope 3600); la otra IP entra |
| T3 | 10 fallos de una cuenta: 5 desde la red A (oficina) y 5 desde la red B (otra conexión). Luego el PIN correcto desde una red C (datos móviles) y desde el equipo ya reconocido en la red A | Red C → 403 `verificacion_requerida`; equipo reconocido → 200. La lógica con 10 o más orígenes y dos instancias ya está probada en local (47/47) |
| T4 | "¿Olvidaste tu PIN?" con correo **real** a una casilla de prueba | Llega **un** correo con el código `XXXX-XXXX-XXXX`, válido 45 min, que dice "tu PIN actual sigue vigente". El PIN sigue entrando. Un 2º pedido dentro de los 45 min no envía otro correo. Con el código: debe crear un PIN nuevo. Después, el código → 401 |
| T5 | Admin 1 resetea a un usuario; admin 2 resetea al admin 1 | Ambos 200 con código. El correo dice "PIN anterior inhabilitado". La sesión del reseteado cae. Su equipo deja de ser reconocido |
| T6 | Código de recuperación por SQL Editor (bloque del documento técnico), en staging | Entra solo a crear un PIN; vence en 2 h |
| T7 | Corte de credenciales (`AUTH_CREDENCIALES_DESDE`) y nuevo despliegue de la Preview | PIN anterior → 401 `debe_recuperar`; recuperación por correo → entra |
| T8 | Copia de cookie: cambiar el PIN y reenviarla; 31 min sin uso y reenviarla; "Salir" en una sesión y reenviar la copia de otra | 401 en los tres casos |
| T9 | 20 intentos simultáneos desde una IP (contador compartido entre instancias) | ≤ 5 evaluados; el resto 429 |
| T10 | `/api/informe?id=<script>` | Sin ejecución (`Content-Security-Policy: sandbox`); 503 si falta `SUPABASE_URL` |
| T11 | Frisku SharePoint con el umbral por cuenta activo: desde IP nueva y desde el equipo reconocido | 403 `verificacion_requerida` / entra |
| T12 | `/api/auth/verificar` (Osiris, fuera del alcance) | 503 (sin secreto configurado) |
| T13 | Quitar `SESSION_SECRET` (nuevo despliegue) | 503 para todos; se repone y vuelve a funcionar |

## S3. Interfaz en el navegador (Preview, Chrome y Edge de escritorio, Safari o Chrome móvil)

Registro de red del navegador activo durante toda la sesión, con el dominio de producción bloqueado.

| # | Recorrido | Aprobada si |
|---|---|---|
| U1 | Login con PIN incorrecto y luego correcto | Mensajes correctos; entra al hub |
| U2 | "¿Olvidaste tu PIN?" → **copiar y pegar** el código desde el correo (con y sin espacios al final), en escritorio y en móvil | Acepta el código pegado; obliga a crear el PIN; con el PIN nuevo entra |
| U3 | Pegar el código ya usado (después de completar la recuperación) | Rechazado |
| U4 | Esperar a que venza un código (45 min) y usarlo | Rechazado |
| U5 | "Salir" y luego volver atrás o recargar | Pide login. Una copia de la cookie tomada antes → 401 |
| U6 | Cerrar y restaurar el navegador ("continuar donde lo dejaste") | Se documenta. Esperado: la sesión sigue solo si no pasaron 30 min |
| U7 | Admin → Permisos → Resetear PIN de un usuario | Muestra el código; el usuario recibe el correo (solo una casilla de la lista) |
| U8 | Registro de red de U1–U7 | Solo los destinos de la lista; 0 peticiones a producción; 0 WebSocket |

## S4. Fases SQL en staging

| # | Paso | Aprobada si |
|---|---|---|
| F1 | `faseA` desde HOY | Aborta sin cambios ("aplicar primero faseD") |
| F2 | `faseD`; repetir `faseD` | D; la segunda vez no hace nada. Anon no borra; "Restaurar" (upsert) y el guardado siguen |
| F3 | `fase0` + 2 admins → `faseA` + `faseB` | `verificacion.sql` → B. Anon recibe 0 filas de `pins`/`usuarios`. S2/S3 abreviado (T1, T2, T4, U1, U5) sigue aprobado |
| F4 | `faseC` | → C; las Tareas funcionan por `/api/datos/main` |
| F5 | `reversion.sql` por secciones (C→B→A→D→HOY) y completo | Cada estado detectado. HOY idéntico a la foto inicial |
| F6 | Alterar una política a mano y ejecutar cualquier fase o la reversión | Aborta sin tocar nada (DESCONOCIDO) |

## S5. Cierre y evidencia

- **Informe:** cada prueba con fecha y hora, resultado, evidencia (respuesta HTTP o captura) y la comparación de `updated_at` de producción antes y después.
- **Limpieza:**
  - borrar la Preview, o dejarla protegida;
  - rotar o borrar los secretos de prueba y la contraseña de la casilla;
  - quitar `AUTH_CREDENCIALES_DESDE`;
  - pausar o borrar el proyecto de staging según lo decidido.
- **Lo que esta validación NO autoriza:** nada en producción. Cada etapa de activación tiene su propia [AUT] (checklist, §4).

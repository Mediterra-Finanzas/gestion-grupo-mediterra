# Seguridad main/pins: lado SERVIDOR

Rama `claude/seguridad-main-pins`. Nada de esto está aplicado ni desplegado en producción.
El contrato con el cliente es el de la rama (modo servidor con `REACT_APP_AUTH_SERVER=true`).

## Problema que cierra

Hoy la llave pública (anon) puede leer la fila `pins` (los hashes de todos), escribirla
(dejar un código provisorio para cualquier cuenta, incluida la de un admin, y tomarla) y
escribir `usuarios` (darse rol admin). La prueba lo reproduce en el punto (a).

## Endpoints

| Ruta | Qué hace |
|---|---|
| `POST /api/auth/login` `{email,pin}` | 200 sesión `completa` o 200 `debeCambiarPin` con cookie `cambio_pin` (motivo `temp`, `politica` o `vencido`); 401 `credenciales`; 403 `desactivado`; 429 `bloqueado` |
| `POST /api/auth/cambiar-pin` `{pinActual?,pinNuevo,tel?}` | Con cookie `cambio_pin` y la credencial sin cambios no pide `pinActual`; con sesión `completa` sí. 400 `pin_invalido` o `pin_repetido` |
| `POST /api/auth/recuperar` `{email,tel?}` | Siempre 200. Si corresponde, guarda el hash del código en `<Nombre>_temp` (vence en 45 min) y lo envía por correo (SMTP de `send-email.js`) |
| `GET /api/auth/sesion` | 200 `{usuario,scope,admin}`; 401 si el usuario está desactivado o ya no existe (se relee en cada llamada) |
| `POST /api/auth/logout` | Borra la cookie |
| `POST /api/auth/admin-reset-pin` `{nombre}` | Solo para quien esté en `seg_administradores`: 200 `{ok,codigo,correoEnviado}` |
| `POST /api/auth/verificar` | Servidor a servidor (osiris-auth), con header `x-mediterra-secreto` |
| `GET /api/datos/roster`, `GET /api/datos/usuarios` | Padrón sin credenciales (el segundo trae también `version`) |
| `PUT /api/datos/usuarios` `{valor,version}` | Solo admin. Rechaza campos de credenciales (`pin` con valor, `*_h`, `*_temp`, `pinsPersonalizados`…). Conserva los campos guardados que el navegador no ve. OCC: devuelve 409 `{version}` si la versión no coincide |
| `GET /api/datos/main`, `PATCH /api/datos/main` `{patch,version}` | Tareas sin `usuarios` ni `pinsPersonalizados`. Las claves de configuración las puede cambiar un admin o quien tenga Config = `editar`. Un valor idéntico al guardado se acepta siempre. El servidor reescribe el espejo `main.usuarios` para el trigger anti-encogimiento. OCC con 409 |

Archivos: `api/auth/[op].js`, `api/datos/[fila].js` (las dos únicas funciones nuevas),
`api/_reglasLogin.js` (reglas puras, una sola implementación), `api/_segServidor.js`
(E/S con la llave de servicio), `api/_auth.js` (cookie HMAC con `scope`; sin rol).

**Admin** = fila activa en `public.seg_administradores`, leída en cada petición. Nunca cuenta
el rol de `main` o `usuarios`, ni la cookie.

## Reglas de login (las mismas que hoy aplica `App.jsx`)

1. Una cuenta desactivada queda bloqueada.
2. Si existe `_temp` (vigente o vencido), es el único acceso posible. Si está vencido se
   rechaza; si el código es correcto, obliga a cambiar el PIN. Un `_temp` antiguo en texto
   plano también se acepta, pero siempre obliga al cambio.
3. Si no hay `_temp`, se valida contra `_h`. En el servidor **no hay respaldo a PIN en texto
   plano**: quien no tenga `_h` entra por "¿Olvidaste tu PIN?".
4. Un `_h` sin `pol:"6dig"` o con más de 60 días obliga a cambiar el PIN.
5. Una cookie `cambio_pin` solo sirve para `cambiar-pin`. Cualquier otra ruta responde 403
   y `api/storage.js` responde 401.

`api/frisku-sp.js` lee ahora la fila `usuarios` en vez de `main.usuarios`.
`supabase/functions/osiris-auth` ya no lee filas de producción: llama a `/api/auth/verificar`.
Si el PIN debe cambiarse, no emite sesión.

## Fases SQL (`supabase/seguridad_main_pins/`)

Cada archivo se ejecuta completo. Antes de cambiar nada comprueba la foto exacta de las 5
políticas y de los privilegios: si no coincide con lo esperado aborta sin tocar nada, y si
la fase ya estaba aplicada no hace nada.

| Archivo | Efecto | Requiere antes |
|---|---|---|
| `fase0_admins.sql` | Crea `seg_administradores` (RLS sin políticas; solo SELECT para service_role) | Nada. Después: dar de alta al primer admin (plantilla al final del archivo) |
| `faseA_bloquear_escritura.sql` | anon/authenticated no escriben `pins` ni `usuarios` ni borran `main`; se revocan TRUNCATE/REFERENCES/TRIGGER | Fase 0 con al menos un admin activo, variables de Vercel, endpoints desplegados y cliente en modo servidor |
| `faseB_bloquear_lectura.sql` | Tampoco leen `pins` ni `usuarios` | Fase A; frisku-sp y osiris-auth de esta rama desplegados |
| `faseC_cerrar_main.sql` | `main` cerrada a anon (lectura y escritura) | Fase B; cliente que usa solo `/api/datos/main`; recuperación probada |
| `verificacion.sql` | Solo lectura: estado detectado y lo esperado por fase. Las pruebas como anon se deshacen siempre | — |
| `reversion.sql` | Una sección por fase. Ejecutado completo deja exactamente la foto de hoy | — |

## Recuperar acceso con la fase C aplicada

1. "¿Olvidaste tu PIN?": el código llega por correo.
2. Un admin de `seg_administradores` ejecuta `admin-reset-pin`.
3. Último recurso, desde el SQL Editor:
   `update calendario_data set value = jsonb_set(value,'{<Nombre>_temp}','"<6 dígitos>"') where id='pins';`
   Con ese código la persona entra **solo** a crear un PIN nuevo, y el código desaparece al
   cambiarlo. Para dar admin a otra persona, usar `insert into seg_administradores …`.

## Variables (solo nombres)

- **Vercel:** `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `AUTH_RATELIMIT_SECRET`,
  `OSIRIS_VERIFICAR_SECRETO`, `SMTP_MEDITERRA_USER`, `SMTP_MEDITERRA_PASS`.
  Opcionales: `AUTH_RL_IP_MAX` (30), `AUTH_RL_ID_MAX` (8) y `SUPABASE_URL` (solo staging).
- **Supabase, Edge Function osiris-auth:** `PROD_APP_URL`, `OSIRIS_VERIFICAR_SECRETO`.
  `PROD_URL` y `PROD_ANON_KEY` quedan sin uso.
- El rate limit usa la RPC `frisku_sp_rl_consumir` (`api/sql/frisku_sp_ratelimit.sql`). Si
  falla, el login responde 503 (fallo cerrado).

## Pruebas

```bash
for f in api/*.test.mjs; do node "$f"; done        # incluye _reglasLogin (54) y frisku-sp (102)
POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-main-pins/prueba-servidor.mjs   # 144 comprobaciones
```

`prueba-servidor.mjs` levanta `entorno.mjs` con Postgres 16 y PostgREST 12 locales, las
políticas, privilegios y triggers de producción, y datos de prueba. Cubre (a) las
vulnerabilidades actuales, (b) todos los endpoints, (c) las fases 0, A, B y C aplicadas en
orden (anon bloqueado y la app sigue funcionando), (d) la recuperación de acceso y (e) la
reversión. También corre la lógica real de osiris-auth bajo Node, con un shim de Deno y un
sandbox simulado. Resultado del 2026-10-06: 144 correctas, 0 fallas.

## Limitaciones

- La foto de las políticas se probó con el texto que genera PG16. Si producción imprime las
  expresiones de otra forma, las guardas abortan sin aplicar nada: comparar primero con
  `verificacion.sql`.
- Las sesiones `completa` ya abiertas no se cortan cuando se emite un código provisorio. Sí
  se cortan al desactivar al usuario.
- Tras la fase A, "📤 Restaurar" con la llave pública ya no repone `pins` ni `usuarios`.
- Un usuario nuevo creado con `PUT /api/datos/usuarios` no tiene PIN: el admin le emite un
  código con `admin-reset-pin`.
- No se probó contra Vercel ni contra Supabase reales. El envío SMTP real tampoco se probó:
  en las pruebas los correos se capturan.

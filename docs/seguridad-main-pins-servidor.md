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
| `POST /api/auth/login` `{email,pin}` | 200 sesión `completa` o 200 `debeCambiarPin` con cookie `cambio_pin` (motivo `temp`, `politica` o `vencido`); 401 `credenciales`; 401 `debe_recuperar` (corte de credenciales); 403 `desactivado` (solo con la credencial correcta); 429 `bloqueado` |
| `POST /api/auth/cambiar-pin` `{pinActual?,pinNuevo,tel?}` | Con cookie `cambio_pin` y la credencial sin cambios no pide `pinActual`; con sesión `completa` sí. 400 `pin_invalido` o `pin_repetido` |
| `POST /api/auth/recuperar` `{email,tel?}` | Siempre 200 y nunca antes de 3 s (el tiempo no revela si el correo existe). Si corresponde, guarda el hash del código en `<Nombre>_temp` (vence en 45 min) y lo envía por correo (SMTP de `send-email.js`). No cierra sesiones abiertas |
| `GET /api/auth/sesion` | 200 `{usuario,scope,admin}`; 401 si el usuario está desactivado o ya no existe (se relee en cada llamada) |
| `POST /api/auth/logout` `{revocar}` | Borra la cookie. Con `revocar:true` cierra TODAS las sesiones de la persona (época); `{revocado}` dice si se confirmó |
| `POST /api/auth/admin-reset-pin` `{nombre}` | Solo para quien esté en `seg_administradores`: 200 `{ok,codigo,correoEnviado}`. Sube `<Nombre>_epoca`: todas las sesiones de esa persona quedan cerradas |
| `POST /api/auth/verificar` | Servidor a servidor (osiris-auth), con header `x-mediterra-secreto`. Comparte el contador de intentos del login (`login:<email>`) |
| `GET /api/datos/roster`, `GET /api/datos/usuarios` | Padrón sin credenciales (el segundo trae también `version`) |
| `PUT /api/datos/usuarios` `{valor,version}` | Solo admin. Rechaza campos de credenciales (`pin` con valor, `*_h`, `*_temp`, `pinsPersonalizados`…). Conserva los campos guardados que el navegador no ve. OCC: devuelve 409 `{version}` si la versión no coincide |
| `GET /api/datos/main`, `PATCH /api/datos/main` `{patch,version}` | Tareas sin `usuarios` ni `pinsPersonalizados`. Las claves de configuración las puede cambiar un admin o quien tenga Config = `editar`. Un valor idéntico al guardado se acepta siempre. El servidor reescribe el espejo `main.usuarios` para el trigger anti-encogimiento. OCC con 409 |

Archivos: `api/auth/[op].js`, `api/datos/[fila].js` (las dos únicas funciones nuevas),
`api/_reglasLogin.js` (reglas puras, una sola implementación), `api/_segServidor.js`
(E/S con la llave de servicio), `api/_auth.js` (cookie HMAC con `scope`; sin rol).

**Admin** = fila activa en `public.seg_administradores`, leída en cada petición. Nunca cuenta
el rol de `main` o `usuarios`, ni la cookie.

## Reglas de login (las de `App.jsx`, con cuatro diferencias deliberadas)

1. Una cuenta desactivada queda bloqueada. **Diferencia:** se informa "desactivada" solo si
   la credencial es correcta; con una incorrecta la respuesta es la genérica (no revela que
   la cuenta existe). Todos los caminos cuestan un PBKDF2, exista o no el correo.
2. Si existe `_temp` (vigente o vencido), es el único acceso posible. Si está vencido se
   rechaza; si el código es correcto, obliga a cambiar el PIN. **Diferencia:** un código en
   texto plano solo vale con `<Nombre>_temp_exp` vigente (lo fija el SQL de recuperación);
   sin vencimiento no sirve, para que no quede una puerta permanente.
3. Si no hay `_temp`, se valida contra `_h`. **Diferencia:** en el servidor no hay respaldo a
   PIN en texto plano ni se elige "el primero" con correos o nombres repetidos: esas
   personas entran por "¿Olvidaste tu PIN?" o con un reseteo del admin (contarlas con M4).
4. Un `_h` sin `pol:"6dig"` o con más de 60 días obliga a cambiar el PIN.
5. **Corte de credenciales (opcional, `AUTH_CREDENCIALES_DESDE`, nuevo):** todo `_h` o `_temp`
   emitido antes de esa fecha (o sin sello `ts`, es decir, todos los de hoy) deja de dar
   acceso: login 401 `debe_recuperar` y la persona recupera por correo. Existe porque
   **todos los hashes de PIN estuvieron accesibles con la llave pública** (exposición; no hay
   evidencia de descarga, y la ausencia de registros no la descarta): el espacio de un PIN de
   6 dígitos es pequeño (medición puntual en el contenedor de pruebas, no garantía general:
   ~16 ms por intento y núcleo, ~4,5 h para los 10^6), y "obligar a cambiar el PIN" no
   sirve porque el cambio pide el PIN antiguo. Ver el checklist, etapa 4.
6. Una cookie `cambio_pin` solo sirve para `cambiar-pin`. Cualquier otra ruta responde 403
   y `api/storage.js` responde 401.

`api/frisku-sp.js` aplica las mismas reglas (código pendiente, PIN vencido, corte).

## Sesión

**Dónde vive el control:** en la cookie firmada (HMAC con `SESSION_SECRET`): `act` (último
uso), `exp` (12 h) y `fp` (huella); y en la base, fila `pins`: PIN vigente y
`<Nombre>_epoca`. El servidor relee en cada petición `usuarios` y `pins` (cualquier
instancia). No hay tabla de sesiones: la revocación es por persona.

- Cookie `HttpOnly; Secure; SameSite=Strict` **sin `Max-Age`**: se descarta al cerrar el
  navegador, como hoy `sessionStorage`. Vencimiento absoluto 12 h.
- **Inactividad en el servidor:** 30 min sin peticiones (`AUTH_INACTIVIDAD_MIN`) → 401. Cada
  petición renueva el último uso (máximo una vez por minuto). Con la pestaña abierta, el
  sondeo de 30 s mantiene la sesión; ahí manda el cierre por inactividad del navegador
  (30 min sin teclado/ratón → logout).
- **Huella de credencial:** la sesión lleva la huella del PIN vigente + `<Nombre>_epoca`. Al
  cambiar el PIN se cierran las demás sesiones de esa persona; un reseteo del admin las
  cierra todas. Pedir un código (público) no cierra ninguna. Cuesta una lectura de `pins`
  por petición (con la llave de servicio).
- Una cookie emitida antes de este cambio (sin huella) se rechaza: hay que volver a ingresar.
- **"Salir"** (`POST /api/auth/logout {revocar:true}`, JSON obligatorio): con una sesión
  "completa" cuya huella sigue vigente, sube `<Nombre>_epoca` con escritura condicionada →
  todas las sesiones y copias de esa persona quedan inválidas en toda instancia. Responde
  `{revocado:true}`; si la base no responde, 503 `{revocado:false}` (la app avisa). Una copia
  ya inválida no revoca nada (no puede cerrar las sesiones nuevas). `{revocar:false}` (cierre
  por inactividad de una pestaña) solo borra la cookie local. Prueba con dos procesos:
  `scripts/seguridad-main-pins/prueba-revocacion.mjs`.
- Un navegador que restaura la sesión puede conservar la cookie aunque no tenga `Max-Age`;
  la corta la inactividad del servidor (comprobado con copias reales, en tiempo real).

## Límite de intentos

Contadores en Postgres (RPC `frisku_sp_rl_consumir`, fila bloqueada con `FOR UPDATE`),
compartidos por todas las instancias; sin estado en memoria; si fallan → 503. Claves: `ip`
(30/5 min) y `login:<email>` (8/5 min, bloqueo 15 min) en login; `verificar` (osiris-auth) y
`api/frisku-sp.js` usan el MISMO `login:<email>`; `recuperar` cuenta `ip` y
`recuperar:<email>`; `cambiar-pin` cuenta `cambio:<nombre>`. El piso de 3 s de `recuperar`
es adicional al contador, no lo reemplaza.

## /api/informe

Sirve HTML guardado (Storage público y fila `osiris`) desde el dominio de la app. Va con
`Content-Security-Policy: sandbox` (sin scripts, origen opaco) y el `id` escapado: un
`<script>` reflejado o guardado no corre ni puede usar la cookie. Prueba en navegador:
`node scripts/seguridad-main-pins/prueba-informe.mjs`.

## Filas dañadas

Si `pins`, `usuarios` o `main` existen pero su valor no se puede leer como JSON (o no tiene
la forma esperada), el servidor responde 503 y **no escribe**: tratarla como vacía borraría
todos los PIN (`recuperar` es público) o las Tareas.

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
3. Último recurso, desde el SQL Editor (antes, M1 debe decir `pins | jsonb | object`):
   ```sql
   update calendario_data
      set value = value || jsonb_build_object('<Nombre>_temp', '<6 dígitos al azar>',
                  '<Nombre>_temp_exp', (extract(epoch from now() + interval '2 hours') * 1000)::bigint),
          updated_at = now()
    where id = 'pins' and jsonb_typeof(value) = 'object';   -- debe decir UPDATE 1
   ```
   Con ese código la persona entra **solo** a crear un PIN nuevo; vence en 2 horas y
   desaparece al cambiar el PIN. Para dar admin a otra persona:
   `insert into seg_administradores (email, motivo, otorgado_por) values (...)`.
4. Si el servidor responde 503 a todos (faltan `SESSION_SECRET` o la llave de servicio, o la
   RPC del rate limit falla), **nadie entra, admins incluidos**: corregir la variable en
   Vercel y volver a desplegar, o Instant Rollback al despliegue anterior en modo servidor.
   No se reabren permisos: ver el checklist, secciones 5 y 6.

## Variables (solo nombres)

- **Vercel:** `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `AUTH_RATELIMIT_SECRET`,
  `OSIRIS_VERIFICAR_SECRETO`, `SMTP_MEDITERRA_USER`, `SMTP_MEDITERRA_PASS`.
  Opcionales: `AUTH_RL_IP_MAX` (30), `AUTH_RL_ID_MAX` (8), `AUTH_INACTIVIDAD_MIN` (30),
  `AUTH_CREDENCIALES_DESDE` (fecha ISO del corte; sin ella no hay corte; con un valor
  inválido el login responde 503) y `SUPABASE_URL` (solo staging).
- **Supabase, Edge Function osiris-auth:** `PROD_APP_URL`, `OSIRIS_VERIFICAR_SECRETO`.
  `PROD_URL` y `PROD_ANON_KEY` quedan sin uso.
- El rate limit usa la RPC `frisku_sp_rl_consumir` (`api/sql/frisku_sp_ratelimit.sql`). Si
  falla, el login responde 503 (fallo cerrado).

## Pruebas

```bash
for f in api/*.test.mjs; do node "$f"; done        # incluye _reglasLogin (73), _friskuSpAuth (35) y frisku-sp (107)
POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-main-pins/prueba-servidor.mjs   # 180 comprobaciones (~3 min)
node scripts/seguridad-main-pins/prueba-informe.mjs   # 7, en Chromium
```

`prueba-servidor.mjs` levanta `entorno.mjs` con Postgres 16 y PostgREST 12 locales, las
políticas, privilegios y triggers de producción, y datos de prueba. Cubre (a) las
vulnerabilidades actuales, (b) todos los endpoints, (c) las fases 0, A, B y C aplicadas en
orden (anon bloqueado y la app sigue funcionando), (d) la recuperación de acceso y (e) la
reversión, además de sesión (sin Max-Age, inactividad, huella, reseteo que expulsa), filas
dañadas, corte de credenciales, tiempos de `recuperar` y las consultas M1/M4/M5. También
corre la lógica real de osiris-auth bajo Node, con un shim de Deno y un sandbox simulado.

## Limitaciones

- La foto de las políticas se probó con el texto que genera PG16. Si producción imprime las
  expresiones de otra forma, las guardas abortan sin aplicar nada: comparar primero con
  `verificacion.sql`.
- Pedir un código provisorio no corta las sesiones abiertas (a propósito: es público). Las
  cortan el cambio de PIN, el reseteo del admin y la desactivación.
- `api/storage.js` valida la firma y el vencimiento de la cookie, pero no la huella ni la
  inactividad (no relee `pins`). Hoy no tiene uso; corregirlo antes de usarlo.
- El piso de 3 s de `recuperar` no oculta un SMTP que tarde más de 3 s.
- `GET/PATCH /api/datos/main` no exige el módulo Tareas (igual que hoy): cualquier usuario
  activo lee y cambia `estados`/`comentarios`. Cerrarlo es simple, pero antes hay que
  confirmar que ningún usuario sin Tareas carga `main` al entrar.
- Tras la fase A, "📤 Restaurar" con la llave pública ya no repone `pins` ni `usuarios`.
- Un usuario nuevo creado con `PUT /api/datos/usuarios` no tiene PIN: el admin le emite un
  código con `admin-reset-pin`.
- No se probó contra Vercel ni contra Supabase reales. El envío SMTP real tampoco se probó:
  en las pruebas los correos se capturan.

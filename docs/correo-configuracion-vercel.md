# Correo protegido: configuración en Vercel (no desplegado)

Estado: **preparado, sin desplegar**. Este documento no contiene ningún secreto. Los
secretos se generan en tu computador y se pegan solo en el panel de Vercel. No van por chat,
correo ni al repositorio.

Configurar las variables **no cambia producción**: Vercel las aplica recién en el siguiente
despliegue. Producción sigue con el código actual hasta que autorices desplegar.

## 1. Las tres variables nuevas

| Variable | Qué es | Valor |
|---|---|---|
| `CORREO_SESSION_SECRET` | Firma de la sesión de correo (cookie). Si se filtra, alguien podría fabricar sesiones. | Aleatorio, 48 bytes o más |
| `CORREO_RATELIMIT_SECRET` | Convierte correo/IP en claves opacas para el limitador de intentos y la identidad de envío. | Aleatorio, distinto del anterior |
| `CORREO_ORIGENES` | Sitios desde los que se acepta la petición, separados por coma, sin `/` final. | `https://gestion-grupo-mediterra.vercel.app` y tu dominio propio, si lo usas |

Ya existen y no cambian: `SMTP_*_USER`/`SMTP_*_PASS` y `SUPABASE_SERVICE_ROLE_KEY`. Esta
última ya la usa SharePoint Frisku.

## 2. Generar los dos secretos (en tu computador)

Corre dos veces uno de estos comandos, una vez por secreto. Cada valor se copia **directo** al
panel de Vercel; no lo guardes en un archivo ni lo envíes por chat.

```bash
# macOS / Linux (o Git Bash en Windows)
openssl rand -base64 48

# Cualquier sistema con Node instalado
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

```powershell
# PowerShell
$b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
```

## 3. Cargarlas en Vercel

1. Vercel → proyecto **gestion-grupo-mediterra** → **Settings** → **Environment Variables**.
2. **Add New**, una variable a la vez:
   - Key: `CORREO_SESSION_SECRET`. Value: el primer secreto. Environments: **solo Production**.
     Marca **Sensitive** (después no se puede volver a leer, solo reemplazar).
   - Key: `CORREO_RATELIMIT_SECRET`. Value: el segundo secreto. Solo Production, Sensitive.
   - Key: `CORREO_ORIGENES`. Value: `https://gestion-grupo-mediterra.vercel.app`, más tu dominio
     propio si lo usas, separado por coma. Solo Production.
3. **No** hagas Redeploy. El despliegue va aparte, con tu autorización.

¿Por qué solo Production? Una vista previa (Preview) tiene otra dirección y no está en
`CORREO_ORIGENES`. Sin las variables, el endpoint de esa vista responde 503 y no envía nada:
falla cerrado, que es lo que se quiere.

## 4. Comprobar antes de desplegar (solo lectura)

- **Función del limitador.** El correo usa `frisku_sp_rl_consumir`, la misma de SharePoint
  Frisku. Confírmalo en el SQL Editor con la transacción de solo lectura de
  `supabase/consulta_metadatos_solo_lectura.sql`, o con
  `BEGIN READ ONLY; SELECT proname FROM pg_proc WHERE proname = 'frisku_sp_rl_consumir'; ROLLBACK;`.
  Si no existe, el correo responde 503 (falla cerrado) hasta crearla. Crearla es una migración
  y requiere tu aprobación.
- **Quién podrá enviar.** La sesión de correo exige una credencial de 6 dígitos (`pol:"6dig"`).
  Quien todavía tenga un PIN antiguo verá sus correos en «correos sin enviar» hasta cambiar su
  PIN. Las cinco personas del aviso de `files.zip` deben cambiarlo de todos modos.

## 5. Después de desplegar (cuando lo autorices), sin enviar correos

Estas pruebas no envían ningún mensaje:

```bash
URL=https://gestion-grupo-mediterra.vercel.app/api/send-email
# Origen ajeno → 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL -H "Origin: https://otro.test" -H "Content-Type: application/json" -d '{"accion":"notificacion"}'
# Formato del relé antiguo, sin sesión → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL -H "Origin: https://gestion-grupo-mediterra.vercel.app" -H "Content-Type: application/json" -d '{"to":"x@y.test","subject":"x","message":"x"}'
# Cerrar sesión → 200 y una cookie con Max-Age=0
curl -s -i -X POST $URL -H "Origin: https://gestion-grupo-mediterra.vercel.app" -H "Content-Type: application/json" -d '{"accion":"cerrar"}' | grep -i -E "^HTTP|set-cookie"
```

Un 503 con `no_configurado` significa que falta `CORREO_SESSION_SECRET` en ese despliegue.

## 6. Después del despliegue

- Borra de Vercel las variables `REACT_APP_EMAILJS_*`. El código nuevo ya no las usa, pero CRA
  incrusta en el bundle cualquier `REACT_APP_*` que el código lea al compilar.
- EmailJS sigue abierto aunque la app ya no lo use. Ver
  `docs/propuesta-transicion-emailjs-urls.md`, fases E-1 y E-4. Hasta hacerlas, **el correo no
  está protegido**.
- Para rotar un secreto, reemplaza su valor en Vercel y vuelve a desplegar. Rotar
  `CORREO_SESSION_SECRET` cierra todas las sesiones de correo; cada persona la renueva con su PIN
  desde el aviso «correos sin enviar» o al volver a ingresar.

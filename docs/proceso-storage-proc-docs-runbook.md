# Runbook — Provisión del bucket privado `proc-docs` (documentos de proceso)

**Estado: pendiente de provisión.** NO conectar a producción desde aquí. Este runbook
describe los pasos exactos para crear el bucket que usan los documentos contractuales
(T10d, `procStorage.js`). Reutiliza el mismo patrón que `nominas-docs` (bucket privado +
signed URL); si se prefiere, puede **reutilizarse infraestructura equivalente** en lugar de
crear uno nuevo (ver §7).

## 1. Bucket
- **Nombre / id:** `proc-docs`
- **Público:** NO (privado). Los documentos NO se sirven por URL pública; se accede vía
  **signed URL temporal** (default 1 h) generada bajo demanda (`urlFirmadaProc`).
- Creación: en el **dashboard de Supabase → Storage → New bucket** (la key `anon` no puede
  crear buckets). Marcar "Private bucket".

## 2. Tipos MIME / tamaño
- MIME permitidos sugeridos: `application/pdf`, `image/png`, `image/jpeg`, `image/webp`,
  documentos office (`application/vnd.openxmlformats-officedocument.*`).
- Tamaño máximo sugerido por archivo: **10 MB** (configurable en las policies de Storage o
  validación previa en la UI). Un contrato escaneado rara vez excede esto.

## 3. Convención de path
`contratos/{empresaSlug}/{clienteSlug}/{codigo}-v{version}-{archivoSlug}`
- Generada por `slugPath()` (sin acentos ni espacios), ver `src/proceso/core/procStorage.js`.
- El **path** es lo único que se persiste (`proc_cliente_contrato.documento_path`). Nunca se
  guarda una URL (expira). Las versiones históricas conservan su propio path (no se
  sobrescriben ni se borran físicamente).

## 4. Policies de Storage (RLS del bucket)
El objetivo es el mismo modelo tenant-scoped del resto de `proc_*`. Como el bucket es
privado, el acceso se hace con signed URL. Policies mínimas (Storage → Policies → `proc-docs`):
- **INSERT/UPDATE (upload):** permitido a `authenticated`; denegado a `anon`.
- **SELECT (crear signed URL):** permitido a `authenticated`; denegado a `anon`.
- **DELETE:** restringido (los documentos históricos NO se borran; ver §6). Preferible no
  otorgar DELETE a `authenticated`, o limitarlo a un rol administrativo.
- Si se implementa aislamiento por tenant a nivel Storage, condicionar por el primer segmento
  del path (`empresaSlug`) cuando exista identidad autenticada con `empresa_id` (hoy la app
  corre como `anon`; ver la deuda CORE-IDENTITY-TENANCY-001). **No crear una policy permisiva
  `TO anon USING(true)`.**

## 5. Signed URL
- Se genera con `urlFirmadaProc(path, ttl)` (`POST /storage/v1/object/sign/proc-docs/{path}`),
  TTL por defecto 3600 s. La URL **no se persiste**: se pide al abrir el documento.

## 6. No borrado físico
- Cargar una versión nueva de un contrato NO borra la anterior: cada `proc_cliente_contrato`
  (versión) guarda su propio `documento_path`. El historial es inmutable. No configurar
  lifecycle/expiración que elimine objetos.

## 7. Alternativa: reutilizar infraestructura existente
Si se decide no crear un segundo bucket, se puede reutilizar `nominas-docs` (ya privado, con
signed URL) usando un prefijo propio `proc-contratos/...`. Trade-off: mezcla contextos en un
mismo bucket (menos limpio para el bounded context de proceso). Recomendado sólo si crear
`proc-docs` no es viable a corto plazo. En ese caso, ajustar `PROC_BUCKET` en `procStorage.js`
y el prefijo del path.

## 8. Prueba de aceptación (post-provisión, en DEV/UAT, NO producción)
1. Desde Ficha Cliente → Agregar contrato → adjuntar un PDF de prueba → Guardar.
   - Esperado: `documento_path` poblado; el archivo aparece en el bucket bajo el path de §3.
2. En la fila del contrato → botón **Ver** → abre el PDF vía signed URL (nueva pestaña).
   - Esperado: se abre; la URL expira tras el TTL.
3. Cargar una **segunda** versión → verificar que la v1 sigue existiendo en el bucket (no se
   borró) y que ambas filas conservan su `documento_path`.
4. Con la key `anon` (sin signed URL) intentar `GET` directo del objeto → **denegado**.

## 9. Rollback
- El bucket es aditivo: si algo falla, deshabilitar el input de archivo en la UI (los
  contratos siguen funcionando sin documento; "cargar documento ≠ firmar", el estado no
  depende del archivo). Eliminar el bucket sólo si está vacío. Los `documento_path`
  persistidos quedarían colgando (sin objeto) pero no rompen la app (el botón "Ver" avisa
  que no se pudo generar el enlace).

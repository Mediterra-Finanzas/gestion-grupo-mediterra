# Auditoría funcional — pérdida de datos y exposición (13-10-2026)

> **Tercera tanda (13-10).** Rama `claude/auditoria-funcional`, con `main` 778a397 integrado
> (commit de integración aeb6dbf). Todo lo de esta tanda se probó sobre esa base. **No desplegado.**
>
> **El correo NO está protegido todavía.** Sigue abierta una vía que el código no puede
> cerrar: la clave pública de EmailJS (`bwCBq7…`, expuesta en `files.zip`, en el historial y en
> los bundles publicados hasta hoy) y su plantilla `template_notif_tarea`, que acepta cualquier
> destinatario. Cualquiera puede llamar `api.emailjs.com` directamente, sin pasar por la app. Se
> cierra solo desde el panel de EmailJS: fases E-1 y E-4 de
> `docs/propuesta-transicion-emailjs-urls.md`, sin ejecutar. Además, producción sigue con el código
> anterior, que tiene el relé abierto y el respaldo por EmailJS.
>
> **Hecho en la rama:**
> - **La app ya no usa EmailJS.** Se quitaron los 6 respaldos (código provisorio, notificaciones,
>   aviso de respaldo, bienvenida, informe de Osiris y `emailHelper`) y las claves del código.
>   Ni un 5xx ni una falla de red derivan el envío a EmailJS. Lo vigila
>   `src/__tests__/correoSinRespaldo.test.js`, que falla si vuelve a aparecer `api.emailjs.com` o
>   la clave.
> - **Errores visibles y reintento sin duplicar.** Un envío que no sale queda en «correos sin
>   enviar» (`src/CorreosPendientes.jsx`), con su motivo y los botones Reintentar y Descartar.
>   Cada envío lleva una identidad (`idEnvio`) que el servidor consume justo antes de enviar, así
>   que repetirlo no manda otro correo. Si el SMTP falla después de consumirla, el servidor
>   responde que ese intento **no salió** (`reintento:"nuevo"`) y el siguiente usa otra identidad.
>   El reporte diario usa la ejecución como identidad. Al salir se descartan los pendientes: no se
>   reintentan con la sesión de otra persona.
> - **Revocación de la sesión de correo.** La cookie queda atada a la credencial vigente con una
>   huella HMAC que no revela el hash. Deja de valer en el siguiente envío cuando:
>   - cambia el PIN;
>   - se emite un código provisorio (como el login, que inhabilita el PIN anterior);
>   - la persona se desactiva;
>   - pasan 12 h.
>
>   Al cerrar sesión se borra la cookie (`Max-Age=0`). Una sesión vencida o revocada se renueva
>   con el PIN desde el mismo aviso, sin perder los pendientes.
> - **Restauración sin cambios de acceso.** Un respaldo ya no escribe `usuarios`, `pins` ni
>   `permisos_facultades`. Dentro de `main` conserva el espejo `usuarios` de hoy, que es el que
>   siembra la fila `usuarios` si faltara, y en `rendiciones_config` los aprobadores de hoy. Las
>   diferencias se informan por persona, sin credenciales, para revisarlas por separado:
>   - quien sigue desactivada;
>   - perfil, módulos y permisos por pestaña;
>   - personas que el respaldo recrearía;
>   - credenciales que el respaldo devolvería.
>
>   Si una fila de acceso no existe hoy, tampoco se restaura sola.
> - **`.gitignore`.** Revisé el árbol y el historial completo: el único comprimido versionado fue
>   `files.zip`. El expediente de Nóminas en ZIP se arma en el navegador al descargarlo
>   (`FinanzasModule`) y no pasa por el repositorio. Por eso se mantiene `*.zip`. Un ZIP legítimo
>   se versiona con `git add -f` y agregando su ruta a `PERMITIDOS` en
>   `src/__tests__/sinArchivosSensibles.test.js`, que es una revisión explícita.
>
> **Evidencia** (local, Chromium emulado, datos y credenciales ficticios, correo simulado, ningún
> mensaje real):
> - `api/send-email.test.mjs`: 56/56. Cubre revocación R1–R7 e identidad de envío I0–I7, con
>   cinco reintentos simultáneos.
> - `correoSinRespaldo.test.js`: 8/8.
> - `src/restaurarRespaldo.test.mjs`: todo OK, con los casos 10–14 nuevos.
> - Navegador:
>   - `scripts/e2e/correo-pendientes.mjs`: 12/12. Cubre 5xx, red, 502, 401 con renovación por
>     PIN y salir, con 0 peticiones a EmailJS.
>   - `restauracion-completa.mjs`: todo OK, con persona desactivada después del respaldo.
>   - `correo-acciones.mjs`: OK.
>   - `auditoria-persistencia.mjs`: OK, 12/12 eventos con escrituras simultáneas.
> - jest completo: 2.067 pasan, en UTC y en America/Santiago.
>
> **Configuración para desplegar:** `docs/correo-configuracion-vercel.md`.
>
> **Límites conocidos:**
> - Cerrar sesión borra la cookie del navegador, pero una copia del token sigue valiendo hasta que
>   vence (12 h), salvo cambio de PIN, código provisorio o desactivación. Revocar al instante
>   exige guardar estado en el servidor (estructura nueva).
> - Si la respuesta se pierde **y además** el SMTP falló en ese mismo intento, el reintento se
>   informa como «ya procesado» sin haber salido. Queda en el registro `[correo]` de Vercel.
> - Quien tenga un PIN antiguo (no de 6 dígitos) no podrá abrir sesión de correo hasta cambiarlo.
>
> **Pendientes de decisión:**
> - Restaurar accesos por separado: hoy, si la fila `usuarios` o `pins` se perdiera, el respaldo no
>   la repone. Hay que decidir un paso explícito con revisión, o el SQL Editor.
> - Los supervisores de Tareas (`main.supervisores`) se restauran como dato de Tareas. Si los
>   consideras responsables de aprobación, deberían conservarse como los accesos.


> **Segunda tanda (13-10).** Rama `claude/auditoria-funcional`, sin desplegar.
>
> - **E1 corregido en la rama:** `/api/send-email` exige una sesión verificada en el servidor y
>   solo acepta acciones permitidas. `api/send-email.test.mjs` pasa 37/37 con correo simulado.
>   El control sobre `main` envía a un destinatario externo con `Allow-Origin: *`.
> - **E2:** `files.zip` salió del árbol, `*.zip` quedó en `.gitignore` y una prueba lo vigila. El
>   historial **no** se reescribió. Deben cambiar su PIN (todos eran PIN antiguos de 4 dígitos):
>   Milagros Becerra, Carol Machuca, Michelle Garcia, Pablo Duran y Angelo Huerta.
> - **P2 cerrado:** la auditoría escribe de forma atómica, con versión y reintento. Probado con
>   escrituras simultáneas: 8 × 5 envíos sin pérdidas ni duplicados, y 12/12 en el navegador
>   (en `main`, 3/12).
> - **P1 cerrado de punta a punta** (descargar → restaurar → reabrir → editar → guardar), con
>   formatos validados y credenciales vigentes conservadas. En `main`, después de restaurar nadie
>   puede volver a ingresar.
> - **E4/E5:** propuesta de transición en `docs/propuesta-transicion-emailjs-urls.md`, sin ejecutar.
>
> **Variables nuevas para desplegar el correo** (no configuradas): `CORREO_SESSION_SECRET`,
> `CORREO_RATELIMIT_SECRET`, `CORREO_ORIGENES`. El limitador usa la función
> `frisku_sp_rl_consumir` de Supabase, que ya usa SharePoint Frisku.
>
> **Pendiente:** si la cookie de correo (12 h) vence durante una sesión restaurada sin PIN, las
> notificaciones devuelven 401 y no se envían hasta el siguiente ingreso. Conviene que la app
> lo avise.


**Base:** `main` ee229d4, que avanzó 86 commits desde c9c5792.

**Rama:** `claude/auditoria-funcional`, separada de diseño. Sin merge, migraciones ni despliegue.

**Alcance de la evidencia:**
- código leído;
- jest completo (2.006 pruebas, en UTC);
- navegador Chromium emulado con Supabase falso y datos ficticios.

Nada se probó en producción. En particular, no se envió ningún correo para comprobar el punto
E1, porque hacerlo enviaría un correo real.

**Prioridad:** primero lo que altera cifras o pierde datos, después lo que expone información.

**Estado de cada hallazgo:**
- **Corregido aquí**: con prueba que falla en `main` y pasa con la corrección.
- **Confirmado**: evidencia propia, falta decisión o el cambio es mayor.
- **Leído**: lo encontró la revisión de código y no se reprodujo.

## 1. Pérdida de datos y cifras

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| P1 | **«Restaurar respaldo» deja la fila `main` como texto y la siguiente apertura borra Tareas.** El respaldo guarda cada fila como objeto; `valorDeTabla` la vuelve a escribir como texto (`JSON.stringify`). `dbLoad` devolvía ese texto sin interpretarlo, `d.estados`, `d.comentarios`, etc. quedaban vacíos, y el guardado automático reemplazaba `main`. Es justamente la vía de recuperación. | Navegador: con la fila como texto se pierden los 7 campos (estados, comentarios, configuración, supervisores, tareas extra, frecuencias, comentarios de recordatorios). Con la fila como objeto (control) se conservan. | **Corregido aquí**: `dbLoad` y `dbLoadPins` interpretan el texto; el contrato reescribe la fila con su misma codificación. |
| P2 | **El registro de auditoría pierde eventos con dos sesiones abiertas.** Se leía una vez por pestaña y se reescribía esa copia. | Navegador: el evento de la sesión B desaparece cuando A vuelve a guardar. | **Corregido aquí**: cada envío vuelve a leer y agrega por id; ante una falla, los eventos vuelven al búfer y se reintentan. Queda una ventana de milisegundos (ver propuesta) |
| P3 | **Una lectura fallida del registro de auditoría lo borra entero.** `auditLoad` devolvía `[]` ante un error (incumplía la regla 9). | Navegador: 5 eventos previos → 1. | **Corregido aquí**: la lectura lanza el error y no se escribe. Además, un evento con fecha ilegible ya no se borra en silencio; la retención de 24 meses no cambia. |
| P4 | **Frisku y Maestros (incluido `maestro_tc`): tras un conflicto, el guardado siguiente pisaba a la otra sesión.** `dbSaveGeneric` adelantaba la versión sin tocar el estado local. Con el TC esto puede cambiar conversiones. | jest `friskuConflictoPendiente.test.js`: en `main` el segundo guardado sale `ok` y deja 950 en vez del 960 de la otra sesión. | **Corregido aquí**: el conflicto no adelanta la versión; cada guardado vuelve a intentar la fusión y sigue avisando. La fusión limpia por ítem sigue funcionando (probado). Las 260 pruebas de persistencia y Frisku pasan. |
| P5 | `terceros_maestro` (EEFF): la carga devuelve null ante un error y no hay bloqueo de guardado. El siguiente alta reemplaza el maestro completo. | Leído (`EEFFModule` ~705, `eeffHelpers` ~755). | Propuesta: patrón de la regla 9 más una escritura condicionada. |
| P6 | EEFF «Reemplazar balance» borra las composiciones de cuenta guardadas (`composicion:null`). Además, `cargarEEFF` no revisa `res.ok`: un error se muestra como «sin datos» y ofrece cargar uno nuevo encima. | Leído (`eeffHelpers` 320–366). | Propuesta. Conservar las composiciones al reemplazar es una decisión tuya (¿siguen valiendo con un balance nuevo?). |
| P7 | ANF: borra y luego inserta, sin transacción. Si la red cae entre las dos operaciones, las filas del informe quedan borradas; `guardarKpisDerivaos` borra sin respaldo. | Leído (`anfPersistence` 151–290). | Propuesta: una función en el servidor (RPC) transaccional. Es cambio de servidor: requiere tu aprobación. |
| P8 | Migración de Osiris al abrir: si `main` todavía trae `osirisData`, cada carga escribe esa copia vieja en `osiris` sin revisar versión, y se informa «eliminado» sin comprobarlo. | Leído (`App` ~2382). | Propuesta. Riesgo condicionado a que `main` conserve ese campo, cosa que no se puede verificar sin leer producción. |
| P9 | Contabilidad: anular un lote hace varios DELETE en secuencia sin transacción y con el estado de pantalla, que puede estar desactualizado. Al guardar un asiento, se borran líneas antes del upsert. | Leído (`ContabilidadModule` ~5010, ~3540). | Propuesta (RPC transaccional). |
| P10 | Rendiciones `guardarMerge` revive rendiciones que otra sesión eliminó. | Leído (~950). | Propuesta: marca de eliminado, igual que en Nóminas. |
| P11 | Escrituras al abrir `main` y `allegria` sin cambio de contenido (ya registrado como limitación). Fuerzan conflictos en otras sesiones abiertas. | Leído. | Sin cambio (ya documentado). |

## 2. Exposición de información y secretos

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| E1 | **`/api/send-email` funciona como relé de correo abierto.** CORS `*`, sin sesión, con destinatario, asunto y HTML libres. Envía desde las cuentas SMTP de Microsoft 365 del grupo (Mediterra, Osiris, Allegria, Frisku) y acepta TLS sin validar (`rejectUnauthorized:false`). Cualquiera podría enviar «Código provisorio – Mediterra» desde la casilla real. | Leído: `api/send-email.js:46-110`. **No probado en producción**, porque sería enviar un correo. | **Decisión tuya urgente.** Mínimo: exigir un secreto compartido o una sesión, restringir los destinatarios a los correos de `usuarios`, quitar `html` libre y validar TLS. No lo cambié porque afecta el envío de correos y el acceso (login). |
| E2 | **`files.zip` está en `main` con 5 PIN en texto claro** (un `App.jsx` antiguo, incluido el CFO) y un `.env` con la clave anónima de Supabase y las claves de EmailJS. `.gitignore` no excluye `*.zip`. | Confirmado (fac6cd0, 24-09-2026). Conté los PIN sin mostrarlos. El `App.jsx` actual ya no tiene PIN en claro. | **Decisión tuya.** Sacar el archivo del árbol, purgar el historial (requiere reescribir `main`, solo con tu aprobación) y pedir cambio de PIN a esas 5 personas si alguna sigue con el PIN antiguo. El login todavía acepta el PIN en claro cuando la cuenta no tiene hash (E7). |
| E3 | El PIN de bienvenida va en claro por correo y, si falla el SMTP, también a EmailJS (un tercero). Los códigos de recuperación también pasan por EmailJS. | Leído: `App.jsx` ~3422-3442, ~405-419. | Propuesta: no enviar nunca el PIN, usar el código provisorio de 45 minutos y quitar el respaldo vía EmailJS de los flujos de acceso. Cambia el login, así que requiere tu decisión. |
| E4 | Las claves de EmailJS están en el bundle, y su plantilla acepta cualquier destinatario: es un segundo relé. | Leído: `OsirisModule` 5754, `App` 3436. | Propuesta: restringir orígenes y fijar el destinatario en el panel de EmailJS, o retirarlo. |
| E5 | Las boletas de Rendiciones (y las fotos de Osiris) quedan con URL pública permanente (bucket `frisku-docs` público). | Leído: `friskuHelpers` 551-597. | Propuesta: bucket privado y URL firmada, como en `nominas-docs`. Cambio de servidor. |
| E6 | `/api/informe` sirve informes de Osiris sin autenticación y con caché pública de 24 h. | Leído. No verifiqué si los ids son adivinables. | Propuesta: enlace firmado con vencimiento y `no-store`. |
| E7 | El login todavía acepta el PIN en claro cuando no hay hash, y un código provisorio antiguo en claro no vence. | Leído: `App` 3106, 271-276. | Propuesta para la migración de seguridad (cambia el login). |
| E8 | `audit_log` guarda montos de saldos y de líneas de nómina (valor anterior y nuevo) por 24 meses, en una fila legible con la clave anónima. No contiene sueldos ni PIN. | Leído. | Propuesta: no registrar el monto, o moverlo a una tabla de solo inserción. Es decisión de política de auditoría. |
| E9 | La pestaña EEFF se dibuja sin su propia revisión de permiso; la protegen el filtro de pestañas y una redirección. | Leído: `FinanzasModule` ~15638. | Propuesta menor: agregar la revisión `puedoVer("eeff")`, con pruebas de acceso permitido y denegado según la regla 12. |

## 3. Cambios de esta rama

- `src/App.jsx`: `auditLoad` lanza el error; `auditFlush` relee y agrega por id con reintento;
  `auditSave` revisa la respuesta; la retención conserva los eventos con fecha ilegible;
  `dbLoad` y `dbLoadPins` interpretan la fila guardada como texto.
- `src/friskuHelpers.js`: un conflicto no resuelto no adelanta la versión.
- Pruebas: `src/__tests__/friskuConflictoPendiente.test.js` (2) y
  `scripts/e2e/auditoria-persistencia.mjs`, que falla con 3 defectos sobre `main` sin corregir y
  pasa con la corrección. Jest completo: 2.006 pruebas pasan (108 omitidas, igual que antes).
- No se tocaron políticas financieras, estructuras de datos, responsables de aprobación ni el
  login.

## 4. Propuesta para cerrar P2 del todo (no implementada)

El registro de auditoría debería ser una tabla de solo inserción (`audit_eventos`, un evento por
fila, con inserción permitida y sin UPDATE/DELETE para la clave anónima). Así dos sesiones nunca
se pisan y nadie puede reescribir la historia. Es estructura nueva y cambio de servidor: requiere
tu decisión.

# Auditoría funcional — pérdida de datos y exposición (13-10-2026)

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

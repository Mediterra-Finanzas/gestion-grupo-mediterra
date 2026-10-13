# Plan de transición del correo (único, no ejecutado)

Estado al 13-10-2026: **preparado en la rama `claude/auditoria-funcional`, sin desplegar.** No se
tocó EmailJS, no se cargaron variables y no se envió ningún correo real. Este documento reemplaza
la parte de correo de `docs/propuesta-transicion-emailjs-urls.md`. La parte de URL públicas sigue
allá. El detalle de las variables está en `docs/correo-configuracion-vercel.md`.

**Mientras EmailJS siga activo, el correo NO está protegido.** Con la clave pública, cualquiera
puede llamar a EmailJS sin pasar por la app.

## 1. Confirmar en solo lectura la función que limita intentos

El correo usa la tabla `frisku_sp_ratelimit` y la función `frisku_sp_rl_consumir`, las de
SharePoint Frisku (`api/sql/frisku_sp_ratelimit.sql`), tanto para el límite de intentos como para
la identidad de cada envío. Antes de nada, en el SQL Editor:

```sql
BEGIN READ ONLY;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos, p.prosecdef AS security_definer
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN ('frisku_sp_rl_consumir', 'frisku_sp_rl_limpiar');
SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'frisku_sp_ratelimit';
SELECT grantee, privilege_type FROM information_schema.routine_privileges
 WHERE routine_schema = 'public' AND routine_name = 'frisku_sp_rl_consumir';
-- La regla de tipo debe admitir 'identidad' (el correo la usa también para la identidad de envío).
SELECT pg_get_functiondef('public.frisku_sp_rl_consumir(text,text,integer,integer,integer)'::regprocedure)
       LIKE '%''ip'',''identidad''%' AS admite_identidad;
ROLLBACK;
```

**Resultado esperado:**
- las dos funciones, con `security_definer = true`;
- la tabla con RLS activo;
- ningún permiso para `anon` ni `authenticated`;
- `admite_identidad = true`.

Si algo no coincide, **se detiene el plan**. Crear o cambiar la función es una migración y
requiere tu aprobación.

**Corrección hecha al revisar la función real.** La primera versión de la identidad de envío no
habría funcionado:
- usaba un `tipo` que la función rechaza, así que cada envío habría respondido 503;
- usaba bloqueo 0, con lo que el segundo uso de la misma identidad volvía a quedar permitido.

Quedó corregida. `scripts/seguridad/correo-limitador-pg.mjs` la prueba contra la función SQL real
en Postgres 16 local, con un control que reproduce los dos defectos.

## 2. Configurar las variables sin exponer secretos

Se cargan `CORREO_SESSION_SECRET`, `CORREO_RATELIMIT_SECRET` y `CORREO_ORIGENES`, solo en
Production y marcadas como Sensitive. Los secretos se generan en tu computador y se pegan
directamente en Vercel (pasos en `docs/correo-configuracion-vercel.md`). No van por chat, correo
ni repositorio. Cargarlas no cambia producción hasta el siguiente despliegue.

## 3. Probar el endpoint protegido

1. **Antes de desplegar (hecho, local).** Todo con correo simulado, Postgres local y Chromium
   emulado:
   - servidor 65/65;
   - función real 8/8;
   - navegador 18/18, que cubre 5xx, red, resultado incierto del SMTP con confirmación de reenvío, 401 con renovación y salir;
   - 0 peticiones a EmailJS.
2. **Después de desplegar, sin enviar correos.** Las tres llamadas `curl` de
   `docs/correo-configuracion-vercel.md` §5: origen ajeno da 403, formato antiguo da 401 y
   «cerrar» da 200 con cookie vencida.
3. **Un envío real controlado** (requiere tu autorización): tú ingresas y te envías una
   notificación a tu propia casilla interna. Se comprueba:
   - que llega;
   - que en Vercel aparece `[correo] {"evento":"correo_enviado","ref":"…"}` con la misma
     referencia que muestra la app;
   - que un segundo intento con la misma identidad no la reenvía.

## 4. Despliegue y retiro de EmailJS sin perder envíos legítimos

Identificadores a restringir o desactivar. No se muestran claves.

| Identificador | Uso | Fuente |
|---|---|---|
| Servicio `service_ahuerta` | Todos los envíos de respaldo | Código y `.env` |
| Plantilla `template_notif_tarea` | Notificaciones, bienvenida, aviso de respaldo e informe de Osiris | Código y `.env` |
| Plantilla `template_c7yup8d` | Código provisorio | `.env` de `files.zip` (sep-2026) |
| Clave pública | La expuesta en el repositorio y en los bundles publicados | (no se muestra) |

La plantilla `template_c7yup8d` es [Probable]: el ID viene del `.env` de septiembre y hay que
confirmar en el panel que sea el vigente.

**Por qué no se pierden envíos legítimos en el cambio.** Las pestañas que quedaron abiertas con
la versión anterior siguen usando el formato antiguo. El servidor nuevo lo rechaza y esa versión
recurre a EmailJS, así que sus correos siguen saliendo mientras EmailJS exista. La comprobación de
versión de `main` les pide recargar, y al recargar pasan a la versión nueva, que no usa EmailJS.

**Orden propuesto (cada paso con tu autorización):**

| Paso | Qué | Efecto |
|---|---|---|
| A | Confirmación en solo lectura (§1) y variables (§2). | Ninguno sobre producción. |
| B | Panel de EmailJS: restringir orígenes al sitio publicado y bajar la cuota diaria. | Limita el abuso desde navegadores. No cierra llamadas directas, que pueden falsificar el origen. |
| C | Desplegar. | La app nueva solo usa `/api/send-email`. Las pestañas antiguas siguen por EmailJS hasta recargar. |
| D | Pruebas §3.2 y §3.3. | Confirma el servicio nuevo. |
| E | Período de gracia corto (24–48 h), mirando el historial de envíos en el panel de EmailJS. | Al final de la gracia no debería quedar tráfico legítimo. |
| F | Desactivar `template_c7yup8d` y `template_notif_tarea`, rotar la clave pública o desactivar `service_ahuerta`. Borrar `REACT_APP_EMAILJS_*` de Vercel. | **Desde aquí el relé de EmailJS queda cerrado.** Antes de F, el correo no está protegido. |

Riesgo aceptado durante la gracia: EmailJS sigue abierto. Se puede acortar si el panel muestra que
no hay tráfico legítimo.

## 5. Identidad de cada envío: dónde se guarda y qué no cubre

**Dónde se guarda:**
- En el **navegador**: cada envío lógico recibe un `idEnvio` (UUID). Vive en la memoria de la
  pestaña, nunca en el navegador ni en el servidor de la app. Si se recarga la página, la lista de
  pendientes se pierde.
- En el **servidor**: justo antes de enviar, `api/_correo.js` consume esa identidad en
  `frisku_sp_ratelimit`, con la llave de servicio. Queda una fila con clave HMAC opaca (sin correo
  ni id en claro), válida 24 h y bloqueada 24 h. El reporte diario usa la ejecución como identidad.
- **No se guarda el resultado.** El servidor sabe que esa identidad se usó, pero no si el correo
  salió.
- En los **registros de Vercel**: `correo_enviado` y `correo_error` con `ref` (los primeros 12
  caracteres de la identidad), que la app muestra como «Referencia». Así se puede conciliar a mano
  un resultado incierto.

**Qué ve la persona en cada caso:**

| Caso | Qué ve | ¿Puede duplicarse? |
|---|---|---|
| El servidor confirma el envío | Nada pendiente | No |
| Rechazo de autorización o contenido (400/403/404) | «El servidor rechazó…», sin Reintentar | No, no salió |
| Sesión vencida o revocada (401), límite (429), sin configurar (503) | Fallo confirmado, con Reintentar | No, no salió |
| El SMTP **rechaza con evidencia**: falla la conexión, TLS o autenticación, rechaza el remitente o un destinatario, o responde 4xx/5xx al mensaje; o falla el registro de la identidad antes de enviar (503) | «No salió». El reintento usa otra identidad | No: hay evidencia de que no se aceptó |
| **El envío empezó y la conexión se cortó o venció sin respuesta del proveedor** (por ejemplo, durante DATA), o el error no trae datos del SMTP | **Resultado incierto** (antes se mostraba «No salió»). Sin Reintentar, porque la identidad ya se usó. «Reenviar…» exige confirmar el posible duplicado | Solo si la persona confirma el reenvío |
| **El proveedor aceptó y el servidor cayó o venció antes de responder** (504 o sin respuesta) | **Resultado incierto**. Reintentar es seguro: con la misma identidad el servidor responde «ya recibido» y no reenvía | No, salvo que la persona elija «Reenviar igual» |
| La identidad se consumió, pero el servidor cayó **antes** de enviar | «Ya recibido», resultado incierto, aunque no salió | No se duplica. Puede perderse si la persona elige «Ya llegó: quitar» |
| Se recargó la página con envíos pendientes | Los pendientes desaparecen de la vista | Se pierden de la vista; quedan en los registros de Vercel |

La app distingue fallo confirmado de resultado incierto:
- en un **fallo confirmado**, el aviso dice que no salió;
- en un **resultado incierto**, el aviso dice que no se puede confirmar y muestra la referencia;
- si la pérdida fue antes de que el servidor respondiera (sin conexión, o 5xx sin respuesta del
  servidor de correo), «Reintentar» reusa la misma identidad y no duplica;
- si el envío empezó, o el servidor ya lo había recibido, las opciones son «Ya llegó: quitar» o
  «Reenviar…». Reenviar abre un aviso de que el destinatario puede recibirlo dos veces y solo envía
  con «Sí, reenviar aunque pueda duplicarse»;
- la función `reenviarIgual` rechaza el reenvío sin `{ confirmado: true }`, aunque se llame
  directamente.

**No hay garantía absoluta contra duplicados ni contra pérdidas.** Para cerrar los dos casos
marcados haría falta guardar el estado del envío (enviando → enviado / fallido) en una tabla
propia, con el `messageId` del proveedor. Es una estructura nueva y requiere tu decisión.

## 6. Recuperación y rollback sin reabrir el relé

**Dos clases de vuelta atrás.** Lo que importa no es la herramienta (Instant Rollback, Promote o un
redespliegue), sino a qué versión del endpoint se vuelve:

| Destino | Qué pasa con el correo | ¿Se puede usar? |
|---|---|---|
| Un despliegue **anterior a la protección** (cualquiera con el `api/send-email.js` de `main` hasta 778a397) | Vuelve el relé abierto: CORS `*`, destinatario y HTML libres, sin sesión | **No**, salvo decisión explícita de reabrirlo |
| Un despliegue **que ya tiene la protección** (por ejemplo, el anterior al último, cuando ambos la tienen) | El endpoint sigue protegido; solo cambia la app | **Sí**, Instant Rollback sirve, después de comprobarlo |
| La rama **`claude/rollback-seguro-correo`** | App de `main` 778a397 con el endpoint protegido de b95d21b | **Sí**. Es el destino seguro mientras no exista un despliegue protegido anterior |

**Cómo se comprueba antes de promover** (`scripts/seguridad/verificar-correo-protegido.mjs`):
- `--commit <sha>` revisa el código de ese commit:
  - `api/_correo.js` presente;
  - el endpoint usa `crearCorreo`;
  - sin `Allow-Origin: *`;
  - con TLS validado.
- `--url <despliegue>` sondea el endpoint publicado con tres peticiones **que no pueden enviar
  correo, ni siquiera en la versión insegura**: ninguna lleva destinatario ni asunto, que la versión
  antigua exige antes de llamar al SMTP.
  - **PROTEGIDO**: OPTIONS desde un origen ajeno responde 403 sin `Allow-Origin`; POST desde un
    origen ajeno, 403; «cerrar» desde el sitio, 200 con la cookie vencida.
  - **INSEGURO**: aparece `Allow-Origin: *` o los 400 de «falta to».
  - **INDETERMINADO**: cualquier otra respuesta. Ese despliegue no se promueve sin revisarlo.
- Probado en local contra los dos endpoints reales
  (`scripts/seguridad/verificar-correo-protegido.test.mjs`): el de esta rama sale PROTEGIDO, el de
  `origin/main` INSEGURO, y la versión antigua no recibió ningún intento de envío.

**Procedimiento si hay que volver atrás después del despliegue:**
1. Identificar el despliegue destino en Vercel → Deployments y su commit.
2. `verificar-correo-protegido.mjs --commit <sha>`. Si no da PROTEGIDO, no es destino.
3. Si no hay ningún despliegue protegido anterior (caso del primer despliegue), usar la rama
   `claude/rollback-seguro-correo`. Conviene dejarla como despliegue Preview **antes** del paso C
   (requiere tu autorización), para tenerla lista.
4. Promover y correr `verificar-correo-protegido.mjs --url <producción>`. Debe dar PROTEGIDO.

**Con la rama de rollback seguro, la app antigua sigue enviando por EmailJS.** El servidor rechaza
su formato con 401 y ella recurre a EmailJS, mientras EmailJS exista (pasos B a E). Después del
paso F, esa app antigua queda sin correo: no reabre nada, pero no envía. Por eso F va al final.

**Otras vías:**
- **Detener el correo sin abrir nada:** quitar `CORREO_SESSION_SECRET` en Vercel y redesplegar. El
  endpoint responde 503 a todo y la app muestra los pendientes.
- **Recuperar lo que no salió:**
  - en la misma pestaña, desde «correos sin confirmar»;
  - si se recargó la página, desde los registros `correo_error` de Vercel (acción, referencia y
    fase), reenviando a mano.
- **Rotación de secretos:**
  - `CORREO_SESSION_SECRET` cierra todas las sesiones de correo;
  - `CORREO_RATELIMIT_SECRET` reinicia contadores e identidades. Solo rotarlo sin envíos
    pendientes.

## 7. Tabla de estado de envíos (no implementada)

**Qué resolvería.** El servidor guardaría cada envío: identidad, persona, acción, estado (`enviando`
→ `enviado` / `rechazado` / `incierto`), hora y el `messageId` del proveedor. Con eso:
- un reintento con la misma identidad sabría si el anterior **salió** (hoy solo sabe que se usó la
  identidad), así que «ya procesado» pasaría a ser «enviado» o «no salió» cuando haya dato;
- **los pendientes se podrían consultar después de recargar** o desde otro equipo: una lista por
  persona de envíos en `enviando` o `incierto`, en vez de la memoria de la pestaña;
- un envío que quedó en `enviando` (el servidor cayó a mitad) se vería como incierto, con hora y
  referencia, sin ir a buscarlo a los registros.

**Qué seguiría abierto:**
- Si el proveedor acepta el mensaje y el servidor cae **antes de escribir** `enviado`, la fila queda
  en `enviando` y el resultado sigue siendo incierto. La tabla lo hace visible, pero no lo resuelve.
- «Aceptado por el proveedor» no es «entregado». Rebotes o filtros de spam posteriores no se ven
  sin integrar los avisos de rebote de Microsoft 365, que es otro trabajo.
- Reenviar un incierto con confirmación puede duplicar, igual que hoy.
- Es una tabla nueva con sus permisos (solo la llave de servicio), su retención y su limpieza.
  Requiere migración y tu aprobación.

No da garantía absoluta de entrega ni de ausencia de duplicados. Reduce los casos inciertos y los
deja consultables.

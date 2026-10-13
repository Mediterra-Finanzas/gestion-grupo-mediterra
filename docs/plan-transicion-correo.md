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
   - servidor 57/57;
   - función real 8/8;
   - navegador 13/13, que cubre 5xx, red, resultado incierto, 401 con renovación y salir;
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
| El SMTP informa error (502), o falla el registro de la identidad (503) | «No salió». El reintento usa otra identidad | Ver la fila siguiente |
| **El proveedor aceptó el correo, pero la conexión se cortó y el SMTP lo informó como error** | «No salió» (falso) | **Sí, si se reintenta. No está cubierto.** |
| **El proveedor aceptó y el servidor cayó o venció antes de responder** (504 o sin respuesta) | **Resultado incierto**. Reintentar es seguro: con la misma identidad el servidor responde «ya recibido» y no reenvía | No, salvo que la persona elija «Reenviar igual» |
| La identidad se consumió, pero el servidor cayó **antes** de enviar | «Ya recibido», resultado incierto, aunque no salió | No se duplica. Puede perderse si la persona elige «Ya llegó: quitar» |
| Se recargó la página con envíos pendientes | Los pendientes desaparecen de la vista | Se pierden de la vista; quedan en los registros de Vercel |

La app distingue fallo confirmado de resultado incierto:
- en un **fallo confirmado**, el aviso dice que no salió;
- en un **resultado incierto**, el aviso dice que no se puede confirmar, con la referencia y dos
  opciones: «Ya llegó: quitar» o «Reenviar igual (puede duplicar)».

**No hay garantía absoluta contra duplicados ni contra pérdidas.** Para cerrar los dos casos
marcados haría falta guardar el estado del envío (enviando → enviado / fallido) en una tabla
propia, con el `messageId` del proveedor. Es una estructura nueva y requiere tu decisión.

## 6. Recuperación y rollback sin reabrir el relé

- **No usar «Instant Rollback» de Vercel a un despliegue anterior al cambio.** Devuelve el
  `api/send-email.js` antiguo, que es el relé abierto.
- **Rollback seguro (preparar antes del paso C):** una rama con el commit de app anterior más los
  archivos nuevos de `api/` (`send-email.js`, `_correo.js`, `_reporteDiarioEmail.js` y el cambio
  del cron). Con ella, la app antigua sigue enviando por EmailJS mientras exista (pasos B–E), y el
  servidor no queda abierto. Después del paso F, una vuelta atrás de la app deja sin correo a la
  versión antigua, pero no reabre nada.
- **Detener el correo sin abrir nada:** quitar `CORREO_SESSION_SECRET` en Vercel y redesplegar. El
  endpoint responde 503 a todo (falla cerrado) y la app muestra los pendientes.
- **Recuperar lo que no salió:** en la misma pestaña, desde «correos sin confirmar». Si se recargó,
  con los registros `correo_error` de Vercel (acción y referencia), reenviando a mano.
- **Rotación de secretos:**
  - `CORREO_SESSION_SECRET`: cierra todas las sesiones de correo; cada persona la renueva con su
    PIN;
  - `CORREO_RATELIMIT_SECRET`: reinicia contadores e identidades. Solo rotarlo sin envíos
    pendientes, porque un reintento posterior ya no se reconocería como repetido.

# Propuesta de transición: EmailJS y URL públicas (no ejecutada)

Estado: **propuesta**.

- No se migró ningún bucket ni se invalidó ningún enlace.
- No se tocó el panel de EmailJS ni se rotaron claves.
- Los documentos legítimos siguen accesibles como hoy.

Cada fase necesita tu autorización.

## 1. EmailJS

**Situación actual.**

- Las claves de EmailJS (`service_ahuerta`, `template_notif_tarea`, la plantilla de códigos, clave
  pública `bwCBq7…`) están en el bundle y en `files.zip`.
- La plantilla `template_notif_tarea` acepta cualquier `to_email`, `subject` y `message`: es un
  segundo relé de correo, aparte de `/api/send-email`.
- La app lo usa como respaldo cuando falla el SMTP: códigos provisorios, bienvenida (con el PIN),
  notificaciones, respaldo diario e informe de Osiris.

**Hecho en la rama `claude/auditoria-funcional`, sin desplegar.** La app ya no recurre a EmailJS
cuando el servidor **rechaza** un envío (400/401/403/404/409/429): solo lo hace ante una falla de
red o del servidor (5xx). Así el control del servidor no se esquiva desde la propia app. Esto no
cierra el relé: cualquiera con la clave pública puede seguir usando EmailJS directamente.

| Fase | Qué | Efecto sobre usos legítimos | Requiere |
|---|---|---|---|
| E-1 | En el panel de EmailJS: restringir los orígenes permitidos al sitio publicado y bajar la cuota diaria. | Ninguno: la app ya envía desde ese origen. | Tu acceso al panel |
| E-2 | Quitar el respaldo vía EmailJS de los flujos de acceso (código provisorio y bienvenida) y del informe de Osiris. Si el SMTP falla, la pantalla lo dice y el administrador entrega el código, que ya se le muestra una vez. | Ante una caída del SMTP, el código no llega por correo; el administrador lo ve en pantalla. | Desplegar `/api/send-email` protegido y decidir |
| E-3 | Tras 2 a 4 semanas sin fallas de SMTP (registro `[correo]` en Vercel), retirar EmailJS de las notificaciones y eliminar las claves del código. | Las notificaciones dependen solo del SMTP de Microsoft 365. | Decisión |
| E-4 | Rotar la clave pública de EmailJS, o cerrar la cuenta. La actual quedó expuesta en el repositorio. | Ninguno, si E-3 ya se hizo. | Tu acceso al panel |

## 2. URL públicas de Storage

**Situación actual.**

| Contenido | Dónde | Cómo se accede |
|---|---|---|
| Boletas y facturas de Rendiciones | bucket `frisku-docs`, `rendiciones/<id>/…`, **público** | URL `/object/public/…` permanente, guardada en `gastos[].adjuntoUrl` de la fila `rendiciones` (legible con la clave anónima) |
| Documentos COMEX y liquidaciones de Frisku | `frisku-docs`, público | Ídem, en las filas `frisku_*` |
| Fotos de Osiris y el logo usado en el correo del informe | `osiris-fotos`, público | URL pública |
| Informes técnicos de Osiris para clientes | `osiris-fotos/informes-html/INF_<fecha>_<6 caracteres>.html` | `/api/informe?id=…`, sin autenticación y con caché pública de 24 h |
| Respaldos de Nóminas | `nominas-docs`, **privado** | URL firmada (`urlFirmadaNomina`): es el patrón a seguir |

[Probable] El id del informe es adivinable por fecha: los 6 caracteres finales del id interno.
No lo verifiqué con datos reales.

**Cuántos enlaces hay.** Se cuenta en producción con esta consulta, de solo lectura y sin
devolver los enlaces:

```sql
BEGIN READ ONLY;
SELECT id,
       (length(value::text) - length(replace(value::text, '/object/public/', ''))) / length('/object/public/') AS enlaces_publicos
FROM calendario_data
WHERE value::text LIKE '%/object/public/%'
ORDER BY 2 DESC;
ROLLBACK;
```

**Transición que conserva el acceso legítimo:**

| Fase | Qué | Enlaces existentes | Requiere |
|---|---|---|---|
| U-1 | Las subidas nuevas guardan además la **ruta** (`adjuntoPath`), no solo la URL. Un helper único `urlDocumento(adjunto)` muestra el documento: firma la ruta si existe y, si no, usa la URL antigua. | Siguen funcionando igual. | Código (rama), sin migración |
| U-2 | Firmar en el servidor: `/api/storage` ya firma, pero hoy exige la sesión del login retirado. Se le daría la misma sesión verificada del correo (cookie con `Path=/api`) y un permiso por documento (Rendiciones: dueño, aprobador, pago; Frisku: quien tenga Frisku). | Siguen funcionando. | Desplegar la sesión del servidor; decidir el alcance de la cookie |
| U-3 | Convertir los enlaces antiguos: un paso **declarado** que agrega `adjuntoPath` a cada adjunto, deducido de su URL. No borra la URL; queda registrado y se puede revertir. | Siguen funcionando: el bucket todavía es público. | Tu autorización (es una escritura sobre datos reales) |
| U-4 | Informes de Osiris: el enlace a clientes pasa a `/api/informe?id=…&t=<firma con vencimiento>` (por ejemplo, 180 días) y `Cache-Control: private, no-store`. Los enlaces ya enviados siguen sirviendo hasta U-6. | Los correos ya enviados siguen abriendo. | Código + decidir el vencimiento |
| U-5 | Medición: 2 a 4 semanas comprobando que nadie lee por `/object/public/` (registros de Supabase Storage). | — | Acceso a los registros |
| U-6 | Pasar `frisku-docs` (y `osiris-fotos`, salvo el logo) a **privado**. Desde aquí las URL públicas antiguas dejan de abrir; todo se ve por U-1/U-2. Para los informes ya enviados a clientes, `/api/informe` responde con un enlace firmado nuevo si el id es válido, durante un período de gracia. | Las URL públicas antiguas **dejan de funcionar**. La app sigue mostrando todo por la ruta firmada. | Tu autorización explícita (es una migración irreversible en la práctica) |

**Orden recomendado:** E-1 de inmediato; después U-1 y U-4, que no cambian nada para quien usa
la app; luego E-2 y U-2 junto con el despliegue del correo protegido; U-3, U-5 y U-6 al final.

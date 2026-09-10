# Guía de panel — runtime de pruebas contra staging

Única guía. Lo que depende de mí está hecho; lo que sigue solo se puede hacer
desde el panel de Vercel, porque no tengo credenciales de Vercel.

---

## Parte A · Crear el proyecto

Los cron de Vercel llaman solo al deployment de **Producción** de un proyecto
(documentación de Vercel, Cron Jobs). Por eso el runtime de pruebas es un
**segundo proyecto**, cuya Producción apunta a Supabase staging. El proyecto
productivo no se toca.

| Campo | Valor |
|---|---|
| Nombre del proyecto | `mediterra-respaldo-staging` |
| Repositorio | `Mediterra-Finanzas/gestion-grupo-mediterra` |
| Production Branch | `runtime/staging-respaldo` |
| Framework | Create React App (lo detecta solo) |
| Root Directory | la raíz |

**A1.** vercel.com → **Add New…** → **Project** → junto a
`gestion-grupo-mediterra`, **Import**. En **Project Name** escribe
`mediterra-respaldo-staging`. **No** pulses Deploy todavía.

**A2.** En la misma pantalla, abre **Environment Variables** y agrega las de la
tabla. Los valores los pegas tú desde `.env.osiris-staging.local`; no pasan por
el chat. Marca solo **Production**.

| Variable | Qué va |
|---|---|
| `SUPABASE_URL` | URL de Supabase staging |
| `SUPABASE_SERVICE_ROLE_KEY` | clave `sb_secret_` de staging |
| `CRON_SECRET` | la de `.env.osiris-staging.local` |
| `BACKUP_ENCRYPTION_KEY_A` | la de staging |
| `BACKUP_ENCRYPTION_KEY_B` | la de staging |
| `BACKUP_KID_A` | `A-stg-82a046f3` |
| `BACKUP_KID_B` | `B-stg-ef5ee1f5` |
| `RESPALDO_BUCKET` | `respaldo-osiris-staging` |
| `RESPALDO_AVISO_TO` | destinatarios sintéticos para la alarma, separados por coma |
| `RESPALDO_CORREO_PRUEBA` | `si` |
| `CORREO_PRUEBA_PERMITIDOS` | **el buzón de prueba que designes** (ver nota) |
| `SMTP_MEDITERRA_USER` | la cuenta que usa el informe diario |
| `SMTP_MEDITERRA_PASS` | idem |
| `REACT_APP_UX_SOLO` | `1` |
| `REACT_APP_UX_SUPABASE_URL` | URL de Supabase staging |
| `REACT_APP_UX_SUPABASE_ANON_KEY` | clave publicable de staging |

**No se define `RESPALDO_PERMITIR_PRODUCCION`.** Sin ella el handler se niega a
correr contra el proyecto productivo.

> **Nota sobre el buzón de prueba.** Un dominio `.invalid` no recibe correo, así
> que "entrega real" exige un buzón real. El handler solo envía el correo de
> prueba a las direcciones que pongas en `CORREO_PRUEBA_PERMITIDOS`, y a nadie
> más. Elige una dirección dedicada a pruebas.

**A3.** **Deploy**. Espera a que diga **Ready**.

**A4.** Proyecto → **Settings** → **Git** → **Production Branch**: confirma que
dice `runtime/staging-respaldo`. Si dice `main`, cámbiala y pulsa **Save**, y
luego **Deployments** → último → **⋯** → **Redeploy**.

**A5.** Proyecto → **Settings** → **Cron Jobs**. Debe aparecer
`/api/osiris-respaldo-cron` con `0 7 * * *`, y **ningún otro**. Si aparece
también `/api/proc-reporting-daily-cron`, el deployment no salió de la rama
correcta: vuelve a A4.

**A6.** Copia el dominio de Producción del proyecto (**Settings** → **Domains**)
y pásamelo. Sirve para revisar el diseño en `https://<dominio>/`.

---

## Parte B · Comprobación, en cuatro estados que no se combinan

Cada invocación del handler queda registrada en staging, en una tabla que no se
puede modificar ni borrar. Con eso separo los cuatro estados. **Uno no se deduce
de otro.**

El horario `0 7 * * *` es UTC. Desde el 2026-09-07 Chile está en UTC−3: el cron
corre entre **04:00 y 04:59 hora de Chile** (en Hobby, en cualquier minuto de
esa hora).

### B1 · Run manual

1. Fuera de la franja 04:00–04:59 de Chile, ve a **Settings** → **Cron Jobs** →
   `/api/osiris-respaldo-cron` → **Run**.
2. Espera un minuto y abre **View Logs**. Debe verse una respuesta `200`.
3. Avísame "Run hecho". Corro la comprobación y te informo el estado 1.

Un Run exitoso **no** demuestra el disparo automático.

### B2 · Disparo automático por horario

1. **No pulses Run entre 04:00 y 04:59 de Chile** del día siguiente. Una
   ejecución manual en esa franja no se puede distinguir de la automática.
2. Después de las 05:00, avísame. Busco una invocación de Vercel dentro de la
   franja que haya terminado en READY.

### B3 · Descarga, descifrado y restauración del lote remoto

No requiere nada tuyo. Cuando exista un lote creado por el runtime remoto, lo
descargo de Storage, lo descifro con las claves A y B y lo restauro en memoria.
Solo se declara observado si la restauración pasa las validaciones de lote.

### B4 · Entrega real del correo de prueba

1. Con `RESPALDO_CORREO_PRUEBA=si`, cada invocación envía un correo de prueba al
   buzón designado.
2. Revisa ese buzón después del Run de B1. Busca el asunto
   `Osiris · correo de prueba del respaldo`.
3. Avísame "correo recibido" o "no llegó". Informo dos cosas por separado:
   aceptado por SMTP (lo veo yo) y recibido (solo lo puedes confirmar tú).

---

## Estado al corte

| Estado | Hoy |
|---|---|
| B1 · Run manual | NO OBSERVADO |
| B2 · Disparo automático | NO OBSERVADO |
| B3 · Restauración del lote remoto | NO OBSERVADO |
| B4 · Correo aceptado / recibido | NO OBSERVADO / NO OBSERVADO |

**AUTOMATIZACIÓN COMPLETA = NO EJERCIDA** hasta observar B2 y B3.

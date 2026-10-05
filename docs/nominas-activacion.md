# Nóminas: procedimiento de activación de la versión obligatoria

> **Estado: PROCEDIMIENTO PROPUESTO, NO EJECUTADO.** Requiere autorización explícita para cada paso que
> escribe en producción (pasos 4, 7, 8, 9 y 10). Nada de esto se ha corrido en producción.
> Piezas: `supabase/propuesta_nominas_version_obligatoria.sql` (partes 0–3),
> `supabase/propuesta_nominas_version_obligatoria_reversion.sql` y
> `supabase/verificar_activacion_nominas.sql` (foto de solo lectura).
> Diseño y riesgos: `docs/nominas-version-obligatoria.md`.

## Principio: ninguna ventana de operación normal

**El trigger se activa durante la pausa y ANTES del despliegue.** Así nunca hay un momento en que:

- el código antiguo pueda escribir nóminas después de empezada la pausa, ni
- el código nuevo atienda usuarios sin que la base exija la versión.

**Costo:** desde la activación hasta que termina el despliegue, nadie puede guardar nóminas. El código antiguo es rechazado y el nuevo todavía no está publicado. Por eso se hace con el trabajo de Nóminas detenido.

**Duración estimada:** 25–35 minutos. El despliegue en Vercel toma unos 3–5 minutos **[Probable]**.

## Antes del día de activación (sin pausa)

| # | Qué | Quién | Escribe en producción |
|---|---|---|---|
| A | PARTE 0 completa (0.1–0.8) en el SQL Editor y revisión de resultados. Ningún trigger existente debe tocar `id`, `value` ni `updated_at` de `nominas_*`. Ninguna función de 0.5/0.6 debe eludir el control. 0.7 sin vistas escribibles por la llave pública. 0.8 sin variables `mediterra.` | Angelo + revisión | No |
| B | Repetir localmente `scripts/nominas-cas/prueba.mjs` y `scripts/e2e/nomina-base-real.mjs` **con el código real de los triggers existentes** (consulta 7) | Desarrollo | No |
| C | Validación final de la versión exacta que se va a desplegar (commit) | Angelo | No |
| D | Confirmar en Supabase → Database → Backups el último respaldo de plataforma y sus opciones | Angelo | No |
| E | PARTE 1 (crear la función). Es inerte: el código de producción no la usa. Se puede hacer el día anterior; la foto (sección 3) debe dar `funcion_existe = 1` y `trigger_estado` vacío | Angelo | Sí (crea una función, no cambia datos) |
| F | Avisar al equipo de Nóminas (prepara, revisa, aprueba, registra) la hora de la pausa | Angelo | No |

## Día de activación

| Paso | Hora | Qué | Si falla |
|---|---|---|---|
| 1 | T−15 | Aviso: "En 15 minutos se detiene Nóminas por ~30 minutos". Cada persona **recarga la página** y comprueba que sus últimos cambios estén. Si falta algo, lo vuelve a ingresar o lo anota. | — |
| 2 | T0 | **Inicio de la pausa.** Todos dejan de editar, esperan 10 segundos después del último cambio y **cierran todas las pestañas de la app** (no solo Nóminas). | — |
| 3 | T0 | **Foto 1** (`verificar_activacion_nominas.sql`, secciones 1 y 2).<br>**Copia de recuperación:** en el SQL Editor, `select id, updated_at, value from calendario_data where id like 'nominas\_%' order by id;` exportada a CSV. Contiene datos de nómina: guardarla en un lugar restringido. | Si la copia no se puede exportar, no seguir. |
| 4 | T0+2 | **Foto 2.** La `huella_total` debe ser **idéntica** a la de la foto 1. | Si cambió, alguien sigue guardando: la foto 1 dice qué fila. Contactarlo, esperar y repetir fotos 1–2. |
| 5 | T0+3 | **PARTE 2** (activar el trigger). Desde aquí el código antiguo ya no puede escribir nóminas. | Si se aborta, no seguir: revisar el mensaje. |
| 6 | T0+4 | **Foto 3** (sección 3): `funcion_existe = 1`, `trigger_estado = O`. **PARTE 3** (verificación con ROLLBACK): 9 filas `ok = true`. | Cualquier `false`: **Nivel 1** de reversión, terminar la pausa con el código actual y no desplegar. |
| 7 | T0+5 | **Despliegue:** merge del commit validado → Vercel. Esperar "Ready" y confirmar en Vercel que el despliegue de producción corresponde a **ese** commit. | Si el despliegue falla y no se resuelve en ~20 min: **Nivel 1**, terminar la pausa con el código actual. |
| 8 | T0+12 | **Prueba de humo**, en una ventana de incógnito:<br>a) Nóminas carga sin aviso de "no se pudieron cargar".<br>b) En una nómina en borrador, escribir "verificación" en Notas, esperar 3 s, sin aviso; borrar el texto, esperar 3 s, sin aviso.<br>c) **Foto 4:** solo cambió la versión de esa fila y la cantidad de nóminas es la misma.<br>d) Supabase → Logs → Postgres: ningún `MEDITERRA_NOMINAS` desde el paso 7. La PARTE 3 captura sus propios rechazos dentro de la transacción, así que no deberían figurar como error **[Probable]**. | Error 400 `SIN_VERSION` o 404 de la función en la prueba de humo: **Nivel 1** y después volver al despliegue anterior en Vercel (en ese orden). |
| 9 | T0+15 | **Fin de la pausa.** Avisar: abrir la app en una pestaña nueva. Quien vea el aviso de "nueva versión", recarga. Reingresar lo anotado en el paso 1. | — |
| 10 | T0+15 → +48 h | **Monitoreo** (ver abajo). | Según la tabla de reversión. |

### Recuperación de ediciones pendientes

- **Código de producción (antes de la pausa):** no tiene copia local ni aviso de "no guardado". Por eso el paso 1 obliga a recargar y comprobar *antes* de detenerse, y el paso 4 demuestra con la huella que nadie quedó guardando.
- **Pestaña olvidada abierta:** el detector de versión (`checkNewDeploy`, cada 30 s) la **recarga sola** si está en segundo plano. Si está visible, muestra el aviso de nueva versión. Si alguien edita en ella antes de recargar, la base lo rechaza y esa edición queda **solo en su pantalla**. Se detecta en los registros (monitoreo) y la persona debe reingresarla.
- **Código nuevo (después):** si un guardado no se confirma, la edición queda en pantalla, en una copia del navegador y en "Descargar mis cambios". La app avisa qué pasó y nunca lo da por guardado.

## Cómo se verifica que ambos quedaron funcionando

| Qué | Prueba | Evidencia |
|---|---|---|
| La base exige la versión | PARTE 3 (paso 6): 9 de 9 `ok` | Salida de la consulta |
| El código antiguo queda bloqueado | PARTE 3 filas 1, 6 y 7 (upsert antiguo y PATCH directo rechazados) | Ídem |
| El cliente nuevo guarda por la función | Prueba de humo (paso 8) + foto 4 | Foto antes/después: cambió solo esa fila |
| Nadie quedó escribiendo sin versión | Logs de Postgres sin `MEDITERRA_NOMINAS_SIN_VERSION` después del paso 9 | Consulta de logs |

**Consultas de monitoreo** (Supabase → Logs Explorer; sintaxis **[Probable]**, ajustar a lo que muestre la consola):

```sql
-- Escrituras de nóminas rechazadas (pestañas con código antiguo u otro camino)
select timestamp, event_message from postgres_logs
where event_message like '%MEDITERRA_NOMINAS%' order by timestamp desc limit 100;
```

Cada rechazo es una edición que **no** se guardó. Hay que identificar a la persona por la hora y avisarle que recargue y reingrese.

## Cuándo revertir

**Regla de orden:** nunca volver al código antiguo con el trigger activo, porque ese código quedaría sin poder guardar nóminas. Siempre **Nivel 1 primero** y después, si corresponde, el despliegue anterior en Vercel.

| Síntoma | Acción |
|---|---|
| PARTE 3 con algún `false` | Nivel 1 inmediato, no desplegar |
| El despliegue no queda listo en ~20 min | Nivel 1, terminar la pausa con el código actual |
| La prueba de humo falla (400 `SIN_VERSION`, 404 de la función, error de permisos) | Nivel 1 → despliegue anterior en Vercel → terminar la pausa |
| Después de activar, fallan guardados de **otras** filas (finanzas, créditos, maestros) | Nivel 1 inmediato: indica interacción con un trigger existente |
| Una fila de nóminas pierde nóminas sin explicación (foto: `cantidad_nominas` baja) | Volver a pausar, comparar con la copia CSV y la foto 1, corregir desde el SQL Editor; decidir con los datos |
| El código nuevo falla de forma generalizada en Nóminas (avisos de carga o de error HTTP en muchos usuarios) | Nivel 1 → despliegue anterior → reanudar con el código actual |
| Rechazos de pestañas antiguas en los registros | **No revertir**: es lo esperado. Contactar a la persona |
| Avisos de conflicto entre dos personas | **No revertir**: es el comportamiento diseñado |

**Nivel 2** (quitar la función) solo después de volver a un cliente que no la use. No es urgente: la función sola no cambia nada.

## Hallazgo relacionado (no corregido en este cambio)

**[Seguro]** El botón de administración "📤 Restaurar" (`App.jsx`) escribe cada fila del respaldo con la llave pública, no revisa las respuestas y siempre informa "Respaldo restaurado exitosamente".

- **Hoy:** el problema ya existe para cualquier fila que falle.
- **Con el trigger activo:** las filas `nominas_*` serían rechazadas y el mensaje igual diría éxito.

Mientras no se corrija, **las nóminas se restauran solo desde el SQL Editor**, donde el control no aplica. La propuesta es que el botón revise cada respuesta y liste las filas no restauradas. No está hecho.

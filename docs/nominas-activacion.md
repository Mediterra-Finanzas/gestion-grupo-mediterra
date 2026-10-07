# Nóminas: procedimiento de activación de la versión obligatoria

> **Estado: PROCEDIMIENTO PROPUESTO, NO EJECUTADO.** Autorización y horario: pendientes hasta revisar
> los resultados de las consultas de producción (`docs/consultas-pendientes-produccion.md`) y los respaldos
> disponibles. Cada paso que escribe en producción necesita esa autorización.
> Piezas: `supabase/propuesta_nominas_version_obligatoria.sql` (partes 0–3),
> `supabase/propuesta_nominas_version_obligatoria_reversion.sql` y
> `supabase/verificar_activacion_nominas.sql` (foto de solo lectura).
> Diseño y riesgos: `docs/nominas-version-obligatoria.md`.

## Orden completo

| Etapa | Qué | Cuándo | Escribe en producción |
|---|---|---|---|
| **1. Crear la función** | PARTE 1. Inerte para el código actual | Días antes | Sí: crea 2 funciones, no cambia datos |
| **2. Preparar y comprobar el despliegue** | Commit validado, build listo, plan de vuelta atrás probado | Días antes / mismo día | No |
| **3. Iniciar la pausa** | Guardar → comprobar → copiar → cerrar sesiones → confirmar quietud | Día D | No |
| **4. Activar el trigger** | PARTE 2 + verificación (PARTE 3, con ROLLBACK) | Día D, dentro de la pausa | Sí: crea el trigger |
| **5. Desplegar la versión compatible** | Publicar el commit validado y hacer la prueba de humo | Día D, dentro de la pausa | Sí: despliegue + 2 guardados de prueba |
| **6. Reanudar y monitorear** | Fin de la pausa, 48 h de seguimiento | Día D → D+2 | — |

**Por qué este orden.** El trigger entra antes que el despliegue y dentro de la pausa. Así nunca hay un momento en que:

- el código antiguo pueda escribir nóminas con la pausa iniciada, ni
- el código nuevo atienda usuarios sin que la base exija la versión.

El costo es que, entre la etapa 4 y el fin de la etapa 5, nadie puede guardar nóminas. Por eso se hace con el trabajo detenido.

**Camino B (2026-10-07).** La app de la rama ya NO guarda por la función: este procedimiento aplica a una entrega posterior que vuelva a usarla. En esa entrega rige la dependencia dura: si se publicara sin la etapa 1, ningún guardado de nóminas funcionaría: la app avisa y conserva la edición, pero no avanza.

## Etapa 1 — Crear la función (días antes)

1. Revisar los resultados de `docs/consultas-pendientes-produccion.md`:
   - **V1:** los triggers existentes no deben tocar `id`, `value` ni `updated_at` de `nominas_*`.
   - **V5/V6:** ninguna función debe eludir el control.
   - **V7:** sin vistas escribibles por la llave pública.
   - **V8:** sin variables `mediterra.`.
2. Repetir en local `scripts/nominas-cas/prueba.mjs` y `scripts/e2e/nomina-base-real.mjs`, esta vez **con el código real de esos triggers**.
3. PARTE 1 en el SQL Editor. Si cualquier comprobación interna no calza, se aborta sola.
4. Foto (`verificar_activacion_nominas.sql`, sección 3): `funcion_existe = 1` y `trigger_estado` vacío.

## Etapa 2 — Preparar y comprobar el despliegue

1. **Fijar el commit exacto** que se va a publicar. Ese commit tiene que haber pasado la regresión completa: pruebas puras, jest, E2E con el Supabase falso y E2E contra la base local.
2. **Construcción comprobada:** el PR de ese commit aparece "Ready" en la vista previa de Vercel y `CI=true npm run build` del mismo commit termina sin errores.
   - **Cuidado:** la vista previa de Vercel usa la base de **producción**. No se edita nada en ella.
   - Si alguien la abre, guardará por la función (que ya existe tras la etapa 1). Es el mismo riesgo que cualquier sesión en producción, pero conviene no usarla.
3. **Vuelta atrás preparada:**
   - identificar en Vercel el despliegue de producción vigente, al que se volvería con *Instant Rollback* **[Probable]**: confirmar en la consola que la opción está disponible;
   - tener abierto el archivo de reversión (Nivel 1).
4. **Quién hace qué el día D:** una persona en el SQL Editor y en Vercel (Angelo), y una persona que coordina al equipo de Nóminas.

## Etapa 3 — Iniciar la pausa (en este orden)

| Paso | Qué | Comprobación |
|---|---|---|
| 3.1 | Aviso al equipo de Nóminas (prepara, revisa, aprueba, registra): "Nóminas se detiene en 15 minutos, por ~30 minutos". | — |
| 3.2 | **Primero, comprobar que las ediciones estén guardadas**, sin recargar todavía. Cada persona termina lo que está haciendo y espera unos 10 segundos después del último cambio. | — |
| 3.3 | **Si hay cualquier duda** de que algo quedó guardado, **conservar una copia antes de recargar**: "Descargar Expediente" o imprimir la nómina, o al menos una captura de pantalla y una nota con lo editado en los últimos minutos. El código de producción **no** guarda copias locales ni avisa si no se guardó. | Cada persona confirma "copia hecha" o "sin dudas". |
| 3.4 | **Recién entonces**, recargar la página y comprobar que lo editado aparece. Si falta algo, volver a ingresarlo, esperar 10 s y repetir 3.4. | Cada persona confirma "todo está". |
| 3.5 | **Cerrar todas las pestañas de la app**, no solo Nóminas, en todos los equipos, también los que estén en otra oficina o en casa. | Cada persona confirma "cerrado". |
| 3.6 | **Foto 1** (`verificar_activacion_nominas.sql`, secciones 1 y 2) y **copia de recuperación**: en el SQL Editor, `select id, updated_at, value from calendario_data where id like 'nominas\_%' order by id;` exportada a CSV. Contiene datos de nómina: guardarla en un lugar restringido. | Si no se puede exportar, no seguir. |
| 3.7 | **Foto 2**, 2 minutos después. `huella_total` idéntica a la foto 1. | Si cambió, alguien sigue guardando: la foto 1 dice qué fila. Volver a 3.2 con esa persona. |
| 3.8 | **Señales de sesiones abiertas** (ver abajo). Ninguna lectura de filas `nominas_*` desde la API en los últimos 2 minutos, y ninguna conexión de tiempo real activa. | Si hay, identificar el equipo y cerrarlo. Si no se puede identificar, decidir con ese riesgo explícito o posponer. |

**Lo que las fotos NO demuestran.** Dos fotos iguales prueban solo que **nadie guardó en esos 2 minutos**. No prueban que todas las sesiones estén cerradas: una pestaña abierta sin editar no cambia nada.

Para eso sirven las señales de 3.8:

- **[Seguro]** El código de producción relee las nóminas **cada 30 segundos** mientras Nóminas está abierta. Una pestaña así deja lecturas de `calendario_data?id=eq.nominas_*` en los registros de la API. Revisar en Supabase → Logs → API (edge) que no haya ninguna en los últimos 2 minutos. La consulta exacta del explorador de registros es **[Probable]**: ajustarla a lo que muestre la consola.
- **[Probable]** Cada pestaña de la app abre una conexión de tiempo real. Supabase → Realtime (inspector o reportes) debería mostrar 0 conexiones de la app.

Aun con ambas señales limpias queda un caso que nada detecta antes: un equipo suspendido con una pestaña abierta. Al despertar, si la pestaña está en segundo plano, el detector de versión la recarga sola. Si está visible y alguien edita antes de recargar, la base rechaza ese guardado. Esa edición queda solo en esa pantalla y se detecta después en los registros (etapa 6).

## Etapa 4 — Activar el trigger (dentro de la pausa)

| Paso | Qué | Si falla |
|---|---|---|
| 4.1 | PARTE 2 | Si se aborta: no seguir, terminar la pausa con el código actual (no hay nada que revertir). |
| 4.2 | Foto 3 (sección 3): `trigger_estado = O` | — |
| 4.3 | PARTE 3 (transacción con ROLLBACK): 9 filas `ok = true` | Cualquier `false`: **Nivel 1**, terminar la pausa con el código actual, no desplegar. |

Desde 4.1, **el código actual de producción ya no puede guardar nóminas**: por eso todo esto ocurre con las sesiones cerradas.

## Etapa 5 — Desplegar la versión compatible (dentro de la pausa)

| Paso | Qué | Si falla |
|---|---|---|
| 5.1 | Merge del commit fijado en la etapa 2 → despliegue de producción en Vercel. Esperar "Ready" y confirmar que el despliegue de producción corresponde a **ese** commit. | Ver "Reversión si el despliegue falla". |
| 5.2 | **Prueba de humo**, en ventana de incógnito:<br>a) Nóminas carga sin aviso de "no se pudieron cargar".<br>b) En una nómina en borrador, escribir "verificación" en Notas, esperar 3 s, sin aviso; borrar el texto, esperar 3 s, sin aviso.<br>c) **Foto 4:** solo cambió la versión de esa fila y la cantidad de nóminas es igual.<br>d) Logs de Postgres: ningún `MEDITERRA_NOMINAS` desde 5.1. | Ver "Reversión". |

### Reversión si el despliegue falla después de activar el trigger

**Regla:** nunca dejar el código antiguo publicado con el trigger activo, porque ese código no puede guardar nóminas. **Siempre Nivel 1 primero.**

| Situación | Acción, en este orden |
|---|---|
| El despliegue de 5.1 **no llega a "Ready"** (falla la construcción, error de Vercel) y no se resuelve en ~20 min | 1) **Nivel 1** (quitar el trigger) → producción sigue con el código actual, que vuelve a poder guardar. 2) Foto: `trigger_estado` vacío. 3) Fin de la pausa: el equipo reabre y trabaja como antes. 4) Investigar y reprogramar. La función de la etapa 1 se puede dejar: es inerte. |
| El despliegue queda "Ready" pero **la prueba de humo falla** (no carga, 400 `SIN_VERSION`, 404 de la función, error de permisos) | 1) **Nivel 1**. 2) **Instant Rollback** en Vercel al despliegue anterior. 3) Confirmar en incógnito que se sirve la versión anterior y que un guardado de prueba funciona. 4) Fin de la pausa. |
| Queda publicado un despliegue **a medias** o no se sabe qué versión se sirve | Tratarlo como el caso anterior: Nivel 1 + Instant Rollback, y confirmar la versión servida antes de reanudar. |

**Nivel 2** (quitar la función) solo después de volver a un cliente que no la use. No es urgente.

## Etapa 6 — Reanudar y monitorear

1. **Fin de la pausa:** avisar al equipo que abra la app en una pestaña **nueva**. Quien vea el aviso de nueva versión, recarga. Reingresar lo anotado en 3.3, si hubo algo.
2. **Monitoreo de 48 h:** en Logs de Postgres, buscar `MEDITERRA_NOMINAS`. Cada aparición es un guardado rechazado, es decir, una pestaña antigua o un camino no previsto: identificar por la hora y avisar a la persona.

### Cuándo revertir después de reanudar

| Síntoma | Acción |
|---|---|
| Fallan guardados de **otras** filas (finanzas, créditos, maestros) | Nivel 1 inmediato: indica interacción con un trigger existente |
| El código nuevo falla de forma generalizada en Nóminas | Nivel 1 → Instant Rollback → reanudar con el código anterior |
| Una fila de nóminas pierde nóminas sin explicación (foto: `cantidad_nominas` baja) | Pausar, comparar con la copia CSV y la foto 1, corregir desde el SQL Editor y decidir con los datos |
| Rechazos de pestañas antiguas en los registros | **No revertir**: es lo esperado. Contactar a la persona |
| Avisos de conflicto entre dos personas | **No revertir**: comportamiento diseñado |

## Restaurar un respaldo con la protección activa

El botón "📤 Restaurar" (administración) ahora comprueba cada fila e informa cuáles se restauraron y cuáles no (`src/restaurarRespaldo.js`). Ante un resultado parcial dice "RESTAURACIÓN PARCIAL" y advierte que los datos quedaron mezclados; nunca informa éxito completo en ese caso. Prueba: `scripts/e2e/restaurar-parcial.mjs`.

Con el trigger activo, las filas `nominas_*` aparecen como "rechazada por la protección de Nóminas". **Las nóminas se restauran desde el SQL Editor**, donde el control no aplica.

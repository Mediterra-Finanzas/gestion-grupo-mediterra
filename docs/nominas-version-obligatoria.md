# Nóminas: la base exige la versión leída — propuesta

> **Estado (2026-10-05): PROPUESTA, NO APLICADA.** Probada solo en local, con Postgres 16 + PostgREST 12
> y datos de prueba. No hay cambios de permisos, triggers ni escrituras en producción. El PR sigue en borrador.
>
> - SQL: `supabase/propuesta_nominas_version_obligatoria.sql`
> - Reversión: `supabase/propuesta_nominas_version_obligatoria_reversion.sql`
> - Cliente (parche **no aplicado**): `supabase/propuesta_nominas_version_obligatoria_cliente.patch`
> - Prueba: `POSTGREST_BIN=/ruta/postgrest node scripts/nominas-cas/prueba.mjs` — 42/42 casos OK. Control negativo: con el trigger desactivado fallan 8 casos.

## Problema

**[Seguro]** El guardado condicionado de la rama (`docs/nominas-guardado-condicionado.md`) protege solo a las pestañas que ya tienen el código nuevo. Una pestaña abierta con el código de producción sigue haciendo un *upsert* sin condición de la fila completa `nominas_<empresa>` hasta que se recargue. Eso pisa lo que otros guardaron.

El caso A1 de la prueba lo reproduce: la nómina B desaparece. Desplegar fuera de horario reduce cuántas pestañas viejas quedan abiertas, pero no lo impide.

## Mecanismo

La base no puede ver el filtro `&updated_at=eq.…` de un PATCH: un trigger solo ve la fila antes y después del cambio. Por eso la versión leída tiene que llegar como **dato** de la escritura. Se hace con dos piezas.

1. **Función `nominas_guardar(id, valor, versión_leída)`**, publicada por PostgREST en `/rest/v1/rpc/nominas_guardar`:
   - **Con versión:** escribe solo si la fila sigue en esa versión. La condición se evalúa con la fila bloqueada, así que dos guardados simultáneos no pueden ganar los dos (caso E8: 6 simultáneos, 1 escribe).
   - **Sin versión (`null`):** crea la fila solo si no existe; si ya existe, responde `existe`.
   - **Respuestas:**

     | Respuesta | Significado | ¿Escribe? |
     |---|---|---|
     | `ok` | guardado, con la versión nueva | sí |
     | `conflicto` | otro guardó después de tu lectura | no |
     | `existe` | la fila ya estaba creada | no |
     | `no_existe` | la fila se borró después de leerla | no |

     Cuando no escribe, el cliente relee y combina con la lógica ya probada (`guardarFila`).
   - **Seguridad:** es `SECURITY INVOKER`, así que corre con los permisos y las políticas RLS de quien llama y no amplía nada.
   - **Validaciones:** exige el mismo formato de hoy, es decir, texto JSON con la lista `nominas`. Solo acepta filas de nóminas por empresa.
2. **Trigger `trg_nominas_exigir_version`** (BEFORE INSERT OR UPDATE): para los roles `anon` y `authenticated`, rechaza toda escritura de una fila `nominas_<empresa>` que no venga de la función.
   - **Cómo reconoce a la función:** ella marca la fila autorizada con una variable de la transacción (`set_config(..., true)`). La llave pública no puede fijar esa variable por su cuenta: `set_config` no está expuesta (caso E7).
   - **Error que devuelve:** HTTP 400 `MEDITERRA_NOMINAS_SIN_VERSION: … recárgala`.

### Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Encabezado HTTP con la versión (`X-…`), leído en el trigger desde `request.headers` | Exige que la configuración CORS de Supabase acepte un encabezado nuevo. No está verificado, y si falla, ningún guardado funciona. |
| Columna nueva `version_leida` en la tabla | Cambia el esquema de una tabla que leen todos los módulos y el respaldo. Es más superficie para el mismo efecto. |
| Meter la versión dentro de `value` | Cambia el formato de la fila (texto JSON) que lee el código antiguo. |
| Sellos (`propuesta-sellos.sql`) | Protegen datos puntuales y vencen; no exigen versión. |

## Compatibilidad

| Quién escribe | Hoy | Con la propuesta activa |
|---|---|---|
| Pestaña con código de **producción** (upsert sin condición) | Pisa la fila completa | **Rechazada** (400), no escribe nada (C1) |
| Pestaña con código de producción **creando** una fila nueva | La crea | **Rechazada**: no crea (C2) |
| Escritura a la fila antigua `nominas` (desvío del código antiguo cuando falla "¿ya se migró?") | La reescribe | **Rechazada**: solo lectura (C3) |
| Rama actual **sin** el parche (PATCH con filtro / POST) | Funciona | **Rechazada** (C4, C5). **El parche de cliente es obligatorio** |
| Cliente con el parche (función) | — | Funciona: combina, conflictos, respuesta perdida (F1–F5) |
| Panel de migración de nóminas (upsert) | Funciona | Rechazado. La migración ya se hizo (`nominas_v2_done` existe) |
| `nominas_correlativos`, `nominas_tipos_doc`, `nominas_v2_done`, `finanzas` y el resto | Igual | **Sin cambio** (D1) |
| SQL Editor (`postgres`) y `service_role` (restauraciones) | Igual | **Sin cambio**: la regla aplica solo a la llave pública (D2, D3) |
| Lectores (todos los módulos, respaldos) | Igual | **Sin cambio**: mismo formato y mismo esquema. Se comprobó el texto byte a byte (E2) |
| Renombrar una fila desde/hacia `nominas_*` | Posible | Rechazado (C6, C7) |

**Filas protegidas** = todo `nominas_*`, salvo una lista explícita de exclusión: `nominas_v2_done`, `nominas_tipos_doc`, `nominas_correlativos` y `nominas_respaldo*`.
- **Empresa nueva:** su fila queda protegida sola.
- **Fila auxiliar nueva con prefijo `nominas_`:** hay que agregarla a la exclusión; si no, sus escrituras directas serían rechazadas. La PARTE 0.4 lista qué filas de producción quedan en cada grupo.

### Filas nuevas

**[Seguro]** Crear la fila de una empresa que todavía no tiene nóminas solo se puede hacer con la función, indicando "leí que no existía" (versión `null`):
- **Fila creada entretanto por otra pestaña:** la respuesta es `existe`, sin pisar. El cliente relee y combina (F3: quedan las dos nóminas).
- **Código antiguo:** no puede crear filas. Esto cierra también el caso en que el código antiguo, tras una lectura fallida, creía que la empresa estaba vacía y escribía una fila con solo la nómina nueva.

## Lo que la base NO puede resolver (la respuesta incómoda)

1. **[Seguro] El código de producción ignora el resultado del auto-guardado** (`dbSaveNominas(list)` sin revisar la respuesta, `origin/main` línea 16136).
   - **Efecto:** una pestaña vieja que edita después de la activación recibe el rechazo, pero el usuario no se entera. Su edición sigue en pantalla y se pierde al recargar.
   - **Transiciones:** si en esa pestaña vieja se hace un cambio de estado, el código antiguo envía los correos aunque la base rechace el guardado.

   Esto **sustituye** el riesgo de hoy por uno menor:
   - **Hoy:** una pestaña vieja borra en silencio el trabajo confirmado de **otros**.
   - **Con la propuesta:** solo puede perder **su propia** edición no guardada, y nada de otros.

   Ningún cambio en la base hace que el código viejo se dé cuenta.

   Mitigaciones:
   - el detector de versión nueva (`checkNewDeploy`, cada 30 s) recarga solas las pestañas ocultas y muestra un aviso en las visibles;
   - pedir al equipo que recargue al activar;
   - revisar en Supabase → Logs → API las respuestas 400 sobre `calendario_data` posteriores a la activación, que identifican escrituras rechazadas **[Probable]**: el registro guarda ruta y estado, no el cuerpo.
2. **No es una barrera de seguridad.** Quien tenga la llave pública puede leer la versión y escribir mediante la función. La propuesta protege la **consistencia** (nadie pisa sin haber visto lo último), no el acceso. DELETE sigue abierto para `anon`; eso va por la propuesta separada.
3. **Triggers existentes no reproducidos.** `trg_cd_scrub_main` y `trg_guard_main_no_user_shrink` no están en la prueba local porque falta su código completo (consulta 7). Antes de aplicar hay que:
   - confirmar que no tocan `id`, `value` ni `updated_at` de las filas `nominas_*`;
   - repetir la prueba con ellos.
4. **Funciones y vistas expuestas.** Si alguna función ya publicada en el esquema `public` ejecutara SQL arbitrario, podría fijar la variable de autorización. Eso queda pendiente de la revisión de funciones y vistas accesibles de la parte 0.

## Implementación (orden)

| Paso | Qué | Efecto en usuarios | Ventana de riesgo |
|---|---|---|---|
| 0 | PARTE 0 (solo lectura) + revisión de triggers/funciones | Ninguno | — |
| 1 | PARTE 1: crear la función | Ninguno: nadie la llama todavía; el código antiguo sigue igual (B6) | — |
| 2 | Desplegar el cliente: rama + parche | Pestañas nuevas guardan por la función (B7) | Las pestañas viejas aún pueden pisar, igual que hoy |
| 3 | PARTE 2: activar el trigger, **minutos** después del despliegue | Pestañas viejas: rechazadas | Se cierra la ventana del paso 2 |
| 4 | PARTE 3: verificación | Ninguno (ROLLBACK) | — |

**¿Por qué no activar antes de desplegar?** Entre la activación y el despliegue, **nadie** podría guardar nóminas, ni siquiera quien recargó. Con el código antiguo, esas ediciones también se perderían en silencio. El orden 1 → 2 → 3 deja una ventana corta, la del despliegue de Vercel más los minutos que se decidan, en que se mantiene el riesgo de hoy.

**PARTE 3** corre como `anon` dentro de una transacción que termina en `ROLLBACK`:
- usa filas ficticias;
- de la fila antigua `nominas` solo hace un UPDATE que no cambia nada y se revierte;
- devuelve 9 pruebas que deben dar `ok = true`.

No deja cambios, pero es una ejecución en producción: necesita la misma autorización que la activación.

## Reversión

| Nivel | Qué hace | Cuándo |
|---|---|---|
| 1 | Quita el trigger | Inmediato. Vuelve el comportamiento de hoy para el código antiguo; el cliente nuevo sigue funcionando (H2) |
| 2 | Quita la función | Solo **después** de volver a desplegar un cliente que no la use. Se aborta si el nivel 1 no se hizo (H1); si no, toda escritura de la llave pública fallaría |

No hay datos que deshacer: la propuesta no modifica filas ni el esquema.

## Lo que falta antes de aplicar

1. JSON completo de la consulta 7 (código de los triggers) y resultados de la parte 0. Con eso hay que repetir la prueba con esos triggers.
2. **Validación final sobre la versión que se vaya a desplegar.**
   - La prueba en navegador `scripts/e2e/nomina-condicionado.mjs` usa hoy PATCH/POST.
   - Con el parche, el Supabase falso de `scripts/e2e/fake.mjs` necesita soportar `/rpc/nominas_guardar`. **No está hecho.**
   - El parche aplica limpio sobre la rama y compila (`CI=true npm run build`), pero no se ha probado en el navegador.
3. Decidir el horario de activación (paso 3) y el aviso al equipo para recargar.

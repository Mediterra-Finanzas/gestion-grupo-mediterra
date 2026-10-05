# Nóminas: la base exige la versión leída — propuesta

> **Estado (2026-10-05): SQL PROPUESTO, NO APLICADO EN PRODUCCIÓN. Cliente aplicado en la rama** (sin despliegue
> ni merge). Probado solo en local con Postgres 16 + PostgREST 12 y datos de prueba. El PR sigue en borrador.
>
> - SQL: `supabase/propuesta_nominas_version_obligatoria.sql` · reversión: `…_reversion.sql`
> - Cliente: `src/nominasTransporteRpc.js` (la app guarda nóminas solo por `nominas_guardar`)
> - Procedimiento de activación: `docs/nominas-activacion.md` · foto de verificación: `supabase/verificar_activacion_nominas.sql`
> - Pruebas: `scripts/nominas-cas/prueba.mjs` (SQL por la API REST, 51 casos) y `scripts/e2e/nomina-base-real.mjs`
>   (la app en el navegador contra la base local con el SQL aplicado tal cual, 26 casos, 3 corridas seguidas).
>   Controles negativos: sin el trigger fallan 8 casos; con la regla anterior (solo rol de conexión, `public` antes que
>   `pg_catalog`) fallan K1 y K3.

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
2. **Trigger `trg_nominas_exigir_version`** (BEFORE INSERT OR UPDATE): rechaza toda escritura de una fila `nominas_<empresa>` que no venga de la función cuando el rol de la conexión es `anon`/`authenticated` **o** la petición llegó con una llave de esos roles (JWT), aunque pase por una función `SECURITY DEFINER` (caso K1).
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
| Versión anterior de la rama (PATCH con filtro / POST) | Funciona | **Rechazada** (C4, C5). Por eso el cliente nuevo usa la función |
| Cliente de la rama (función) | — | Funciona: combina, conflictos, respuesta perdida (F1–F5 y E2E en navegador) |
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
   - la pausa coordinada con cierre de todas las pestañas antes de activar (`docs/nominas-activacion.md`);
   - revisar en Supabase → Logs → API las respuestas 400 sobre `calendario_data` posteriores a la activación, que identifican escrituras rechazadas **[Probable]**: el registro guarda ruta y estado, no el cuerpo.
2. **No es una barrera de seguridad.** Quien tenga la llave pública puede leer la versión y escribir mediante la función. La propuesta protege la **consistencia** (nadie pisa sin haber visto lo último), no el acceso. DELETE sigue abierto para `anon`; eso va por la propuesta separada.
3. **Triggers existentes no reproducidos.** `trg_cd_scrub_main` y `trg_guard_main_no_user_shrink` no están en la prueba local porque falta su código completo (consulta 7). Antes de aplicar hay que:
   - confirmar que no tocan `id`, `value` ni `updated_at` de las filas `nominas_*`;
   - repetir la prueba con ellos.
4. **Funciones y vistas expuestas: revisado lo que se puede revisar sin producción.** Ver "Permisos y caminos de elusión". Lo que depende de qué existe en producción queda en la PARTE 0 (0.5–0.8), pendiente de sus resultados.
5. **El botón "📤 Restaurar" de administración** escribe con la llave pública. Antes siempre informaba éxito; **corregido en la rama**: comprueba cada fila y, ante un resultado parcial, dice cuáles fallaron (las de nóminas, "rechazada por la protección"). Las nóminas se restauran desde el SQL Editor.

## Permisos y caminos de elusión

| Camino | Riesgo | Tratamiento | Prueba |
|---|---|---|---|
| La función `nominas_guardar` | Que amplíe permisos | `SECURITY INVOKER`: corre con los permisos y RLS de quien llama. `EXECUTE` revocado a `PUBLIC` y dado solo a anon, authenticated y service_role. Solo acepta filas de nóminas por empresa y el formato de hoy | E5, E6 |
| La variable de autorización (`mediterra.nominas_cas`) | Que la llave pública la fije sin la función | Es local a la transacción y la función la limpia al terminar. `set_config` no está publicada por la API | E7 |
| Variable fijada por rol (`alter role anon set mediterra…`) | Activaría el permiso para toda sesión | La PARTE 1 se aborta si existe; PARTE 0.8 la muestra | B3b |
| Función `SECURITY DEFINER` publicada que escriba `calendario_data` | Corre como su dueño (postgres) y esquivaba la regla basada solo en el rol de conexión | El trigger mira también el rol del JWT de la petición | **K1** (falla con la regla anterior), K1b |
| Vista actualizable sobre `calendario_data` | Otro camino de escritura | El trigger de la tabla se dispara igual | K2 |
| Objeto malicioso en `public` con nombre de función del sistema (`set_config`) | Suplantación por `search_path` | `search_path = pg_catalog, public, pg_temp` en ambas funciones | **K3** (falla con `public` primero) |
| Funciones con SQL dinámico ya existentes en producción | Podrían fijar la variable | No se puede saber sin producción: PARTE 0.5 (lista con marcas) y 0.6 (código completo) | K4 (la PARTE 0 detecta una función así) |
| Escritura directa a la tabla por GraphQL (`/graphql/v1`) | Otro camino de escritura | Pasa por INSERT/UPDATE con el JWT: el trigger aplica **[Probable]**, no probado (no hay pg_graphql local) | — |
| `TRUNCATE` / `DELETE` | No son escrituras de fila con versión | Fuera de esta propuesta. DELETE va en la propuesta separada. Los privilegios TRUNCATE de anon se deben revisar en esa misma propuesta (no se mezclan) | — |

## Implementación

El orden cambió respecto de la primera versión de esta propuesta: **el trigger se activa durante una pausa coordinada y ANTES del despliegue**, de modo que no queda ninguna ventana de operación normal entre ambos. Procedimiento paso a paso, verificación y criterios de reversión: **`docs/nominas-activacion.md`**.

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

1. ~~Código de los triggers (V1) y PARTE 0~~ **Recibidos 2026-10-05**: los triggers existentes solo actúan sobre `main`, ninguna función publicada elude el control, no hay vistas ni variables `mediterra.` (`docs/revision-consultas-produccion-2026-10-05.md`). Las pruebas locales corren ahora con esos triggers y con los límites de tiempo por rol de producción. Falta P4 (esquemas publicados) para cerrar V5/V6/V9.
2. Validación final sobre el commit exacto que se vaya a desplegar.
3. Autorización y hora de la pausa (`docs/nominas-activacion.md`), después de revisar los respaldos disponibles (R1, R2, P1–P3).

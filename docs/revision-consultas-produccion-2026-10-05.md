# Revisión de las consultas de producción — 2026-10-05

Resultados enviados por Angelo (solo lectura, SQL Editor). Listado y códigos en `docs/consultas-pendientes-produccion.md`.
Lo que se **comprobó en local** usando esos resultados está marcado; lo que sigue dependiendo de producción, también.

## Recibido

### V — Protección de Nóminas

| Código | Resultado | Conclusión |
|---|---|---|
| **V1** | Dos triggers, con su código completo: `trg_cd_scrub_main` (BEFORE INSERT/UPDATE → `cd_scrub_main_credentials`) y `trg_guard_main_no_user_shrink` (BEFORE UPDATE → `guard_main_no_user_shrink`). Ambos terminan en `RETURN NEW` de inmediato si la fila no es `main` | **[Seguro]** No tocan `id`, `value` ni `updated_at` de las filas `nominas_*`. Su código se copió tal cual a `supabase/produccion_triggers_existentes.sql`, y las pruebas locales corren ahora con ellos. Prueba M de `prueba.mjs`: los tres triggers conviven; `main` se sigue limpiando y protegiendo, y las nóminas se guardan por la función |
| **V2** | 0 filas | Los nombres de la propuesta están libres |
| **V3** | 1 | `id` es único: `ON CONFLICT (id)` funciona |
| **V4** | 9 filas por empresa → protegidas; `nominas` (antigua, 2026-05-27) → solo lectura; `nominas_correlativos`, `nominas_tipos_doc`, `nominas_v2_done` → sin cambio | Coincide con la lista de exclusión. **Dato:** las 9 filas de empresa tienen la misma hora de guardado (2026-10-05 13:25:03.988 → 13:25:04.011, en 23 ms). Es la evidencia en vivo de que el código actual reescribe las 9 filas en cada guardado, aunque se haya editado una sola |
| **V5** | 5 funciones SECURITY DEFINER ejecutables por la llave pública: `fn_acc_approve_batch` y `fn_acc_post_batch` (solo `authenticated`), `fn_mis_empresas`, `osi_current_empresa`, `osi_current_rol` (anon y authenticated). Ninguna con marca de SQL dinámico, fija-variables ni `calendario_data`. Además aparece `graphql_public.graphql` (GraphQL activo) y funciones de trigger | Ver V6 |
| **V6** | Código de las 5 | **[Seguro]** Ninguna escribe en `calendario_data`, ninguna arma SQL dinámico y ninguna fija variables: **no eluden el control**. Las dos `fn_acc_*` escriben tablas contables y exigen sesión. Las otras tres solo leen tablas de roles |
| **V7** | 0 filas | No hay vistas sobre `calendario_data` |
| **V8** | `anon`: `statement_timeout=3s`. `authenticated`: 8s. `authenticator`: `session_preload_libraries=safeupdate`, `statement_timeout=8s`, `lock_timeout…` (cortado en la captura). Base: `app.settings.jwt_exp=3600` | **[Seguro]** Ninguna variable `mediterra.`: la PARTE 1 no se abortará por eso. Los límites de tiempo se replicaron en las bases locales. `safeupdate` rechaza UPDATE/DELETE **sin WHERE**; el UPDATE de `nominas_guardar` siempre lleva WHERE, así que no le afecta **[Seguro, por lectura del código]**. No se puede instalar `safeupdate` localmente para probarlo |
| **V9** | `anon` y `authenticated`: pueden usar `public` y `graphql_public`, **no pueden crear** objetos | El riesgo de suplantar funciones del sistema (K3) no es explotable hoy. Igual se mantiene `search_path` con `pg_catalog` primero |

**Consecuencia del límite de 3 s de `anon`.** Si dos personas guardan la misma empresa al mismo tiempo, la segunda espera el bloqueo de la fila. Con una espera mayor a 3 s, la base corta la llamada y la app muestra un aviso de error HTTP con la edición conservada (no se pierde nada). Con filas de hasta ~100 KB, el guardado tarda milisegundos **[Probable]**.

**GraphQL.** Está activo (`graphql_public.graphql`). Una escritura por GraphQL pasa por INSERT/UPDATE con el JWT de la petición, así que el trigger la cubre **[Probable]**. No se probó porque no hay `pg_graphql` local.

### D — Propuesta de retirar DELETE (tema separado)

| Código | Resultado | Conclusión |
|---|---|---|
| **D1** | **No llegó el resultado**: se envió el texto de la consulta | Pendiente: volver a ejecutarla y enviar el JSON |
| **D2** | `anon` y `authenticated` tienen DELETE, INSERT, REFERENCES, SELECT, TRIGGER, **TRUNCATE** y UPDATE sobre `calendario_data` (lo mismo que `postgres` y `service_role`) | **[Seguro]** La llave pública tiene permiso de **vaciar la tabla completa** (TRUNCATE). TRUNCATE ignora RLS y no dispara los triggers de fila, tampoco el de esta propuesta. Hoy **no es alcanzable por la API** **[Probable]**: PostgREST no ofrece TRUNCATE y, según V6, ninguna función publicada ejecuta SQL arbitrario. Igual es un permiso que sobra. Se propone retirarlo (y REFERENCES/TRIGGER) **dentro de la propuesta DELETE, no en esta** |
| **D3** | `anon`/`authenticated`: sin BYPASSRLS, sin superusuario, sin roles heredados | Los permisos efectivos son los de D2 + políticas |

## Recibido (segunda entrega, mismo día)

### D — Propuesta DELETE

| Código | Resultado | Conclusión |
|---|---|---|
| **D1** | 5 políticas: `cd_anon_auth_{select,insert,update,delete}` para `{anon,authenticated}` con `id !~~ 'backup%' AND id !~~ 'main_pre_restore%'`; `cd_service_all` para `service_role` | Igual a lo leído el 2026-10-01: la foto para revertir la propuesta DELETE está confirmada |
| **D3** | Sin BYPASSRLS, sin superusuario, sin roles heredados | Confirmado |
| **D4** | 0 filas | Sin vistas sobre `calendario_data` (coincide con V7) |
| **D5** | 0 filas | Ninguna función de ningún esquema menciona `calendario_data`. La app escribe esa tabla solo directamente por la API |

### R — Respaldos dentro de la base

| Código | Resultado |
|---|---|
| **R2** | 28 filas `backup_*`: la más antigua del 2026-05-01 y **la más reciente del 2026-09-02 11:53 UTC**, 87 MB en total. 1 fila `main_pre_restore_20260616` de 2.610 bytes |
| **R1** | Diarios del 2026-08-01 al 2026-09-02 (~3,6–3,8 MB cada uno) con días faltantes (08-02/03, 08-07/08/09, 08-22/23, 08-29), más mensuales del 06-01 (951 kB) y 05-01 (43 kB) |

**Lo incómodo [Seguro]:**
- **El respaldo más reciente dentro de la base tiene 33 días** (2 de septiembre). Todo lo cargado después solo se puede recuperar desde los respaldos de **plataforma** de Supabase (P1–P3, todavía sin confirmar).
- **Dos respaldos están vacíos (64 bytes): `backup_2026-07-01` y `backup_2026-08-11`.** El del 1 de julio era el mensual de julio, así que **no hay ningún respaldo utilizable de julio**.
- `main_pre_restore_20260616` pesa 2.610 bytes: es solo la fila `main` antes de la restauración del 16 de junio, no un respaldo completo.
- Los `backup_*` contienen copias de `main` y `pins` (credenciales) **[Probable]**: así funcionaba el generador `auto-v3`. Las políticas los ocultan a la llave pública. La decisión sobre su conservación queda pendiente y separada.

**Siguiente consulta:** **R3/R4** (`consulta_respaldos_existentes.sql`, secciones 3 y 4) para saber qué filas trae el respaldo del 2 de septiembre (solo nombres y tamaños), en particular si incluye las nóminas.

### U — Tablas de usuarios y roles (tema aparte de Nóminas y de DELETE)

| Tabla | RLS | Llave pública sin sesión (`anon`) | Con sesión (`authenticated`) | Conclusión |
|---|---|---|---|---|
| `rbac_roles` | **apagado** | leer, crear, modificar, borrar y vaciar | ídem | **Abierta** |
| `rbac_usuarios_roles` | **apagado** | leer, crear, modificar, borrar y vaciar | ídem | **Abierta** |
| `usuarios_empresa` | **apagado** | leer, crear, modificar, borrar y vaciar | ídem | **Abierta** |
| `osi_user_empresa` | activo | nada | permisos de tabla, pero solo existe la política SELECT de su propia fila | Protegida |
| `user_osiris_accounts` | activo, sin políticas | nada | permisos de tabla, pero sin políticas = todo denegado | Protegida (solo `service_role`) |
| `osi_auth_rate_limit` | activo | nada | nada | Protegida |

**[Seguro]** Las tres tablas abiertas están en el esquema `public`, que la API publica. Con la llave de la app, que está dentro del código que descarga cualquier navegador, **cualquiera puede leerlas, modificarlas o borrarlas por la API**. No guardan claves ni correos (U4: ids, empresa, rol, activo).

El riesgo real es **escalar permisos**: `fn_mis_empresas()` (SECURITY DEFINER, ejecutable por anon) decide a qué empresas tiene acceso un usuario leyendo `rbac_usuarios_roles`. Quien inserte una fila ahí se daría acceso a otras empresas en todo lo que use esa función. **Qué protege exactamente lo dice U6**, y U7 da el conteo de filas. Mientras no lleguen, el impacto es **[Suponiendo]**.

**No se corrigió nada.** La corrección probable es activar RLS en esas tres tablas y retirar los permisos de `anon`: `fn_mis_empresas` es SECURITY DEFINER y seguiría funcionando. Se propondrá **después de ver U6**, en una propuesta propia, sin mezclarla con Nóminas ni con DELETE.

## Pendiente de producción

| Código | Qué falta |
|---|---|
| **R3, R4** | Contenido (solo nombres y tamaños) del respaldo del 2 de septiembre |
| **U6, U7** | Qué políticas dependen de las tablas de roles abiertas, y cuántas filas tienen |
| **P1–P4** | Consola: último respaldo de plataforma, PITR, opciones de restauración y esquemas publicados |
| V8 completo | JSON con la fila de `authenticator` sin cortar (no cambia la conclusión) |

## Observaciones fuera de esta propuesta (no se corrigen aquí)

- `fn_mis_empresas` es SECURITY DEFINER **sin `search_path` fijo**. Hoy no es explotable porque la llave pública no puede crear objetos (V9), pero es una mala práctica que conviene corregir en el tema de tablas de usuarios (U).
- `osi_current_empresa` y `osi_current_rol` confían primero en *claims* del JWT (`empresa_id`, `osiris_rol`). Es correcto si esos claims solo los emite el autenticador de Osiris. Se revisa con el tema U.

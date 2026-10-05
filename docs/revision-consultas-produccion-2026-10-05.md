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

## Pendiente de producción

| Código | Qué falta |
|---|---|
| **D1** | Enviar el **resultado** (JSON), no la consulta |
| **D4, D5** | No recibidos |
| **R1, R2** | Respaldos existentes: no recibidos |
| **U1–U5** | Tablas de usuarios y roles: no recibidos |
| **P1–P4** | Consola: último respaldo de plataforma, PITR, opciones de restauración, **esquemas publicados** (si hay otros además de `public` y `graphql_public`, hay que repetir V5, V6 y V9 con ellos) |
| V8 completo | La fila de `authenticator` quedó cortada en la captura (`lock_timeout…`). No cambia la conclusión, pero conviene el JSON completo |

## Observaciones fuera de esta propuesta (no se corrigen aquí)

- `fn_mis_empresas` es SECURITY DEFINER **sin `search_path` fijo**. Hoy no es explotable porque la llave pública no puede crear objetos (V9), pero es una mala práctica que conviene corregir en el tema de tablas de usuarios (U).
- `osi_current_empresa` y `osi_current_rol` confían primero en *claims* del JWT (`empresa_id`, `osiris_rol`). Es correcto si esos claims solo los emite el autenticador de Osiris. Se revisa con el tema U.

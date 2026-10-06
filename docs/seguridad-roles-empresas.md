# Seguridad: impedir que un usuario se asigne sus propios roles y empresas

> **Estado (2026-10-05): PROPUESTA, NO APLICADA.** Rama propia `claude/seguridad-roles-empresas`,
> separada del PR de Créditos/Nóminas. Ningún cambio en producción. Probada solo en local
> (Postgres 16 + PostgREST 12, datos de prueba).
>
> - SQL: `supabase/seguridad_roles/propuesta.sql` (partes 0 lectura · 1 cambio · 2 verificación · 3 reversión)
> - Consultas de lectura pendientes: `supabase/seguridad_roles/consultas_lectura.sql` (S1–S7)
> - Prueba: `POSTGREST_BIN=/ruta/postgrest node scripts/seguridad-roles/prueba.mjs` — 34/34, dos corridas seguidas

## Qué significa "administrador" en esta propuesta

**Administrador = una identidad que el SERVIDOR reconoce como autorizada, y que el propio usuario no puede otorgarse ni modificar.**

En esta propuesta, solo dos vías cumplen esa definición:
- **La llave `service_role`.** Vive solo en el servidor (Vercel y Edge Functions), nunca en el navegador.
- **El SQL Editor de Supabase**, que corre como `postgres` y requiere ingresar a la consola con la cuenta del proyecto.

**No** cuentan como administrador:
- el campo `rol`/`admin` de `main.usuarios` en `calendario_data`: hoy la llave pública puede modificarlo (ver "Fuera de esta propuesta");
- los metadatos del usuario en Supabase Auth (`user_metadata`): el propio usuario los edita;
- cualquier dato que llegue desde el navegador (pantalla, `localStorage`, parámetros de la petición).

Si más adelante se necesita un administrador "persona" dentro de la app, su identidad debe resolverla el servidor. Por ejemplo:
- una tabla de administradores que solo `service_role` puede escribir;
- un claim emitido por el servidor y firmado.

Lo propone el plan de `main`/`pins` (rama aparte), y nunca un valor que el cliente envíe.

## El problema, comprobado

Con los permisos leídos en producción (consultas U1–U9 del 2026-10-05), la prueba local reproduce esto (casos A2–A4):

1. Un usuario **con sesión** de Supabase Auth, sin ninguna asignación, inserta en `rbac_usuarios_roles` la fila "yo → empresa E1".
2. `fn_mis_empresas()` pasa a devolverle E1, y las políticas de las tablas contables lo dejan **ver los asientos y modificar el plan de cuentas** de E1.
3. También puede **mover a su nombre la asignación de otro usuario** o borrarla.

Exposición actual (U9): `contab_empresas` 11 filas, `contab_plan_cuentas` 746, y el resto en 0. El riesgo hoy es de **integridad** (alterar el plan de cuentas) más que de confidencialidad. Crece en cuanto se carguen asientos.

## Mecanismos de autorización revisados (no solo `rbac_usuarios_roles`)

| # | Mecanismo | Qué decide | Estado hoy | Propuesta |
|---|---|---|---|---|
| 1 | `rbac_usuarios_roles` → `fn_mis_empresas()` | Acceso a `contab_*`, `doc_lotes`, `cc_*`, `audit_log` | **Abierto**: RLS apagado, la llave pública escribe | RLS + sin escritura; cada usuario lee solo sus filas |
| 2 | `rbac_roles` (catálogo) | Nombres de roles | **Abierto** (lectura y escritura) | Solo lectura para usuarios con sesión |
| 3 | `usuarios_empresa` | Ninguna política la usa (U6/U8); la app tampoco | **Abierto** | Cerrada a la llave pública |
| 4 | `osi_user_empresa` → `osi_current_empresa()` / `osi_current_rol()` | Acceso y rol en las ~38 tablas `osi_*` | **Protegido**: RLS solo con lectura de la propia fila (caso A6) | Se retira la escritura como segunda barrera |
| 5 | `user_osiris_accounts` | Quién puede ingresar a Osiris (la lee la Edge Function con service_role) | **Protegido**: RLS sin políticas (A7) | Se retiran los permisos de la llave pública |
| 6 | Claims del JWT `empresa_id` / `osiris_rol` | Prioridad sobre `osi_user_empresa` en `osi_current_*` | **Depende de quién los emite** | Sin cambios: ver "Pendiente S1/S3" |
| 7 | Registro abierto / ingresos anónimos en Supabase Auth | Quién puede obtener una sesión | **Por confirmar (P5)** | Opción de consola, abajo |
| 8 | Permisos de la app (`main.usuarios` y `pins` en `calendario_data`) | Qué módulos ve cada persona en la app y su PIN | **Abierto** (ver abajo) | **Fuera de esta propuesta** |

**Funciones accesibles (V5/V6/U5).**
- **`fn_mis_empresas`:** es SECURITY DEFINER sin `search_path`, y la ejecutan `anon` y `authenticated`. Se le fija `search_path` y se le retira a `anon`, porque sin sesión no le sirve a nadie.
- **`osi_current_*`:** ya tienen `search_path` fijo. No se tocan.
- **`osi_auth_rate_*`:** la llave pública no las ejecuta.
- **`fn_acc_*`:** escriben tablas contables y exigen sesión. No tocan tablas de autorización.

Ninguna función publicada permite escribir las tablas de autorización.

## Qué hace la PARTE 1 (una sola transacción)

- **`rbac_usuarios_roles`:**
  - activa RLS;
  - retira todo a `anon`/`authenticated`;
  - devuelve `SELECT` a `authenticated` con la política `usuario_id = auth.uid()` (cada uno ve solo lo suyo).
- **`rbac_roles`:** activa RLS. Solo `SELECT` para `authenticated` (catálogo).
- **`usuarios_empresa`:** activa RLS y retira todo a la llave pública.
- **`osi_user_empresa`:**
  - retira INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER a la llave pública y SELECT a `anon`;
  - mantiene `SELECT` + la política existente de la propia fila.
- **`user_osiris_accounts` y `osi_auth_rate_limit`:** retira todo a la llave pública.
- **`fn_mis_empresas`:** `search_path = public, pg_temp`; ejecución solo para `authenticated` y `service_role`.

**Se aborta sola** si:
- falta alguna tabla;
- alguna tiene FORCE RLS (las funciones dejarían de leerla);
- `service_role` no puede escribirlas (el administrador perdería la forma de asignar);
- las funciones no son del mismo dueño que las tablas.

## Los usuarios autorizados mantienen su acceso (probado)

La prueba mide los mismos accesos **antes** (A0) y **después** (C0) del cambio, y deben coincidir: `1/201/1/201/2/1 → 1/201/1/201/2/1`.

| Caso | Mecanismo | Resultado después del cambio |
|---|---|---|
| C8 | Asignación `rbac_usuarios_roles` hecha por el administrador | Ve y registra asientos de **su** empresa; no de otra |
| C9 | Ídem | Ve sus propias asignaciones (solo las suyas) |
| C10, C11 | `osi_user_empresa` | Ve y crea contratos de su empresa; lee su propia fila |
| C12 | `osi_current_rol` = ADMIN | ADMIN sigue modificando la configuración; USUARIO no (igual que hoy) |
| C13 | Claims del JWT firmados por el servidor | Sigue funcionando |
| C14 | Catálogo `rbac_roles` | Cualquier usuario con sesión lo lista |
| C15 | Administrador (`service_role`, identidad del servidor) | Sigue asignando, y la asignación nueva da acceso de inmediato |

Cerrado (C1–C7):
- **Con sesión:** nadie puede crearse, robarse o borrar asignaciones, ni escribir `osi_user_empresa`, `usuarios_empresa`, `user_osiris_accounts` o el catálogo.
- **Sin sesión:** no lee ni escribe ninguna de las 6 tablas.
- **El plan de cuentas** ya no se puede alterar por esa vía.

La **reversión** (R1) deja todo como hoy.

**Qué no puede comprobar la prueba local:**
- Si alguna pantalla o integración externa escribe estas tablas con la llave pública. En el código de la app **no** hay ninguna [Seguro, búsqueda en `src/`]. La Edge Function `osiris-auth` usa `service_role` [Seguro], pero puede haber scripts u otras integraciones fuera del repositorio.
- GraphQL: no hay `pg_graphql` local. Usa los mismos permisos y RLS, así que debería quedar cubierto **[Probable]**.

## Registro abierto en Supabase Auth (si P5 lo confirma)

**Opción:** en la consola, Authentication → Sign In / Providers:
- **"Allow new users to sign up" = OFF**;
- **"Allow anonymous sign-ins" = OFF**. Los usuarios anónimos reciben el rol `authenticated`, así que hoy tendrían la misma escalada.

| Impacto | Detalle |
|---|---|
| Quién deja de poder | Cualquiera que se registre por su cuenta por `/auth/v1/signup` o inicie sesión anónima |
| Quién no se afecta | Los usuarios ya existentes; los creados por el administrador (Dashboard → Users, invitación o Admin API con `service_role`) **[Probable]** |
| Login principal de la app | No usa Supabase Auth (va por `/api/login` con email + PIN) → no se afecta **[Seguro, por código]** |
| Sesión dual de Osiris (`osiris-auth`, tras el flag `REACT_APP_AUTH_DUAL`) | Emite sesiones con `generate_link` (Admin API) para un correo ya existente. Para un correo **nuevo**, no está verificado que `generate_link` cree el usuario con el registro cerrado **[Suponiendo]**. Mitigación: crear antes el usuario en Dashboard → Users. Además, según su encabezado corre en el proyecto **sandbox**, no en producción |

**Cerrar el registro no reemplaza esta propuesta.** Los usuarios ya registrados, y los anónimos si existieron, conservarían la escalada mientras las tablas sigan abiertas. S1 dice cuántos hay.

## Fuera de esta propuesta (hallazgo, no se corrige aquí)

- **[Seguro]** Los permisos de la **app** (qué módulos ve cada persona, quién es admin) están en la fila `main` de `calendario_data`, y los hashes de PIN en la fila `pins`. Las políticas de `calendario_data` dejan que la llave pública **lea y modifique** ambas filas (D1). El trigger existente solo impide **quitar** usuarios de `main`.
- Con la llave de la app, cualquiera puede:
  - **darse permisos de administrador dentro de la app**;
  - **descargar los hashes de PIN**. Un PIN de 6 dígitos con PBKDF2 de 100.000 iteraciones se puede probar por fuerza bruta fuera de línea **[Probable]**.
- La app usa esos permisos solo para mostrar u ocultar módulos: los datos de `calendario_data` se pueden leer igual con la llave.
- La corrección de fondo es que los datos y permisos de la app dependan de una sesión real (la migración de autenticación "E1.5") y no de la llave pública. Es un cambio mayor que hay que planificar aparte.

## Pendiente antes de autorizar

| Código | Dónde | Para qué |
|---|---|---|
| **S1** | `consultas_lectura.sql` → S1 | Cuántos usuarios de Auth hay, cuántos anónimos o recientes, y si alguno trae claves de permiso en sus metadatos |
| **S2** | → S2 | Con qué proveedores se registraron |
| **S3** | → S3 | De dónde salen los claims `empresa_id`/`osiris_rol`. Si un "hook" los copiara desde `user_metadata`, que el propio usuario puede editar, **eso sería otra escalada** y habría que corregirlo |
| **S4** | → S4 | Cuántas asignaciones activas tiene cada mecanismo (los usuarios que deben conservar acceso) |
| **S5** | → S5 | Barrido de **cualquier otra** tabla publicada con RLS apagado y escritura abierta |
| **S6** | → S6 | Políticas de escritura sin condición (`true`) para la llave pública |
| **S7** | → S7 | Permisos por defecto: si cada tabla nueva nace abierta, el problema se repite |
| **P5** | Consola → Authentication → Sign In / Providers | Registro abierto, confirmación de correo, ingresos anónimos |
| **P6** | Consola → Authentication → Hooks | Si hay un "Custom Access Token Hook" y qué función usa |
| **PARTE 0** | `propuesta.sql` → PARTE 0 | Foto exacta para la reversión, el día que se autorice |

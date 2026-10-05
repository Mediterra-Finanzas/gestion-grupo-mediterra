# Consultas de lectura pendientes en producción — listado único

> Todas son **solo lectura** y se ejecutan en Supabase → SQL Editor. Ninguna muestra claves ni el contenido
> de las nóminas, salvo **V6** y **D6**, que muestran el **código** de funciones (no datos).
> Guardar cada resultado con *Export → Copy as JSON* y enviarlo con su **código** (V1, D2…).
> La autorización y el horario de activación quedan pendientes hasta revisar estos resultados y los respaldos.

## Cómo no confundir las dos "PARTE 0"

Hay dos propuestas **separadas**, y cada una tiene su propia PARTE 0:

| Prefijo | Propuesta | Archivo |
|---|---|---|
| **V** | Versión obligatoria de Nóminas (consistencia) | `supabase/propuesta_nominas_version_obligatoria.sql` |
| **D** | Retirar DELETE a la llave pública (seguridad) | `supabase/propuesta_quitar_delete_anon.sql` |
| **R** | Respaldos existentes | `supabase/consulta_respaldos_existentes.sql` |
| **U** | Permisos de las 6 tablas de usuarios y roles (tema aparte) | `supabase/consulta_permisos_tablas_usuarios.sql` |

Copiar **solo** el bloque indicado: el texto desde el comentario `-- N.N` hasta antes del siguiente `-- N.N` o del título de la parte siguiente. **No ejecutar nada fuera de la PARTE 0** de cada archivo.

## Listado

| Código | Archivo → sección | Qué obtiene | Para qué |
|---|---|---|---|
| **V1** | `propuesta_nominas_version_obligatoria.sql` → PARTE 0 → **0.1** | Triggers de `calendario_data` con su definición y el **código completo** de sus funciones | Confirmar que `trg_cd_scrub_main` y `trg_guard_main_no_user_shrink` no tocan `nominas_*`. **Reemplaza a la "consulta 7"** pendiente |
| **V2** | ídem → **0.2** | Si ya existen los nombres que crea la propuesta (debe dar 0 filas) | Evitar choques de nombres |
| **V3** | ídem → **0.3** | Si `id` es único | La creación usa `ON CONFLICT (id)` |
| **V4** | ídem → **0.4** | Qué filas `nominas*` quedarían protegidas, cuáles no cambian (id, fecha, tamaño; sin contenido) | Confirmar la lista de exclusión |
| **V5** | ídem → **0.5** | Funciones que la llave pública puede ejecutar en `public` y `graphql_public`, con marcas (SECURITY DEFINER, SQL dinámico, fija variables, toca `calendario_data`) | Caminos para eludir el control. Las marcas son un filtro, no una prueba |
| **V6** | ídem → **0.6** | Código completo de las funciones marcadas en V5 | Revisarlas una por una |
| **V7** | ídem → **0.7** | Vistas u objetos que dependen de `calendario_data` y si la llave pública puede escribir en ellos | Otro camino de escritura |
| **V8** | ídem → **0.8** | Variables fijadas por rol (incluida la configuración de PostgREST en `authenticator`) | Ninguna debe mencionar `mediterra.` |
| **V9** | ídem → **0.9** | Si `anon`/`authenticated` pueden usar y **crear** objetos en los esquemas publicados | Riesgo de suplantar funciones del sistema |
| **D1** | `propuesta_quitar_delete_anon.sql` → PARTE 0 → **0.1** | Políticas completas de `calendario_data` | Foto para revertir la propuesta DELETE |
| **D2** | ídem → **0.2** | **Permisos de tabla por rol** (incluidos DELETE y TRUNCATE) | Si la llave pública puede vaciar la tabla (TRUNCATE ignora RLS y triggers de fila) |
| **D3** | ídem → **0.3** | Si `anon`/`authenticated` heredan otro rol o saltan RLS | Permisos efectivos |
| **D4** | ídem → **0.4** | Vistas sobre `calendario_data` (por `information_schema`) | Complementa V7 |
| **D5** | ídem → **0.5** | Funciones de **cualquier** esquema que mencionan `calendario_data` | Complementa V5 (que mira solo los esquemas publicados) |
| **D6** | ídem → **0.6** | Código de una función de D5. Hay que **reemplazar el nombre** y quitar el `--` inicial | Revisarlas |
| **R1** | `consulta_respaldos_existentes.sql` → **1** | Cada fila `backup_*` / `main_pre_restore*`: id, fecha, tamaño (sin contenido) | Qué respaldo recuperable existe |
| **R2** | ídem → **2** | Resumen por tipo: cantidad, más antiguo, más reciente | Ídem |
| **U1** | `consulta_permisos_tablas_usuarios.sql` → **U1** | Si cada tabla existe, RLS activo/forzado, filas aproximadas, dueño | Tema aparte: acceso a datos de usuarios |
| **U2** | ídem → **U2** | Qué pueden hacer `anon`/`authenticated` en cada tabla (leer, crear, modificar, borrar, vaciar) | Ídem |
| **U3** | ídem → **U3** | Políticas RLS de cada tabla | Ídem |
| **U4** | ídem → **U4** | Columnas y tipos (sin valores) | Saber si hay correos, hashes o tokens expuestos |
| **U5** | ídem → **U5** | Funciones que usan esas tablas y si la llave pública las ejecuta | Candidatas a revisar; también alimenta V5 |

## Fuera del SQL Editor (en la consola de Supabase)

| Código | Dónde | Qué anotar |
|---|---|---|
| **P1** | Database → Backups → Scheduled backups | Fecha y hora del último respaldo de plataforma y cuántos días cubren |
| **P2** | Database → Backups → Point in Time | Si está habilitado o no |
| **P3** | Database → Backups | Qué opciones ofrece (restaurar el proyecto completo, restaurar en un proyecto nuevo, descarga) |
| **P4** | Settings → API → Exposed schemas | Qué esquemas publica la API. Si hay otros además de `public` y `graphql_public`, V5, V6 y V9 deben repetirse con ellos |

## Lo que NO hay que ejecutar todavía

- PARTE 1, 2 y 3 de `propuesta_nominas_version_obligatoria.sql`.
- PARTE 1, 2 y 3 de `propuesta_quitar_delete_anon.sql`.
- La reversión de ambas.
- `verificar_activacion_nominas.sql`: es para el día de la activación. Su sección 3 es inofensiva, pero hoy no aporta nada.

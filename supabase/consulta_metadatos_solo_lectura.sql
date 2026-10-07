/* =================================================================
   CONSULTA DE METADATOS — SOLO LECTURA (oct-2026)

   Para correr en el editor SQL de Supabase (proyecto bywovqayuzodbzwsriet).
   - Todo va dentro de una transacción READ ONLY y termina en ROLLBACK:
     Postgres rechaza cualquier escritura.
   - NO lee datos de negocio: ningún SELECT sobre el contenido de las tablas
     (`value`, montos, PIN). Solo catálogo: nombres, tamaños, conteos de
     objetos, RLS, políticas, permisos, funciones (firma, sin código fuente)
     y buckets (configuración y conteo, sin nombres de archivo).
   - NO muestra secretos: no consulta vault, pg_settings, auth.users ni
     llaves. Las definiciones de políticas se muestran porque son reglas,
     no datos; revisarlas antes de compartir si se sospecha que alguna
     incluye un correo o identificador.
   Resultado: copiar cada tabla de resultados a un archivo y entregarlo.
================================================================= */

BEGIN TRANSACTION READ ONLY;

-- 1. Tablas por esquema: tamaño, RLS y número de políticas
SELECT n.nspname AS esquema, c.relname AS tabla,
       c.relrowsecurity AS rls_activo, c.relforcerowsecurity AS rls_forzado,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS n_politicas,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS tamano,
       c.reltuples::bigint AS filas_estimadas
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
ORDER BY n.nspname, c.relname;

-- 2. Políticas RLS (reglas, no datos)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies ORDER BY schemaname, tablename, policyname;

-- 3. Permisos de los roles públicos sobre tablas de public y storage
SELECT table_schema, table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE grantee IN ('anon','authenticated') AND table_schema IN ('public','storage')
GROUP BY table_schema, table_name, grantee ORDER BY 1,2,3;

-- 4. Funciones de esquemas propios: firma y seguridad (sin el código fuente)
SELECT n.nspname AS esquema, p.proname AS funcion,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_puede_ejecutar
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public')
ORDER BY 1,2;

-- 5. Triggers sobre tablas propias
SELECT event_object_schema AS esquema, event_object_table AS tabla, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers WHERE event_object_schema = 'public' ORDER BY 2,3;

-- 6. Vistas y vistas materializadas de public
SELECT schemaname, viewname AS vista FROM pg_views WHERE schemaname = 'public'
UNION ALL SELECT schemaname, matviewname FROM pg_matviews WHERE schemaname = 'public' ORDER BY 2;

-- 7. Buckets: configuración y volumen (sin nombres de archivo)
SELECT b.id, b.public, b.file_size_limit, b.allowed_mime_types,
       count(o.id) AS objetos, pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint),0)) AS tamano
FROM storage.buckets b LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.id, b.public, b.file_size_limit, b.allowed_mime_types ORDER BY b.id;

-- 8. calendario_data: ids y tamaño por fila (SOLO id y tamaño, sin contenido)
SELECT id, pg_size_pretty(pg_column_size(value)::bigint) AS tamano_value, updated_at
FROM public.calendario_data ORDER BY pg_column_size(value) DESC;

-- 9. Extensiones instaladas
SELECT extname, extversion FROM pg_extension ORDER BY 1;

ROLLBACK;

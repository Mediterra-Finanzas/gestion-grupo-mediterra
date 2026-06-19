/* =================================================================
   FASE 4 — CERRAR TODA LA BASE AL ACCESO PÚBLICO (anon)
   App Gestión Grupo Mediterra
   Fecha: 2026-06-18

   ⚠️ NO EJECUTAR TODAVÍA. Este script es para REVISIÓN.
   ⚠️ Aplicarlo SIN el guardia encendido DEJA LA APP SIN ACCESO a los
      datos (igual que el incidente anterior). Solo se ejecuta como parte
      del rollout del guardia (Etapa "cierre"), cuando la app ya hable con
      la base a través de /api/db con sesión.

   QUÉ HACE
   --------
   Quita al rol público 'anon' (la llave que va en el navegador) el acceso
   a TODAS las tablas del esquema public, y activa RLS sin políticas para
   anon/authenticated. A partir de ahí, la ÚNICA vía de acceso es el guardia
   (que usa service_role, el cual BYPASEA RLS). El diagnóstico mostró que hoy
   TODAS las tablas (calendario_data + todo el contable) son legibles con la
   llave pública.

   REQUISITOS antes de ejecutar:
     1. Guardia desplegado y ENCENDIDO en producción (REACT_APP_USE_GUARD).
     2. La app probada funcionando a través del guardia (lectura y escritura).
     3. Storage (buckets) se maneja aparte — esto NO toca storage.
================================================================= */


/* ---------- PASO 0 — DIAGNÓSTICO (solo lectura) ----------
   Lista todas las tablas, si tienen RLS y cuántas políticas. Correr esto
   primero y revisar antes de cerrar. */
SELECT n.nspname AS esquema, c.relname AS tabla,
       c.relrowsecurity AS rls_activo,
       count(p.polname) AS n_politicas
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
GROUP BY n.nspname, c.relname, c.relrowsecurity
ORDER BY c.relname;


/* ---------- PASO 1 — CERRAR (ejecutar SOLO con el guardia encendido) ----------
   Recorre todas las tablas de 'public', activa RLS y revoca el acceso de
   'anon'. service_role (el guardia) sigue entrando porque bypasea RLS.    */
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', r.relname);
    -- (No se toca 'authenticated' ni 'service_role'.)
  END LOOP;
END $$;


/* ---------- PASO FINAL — VERIFICAR ----------
   Volver a correr el PASO 0: todas deben quedar rls_activo = true.
   Y probar en la app (con el guardia) que sigue leyendo/escribiendo.   */


/* =================================================================
   ROLLBACK — REABRIR TODO (emergencia, si la app deja de funcionar)
   Devuelve el acceso público a todas las tablas (estado actual inseguro,
   pero funcional sin guardia). Pegar y Run:

   DO $$
   DECLARE r RECORD;
   BEGIN
     FOR r IN SELECT c.relname FROM pg_class c
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relkind='r'
     LOOP
       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY;', r.relname);
       EXECUTE format('GRANT ALL ON public.%I TO anon;', r.relname);
     END LOOP;
   END $$;
================================================================= */

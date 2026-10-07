/* =================================================================
   PROPUESTA DE AUTORIZACIÓN / RLS — calendario_data (oct-2026)

   ⚠️ NO EJECUTAR EN PRODUCCIÓN. Es una propuesta para revisión de Angelo.
   ⚠️ Probada SOLO en un Postgres local aislado con roles simulados
      (node scripts/seguridad/prueba-rls-local.mjs).

   PUNTO DE PARTIDA (verificado en el código, no en producción):
   - La app usa la llave pública (anon) desde el navegador para leer y escribir
     calendario_data. El login por PIN se verifica EN EL NAVEGADOR leyendo la
     fila `pins` (hashes PBKDF2 de PIN de 6 dígitos): con la base abierta,
     cualquiera puede descargarlos e intentar fuerza bruta fuera de línea.
   - Los permisos por módulo/pestaña son de pantalla. El guardia /api/db se
     retiró el 2026-06-30 (responde 410).
   - La app NUNCA borra filas de calendario_data (verificado: no hay DELETE a
     esa tabla en src/ ni api/ con la llave pública; la retención de backup_*
     corre en api/_respaldo-diario.js con service_role).

   PRINCIPIO: cada etapa se puede activar sola, no bloquea a usuarios
   legítimos y tiene su reversa al final. Lo que exige cambiar la forma de
   entrar (etapas 2 y 3) NO se escribe acá como SQL ejecutable.
================================================================= */


/* ---------- ETAPA 1 — "sin bloqueo": nadie pierde acceso ----------
   1a. La llave pública ya no puede BORRAR ni VACIAR la tabla (la app no lo usa).
   1b. Historial de versiones: antes de cada UPDATE/DELETE se guarda la versión
       anterior en una tabla que la llave pública NO puede leer, modificar ni
       borrar. Sirve para auditar y para recuperar una fila sobrescrita.
       Para no llenar la base con el auto-guardado (cada 1-2 s), se guarda a lo
       más UNA versión cada 15 minutos por fila. Medir antes el tamaño de las
       filas con la consulta de metadatos (supabase/consulta_metadatos_solo_lectura.sql).
   No cambia lecturas ni escrituras normales de la app. */

BEGIN;

REVOKE DELETE, TRUNCATE ON public.calendario_data FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.calendario_data_historial (
  hist_id      bigserial PRIMARY KEY,
  id           text        NOT NULL,
  value        jsonb,
  updated_at   timestamptz,
  operacion    text        NOT NULL,
  guardado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS calendario_data_historial_id_fecha
  ON public.calendario_data_historial (id, guardado_en DESC);
ALTER TABLE public.calendario_data_historial ENABLE ROW LEVEL SECURITY;   -- sin políticas: anon/authenticated no ven nada
REVOKE ALL ON public.calendario_data_historial FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.calendario_data_historial_hist_id_seq FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.calendario_data_guardar_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER                 -- escribe en el historial aunque anon no tenga permiso
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NOT EXISTS (
       SELECT 1 FROM public.calendario_data_historial h
       WHERE h.id = OLD.id AND h.guardado_en > now() - interval '15 minutes')
  THEN
    INSERT INTO public.calendario_data_historial (id, value, updated_at, operacion)
    VALUES (OLD.id, OLD.value, OLD.updated_at, TG_OP);
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION public.calendario_data_guardar_version() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS calendario_data_version ON public.calendario_data;
CREATE TRIGGER calendario_data_version
  BEFORE UPDATE OR DELETE ON public.calendario_data
  FOR EACH ROW EXECUTE FUNCTION public.calendario_data_guardar_version();

COMMIT;

/* Reversa de la etapa 1 (deja todo como hoy; el historial se conserva):
   BEGIN;
   DROP TRIGGER IF EXISTS calendario_data_version ON public.calendario_data;
   GRANT DELETE, TRUNCATE ON public.calendario_data TO anon, authenticated;
   COMMIT;
*/


/* ---------- ETAPA 2 — login fuera del navegador (requiere desarrollo) ----------
   Objetivo: que la fila `pins` deje de ser legible con la llave pública.
   Requisito: verificar el PIN en el servidor (función de Vercel o Edge Function
   con service_role) y devolver una sesión; la app deja de leer `pins`.
   Recién con eso:
     ALTER TABLE public.calendario_data ENABLE ROW LEVEL SECURITY;
     CREATE POLICY lectura_publica_sin_credenciales ON public.calendario_data
       FOR SELECT TO anon USING (id <> 'pins' AND id NOT LIKE 'backup\_%');
     CREATE POLICY escritura_publica_sin_credenciales ON public.calendario_data
       FOR INSERT TO anon WITH CHECK (id <> 'pins' AND id NOT LIKE 'backup\_%');
     CREATE POLICY actualizacion_publica_sin_credenciales ON public.calendario_data
       FOR UPDATE TO anon USING (id <> 'pins' AND id NOT LIKE 'backup\_%')
                         WITH CHECK (id <> 'pins' AND id NOT LIKE 'backup\_%');
   Riesgo si se activa ANTES del login en servidor: nadie puede entrar (la app
   no puede leer los PIN). Por eso no va como SQL ejecutable.
   Las filas backup_* con credenciales antiguas siguen sin tocar (decisión pendiente).


   ---------- ETAPA 3 — permisos reales por persona (migración mayor) ----------
   Supabase Auth (una cuenta por persona) + políticas por fila según la matriz
   (supabase/MATRIZ_ACCESO_MODULOS.md, hoy BORRADOR con decisiones abiertas):
     · `nominas`: solo quienes la matriz confirme (propuesta: admin + esCFO + autorizadores).
     · `rendiciones`: hoy es UNA fila con las de todos → RLS no puede separar
       "cada uno ve lo suyo". Exige pasar a una tabla por rendición.
     · `finanzas` (flujo, bancos, créditos, parámetros): fila compartida → se
       protege junta; la separación por pestaña sigue siendo de pantalla.
     · Permisos fuera de calendario_data: hoy la fila `usuarios` (roles y
       pestañas) la puede reescribir cualquiera con la llave pública; las
       políticas no pueden confiar en ella. Va a una tabla propia, escribible
       solo por admin.
   Storage: buckets privados + URLs firmadas (api/storage.js ya existe).
*/

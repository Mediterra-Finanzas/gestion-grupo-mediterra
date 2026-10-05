-- ─────────────────────────────────────────────────────────────────────────
-- COPIA del código de los dos triggers que YA EXISTEN en producción sobre
-- public.calendario_data, tal como los devolvió la consulta V1 (2026-10-05).
-- NO es una propuesta ni se ejecuta en producción: solo se usa para que las
-- pruebas LOCALES corran con los mismos triggers que producción
-- (scripts/nominas-cas/pglocal.mjs y scripts/nominas-cas/prueba.mjs).
-- Si en producción cambian, hay que actualizar esta copia y repetir las pruebas.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cd_scrub_main_credentials()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb; cleaned jsonb;
BEGIN
  IF NEW.id IS DISTINCT FROM 'main' THEN RETURN NEW; END IF;
  v := NEW.value;
  IF v ? 'pinsPersonalizados' THEN v := v - 'pinsPersonalizados'; END IF;
  IF jsonb_typeof(v->'usuarios') = 'array' THEN
    SELECT jsonb_agg(e - 'pin') INTO cleaned
      FROM jsonb_array_elements(v->'usuarios') e;
    v := jsonb_set(v, '{usuarios}', COALESCE(cleaned, '[]'::jsonb), true);
  END IF;
  NEW.value := v;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.guard_main_no_user_shrink()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  old_emails text[];
  missing    text[];
begin
  if NEW.id <> 'main' then
    return NEW;                       -- solo protege la fila main
  end if;

  if TG_OP = 'UPDATE'
     and OLD.value ? 'usuarios'
     and jsonb_typeof(OLD.value->'usuarios') = 'array' then

    -- emails presentes en OLD (normalizados, no vacíos)
    select array_agg(distinct lower(btrim(u->>'email')))
      into old_emails
      from jsonb_array_elements(OLD.value->'usuarios') u
      where coalesce(btrim(u->>'email'), '') <> '';

    if old_emails is not null then
      -- emails de OLD que NO aparecen en NEW
      select array_agg(oe)
        into missing
        from unnest(old_emails) oe
        where not exists (
          select 1
            from jsonb_array_elements(coalesce(NEW.value->'usuarios', '[]'::jsonb)) nu
            where lower(btrim(coalesce(nu->>'email', ''))) = oe
        );

      if missing is not null and array_length(missing, 1) > 0 then
        raise exception
          'ROSTER_ANTISHRINK: la escritura de main eliminaría usuarios existentes: %',
          array_to_string(missing, ', ')
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return NEW;
end;
$function$;

CREATE TRIGGER trg_cd_scrub_main BEFORE INSERT OR UPDATE ON public.calendario_data FOR EACH ROW EXECUTE FUNCTION cd_scrub_main_credentials();
CREATE TRIGGER trg_guard_main_no_user_shrink BEFORE UPDATE ON public.calendario_data FOR EACH ROW EXECUTE FUNCTION guard_main_no_user_shrink();

-- ─────────────────────────────────────────────────────────────────────────
-- REVERSIÓN de supabase/propuesta_nominas_version_obligatoria.sql — NO APLICADA.
-- No hay datos que deshacer: la propuesta no cambia filas ni el esquema de la
-- tabla. Dos niveles, ejecutar POR SEPARADO:
--
-- NIVEL 1 — Quitar la exigencia (inmediato). Vuelve el comportamiento de hoy
--   para el código antiguo (upsert sin condición). El cliente nuevo sigue
--   funcionando, porque la función nominas_guardar se conserva.
--
-- NIVEL 2 — Quitar la función. SOLO después de volver a desplegar un cliente que
--   NO la use (si no, el cliente nuevo no puede guardar: muestra el aviso de
--   "no se guardó" y conserva la edición; no pierde datos, pero no avanza).
-- ─────────────────────────────────────────────────────────────────────────

-- NIVEL 1
begin;
drop trigger if exists trg_nominas_exigir_version on public.calendario_data;
drop function if exists public.nominas_exigir_version();
commit;

-- NIVEL 2
begin;
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.calendario_data'::regclass
             and tgname = 'trg_nominas_exigir_version') then
    -- Sin esto, el trigger llamaría a una función borrada y fallaría TODA
    -- escritura de la llave pública en calendario_data.
    raise exception 'ABORTADO: ejecutar primero el NIVEL 1';
  end if;
end $$;
drop function if exists public.nominas_guardar(text, jsonb, timestamptz);
drop function if exists public.nominas_fila_protegida(text);
commit;
notify pgrst, 'reload schema';

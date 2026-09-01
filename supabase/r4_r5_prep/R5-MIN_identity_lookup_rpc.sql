-- ============================================================================
-- R5-MIN_identity_lookup_rpc.sql — Minimiza la superficie service_role->calendario_data.
--
-- PROBLEMA (hoy, api/proc-token.js L60/L62):
--   L60: getJSON('calendario_data?id=eq.main&select=value')  -> BLOB COMPLETO de `main`
--        (roster `usuarios` con emails/PII de todo el grupo) para hacer .find(email).
--   L62: getJSON('calendario_data?id=eq.pins&select=value')  -> TODOS los hashes PIN del grupo
--        para tomar UN `[nombre+'_h']`.
--   -> service_role arrastra al proceso Node el roster entero + todos los PIN-hash en cada login.
--      Blast radius innecesario (un log/volcado accidental expondria todo el padron + credenciales).
--
-- SOLUCION: funcion server-only que filtra en la DB y devuelve SOLO la fila del email pedido:
--   { nombre, email, desactivado, cred_h }.  El proceso Node recibe 1 usuario, nunca el roster ni el
--   set de PINs. La verificacion PBKDF2 sigue en Node (NO se mueve al motor: eso es cambio mayor).
--
-- DECISIONES DE SEGURIDAD (audit R5-MIN 2026-08-27):
--   * SECURITY INVOKER (no DEFINER): el UNICO ejecutor es service_role, que ya lee calendario_data
--     (grant R3-S5-P2 + BYPASSRLS). DEFINER no aporta y, si el EXECUTE se ampliara por error, correria
--     como owner y filtraria; INVOKER es fail-closed (sin autoridad ambiental).
--   * search_path fijo = public (defensivo).
--   * EXECUTE: PUBLIC/anon/authenticated = NO ; service_role = YES explicito.
--   * Ambiguedad (email matchea >1 usuario activo) => 0 filas (FAIL CLOSED; el borrador usaba LIMIT 1).
--   * Usuario desactivado => filtrado (0 filas => DENY).
--   * cred_h CRUDO (jsonb sin ::cast): un `_h` malformado NO revienta la funcion; el endpoint lo parsea
--     (try/catch) -> 401 limpio, no 500.
--   * Return surface minima: nombre/email/desactivado/cred_h de 1 usuario. El hash queda server-side
--     (nunca al browser), estrictamente menos que el roster+pins completo de hoy.
--
-- TARGET: staging nlvfjpwiecgrosjnwwik. Produccion = HANDS-OFF aqui. NO reabre superficie anon/PUBLIC.
-- ============================================================================
CREATE OR REPLACE FUNCTION proc_fn_identity_lookup(p_email text)
RETURNS TABLE (nombre text, email text, desactivado boolean, cred_h jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  WITH raw AS (
    SELECT value->'usuarios' AS usuarios FROM calendario_data WHERE id='main'
  ), main AS (
    -- Guard estructural: si `usuarios` no es array, tratar como vacío (evita que jsonb_array_elements
    -- lance exception sobre un objeto/string malformado). CERO casts que puedan fallar.
    SELECT CASE WHEN jsonb_typeof(usuarios)='array' THEN usuarios ELSE '[]'::jsonb END AS usuarios FROM raw
  ), pins AS (
    SELECT value AS pins FROM calendario_data WHERE id='pins'
  ), matches AS (
    SELECT e->>'email'                                       AS email,   -- email TAL CUAL el roster (no lower)
           e->>'nombre'                                      AS nombre,
           COALESCE((e->'desactivado') = 'true'::jsonb, false) AS desactivado  -- solo JSON bool true = inactivo; nunca lanza
    FROM main, jsonb_array_elements(main.usuarios) e
    WHERE lower(btrim(e->>'email')) = lower(btrim(p_email))              -- match case-insensitive
      AND COALESCE((e->'desactivado') = 'true'::jsonb, false) = false    -- inactivo => excluido
  )
  SELECT m.nombre, m.email, m.desactivado,
         (SELECT pins FROM pins) -> (m.nombre||'_h') AS cred_h           -- jsonb crudo (op ->, sin ::cast); nunca lanza
  FROM matches m
  WHERE (SELECT count(*) FROM matches) = 1                               -- >1 match => 0 filas (FAIL CLOSED)
$$;

-- Endurecimiento: solo el server (service_role) la ejecuta. anon/authenticated/PUBLIC NUNCA.
REVOKE ALL ON FUNCTION proc_fn_identity_lookup(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION proc_fn_identity_lookup(text) TO service_role;

-- Verificacion:
--   SELECT * FROM proc_fn_identity_lookup('ahuerta@grupomediterra.cl');            -- 0/1 fila, solo ese usuario
--   SELECT has_function_privilege('anon','proc_fn_identity_lookup(text)','EXECUTE');           -- false
--   SELECT has_function_privilege('authenticated','proc_fn_identity_lookup(text)','EXECUTE');  -- false
--   SELECT has_function_privilege('service_role','proc_fn_identity_lookup(text)','EXECUTE');   -- true

-- ── ROLLBACK ──
--   DROP FUNCTION IF EXISTS proc_fn_identity_lookup(text);   -- sin CASCADE; no toca datos ni R4.
--
-- ── CAMBIO ACOMPANANTE en api/proc-token.js (reemplaza el bloque L60-L67) ────────────
--   // Antes: 2 lecturas de blob completo (main.usuarios + pins). Despues: 1 RPC filtrado.
--   const row = (await rpc("proc_fn_identity_lookup", { p_email: email }))?.[0];
--   const u = row && !row.desactivado ? { nombre: row.nombre, email: row.email } : null;
--   let credH = row ? row.cred_h : null;
--   if (typeof credH === "string") { try { credH = JSON.parse(credH); } catch { credH = null; } }
--   if (!u || !credH || !verifyPin(pin, credH)) return res.status(401).json({ error: "credenciales" });
-- ============================================================================

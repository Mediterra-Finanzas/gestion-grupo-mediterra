-- ============================================================================
-- 30_ms_g3_identidad_temporada.sql
-- GAP-3 (B, hardening) — identidad de temporada unificada (FK lógica) sin romper histórico.
--
-- PROBLEMA: proc_recepcion usa temporada_id (FK real). El resto usa temporada_codigo
--   TEXTO sin FK → un typo forkea una temporada fantasma. proc_orden_proceso y
--   proc_programa_proceso ni siquiera tienen columna de temporada (solo va en el folio).
--
-- ESTRATEGIA (preserva histórico, NUNCA borra):
--   A) Materializa en el catálogo (proc_temporada) toda temporada referida por datos
--      operativos que HOY no exista, como estado 'cerrada' (histórica, sin nuevas
--      escrituras). Así la FK valida y el código original se PRESERVA en la fila.
--   B) Reetiqueta solo los sentinelas sin información ('s-t' y vacío) a una temporada
--      sentinela por empresa 'HIST-SIN-TEMP' (estado 'cerrada'); el valor original ('s-t')
--      no cargaba información, y el cambio queda en proc_audit_log (reversible).
--   C) NULL se conserva como NULL (una FK MATCH SIMPLE lo admite): "temporada desconocida"
--      honesta; su emisión futura ya la bloquea MS-G1. Se reporta el conteo.
--   D) Agrega FK compuesta (empresa_id, temporada_codigo) → proc_temporada(empresa_id,codigo)
--      como NOT VALID y luego VALIDATE, en las tablas OPERATIVAS de texto.
--   E) proc_orden_proceso / proc_programa_proceso: agrega columna temporada_codigo,
--      backfill best-effort desde el short-code del folio (solo si resuelve único en el
--      catálogo del empresa; si no, NULL), + FK NOT VALID + VALIDATE (NULL pasa).
--
-- EXCLUIDA a propósito: proc_qc_parametro.temporada_codigo es un SCOPE opcional de
--   parámetro (puede apuntar a futuro/NULL), no una instancia operativa → sin FK.
--
-- ⚠ NO EJECUTAR EN ESTA SESIÓN. Draft para revisión del integrador.
-- ============================================================================

BEGIN;

-- ── PREFLIGHT (fingerprint STAGING, fail-closed) ─────────────────────────────
DO $guard$
DECLARE
  v_als_id CONSTANT uuid := '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  v_baseline_ok boolean; v_calendario_ok boolean; v_als_ok boolean;
BEGIN
  v_baseline_ok := to_regclass('public.proc_temporada') IS NOT NULL
    AND to_regclass('public.proc_correlativo') IS NOT NULL
    AND to_regclass('public.proc_movimiento') IS NOT NULL;
  IF NOT v_baseline_ok THEN RAISE EXCEPTION 'GUARD ABORT: baseline proc_* incompleto.'; END IF;
  v_calendario_ok := (to_regclass('public.calendario_data') IS NOT NULL);
  IF v_calendario_ok THEN EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.calendario_data WHERE id=''main'')' INTO v_calendario_ok; END IF;
  IF NOT v_calendario_ok THEN RAISE EXCEPTION 'GUARD ABORT: falta calendario_data.main.'; END IF;
  IF to_regclass('public.contab_empresas') IS NULL THEN RAISE EXCEPTION 'GUARD ABORT: sin contab_empresas.'; END IF;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM public.contab_empresas WHERE id=%L AND codigo=%L)', v_als_id, 'ALS') INTO v_als_ok;
  IF NOT v_als_ok THEN RAISE EXCEPTION 'GUARD ABORT: tenant ALS % ausente (posible PRODUCCIÓN).', v_als_id; END IF;
  RAISE NOTICE 'GUARD OK (MS-G3): destino STAGING compatible.';
END $guard$;

-- Tablas operativas con temporada_codigo TEXTO (sin proc_qc_parametro).
-- Se usa una tabla temporal como lista canónica para todos los pasos.
CREATE TEMP TABLE _ms_g3_tablas(nombre text) ON COMMIT DROP;
INSERT INTO _ms_g3_tablas(nombre) VALUES
  ('proc_movimiento'),('proc_producto_terminado'),('proc_pallet'),
  ('proc_despacho'),('proc_informe'),('proc_base_cobro');

-- ── A + B) BACKFILL preservando histórico ────────────────────────────────────
DO $backfill$
DECLARE
  r record; t text; v_sql text; v_actor uuid := proc_current_user();
BEGIN
  -- A.0) Normalizar espacios: la FK compara el valor EXACTO de la fila contra el
  --   codigo del catálogo. Trim de temporada_codigo (no sentinela) para que ' 2526'
  --   y '2526' no diverjan y el VALIDATE no falle. Solo afecta whitespace.
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      UPDATE %1$s SET temporada_codigo = btrim(temporada_codigo)
       WHERE temporada_codigo IS NOT NULL
         AND temporada_codigo <> btrim(temporada_codigo)
         AND lower(btrim(temporada_codigo)) <> 's-t';
    $q$, t);
  END LOOP;

  -- A) Materializar temporadas referidas y ausentes (código real, no sentinela).
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    v_sql := format($q$
      INSERT INTO proc_temporada(empresa_id, codigo, nombre, estado, observaciones)
      SELECT DISTINCT s.empresa_id, btrim(s.temporada_codigo),
             '(backfill histórico MS-G3)', 'cerrada',
             'Materializada por 30_ms_g3 desde %1$s; revisar fechas/estado.'
        FROM %1$s s
       WHERE s.temporada_codigo IS NOT NULL
         AND btrim(s.temporada_codigo) <> ''
         AND lower(btrim(s.temporada_codigo)) <> 's-t'
         AND NOT EXISTS (
           SELECT 1 FROM proc_temporada pt
            WHERE pt.empresa_id = s.empresa_id
              AND pt.codigo = btrim(s.temporada_codigo))
      ON CONFLICT (empresa_id, codigo) DO NOTHING;
    $q$, t);
    EXECUTE v_sql;
  END LOOP;

  -- B) Sentinela por empresa para 's-t'/vacío; crear catálogo sentinela primero.
  INSERT INTO proc_temporada(empresa_id, codigo, nombre, estado, observaciones)
  SELECT DISTINCT s.empresa_id, 'HIST-SIN-TEMP', 'Histórico sin temporada', 'cerrada',
         'Sentinela MS-G3 para filas con s-t/vacío; sin nuevas escrituras.'
    FROM (
      SELECT empresa_id, temporada_codigo FROM proc_movimiento
      UNION ALL SELECT empresa_id, temporada_codigo FROM proc_producto_terminado
      UNION ALL SELECT empresa_id, temporada_codigo FROM proc_pallet
      UNION ALL SELECT empresa_id, temporada_codigo FROM proc_despacho
      UNION ALL SELECT empresa_id, temporada_codigo FROM proc_informe
      UNION ALL SELECT empresa_id, temporada_codigo FROM proc_base_cobro
    ) s
   WHERE s.temporada_codigo IS NOT NULL
     AND (btrim(s.temporada_codigo) = '' OR lower(btrim(s.temporada_codigo)) = 's-t')
  ON CONFLICT (empresa_id, codigo) DO NOTHING;

  -- B.2) Reetiquetar filas 's-t'/vacío → 'HIST-SIN-TEMP' (con traza en audit_log).
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    -- traza previa (una fila de auditoría por registro afectado)
    EXECUTE format($q$
      INSERT INTO proc_audit_log(empresa_id, tabla, registro_id, accion, valor_ant, valor_nue, motivo, usuario_id)
      SELECT s.empresa_id, %1$L, s.id, 'update',
             jsonb_build_object('temporada_codigo', s.temporada_codigo),
             jsonb_build_object('temporada_codigo', 'HIST-SIN-TEMP'),
             'MS-G3 backfill s-t/vacío → sentinela', %2$L
        FROM %3$s s
       WHERE s.temporada_codigo IS NOT NULL
         AND (btrim(s.temporada_codigo)='' OR lower(btrim(s.temporada_codigo))='s-t');
    $q$, t, v_actor, t);
    -- el cambio
    EXECUTE format($q$
      UPDATE %1$s SET temporada_codigo='HIST-SIN-TEMP'
       WHERE temporada_codigo IS NOT NULL
         AND (btrim(temporada_codigo)='' OR lower(btrim(temporada_codigo))='s-t');
    $q$, t);
  END LOOP;

  -- C) Reportar NULLs (se conservan como NULL).
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %1$s WHERE temporada_codigo IS NULL', t) INTO r;
    RAISE NOTICE 'MS-G3: % filas con temporada_codigo NULL en % (se conservan NULL).', r.count, t;
  END LOOP;
END $backfill$;

-- ── D) FK compuesta lógica en tablas operativas de texto ─────────────────────
DO $fk$
DECLARE t text;
BEGIN
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %1$s DROP CONSTRAINT IF EXISTS fk_%1$s_temporada;', t);
    EXECUTE format($q$ALTER TABLE %1$s
      ADD CONSTRAINT fk_%1$s_temporada
      FOREIGN KEY (empresa_id, temporada_codigo)
      REFERENCES proc_temporada(empresa_id, codigo) NOT VALID;$q$, t);
    EXECUTE format('ALTER TABLE %1$s VALIDATE CONSTRAINT fk_%1$s_temporada;', t);
  END LOOP;
END $fk$;

-- ── E) proc_orden_proceso / proc_programa_proceso: columna + backfill folio ───
DO $orden$
DECLARE t text; v_sql text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_orden_proceso','proc_programa_proceso'] LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %1$s ADD COLUMN IF NOT EXISTS temporada_codigo text;', t);

    -- Backfill best-effort: short-code del folio (2º segmento) → si resuelve ÚNICO
    -- en el catálogo del empresa, se asigna; si no, queda NULL.
    -- FIX (rehearsal MS-G3, 2026-08-25): el UPDATE ... SET x=c.codigo FROM LATERAL(...) c
    --   fallaba con "invalid reference to FROM-clause entry for table o": Postgres NO
    --   admite que un LATERAL del FROM referencie la tabla objetivo del UPDATE. Se pasa a
    --   subconsulta escalar correlacionada en el SET (misma lógica; el guard count()=1 del
    --   WHERE garantiza unicidad, LIMIT 1 es defensa extra).
    v_sql := format($q$
      UPDATE %1$s o
         SET temporada_codigo = (
           SELECT pt.codigo
             FROM proc_temporada pt
            WHERE pt.empresa_id = o.empresa_id
              AND pt.deleted_at IS NULL
              AND regexp_replace(
                    CASE WHEN length(regexp_replace(pt.codigo,'[^0-9]','','g'))=8
                         THEN substr(regexp_replace(pt.codigo,'[^0-9]','','g'),3,2)||substr(regexp_replace(pt.codigo,'[^0-9]','','g'),7,2)
                         ELSE regexp_replace(pt.codigo,'[^0-9]','','g') END,
                    '[^0-9]','','g')
                  = split_part(o.folio,'-',2)
            LIMIT 1
         )
       WHERE o.temporada_codigo IS NULL
         AND split_part(o.folio,'-',2) <> ''
         AND (SELECT count(*) FROM proc_temporada pt2
               WHERE pt2.empresa_id=o.empresa_id AND pt2.deleted_at IS NULL
                 AND regexp_replace(
                       CASE WHEN length(regexp_replace(pt2.codigo,'[^0-9]','','g'))=8
                            THEN substr(regexp_replace(pt2.codigo,'[^0-9]','','g'),3,2)||substr(regexp_replace(pt2.codigo,'[^0-9]','','g'),7,2)
                            ELSE regexp_replace(pt2.codigo,'[^0-9]','','g') END,
                       '[^0-9]','','g') = split_part(o.folio,'-',2)) = 1;
    $q$, t);
    EXECUTE v_sql;

    EXECUTE format('ALTER TABLE %1$s DROP CONSTRAINT IF EXISTS fk_%1$s_temporada;', t);
    EXECUTE format($q$ALTER TABLE %1$s
      ADD CONSTRAINT fk_%1$s_temporada
      FOREIGN KEY (empresa_id, temporada_codigo)
      REFERENCES proc_temporada(empresa_id, codigo) NOT VALID;$q$, t);
    EXECUTE format('ALTER TABLE %1$s VALIDATE CONSTRAINT fk_%1$s_temporada;', t);
  END LOOP;
END $orden$;

-- ── POST-CHECK ───────────────────────────────────────────────────────────────
DO $post$
DECLARE t text; v_bad int; v_total int := 0;
BEGIN
  -- Ninguna fila operativa con código no-null que NO exista en catálogo.
  FOR t IN SELECT nombre FROM _ms_g3_tablas LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format($q$
      SELECT count(*) FROM %1$s s
       WHERE s.temporada_codigo IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM proc_temporada pt
                          WHERE pt.empresa_id=s.empresa_id AND pt.codigo=s.temporada_codigo)
    $q$, t) INTO v_bad;
    IF v_bad > 0 THEN RAISE EXCEPTION 'POST-CHECK FAIL: % filas huérfanas en % tras backfill.', v_bad, t; END IF;
    -- constraint presente y validado
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_'||t||'_temporada' AND convalidated) THEN
      RAISE EXCEPTION 'POST-CHECK FAIL: FK de % ausente o no validada.', t;
    END IF;
    v_total := v_total + 1;
  END LOOP;
  RAISE NOTICE 'POST-CHECK OK (MS-G3): % tablas operativas con FK lógica validada + columnas orden/programa agregadas.', v_total;
END $post$;

COMMIT;

-- ============================================================================
-- ROLLBACK EXACTO:
-- BEGIN;
--   -- quitar FKs
--   DO $$ DECLARE t text; BEGIN
--     FOREACH t IN ARRAY ARRAY['proc_movimiento','proc_producto_terminado','proc_pallet',
--       'proc_despacho','proc_informe','proc_base_cobro','proc_orden_proceso','proc_programa_proceso'] LOOP
--       EXECUTE format('ALTER TABLE %1$s DROP CONSTRAINT IF EXISTS fk_%1$s_temporada;', t);
--     END LOOP; END $$;
--   -- quitar columnas agregadas (solo orden/programa)
--   ALTER TABLE proc_orden_proceso   DROP COLUMN IF EXISTS temporada_codigo;
--   ALTER TABLE proc_programa_proceso DROP COLUMN IF EXISTS temporada_codigo;
--   -- (Opcional) revertir el reetiquetado 's-t' usando proc_audit_log motivo
--   --   'MS-G3 backfill s-t/vacío → sentinela' (valor_ant.temporada_codigo por registro_id).
--   -- Las temporadas materializadas (estado 'cerrada', observaciones '(backfill histórico MS-G3)')
--   --   pueden marcarse deleted_at o eliminarse si NINGUNA fila las referencia ya.
-- COMMIT;
-- NOTA: el backfill es el único paso NO puramente aditivo (reetiqueta 's-t'→sentinela y
--   materializa catálogo). Es reversible vía proc_audit_log. Revisar en rehearsal antes de staging.
-- ============================================================================
-- NOTA DE REHEARSAL (Docker local):
--   1) Baseline + seed; insertar filas operativas con mezcla: código válido, código
--      inexistente (typo), 's-t', vacío y NULL, en proc_pallet/proc_despacho/etc.
--   2) Ejecutar. Verificar:
--        · el typo aparece ahora como proc_temporada estado 'cerrada'.
--        · las 's-t'/'' quedaron en 'HIST-SIN-TEMP' con fila en proc_audit_log.
--        · NULLs intactos; POST-CHECK OK; ninguna huérfana.
--   3) Intentar INSERT con temporada_codigo='ZZZZ' (no catálogo) → la FK lo rechaza.
--   4) Revertir con ROLLBACK.
-- ============================================================================

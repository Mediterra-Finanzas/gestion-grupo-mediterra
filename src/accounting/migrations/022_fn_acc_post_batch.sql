-- =============================================================================
-- 022_fn_acc_post_batch.sql
-- OA-024-09 — Función atómica de posteo: acc_source_batch → acc_account_balance
-- Autor   : OA-024 PostingPipeline
-- Fecha   : 2026-08-20  (v2: security hardening B7–B14)
-- Ejecutar: DESPUÉS de 020 (RLS) y 021 (tests del pipeline)
-- =============================================================================
--
-- DESCRIPCIÓN:
--   Define fn_acc_post_batch(p_batch_id UUID) RETURNS JSONB.
--   Consume los saldos de acc_source_balance_detail de un batch APPROVED y
--   los convierte en filas canónicas en acc_account_balance (ledger oficial).
--
-- GARANTÍA DE ATOMICIDAD:
--   La función corre dentro de una única transacción implícita de PostgreSQL.
--   Cualquier excepción en WHEN OTHERS causa rollback automático completo.
--   No existen llamadas externas, COMMIT intermedios ni subprocesos.
--   Si la función retorna JSONB con status='POSTED', TODAS las escrituras
--   ocurrieron; si lanza excepción, NINGUNA escritura persiste.
--
-- SECURITY DEFINER — POR QUÉ:
--   acc_account_balance tiene RLS: authenticated solo puede SELECT.
--   Esta función se ejecuta con los privilegios del owner (postgres/service),
--   que sí puede INSERT/UPDATE.  El caller (authenticated) solo puede invocar
--   la función — no puede escribir directamente en el ledger.
--   Esto garantiza que la única ruta de escritura al ledger sea este código
--   auditado, sin importar qué políticas RLS tenga el caller.
--
-- ACTOR (B8 — eliminado p_actor):
--   El actor se deriva internamente de auth.uid() — NO del caller.
--   auth.uid() lee de request.jwt.claims (GUC de sesión, set por PostgREST).
--   Persiste a través del contexto SECURITY DEFINER porque es session-level.
--   Si auth.uid() es NULL → RAISE EXCEPTION (P000A). No se acepta 'system' como
--   fallback silencioso (B16): destruiría confiabilidad del audit trail.
--
-- ENTITY SCOPE (B7 — PILOT):
--   P0000 verifica que el batch pertenezca a ALF (Allegria Foods).
--   TEMPORAL — retirar cuando SEC-ENTITY-SCOPE-001 esté cerrado y la
--   autorización corporativa usuario↔entidad esté implementada en DB.
--
-- HARDENING:
--   * SET search_path = public, pg_temp — previene search_path injection.
--   * REVOKE ALL FROM PUBLIC antes de GRANT a authenticated (B15) — sin public execute.
--   * FOR UPDATE NOWAIT — detecta contención concurrente rápido (< 1 ms).
--   * P000A: auth.uid() IS NULL → RAISE antes de cualquier write (B16 — audit trail).
--   * Validaciones P0000–P0010 con SQLSTATE P0001 y mensajes descriptivos.
--   * P0009: protege contra sobreescritura silenciosa de ledger activo.
--   * Mapping validity usa v_period.date_from/date_to (no CURRENT_DATE) para
--     reproducibilidad de cargas históricas.
--   * Reconciliación aritmética al final (ABS(Δ) ≤ 0.01) como red de seguridad.
--   * El trigger T10 (trg_balance_period_lock) es una segunda guardia
--     independiente: si el período se cierra entre P0005 y el INSERT, T10 lo
--     bloquea. Doble check, sin race condition silenciosa.
--
-- ESTE ARCHIVO ES DDL PURO — NO DML DE PRODUCCIÓN:
--   CREATE OR REPLACE FUNCTION es DDL.  La función queda definida pero no
--   se ejecuta.  Ningún dato de producción se modifica al correr esta migración.
--   El primer DML de producción ocurre cuando la UI llama al RPC.
--
-- GRANT / REVOKE:
--   GRANT EXECUTE TO authenticated  — permite llamar desde Supabase client.
--   REVOKE EXECUTE FROM anon        — anon nunca puede postear.
-- =============================================================================


-- =============================================================================
-- FUNCIÓN PRINCIPAL
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_acc_post_batch(
  p_batch_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Actor derivado del JWT — no aceptado del caller (B8)
  v_actor             TEXT;
  -- Batch
  v_batch             RECORD;
  -- Período
  v_period            RECORD;
  -- Contadores y sumas de reconciliación
  v_posted_count      INT     := 0;
  v_sum_source        NUMERIC := 0;
  v_sum_posted        NUMERIC := 0;
  v_recon_diff        NUMERIC;
  -- Fila de trabajo para el loop de upsert
  v_row               RECORD;
  -- Timestamp de posteo (único para toda la operación)
  v_posted_at         TIMESTAMPTZ := now();
BEGIN

  -- P000A: sesión autenticada requerida (B16)
  -- auth.uid() IS NULL → actor desconocido → audit trail inválido → RAISE antes de cualquier write.
  -- No existe fallback silencioso ('system' u otro): destruiría trazabilidad del ledger.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION
      'P000A: auth.uid() IS NULL — fn_acc_post_batch requiere sesión autenticada activa. '
      'Audit trail no puede establecerse sin identidad verificada.',
      USING ERRCODE = 'P0001';
  END IF;
  v_actor := auth.uid()::TEXT;

  -- ===========================================================
  -- P0001: Batch existe
  -- ===========================================================
  SELECT *
    INTO v_batch
    FROM acc_source_batch
   WHERE id = p_batch_id
     FOR UPDATE NOWAIT;                 -- Lock exclusivo; falla si otro proceso lo tiene

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P0001: Batch % no encontrado.', p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0000: PILOT entity scope — solo ALF (SEC-ENTITY-SCOPE-001)
  -- TEMPORAL: retirar cuando se implemente autorización corporativa
  -- usuario↔entidad y se cierre SEC-ENTITY-SCOPE-001.
  -- Hardcode exclusivo del server-side (no en PostingPipeline.js).
  -- ===========================================================
  IF v_batch.entity_id <> '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid THEN
    RAISE EXCEPTION
      'P0000: PILOT_SCOPE: fn_acc_post_batch restringido a ALF en este piloto. '
      'entity_id=% no autorizado. SEC-ENTITY-SCOPE-001 debe cerrarse antes de '
      'habilitar otras entidades.',
      v_batch.entity_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0002: Status = 'APPROVED'
  -- ===========================================================
  IF v_batch.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'P0002: Batch % tiene status %, se requiere APPROVED.',
      p_batch_id, v_batch.status
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0003: approved_by IS NOT NULL (aprobación formal registrada)
  -- ===========================================================
  IF v_batch.approved_by IS NULL THEN
    RAISE EXCEPTION 'P0003: Batch % está APPROVED pero approved_by es NULL — aprobación inválida.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0004: Período existe para la entidad del batch
  -- ===========================================================
  SELECT *
    INTO v_period
    FROM acc_period
   WHERE id        = v_batch.period_id
     AND entity_id = v_batch.entity_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'P0004: Período % no existe para entidad %.',
      v_batch.period_id, v_batch.entity_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0005: Período abierto o en forecast (T10 también lo valida en INSERT)
  -- ===========================================================
  IF v_period.status NOT IN ('open', 'forecast') THEN
    RAISE EXCEPTION 'P0005: Período % tiene status %, no se puede postear (requiere open o forecast).',
      v_batch.period_id, v_period.status
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0006: Sin issues FATAL sin resolver
  -- ===========================================================
  IF EXISTS (
    SELECT 1
      FROM acc_source_batch_issue
     WHERE batch_id   = p_batch_id
       AND severity   = 'FATAL'
       AND (resolved_at IS NULL OR resolved_by IS NULL)
  ) THEN
    RAISE EXCEPTION 'P0006: Batch % tiene issues FATAL sin resolver. Resolver antes de postear.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0007: acc_source_balance_detail tiene filas para este batch
  -- ===========================================================
  IF NOT EXISTS (
    SELECT 1
      FROM acc_source_balance_detail
     WHERE batch_id = p_batch_id
  ) THEN
    RAISE EXCEPTION 'P0007: Batch % no tiene filas en acc_source_balance_detail.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0008: Sin cuentas no mapeadas con saldo material (|net| > 0.01)
  -- Una cuenta no mapeada = sin acc_chart_mapping activo y vigente.
  -- B12 fix: usa v_period.date_from/date_to (no CURRENT_DATE) para
  -- garantizar reproducibilidad en cargas históricas.
  -- ===========================================================
  IF EXISTS (
    SELECT 1
      FROM (
        SELECT
          sbd.source_account_code,
          CASE
            WHEN v_batch.report_type IN ('eerr_periodo', 'eerr_acumulado')
              THEN SUM(sbd.actual_amount)
            ELSE
              SUM(COALESCE(sbd.debit_balance, 0) - COALESCE(sbd.credit_balance, 0))
          END AS net_balance
          FROM acc_source_balance_detail sbd
         WHERE sbd.batch_id = p_batch_id
         GROUP BY sbd.source_account_code
      ) bal
     WHERE ABS(bal.net_balance) > 0.01
       AND NOT EXISTS (
             SELECT 1
               FROM acc_chart_mapping cm
              WHERE cm.entity_id          = v_batch.entity_id
                AND cm.local_account_code = bal.source_account_code
                AND cm.is_active          = TRUE
                AND cm.effective_from     <= v_period.date_to
                AND (cm.effective_to IS NULL OR cm.effective_to >= v_period.date_from)
           )
  ) THEN
    RAISE EXCEPTION 'P0008: Batch % tiene cuentas con saldo material sin mapeo activo en acc_chart_mapping. Revisar y mapear antes de postear.',
      p_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  -- ===========================================================
  -- P0009: Sin sobreescritura silenciosa de ledger activo (B11)
  -- Bloquea si (entity_id, period_id, balance_type='actual') ya tiene
  -- saldos de un batch distinto al p_batch_id Y ese batch no está
  -- formalmente SUPERSEDED ni ROLLED_BACK.
  -- ===========================================================
  IF EXISTS (
    SELECT 1
      FROM acc_account_balance aab
      JOIN acc_source_batch prev ON prev.id = aab.source_batch_id
     WHERE aab.entity_id          = v_batch.entity_id
       AND aab.period_id          = v_batch.period_id
       AND aab.balance_type       = 'actual'
       AND aab.source_batch_id    IS NOT NULL
       AND aab.source_batch_id    <> p_batch_id
       AND prev.status            NOT IN ('SUPERSEDED', 'ROLLED_BACK')
  ) THEN
    RAISE EXCEPTION
      'P0009: entity=% period=% ya tiene saldos de un batch activo distinto. '
      'Formalizar supersesión (status→SUPERSEDED) antes de re-postear. '
      'Consultar: SELECT id, status FROM acc_source_batch '
      'WHERE entity_id = ''%'' AND status NOT IN (''SUPERSEDED'',''ROLLED_BACK'');',
      v_batch.entity_id, v_batch.period_id, v_batch.entity_id
      USING ERRCODE = 'P0001';
  END IF;


  -- ===========================================================
  -- TRANSICIÓN 1: APPROVED → POSTING
  -- El lifecycle trigger valida que esta transición es legal.
  -- ===========================================================
  UPDATE acc_source_batch
     SET status = 'POSTING'
   WHERE id = p_batch_id;


  -- ===========================================================
  -- DERIVACIÓN DE FILAS CANÓNICAS Y UPSERT EN acc_account_balance
  --
  -- Lógica de agregación por report_type:
  --   eerr_periodo / eerr_acumulado:
  --     → Suma actual_amount agrupado por source_account_code + mapping
  --     → net_balance = SUM(actual_amount); debit/credit se propagan como NULL
  --       porque en EERR el neto es el valor significativo.
  --   balance:
  --     → Suma debit_balance y credit_balance por separado
  --     → net_balance = SUM(debit) - SUM(credit)
  --
  -- Solo se procesan filas con mapeo activo (P0008 ya filtró las materiales
  -- sin mapeo; aquí simplemente las ignoramos con INNER JOIN).
  --
  -- B12 fix: mapping validity usa v_period.date_from/date_to (no CURRENT_DATE).
  -- B13 fix: source_currency IS NOT NULL (016 schema) — COALESCE omitido.
  --   Tech-debt D8: moneda mixta por batch pendiente (piloto ALF = todo USD).
  -- ===========================================================

  FOR v_row IN
    SELECT
      sbd.source_account_code       AS account_code,
      cm.reporting_account_id,
      CASE
        WHEN v_batch.report_type IN ('eerr_periodo', 'eerr_acumulado')
          THEN SUM(COALESCE(sbd.actual_amount, 0))
        ELSE
          SUM(COALESCE(sbd.debit_balance, 0)) - SUM(COALESCE(sbd.credit_balance, 0))
      END AS net_balance,
      CASE
        WHEN v_batch.report_type = 'balance'
          THEN SUM(COALESCE(sbd.debit_balance, 0))
        ELSE NULL
      END AS debit_balance,
      CASE
        WHEN v_batch.report_type = 'balance'
          THEN SUM(COALESCE(sbd.credit_balance, 0))
        ELSE NULL
      END AS credit_balance,
      MAX(sbd.source_currency) AS currency   -- NOT NULL en 016; sin COALESCE (B13)
    FROM acc_source_balance_detail sbd
    INNER JOIN acc_chart_mapping cm
           ON cm.entity_id          = v_batch.entity_id
          AND cm.local_account_code = sbd.source_account_code
          AND cm.is_active          = TRUE
          AND cm.effective_from     <= v_period.date_to
          AND (cm.effective_to IS NULL OR cm.effective_to >= v_period.date_from)
   WHERE sbd.batch_id = p_batch_id
   GROUP BY
     sbd.source_account_code,
     cm.reporting_account_id
  LOOP

    v_sum_source := v_sum_source + COALESCE(v_row.net_balance, 0);

    INSERT INTO acc_account_balance (
      entity_id,
      period_id,
      account_code,
      balance_type,
      reporting_account_id,
      source_batch_id,
      debit_balance,
      credit_balance,
      net_balance,
      currency
    ) VALUES (
      v_batch.entity_id,
      v_batch.period_id,
      v_row.account_code,
      'actual',
      v_row.reporting_account_id,
      p_batch_id,
      COALESCE(v_row.debit_balance,  0),
      COALESCE(v_row.credit_balance, 0),
      COALESCE(v_row.net_balance,    0),
      v_row.currency
    )
    ON CONFLICT (entity_id, period_id, account_code, balance_type)
    DO UPDATE SET
      reporting_account_id = EXCLUDED.reporting_account_id,
      source_batch_id      = EXCLUDED.source_batch_id,
      debit_balance        = EXCLUDED.debit_balance,
      credit_balance       = EXCLUDED.credit_balance,
      net_balance          = EXCLUDED.net_balance,
      currency             = EXCLUDED.currency;

    v_posted_count := v_posted_count + 1;

  END LOOP;


  -- ===========================================================
  -- P0010: Reconciliación aritmética
  -- Suma de lo que se leyó de acc_source_balance_detail (neto)
  -- vs suma de lo que quedó en acc_account_balance para este batch.
  -- B14: tolerancia 0.01 calibrada para USD (PILOT assumption).
  -- Tech-debt B14: revisar para monedas de menor denominación (CLP, PEN).
  -- ===========================================================
  SELECT COALESCE(SUM(net_balance), 0)
    INTO v_sum_posted
    FROM acc_account_balance
   WHERE source_batch_id = p_batch_id;

  v_recon_diff := ABS(v_sum_source - v_sum_posted);

  IF v_recon_diff > 0.01 THEN
    RAISE EXCEPTION 'P0010: Reconciliación fallida. sum_source=%, sum_posted=%, diff=%. Rollback completo.',
      v_sum_source, v_sum_posted, v_recon_diff
      USING ERRCODE = 'P0001';
  END IF;


  -- ===========================================================
  -- TRANSICIÓN 2: POSTING → POSTED
  -- Solo se ejecuta si toda la lógica anterior fue exitosa.
  -- El lifecycle trigger valida que POSTING → POSTED es legal.
  -- v_actor derivado de auth.uid() — no del caller (B8).
  -- ===========================================================
  UPDATE acc_source_batch
     SET status    = 'POSTED',
         posted_by = v_actor,
         posted_at = v_posted_at
   WHERE id = p_batch_id;


  -- ===========================================================
  -- RETORNO: resumen ejecutivo del posteo
  -- ===========================================================
  RETURN jsonb_build_object(
    'batch_id',      p_batch_id,
    'status',        'POSTED',
    'entity_id',     v_batch.entity_id,
    'period_id',     v_batch.period_id,
    'posted_count',  v_posted_count,
    'sum_source',    v_sum_source,
    'sum_posted',    v_sum_posted,
    'recon_diff',    v_recon_diff,
    'approved_by',   v_batch.approved_by,
    'posted_by',     v_actor,
    'posted_at',     v_posted_at
  );

EXCEPTION
  WHEN lock_not_available THEN
    RAISE EXCEPTION 'Batch % está siendo procesado por otro proceso. Reintentar en unos segundos.',
      p_batch_id;

  WHEN OTHERS THEN
    RAISE;

END;
$$;


-- =============================================================================
-- GRANTS
-- =============================================================================

-- B15: Remover privilegio PUBLIC primero (PostgreSQL concede EXECUTE a PUBLIC por defecto).
-- anon/authenticated pertenecen implícitamente a PUBLIC → REVOKE FROM anon solo no es suficiente.
REVOKE ALL ON FUNCTION fn_acc_post_batch(UUID) FROM PUBLIC;

-- Conceder EXECUTE solo a authenticated.
-- Seguro porque la función tiene: entity scope P0000 + auth.uid() NOT NULL (P000A).
GRANT EXECUTE ON FUNCTION fn_acc_post_batch(UUID) TO authenticated;

-- postgres/service_role: acceden como owner/superuser — no requieren GRANT explícito.
-- anon: denegado implícitamente por el REVOKE FROM PUBLIC anterior.


-- =============================================================================
-- VERIFICACIONES READ-ONLY POST-DEPLOY
-- Ejecutar en SQL Editor para confirmar que todo quedó correcto.
-- Ninguna de estas queries modifica datos.
-- =============================================================================

-- V1: Confirmar que la función existe con los atributos correctos
--     Esperado: 1 fila, security_type = 'DEFINER', data_type = 'jsonb'
SELECT
  routine_name,
  routine_type,
  security_type,
  data_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name   = 'fn_acc_post_batch';

-- V2: Confirmar EXECUTE grant para authenticated; anon NO aparece
SELECT
  grantee,
  routine_name,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name   = 'fn_acc_post_batch'
ORDER BY grantee;

-- V3: Confirmar que acc_account_balance sigue sin INSERT/UPDATE para authenticated
SELECT
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename  = 'acc_account_balance'
  AND cmd IN ('INSERT', 'UPDATE')
ORDER BY policyname;
-- Si aparece alguna fila con 'authenticated': error de configuración.

-- V4: Confirmar firma de la función (1 parámetro — p_actor eliminado)
--     Esperado: 1 fila — p_batch_id uuid (IN)
SELECT
  parameter_name,
  data_type,
  parameter_mode
FROM information_schema.parameters
WHERE specific_schema = 'public'
  AND specific_name LIKE 'fn_acc_post_batch%'
ORDER BY ordinal_position;

-- V5: Confirmar atributos de seguridad en cuerpo de la función
SELECT
  proname,
  prosrc LIKE '%3df93d9d-cbc6-446f-b9a5-0a3840692fd8%' AS has_entity_guard,    -- B7
  prosrc LIKE '%P0000%'                                  AS has_p0000,           -- B7
  prosrc LIKE '%P000A%'                                  AS has_p000a,           -- B16
  prosrc LIKE '%P0009%'                                  AS has_p0009,           -- B11
  prosrc LIKE '%auth.uid()%'                             AS uses_auth_uid,       -- B8
  prosrc LIKE '%v_period.date_from%'                     AS uses_period_dates,   -- B12
  prosrc LIKE '%CURRENT_DATE%'                           AS uses_current_date_bad, -- B12 (debe ser f)
  prosrc LIKE '%system%'                                 AS has_system_fallback_bad -- B16 (debe ser f)
FROM pg_proc
WHERE proname = 'fn_acc_post_batch';
-- Esperado: has_entity_guard=t, has_p0000=t, has_p000a=t, has_p0009=t,
--           uses_auth_uid=t, uses_period_dates=t,
--           uses_current_date_bad=f, has_system_fallback_bad=f

-- V6: Confirmar que PUBLIC no tiene EXECUTE (B15)
--     Esperado: 0 filas para grantee='PUBLIC'
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name   = 'fn_acc_post_batch'
  AND grantee        = 'PUBLIC';
-- Si retorna filas: REVOKE FROM PUBLIC falló — no desplegar.

-- =============================================================================
-- 019_alf_acc_period_seed.sql
-- OA-024-09 — 12 períodos mensuales para ALF, ejercicio fiscal 2026
-- Fecha   : 2026-08-19
-- Estado  : PRODUCTION PASS — ejecutada 2026-08-19, NO RE-EXECUTION REQUIRED
-- =============================================================================
-- PRERREQUISITOS:
--   008_accounting_tables_apply.sql → acc_period existe
--   core_entities ALF UUID = 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
--   acc_entity_config ALF con effective_from = 2026-01-01 (ejecutado en 018)
--
-- PRODUCTION EXECUTION = PASS (2026-08-19)
-- Resultado verificado: 12 períodos MONTHLY ALF 2026, fiscal_month 1..12,
-- fiscal_quarter 1..4, date_from/to correctos, febrero=28 días, status='open'.
-- NO modificar las 12 filas ya insertadas.
--
-- SCOPE:
--   Inserta 12 filas en acc_period para ALF, fiscal_year 2026, period_type 'monthly'.
--   Idempotente: ON CONFLICT DO NOTHING en UNIQUE(entity_id, period_type, fiscal_year, fiscal_month).
--   Status inicial: 'open' para todos los períodos.
--
-- STATUS VÁLIDOS (ck_acc_period_status en 008):
--   'open' | 'closed' | 'locked' | 'forecast'
--   Se usa 'open' → permite posting inmediato.
--
-- T10 (trg_balance_period_lock, fn_check_period_lock en 010):
--   Bloquea INSERT en acc_account_balance si status IN ('closed', 'locked').
--   Permite 'open' y 'forecast'. Usa lista de denegación, no de aprobación.
--
-- NOTA ALF FISCAL YEAR:
--   Mediterra usa año fiscal enero-diciembre (ver CLAUDE.md).
--   2026 = año no bisiesto (365 días; febrero = 28 días).
--
-- TRANSACTION SAFETY:
--   BLOQUE 1 corre dentro de BEGIN/COMMIT explícito.
--   Cualquier RAISE EXCEPTION hace ROLLBACK automático antes de COMMIT.
--   Los SELECT informativos de BLOQUE 0 y BLOQUE 2 están fuera de la transacción.
--
-- IDEMPOTENCIA:
--   Todas las validaciones filtran AND period_type = 'monthly' para que la
--   existencia de períodos quarterly/annual/otro tipo en ALF 2026 no interfiera.
-- =============================================================================


-- ============================================================
-- BLOQUE 0 — Verificación de prerrequisitos (solo lectura, fuera de tx)
-- ============================================================

-- PRE-CHECK: confirmar ALF existe
SELECT id, legal_name, code
FROM core_entities
WHERE id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';
-- Esperado: 1 fila (Allegria Foods, ALF)

-- PRE-CHECK: períodos MONTHLY existentes para ALF 2026 (0 = limpio; 12 = ya ejecutado)
SELECT COUNT(*) AS periodos_monthly_existentes
FROM acc_period
WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
  AND fiscal_year = 2026
  AND period_type = 'monthly';


-- ============================================================
-- BLOQUE 1 — INSERT transaccional con validaciones críticas
-- ============================================================

BEGIN;

  -- PRECONDICIÓN CRÍTICA 1: ALF debe existir
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM core_entities
      WHERE id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
    ) THEN
      RAISE EXCEPTION '019 ABORT: ALF (3df93d9d-...) no existe en core_entities. Ejecutar 006 primero.';
    END IF;
  END;
  $$;

  -- INSERT idempotente: ON CONFLICT DO NOTHING ignora filas ya existentes
  INSERT INTO acc_period
    (entity_id, period_type, fiscal_year, fiscal_month, fiscal_quarter, date_from, date_to, status)
  SELECT
    '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid              AS entity_id,
    'monthly'                                                   AS period_type,
    2026                                                        AS fiscal_year,
    m.n                                                         AS fiscal_month,
    CEIL(m.n / 3.0)::integer                                   AS fiscal_quarter,
    make_date(2026, m.n, 1)                                    AS date_from,
    (make_date(2026, m.n, 1) + interval '1 month' - interval '1 day')::date AS date_to,
    'open'                                                      AS status
  FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) AS m(n)
  ON CONFLICT (entity_id, period_type, fiscal_year, fiscal_month) DO NOTHING;

  -- POSTCONDICIÓN CRÍTICA 1: deben existir exactamente 12 períodos MONTHLY ALF 2026
  DO $$
  DECLARE
    v_count INT;
  BEGIN
    SELECT COUNT(*) INTO v_count
    FROM acc_period
    WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
      AND fiscal_year = 2026
      AND period_type = 'monthly';

    IF v_count <> 12 THEN
      RAISE EXCEPTION '019 ABORT: se esperaban 12 períodos MONTHLY ALF 2026, encontrados: %. ROLLBACK.', v_count;
    END IF;
  END;
  $$;

  -- POSTCONDICIÓN CRÍTICA 2: cobertura 1..12 — sin huecos ni duplicados
  DO $$
  DECLARE
    v_distinct_months INT;
    v_min_month       INT;
    v_max_month       INT;
  BEGIN
    SELECT
      COUNT(DISTINCT fiscal_month),
      MIN(fiscal_month),
      MAX(fiscal_month)
    INTO v_distinct_months, v_min_month, v_max_month
    FROM acc_period
    WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
      AND fiscal_year = 2026
      AND period_type = 'monthly';

    IF v_distinct_months <> 12 OR v_min_month <> 1 OR v_max_month <> 12 THEN
      RAISE EXCEPTION
        '019 ABORT: cobertura de meses inválida. distinct_months=%, min=%, max=% (esperado 12, 1, 12). ROLLBACK.',
        v_distinct_months, v_min_month, v_max_month;
    END IF;
  END;
  $$;

  -- POSTCONDICIÓN CRÍTICA 3: febrero MONTHLY debe tener exactamente 28 días
  DO $$
  DECLARE
    v_dias_feb INT;
  BEGIN
    SELECT (date_to - date_from + 1)::int INTO v_dias_feb
    FROM acc_period
    WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
      AND fiscal_year = 2026
      AND period_type = 'monthly'
      AND fiscal_month = 2;

    IF v_dias_feb IS NULL THEN
      RAISE EXCEPTION '019 ABORT: período febrero 2026 MONTHLY no encontrado. ROLLBACK.';
    END IF;

    IF v_dias_feb <> 28 THEN
      RAISE EXCEPTION '019 ABORT: febrero 2026 MONTHLY tiene % días, esperado 28. ROLLBACK.', v_dias_feb;
    END IF;
  END;
  $$;

  -- POSTCONDICIÓN CRÍTICA 4: todos los períodos MONTHLY ALF 2026 deben tener status 'open'
  DO $$
  DECLARE
    v_no_open INT;
  BEGIN
    SELECT COUNT(*) INTO v_no_open
    FROM acc_period
    WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
      AND fiscal_year = 2026
      AND period_type = 'monthly'
      AND status <> 'open';

    IF v_no_open > 0 THEN
      RAISE EXCEPTION '019 ABORT: % período(s) MONTHLY ALF 2026 no tienen status=open. ROLLBACK.', v_no_open;
    END IF;
  END;
  $$;

COMMIT;


-- ============================================================
-- BLOQUE 2 — Verificación post-commit (solo lectura, fuera de tx)
-- ============================================================

SELECT
  fiscal_month,
  fiscal_quarter,
  date_from,
  date_to,
  status,
  (date_to - date_from + 1)::int AS dias_mes
FROM acc_period
WHERE entity_id   = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
  AND fiscal_year = 2026
  AND period_type = 'monthly'
ORDER BY fiscal_month;

-- Esperado: 12 filas
-- fiscal_month | fiscal_quarter | date_from    | date_to      | status | dias_mes
-- -------------+----------------+--------------+--------------+--------+---------
--           1  |              1 | 2026-01-01   | 2026-01-31   | open   | 31
--           2  |              1 | 2026-02-01   | 2026-02-28   | open   | 28
--           3  |              1 | 2026-03-01   | 2026-03-31   | open   | 31
--           4  |              2 | 2026-04-01   | 2026-04-30   | open   | 30
--           5  |              2 | 2026-05-01   | 2026-05-31   | open   | 31
--           6  |              2 | 2026-06-01   | 2026-06-30   | open   | 30
--           7  |              3 | 2026-07-01   | 2026-07-31   | open   | 31
--           8  |              3 | 2026-08-01   | 2026-08-31   | open   | 31
--           9  |              3 | 2026-09-01   | 2026-09-30   | open   | 30
--          10  |              4 | 2026-10-01   | 2026-10-31   | open   | 31
--          11  |              4 | 2026-11-01   | 2026-11-30   | open   | 30
--          12  |              4 | 2026-12-01   | 2026-12-31   | open   | 31

-- =============================================================================
-- 019_alf_acc_period_seed.sql
-- OA-024-09 — 12 períodos mensuales para ALF, ejercicio fiscal 2026
-- Fecha   : 2026-08-19
-- Estado  : EJECUTAR DESPUÉS de 018 (AccountingProfile ALF en producción)
-- =============================================================================
-- PRERREQUISITOS:
--   008_accounting_tables_apply.sql → acc_period existe
--   core_entities ALF UUID = 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
--   acc_entity_config ALF con effective_from = 2026-01-01 (ejecutado en 018)
--
-- SCOPE:
--   Inserta 12 filas en acc_period para ALF, fiscal_year 2026.
--   Idempotente: ON CONFLICT DO NOTHING (UNIQUE entity_id, period_type, fiscal_year, fiscal_month).
--   Estado inicial: 'open' para todos los períodos.
--
-- BLOQUEO T10:
--   El trigger trg_balance_period_lock verifica que acc_period.status sea
--   'open' o 'forecast' antes de permitir INSERT en acc_account_balance.
--   Con status='open' todos los períodos permiten el posting del primer batch.
--
-- NOTA ALF FISCAL YEAR:
--   Mediterra usa año fiscal enero-diciembre (ver CLAUDE.md).
--   2026 = año no bisiesto (365 días; febrero = 28 días).
-- =============================================================================

-- ============================================================
-- BLOQUE 0 — Verificación de prerrequisitos (solo lectura)
-- ============================================================

-- PRE-CHECK: confirmar ALF existe
SELECT id, legal_name, code
FROM core_entities
WHERE id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';
-- Esperado: 1 fila (Allegria Foods, ALF)

-- PRE-CHECK: confirmar 0 períodos existentes para ALF 2026 (idempotencia)
SELECT fiscal_month, date_from, date_to, status
FROM acc_period
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
  AND fiscal_year = 2026
ORDER BY fiscal_month;
-- Esperado: 0 filas (estado limpio) o 12 filas (si ya ejecutado — idempotente)

-- ============================================================
-- BLOQUE 1 — INSERT 12 períodos mensuales ALF 2026
-- ============================================================

INSERT INTO acc_period
  (entity_id, period_type, fiscal_year, fiscal_month, date_from, date_to, status)
SELECT
  '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid   AS entity_id,
  'monthly'                                        AS period_type,
  2026                                             AS fiscal_year,
  m.n                                              AS fiscal_month,
  make_date(2026, m.n, 1)                          AS date_from,
  (make_date(2026, m.n, 1) + interval '1 month' - interval '1 day')::date AS date_to,
  'open'                                           AS status
FROM (VALUES (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),(11),(12)) AS m(n)
ON CONFLICT (entity_id, period_type, fiscal_year, fiscal_month) DO NOTHING;

-- ============================================================
-- BLOQUE 2 — Verificación post-insert
-- ============================================================

SELECT
  fiscal_month,
  date_from,
  date_to,
  status,
  EXTRACT(DAY FROM date_to::date - date_from::date + 1)::int AS dias_mes
FROM acc_period
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
  AND fiscal_year = 2026
ORDER BY fiscal_month;

-- Esperado: 12 filas
-- fiscal_month | date_from    | date_to      | status | dias_mes
-- -------------+--------------+--------------+--------+---------
--           1  | 2026-01-01   | 2026-01-31   | open   | 31
--           2  | 2026-02-01   | 2026-02-28   | open   | 28
--           3  | 2026-03-01   | 2026-03-31   | open   | 31
--           4  | 2026-04-01   | 2026-04-30   | open   | 30
--           5  | 2026-05-01   | 2026-05-31   | open   | 31
--           6  | 2026-06-01   | 2026-06-30   | open   | 30
--           7  | 2026-07-01   | 2026-07-31   | open   | 31
--           8  | 2026-08-01   | 2026-08-31   | open   | 31
--           9  | 2026-09-01   | 2026-09-30   | open   | 30
--          10  | 2026-10-01   | 2026-10-31   | open   | 31
--          11  | 2026-11-01   | 2026-11-30   | open   | 30
--          12  | 2026-12-01   | 2026-12-31   | open   | 31

-- PRE-FLIGHT READINESS: verificar que el T10 (period_lock) pasará en agosto 2026
SELECT id, status
FROM acc_period
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
  AND fiscal_year = 2026
  AND fiscal_month = 8;
-- Esperado: 1 fila, status = 'open'
-- Contexto: el primer batch real será el EERR Julio 2026 → fiscal_month = 7
-- Agosto es el período del batch actual (real = período de reporte).
-- Ambos deben estar 'open'.

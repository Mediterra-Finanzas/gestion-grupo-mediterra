-- =============================================================================
-- 016_contec_adapter_infra.sql
-- OA-024-08 — ContecAdapter Infrastructure
-- Fecha   : 2026-08-18
-- Estado  : EJECUTAR DESPUÉS de 014 (OA-024-07 STABLE)
-- =============================================================================
-- SCOPE:
--   1. Nueva tabla: acc_source_balance_detail (detalle CC preservado por batch)
--   2. Columnas storage en acc_source_batch: bucket, path, mime, file_size
--   3. Indexes de drill-down en acc_source_balance_detail
--   4. RLS fail-closed en acc_source_balance_detail
-- =============================================================================
-- DECISIÓN ARQUITECTURAL (OA-024-08 PREFLIGHT, CC-GRANULARITY-GATE):
--   acc_account_balance = saldo canónico agregado por cuenta/período.
--   acc_source_balance_detail = detalle granular preservado del source
--   (una fila por account_code × cost_center × batch).
--   Lineage: batch_id + source_account_code es relación inequívoca entre ambas.
--   Invariante: SUM(actual_amount WHERE batch_id=X AND source_account_code=Y)
--               = acc_account_balance.net_balance WHERE source_batch_id=X AND account_code=Y
--               (dentro de tolerancia matemática 0.01 en moneda fuente)
-- =============================================================================
-- NO MODIFICA: acc_account_balance, su UNIQUE constraint, OA-023 Currency,
--              consolidation, IAS 28, EEFFModule, datos ANF legacy.
-- =============================================================================


-- =============================================================================
-- PARTE 1: acc_source_balance_detail — detalle granular preservado del source
-- =============================================================================

CREATE TABLE IF NOT EXISTS acc_source_balance_detail (
  id                  BIGINT        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- ── Lineage ────────────────────────────────────────────────────────────────
  batch_id            UUID          NOT NULL
                        REFERENCES acc_source_batch(id) ON DELETE RESTRICT,
  source_row_ref      TEXT          NOT NULL,
    -- Referencia a la fila fuente: "row:14", "sheet:EERR:row:14"
    -- Permite localizar la fila exacta en el Excel original

  -- ── Clasificación del reporte ──────────────────────────────────────────────
  source_report_type  TEXT          NOT NULL,
    -- 'balance'         → ESF acumulado (10 columnas Contec)
    -- 'eerr_periodo'    → ER período mensual (9 columnas Contec)
    -- 'eerr_acumulado'  → ER acumulado YTD (misma estructura, período YTD)

  -- ── Cuenta fuente ─────────────────────────────────────────────────────────
  source_account_code TEXT          NOT NULL,
    -- Balance: col A (código de cuenta, ej. "1.01.01.001")
    -- EERR: col D (código, ej. "6.11.01.010")
  source_account_name TEXT,
    -- Balance: col B (nombre de cuenta)
    -- EERR: col E (nombre de cuenta)

  -- ── Dimensiones analíticas (EERR only; NULL para Balance) ─────────────────
  cost_center_code    TEXT,
    -- EERR col F: "ADMINISTRACION Y FINANZAS", "OPERACIONES", "COMEX", etc.
    -- Preservado exacto del source. NO auto-resolver a dim_value en V1.
    -- Issue DIM_VALUE_UNKNOWN si no existe mapping en OA-024-09+.
  nature              TEXT,   -- EERR col A: INGRESOS / GASTOS / EGRESOS NO OP.
  class               TEXT,   -- EERR col B: INGRESOS POR VENTA / GASTOS PERSONAL…
  subclass            TEXT,   -- EERR col C: VENTAS EXPORTACION / GASTOS GESTION…

  -- ── Montos EERR (NULL para Balance) ───────────────────────────────────────
  actual_amount       NUMERIC(18,2),
    -- EERR col G: Real del período (período aislado o acumulado YTD según tipo)
  budget_amount       NUMERIC(18,2),
    -- EERR col H: Presupuesto. Puede ser 0 si no hay presupuesto cargado.
    -- NO se postea a acc_account_balance (balance_type='budget' = scope pln_*)
  variance_amount     NUMERIC(18,2),
    -- EERR col I: Varianza (G − H). Derivable pero se preserva para trazabilidad.

  -- ── Montos Balance (NULL para EERR) ───────────────────────────────────────
  ytd_debit           NUMERIC(18,2),
    -- Balance col C: Movimientos Debe YTD (brutos acumulados del ejercicio)
    -- No leídos por parser V1 pero reservados para V2
  ytd_credit          NUMERIC(18,2),
    -- Balance col D: Movimientos Haber YTD (brutos acumulados)
  debit_balance       NUMERIC(18,2),
    -- Balance col G: Inventario Activo (saldo deudor neto)
    -- ← Este es el valor que postea a acc_account_balance.debit_balance
  credit_balance      NUMERIC(18,2),
    -- Balance col H: Inventario Pasivo (saldo acreedor neto)
    -- ← Este es el valor que postea a acc_account_balance.credit_balance

  -- ── Moneda y auditoría ────────────────────────────────────────────────────
  source_currency     CHAR(3)       NOT NULL DEFAULT 'USD',
    -- Moneda del source (D8 — pendiente resolución global; ALF = USD en V1)
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    -- Inmutable una vez insertado. Sin updated_at intencional.

  CONSTRAINT ck_asbd_report_type CHECK (source_report_type IN (
    'balance', 'eerr_periodo', 'eerr_acumulado'
  ))
);

COMMENT ON TABLE acc_source_balance_detail IS
  'Detalle granular de cada fila del archivo fuente Contec, incluyendo centro de costo. '
  'Una fila por (account_code × cost_center × batch). '
  'Lineage inequívoco con acc_account_balance via batch_id + source_account_code. '
  'Append-only: las filas no se modifican después del posting.';


-- =============================================================================
-- PARTE 2: Columnas STORAGE en acc_source_batch
-- =============================================================================

ALTER TABLE acc_source_batch
  ADD COLUMN IF NOT EXISTS storage_bucket  TEXT
    CONSTRAINT ck_asb_storage_bucket CHECK (storage_bucket IS NULL OR storage_bucket IN ('accounting-source')),
    -- CHECK limita a 'accounting-source'. NULL permitido durante PARSING/VALIDATING
    -- (el archivo puede no haberse subido aún). Una vez POSTED debe ser no-null.

  ADD COLUMN IF NOT EXISTS storage_path    TEXT,
    -- Path completo en el bucket:
    -- '{entity_uuid}/{fiscal_year}/{period_code}/{batch_id}/{filename}'
    -- Inmutable una vez POSTED (File Immutability — OA-024-08 §7)

  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
    -- 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' (xlsx)
    -- 'application/vnd.ms-excel' (xls legacy)

  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT
    CONSTRAINT ck_asb_file_size_positive CHECK (file_size_bytes IS NULL OR file_size_bytes > 0);
    -- Tamaño del archivo en bytes. NULL hasta que se complete el upload.

-- Nota: acc_source_batch.file_name (TEXT NOT NULL) ya existe desde 008
--       y sirve como original_file_name. No se duplica.
-- Nota: acc_source_batch.file_hash (TEXT NOT NULL UNIQUE) ya sirve como SHA-256.
--       No se agrega campo checksum redundante.


-- =============================================================================
-- PARTE 3: Índices de drill-down y performance
-- =============================================================================

-- Consultas de drill-down por batch (más frecuente)
CREATE INDEX IF NOT EXISTS idx_asbd_batch_id
  ON acc_source_balance_detail(batch_id);

-- Drill-down: saldo de una cuenta específica en un batch
CREATE INDEX IF NOT EXISTS idx_asbd_batch_account
  ON acc_source_balance_detail(batch_id, source_account_code);

-- Drill-down: todos los centros de costo de un batch
CREATE INDEX IF NOT EXISTS idx_asbd_batch_cc
  ON acc_source_balance_detail(batch_id, cost_center_code)
  WHERE cost_center_code IS NOT NULL;

-- Drill-down: actividad por tipo de reporte
CREATE INDEX IF NOT EXISTS idx_asbd_batch_report_type
  ON acc_source_balance_detail(batch_id, source_report_type);

-- Índice en nuevas columnas storage de acc_source_batch
CREATE INDEX IF NOT EXISTS idx_asb_storage_path
  ON acc_source_batch(storage_path)
  WHERE storage_path IS NOT NULL;


-- =============================================================================
-- PARTE 4: RLS — FAIL-CLOSED en acc_source_balance_detail
-- =============================================================================

ALTER TABLE acc_source_balance_detail ENABLE ROW LEVEL SECURITY;
ALTER TABLE acc_source_balance_detail FORCE ROW LEVEL SECURITY;

-- anon → denegado total (fail-closed)
CREATE POLICY "asbd_deny_anon"
  ON acc_source_balance_detail
  FOR ALL
  TO anon
  USING (false);

-- authenticated → acceso completo (V1 broad, refinar a roles en OA-024-09)
-- TODO OA-024-09: refinar a roles importer/approver/auditor con filtro entity_id
CREATE POLICY "asbd_authenticated_access"
  ON acc_source_balance_detail
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- service_role → acceso total (requerido por TEST-403 pattern)
CREATE POLICY "asbd_service_role_all"
  ON acc_source_balance_detail
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- =============================================================================
-- VERIFICACIÓN POST-DEPLOY (ejecutar manualmente en SQL Editor)
-- =============================================================================

/*
-- V1: Confirmar tabla nueva
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'acc_source_balance_detail';
-- Esperado: 1 fila, rowsecurity = true

-- V2: Confirmar columnas nuevas en acc_source_batch
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'acc_source_batch'
  AND column_name IN ('storage_bucket','storage_path','mime_type','file_size_bytes');
-- Esperado: 4 filas

-- V3: Confirmar CHECK de storage_bucket
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.acc_source_batch'::regclass AND conname = 'ck_asb_storage_bucket';
-- Esperado: 1 fila con definición CHECK

-- V4: Confirmar índices
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'acc_source_balance_detail'
ORDER BY indexname;
-- Esperado: 4 índices (batch_id, batch_account, batch_cc, batch_report_type)

-- V5: Test de inserción sintética y lineage
DO $$
DECLARE v_entity_id UUID; v_batch_id UUID;
BEGIN
  SELECT id INTO v_entity_id FROM core_entities WHERE code = 'ALF';
  INSERT INTO acc_source_batch (entity_id, source_system, file_name, file_hash, status, report_type)
  VALUES (v_entity_id, 'contec', 'test_v5.xlsx', 'sha256_v5_' || now()::text, 'CREATED', 'eerr_periodo')
  RETURNING id INTO v_batch_id;
  INSERT INTO acc_source_balance_detail
    (batch_id, source_row_ref, source_report_type, source_account_code, source_account_name,
     cost_center_code, nature, class, subclass, actual_amount, budget_amount, variance_amount)
  VALUES
    (v_batch_id, 'row:5', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
     'ADMINISTRACION Y FINANZAS', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL',
     'GASTOS DE PERSONAL', 1000.00, 900.00, -100.00),
    (v_batch_id, 'row:6', 'eerr_periodo', '6.11.01.010', 'SUELDOS Y SALARIOS',
     'OPERACIONES', 'GASTOS DE ADM. Y VENTAS', 'GASTOS DE PERSONAL',
     'GASTOS DE PERSONAL', 2000.00, 1800.00, -200.00);
  RAISE NOTICE 'V5 PASS: 2 filas de detalle CC insertadas para batch %', v_batch_id;
  -- Verificar lineage: SUM = 3000
  RAISE NOTICE 'SUM(actual_amount) para 6.11.01.010 = %',
    (SELECT SUM(actual_amount) FROM acc_source_balance_detail
     WHERE batch_id = v_batch_id AND source_account_code = '6.11.01.010');
  -- Cleanup
  DELETE FROM acc_source_balance_detail WHERE batch_id = v_batch_id;
  DELETE FROM acc_source_batch WHERE id = v_batch_id;
END; $$;
*/

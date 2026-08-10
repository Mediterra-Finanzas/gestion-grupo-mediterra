-- ============================================================
-- CURRENCY DOMAIN FASE 1 — EJECUCIÓN TRANSACCIONAL v2
-- OA-012-01/02/04/07 — HARDENED BEFORE EXECUTION
-- Supersede a: 002_currency_transactional.sql (NEVER EXECUTED)
-- ============================================================
-- OA-012-04 MATRIZ DE CONSTRAINTS (PASO1-DES-001 v2.1 vs este SQL):
--
-- Regla aprobada                        | En 002 orig  | En v2         | Estado
-- --------------------------------------|-------------|---------------|-------
-- moneda_origen <> moneda_destino       | FALTABA     | chk_monedas   | PASS
-- valor > 0                             | FALTABA     | chk_valor_pos | PASS
-- estado IN (activo/supersedido/inv.)   | INDIRECTO   | chk_estado    | PASS
-- es_manual → ingresado_por NOT NULL    | FALTABA     | chk_manual    | PASS
-- estado_aprobacion domain              | FALTABA     | chk_aprobacion| PASS
-- avg types → methodology_metadata NN   | FALTABA     | chk_metadata  | PASS
-- unicidad activos (par + fecha)        | FALTABA     | uq_activos    | PASS
-- FK rate_type                          | PRESENTE    | PRESENTE      | PASS
-- FK rate_purpose                       | PRESENTE    | PRESENTE      | PASS
-- FK supersedido_por (self)             | PRESENTE    | PRESENTE      | PASS
-- FK migration_batch_id                 | PRESENTE    | PRESENTE      | PASS
-- chk_ciclo_vida (3 ramas)              | PRESENTE    | PRESENTE      | PASS
-- canonical pair simétrico (UNIQUE idx) | PRESENTE    | PRESENTE      | PASS
-- ============================================================
-- REVISIÓN OA-011-01 (válida para v2):
--   DELETE: NINGUNO
--   DROP: NINGUNO
--   ALTER sobre tablas legacy: NINGUNO (se CONSULTA calendario_data, no se modifica)
--   UPDATE sobre maestro_tc: NINGUNO
--   UPDATE sobre anf_tipos_cambio: NINGUNO
--   Políticas permisivas: NINGUNA
--   Exposición a anon: NINGUNA
--   INSERTs currency_tc: 48 exactamente (24 USD-CLP + 24 EUR-CLP)
--   migration_batch_id: único f1000000-0000-0000-0000-000000000001
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN A: DDL CON CONSTRAINTS COMPLETOS (OA-012-04)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS currency_rate_type (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS currency_rate_purpose (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  owner_domain TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS currency_canonical_pair (
  base CHAR(3) NOT NULL,
  quote CHAR(3) NOT NULL,
  PRIMARY KEY (base, quote)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_pair_symmetric
  ON currency_canonical_pair (LEAST(base, quote), GREATEST(base, quote));

CREATE TABLE IF NOT EXISTS currency_migration_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress',
  source_tables TEXT[],
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  record_count INT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS currency_tc (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moneda_origen CHAR(3) NOT NULL,
  moneda_destino CHAR(3) NOT NULL,
  fecha DATE NOT NULL,
  rate_type TEXT NOT NULL REFERENCES currency_rate_type(code),
  rate_purpose TEXT NOT NULL REFERENCES currency_rate_purpose(code),
  valor NUMERIC(20,10) NOT NULL,
  fuente TEXT NOT NULL,
  connector_version TEXT,
  methodology_version TEXT,
  obtenido_en TIMESTAMPTZ DEFAULT NOW(),
  es_manual BOOLEAN NOT NULL DEFAULT FALSE,
  ingresado_por TEXT,
  ingresado_en TIMESTAMPTZ,
  aprobado_por TEXT,
  aprobado_en TIMESTAMPTZ,
  motivo TEXT,
  fuente_respaldo TEXT,
  estado_aprobacion TEXT NOT NULL DEFAULT 'auto',
  methodology_metadata JSONB,
  estado TEXT NOT NULL DEFAULT 'activo',
  supersedido_por UUID REFERENCES currency_tc(id),
  supersedido_en TIMESTAMPTZ,
  invalidado_en TIMESTAMPTZ,
  migration_batch_id UUID REFERENCES currency_migration_batch(id),
  legacy_source_table TEXT,
  legacy_source_key TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- OA-012-04: Constraints que faltaban en la versión original
  CONSTRAINT chk_monedas
    CHECK (moneda_origen <> moneda_destino),

  CONSTRAINT chk_valor_pos
    CHECK (valor > 0),

  CONSTRAINT chk_estado
    CHECK (estado IN ('activo', 'supersedido', 'invalidado')),

  CONSTRAINT chk_manual
    CHECK (NOT es_manual OR ingresado_por IS NOT NULL),

  CONSTRAINT chk_aprobacion
    CHECK (estado_aprobacion IN ('auto', 'pendiente', 'aprobado', 'rechazado')),

  CONSTRAINT chk_metadata_avg
    CHECK (
      rate_type NOT IN ('arithmetic_avg', 'weighted_avg')
      OR methodology_metadata IS NOT NULL
    ),

  -- Ciclo de vida: 3 ramas exclusivas (existía en v1)
  CONSTRAINT chk_ciclo_vida CHECK (
    (estado = 'activo'
      AND supersedido_por IS NULL
      AND supersedido_en IS NULL
      AND invalidado_en IS NULL)
    OR
    (estado = 'supersedido'
      AND supersedido_por IS NOT NULL
      AND supersedido_en IS NOT NULL
      AND invalidado_en IS NULL)
    OR
    (estado = 'invalidado'
      AND supersedido_por IS NULL
      AND supersedido_en IS NULL
      AND invalidado_en IS NOT NULL
      AND migration_batch_id IS NOT NULL)
  )
);

-- Índices operacionales (existían en v1)
CREATE INDEX IF NOT EXISTS idx_currency_tc_par_fecha
  ON currency_tc (moneda_origen, moneda_destino, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_currency_tc_estado
  ON currency_tc (estado);
CREATE INDEX IF NOT EXISTS idx_currency_tc_migration_batch
  ON currency_tc (migration_batch_id);

-- OA-012-04: Unicidad lógica de registros activos (faltaba en v1)
-- Garantiza que no existan dos registros activos para el mismo par + fecha.
CREATE UNIQUE INDEX IF NOT EXISTS uq_currency_tc_activo
  ON currency_tc (moneda_origen, moneda_destino, fecha)
  WHERE estado = 'activo';

-- BLOQUEADO_POR_SEGURIDAD — RLS sin políticas
ALTER TABLE currency_tc              ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rate_type       ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rate_purpose    ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_canonical_pair  ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_migration_batch ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN B: SEEDS
-- ─────────────────────────────────────────────────────────────

INSERT INTO currency_rate_type (code, name, description) VALUES
  ('spot',           'Spot',                'Tasa de mercado publicada para fecha específica'),
  ('period_end',     'Cierre de período',   'Tasa oficial de cierre al último día del período'),
  ('arithmetic_avg', 'Promedio aritmético', 'Promedio simple de tasas spot; n registros en methodology_metadata'),
  ('weighted_avg',   'Promedio ponderado',  'Promedio ponderado; metodología en methodology_metadata'),
  ('manual',         'Manual',              'Ingresada manualmente; requiere ingresado_por')
ON CONFLICT (code) DO NOTHING;

INSERT INTO currency_rate_purpose (code, name, description, owner_domain) VALUES
  ('market',     'Mercado',      'Referencia de mercado para valoración general',   'currency'),
  ('accounting', 'Contabilidad', 'Reconocimiento contable IFRS/GAAP',               'accounting'),
  ('treasury',   'Tesorería',    'Gestión de liquidez y flujo de caja',             'treasury'),
  ('tax',        'Impuesto',     'Tasa oficial para efectos tributarios',           'tax'),
  ('budget',     'Presupuesto',  'Tasa de planificación presupuestaria',            'planning')
ON CONFLICT (code) DO NOTHING;

INSERT INTO currency_canonical_pair (base, quote) VALUES
  ('USD', 'CLP'), ('EUR', 'CLP'), ('USD', 'PEN'), ('EUR', 'USD'),
  ('USD', 'GBP'), ('USD', 'CNY'), ('USD', 'BRL'), ('USD', 'MXN'),
  ('USD', 'AUD'), ('USD', 'CAD'), ('USD', 'JPY')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN C: MIGRACIÓN (batch + 48 registros)
-- ─────────────────────────────────────────────────────────────

INSERT INTO currency_migration_batch (id, status, source_tables, notes)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'in_progress',
  ARRAY['maestro_tc'],
  'Fase 1 v2 — migración de 48 registros OBSERVADOS en maestro_tc. USD-CLP: 24, EUR-CLP: 24. OA-010-04 / OA-011-04 / OA-012-07.'
);

INSERT INTO currency_tc
  (moneda_origen, moneda_destino, fecha, rate_type, rate_purpose, valor,
   fuente, connector_version, es_manual, estado,
   migration_batch_id, legacy_source_table, legacy_source_key,
   obtenido_en, created_at)
VALUES
  -- USD-CLP (24 registros) — OBSERVADO_DB PASO1-INV-001 v2.0
  ('USD','CLP','2026-04-20','spot','market',876.3200000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-20',NOW(),NOW()),
  ('USD','CLP','2026-04-21','spot','market',881.2200000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-21',NOW(),NOW()),
  ('USD','CLP','2026-04-22','spot','market',887.7900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-22',NOW(),NOW()),
  ('USD','CLP','2026-04-23','spot','market',889.8700000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-23',NOW(),NOW()),
  ('USD','CLP','2026-04-24','spot','market',892.1800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-24',NOW(),NOW()),
  ('USD','CLP','2026-04-27','spot','market',895.0700000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-27',NOW(),NOW()),
  ('USD','CLP','2026-04-28','spot','market',894.1800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-28',NOW(),NOW()),
  ('USD','CLP','2026-04-29','spot','market',896.0300000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-29',NOW(),NOW()),
  ('USD','CLP','2026-04-30','spot','market',901.7600000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-04-30',NOW(),NOW()),
  ('USD','CLP','2026-05-04','spot','market',903.0500000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-04',NOW(),NOW()),
  ('USD','CLP','2026-05-05','spot','market',910.0100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-05',NOW(),NOW()),
  ('USD','CLP','2026-05-06','spot','market',905.3600000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-06',NOW(),NOW()),
  ('USD','CLP','2026-05-07','spot','market',892.8300000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-07',NOW(),NOW()),
  ('USD','CLP','2026-05-08','spot','market',887.7100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-08',NOW(),NOW()),
  ('USD','CLP','2026-05-11','spot','market',890.8900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-11',NOW(),NOW()),
  ('USD','CLP','2026-05-12','spot','market',894.2500000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-12',NOW(),NOW()),
  ('USD','CLP','2026-05-13','spot','market',899.9100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-13',NOW(),NOW()),
  ('USD','CLP','2026-05-14','spot','market',889.1900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-14',NOW(),NOW()),
  ('USD','CLP','2026-05-15','spot','market',891.0000000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-15',NOW(),NOW()),
  ('USD','CLP','2026-05-18','spot','market',906.6800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-18',NOW(),NOW()),
  ('USD','CLP','2026-05-19','spot','market',901.5900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-19',NOW(),NOW()),
  ('USD','CLP','2026-05-28','spot','market',894.7900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-05-28',NOW(),NOW()),
  ('USD','CLP','2026-06-08','spot','market',910.2900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-06-08',NOW(),NOW()),
  ('USD','CLP','2026-07-07','spot','market',926.2500000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::USD-CLP::2026-07-07',NOW(),NOW()),
  -- EUR-CLP (24 registros) — OBSERVADO_DB PASO1-INV-001 v2.0
  ('EUR','CLP','2026-04-20','spot','market',1032.9100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-20',NOW(),NOW()),
  ('EUR','CLP','2026-04-21','spot','market',1038.4400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-21',NOW(),NOW()),
  ('EUR','CLP','2026-04-22','spot','market',1041.8800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-22',NOW(),NOW()),
  ('EUR','CLP','2026-04-23','spot','market',1042.0000000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-23',NOW(),NOW()),
  ('EUR','CLP','2026-04-24','spot','market',1043.2400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-24',NOW(),NOW()),
  ('EUR','CLP','2026-04-27','spot','market',1048.5800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-27',NOW(),NOW()),
  ('EUR','CLP','2026-04-28','spot','market',1048.1500000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-28',NOW(),NOW()),
  ('EUR','CLP','2026-04-29','spot','market',1049.5800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-29',NOW(),NOW()),
  ('EUR','CLP','2026-04-30','spot','market',1052.6000000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-04-30',NOW(),NOW()),
  ('EUR','CLP','2026-05-04','spot','market',1059.5400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-04',NOW(),NOW()),
  ('EUR','CLP','2026-05-05','spot','market',1064.0900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-05',NOW(),NOW()),
  ('EUR','CLP','2026-05-06','spot','market',1059.1500000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-06',NOW(),NOW()),
  ('EUR','CLP','2026-05-07','spot','market',1048.9100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-07',NOW(),NOW()),
  ('EUR','CLP','2026-05-08','spot','market',1042.8900000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-08',NOW(),NOW()),
  ('EUR','CLP','2026-05-11','spot','market',1049.3400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-11',NOW(),NOW()),
  ('EUR','CLP','2026-05-12','spot','market',1053.1700000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-12',NOW(),NOW()),
  ('EUR','CLP','2026-05-13','spot','market',1056.2300000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-13',NOW(),NOW()),
  ('EUR','CLP','2026-05-14','spot','market',1040.9600000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-14',NOW(),NOW()),
  ('EUR','CLP','2026-05-15','spot','market',1040.4000000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-15',NOW(),NOW()),
  ('EUR','CLP','2026-05-18','spot','market',1053.6700000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-18',NOW(),NOW()),
  ('EUR','CLP','2026-05-19','spot','market',1049.5800000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-19',NOW(),NOW()),
  ('EUR','CLP','2026-05-28','spot','market',1040.2100000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-05-28',NOW(),NOW()),
  ('EUR','CLP','2026-06-08','spot','market',1048.8400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-06-08',NOW(),NOW()),
  ('EUR','CLP','2026-07-07','spot','market',1059.5400000000,'mindicador.cl','mindicador@legacy',FALSE,'activo','f1000000-0000-0000-0000-000000000001','maestro_tc','maestro_tc::EUR-CLP::2026-07-07',NOW(),NOW());

UPDATE currency_migration_batch
SET status = 'completed', completed_at = NOW(), record_count = 48
WHERE id = 'f1000000-0000-0000-0000-000000000001';

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN D: ASSERTIONS FAIL-SAFE (OA-012-01)
-- Si cualquier assertion falla → RAISE EXCEPTION → ROLLBACK automático.
-- El COMMIT al final es técnicamente imposible si algo no cuadra.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_total    INTEGER;
  v_usd_clp  INTEGER;
  v_eur_clp  INTEGER;
  v_activos  INTEGER;
  v_nulos    INTEGER;
  v_ceros    INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_total
    FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001';

  SELECT COUNT(*) INTO v_usd_clp FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND moneda_origen = 'USD' AND moneda_destino = 'CLP';

  SELECT COUNT(*) INTO v_eur_clp FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND moneda_origen = 'EUR' AND moneda_destino = 'CLP';

  SELECT COUNT(*) INTO v_activos FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND estado = 'activo';

  SELECT COUNT(*) INTO v_nulos FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND valor IS NULL;

  SELECT COUNT(*) INTO v_ceros FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND valor = 0;

  IF v_total <> 48 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: total esperado 48, encontrado %', v_total;
  END IF;
  IF v_usd_clp <> 24 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: USD-CLP esperado 24, encontrado %', v_usd_clp;
  END IF;
  IF v_eur_clp <> 24 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: EUR-CLP esperado 24, encontrado %', v_eur_clp;
  END IF;
  IF v_activos <> 48 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: activos esperado 48, encontrado %', v_activos;
  END IF;
  IF v_nulos <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: nulos esperado 0, encontrado %', v_nulos;
  END IF;
  IF v_ceros <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT FALLA: ceros esperado 0, encontrado %', v_ceros;
  END IF;

  RAISE NOTICE 'ASSERT D-cuantitativo OK: total=%, usd_clp=%, eur_clp=%, activos=%, nulos=%, ceros=%',
    v_total, v_usd_clp, v_eur_clp, v_activos, v_nulos, v_ceros;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN E: RECONCILIACIÓN LEGACY REAL → CANONICAL (OA-012-02)
-- Compara directamente contra calendario_data[id='maestro_tc'].
-- Prueba: legacy real → canonical real (no solo VALUES → canonical).
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_legacy_total   INTEGER;
  v_matched        INTEGER;
  v_unmatched      INTEGER;
  v_mismatch       INTEGER;
BEGIN
  WITH legacy AS (
    SELECT
      'USD'                                    AS moneda_origen,
      'CLP'                                    AS moneda_destino,
      (entry->>'fecha')::DATE                  AS fecha,
      ROUND((entry->>'valor')::NUMERIC, 2)     AS valor
    FROM calendario_data,
         jsonb_array_elements((value::jsonb)->'USD-CLP') AS entry
    WHERE id = 'maestro_tc'
    UNION ALL
    SELECT
      'EUR', 'CLP',
      (entry->>'fecha')::DATE,
      ROUND((entry->>'valor')::NUMERIC, 2)
    FROM calendario_data,
         jsonb_array_elements((value::jsonb)->'EUR-CLP') AS entry
    WHERE id = 'maestro_tc'
  ),
  canonical AS (
    SELECT moneda_origen, moneda_destino, fecha, ROUND(valor, 2) AS valor
    FROM currency_tc
    WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
      AND estado = 'activo'
  )
  SELECT
    COUNT(*)::INTEGER                                              INTO v_legacy_total
  FROM legacy;

  WITH legacy AS (
    SELECT
      'USD' AS moneda_origen, 'CLP' AS moneda_destino,
      (entry->>'fecha')::DATE AS fecha,
      ROUND((entry->>'valor')::NUMERIC, 2) AS valor
    FROM calendario_data,
         jsonb_array_elements((value::jsonb)->'USD-CLP') AS entry
    WHERE id = 'maestro_tc'
    UNION ALL
    SELECT 'EUR', 'CLP',
      (entry->>'fecha')::DATE,
      ROUND((entry->>'valor')::NUMERIC, 2)
    FROM calendario_data,
         jsonb_array_elements((value::jsonb)->'EUR-CLP') AS entry
    WHERE id = 'maestro_tc'
  ),
  canonical AS (
    SELECT moneda_origen, moneda_destino, fecha, ROUND(valor, 2) AS valor
    FROM currency_tc
    WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
      AND estado = 'activo'
  ),
  joined AS (
    SELECT
      l.moneda_origen, l.moneda_destino, l.fecha,
      l.valor AS valor_legacy,
      c.valor AS valor_canonical
    FROM legacy l
    LEFT JOIN canonical c
      ON c.moneda_origen = l.moneda_origen
     AND c.moneda_destino = l.moneda_destino
     AND c.fecha = l.fecha
  )
  SELECT
    COUNT(*)         FILTER (WHERE valor_canonical IS NOT NULL)::INTEGER,
    COUNT(*)         FILTER (WHERE valor_canonical IS NULL)::INTEGER,
    COUNT(*)         FILTER (WHERE valor_canonical IS NOT NULL AND valor_canonical <> valor_legacy)::INTEGER
  INTO v_matched, v_unmatched, v_mismatch
  FROM joined;

  IF v_legacy_total <> 48 THEN
    RAISE EXCEPTION 'OA-012 ASSERT E-legacy FALLA: legacy_total esperado 48, encontrado %. Verificar que calendario_data[maestro_tc] está íntegro.', v_legacy_total;
  END IF;
  IF v_matched <> 48 THEN
    RAISE EXCEPTION 'OA-012 ASSERT E-legacy FALLA: matched esperado 48, encontrado % (unmatched=%)', v_matched, v_unmatched;
  END IF;
  IF v_unmatched <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT E-legacy FALLA: unmatched_legacy esperado 0, encontrado %', v_unmatched;
  END IF;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT E-legacy FALLA: value_mismatch esperado 0, encontrado %. Ver query de evidencia en sección F.', v_mismatch;
  END IF;

  RAISE NOTICE 'ASSERT E-legacy OK: legacy_real=%, matched=%, unmatched=%, mismatch=%',
    v_legacy_total, v_matched, v_unmatched, v_mismatch;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN F: RECONCILIACIÓN vs VALUES EMBEBIDOS (segunda defensa)
-- Si los valores en calendario_data hubieran sido alterados antes de migrar,
-- esta segunda capa detecta inconsistencias contra los valores del script.
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_unmatched INTEGER;
  v_mismatch  INTEGER;
BEGIN
  WITH expected (moneda_origen, moneda_destino, fecha, valor_esperado) AS (
    VALUES
    ('USD','CLP', DATE '2026-04-20', 876.32::NUMERIC), ('USD','CLP', DATE '2026-04-21', 881.22::NUMERIC),
    ('USD','CLP', DATE '2026-04-22', 887.79::NUMERIC), ('USD','CLP', DATE '2026-04-23', 889.87::NUMERIC),
    ('USD','CLP', DATE '2026-04-24', 892.18::NUMERIC), ('USD','CLP', DATE '2026-04-27', 895.07::NUMERIC),
    ('USD','CLP', DATE '2026-04-28', 894.18::NUMERIC), ('USD','CLP', DATE '2026-04-29', 896.03::NUMERIC),
    ('USD','CLP', DATE '2026-04-30', 901.76::NUMERIC), ('USD','CLP', DATE '2026-05-04', 903.05::NUMERIC),
    ('USD','CLP', DATE '2026-05-05', 910.01::NUMERIC), ('USD','CLP', DATE '2026-05-06', 905.36::NUMERIC),
    ('USD','CLP', DATE '2026-05-07', 892.83::NUMERIC), ('USD','CLP', DATE '2026-05-08', 887.71::NUMERIC),
    ('USD','CLP', DATE '2026-05-11', 890.89::NUMERIC), ('USD','CLP', DATE '2026-05-12', 894.25::NUMERIC),
    ('USD','CLP', DATE '2026-05-13', 899.91::NUMERIC), ('USD','CLP', DATE '2026-05-14', 889.19::NUMERIC),
    ('USD','CLP', DATE '2026-05-15', 891.00::NUMERIC), ('USD','CLP', DATE '2026-05-18', 906.68::NUMERIC),
    ('USD','CLP', DATE '2026-05-19', 901.59::NUMERIC), ('USD','CLP', DATE '2026-05-28', 894.79::NUMERIC),
    ('USD','CLP', DATE '2026-06-08', 910.29::NUMERIC), ('USD','CLP', DATE '2026-07-07', 926.25::NUMERIC),
    ('EUR','CLP', DATE '2026-04-20', 1032.91::NUMERIC), ('EUR','CLP', DATE '2026-04-21', 1038.44::NUMERIC),
    ('EUR','CLP', DATE '2026-04-22', 1041.88::NUMERIC), ('EUR','CLP', DATE '2026-04-23', 1042.00::NUMERIC),
    ('EUR','CLP', DATE '2026-04-24', 1043.24::NUMERIC), ('EUR','CLP', DATE '2026-04-27', 1048.58::NUMERIC),
    ('EUR','CLP', DATE '2026-04-28', 1048.15::NUMERIC), ('EUR','CLP', DATE '2026-04-29', 1049.58::NUMERIC),
    ('EUR','CLP', DATE '2026-04-30', 1052.60::NUMERIC), ('EUR','CLP', DATE '2026-05-04', 1059.54::NUMERIC),
    ('EUR','CLP', DATE '2026-05-05', 1064.09::NUMERIC), ('EUR','CLP', DATE '2026-05-06', 1059.15::NUMERIC),
    ('EUR','CLP', DATE '2026-05-07', 1048.91::NUMERIC), ('EUR','CLP', DATE '2026-05-08', 1042.89::NUMERIC),
    ('EUR','CLP', DATE '2026-05-11', 1049.34::NUMERIC), ('EUR','CLP', DATE '2026-05-12', 1053.17::NUMERIC),
    ('EUR','CLP', DATE '2026-05-13', 1056.23::NUMERIC), ('EUR','CLP', DATE '2026-05-14', 1040.96::NUMERIC),
    ('EUR','CLP', DATE '2026-05-15', 1040.40::NUMERIC), ('EUR','CLP', DATE '2026-05-18', 1053.67::NUMERIC),
    ('EUR','CLP', DATE '2026-05-19', 1049.58::NUMERIC), ('EUR','CLP', DATE '2026-05-28', 1040.21::NUMERIC),
    ('EUR','CLP', DATE '2026-06-08', 1048.84::NUMERIC), ('EUR','CLP', DATE '2026-07-07', 1059.54::NUMERIC)
  ),
  canonical AS (
    SELECT moneda_origen, moneda_destino, fecha, ROUND(valor, 2) AS valor
    FROM currency_tc
    WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
      AND estado = 'activo'
  )
  SELECT
    COUNT(*) FILTER (WHERE c.valor IS NULL)::INTEGER,
    COUNT(*) FILTER (WHERE c.valor IS NOT NULL AND c.valor <> e.valor_esperado)::INTEGER
  INTO v_unmatched, v_mismatch
  FROM expected e
  LEFT JOIN canonical c
    ON c.moneda_origen = e.moneda_origen
   AND c.moneda_destino = e.moneda_destino
   AND c.fecha = e.fecha;

  IF v_unmatched <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT F-values FALLA: unmatched_legacy esperado 0, encontrado %', v_unmatched;
  END IF;
  IF v_mismatch <> 0 THEN
    RAISE EXCEPTION 'OA-012 ASSERT F-values FALLA: value_mismatch esperado 0, encontrado %', v_mismatch;
  END IF;

  RAISE NOTICE 'ASSERT F-values OK: unmatched=%, mismatch=%', v_unmatched, v_mismatch;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECCIÓN G: QUERIES DE EVIDENCIA (para copiar al acta)
-- Estos SELECT no afectan la transacción; son solo para documentación.
-- ─────────────────────────────────────────────────────────────

-- Evidencia cuantitativa (OA-011-05)
SELECT
  cmb.status,
  cmb.record_count                                                                AS declarado,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001')            AS en_tabla,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND moneda_origen = 'USD')                                                   AS usd_clp,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND moneda_origen = 'EUR')                                                   AS eur_clp,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND estado = 'activo')                                                       AS activos,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND valor IS NULL)                                                           AS nulos,
  (SELECT COUNT(*) FROM currency_tc
   WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
     AND valor = 0)                                                               AS ceros
FROM currency_migration_batch cmb
WHERE cmb.id = 'f1000000-0000-0000-0000-000000000001';

-- Evidencia legacy→canonical (OA-012-02)
WITH legacy AS (
  SELECT
    'USD' AS mo, 'CLP' AS md,
    (entry->>'fecha')::DATE AS fecha,
    ROUND((entry->>'valor')::NUMERIC, 2) AS valor
  FROM calendario_data,
       jsonb_array_elements((value::jsonb)->'USD-CLP') AS entry
  WHERE id = 'maestro_tc'
  UNION ALL
  SELECT 'EUR', 'CLP',
    (entry->>'fecha')::DATE,
    ROUND((entry->>'valor')::NUMERIC, 2)
  FROM calendario_data,
       jsonb_array_elements((value::jsonb)->'EUR-CLP') AS entry
  WHERE id = 'maestro_tc'
),
canonical AS (
  SELECT moneda_origen, moneda_destino, fecha, ROUND(valor, 2) AS valor
  FROM currency_tc
  WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
    AND estado = 'activo'
)
SELECT
  COUNT(*)                                                           AS legacy_total,
  COUNT(c.valor)                                                     AS matched,
  COUNT(*) FILTER (WHERE c.valor IS NULL)                            AS unmatched_legacy,
  COUNT(*) FILTER (WHERE c.valor IS NOT NULL AND c.valor <> l.valor) AS value_mismatch,
  CASE
    WHEN COUNT(c.valor) = 48
     AND COUNT(*) FILTER (WHERE c.valor IS NULL) = 0
     AND COUNT(*) FILTER (WHERE c.valor IS NOT NULL AND c.valor <> l.valor) = 0
    THEN 'LEGACY_TO_CANONICAL_OK'
    ELSE 'LEGACY_TO_CANONICAL_FALLA'
  END AS resultado
FROM legacy l
LEFT JOIN canonical c
  ON c.moneda_origen = l.mo AND c.moneda_destino = l.md AND c.fecha = l.fecha;

-- RLS habilitada en todas las tablas (OA-011-07)
SELECT table_name, row_security AS rls_enabled
FROM information_schema.tables
WHERE table_name IN (
  'currency_tc','currency_rate_type','currency_rate_purpose',
  'currency_canonical_pair','currency_migration_batch'
) AND table_schema = 'public'
ORDER BY table_name;
-- Esperado: 5 filas, todas ENABLED

-- Políticas existentes (debe ser 0)
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE tablename IN (
  'currency_tc','currency_rate_type','currency_rate_purpose',
  'currency_canonical_pair','currency_migration_batch'
);
-- Esperado: 0 filas

-- Índices creados
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename LIKE 'currency%'
ORDER BY tablename, indexname;

COMMIT;
-- ============================================================
-- FIN — COMMIT alcanzado solo si todos los ASSERT pasaron.
-- ============================================================

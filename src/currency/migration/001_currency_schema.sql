-- ============================================================
-- PASO1 Fase 1 — Currency Domain Schema + Seed + Migration
-- OA-010-02/03/04/05/12/13
-- Ejecutar en SQL Editor de Supabase (corre como service_role)
-- NO hacer push de este archivo con service_role key expuesta.
-- ============================================================

-- 1. Tablas de referencia ----------------------------------------

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

-- 2. Pares canónicos ---------------------------------------------

CREATE TABLE IF NOT EXISTS currency_canonical_pair (
  base CHAR(3) NOT NULL,
  quote CHAR(3) NOT NULL,
  PRIMARY KEY (base, quote)
);

-- Garantiza un único sentido físico por par (OA-010-02).
CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_pair_symmetric
  ON currency_canonical_pair (LEAST(base, quote), GREATEST(base, quote));

-- 3. Migration batch tracking ------------------------------------

CREATE TABLE IF NOT EXISTS currency_migration_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'in_progress',
  source_tables TEXT[],
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  record_count INT,
  notes TEXT
);

-- 4. Tabla principal ---------------------------------------------

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
  estado_aprobacion TEXT DEFAULT 'auto',
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

CREATE INDEX IF NOT EXISTS idx_currency_tc_par_fecha
  ON currency_tc (moneda_origen, moneda_destino, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_currency_tc_estado
  ON currency_tc (estado);
CREATE INDEX IF NOT EXISTS idx_currency_tc_migration_batch
  ON currency_tc (migration_batch_id);

-- 5. RLS habilitada — BLOQUEADO_POR_SEGURIDAD (OA-010-03) -------
-- Sin políticas. Solo service_role tiene acceso durante Fase 1.
-- NO agregar USING(true) ni equivalentes.

ALTER TABLE currency_tc ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rate_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_rate_purpose ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_canonical_pair ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency_migration_batch ENABLE ROW LEVEL SECURITY;

-- 6. Seeds de referencia -----------------------------------------

INSERT INTO currency_rate_type (code, name, description) VALUES
  ('spot',           'Spot',                'Tasa de mercado publicada para fecha específica'),
  ('period_end',     'Cierre de período',   'Tasa oficial de cierre al último día del período'),
  ('arithmetic_avg', 'Promedio aritmético', 'Promedio simple de tasas spot del período; n registros en metadata'),
  ('weighted_avg',   'Promedio ponderado',  'Promedio ponderado; metodología en methodology_metadata'),
  ('manual',         'Manual',              'Ingresada manualmente; requiere aprobado_por')
ON CONFLICT (code) DO NOTHING;

INSERT INTO currency_rate_purpose (code, name, description, owner_domain) VALUES
  ('market',     'Mercado',       'Referencia de mercado para valoración general',            'currency'),
  ('accounting', 'Contabilidad',  'Reconocimiento contable IFRS/GAAP',                        'accounting'),
  ('treasury',   'Tesorería',     'Gestión de liquidez y flujo de caja',                      'treasury'),
  ('tax',        'Impuesto',      'Tasa oficial para efectos tributarios',                    'tax'),
  ('budget',     'Presupuesto',   'Tasa de planificación presupuestaria',                     'planning')
ON CONFLICT (code) DO NOTHING;

INSERT INTO currency_canonical_pair (base, quote) VALUES
  ('USD', 'CLP'),
  ('EUR', 'CLP'),
  ('USD', 'PEN'),
  ('EUR', 'USD'),
  ('USD', 'GBP'),
  ('USD', 'CNY'),
  ('USD', 'BRL'),
  ('USD', 'MXN'),
  ('USD', 'AUD'),
  ('USD', 'CAD'),
  ('USD', 'JPY')
ON CONFLICT DO NOTHING;

-- 7. Migration batch para los 48 registros legacy ---------------

INSERT INTO currency_migration_batch (id, status, source_tables, notes)
VALUES (
  'f1000000-0000-0000-0000-000000000001',
  'in_progress',
  ARRAY['maestro_tc'],
  'Fase 1 — migración de 48 registros OBSERVADOS en maestro_tc (EUR-CLP: 24, USD-CLP: 24). Sin overrides manuales. Todos de fuente mindicador. OA-010-04.'
);

-- 8. Migración de los 48 registros (OA-010-04/12) ---------------
-- Mapeo: spot / market / fuente=mindicador.cl
-- legacy_source_key: maestro_tc::{PAR}::{FECHA}
-- IDEMPOTENTE: ON CONFLICT DO NOTHING

INSERT INTO currency_tc
  (moneda_origen, moneda_destino, fecha, rate_type, rate_purpose, valor,
   fuente, connector_version, es_manual, estado,
   migration_batch_id, legacy_source_table, legacy_source_key,
   obtenido_en, created_at)
VALUES
  -- USD-CLP (24 registros)
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
  -- EUR-CLP (24 registros)
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

-- 9. Cerrar el batch con count=48 --------------------------------

UPDATE currency_migration_batch
SET status = 'completed',
    completed_at = NOW(),
    record_count = 48
WHERE id = 'f1000000-0000-0000-0000-000000000001';

-- 10. Verificación de reconciliación (OA-010-12) -----------------
-- Ejecutar después del bloque anterior para confirmar 48→48.

SELECT
  'Batch' AS entidad,
  status,
  record_count AS declarado,
  (SELECT COUNT(*) FROM currency_tc WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001') AS en_tabla,
  (SELECT COUNT(*) FROM currency_tc WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001' AND estado = 'activo') AS activos,
  (SELECT COUNT(*) FROM currency_tc WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001' AND valor IS NULL) AS nulos,
  (SELECT COUNT(*) FROM currency_tc WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001' AND valor = 0) AS ceros
FROM currency_migration_batch
WHERE id = 'f1000000-0000-0000-0000-000000000001';

-- Esperado: declarado=48, en_tabla=48, activos=48, nulos=0, ceros=0

-- 11. Rollback (si se necesita) ----------------------------------
-- UPDATE currency_tc
-- SET estado = 'invalidado', invalidado_en = NOW()
-- WHERE migration_batch_id = 'f1000000-0000-0000-0000-000000000001'
--   AND estado = 'activo';

-- =============================================================================
-- 011_technical_seeds.sql
-- OA-024-05 ETAPA 0 — Catálogos Técnicos Mínimos
-- Fecha   : 2026-08-14
-- Estado  : EJECUTAR DESPUÉS de 010_triggers_t1_t11.sql
-- =============================================================================
-- Solo seeds técnicos. Sin datos financieros reales.
-- NO autorizado: D7 ownership, D8 currencies, balances, journals.
-- =============================================================================

-- =============================================================================
-- SECCIÓN 1: dim_type — Dimensiones de análisis
-- =============================================================================

INSERT INTO dim_type (code, label, description, allows_multiple, is_active) VALUES
  ('CC',  'Centro de Costo',    'Centro de costo operativo',                    false, true),
  ('PRY', 'Proyecto',           'Proyecto o iniciativa específica',              false, true),
  ('CTR', 'Contrato',           'Contrato comercial de referencia',              false, true),
  ('RGN', 'Región',             'Región geográfica de operación',                false, true),
  ('TMP', 'Temporada',          'Temporada agrícola (Jul–Jun)',                  false, true),
  ('ESP', 'Especie',            'Especie de fruta (cerezas, arándanos, etc.)',   false, true),
  ('MKT', 'Mercado Destino',    'País o mercado de destino de exportación',      false, true),
  ('NMN', 'Nómina',             'Referencia a nómina de pago',                  false, true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECCIÓN 2: pln_scenario — Escenarios de planificación
-- =============================================================================

INSERT INTO pln_scenario (code, label, description, is_active, is_locked) VALUES
  ('BASE',   'Base',          'Presupuesto base aprobado por directorio',       true,  false),
  ('ACTUAL', 'Real',          'Datos reales (contabilidad)',                    true,  false),
  ('REV1',   'Revisión 1',    'Primera revisión semestral del presupuesto',     true,  false),
  ('STRESS', 'Stress Test',   'Escenario conservador para análisis de riesgo',  true,  false)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECCIÓN 3: acc_financial_statement — Estados Financieros estándar IFRS
-- =============================================================================

INSERT INTO acc_financial_statement (code, name, statement_type, is_active) VALUES
  ('ESF',   'Estado de Situación Financiera',   'balance_sheet',    true),
  ('ERI',   'Estado de Resultado Integral',      'income',           true),
  ('EFE',   'Estado de Flujos de Efectivo',      'cash_flow',        true),
  ('ECP',   'Estado de Cambios en Patrimonio',   'equity_changes',   true)
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- SECCIÓN 4: acc_reporting_account — Líneas de reporting de alto nivel
-- =============================================================================
-- Solo líneas de cabecera para habilitar el motor de reporting.
-- Detalle de cuentas se agrega cuando ContecAdapter esté autorizado (NO ahora).

INSERT INTO acc_reporting_account
  (financial_statement_id, code, name, normal_balance, sort_order, is_subtotal, is_active)
SELECT
  fs.id,
  ra.code,
  ra.name,
  ra.normal_balance,
  ra.sort_order,
  ra.is_subtotal,
  true
FROM acc_financial_statement fs
CROSS JOIN (VALUES
  ('ESF', 'ACT',   'Activo',                  'debit',  10, false),
  ('ESF', 'ACT_C', 'Activo Corriente',         'debit',  11, false),
  ('ESF', 'ACT_NC','Activo No Corriente',      'debit',  12, false),
  ('ESF', 'PAS',   'Pasivo',                   'credit', 20, false),
  ('ESF', 'PAS_C', 'Pasivo Corriente',         'credit', 21, false),
  ('ESF', 'PAS_NC','Pasivo No Corriente',      'credit', 22, false),
  ('ESF', 'PAT',   'Patrimonio',               'credit', 30, false),
  ('ESF', 'TOTAL', 'Total Activo = Pasivo+Pat','debit',  99, true),
  ('ERI', 'ING',   'Ingresos de Actividades',  'credit', 10, false),
  ('ERI', 'COSTO', 'Costo de Ventas',          'debit',  20, false),
  ('ERI', 'MB',    'Margen Bruto',             'credit', 25, true),
  ('ERI', 'GOPEX', 'Gastos Operacionales',     'debit',  30, false),
  ('ERI', 'EBIT',  'Resultado Operacional',    'credit', 35, true),
  ('ERI', 'FIN',   'Resultado Financiero',     'credit', 40, false),
  ('ERI', 'EBT',   'Resultado Antes Impuesto', 'credit', 45, true),
  ('ERI', 'IMP',   'Gasto por Impuesto',       'debit',  50, false),
  ('ERI', 'UAI',   'Resultado del Período',    'credit', 99, true)
) AS ra (fs_code, code, name, normal_balance, sort_order, is_subtotal)
WHERE fs.code = ra.fs_code
ON CONFLICT (code) DO NOTHING;

-- =============================================================================
-- VERIFICACIÓN POST-SEEDS
-- =============================================================================

/*
-- V1: dim_type
SELECT code, label FROM dim_type ORDER BY code;
-- Esperado: 8 filas (CC, CTR, ESP, MKT, NMN, PRY, RGN, TMP)

-- V2: pln_scenario
SELECT code, label FROM pln_scenario ORDER BY code;
-- Esperado: 4 filas (ACTUAL, BASE, REV1, STRESS)

-- V3: acc_financial_statement
SELECT code, name FROM acc_financial_statement ORDER BY code;
-- Esperado: 4 filas (ECB, EFE, ERI, ESF)

-- V4: acc_reporting_account
SELECT fs.code AS statement, ra.code, ra.name
FROM acc_reporting_account ra
JOIN acc_financial_statement fs ON fs.id = ra.financial_statement_id
ORDER BY fs.code, ra.sort_order;
-- Esperado: 17 filas (8 ESF + 9 ERI)
*/

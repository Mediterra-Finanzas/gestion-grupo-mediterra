-- =============================================================================
-- 018_alf_accounting_profile.sql
-- OA-024-08A — ALF AccountingProfile: D8 USD + acc_base_profile + acc_entity_config
-- Fecha   : 2026-08-19
-- Estado  : READY TO EXECUTE — requiere confirmación CFO (recibida 2026-08-19)
-- Ejecutar: Supabase SQL Editor (postgres role, bypasses RLS) — NO via anon key
-- =============================================================================
-- PRERREQUISITOS:
--   008_accounting_tables_apply.sql  → tablas exist
--   009_rls_all.sql                  → RLS activo
--   011_technical_seeds.sql          → acc_reporting_account 17 rows seeded
--   core_entities ALF UUID           → 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
-- NO EJECUTAR antes de verificar que Q1 todavía devuelve 0 rows (idempotencia).
-- =============================================================================
-- CONSTRAINTS VERIFICADOS:
--   acc_base_profile: UNIQUE (entity_id) → ON CONFLICT (entity_id) DO NOTHING ✓
--   acc_entity_config: NO UNIQUE en entity_id → guard vía WHERE NOT EXISTS ✓
--   acc_chart_mapping: UNIQUE (entity_id, local_account_code, effective_from) ✓
--   consol_method CHECK: ('line_by_line','equity_method','cost_method','proportional','unresolved') ✓
--   effective_to CHECK: NULL OR >= effective_from ✓
-- RLS:
--   acc_base_profile → service_role ALL, authenticated SELECT — INSERT desde SQL Editor (postgres) ✓
--   acc_entity_config → service_role ALL, authenticated SELECT — INSERT desde SQL Editor (postgres) ✓
--   acc_chart_mapping → service_role ALL, authenticated SELECT — INSERT desde SQL Editor (postgres) ✓
-- =============================================================================

-- ============================================================
-- BLOQUE 0 — Verificación de prerrequisitos (solo lectura)
-- Ejecutar primero para confirmar estado antes del insert.
-- ============================================================

-- PRE-CHECK: confirmar ALF existe en core_entities
-- Esperado: 1 row con id = 3df93d9d-cbc6-446f-b9a5-0a3840692fd8
SELECT id, legal_name, entity_type
FROM core_entities
WHERE id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- PRE-CHECK: confirmar 0 rows en acc_base_profile para ALF
-- Esperado: 0 rows (estado limpio)
SELECT * FROM acc_base_profile
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- PRE-CHECK: confirmar 0 rows en acc_entity_config para ALF
-- Esperado: 0 rows (estado limpio)
SELECT * FROM acc_entity_config
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- PRE-CHECK: confirmar 17 reporting accounts disponibles
-- Esperado: 17 rows
SELECT COUNT(*) AS total_reporting_accounts FROM acc_reporting_account WHERE is_active = true;

-- ============================================================
-- BLOQUE 1 — F.1: acc_base_profile INSERT (perfil base ALF)
-- ============================================================
-- Decisión CFO 2026-08-19: functional_currency = 'USD'
-- Evidencia: HIGH confidence (8 factores IAS 21 — ver OA-024-08A D8-ALF ASSESSMENT)
-- consol_method: line_by_line (ALF 100% controlada por Mediterra Holding, CLAUDE.md)

INSERT INTO acc_base_profile
  (entity_id, functional_currency, reporting_currency, consol_method,
   is_ifrs, framework_version, notes)
VALUES
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   'USD',
   'USD',
   'line_by_line',
   true,
   'IFRS-2024',
   'D8-ALF: USD confirmado por CFO Angelo Huerta 2026-08-19. Evidencia: FOB precios USD, facturación USD, bancos USD, financiamiento USD. OA-024-08A.')
ON CONFLICT (entity_id) DO NOTHING;

-- POST-CHECK: confirmar insert exitoso
SELECT id, entity_id, functional_currency, reporting_currency, consol_method, is_ifrs
FROM acc_base_profile
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- ============================================================
-- BLOQUE 2 — F.2: acc_entity_config INSERT (temporal, ejercicio 2026)
-- ============================================================
-- effective_from = 2026-01-01 (inicio ejercicio fiscal vigente Ene-Dic)
-- effective_to = NULL (open-ended — hasta nueva decisión CFO)
-- Guard: WHERE NOT EXISTS (idempotente — no hay UNIQUE constraint en acc_entity_config)

INSERT INTO acc_entity_config
  (entity_id, effective_from, effective_to, functional_currency,
   reporting_currency, consol_method, ownership_pct, nci_pct, notes)
SELECT
  '3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
  '2026-01-01',
  NULL,
  'USD',
  'USD',
  'line_by_line',
  100.0,
  0.0,
  'D8-ALF: USD confirmado CFO 2026-08-19. ownership_pct=100 (Mediterra Holding 100%). OA-024-08A.'
WHERE NOT EXISTS (
  SELECT 1 FROM acc_entity_config
  WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
    AND effective_from = '2026-01-01'
);

-- POST-CHECK: confirmar insert exitoso
SELECT id, entity_id, effective_from, effective_to,
       functional_currency, reporting_currency, consol_method,
       ownership_pct, nci_pct
FROM acc_entity_config
WHERE entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- ============================================================
-- BLOQUE 3 — F.3: acc_chart_mapping (4 cuentas READY — NO EJECUTAR)
-- ============================================================
-- ESTADO: HOLD — en espera de aprobación CFO de los mappings contables.
-- Estos 4 códigos fueron observados en AC-04 (archivos reales ALF).
-- Revisar la tabla de detalle en OA-024-08A antes de aprobar.
-- Una vez aprobado: descomentar y ejecutar.
-- ============================================================

/*
-- TABLA DE DETALLE (ver OA-024-08A §MAPPING CUENTAS):
--
-- 4.01.01.002 | VENTA CEREZAS FRESCAS EXPORTACION | ING | credit | HIGH | NO
-- 6.11.01.010 | SUELDOS Y SALARIOS               | GOPEX | debit | HIGH | NO
-- 6.11.07.290 | GASTOS BANCARIOS                 | GOPEX | debit | MEDIUM | YES (revisar FIN vs GOPEX)
-- 6.11.07.310 | SEGUROS                          | GOPEX | debit | HIGH | NO

INSERT INTO acc_chart_mapping
  (entity_id, local_account_code, reporting_account_id, effective_from, is_active, notes)
VALUES
  -- 1. Venta cerezas exportación → ING
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '4.01.01.002',
   (SELECT id FROM acc_reporting_account WHERE code = 'ING'),
   '2026-01-01', true,
   'EERR: naturaleza INGRESOS/INGRESOS POR VENTA. AC-04 §3.1 observed. ALF exportadora FOB USD.'),

  -- 2. Sueldos y salarios → GOPEX
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.01.010',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true,
   'EERR: naturaleza GASTOS DE ADM. Y VENTAS/GASTOS DE PERSONAL. AC-04 §3.4 observed (CC: ADMIN, OPERACIONES).'),

  -- 3. Gastos bancarios → GOPEX (con nota de revisión)
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.07.290',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true,
   'EERR: naturaleza GASTOS DE ADM. Y VENTAS. AC-04 §3.4 observed. REVISAR: comisiones bancarias (GOPEX) vs intereses (FIN).'),

  -- 4. Seguros → GOPEX
  ('3df93d9d-cbc6-446f-b9a5-0a3840692fd8',
   '6.11.07.310',
   (SELECT id FROM acc_reporting_account WHERE code = 'GOPEX'),
   '2026-01-01', true,
   'EERR: naturaleza GASTOS DE ADM. Y VENTAS/GASTOS DE GESTION. AC-04 §3.4 observed (CC: COMEX).')

ON CONFLICT ON CONSTRAINT uq_acc_chart_mapping DO NOTHING;

-- POST-CHECK: confirmar 4 rows insertadas
SELECT cm.local_account_code, ra.code as reporting_account, ra.name, cm.is_active, cm.notes
FROM acc_chart_mapping cm
JOIN acc_reporting_account ra ON ra.id = cm.reporting_account_id
WHERE cm.entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'
ORDER BY cm.local_account_code;
*/

-- =============================================================================
-- BLOQUE 4 — ESTADO FINAL: verificación de AccountingProfile completo
-- Ejecutar después de F.1 + F.2 para confirmar PASS
-- =============================================================================

SELECT
  ce.legal_name,
  bp.functional_currency   AS base_functional_currency,
  bp.reporting_currency    AS base_reporting_currency,
  bp.consol_method         AS base_consol_method,
  bp.is_ifrs,
  ec.effective_from,
  ec.effective_to,
  ec.functional_currency   AS config_functional_currency,
  ec.consol_method         AS config_consol_method,
  ec.ownership_pct,
  (SELECT COUNT(*) FROM acc_chart_mapping cm WHERE cm.entity_id = ce.id AND cm.is_active = true) AS chart_mappings_active
FROM core_entities ce
LEFT JOIN acc_base_profile bp   ON bp.entity_id = ce.id
LEFT JOIN acc_entity_config ec  ON ec.entity_id = ce.id
WHERE ce.id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8';

-- EXPECTED OUTPUT (después de F.1 + F.2):
-- legal_name: Allegria Foods
-- base_functional_currency: USD
-- config_functional_currency: USD
-- base_consol_method: line_by_line
-- is_ifrs: true
-- effective_from: 2026-01-01
-- effective_to: NULL
-- ownership_pct: 100.0000
-- chart_mappings_active: 0 (hasta que CFO apruebe F.3)

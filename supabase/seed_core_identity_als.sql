-- ============================================================================
-- seed_core_identity_als.sql — Semilla Core del tenant Allegria Service (ALS).
--
-- Idempotente. Inserta/reconcilia SOLO la fila ALS en contab_empresas usando el UUID EXACTO
-- observado en producción. NO toca ni borra otros tenants. NO crea auxiliares (los auxiliares
-- sintéticos de UAT viven en el seed P4, separado y DEV_ONLY).
--
-- Valores canónicos (evidencia producción, read-only):
--   id                     = 5aa10886-2a76-4a9e-9bc3-303fb776cd49
--   codigo                 = ALS
--   nombre                 = Allegria Service
--   moneda_base            = CLP
--   tipo_contab            = dual
--   usa_temporada_agricola = false
--   activa                 = true
-- ============================================================================

INSERT INTO contab_empresas (id, codigo, nombre, moneda_base, tipo_contab, usa_temporada_agricola, activa)
VALUES ('5aa10886-2a76-4a9e-9bc3-303fb776cd49', 'ALS', 'Allegria Service', 'CLP', 'dual', false, true)
ON CONFLICT (id) DO UPDATE
  SET codigo                 = EXCLUDED.codigo,
      nombre                 = EXCLUDED.nombre,
      moneda_base            = EXCLUDED.moneda_base,
      tipo_contab            = EXCLUDED.tipo_contab,
      usa_temporada_agricola = EXCLUDED.usa_temporada_agricola,
      activa                 = EXCLUDED.activa,
      updated_at             = now();

-- Verificación defensiva: la fila ALS quedó exactamente como se espera.
DO $$
DECLARE v_cod text; v_mon text;
BEGIN
  SELECT codigo, moneda_base INTO v_cod, v_mon
    FROM contab_empresas WHERE id = '5aa10886-2a76-4a9e-9bc3-303fb776cd49';
  IF v_cod IS DISTINCT FROM 'ALS' OR v_mon IS DISTINCT FROM 'CLP' THEN
    RAISE EXCEPTION 'seed_core_identity_als: fila ALS inconsistente (codigo=%, moneda=%)', v_cod, v_mon;
  END IF;
END $$;

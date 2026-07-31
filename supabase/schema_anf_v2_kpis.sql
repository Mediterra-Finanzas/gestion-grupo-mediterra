/* =================================================================
   ANÁLISIS FINANCIERO — Migración v2
   Amplía anf_kpis_derivados para soportar 17 KPIs.

   Cambio: elimina el CHECK restrictivo en la columna `clave`
   (solo aceptaba 6 valores fijos) para permitir los nuevos KPIs
   de rentabilidad, balance y resultados.

   Idempotente: seguro re-ejecutar.
================================================================= */

ALTER TABLE anf_kpis_derivados
  DROP CONSTRAINT IF EXISTS anf_kpis_derivados_clave_check;

COMMENT ON COLUMN anf_kpis_derivados.clave IS
  'Clave del KPI. Valores válidos (validados en app):
   Rentabilidad : margen_bruto | margen_ebitda | margen_neto | roe | roa | cumplimiento_ppto
   Liquidez     : liquidez_corriente | capital_trabajo
   Endeudamiento: deuda_patrimonio | deuda_ebitda
   Balance      : total_activos | total_pasivos | total_patrimonio | activos_corrientes | pasivos_corrientes
   Resultados   : resultado_neto_ytd | resultado_temporada';

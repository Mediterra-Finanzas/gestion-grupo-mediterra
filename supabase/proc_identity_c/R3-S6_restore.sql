-- ============================================================================
-- R3-S6_restore.sql — T3: restaura la membership del fixture (activo=true). TARGET: staging.
-- Se corre para comprobar que la MISMA J1 vuelve a ALLOW (empresa=A) tras re-activar.
-- ============================================================================
UPDATE iam_usuario_empresa SET activo=true
WHERE usuario_id='f1000000-0000-0000-0000-000000000011'
  AND empresa_id='f1000000-0000-0000-0000-0000000000aa';
-- Esperado: UPDATE 1

-- ============================================================================
-- R3-S6_revoke.sql — T1: revoca la membership del fixture (activo=false). TARGET: staging.
-- Se corre ENTRE la request T0 (ALLOW) y la request T2 (DENY) del navegador, SIN tocar el token.
-- Afecta SOLO la fila fixture (usuario_id fixed). Reversible con R3-S6_restore.sql.
-- ============================================================================
UPDATE iam_usuario_empresa SET activo=false
WHERE usuario_id='f1000000-0000-0000-0000-000000000011'
  AND empresa_id='f1000000-0000-0000-0000-0000000000aa';
-- Esperado: UPDATE 1

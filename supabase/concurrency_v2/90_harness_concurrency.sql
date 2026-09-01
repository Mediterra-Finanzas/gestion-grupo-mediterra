-- ============================================================================
-- 90_harness_concurrency.sql — Harness de prueba del hardening Class-B.
-- DRAFT / PSEUDO. NO forma parte de la migración. Demuestra el invariante:
--   "ningún cambio válido se pierde en silencio; los conflictos son visibles".
--
-- Tiene 3 partes:
--   PARTE 1 — Prueba LÓGICA autocontenida (TEMP table, sin datos reales, determinista, CI-friendly).
--             Corre en cualquier DB. Demuestra que el token optimista + trigger de bump rechazan
--             la escritura stale como CONFLICT (0 filas), no como éxito.
--   PARTE 2 — Prueba de 2 SESIONES REALES contra proc_fn_cambiar_estado_orden (psql, manual).
--             Demuestra FOR UPDATE + PROC_STALE con concurrencia real.
--   PARTE 3 — Escenario "dos transiciones válidas desde el mismo estado": una gana, la otra detecta
--             stale (NO last-write-wins destructivo).
--
-- NADA de esto se ejecuta automáticamente. PARTE 1 es segura (TEMP + sin commit de datos de negocio).
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — PRUEBA LÓGICA AUTOCONTENIDA (segura, determinista)
--   Modela (id, estado, row_version) + trigger de bump idéntico a proc_fn_bump_version.
--   Simula 2 usuarios que leyeron la MISMA versión y escriben en secuencia.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE TEMP TABLE _conc_demo (
  id int PRIMARY KEY,
  estado text NOT NULL,
  row_version bigint NOT NULL DEFAULT 1
) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION _conc_bump() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.row_version := COALESCE(OLD.row_version,0)+1; RETURN NEW; END $$;
CREATE TRIGGER _t_bump BEFORE UPDATE ON _conc_demo
  FOR EACH ROW EXECUTE FUNCTION _conc_bump();

INSERT INTO _conc_demo(id, estado, row_version) VALUES (1, 'borrador', 1);

DO $harness$
DECLARE
  v_leido_A bigint;   -- token que leyó el Usuario A
  v_leido_B bigint;   -- token que leyó el Usuario B (mismo instante → misma versión)
  v_filas   int;
  v_estado_final text;
  v_ver_final bigint;
BEGIN
  -- Ambos leen la fila en version=1.
  SELECT row_version INTO v_leido_A FROM _conc_demo WHERE id=1;
  SELECT row_version INTO v_leido_B FROM _conc_demo WHERE id=1;
  RAISE NOTICE '[P1] A leyó v=%, B leyó v=%', v_leido_A, v_leido_B;

  -- Usuario A escribe primero, con su token (WHERE row_version = token).
  UPDATE _conc_demo SET estado='en_proceso'
   WHERE id=1 AND row_version = v_leido_A;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN RAISE EXCEPTION '[P1] FAIL: la escritura de A debió afectar 1 fila, afectó %', v_filas; END IF;
  RAISE NOTICE '[P1] A escribió OK (borrador→en_proceso). Fila ahora en v=%', (SELECT row_version FROM _conc_demo WHERE id=1);

  -- Usuario B escribe con su token STALE (v=1), intentando anular.
  UPDATE _conc_demo SET estado='anulado'
   WHERE id=1 AND row_version = v_leido_B;   -- v_leido_B = 1, pero la fila ya está en v=2
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  -- INVARIANTE: la escritura stale de B afecta 0 filas → el frontend lo trata como CONFLICT,
  -- NO como éxito. El cambio de A sobrevive; el de B NO pisa en silencio.
  IF v_filas <> 0 THEN
    RAISE EXCEPTION '[P1] FAIL (last-write-wins!): la escritura stale de B afectó % fila(s), debió ser 0', v_filas;
  END IF;
  RAISE NOTICE '[P1] B con token stale → 0 filas afectadas = CONFLICT detectado (correcto).';

  SELECT estado, row_version INTO v_estado_final, v_ver_final FROM _conc_demo WHERE id=1;
  IF v_estado_final <> 'en_proceso' THEN
    RAISE EXCEPTION '[P1] FAIL: estado final=% (esperado en_proceso; el cambio de A debió sobrevivir)', v_estado_final;
  END IF;
  RAISE NOTICE '[P1] PASS ✔  estado final=% v=% (A ganó, B vio conflicto, nada se perdió en silencio).',
    v_estado_final, v_ver_final;
END
$harness$;

ROLLBACK;   -- no persistir nada (la TEMP se descarta igual con ON COMMIT DROP)


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — DOS SESIONES REALES contra la RPC (psql manual, sobre STAGING)
--   Requiere: 10_optimistic_token.sql + 20_rpc_cambiar_estado_orden.sql aplicados en STAGING,
--   y un orden en estado 'borrador'. Sustituir :EMP, :ORD, :VER por valores reales.
--   Ejecutar cada bloque en una TERMINAL psql distinta (Sesión 1 y Sesión 2) en el orden indicado.
-- ────────────────────────────────────────────────────────────────────────────
-- -- [Sesión 1 y 2] leer el token actual del orden (ambas ven la misma versión):
-- --   SELECT id, estado, row_version FROM proc_orden_proceso WHERE id=:'ORD' AND empresa_id=:'EMP';
-- --   → supongamos row_version = 7 para ambas.
--
-- -- [Sesión 1] abre transacción y toma el lock (NO commitear aún):
-- --   BEGIN;
-- --   SELECT proc_fn_cambiar_estado_orden(:'EMP', :'ORD', 'en_proceso', 7, :'ACTOR');
-- --   -- devuelve {"ok":true,"estado":"en_proceso","row_version":8}  (aún sin COMMIT)
--
-- -- [Sesión 2] intenta anular con el MISMO token 7 (quedará BLOQUEADA por el FOR UPDATE de S1):
-- --   SELECT proc_fn_cambiar_estado_orden(:'EMP', :'ORD', 'anulado', 7, :'ACTOR');
-- --   -- se queda esperando…
--
-- -- [Sesión 1] confirma:
-- --   COMMIT;
--
-- -- [Sesión 2] se DESBLOQUEA y, al re-leer bajo lock, ve row_version=8 ≠ 7 →
-- --   ERROR:  PROC_STALE: la orden <folio> cambió desde que la leíste (tu versión=7, actual=8)...
-- --   SQLSTATE 40001. La orden NO se anula. El cambio de S1 sobrevive.
--
-- RESULTADO ESPERADO: Sesión 2 recibe PROC_STALE (conflicto visible), la orden queda 'en_proceso'.


-- ════════════════════════════════════════════════════════════════════════════
-- PARTE 3 — "DOS TRANSICIONES VÁLIDAS DESDE EL MISMO ESTADO" (una gana, la otra detecta stale)
--   Mismo setup que PARTE 2. Ambas transiciones (borrador→en_proceso y borrador→anulado) son
--   INDIVIDUALMENTE legales; el punto es que NO pueden aplicarse ambas: la 2ª debe detectar que
--   el estado base cambió. Sin el guard optimista, el trigger de estado dejaría pasar
--   'en_proceso→anulado' y B anularía la orden que A arrancó (last-write-wins destructivo).
-- ────────────────────────────────────────────────────────────────────────────
-- -- Con el hardening: exactamente una de las dos RPC concurrentes retorna ok; la otra retorna
-- -- PROC_STALE. El operador de la sesión perdedora ve el conflicto, recarga (row_version=8,
-- -- estado='en_proceso') y decide con información fresca si aún corresponde anular.
--
-- -- Prueba negativa (demostrar el bug que cerramos): si se hiciera el PATCH viejo sin token
-- --   PATCH proc_orden_proceso?id=eq.:ORD&empresa_id=eq.:EMP  {"estado":"anulado"}
-- -- tras el commit de S1, el trigger ve OLD='en_proceso'→NEW='anulado' (transición legal) y la
-- -- orden SE ANULA silenciosamente. Ese es el Class-B que el token + RPC eliminan.


-- ── CRITERIOS DE ACEPTACIÓN ──────────────────────────────────────────────────
--  ✔ PARTE 1 imprime "[P1] PASS" (mecánica del token probada, sin datos reales).
--  ✔ PARTE 2: Sesión 2 recibe SQLSTATE 40001 / PROC_STALE; el orden conserva el cambio de Sesión 1.
--  ✔ PARTE 3: exactamente una transición concurrente gana; la otra es un conflicto visible, no una
--    sobrescritura silenciosa.

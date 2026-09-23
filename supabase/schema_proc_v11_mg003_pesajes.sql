-- ============================================================================
-- schema_proc_v11_mg003_pesajes.sql  ·  MG-003 — Pesajes de recepción (Allegria Service)
-- Capability proc_* — capa de RECEPCIÓN / PESAJE. Incremental sobre F1 (schema_proc_v1.sql).
-- Tenant piloto: Allegria Service. Bounded context proc_* (NO toca Frisku/exp_*/Osiris/main).
-- DISEÑO PARA REVISIÓN — NO aplicar a la DB hasta visto bueno (los nombres son el contrato).
--
-- INVARIANTE DURA (MG-003):  PESADA ≠ BIN ≠ LOTE.
--   Flujo:  proc_recepcion → proc_recepcion_pesaje → proc_recepcion_bin → proc_lote
--   · Una PESADA (evento de romana) contiene 1..N BINS  (NO 1 pesada = 1 bin).
--   · NO hay reparto automático de kilos entre bins (NO 50/50). El kg individual del
--     bin es null hasta que se mide o se reparte EXPLÍCITAMENTE (metodo_reparto).
--   · La masa física de la PESADA es autoridad a nivel de pesada; la conciliación
--     compara Σ bins medidos contra el neto de la pesada (mass balance), sin fabricar kg.
--   · Compatibilidad histórica: proc_recepcion.n_bins (conteo plano) y los lotes ya
--     ingresados por RPC (F2/T10c) siguen válidos; esta capa es ADITIVA. Un bin puede
--     quedar sin lote (lote_id null) mientras no se asigne.
--
-- PREREQUISITO: schema_proc_v1.sql aplicado (proc_current_empresa/_user, proc_fn_touch,
--   proc_fn_audit, proc_recepcion, proc_lote). Envases por CÓDIGO neutral (proc_tipo_envase),
--   sin FK físico — igual que el resto de catálogos por-código del bounded context.
--
-- Convenciones (idénticas a proc_*): PK id UUID; empresa_id UUID NOT NULL SIN FK físico
--   (tenant desde contexto, no hardcode); NUMERIC(14,3) para kilos (nunca float); soft-delete
--   deleted_at; created_by/updated_by/created_at/updated_at + proc_audit_log; RLS FORCE por
--   empresa + REVOKE anon (la política permisiva de dev va en el _DEV_ONLY_rls.sql).
--
-- DECISIONES FUNCIONALES ABIERTAS (parametrizadas, NO bloquean el schema):
--   (a) Reparto de kg cuando varios bins se pesan juntos → columna metodo_reparto en la
--       pesada: 'sin_reparto' (DEFAULT, NO auto-split) | 'manual' | 'prorrateo_tara' |
--       'prorrateo_capacidad'. La regla concreta se decide con Marcos; el default no inventa kg.
--   (b) Semántica de "Frigorífico" → columna destino_frio (text, nullable) como marcador
--       neutral; su significado operativo queda pendiente de confirmación con Marcos.
-- ============================================================================

-- ── PESADA: evento de pesaje en romana/balanza (1 recepción → 0..N pesadas) ───
CREATE TABLE IF NOT EXISTS proc_recepcion_pesaje (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  recepcion_id       uuid NOT NULL REFERENCES proc_recepcion(id),
  secuencia          integer NOT NULL DEFAULT 1 CHECK (secuencia >= 1),  -- orden dentro de la recepción
  folio_pesaje       text,                                              -- ticket/correlativo de romana (opcional)
  fecha              timestamptz NOT NULL DEFAULT now(),
  balanza            text,                                              -- identificador de báscula/romana
  captura            text NOT NULL DEFAULT 'bruto_tara'
                     CHECK (captura IN ('bruto_tara','neto_directo','documental')),
  -- Pesos del EVENTO (a nivel de pesada). Documental = declarado en guía; físico = romana.
  peso_documental    numeric(14,3) CHECK (peso_documental IS NULL OR peso_documental >= 0),
  peso_bruto         numeric(14,3) CHECK (peso_bruto     IS NULL OR peso_bruto     >= 0),  -- físico bruto
  tara               numeric(14,3) CHECK (tara           IS NULL OR tara           >= 0),  -- tara total (envases+pallet)
  peso_neto          numeric(14,3) CHECK (peso_neto      IS NULL OR peso_neto      >= 0),  -- físico neto (DB autoridad)
  n_bins_declarado   integer CHECK (n_bins_declarado IS NULL OR n_bins_declarado >= 0),    -- conteo declarado (concilia con COUNT real)
  metodo_reparto     text NOT NULL DEFAULT 'sin_reparto'
                     CHECK (metodo_reparto IN ('sin_reparto','manual','prorrateo_tara','prorrateo_capacidad')),  -- decisión (a)
  destino_frio       text,                                             -- decisión (b): marcador "Frigorífico", semántica pendiente
  estado             text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','confirmada','anulada')),
  observaciones      text,
  documentos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, recepcion_id, secuencia),
  -- neto no puede exceder el bruto físico; consistencia neto=bruto−tara la asegura el trigger.
  CONSTRAINT ck_proc_pesaje_neto_le_bruto CHECK (peso_neto IS NULL OR peso_bruto IS NULL OR peso_neto <= peso_bruto)
);
CREATE INDEX IF NOT EXISTS ix_proc_pesaje_emp   ON proc_recepcion_pesaje(empresa_id, fecha DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_pesaje_recep ON proc_recepcion_pesaje(recepcion_id) WHERE deleted_at IS NULL;
-- Folio de romana único por empresa cuando está informado (parcial: no obliga a tenerlo).
CREATE UNIQUE INDEX IF NOT EXISTS ux_proc_pesaje_folio ON proc_recepcion_pesaje(empresa_id, folio_pesaje)
  WHERE folio_pesaje IS NOT NULL AND deleted_at IS NULL;

-- ── BIN: envase físico de cosecha (1 pesada → 1..N bins). PESADA ≠ BIN. ───────
CREATE TABLE IF NOT EXISTS proc_recepcion_bin (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL,
  pesaje_id          uuid NOT NULL REFERENCES proc_recepcion_pesaje(id),  -- la pesada a la que pertenece
  recepcion_id       uuid NOT NULL REFERENCES proc_recepcion(id),         -- denormalizado (= pesaje.recepcion_id; lo asegura el trigger)
  lote_id            uuid REFERENCES proc_lote(id),                       -- NULLABLE: se asigna al destinar el bin a un lote
  codigo             text,                                                -- etiqueta / n° de bin (opcional)
  envase_codigo      text,                                                -- tipo de envase (código neutral → proc_tipo_envase, sin FK)
  envase_propiedad   text NOT NULL DEFAULT 'propio'
                     CHECK (envase_propiedad IN ('propio','terceros','cliente')),  -- totes/envases retornables
  n_envases          integer NOT NULL DEFAULT 1 CHECK (n_envases > 0),    -- envases que componen el bin (normalmente 1)
  tara_envase        numeric(14,3) CHECK (tara_envase IS NULL OR tara_envase >= 0),
  peso_bruto         numeric(14,3) CHECK (peso_bruto IS NULL OR peso_bruto >= 0),  -- bruto individual (NULL si se pesó en conjunto)
  peso_neto          numeric(14,3) CHECK (peso_neto  IS NULL OR peso_neto  >= 0),  -- neto individual (NULL si desconocido; NUNCA auto-split)
  origen_peso        text NOT NULL DEFAULT 'sin_asignar'
                     CHECK (origen_peso IN ('medido','repartido','estimado','sin_asignar')),  -- trazabilidad del kg del bin
  especie_codigo     text, variedad_codigo text,                         -- snapshot opcional (código neutral)
  condicion          text NOT NULL DEFAULT 'ok' CHECK (condicion IN ('ok','dañado')),
  estado             text NOT NULL DEFAULT 'recibido'
                     CHECK (estado IN ('recibido','asignado_lote','devuelto','anulado')),
  observaciones      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, pesaje_id, codigo),
  CONSTRAINT ck_proc_bin_neto_le_bruto CHECK (peso_neto IS NULL OR peso_bruto IS NULL OR peso_neto <= peso_bruto)
);
CREATE INDEX IF NOT EXISTS ix_proc_bin_pesaje ON proc_recepcion_bin(pesaje_id)   WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_bin_recep  ON proc_recepcion_bin(recepcion_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_bin_lote   ON proc_recepcion_bin(lote_id)     WHERE lote_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_proc_bin_emp    ON proc_recepcion_bin(empresa_id)  WHERE deleted_at IS NULL;

-- ============================================================================
-- Triggers de consistencia (NO auto-split; solo derivación segura del neto de la pesada)
-- ============================================================================

-- Pesada: si captura='bruto_tara' y hay bruto+tara pero falta neto → derivar neto=bruto−tara.
-- Es derivación del EVENTO (autoridad del neto de la pesada), NO reparto entre bins.
CREATE OR REPLACE FUNCTION proc_fn_pesaje_neto() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.captura = 'bruto_tara'
     AND NEW.peso_neto IS NULL
     AND NEW.peso_bruto IS NOT NULL AND NEW.tara IS NOT NULL THEN
    NEW.peso_neto := round(NEW.peso_bruto - NEW.tara, 3);
  END IF;
  -- Confirmar exige un neto físico > 0 (regla de negocio; en borrador puede faltar).
  IF NEW.estado = 'confirmada' AND NOT (COALESCE(NEW.peso_neto,0) > 0) THEN
    RAISE EXCEPTION 'no se puede confirmar la pesada sin peso_neto > 0';
  END IF;
  RETURN NEW;
END $$;

-- Bin: coherencia con su pesada (misma empresa + misma recepción) y con el lote (si lo tiene).
CREATE OR REPLACE FUNCTION proc_fn_bin_consistencia() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_emp uuid; v_recep uuid; v_lote_recep uuid;
BEGIN
  SELECT empresa_id, recepcion_id INTO v_emp, v_recep
    FROM proc_recepcion_pesaje WHERE id = NEW.pesaje_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pesaje % no existe', NEW.pesaje_id; END IF;
  IF NEW.empresa_id <> v_emp THEN
    RAISE EXCEPTION 'el bin y su pesada deben ser de la misma empresa (tenant)';
  END IF;
  -- recepcion_id del bin se fuerza al de la pesada (denormalización consistente).
  NEW.recepcion_id := v_recep;
  -- Si el bin está asignado a un lote, el lote debe ser de la misma recepción y empresa.
  IF NEW.lote_id IS NOT NULL THEN
    SELECT recepcion_id INTO v_lote_recep FROM proc_lote
      WHERE id = NEW.lote_id AND empresa_id = NEW.empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'lote % no existe para la empresa', NEW.lote_id; END IF;
    IF v_lote_recep <> v_recep THEN
      RAISE EXCEPTION 'el lote del bin pertenece a otra recepción (bin=% lote=%)', v_recep, v_lote_recep;
    END IF;
    IF NEW.estado = 'recibido' THEN NEW.estado := 'asignado_lote'; END IF;  -- coherencia de estado
  END IF;
  RETURN NEW;
END $$;

-- ============================================================================
-- Vistas de conciliación (DERIVACIÓN, security_invoker; el ledger sigue siendo SoT del lote)
-- ============================================================================

-- Por PESADA: neto del evento vs Σ bins medidos + conteo declarado vs real. Nunca fabrica kg.
CREATE OR REPLACE VIEW proc_v_pesaje_conciliacion AS
SELECT
  p.id                       AS pesaje_id,
  p.empresa_id,
  p.recepcion_id,
  p.estado,
  p.peso_neto                AS neto_pesada,
  COALESCE(b.bins_total, 0)  AS bins_total,
  COALESCE(b.bins_medidos, 0) AS bins_medidos,
  COALESCE(b.bins_total,0) - COALESCE(b.bins_medidos,0) AS bins_sin_peso,
  p.n_bins_declarado,
  COALESCE(b.sum_neto_bins, 0) AS sum_neto_bins,
  round(COALESCE(p.peso_neto,0) - COALESCE(b.sum_neto_bins,0), 3) AS diferencia_bins,
  -- cuadra el conteo declarado con el nº real de bins (NULL declarado = no se exige)
  (p.n_bins_declarado IS NULL OR p.n_bins_declarado = COALESCE(b.bins_total,0)) AS conteo_ok
FROM proc_recepcion_pesaje p
LEFT JOIN (
  SELECT pesaje_id,
         COUNT(*)                                            AS bins_total,
         COUNT(*) FILTER (WHERE peso_neto IS NOT NULL)       AS bins_medidos,
         SUM(COALESCE(peso_neto,0))                          AS sum_neto_bins
  FROM proc_recepcion_bin
  WHERE deleted_at IS NULL AND estado <> 'anulado'
  GROUP BY pesaje_id
) b ON b.pesaje_id = p.id
WHERE p.deleted_at IS NULL;
ALTER VIEW proc_v_pesaje_conciliacion SET (security_invoker = on);

-- Por RECEPCIÓN: Σ neto de pesadas (confirmadas + borrador) vs kg_neto de cabecera + conteo de bins.
CREATE OR REPLACE VIEW proc_v_recepcion_pesaje_balance AS
SELECT
  r.id                       AS recepcion_id,
  r.empresa_id,
  r.kg_neto                  AS kg_neto_cabecera,
  COALESCE(p.pesadas, 0)     AS pesadas,
  COALESCE(p.sum_neto_pesadas, 0) AS sum_neto_pesadas,
  COALESCE(bn.bins_total, 0) AS bins_total,
  round(COALESCE(r.kg_neto,0) - COALESCE(p.sum_neto_pesadas,0), 3) AS diferencia_neto
FROM proc_recepcion r
LEFT JOIN (
  SELECT recepcion_id, COUNT(*) AS pesadas, SUM(COALESCE(peso_neto,0)) AS sum_neto_pesadas
  FROM proc_recepcion_pesaje
  WHERE deleted_at IS NULL AND estado <> 'anulada'
  GROUP BY recepcion_id
) p ON p.recepcion_id = r.id
LEFT JOIN (
  SELECT recepcion_id, COUNT(*) AS bins_total
  FROM proc_recepcion_bin
  WHERE deleted_at IS NULL AND estado <> 'anulado'
  GROUP BY recepcion_id
) bn ON bn.recepcion_id = r.id
WHERE r.deleted_at IS NULL;
ALTER VIEW proc_v_recepcion_pesaje_balance SET (security_invoker = on);

-- ============================================================================
-- RPC transaccional: registrar una PESADA con sus 1..N BINS atómicamente.
-- CLAVE: NO reparte kilos. Cada bin recibe SOLO el peso_neto/peso_bruto provisto (puede ser
-- null). No se computa peso_neto del bin a partir del neto de la pesada. Exige >= 1 bin.
-- ============================================================================
CREATE OR REPLACE FUNCTION proc_fn_registrar_pesaje(
  p_empresa_id   uuid,
  p_recepcion_id uuid,
  p_pesaje       jsonb,          -- {secuencia?, folio_pesaje?, fecha?, balanza?, captura?, peso_documental?, peso_bruto?, tara?, peso_neto?, n_bins_declarado?, metodo_reparto?, destino_frio?, estado?, observaciones?}
  p_bins         jsonb,          -- [ {codigo?, envase_codigo?, envase_propiedad?, n_envases?, tara_envase?, peso_bruto?, peso_neto?, origen_peso?, especie_codigo?, variedad_codigo?, condicion?, lote_id?}, ... ]  (1..N)
  p_actor        uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE v_pesaje uuid; v_seq int; v_bin jsonb; v_n int := 0;
BEGIN
  IF p_bins IS NULL OR jsonb_typeof(p_bins) <> 'array' OR jsonb_array_length(p_bins) < 1 THEN
    RAISE EXCEPTION 'una pesada requiere al menos 1 bin (recibido %)', COALESCE(jsonb_array_length(p_bins),0);
  END IF;

  -- Serializar por recepción (correlativo de secuencia sin colisiones).
  PERFORM 1 FROM proc_recepcion WHERE id = p_recepcion_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'recepción % no existe para empresa %', p_recepcion_id, p_empresa_id; END IF;

  v_seq := COALESCE((p_pesaje->>'secuencia')::int,
             (SELECT COALESCE(MAX(secuencia),0)+1 FROM proc_recepcion_pesaje
               WHERE recepcion_id = p_recepcion_id AND empresa_id = p_empresa_id AND deleted_at IS NULL));

  INSERT INTO proc_recepcion_pesaje(
    empresa_id, recepcion_id, secuencia, folio_pesaje, fecha, balanza, captura,
    peso_documental, peso_bruto, tara, peso_neto, n_bins_declarado, metodo_reparto,
    destino_frio, estado, observaciones, documentos, created_by
  ) VALUES (
    p_empresa_id, p_recepcion_id, v_seq, p_pesaje->>'folio_pesaje',
    COALESCE((p_pesaje->>'fecha')::timestamptz, now()), p_pesaje->>'balanza',
    COALESCE(p_pesaje->>'captura','bruto_tara'),
    (p_pesaje->>'peso_documental')::numeric, (p_pesaje->>'peso_bruto')::numeric,
    (p_pesaje->>'tara')::numeric, (p_pesaje->>'peso_neto')::numeric,
    (p_pesaje->>'n_bins_declarado')::int, COALESCE(p_pesaje->>'metodo_reparto','sin_reparto'),
    p_pesaje->>'destino_frio', COALESCE(p_pesaje->>'estado','borrador'),
    p_pesaje->>'observaciones', COALESCE((p_pesaje->'documentos'), '[]'::jsonb), p_actor
  ) RETURNING id INTO v_pesaje;

  FOR v_bin IN SELECT * FROM jsonb_array_elements(p_bins) LOOP
    v_n := v_n + 1;
    INSERT INTO proc_recepcion_bin(
      empresa_id, pesaje_id, recepcion_id, lote_id, codigo, envase_codigo, envase_propiedad,
      n_envases, tara_envase, peso_bruto, peso_neto, origen_peso, especie_codigo, variedad_codigo,
      condicion, estado, observaciones, created_by
    ) VALUES (
      p_empresa_id, v_pesaje, p_recepcion_id,
      NULLIF(v_bin->>'lote_id','')::uuid, v_bin->>'codigo', v_bin->>'envase_codigo',
      COALESCE(v_bin->>'envase_propiedad','propio'),
      COALESCE((v_bin->>'n_envases')::int, 1), (v_bin->>'tara_envase')::numeric,
      (v_bin->>'peso_bruto')::numeric,
      (v_bin->>'peso_neto')::numeric,          -- NO auto-split: SOLO lo provisto (puede ser null)
      COALESCE(v_bin->>'origen_peso', CASE WHEN (v_bin->>'peso_neto') IS NOT NULL THEN 'medido' ELSE 'sin_asignar' END),
      v_bin->>'especie_codigo', v_bin->>'variedad_codigo',
      COALESCE(v_bin->>'condicion','ok'), COALESCE(v_bin->>'estado','recibido'),
      v_bin->>'observaciones', p_actor
    );
  END LOOP;

  RETURN v_pesaje;
END $$;

-- ============================================================================
-- Triggers: touch + auditoría + consistencia
-- ============================================================================
DROP TRIGGER IF EXISTS trg_touch_proc_recepcion_pesaje ON proc_recepcion_pesaje;
CREATE TRIGGER trg_touch_proc_recepcion_pesaje BEFORE UPDATE ON proc_recepcion_pesaje
  FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_neto_proc_recepcion_pesaje ON proc_recepcion_pesaje;
CREATE TRIGGER trg_neto_proc_recepcion_pesaje BEFORE INSERT OR UPDATE ON proc_recepcion_pesaje
  FOR EACH ROW EXECUTE FUNCTION proc_fn_pesaje_neto();
DROP TRIGGER IF EXISTS trg_audit_proc_recepcion_pesaje ON proc_recepcion_pesaje;
CREATE TRIGGER trg_audit_proc_recepcion_pesaje AFTER INSERT OR UPDATE OR DELETE ON proc_recepcion_pesaje
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

DROP TRIGGER IF EXISTS trg_touch_proc_recepcion_bin ON proc_recepcion_bin;
CREATE TRIGGER trg_touch_proc_recepcion_bin BEFORE UPDATE ON proc_recepcion_bin
  FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();
DROP TRIGGER IF EXISTS trg_consist_proc_recepcion_bin ON proc_recepcion_bin;
CREATE TRIGGER trg_consist_proc_recepcion_bin BEFORE INSERT OR UPDATE ON proc_recepcion_bin
  FOR EACH ROW EXECUTE FUNCTION proc_fn_bin_consistencia();
DROP TRIGGER IF EXISTS trg_audit_proc_recepcion_bin ON proc_recepcion_bin;
CREATE TRIGGER trg_audit_proc_recepcion_bin AFTER INSERT OR UPDATE OR DELETE ON proc_recepcion_bin
  FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();

-- ============================================================================
-- RLS — PRODUCTIVA por empresa_id (deny-by-default; FORCE; REVOKE anon)
-- La política permisiva de desarrollo va en schema_proc_v11_mg003_pesajes_DEV_ONLY_rls.sql.
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_recepcion_pesaje','proc_recepcion_bin'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$
      CREATE POLICY pol_%1$s_empresa ON %1$s
        USING (empresa_id = proc_current_empresa())
        WITH CHECK (empresa_id = proc_current_empresa());
    $f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- ============================================================================
-- ⛔ GO-LIVE BLOCKER (idéntico a F1): proc_* NO opera en producción mientras el acceso
-- dependa de anon + política permisiva. Requiere identidad autenticada por request,
-- claim empresa_id verificable, RLS efectiva y aislamiento cross-tenant probado.
-- FIN schema_proc_v11_mg003_pesajes.sql — NO ejecutado contra la DB por este proyecto.
-- ============================================================================

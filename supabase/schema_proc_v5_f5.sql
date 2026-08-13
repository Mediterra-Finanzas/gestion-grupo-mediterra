-- ============================================================================
-- schema_proc_v5_f5.sql · proc_* FASE 5 (Resultado de Proceso al cliente)
-- INCREMENTAL sobre F1-F4. Ver docs/proceso-f5-diseno.md.
--
-- El informe DERIVA de los hechos F1-F4 (SoT operacional) — NO recalcula ni edita.
-- Cadena de autoridad: F1-F4 (verdad operacional) → F5 consolidación (selección/
-- presentación) → F5 versión emitida (snapshot histórico INMUTABLE de lo informado).
--   · Fuentes explícitas por versión (proc_informe_fuente); sin duplicar órdenes.
--   · Consolidación MATEMÁTICA (Σ kg comerciales / Σ kg procesados), nunca promedio de %.
--   · Snapshot estructurado obligatorio (no solo PDF/HTML). PDF = representación, no SoT.
--   · Destinatarios desde proc_vinculo (regla Frisku != Service); snapshot de contacto.
--   · Versión emitida inmutable; corrección = nueva versión (la anterior permanece).
--   · Emisión NO exige despacho (Resultado != despacho): basta orden cerrada/conciliada.
-- ============================================================================

-- ── Cabecera lógica del informe ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_informe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  folio text NOT NULL,                       -- operacional (ej. RP-2026-000123); convención en app, no UUID visible
  temporada_codigo text, planta_id uuid REFERENCES proc_planta(id),
  destinatario_principal_vinculo_id uuid REFERENCES proc_vinculo(id),  -- relación contractual (proc_vinculo)
  estado text NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','vigente','cerrado','anulado')),
  version_actual int NOT NULL DEFAULT 0,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, updated_by uuid, deleted_at timestamptz,
  UNIQUE (empresa_id, folio)
);
CREATE INDEX IF NOT EXISTS ix_proc_inf_emp ON proc_informe(empresa_id) WHERE deleted_at IS NULL;

-- ── Versión histórica (snapshot inmutable al emitir) ─────────────────────────
CREATE TABLE IF NOT EXISTS proc_informe_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  informe_id uuid NOT NULL REFERENCES proc_informe(id),
  version int NOT NULL,
  estado text NOT NULL DEFAULT 'generada'
    CHECK (estado IN ('borrador','generada','aprobada','emitida','reemplazada','anulada')),
  -- resumen consolidado (consultable) — derivado de cantidades absolutas:
  kg_procesados numeric(14,3), kg_comerciales numeric(14,3),
  kg_descarte numeric(14,3), kg_merma numeric(14,3), packout numeric(7,4),
  snapshot jsonb NOT NULL,                    -- estructurado: identificacion/resumen/detalle/adicional
  observaciones text,                          -- observación de usuario, congelada en la versión
  pdf_path text,                               -- bucket privado (URL firmada); representación, no SoT
  motivo text, generado_por uuid, generado_at timestamptz NOT NULL DEFAULT now(),
  emitido_por uuid, emitido_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, informe_id, version)
);
CREATE INDEX IF NOT EXISTS ix_proc_infv_inf ON proc_informe_version(informe_id);

-- ── Fuentes explícitas de la versión (qué órdenes/resultados/lotes se incluyeron) ─
CREATE TABLE IF NOT EXISTS proc_informe_fuente (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES proc_informe_version(id),
  tipo_fuente text NOT NULL CHECK (tipo_fuente IN ('orden','resultado','recepcion','lote')),
  ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, tipo_fuente, ref_id)     -- no duplicar una misma fuente en la versión
);

-- ── Destinatarios de la versión (snapshot de contacto — Regla DF5-3 pto 3) ───
CREATE TABLE IF NOT EXISTS proc_informe_destinatario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES proc_informe_version(id),
  vinculo_id uuid REFERENCES proc_vinculo(id),
  rol text, nombre_snapshot text, email_snapshot text,     -- congelados al emitir
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Historial de envíos (estado real; no 'enviado' por generar PDF) ──────────
CREATE TABLE IF NOT EXISTS proc_informe_envio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), empresa_id uuid NOT NULL,
  version_id uuid NOT NULL REFERENCES proc_informe_version(id),
  destinatario_id uuid REFERENCES proc_informe_destinatario(id),
  canal text NOT NULL CHECK (canal IN ('descarga','email')),
  destino_email text,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','enviado','error','reintentado','cancelado')),
  referencia_doc text, evidencia text,
  enviado_por uuid, enviado_at timestamptz,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_proc_env_ver ON proc_informe_envio(version_id);

-- ── Inmutabilidad de versión emitida (corrección = nueva versión) ────────────
CREATE OR REPLACE FUNCTION proc_fn_version_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.estado='anulada' THEN RAISE EXCEPTION 'versión anulada: no editable'; END IF;
  IF OLD.estado='reemplazada' AND NEW.estado NOT IN ('reemplazada','anulada') THEN
    RAISE EXCEPTION 'versión reemplazada: no editable'; END IF;
  IF OLD.estado='emitida' THEN
    IF NEW.estado IN ('reemplazada','anulada') AND
       NEW.snapshot IS NOT DISTINCT FROM OLD.snapshot AND
       NEW.kg_procesados IS NOT DISTINCT FROM OLD.kg_procesados AND
       NEW.kg_comerciales IS NOT DISTINCT FROM OLD.kg_comerciales THEN
      RETURN NEW;  -- única edición permitida: transición de estado, sin tocar datos
    END IF;
    RAISE EXCEPTION 'versión emitida INMUTABLE: corrección = nueva versión';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_version_guard ON proc_informe_version;
CREATE TRIGGER trg_version_guard BEFORE UPDATE ON proc_informe_version
  FOR EACH ROW EXECUTE FUNCTION proc_fn_version_guard();

-- ── RPC ──────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION proc_fn_crear_informe(
  p_empresa_id uuid, p_folio text, p_temporada text, p_planta uuid, p_destinatario uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO proc_informe(empresa_id, folio, temporada_codigo, planta_id, destinatario_principal_vinculo_id, created_by)
  VALUES (p_empresa_id, p_folio, p_temporada, p_planta, p_destinatario, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Generar versión: valida órdenes cerradas/conciliadas, consolida (matemático),
-- congela snapshot estructurado, registra fuentes (sin duplicar). Atómico.
CREATE OR REPLACE FUNCTION proc_fn_generar_version(
  p_empresa_id uuid, p_informe_id uuid, p_orden_ids uuid[], p_observaciones text, p_motivo text, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_ver int; v_vid uuid; v_kgp numeric; v_kgc numeric; v_kgd numeric; v_kgm numeric;
  v_snapshot jsonb; oid uuid; v_estado text; v_bad int;
BEGIN
  IF p_orden_ids IS NULL OR array_length(p_orden_ids,1) IS NULL THEN RAISE EXCEPTION 'sin órdenes fuente'; END IF;
  PERFORM 1 FROM proc_informe WHERE id=p_informe_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'informe % no existe', p_informe_id; END IF;

  -- validar: cada orden existe, es de la empresa, y está conciliada/cerrada (Resultado != despacho)
  SELECT count(*) INTO v_bad FROM unnest(p_orden_ids) AS x(oid)
    WHERE NOT EXISTS (SELECT 1 FROM proc_orden_proceso o WHERE o.id=x.oid AND o.empresa_id=p_empresa_id AND o.estado IN ('conciliado','cerrado'));
  IF v_bad > 0 THEN RAISE EXCEPTION 'hay % orden(es) inexistentes o no conciliadas/cerradas', v_bad; END IF;

  -- consolidación MATEMÁTICA desde cantidades absolutas (no promedio de %)
  SELECT COALESCE(SUM(i.kg),0) INTO v_kgp FROM proc_orden_insumo i WHERE i.orden_id = ANY(p_orden_ids);
  SELECT COALESCE(SUM(r.kg),0) INTO v_kgc FROM proc_resultado r WHERE r.orden_id = ANY(p_orden_ids) AND r.deleted_at IS NULL;
  SELECT COALESCE(SUM(d.kg),0) INTO v_kgd FROM proc_resultado_descarte d WHERE d.orden_id = ANY(p_orden_ids) AND d.deleted_at IS NULL;
  SELECT COALESCE(SUM(m.kg),0) INTO v_kgm FROM proc_resultado_merma m WHERE m.orden_id = ANY(p_orden_ids) AND m.deleted_at IS NULL;

  -- snapshot estructurado (identificacion/resumen/detalle) — consultable, no solo PDF
  v_snapshot := jsonb_build_object(
    'identificacion', jsonb_build_object('informe_id',p_informe_id,'ordenes',to_jsonb(p_orden_ids)),
    'resumen', jsonb_build_object('kg_procesados',v_kgp,'kg_comerciales',v_kgc,'kg_descarte',v_kgd,'kg_merma',v_kgm,
                'packout', CASE WHEN v_kgp>0 THEN round(v_kgc/v_kgp,4) ELSE NULL END),
    'detalle', COALESCE((SELECT jsonb_agg(jsonb_build_object('categoria',categoria_id,'calibre',calibre_id,'color',color_id,'kg',kg))
                         FROM proc_resultado WHERE orden_id = ANY(p_orden_ids) AND deleted_at IS NULL),'[]'::jsonb),
    'adicional', jsonb_build_object('observaciones',p_observaciones,'generado_at', to_jsonb(now()))
  );

  v_ver := (SELECT COALESCE(version_actual,0)+1 FROM proc_informe WHERE id=p_informe_id);
  INSERT INTO proc_informe_version(empresa_id, informe_id, version, estado, kg_procesados, kg_comerciales,
    kg_descarte, kg_merma, packout, snapshot, observaciones, motivo, generado_por)
  VALUES (p_empresa_id, p_informe_id, v_ver, 'generada', v_kgp, v_kgc, v_kgd, v_kgm,
    CASE WHEN v_kgp>0 THEN round(v_kgc/v_kgp,4) ELSE NULL END, v_snapshot, p_observaciones, p_motivo, p_actor)
  RETURNING id INTO v_vid;

  -- fuentes explícitas (una por orden; UNIQUE rechaza duplicados)
  FOREACH oid IN ARRAY p_orden_ids LOOP
    INSERT INTO proc_informe_fuente(empresa_id, version_id, tipo_fuente, ref_id) VALUES (p_empresa_id, v_vid, 'orden', oid);
  END LOOP;

  UPDATE proc_informe SET version_actual=v_ver, estado='vigente', updated_by=p_actor WHERE id=p_informe_id;
  RETURN v_vid;
END $$;

-- Agregar destinatario a una versión (snapshot de contacto desde proc_vinculo)
CREATE OR REPLACE FUNCTION proc_fn_agregar_destinatario(
  p_empresa_id uuid, p_version_id uuid, p_vinculo_id uuid, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_nombre text; v_email text; v_rol text;
BEGIN
  SELECT rol_operacional,
         COALESCE(nombre_provisional, (contacto_operacional->>'nombre')),
         (contacto_operacional->>'email')
    INTO v_rol, v_nombre, v_email
    FROM proc_vinculo WHERE id=p_vinculo_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'vínculo % no existe', p_vinculo_id; END IF;
  INSERT INTO proc_informe_destinatario(empresa_id, version_id, vinculo_id, rol, nombre_snapshot, email_snapshot, created_by)
  VALUES (p_empresa_id, p_version_id, p_vinculo_id, v_rol, v_nombre, v_email, p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- Emitir versión: la marca 'emitida' (inmutable); reemplaza la emitida anterior.
CREATE OR REPLACE FUNCTION proc_fn_emitir_version(
  p_empresa_id uuid, p_version_id uuid, p_pdf_path text, p_actor uuid
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_inf uuid; v_estado text;
BEGIN
  SELECT informe_id, estado INTO v_inf, v_estado FROM proc_informe_version WHERE id=p_version_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'versión % no existe', p_version_id; END IF;
  IF v_estado NOT IN ('generada','aprobada') THEN RAISE EXCEPTION 'solo se emite una versión generada/aprobada (está %)', v_estado; END IF;
  -- reemplazar la emitida anterior del mismo informe (permanece consultable como 'reemplazada')
  UPDATE proc_informe_version SET estado='reemplazada' WHERE informe_id=v_inf AND estado='emitida' AND id<>p_version_id;
  UPDATE proc_informe_version SET estado='emitida', pdf_path=p_pdf_path, emitido_por=p_actor, emitido_at=now() WHERE id=p_version_id;
END $$;

-- Registrar envío (estado 'pendiente'; el despacho real de email es UI-side, gated)
CREATE OR REPLACE FUNCTION proc_fn_registrar_envio(
  p_empresa_id uuid, p_version_id uuid, p_destinatario_id uuid, p_canal text, p_destino_email text, p_actor uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_estado text;
BEGIN
  SELECT estado INTO v_estado FROM proc_informe_version WHERE id=p_version_id AND empresa_id=p_empresa_id;
  IF v_estado <> 'emitida' THEN RAISE EXCEPTION 'solo se envía una versión emitida (está %)', v_estado; END IF;
  INSERT INTO proc_informe_envio(empresa_id, version_id, destinatario_id, canal, destino_email, estado, referencia_doc, created_by)
  VALUES (p_empresa_id, p_version_id, p_destinatario_id, p_canal, p_destino_email, 'pendiente',
          (SELECT pdf_path FROM proc_informe_version WHERE id=p_version_id), p_actor) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── Triggers touch + auditoría ───────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_informe','proc_informe_version'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_touch();', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s FOR EACH ROW EXECUTE FUNCTION proc_fn_audit();', t);
  END LOOP;
END $$;

-- ── RLS productiva ───────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['proc_informe','proc_informe_version','proc_informe_fuente','proc_informe_destinatario','proc_informe_envio'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS pol_%1$s_empresa ON %1$s;', t);
    EXECUTE format($f$CREATE POLICY pol_%1$s_empresa ON %1$s USING (empresa_id=proc_current_empresa()) WITH CHECK (empresa_id=proc_current_empresa());$f$, t);
    EXECUTE format('REVOKE ALL ON %I FROM anon;', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO authenticated;', t);
  END LOOP;
END $$;

-- FIN schema_proc_v5_f5.sql — INCREMENTAL. Resultado de Proceso (F5). Tarifario = F6.
-- NO aplicado a producción. GO-LIVE blocker hereda de F1.

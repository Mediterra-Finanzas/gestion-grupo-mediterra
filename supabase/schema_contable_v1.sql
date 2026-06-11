-- ============================================================
-- SISTEMA CONTABLE GRUPO MEDITERRA
-- Script de creación para Supabase (PostgreSQL)
-- Generado: 2026-06-11
-- v1.1: multimoneda CLP + USD en asientos, líneas, saldos, presupuesto y activo fijo
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SECCIÓN 1: TABLAS BASE (sin dependencias)
-- ============================================================

-- 1. empresas
CREATE TABLE IF NOT EXISTS empresas (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            TEXT        NOT NULL UNIQUE,
    nombre            TEXT        NOT NULL,
    rut               TEXT,
    moneda_func       CHAR(3)     NOT NULL DEFAULT 'USD',
    method_consol     TEXT        NOT NULL CHECK (method_consol IN ('line_by_line', 'equity_method')),
    nci_pct           NUMERIC(5,4) NOT NULL DEFAULT 0.0000,
    sistema_origen    TEXT        NOT NULL CHECK (sistema_origen IN ('megasystem', 'contec', 'nuevo', 'mixto')),
    activa            BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE empresas IS 'Entidades del Grupo Mediterra consolidables o por método patrimonio';

-- 2. tipos_documento
CREATE TABLE IF NOT EXISTS tipos_documento (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo           TEXT        NOT NULL UNIQUE,
    nombre           TEXT        NOT NULL,
    descripcion      TEXT,
    aplica_auxiliar  BOOLEAN     NOT NULL DEFAULT FALSE,
    activo           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tipos_documento IS 'Catálogo de tipos de documento contable (FAC, BOL, NC, etc.)';

-- 3. auxiliares
CREATE TABLE IF NOT EXISTS auxiliares (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rut              TEXT        NOT NULL UNIQUE,
    nombre           TEXT        NOT NULL,
    tipo_persona     TEXT        NOT NULL CHECK (tipo_persona IN ('natural', 'juridica')),
    es_cliente       BOOLEAN     NOT NULL DEFAULT FALSE,
    es_proveedor     BOOLEAN     NOT NULL DEFAULT FALSE,
    es_trabajador    BOOLEAN     NOT NULL DEFAULT FALSE,
    es_extranjero    BOOLEAN     NOT NULL DEFAULT FALSE,
    pais             CHAR(2),
    moneda_habitual  CHAR(3),
    email            TEXT,
    telefono         TEXT,
    direccion        TEXT,
    giro             TEXT,
    observaciones    TEXT,
    activo           BOOLEAN     NOT NULL DEFAULT TRUE,
    deleted_at       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE auxiliares IS 'Terceros: clientes, proveedores, trabajadores. RUT como identificador único.';

-- 4. tipos_cambio
CREATE TABLE IF NOT EXISTS tipos_cambio (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha          DATE        NOT NULL,
    moneda_base    CHAR(3)     NOT NULL,
    moneda_dest    CHAR(3)     NOT NULL,
    tasa           NUMERIC(18,6) NOT NULL CHECK (tasa > 0),
    fuente         TEXT        NOT NULL CHECK (fuente IN ('bancocentral', 'frankfurter', 'sii', 'manual')),
    creado_por     UUID        REFERENCES auth.users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (fecha, moneda_base, moneda_dest, fuente)
);

COMMENT ON TABLE tipos_cambio IS 'Histórico de tipos de cambio. Múltiples fuentes por fecha/par.';

-- ============================================================
-- SECCIÓN 2: TABLAS DEPENDIENTES DE empresas
-- ============================================================

-- 5. plan_cuentas
CREATE TABLE IF NOT EXISTS plan_cuentas (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID        NOT NULL REFERENCES empresas(id),
    codigo              TEXT        NOT NULL,
    codigo_padre        TEXT,
    nombre              TEXT        NOT NULL,
    nivel               SMALLINT    NOT NULL CHECK (nivel BETWEEN 1 AND 6),
    tipo_cuenta         TEXT        NOT NULL CHECK (tipo_cuenta IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto', 'resultado')),
    naturaleza          TEXT        NOT NULL CHECK (naturaleza IN ('deudora', 'acreedora')),
    imputable           BOOLEAN     NOT NULL DEFAULT FALSE,
    requiere_auxiliar   BOOLEAN     NOT NULL DEFAULT FALSE,
    requiere_cc         BOOLEAN     NOT NULL DEFAULT FALSE,
    moneda_restringida  CHAR(3),
    activa              BOOLEAN     NOT NULL DEFAULT TRUE,
    deleted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE plan_cuentas IS 'Plan de cuentas por empresa. Jerarquía mediante codigo_padre.';

-- 6. mapeo_codigos
CREATE TABLE IF NOT EXISTS mapeo_codigos (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id      UUID        NOT NULL REFERENCES empresas(id),
    sistema_origen  TEXT        NOT NULL CHECK (sistema_origen IN ('megasystem', 'contec')),
    codigo_origen   TEXT        NOT NULL,
    codigo_nuevo    TEXT        NOT NULL,
    nombre_origen   TEXT,
    notas           TEXT,
    activo          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, sistema_origen, codigo_origen)
);

COMMENT ON TABLE mapeo_codigos IS 'Mapeo de códigos de cuenta entre sistemas legacy y el plan nuevo.';

-- 7. centros_costo
CREATE TABLE IF NOT EXISTS centros_costo (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id   UUID        NOT NULL REFERENCES empresas(id),
    codigo       TEXT        NOT NULL,
    nombre       TEXT        NOT NULL,
    descripcion  TEXT,
    activo       BOOLEAN     NOT NULL DEFAULT TRUE,
    deleted_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE centros_costo IS 'Centros de costo por empresa para análisis de gestión.';

-- 8. periodos
CREATE TABLE IF NOT EXISTS periodos (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id   UUID        NOT NULL REFERENCES empresas(id),
    anio         SMALLINT    NOT NULL,
    mes          SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
    estado       TEXT        NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'bloqueado')),
    cerrado_por  UUID        REFERENCES auth.users(id),
    cerrado_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, anio, mes)
);

COMMENT ON TABLE periodos IS 'Períodos contables por empresa. Controla apertura/cierre mensual.';

-- 9. usuarios_empresa
CREATE TABLE IF NOT EXISTS usuarios_empresa (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id   UUID        NOT NULL REFERENCES auth.users(id),
    empresa_id   UUID        NOT NULL REFERENCES empresas(id),
    rol          TEXT        NOT NULL CHECK (rol IN ('admin', 'contador', 'auditor', 'solo_lectura')),
    activo       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (usuario_id, empresa_id)
);

COMMENT ON TABLE usuarios_empresa IS 'Control de acceso por usuario y empresa con rol específico.';

-- ============================================================
-- SECCIÓN 3: TABLAS DE ASIENTOS (núcleo transaccional)
-- ============================================================

-- 10. asientos
CREATE TABLE IF NOT EXISTS asientos (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id            UUID        NOT NULL REFERENCES empresas(id),
    periodo_id            UUID        NOT NULL REFERENCES periodos(id),
    numero_asiento        TEXT        NOT NULL,
    fecha                 DATE        NOT NULL,
    glosa                 TEXT        NOT NULL,
    moneda                CHAR(3)     NOT NULL DEFAULT 'CLP',
    tipo_cambio_clp       NUMERIC(14,6) NOT NULL DEFAULT 1.0,  -- tasa moneda → CLP
    tipo_cambio_usd       NUMERIC(14,6) NOT NULL DEFAULT 1.0,  -- tasa moneda → USD (1.0 si asiento es en USD)
    total_debe            NUMERIC(18,2) NOT NULL DEFAULT 0,    -- en moneda original
    total_haber           NUMERIC(18,2) NOT NULL DEFAULT 0,    -- en moneda original
    total_debe_clp        NUMERIC(18,2) NOT NULL DEFAULT 0,    -- equivalente CLP
    total_haber_clp       NUMERIC(18,2) NOT NULL DEFAULT 0,    -- equivalente CLP
    total_debe_usd        NUMERIC(18,2) NOT NULL DEFAULT 0,    -- equivalente USD
    total_haber_usd       NUMERIC(18,2) NOT NULL DEFAULT 0,    -- equivalente USD
    tipo_doc_id           UUID        REFERENCES tipos_documento(id),
    numero_documento      TEXT,
    origen                TEXT        NOT NULL CHECK (origen IN ('manual', 'megasystem', 'contec', 'sistema')),
    estado                TEXT        NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'contabilizado', 'anulado')),
    referencia_externa    TEXT,
    anulado_por           UUID        REFERENCES auth.users(id),
    anulado_at            TIMESTAMPTZ,
    motivo_anulacion      TEXT,
    creado_por            UUID        REFERENCES auth.users(id),
    actualizado_por       UUID        REFERENCES auth.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, numero_asiento),
    CONSTRAINT chk_asiento_cuadrado CHECK (
        estado <> 'contabilizado'
        OR ABS(total_debe - total_haber) <= 0.01
    )
);

COMMENT ON TABLE asientos IS 'Cabecera de asientos contables. Cuadre debe=haber exigido al contabilizar.';

-- 11. asiento_lineas
CREATE TABLE IF NOT EXISTS asiento_lineas (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asiento_id          UUID        NOT NULL REFERENCES asientos(id) ON DELETE CASCADE,
    linea_num           SMALLINT    NOT NULL,
    cuenta_id           UUID        NOT NULL REFERENCES plan_cuentas(id),
    codigo_cuenta       TEXT        NOT NULL,
    nombre_cuenta       TEXT        NOT NULL,
    debe                NUMERIC(18,2) NOT NULL DEFAULT 0,
    haber               NUMERIC(18,2) NOT NULL DEFAULT 0,
    monto_clp           NUMERIC(18,2) NOT NULL DEFAULT 0,  -- equivalente CLP (siempre positivo)
    monto_usd           NUMERIC(18,2) NOT NULL DEFAULT 0,  -- equivalente USD (siempre positivo)
    glosa_linea         TEXT,
    auxiliar_rut        TEXT,
    auxiliar_id         UUID        REFERENCES auxiliares(id),
    auxiliar_nombre     TEXT,
    centro_costo_id     UUID        REFERENCES centros_costo(id),
    codigo_cc           TEXT,
    tipo_doc_id         UUID        REFERENCES tipos_documento(id),
    numero_documento    TEXT,
    raw_codigo_origen   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_linea_debe_xor_haber CHECK (
        (debe > 0 AND haber = 0) OR (debe = 0 AND haber > 0)
    )
);

COMMENT ON TABLE asiento_lineas IS 'Líneas de asiento. Exactamente un lado debe ser > 0.';

-- ============================================================
-- SECCIÓN 4: TABLAS ANALÍTICAS Y DE CONTROL
-- ============================================================

-- 12. saldos_cuenta
CREATE TABLE IF NOT EXISTS saldos_cuenta (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id          UUID        NOT NULL REFERENCES empresas(id),
    periodo_id          UUID        NOT NULL REFERENCES periodos(id),
    cuenta_id           UUID        NOT NULL REFERENCES plan_cuentas(id),
    codigo_cuenta       TEXT        NOT NULL,
    moneda              CHAR(3)     NOT NULL,
    saldo_ini_debe      NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_ini_haber     NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_debe            NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_haber           NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_debe      NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_haber     NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_ini_debe_clp  NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_ini_haber_clp NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_debe_clp        NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_haber_clp       NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_debe_clp  NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_haber_clp NUMERIC(18,2) NOT NULL DEFAULT 0,
    -- Equivalentes USD (para EEFF en dólares)
    saldo_ini_debe_usd  NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_ini_haber_usd NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_debe_usd        NUMERIC(18,2) NOT NULL DEFAULT 0,
    mov_haber_usd       NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_debe_usd  NUMERIC(18,2) NOT NULL DEFAULT 0,
    saldo_fin_haber_usd NUMERIC(18,2) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, periodo_id, cuenta_id, moneda)
);

COMMENT ON TABLE saldos_cuenta IS 'Saldos acumulados por cuenta, período y moneda. Se recalcula con cada asiento contabilizado.';

-- 13. presupuesto
CREATE TABLE IF NOT EXISTS presupuesto (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id   UUID        NOT NULL REFERENCES empresas(id),
    cuenta_id    UUID        NOT NULL REFERENCES plan_cuentas(id),
    anio         SMALLINT    NOT NULL,
    mes          SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
    version      TEXT        NOT NULL DEFAULT 'v1',
    monto        NUMERIC(18,2) NOT NULL DEFAULT 0,
    moneda       CHAR(3)     NOT NULL DEFAULT 'USD',
    monto_clp    NUMERIC(18,2) NOT NULL DEFAULT 0,   -- equivalente CLP
    monto_usd    NUMERIC(18,2) NOT NULL DEFAULT 0,   -- equivalente USD
    notas        TEXT,
    creado_por   UUID        REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, cuenta_id, anio, mes, version)
);

COMMENT ON TABLE presupuesto IS 'Presupuesto por cuenta, mes y versión. Permite múltiples versiones por año.';

-- ============================================================
-- SECCIÓN 5: ACTIVO FIJO
-- ============================================================

-- 14. activo_fijo
CREATE TABLE IF NOT EXISTS activo_fijo (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id                UUID        NOT NULL REFERENCES empresas(id),
    codigo                    TEXT        NOT NULL,
    descripcion               TEXT        NOT NULL,
    categoria                 TEXT,
    fecha_adquisicion         DATE        NOT NULL,
    fecha_inicio_depre        DATE,
    vida_util_meses           SMALLINT,
    valor_compra              NUMERIC(18,2) NOT NULL,
    valor_residual            NUMERIC(18,2) NOT NULL DEFAULT 0,
    moneda_compra             CHAR(3)     NOT NULL,
    tipo_cambio_compra_clp    NUMERIC(14,6),
    valor_compra_clp          NUMERIC(18,2),
    depre_acumulada           NUMERIC(18,2) NOT NULL DEFAULT 0,
    depre_acumulada_clp       NUMERIC(18,2) NOT NULL DEFAULT 0,
    depre_acumulada_usd       NUMERIC(18,2) NOT NULL DEFAULT 0,
    valor_compra_usd          NUMERIC(18,2),
    valor_libro               NUMERIC(18,2) GENERATED ALWAYS AS (valor_compra - depre_acumulada) STORED,
    asiento_compra_id         UUID        REFERENCES asientos(id),
    cuenta_activo_id          UUID        REFERENCES plan_cuentas(id),
    cuenta_depre_id           UUID        REFERENCES plan_cuentas(id),
    cuenta_depre_acum_id      UUID        REFERENCES plan_cuentas(id),
    estado                    TEXT        NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'dado_de_baja', 'vendido', 'obsoleto')),
    fecha_baja                DATE,
    motivo_baja               TEXT,
    asiento_baja_id           UUID        REFERENCES asientos(id),
    valor_baja                NUMERIC(18,2),
    centro_costo_id           UUID        REFERENCES centros_costo(id),
    notas                     TEXT,
    deleted_at                TIMESTAMPTZ,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, codigo)
);

COMMENT ON TABLE activo_fijo IS 'Registro de activos fijos con depreciación acumulada y valor libro calculado.';

-- 15. activo_fijo_depreciaciones
CREATE TABLE IF NOT EXISTS activo_fijo_depreciaciones (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    activo_id        UUID        NOT NULL REFERENCES activo_fijo(id) ON DELETE CASCADE,
    empresa_id       UUID        NOT NULL REFERENCES empresas(id),
    anio             SMALLINT    NOT NULL,
    mes              SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
    monto_depre      NUMERIC(18,2) NOT NULL,
    monto_depre_clp  NUMERIC(18,2) NOT NULL,
    estado           TEXT        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'contabilizada', 'anulada')),
    asiento_id       UUID        REFERENCES asientos(id),
    contabilizada_at TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (activo_id, anio, mes)
);

COMMENT ON TABLE activo_fijo_depreciaciones IS 'Cuotas de depreciación mensual por activo. Una fila por activo+mes.';

-- ============================================================
-- SECCIÓN 6: CONSOLIDACIÓN INTERCOMPANY
-- ============================================================

-- 16. eliminaciones_intercompany
CREATE TABLE IF NOT EXISTS eliminaciones_intercompany (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    anio             SMALLINT    NOT NULL,
    mes              SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
    descripcion      TEXT        NOT NULL,
    empresa_origen   UUID        REFERENCES empresas(id),
    empresa_destino  UUID        REFERENCES empresas(id),
    cuenta_id        UUID        NOT NULL REFERENCES plan_cuentas(id),
    monto            NUMERIC(18,2) NOT NULL,
    moneda           CHAR(3)     NOT NULL DEFAULT 'USD',
    monto_clp        NUMERIC(18,2) NOT NULL DEFAULT 0,
    creado_por       UUID        REFERENCES auth.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE eliminaciones_intercompany IS 'Ajustes de eliminación intercompany para consolidación línea a línea.';

-- ============================================================
-- SECCIÓN 7: MIGRACIÓN E IMPORTACIÓN
-- ============================================================

-- 17. migracion_importaciones
CREATE TABLE IF NOT EXISTS migracion_importaciones (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id       UUID        NOT NULL REFERENCES empresas(id),
    sistema_origen   TEXT        NOT NULL CHECK (sistema_origen IN ('megasystem', 'contec')),
    nombre_archivo   TEXT        NOT NULL,
    fecha_proceso    TIMESTAMPTZ NOT NULL DEFAULT now(),
    anio             SMALLINT    NOT NULL,
    mes_desde        SMALLINT    NOT NULL CHECK (mes_desde BETWEEN 1 AND 12),
    mes_hasta        SMALLINT    NOT NULL CHECK (mes_hasta BETWEEN 1 AND 12),
    total_filas      INT         NOT NULL DEFAULT 0,
    filas_ok         INT         NOT NULL DEFAULT 0,
    filas_error      INT         NOT NULL DEFAULT 0,
    estado           TEXT        NOT NULL CHECK (estado IN ('procesando', 'completado', 'completado_con_errores', 'fallido')),
    errores_detalle  JSONB,
    procesado_por    UUID        REFERENCES auth.users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE migracion_importaciones IS 'Registro de procesos de importación desde sistemas legacy.';

-- ============================================================
-- SECCIÓN 8: AUDITORÍA
-- ============================================================

-- 18. auditoria_log
CREATE TABLE IF NOT EXISTS auditoria_log (
    id              BIGSERIAL   PRIMARY KEY,
    tabla           TEXT        NOT NULL,
    registro_id     TEXT        NOT NULL,
    operacion       TEXT        NOT NULL,
    empresa_id      UUID        REFERENCES empresas(id),
    usuario_id      UUID        REFERENCES auth.users(id),
    usuario_email   TEXT,
    datos_antes     JSONB,
    datos_despues   JSONB,
    ip_address      INET,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE auditoria_log IS 'Log inmutable de cambios en tablas críticas. BIGSERIAL para volumen alto.';

-- ============================================================
-- SECCIÓN 9: ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_empresas_codigo          ON empresas(codigo);
CREATE INDEX IF NOT EXISTS idx_empresas_activa           ON empresas(activa);

CREATE INDEX IF NOT EXISTS idx_pc_empresa                ON plan_cuentas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pc_empresa_codigo         ON plan_cuentas(empresa_id, codigo);
CREATE INDEX IF NOT EXISTS idx_pc_codigo_padre           ON plan_cuentas(empresa_id, codigo_padre);
CREATE INDEX IF NOT EXISTS idx_pc_tipo_cuenta            ON plan_cuentas(empresa_id, tipo_cuenta);
CREATE INDEX IF NOT EXISTS idx_pc_imputable              ON plan_cuentas(empresa_id, imputable);

CREATE INDEX IF NOT EXISTS idx_mapeo_empresa             ON mapeo_codigos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mapeo_sistema_origen      ON mapeo_codigos(empresa_id, sistema_origen);
CREATE INDEX IF NOT EXISTS idx_mapeo_codigo_origen       ON mapeo_codigos(empresa_id, sistema_origen, codigo_origen);

CREATE INDEX IF NOT EXISTS idx_aux_rut                   ON auxiliares(rut);
CREATE INDEX IF NOT EXISTS idx_aux_nombre                ON auxiliares(nombre);
CREATE INDEX IF NOT EXISTS idx_aux_activo                ON auxiliares(activo);

CREATE INDEX IF NOT EXISTS idx_cc_empresa                ON centros_costo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cc_empresa_codigo         ON centros_costo(empresa_id, codigo);

CREATE INDEX IF NOT EXISTS idx_per_empresa               ON periodos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_per_empresa_anio_mes      ON periodos(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_per_estado                ON periodos(estado);

CREATE INDEX IF NOT EXISTS idx_asi_empresa               ON asientos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asi_periodo               ON asientos(periodo_id);
CREATE INDEX IF NOT EXISTS idx_asi_fecha                 ON asientos(fecha);
CREATE INDEX IF NOT EXISTS idx_asi_empresa_fecha         ON asientos(empresa_id, fecha);
CREATE INDEX IF NOT EXISTS idx_asi_estado                ON asientos(estado);
CREATE INDEX IF NOT EXISTS idx_asi_origen                ON asientos(origen);
CREATE INDEX IF NOT EXISTS idx_asi_numero                ON asientos(empresa_id, numero_asiento);
CREATE INDEX IF NOT EXISTS idx_asi_tipo_doc              ON asientos(tipo_doc_id);
CREATE INDEX IF NOT EXISTS idx_asi_ref_externa           ON asientos(referencia_externa);

CREATE INDEX IF NOT EXISTS idx_al_asiento                ON asiento_lineas(asiento_id);
CREATE INDEX IF NOT EXISTS idx_al_cuenta                 ON asiento_lineas(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_al_auxiliar_rut           ON asiento_lineas(auxiliar_rut);
CREATE INDEX IF NOT EXISTS idx_al_auxiliar_id            ON asiento_lineas(auxiliar_id);
CREATE INDEX IF NOT EXISTS idx_al_centro_costo           ON asiento_lineas(centro_costo_id);
CREATE INDEX IF NOT EXISTS idx_al_codigo_cuenta          ON asiento_lineas(codigo_cuenta);

CREATE INDEX IF NOT EXISTS idx_sc_empresa                ON saldos_cuenta(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sc_periodo                ON saldos_cuenta(periodo_id);
CREATE INDEX IF NOT EXISTS idx_sc_cuenta                 ON saldos_cuenta(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_sc_empresa_periodo        ON saldos_cuenta(empresa_id, periodo_id);
CREATE INDEX IF NOT EXISTS idx_sc_empresa_cuenta         ON saldos_cuenta(empresa_id, cuenta_id);

CREATE INDEX IF NOT EXISTS idx_ppto_empresa              ON presupuesto(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ppto_cuenta               ON presupuesto(cuenta_id);
CREATE INDEX IF NOT EXISTS idx_ppto_empresa_anio         ON presupuesto(empresa_id, anio);
CREATE INDEX IF NOT EXISTS idx_ppto_version              ON presupuesto(empresa_id, anio, version);

CREATE INDEX IF NOT EXISTS idx_af_empresa                ON activo_fijo(empresa_id);
CREATE INDEX IF NOT EXISTS idx_af_estado                 ON activo_fijo(estado);
CREATE INDEX IF NOT EXISTS idx_af_empresa_estado         ON activo_fijo(empresa_id, estado);

CREATE INDEX IF NOT EXISTS idx_afd_activo                ON activo_fijo_depreciaciones(activo_id);
CREATE INDEX IF NOT EXISTS idx_afd_empresa               ON activo_fijo_depreciaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_afd_anio_mes              ON activo_fijo_depreciaciones(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_afd_estado                ON activo_fijo_depreciaciones(estado);

CREATE INDEX IF NOT EXISTS idx_tc_fecha                  ON tipos_cambio(fecha);
CREATE INDEX IF NOT EXISTS idx_tc_par                    ON tipos_cambio(moneda_base, moneda_dest);
CREATE INDEX IF NOT EXISTS idx_tc_fecha_par              ON tipos_cambio(fecha, moneda_base, moneda_dest);

CREATE INDEX IF NOT EXISTS idx_audit_tabla               ON auditoria_log(tabla);
CREATE INDEX IF NOT EXISTS idx_audit_registro            ON auditoria_log(tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_empresa             ON auditoria_log(empresa_id);
CREATE INDEX IF NOT EXISTS idx_audit_usuario             ON auditoria_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_created             ON auditoria_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ic_anio_mes               ON eliminaciones_intercompany(anio, mes);
CREATE INDEX IF NOT EXISTS idx_ic_empresa_origen         ON eliminaciones_intercompany(empresa_origen);
CREATE INDEX IF NOT EXISTS idx_ic_empresa_destino        ON eliminaciones_intercompany(empresa_destino);

CREATE INDEX IF NOT EXISTS idx_mig_empresa               ON migracion_importaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_mig_estado                ON migracion_importaciones(estado);
CREATE INDEX IF NOT EXISTS idx_mig_sistema               ON migracion_importaciones(empresa_id, sistema_origen);

-- ============================================================
-- SECCIÓN 10: FUNCIONES Y TRIGGERS
-- ============================================================

-- Función 1: set_updated_at
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_empresas           ON empresas;
CREATE TRIGGER trg_updated_at_empresas
    BEFORE INSERT OR UPDATE ON empresas
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_plan_cuentas       ON plan_cuentas;
CREATE TRIGGER trg_updated_at_plan_cuentas
    BEFORE INSERT OR UPDATE ON plan_cuentas
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_periodos           ON periodos;
CREATE TRIGGER trg_updated_at_periodos
    BEFORE INSERT OR UPDATE ON periodos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_asientos           ON asientos;
CREATE TRIGGER trg_updated_at_asientos
    BEFORE INSERT OR UPDATE ON asientos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_activo_fijo        ON activo_fijo;
CREATE TRIGGER trg_updated_at_activo_fijo
    BEFORE INSERT OR UPDATE ON activo_fijo
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_presupuesto        ON presupuesto;
CREATE TRIGGER trg_updated_at_presupuesto
    BEFORE INSERT OR UPDATE ON presupuesto
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_auxiliares         ON auxiliares;
CREATE TRIGGER trg_updated_at_auxiliares
    BEFORE INSERT OR UPDATE ON auxiliares
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_centros_costo      ON centros_costo;
CREATE TRIGGER trg_updated_at_centros_costo
    BEFORE INSERT OR UPDATE ON centros_costo
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_usuarios_empresa   ON usuarios_empresa;
CREATE TRIGGER trg_updated_at_usuarios_empresa
    BEFORE INSERT OR UPDATE ON usuarios_empresa
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

DROP TRIGGER IF EXISTS trg_updated_at_eliminaciones_ic   ON eliminaciones_intercompany;
CREATE TRIGGER trg_updated_at_eliminaciones_ic
    BEFORE INSERT OR UPDATE ON eliminaciones_intercompany
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Función 2: validar_periodo_abierto
CREATE OR REPLACE FUNCTION fn_validar_periodo_abierto()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_estado_periodo TEXT;
BEGIN
    IF NEW.estado = 'contabilizado' THEN
        SELECT estado INTO v_estado_periodo
        FROM periodos WHERE id = NEW.periodo_id;

        IF v_estado_periodo IS NULL THEN
            RAISE EXCEPTION 'Período % no existe.', NEW.periodo_id;
        END IF;

        IF v_estado_periodo <> 'abierto' THEN
            RAISE EXCEPTION
                'No se puede contabilizar en período con estado "%". El período debe estar "abierto".',
                v_estado_periodo;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_periodo_asientos ON asientos;
CREATE TRIGGER trg_validar_periodo_asientos
    BEFORE INSERT OR UPDATE ON asientos
    FOR EACH ROW EXECUTE FUNCTION fn_validar_periodo_abierto();

-- Función 3: recalcular_totales_asiento
CREATE OR REPLACE FUNCTION fn_recalcular_totales_asiento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_asiento_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_asiento_id := OLD.asiento_id;
    ELSE
        v_asiento_id := NEW.asiento_id;
    END IF;

    UPDATE asientos
    SET
        total_debe      = COALESCE((SELECT SUM(debe)  FROM asiento_lineas WHERE asiento_id = v_asiento_id), 0),
        total_haber     = COALESCE((SELECT SUM(haber) FROM asiento_lineas WHERE asiento_id = v_asiento_id), 0),
        total_debe_clp  = COALESCE((SELECT SUM(monto_clp) FROM asiento_lineas WHERE asiento_id = v_asiento_id AND debe  > 0), 0),
        total_haber_clp = COALESCE((SELECT SUM(monto_clp) FROM asiento_lineas WHERE asiento_id = v_asiento_id AND haber > 0), 0),
        total_debe_usd  = COALESCE((SELECT SUM(monto_usd) FROM asiento_lineas WHERE asiento_id = v_asiento_id AND debe  > 0), 0),
        total_haber_usd = COALESCE((SELECT SUM(monto_usd) FROM asiento_lineas WHERE asiento_id = v_asiento_id AND haber > 0), 0),
        updated_at      = now()
    WHERE id = v_asiento_id;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalcular_totales_asiento ON asiento_lineas;
CREATE TRIGGER trg_recalcular_totales_asiento
    AFTER INSERT OR UPDATE OR DELETE ON asiento_lineas
    FOR EACH ROW EXECUTE FUNCTION fn_recalcular_totales_asiento();

-- ============================================================
-- SECCIÓN 11: VISTAS
-- ============================================================

DROP VIEW IF EXISTS v_libro_diario;
CREATE VIEW v_libro_diario AS
SELECT
    e.codigo                                            AS empresa_codigo,
    e.nombre                                            AS empresa_nombre,
    a.fecha,
    a.numero_asiento,
    tdcab.codigo                                        AS tipo_doc_codigo,
    tdcab.nombre                                        AS tipo_doc_nombre,
    COALESCE(al.numero_documento, a.numero_documento)   AS numero_documento,
    a.glosa                                             AS glosa_asiento,
    al.linea_num,
    al.codigo_cuenta,
    al.nombre_cuenta,
    al.debe,
    al.haber,
    al.monto_clp,
    al.monto_usd,
    al.glosa_linea,
    al.auxiliar_rut,
    al.auxiliar_nombre,
    al.codigo_cc,
    a.tipo_cambio_clp,
    a.tipo_cambio_usd,
    a.id                                                AS asiento_id,
    a.periodo_id,
    a.moneda,
    a.origen
FROM asientos a
JOIN empresas          e      ON e.id          = a.empresa_id
JOIN asiento_lineas    al     ON al.asiento_id  = a.id
LEFT JOIN tipos_documento tdcab ON tdcab.id    = COALESCE(al.tipo_doc_id, a.tipo_doc_id)
WHERE a.estado = 'contabilizado';

COMMENT ON VIEW v_libro_diario IS 'Libro Diario normativo. Filtrar por empresa_codigo y período. Ordenar por fecha, numero_asiento, linea_num.';

DROP VIEW IF EXISTS v_libro_mayor;
CREATE VIEW v_libro_mayor AS
SELECT
    al.cuenta_id,
    al.codigo_cuenta,
    al.nombre_cuenta,
    a.empresa_id,
    e.codigo                                            AS empresa_codigo,
    a.fecha,
    a.numero_asiento,
    tdcab.codigo                                        AS tipo_doc_codigo,
    tdcab.nombre                                        AS tipo_doc_nombre,
    COALESCE(al.numero_documento, a.numero_documento)   AS numero_documento,
    a.glosa                                             AS glosa_asiento,
    al.glosa_linea,
    al.auxiliar_rut,
    al.auxiliar_nombre,
    al.debe,
    al.haber,
    al.monto_clp,
    al.monto_usd,
    a.moneda,
    al.codigo_cc,
    a.tipo_cambio_clp,
    a.tipo_cambio_usd,
    a.id                                                AS asiento_id,
    a.periodo_id
FROM asientos a
JOIN empresas          e      ON e.id          = a.empresa_id
JOIN asiento_lineas    al     ON al.asiento_id  = a.id
LEFT JOIN tipos_documento tdcab ON tdcab.id    = COALESCE(al.tipo_doc_id, a.tipo_doc_id)
WHERE a.estado = 'contabilizado';

COMMENT ON VIEW v_libro_mayor IS 'Libro Mayor normativo. Filtrar por cuenta_id y empresa_id. Calcular saldo acumulado en app con SUM running.';

DROP VIEW IF EXISTS v_balance_8col;
CREATE VIEW v_balance_8col AS
SELECT
    e.codigo                AS empresa_codigo,
    p.anio,
    p.mes,
    pc.codigo               AS codigo_cuenta,
    pc.nombre               AS nombre_cuenta,
    pc.tipo_cuenta,
    pc.naturaleza,
    pc.nivel,
    sc.moneda,
    sc.saldo_ini_debe,
    sc.saldo_ini_haber,
    sc.mov_debe,
    sc.mov_haber,
    sc.saldo_fin_debe,
    sc.saldo_fin_haber,
    sc.saldo_fin_debe_clp,
    sc.saldo_fin_haber_clp,
    sc.saldo_fin_debe_usd,
    sc.saldo_fin_haber_usd
FROM saldos_cuenta sc
JOIN empresas       e   ON e.id   = sc.empresa_id
JOIN periodos       p   ON p.id   = sc.periodo_id
JOIN plan_cuentas   pc  ON pc.id  = sc.cuenta_id
WHERE pc.imputable = TRUE;

COMMENT ON VIEW v_balance_8col IS 'Balance 8 columnas normativo chileno. Las columnas Resultado y Balance se calculan en app según tipo_cuenta y naturaleza. Incluye equivalentes CLP y USD.';

-- ============================================================
-- SECCIÓN 12: DATOS INICIALES — tipos_documento
-- ============================================================

INSERT INTO tipos_documento (codigo, nombre, descripcion, aplica_auxiliar, activo) VALUES
    ('FAC', 'Factura',                  'Factura electrónica de venta',               TRUE,  TRUE),
    ('BOL', 'Boleta',                   'Boleta electrónica de venta',                FALSE, TRUE),
    ('NC',  'Nota de Crédito',          'Nota de crédito electrónica',                TRUE,  TRUE),
    ('ND',  'Nota de Débito',           'Nota de débito electrónica',                 TRUE,  TRUE),
    ('FC',  'Factura de Compra',        'Factura de compra (receptor emite)',         TRUE,  TRUE),
    ('LF',  'Liquidación-Factura',      'Liquidación-factura comisionista',           TRUE,  TRUE),
    ('CI',  'Comprobante Interno',      'Comprobante de uso interno',                 FALSE, TRUE),
    ('PLA', 'Planilla',                 'Planilla de sueldos u honorarios',           FALSE, TRUE),
    ('IC',  'Ingreso de Caja',          'Recibo de ingreso de caja',                  TRUE,  TRUE),
    ('EC',  'Egreso de Caja',           'Comprobante de egreso de caja',              TRUE,  TRUE),
    ('TRF', 'Transferencia',            'Transferencia bancaria',                     FALSE, TRUE),
    ('APE', 'Asiento de Apertura',      'Asiento de apertura de período',             FALSE, TRUE),
    ('CIE', 'Asiento de Cierre',        'Asiento de cierre de período',              FALSE, TRUE),
    ('DEP', 'Asiento de Depreciación',  'Depreciación mensual de activo fijo',        FALSE, TRUE),
    ('AJU', 'Asiento de Ajuste',        'Ajuste contable manual',                     FALSE, TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- SECCIÓN 13: DATOS INICIALES — empresas
-- ============================================================

INSERT INTO empresas (codigo, nombre, rut, moneda_func, method_consol, nci_pct, sistema_origen, activa) VALUES
    ('MED', 'Mediterra Holding',        NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE),
    ('ALF', 'Allegria Foods',           NULL, 'USD', 'line_by_line',  0.0000, 'contec',     TRUE),
    ('ALS', 'Allegria Service',         NULL, 'USD', 'line_by_line',  0.2000, 'contec',     TRUE),
    ('FRI', 'Frisku Foods',             NULL, 'USD', 'line_by_line',  0.1000, 'megasystem', TRUE),
    ('OSI', 'Osiris Plant Management',  NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE),
    ('INT', 'Integrity Farms',          NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE),
    ('APC', 'Allpa Farms Chile',        NULL, 'USD', 'equity_method', 0.5000, 'megasystem', TRUE),
    ('APP', 'Allpa Farms Peru',         NULL, 'USD', 'equity_method', 0.7400, 'megasystem', TRUE),
    ('MON', 'Montejato',                NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE),
    ('ARR', 'Arrayon',                  NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE),
    ('MES', 'Mesain',                   NULL, 'USD', 'line_by_line',  0.0000, 'megasystem', TRUE)
ON CONFLICT (codigo) DO NOTHING;

-- ============================================================
-- FIN DEL SCRIPT — schema_contable_v1.sql
-- ============================================================

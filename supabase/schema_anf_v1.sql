/* =================================================================
   ANÁLISIS FINANCIERO — APP MEDITERRA
   FASE 1: Creación de tablas anf_* (Análisis Financiero)
   Fecha: 2026-07-31

   NOTA DE PREFIJO: Se usa "anf_" (ANálisis Financiero) para evitar
   colisión conceptual con las tablas "af_activos" del módulo Activo Fijo.
   Ambos usan "af" por distintas razones; "anf_" es inequívoco.

   TABLAS (en orden de creación por dependencias FK):
     1. anf_filiales           — catálogo de empresas + config parser
     2. anf_informes           — encabezado informe mensual + workflow
     3. anf_saldos_esf         — saldos ESF (balance) por cuenta
     4. anf_movimientos_er     — movimientos ER (P&L) por cuenta
     5. anf_libro_mayor        — mayor analítico (drill-down opcional)
     6. anf_justificaciones    — narrativas CFO por cuenta material
     7. anf_metricas_config    — definición de KPIs por filial   ← antes de kpis_op (FK)
     8. anf_kpis_operacionales — KPIs manuales (cajas, ton, etc.)
     9. anf_kpis_derivados     — KPIs financieros auto-calculados
    10. anf_tipos_cambio       — TC histórico para conversión NIIF

   ORDEN DE EJECUCIÓN:
     1. Ejecutar este archivo completo en Supabase → SQL Editor
     2. Verificar: SELECT tablename FROM pg_tables WHERE tablename LIKE 'anf_%' ORDER BY tablename;
     3. El SEED de anf_filiales está incluido al final (8 filas)

   PRERREQUISITO: ninguno (tablas nuevas, sin dependencias de otras tablas del proyecto)
================================================================= */


/* =================================================================
   1. anf_filiales
   Catálogo de filiales. Una fila por empresa que entrega Excel de cierre.
   piso_materialidad: umbral |%var| >= N% activa semáforo naranja/rojo.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_filiales (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo            TEXT        NOT NULL UNIQUE,
  nombre            TEXT        NOT NULL,
  sistema           TEXT        NOT NULL CHECK (sistema IN ('contec', 'megasystem', 'tbd')),
  moneda            CHAR(3)     NOT NULL DEFAULT 'USD',
  piso_materialidad NUMERIC(5,2) NOT NULL DEFAULT 10.0,
  activa            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  anf_filiales                    IS 'Empresas del grupo que entregan Excel de cierre mensual. Prefijo anf_ = ANálisis Financiero.';
COMMENT ON COLUMN anf_filiales.sistema            IS 'Parser a usar: contec (Allegria Foods/Service) o megasystem (resto).';
COMMENT ON COLUMN anf_filiales.piso_materialidad  IS 'Umbral % para semáforo. |var%| >= N% → material. Default 10 (= 10%).';


/* =================================================================
   2. anf_informes
   Encabezado del informe mensual. Controla workflow de aprobación.
   Unicidad: una fila por (filial, año, mes).
   tipo_cierre / tipo_promedio: TC NIIF (NIC 21) para conversión de estados.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_informes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id       UUID        NOT NULL REFERENCES anf_filiales(id),
  anio            SMALLINT    NOT NULL,
  mes             SMALLINT    NOT NULL CHECK (mes BETWEEN 1 AND 12),
  temporada       TEXT        NOT NULL,
  estado          TEXT        NOT NULL DEFAULT 'borrador'
                              CHECK (estado IN ('borrador', 'enviado', 'aprobado', 'rechazado')),
  tipo_cierre     NUMERIC(14,4),
  tipo_promedio   NUMERIC(14,4),
  cargado_por     TEXT,
  aprobado_por    TEXT,
  aprobado_en     TIMESTAMPTZ,
  observacion     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (filial_id, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_anf_informes_filial_periodo ON anf_informes (filial_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_anf_informes_estado         ON anf_informes (estado);

COMMENT ON TABLE  anf_informes              IS 'Encabezado del informe financiero mensual por filial. Workflow borrador → enviado → aprobado/rechazado.';
COMMENT ON COLUMN anf_informes.temporada    IS 'Temporada agrícola: mes>=7 → "ANIO-(ANIO+1)"; mes<=6 → "(ANIO-1)-ANIO". Calculado en app al insertar.';
COMMENT ON COLUMN anf_informes.tipo_cierre  IS 'TC al cierre del mes. Aplica a ESF (NIC 21). Ej: USD/CLP al 30-jun-2026.';
COMMENT ON COLUMN anf_informes.tipo_promedio IS 'TC promedio del mes. Aplica a ESR (NIC 21). Ej: promedio USD/CLP jun-2026.';


/* =================================================================
   3. anf_saldos_esf
   Saldos del Estado de Situación Financiera a nivel de cuenta.
   Una fila por cuenta por informe.
   saldo_neto_t1: del sheet "BALANCE <MES_ABREV> <AÑO-1>" del Excel.
                  NULL si el sheet no está presente en el archivo.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_saldos_esf (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id          UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  codigo              TEXT        NOT NULL,
  nombre              TEXT,
  nombre_origen       TEXT,
  sistema             TEXT        NOT NULL CHECK (sistema IN ('contec', 'megasystem')),
  categoria_ifrs      TEXT,
  tipo_ifrs           TEXT        CHECK (tipo_ifrs IN ('Activo', 'Pasivo', 'Patrimonio', 'sin_clasificar')),
  orden               INTEGER     DEFAULT 999,
  inventario_activo   NUMERIC(20,2) DEFAULT 0,
  inventario_pasivo   NUMERIC(20,2) DEFAULT 0,
  saldo_neto          NUMERIC(20,2),
  saldo_neto_t1       NUMERIC(20,2),
  var_abs             NUMERIC(20,2),
  var_pct             NUMERIC(10,4),
  es_material         BOOLEAN,
  UNIQUE (informe_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_anf_saldos_esf_informe    ON anf_saldos_esf (informe_id);
CREATE INDEX IF NOT EXISTS idx_anf_saldos_esf_categoria  ON anf_saldos_esf (informe_id, categoria_ifrs);

COMMENT ON TABLE  anf_saldos_esf            IS 'Saldos ESF (balance) a nivel de cuenta por informe. Incluye comparativo año anterior.';
COMMENT ON COLUMN anf_saldos_esf.saldo_neto IS 'Saldo contable efectivo: ia - ip para Activos; ip - ia para Pasivos/Patrimonio.';
COMMENT ON COLUMN anf_saldos_esf.saldo_neto_t1 IS 'Saldo mismo mes año anterior. NULL si el sheet BALANCE AÑO-1 no existe en el Excel.';
COMMENT ON COLUMN anf_saldos_esf.var_pct    IS 'var_abs / |saldo_neto_t1| * 100. NULL si t1 = 0 o t1 = NULL.';
COMMENT ON COLUMN anf_saldos_esf.es_material IS '|var_pct| >= piso_materialidad de la filial, o bien saldo_neto_t1 = 0 y saldo_neto != 0.';


/* =================================================================
   4. anf_movimientos_er
   Movimientos del Estado de Resultados a nivel de cuenta.
   Una fila por cuenta por informe.
   desglose_cal : año calendario (de EERR MENSUAL) — meses 1-12
   desglose_temp: temporada jul-jun (de EERR TEMP) — meses 7,8,...,12,1,...,6
   Formato JSONB: {"7":{"real":1234,"ppto":1000}, "8":{...}, ...}
   real_t1_* y ppto_temporada son NULL hasta cargar históricos.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_movimientos_er (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id        UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  codigo            TEXT        NOT NULL,
  nombre            TEXT,
  nombre_origen     TEXT,
  sistema           TEXT        NOT NULL CHECK (sistema IN ('contec', 'megasystem')),
  categoria_ifrs    TEXT,
  tipo_ifrs         TEXT        CHECK (tipo_ifrs IN ('Ingreso', 'Costo', 'Gasto', 'sin_clasificar')),
  grupo_er          TEXT,
  orden             INTEGER     DEFAULT 999,
  real_mes          NUMERIC(20,2) DEFAULT 0,
  real_ytd          NUMERIC(20,2) DEFAULT 0,
  ppto_mes          NUMERIC(20,2),
  ppto_ytd          NUMERIC(20,2),
  real_t1_mes       NUMERIC(20,2),
  real_t1_ytd       NUMERIC(20,2),
  real_temporada    NUMERIC(20,2),
  ppto_temporada    NUMERIC(20,2),
  real_t1_temporada NUMERIC(20,2),
  desglose_cal      JSONB,
  desglose_temp     JSONB,
  UNIQUE (informe_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_anf_mov_er_informe    ON anf_movimientos_er (informe_id);
CREATE INDEX IF NOT EXISTS idx_anf_mov_er_categoria  ON anf_movimientos_er (informe_id, categoria_ifrs);

COMMENT ON TABLE  anf_movimientos_er              IS 'Movimientos ER (P&L) a nivel de cuenta por informe. Desglose mensual en JSONB.';
COMMENT ON COLUMN anf_movimientos_er.real_ytd     IS 'Acumulado ene→mes del año calendario (de EERR MENSUAL).';
COMMENT ON COLUMN anf_movimientos_er.ppto_mes     IS 'Presupuesto del mes, tomado de la columna Ppto del sheet EERR TEMP.';
COMMENT ON COLUMN anf_movimientos_er.real_t1_mes  IS 'Real mismo mes año anterior. NULL hasta cargar histórico.';
COMMENT ON COLUMN anf_movimientos_er.desglose_cal IS 'Año calendario: {"1":{"real":N,"ppto":N},...,"12":{...}}. Fuente: EERR MENSUAL + EERR TEMP.';
COMMENT ON COLUMN anf_movimientos_er.desglose_temp IS 'Temporada: {"7":{"real":N,"ppto":N},...,"6":{...}}. Fuente: EERR TEMP <TT-TT>.';


/* =================================================================
   5. anf_libro_mayor
   Movimientos del libro mayor (drill-down opcional).
   Cargado solo cuando el usuario activa análisis de cuenta específica.
   No bloquea las otras fases del módulo si está vacío.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_libro_mayor (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id      UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  codigo          TEXT        NOT NULL,
  nombre_cuenta   TEXT,
  fecha           DATE,
  tipo            TEXT,
  num_doc         TEXT,
  glosa           TEXT,
  debe            NUMERIC(20,2) DEFAULT 0,
  haber           NUMERIC(20,2) DEFAULT 0,
  saldo           NUMERIC(20,2),
  moneda          CHAR(3),
  tc              NUMERIC(14,4),
  rut_auxiliar    TEXT,
  nombre_auxiliar TEXT
);

CREATE INDEX IF NOT EXISTS idx_anf_mayor_informe_cuenta ON anf_libro_mayor (informe_id, codigo);
CREATE INDEX IF NOT EXISTS idx_anf_mayor_fecha          ON anf_libro_mayor (informe_id, fecha);

COMMENT ON TABLE anf_libro_mayor IS 'Mayor analítico por movimiento. Cargado opcionalmente para drill-down de cuentas materiales.';


/* =================================================================
   6. anf_justificaciones
   Narrativas del CFO por cuenta material.
   texto_original: importado automáticamente del sheet INFORME del Excel.
   texto: editado manualmente en la UI (puede diferir del original).
================================================================= */
CREATE TABLE IF NOT EXISTS anf_justificaciones (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id      UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  codigo          TEXT        NOT NULL,
  tipo_estado     TEXT        NOT NULL CHECK (tipo_estado IN ('esf', 'er')),
  texto_original  TEXT,
  texto           TEXT,
  editado_por     TEXT,
  editado_en      TIMESTAMPTZ,
  aprobado        BOOLEAN     DEFAULT false,
  UNIQUE (informe_id, codigo, tipo_estado)
);

CREATE INDEX IF NOT EXISTS idx_anf_justif_informe ON anf_justificaciones (informe_id);

COMMENT ON TABLE  anf_justificaciones                IS 'Justificaciones narrativas por cuenta material por informe.';
COMMENT ON COLUMN anf_justificaciones.texto_original IS 'Texto importado del sheet INFORME del Excel (columna VAR REAL VS PPTO). No se sobreescribe al re-subir.';
COMMENT ON COLUMN anf_justificaciones.texto          IS 'Texto final editado por el CFO. NULL hasta que el CFO edite.';


/* =================================================================
   7. anf_metricas_config
   Definición de KPIs operacionales por filial.
   Sin hardcodear en código: el CFO activa/desactiva desde UI de config.
   (Definida antes de anf_kpis_operacionales por FK)
================================================================= */
CREATE TABLE IF NOT EXISTS anf_metricas_config (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id       UUID        NOT NULL REFERENCES anf_filiales(id),
  nombre          TEXT        NOT NULL,
  unidad          TEXT,
  activa          BOOLEAN     NOT NULL DEFAULT true,
  orden           INTEGER     DEFAULT 99,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (filial_id, nombre)
);

COMMENT ON TABLE anf_metricas_config IS 'Catálogo de KPIs operacionales configurables por filial (cajas, ton, ha, jornadas, %).';


/* =================================================================
   8. anf_kpis_operacionales
   KPIs de entrada manual: cajas exportadas, ton procesadas, etc.
   metrica_id → anf_metricas_config. Flexible por filial.
================================================================= */
CREATE TABLE IF NOT EXISTS anf_kpis_operacionales (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id      UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  metrica_id      UUID        NOT NULL REFERENCES anf_metricas_config(id),
  valor_real      NUMERIC(20,4),
  valor_ppto      NUMERIC(20,4),
  valor_t1        NUMERIC(20,4),
  unidad          TEXT,
  nota            TEXT,
  ingresado_por   TEXT,
  ingresado_en    TIMESTAMPTZ,
  UNIQUE (informe_id, metrica_id)
);

CREATE INDEX IF NOT EXISTS idx_anf_kpis_op_informe ON anf_kpis_operacionales (informe_id);

COMMENT ON TABLE anf_kpis_operacionales IS 'KPIs operacionales manuales por informe. valor_t1 = mismo KPI mismo mes año anterior.';


/* =================================================================
   9 (antes 8). anf_kpis_derivados
   6 KPIs financieros calculados automáticamente al momento de
   aprobar el informe. Claves fijas (no configurables).
================================================================= */
CREATE TABLE IF NOT EXISTS anf_kpis_derivados (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id      UUID        NOT NULL REFERENCES anf_informes(id) ON DELETE CASCADE,
  clave           TEXT        NOT NULL
                              CHECK (clave IN (
                                'margen_ebitda',
                                'cumplimiento_ppto',
                                'liquidez_corriente',
                                'capital_trabajo',
                                'deuda_patrimonio',
                                'deuda_ebitda'
                              )),
  valor           NUMERIC(20,6),
  valor_t1        NUMERIC(20,6),
  unidad          TEXT,
  calculado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (informe_id, clave)
);

COMMENT ON TABLE  anf_kpis_derivados        IS 'KPIs financieros calculados al aprobar: EBITDA, liquidez, capital trabajo, cobertura de deuda.';
COMMENT ON COLUMN anf_kpis_derivados.clave  IS 'margen_ebitda | cumplimiento_ppto | liquidez_corriente | capital_trabajo | deuda_patrimonio | deuda_ebitda';
COMMENT ON COLUMN anf_kpis_derivados.valor_t1 IS 'Mismo KPI mismo mes año anterior. NULL si sin histórico.';


/* =================================================================
  10. anf_tipos_cambio
   TC histórico para conversión NIIF de los informes.
   tipo "cierre"   → aplica a ESF (saldos al cierre del mes, NIC 21)
   tipo "promedio" → aplica a ESR (flujos del período, NIC 21)
   Independiente de maestro_tc (que usa el módulo Frisku/Maestros).
================================================================= */
CREATE TABLE IF NOT EXISTS anf_tipos_cambio (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha           DATE        NOT NULL,
  moneda_base     CHAR(3)     NOT NULL,
  moneda_dest     CHAR(3)     NOT NULL,
  tasa            NUMERIC(18,6) NOT NULL CHECK (tasa > 0),
  tipo            TEXT        NOT NULL CHECK (tipo IN ('cierre', 'promedio', 'manual')),
  fuente          TEXT        NOT NULL CHECK (fuente IN ('mindicador', 'frankfurter', 'manual', 'bancocentral')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fecha, moneda_base, moneda_dest, tipo)
);

CREATE INDEX IF NOT EXISTS idx_anf_tc_par_fecha ON anf_tipos_cambio (moneda_base, moneda_dest, fecha DESC);

COMMENT ON TABLE  anf_tipos_cambio       IS 'TC histórico para conversión NIIF en informes. Separado de maestro_tc (Frisku).';
COMMENT ON COLUMN anf_tipos_cambio.tipo  IS 'cierre = para ESF (NIC 21 último día del mes); promedio = para ESR (promedio del período); manual = override CFO.';


/* =================================================================
   POLÍTICAS RLS — rol anon
   La app usa Supabase anon key (sin Supabase Auth propio).
   Fase 1: políticas permisivas. Refinar en Fase Seguridad.
================================================================= */

ALTER TABLE anf_filiales            ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_informes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_saldos_esf          ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_movimientos_er      ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_libro_mayor         ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_justificaciones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_metricas_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_kpis_operacionales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_kpis_derivados      ENABLE ROW LEVEL SECURITY;
ALTER TABLE anf_tipos_cambio        ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_anf_filiales_all"        ON anf_filiales;
DROP POLICY IF EXISTS "anon_anf_informes_all"        ON anf_informes;
DROP POLICY IF EXISTS "anon_anf_saldos_esf_all"      ON anf_saldos_esf;
DROP POLICY IF EXISTS "anon_anf_mov_er_all"          ON anf_movimientos_er;
DROP POLICY IF EXISTS "anon_anf_libro_mayor_all"     ON anf_libro_mayor;
DROP POLICY IF EXISTS "anon_anf_justif_all"          ON anf_justificaciones;
DROP POLICY IF EXISTS "anon_anf_metricas_all"        ON anf_metricas_config;
DROP POLICY IF EXISTS "anon_anf_kpis_op_all"         ON anf_kpis_operacionales;
DROP POLICY IF EXISTS "anon_anf_kpis_der_all"        ON anf_kpis_derivados;
DROP POLICY IF EXISTS "anon_anf_tc_all"              ON anf_tipos_cambio;

CREATE POLICY "anon_anf_filiales_all"        ON anf_filiales            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_informes_all"        ON anf_informes            FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_saldos_esf_all"      ON anf_saldos_esf          FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_mov_er_all"          ON anf_movimientos_er      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_libro_mayor_all"     ON anf_libro_mayor         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_justif_all"          ON anf_justificaciones     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_metricas_all"        ON anf_metricas_config     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_kpis_op_all"         ON anf_kpis_operacionales  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_kpis_der_all"        ON anf_kpis_derivados      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_anf_tc_all"              ON anf_tipos_cambio        FOR ALL TO anon USING (true) WITH CHECK (true);


/* =================================================================
   SEED — anf_filiales (8 empresas)
   ON CONFLICT DO NOTHING = idempotente, seguro re-ejecutar.
================================================================= */

INSERT INTO anf_filiales (codigo, nombre, sistema, moneda, piso_materialidad)
VALUES
  ('allegria_foods',   'Allegria Foods',    'contec',      'USD', 10.0),
  ('allegria_service', 'Allegria Service',  'contec',      'USD', 10.0),
  ('frisku',           'Frisku Foods',      'megasystem',  'USD', 10.0),
  ('osiris',           'Osiris',            'megasystem',  'USD', 10.0),
  ('integrity',        'Integrity Farms',   'megasystem',  'USD', 10.0),
  ('mediterra',        'Mediterra Holding', 'megasystem',  'USD', 10.0),
  ('allpa_chile',      'Allpa Farms Chile', 'megasystem',  'CLP', 10.0),
  ('mesain',           'Mesain',            'tbd',         'USD', 10.0)
ON CONFLICT (codigo) DO NOTHING;


/* =================================================================
   VERIFICACIÓN (copiar y pegar por separado para confirmar)

   SELECT tablename, tableowner
   FROM pg_tables
   WHERE tablename LIKE 'anf_%'
   ORDER BY tablename;

   SELECT codigo, nombre, sistema, moneda FROM anf_filiales ORDER BY codigo;

   SELECT schemaname, tablename, policyname
   FROM pg_policies
   WHERE tablename LIKE 'anf_%'
   ORDER BY tablename, policyname;
================================================================= */

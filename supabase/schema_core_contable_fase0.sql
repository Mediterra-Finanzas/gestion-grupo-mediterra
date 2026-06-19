/* =================================================================
   CORE CONTABLE — APP MEDITERRA
   FASE 0: Correcciones estructurales
   Fecha: 2026-06-19
   Prerrequisito: schema_core_contable_v1.sql + schema_core_contable_v2_patch.sql ejecutados

   ORDEN DE EJECUCIÓN:
   1. Este archivo completo (migraciones 1, 2, 4, 5, 6 — todas aditivas)
   2. Verificar que la app compila con el nuevo código de ContabilidadModule.jsx
   3. Hacer deploy de ContabilidadModule.jsx actualizado
   4. DESPUÉS del deploy: ejecutar la sección "MIGRACIÓN 3" de este mismo archivo
      (la del RENAME en contab_homologacion)

   BACKUP PREVIO: Verificar Dashboard → Project Settings → Database → Backups
================================================================= */


/* =================================================================
   MIGRACIÓN 1 — contab_empresas
   Monedas estructurales y módulos habilitados por empresa.
   La mayoría del grupo: funcional=USD, tributaria=CLP (SII Chile).
================================================================= */

ALTER TABLE contab_empresas
    ADD COLUMN IF NOT EXISTS moneda_funcional           CHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS moneda_tributaria          CHAR(3) DEFAULT 'CLP',
    ADD COLUMN IF NOT EXISTS moneda_presentacion        CHAR(3) DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS regimen_tributario         TEXT,
    ADD COLUMN IF NOT EXISTS usa_modulo_agricola        BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS usa_modulo_remuneraciones  BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS usa_activo_fijo            BOOLEAN DEFAULT false;

-- moneda_base (legacy v1) se mantiene sin tocar por compatibilidad.
-- En Fase futura: moneda_funcional reemplaza a moneda_base y se depreca.

COMMENT ON COLUMN contab_empresas.moneda_funcional IS
    'Moneda funcional IFRS (NIC 21). USD para todas las entidades del grupo excepto si se indica CLP.';
COMMENT ON COLUMN contab_empresas.moneda_tributaria IS
    'Moneda para el libro tributario SII. CLP para entidades chilenas.';
COMMENT ON COLUMN contab_empresas.moneda_presentacion IS
    'Moneda de presentación del consolidado. USD para Grupo Mediterra.';
COMMENT ON COLUMN contab_empresas.regimen_tributario IS
    'Régimen tributario SII. Ej: 14A (renta atribuida), 14D (pyme), 14-TER.';


/* =================================================================
   MIGRACIÓN 2 — contab_plan_cuentas
   Naturaleza, jerarquía FK, obligatoriedad auxiliar/CC, moneda y
   clasificaciones NIIF para EEFF.
================================================================= */

ALTER TABLE contab_plan_cuentas
    -- Naturaleza contable: D=Deudora (se debita para aumentar), H=Acreedora
    ADD COLUMN IF NOT EXISTS naturaleza           CHAR(1)
        CHECK (naturaleza IS NULL OR naturaleza IN ('D','H')),

    -- FK real al padre (además del string padre_codigo que ya existe en v1)
    ADD COLUMN IF NOT EXISTS cuenta_padre_id      UUID
        REFERENCES contab_plan_cuentas(id) ON DELETE SET NULL,

    -- exige_auxiliar / exige_centro_costo: obligatorio (distinto de usa_auxiliar/usa_ceco = permitido)
    ADD COLUMN IF NOT EXISTS exige_auxiliar       BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS exige_centro_costo   BOOLEAN DEFAULT false,

    -- Moneda fija de la cuenta; NULL = usa moneda_funcional de la empresa
    ADD COLUMN IF NOT EXISTS moneda               CHAR(3) NULL,

    -- Clasificación NIIF para construcción de EEFF
    ADD COLUMN IF NOT EXISTS clasificacion_esf    TEXT,
    ADD COLUMN IF NOT EXISTS clasificacion_eri    TEXT;

-- Índice para navegación del árbol por padre
CREATE INDEX IF NOT EXISTS idx_plan_cuenta_padre
    ON contab_plan_cuentas(cuenta_padre_id) WHERE cuenta_padre_id IS NOT NULL;

COMMENT ON COLUMN contab_plan_cuentas.naturaleza IS
    'D=Deudora (Activos, Gastos), H=Acreedora (Pasivos, Patrimonio, Ingresos). Solo en cuentas imputables.';
COMMENT ON COLUMN contab_plan_cuentas.cuenta_padre_id IS
    'FK al nodo padre en la jerarquía. Complementa padre_codigo (string legacy).';
COMMENT ON COLUMN contab_plan_cuentas.exige_auxiliar IS
    'Si true, todo asiento en esta cuenta DEBE indicar auxiliar (proveedor/cliente/empleado).';
COMMENT ON COLUMN contab_plan_cuentas.exige_centro_costo IS
    'Si true, todo asiento DEBE indicar cuartel/centro de costo.';
COMMENT ON COLUMN contab_plan_cuentas.clasificacion_esf IS
    'Clasificación ESF (Estado de Situación Financiera): Activo Corriente, Activo No Corriente, Pasivo Corriente, Pasivo No Corriente, Patrimonio.';
COMMENT ON COLUMN contab_plan_cuentas.clasificacion_eri IS
    'Clasificación ERI (Estado de Resultado Integral): Ingresos Ordinarios, Costo de Ventas, Gastos Distribución, Gastos Admin, Gastos Financieros, Otros Ingresos/Gastos.';


/* =================================================================
   MIGRACIÓN 4 — contab_asientos
   Marco T/F/A, tipo de comprobante y origen enumerado.
   Coexiste con columna 'libro' existente (tributario/ifrs/ambos).
================================================================= */

ALTER TABLE contab_asientos
    -- Marco: T=Tributario, F=Financiero/IFRS, A=Ajuste
    -- Semántica más precisa que 'libro'. libro se mantiene por compatibilidad.
    ADD COLUMN IF NOT EXISTS marco              CHAR(1)
        CHECK (marco IS NULL OR marco IN ('T','F','A')),

    -- Tipo documental del comprobante
    ADD COLUMN IF NOT EXISTS tipo_comprobante  TEXT
        CHECK (tipo_comprobante IS NULL OR tipo_comprobante IN (
            'Ingreso','Egreso','Traspaso','Apertura','Cierre','Centralizacion','Ajuste'
        )),

    -- Pipeline de origen del asiento (enumerado, para queries y reportes)
    -- Coexiste con origen_modulo (varchar libre, legacy)
    ADD COLUMN IF NOT EXISTS origen            TEXT
        CHECK (origen IS NULL OR origen IN (
            'MANUAL','CENTRALIZACION_SII','REMUNERACIONES',
            'ACTIVO_FIJO','AGRICOLA','MIGRACION'
        ));

COMMENT ON COLUMN contab_asientos.marco IS
    'T=Tributario (libro SII), F=Financiero/IFRS (NIC/NIIF), A=Ajuste (correcciones post-cierre).
     Un mismo asiento puede existir en ambos marcos si afecta los dos libros.';
COMMENT ON COLUMN contab_asientos.tipo_comprobante IS
    'Categoría documental: Ingreso, Egreso, Traspaso, Apertura (inicio ejercicio),
     Cierre (fin ejercicio), Centralizacion (desde SII/RRHH), Ajuste.';
COMMENT ON COLUMN contab_asientos.origen IS
    'Pipeline que generó el asiento. MANUAL=ingreso directo, MIGRACION=carga histórica.';


/* =================================================================
   MIGRACIÓN 5 — contab_asientos_lineas
   Montos ME separados por debe/haber, y alias tipo_cambio.
================================================================= */

ALTER TABLE contab_asientos_lineas
    -- Montos en moneda de operación (ME), separados por columna
    -- monto_me (ya existe en v1) es la suma neta; debe_mo/haber_mo son los lados
    ADD COLUMN IF NOT EXISTS debe_mo     NUMERIC(20,6),
    ADD COLUMN IF NOT EXISTS haber_mo    NUMERIC(20,6),

    -- tipo_cambio: alias semántico de tc_valor (conviven para transición)
    -- fn_calcular_revalorizacion usa tc_valor → no se renombra
    ADD COLUMN IF NOT EXISTS tipo_cambio NUMERIC(20,6);

COMMENT ON COLUMN contab_asientos_lineas.debe_mo IS
    'Débito en moneda de operación (ME). Complementa monto_me (neto). NULL si la línea es en moneda funcional.';
COMMENT ON COLUMN contab_asientos_lineas.haber_mo IS
    'Crédito en moneda de operación (ME). Complementa monto_me (neto). NULL si la línea es en moneda funcional.';
COMMENT ON COLUMN contab_asientos_lineas.tipo_cambio IS
    'Tipo de cambio aplicado a la conversión ME→moneda funcional. Alias de tc_valor para API futura.';


/* =================================================================
   MIGRACIÓN 6 — Políticas RLS para rol 'anon'
   La app usa Supabase anon key (rol=anon, sin JWT auth).
   Las políticas TO authenticated del v2 son inertes para la app actual.
   Con RLS habilitado y sin política anon, las tablas devuelven 0 filas.
   Fase 0: políticas permisivas que habilitan la operación.
   Fase Seguridad (futura): reemplazar por guardia/proxy con validación empresa_id.
================================================================= */

CREATE POLICY IF NOT EXISTS "anon_empresas_all" ON contab_empresas
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_plan_all" ON contab_plan_cuentas
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_homologacion_all" ON contab_homologacion
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_asientos_all" ON contab_asientos
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_lineas_all" ON contab_asientos_lineas
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_lotes_all" ON doc_lotes
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_campos_all" ON cc_campos
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_cuarteles_all" ON cc_cuarteles
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_af_activos_all" ON af_activos
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_presupuesto_all" ON contab_presupuesto
    FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "anon_rem_periodos_all" ON rem_periodos_contab
    FOR ALL TO anon USING (true) WITH CHECK (true);

-- audit_log: solo lectura para anon (nunca escribir directamente desde la app)
CREATE POLICY IF NOT EXISTS "anon_audit_select" ON audit_log
    FOR SELECT TO anon USING (true);


/* =================================================================
   MIGRACIÓN 3 — contab_homologacion RENAME
   *** EJECUTAR SOLO DESPUÉS DE HACER DEPLOY DE ContabilidadModule.jsx ***
   El código viejo usa codigo_origen / nombre_origen → si se ejecuta antes
   del deploy, las queries del módulo de homologación fallan.
================================================================= */

-- Descomentar y ejecutar en un segundo paso:

-- ALTER TABLE contab_homologacion RENAME COLUMN codigo_origen TO codigo_externo;
-- ALTER TABLE contab_homologacion RENAME COLUMN nombre_origen TO nombre_externo;
--
-- -- Postgres renombra automáticamente índices y constraints que referencian la columna.
-- -- Verificar con:
-- -- SELECT indexname, indexdef FROM pg_indexes WHERE tablename='contab_homologacion';
--
-- -- Renombrar constraint para claridad (opcional):
-- ALTER INDEX IF EXISTS contab_homologacion_empresa_id_sistema_origen_codigo_origen_key
--     RENAME TO contab_homologacion_uq_empresa_sistema_codigo_externo;
--
-- COMMENT ON COLUMN contab_homologacion.codigo_externo IS
--     'Código en el sistema de origen (Megasystem, CONTEC, etc.). Renombrado desde codigo_origen en Fase 0.';
-- COMMENT ON COLUMN contab_homologacion.nombre_externo IS
--     'Nombre/glosa en el sistema de origen. Renombrado desde nombre_origen en Fase 0.';


/* =================================================================
   FIN FASE 0
   Nuevas columnas:
     contab_empresas:       7 columnas
     contab_plan_cuentas:   7 columnas + 1 índice
     contab_asientos:       3 columnas
     contab_asientos_lineas: 3 columnas
   Políticas RLS anon:      12
   Rename pendiente post-deploy: contab_homologacion (2 columnas)
================================================================= */

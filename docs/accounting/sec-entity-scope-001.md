# SEC-ENTITY-SCOPE-001 — Corporate User ↔ Entity Authorization

## Estado
**OPEN** — Abierto. Blocker para onboarding de segunda empresa.

Registrado: 2026-08-20
Decisión CFO: Opción B (pilot ALF hardcode) — OA-024-09

---

## Contexto

Durante el despliegue de OA-024-09 PostingPipeline, se identificó que las políticas
RLS de `acc_source_batch` no podían restringir el acceso por entidad sin un mecanismo
de entity membership en producción.

La tabla `user_entity_access` fue diseñada en el draft del schema (004_accounting_schema_draft.sql)
pero nunca fue desplegada en las migraciones aplicadas (006–019).

**Decisión de piloto (2026-08-20):**
Las políticas INSERT y UPDATE para `authenticated` en `acc_source_batch` (020 v3)
están hardcodeadas al UUID de Allegria Foods:
`3df93d9d-cbc6-446f-b9a5-0a3840692fd8`

---

## Alcance de la deuda

Estas políticas temporales en `020_posting_write_rls.sql` deben ser reemplazadas
por un mecanismo autoritativo antes de que se onboarde una segunda entidad.

### Qué NO resuelve el hardcode ALF

- Multi-empresa: si se agrega Allegria Service u Osiris al pipeline, la policy actual
  las bloquea correctamente (buenos) pero no puede conceder acceso sin modificar el SQL.
- SoD granular: no hay restricción por rol (importer vs approver vs auditor).
- Audit de acceso: no hay historial de qué usuario accede a qué entidad.
- Least privilege: authenticated tiene acceso a todas las filas de ALF; no hay
  restricción por usuario dentro de ALF.

---

## Criterio de retiro (obligatorio)

**NO SECOND ENTITY ONBOARDING mientras este item esté OPEN.**

Antes de desplegar el posting pipeline para cualquier segunda empresa:
1. SEC-ENTITY-SCOPE-001 debe estar cerrado.
2. Las políticas de 020 deben reemplazarse por el mecanismo definitivo.
3. Tests CAT-18 (021) deben actualizarse para verificar el nuevo mecanismo.

---

## Opciones de implementación (evaluar post-piloto)

### Opción 1: JWT Claims (entity_ids en el token)
```sql
WITH CHECK (
  entity_id::text = ANY(
    string_to_array(current_setting('request.jwt.claims', true)::jsonb->>'entity_ids', ',')
  )
)
```
- Requiere: Supabase Auth hook que inyecte `entity_ids` en el JWT al login.
- Ventaja: no requiere tabla adicional, evaluación en RLS pura.
- Desventaja: cambio de membresía requiere re-login para reflejar nuevo JWT.

### Opción 2: Tabla `core_user_entity_access`
```sql
CREATE TABLE core_user_entity_access (
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id    UUID NOT NULL REFERENCES core_entities(id) ON DELETE RESTRICT,
  role         TEXT NOT NULL DEFAULT 'importer',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to   DATE,
  granted_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ck_cuea_role CHECK (role IN ('importer','approver','auditor','admin')),
  CONSTRAINT uq_cuea PRIMARY KEY (user_id, entity_id)
);
```
Policy:
```sql
WITH CHECK (
  entity_id IN (
    SELECT entity_id FROM core_user_entity_access
    WHERE user_id = auth.uid()
      AND role IN ('importer','approver','admin')
      AND effective_from <= CURRENT_DATE
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
  )
)
```
- Ventaja: granularidad de rol y fecha efectiva, SoD nativo, audit.
- Desventaja: tabla nueva, seed de usuarios requerido.

### Opción 3: Capability Service (Mediterra One)
- Servicio centralizado de autorización cuando se construya la plataforma corporativa.
- Evaluado por Oficina de Arquitectura en MDC post-piloto.
- Requiere diseño DAT-001 (Mediterra One Corporate Management Platform).

---

## Impacto en código existente (cuando se resuelva)

| Archivo | Cambio requerido |
|---|---|
| `020_posting_write_rls.sql` | Reemplazar hardcode UUID por mecanismo definitivo |
| `021_posting_pipeline_tests.sql` | Actualizar CAT-18 tests 1801-1804 para nuevo mecanismo |
| `PostingPipeline.js` | Sin cambios (entity isolation es DB-level, no JS) |
| `ContecAdapter.js` | Sin cambios |
| `fn_acc_post_batch` | Sin cambios (valida entity vía period_id) |

**Regla:** el hardcode ALF NO debe estar en JS, funciones SQL, adapters, ni
componentes compartidos. Solo en la policy temporal de producción.

---

## Archivos con hardcode temporal

```
src/accounting/migrations/020_posting_write_rls.sql — LINE 73, 83
  USING (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid)
  WITH CHECK (entity_id = '3df93d9d-cbc6-446f-b9a5-0a3840692fd8'::uuid)
```

Buscar antes de onboarding segunda empresa:
```bash
grep -r "3df93d9d-cbc6-446f-b9a5-0a3840692fd8" src/accounting/migrations/
```
Esperado post-resolución: sin ocurrencias en políticas RLS (puede seguir en seeds/profiles).

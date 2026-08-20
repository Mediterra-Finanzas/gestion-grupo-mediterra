# Period Hardening Architecture — Dynamic Period Generation

## Estado
**Draft — post-019 PRODUCTION PASS**
Decisión: **Opción B — Hardening inmediato posterior a OA-024-09**, no parte del critical path actual.

---

## Regla Arquitectónica (inmutable)

No hardcodear nunca:
- `febrero = 28` o `febrero = 29`
- cantidad fija de días por mes
- lógica manual de leap year
- calendarios específicos por año cuando puedan derivarse de PostgreSQL nativo

PostgreSQL resuelve esto correctamente con:
```sql
(make_date(year, month, 1) + interval '1 month' - interval '1 day')::date
```
Esta expresión produce automáticamente:
- 2026-02 → 2026-02-28 (no bisiesto)
- 2028-02 → 2028-02-29 (bisiesto)
- 2032-02 → 2032-02-29 (bisiesto)

La función `fn_generate_accounting_periods` debe usar esta lógica exclusivamente.

---

## Capability: fn_generate_accounting_periods

### Firma objetivo
```sql
CREATE OR REPLACE FUNCTION fn_generate_accounting_periods(
  p_entity_id    UUID,
  p_fiscal_year  INT,
  p_period_type  TEXT DEFAULT 'monthly'
)
RETURNS TABLE (
  fiscal_month   INT,
  fiscal_quarter INT,
  date_from      DATE,
  date_to        DATE,
  dias_mes       INT,
  action         TEXT   -- 'inserted' | 'skipped_existing' | 'skipped_locked'
)
LANGUAGE plpgsql
SECURITY INVOKER  -- no requiere DEFINER; solo escribe acc_period (RLS permite a authenticated)
AS $$...$$;
```

### Invariantes que debe validar (internamente, sin hardcoding)

| # | Validación | Expresión PostgreSQL |
|---|---|---|
| 1 | 12 períodos MONTHLY | `COUNT(*) = 12` filtrado por entity+year+type |
| 2 | Meses 1..12 sin huecos | `COUNT(DISTINCT fiscal_month) = 12 AND MIN = 1 AND MAX = 12` |
| 3 | Sin duplicados | garantizado por UNIQUE constraint + ON CONFLICT DO NOTHING |
| 4 | date_from = primer día | `date_from = make_date(year, month, 1)` |
| 5 | date_to = último día real | `date_to = (date_from + '1 month' - '1 day')::date` (PostgreSQL nativo) |
| 6 | Continuidad | `LAG(date_to) + 1 day = date_from` (verificar sobre ventana ordenada por fiscal_month) |
| 7 | Cobertura anual | `MIN(date_from) = make_date(year,1,1) AND MAX(date_to) = make_date(year,12,31)` |
| 8 | Año bisiesto | implícito en PostgreSQL date arithmetic — no requiere código especial |
| 9 | UNIQUE/idempotencia | ON CONFLICT (entity_id, period_type, fiscal_year, fiscal_month) DO NOTHING |
| 10 | Entity isolation | WHERE entity_id = p_entity_id en toda operación |
| 11 | No alterar closed/locked | SELECT FOR UPDATE + skip si status IN ('closed','locked') |
| 12 | No sobrescribir histórico | ON CONFLICT DO NOTHING (no UPDATE) |

### Lógica de generación (sin hardcoding)
```sql
-- Generar los 12 períodos de cualquier año, con PostgreSQL resolviendo días/bisiesto
SELECT
  m.n                                                              AS fiscal_month,
  CEIL(m.n / 3.0)::integer                                        AS fiscal_quarter,
  make_date(p_fiscal_year, m.n, 1)                               AS date_from,
  (make_date(p_fiscal_year, m.n, 1) + '1 month'::interval
   - '1 day'::interval)::date                                    AS date_to
FROM generate_series(1, 12) AS m(n)
-- generate_series en lugar de VALUES literal — más idiomático para rangos numéricos
```

### Comportamiento respecto a períodos existentes
- **open/forecast**: skip silencioso (ON CONFLICT DO NOTHING), retorna `action = 'skipped_existing'`
- **closed/locked**: skip forzado con aviso, retorna `action = 'skipped_locked'`
- **No existentes**: INSERT, retorna `action = 'inserted'`

### Validación dinámica de días (sin hardcoding)
```sql
-- Verificar que date_to es correcto sin hardcodear
SELECT
  fiscal_month,
  date_to,
  (date_to - date_from + 1) AS dias_calculados,
  -- Comparar contra lo que PostgreSQL dice que debería ser
  (make_date(p_fiscal_year, fiscal_month, 1) + '1 month' - '1 day')::date AS esperado
FROM acc_period
WHERE entity_id = p_entity_id AND fiscal_year = p_fiscal_year AND period_type = 'monthly'
-- Si dias_calculados <> (esperado - date_from + 1) → dato corrupto
```

---

## Cuándo implementar

**NO bloquea OA-024-09.** Implementar en el sprint de hardening posterior al primer batch ALF POSTED.

Trigger: cuando se necesite generar períodos para una segunda entidad (ej. Allegria Service, Frisku) o para fiscal_year 2027.

---

## Relación con 019

- 019 ya está PRODUCTION PASS. No se modifica ni re-ejecuta.
- 019 usa la misma lógica de date arithmetic que `fn_generate_accounting_periods` usará.
- La postcondición de febrero en 019 (hardcodeada a 28) es aceptable para una migración one-shot de 2026; la función futura será completamente dinámica.

---

## Nota sobre `generate_series` vs `VALUES`

Para la función genérica, `generate_series(1, 12)` es preferible a `(VALUES (1),(2),...,(12))` porque:
- Es más idiomático para rangos
- Escala naturalmente si en el futuro se generan rangos parciales (ej. meses 7..12 de un año fiscal)
- Sin diferencia de performance para 12 filas

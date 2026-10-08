# Retirar DELETE/TRUNCATE a la llave pública: propuesta trasladada

Esta propuesta ya no vive en el PR de Créditos/Nóminas. Por decisión de Angelo (2026-10-06),
retirar DELETE, TRUNCATE, REFERENCES y TRIGGER de `calendario_data` es la **fase D**, la primera del plan
de seguridad de `main`/`pins` (orden 0 → D → A → B → C). Las guardas de ambos planes quedaron
adaptadas a ese orden y probadas juntas.

- Rama: `claude/seguridad-main-pins`
- SQL: `supabase/seguridad_main_pins/faseD_quitar_delete.sql` (+ `verificacion.sql`, `reversion.sql`)
- Consultas previas de solo lectura: `supabase/seguridad_main_pins/consultas_previas.sql` (M6–M8)
- Checklist: `docs/seguridad-main-pins-checklist.md`

Estado: PROPUESTA, no aplicada. Nada de esto se ejecuta sin autorización explícita.

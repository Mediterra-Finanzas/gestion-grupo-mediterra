# Deuda técnica — Grupo Mediterra

Registro de deuda técnica conocida y diferida conscientemente. Cada ítem indica impacto, motivo de diferir, y ventana objetivo.

---

## SEG-001 — PINs en clear text en producción

- **Qué:** los PINs de usuario se guardan en texto plano en `calendario_data.main.usuarios[].pin` (y `pinsPersonalizados`) en producción (`bywovqayuzodbzwsriet`).
- **Impacto:** cualquiera con acceso a la fila `main` (anon key incluida, dado el RLS pendiente) puede leer todos los PINs.
- **Fix propuesto:** hashear los PINs con **bcrypt** (o argon2). Validación de login compara hash, no clear text. Requiere migrar PINs existentes y ajustar `handleLogin` / `getPinActivo` en `App.jsx`.
- **Por qué se difiere:** no bloquea Fase 2 de Auth dual (E1.5). El flujo `generate_link`+`verify` no depende del PIN almacenado de forma distinta a hoy; la Edge Function valida el PIN contra la misma fuente actual.
- **Ventana objetivo:** post-cutover de Osiris (**julio–agosto 2026**).
- **Relacionado:** `audit/E1.5-FASE2-DISENO-AUTH-FLOW.md` (sección 4, nota de validación cross-project del PIN).

---

## SEG-002 — RLS pendiente en producción (mediterra-calendario)

- **Qué:** la tabla `calendario_data` en producción no tiene RLS estricto; la anon key permite lectura/escritura amplia.
- **Impacto:** vulnerabilidad de seguridad ya conocida (mencionada en CLAUDE.md).
- **Por qué se difiere:** la app legacy depende de escrituras con anon key; endurecer RLS requiere un plan de migración secuencial para no romper el deploy actual.
- **Ventana objetivo:** por definir (fix secuencial).
- **Nota:** este ítem ya figuraba en CLAUDE.md (Pendientes operativos); se consolida aquí para trazabilidad.

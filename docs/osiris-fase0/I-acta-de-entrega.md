# I. Acta de Entrega — Osiris Fase 0

**Fecha:** 2026-08-12 · **Rama:** `osiris-fase0-baseline` · **Base:** `main` @ `ea89b06`

## Resumen
Fase 0 (Data Protection, Regression Baseline & Economic Engine Freeze) completada. Se construyó la red de seguridad (snapshot verificable + 32 tests que congelan el motor económico) y se documentó CURRENT vs TARGET, **sin alterar data productiva, esquema, lógica económica, UX ni auth**.

## Archivos creados
- `scripts/osiris-fase0-snapshot.mjs` — generador de snapshot/manifest read-only.
- `src/osiris/economic/fixtures.js` — fixtures deterministas (sin data real).
- `src/osiris/economic/osirisEngine.regression.test.js` — 22 tests de caracterización.
- `src/osiris/economic/osirisEngine.invariants.test.js` — 10 tests de invariantes.
- `docs/osiris-fase0/` — A, B, C, D, E, F, G, H, I + README + relationships + security + visits assessment.
- `docs/osiris-fase0/snapshots/manifest-before.json`, `manifest-after.json` (committeados).
- `docs/osiris-fase0/snapshots/osiris-snapshot-before.json`, `-after.json` (**gitignored**, local, data confidencial).

## Archivos modificados
- `src/OsirisModule.jsx` — **+13 líneas**: un bloque `export { … }` al final que expone funciones puras ya existentes para testabilidad. **Cambio NO funcional** (no altera export default, persistencia ni lógica). Reversible.
- `.gitignore` — +1 patrón para no commitear los snapshots JSON completos (confidenciales).

## Tests ejecutados
- Suite Osiris: `CI=true TZ="America/Santiago" react-scripts test` → **32/32 passed**.
- Suite completa del repo → **276/276 passed** (244 preexistentes + 32 nuevos; nada roto).
- Build de producción `CI=true react-scripts build` → **OK** (compila con el export).

## Control de integridad de datos
| Ítem | Valor |
|---|---|
| sha256 BEFORE | `2e8218b5aba12f9a56f1d4f0ca19d7abc3f3c739d1be89e3e2c8c3d086dcd4c2` |
| sha256 AFTER | `2e8218b5aba12f9a56f1d4f0ca19d7abc3f3c739d1be89e3e2c8c3d086dcd4c2` |
| Diferencias de conteo | **0** |

## Declaraciones
| Pregunta | Respuesta |
|---|---|
| ¿Data productiva modificada? | **NO** (hash idéntico BEFORE/AFTER) |
| ¿Migraciones ejecutadas? | **NO** |
| ¿Cambios de esquema? | **NO** |
| ¿Cambios visuales / UX? | **NO** |
| ¿Reglas económicas cambiadas? | **NO** (solo congeladas con tests y documentadas CURRENT vs TARGET) |
| ¿RLS/auth tocados? | **NO** (solo documentados) |
| ¿Módulo renombrado? | **NO** |
| ¿Código legacy borrado? | **NO** (inventariado, no eliminado) |
| ¿Escrituras a Supabase? | **NO** (solo un GET read-only para el snapshot) |
| ¿Deploy a Vercel? | **SÍ, no intencional** — por el incidente de concurrencia el export quedó en `main` (build-safe, no funcional). Ver abajo. |

## Commit
Los archivos de Fase 0 quedaron incorporados en el commit `dd41ff8` de `main` (ver "Incidente de concurrencia" abajo), más este commit de corrección del Acta. La rama `osiris-fase0-baseline` fue reutilizada por la sesión concurrente y **no** es un marcador limpio de Fase 0.

## Incidente de concurrencia (transparencia)
Durante esta sesión, **otra sesión trabajaba en el mismo directorio de trabajo** (Frisku BI/Programa). Esa sesión ejecutó `git add`/`commit` amplios y cambió el branch activo mientras yo tenía archivos preparados. Resultado:
- Mis archivos de Fase 0 y el bloque `export` de `OsirisModule.jsx` fueron **arrastrados al commit `dd41ff8`** ("feat(frisku): Programa — 5ª perspectiva por Semana (BLOQUE H)") en `main`, en vez de quedar aislados en `osiris-fase0-baseline` como se planeó.
- Nada se perdió: los 19 archivos están versionados y en disco, con el contenido correcto.
- **Consecuencia:** el bloque `export` (no funcional, build verificado) quedó en `main` → se desplegará a Vercel. No cambia comportamiento, UI ni lógica.
- **Causa raíz:** dos sesiones sobre un mismo working tree (hazard ya conocido: "correr una sesión a la vez"). Recomendación: no correr sesiones en paralelo sobre este repo.

## Hallazgos relevantes (congelados, no corregidos)
1. **Doble fuente de verdad 70/30**: IQ hardcodeado (`PCT_IQ=0.70`,`PCT_WHT=0.10`) vs `participacionIngresos`. (CRÍTICA)
2. **No hay devengo** en el modelo (solo facturado/pagado). (CRÍTICA)
3. **Regla de participación scopeada por especie no matchea** (compara contra `ct.especie` inexistente). (ALTA)
4. **`temporadaDeFecha` sensible a timezone** en bordes de mes. (MEDIA)
5. **Persistencia monolítica + anon key sin RLS**; punto único de falla en auto-save. (CRÍTICA estructural)

## Riesgos pendientes
Ver `G-risk-register.md` (R1–R15). Ninguno requiere corrección inmediata; se abordan en las fases correspondientes con estrategia de migración + respaldo.

## Recomendación
Ver `H-recommendation-phase1.md`. **No avanzar a Fase 1 sin aprobación de la arquitectura objetivo.**

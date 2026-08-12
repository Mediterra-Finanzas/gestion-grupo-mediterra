# J. Saneamiento Git post Fase 0 — Osiris

Ordenamiento controlado del estado Git tras el incidente de concurrencia de Fase 0. **Solo inspección + clasificación + documentación.** No se rescribió historia, no se movieron commits, no se tocó data/lógica/UI/schema.

## A. Estado inicial encontrado
- **Branch:** `main` · **HEAD:** `186310f` (al inicio del saneamiento).
- **Working tree:** limpio salvo untracked pre-existentes ajenos a Osiris (`_bak/`, `data/`, `docs/exportadora-*`, `docs/diseno-perfiles-contables.md`, `supabase/*.sql`).
- **Commits relevantes en `main`** (cronología):
  - `dd41ff8` feat(frisku): Programa BLOQUE H — **contiene la Frisku BLOQUE H (`FriskuComercialModule.jsx`) + los 19 archivos de Fase 0 Osiris arrastrados**.
  - `67e03a9`, `d6b08dc`, `35448cb` — Frisku (BLOQUE I/J).
  - `eb3ba58` osiris(fase0): corrige Acta — **solo `docs/osiris-fase0/I-acta-de-entrega.md`** (mi commit).
  - `630ff2b`, `1942959`, `186310f` — Frisku (BLOQUE I/J, fixes).

## Clasificación de archivos

### A. Fase 0 Osiris (en `dd41ff8`, salvo el Acta re-tocada en `eb3ba58`)
| Archivo | Commit |
|---|---|
| `.gitignore` (+3: ignora snapshots JSON) | dd41ff8 |
| `docs/osiris-fase0/` (00-README, A–I, relationships, security, visits, snapshots/manifest-before, manifest-after) | dd41ff8 |
| `docs/osiris-fase0/I-acta-de-entrega.md` (corrección) | eb3ba58 |
| `scripts/osiris-fase0-snapshot.mjs` | dd41ff8 |
| `src/osiris/economic/fixtures.js` | dd41ff8 |
| `src/osiris/economic/osirisEngine.regression.test.js` | dd41ff8 |
| `src/osiris/economic/osirisEngine.invariants.test.js` | dd41ff8 |
| `src/OsirisModule.jsx` (+13: bloque `export {}` no funcional) | dd41ff8 |
| `docs/osiris-fase0/J-saneamiento-git.md` (este doc) | commit de saneamiento |

### B. Frisku (NO tocar)
- `src/FriskuComercialModule.jsx` (en `dd41ff8` +60/-2 = BLOQUE H) y los commits `67e03a9`/`d6b08dc`/`35448cb`/`630ff2b`/`1942959`/`186310f` (BLOQUE I/J, fixes). Íntegros.

### C. Otros cambios no relacionados
- Untracked pre-existentes (contabilidad/exportadora/backups) — ajenos a Osiris y a Frisku; no se tocan.

## B. Qué ocurrió en Fase 0 (incidente)
Una sesión concurrente (Frisku BI/Programa) operó sobre el mismo working tree e hizo `git add`/`commit` amplios mientras yo tenía archivos preparados, incorporando mis 19 archivos de Fase 0 + el `export` de `OsirisModule.jsx` al commit `dd41ff8` (etiquetado Frisku), en `main`. Nada se perdió; la data productiva nunca se tocó.

## C. Estrategia elegida — **Escenario A (no mover commits)**
Los archivos de Fase 0 ya están **correctamente versionados en `main`, completos y trazables**. Separarlos de `dd41ff8` exigiría reescribir historia (rebase/reset/amend sobre commits publicados con 6 commits Frisku encima), lo que viola las reglas y arriesga los cambios de Frisku. Por eso: **se deja `main` como está** y se documenta la separación lógica (este doc) + un tag de referencia. Menor riesgo, cero pérdida, trazabilidad total.

## D. Cambios realizados
1. Este documento `docs/osiris-fase0/J-saneamiento-git.md` (solo documentación).
2. Un commit dedicado exclusivamente a agregar este doc.
3. Un tag anotado `osiris-fase0` en ese commit, como referencia limpia del punto de aceptación de Fase 0 (no modifica `main` ni reescribe historia).

## E. Cambios NO realizados
No se tocó: **data productiva · lógica económica · UI · schema Supabase · RLS · migraciones**. No se hizo reset/revert/rebase/cherry-pick/stash/amend/force-push/filter-branch. No se corrigieron bugs. No se revirtió el `export`. No se avanzó a Fase 1.

## Nota sobre la rama `osiris-fase0-baseline`
Esa rama local quedó **apuntando a `c25c189`** (un commit Frisku que **no** contiene archivos de Fase 0) por la reutilización durante el incidente. Es un nombre **engañoso**: no usar como referencia de Fase 0. La referencia válida es el **tag `osiris-fase0`** y este doc. Se deja la rama intacta (no se borra ni mueve, por seguridad).

## F. Validación
- Tests: **276/276** (incl. 32 Osiris) ✓ · Build producción `CI=true`: **OK** ✓ · Fase 0 files presentes ✓ · `export` presente ✓.
- Data productiva: no reconsultada en esta tarea (no era necesario); hash baseline `2e8218b5…dcd4c2` sigue siendo la referencia de igualdad BEFORE==AFTER de Fase 0.

## H. Baseline Fase 0
**Apta para continuar.** Snapshots + manifests + 32 tests + docs A–J + export, todo versionado en `main` y marcado por el tag `osiris-fase0`. No avanzar a Fase 1 sin aprobación de la arquitectura objetivo.

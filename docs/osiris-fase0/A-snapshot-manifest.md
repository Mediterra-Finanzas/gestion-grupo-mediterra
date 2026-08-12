# A. Snapshot Manifest — Osiris (Fase 0)

Snapshot de seguridad **read-only** previo a cualquier trabajo. Capa adicional (no reemplaza el backup productivo).

## Generación
```bash
node scripts/osiris-fase0-snapshot.mjs before   # antes de trabajar
node scripts/osiris-fase0-snapshot.mjs after    # al terminar
```
El script (`scripts/osiris-fase0-snapshot.mjs`) hace un único `GET` a la fila `osiris`, lee la anon key desde `src/OsirisModule.jsx` (no la re-hardcodea) y escribe:
- `docs/osiris-fase0/snapshots/osiris-snapshot-<label>.json` — **JSON completo, GITIGNORED** (data confidencial; queda en disco local para recuperación).
- `docs/osiris-fase0/snapshots/manifest-<label>.json` — **committeado** (conteos + sha256 + tamaño + commit).

El hash usa serialización **canónica** (claves ordenadas recursivamente) → reproducible e independiente del orden de claves.

## Snapshot BEFORE (capturado)
- **generatedAt:** 2026-08-12T13:08:35Z
- **supabaseUpdatedAt:** 2026-06-23T14:07:29Z (última escritura real del módulo)
- **repoCommit:** `ea89b06e82585faff0d1388ff54fe038cc09f129`
- **tamaño:** 225.807 bytes (221 KB)
- **sha256:** `2e8218b5aba12f9a56f1d4f0ca19d7abc3f3c739d1be89e3e2c8c3d086dcd4c2`

### Recuperación
El estado exacto previo a Fase 0 es recuperable desde `osiris-snapshot-before.json` (disco local). Su integridad se verifica recomputando el sha256 canónico y comparándolo con `manifest-before.json`. Ante cualquier necesidad de rollback: `POST` de ese `value` a `calendario_data` id=`osiris` (acción manual, fuera de Fase 0).

Ver conteos completos en `B-data-integrity-manifest.md`.

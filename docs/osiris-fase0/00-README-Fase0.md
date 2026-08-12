# Osiris — Fase 0: Data Protection, Regression Baseline & Economic Engine Freeze

Objetivo: **poder mejorar Osiris después sin miedo a romperlo.** Esta fase NO mejora el módulo: construye la red de seguridad (snapshot + hash + tests) y documenta CURRENT vs TARGET, sin tocar data, esquema, lógica económica, UX ni auth.

## Estado: ✅ COMPLETADA — data productiva sin cambios (BEFORE == AFTER, sha256 idéntico).

## Índice de entregables
| Doc | Contenido |
|---|---|
| [A — Snapshot Manifest](A-snapshot-manifest.md) | Snapshot read-only + hash + recuperación |
| [B — Data Integrity Manifest](B-data-integrity-manifest.md) | BEFORE vs AFTER (cero cambios) |
| [C — Economic Engine Inventory](C-economic-engine-inventory.md) | Todas las funciones económicas actuales |
| [D — Regression Test Suite](D-regression-tests.md) | 32 tests que congelan el motor |
| [E — Golden Cases](E-golden-cases.md) | 18 casos con expected verificados |
| [F — Current vs Target Matrix](F-current-vs-target-matrix.md) | Reglas objetivo (documentadas, no implementadas) |
| [G — Risk Register](G-risk-register.md) | Riesgos clasificados |
| [H — Recommendation Phase 1](H-recommendation-phase1.md) | Qué hacer primero y por qué |
| [I — Acta de Entrega](I-acta-de-entrega.md) | Cierre formal |
| [Relationships Map](relationships-map.md) | IDs y relaciones (para migración) |
| [Security Assessment](security-assessment.md) | RLS/anon key/scaffold auth |
| [Visits Module Assessment](visits-module-assessment.md) | Operación Técnica → Informes de Visitas |

## Reproducir
```bash
node scripts/osiris-fase0-snapshot.mjs before     # snapshot + manifest (read-only)
CI=true TZ="America/Santiago" npx react-scripts test --watchAll=false --testPathPattern="osiris/economic"
node scripts/osiris-fase0-snapshot.mjs after      # verificar BEFORE==AFTER
```

## Lo que Fase 0 NO hizo (por diseño)
No migró a relacional · no reemplazó el blob · no cambió lógica económica · no rediseñó UI · no renombró el módulo · no tocó RLS/auth · no integró Mediterra One · no borró código legacy. **No avanzar a Fase 1 sin aprobación de la arquitectura objetivo.**

## Rama
Todo el trabajo vive en la rama `osiris-fase0-baseline` (no en `main`), por lo que **no dispara deploy a Vercel**.

# Harness del contrato F0 — PERSIST-01..15 (VERDE)

Ejercita la capability **`src/persistencia/persistContract.js`** offline (fetch mockeado, sin
red ni app) y afirma el invariante:

> UI "guardado" = el backend confirmó la persistencia autoritativa. Ante fallo el estado queda
> dirty, el usuario se entera, nada se descarta, retry seguro, sin overwrite silencioso.

## Ejecutar

```bash
node tests/persistencia-contract/persistContract.harness.test.mjs
```

Salida esperada: **15 OK · 0 FALLA** (+ 2 extras de filas-colección). El proceso sale con código
1 solo si algo falla (apto para CI).

## Diferencia con `tests/persistencia/`

- `tests/persistencia/` porta el código **VIEJO** (`FinanzasModule.persistAll`/`dbSave`) y sale
  **rojo a propósito** (7/7) reproduciendo los bugs actuales.
- `tests/persistencia-contract/` prueba el código **NUEVO** y sale **verde** (15/15). Es el
  objetivo al que deben migrar los writers (ver `docs/persistencia-f0-contract.md`).

## Archivos

- `fakeSupabase.mjs` — PostgREST en memoria: GET / PATCH condicional (`updated_at=eq`) / POST
  upsert, con `updated_at` monótono asignado por el servidor. Modos de fallo: `network`, `401`,
  `403`, `slow`, `mismatch` (2xx sin representación válida).
- `persistContract.harness.test.mjs` — PERSIST-01..15 + 2 extras de colección (fusión por ítem
  y realtime+dirty).

## Mapa de casos

| Caso | Qué verifica |
|---|---|
| 01 | guardar manual → confirma → recarga persiste |
| 02 | autosave → recarga (instancia nueva) |
| 03 | navegar/volver → edición inmediata persiste (sin ventana ciega) |
| 04 | cerrar/reabrir |
| 05 | dos pestañas, celdas distintas → ambas sobreviven |
| 06 | dos usuarios, empresas distintas → ambas sobreviven |
| 07 | realtime entrante vs dirty local → sin clobber |
| 08 | red caída → NO guardado, dirty, aviso |
| 09 | 401/403 → NO guardado |
| 10 | save lento + 2º cambio → coalescencia sin pérdida |
| 11 | pestaña vieja no pisa dato nuevo |
| 12 | RLS: permitido persiste / denegado no reporta éxito |
| 13 | la falsa-éxito post-carga (defecto viejo) es imposible |
| 14 | 2xx sin fila/versión → NO confirmado |
| 15 | error fire-and-forget queda visible (dirty + flush) |
| EXTRA-COL / EXTRA-RT | filas-colección: fusión por ítem en save y en realtime |

Nada probado en vivo ni desplegado.
